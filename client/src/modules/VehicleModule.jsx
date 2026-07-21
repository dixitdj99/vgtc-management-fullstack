// SAP Fiori UI Transformation - Force Re-compile
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ax from '../api';
import { cleanTruckNo } from '../utils/vehicleUtils';
import { fmtRs, fmtDate } from '../utils/format';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Banknote, Bell, Briefcase, Car, Check, ChevronDown, ChevronRight, CreditCard, Edit3, FileText, Info, Phone, Plus, Search, Trash2, Truck, User, Wrench, X, Loader2, Receipt, Upload, Calendar, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import ConfirmSaveModal from '../components/ConfirmSaveModal';
import MaintenanceTracker from '../components/MaintenanceTracker';
import VehicleRegistryCard from '../components/VehicleRegistryCard';
import EmiScheduleTracker from '../components/EmiScheduleTracker';

const API = `/vehicles`;

const getEmptyForm = () => ({
    truckNo: '',
    ownerName: '',
    ownerContact: '',
    driverName: '',
    driverContact: '',
    vehicleType: 'Trailer',
    ownershipType: 'self',
    make: 'Tata',
    model: '',
    grossWeight: '',
    unladenWeight: '',
    regDate: '',
    nationalPermitDate: '',
    rcDetails: JSON.stringify({ engineNo: '', chassisNo: '', fitnessNo: '' }),
    docNumbers: JSON.stringify({ rcNo: '', insuranceNo: '', pollutionNo: '', permitNo: '', fitnessNo: '', taxNo: '' }),
    bankDetails: JSON.stringify({ name: '', bank: '', account: '', ifsc: '' }),
    gpsType: 'none',
    emiDetails: JSON.stringify({ tenure: '', startDate: '', dueDate: '', loanNo: '', pending: '', total: '', due: '', interestRate: '', bankName: '', paidEmis: [], emiDay: '', schedule: [] }),
    docs: JSON.stringify({ rc: '', pollution: '', permit: '', insurance: '', fitness: '', tax: '' }),
    fastag: '',
    targetMileage: 0
});

