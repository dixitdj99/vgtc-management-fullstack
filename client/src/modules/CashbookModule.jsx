import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Plus, ArrowDownCircle, ArrowUpCircle, Trash2,
  AlertTriangle, X, Check, RefreshCw, Wallet, CreditCard,
  TrendingDown, Smartphone, FileText, Filter, Download, Printer, Search
} from 'lucide-react';
import ConfirmSaveModal from '../components/ConfirmSaveModal';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';

const fmtRs = n => 'Rs.' + Math.abs(Math.round(n)).toLocaleString('en-IN');
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const API_V = `http://${window.location.hostname}:5000/api/vouchers`;



/* ══════ MAIN ══════ */
export default function CashbookModule({ initialTab, moduleType }) {
  /* ── local state ── */
  const API_CB = moduleType === 'jkl' ? `http://${window.location.hostname}:5000/api/jkl/cashbook` : `http://${window.location.hostname}:5000/api/cashbook`;
  const VTYPES = moduleType === 'jkl' ? ['JK_Lakshmi'] : ['Dump', 'JK_Super'];

  /* ── sub-components ── */
  const DelConfirm = ({ id, label, onClose, onDone }) => {
    const [busy, setBusy] = useState(false);
    const go = async () => {
      setBusy(true);
      try { await axios.delete(API_CB + '/' + id); onDone(); }
      catch (e) { alert(e.response?.data?.error || 'Delete failed'); }
      finally { setBusy(false); }
    };
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div initial={{ opacity: 0, scale: 0.93 }} animate={{ opacity: 1, scale: 1 }} style={{ width: '320px', background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: '16px', padding: '26px 22px', textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <AlertTriangle size={24} color="var(--danger)" />
          </div>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>Delete Entry?</div>
          <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginBottom: '20px' }}>{label}</div>
          <div style={{ display: 'flex', gap: '9px', justifyContent: 'center' }}>
            <button className="btn btn-g" onClick={onClose}>Cancel</button>
            <button className="btn btn-d" onClick={go} disabled={busy}>{busy ? '…' : <><Trash2 size={13} /> Delete</>}</button>
          </div>
        </motion.div>
      </div>
    );
  };

  const EntryForm = ({ type, onSave, onCancel }) => {
    const [form, setForm] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), remark: '' });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const [isConfirming, setIsConfirming] = useState(false);
    const isDeposit = type === 'deposit';
    const handleFormRequest = e => {
      e.preventDefault(); setErr('');
      if (!form.amount || parseFloat(form.amount) <= 0) { setErr('Enter a valid amount'); return; }
      setIsConfirming(true);
    };
    const executeSave = async () => {
      setSaving(true); setIsConfirming(false);
      try { await axios.post(API_CB + (isDeposit ? '/deposit' : '/cash-out'), form); setForm({ amount: '', date: new Date().toISOString().slice(0, 10), remark: '' }); onSave(); }
      catch (e) { setErr(e.response?.data?.error || 'Error'); }
      finally { setSaving(false); }
    };
    return (
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ background: 'var(--bg-card)', border: `1px solid ${isDeposit ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)'}`, borderRadius: '14px', padding: '18px 20px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '14px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDeposit ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.1)' }}>
            {isDeposit ? <ArrowDownCircle size={16} color="var(--accent)" /> : <ArrowUpCircle size={16} color="var(--danger)" />}
          </div>
          <span style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text)' }}>{isDeposit ? 'Add Deposit' : 'Cash Out'}</span>
        </div>
        <form onSubmit={handleFormRequest}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: '9px', alignItems: 'end' }}>
            <div className="field"><label>Amount (Rs.)</label><input className="fi" type="number" step="0.01" placeholder="0" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
            <div className="field"><label>Date</label><input className="fi" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div className="field"><label>Remark</label><input className="fi" type="text" placeholder={isDeposit ? 'e.g. Opening balance' : 'e.g. Office expenses'} value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} /></div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button type="submit" className={`btn ${isDeposit ? 'btn-a' : 'btn-d'}`} disabled={saving}>{saving ? '…' : <Check size={14} />}</button>
              <button type="button" className="btn btn-g btn-icon" onClick={onCancel}><X size={14} /></button>
            </div>
          </div>
          {err && <div style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 600, marginTop: '6px' }}>{err}</div>}
        </form>
        <ConfirmSaveModal isOpen={isConfirming} onClose={() => setIsConfirming(false)} onConfirm={executeSave} title={isDeposit ? 'Confirm Deposit' : 'Confirm Cash Out'} message={`Are you sure you want to save this ${isDeposit ? 'Deposit' : 'Cash Out'} of Rs.${form.amount}?`} isSaving={saving} />
      </motion.div>
    );
  };

  const [cbEntries, setCbEntries] = useState([]);
  const [allVouchers, setAllVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('ledger');
  const [showForm, setShowForm] = useState(null); // 'deposit' | 'cash_out' | null
  const [delTarget, setDelTarget] = useState(null);
  const [onlinePaidTarget, setOnlinePaidTarget] = useState(null);

  /* Filter states */
  const [fSearch, setFSearch] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [fPaid, setFPaid] = useState('all');

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [cb, ...voucherArrays] = await Promise.all([
        axios.get(API_CB).then(r => r.data),
        ...VTYPES.map(t => axios.get(`http://${window.location.hostname}:5000/api/vouchers/${t}`).then(r =>
          r.data.map(v => ({ ...v, vType: t }))
        )),
      ]);
      setCbEntries(cb);
      setAllVouchers(voucherArrays.flat());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  /* ── Derived voucher lists ── */
  const voucherCashAdv = useMemo(() =>
    allVouchers
      .filter(v => parseFloat(v.advanceCash) > 0)
      .map(v => ({
        id: 'v_cash_' + v.id,
        voucherId: v.id,
        date: v.date,
        type: 'voucher_cash',
        amount: -(parseFloat(v.advanceCash) || 0),
        remark: `Cash Advance — Truck ${v.truckNo || '?'} | LR #${v.lrNo || '?'} [${v.vType}]`,
        truckNo: v.truckNo,
        lrNo: v.lrNo,
        vType: v.vType,
      }))
      .sort((a, b) => b.date > a.date ? 1 : -1),
    [allVouchers]);

  const onlineAdvList = useMemo(() =>
    allVouchers
      .filter(v => parseFloat(v.advanceOnline) > 0)
      .map(v => ({
        id: 'v_online_' + v.id,
        date: v.date,
        amount: parseFloat(v.advanceOnline) || 0,
        remark: `Online Advance — Truck ${v.truckNo || '?'} | LR #${v.lrNo || '?'} [${v.vType}]`,
        truckNo: v.truckNo,
        lrNo: v.lrNo,
        vType: v.vType,
        isOnlinePaid: v.isOnlinePaid || false,
        onlinePaidDate: v.onlinePaidDate || null,
      }))
      .sort((a, b) => b.date > a.date ? 1 : -1),
    [allVouchers]);

  /* ── Manual entries (deposits and cash-outs) ── */
  const deposits = useMemo(() => cbEntries.filter(e => e.type === 'deposit'), [cbEntries]);
  const cashOuts = useMemo(() => cbEntries.filter(e => e.type === 'cash_out'), [cbEntries]);

  /* ── Combined ledger sorted by date ── */
  const ledger = useMemo(() => {
    const rows = [
      ...deposits.map(e => ({ ...e, _sign: +1 })),
      ...cashOuts.map(e => ({ ...e, amount: -Math.abs(e.amount), _sign: -1 })),
      ...voucherCashAdv.map(e => ({ ...e, _sign: -1, deletable: false })),
    ].sort((a, b) => {
      const da = a.date || a.createdAt || '';
      const db = b.date || b.createdAt || '';
      if (da !== db) return da > db ? 1 : -1;
      return (a.createdAt || '') > (b.createdAt || '') ? 1 : -1;
    });
    let running = 0;
    return rows.map(r => {
      running += r.amount * (r._sign > 0 ? 1 : -1) * (r._sign > 0 ? 1 : 1);
      // actually: deposit → +, voucher_cash → -, cash_out → -
      return r;
    });
  }, [deposits, cashOuts, voucherCashAdv]);

  /* ── Running balance ledger ── */
  const ledgerWithBalance = useMemo(() => {
    const rows = [
      ...deposits.map(e => ({
        ...e, credit: e.amount, debit: 0,
        label: e.remark || 'Deposit',
        badge: 'deposit', deletable: true,
      })),
      ...cashOuts.map(e => ({
        ...e, credit: 0, debit: e.amount,
        label: e.remark || 'Cash Out',
        badge: 'cash_out', deletable: true,
      })),
      ...voucherCashAdv.map(e => ({
        ...e, credit: 0, debit: Math.abs(e.amount),
        label: e.remark,
        badge: 'voucher_cash', deletable: false,
      })),
    ].sort((a, b) => {
      const da = a.date || '', db = b.date || '';
      if (da !== db) return da > db ? 1 : -1;
      return (a.createdAt || '') > (b.createdAt || '') ? 1 : -1;
    });
    let bal = 0;
    return rows.map(r => {
      bal = bal + r.credit - r.debit;
      return { ...r, balance: bal };
    });
  }, [deposits, cashOuts, voucherCashAdv]);

  /* ── Filtered data ── */
  const filterRows = (rows, applyPaidFilter = false) => {
    return rows.filter(r => {
      let match = true;
      if (fFrom && r.date < fFrom) match = false;
      if (fTo && r.date > fTo) match = false;
      if (fSearch) {
        const q = fSearch.toLowerCase();
        const str = `${r.label || r.remark || ''} ${r.truckNo || ''} ${r.lrNo || ''}`.toLowerCase();
        if (!str.includes(q)) match = false;
      }
      if (applyPaidFilter) {
        if (fPaid === 'paid' && !r.isOnlinePaid) match = false;
        if (fPaid === 'unpaid' && r.isOnlinePaid) match = false;
      }
      return match;
    });
  };

  const filteredLedger = useMemo(() => filterRows(ledgerWithBalance), [ledgerWithBalance, fFrom, fTo, fSearch]);
  const filteredDeposits = useMemo(() => filterRows(deposits.map(e => ({ ...e, credit: e.amount, debit: 0, label: e.remark || 'Deposit', badge: 'deposit', deletable: true }))), [deposits, fFrom, fTo, fSearch]);
  const filteredVoucherCash = useMemo(() => filterRows(voucherCashAdv.map(e => ({ ...e, credit: 0, debit: Math.abs(e.amount), label: e.remark, badge: 'voucher_cash', deletable: false }))), [voucherCashAdv, fFrom, fTo, fSearch]);
  const filteredCashOuts = useMemo(() => filterRows(cashOuts.map(e => ({ ...e, credit: 0, debit: e.amount, label: e.remark || 'Cash Out', badge: 'cash_out', deletable: true }))), [cashOuts, fFrom, fTo, fSearch]);
  const filteredOnline = useMemo(() => filterRows(onlineAdvList, true), [onlineAdvList, fFrom, fTo, fSearch, fPaid]);

  const activeRows = tab === 'ledger' ? filteredLedger :
    tab === 'deposits' ? filteredDeposits :
      tab === 'voucher_cash' ? filteredVoucherCash :
        tab === 'online' ? filteredOnline :
          filteredCashOuts;

  /* ── Summary stats ── */
  const currentBalance = deposits.reduce((s, e) => s + e.amount, 0) - cashOuts.reduce((s, e) => s + e.amount, 0) - voucherCashAdv.reduce((s, e) => s + Math.abs(e.amount), 0);
  const totalDeposited = filteredDeposits.reduce((s, e) => s + e.credit, 0);
  const totalOnline = filteredOnline.reduce((s, e) => s + e.amount, 0);

  const BADGE_STYLE = {
    deposit: { bg: 'rgba(16,185,129,0.1)', color: 'var(--accent)', label: 'Deposit' },
    cash_out: { bg: 'rgba(244,63,94,0.1)', color: 'var(--danger)', label: 'Cash Out' },
    voucher_cash: { bg: 'rgba(99,102,241,0.1)', color: 'var(--primary)', label: 'Voucher Adv' },
  };

  const toggleOnlinePaid = async (voucherId, currentStatus, paymentDate = null) => {
    try {
      const payload = { isOnlinePaid: !currentStatus };
      if (!currentStatus && paymentDate) {
        payload.onlinePaidDate = paymentDate;
      } else if (currentStatus) {
        payload.onlinePaidDate = null; // Clear it if marking unpaid
      }
      await axios.patch(`${API_V}/${voucherId}`, payload);
      fetchAll();
      setOnlinePaidTarget(null);
    } catch (e) {
      alert('Failed to update online payment status');
    }
  };

  const TH = {
    padding: '8px 11px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.07em', background: 'var(--bg-th)',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
  };
  const TD = { padding: '9px 11px', fontSize: '12.5px', color: 'var(--text-sub)', verticalAlign: 'middle', borderBottom: '1px solid var(--border-row)' };

  /* ── Render helper: ledger table ── */
  const LedgerTable = ({ rows, showBalance = true, showBadge = true }) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
        <thead><tr>
          <th style={TH}>Date</th>
          <th style={TH}>Description</th>
          {showBadge && <th style={TH}>Type</th>}
          <th style={{ ...TH, textAlign: 'right', color: 'var(--accent)' }}>Credit (In)</th>
          <th style={{ ...TH, textAlign: 'right', color: 'var(--danger)' }}>Debit (Out)</th>
          {showBalance && <th style={{ ...TH, textAlign: 'right' }}>Balance</th>}
          <th style={{ ...TH, textAlign: 'center' }}>Action</th>
        </tr></thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={7} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>No entries yet</td></tr>
          )}
          {rows.map((r, i) => {
            const bs = BADGE_STYLE[r.badge] || BADGE_STYLE['deposit'];
            return (
              <tr key={r.id}
                style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                <td style={{ ...TD, maxWidth: '320px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '12.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.label}
                  </div>
                  {(r.truckNo || r.lrNo) && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                      {r.truckNo && `Truck: ${r.truckNo}`} {r.lrNo && `| LR #${r.lrNo}`}
                    </div>
                  )}
                </td>
                {showBadge && (
                  <td style={{ ...TD }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 700, background: bs.bg, color: bs.color }}>
                      {bs.label}
                    </span>
                  </td>
                )}
                <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontSize: '13px' }}>
                  {r.credit > 0 ? fmtRs(r.credit) : '—'}
                </td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--danger)', fontSize: '13px' }}>
                  {r.debit > 0 ? fmtRs(r.debit) : '—'}
                </td>
                {showBalance && (
                  <td style={{
                    ...TD, textAlign: 'right', fontWeight: 800, fontSize: '13px',
                    color: r.balance >= 0 ? 'var(--accent)' : 'var(--danger)'
                  }}>
                    {fmtRs(r.balance)}
                  </td>
                )}
                <td style={{ ...TD, textAlign: 'center' }}>
                  {r.deletable !== false ? (
                    <button className="btn btn-d btn-icon btn-sm" title="Delete entry"
                      onClick={() => setDelTarget({ id: r.id, label: r.label })}>
                      <Trash2 size={13} />
                    </button>
                  ) : (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Auto</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        {showBalance && rows.length > 0 && (() => {
          const last = rows[rows.length - 1];
          const totCr = rows.reduce((s, r) => s + r.credit, 0);
          const totDb = rows.reduce((s, r) => s + r.debit, 0);
          return (
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-tf)' }}>
                <td colSpan={showBadge ? 2 : 2} style={{ ...TD, fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>Totals</td>
                {showBadge && <td style={TD}></td>}
                <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: 'var(--accent)', fontSize: '13px' }}>{fmtRs(totCr)}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: 'var(--danger)', fontSize: '13px' }}>{fmtRs(totDb)}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 900, fontSize: '14px', color: last.balance >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{fmtRs(last.balance)}</td>
                <td style={TD}></td>
              </tr>
            </tfoot>
          );
        })()}
      </table>
    </div>
  );

  /* Online advances table (no balance col) */
  const OnlineTable = ({ rows }) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
        <thead><tr>
          <th style={TH}>#</th>
          <th style={TH}>Date</th>
          <th style={TH}>Truck</th>
          <th style={TH}>LR No.</th>
          <th style={TH}>Type</th>
          <th style={{ ...TH, textAlign: 'right' }}>Online Amount</th>
          <th style={{ ...TH, textAlign: 'center' }}>Status</th>
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>No online advances in vouchers</td></tr>}
          {rows.map((r, i) => (
            <tr key={r.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
              <td style={{ ...TD, color: 'var(--text-muted)', fontWeight: 700, textAlign: 'center' }}>{i + 1}</td>
              <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
              <td style={{ ...TD, fontWeight: 700, color: 'var(--text)' }}>{r.truckNo || '—'}</td>
              <td style={{ ...TD }}><span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>#{r.lrNo}</span></td>
              <td style={{ ...TD }}><span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: 'rgba(14,165,233,0.1)', color: '#0ea5e9' }}>{r.vType}</span></td>
              <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: '#0ea5e9', fontSize: '13px' }}>{fmtRs(r.amount)}</td>
              <td style={{ ...TD, textAlign: 'center' }}>
                <button
                  onClick={() => r.isOnlinePaid ? toggleOnlinePaid(r.id.replace('v_online_', ''), true) : setOnlinePaidTarget({ id: r.id.replace('v_online_', ''), defaultDate: new Date().toISOString().slice(0, 10), date: new Date().toISOString().slice(0, 10) })}
                  className={`btn btn-sm ${r.isOnlinePaid ? 'btn-g' : 'btn-a'}`}
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                >
                  {r.isOnlinePaid ? <><Check size={12} /> Paid{r.onlinePaidDate ? ` (${fmtDate(r.onlinePaidDate)})` : ''}</> : 'Mark Paid'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-tf)' }}>
              <td colSpan={2} style={{ ...TD, fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>Total Online Advance</td>
              <td style={{ ...TD, textAlign: 'right', fontWeight: 900, fontSize: '14px', color: '#0ea5e9' }}>{fmtRs(filteredOnline.reduce((sum, r) => sum + r.amount, 0))}</td>
              <td style={TD}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );

  const tabRows = {
    ledger: ledgerWithBalance,
    deposits: filteredDeposits,
    voucher_cash: filteredVoucherCash,
    cash_out: filteredCashOuts,
  };

  const handleExportExcel = () => {
    exportToExcel(activeRows.map(r => ({
      Date: r.date,
      Description: r.label || r.remark,
      Type: r.badge,
      Credit: r.credit || 0,
      Debit: r.debit || 0,
      Amount: r.amount,
      Balance: r.balance !== undefined ? r.balance : '',
      TruckNo: r.truckNo || '',
      LRNo: r.lrNo || ''
    })), `${tab}_export_${new Date().toISOString().slice(0, 10)}`);
  };

  const handleExportPDF = () => {
    let cols = [];
    if (tab === 'online') {
      cols = ['date', 'truckNo', 'lrNo', 'vType', 'amount', 'isOnlinePaid'];
    } else {
      cols = ['date', 'label', 'badge', 'credit', 'debit', 'balance'];
    }
    const safeData = activeRows.map(r => ({ ...r, label: r.label || r.remark }));
    exportToPDF(safeData, `Cashbook - ${tab}`, cols);
  };

  return (
    <div>
      <AnimatePresence>
        {delTarget && (
          <DelConfirm id={delTarget.id} label={delTarget.label}
            onClose={() => setDelTarget(null)}
            onDone={() => { setDelTarget(null); fetchAll(); }} />
        )}
        {onlinePaidTarget && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              style={{ width: '340px', background: 'var(--bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '8px', color: 'var(--text)' }}>Select Payment Date</div>
              <div style={{ fontSize: '13px', color: 'var(--text-sub)', marginBottom: '18px' }}>When was this online advance paid?</div>
              <input type="date" value={onlinePaidTarget.date} onChange={e => setOnlinePaidTarget(prev => ({ ...prev, date: e.target.value }))} className="fi" style={{ width: '100%', marginBottom: '20px' }} />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button className="btn btn-g" onClick={() => setOnlinePaidTarget(null)}>Cancel</button>
                <button className="btn btn-a" onClick={() => toggleOnlinePaid(onlinePaidTarget.id, false, onlinePaidTarget.date)}><Check size={14} /> Confirm Paid</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', background: 'var(--bg-card)', padding: '10px 14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <div className="field" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="fi" type="text" placeholder="Search remarks, truck..." value={fSearch} onChange={e => setFSearch(e.target.value)} style={{ paddingLeft: '32px' }} />
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <input className="fi" type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} title="From Date" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <input className="fi" type="date" value={fTo} onChange={e => setFTo(e.target.value)} title="To Date" />
        </div>
        {tab === 'online' && (
          <div className="field" style={{ marginBottom: 0 }}>
            <select className="fi" value={fPaid} onChange={e => setFPaid(e.target.value)}>
              <option value="all">All Status</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
        )}
        {(fSearch || fFrom || fTo || (tab === 'online' && fPaid !== 'all')) && (
          <button className="btn btn-g" onClick={() => { setFSearch(''); setFFrom(''); setFTo(''); setFPaid('all'); }}>Clear Filters</button>
        )}
      </div>

      {/* Header */}
      <div className="page-hd">
        <div>
          <h1><BookOpen size={20} color="#10b981" /> {moduleType === 'jkl' ? 'JK Lakshmi Cashbook' : 'Cashbook'}</h1>
          <p>Cash flow tracking & ledger</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn btn-g btn-sm" onClick={fetchAll}><RefreshCw size={13} /> Refresh</button>
          <button className="btn btn-a btn-sm" onClick={() => setShowForm(f => f === 'deposit' ? null : 'deposit')}>
            <ArrowDownCircle size={14} /> Deposit
          </button>
          <button className="btn btn-d btn-sm" onClick={() => setShowForm(f => f === 'cash_out' ? null : 'cash_out')}>
            <ArrowUpCircle size={14} /> Cash Out
          </button>
        </div>
      </div>

      {/* Entry forms */}
      <AnimatePresence>
        {showForm && (
          <EntryForm type={showForm} onSave={() => { fetchAll(); setShowForm(null); }} onCancel={() => setShowForm(null)} />
        )}
      </AnimatePresence>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '12px', marginBottom: '18px' }}>
        {[
          { label: 'Current Balance', val: currentBalance, Icon: Wallet, color: '#6366f1', big: true },
          { label: 'Total Deposited', val: totalDeposited, Icon: ArrowDownCircle, color: '#10b981' },
          { label: 'Online Advances', val: totalOnline, Icon: Smartphone, color: '#0ea5e9', note: 'not deducted' },
        ].map(({ label, val, Icon, color, big, note }) => (
          <div key={label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px',
            padding: '14px 18px', boxShadow: big ? '0 0 0 1px rgba(99,102,241,0.2)' : 'none'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
              <Icon size={16} color={color} />
            </div>
            <div style={{ fontSize: big ? '22px' : '18px', fontWeight: 900, color: val < 0 ? 'var(--danger)' : color, lineHeight: 1 }}>
              {val < 0 ? '-' : ''}{fmtRs(Math.abs(val))}
            </div>
            {note && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>{note}</div>}
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {[
          { id: 'ledger', label: 'Full Ledger', count: ledgerWithBalance.length },
          { id: 'deposits', label: 'Deposits', count: deposits.length },
          { id: 'voucher_cash', label: 'Voucher Cash Adv', count: voucherCashAdv.length },
          { id: 'online', label: 'Online Advances', count: onlineAdvList.length },
          { id: 'cash_out', label: 'Cash Outs', count: cashOuts.length },
        ].map(({ id, label, count }) => (
          <button key={id} onClick={() => setTab(id)}
            style={{
              padding: '7px 14px', borderRadius: '9px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '12px', fontWeight: 700, transition: 'all 0.15s',
              borderColor: tab === id ? 'var(--primary)' : 'var(--border)',
              background: tab === id ? 'rgba(99,102,241,0.1)' : 'transparent',
              color: tab === id ? 'var(--primary)' : 'var(--text-muted)'
            }}>
            {label}
            <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 800, opacity: 0.7 }}>({count})</span>
          </button>
        ))}
      </div>

      {/* Table content */}
      <div className="card">
        <div className="card-header">
          <div className="card-title-block">
            <div className="card-icon" style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--accent)' }}>
              <BookOpen size={17} />
            </div>
            <div className="card-title-text" style={{ flex: 1 }}>
              <h3>
                {tab === 'ledger' ? 'Full Ledger (with running balance)' :
                  tab === 'deposits' ? 'Deposits' :
                    tab === 'voucher_cash' ? 'Voucher Cash Advances (auto-deducted)' :
                      tab === 'online' ? 'Online Advances (reference only — not deducted)' :
                        'Cash Outs & Other Expenses'}
              </h3>
              <p>
                {tab === 'ledger' ? ledgerWithBalance.length + ' transactions' :
                  tab === 'deposits' ? deposits.length + ' deposits' :
                    tab === 'voucher_cash' ? voucherCashAdv.length + ' advances from vouchers' :
                      tab === 'online' ? onlineAdvList.length + ' online advances' :
                        cashOuts.length + ' cash out entries'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-g btn-sm" onClick={handleExportExcel}><Download size={13} /> Excel</button>
              <button className="btn btn-g btn-sm" onClick={handleExportPDF}><Printer size={13} /> PDF</button>
            </div>
          </div>
        </div>
        {loading
          ? <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading…</div>
          : tab === 'online'
            ? <OnlineTable rows={filteredOnline} />
            : <LedgerTable
              rows={activeRows}
              showBalance={tab === 'ledger'}
              showBadge={tab === 'ledger'} />}
      </div>
    </div>
  );
}