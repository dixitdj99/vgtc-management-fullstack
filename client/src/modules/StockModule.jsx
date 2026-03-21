import React, { useState, useEffect, useMemo } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Plus, TrendingDown, FileText, Archive, CheckCircle2,
  XCircle, AlertCircle, Clock, Trash2, RefreshCw, ChevronDown,
  ChevronUp, X, Save, Check, Tag, Search, Download, Printer, Filter
} from 'lucide-react';
import ConfirmSaveModal from '../components/ConfirmSaveModal';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import ColumnFilter from '../components/ColumnFilter';

const BASE_API = ``;
const MATS_DUMP = ["PPC", "OPC43", "Adstar", "OPC FS", "OPC53 FS", "Weather"];
const MATS_JKL = ["PPC", "OPC43", "Pro+"];
const MCOL = { "PPC": "#6366f1", "OPC43": "#f59e0b", "Pro+": "#10b981", "Adstar": "#10b981", "OPC FS": "#0ea5e9", "OPC53 FS": "#a855f7", "Weather": "#f43f5e" };
const STATUS_META = {
  open: { label: 'Open / On Hold', color: 'var(--warn)', Icon: Clock },
  loaded: { label: 'Loaded', color: 'var(--accent)', Icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'var(--danger)', Icon: XCircle },
};

const fmtBags = n => Number(n || 0).toLocaleString('en-IN') + ' bags';
const fmtWt = n => parseFloat(n || 0).toFixed(2) + ' MT';
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/* ── form helper ── */
const fi = (label, node) => (
  <div className="field" style={{ flex: 1, minWidth: '120px' }}>
    <label>{label}</label>{node}
  </div>
);

