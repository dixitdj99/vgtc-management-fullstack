import React, { useState, useEffect, useMemo } from 'react';
import ax from '../api';
import { validateTruckNo, cleanTruckNo } from '../utils/vehicleUtils';
import { buildPartySuggestions, resolvePartyName } from '../utils/partyNameUtils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Plus, TrendingDown, FileText, Archive, CheckCircle2,
  XCircle, AlertCircle, Clock, Trash2, RefreshCw, ChevronDown,
  ChevronUp, X, Save, Check, Tag, Search, Download, Printer, Filter, ChevronRight, ArrowRightLeft, Users
} from 'lucide-react';
import ConfirmSaveModal from '../components/ConfirmSaveModal';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import ColumnFilter from '../components/ColumnFilter';

const BASE_API = ``;
const MATS_DUMP_FALLBACK = ["PPC", "OPC43", "Adstar", "OPC FS", "OPC53 FS", "Weather"];
const MATS_JKL_FALLBACK = ["PPC", "OPC43", "Pro+"];
const BASE_MCOL = { "PPC": "#6366f1", "OPC43": "#f59e0b", "Pro+": "#10b981", "Adstar": "#10b981", "OPC FS": "#0ea5e9", "OPC53 FS": "#a855f7", "Weather": "#f43f5e" };

