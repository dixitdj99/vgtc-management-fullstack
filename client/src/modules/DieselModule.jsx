import React, { useState, useEffect, useMemo } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { Fuel, Search, Filter, Calendar, Check, X, Pencil, Droplet, ArrowRight, Save, AlertCircle, ChevronDown, ChevronUp, Printer, BookOpen, FileCheck, Banknote, Loader2 } from 'lucide-react';
import ConfirmSaveModal from '../components/ConfirmSaveModal';
import { useAuth } from '../auth/AuthContext';
import ColumnFilter from '../components/ColumnFilter';
import { columnValues } from '../components/ColumnFilter';
import TableScroll from '../components/TableScroll';

const API_V = `/vouchers`;

/**
 * @param {string[]} [types]  voucher types this Diesel Control covers — the same
 *   sheets the surrounding module's Balance Sheet shows. Passed in by App.jsx so
 *   one location's diesel never appears inside another's. Left unset it falls
 *   back to the old plant guess, which is wrong for the Bill locations.
 */
export default function DieselModule({ role = 'user', permissions = {}, types }) {
    const { plant } = useAuth();
    const [vouchers, setVouchers] = useState([]);
    const [filters, setFilters] = useState({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dieselTab, setDieselTab] = useState('records'); // records|pump_ledger|bill

    // Fuel stations are saved with type 'pump' (lowercase) by the admin
    // screens; older data may carry 'Pump'. Match case-insensitively or the
    // stations silently vanish from the dropdown and the ledger.
    const isPumpProfile = p => (p.type || '').toLowerCase() === 'pump';

    // ── Monthly pump bill ──────────────────────────────────────────────────
    // The pump's paper bill for a month is checked off entry by entry, then
    // paid in one go. A settled entry carries dieselBillPaymentId (the
    // /payments doc id), which is what keeps it out of every later bill run —
    // derived, never duplicated, like paidBalance on the freight side.
    const [billPump, setBillPump] = useState('');
    const [billMonth, setBillMonth] = useState(new Date().toISOString().slice(0, 7));
    const [billTotal, setBillTotal] = useState('');      // typed from the paper bill
    const [billPayOpen, setBillPayOpen] = useState(false);
    const [billPaying, setBillPaying] = useState(false);
    const [billPayForm, setBillPayForm] = useState({ date: new Date().toISOString().slice(0, 10), paymentMethod: 'Online', remark: '' });

    // Admin → Fuel Stations → "Monthly Bill" lands here with the pump chosen.
    // One-shot handoff via localStorage (the admin panel is a separate layout,
    // so it cannot set this module's state directly).
    useEffect(() => {
        const pump = localStorage.getItem('vgtc-diesel-bill-pump');
        if (pump) {
            localStorage.removeItem('vgtc-diesel-bill-pump');
            setBillPump(pump);
            setDieselTab('bill');
        }
    }, []);
    const [expandedPump, setExpandedPump] = useState(null);
    const [profiles, setProfiles] = useState([]);
    const [pumpPayments, setPumpPayments] = useState([]);

    // Filters
    const handleFilterChange = (key, val) => setFilters(f => ({ ...f, [key]: val }));

    // Edit state
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ advanceDiesel: '', isFullTank: false });

    useEffect(() => {
        fetchData();
        // Refetch when the location changes, not just the plant — switching
        // godown swaps which sheets this module covers.
    }, [plant, JSON.stringify(types)]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch profiles for pump list + pump payments from firm pay
            const [pRes, payRes] = await Promise.all([
                ax.get('/profiles'),
                ax.get('/payments').catch(() => ({ data: [] })),
            ]);
            setProfiles(pRes.data || []);
            setPumpPayments((payRes.data || []).filter(p => p.category === 'Pump'));

            // Only this location's sheets. The previous rule always included
            // 'Dump' whichever section you were in, so Jharli's diesel showed up
            // inside Kosli, Jhajjar and Bahadurgarh — two rows against a truck
            // the local balance sheet had once — and the three Bill types were
            // never fetched at all, so their diesel never appeared anywhere.
            const scoped = (types && types.length)
                ? types
                : (plant === 'jklakshmi' ? ['Dump', 'JK_Lakshmi'] : ['JK_Super']);
            const all = await Promise.all(scoped.map(t => ax.get(`${API_V}/${t}`)));
            const combined = all.flatMap(res => res.data)
                .filter(v => v.advanceDiesel || v.isFullTank); // Only show those with diesel advances
            
            // Sort by date desc
            combined.sort((a, b) => new Date(b.date) - new Date(a.date));
            setVouchers(combined);
        } catch (err) {
            console.error('Failed to fetch diesel records', err);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (v) => {
        setEditingId(v.id);
        setEditForm({ 
            advanceDiesel: v.advanceDiesel === 'FULL' ? '' : (v.advanceDiesel || ''), 
            isFullTank: !!v.isFullTank || v.advanceDiesel === 'FULL'
        });
    };

    const handleQuickVerify = async (v) => {
        if (v.advanceDiesel === 'FULL' || (v.isFullTank && (!v.advanceDiesel || isNaN(parseFloat(v.advanceDiesel))))) {
            alert('This voucher is marked as Full Tank. Please click the Edit/Pencil icon to enter the actual amount in Rupees before verifying.');
            return;
        }
        try {
            await ax.patch(`${API_V}/${v.id}`, { isDieselVerified: true });
            fetchData();
        } catch (err) {
            alert('Verification failed');
        }
    };

    const handleSave = async (id) => {
        // Block save if diesel is FULL tank but no actual amount has been entered
        if (editForm.isFullTank && (!editForm.advanceDiesel || isNaN(parseFloat(editForm.advanceDiesel)))) {
            alert('Please enter the actual diesel amount before saving. The value cannot be left empty when Full Tank is selected.');
            return;
        }

        setSaving(true);
        try {
            const finalValue = editForm.advanceDiesel || '0';
            
            await ax.patch(`${API_V}/${id}`, { 
                advanceDiesel: finalValue,
                isFullTank: editForm.isFullTank,
                isDieselVerified: true // Mark as verified when manually updated
            });
            setEditingId(null);
            fetchData();
        } catch (err) {
            alert('Update failed');
        } finally {
            setSaving(false);
        }
    };

    const filtered = useMemo(() => {
        let list = [...vouchers];
        
        Object.keys(filters).forEach(key => {
            const vals = filters[key];
            if (vals && vals.length > 0) {
                if (key === 'status') {
                    // Map "Verified" / "Pending" back to isDieselVerified
                    list = list.filter(v => {
                        const s = v.isDieselVerified ? 'Verified' : 'Pending';
                        return vals.includes(s);
                    });
                } else {
                    list = list.filter(v => columnValues(v, key).some(x => vals.includes(x)));
                }
            }
        });

        return list;
    }, [vouchers, filters]);

    const TH = { padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' };
    const TD = { padding: '12px 16px', fontSize: '13px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-sub)' };

    /* Pump Ledger — group by pump name */
    const pumpGroups = useMemo(() => {
        const map = {};
        // Initialize with all pump profiles
        profiles.filter(isPumpProfile).forEach(p => {
            map[p.name] = { pump: p.name, profileId: p.id, entries: [], totalVerified: 0, totalUnverified: 0, totalAmount: 0, countVerified: 0, countPending: 0, totalPaid: 0, payments: [], unbilledVerified: 0 };
        });

        vouchers.forEach(v => {
            const pump = v.pump || 'Unknown Pump';
            if (!map[pump]) map[pump] = { pump, profileId: null, entries: [], totalVerified: 0, totalUnverified: 0, totalAmount: 0, countVerified: 0, countPending: 0, totalPaid: 0, payments: [], unbilledVerified: 0 };
            map[pump].entries.push(v);
            const amt = v.advanceDiesel === 'FULL' ? 0 : (parseFloat(v.advanceDiesel) || 0);
            map[pump].totalAmount += amt;
            if (v.isDieselVerified) {
                map[pump].totalVerified += amt;
                map[pump].countVerified++;
                // Verified but not yet settled by a monthly bill payment — what
                // the Monthly Bill tab would pay this pump today.
                if (!v.dieselBillPaymentId) map[pump].unbilledVerified += amt;
            } else {
                map[pump].totalUnverified += amt;
                map[pump].countPending++;
            }
        });

        // Add pump payments from firm pay
        pumpPayments.forEach(pay => {
            const pumpName = pay.profileName || profiles.find(p => p.id === pay.profileId)?.name;
            if (pumpName && map[pumpName]) {
                map[pumpName].totalPaid += parseFloat(pay.amount) || 0;
                map[pumpName].payments.push(pay);
            } else if (pumpName) {
                // Pump profile exists in payments but not in vouchers
                map[pumpName] = { pump: pumpName, profileId: pay.profileId, entries: [], totalVerified: 0, totalUnverified: 0, totalAmount: 0, countVerified: 0, countPending: 0, totalPaid: parseFloat(pay.amount) || 0, payments: [pay], unbilledVerified: 0 };
            }
        });

        return Object.values(map).sort((a, b) => b.totalAmount - a.totalAmount);
    }, [vouchers, profiles, pumpPayments]);

    const fmtRs = n => 'Rs.' + Math.round(n).toLocaleString('en-IN');
    const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    // ── Monthly bill derivations ───────────────────────────────────────────
    const amtOf = v => v.advanceDiesel === 'FULL' ? 0 : (parseFloat(v.advanceDiesel) || 0);

    /** Pumps to bill against: profiles plus any name found on vouchers. */
    const billPumpOptions = useMemo(() => {
        const names = new Set(profiles.filter(isPumpProfile).map(p => p.name));
        vouchers.forEach(v => { if (v.pump && v.pump !== 'None') names.add(v.pump); });
        return [...names].sort();
    }, [profiles, vouchers]);

    /**
     * The bill run: this pump's entries not yet settled by a pump payment, up
     * to the end of the chosen month. Older unpaid entries roll forward into
     * the current run (flagged in the UI) instead of falling out of sight —
     * a disputed line waits, it does not disappear.
     */
    const billEntries = useMemo(() => {
        if (!billPump || !billMonth) return [];
        const monthEnd = `${billMonth}-31`;
        return vouchers
            .filter(v => (v.pump || '') === billPump)
            .filter(v => !v.dieselBillPaymentId)
            .filter(v => (v.date || '').slice(0, 10) <= monthEnd)
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    }, [vouchers, billPump, billMonth]);

    /**
     * Entries a recorded pump payment already covers but whose settled marker
     * failed to write (crash mid-loop, network drop). They must never be paid
     * again — they are offered a one-click re-mark instead, recovered from the
     * payment's own meta.voucherIds.
     */
    const paidButUnmarked = useMemo(() => {
        const covered = new Map(); // voucherId -> paymentId
        pumpPayments.forEach(p => (p.meta?.voucherIds || []).forEach(vid => covered.set(vid, p.id)));
        const m = new Map();
        billEntries.forEach(v => { if (covered.has(v.id)) m.set(v.id, covered.get(v.id)); });
        return m;
    }, [billEntries, pumpPayments]);

    const billVerified = useMemo(
        () => billEntries.filter(v => v.isDieselVerified && !paidButUnmarked.has(v.id)),
        [billEntries, paidButUnmarked],
    );
    const billVerifiedTotal = useMemo(() => billVerified.reduce((s, v) => s + amtOf(v), 0), [billVerified]);
    const billDiff = billTotal === '' ? null : (parseFloat(billTotal) || 0) - billVerifiedTotal;

    const remarkSettled = async (v) => {
        const paymentId = paidButUnmarked.get(v.id);
        if (!paymentId) return;
        try {
            await ax.patch(`${API_V}/${v.id}`, { dieselBillPaymentId: paymentId, dieselBillPaidAt: new Date().toISOString().slice(0, 10) });
            fetchData();
        } catch { alert('Could not mark settled — try again.'); }
    };

    /**
     * Pay the pump the verified total and settle those entries.
     * Payment FIRST, markers second: an unmarked payment is visible in the
     * ledger and recoverable, but a marker without a payment would hide diesel
     * from every future bill. Failed markers are reported by LR so the clerk
     * can re-run — re-marking with the same payment id is harmless.
     */
    const executeBillPay = async () => {
        if (!billVerified.length || billPaying) return;
        setBillPaying(true);
        try {
            const pumpProfile = profiles.find(p => isPumpProfile(p) && p.name === billPump);
            const { data: payment } = await ax.post('/payments', {
                profileId: pumpProfile?.id || null,
                profileName: billPump,
                otherProfileName: pumpProfile ? '' : billPump,
                category: 'Pump',
                amount: billVerifiedTotal,
                date: billPayForm.date,
                paymentMethod: billPayForm.paymentMethod,
                remark: billPayForm.remark || `Diesel bill ${billMonth} — ${billPump}`,
                meta: { billMonth, voucherIds: billVerified.map(v => v.id) },
            });

            const failed = [];
            for (const v of billVerified) {
                try {
                    await ax.patch(`${API_V}/${v.id}`, {
                        dieselBillPaymentId: payment.id,
                        dieselBillPaidAt: billPayForm.date,
                    });
                } catch { failed.push(v.lrNo || v.id); }
            }

            setBillPayOpen(false);
            setBillTotal('');
            await fetchData();
            const pRes = await ax.get('/payments').catch(() => ({ data: [] }));
            setPumpPayments((pRes.data || []).filter(p => p.category === 'Pump'));

            if (failed.length) {
                alert(`Payment recorded (${fmtRs(billVerifiedTotal)}), but these entries could not be marked settled: LR ${failed.join(', ')}.\n\nThey now show a "Mark settled" button in the bill list — they will NOT be counted in a new payment.`);
            }
        } catch (err) {
            alert('Payment failed: ' + (err.response?.data?.error || err.message));
        } finally { setBillPaying(false); }
    };

    return (
        <div className="page-container">
            <div className="page-hd">
                <div>
                    <h1><Droplet size={20} color="#3b82f6" /> Diesel Management</h1>
                    <p>Reconcile and update fuel records manually</p>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-card)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <button
                            onClick={() => setDieselTab('records')}
                            style={{
                                padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s',
                                background: dieselTab === 'records' ? '#3b82f6' : 'transparent',
                                color: dieselTab === 'records' ? '#fff' : 'var(--text-muted)'
                            }}>
                            <Droplet size={13} /> Records
                        </button>
                        <button
                            onClick={() => setDieselTab('pump_ledger')}
                            style={{
                                padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s',
                                background: dieselTab === 'pump_ledger' ? '#3b82f6' : 'transparent',
                                color: dieselTab === 'pump_ledger' ? '#fff' : 'var(--text-muted)'
                            }}>
                            <BookOpen size={13} /> Pump Ledger
                        </button>
                        <button
                            onClick={() => setDieselTab('bill')}
                            style={{
                                padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s',
                                background: dieselTab === 'bill' ? '#3b82f6' : 'transparent',
                                color: dieselTab === 'bill' ? '#fff' : 'var(--text-muted)'
                            }}>
                            <FileCheck size={13} /> Monthly Bill
                        </button>
                    </div>
                </div>
            </div>

            {dieselTab === 'records' && (<>
            {/* Active Filters Summary */}
            {Object.keys(filters).some(k => filters[k].length > 0) && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase' }}>Active Filters:</span>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {Object.keys(filters).map(k => filters[k].length > 0 && (
                                <span key={k} className="badge badge-tag">{k}: {filters[k].length}</span>
                            ))}
                        </div>
                        <button className="btn btn-sm btn-g" style={{ marginLeft: 'auto' }} onClick={() => setFilters({ status: ['Pending'] })}>Reset to Pending</button>
                        <button className="btn btn-sm btn-d" onClick={() => setFilters({})}>Clear All</button>
                    </div>
                </div>
            )}

            {/* List */}
            <div className="card">
                <div className="card-header" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="card-title-block">
                        <div className="card-icon ci-blue"><Droplet size={17} /></div>
                        <div className="card-title-text">
                            <h3>Fuel Advance Records</h3>
                            <p>{filtered.filter(v => !v.isDieselVerified).length} pending, {filtered.filter(v => v.isDieselVerified).length} verified</p>
                        </div>
                    </div>
                </div>
                <TableScroll>
                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading records...</div>
                    ) : (
                        <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-th)' }}>
                                    <th style={TH}><ColumnFilter label="Date" colKey="date" data={vouchers} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                                    <th style={TH}><ColumnFilter label="Truck No." colKey="truckNo" data={vouchers} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                                    <th style={TH}><ColumnFilter label="Pump Name" colKey="pump" data={vouchers} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                                    <th style={TH}><ColumnFilter label="Status" colKey="status" data={vouchers.map(v => ({ ...v, status: v.isDieselVerified ? 'Verified' : 'Pending' }))} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                                    <th style={TH}>Details</th>
                                    {role === 'admin' && <th style={TH}>Created By</th>}
                                    {role === 'admin' && <th style={TH}>Updated By</th>}
                                    <th style={{ ...TH, textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No records matching filters</td></tr>
                                ) : (
                                    filtered.map(v => (
                                        <tr key={v.id} style={{ transition: 'background 0.2s', opacity: v.isDieselVerified ? 0.75 : 1 }}>
                                            <td style={TD}>{v.date}</td>
                                            <td style={{ ...TD, fontWeight: 700 }}>{v.truckNo}</td>
                                            <td style={TD}>{v.pump}</td>
                                            <td style={TD}>
                                                {v.isDieselVerified ? (
                                                    <span className="badge badge-success" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>Verified</span>
                                                ) : (
                                                    <span className="badge badge-tag" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>Pending</span>
                                                )}
                                            </td>
                                            <td style={TD}>
                                                {editingId === v.id ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <input 
                                                            type="text" 
                                                            className="fi" 
                                                            style={{ width: '100px', height: '32px' }}
                                                            placeholder="Actual Rs."
                                                            value={editForm.advanceDiesel}
                                                            onChange={e => setEditForm(f => ({ ...f, advanceDiesel: e.target.value }))}
                                                        />
                                                        <button 
                                                            className={`btn btn-sm ${editForm.isFullTank ? 'btn-p' : 'btn-g'}`}
                                                            style={{ fontSize: '10px', height: '32px' }}
                                                            onClick={() => setEditForm(f => ({ ...f, isFullTank: !f.isFullTank }))}
                                                        >
                                                            {editForm.isFullTank ? 'Full ✓' : 'Full?'}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontWeight: 800, color: 'var(--text)' }}>
                                                            {v.advanceDiesel === 'FULL' ? 'PENDING COST' : (v.advanceDiesel || '0')}
                                                        </span>
                                                        {v.isFullTank && <span title="Full Tank" style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '9px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '1px 4px', borderRadius: '4px', fontWeight: 700 }}>
                                                            <Droplet size={10} /> FULL
                                                        </span>}
                                                    </div>
                                                )}
                                            </td>
                                            {role === 'admin' && <td style={TD}>{v.createdBy || '—'}</td>}
                                            {role === 'admin' && <td style={TD}>{v.updatedBy || '—'}</td>}
                                            <td style={{ ...TD, textAlign: 'center' }}>
                                                {editingId === v.id ? (
                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                        <button className="btn btn-p btn-icon btn-sm" title="Save & Verify" onClick={() => handleSave(v.id)} disabled={saving || !(role === 'admin' || permissions?.diesel === 'edit')}><Save size={14} /></button>
                                                        <button className="btn btn-g btn-icon btn-sm" onClick={() => setEditingId(null)} disabled={saving}><X size={14} /></button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                        {!v.isDieselVerified && (role === 'admin' || permissions?.diesel === 'edit') && (
                                                            <button 
                                                                className="btn btn-p btn-icon btn-sm" 
                                                                title="Quick Verify" 
                                                                style={{ background: '#10b981', borderColor: '#10b981' }}
                                                                onClick={() => handleQuickVerify(v)}
                                                            >
                                                                <Check size={14} />
                                                            </button>
                                                        )}
                                                        {(role === 'admin' || permissions?.diesel === 'edit') && (
                                                            <button className="btn btn-g btn-icon btn-sm" title="Reconcile Details" onClick={() => handleEdit(v)}><Pencil size={14} /></button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </TableScroll>
            </div>
            </>)}

            {/* ── PUMP LEDGER TAB ── */}
            {dieselTab === 'pump_ledger' && (
                <div>
                    {/* Summary Cards */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        {[
                            { label: 'Total All Pumps', val: fmtRs(pumpGroups.reduce((s, p) => s + p.totalAmount, 0)), color: '#3b82f6' },
                            { label: 'Total Verified', val: fmtRs(pumpGroups.reduce((s, p) => s + p.totalVerified, 0)), color: '#10b981' },
                            { label: 'Total Unverified', val: fmtRs(pumpGroups.reduce((s, p) => s + p.totalUnverified, 0)), color: '#f59e0b' },
                            { label: 'Pending Entries', val: pumpGroups.reduce((s, p) => s + p.countPending, 0), color: '#f43f5e' },
                        ].map(({ label, val, color }) => (
                            <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '160px' }}>
                                <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                                <span style={{ fontSize: '20px', fontWeight: 900, color, lineHeight: 1 }}>{val}</span>
                            </div>
                        ))}
                    </div>

                    {/* Pump-wise Breakdown */}
                    {pumpGroups.map(pg => (
                        <div key={pg.pump} className="card" style={{ marginBottom: '12px' }}>
                            <div
                                className="card-header"
                                style={{ cursor: 'pointer', borderBottom: expandedPump === pg.pump ? '1px solid var(--border)' : 'none' }}
                                onClick={() => setExpandedPump(expandedPump === pg.pump ? null : pg.pump)}
                            >
                                <div className="card-title-block">
                                    <div className="card-icon" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}><Fuel size={17} /></div>
                                    <div className="card-title-text">
                                        <h3>{pg.pump}</h3>
                                        <p>{pg.entries.length} entries · {pg.countVerified} verified, {pg.countPending} pending</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Due</div>
                                        <div style={{ fontSize: '18px', fontWeight: 900, color: '#3b82f6' }}>{fmtRs(pg.totalAmount)}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <div style={{ textAlign: 'center', padding: '4px 10px', borderRadius: '6px', background: 'rgba(16,185,129,0.1)' }}>
                                            <div style={{ fontSize: '8px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>Verified</div>
                                            <div style={{ fontSize: '13px', fontWeight: 900, color: '#10b981' }}>{fmtRs(pg.totalVerified)}</div>
                                        </div>
                                        <div style={{ textAlign: 'center', padding: '4px 10px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)' }}>
                                            <div style={{ fontSize: '8px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>Unverified</div>
                                            <div style={{ fontSize: '13px', fontWeight: 900, color: '#f59e0b' }}>{fmtRs(pg.totalUnverified)}</div>
                                        </div>
                                        {pg.totalPaid > 0 && <div style={{ textAlign: 'center', padding: '4px 10px', borderRadius: '6px', background: 'rgba(99,102,241,0.1)' }}>
                                            <div style={{ fontSize: '8px', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase' }}>Paid</div>
                                            <div style={{ fontSize: '13px', fontWeight: 900, color: '#6366f1' }}>{fmtRs(pg.totalPaid)}</div>
                                        </div>}
                                        {/* Verified but not settled by a monthly bill yet — what the
                                            Monthly Bill tab would pay this pump right now. */}
                                        {pg.unbilledVerified > 0 && <div style={{ textAlign: 'center', padding: '4px 10px', borderRadius: '6px', background: 'rgba(59,130,246,0.1)' }}>
                                            <div style={{ fontSize: '8px', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase' }}>Bill Pending</div>
                                            <div style={{ fontSize: '13px', fontWeight: 900, color: '#3b82f6' }}>{fmtRs(pg.unbilledVerified)}</div>
                                        </div>}
                                        {(pg.totalAmount - pg.totalPaid) > 0 && <div style={{ textAlign: 'center', padding: '4px 10px', borderRadius: '6px', background: 'rgba(244,63,94,0.1)' }}>
                                            <div style={{ fontSize: '8px', fontWeight: 700, color: '#f43f5e', textTransform: 'uppercase' }}>Balance</div>
                                            <div style={{ fontSize: '13px', fontWeight: 900, color: '#f43f5e' }}>{fmtRs(pg.totalAmount - pg.totalPaid)}</div>
                                        </div>}
                                    </div>
                                    {expandedPump === pg.pump ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                                </div>
                            </div>

                            <AnimatePresence>
                                {expandedPump === pg.pump && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                                        <TableScroll>
                                            <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ background: 'var(--bg-th)' }}>
                                                        <th style={TH}>#</th>
                                                        <th style={TH}>Date</th>
                                                        <th style={TH}>Truck No.</th>
                                                        <th style={TH}>LR No.</th>
                                                        <th style={TH}>Amount</th>
                                                        <th style={TH}>Full Tank</th>
                                                        <th style={TH}>Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {pg.entries.sort((a, b) => new Date(b.date) - new Date(a.date)).map((v, i) => (
                                                        <tr key={v.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                                                            <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                                                            <td style={TD}>{fmtDate(v.date)}</td>
                                                            <td style={{ ...TD, fontWeight: 800 }}>{v.truckNo || '—'}</td>
                                                            <td style={{ ...TD, fontWeight: 700, color: 'var(--primary)' }}>#{v.lrNo || '—'}</td>
                                                            <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>
                                                                {v.advanceDiesel === 'FULL' ? 'PENDING COST' : fmtRs(parseFloat(v.advanceDiesel) || 0)}
                                                            </td>
                                                            <td style={TD}>
                                                                {v.isFullTank
                                                                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}><Droplet size={10} /> FULL</span>
                                                                    : <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
                                                                }
                                                            </td>
                                                            <td style={TD}>
                                                                {v.isDieselVerified
                                                                    ? <span className="badge badge-success" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>Verified</span>
                                                                    : <span className="badge badge-tag" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>Pending</span>
                                                                }
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr style={{ background: 'var(--bg-tf)' }}>
                                                        <td colSpan={4} style={{ ...TD, fontWeight: 800, borderTop: '2px solid var(--border)', fontSize: '10px', textTransform: 'uppercase' }}>Sub-Total ({pg.entries.length} entries)</td>
                                                        <td style={{ ...TD, textAlign: 'right', fontWeight: 900, borderTop: '2px solid var(--border)', color: '#3b82f6', fontSize: '14px' }}>{fmtRs(pg.totalAmount)}</td>
                                                        <td colSpan={2} style={{ ...TD, borderTop: '2px solid var(--border)' }}></td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </TableScroll>
                                        {/* Pump Payments from Firm Pay */}
                                        {pg.payments.length > 0 && (
                                            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.06em' }}>Payments Made</div>
                                                {pg.payments.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((pay, i) => (
                                                    <div key={pay.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < pg.payments.length - 1 ? '1px solid var(--border-row)' : 'none', fontSize: '12px' }}>
                                                        <div>
                                                            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{fmtDate(pay.date)}</span>
                                                            {pay.remark && <span style={{ marginLeft: '8px', color: 'var(--text-sub)' }}>{pay.remark}</span>}
                                                        </div>
                                                        <span style={{ fontWeight: 800, color: '#6366f1' }}>{fmtRs(parseFloat(pay.amount) || 0)}</span>
                                                    </div>
                                                ))}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '2px solid var(--border)', fontSize: '12px' }}>
                                                    <span style={{ fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '10px' }}>Balance Due</span>
                                                    <span style={{ fontWeight: 900, fontSize: '14px', color: (pg.totalAmount - pg.totalPaid) > 0 ? '#f43f5e' : '#10b981' }}>{fmtRs(Math.max(0, pg.totalAmount - pg.totalPaid))}</span>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}

                    {pumpGroups.length === 0 && (
                        <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>No diesel records found</div>
                    )}
                </div>
            )}

            {/* ── Monthly Bill — check the pump's bill off entry by entry, then pay it ── */}
            {dieselTab === 'bill' && (
                <div>
                    {/* Scope + tally */}
                    <div className="card" style={{ padding: '14px 18px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <select className="fi" style={{ width: '220px' }} value={billPump} onChange={e => { setBillPump(e.target.value); setBillTotal(''); }}>
                            <option value="">— Select pump —</option>
                            {billPumpOptions.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <input type="month" className="fi" style={{ width: '150px' }} value={billMonth} onChange={e => setBillMonth(e.target.value)} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Bill total</span>
                            <input type="number" className="fi" style={{ width: '130px' }} placeholder="from bill" value={billTotal} onChange={e => setBillTotal(e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }} />
                        {billPump && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' }}>Verified: <b style={{ color: '#10b981' }}>{fmtRs(billVerifiedTotal)}</b> ({billVerified.length}/{billEntries.length})</span>
                                {billDiff !== null && (
                                    <span style={{ fontSize: '12.5px', fontWeight: 800, color: Math.abs(billDiff) < 1 ? '#10b981' : '#f43f5e' }}>
                                        {Math.abs(billDiff) < 1 ? '✓ Matches the bill' : `${billDiff > 0 ? 'Bill is' : 'Books are'} ${fmtRs(Math.abs(billDiff))} higher`}
                                    </span>
                                )}
                                <button className="btn btn-p btn-sm" disabled={!billVerified.length}
                                    onClick={() => { setBillPayForm(f => ({ ...f, remark: `Diesel bill ${billMonth} — ${billPump}` })); setBillPayOpen(true); }}>
                                    <Banknote size={13} /> Pay {fmtRs(billVerifiedTotal)} · {billVerified.length} entries
                                </button>
                            </div>
                        )}
                    </div>

                    {!billPump ? (
                        <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            Pick a pump and the month of its bill. Every unpaid diesel entry up to that month appears here for checking off.
                        </div>
                    ) : billEntries.length === 0 ? (
                        <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            Nothing unpaid for {billPump} up to {billMonth}. All settled.
                        </div>
                    ) : (
                        <div className="card" style={{ overflow: 'hidden' }}>
                            <TableScroll>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead><tr>
                                        <th style={TH}>Date</th>
                                        <th style={TH}>Truck</th>
                                        <th style={TH}>LR</th>
                                        <th style={{ ...TH, textAlign: 'right' }}>Our Amount</th>
                                        <th style={{ ...TH, textAlign: 'center' }}>Status</th>
                                        <th style={{ ...TH, textAlign: 'center' }}>Check off</th>
                                    </tr></thead>
                                    <tbody>
                                        {billEntries.map(v => {
                                            const isFull = v.advanceDiesel === 'FULL' || (v.isFullTank && isNaN(parseFloat(v.advanceDiesel)));
                                            const rolled = (v.date || '').slice(0, 7) < billMonth;
                                            const awaitingMark = paidButUnmarked.has(v.id);
                                            return (
                                                <tr key={v.id} style={{ opacity: v.isDieselVerified && !awaitingMark ? 0.85 : 1 }}>
                                                    <td style={TD}>
                                                        {fmtDate(v.date)}
                                                        {rolled && <span style={{ marginLeft: '6px', padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 800, background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>FROM {(v.date || '').slice(0, 7)}</span>}
                                                    </td>
                                                    <td style={{ ...TD, fontWeight: 700 }}>{v.truckNo}</td>
                                                    <td style={{ ...TD, fontWeight: 800, color: 'var(--primary)' }}>#{v.lrNo}</td>
                                                    <td style={{ ...TD, textAlign: 'right', fontWeight: 800 }}>
                                                        {editingId === v.id ? (
                                                            <input type="number" className="fi" autoFocus style={{ width: '110px', height: '30px', textAlign: 'right' }}
                                                                value={editForm.advanceDiesel}
                                                                onChange={e => setEditForm(f => ({ ...f, advanceDiesel: e.target.value }))}
                                                                onKeyDown={e => { if (e.key === 'Enter') handleSave(v.id); if (e.key === 'Escape') setEditingId(null); }} />
                                                        ) : isFull ? (
                                                            <span style={{ color: '#f43f5e', fontWeight: 900 }}>FULL — enter cost</span>
                                                        ) : fmtRs(amtOf(v))}
                                                    </td>
                                                    <td style={{ ...TD, textAlign: 'center' }}>
                                                        {awaitingMark
                                                            ? <span className="badge badge-tag" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>Paid — settle pending</span>
                                                            : v.isDieselVerified
                                                                ? <span className="badge badge-tag" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>Verified</span>
                                                                : <span className="badge badge-tag" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>Pending</span>}
                                                    </td>
                                                    <td style={{ ...TD, textAlign: 'center' }}>
                                                        {awaitingMark ? (
                                                            // Money already went out for this one in an earlier
                                                            // payment whose marker write failed — never re-pay it.
                                                            <button className="btn btn-p btn-sm" onClick={() => remarkSettled(v)}>Mark settled</button>
                                                        ) : editingId === v.id ? (
                                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                                <button className="btn btn-p btn-sm" disabled={saving} onClick={() => handleSave(v.id)}>{saving ? '…' : 'Save'}</button>
                                                                <button className="btn btn-g btn-sm" onClick={() => setEditingId(null)}><X size={12} /></button>
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                                {!v.isDieselVerified && !isFull && (
                                                                    <button className="btn btn-g btn-sm" title="Amount matches the bill" onClick={() => handleQuickVerify(v)}><Check size={12} /> Matches</button>
                                                                )}
                                                                <button className="btn btn-g btn-sm" title={isFull ? 'Enter the actual cost from the bill' : 'Correct the amount to what the bill says'} onClick={() => handleEdit(v)}>
                                                                    <Pencil size={12} /> {isFull ? 'Enter cost' : 'Correct'}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ background: 'var(--bg-tf)' }}>
                                            <td colSpan={3} style={{ ...TD, fontWeight: 800, borderTop: '2px solid var(--border)', fontSize: '10px', textTransform: 'uppercase' }}>Verified total ({billVerified.length} of {billEntries.length})</td>
                                            <td style={{ ...TD, textAlign: 'right', fontWeight: 900, borderTop: '2px solid var(--border)', color: '#10b981', fontSize: '14px' }}>{fmtRs(billVerifiedTotal)}</td>
                                            <td colSpan={2} style={{ ...TD, borderTop: '2px solid var(--border)' }}></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </TableScroll>
                        </div>
                    )}

                    {/* Pay confirmation */}
                    {billPayOpen && (
                        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }} onClick={() => !billPaying && setBillPayOpen(false)}>
                            <div onClick={e => e.stopPropagation()} style={{ width: '94%', maxWidth: '400px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', padding: '24px' }}>
                                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Pay {billPump}</div>
                                <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                                    {billVerified.length} verified entr{billVerified.length === 1 ? 'y' : 'ies'} · <b style={{ color: '#10b981' }}>{fmtRs(billVerifiedTotal)}</b>
                                    {billEntries.length > billVerified.length && <> — {billEntries.length - billVerified.length} unverified entr{billEntries.length - billVerified.length === 1 ? 'y stays' : 'ies stay'} open for the next bill</>}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
                                    <div className="field-h"><label>Payment date</label>
                                        <input type="date" className="fi" value={billPayForm.date} onChange={e => setBillPayForm(f => ({ ...f, date: e.target.value }))} /></div>
                                    <div className="field-h"><label>Method</label>
                                        <select className="fi" value={billPayForm.paymentMethod} onChange={e => setBillPayForm(f => ({ ...f, paymentMethod: e.target.value }))}>
                                            <option>Online</option><option>Cash</option><option>Cheque</option>
                                        </select></div>
                                    <div className="field-h"><label>Remark</label>
                                        <input type="text" className="fi" value={billPayForm.remark} onChange={e => setBillPayForm(f => ({ ...f, remark: e.target.value }))} /></div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                    <button className="btn btn-g" disabled={billPaying} onClick={() => setBillPayOpen(false)}>Cancel</button>
                                    <button className="btn btn-p" disabled={billPaying} onClick={executeBillPay}>
                                        {billPaying ? <Loader2 size={14} className="spin" /> : <Banknote size={14} />} {billPaying ? 'Paying…' : `Pay ${fmtRs(billVerifiedTotal)}`}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