/* ─────────────────────────────────────────────
   MATERIAL CARD
───────────────────────────────────────────── */
function MatCard({ mat, added, lrUsed, sold, held }) {
  const available = added - lrUsed - sold - held;
  const col = MCOL[mat] || '#6366f1';
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px',
      padding: '15px 18px', borderTop: `3px solid ${col}`
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '12px' }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '9px', background: col + '22',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Package size={16} color={col} />
        </div>
        <span style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text)' }}>{mat}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
        {[
          { label: 'Total In', val: (added || 0), color: 'var(--text)' },
          { label: 'Available', val: available, color: available < 0 ? 'var(--danger)' : col, wt: available },
          { label: 'On Hold', val: held, color: 'var(--warn)' },
          { label: 'Sold', val: (sold || 0), color: 'var(--accent)' },
        ].map(({ label, val, color, wt }) => (
          <div key={label} style={{ textAlign: 'center', padding: '10px 6px', background: 'var(--bg)', borderRadius: '10px', border: label === 'Available' ? `1px solid ${col}44` : '1px solid transparent' }}>
            <div style={{ fontSize: '18px', fontWeight: 900, color, lineHeight: 1 }}>
              {val.toLocaleString('en-IN')}
            </div>
            {wt !== undefined && <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', marginTop: '2px' }}>{(wt * 0.05).toFixed(2)} MT</div>}
            <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '4px' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════
   MAIN
═════════════════════════════════════════════════ */
export default function StockModule({ initialTab, brand = 'dump', role = 'user', permissions = {} }) {
  const API = brand === 'jkl' ? `${BASE_API}/jkl/stock` : `${BASE_API}/stock`;
  const API_LR = brand === 'jkl' ? `${BASE_API}/jkl/lr` : `${BASE_API}/lr`;
  const MATS = brand === 'jkl' ? MATS_JKL : MATS_DUMP;

  const [additions, setAdditions] = useState([]);
  const [challans, setChallans] = useState([]);
  const [lrs, setLrs] = useState([]);
  const [sales, setSales] = useState([]);
  const [vehicles, setVehicles] = useState([]); // Added vehicles state
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(initialTab || 'overview'); // overview|history|add|challan
  const [challanFilter, setChallanFilter] = useState('open'); // open|loaded|cancelled|all
  const [delTarget, setDelTarget] = useState(null);

  /* Excel-style filters */
  const [filters, setFilters] = useState({});
  const handleFilterChange = (key, val) => setFilters(f => ({ ...f, [key]: val }));

  /* forms */
  const getEmptyAdd = () => ({ material: MATS[0], quantity: '', date: new Date().toISOString().slice(0, 10), remark: '' });
  const getEmptyChal = () => ({ truckNo: '', material: MATS[0], quantity: '', partyName: '', date: new Date().toISOString().slice(0, 10), remark: '' });
  const [addForm, setAddForm] = useState(getEmptyAdd());
  const [chalForm, setChalForm] = useState(getEmptyChal());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Update tab when initialTab prop changes from sidebar navigation
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  // Update form defaults when navigating between brands
  useEffect(() => {
    setAddForm(f => ({ ...f, material: MATS[0] }));
    setChalForm(f => ({ ...f, material: MATS[0] }));
  }, [brand]);

  useEffect(() => { fetchAll(); }, [brand]);
  const fetchAll = async () => {
    setLoading(true);
    try {
      const [ad, ch, lr, vh, sl] = await Promise.all([
        ax.get(API + '/additions').then(r => r.data),
        ax.get(API + '/challans').then(r => r.data),
        ax.get(API_LR).then(r => r.data),
        ax.get(`/vehicles`).then(r => r.data).catch(() => []),
        ax.get(`/sell?brand=${brand}`).then(r => r.data).catch(() => []),
      ]);
      setAdditions(ad); setChallans(ch); setLrs(lr); setVehicles(vh); setSales(sl);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  /* ── stock math per material ── */
  const stockMap = useMemo(() => {
    const m = {};
    MATS.forEach(mat => {
      const added = additions.filter(a => a.material === mat).reduce((s, a) => s + (parseFloat(a.quantity) || 0), 0);
      const lrUsed = lrs.filter(l => l.material === mat).reduce((s, l) => s + (parseInt(l.totalBags) || 0), 0);
      const sold = sales.filter(s => s.material === mat).reduce((s, x) => s + (parseInt(x.quantity) || 0), 0);

      let held = 0;
      challans.forEach(c => {
        if (c.status === 'open' || c.status === 'partially_loaded') {
          if (c.materials) {
            const m = c.materials.find(matObj => matObj.type === mat);
            if (m) {
              held += (m.totalBags - (m.loadedBags || 0));
            }
          } else if (c.material === mat) {
            held += parseFloat(c.quantity) || 0;
          }
        }
      });

      m[mat] = { added, lrUsed, sold, held, available: added - lrUsed - sold - held };
    });
    return m;
  }, [additions, challans, lrs, sales, MATS]);

  const totalAvailable = MATS.reduce((s, mat) => s + (stockMap[mat]?.available || 0), 0);
  const totalHeld = MATS.reduce((s, mat) => s + (stockMap[mat]?.held || 0), 0);

  /* ── handlers ── */
  const [isConfirmingAdd, setIsConfirmingAdd] = useState(false);
  const triggerAdd = e => {
    e.preventDefault(); setErr('');
    if (!addForm.quantity || parseFloat(addForm.quantity) <= 0) { setErr('Enter valid quantity'); return; }
    setIsConfirmingAdd(true);
  };
  const executeAdd = async () => {
    setSaving(true); setIsConfirmingAdd(false);
    try { await ax.post(API + '/additions', addForm); setAddForm(getEmptyAdd()); fetchAll(); }
    catch (er) { setErr(er.response?.data?.error || 'Error'); } finally { setSaving(false); }
  };

  const [isConfirmingChallan, setIsConfirmingChallan] = useState(false);
  const [challanWarning, setChallanWarning] = useState('');

  const triggerChallan = e => {
    e.preventDefault(); setErr('');
    if (!chalForm.truckNo) { setErr('Truck number required'); return; }
    if (!chalForm.quantity || parseFloat(chalForm.quantity) <= 0) { setErr('Enter valid quantity'); return; }
    // Check availability
    const avail = stockMap[chalForm.material]?.available || 0;
    if (parseFloat(chalForm.quantity) > avail) {
      setChallanWarning(`Warning: Only ${avail.toLocaleString()} bags available. Are you sure you want to create a challan for ${chalForm.quantity} bags?`);
    } else {
      setChallanWarning(`Are you sure you want to create a challan for ${chalForm.quantity} bags of ${chalForm.material}?`);
    }
    setIsConfirmingChallan(true);
  };

  const executeChallan = async () => {
    setSaving(true); setIsConfirmingChallan(false);
    try { await ax.post(API + '/challans', chalForm); setChalForm(getEmptyChal()); fetchAll(); }
    catch (er) { setErr(er.response?.data?.error || 'Error'); } finally { setSaving(false); }
  };

  const updateStatus = async (id, status) => {
    if (!(role === 'admin' || permissions?.stock === 'edit')) {
      alert('Permission denied (Edit access required)');
      return;
    }
    try { await ax.patch(API + '/challans/' + id, { status }); fetchAll(); }
    catch (er) { alert(er.response?.data?.error || 'Error'); }
  };

  const deleteItem = async () => {
    if (!delTarget) return;
    try {
      if (delTarget.type === 'addition') await ax.delete(API + '/additions/' + delTarget.id);
      else await ax.delete(API + '/challans/' + delTarget.id);
      fetchAll();
    } catch (er) { alert('Delete failed'); }
    if (role !== 'admin') {
      alert('Only administrators can delete entries');
      return;
    }
    setDelTarget(null);
  };

  const TH = {
    padding: '8px 11px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
    letterSpacing: '0.07em', background: 'var(--bg-th)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
  };
  const TD = { padding: '8px 10px', fontSize: '12.5px', color: 'var(--text-sub)', verticalAlign: 'middle', borderBottom: '1px solid var(--border-row)' };

  const filteredChallans = useMemo(() => {
    let list = challanFilter === 'all' ? challans : challans.filter(c => {
      if (challanFilter === 'open') return c.status === 'open' || c.status === 'partially_loaded';
      return c.status === challanFilter;
    });

    // Dynamic filtering
    Object.keys(filters).forEach(key => {
        const vals = filters[key];
        if (vals && vals.length > 0) {
            list = list.filter(c => vals.includes(String(c[key] ?? '')));
        }
    });

    return list;
  }, [challans, challanFilter, filters]);

  const historyRows = useMemo(() => {
    let rows = [
      ...additions.map(a => ({ ...a, txType: 'add', debit: 0, credit: a.quantity, label: `Stock Added — ${a.remark || 'Manual entry'}`, displayType: 'Stock In' })),
      ...lrs.map(l => ({ ...l, txType: 'lr', debit: l.totalBags || 0, credit: 0, label: `LR #${l.lrNo} — Truck ${l.truckNo || '?'}`, displayType: 'LR Use' })),
      ...sales.map(s => ({ ...s, txType: 'sell', debit: s.quantity, credit: 0, label: `Direct Sale — ${s.customerName || 'Cash'}`, displayType: 'Sale' })),
    ].sort((a, b) => (a.date || '') > (b.date || '') ? -1 : 1);

    // Dynamic filtering
    Object.keys(filters).forEach(key => {
        const vals = filters[key];
        if (vals && vals.length > 0) {
            rows = rows.filter(r => vals.includes(String(r[key] ?? '')));
        }
    });

    return rows;
  }, [additions, lrs, sales, filters]);

  const exportChallanExcel = () => exportToExcel(filteredChallans.map(c => ({ ChallanNo: c.challanNo, Date: c.date, Truck: c.truckNo, Material: c.material, Qty: c.quantity, Party: c.partyName, Status: c.status, Remark: c.remark })), `Challans_${new Date().toISOString().slice(0, 10)}`);
  const exportChallanPDF = () => exportToPDF(filteredChallans, 'Challan List', ['challanNo', 'date', 'truckNo', 'material', 'quantity', 'partyName', 'status', 'remark']);

  const exportHistoryExcel = () => exportToExcel(historyRows.map(r => ({ Date: r.date, Type: r.displayType, Details: r.label, Truck: r.truckNo, Material: r.material, In_Bags: r.credit, Out_Bags: r.debit })), `Stock_History_${new Date().toISOString().slice(0, 10)}`);
  const exportHistoryPDF = () => exportToPDF(historyRows, 'Stock History', ['date', 'displayType', 'label', 'truckNo', 'material', 'credit', 'debit']);

  return (
    <div>
      {/* Delete confirm */}
      <AnimatePresence>
        {delTarget && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: '16px', padding: '26px 22px', width: '300px', textAlign: 'center' }}>
              <AlertCircle size={28} color="var(--danger)" style={{ marginBottom: '12px' }} />
              <div style={{ fontWeight: 800, color: 'var(--text)', marginBottom: '6px', fontSize: '14px' }}>Delete Entry?</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>{delTarget.label}</div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button className="btn btn-g" onClick={() => setDelTarget(null)}>Cancel</button>
                <button className="btn btn-d" onClick={deleteItem}><Trash2 size={13} /> Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="page-hd">
        <div>
          <h1><Package size={20} color="#a855f7" /> {brand === 'jkl' ? 'JK Lakshmi' : 'Dump'} Stock</h1>
          <p>Material inventory & challan management</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn btn-g btn-sm" onClick={fetchAll}><RefreshCw size={13} /> Refresh</button>
        </div>
      </div>


      {/* Quick summary strip */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total In (All Time)', val: additions.reduce((s, a) => s + (parseFloat(a.quantity) || 0), 0), color: '#10b981' },
          { label: 'Net Available', val: totalAvailable, color: '#a855f7' },
          { label: 'Current On Hold', val: totalHeld, color: 'var(--warn)' },
          { label: 'Open Challans', val: challans.filter(c => c.status === 'open' || c.status === 'partially_loaded').length, color: 'var(--primary)', unit: 'challans' },
        ].map(({ label, val, color, unit = 'bags' }) => (
          <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '150px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
            <span style={{ fontSize: '20px', fontWeight: 900, color, lineHeight: 1 }}>{val.toLocaleString('en-IN')}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{unit}</span>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {[
          { id: 'overview', label: 'Overview', icon: <Package size={13} /> },
          {id: 'history', label: 'Stock History', icon: <FileText size={13} />},
          {id: 'add', label: 'Stock Entry', icon: <Plus size={13} />, restricted: true},
          {id: 'challan', label: 'Challan / Dispatch', icon: <Tag size={13} />, restricted: true},
        ].map(({ id, label, icon, restricted }) => {
          if (restricted && !(role === 'admin' || permissions?.stock === 'edit')) return null;
          return (
            <button key={id} onClick={() => setTab(id)}
            style={{
              padding: '7px 14px', borderRadius: '9px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s',
              borderColor: tab === id ? '#a855f7' : 'var(--border)',
              background: tab === id ? 'rgba(168,85,247,0.1)' : 'transparent',
              color: tab === id ? '#a855f7' : 'var(--text-muted)'
            }}>
            {icon}{label}
          </button>
        );
      })}
      </div>
      
      {/* ── OVERVIEW TAB (Cards only, no list) ── */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '12px', marginBottom: '18px' }}>
          {MATS.map(mat => <MatCard key={mat} mat={mat} {...(stockMap[mat] || { added: 0, lrUsed: 0, sold: 0, held: 0 })} />)}
        </div>
      )}

      {Object.keys(filters).some(k => filters[k].length > 0) && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', background: 'var(--bg-filter)', padding: '10px 14px', borderRadius: '12px', border: '1px solid var(--border)', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase' }}>Active Filters:</span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {Object.keys(filters).map(k => filters[k].length > 0 && (
                  <span key={k} className="badge badge-tag" style={{ fontSize: '9px' }}>
                      {k}: {filters[k].length} selected
                  </span>
              ))}
          </div>
          <button className="btn btn-sm btn-g" style={{ marginLeft: 'auto', height: '24px', fontSize: '10px' }} onClick={() => setFilters({})}>Clear All Filters</button>
        </div>
      )}


      {/* ── ADD STOCK TAB ── */}
      {tab === 'add' && (
        <div>
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-header"><div className="card-title-block">
              <div className="card-icon" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--accent)' }}><Plus size={17} /></div>
              <div className="card-title-text"><h3>{brand === 'jkl' ? 'JK Lakshmi Stock Entry' : 'Add Stock Entry'}</h3><p>Record new material delivery</p></div>
            </div></div>
            <form onSubmit={triggerAdd} style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                {fi('Material', <select className="fi" value={addForm.material} onChange={e => setAddForm(f => ({ ...f, material: e.target.value }))}>
                  {MATS.map(m => <option key={m}>{m}</option>)}</select>)}
                {fi('Quantity (bags)', <input className="fi" type="number" step="1" min="1" required placeholder="e.g. 500"
                  value={addForm.quantity} onChange={e => setAddForm(f => ({ ...f, quantity: e.target.value }))} />)}
                {fi('Date', <input className="fi" type="date" value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} />)}
                {fi('Remark', <input className="fi" type="text" placeholder="Supplier name / note"
                  value={addForm.remark} onChange={e => setAddForm(f => ({ ...f, remark: e.target.value }))} />)}
                <button type="submit" className="btn btn-a" disabled={saving || !(role === 'admin' || permissions?.stock === 'edit')} style={{ height: '38px', alignSelf: 'flex-end' }}>
                  {saving ? '…' : <><Check size={14} /> Add {brand === 'jkl' ? 'JK Lakshmi' : ''} Stock</>}
                </button>
              </div>
              {err && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '7px', fontWeight: 600 }}>{err}</div>}
            </form>
          </div>
          <ConfirmSaveModal
            isOpen={isConfirmingAdd}
            onClose={() => setIsConfirmingAdd(false)}
            onConfirm={executeAdd}
            title="Add Stock"
            message={`Are you sure you want to add ${addForm.quantity} bags of ${addForm.material}?`}
            isSaving={saving}
          />

          {/* Additions history */}
          <div className="card">
            <div className="card-header"><div className="card-title-block">
              <div className="card-icon" style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}><Archive size={17} /></div>
              <div className="card-title-text"><h3>Stock Addition History</h3><p>{additions.length} entries</p></div>
            </div></div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['#', 'Date', 'Material', 'Quantity', 'Remark'].map(h => <th key={h} style={TH}>{h}</th>)}
                  {role === 'admin' && <th style={TH}>Created By</th>}
                  {role === 'admin' && <th style={TH}>Updated By</th>}
                  <th style={TH}>Action</th>
                </tr></thead>
                <tbody>
                  {additions.length === 0 && <tr><td colSpan={6} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>No additions yet</td></tr>}
                  {[...additions].sort((a, b) => a.date > b.date ? -1 : 1).map((a, i) => (
                    <tr key={a.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                      <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(a.date)}</td>
                      <td style={{ ...TD }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: MCOL[a.material], display: 'inline-block' }} />
                          {a.material}
                        </span>
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{(a.quantity || 0).toLocaleString()} bags</td>
                      <td style={{ ...TD, color: 'var(--text-muted)' }}>{a.remark || '—'}</td>
                      {role === 'admin' && <td style={{ ...TD, fontSize: '12.5px', color: 'var(--text-sub)' }}>{a.createdBy || '—'}</td>}
                      {role === 'admin' && <td style={{ ...TD, fontSize: '12.5px', color: 'var(--text-sub)' }}>{a.updatedBy || '—'}</td>}
                      <td style={{ ...TD, textAlign: 'center' }}>
                        {role === 'admin' && (
                          <button className="btn btn-d btn-icon btn-sm" onClick={() => setDelTarget({ id: a.id, type: 'addition', label: a.material + ' — ' + a.quantity + ' bags' })}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── CHALLAN TAB ── */}
      {tab === 'challan' && (
        <div>
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-header"><div className="card-title-block">
              <div className="card-icon" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warn)' }}><Tag size={17} /></div>
              <div className="card-title-text"><h3>Dispatch New Challan</h3><p>Assign stock to a vehicle (goes to Hold)</p></div>
            </div></div>
            <form onSubmit={triggerChallan} style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                {fi('Truck No. (Auto-suggests)', <>
                  <input className="fi" type="text" placeholder="e.g. GJ01AB1234" required list="stock-truck-list"
                    value={chalForm.truckNo} onChange={e => setChalForm(f => ({ ...f, truckNo: e.target.value.toUpperCase() }))} />
                  <datalist id="stock-truck-list">
                    {vehicles.map(v => <option key={v.id} value={v.truckNo} />)}
                  </datalist>
                </>)}
                {fi('Material', <select className="fi" value={chalForm.material} onChange={e => setChalForm(f => ({ ...f, material: e.target.value }))}>
                  {MATS.map(m => <option key={m}>{m}</option>)}</select>)}
                {fi('Quantity (bags)', <input className="fi" type="number" step="1" min="1" required placeholder="bags"
                  value={chalForm.quantity} onChange={e => setChalForm(f => ({ ...f, quantity: e.target.value }))} />)}
                {fi('Party Name', <input className="fi" type="text" placeholder="Customer / party"
                  value={chalForm.partyName} onChange={e => setChalForm(f => ({ ...f, partyName: e.target.value }))} />)}
                {fi('Date', <input className="fi" type="date" value={chalForm.date} onChange={e => setChalForm(f => ({ ...f, date: e.target.value }))} />)}
                {fi('Remark', <input className="fi" type="text" placeholder="Notes"
                  value={chalForm.remark} onChange={e => setChalForm(f => ({ ...f, remark: e.target.value }))} />)}
                <button type="submit" className="btn btn-p" disabled={saving || !(role === 'admin' || permissions?.stock === 'edit')} style={{ height: '38px', alignSelf: 'flex-end' }}>
                  {saving ? '…' : <><Tag size={14} /> Create Challan</>}
                </button>
              </div>
              {chalForm.material && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  📦 {chalForm.material} available: <strong style={{ color: 'var(--text)' }}>{(stockMap[chalForm.material]?.available || 0).toLocaleString()} bags</strong>
                </div>
              )}
              {err && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '7px', fontWeight: 600 }}>{err}</div>}
            </form>
          </div>
          <ConfirmSaveModal
            isOpen={isConfirmingChallan}
            onClose={() => setIsConfirmingChallan(false)}
            onConfirm={executeChallan}
            title="Create Challan"
            message={challanWarning}
            isSaving={saving}
          />

          {/* Challan List */}
          <div className="card">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <div className="card-title-block">
                <div className="card-icon" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warn)' }}><FileText size={17} /></div>
                <div className="card-title-text" style={{ flex: 1 }}><h3>Challan List</h3><p>{filteredChallans.length} challans</p></div>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button className="btn btn-g btn-sm" onClick={exportChallanExcel}><Download size={13} /> Excel</button>
                <button className="btn btn-g btn-sm" onClick={exportChallanPDF}><Printer size={13} /> PDF</button>
                <span style={{ borderLeft: '1px solid var(--border)', height: '16px', margin: '0 4px' }}></span>
                {['open', 'loaded', 'cancelled', 'all'].map(s => (
                  <button key={s} onClick={() => setChallanFilter(s)}
                    style={{
                      padding: '5px 11px', borderRadius: '7px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: '11px', fontWeight: 700, textTransform: 'capitalize', transition: 'all 0.13s',
                      borderColor: challanFilter === s ? 'var(--primary)' : 'var(--border)',
                      background: challanFilter === s ? 'rgba(99,102,241,0.1)' : 'transparent',
                      color: challanFilter === s ? 'var(--primary)' : 'var(--text-muted)'
                    }}>
                    {s === 'open' ? 'On Hold' : s}
                    <span style={{ opacity: 0.7, marginLeft: '4px', fontSize: '10px' }}>
                      ({challans.filter(c => s === 'all' || c.status === s).length})
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={TH}><ColumnFilter label="Challan #" colKey="challanNo" data={challans} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                  <th style={TH}><ColumnFilter label="Date" colKey="date" data={challans} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                  <th style={TH}><ColumnFilter label="Truck" colKey="truckNo" data={challans} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                  <th style={TH}><ColumnFilter label="Material" colKey="material" data={challans} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                  <th style={TH}>Qty (bags)</th>
                  <th style={TH}><ColumnFilter label="Party" colKey="partyName" data={challans} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                  <th style={TH}>Remark</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>Sold</th>
                  {role === 'admin' && <th style={TH}>Created By</th>}
                  {role === 'admin' && <th style={TH}>Updated By</th>}
                  <th style={TH}>Actions</th>
                </tr></thead>
                <tbody>
                  {filteredChallans.length === 0 && <tr><td colSpan={9} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>No challans</td></tr>}
                  {[...filteredChallans].sort((a, b) => a.date > b.date ? -1 : 1).map((c, i) => {
                    const sm = STATUS_META[c.status] || STATUS_META.open;
                    return (
                      <tr key={c.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                        <td style={{ ...TD, fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>{c.challanNo}</td>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(c.date)}</td>
                        <td style={{ ...TD, fontWeight: 700, color: 'var(--text)' }}>{c.truckNo}</td>
                        <td style={{ ...TD }}>
                          {c.materials ? (
                            c.materials.map((m, idx) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: MCOL[m.type] || '#ccc', display: 'inline-block' }} />
                                {m.type}
                              </div>
                            ))
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: MCOL[c.material], display: 'inline-block' }} />
                              {c.material}
                            </span>
                          )}
                        </td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>
                          {c.materials ? (
                            c.materials.map((m, idx) => (
                              <div key={idx} style={{ marginBottom: '4px' }}>
                                {m.loadedBags > 0 ? (
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{m.loadedBags} loaded / </span>
                                ) : null}
                                {(m.totalBags || 0).toLocaleString()}
                              </div>
                            ))
                          ) : (
                            (c.quantity || 0).toLocaleString()
                          )}
                        </td>
                        <td style={{ ...TD }}>{c.partyName || '—'}</td>
                        <td style={{ ...TD, color: 'var(--text-muted)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.remark || '—'}</td>
                        <td style={{ ...TD }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                            background: sm.color + '22', color: sm.color
                          }}>
                            <sm.Icon size={11} />{sm.label}
                          </span>
                        </td>
                        {role === 'admin' && <td style={{ ...TD, fontSize: '12px' }}>{c.createdBy || '—'}</td>}
                        {role === 'admin' && <td style={{ ...TD, fontSize: '12px' }}>{c.updatedBy || '—'}</td>}
                        <td style={{ ...TD }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            {c.status !== 'loaded' && c.status !== 'cancelled' && (<>
                              <button className="btn btn-a btn-sm btn-icon" title="Mark as fully Loaded"
                                onClick={() => updateStatus(c.id, 'loaded')}><CheckCircle2 size={13} /></button>
                              <button className="btn btn-d btn-sm btn-icon" title="Cancel Challan"
                                onClick={() => updateStatus(c.id, 'cancelled')}><XCircle size={13} /></button>
                            </>)}
                            {(c.status === 'loaded' || c.status === 'cancelled') && (
                              <button className="btn btn-g btn-sm btn-icon" title="Re-open"
                                onClick={() => updateStatus(c.id, 'open')}><RefreshCw size={12} /></button>
                            )}
                            {role === 'admin' && (
                              <button className="btn btn-d btn-sm btn-icon" title="Delete"
                                onClick={() => setDelTarget({ id: c.id, type: 'challan', label: c.challanNo + ' — ' + c.truckNo })}>
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon" style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--primary)' }}><FileText size={17} /></div>
              <div className="card-title-text" style={{ flex: 1 }}><h3>Full Stock History</h3><p>{historyRows.length} entries (In + Out + Sales)</p></div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-g btn-sm" onClick={exportHistoryExcel}><Download size={13} /> Excel</button>
              <button className="btn btn-g btn-sm" onClick={exportHistoryPDF}><Printer size={13} /> PDF</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={TH}><ColumnFilter label="Date" colKey="date" data={historyRows} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                <th style={TH}><ColumnFilter label="Type" colKey="displayType" data={historyRows} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                <th style={TH}><ColumnFilter label="LR/Ref" colKey="lrNo" data={historyRows} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                <th style={TH}><ColumnFilter label="Truck" colKey="truckNo" data={historyRows} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                <th style={TH}><ColumnFilter label="Material" colKey="material" data={historyRows} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                <th style={TH}>In (bags)</th>
                <th style={TH}>Out (bags)</th>
                {role === 'admin' && <th style={TH}>Created By</th>}
                {role === 'admin' && <th style={TH}>Updated By</th>}
              </tr></thead>
              <tbody>
                {historyRows.length === 0 && <tr><td colSpan={7} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>No history</td></tr>}
                {historyRows.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                    <td style={{ ...TD }}>
                      {r.txType === 'add'
                        ? <span style={{ padding: '2px 8px', borderRadius: '5px', background: 'rgba(16,185,129,0.1)', color: 'var(--accent)', fontSize: '11px', fontWeight: 700 }}>Stock In</span>
                        : <span style={{ padding: '2px 8px', borderRadius: '5px', background: 'rgba(244,63,94,0.1)', color: 'var(--danger)', fontSize: '11px', fontWeight: 700 }}>LR Use</span>}
                    </td>
                    <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>
                      {r.txType === 'lr' ? `#${r.lrNo}` : r.remark || '—'}
                    </td>
                    <td style={{ ...TD }}>{r.truckNo || '—'}</td>
                    <td style={{ ...TD }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: MCOL[r.material], display: 'inline-block' }} />
                        {r.material || '—'}
                      </span>
                    </td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>
                      {r.credit > 0 ? (r.credit || 0).toLocaleString() : '—'}
                    </td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>
                      {r.debit > 0 ? (r.debit || 0).toLocaleString() : '—'}
                    </td>
                    {role === 'admin' && <td style={{ ...TD, fontSize: '12.5px', color: 'var(--text-sub)' }}>{r.createdBy || '—'}</td>}
                    {role === 'admin' && <td style={{ ...TD, fontSize: '12.5px', color: 'var(--text-sub)' }}>{r.updatedBy || '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}