const getMatCol = (mat) => {
  if (BASE_MCOL[mat]) return BASE_MCOL[mat];
  // Deterministic color generation for custom materials
  let hash = 0;
  for (let i = 0; i < mat.length; i++) hash = mat.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 75%, 50%)`;
};

// validateTruckNo and cleanTruckNo imported from ../utils/vehicleUtils

const STATUS_META = {
  open: { label: 'Challan Created', color: 'var(--warn)', Icon: Clock },
  loaded: { label: 'Loaded', color: 'var(--accent)', Icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'var(--danger)', Icon: XCircle },
};

const fmtBags = n => Number(n || 0).toLocaleString('en-IN') + ' bags';
const fmtWt = n => parseFloat(n || 0).toFixed(2) + ' MT';
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/* ── form helper ── */
const getChallanMaterialRows = (challan) => {
  if (challan.materials && challan.materials.length > 0) {
    return challan.materials.map(m => {
      const totalBags = parseInt(m.totalBags || 0) || 0;
      const loadedBags = parseInt(m.loadedBags || 0) || 0;
      const pendingBags = Math.max(0, totalBags - loadedBags);
      return {
        material: m.type || 'â€”',
        quantity: `${totalBags} bags (${(totalBags * 0.05).toFixed(2)} MT)`,
        loadingDetails: `Loaded: ${loadedBags} | Pending: ${pendingBags}`,
      };
    });
  }

  const totalBags = parseInt(challan.quantity || 0) || 0;
  const loadedBags = parseInt(challan.loadedBags || 0) || 0;
  const pendingBags = Math.max(0, totalBags - loadedBags);
  return [{
    material: challan.material || 'â€”',
    quantity: `${totalBags} bags (${(totalBags * 0.05).toFixed(2)} MT)`,
    loadingDetails: `Loaded: ${loadedBags} | Pending: ${pendingBags}`,
  }];
};

const buildChallanExportRows = (challans) => challans.flatMap(challan =>
  getChallanMaterialRows(challan).map(row => ({
    challanNo: challan.challanNo || '',
    date: challan.date || '',
    truckNo: challan.truckNo || '',
    material: row.material,
    quantity: row.quantity,
    loadingDetails: row.loadingDetails,
    partyName: challan.partyName || '',
    status: challan.status || 'open',
    remark: challan.remark || '',
  }))
);

const fi = (label, node) => (
  <div className="field" style={{ flex: 1, minWidth: '120px' }}>
    <label>{label}</label>{node}
  </div>
);

/* ─────────────────────────────────────────────
   MATERIAL CARD
───────────────────────────────────────────── */
function printChallan(c) {
  const materialsHtml = (c.materials || [{ type: c.material, totalBags: c.quantity }]).map((m, i) => `
    <tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#fff'}">
      <td>${m.type || '—'}</td>
      <td style="text-align:right">${m.totalBags || 0}</td>
      <td style="text-align:right">${((m.totalBags || 0) * 0.05).toFixed(2)}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Challan #${c.challanNo}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;padding:10mm}
  h1{font-size:16px;font-weight:900;text-align:center;letter-spacing:1px}
  .sub{text-align:center;font-size:10px;color:#555;margin:2px 0 10px}
  .meta{display:flex;justify-content:space-between;margin-bottom:10px;padding:8px 12px;background:#f5f5f5;border-radius:4px}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}th{padding:6px 8px;background:#333;color:#fff;font-size:10px;text-align:left}
  td{padding:5px 8px;border-bottom:1px solid #e5e5e5}
  .sig{display:flex;justify-content:space-between;margin-top:40px}
  .sl{min-width:120px;border-top:1px solid #000;padding-top:4px;text-align:center;font-size:10px}
  @media print{body{padding:0}}</style></head><body>
  <h1>Vikas Goods Transport</h1>
  <div class="sub">Challan Print</div>
  <div class="meta">
    <span><b>Challan No:</b> ${c.challanNo || '—'}</span>
    <span><b>Date:</b> ${new Date(c.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
    <span><b>Truck:</b> ${c.truckNo || '—'}</span>
  </div>
  <div class="meta" style="background:#fff;border:1px solid #e5e5e5">
    <span><b>Party:</b> ${c.partyName || '—'}</span>
    <span><b>Status:</b> ${c.status ? c.status.toUpperCase() : 'OPEN'}</span>
  </div>
  <table>
    <thead><tr><th>Material</th><th style="text-align:right">Total Bags</th><th style="text-align:right">Weight (MT)</th></tr></thead>
    <tbody>${materialsHtml}</tbody>
  </table>
  <div style="font-size:10px;color:#444"><b>Remark:</b> ${c.remark || 'N/A'}</div>
  <div class="sig"><div class="sl">Driver</div><div class="sl">Authorised Sign</div></div>
  <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
  </body></html>`;
  const w = window.open('', '_blank', 'width=800,height=600');
  w.document.write(html); w.document.close();
}

function MatCard({ mat, added, lrUsed, sold, held, pendingChallan }) {
  const available = added - lrUsed - sold - held;
  const col = getMatCol(mat);
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
          { label: 'Available', val: available, color: available < 0 ? 'var(--danger)' : col },
          { label: 'Challan Pending', val: (pendingChallan || 0), color: 'var(--warn)' },
          { label: 'Sold', val: (sold || 0), color: 'var(--accent)' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ textAlign: 'center', padding: '10px 6px', background: 'var(--bg)', borderRadius: '10px', border: label === 'Available' ? `1px solid ${col}44` : '1px solid transparent' }}>
            <div style={{ fontSize: '18px', fontWeight: 900, color, lineHeight: 1 }}>
              {val.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '9.5px', fontWeight: 800, color: 'var(--text-muted)', marginTop: '2px' }}>{(val * 0.05).toFixed(2)} MT</div>
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
  // canEdit: checks brand-specific key first, then generic 'stock' key
  const stockKey = brand === 'kosli' ? 'stock_kosli' : brand === 'jhajjar' ? 'stock_jhajjar' : 'stock_jkl';
  const canEdit = role === 'admin' || permissions?.[stockKey] === 'edit' || permissions?.stock === 'edit';
  let API, API_LR;

  if (brand === 'jkl') {
    API = `${BASE_API}/jkl/stock`;
    API_LR = `${BASE_API}/jkl/lr`;
  } else if (brand === 'kosli') {
    API = `${BASE_API}/kosli/stock`;
    API_LR = `${BASE_API}/kosli/lr`;
  } else if (brand === 'jhajjar') {
    API = `${BASE_API}/jhajjar/stock`;
    API_LR = `${BASE_API}/jhajjar/lr`;
  } else {
    API = `${BASE_API}/stock`;
    API_LR = `${BASE_API}/lr`;
  }
  
  const [materialObjs, setMaterialObjs] = useState([]);
  const MATS = materialObjs.length > 0 ? materialObjs.map(m => m.name) : (brand === 'jkl' ? MATS_JKL_FALLBACK : MATS_DUMP_FALLBACK);

  const [additions, setAdditions] = useState([]);
  const [challans, setChallans] = useState([]);
  const [lrs, setLrs] = useState([]);
  const [sales, setSales] = useState([]);
  const [vehicles, setVehicles] = useState([]); // Added vehicles state
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(initialTab || 'overview'); // overview|history|migo|challan
  const [showMigoForm, setShowMigoForm] = useState(false);
  const [showChallanForm, setShowChallanForm] = useState(false);
  const [showMatManager, setShowMatManager] = useState(false);
  const [newMatName, setNewMatName] = useState('');
  const [challanFilter, setChallanFilter] = useState('open'); // open|loaded|cancelled|all
  const [delTarget, setDelTarget] = useState(null);

  /* Stock Transfer state */
  const [transfers, setTransfers] = useState([]);
  const [transferForm, setTransferForm] = useState({ sourceMaterial: '', destMaterial: '', quantity: '', partyName: '', challanNo: '', date: new Date().toISOString().slice(0, 10), remark: '' });
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferErr, setTransferErr] = useState('');

  /* Excel-style filters */
  const [filters, setFilters] = useState({});
  const handleFilterChange = (key, val) => setFilters(f => ({ ...f, [key]: val }));

  /* form helper */
  const fi = (label, el) => (<div className="field" style={{ flex: 1, minWidth: '140px' }}><label>{label}</label>{el}</div>);

  /* forms */
  const getEmptyMigo = () => ({ material: MATS[0], quantity: '', date: new Date().toISOString().slice(0, 10), remark: '', truckNo: '' });
  const getEmptyChal = () => ({ truckNo: '', material: MATS[0], quantity: '', partyName: '', partyCode: '', billNo: '', date: new Date().toISOString().slice(0, 10), remark: '', lrNo: '' });
  const [migoForm, setMigoForm] = useState(getEmptyMigo());
  const [chalForm, setChalForm] = useState(getEmptyChal());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Update tab when initialTab prop changes from sidebar navigation
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  // Update form defaults when navigating between brands
  useEffect(() => {
    setMigoForm(f => ({ ...f, material: MATS[0] }));
    setChalForm(f => ({ ...f, material: MATS[0] }));
  }, [brand]);

  useEffect(() => { fetchAll(); fetchTransfers(); }, [brand]);
  const fetchAll = async () => {
    setLoading(true);
    try {
      const [ad, ch, lr, vh, sl, matsRaw] = await Promise.all([
        ax.get(API + '/additions').then(r => r.data),
        ax.get(API + '/challans').then(r => r.data),
        ax.get(API_LR).then(r => r.data),
        ax.get(`/vehicles`).then(r => r.data).catch(() => []),
        ax.get(`/sell?brand=${brand}`).then(r => r.data).catch(() => []),
        ax.get(`${API}/materials/list`).then(r => r.data).catch(() => [])
      ]);
      setAdditions(ad); setChallans(ch); setLrs(lr); setVehicles(vh); setSales(sl);
      if (matsRaw && matsRaw.length > 0) setMaterialObjs(matsRaw);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  /* ── Stock Transfers ── */
  const fetchTransfers = async () => {
    try { setTransfers((await ax.get('/stock-transfers')).data); } catch { setTransfers([]); }
  };

  const STOCK_LOCATIONS = [
    { key: 'kosli', label: 'Kosli Stock' },
    { key: 'jhajjar', label: 'Jhajjar Stock' },
    { key: 'jkl', label: 'JK Lakshmi Stock' },
  ];

  const handleTransfer = async (e) => {
    e.preventDefault(); setTransferErr('');
    if (!transferForm.sourceMaterial || !transferForm.destMaterial) { setTransferErr('Select both source and destination materials'); return; }
    if (transferForm.sourceMaterial === transferForm.destMaterial) { setTransferErr('Source and destination material cannot be the same'); return; }
    if (!transferForm.quantity || parseInt(transferForm.quantity) <= 0) { setTransferErr('Enter valid quantity'); return; }
    setTransferSaving(true);
    try {
      await ax.post('/stock-transfers', { ...transferForm, stockLocation: brand });
      setTransferForm({ sourceMaterial: '', destMaterial: '', quantity: '', partyName: '', challanNo: '', date: new Date().toISOString().slice(0, 10), remark: '' });
      fetchAll(); fetchTransfers();
    } catch (er) { setTransferErr(er.response?.data?.error || 'Transfer failed'); }
    finally { setTransferSaving(false); }
  };

  /* Party-wise summary */
  const partySummary = useMemo(() => {
    const map = {};
    challans.forEach(ch => {
      const pn = ch.partyName || 'Unknown Party';
      if (!map[pn]) map[pn] = { partyName: pn, challans: [], trucks: new Set(), materials: {}, totalBags: 0, loadedBags: 0 };
      map[pn].challans.push(ch);
      if (ch.truckNo) map[pn].trucks.add(ch.truckNo);
      if (ch.materials) {
        ch.materials.forEach(m => {
          if (!map[pn].materials[m.type]) map[pn].materials[m.type] = { total: 0, loaded: 0 };
          map[pn].materials[m.type].total += (m.totalBags || 0);
          map[pn].materials[m.type].loaded += (m.loadedBags || 0);
          map[pn].totalBags += (m.totalBags || 0);
          map[pn].loadedBags += (m.loadedBags || 0);
        });
      } else if (ch.material) {
        if (!map[pn].materials[ch.material]) map[pn].materials[ch.material] = { total: 0, loaded: 0 };
        const qty = parseInt(ch.quantity) || 0;
        map[pn].materials[ch.material].total += qty;
        map[pn].totalBags += qty;
      }
    });
    return Object.values(map).sort((a, b) => b.totalBags - a.totalBags);
  }, [challans]);

  /* ── Manage Materials ── */
  const handleAddMaterial = async (e) => {
    e.preventDefault();
    if (!newMatName.trim()) return;
    try {
      await ax.post(`${API}/materials`, { name: newMatName });
      setNewMatName('');
      fetchAll();
    } catch (er) { alert(er.response?.data?.error || 'Failed to add material'); }
  };
  const handleDeleteMaterial = async (id, name) => {
    if (!window.confirm(`Delete material type "${name}"? Existing records will not be affected.`)) return;
    try {
      await ax.delete(`${API}/materials/${id}`);
      fetchAll();
    } catch (er) { alert(er.response?.data?.error || 'Failed to delete material'); }
  };

  /* ── stock math per material ── */
  const stockMap = useMemo(() => {
    const m = {};
    MATS.forEach(mat => {
      const added = additions.filter(a => a.material === mat).reduce((s, a) => s + (parseFloat(a.quantity) || 0), 0);
      const consumedRows = lrs.filter(l => l.material === mat);
      const lrUsed = consumedRows.reduce((s, l) => s + (parseInt(l.totalBags) || 0), 0);
      // Pending = bags not yet covered by any challan (includes fully uncovered AND partially covered LRs)
      let pending = 0;
      consumedRows.forEach(l => {
        const lrBags = parseInt(l.totalBags) || 0;
        if (!l.billing || l.billing === 'No') {
          pending += lrBags; // no challan linked at all
        } else {
          // Check how many bags are actually covered by the linked challans
          let covered = 0;
          l.billing.split(',').forEach(cNo => {
            const ch = challans.find(c => c.challanNo === cNo.trim());
            if (ch) {
              if (ch.materials) {
                const matEntry = ch.materials.find(mo => mo.type === mat);
                if (matEntry) covered += (matEntry.totalBags || 0);
              } else if (ch.material === mat) {
                covered += parseInt(ch.quantity || 0);
              }
            }
          });
          pending += Math.max(0, lrBags - covered); // only the uncovered remainder
        }
      });
      const sold = sales.filter(s => s.material === mat).reduce((s, x) => s + (parseInt(x.quantity) || 0), 0);

      let held = 0;
      challans.forEach(c => {
        if (c.status === 'open' || c.status === 'partially_loaded') {
          if (c.materials) {
            const matObj = c.materials.find(mo => mo.type === mat);
            if (matObj) {
              held += (matObj.totalBags - (matObj.loadedBags || 0));
            }
          } else if (c.material === mat) {
            held += parseFloat(c.quantity) || 0;
          }
        }
      });

      m[mat] = { added, lrUsed, sold, held, pendingChallan: pending, available: added - lrUsed - sold - held };
    });
    return m;
  }, [additions, challans, lrs, sales, MATS]);

  const monthlyStats = useMemo(() => {
    const months = {};
    additions.forEach(a => {
      const m = a.date.slice(0, 7);
      if (!months[m]) months[m] = { in: 0, out: 0 };
      months[m].in += (parseFloat(a.quantity) || 0);
    });
    lrs.forEach(l => {
      const m = l.date.slice(0, 7);
      if (!months[m]) months[m] = { in: 0, out: 0 };
      months[m].out += (parseInt(l.totalBags) || 0);
    });
    sales.forEach(s => {
      const m = s.date.slice(0, 7);
      if (!months[m]) months[m] = { in: 0, out: 0 };
      months[m].out += (parseInt(s.quantity) || 0);
    });
    return Object.keys(months).sort().reverse().map(m => ({
      month: m,
      ...months[m]
    }));
  }, [additions, lrs, sales]);

  const monthlyDetailStats = useMemo(() => {
    const rows = {};
    const ensureRow = (month, material, loadingType) => {
      const key = [month, material, loadingType].join('||');
      if (!rows[key]) {
        rows[key] = {
          month,
          material,
          loadingType,
          in: 0,
          lrOut: 0,
          saleOut: 0
        };
      }
      return rows[key];
    };

    additions.forEach(a => {
      const row = ensureRow((a.date || '').slice(0, 7), a.material || 'UNKNOWN', 'Stock In');
      row.in += parseFloat(a.quantity) || 0;
    });

    lrs.forEach(l => {
      const row = ensureRow((l.date || '').slice(0, 7), l.material || 'UNKNOWN', l.loadingType || 'From Godown');
      row.lrOut += parseInt(l.totalBags) || 0;
    });

    sales.forEach(s => {
      const row = ensureRow((s.date || '').slice(0, 7), s.material || 'UNKNOWN', 'Direct Sale');
      row.saleOut += parseInt(s.quantity) || 0;
    });

    return Object.values(rows)
      .filter(row => row.month)
      .sort((a, b) =>
        a.month === b.month
          ? `${a.material}${a.loadingType}`.localeCompare(`${b.material}${b.loadingType}`)
          : b.month.localeCompare(a.month)
      );
  }, [additions, lrs, sales]);

  const partySuggestions = useMemo(() => buildPartySuggestions(
    challans.map(c => c.partyName),
    lrs.map(l => l.partyName)
  ), [challans, lrs]);

  const totalAvailable = MATS.reduce((s, mat) => s + (stockMap[mat]?.available || 0), 0);
  const totalHeld = MATS.reduce((s, mat) => s + (stockMap[mat]?.held || 0), 0);

  /* ── handlers ── */
  const [isConfirmingMigo, setIsConfirmingMigo] = useState(false);
  const triggerMigo = e => {
    e.preventDefault(); setErr('');
    if (!migoForm.quantity || parseFloat(migoForm.quantity) <= 0) { setErr('Enter valid quantity'); return; }
    setIsConfirmingMigo(true);
  };
  const executeMigo = async () => {
    setSaving(true); setIsConfirmingMigo(false);
    if (!validateTruckNo(migoForm.truckNo)) { setErr('Invalid truck format (e.g. RJ07GA1234 or HR161234)'); setSaving(false); return; }
    try { await ax.post(API + '/additions', migoForm); setMigoForm(getEmptyMigo()); fetchAll(); }
    catch (er) { setErr(er.response?.data?.error || 'Error'); } finally { setSaving(false); }
  };

  const [isConfirmingChallan, setIsConfirmingChallan] = useState(false);
  const [challanWarning, setChallanWarning] = useState('');

  const triggerChallan = e => {
    e.preventDefault(); setErr('');
    if (!chalForm.lrNo) { setErr('LR Number required'); return; }
    if (!chalForm.truckNo) { setErr('Truck number required'); return; }
    if (!validateTruckNo(chalForm.truckNo)) { setErr('Invalid truck format (e.g. RJ07GA1234 or HR161234)'); return; }
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
    try { 
      const res = await ax.post(API + '/challans', { ...chalForm, partyName: resolvePartyName(chalForm.partyName, partySuggestions) });
      const newChNo = res.data.challanNo;

      if (chalForm.lrNo) {
        // Link it to the provided LR
        const lr = lrs.find(r => String(r.lrNo).trim().toLowerCase() === String(chalForm.lrNo).trim().toLowerCase());
        if (lr) {
           const existingBilling = (lr.billing && lr.billing !== 'No') ? lr.billing : '';
           const newBilling = existingBilling ? `${existingBilling}, ${newChNo}` : newChNo;
           await ax.patch(`${API_LR}/${lr.id}/billing`, { billing: newBilling });

           let SYNC_API;
           if (brand === 'jkl') SYNC_API = `${BASE_API}/jkl/stock/sync-lr`;
           else if (brand === 'kosli') SYNC_API = `${BASE_API}/kosli/stock/sync-lr`;
           else if (brand === 'jhajjar') SYNC_API = `${BASE_API}/jhajjar/stock/sync-lr`;
           else SYNC_API = `${BASE_API}/stock/sync-lr`;

           let challanBags = parseInt(chalForm.quantity || 0);
           
           // Compute already covered bags for this LR
           let alreadyCovered = 0;
           if (lr.billing && lr.billing !== 'No') {
              lr.billing.split(',').forEach(cNo => {
                 const existCh = challans.find(c => c.challanNo === cNo.trim());
                 if (existCh) {
                    if (existCh.materials) {
                       const mat = existCh.materials.find(m => m.type === lr.material);
                       if (mat) alreadyCovered += (mat.totalBags || 0);
                    } else if (existCh.material === lr.material) {
                       alreadyCovered += parseInt(existCh.quantity || 0);
                    }
                 }
              });
           }

           const remainingNeeded = Math.max(0, parseInt(lr.totalBags || 0) - alreadyCovered);
           const toDeduct = Math.min(challanBags, remainingNeeded);

           await ax.post(SYNC_API, {
              oldChallanNos: '',
              newChallanNos: newChNo,
              material: lr.material,
              quantity: toDeduct
           });
        }
      }

      setChalForm(getEmptyChal()); fetchAll(); 
    }
    catch (er) { setErr(er.response?.data?.error || 'Error'); } finally { setSaving(false); }
  };

  const updateStatus = async (id, status) => {
    if (!canEdit) {
      alert('Permission denied (Edit access required)');
      return;
    }
    try { await ax.patch(API + '/challans/' + id, { status }); fetchAll(); }
    catch (er) { alert(er.response?.data?.error || 'Error'); }
  };

  const deleteItem = async () => {
    if (!delTarget) return;
    if (role !== 'admin') {
      alert('Only administrators can delete entries');
      setDelTarget(null);
      return;
    }
    try {
      if (delTarget.type === 'addition') await ax.delete(API + '/additions/' + delTarget.id);
      else await ax.delete(API + '/challans/' + delTarget.id);
      fetchAll();
    } catch (er) { alert('Delete failed'); }
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

  const exportChallanExcel = () => exportToExcel(
    buildChallanExportRows(filteredChallans).map(row => ({
      ChallanNo: row.challanNo,
      Date: row.date,
      Truck: row.truckNo,
      Material: row.material,
      Quantity: row.quantity,
      Loading_Details: row.loadingDetails,
      Party: row.partyName,
      Status: row.status,
      Remark: row.remark
    })),
    `Challans_${new Date().toISOString().slice(0, 10)}`
  );
  const exportChallanPDF = () => exportToPDF(
    buildChallanExportRows(filteredChallans),
    'Challan List',
    ['challanNo', 'date', 'truckNo', 'material', 'quantity', 'loadingDetails', 'partyName', 'status', 'remark']
  );

  const exportHistoryExcel = () => exportToExcel(historyRows.map(r => ({ Date: r.date, Type: r.displayType, Details: r.label, Truck: r.truckNo, Material: r.material, In_Bags: r.credit, Out_Bags: r.debit })), `Stock_History_${new Date().toISOString().slice(0, 10)}`);
  const exportHistoryPDF = () => exportToPDF(historyRows, 'Stock History', ['date', 'displayType', 'label', 'truckNo', 'material', 'credit', 'debit']);

  const renderHistoryTable = (rows) => (
    <div className="tbl-wrap">
      <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={TH}><ColumnFilter label="Date" colKey="date" data={rows} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
          <th style={TH}><ColumnFilter label="Type" colKey="displayType" data={rows} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
          <th style={TH}><ColumnFilter label="Reference / Details" colKey="label" data={rows} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
          <th style={TH}><ColumnFilter label="Truck" colKey="truckNo" data={rows} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
          <th style={TH}><ColumnFilter label="Material" colKey="material" data={rows} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
          <th style={TH}>In (bags)</th>
          <th style={TH}>Out (bags)</th>
          {role === 'admin' && <th style={TH}>By</th>}
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={8} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>No records found</td></tr>}
          {rows.map((r, i) => (
            <tr key={r.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
              <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
              <td style={{ ...TD }}>
                {r.txType === 'add'
                  ? <span style={{ padding: '2px 8px', borderRadius: '5px', background: 'rgba(16,185,129,0.1)', color: 'var(--accent)', fontSize: '10px', fontWeight: 800 }}>MIGO In</span>
                  : r.txType === 'lr' 
                    ? <span style={{ padding: '2px 8px', borderRadius: '5px', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', fontSize: '10px', fontWeight: 800 }}>LR Use</span>
                    : <span style={{ padding: '2px 8px', borderRadius: '5px', background: 'rgba(236,72,153,0.1)', color: '#ec4899', fontSize: '10px', fontWeight: 800 }}>Sale</span>
                }
              </td>
              <td style={{ ...TD, fontWeight: 600, color: 'var(--text-sub)' }}>{r.label || '—'}</td>
              <td style={{ ...TD, fontWeight: 700 }}>{r.truckNo || '—'}</td>
              <td style={{ ...TD }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: getMatCol(r.material), display: 'inline-block' }} />
                  {r.material || '—'}
                </span>
              </td>
              <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>
                <div style={{ color: 'var(--accent)' }}>{r.credit > 0 ? (r.credit || 0).toLocaleString() : '—'}</div>
                {r.credit > 0 && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{(r.credit * 0.05).toFixed(2)} MT</div>}
              </td>
              <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>
                <div style={{ color: 'var(--danger)' }}>{r.debit > 0 ? (r.debit || 0).toLocaleString() : '—'}</div>
                {r.debit > 0 && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{(r.debit * 0.05).toFixed(2)} MT</div>}
              </td>
              {role === 'admin' && <td style={{ ...TD, fontSize: '11px', color: 'var(--text-muted)' }}>{r.createdBy || '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      {/* Delete confirm */}
      <AnimatePresence>
        {delTarget && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: '16px', padding: '26px 22px', width: '90%', maxWidth: '300px', textAlign: 'center' }}>
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
          <h1><Package size={20} color="#a855f7" /> {brand === 'jkl' ? 'JK Lakshmi' : brand === 'kosli' ? 'Kosli' : brand === 'jhajjar' ? 'Jhajjar' : 'Dump'} Stock</h1>
          <p>Material inventory & challan management</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {role === 'admin' && (
            <button onClick={() => setShowMatManager(true)} className="btn btn-g btn-sm" style={{ fontWeight: 800 }}>
               <Tag size={13} /> Manage Materials
            </button>
          )}
          <button onClick={() => setTab('migo')} className="btn btn-a btn-sm" style={{ fontWeight: 800 }}>
             <Plus size={13} /> MIGO Entry
          </button>
          <button onClick={() => setTab('challan')} className="btn btn-p btn-sm" style={{ fontWeight: 800 }}>
             <Tag size={13} /> Create Challan
          </button>
          <button className="btn btn-g btn-sm" onClick={fetchAll}><RefreshCw size={13} /> Refresh</button>
        </div>
      </div>


      {/* Quick summary strip */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total In (All Time)', val: additions.reduce((s, a) => s + (parseFloat(a.quantity) || 0), 0), color: '#10b981' },
          { label: 'Net Available', val: totalAvailable, color: '#a855f7' },
          { label: 'Challan Created', val: totalHeld, color: 'var(--warn)', unit: 'bags' },
          { label: 'Open Challans', val: challans.filter(c => c.status === 'open' || c.status === 'partially_loaded').length, color: 'var(--primary)', unit: 'challans' },
          { label: 'LR Challan Pending', val: Object.values(stockMap).reduce((s, m) => s + (m.pendingChallan || 0), 0), color: '#f43f5e', unit: 'bags' },
        ].map(({ label, val, color, unit = 'bags' }) => (
          <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '150px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '20px', fontWeight: 900, color, lineHeight: 1 }}>{val.toLocaleString('en-IN')}</span>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>{unit}</span>
            </div>
            {unit === 'bags' && <span style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--text-sub)', marginTop: '2px' }}>{(val * 0.05).toFixed(2)} MT</span>}
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {[
          { id: 'overview', label: 'Overview', icon: <Package size={13} /> },
          { id: 'monthly', label: 'Monthly Report', icon: <TrendingDown size={13} /> },
          { id: 'history', label: 'Full History', icon: <FileText size={13} /> },
          { id: 'migo', label: 'MIGO (Stock Entry)', icon: <Plus size={13} />, restricted: true },
          { id: 'challan', label: 'Create Challan', icon: <Tag size={13} />, restricted: true },
          { id: 'transfer', label: 'Transfer Stock', icon: <ArrowRightLeft size={13} />, restricted: true },
          { id: 'party_summary', label: 'Party Summary', icon: <Users size={13} /> },
        ].map(({ id, label, icon, restricted }) => {
          if (restricted && !canEdit) return null;
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
      
      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '12px' }}>
            {MATS.map(mat => <MatCard key={mat} mat={mat} {...(stockMap[mat] || { added: 0, lrUsed: 0, sold: 0, held: 0 })} />)}
          </div>

          {/* Inline History in Overview */}
          <div className="card">
            <div className="card-header">
               <div className="card-title-block">
                  <div className="card-icon" style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--primary)' }}><Clock size={17} /></div>
                  <div className="card-title-text"><h3>Recent Movements</h3><p>Last 10 entries across all materials</p></div>
               </div>
               <button onClick={() => setTab('history')} className="btn btn-g btn-sm">View Full History <ChevronRight size={14} /></button>
            </div>
            {renderHistoryTable(historyRows.slice(0, 10))}
          </div>
        </div>
      )}

      {tab === 'monthly' && (
        <div className="card">
          <div className="card-header">
             <div className="card-title-block">
                <div className="card-icon" style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}><TrendingDown size={17} /></div>
                <div className="card-title-text"><h3>Monthly Summary</h3><p>Detailed month, material, and loading-type report</p></div>
             </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl" style={{ minWidth: '1280px' }}>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Material</th>
                  <th>Loading Type</th>
                  <th className="c">Stock In</th>
                  <th className="c">LR Out</th>
                  <th className="c">Sale Out</th>
                  <th className="c">Total Out (Bags)</th>
                  <th className="c">Net (Bags)</th>
                  <th className="c">Net (MT)</th>
                </tr>
              </thead>
              <tbody>
                {monthlyDetailStats.length === 0 ? <tr><td colSpan={9} className="t-empty">No data available</td></tr> :
                  monthlyDetailStats.map(s => {
                    const totalOut = s.lrOut + s.saleOut;
                    const net = s.in - totalOut;
                    return (
                      <tr key={`${s.month}-${s.material}-${s.loadingType}`}>
                        <td><span style={{ fontWeight: 800 }}>{new Date(s.month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span></td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: getMatCol(s.material), display: 'inline-block' }} />
                            {s.material}
                          </span>
                        </td>
                        <td><span className="badge badge-tag">{s.loadingType}</span></td>
                        <td className="c"><span style={{ color: '#10b981', fontWeight: 800 }}>{s.in.toLocaleString('en-IN')}</span></td>
                        <td className="c"><span style={{ color: '#6366f1', fontWeight: 800 }}>{s.lrOut.toLocaleString('en-IN')}</span></td>
                        <td className="c"><span style={{ color: '#ec4899', fontWeight: 800 }}>{s.saleOut.toLocaleString('en-IN')}</span></td>
                        <td className="c"><span style={{ color: '#f43f5e', fontWeight: 800 }}>{totalOut.toLocaleString('en-IN')}</span></td>
                        <td className="c"><span style={{ color: net < 0 ? '#ef4444' : '#6366f1', fontWeight: 900 }}>{net.toLocaleString('en-IN')}</span></td>
                        <td className="c"><span className="badge badge-tag">{(net * 0.05).toFixed(2)} MT</span></td>
                      </tr>
                    );
                  })
                }
              </tbody>
            </table>
          </div>
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


      {/* ── MIGO TAB ── */}
      {tab === 'migo' && (
        <div>
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-header"><div className="card-title-block">
              <div className="card-icon" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--accent)' }}><Plus size={17} /></div>
              <div className="card-title-text"><h3>{brand === 'jkl' ? 'JK Lakshmi MIGO (Stock Entry)' : 'MIGO — Stock Entry'}</h3><p>Record new material delivery into inventory</p></div>
            </div></div>
            <form onSubmit={triggerMigo} style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                {fi('Truck Number', <>
                  <input className="fi" type="text" placeholder="e.g. GJ01AB1234" required list="migo-truck-list"
                    value={migoForm.truckNo} onChange={e => setMigoForm(f => ({ ...f, truckNo: cleanTruckNo(e.target.value) }))} />
                  <datalist id="migo-truck-list">
                    {vehicles.map(v => <option key={v.id} value={v.truckNo} />)}
                  </datalist>
                </>)}
                {fi('Material', <select className="fi" value={migoForm.material} onChange={e => setMigoForm(f => ({ ...f, material: e.target.value }))}>
                  {MATS.map(m => <option key={m}>{m}</option>)}</select>)}
                {fi('Quantity (bags)', <>
                  <input className="fi" type="number" step="1" min="1" required placeholder="e.g. 500"
                    value={migoForm.quantity} onChange={e => setMigoForm(f => ({ ...f, quantity: e.target.value }))} />
                  {migoForm.quantity && <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--accent)', marginTop: '4px' }}>= {(migoForm.quantity * 0.05).toFixed(2)} MT</div>}
                </>)}
                {fi('Date', <input className="fi" type="date" value={migoForm.date} onChange={e => setMigoForm(f => ({ ...f, date: e.target.value }))} />)}
                {fi('Remark', <input className="fi" type="text" placeholder="Supplier name / note"
                  value={migoForm.remark} onChange={e => setMigoForm(f => ({ ...f, remark: e.target.value }))} />)}
                <button type="submit" className="btn btn-a" disabled={saving || !canEdit} style={{ height: '38px', alignSelf: 'flex-end', fontWeight: 800 }}>
                  {saving ? '…' : <><Check size={14} /> Post MIGO Entry</>}
                </button>
              </div>
              {err && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '7px', fontWeight: 600 }}>{err}</div>}
            </form>
          </div>
          <ConfirmSaveModal
            isOpen={isConfirmingMigo}
            onClose={() => setIsConfirmingMigo(false)}
            onConfirm={executeMigo}
            title="MIGO (Stock Entry)"
            message={`Are you sure you want to add ${migoForm.quantity} bags of ${migoForm.material} from Truck ${migoForm.truckNo}?`}
            isSaving={saving}
          />
        </div>
      )}

      {/* ── MIGO TAB ── */}
      {tab === 'migo' && (
        <div className="card">
          <div className="card-header"><div className="card-title-block">
            <div className="card-icon" style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}><Archive size={17} /></div>
            <div className="card-title-text"><h3>Stock Arrival History (MIGO)</h3><p>{additions.length} total entries</p></div>
          </div></div>
          <div className="tbl-wrap">
            <table className="tbl" style={{ minWidth: '1000px', width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={TH}>Date</th>
                <th style={TH}>Truck #</th>
                <th style={TH}>Material</th>
                <th style={TH}>Quantity</th>
                <th style={TH}>Remark</th>
                {role === 'admin' && <th style={TH}>By</th>}
                <th style={TH}>Action</th>
              </tr></thead>
              <tbody>
                {additions.length === 0 && <tr><td colSpan={7} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>No arrivals yet</td></tr>}
                {[...additions].sort((a, b) => a.date > b.date ? -1 : 1).map((a, i) => (
                  <tr key={a.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(a.date)}</td>
                    <td style={{ ...TD, fontWeight: 800, color: 'var(--primary)' }}>{a.truckNo || '—'}</td>
                    <td style={{ ...TD }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: getMatCol(a.material), display: 'inline-block' }} />
                        {a.material}
                      </span>
                    </td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>
                       <div style={{ color: 'var(--accent)' }}>{(a.quantity || 0).toLocaleString()} bags</div>
                       <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{(a.quantity * 0.05).toFixed(2)} MT</div>
                    </td>
                    <td style={{ ...TD, color: 'var(--text-muted)' }}>{a.remark || '—'}</td>
                    {role === 'admin' && <td style={{ ...TD, fontSize: '11px', color: 'var(--text-muted)' }}>{a.createdBy || '—'}</td>}
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
      )}

      {/* ── CHALLAN TAB ── */}
      {tab === 'challan' && (
        <div>
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-header"><div className="card-title-block">
              <div className="card-icon" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warn)' }}><Tag size={17} /></div>
              <div className="card-title-text"><h3>Dispatch New Challan</h3><p>Assign stock to a vehicle (Challan Created status)</p></div>
            </div></div>
            <form onSubmit={triggerChallan} style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                {fi('LR Number', <>
                  <input className="fi" type="text" placeholder="e.g. 1234" required list="stock-lr-list"
                    value={chalForm.lrNo || ''} onChange={e => setChalForm(f => ({ ...f, lrNo: e.target.value }))} />
                  <datalist id="stock-lr-list">
                    {lrs.map(l => <option key={l.id} value={l.lrNo} />)}
                  </datalist>
                </>)}
                {fi('Truck No. (Auto-suggests)', <>
                  <input className="fi" type="text" placeholder="e.g. GJ01AB1234" required list="stock-truck-list"
                    value={chalForm.truckNo} onChange={e => setChalForm(f => ({ ...f, truckNo: cleanTruckNo(e.target.value) }))} />
                  <datalist id="stock-truck-list">
                    {vehicles.map(v => <option key={v.id} value={v.truckNo} />)}
                  </datalist>
                </>)}
                {fi('Material', <select className="fi" value={chalForm.material} onChange={e => setChalForm(f => ({ ...f, material: e.target.value }))}>
                  {MATS.map(m => <option key={m}>{m}</option>)}</select>)}
                {fi('Quantity (bags)', <>
                  <input className="fi" type="number" step="1" min="1" required placeholder="bags"
                    value={chalForm.quantity} onChange={e => setChalForm(f => ({ ...f, quantity: e.target.value }))} />
                  {chalForm.quantity && <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--warn)', marginTop: '4px' }}>= {(chalForm.quantity * 0.05).toFixed(2)} MT</div>}
                </>)}
                {fi('Party Name', <>
                  <input className="fi" type="text" placeholder="Customer / party" list="stock-party-list"
                    value={chalForm.partyName} onChange={e => setChalForm(f => ({ ...f, partyName: resolvePartyName(e.target.value, partySuggestions) }))} />
                  <datalist id="stock-party-list">
                    {partySuggestions.map(name => <option key={name} value={name} />)}
                  </datalist>
                </>)}
                {fi('Party Code', <input className="fi" type="text" placeholder="Optional party code"
                  value={chalForm.partyCode} onChange={e => setChalForm(f => ({ ...f, partyCode: e.target.value }))} />)}
                {fi('Bill No', <input className="fi" type="text" placeholder="Optional bill number"
                  value={chalForm.billNo} onChange={e => setChalForm(f => ({ ...f, billNo: e.target.value }))} />)}
                {fi('Date', <input className="fi" type="date" value={chalForm.date} onChange={e => setChalForm(f => ({ ...f, date: e.target.value }))} />)}
                {fi('Remark', <input className="fi" type="text" placeholder="Notes"
                  value={chalForm.remark} onChange={e => setChalForm(f => ({ ...f, remark: e.target.value }))} />)}
                <button type="submit" className="btn btn-p" disabled={saving || !canEdit} style={{ height: '38px', alignSelf: 'flex-end' }}>
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
                    {s === 'open' ? 'Challan Created' : s}
                    <span style={{ opacity: 0.7, marginLeft: '4px', fontSize: '10px' }}>
                      ({challans.filter(c => s === 'all' || c.status === s).length})
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: getMatCol(m.type) || '#ccc', display: 'inline-block' }} />
                                {m.type}
                              </div>
                            ))
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: getMatCol(c.material), display: 'inline-block' }} />
                              {c.material}
                            </span>
                          )}
                        </td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>
                          {c.materials ? (
                            c.materials.map((m, idx) => (
                              <div key={idx} style={{ marginBottom: '6px' }}>
                                {m.loadedBags > 0 ? (
                                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{m.loadedBags} loaded / </div>
                                ) : null}
                                <div style={{ fontSize: '13px' }}>{(m.totalBags || 0).toLocaleString()} bags</div>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{((m.totalBags || 0) * 0.05).toFixed(2)} MT</div>
                              </div>
                            ))
                          ) : (
                            <>
                                <div style={{ fontSize: '13px' }}>{(c.quantity || 0).toLocaleString()} bags</div>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{(c.quantity * 0.05).toFixed(2)} MT</div>
                            </>
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
                            <button className="btn btn-g btn-sm btn-icon" title="Print Challan" onClick={() => printChallan(c)}><Printer size={13} /></button>
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
                                onClick={() => { if (role === 'admin') setDelTarget({ id: c.id, type: 'challan', label: c.challanNo + ' — ' + c.truckNo }) }}>
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
              <div className="card-title-text" style={{ flex: 1 }}><h3>Full Stock History</h3><p>{historyRows.length} total activity entries</p></div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-g btn-sm" onClick={exportHistoryExcel}><Download size={13} /> Excel</button>
              <button className="btn btn-g btn-sm" onClick={exportHistoryPDF}><Printer size={13} /> PDF</button>
            </div>
          </div>
          {renderHistoryTable(historyRows)}
        </div>
      )}

      {/* ── TRANSFER STOCK TAB ── */}
      {tab === 'transfer' && (
        <div>
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-header">
              <div className="card-title-block">
                <div className="card-icon" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}><ArrowRightLeft size={17} /></div>
                <div className="card-title-text"><h3>Transfer Stock</h3><p>Convert material types within {STOCK_LOCATIONS.find(l => l.key === brand)?.label || brand}</p></div>
              </div>
            </div>
            <form onSubmit={handleTransfer} style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                {fi('Convert From *', <select className="fi" value={transferForm.sourceMaterial} onChange={e => setTransferForm(f => ({ ...f, sourceMaterial: e.target.value }))} required>
                  <option value="">Select source material...</option>
                  {MATS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>)}
                {fi('Convert To *', <select className="fi" value={transferForm.destMaterial} onChange={e => setTransferForm(f => ({ ...f, destMaterial: e.target.value }))} required>
                  <option value="">Select destination material...</option>
                  {MATS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>)}
                {fi('Quantity (bags) *', <input className="fi" type="number" min="1" placeholder="Bags" value={transferForm.quantity} onChange={e => setTransferForm(f => ({ ...f, quantity: e.target.value }))} required />)}
                {fi('Party Name', <input className="fi" type="text" placeholder="Party" value={transferForm.partyName} onChange={e => setTransferForm(f => ({ ...f, partyName: e.target.value }))} list="transfer-party-list" />)}
                <datalist id="transfer-party-list">{partySuggestions.map(p => <option key={p} value={p} />)}</datalist>
                {fi('Challan No.', <input className="fi" type="text" placeholder="CH-XXXX" value={transferForm.challanNo} onChange={e => setTransferForm(f => ({ ...f, challanNo: e.target.value }))} />)}
                {fi('Date', <input className="fi" type="date" value={transferForm.date} onChange={e => setTransferForm(f => ({ ...f, date: e.target.value }))} />)}
                {fi('Remark', <input className="fi" type="text" placeholder="Note" value={transferForm.remark} onChange={e => setTransferForm(f => ({ ...f, remark: e.target.value }))} />)}
                <button type="submit" className="btn btn-p" disabled={transferSaving} style={{ height: '38px', fontWeight: 800 }}>
                  {transferSaving ? '...' : <><ArrowRightLeft size={13} /> Transfer</>}
                </button>
              </div>
              {transferErr && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '8px', fontWeight: 600 }}>{transferErr}</div>}
            </form>
          </div>

          {/* Transfer History */}
          <div className="card">
            <div className="card-header">
              <div className="card-title-block">
                <div className="card-icon" style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}><FileText size={17} /></div>
                <div className="card-title-text"><h3>Transfer History</h3><p>{transfers.length} transfers recorded</p></div>
              </div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={TH}>#</th>
                  <th style={TH}>Date</th>
                  <th style={TH}>From Material</th>
                  <th style={TH}>To Material</th>
                  <th style={TH}>Quantity</th>
                  <th style={TH}>Party Name</th>
                  <th style={TH}>Challan No.</th>
                  <th style={TH}>Remark</th>
                  {role === 'admin' && <th style={TH}>Action</th>}
                </tr></thead>
                <tbody>
                  {transfers.length === 0 && <tr><td colSpan={role === 'admin' ? 9 : 8} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>No transfers recorded</td></tr>}
                  {transfers.map((t, i) => (
                    <tr key={t.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                      <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                      <td style={TD}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: getMatCol(t.sourceMaterial), display: 'inline-block' }} />
                          {t.sourceMaterial}
                        </span>
                      </td>
                      <td style={TD}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: getMatCol(t.destMaterial), display: 'inline-block' }} />
                          {t.destMaterial}
                        </span>
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>
                        <div>{(t.quantity || 0).toLocaleString('en-IN')} bags</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{((t.quantity || 0) * 0.05).toFixed(2)} MT</div>
                      </td>
                      <td style={{ ...TD, fontWeight: 700 }}>{t.partyName || '—'}</td>
                      <td style={{ ...TD, fontWeight: 700, fontFamily: 'monospace', color: 'var(--primary)' }}>{t.challanNo || '—'}</td>
                      <td style={TD}>{t.remark || '—'}</td>
                      {role === 'admin' && (
                        <td style={{ ...TD, textAlign: 'center' }}>
                          <button className="btn btn-d btn-icon btn-sm" onClick={async () => { if (window.confirm('Delete this transfer? (Note: Stock adjustments will NOT be reversed)')) { try { await ax.delete('/stock-transfers/' + t.id); fetchTransfers(); } catch { alert('Delete failed'); } }}} title="Delete"><Trash2 size={12} /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── PARTY SUMMARY TAB ── */}
      {tab === 'party_summary' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}><Users size={17} /></div>
              <div className="card-title-text"><h3>Party-Wise Summary</h3><p>{partySummary.length} parties with challan and loading details</p></div>
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={TH}>#</th>
                <th style={TH}>Party Name</th>
                <th style={TH}>Challans</th>
                <th style={TH}>Vehicles</th>
                <th style={TH}>Materials</th>
                <th style={TH}>Total Bags</th>
                <th style={TH}>Loaded</th>
                <th style={TH}>Pending</th>
              </tr></thead>
              <tbody>
                {partySummary.length === 0 && <tr><td colSpan={8} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>No party data found</td></tr>}
                {partySummary.map((p, i) => {
                  const pending = p.totalBags - p.loadedBags;
                  return (
                    <tr key={p.partyName} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                      <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ ...TD, fontWeight: 800, color: 'var(--text)' }}>{p.partyName}</td>
                      <td style={TD}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {p.challans.map(ch => (
                            <span key={ch.id} style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', fontSize: '10px', fontWeight: 700, fontFamily: 'monospace' }}>{ch.challanNo || '—'}</span>
                          ))}
                        </div>
                      </td>
                      <td style={TD}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {[...p.trucks].map(tn => (
                            <span key={tn} style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontSize: '10px', fontWeight: 700 }}>{tn}</span>
                          ))}
                        </div>
                      </td>
                      <td style={TD}>
                        {Object.entries(p.materials).map(([mat, info]) => (
                          <div key={mat} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: getMatCol(mat), display: 'inline-block' }} />
                            <span style={{ fontWeight: 700, fontSize: '11px' }}>{mat}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({info.total} bags, loaded: {info.loaded})</span>
                          </div>
                        ))}
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 800 }}>
                        <div>{p.totalBags.toLocaleString('en-IN')}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{(p.totalBags * 0.05).toFixed(2)} MT</div>
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>
                        <div>{p.loadedBags.toLocaleString('en-IN')}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{(p.loadedBags * 0.05).toFixed(2)} MT</div>
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: pending > 0 ? 'var(--warn)' : 'var(--accent)' }}>
                        <div>{pending.toLocaleString('en-IN')}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{(pending * 0.05).toFixed(2)} MT</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {partySummary.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--bg-tf)' }}>
                    <td colSpan={5} style={{ ...TD, fontWeight: 800, borderTop: '2px solid var(--border)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>Totals ({partySummary.length} parties)</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 900, borderTop: '2px solid var(--border)' }}>{partySummary.reduce((s, p) => s + p.totalBags, 0).toLocaleString('en-IN')}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 900, color: 'var(--accent)', borderTop: '2px solid var(--border)' }}>{partySummary.reduce((s, p) => s + p.loadedBags, 0).toLocaleString('en-IN')}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 900, color: 'var(--warn)', borderTop: '2px solid var(--border)' }}>{partySummary.reduce((s, p) => s + (p.totalBags - p.loadedBags), 0).toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── Material Manager Modal ── */}
      <AnimatePresence>
        {showMatManager && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', width: '90%', maxWidth: '420px', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Tag size={18} color="#f59e0b" /> Manage Materials
                  </h3>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Add or remove material types for `{brand.toUpperCase()}`</p>
                </div>
                <button className="btn btn-g btn-icon" onClick={() => setShowMatManager(false)}><X size={16} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '40vh', overflowY: 'auto', marginBottom: '16px', paddingRight: '4px' }}>
                {materialObjs.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg)', borderRadius: '10px', border: '1px solid var(--border-input)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: getMatCol(m.name), display: 'inline-block' }} />
                      <span style={{ fontWeight: 800 }}>{m.name}</span>
                    </div>
                    <button className="btn btn-sm btn-icon" style={{ color: 'var(--danger)', background: 'transparent' }} onClick={() => handleDeleteMaterial(m.id, m.name)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {materialObjs.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px' }}>No custom materials found.</div>}
              </div>

              <form onSubmit={handleAddMaterial} style={{ display: 'flex', gap: '8px' }}>
                <input className="fi" style={{ flex: 1 }} type="text" placeholder="New material name (e.g., Brass)" value={newMatName} onChange={e => setNewMatName(e.target.value)} required />
                <button type="submit" className="btn btn-p" disabled={!newMatName.trim()}><Plus size={14} /> Add</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
