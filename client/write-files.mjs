import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = 'b:/VGTC Managemet/client/src';

const APP = `import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, Receipt, FileText, BarChart3, ChevronRight, Bell, Search, User } from 'lucide-react';
import LRModule from './modules/LRModule';
import VoucherModule from './modules/VoucherModule';
import BalanceSheet from './modules/BalanceSheet';

const NAV = [
  { id: 'lr', label: 'Loading Receipt', Icon: Receipt, color: '#6366f1' },
  { id: 'voucher', label: 'Voucher', Icon: FileText, color: '#10b981' },
  { id: 'balance', label: 'Balance Sheet', Icon: BarChart3, color: '#f59e0b' },
];

export default function App() {
  const [active, setActive] = useState('lr');
  const [col, setCol] = useState(false);
  return (
    <div className="app-shell">
      <aside className={\`sidebar\${col ? ' collapsed' : ''}\`}>
        <div className="sidebar-brand">
          <div className="brand-icon"><LayoutDashboard size={22} color="white" /></div>
          {!col && <div className="brand-text">
            <div className="brand-name">Vikas Goods</div>
            <div className="brand-sub">Transport System</div>
          </div>}
        </div>
        <nav className="sidebar-nav">
          {NAV.map(({ id, label, Icon, color }) => (
            <button key={id} className={\`nav-btn\${active === id ? ' active' : ''}\`}
              onClick={() => setActive(id)} title={col ? label : undefined}>
              <span className="nav-indicator" />
              <Icon size={20} color={active === id ? color : 'currentColor'} />
              {!col && label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="collapse-btn" onClick={() => setCol(c => !c)}>
            <span className={\`chevron\${!col ? ' flipped' : ''}\`}><ChevronRight size={18} /></span>
          </button>
        </div>
      </aside>
      <div className="main-content">
        <header className="topbar">
          <div className="topbar-search">
            <span className="search-icon-wrap"><Search size={15} /></span>
            <input type="text" placeholder="Search records..." />
          </div>
          <div className="topbar-right">
            <button className="notif-btn"><Bell size={18} /><span className="notif-dot" /></button>
            <div className="sep-v" />
            <div className="user-chip">
              <div className="user-info">
                <div className="user-name">Vikas Admin</div>
                <div className="user-role">Management</div>
              </div>
              <div className="user-avatar"><User size={18} color="white" /></div>
            </div>
          </div>
        </header>
        <div className="page-area">
          <AnimatePresence mode="wait">
            <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="page-content">
              {active === 'lr' && <LRModule />}
              {active === 'voucher' && <VoucherModule />}
              {active === 'balance' && <BalanceSheet />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}`;