const parseJson = (val, fallback = {}) => {
    if (typeof val === 'object' && val !== null) return val;
    try {
        const parsed = JSON.parse(val);
        if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch { }
    return fallback || {};
};

/* ── Delete Modal (Dual Verification) ── */
function DeleteConfirm({ vehicle, onClose, onConfirm }) {
    const [step, setStep] = useState(1);
    const [confirmText, setConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);
    const truckNo = vehicle.truckNo || '';
    const isMatch = (confirmText || '').toUpperCase().replace(/\s/g, '') === (truckNo || '').toUpperCase().replace(/\s/g, '');

    const handleDelete = async () => {
        setDeleting(true);
        try { await ax.delete(`${API}/${vehicle.id}`); onConfirm(); }
        catch { alert('Delete failed'); } finally { setDeleting(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ width: '90%', maxWidth: '420px', background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.6)', padding: '28px 24px', textAlign: 'center' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <AlertTriangle size={26} color="#f43f5e" />
                </div>

                {/* Step indicator */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
                    <div style={{ width: '28px', height: '4px', borderRadius: '2px', background: '#f43f5e' }} />
                    <div style={{ width: '28px', height: '4px', borderRadius: '2px', background: step === 2 ? '#f43f5e' : 'var(--border)' }} />
                </div>

                {step === 1 ? (
                    <>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>Delete Vehicle?</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                            <strong style={{ color: 'var(--text)' }}>{truckNo}</strong> ({vehicle.ownerName || 'No Owner'})
                        </div>
                        <div style={{ fontSize: '11px', color: '#f43f5e', marginBottom: '22px', fontWeight: 600 }}>
                            ⚠️ This will permanently remove this vehicle and all its data.
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button className="btn btn-g" onClick={onClose}>Cancel</button>
                            <button className="btn btn-d" onClick={() => setStep(2)}>
                                <AlertTriangle size={13} /> Yes, I want to delete
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#f43f5e', marginBottom: '8px' }}>⚠️ Final Confirmation</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                            Type <strong style={{ color: 'var(--text)', fontFamily: 'monospace', background: 'var(--bg-input)', padding: '2px 8px', borderRadius: '4px', letterSpacing: '1px' }}>{truckNo}</strong> to confirm deletion
                        </div>
                        <input
                            className="fi"
                            type="text"
                            placeholder={`Type ${truckNo} here...`}
                            value={confirmText}
                            onChange={e => setConfirmText(e.target.value)}
                            style={{ textAlign: 'center', fontSize: '16px', fontWeight: 700, letterSpacing: '1px', marginBottom: '16px', border: isMatch ? '2px solid #f43f5e' : '1px solid var(--border)' }}
                            autoFocus
                        />
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button className="btn btn-g" onClick={onClose}>Cancel</button>
                            <button
                                className="btn btn-d"
                                onClick={handleDelete}
                                disabled={!isMatch || deleting}
                                style={{ opacity: isMatch ? 1 : 0.4, cursor: isMatch ? 'pointer' : 'not-allowed' }}
                            >
                                {deleting ? 'Deleting...' : <><Trash2 size={13} /> Permanently Delete</>}
                            </button>
                        </div>
                    </>
                )}
            </motion.div>
        </div>
    );
}

function OwnerDeleteConfirm({ owner, onClose, onConfirm }) {
    const [confirmText, setConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);
    const ownerName = owner?.name || '';
    const vehicleCount = owner?.vehicles?.length || 0;
    const isMatch = (confirmText || '').trim().toUpperCase() === ownerName.trim().toUpperCase();

    const handleDelete = async () => {
        setDeleting(true);
        try {
            for (const vehicle of owner?.vehicles || []) {
                await ax.delete(`${API}/${vehicle.id}`);
            }
            if (owner?.partyId) {
                await ax.delete(`/parties/${owner.partyId}`);
            }
            onConfirm();
        } catch (error) {
            alert(error.response?.data?.error || 'Owner delete failed');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ width: '90%', maxWidth: '460px', background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.6)', padding: '28px 24px', textAlign: 'center' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <AlertTriangle size={26} color="#f43f5e" />
                </div>

                <div style={{ fontSize: '16px', fontWeight: 800, color: '#f43f5e', marginBottom: '8px' }}>Delete Full Owner?</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    This will permanently remove <strong style={{ color: 'var(--text)' }}>{ownerName}</strong>, their Party Master record, and all linked vehicles.
                </div>
                <div style={{ fontSize: '12px', color: '#f43f5e', marginBottom: '16px', fontWeight: 700 }}>
                    {vehicleCount} vehicle{vehicleCount === 1 ? '' : 's'} will be deleted.
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Type <strong style={{ color: 'var(--text)', fontFamily: 'monospace', background: 'var(--bg-input)', padding: '2px 8px', borderRadius: '4px' }}>{ownerName}</strong> to confirm
                </div>
                <input
                    className="fi"
                    type="text"
                    placeholder={`Type ${ownerName} here...`}
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    style={{ textAlign: 'center', fontSize: '14px', fontWeight: 700, marginBottom: '16px', border: isMatch ? '2px solid #f43f5e' : '1px solid var(--border)' }}
                    autoFocus
                />
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button className="btn btn-g" onClick={onClose}>Cancel</button>
                    <button
                        className="btn btn-d"
                        onClick={handleDelete}
                        disabled={!isMatch || deleting}
                        style={{ opacity: isMatch ? 1 : 0.4, cursor: isMatch ? 'pointer' : 'not-allowed' }}
                    >
                        {deleting ? 'Deleting...' : <><Trash2 size={13} /> Delete Owner & Vehicles</>}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

/* ─── Toll Tab ────────────────────────────────────────────────────────────── */
const TH2 = { padding: '8px 10px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', background: 'var(--bg-th)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const TD2 = { padding: '8px 10px', fontSize: '12px', color: 'var(--text-sub)', verticalAlign: 'middle', borderBottom: '1px solid var(--border-row)', whiteSpace: 'nowrap' };

function TollTab({ tollRecords, tollLoading, tollFrom, setTollFrom, tollTo, setTollTo, tollForm, setTollForm, tollSaving, setTollSaving, tollImporting, setTollImporting, tollImportPreview, setTollImportPreview, tollSearch, setTollSearch, vehicleNumbers, onRefresh, truckBalanceMap }) {

    const fmtRsL = (n) => 'Rs.' + Math.round(n).toLocaleString('en-IN');
    const fmtDateL = (s) => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    // Active trucks from Balance Sheet for the selected date range
    const [activeTrucks, setActiveTrucks] = useState(new Set()); // trucks that have vouchers in range
    const [rangeLoading, setRangeLoading] = useState(false);

    // When date range is applied, fetch vouchers to determine active trucks
    const loadActiveTrucksForRange = async (from, to) => {
        if (!from || !to) { setActiveTrucks(new Set()); return; }
        setRangeLoading(true);
        try {
            const res = await ax.get('/vouchers');
            const vouchers = res.data || [];
            const trucks = new Set(
                vouchers
                    .filter(v => v.date >= from && v.date <= to)
                    .map(v => (v.truckNo || '').toUpperCase().replace(/\s/g, ''))
                    .filter(Boolean)
            );
            setActiveTrucks(trucks);
            console.log(`[Toll] Active trucks in ${from}→${to}: ${[...trucks].join(', ')}`);
        } catch { setActiveTrucks(new Set()); }
        finally { setRangeLoading(false); }
    };

    // Filter displayed records
    const filtered = useMemo(() => {
        const q = tollSearch.toLowerCase();
        return tollRecords.filter(r =>
            !q || (r.truckNo || '').toLowerCase().includes(q) || (r.route || '').toLowerCase().includes(q) || (r.remark || '').toLowerCase().includes(q)
        );
    }, [tollRecords, tollSearch]);

    // Per-truck toll summary
    const truckSummary = useMemo(() => {
        const map = {};
        filtered.forEach(r => {
            const t = r.truckNo || 'Unknown';
            if (!map[t]) map[t] = { truckNo: t, totalToll: 0, count: 0 };
            map[t].totalToll += parseFloat(r.amount) || 0;
            map[t].count++;
        });
        return Object.values(map).sort((a, b) => b.totalToll - a.totalToll);
    }, [filtered]);

    const totalToll = filtered.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

    // Parse DD/MM/YYYY or DD/MM/YYYY HH:MM:SS → YYYY-MM-DD
    const parseIndianDate = (raw) => {
        if (!raw) return '';
        const s = String(raw).trim();
        // DD/MM/YYYY HH:MM:SS  or  DD/MM/YYYY
        const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
        if (m) {
            const [, dd, mm, yy] = m;
            const yyyy = yy.length === 2 ? '20' + yy : yy;
            return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
        }
        const d = new Date(s);
        if (!isNaN(d)) return d.toISOString().slice(0, 10);
        return s.slice(0, 10);
    };

    // Excel import handler — supports NETC/FASTag (Kotak) format + generic formats
    const handleExcelImport = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setTollImporting(true);
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const wb = XLSX.read(ev.target.result, { type: 'binary', cellDates: false });
                const ws = wb.Sheets[wb.SheetNames[0]];

                // Use raw rows (header: false) to find where Transaction Details actually start
                const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

                // ── Detect NETC/FASTag format ───────────────────────────────
                // Look for the "Transaction Details" header row or a row with "VRN" column
                let txnHeaderIdx = -1;
                for (let i = 0; i < allRows.length; i++) {
                    const row = allRows[i].map(c => String(c).trim().toLowerCase());
                    if (row.includes('vrn') || (row.includes('debit amt') && row.includes('transaction date'))) {
                        txnHeaderIdx = i;
                        break;
                    }
                }

                let parsed = [];

                if (txnHeaderIdx >= 0) {
                    // ── NETC/FASTag (Kotak) format ──────────────────────────
                    const headers = allRows[txnHeaderIdx].map(c => String(c).trim());
                    const col = (name) => headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));

                    const iVRN        = col('VRN');
                    const iTxnDate    = col('Transaction Date');
                    const iDebitAmt   = col('Debit Amt');
                    const iDesc       = col('Transaction Description');
                    const iTxnType    = col('Type of Transaction');

                    for (let i = txnHeaderIdx + 1; i < allRows.length; i++) {
                        const row = allRows[i];
                        if (!row || row.every(c => !c)) continue; // skip empty rows

                        const txnType = String(row[iTxnType] || '').trim();
                        if (txnType && txnType.toLowerCase() !== 'toll txn') continue; // only toll transactions

                        const truck  = String(row[iVRN] || '').trim().replace(/\s/g, '').toUpperCase();
                        const date   = parseIndianDate(String(row[iTxnDate] || ''));
                        const amount = parseFloat(String(row[iDebitAmt] || '0').replace(/[^0-9.]/g, '')) || 0;

                        // Extract plaza name from "Plaza Name: Kitlana" → "Kitlana"
                        const desc   = String(row[iDesc] || '');
                        const route  = desc.replace(/^plaza\s*name\s*:\s*/i, '').trim() || desc;

                        if (!truck || amount <= 0) continue;
                        parsed.push({ truckNo: truck, date, amount, route, remark: 'FASTag' });
                    }
                } else {
                    // ── Generic format fallback ─────────────────────────────
                    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                    rows.forEach(row => {
                        const k = Object.keys(row);
                        const find = (...names) => { for (const n of names) { const m = k.find(c => c.toLowerCase().replace(/[\s_-]/g,'').includes(n.toLowerCase().replace(/[\s_-]/g,''))); if (m) return String(row[m] ?? '').trim(); } return ''; };
                        const truck  = find('truck','vrn','vehicle','truckno','vehicleno','regno').replace(/\s/g,'').toUpperCase();
                        const date   = parseIndianDate(find('transactiondate','date','txndate'));
                        const amount = parseFloat(find('debitamt','amount','toll','debit','fee','charge').replace(/[^0-9.]/g,'')) || 0;
                        const route  = find('description','plaza','route','location').replace(/^plaza\s*name\s*:\s*/i,'').trim();
                        const remark = find('remark','note','narration','type') || '';
                        if (!truck || amount <= 0) return;
                        parsed.push({ truckNo: truck, date, amount, route, remark });
                    });
                }

                if (parsed.length === 0) {
                    alert('No toll transactions found in the file.\nMake sure it has "VRN", "Transaction Date", and "Debit Amt" columns (NETC/FASTag format).');
                    return;
                }

                // Filter by date range and active trucks from Balance Sheet
                let filtered = parsed;
                let skippedDate = 0, skippedTruck = 0;

                if (tollFrom && tollTo) {
                    const before = filtered.length;
                    filtered = filtered.filter(r => r.date >= tollFrom && r.date <= tollTo);
                    skippedDate = before - filtered.length;
                }

                if (activeTrucks.size > 0) {
                    const before = filtered.length;
                    filtered = filtered.filter(r => activeTrucks.has(r.truckNo));
                    skippedTruck = before - filtered.length;
                }

                if (filtered.length === 0) {
                    alert(`No matching records after filtering:\n- Skipped ${skippedDate} records outside date range (${tollFrom} → ${tollTo})\n- Skipped ${skippedTruck} records for trucks not in Balance Sheet\n\nCheck the date range and make sure the trucks have vouchers in that period.`);
                    return;
                }

                setTollImportPreview({ rows: filtered, fileName: file.name, totalInFile: parsed.length, skippedDate, skippedTruck });
            } catch (err) { alert('Failed to parse Excel: ' + err.message); }
            finally { setTollImporting(false); }
        };
        reader.readAsBinaryString(file);
        e.target.value = '';
    };

    const handleImportConfirm = async () => {
        if (!tollImportPreview?.rows?.length) return;
        setTollImporting(true);
        try {
            await ax.post('/tolls/bulk', tollImportPreview.rows);
            setTollImportPreview(null);
            onRefresh();
        } catch (err) { alert('Import failed: ' + (err.response?.data?.error || err.message)); }
        finally { setTollImporting(false); }
    };

    const handleManualSave = async (e) => {
        e.preventDefault();
        if (!tollForm.truckNo || !tollForm.amount || parseFloat(tollForm.amount) <= 0) {
            alert('Truck No and Amount are required');
            return;
        }
        setTollSaving(true);
        try {
            await ax.post('/tolls', tollForm);
            setTollForm({ truckNo: '', date: new Date().toISOString().slice(0, 10), amount: '', route: '', remark: '' });
            onRefresh();
        } catch (err) { alert('Save failed'); }
        finally { setTollSaving(false); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this toll record?')) return;
        try { await ax.delete('/tolls/' + id); onRefresh(); }
        catch { alert('Delete failed'); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Header + date filter */}
            <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}><Receipt size={17} color="#f59e0b" /> Toll Records</h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Upload Excel or add manually. Filter by date range.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div className="field" style={{ margin: 0 }}>
                            <label style={{ fontSize: '10px', fontWeight: 700 }}>From</label>
                            <input className="fi" type="date" value={tollFrom} onChange={e => setTollFrom(e.target.value)} style={{ height: '32px' }} />
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                            <label style={{ fontSize: '10px', fontWeight: 700 }}>To</label>
                            <input className="fi" type="date" value={tollTo} onChange={e => setTollTo(e.target.value)} style={{ height: '32px' }} />
                        </div>
                        <button className="btn btn-p btn-sm" disabled={!tollFrom || !tollTo || rangeLoading}
                            onClick={() => { onRefresh(tollFrom, tollTo); loadActiveTrucksForRange(tollFrom, tollTo); }}>
                            {rangeLoading ? <Loader2 size={12} className="spin" /> : <><Calendar size={13} /> Apply</>}
                        </button>
                        <button className="btn btn-g btn-sm" onClick={() => { setTollFrom(''); setTollTo(''); setActiveTrucks(new Set()); onRefresh('', ''); }}>Clear</button>
                    </div>
                </div>
            </div>

            {/* Active trucks status */}
            {tollFrom && tollTo && activeTrucks.size > 0 && (
                <div style={{ padding: '10px 16px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '10px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <Check size={15} color="#10b981" style={{ marginTop: '1px', flexShrink: 0 }} />
                    <div>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#10b981' }}>
                            {activeTrucks.size} active truck{activeTrucks.size !== 1 ? 's' : ''} found in Balance Sheet for {fmtDateL(tollFrom)} → {fmtDateL(tollTo)}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {[...activeTrucks].join(' · ')}
                        </div>
                        <div style={{ fontSize: '10px', color: '#10b981', marginTop: '3px', fontWeight: 700 }}>
                            Excel import will only include toll records for these trucks within this date range.
                        </div>
                    </div>
                </div>
            )}
            {tollFrom && tollTo && !rangeLoading && activeTrucks.size === 0 && (
                <div style={{ padding: '10px 16px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <AlertTriangle size={14} color="#f59e0b" />
                    <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 700 }}>No voucher entries found in Balance Sheet for this date range. Click Apply first to load active trucks.</span>
                </div>
            )}

            {/* Excel import */}
            <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <Upload size={15} color="#6366f1" />
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>Import from Excel</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {activeTrucks.size > 0
                            ? `Will import only: date ${tollFrom} → ${tollTo} + ${activeTrucks.size} active trucks`
                            : 'Set date range and click Apply first to validate against Balance Sheet'}
                    </span>
                    <label className={`btn btn-sm ${activeTrucks.size > 0 ? 'btn-p' : 'btn-g'}`} style={{ cursor: 'pointer', margin: 0 }}>
                        <Upload size={12} /> {tollImporting ? 'Reading…' : 'Choose Excel File'}
                        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelImport} style={{ display: 'none' }} disabled={tollImporting} />
                    </label>
                </div>

                {/* Import preview */}
                {tollImportPreview && (
                    <div style={{ marginTop: '14px', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 14px', background: 'rgba(99,102,241,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <span style={{ fontSize: '12px', fontWeight: 700 }}>{tollImportPreview.rows.length} records from <em>{tollImportPreview.fileName}</em> — preview (first 10)</span>
                                {(tollImportPreview.skippedDate > 0 || tollImportPreview.skippedTruck > 0) && (
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                        {tollImportPreview.totalInFile} total in file
                                        {tollImportPreview.skippedDate > 0 && ` · ${tollImportPreview.skippedDate} skipped (outside date range)`}
                                        {tollImportPreview.skippedTruck > 0 && ` · ${tollImportPreview.skippedTruck} skipped (truck not in Balance Sheet)`}
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-g btn-sm" onClick={() => setTollImportPreview(null)}>Cancel</button>
                                <button className="btn btn-p btn-sm" onClick={handleImportConfirm} disabled={tollImporting}>
                                    {tollImporting ? <Loader2 size={12} className="spin" /> : <><Check size={12} /> Import {tollImportPreview.rows.length} Records</>}
                                </button>
                            </div>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                <thead><tr>{['Truck No.', 'Date', 'Amount', 'Route/Plaza', 'Remark'].map(h => <th key={h} style={TH2}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {tollImportPreview.rows.slice(0, 10).map((r, i) => (
                                        <tr key={i} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                                            <td style={{ ...TD2, fontWeight: 800 }}>{r.truckNo}</td>
                                            <td style={TD2}>{r.date}</td>
                                            <td style={{ ...TD2, color: '#f43f5e', fontWeight: 700 }}>Rs.{parseFloat(r.amount).toLocaleString('en-IN')}</td>
                                            <td style={TD2}>{r.route || '—'}</td>
                                            <td style={TD2}>{r.remark || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Manual entry form */}
            <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={13} /> Add Toll Entry Manually</div>
                <form onSubmit={handleManualSave} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                    <div className="field" style={{ flex: '1', minWidth: '120px' }}>
                        <label>Truck No. *</label>
                        <input className="fi" type="text" placeholder="HR47G3246" value={tollForm.truckNo} onChange={e => setTollForm(f => ({ ...f, truckNo: e.target.value }))} list="toll-truck-list" required />
                        <datalist id="toll-truck-list">{vehicleNumbers.map(n => <option key={n} value={n} />)}</datalist>
                    </div>
                    <div className="field" style={{ flex: '1', minWidth: '120px' }}>
                        <label>Date *</label>
                        <input className="fi" type="date" value={tollForm.date} onChange={e => setTollForm(f => ({ ...f, date: e.target.value }))} required />
                    </div>
                    <div className="field" style={{ flex: '1', minWidth: '100px' }}>
                        <label>Amount (Rs.) *</label>
                        <input className="fi" type="number" step="any" min="1" placeholder="0" value={tollForm.amount} onChange={e => setTollForm(f => ({ ...f, amount: e.target.value }))} required />
                    </div>
                    <div className="field" style={{ flex: '2', minWidth: '140px' }}>
                        <label>Route / Plaza</label>
                        <input className="fi" type="text" placeholder="e.g. Delhi–Jaipur NH48" value={tollForm.route} onChange={e => setTollForm(f => ({ ...f, route: e.target.value }))} />
                    </div>
                    <div className="field" style={{ flex: '1', minWidth: '120px' }}>
                        <label>Remark</label>
                        <input className="fi" type="text" placeholder="Optional" value={tollForm.remark} onChange={e => setTollForm(f => ({ ...f, remark: e.target.value }))} />
                    </div>
                    <button type="submit" className="btn btn-p" disabled={tollSaving} style={{ height: '38px' }}>
                        {tollSaving ? <Loader2 size={13} className="spin" /> : <><Check size={13} /> Save</>}
                    </button>
                </form>
            </div>

            {/* Summary cards */}
            {truckSummary.length > 0 && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '11px 18px', minWidth: '130px' }}>
                        <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total Toll</div>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: '#f43f5e' }}>{fmtRsL(totalToll)}</div>
                    </div>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '11px 18px', minWidth: '130px' }}>
                        <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Records</div>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text)' }}>{filtered.length}</div>
                    </div>
                    {truckSummary.slice(0, 4).map(t => (
                        <div key={t.truckNo} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '11px 18px', minWidth: '130px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t.truckNo} ({t.count} trips)</div>
                            <div style={{ fontSize: '16px', fontWeight: 900, color: '#f43f5e' }}>{fmtRsL(t.totalToll)}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Records table */}
            <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <Search size={13} color="var(--text-muted)" />
                    <input className="fi" placeholder="Search truck, route, remark…" value={tollSearch} onChange={e => setTollSearch(e.target.value)} style={{ flex: 1, height: '30px' }} />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{filtered.length} records</span>
                </div>
                <div className="tbl-wrap">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                        <thead>
                            <tr>{['#', 'Date', 'Truck No.', 'Amount', 'Route / Plaza', 'Remark', 'Del'].map(h => <th key={h} style={TH2}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                            {tollLoading && <tr><td colSpan={7} style={{ ...TD2, textAlign: 'center', padding: '30px' }}><Loader2 size={18} className="spin" /></td></tr>}
                            {!tollLoading && filtered.length === 0 && <tr><td colSpan={7} style={{ ...TD2, textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No toll records. Upload Excel or add manually.</td></tr>}
                            {!tollLoading && filtered.map((r, i) => (
                                <tr key={r.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                                    <td style={{ ...TD2, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                                    <td style={TD2}>{fmtDateL(r.date)}</td>
                                    <td style={{ ...TD2, fontWeight: 800, color: 'var(--primary)' }}>{r.truckNo}</td>
                                    <td style={{ ...TD2, textAlign: 'right', fontWeight: 800, color: '#f43f5e' }}>{fmtRsL(parseFloat(r.amount) || 0)}</td>
                                    <td style={TD2}>{r.route || '—'}</td>
                                    <td style={TD2}>{r.remark || '—'}</td>
                                    <td style={{ ...TD2, textAlign: 'center' }}>
                                        <button className="btn btn-d btn-icon btn-sm" onClick={() => handleDelete(r.id)} title="Delete"><Trash2 size={12} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        {filtered.length > 0 && (
                            <tfoot>
                                <tr style={{ background: 'var(--bg-tf)', borderTop: '2px solid var(--border)' }}>
                                    <td colSpan={3} style={{ ...TD2, fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total ({filtered.length} records)</td>
                                    <td style={{ ...TD2, textAlign: 'right', fontWeight: 900, fontSize: '14px', color: '#f43f5e' }}>{fmtRsL(totalToll)}</td>
                                    <td colSpan={3} style={TD2} />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}

export default function VehicleModule({ role = 'user', permissions = {} }) {
    const [vehicles, setVehicles] = useState([]);
    const [parties, setParties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // UI State
    const [tab, setTab] = useState('list'); // add new 'registry' option
    const [ownershipFilter, setOwnershipFilter] = useState('self'); 
    const [fSearch, setFSearch] = useState('');
    const [expandedOwners, setExpandedOwners] = useState({});
    const [profiles, setProfiles] = useState([]);
    const [loadingProfiles, setLoadingProfiles] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [ownerDeleteTarget, setOwnerDeleteTarget] = useState(null);
    const [maintenanceTarget, setMaintenanceTarget] = useState(null);
    const [tyreTarget, setTyreTarget] = useState(null); // { truckNo }
    const [tyreHistory, setTyreHistory] = useState([]);
    const [tyreLoading, setTyreLoading] = useState(false);
    const [emiTrackerTarget, setEmiTrackerTarget] = useState(null);

    const openTyreLog = async (truckNo) => {
        setTyreTarget({ truckNo });
        setTyreLoading(true);
        try {
            const res = await ax.get(`/vehicles/tyre-history/${encodeURIComponent(truckNo)}`);
            setTyreHistory(res.data || []);
        } catch { setTyreHistory([]); }
        finally { setTyreLoading(false); }
    };
    
    // ── Toll state ──────────────────────────────────────────────────────────
    const [tollRecords, setTollRecords] = useState([]);
    const [tollLoading, setTollLoading] = useState(false);
    const [tollFrom, setTollFrom] = useState('');
    const [tollTo, setTollTo] = useState('');
    const [tollForm, setTollForm] = useState({ truckNo: '', date: new Date().toISOString().slice(0, 10), amount: '', route: '', remark: '' });
    const [tollSaving, setTollSaving] = useState(false);
    const [tollImporting, setTollImporting] = useState(false);
    const [tollImportPreview, setTollImportPreview] = useState(null); // { rows, fileName }
    const [tollSearch, setTollSearch] = useState('');

    const fetchTolls = useCallback(async (from = tollFrom, to = tollTo) => {
        setTollLoading(true);
        try {
            const params = new URLSearchParams();
            if (from) params.set('from', from);
            if (to) params.set('to', to);
            const res = await ax.get(`/tolls?${params}`);
            setTollRecords(res.data || []);
        } catch { setTollRecords([]); }
        finally { setTollLoading(false); }
    }, [tollFrom, tollTo]);

    const [registryEntries, setRegistryEntries] = useState([]);
    const [allVouchers, setAllVouchers] = useState([]);
    const [allTolls, setAllTolls] = useState([]);
    const fetchRegistry = useCallback(async () => {
        try {
            const res = await ax.get(`${API}/registry`);
            setRegistryEntries(res.data || []);
        } catch (e) { console.error('Registry fetch error', e); }
    }, []);

    useEffect(() => {
        if (tab === 'registry') fetchRegistry();
        if (tab === 'toll') fetchTolls();
    }, [tab, fetchRegistry, fetchTolls]);

    const fetchVehicleData = useCallback(async () => {
        setLoading(true);
        try {
            // Vouchers + tolls fetched lazily (cache in api.js serves repeat calls for free)
            const [vRes, pRes, prRes, vocRes, tollRes] = await Promise.all([
                ax.get(API),
                ax.get('/parties').catch(() => ({ data: [] })),
                ax.get('/profiles').catch(() => ({ data: [] })),
                ax.get('/vouchers').catch(() => ({ data: [] })),
                ax.get('/tolls').catch(() => ({ data: [] }))
            ]);
            setVehicles(vRes.data || []);
            setParties(pRes.data || []);
            setProfiles(prRes.data || []);
            const vouchers = vocRes.data || [];
            setAllVouchers(vouchers);
            setAllTolls(tollRes.data || []);
            // Debug: log unique truck numbers found in vouchers (visible in browser console)
            const vTrucks = [...new Set(vouchers.map(v => cleanTruckNo(v.truckNo)).filter(Boolean))];
            console.log(`[VehicleModule] Loaded ${vouchers.length} vouchers for ${vTrucks.length} trucks:`, vTrucks.join(', '));

            // Check for search redirect from other modules
            const redirectSearch = localStorage.getItem('vgtc-search-redirect');
            if (redirectSearch) {
                setFSearch(redirectSearch);
                localStorage.removeItem('vgtc-search-redirect');
                setOwnershipFilter('all');
            }
        } catch (e) {
            console.error('Fetch error:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchVehicleData(); }, [fetchVehicleData]);

    // Form State
    const [form, setForm] = useState(getEmptyForm());
    const [editId, setEditId] = useState(null);
    const [isConfirmingSave, setIsConfirmingSave] = useState(false);
    const [err, setErr] = useState('');

    const checkExpiry = (dateStr) => {
        if (!dateStr) return null;
        const expiry = new Date(dateStr);
        const now = new Date();
        const diff = (expiry - now) / (1000 * 60 * 60 * 24);
        if (diff < 0) return 'expired';
        if (diff < 30) return 'near';
        return 'ok';
    };


    const isNearExpiry = (v) => {
        const d = parseJson(v.docs);
        return Object.values(d).some(date => checkExpiry(date) === 'near' || checkExpiry(date) === 'expired');
    };

    const getDocIcon = (type, date) => {
        const status = checkExpiry(date);
        if (!date) return null;
        const color = status === 'expired' ? 'var(--danger)' : status === 'near' ? '#f59e0b' : '#10b981';
        return (
            <div key={type} style={{ fontSize: '10px', color, display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-input)', padding: '2px 6px', borderRadius: '4px', border: `1px solid ${status === 'ok' ? 'var(--border)' : color}` }}>
                {status !== 'ok' && <AlertTriangle size={10} />}
                <span style={{ fontWeight: 800 }}>{(type || '').toUpperCase()}:</span> {new Date(date).toLocaleDateString('en-IN')}
            </div>
        );
    };

    const handleEdit = (v) => {
        setForm({
            ...getEmptyForm(),
            ...v,
            bankDetails: v.bankDetails || getEmptyForm().bankDetails,
            emiDetails: v.emiDetails || getEmptyForm().emiDetails,
            docs: v.docs || getEmptyForm().docs
        });
        setEditId(v.id);
        setTab('add');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSaveRequest = (e) => {
        e.preventDefault();
        if (form.ownershipType === 'self') {
            form.ownerName = 'Vikas Transport (Self)';
        }
        if (!form.truckNo || !form.ownerName) { setErr('Truck Number and Owner Name are required'); return; }
        const duplicate = vehicles.find(v => v.id !== editId && cleanTruckNo(v.truckNo) === cleanTruckNo(form.truckNo));
        if (duplicate) { setErr(`Truck number ${cleanTruckNo(form.truckNo)} already exists`); return; }
        setErr('');
        setIsConfirmingSave(true);
    };

    const executeGPSDeduction = async () => {
        if (!window.confirm('Run monthly GPS deduction? (₹250 per device)')) return;
        try {
            const { data } = await ax.post(`${API}/deduct-gps`, {
                date: new Date().toISOString().slice(0, 10),
                remark: `Deducted on ${new Date().toLocaleDateString('en-IN')}`
            });
            alert(data.message);
        } catch (error) {
            alert(error.response?.data?.error || 'GPS Deduction failed');
        }
    };

    const pendingFromVouchers = useMemo(() => {
        const systemTrucks = new Set(vehicles.map(v => cleanTruckNo(v.truckNo)));
        const registryTrucks = new Set(registryEntries.map(e => cleanTruckNo(e.truckNo)));
        const voucherTrucks = [...new Set(allVouchers.map(v => cleanTruckNo(v.truckNo)))].filter(Boolean);
        
        return voucherTrucks
            .filter(t => !systemTrucks.has(t) && !registryTrucks.has(t))
            .map(t => ({
                id: `pending-${t}`,
                truckNo: t,
                isPending: true,
                createdAt: new Date().toISOString()
            }));
    }, [allVouchers, vehicles, registryEntries]);

    const executeSave = async () => {
        setSaving(true); setIsConfirmingSave(false);
        try {
            if (editId) {
                await ax.patch(`${API}/${editId}`, form);
            } else {
                await ax.post(API, form);
            }
            await fetchVehicleData();
            setForm(getEmptyForm());
            setEditId(null);
            setTab('list');
        } catch (error) {
            setErr(error.response?.data?.error || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const toggleOwner = (name) => {
        setExpandedOwners(prev => ({ ...prev, [name]: !prev[name] }));
    };

    const autofillFromOwner = (ownerName) => {
        const party = parties.find(p => String(p.name || '').toUpperCase() === String(ownerName || '').toUpperCase());
        if (party) {
            setForm(f => ({
                ...f,
                ownerName: party.name,
                ownerId: party.id,
                ownerContact: f.ownerContact || party.phone || '',
                bankDetails: f.bankDetails || party.bankDetails || ''
            }));
            return;
        }

        const existing = vehicles.find(v => v.ownerName === ownerName);
        if (existing) {
            setForm(f => ({
                ...f,
                ownerName: existing.ownerName,
                ownerContact: f.ownerContact || existing.ownerContact || '',
                bankDetails: f.bankDetails || existing.bankDetails || ''
            }));
        } else {
            setForm(f => ({ ...f, ownerName }));
        }
    };

    const calculateEMI = (p, r, n) => {
        const principal = parseFloat(p) || 0;
        const rate = (parseFloat(r) || 0) / 12 / 100;
        const months = parseInt(n) || 0;
        if (!principal || !rate || !months) return 0;
        const emi = principal * rate * (Math.pow(1 + rate, months) / (Math.pow(1 + rate, months) - 1));
        return Math.round(emi);
    };

    const handleMarkPaid = async (v) => {
        if (!window.confirm('Mark current month EMI as paid/deducted?')) return;
        const d = parseJson(v.emiDetails);
        const paid = d.paidEmis || [];
        paid.push(new Date().toISOString().slice(0, 7)); // Save YYYY-MM
        d.paidEmis = [...new Set(paid)];
        try {
            await ax.patch(`${API}/${v.id}`, { emiDetails: JSON.stringify(d) });
            fetchVehicleData();
        } catch { alert('Update failed'); }
    };

    const calculateAge = (date) => {
        if (!date) return 'N/A';
        const start = new Date(date);
        const now = new Date();
        const diff = now.getFullYear() - start.getFullYear();
        return diff > 0 ? `${diff} Years` : 'New';
    };

    const handleSendAlerts = async () => {
        const email = "VIKASKUMAR909040@GMAIL.COM";
        try {
            const res = await ax.get('/vehicles/alerts/report');
            if (res.data.success) {
                const { count = 0, total = 0 } = res.data;
                const summary = count > 0
                    ? `${count} of ${total} vehicle(s) have issues.`
                    : `All ${total} vehicles OK.`;
                alert(`Fleet status report sent to ${email}.\n${summary}\nCheck your Inbox/Spam.`);
            } else {
                alert(`Failed: ${res.data.message || res.data.error || 'No data found.'}`);
            }
        } catch (err) {
            console.error('Email trigger failed:', err);
            alert('Failed to send email alert. Check server connection.');
        }
    };

    const handleSendVehicleAlert = async (vehicleId, truckNo) => {
        const email = "VIKASKUMAR909040@GMAIL.COM";
        try {
            const res = await ax.get(`/vehicles/alerts/vehicle/${vehicleId}`);
            if (res.data.success) {
                const { count = 0 } = res.data;
                const summary = count > 0 ? `${count} issue(s) found.` : 'No issues — all OK.';
                alert(`Alert report for ${truckNo} sent to ${email}.\n${summary}`);
            } else {
                alert(`Failed: ${res.data.message || res.data.error || 'Unknown error.'}`);
            }
        } catch (err) {
            console.error('Vehicle alert failed:', err);
            alert(`Failed to send alert for ${truckNo}.`);
        }
    };

    const toggleToNew = () => {
        setForm(getEmptyForm());
        setEditId(null);
        setTab('add');
    };

    // Compute outstanding balance per truck from real voucher + toll data
    const truckBalanceMap = useMemo(() => {
        const map = {};
        (allVouchers || []).forEach(voucher => {
            const truck = cleanTruckNo(voucher.truckNo);
            if (!truck) return;
            if (!map[truck]) map[truck] = { net: 0, paid: 0, toll: 0 };
            const gross = voucher.deliveries?.length > 0
                ? voucher.deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0), 0)
                : (parseFloat(voucher.weight) || 0) * (parseFloat(voucher.rate) || 0);
            const diesel = voucher.advanceDiesel === 'FULL' ? 4000 : (parseFloat(voucher.advanceDiesel) || 0);
            const cash = parseFloat(voucher.advanceCash) || 0;
            const online = parseFloat(voucher.advanceOnline) || 0;
            const weight = parseFloat(voucher.weight) || 0;
            const munshi = parseFloat(voucher.munshi) || (weight > 0 ? (weight < 18 ? 50 : 100) : 0);
            const commission = parseFloat(voucher.commission) || 0;
            const shortage = parseFloat(voucher.shortage) || 0;
            const tyres = (parseFloat(voucher.tyrePuncture) || 0) + (parseFloat(voucher.tyreGreasingAir) || 0) + (parseFloat(voucher.tyreGreasing) || 0) + (parseFloat(voucher.tyreAir) || 0) + (parseFloat(voucher.extraCash) || 0);
            const net = gross - diesel - cash - online - munshi - commission - shortage - tyres;
            map[truck].net += net;
            map[truck].paid += parseFloat(voucher.paidBalance) || 0;
        });
        // Add toll deductions per truck
        (allTolls || []).forEach(t => {
            const truck = cleanTruckNo(t.truckNo);
            if (!truck) return;
            if (!map[truck]) map[truck] = { net: 0, paid: 0, toll: 0 };
            map[truck].toll = (map[truck].toll || 0) + (parseFloat(t.amount) || 0);
        });
        // outstanding = max(0, net - toll - paid) per truck
        Object.keys(map).forEach(t => {
            const r = map[t];
            r.outstanding = Math.max(0, r.net - (r.toll || 0) - r.paid);
        });
        return map;
    }, [allVouchers, allTolls]);

    const owners = useMemo(() => {
        const map = Object.create(null);
        const lowerSearch = (fSearch || '').toLowerCase();
        vehicles.forEach(v => {
            if (ownershipFilter !== 'all' && v.ownershipType !== ownershipFilter) return;
            if (lowerSearch) {
                const haystack = `${v.truckNo || ''} ${v.ownerName || ''} ${v.ownerContact || ''}`.toLowerCase();
                if (!haystack.includes(lowerSearch)) return;
            }
            const oName = v.ownerName || 'Unknown Owner';
            const party = parties.find(p => String(p.name || '').toUpperCase() === String(oName || '').toUpperCase());
            if (!map[oName]) map[oName] = { name: oName, ownerId: v.ownerId || null, partyId: v.ownerId || party?.id || null, vehicles: [], bankDetails: v.bankDetails || '', contact: v.ownerContact || '', balance: 0 };
            if (!map[oName].ownerId && v.ownerId) map[oName].ownerId = v.ownerId;
            if (!map[oName].partyId && (v.ownerId || party?.id)) map[oName].partyId = v.ownerId || party.id;
            if (!map[oName].bankDetails && v.bankDetails) map[oName].bankDetails = v.bankDetails;

            // Use real voucher-based outstanding balance for this truck
            const truck = cleanTruckNo(v.truckNo);
            const tb = truckBalanceMap[truck];
            map[oName].balance += tb ? tb.outstanding : 0;

            map[oName].vehicles.push(v);
        });
        return Object.values(map).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    }, [vehicles, parties, fSearch, ownershipFilter, truckBalanceMap]);

    const uniqueOwners = [...new Set([...parties.filter(p => p.type === 'supplier' || p.type === 'transporter').map(p => p.name), ...vehicles.map(v => v.ownerName)])].filter(Boolean).sort();
    const uniqueTruckNos = [...new Set(vehicles.map(v => cleanTruckNo(v.truckNo)).filter(Boolean))].sort();

    return (
        <div>
            <AnimatePresence>
                {deleteTarget && <DeleteConfirm vehicle={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { setDeleteTarget(null); fetchVehicleData(); }} />}
                {ownerDeleteTarget && <OwnerDeleteConfirm owner={ownerDeleteTarget} onClose={() => setOwnerDeleteTarget(null)} onConfirm={() => { setOwnerDeleteTarget(null); fetchVehicleData(); }} />}
            </AnimatePresence>

            <AnimatePresence>
                {maintenanceTarget && <MaintenanceTracker truckNo={maintenanceTarget.truckNo} onClose={() => setMaintenanceTarget(null)} />}
            </AnimatePresence>

            <AnimatePresence>
                {emiTrackerTarget && (
                    <EmiScheduleTracker
                        vehicle={emiTrackerTarget}
                        onClose={() => setEmiTrackerTarget(null)}
                        onUpdate={async () => {
                            await fetchVehicleData();
                            try {
                                const res = await ax.get(API);
                                const updatedList = res.data || [];
                                const updatedVeh = updatedList.find(v => v.id === emiTrackerTarget.id);
                                if (updatedVeh) setEmiTrackerTarget(updatedVeh);
                            } catch (e) {
                                console.error('Emi Tracker refresh error:', e);
                            }
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Tyre & Expense Log Modal */}
            <AnimatePresence>
                {tyreTarget && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
                        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                            style={{ width: '95%', maxWidth: '680px', maxHeight: '85vh', background: 'var(--bg-card)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text)' }}>🛞 Tyre & Vehicle Expenses</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{tyreTarget.truckNo} — from voucher history</div>
                                </div>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setTyreTarget(null)}><X size={18} /></button>
                            </div>
                            <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
                                {tyreLoading ? (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', color: 'var(--text-muted)' }}><Loader2 size={20} className="spin" style={{ marginRight: '8px' }} /> Loading...</div>
                                ) : tyreHistory.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)', fontSize: '13px' }}>No tyre or vehicle expenses found for this truck.</div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--bg-th)' }}>
                                                <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>#</th>
                                                <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Date</th>
                                                <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>LR No.</th>
                                                <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Type</th>
                                                <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Amount</th>
                                                <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Running Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tyreHistory.map((e, i) => (
                                                <tr key={e.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)', borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '7px 16px', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                                                    <td style={{ padding: '7px 16px' }}>{e.date || '—'}</td>
                                                    <td style={{ padding: '7px 16px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>#{e.lrNo}</td>
                                                    <td style={{ padding: '7px 16px' }}>
                                                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, background: e.type.includes('Puncture') ? 'rgba(244,63,94,0.1)' : e.type.includes('Grease') ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.1)', color: e.type.includes('Puncture') ? '#f43f5e' : e.type.includes('Grease') ? '#f59e0b' : '#6366f1' }}>{e.type}</span>
                                                    </td>
                                                    <td style={{ padding: '7px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>Rs.{Math.round(e.amount).toLocaleString('en-IN')}</td>
                                                    <td style={{ padding: '7px 16px', textAlign: 'right', fontWeight: 800, color: 'var(--warn)' }}>Rs.{Math.round(e.runningTotal).toLocaleString('en-IN')}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr style={{ background: 'var(--bg-tf)', borderTop: '2px solid var(--border)' }}>
                                                <td colSpan={4} style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total ({tyreHistory.length} entries)</td>
                                                <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 800, color: 'var(--danger)' }}>Rs.{Math.round(tyreHistory.reduce((s, e) => s + e.amount, 0)).toLocaleString('en-IN')}</td>
                                                <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 900, color: 'var(--warn)' }}>Rs.{Math.round(tyreHistory[tyreHistory.length - 1]?.runningTotal || 0).toLocaleString('en-IN')}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <ConfirmSaveModal isOpen={isConfirmingSave} onClose={() => setIsConfirmingSave(false)} onConfirm={executeSave} title={editId ? "Update Vehicle" : "Add Vehicle"} message={`Save changes for ${form.truckNo}?`} isSaving={saving} />

            <div className="page-hd">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: 'var(--primary)', color: 'white', padding: '10px', borderRadius: '12px', boxShadow: '0 8px 16px var(--primary-glow)' }}><Truck size={24} /></div>
                    <div>
                        <h1>Fleet Management</h1>
                        <p>Manage vehicles, documents, EMIs, tolls and outstanding balances</p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className={`tab-btn${tab === 'list' ? ' tab-indigo' : ''}`} onClick={() => setTab('list')}><Truck size={14} /> Vehicles</button>
                    <button className={`tab-btn${tab === 'toll' ? ' tab-amber' : ''}`} onClick={() => setTab('toll')}><Receipt size={14} /> Toll Records</button>
                    <button className={`tab-btn${tab === 'registry' ? ' tab-amber' : ''}`} onClick={() => setTab('registry')}><Check size={14} /> Pending Trucks</button>
                    <button className={`tab-btn${tab === 'add' ? ' tab-indigo' : ''}`} onClick={toggleToNew}>{editId ? <><Edit3 size={14} /> Edit Vehicle</> : <><Plus size={14} /> Add Vehicle</>}</button>
                </div>
                {tab === 'list' && (
                    <div className="tab-grp">
                        <button className="tab-btn tab-indigo" onClick={handleSendAlerts} style={{ marginRight: '10px', background: '#3b82f6', color: 'white' }}>
                            <Bell size={14} /> Email Alert
                        </button>
                        <button className={`tab-btn${ownershipFilter === 'self' ? ' tab-indigo' : ''}`} onClick={() => setOwnershipFilter('self')}>Own Fleet (Self)</button>
                    </div>
                )}
            </div>

            {tab === 'add' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card">
                    <form className="card-body" onSubmit={handleSaveRequest}>
                        <div className="fg fg-3">
                            <div className="field-h">
                                <label>Truck No. *</label>
                                <input className="fi" type="text" placeholder="RJXX-XXXX" value={form.truckNo} onChange={e => setForm({ ...form, truckNo: cleanTruckNo(e.target.value) })} required list="truck-list" />
                                <datalist id="truck-list">{uniqueTruckNos.map(no => <option key={no} value={no} />)}</datalist>
                            </div>
                            <div className="field-h">
                                <label>Make & Model</label>
                                <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                                    <select className="fi" style={{ flex: 1 }} value={form.make} onChange={e => setForm({ ...form, make: e.target.value })}>
                                        <option value="Tata">Tata</option>
                                        <option value="Ashok Leyland">Ashok Leyland</option>
                                        <option value="BharatBenz">BharatBenz</option>
                                        <option value="Eicher">Eicher</option>
                                        <option value="Mahindra">Mahindra</option>
                                    </select>
                                    <input className="fi" style={{ flex: 1 }} type="text" placeholder="e.g. 3518, 4018" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} />
                                </div>
                            </div>
                            <div className="field-h">
                                <label>Type</label>
                                <select className="fi" value={form.vehicleType} onChange={e => setForm({ ...form, vehicleType: e.target.value })}>
                                    <option value="Trailer">Trailer</option>
                                    <option value="Dump Truck">Dump Truck</option>
                                    <option value="Canter">Canter</option>
                                </select>
                            </div>
                            <div className="field-h">
                                <label>Ownership</label>
                                <select className="fi" value={form.ownershipType} onChange={e => setForm({ ...form, ownershipType: e.target.value })}>
                                    <option value="market">Market Vehicle</option>
                                    <option value="self">Self Vehicle</option>
                                    <option value="other">Other Vehicle</option>
                                </select>
                            </div>
                            <div className="field-h">
                                <label>GPS Type</label>
                                <select className="fi" value={form.gpsType} onChange={e => setForm({ ...form, gpsType: e.target.value })}>
                                    <option value="none">None</option>
                                    <option value="jkl">JK Lakshmi</option>
                                    <option value="jksuper">JK Super</option>
                                    <option value="both">Both</option>
                                </select>
                            </div>
                        </div>

                        <div className="fg fg-3">
                            <div className="field-h">
                                <label>Gross Weight (KG)</label>
                                <input className="fi" type="number" placeholder="GVW" value={form.grossWeight} onChange={e => setForm({ ...form, grossWeight: e.target.value })} />
                            </div>
                            <div className="field-h">
                                <label>Unladen Weight (KG)</label>
                                <input className="fi" type="number" placeholder="Kerb weight" value={form.unladenWeight} onChange={e => setForm({ ...form, unladenWeight: e.target.value })} />
                            </div>
                            <div className="field-h">
                                <label>Payload (Calculated)</label>
                                <div className="fi" style={{ background: 'var(--bg-th)', color: 'var(--primary)', fontWeight: 800 }}>
                                    {Math.max(0, (parseFloat(form.grossWeight) || 0) - (parseFloat(form.unladenWeight) || 0))} KG
                                </div>
                            </div>
                        </div>

                        <div className="fg fg-3">
                            <div className="field-h">
                                <label>Registration Date (Age: {calculateAge(form.regDate)})</label>
                                <input className="fi" type="date" value={form.regDate} onChange={e => setForm({ ...form, regDate: e.target.value })} />
                            </div>
                            <div className="field-h">
                                <label>National Permit Expiry</label>
                                <input className="fi" type="date" value={form.nationalPermitDate} onChange={e => setForm({ ...form, nationalPermitDate: e.target.value })} />
                            </div>
                            <div className="field-h">
                                <label>Target Average (KM/L)</label>
                                <input className="fi" type="number" step="0.1" placeholder="e.g. 4.5" value={form.targetMileage} onChange={e => setForm({ ...form, targetMileage: e.target.value })} />
                            </div>
                        </div>
                        {form.ownershipType !== 'self' && (
                            <>
                                <hr className="sep" />
                                <h4 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <User size={15} color="var(--primary)" /> Owner Information
                                </h4>

                                <div className="fg fg-2">
                                    <div className="field-h">
                                        <label>Owner Name *</label>
                                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                            <input className="fi" type="text" placeholder="Name or Company" value={form.ownerName} onChange={e => autofillFromOwner(e.target.value)} required={form.ownershipType !== 'self'} list="owner-list" />
                                            <datalist id="owner-list">
                                                {uniqueOwners.map(o => {
                                                    const isMaster = parties.some(p => p.name === o);
                                                    return <option key={o} value={o}>{isMaster ? '⭐ (Master Data)' : ''}</option>;
                                                })}
                                            </datalist>
                                        </div>
                                    </div>
                                    <div className="field-h">
                                        <label>Owner Contact</label>
                                        <input className="fi" type="text" placeholder="Phone number" value={form.ownerContact} onChange={e => setForm({ ...form, ownerContact: e.target.value })} />
                                    </div>
                                </div>
                            </>
                        )}

                        <div style={{ marginTop: '20px', padding: '20px', background: 'var(--bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                            <h4 style={{ fontSize: '13px', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={16} color="var(--primary)" /> RC & Document Numbers Registry</h4>
                            <div className="fg fg-3">
                                <div className="field-h"><label>RC Number</label><input className="fi" type="text" value={parseJson(form.docNumbers).rcNo || ''} onChange={e => { const d = parseJson(form.docNumbers); d.rcNo = e.target.value; setForm({ ...form, docNumbers: JSON.stringify(d) }); }} /></div>
                                <div className="field-h"><label>Insurance Policy</label><input className="fi" type="text" value={parseJson(form.docNumbers).insuranceNo || ''} onChange={e => { const d = parseJson(form.docNumbers); d.insuranceNo = e.target.value; setForm({ ...form, docNumbers: JSON.stringify(d) }); }} /></div>
                                <div className="field-h"><label>Permit Number</label><input className="fi" type="text" value={parseJson(form.docNumbers).permitNo || ''} onChange={e => { const d = parseJson(form.docNumbers); d.permitNo = e.target.value; setForm({ ...form, docNumbers: JSON.stringify(d) }); }} /></div>
                                <div className="field-h"><label>Engine Number</label><input className="fi" type="text" value={parseJson(form.rcDetails).engineNo || ''} onChange={e => { const d = parseJson(form.rcDetails); d.engineNo = e.target.value; setForm({ ...form, rcDetails: JSON.stringify(d) }); }} /></div>
                                <div className="field-h"><label>Chassis Number</label><input className="fi" type="text" value={parseJson(form.rcDetails).chassisNo || ''} onChange={e => { const d = parseJson(form.rcDetails); d.chassisNo = e.target.value; setForm({ ...form, rcDetails: JSON.stringify(d) }); }} /></div>
                                <div className="field-h"><label>Fastag Serial</label><input className="fi" type="text" value={form.fastag || ''} onChange={e => setForm({ ...form, fastag: e.target.value })} /></div>
                            </div>
                        </div>

                        {form.ownershipType === 'self' && (
                            <div style={{ marginTop: '20px', padding: '20px', background: 'rgba(59,130,246,0.05)', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.1)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <h4 style={{ fontSize: '13px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Banknote size={16} color="#3b82f6" /> EMI Loan Calculator & Tracking</h4>
                                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#3b82f6', background: 'rgba(59,130,246,0.1)', padding: '4px 10px', borderRadius: '20px' }}>AUTO CALCULATE ENABLED</div>
                                </div>
                                <div className="fg fg-3">
                                    <div className="field-h"><label>Financing Bank</label><input className="fi" type="text" placeholder="e.g. HDFC, SBI" value={parseJson(form.emiDetails).bankName || ''} onChange={e => { const d = parseJson(form.emiDetails); d.bankName = e.target.value; setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                    <div className="field-h"><label>Loan Number</label><input className="fi" type="text" value={parseJson(form.emiDetails).loanNo || ''} onChange={e => { const d = parseJson(form.emiDetails); d.loanNo = e.target.value; setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                    <div className="field-h"><label>Interest Rate (%)</label><input className="fi" type="number" step="0.1" value={parseJson(form.emiDetails).interestRate || ''} onChange={e => { const d = parseJson(form.emiDetails); d.interestRate = e.target.value; d.due = calculateEMI(d.total, e.target.value, d.tenure); setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                    <div className="field-h"><label>Total Loan Amount (P)</label><input className="fi" type="number" value={parseJson(form.emiDetails).total || ''} onChange={e => { const d = parseJson(form.emiDetails); d.total = e.target.value; d.due = calculateEMI(e.target.value, d.interestRate, d.tenure); setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                    <div className="field-h"><label>Tenure (Months)</label><input className="fi" type="number" value={parseJson(form.emiDetails).tenure || ''} onChange={e => { const d = parseJson(form.emiDetails); d.tenure = e.target.value; d.due = calculateEMI(d.total, d.interestRate, e.target.value); setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                    <div className="field-h"><label>Monthly EMI Amount</label><input className="fi" type="number" value={parseJson(form.emiDetails).due || ''} onChange={e => { const d = parseJson(form.emiDetails); d.due = e.target.value; setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                    <div className="field-h"><label>EMI End Date</label><input className="fi" type="date" value={parseJson(form.emiDetails).endDate || ''} onChange={e => { const d = parseJson(form.emiDetails); d.endDate = e.target.value; setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                    <div className="field-h"><label>Loan Start Date</label><input className="fi" type="date" value={parseJson(form.emiDetails).startDate || ''} onChange={e => { const d = parseJson(form.emiDetails); d.startDate = e.target.value; setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                    <div className="field-h"><label>Current Pending Principal</label><input className="fi" type="number" value={parseJson(form.emiDetails).pending || ''} onChange={e => { const d = parseJson(form.emiDetails); d.pending = e.target.value; setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                    <div className="field-h"><label>EMI Due Day (1-31)</label><input className="fi" type="number" min="1" max="31" placeholder="e.g. 5" value={parseJson(form.emiDetails).emiDay || ''} onChange={e => { const d = parseJson(form.emiDetails); d.emiDay = e.target.value; setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: '20px', padding: '20px', background: 'var(--bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                            <h4 style={{ fontSize: '13px', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={16} /> Virtual RC & Documents</h4>
                            <div className="fg fg-3">
                                {['rc', 'pollution', 'permit', 'insurance', 'fitness', 'tax'].map(doc => (
                                    <div className="field-h" key={doc}>
                                        <label>{doc.toUpperCase()} Expiry</label>
                                        <input className="fi" type="date" value={parseJson(form.docs)[doc]} onChange={e => { const d = parseJson(form.docs); d[doc] = e.target.value; setForm({ ...form, docs: JSON.stringify(d) }); }} />
                                    </div>
                                ))}
                            </div>
                            <div className="field-h" style={{ marginTop: '12px' }}><label>Fastag ID</label><input className="fi" type="text" value={form.fastag || ''} onChange={e => setForm({ ...form, fastag: e.target.value })} /></div>
                        </div>

                        <div className="fg fg-2" style={{ marginTop: '20px' }}>
                            {form.ownershipType !== 'self' && (
                                <div className="field-h">
                                    <label>Owner Name</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                        <input className="fi" type="text" value={form.ownerName} onChange={e => autofillFromOwner(e.target.value)} list="owner-list" />
                                        <datalist id="owner-list">{uniqueOwners.map(o => <option key={o} value={o} />)}</datalist>
                                    </div>
                                </div>
                            )}
                            <div className="field-h">
                                <label>Driver Name</label>
                                <select className="fi" value={form.driverName} onChange={e => { const p = profiles.find(x => x.name === e.target.value); setForm({ ...form, driverName: e.target.value, driverContact: p?.mobileNumbers?.[0] || '' }); }}>
                                    <option value="">Select Driver</option>
                                    {profiles.filter(p => p.type === 'Driver').map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {err && <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '12px', fontWeight: 600 }}>{err}</div>}
                        <div style={{ marginTop: '24px', display: 'flex', gap: '10px' }}>
                            <button type="submit" className="btn btn-p" disabled={saving} style={{ flex: 1 }}>{saving ? 'Saving...' : editId ? 'Update Vehicle' : 'Add to Fleet'}</button>
                            <button type="button" className="btn btn-g" onClick={() => setTab('list')}>Cancel</button>
                        </div>
                    </form>
                </motion.div>
            )}

            {tab === 'toll' && (
                <TollTab
                    tollRecords={tollRecords}
                    tollLoading={tollLoading}
                    tollFrom={tollFrom} setTollFrom={setTollFrom}
                    tollTo={tollTo} setTollTo={setTollTo}
                    tollForm={tollForm} setTollForm={setTollForm}
                    tollSaving={tollSaving} setTollSaving={setTollSaving}
                    tollImporting={tollImporting} setTollImporting={setTollImporting}
                    tollImportPreview={tollImportPreview} setTollImportPreview={setTollImportPreview}
                    tollSearch={tollSearch} setTollSearch={setTollSearch}
                    vehicleNumbers={uniqueTruckNos}
                    onRefresh={async (f, t) => { await fetchTolls(f, t); fetchVehicleData(); }}
                    truckBalanceMap={truckBalanceMap}
                />
            )}

            {tab === 'registry' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="card" style={{ padding: '20px', background: 'var(--bg-th)' }}>
                        <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><Truck size={18} color="var(--primary)" /> Pending Trucks</h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Trucks seen in vouchers but not yet added to the fleet. Click a card to register them.</p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '16px' }}>
                        {[...pendingFromVouchers, ...registryEntries].length === 0 && (
                            <div className="card" style={{ padding: '40px', textAlign: 'center', gridColumn: '1 / -1' }}>
                                <Info size={40} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                                <p style={{ color: 'var(--text-muted)' }}>No vehicles in registry. New vehicles from vouchers will appear here.</p>
                            </div>
                        )}
                        {[...pendingFromVouchers, ...registryEntries].map(entry => (
                            <VehicleRegistryCard 
                                key={entry.id} 
                                entry={entry} 
                                onApproved={() => { fetchRegistry(); fetchVehicleData(); }} 
                            />
                        ))}
                    </div>
                </motion.div>
            )}

            {tab === 'list' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Search bar */}
                    <div style={{ position: 'relative' }}>
                        <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input className="fi" placeholder="Search truck no, owner, driver..." value={fSearch} onChange={e => setFSearch(e.target.value)} style={{ paddingLeft: '38px', width: '100%' }} />
                    </div>

                    {/* KPI bar */}
                    {(() => {
                        const allV = owners.flatMap(o => o.vehicles);
                        const self = allV.filter(v => v.ownershipType === 'self').length;
                        const market = allV.filter(v => v.ownershipType === 'market').length;
                        const alerts = allV.filter(v => isNearExpiry(v)).length;
                        const totalBal = owners.reduce((s, o) => s + o.balance, 0);
                        return (
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                {[
                                    { label: 'Total Vehicles', value: allV.length, color: '#6366f1' },
                                    { label: 'Own Fleet', value: self, color: '#10b981' },
                                    { label: 'Market', value: market, color: '#f59e0b' },
                                    { label: 'Doc Alerts', value: alerts, color: '#f43f5e' },
                                    { label: 'Total Outstanding', value: fmtRs(totalBal), color: '#3b82f6' },
                                ].map(k => (
                                    <div key={k.label} style={{ background: 'var(--bg-card)', border: `1px solid ${k.color}22`, borderRadius: '10px', padding: '10px 16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <div style={{ fontSize: '18px', fontWeight: 900, color: k.color }}>{k.value}</div>
                                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{k.label}</div>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}

                    {/* Flat table */}
                    <div className="card" style={{ overflow: 'hidden' }}>
                        {loading ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}><Loader2 size={20} className="spin" /></div>
                        ) : owners.flatMap(o => o.vehicles).length === 0 ? (
                            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                <Truck size={40} style={{ opacity: 0.15, marginBottom: '10px' }} />
                                <div style={{ fontWeight: 700 }}>No vehicles found</div>
                                <div style={{ fontSize: '12px', marginTop: '4px' }}>Add a vehicle using the "Add Vehicle" tab</div>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-th)' }}>
                                            {['Truck No.', 'Type / Make', 'Owner', 'Driver', 'Balance', 'Docs', 'Actions'].map(h => (
                                                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {owners.flatMap(owner => owner.vehicles.map(v => {
                                            const tb = truckBalanceMap[cleanTruckNo(v.truckNo)];
                                            const vBalance = tb ? tb.outstanding : 0;
                                            const docEntries = Object.entries(parseJson(v.docs)).filter(([, d]) => d);
                                            const expiredDocs = docEntries.filter(([, d]) => checkExpiry(d) === 'expired');
                                            const nearDocs = docEntries.filter(([, d]) => checkExpiry(d) === 'near');
                                            const isSelf = v.ownershipType === 'self';
                                            return (
                                                <tr key={v.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-th)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                    {/* Truck No */}
                                                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <Truck size={14} color={isSelf ? '#10b981' : '#f59e0b'} />
                                                            <span style={{ fontWeight: 900, fontSize: '14px' }}>{v.truckNo}</span>
                                                            <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, background: isSelf ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: isSelf ? '#10b981' : '#f59e0b' }}>
                                                                {isSelf ? 'OWN' : 'MKT'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    {/* Type / Make */}
                                                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                        <div style={{ fontSize: '12px', fontWeight: 700 }}>{v.vehicleType || '—'}</div>
                                                        <div style={{ fontSize: '11px' }}>{v.make}{v.model ? ` ${v.model}` : ''}</div>
                                                    </td>
                                                    {/* Owner */}
                                                    <td style={{ padding: '12px 14px' }}>
                                                        <div style={{ fontSize: '12px', fontWeight: 700 }}>{v.ownerName || '—'}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{v.ownerContact || ''}</div>
                                                    </td>
                                                    {/* Driver */}
                                                    <td style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                                        {v.driverName || <span style={{ opacity: 0.4 }}>No Driver</span>}
                                                    </td>
                                                    {/* Balance */}
                                                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                                                        <span style={{ fontSize: '14px', fontWeight: 900, color: vBalance >= 0 ? '#10b981' : '#f43f5e' }}>{fmtRs(vBalance)}</span>
                                                        {tb?.toll > 0 && <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 700 }}>Toll: −{fmtRs(tb.toll)}</div>}
                                                    </td>
                                                    {/* Doc alerts */}
                                                    <td style={{ padding: '12px 14px' }}>
                                                        {expiredDocs.length > 0 && (
                                                            <span style={{ fontSize: '10px', background: 'rgba(244,63,94,0.1)', color: '#f43f5e', padding: '2px 7px', borderRadius: '4px', fontWeight: 700, marginRight: '4px' }}>
                                                                {expiredDocs.length} Expired
                                                            </span>
                                                        )}
                                                        {nearDocs.length > 0 && (
                                                            <span style={{ fontSize: '10px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>
                                                                {nearDocs.length} Due Soon
                                                            </span>
                                                        )}
                                                        {expiredDocs.length === 0 && nearDocs.length === 0 && docEntries.length > 0 && (
                                                            <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 700 }}>✓ OK</span>
                                                        )}
                                                        {docEntries.length === 0 && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>—</span>}
                                                    </td>
                                                    {/* Actions */}
                                                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                            <button onClick={() => handleEdit(v)} title="Edit" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700 }}><Edit3 size={11} /> Edit</button>
                                                            {isSelf && <button onClick={() => setMaintenanceTarget(v)} title="Maintenance" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700 }}><Wrench size={11} /></button>}
                                                            {isSelf && parseJson(v.emiDetails).loanNo && <button onClick={() => setEmiTrackerTarget(v)} title="EMI Schedule" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700 }}>EMI</button>}
                                                            <button onClick={() => openTyreLog(v.truckNo)} title="Tyre & Expense Log" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#10b981', fontSize: '11px', fontWeight: 700 }}>🛞</button>
                                                            <button onClick={() => setDeleteTarget(v)} title="Delete" style={{ background: 'none', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#f43f5e', display: 'flex', alignItems: 'center' }}><Trash2 size={11} /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        }))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
