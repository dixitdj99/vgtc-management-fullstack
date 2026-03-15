import React, { useState, useEffect, useMemo } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Search, MapPin, Fuel, CreditCard, Wallet, Pencil, Trash2, Printer, Check, X, AlertTriangle, Plus, Filter, ChevronDown, ChevronUp, Download, Droplet, ArrowRight, Printer as PrinterIcon } from 'lucide-react';
import ConfirmSaveModal from '../components/ConfirmSaveModal';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';

const API_V = `/vouchers`;
const API_LR = `/lr`;
const PUMPS = ['S.K Pump', 'Shiva Pump', 'Karoli'];
const TYPES = ['Dump', 'JK_Lakshmi', 'JK_Super'];

const getCalc = (w, r, hasComm) => {
    const wt = parseFloat(w) || 0, rt = parseFloat(r) || 0;
    const munshi = wt > 0 ? (wt < 15 ? 50 : 100) : 0;
    const commission = hasComm ? wt * 20 : 0;
    return { munshi, commission, total: rt * wt };
};

/* ── Print ── */
function printVoucher(v) {
    const calc = getCalc(v.weight, v.rate, v.hasCommission);
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Voucher #${v.lrNo}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;padding:10mm}
.slip{width:160mm;margin:0 auto;border:2px solid #000;padding:10mm}
h1{font-size:17px;text-align:center;font-weight:900;letter-spacing:2px}
.sub{text-align:center;font-size:10px;color:#555;margin:2px 0 8px}
.div{border-top:1px dashed #000;margin:7px 0}
.row{display:flex;justify-content:space-between;margin-bottom:5px;font-size:12px}
.lbl{font-weight:bold}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0}
.cell{padding:5px 8px;border:1px solid #ccc;border-radius:4px}
.cell-lbl{font-size:9px;font-weight:bold;color:#666;text-transform:uppercase;margin-bottom:2px}
.cell-val{font-size:13px;font-weight:bold}
.total{display:flex;justify-content:space-between;padding:8px 10px;background:#f5f5f5;border:2px solid #000;border-radius:4px;margin-top:8px;font-size:14px;font-weight:900}
.sig{display:flex;justify-content:space-between;margin-top:18px;font-size:11px}
.sl{border-top:1px solid #000;padding-top:4px;min-width:100px;text-align:center}
@media print{body{padding:0}}</style></head>
<body><div class="slip">
<h1>VIKAS GOODS TRANSPORT</h1>
<div class="sub">${v.type ? v.type.replace('_', ' ') : 'Dump'} Voucher</div>
<div class="div"></div>
<div class="row"><span><span class="lbl">LR No.:</span> #${v.lrNo}</span><span><span class="lbl">Date:</span> ${v.date}</span></div>
<div class="row"><span><span class="lbl">Truck:</span> ${v.truckNo}</span><span><span class="lbl">Destination:</span> ${v.destination || '—'}</span></div>
<div class="div"></div>
<div class="grid">
<div class="cell"><div class="cell-lbl">Weight</div><div class="cell-val">${v.weight} MT</div></div>
<div class="cell"><div class="cell-lbl">Bags</div><div class="cell-val">${v.bags}</div></div>
<div class="cell"><div class="cell-lbl">Rate</div><div class="cell-val">Rs.${v.rate}/MT</div></div>
<div class="cell"><div class="cell-lbl">Pump</div><div class="cell-val">${v.pump || '—'}</div></div>
<div class="cell"><div class="cell-lbl">Diesel Adv.</div><div class="cell-val">${v.advanceDiesel || '0'}</div></div>
<div class="cell"><div class="cell-lbl">Cash Adv.</div><div class="cell-val">Rs.${v.advanceCash || 0}</div></div>
${v.advanceOnline ? '<div class="cell"><div class="cell-lbl">Online Adv.</div><div class="cell-val">Rs.' + v.advanceOnline + '</div></div>' : ''}
${v.munshi ? '<div class="cell"><div class="cell-lbl">Munshi</div><div class="cell-val">Rs.' + v.munshi + '</div></div>' : ''}
${v.commission ? '<div class="cell"><div class="cell-lbl">Commission</div><div class="cell-val">Rs.' + v.commission + '</div></div>' : ''}
</div>
<div class="total"><span>GROSS TOTAL</span><span>Rs.${Math.round((parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0)).toLocaleString()}</span></div>
<div class="div"></div>
<div class="sig"><div class="sl">Driver</div><div class="sl">Accountant</div><div class="sl">Authorised</div></div>
</div>
<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
</body></html>`;
    const win = window.open('', '_blank', 'width=680,height=560');
    win.document.write(html); win.document.close();
}

/* ── Edit Modal ── */
function EditModal({ v, onClose, onSave }) {
    const [form, setForm] = useState({
        lrNo: v.lrNo, date: v.date, truckNo: v.truckNo, destination: v.destination || '',
        weight: v.weight, bags: v.bags, rate: v.rate, pump: v.pump || PUMPS[0],
        advanceDiesel: v.advanceDiesel || '', advanceCash: v.advanceCash || '',
        advanceOnline: v.advanceOnline || '', hasCommission: !!v.hasCommission,
    });
    const [saving, setSaving] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const S = (k, val) => setForm(f => ({ ...f, [k]: val }));

    const executeSave = async () => {
        setSaving(true); setIsConfirming(false);
        const calc = getCalc(form.weight, form.rate, form.hasCommission);
        try {
            await ax.patch(API_V + '/' + v.id, { ...form, ...calc });
            onSave();
        } catch { alert('Update failed'); } finally { setSaving(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ width: '560px', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.55)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={16} color="#10b981" /></div>
                        <div><div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>Edit Voucher</div><div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '2px' }}>LR #{v.lrNo}</div></div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex' }}><X size={18} /></button>
                </div>
                <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="fg fg-2">
                        <div className="field"><label>LR No.</label><input className="fi" type="number" value={form.lrNo} onChange={e => S('lrNo', e.target.value)} /></div>
                        <div className="field"><label>Date</label><input className="fi" type="date" value={form.date} onChange={e => S('date', e.target.value)} /></div>
                        <div className="field"><label>Truck No.</label><input className="fi" type="text" value={form.truckNo} onChange={e => S('truckNo', e.target.value.toUpperCase())} /></div>
                        <div className="field"><label>Destination</label><input className="fi" type="text" value={form.destination} onChange={e => S('destination', e.target.value)} /></div>
                    </div>
                    <hr className="sep" style={{ margin: '2px 0' }} />
                    <div className="fg fg-3">
                        <div className="field"><label>Weight (MT)</label><input className="fi" type="number" step="0.01" value={form.weight} onChange={e => S('weight', e.target.value)} /></div>
                        <div className="field"><label>Bags</label><input className="fi" type="number" value={form.bags} onChange={e => S('bags', e.target.value)} /></div>
                        <div className="field"><label>Rate (Rs/MT)</label><input className="fi" type="number" value={form.rate} onChange={e => S('rate', e.target.value)} /></div>
                    </div>
                    <div className="fg fg-3">
                        <div className="field"><label>Diesel Advance</label><input className="fi" type="text" value={form.advanceDiesel} onChange={e => S('advanceDiesel', e.target.value)} /></div>
                        <div className="field"><label>Cash Advance</label><input className="fi" type="number" value={form.advanceCash} onChange={e => S('advanceCash', e.target.value)} /></div>
                        <div className="field"><label>Online Advance</label><input className="fi" type="number" value={form.advanceOnline} onChange={e => S('advanceOnline', e.target.value)} /></div>
                    </div>
                    <div className="field"><label>Petrol Pump</label>
                        <select className="fi" value={form.pump} onChange={e => S('pump', e.target.value)}>
                            {PUMPS.map(p => <option key={p}>{p}</option>)}
                        </select>
                    </div>
                    <div className="chk-row">
                        <input type="checkbox" id="ec" checked={form.hasCommission} onChange={e => S('hasCommission', e.target.checked)} />
                        <label htmlFor="ec">Commission — Rs.20/MT</label>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', padding: '14px 22px', borderTop: '1px solid var(--border)', justifyContent: 'flex-end' }}>
                    <button className="btn btn-g" onClick={onClose} disabled={saving}>Cancel</button>
                    <button className="btn btn-p" onClick={() => setIsConfirming(true)} disabled={saving}>{saving ? 'Saving...' : <><Check size={14} /> Save Changes</>}</button>
                </div>
            </motion.div>
            <ConfirmSaveModal
                isOpen={isConfirming}
                onClose={() => setIsConfirming(false)}
                onConfirm={executeSave}
                title="Save Voucher Changes"
                message="Are you sure you want to save changes to this voucher?"
                isSaving={saving}
            />
        </div>
    );
}

/* ── Delete Confirm ── */
function DeleteConfirm({ v, onClose, onConfirm }) {
    const [deleting, setDeleting] = useState(false);
    const go = async () => {
        setDeleting(true);
        try { await ax.delete(API_V + '/' + v.id); onConfirm(); }
        catch { alert('Delete failed'); } finally { setDeleting(false); }
    };
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
            <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                style={{ width: '360px', background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', padding: '28px 24px', textAlign: 'center' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><AlertTriangle size={26} color="#f43f5e" /></div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>Delete Voucher?</div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-sub)', marginBottom: '6px' }}>LR <strong style={{ color: 'var(--text)' }}>#{v.lrNo}</strong> · {v.truckNo} · {v.date}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '22px' }}>This cannot be undone.</div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button className="btn btn-g" onClick={onClose}>Cancel</button>
                    <button className="btn btn-d" onClick={go} disabled={deleting}>{deleting ? '...' : <><Trash2 size={13} /> Delete</>}</button>
                </div>
            </motion.div>
        </div>
    );
}

/* ══════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════ */
export default function VoucherModule({ role = 'user', initialTab, lockedType }) {
    const [vType, setVType] = useState(lockedType || initialTab || 'Dump');
    const [vouchers, setVouchers] = useState([]);
    const [saving, setSaving] = useState(false);
    const [lrMaterials, setLrMaterials] = useState([]);
    const [lrAlreadyUsed, setLrAlreadyUsed] = useState(false);
    const [editVoucher, setEditVoucher] = useState(null);
    const [delVoucher, setDelVoucher] = useState(null);
    const [formOpen, setFormOpen] = useState(true);
    const [isConfirmingSave, setIsConfirmingSave] = useState(false);

    // Filters
    const [fLr, setFLr] = useState('');
    const [fTruck, setFTruck] = useState('');
    const [fFrom, setFFrom] = useState('');
    const [fTo, setFTo] = useState('');
    const [fDest, setFDest] = useState('');
    const [sortCol, setSortCol] = useState('date');
    const [sortDir, setSortDir] = useState('desc');

    const [form, setForm] = useState({
        lrNo: '', date: new Date().toISOString().split('T')[0],
        truckNo: '', destination: '', weight: '', bags: '',
        rate: '', pump: PUMPS[0], advanceDiesel: '', advanceCash: '', advanceOnline: '',
        hasCommission: false, isFullTank: false,
    });

    // Update tab when initialTab prop changes from sidebar navigation
    useEffect(() => {
        if (initialTab) setVType(initialTab);
    }, [initialTab]);

    useEffect(() => { fetchVouchers(); }, [vType]);

    const fetchVouchers = async () => {
        try { setVouchers((await ax.get(API_V + '/' + vType)).data); } catch { }
    };

    // For JK types: compute next LR number from existing voucher list
    const nextLrNo = useMemo(() => {
        if (vType === 'Dump') return '';
        if (vouchers.length === 0) return '1';
        const max = Math.max(...vouchers.map(v => parseInt(v.lrNo) || 0));
        return String(max + 1);
    }, [vType, vouchers]);

    // Auto-fill LR No when switching to JK tabs (after vouchers load)
    useEffect(() => {
        if (vType === 'JK_Super' || vType === 'JK_Lakshmi') {
            setForm(f => ({ ...f, lrNo: nextLrNo }));
            setLrAlreadyUsed(false);
        } else {
            // Dump — clear LR field on tab switch
            setForm(f => ({ ...f, lrNo: '' }));
            setLrAlreadyUsed(false);
        }
    }, [nextLrNo]);

    /* LR search — only Dump vouchers auto-fetch from /lr receipts */
    /* JK_Super and JK_Lakshmi have custom LR numbers — no auto-fetch, but still prevent duplicates */
    const handleLrSearch = async val => {
        setForm(f => ({ ...f, lrNo: val }));
        setLrAlreadyUsed(false);
        setLrMaterials([]);
        if (!val) return;

        // Check if this LR is already assigned to an existing voucher of the same type
        const alreadyUsed = vouchers.some(v => String(v.lrNo) === String(val));
        if (alreadyUsed) {
            setLrAlreadyUsed(true);
            return;
        }

        // JK_Super and JK_Lakshmi use fully custom LR numbers — skip LR receipt lookup
        if (vType === 'JK_Super' || vType === 'JK_Lakshmi') return;

        // Dump voucher only: Fetch LR details from receipts
        try {
            const all = (await ax.get(`/lr`)).data;
            const rows = all.filter(l => String(l.lrNo) === String(val));
            if (rows.length > 0) {
                setLrMaterials(rows);
                const tw = rows.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0);
                const tb = rows.reduce((s, r) => s + (parseFloat(r.totalBags) || 0), 0);
                setForm(f => ({ ...f, truckNo: rows[0].truckNo || '', date: rows[0].date || f.date, weight: tw.toFixed(2), bags: String(tb) }));
            }
        } catch (err) { console.error(err); }
    };


    const handleFormRequest = e => {
        e.preventDefault();
        if (lrAlreadyUsed) return;  // Block save if LR is already assigned
        setIsConfirmingSave(true);
    };

    const executeSaveVoucher = async () => {
        setSaving(true); setIsConfirmingSave(false);
        const calc = getCalc(form.weight, form.rate, form.hasCommission);
        try {
            await ax.post(API_V, { ...form, type: vType, ...calc });
            fetchVouchers(); setLrMaterials([]); setLrAlreadyUsed(false);
            setForm(f => ({ ...f, lrNo: '', truckNo: '', weight: '', bags: '', rate: '', destination: '', advanceDiesel: '', advanceCash: '', advanceOnline: '', isFullTank: false }));
        } catch { alert('Error saving voucher'); } finally { setSaving(false); }
    };

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    /* Sort helper */
    const toggleSort = col => {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('asc'); }
    };
    const SortIcon = ({ col }) => sortCol === col
        ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
        : <ChevronDown size={12} style={{ opacity: 0.3 }} />;

    /* Filtered + sorted vouchers */
    const filtered = useMemo(() => {
        let list = [...vouchers];
        if (fLr) list = list.filter(v => String(v.lrNo).includes(fLr));
        if (fTruck) list = list.filter(v => (v.truckNo || '').toLowerCase().includes(fTruck.toLowerCase()));
        if (fDest) list = list.filter(v => (v.destination || '').toLowerCase().includes(fDest.toLowerCase()));
        if (fFrom) list = list.filter(v => v.date >= fFrom);
        if (fTo) list = list.filter(v => v.date <= fTo);
        list.sort((a, b) => {
            let av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
            if (sortCol === 'total' || sortCol === 'weight' || sortCol === 'lrNo') { av = parseFloat(av) || 0; bv = parseFloat(bv) || 0; }
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return list;
    }, [vouchers, fLr, fTruck, fDest, fFrom, fTo, sortCol, sortDir]);

    /* Totals row */
    const totals = useMemo(() => ({
        weight: filtered.reduce((s, v) => s + (parseFloat(v.weight) || 0), 0).toFixed(2),
        bags: filtered.reduce((s, v) => s + (parseFloat(v.bags) || 0), 0),
        total: filtered.reduce((s, v) => s + ((parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0)), 0),
    }), [filtered]);

    const exportVoucherExcel = () => exportToExcel(filtered.map(v => ({ LR: v.lrNo, Date: v.date, Truck: v.truckNo, Dest: v.destination, Weight: v.weight, Bags: v.bags, Rate: v.rate, Pump: v.pump, Diesel_Adv: v.advanceDiesel, Cash_Adv: v.advanceCash, Online_Adv: v.advanceOnline, Munshi: v.munshi, Total: (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0) })), `Vouchers_${vType}_${new Date().toISOString().slice(0, 10)}`);
    const exportVoucherPDF = () => exportToPDF(filtered, `${vType.replace('_', ' ')} Vouchers`, ['lrNo', 'date', 'truckNo', 'destination', 'weight', 'bags', 'rate', 'pump', 'advanceDiesel', 'advanceCash', 'advanceOnline', 'total']);

    return (
        <>
            <ConfirmSaveModal
                isOpen={isConfirmingSave}
                onClose={() => setIsConfirmingSave(false)}
                onConfirm={executeSaveVoucher}
                title="Create Voucher"
                message={`Are you sure you want to create a new Voucher for LR #${form.lrNo}?`}
                isSaving={saving}
            />
            <AnimatePresence>{editVoucher && <EditModal v={editVoucher} onClose={() => setEditVoucher(null)} onSave={() => { setEditVoucher(null); fetchVouchers(); }} />}</AnimatePresence>
            <AnimatePresence>{delVoucher && <DeleteConfirm v={delVoucher} onClose={() => setDelVoucher(null)} onConfirm={() => { setDelVoucher(null); fetchVouchers(); }} />}</AnimatePresence>

            <div>
                {/* ── Page Header ── */}
                <div className="page-hd">
                    <div>
                        <h1><FileText size={20} color={lockedType === 'JK_Lakshmi' ? '#f59e0b' : '#10b981'} /> {lockedType === 'JK_Lakshmi' ? 'JK Lakshmi Voucher' : 'Voucher Management'}</h1>
                        <p>{lockedType === 'JK_Lakshmi' ? 'Manage JK Lakshmi vouchers' : 'Dump · J.K Lakshmi · J.K Super'}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {!lockedType && (
                            <div className="tab-grp">
                                {TYPES.map(t => <button key={t} className={`tab-btn${vType === t ? ' tab-indigo' : ''}`} onClick={() => setVType(t)}>{t.replace('_', ' ')}</button>)}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Entry Form (collapsible) ── */}
                <div className="card" style={{ marginBottom: '18px' }}>
                    <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setFormOpen(o => !o)}>
                        <div className="card-title-block">
                            <div className="card-icon ci-green"><Plus size={17} /></div>
                            <div className="card-title-text"><h3>New {vType.replace('_', ' ')} Voucher</h3><p>{form.date}</p></div>
                        </div>
                        <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700 }}>
                            {formOpen ? <><ChevronUp size={15} /> Collapse</> : <><ChevronDown size={15} /> Expand</>}
                        </button>
                    </div>

                    <AnimatePresence initial={false}>
                        {formOpen && (
                            <motion.div key="form" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: 'easeInOut' }} style={{ overflow: 'hidden' }}>
                                <div className="card-body">
                                    <form onSubmit={handleFormRequest}>
                                        <div className="fg fg-4">
                                            <div className="field">
                                                <label><Search size={11} /> LR Number</label>
                                                <input
                                                    className="fi" type="text" placeholder="e.g. 42"
                                                    value={form.lrNo}
                                                    onChange={e => handleLrSearch(e.target.value)}
                                                    style={lrAlreadyUsed ? { borderColor: '#f43f5e', boxShadow: '0 0 0 2px rgba(244,63,94,0.18)' } : {}}
                                                    required
                                                />
                                            </div>
                                            <div className="field">
                                                <label>Truck No.</label>
                                                <input className="fi" type="text" placeholder="Auto-filled" value={form.truckNo} onChange={e => set('truckNo', e.target.value.toUpperCase())} required />
                                            </div>
                                            <div className="field">
                                                <label><MapPin size={11} /> Destination</label>
                                                <input className="fi" type="text" placeholder="City" value={form.destination} onChange={e => set('destination', e.target.value)} />
                                            </div>
                                            <div className="field">
                                                <label>Date</label>
                                                <input className="fi" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
                                            </div>
                                        </div>

                                        {lrAlreadyUsed && (
                                            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '9px', padding: '9px 14px' }}>
                                                <AlertTriangle size={15} color="#f43f5e" style={{ flexShrink: 0 }} />
                                                <span style={{ fontSize: '12px', fontWeight: 700, color: '#f43f5e' }}>LR #{form.lrNo} is already assigned to a {vType.replace('_', ' ')} voucher. Please use a different LR number.</span>
                                            </div>
                                        )}

                                        {lrMaterials.length > 0 && (
                                            <div style={{ marginTop: '12px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: '10px', padding: '10px 14px' }}>
                                                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '7px' }}>Materials — LR #{form.lrNo}</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                    {lrMaterials.map((m, i) => (
                                                        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--bg-input)', borderRadius: '8px', padding: '5px 10px' }}>
                                                            <span className="badge badge-tag">{m.material}</span>
                                                            <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-sub)' }}>{m.totalBags} bags · {Number(m.weight).toFixed(2)} MT</span>
                                                        </div>
                                                    ))}
                                                    {lrMaterials.length > 1 && (
                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: '8px', padding: '5px 10px' }}>
                                                            <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--accent)' }}>
                                                                Total: {lrMaterials.reduce((s, m) => s + (parseFloat(m.totalBags) || 0), 0)} bags · {lrMaterials.reduce((s, m) => s + (parseFloat(m.weight) || 0), 0).toFixed(2)} MT
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        <div className="fg fg-4" style={{ marginTop: '12px' }}>
                                            <div className="field"><label>Weight (MT)</label><input className="fi" type="number" step="0.01" placeholder="0.00" value={form.weight} onChange={e => set('weight', e.target.value)} /></div>
                                            <div className="field"><label>Total Bags</label><input className="fi" type="number" placeholder="0" value={form.bags} onChange={e => set('bags', e.target.value)} /></div>
                                            <div className="field"><label>Rate (Rs/MT)</label><input className="fi" type="number" placeholder="0" value={form.rate} onChange={e => set('rate', e.target.value)} /></div>
                                            <div className="field"><label>Petrol Pump</label>
                                                <select className="fi" value={form.pump} onChange={e => set('pump', e.target.value)}>
                                                    {PUMPS.map(p => <option key={p}>{p}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="fg fg-4" style={{ marginTop: '12px' }}>
                                            <div className="field">
                                                <label><Fuel size={11} /> Diesel Advance</label>
                                                <div className="fi-row">
                                                    <input className="fi" type="text" placeholder="Amount" value={form.advanceDiesel} disabled={form.isFullTank} onChange={e => set('advanceDiesel', e.target.value)} />
                                                    <button type="button" style={{ minWidth: '48px' }} className={`btn btn-sm ${form.isFullTank ? 'btn-p' : 'btn-g'}`}
                                                        onClick={() => setForm(f => ({ ...f, isFullTank: !f.isFullTank, advanceDiesel: !f.isFullTank ? 'FULL' : '' }))}>Full</button>
                                                </div>
                                            </div>
                                            <div className="field"><label><Wallet size={11} /> Cash Advance</label><input className="fi" type="number" placeholder="0" value={form.advanceCash} onChange={e => set('advanceCash', e.target.value)} /></div>
                                            <div className="field"><label><CreditCard size={11} /> Online Advance</label><input className="fi" type="number" placeholder="0" value={form.advanceOnline} onChange={e => set('advanceOnline', e.target.value)} /></div>
                                            <div className="field" style={{ justifyContent: 'flex-end' }}>
                                                <div className="chk-row" style={{ marginTop: 'auto' }}>
                                                    <input type="checkbox" id="comm" checked={form.hasCommission} onChange={e => set('hasCommission', e.target.checked)} />
                                                    <label htmlFor="comm">Commission Rs.20/MT</label>
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
                                            <button type="submit" className="btn btn-p" style={{ minWidth: '160px', padding: '11px 24px' }} disabled={saving || lrAlreadyUsed}>
                                                {saving ? 'Saving...' : <><Check size={15} /> Save Voucher</>}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── Voucher Sheet ── */}
                <div className="card">
                    {/* Sheet header */}
                    <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
                        <div className="card-title-block">
                            <div className="card-icon ci-indigo"><Filter size={17} /></div>
                            <div className="card-title-text" style={{ flex: 1 }}>
                                <h3>{vType.replace('_', ' ')} Vouchers</h3>
                                <p>{filtered.length} of {vouchers.length} records</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button className="btn btn-g btn-sm" onClick={exportVoucherExcel}><Download size={13} /> Excel</button>
                            <button className="btn btn-g btn-sm" onClick={exportVoucherPDF}><Printer size={13} /> PDF</button>
                        </div>
                    </div>

                    {/* Filter bar */}
                    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', background: 'var(--bg-filter)' }}>
                        <div style={{ position: 'relative', flex: '0 0 130px' }}>
                            <Search size={11} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input className="fi" style={{ paddingLeft: '26px', height: '32px', fontSize: '12px' }} type="text" placeholder="LR No." value={fLr} onChange={e => setFLr(e.target.value)} />
                        </div>
                        <div style={{ position: 'relative', flex: '0 0 140px' }}>
                            <input className="fi" style={{ height: '32px', fontSize: '12px' }} type="text" placeholder="Truck No." value={fTruck} onChange={e => setFTruck(e.target.value)} />
                        </div>
                        <div style={{ position: 'relative', flex: '0 0 140px' }}>
                            <MapPin size={11} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input className="fi" style={{ paddingLeft: '26px', height: '32px', fontSize: '12px' }} type="text" placeholder="Destination" value={fDest} onChange={e => setFDest(e.target.value)} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>From</label>
                            <input className="fi" style={{ width: '130px', height: '32px', fontSize: '12px' }} type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>To</label>
                            <input className="fi" style={{ width: '130px', height: '32px', fontSize: '12px' }} type="date" value={fTo} onChange={e => setFTo(e.target.value)} />
                        </div>
                        {(fLr || fTruck || fDest || fFrom || fTo) && (
                            <button className="btn btn-sm btn-d" onClick={() => { setFLr(''); setFTruck(''); setFDest(''); setFFrom(''); setFTo(''); }}>
                                <X size={12} /> Clear
                            </button>
                        )}
                    </div>

                    {/* Sheet table */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-th)' }}>
                                    <th style={{ ...TH, width: '40px', textAlign: 'center' }}>#</th>
                                    {[
                                        { key: 'lrNo', label: 'LR No.' },
                                        { key: 'date', label: 'Date' },
                                        { key: 'truckNo', label: 'Truck' },
                                        { key: 'destination', label: 'Destination' },
                                        { key: 'weight', label: 'Weight (MT)' },
                                        { key: 'bags', label: 'Bags' },
                                        { key: 'rate', label: 'Rate' },
                                        { key: 'pump', label: 'Pump' },
                                        { key: 'advanceDiesel', label: 'Diesel Adv.' },
                                        { key: 'advanceCash', label: 'Cash Adv.' },
                                        { key: 'advanceOnline', label: 'Online Adv.' },
                                        { key: 'munshi', label: 'Munshi' },
                                        { key: 'total', label: 'Total (Rs)' },
                                    ].map(col => (
                                        <th key={col.key} style={{ ...TH, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(col.key)}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{col.label}<SortIcon col={col.key} /></span>
                                        </th>
                                    ))}
                                    <th style={{ ...TH, textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 && (
                                    <tr><td colSpan={15} style={{ padding: '40px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>No records found</td></tr>
                                )}
                                {filtered.map((v, i) => (
                                    <tr key={v.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)', transition: 'background 0.12s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-row-hover)'}
                                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)'}>
                                        <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                                        <td style={{ ...TD }}><span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>#{v.lrNo}</span></td>
                                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>{v.date}</td>
                                        <td style={{ ...TD, fontWeight: 700 }}>{v.truckNo}</td>
                                        <td style={{ ...TD }}>{v.destination || '—'}</td>
                                        <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{v.weight}</td>
                                        <td style={{ ...TD, textAlign: 'right' }}>{v.bags}</td>
                                        <td style={{ ...TD, textAlign: 'right' }}>{v.rate}</td>
                                        <td style={{ ...TD }}>{v.pump || '—'}</td>
                                        <td style={{ ...TD, textAlign: 'right' }}>{v.advanceDiesel || '—'}</td>
                                        <td style={{ ...TD, textAlign: 'right' }}>{v.advanceCash || '—'}</td>
                                        <td style={{ ...TD, textAlign: 'right' }}>{v.advanceOnline || '—'}</td>
                                        <td style={{ ...TD, textAlign: 'right' }}>{v.munshi || 0}</td>
                                        <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: 'var(--accent)' }}>
                                            {((parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0)).toLocaleString()}
                                        </td>
                                        <td style={{ ...TD, textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                                                <button className="btn btn-g btn-icon btn-sm" title="Print" onClick={() => printVoucher(v)}><Printer size={13} /></button>
                                                <button className="btn btn-g btn-icon btn-sm" title="Edit" onClick={() => setEditVoucher(v)}><Pencil size={13} /></button>
                                                {role === 'admin' && (
                                                    <button className="btn btn-d btn-icon btn-sm" title="Delete" onClick={() => setDelVoucher(v)}><Trash2 size={13} /></button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            {filtered.length > 0 && (
                                <tfoot>
                                    <tr style={{ background: 'var(--bg-tf)', borderTop: '2px solid var(--border)' }}>
                                        <td colSpan={5} style={{ ...TD, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '0.08em' }}>
                                            Totals ({filtered.length} rows)
                                        </td>
                                        <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{totals.weight}</td>
                                        <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{totals.bags}</td>
                                        <td colSpan={5} style={{ ...TD }}></td>
                                        <td colSpan={2} style={{ ...TD, textAlign: 'right', fontWeight: 900, color: 'var(--accent)', fontSize: '14px' }}>
                                            Rs.{totals.total.toLocaleString()}
                                        </td>
                                        <td style={{ ...TD }}></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            </div>
        </>
    );
}

/* shared cell styles */
const TH = {
    padding: '9px 13px',
    textAlign: 'left',
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    borderBottom: '1px solid var(--border)',
    whiteSpace: 'nowrap',
};
const TD = {
    padding: '9px 13px',
    fontSize: '12.5px',
    color: 'var(--text-sub)',
    verticalAlign: 'middle',
    borderBottom: '1px solid var(--border-row)',
    whiteSpace: 'nowrap',
};