const LR = `import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Plus, Trash2, Printer, FileSpreadsheet, Check, X, Receipt, Calendar, User, CreditCard } from 'lucide-react';
import * as XLSX from 'xlsx';

const API = 'http://localhost:5000/api/lr';
const MATERIALS = ['PPC', 'OPC43', 'Adstar', 'Opc FS', 'Opc 53 FS', 'Weather'];

export default function LRModule() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    truckNo: '', partyName: '', billing: 'No',
    materials: [{ type: 'PPC', weight: '', bags: '' }],
  });

  useEffect(() => { fetchData(); }, []);
  const fetchData = async () => { try { setReceipts((await axios.get(API)).data); } catch {} };

  const updMat = (i, field, val) => {
    const m = [...form.materials];
    m[i] = { ...m[i], [field]: val };
    if (field === 'bags' && val) m[i].weight = (parseFloat(val) * 0.05).toFixed(2);
    setForm({ ...form, materials: m });
  };
  const addMat = () => setForm({ ...form, materials: [...form.materials, { type: 'PPC', weight: '', bags: '' }] });
  const removeMat = idx => setForm({ ...form, materials: form.materials.filter((_, i) => i !== idx) });

  const handleSubmit = async e => {
    e.preventDefault(); setLoading(true);
    try {
      const res = await axios.post(API, form);
      alert('Receipt #' + res.data.lrNo + ' created!');
      fetchData();
      setForm({ date: new Date().toISOString().split('T')[0], truckNo: '', partyName: '', billing: 'No', materials: [{ type: 'PPC', weight: '', bags: '' }] });
    } catch { alert('Error creating receipt'); } finally { setLoading(false); }
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(receipts.map(r => ({ LR_No: r.lrNo, Date: r.date, Truck: r.truckNo, Material: r.material, Weight_MT: r.weight, Bags: r.totalBags, Party: r.partyName, Billing: r.billing })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'LRs'); XLSX.writeFile(wb, 'VGTC_Receipts.xlsx');
  };

  return (
    <div>
      <div className="page-hd">
        <div>
          <h1><Receipt size={20} color="#6366f1" /> Loading Receipt</h1>
          <p>Create and manage loading receipts</p>
        </div>
        <div className="page-hd-right">
          <button className="btn btn-s" onClick={exportExcel}><FileSpreadsheet size={15} /> Export Excel</button>
        </div>
      </div>
      <div className="two-col tc-form-list">
        <div className="card">
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon ci-indigo"><Plus size={17} /></div>
              <div className="card-title-text"><h3>New Entry</h3><p>Fill loading details</p></div>
            </div>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit}>
              <div className="fg fg-2">
                <div className="field">
                  <label><Calendar size={11} /> Date</label>
                  <input className="fi" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                </div>
                <div className="field">
                  <label>Truck No.</label>
                  <input className="fi" type="text" placeholder="RJ00 XX 0000" value={form.truckNo} onChange={e => setForm({ ...form, truckNo: e.target.value })} required />
                </div>
                <div className="field">
                  <label><User size={11} /> Party Name</label>
                  <input className="fi" type="text" placeholder="Client name" value={form.partyName} onChange={e => setForm({ ...form, partyName: e.target.value })} required />
                </div>
                <div className="field">
                  <label><CreditCard size={11} /> Billing</label>
                  <select className="fi" value={form.billing} onChange={e => setForm({ ...form, billing: e.target.value })}>
                    <option>No</option><option>Yes</option>
                  </select>
                </div>
              </div>
              <hr className="sep" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Materials</span>
                <button type="button" className="btn btn-g btn-sm" onClick={addMat}><Plus size={13} /> Add</button>
              </div>
              {form.materials.map((m, i) => (
                <motion.div key={i} className="mat-row" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="mat-row-hd">
                    <span className="mat-lbl">Material #{i + 1}</span>
                    {i > 0 && <button type="button" className="btn btn-d btn-sm btn-icon" onClick={() => removeMat(i)}><Trash2 size={13} /></button>}
                  </div>
                  <div className="fg fg-3">
                    <div className="field">
                      <label>Type</label>
                      <select className="fi" value={m.type} onChange={e => updMat(i, 'type', e.target.value)}>
                        {MATERIALS.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label>Bags</label>
                      <input className="fi" type="number" placeholder="0" value={m.bags} onChange={e => updMat(i, 'bags', e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Weight (MT)</label>
                      <input className="fi" type="number" step="0.01" placeholder="0.00" value={m.weight} onChange={e => updMat(i, 'weight', e.target.value)} />
                    </div>
                  </div>
                </motion.div>
              ))}
              <button type="submit" className="btn btn-p btn-full" disabled={loading}>
                {loading ? 'Saving...' : 'Save Receipt'}
              </button>
            </form>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon ci-indigo"><FileSpreadsheet size={17} /></div>
              <div className="card-title-text"><h3>Recent Receipts</h3><p>{receipts.length} records</p></div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr>
                <th>LR No.</th><th>Vehicle & Party</th><th>Material</th>
                <th className="c">Billing</th><th className="r">Print</th>
              </tr></thead>
              <tbody>
                {receipts.length === 0 && <tr><td colSpan={5} className="t-empty">No receipts yet</td></tr>}
                {receipts.map(lr => (
                  <tr key={lr.id}>
                    <td><span className="t-lr">#{lr.lrNo}</span></td>
                    <td><div className="t-main">{lr.truckNo}</div><div className="t-sub">{lr.partyName} · {lr.date}</div></td>
                    <td><span className="badge badge-tag">{lr.material}</span><div className="t-sub">{lr.weight} MT · {lr.totalBags} bags</div></td>
                    <td className="c"><span className={\`badge \${lr.billing === 'Yes' ? 'badge-y' : 'badge-n'}\`}>{lr.billing === 'Yes' ? <Check size={10} /> : <X size={10} />} {lr.billing}</span></td>
                    <td className="r"><button className="btn btn-g btn-icon"><Printer size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}`;

