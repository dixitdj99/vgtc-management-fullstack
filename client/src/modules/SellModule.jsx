import React, { useState, useEffect, useMemo, useRef } from 'react';
import ax from '../api';
import { useAuth } from '../auth/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart, Plus, History, Trash2, RefreshCw,
  Check, X, Search, Download, Printer, Filter,
  IndianRupee, Package, User, FileText, Calendar, Weight,
  CreditCard, Banknote, ReceiptText, ArrowRightLeft
} from 'lucide-react';
import { exportToExcel, exportToPDF, buildExportRows } from '../utils/exportUtils';
import { openReceiptWindow, printHtml } from '../utils/receiptPrint';
import { archiveName } from '../utils/archiveDoc';
import ColumnFilter from '../components/ColumnFilter';
import Pagination from '../components/Pagination';
import TableScroll from '../components/TableScroll';

const PAGE_SIZE = 20;

const BASE_API = `/sell`;
const MATS_DUMP = ["PPC", "OPC43", "Adstar", "OPC FS", "OPC53 FS", "Weather"];
const MATS_JKL = ["PPC", "OPC43", "Pro+"];
const MCOL = { "PPC": "#6366f1", "OPC43": "#f59e0b", "Pro+": "#10b981", "Adstar": "#10b981", "OPC FS": "#0ea5e9", "OPC53 FS": "#a855f7", "Weather": "#f43f5e" };