const VOUCHER = `import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileText, Search, MapPin, Fuel, CreditCard, Wallet, Calculator } from 'lucide-react';

const API_V = 'http://localhost:5000/api/vouchers';
const API_LR = 'http://localhost:5000/api/lr';
const PUMPS = ['S.K Pump', 'Shiva Pump', 'Karoli'];
const TYPES = ['Dump', 'JK_Lakshmi', 'JK_Super'];

const getCalc = (w, r, hasComm) => {
  const wt = parseFloat(w) || 0, rt = parseFloat(r) || 0;
  const munshi = wt > 0 ? (wt < 15 ? 50 : 100) : 0;
  const commission = hasComm ? wt * 20 : 0;
  return { munshi, commission, total: rt * wt };
};

export default function VoucherModule() {
  const [vType, setVType] = useState('Dump');
  const [vouchers, setVouchers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    lrNo: '', date: new Date().toISOString().split('T')[0],
    truckNo: '', destination: '', weight: '', bags: '',
    rate: '', pump: PUMPS[0], advanceDiesel: '', advanceCash: '', advanceOnline: '',
    hasCommission: false, isFullTank: false,
  });

  useEffect(() => { fetchVouchers(); }, [vType]);
  const fetchVouchers = async () => { try { setVouchers((await axios.get(API_V + '/' + vType)).data); } catch {} };

  const handleLrSearch = async val => {
    setForm(f => ({ ...f, lrNo: val }));
    if (vType === 'Dump' && val) {
      try {
        const all = (await axios.get(API_LR)).data;
        const lr = all.find(l => String(l.lrNo) === val);
        if (lr) setForm(f => ({ ...f, truckNo: lr.truckNo || '', weight: lr.weight || '', bags: lr.totalBags || '', date: lr.date || f.date }));
      } catch {}
    }
  };

  const handleSubmit = async e => {
    e.preventDefault(); setSaving(true);
    const calc = getCalc(form.weight, form.rate, form.hasCommission);
    try {
      await axios.post(API_V, { ...form, type: vType, ...calc });
      alert('Voucher saved!'); fetchVouchers();
      setForm(f => ({ ...f, lrNo: '', truckNo: '', weight: '', bags: '', rate: '', advanceDiesel: '', advanceCash: '', advanceOnline: '', isFullTank: false }));
    } catch { alert('Error saving voucher'); } finally { setSaving(false); }
  };

  const { munshi, commission, total } = getCalc(form.weight, form.rate, form.hasCommission);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div>
      <div className="page-hd">
        <div>
          <h1><FileText size={20} color="#10b981" /> Voucher Management</h1>
          <p>Dump · J.K Lakshmi · J.K Super</p>
        </div>
        <div className="tab-grp">
          {TYPES.map(t => <button key={t} className={\`tab-btn\${vType === t ? ' tab-indigo' : ''}\`} onClick={() => setVType(t)}>{t.replace('_', ' ')}</button>)}
        </div>
      </div>
      <div className="two-col tc-3-1">
        <div className="card">
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon ci-green"><FileText size={17} /></div>
              <div className="card-title-text"><h3>Voucher Entry</h3><p>{vType.replace('_', ' ')} — {form.date}</p></div>
            </div>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit}>
              <div className="fg fg-3">
                <div className="field">
                  <label><Search size={11} /> LR Number</label>
                  <input className="fi" type="text" placeholder="e.g. 42" value={form.lrNo} onChange={e => handleLrSearch(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Truck No.</label>
                  <input className="fi" type="text" placeholder="Auto-filled" value={form.truckNo} onChange={e => set('truckNo', e.target.value)} required />
                </div>
                <div className="field">
                  <label><MapPin size={11} /> Destination</label>
                  <input className="fi" type="text" placeholder="City / Pincode" value={form.destination} onChange={e => set('destination', e.target.value)} />
                </div>
              </div>
              <div className="fg fg-3" style={{ marginTop: '14px' }}>
                <div className="field"><label>Weight (MT)</label><input className="fi" type="number" step="0.01" placeholder="0.00" value={form.weight} onChange={e => set('weight', e.target.value)} /></div>
                <div className="field"><label>Total Bags</label><input className="fi" type="number" placeholder="0" value={form.bags} onChange={e => set('bags', e.target.value)} /></div>
                <div className="field"><label>Rate (Rs/MT)</label><input className="fi" type="number" placeholder="0" value={form.rate} onChange={e => set('rate', e.target.value)} /></div>
              </div>
              <hr className="sep" />
              <div className="fg fg-3">
                <div className="field">
                  <label><Fuel size={11} /> Diesel Advance</label>
                  <div className="fi-row">
                    <input className="fi" type="text" placeholder="Amount" value={form.advanceDiesel} disabled={form.isFullTank} onChange={e => set('advanceDiesel', e.target.value)} />
                    <button type="button" style={{ minWidth: '56px' }} className={\`btn btn-sm \${form.isFullTank ? 'btn-p' : 'btn-g'}\`}
                      onClick={() => setForm(f => ({ ...f, isFullTank: !f.isFullTank, advanceDiesel: !f.isFullTank ? 'FULL' : '' }))}>Full</button>
                  </div>
                </div>
                <div className="field"><label><Wallet size={11} /> Cash Advance</label><input className="fi" type="number" placeholder="0" value={form.advanceCash} onChange={e => set('advanceCash', e.target.value)} /></div>
                <div className="field"><label><CreditCard size={11} /> Online Advance</label><input className="fi" type="number" placeholder="0" value={form.advanceOnline} onChange={e => set('advanceOnline', e.target.value)} /></div>
              </div>
              <div className="field" style={{ marginTop: '14px' }}>
                <label>Petrol Pump</label>
                <select className="fi" value={form.pump} onChange={e => set('pump', e.target.value)}>
                  {PUMPS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="chk-row">
                <input type="checkbox" id="comm" checked={form.hasCommission} onChange={e => set('hasCommission', e.target.checked)} />
                <label htmlFor="comm">Add Commission — Rs.20 per MT</label>
              </div>
              <button type="submit" className="btn btn-p btn-full" disabled={saving}>{saving ? 'Saving...' : 'Save Voucher'}</button>
            </form>
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-header">
              <div className="card-title-block">
                <div className="card-icon ci-indigo"><Calculator size={17} /></div>
                <div className="card-title-text"><h3>Live Estimate</h3></div>
              </div>
            </div>
            <div className="card-body">
              <div className="calc-box">
                <div className="calc-row"><span>Munshi</span><span>Rs.{munshi}</span></div>
                <div className="calc-row"><span>Commission</span><span>Rs.{commission.toLocaleString()}</span></div>
                <div className="calc-row"><span className="calc-total-lbl">Gross Total</span><span className="calc-total-val">Rs.{total.toLocaleString()}</span></div>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <div className="card-title-block">
                <div className="card-title-text"><h3>Recent</h3><p>{vType.replace('_', ' ')}</p></div>
              </div>
            </div>
            <div className="card-body">
              {vouchers.length === 0 && <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', padding: '16px 0', fontWeight: 700, textTransform: 'uppercase' }}>No records</p>}
              {vouchers.slice(0, 5).map(v => (
                <div key={v.id} className="rec-item">
                  <div className="rec-hd"><span className="rec-truck">{v.truckNo}</span><span className="rec-date">{v.date}</span></div>
                  <div className="rec-ft"><span className="rec-lr">LR #{v.lrNo}</span><span className="rec-total">Rs.{(v.total || 0).toLocaleString()}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}`;

const BALANCE = `import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart3, TrendingUp, CreditCard, Clock, Search } from 'lucide-react';

const API_V = 'http://localhost:5000/api/vouchers';
const TYPES = ['Dump', 'JK_Lakshmi', 'JK_Super'];

export default function BalanceSheet() {
  const [tab, setTab] = useState('Dump');
  const [vouchers, setVouchers] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => { fetchVouchers(); }, [tab]);
  const fetchVouchers = async () => {
    try {
      const raw = (await axios.get(API_V + '/' + tab)).data;
      const gpsMap = {};
      setVouchers(raw.map(v => {
        const key = v.truckNo + '_' + (v.date || '').slice(0, 7);
        const gpsFee = gpsMap[key] ? 0 : 250; gpsMap[key] = true;
        const tot = parseFloat(v.total) || 0;
        const advance = (parseFloat(v.advanceCash) || 0) + (parseFloat(v.advanceOnline) || 0);
        const diesel = v.advanceDiesel === 'FULL' ? 4000 : (parseFloat(v.advanceDiesel) || 0);
        const shortage = parseFloat(v.shortage) || 0, paid = parseFloat(v.paidBalance) || 0;
        const netBalance = tot - gpsFee - diesel - advance - shortage;
        return { ...v, gpsFee, netBalance, finalBalance: netBalance - paid };
      }));
    } catch {}
  };

  const updateField = async (id, field, val) => {
    try { await axios.patch(API_V + '/' + id, { [field]: val }); fetchVouchers(); } catch {}
  };

  const filtered = vouchers.filter(v =>
    (v.truckNo || '').toLowerCase().includes(search.toLowerCase()) || String(v.lrNo || '').includes(search)
  );
  const sum = key => vouchers.reduce((s, v) => s + (parseFloat(v[key]) || 0), 0);
  const stats = [
    { label: 'Net Balance', value: vouchers.reduce((s, v) => s + v.netBalance, 0), Icon: TrendingUp, color: '#6366f1' },
    { label: 'Pending', value: vouchers.reduce((s, v) => s + v.finalBalance, 0), Icon: Clock, color: '#f59e0b' },
    { label: 'GPS Total', value: vouchers.reduce((s, v) => s + v.gpsFee, 0), Icon: BarChart3, color: '#f43f5e' },
    { label: 'Total Paid', value: sum('paidBalance'), Icon: CreditCard, color: '#10b981' },
  ];

  return (
    <div>
      <div className="page-hd">
        <div><h1><BarChart3 size={20} color="#f59e0b" /> Balance Sheet</h1><p>Financial overview and tracking</p></div>
        <div className="page-hd-right">
          <div className="tab-grp">
            {TYPES.map(t => <button key={t} className={\`tab-btn\${tab === t ? ' tab-amber' : ''}\`} onClick={() => setTab(t)}>{t.replace('_', ' ')}</button>)}
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="fi" type="text" placeholder="Search truck/LR..." style={{ paddingLeft: '34px', width: '190px', fontSize: '12px' }} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="stat-grid">
        {stats.map(({ label, value, Icon, color }) => (
          <div key={label} className="stat-card">
            <div className="stat-head"><span className="stat-lbl">{label}</span><Icon size={18} color={color} /></div>
            <div className="stat-val">Rs.{Math.round(value).toLocaleString()}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title-block">
            <div className="card-icon ci-amber"><BarChart3 size={17} /></div>
            <div className="card-title-text"><h3>Statement Details</h3><p>{filtered.length} records — {tab.replace('_', ' ')}</p></div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr>
              <th>Vehicle & Date</th><th>Deductions</th>
              <th className="c">Shortage (Rs.)</th><th className="c">Paid (Rs.)</th>
              <th className="r">Final Balance</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={5} className="t-empty">No records</td></tr>}
              {filtered.map(v => (
                <tr key={v.id}>
                  <td><div className="t-main">{v.truckNo}</div><div className="t-sub">LR #{v.lrNo} · {v.date}</div></td>
                  <td>
                    <div className="ded-row">
                      <div className="ded-item"><div className="dot dot-r" /> GPS: Rs.{v.gpsFee}</div>
                      <div className="ded-item"><div className="dot dot-i" /> Adv: Rs.{(parseFloat(v.advanceCash) || 0) + (parseFloat(v.advanceOnline) || 0)}</div>
                    </div>
                  </td>
                  <td className="c"><input className="t-inp" type="number" placeholder="0" value={v.shortage || ''} onChange={e => updateField(v.id, 'shortage', e.target.value)} /></td>
                  <td className="c"><input className="t-inp" type="number" placeholder="0" value={v.paidBalance || ''} onChange={e => updateField(v.id, 'paidBalance', e.target.value)} /></td>
                  <td className="r">
                    <div style={{ fontWeight: 800, fontSize: '14px' }}>Rs.{v.finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    {v.finalBalance <= 0 && <div className="cleared">Cleared</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}`;

writeFileSync(dir + '/App.jsx', APP, 'utf8');
writeFileSync(dir + '/modules/LRModule.jsx', LR, 'utf8');
writeFileSync(dir + '/modules/VoucherModule.jsx', VOUCHER, 'utf8');
writeFileSync(dir + '/modules/BalanceSheet.jsx', BALANCE, 'utf8');

console.log('All files written successfully');
console.log('App.jsx:', require('fs').statSync(dir + '/App.jsx').size + ' bytes');
console.log('LRModule.jsx:', require('fs').statSync(dir + '/modules/LRModule.jsx').size + ' bytes');
console.log('VoucherModule.jsx:', require('fs').statSync(dir + '/modules/VoucherModule.jsx').size + ' bytes');
console.log('BalanceSheet.jsx:', require('fs').statSync(dir + '/modules/BalanceSheet.jsx').size + ' bytes');