export default function SellModule({ brand = 'dump', role = 'user', permissions = {} }) {
  const MATS = brand === 'jkl' ? MATS_JKL : MATS_DUMP;

  // Whoever is logged in signs the receipts they print.
  const { user } = useAuth();
  const signedBy = user?.name || user?.username || 'VGTC';
  
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  const getEmptyForm = () => ({
    material: MATS[0],
    quantity: '',
    rate: '',
    customerName: '',
    remark: '',
    paymentType: 'cash',
    paymentStatus: 'paid',
    date: new Date().toISOString().slice(0, 10),
    brand: brand,
    // Which stack the bags come off. 'set' = water-damaged bags, sold cheap;
    // they come out of the Set Bags stack in Stock, never the loadable one.
    stockType: 'good',
    // Whose account an online payment landed in. Ignored for cash sales.
    onlineAccount: '',
  });

  const [form, setForm] = useState(getEmptyForm());
  const [filters, setFilters] = useState({});
  const [view, setView] = useState('sales'); // sales | online | cash
  // Opens on the ledger. The sale form used to hold a 340px column on every
  // visit, when most visits are to check what was sold rather than to sell.
  const [formOpen, setFormOpen] = useState(false);

  // ── Sell cash box ──
  const [movements, setMovements] = useState([]);
  const [cashInHand, setCashInHand] = useState(0);
  const [profiles, setProfiles] = useState([]);
  const [showCash, setShowCash] = useState(false);
  const [cashForm, setCashForm] = useState({ amount: '', remark: '', date: new Date().toISOString().slice(0, 10), type: 'to_cashbook' });
  const [cashBusy, setCashBusy] = useState(false);
  const [cashErr, setCashErr] = useState('');

  // Marking a pending sale paid online also has to say which account got it.
  const [onlinePrompt, setOnlinePrompt] = useState(null); // { id, account }

  const handleCashMove = async (e) => {
    e.preventDefault();
    setCashErr('');
    const amt = parseFloat(cashForm.amount);
    if (!amt || amt <= 0) { setCashErr('Enter a valid amount'); return; }
    if (amt > cashInHand) { setCashErr(`Only ₹${cashInHand.toLocaleString('en-IN')} cash is in hand from Sell.`); return; }
    setCashBusy(true);
    try {
      await ax.post(`${BASE_API}/cash-movements`, { ...cashForm, amount: amt, brand });
      setCashForm({ amount: '', remark: '', date: new Date().toISOString().slice(0, 10), type: cashForm.type });
      setShowCash(false);
      fetchCash();
    } catch (err) {
      setCashErr(err.response?.data?.error || err.message || 'Could not save');
    } finally { setCashBusy(false); }
  };

  const deleteMovement = async (m) => {
    if (!window.confirm(`Delete this withdrawal of ₹${(+m.amount).toLocaleString('en-IN')}?`)) return;
    try {
      await ax.delete(`${BASE_API}/cash-movements/${m.id}`);
      fetchCash();
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  useEffect(() => {
    fetchSales();
    fetchCash();
    setCurrentPage(1);
  }, [brand]);

  useEffect(() => {
    ax.get('/profiles').then(r => setProfiles(r.data || [])).catch(() => setProfiles([]));
  }, []);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const res = await ax.get(`${BASE_API}?brand=${brand}`);
      setSales(res.data);
    } catch (e) {
      console.error('Fetch sales failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCash = async () => {
    try {
      const res = await ax.get(`${BASE_API}/cash-movements?brand=${brand}`);
      setMovements(res.data?.movements || []);
      setCashInHand(res.data?.cashInHand || 0);
    } catch { setMovements([]); setCashInHand(0); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.quantity || parseFloat(form.quantity) <= 0) return setErr('Enter valid quantity');
    if (!form.rate || parseFloat(form.rate) <= 0) return setErr('Enter valid rate');
    if (form.paymentType === 'online' && form.paymentStatus === 'paid' && !form.onlineAccount.trim()) {
      return setErr('Enter whose account the money was sent to');
    }

    setSaving(true);
    try {
      await ax.post(BASE_API, form);
      setForm(getEmptyForm());
      fetchSales();
      fetchCash();
    } catch (er) {
      setErr(er.response?.data?.error || 'Failed to record sale');
    } finally {
      setSaving(false);
    }
  };

  const updatePaymentStatus = async (id, status, pType, onlineAccount) => {
    try {
      const data = { paymentStatus: status };
      if (pType) data.paymentType = pType;
      if (onlineAccount !== undefined) data.onlineAccount = onlineAccount;
      await ax.patch(`${BASE_API}/${id}`, data);
      fetchSales();
      fetchCash();
    } catch (e) {
      alert('Update failed');
    }
  };

  const deleteSale = async (id) => {
    if (role !== 'admin') return alert('Only admins can delete sales');
    if (!window.confirm('Are you sure you want to delete this sale?')) return;
    
    try {
      await ax.delete(`${BASE_API}/${id}`);
      fetchSales();
    } catch (e) {
      alert('Delete failed');
    }
  };

  const filteredSales = useMemo(() => {
    let list = [...sales];
    Object.keys(filters).forEach(key => {
      const vals = filters[key];
      if (vals && vals.length > 0) {
        list = list.filter(s => vals.includes(String(s[key] ?? '')));
      }
    });
    return list;
  }, [sales, filters]);

  // Pagination Logic
  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredSales.slice(start, start + PAGE_SIZE);
  }, [filteredSales, currentPage]);

  const onFilterUpdate = (k, v) => {
    setFilters(f => ({ ...f, [k]: v }));
    setCurrentPage(1);
  };

  const totalBags = filteredSales.reduce((s, x) => s + (parseInt(x.quantity) || 0), 0);
  const totalVal = filteredSales.reduce((s, x) => s + (parseFloat(x.totalAmount) || 0), 0);
  const totalCash = filteredSales.filter(s => s.paymentType === 'cash' && s.paymentStatus !== 'pending').reduce((s, x) => s + (parseFloat(x.totalAmount) || 0), 0);
  const totalOnline = filteredSales.filter(s => s.paymentType === 'online' && s.paymentStatus !== 'pending').reduce((s, x) => s + (parseFloat(x.totalAmount) || 0), 0);
  const totalPending = filteredSales.filter(s => s.paymentStatus === 'pending').reduce((s, x) => s + (parseFloat(x.totalAmount) || 0), 0);

  /** Names offered for "sent to account": people/firms on record, plus anything already used. */
  const accountSuggestions = useMemo(() => {
    const used = sales.map(s => (s.onlineAccount || '').trim()).filter(Boolean);
    const fromProfiles = profiles.map(p => (p.name || '').trim()).filter(Boolean);
    return [...new Set([...used, ...fromProfiles])].sort((a, b) => a.localeCompare(b));
  }, [sales, profiles]);

  /** Online receipts grouped by the account they landed in. */
  const onlineByAccount = useMemo(() => {
    const map = new Map();
    sales
      .filter(s => s.paymentType === 'online' && s.paymentStatus !== 'pending')
      .forEach(s => {
        const key = (s.onlineAccount || '').trim() || '__none__';
        if (!map.has(key)) map.set(key, { account: key, total: 0, rows: [] });
        const g = map.get(key);
        g.total += parseFloat(s.totalAmount) || 0;
        g.rows.push(s);
      });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [sales]);

  const TH = { padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg-th)', borderBottom: '1px solid var(--border)', textAlign: 'left' };
  const TD = { padding: '10px 12px', fontSize: '13px', color: 'var(--text-sub)', borderBottom: '1px solid var(--border-row)', verticalAlign: 'middle' };

  const weightMT = (parseFloat(form.quantity) || 0) * 0.05;
  const totalAmt = (parseFloat(form.quantity) || 0) * (parseFloat(form.rate) || 0);

  const printReceipt = (s) => {
    openReceiptWindow({
      archive: {
        module: 'Sell', kind: 'Documents',
        plant: brand === 'jkl' ? 'JK Lakshmi' : 'JK Super',
        name: archiveName('Sale', s.date, s.customerName, s.id?.slice(0, 6)),
        meta: { customerName: s.customerName, date: s.date, amount: s.totalAmount },
      },
      title: `Receipt - ${s.customerName}`,
      fontSize: '9.5pt',
      // 79mm x 100mm slip. The stamp/footer block is deliberately bottom-anchored,
      // so this is the height it anchors to; a longer receipt still grows past it
      // onto the same page rather than spilling onto a second one.
      minHeightMm: 100,
      styles: `
            .hd {
              text-align: center;
              border-bottom: 2.5px solid #000;
              padding-bottom: 1mm;
              margin-bottom: 2mm;
            }
            .hd .co {
              font-size: 12.5pt;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.3px;
            }
            .hd .sub {
              font-size: 8.5pt;
              font-weight: 800;
              margin-top: 1px;
            }
            .sec {
              border: 2px solid #000;
              border-radius: 4px;
              margin-bottom: 2mm;
              background: #fff;
              overflow: hidden;
            }
            .line {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 4mm;
              padding: 3px 6px;
              border-bottom: 1.5px solid #000;
              font-size: 9pt;
            }
            .line:last-child { border-bottom: none; }
            .lbl {
              font-weight: 800;
              font-size: 8pt;
              text-transform: uppercase;
              color: #000;
              flex-shrink: 0;
            }
            .val {
              font-weight: 900;
              text-align: right;
            }
            .total-banner {
              background: #000;
              color: #fff;
              display: flex;
              justify-content: space-between;
              padding: 4px 8px;
              font-size: 11pt;
              font-weight: 900;
              border-radius: 2px;
              margin: 1.5mm 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .stamp-box {
              border: 2px solid #000;
              border-radius: 4px;
              padding: 3px 6px;
              text-align: center;
              font-size: 9pt;
              font-weight: 900;
              text-transform: uppercase;
              margin-top: auto;
              margin-bottom: 1.5mm;
            }
            .stamp-box.pending {
              background: #000;
              color: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .footer {
              text-align: center;
              font-size: 7.5pt;
              font-weight: 800;
              color: #000;
              border-top: 1px dashed #000;
              padding-top: 1.5mm;
            }
            .signed {
              margin-top: 1.5mm;
              border: 2px solid #000;
              border-radius: 4px;
              padding: 2px 5px;
              text-align: center;
            }
            .signed-k {
              display: block;
              font-size: 6pt;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.3px;
            }
            .signed-v {
              display: block;
              font-family: 'Brush Script MT', cursive, sans-serif;
              font-size: 14pt;
              font-weight: 700;
              line-height: 1.05;
            }
            .signed-f { display: block; font-size: 5.5pt; font-weight: 700; }`,
      body: `
          <div class="container">
            <div>
              <div class="hd">
                <div class="co">Vikas Goods Transport</div>
                <div class="sub">Cement Sales Receipt</div>
              </div>
              
              <div class="sec">
                <div class="line"><span class="lbl">Date</span><span class="val">${new Date(s.date).toLocaleDateString('en-IN')}</span></div>
                <div class="line"><span class="lbl">Customer</span><span class="val">${s.customerName}</span></div>
                <div class="line"><span class="lbl">Material</span><span class="val">${s.material}</span></div>
                <div class="line"><span class="lbl">Qty</span><span class="val">${s.quantity} Bags (${(s.quantity * 0.05).toFixed(2)} MT)</span></div>
                <div class="line"><span class="lbl">Rate</span><span class="val">₹${s.rate} / Bag</span></div>
              </div>

              <div class="total-banner">
                <span>TOTAL AMOUNT</span>
                <span>₹${Math.round(s.totalAmount).toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; align-items: stretch;">
              <div class="stamp-box ${s.paymentStatus === 'pending' ? 'pending' : ''}">
                ${s.paymentStatus === 'pending' ? 'UNPAID / PENDING' : `PAID VIA ${s.paymentType.toUpperCase()}`}
              </div>
              
              <div class="signed">
                <span class="signed-k">Digitally Signed</span>
                <span class="signed-v">${signedBy}</span>
                <span class="signed-f">Auth. Signatory</span>
              </div>

              <div class="footer">
                <p>Thank you for your business!</p>
              </div>
            </div>
          </div>`,
    });
  };

  // Cash modal — the cashbook only ever receives cash Sell actually holds.
  const CashModal = showCash && (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
      <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
        style={{ width: '90%', maxWidth: '430px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>Sell Cash</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Cash collected from sales — online payments are not included</div>
          </div>
          <button onClick={() => { setShowCash(false); setCashErr(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ background: 'var(--bg-input)', borderRadius: '12px', padding: '12px 14px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)' }}>Cash in hand from Sell</span>
          <span style={{ fontSize: '20px', fontWeight: 900, color: cashInHand > 0 ? '#10b981' : 'var(--text-muted)' }}>₹{cashInHand.toLocaleString('en-IN')}</span>
        </div>

        <form onSubmit={handleCashMove} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { val: 'to_cashbook', label: 'Add to Cashbook', color: '#10b981' },
              { val: 'withdrawal', label: 'Withdraw Cash', color: '#f59e0b' },
            ].map(d => (
              <button key={d.val} type="button" onClick={() => { setCashForm(f => ({ ...f, type: d.val })); setCashErr(''); }}
                style={{
                  flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid',
                  borderColor: cashForm.type === d.val ? d.color : 'var(--border)',
                  background: cashForm.type === d.val ? `${d.color}18` : 'var(--bg-input)',
                  color: cashForm.type === d.val ? d.color : 'var(--text-muted)',
                  fontWeight: 700, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s'
                }}>
                {d.label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
            {cashForm.type === 'to_cashbook'
              ? 'Moves cash out of Sell and deposits it in the Cashbook.'
              : 'Takes cash out of the Sell box. No Cashbook entry is created.'}
          </div>

          <div className="field-h">
            <label>Amount (Rs.)</label>
            <input className="fi" type="number" min="1" step="1" max={cashInHand || undefined} required placeholder="e.g. 5000"
              value={cashForm.amount} onChange={e => { setCashForm(f => ({ ...f, amount: e.target.value })); setCashErr(''); }} />
          </div>
          <div className="field-h">
            <label>Date</label>
            <input className="fi" type="date" value={cashForm.date}
              onChange={e => setCashForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="field-h">
            <label>Remark</label>
            <input className="fi" type="text" placeholder={cashForm.type === 'to_cashbook' ? "e.g. today's collection" : 'e.g. diesel for pickup'}
              value={cashForm.remark} onChange={e => setCashForm(f => ({ ...f, remark: e.target.value }))} />
          </div>

          {cashErr && <div style={{ color: 'var(--danger)', fontSize: '12px', fontWeight: 700 }}>{cashErr}</div>}

          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button type="button" className="btn btn-g" style={{ flex: 1 }} onClick={() => { setShowCash(false); setCashErr(''); }}>Cancel</button>
            <button type="submit" className="btn btn-p" style={{ flex: 2 }} disabled={cashBusy || cashInHand <= 0}>
              {cashBusy ? '...' : <><ArrowRightLeft size={14} /> {cashForm.type === 'to_cashbook' ? 'Add to Cashbook' : 'Withdraw Cash'}</>}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );

  // Asks which account received the money when a pending sale is marked paid online.
  const OnlinePrompt = onlinePrompt && (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
      <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
        style={{ width: '90%', maxWidth: '400px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '22px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, marginBottom: '4px' }}>Paid Online — to whose account?</div>
        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '14px' }}>Recorded against the account so online receipts can be reconciled.</div>
        <input className="fi" list="sell-account-list" autoFocus placeholder="Account holder name"
          value={onlinePrompt.account}
          onChange={e => setOnlinePrompt(p => ({ ...p, account: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter' && onlinePrompt.account.trim()) { updatePaymentStatus(onlinePrompt.id, 'paid', 'online', onlinePrompt.account.trim()); setOnlinePrompt(null); } }} />
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button className="btn btn-g" style={{ flex: 1 }} onClick={() => setOnlinePrompt(null)}>Cancel</button>
          <button className="btn btn-p" style={{ flex: 2 }} disabled={!onlinePrompt.account.trim()}
            onClick={() => { updatePaymentStatus(onlinePrompt.id, 'paid', 'online', onlinePrompt.account.trim()); setOnlinePrompt(null); }}>
            <Check size={14} /> Mark Paid Online
          </button>
        </div>
      </motion.div>
    </div>
  );

  {/* Shared by the sale form and the prompt above. */}
  const AccountDatalist = (
    <datalist id="sell-account-list">
      {accountSuggestions.map(n => <option key={n} value={n} />)}
    </datalist>
  );

  return (
    <div style={{ padding: '0 20px 40px' }}>
      <AnimatePresence>{CashModal}</AnimatePresence>
      <AnimatePresence>{OnlinePrompt}</AnimatePresence>
      {AccountDatalist}
      <div className="page-hd">
        <div>
          <h1><ShoppingCart size={20} color="var(--accent)" /> {brand === 'jkl' ? 'JK Lakshmi' : 'Dump'} Sell</h1>
          <p>Tracking internal sales and bag deductions</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className={`btn btn-sm ${formOpen ? 'btn-g' : 'btn-p'}`} onClick={() => setFormOpen(o => !o)}
            title={formOpen ? 'Close the form' : 'Record a new sale'}>
            {formOpen ? <><X size={14} /> Close Form</> : <><Plus size={14} /> Create New Sell</>}
          </button>
          <button className="btn btn-g btn-sm" onClick={() => { setShowCash(true); setCashErr(''); }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Banknote size={14} /> Cash · ₹{cashInHand.toLocaleString('en-IN')}
          </button>
          <button className="btn btn-g btn-sm" onClick={fetchSales} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'ani-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* ── COLLECTION SUMMARY ── */}
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '15px', marginBottom: '25px' }}>
         <div className="card" style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid #6366f1' }}>
            <div style={{ padding: '8px', background: 'rgba(99,102,241,0.1)', borderRadius: '10px', color: '#6366f1' }}><ShoppingCart size={20} /></div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Sales</div>
              <div style={{ fontSize: '16px', fontWeight: 800 }}>₹{totalVal.toLocaleString('en-IN')}</div>
            </div>
         </div>
         <div className="card" style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid #10b981' }}>
            <div style={{ padding: '8px', background: 'rgba(16,185,129,0.1)', borderRadius: '10px', color: '#10b981' }}><Banknote size={20} /></div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cash (Paid)</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#10b981' }}>₹{totalCash.toLocaleString('en-IN')}</div>
            </div>
         </div>
         <div className="card" style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid #0ea5e9' }}>
            <div style={{ padding: '8px', background: 'rgba(14,165,233,0.1)', borderRadius: '10px', color: '#0ea5e9' }}><CreditCard size={20} /></div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Online (Paid)</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0ea5e9' }}>₹{totalOnline.toLocaleString('en-IN')}</div>
            </div>
         </div>
         <div className="card" style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid #f43f5e' }}>
            <div style={{ padding: '8px', background: 'rgba(244,63,94,0.1)', borderRadius: '10px', color: '#f43f5e' }}><RefreshCw size={20} /></div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pending Pay</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#f43f5e' }}>₹{totalPending.toLocaleString('en-IN')}</div>
            </div>
         </div>
         {/* Cash actually still in the sell box — collection totals above are all-time. */}
         <div className="card" style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid #a855f7' }}>
            <div style={{ padding: '8px', background: 'rgba(168,85,247,0.1)', borderRadius: '10px', color: '#a855f7' }}><IndianRupee size={20} /></div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cash in Hand</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#a855f7' }}>₹{cashInHand.toLocaleString('en-IN')}</div>
            </div>
         </div>
      </div>

      {/* ── VIEW SWITCH ── */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          { id: 'sales', label: 'Sales Ledger', icon: <History size={13} /> },
          { id: 'online', label: `Online Receipts (${onlineByAccount.length})`, icon: <CreditCard size={13} /> },
          { id: 'cash', label: `Cash Movements (${movements.length})`, icon: <Banknote size={13} /> },
        ].map(({ id, label, icon }) => (
          <button key={id} onClick={() => setView(id)} style={{
            padding: '7px 14px', borderRadius: '9px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px',
            borderColor: view === id ? 'var(--accent)' : 'var(--border)',
            background: view === id ? 'rgba(168,85,247,0.1)' : 'transparent',
            color: view === id ? 'var(--accent)' : 'var(--text-muted)',
          }}>{icon}{label}</button>
        ))}
      </div>

      {/* ── ONLINE RECEIPTS ── */}
      {view === 'online' && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon" style={{ background: 'rgba(14,165,233,0.1)', color: '#0ea5e9' }}><CreditCard size={17} /></div>
              <div className="card-title-text">
                <h3>Online Receipts by Account</h3>
                <p>Where the online money landed · ₹{totalOnline.toLocaleString('en-IN')} received</p>
              </div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Account</th>
                  <th style={{ ...TH, textAlign: 'center' }}>Payments</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Total Received</th>
                  <th style={TH}>Latest</th>
                </tr>
              </thead>
              <tbody>
                {onlineByAccount.length === 0 ? (
                  <tr><td colSpan={4} style={{ ...TD, textAlign: 'center', padding: '28px' }}>No online payments recorded yet.</td></tr>
                ) : onlineByAccount.map(g => {
                  const unknown = g.account === '__none__';
                  const latest = g.rows.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
                  return (
                    <tr key={g.account}>
                      <td style={{ ...TD, fontWeight: 800, color: unknown ? 'var(--text-muted)' : 'var(--text)' }}>
                        {unknown ? 'Account not recorded' : g.account}
                        {unknown && <div style={{ fontSize: '10.5px', fontWeight: 600 }}>Sales saved before the account was captured</div>}
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>{g.rows.length}</td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 900, color: '#0ea5e9' }}>₹{g.total.toLocaleString('en-IN')}</td>
                      <td style={TD}>{latest ? `${latest.date} · ${latest.customerName}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CASH MOVEMENTS ── */}
      {view === 'cash' && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon" style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}><Banknote size={17} /></div>
              <div className="card-title-text">
                <h3>Cash Movements</h3>
                <p>Cash leaving the sell box · ₹{cashInHand.toLocaleString('en-IN')} still in hand</p>
              </div>
            </div>
            <button className="btn btn-p btn-sm" onClick={() => { setShowCash(true); setCashErr(''); }}>
              <ArrowRightLeft size={13} /> Move Cash
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Date</th>
                  <th style={TH}>Type</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Amount</th>
                  <th style={TH}>Remark</th>
                  <th style={{ ...TH, textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {movements.length === 0 ? (
                  <tr><td colSpan={5} style={{ ...TD, textAlign: 'center', padding: '28px' }}>No cash has been moved out yet.</td></tr>
                ) : movements.map(m => (
                  <tr key={m.id}>
                    <td style={TD}>{m.date}</td>
                    <td style={TD}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 800,
                        background: m.type === 'to_cashbook' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                        color: m.type === 'to_cashbook' ? '#10b981' : '#f59e0b',
                      }}>
                        {m.type === 'to_cashbook' ? 'TO CASHBOOK' : 'WITHDRAWN'}
                      </span>
                    </td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 900 }}>₹{(parseFloat(m.amount) || 0).toLocaleString('en-IN')}</td>
                    <td style={TD}>{m.remark || '—'}</td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      {m.type === 'withdrawal' ? (
                        <button className="btn-icon" style={{ color: 'var(--danger)' }} title="Delete withdrawal" onClick={() => deleteMovement(m)}><Trash2 size={14} /></button>
                      ) : (
                        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>in Cashbook</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="two-col" style={{ display: 'grid', gridTemplateColumns: formOpen ? '1fr 340px' : '1fr', gap: '20px', alignItems: 'start' }}>

        {/* ── SALES HISTORY ── (the new-sale form beside it stays available in every view) */}
        <div className="card" style={{ display: view === 'sales' ? undefined : 'none' }}>
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}><History size={17} /></div>
              <div className="card-title-text"><h3>Transaction Ledger</h3><p>{filteredSales.length} entries</p></div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-icon" title="Export Excel" onClick={() => exportToExcel(buildExportRows(filteredSales, { order: ['date', 'partyName', 'material', 'bags', 'rate', 'amount', 'paymentMode'] }), `Sales_Ledger_${brand}`)}><Download size={15} /></button>
            </div>
          </div>

          <TableScroll style={{ maxHeight: '600px' }}>
            <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Date <ColumnFilter label="" colKey="date" data={sales} activeFilters={filters} onFilterChange={onFilterUpdate} /></th>
                  <th style={TH}>Material <ColumnFilter label="" colKey="material" data={sales} activeFilters={filters} onFilterChange={onFilterUpdate} /></th>
                   <th style={TH}>Customer <ColumnFilter label="" colKey="customerName" data={sales} activeFilters={filters} onFilterChange={onFilterUpdate} /></th>
                  <th style={{ ...TH, textAlign: 'center' }}>Type <ColumnFilter label="" colKey="paymentType" data={sales} activeFilters={filters} onFilterChange={onFilterUpdate} /></th>
                  <th style={{ ...TH, textAlign: 'center' }}>Status <ColumnFilter label="" colKey="paymentStatus" data={sales} activeFilters={filters} onFilterChange={onFilterUpdate} /></th>
                  <th style={{ ...TH, textAlign: 'right' }}>Bags</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Total</th>
                  <th style={{ ...TH, textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                    <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td></tr>
                ) : filteredSales.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No sales history found</td></tr>
                ) : (
                  paginatedSales.map((s, i) => (
                    <tr key={s.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                      <td style={TD}>{new Date(s.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                      <td style={TD}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: MCOL[s.material] || '#ccc' }} />
                          {s.material}
                          {s.stockType === 'set' && (
                            <span title="Sold from the set (water-damaged) stack"
                              style={{ padding: '1px 6px', borderRadius: '8px', background: 'rgba(244,63,94,0.1)', color: '#f43f5e', fontSize: '9px', fontWeight: 800 }}>
                              SET
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={TD}>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{s.customerName}</div>
                        <div style={{ fontSize: '10px', opacity: 0.7 }}>{s.remark}</div>
                      </td>
                       <td style={{ ...TD, textAlign: 'center' }}>
                         {s.paymentType === 'cash' ? <span style={{ color: '#10b981', fontSize: '11px', fontWeight: 700 }}>CASH</span> : <span style={{ color: '#0ea5e9', fontSize: '11px', fontWeight: 700 }}>ONLINE</span>}
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                         {s.paymentStatus === 'pending' 
                            ? <span style={{ padding: '2px 8px', borderRadius: '10px', background: 'rgba(244,63,94,0.1)', color: '#f43f5e', fontSize: '10px', fontWeight: 800 }}>PENDING</span>
                            : <span style={{ padding: '2px 8px', borderRadius: '10px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontSize: '10px', fontWeight: 800 }}>PAID</span>
                         }
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>
                        {s.quantity}
                        <div style={{ fontSize: '10px', fontWeight: 500 }}>{(s.quantity * 0.05).toFixed(2)} MT</div>
                      </td>
                      <td style={{ ...TD, textAlign: 'right', color: 'var(--accent)', fontWeight: 800 }}>₹{s.totalAmount.toLocaleString('en-IN')}</td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                         <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                           {s.paymentStatus === 'pending' && (
                             <>
                               <button className="btn-icon" title="Mark as Cash Paid" style={{ color: '#10b981' }} onClick={() => updatePaymentStatus(s.id, 'paid', 'cash')}><Banknote size={14} /></button>
                               <button className="btn-icon" title="Mark as Online Paid" style={{ color: '#0ea5e9' }} onClick={() => setOnlinePrompt({ id: s.id, account: '' })}><CreditCard size={14} /></button>
                             </>
                           )}
                           <button className="btn-icon" title="Print Receipt" style={{ color: 'var(--accent)' }} onClick={() => printReceipt(s)}><ReceiptText size={14} /></button>
                           {role === 'admin' && (
                             <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => deleteSale(s.id)}><Trash2 size={14} /></button>
                           )}
                         </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot style={{ position: 'sticky', bottom: 0, background: 'var(--bg-card)', boxShadow: '0 -2px 10px rgba(0,0,0,0.05)' }}>
                <tr>
                   <td colSpan={4} style={{ ...TD, fontWeight: 800, textAlign: 'right' }}>SUBTOTAL:</td>
                   <td style={{ ...TD, fontWeight: 900, textAlign: 'right' }}>{totalBags} <br/><span style={{fontSize:'10px'}}>{(totalBags*0.05).toFixed(2)} MT</span></td>
                   <td style={{ ...TD, fontWeight: 900, textAlign: 'right', color: 'var(--accent)', fontSize: '15px' }}>₹{totalVal.toLocaleString('en-IN')}</td>
                   <td style={TD}></td>
                </tr>
              </tfoot>
            </table>

            <Pagination 
              currentPage={currentPage}
              totalItems={filteredSales.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </TableScroll>
        </div>

        {/* ── NEW SALE FORM — hidden until asked for ── */}
        {formOpen && (
        <div style={{ position: 'sticky', top: '20px' }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title-block">
                <div className="card-icon" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--accent)' }}><Plus size={17} /></div>
                <div className="card-title-text"><h3>New Direct Sale</h3><p>Record sale & deduct stock</p></div>
              </div>
            </div>
            
            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="field-h">
                  <label><Calendar size={13} /> Date</label>
                  <input className="fi" type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
                </div>

                <div className="field-h">
                  <label><Package size={13} /> Brand</label>
                  <select className="fi" value={form.material} onChange={e => setForm({...form, material: e.target.value})}>
                    {MATS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div className="field-h">
                  <label><Weight size={13} /> Bags</label>
                  <input className="fi" type="number" placeholder="50" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} />
                </div>

                {/* Which stack these bags leave — good stock or the set pile. */}
                <div className="field-h">
                  <label><Package size={13} /> Stock</label>
                  <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                    <button type="button" onClick={() => setForm({ ...form, stockType: 'good' })}
                      className={`btn btn-sm ${form.stockType !== 'set' ? 'btn-s' : 'btn-g'}`}
                      style={{ height: '32px', fontSize: '12px', flex: 1 }}>
                      Good
                    </button>
                    <button type="button" onClick={() => setForm({ ...form, stockType: 'set' })}
                      title="Water-damaged bags, sold at a reduced price — deducted from the Set Bags stack in Stock"
                      className={`btn btn-sm ${form.stockType === 'set' ? 'btn-d' : 'btn-g'}`}
                      style={{ height: '32px', fontSize: '12px', flex: 1 }}>
                      Set bags
                    </button>
                  </div>
                </div>

                <div className="field-h">
                  <label><Weight size={13} /> Wt (MT)</label>
                  <input className="fi" type="text" readOnly value={weightMT.toFixed(2) + ' MT'} style={{ background: 'var(--bg)', opacity: 0.8 }} />
                </div>

                <div className="field-h">
                  <label><IndianRupee size={13} /> Rate</label>
                  <input className="fi" type="number" step="0.01" placeholder="420.00" value={form.rate} onChange={e => setForm({...form, rate: e.target.value})} />
                </div>

                <div className="field-h">
                  <label><CreditCard size={13} /> Pay Status</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <button type="button" onClick={() => setForm({...form, paymentStatus: 'paid'})} className={`btn btn-sm ${form.paymentStatus === 'paid' ? 'btn-s' : 'btn-g'}`} style={{ height: '32px', fontSize: '12px' }}>
                         <Check size={12} /> Paid
                      </button>
                      <button type="button" onClick={() => setForm({...form, paymentStatus: 'pending'})} className={`btn btn-sm ${form.paymentStatus === 'pending' ? 'btn-d' : 'btn-g'}`} style={{ height: '32px', fontSize: '12px' }}>
                         <RefreshCw size={12} /> Pending
                      </button>
                    </div>
                    {form.paymentStatus === 'paid' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <button type="button" onClick={() => setForm({...form, paymentType: 'cash'})} className={`btn btn-sm ${form.paymentType === 'cash' ? 'btn-p' : 'btn-g'}`} style={{ height: '32px', fontSize: '12px' }}>
                           <Banknote size={12} /> Cash
                        </button>
                        <button type="button" onClick={() => setForm({...form, paymentType: 'online'})} className={`btn btn-sm ${form.paymentType === 'online' ? 'btn-p' : 'btn-g'}`} style={{ height: '32px', fontSize: '12px' }}>
                           <CreditCard size={12} /> Online
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Online money has to land somewhere — record which account. */}
                {form.paymentStatus === 'paid' && form.paymentType === 'online' && (
                  <div className="field-h">
                    <label><User size={13} /> Sent to Account</label>
                    <input className="fi" type="text" list="sell-account-list" required
                      placeholder="Account holder name"
                      value={form.onlineAccount}
                      onChange={e => setForm({ ...form, onlineAccount: e.target.value })} />
                  </div>
                )}

                <div className="field-h">
                  <label><User size={13} /> Customer</label>
                  <input className="fi" type="text" placeholder="e.g. Local Cash" value={form.customerName} onChange={e => setForm({...form, customerName: e.target.value})} />
                </div>

                <div className="field-h">
                  <label><FileText size={13} /> Remarks</label>
                  <textarea className="fi" rows={2} placeholder="Optional notes" value={form.remark} onChange={e => setForm({...form, remark: e.target.value})} />
                </div>

                <div style={{ 
                  background: 'var(--bg)', padding: '15px', borderRadius: '12px', border: '1px dashed var(--border)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Sale Amount</div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--accent)' }}>₹{totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                </div>

                {err && <div style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 600 }}>{err}</div>}

                <button type="submit" className="btn btn-a" disabled={saving || !(role === 'admin' || permissions?.sell === 'edit')} style={{ padding: '12px' }}>
                  {saving ? 'Processing...' : <><Check size={16} /> Confirm & Print Receipt</>}
                </button>
              </div>
            </form>
          </div>
        </div>
        )}

      </div>
    </div>
  );
}
