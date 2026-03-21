import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, AlertCircle, Pencil, X, Save, Printer, Calendar, BarChart3, ChevronLeft, ChevronUp, ChevronDown, Check, Download, Truck, Search, Loader2
} from 'lucide-react';
import ConfirmSaveModal from '../components/ConfirmSaveModal';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import ColumnFilter from '../components/ColumnFilter';

const API_V = `/vouchers`;
const TYPES = ['Dump', 'JK_Lakshmi', 'JK_Super'];

function calcNet(v) {
  const gross = (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);
  // If v.advanceDiesel is 'FULL', use the 4000 fallback, otherwise use the actual value
  const diesel = v.advanceDiesel === 'FULL' ? 4000 : (parseFloat(v.advanceDiesel) || 0);
  const cash = parseFloat(v.advanceCash) || 0;
  const online = parseFloat(v.advanceOnline) || 0;
  const munshi = parseFloat(v.munshi) || 0;
  const shortage = parseFloat(v.shortage) || 0;
  return gross - diesel - cash - online - munshi - shortage;
}
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(y, m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}
const fmtRs = n => 'Rs.' + Math.round(n).toLocaleString('en-IN');
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const TH = {
  padding: '8px 10px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.07em', background: 'var(--bg-th)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
};
const TD = { padding: '7px 9px', fontSize: '12px', color: 'var(--text-sub)', verticalAlign: 'middle', whiteSpace: 'nowrap' };
const TDF = { ...TD, fontWeight: 800, color: 'var(--text)', background: 'var(--bg-tf)', borderTop: '2px solid var(--border)' };

/* ── Print Driver (used from both selection bar and month header) ── */
function doPrint(rows, truckNo, label, tabName) {
  if (!rows.length) { alert('No rows to print'); return; }
  const net = rows.reduce((s, v) => s + calcNet(v), 0);
  const paid = rows.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0);
  const out = Math.max(0, net - paid);
  const cols = ['#', 'Date', 'LR No.', 'Destination', 'Weight', 'Rate', 'Gross', 'Diesel', 'Cash', 'Online', 'Munshi', 'Shortage', 'Net Bal', 'Paid', 'Status'];
  const tbody = rows.map((v, i) => {
    const n = calcNet(v), p = parseFloat(v.paidBalance) || 0, o = Math.max(0, n - p);
    return `<tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#fff'}">
      <td>${i + 1}</td><td>${v.date || ''}</td><td>#${v.lrNo || ''}</td>
      <td>${v.destination || v.partyName || '—'}</td>
      <td style="text-align:right">${v.weight || '—'}</td><td style="text-align:right">${v.rate || '—'}</td>
      <td style="text-align:right">Rs.${Math.round((parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0)).toLocaleString()}</td>
      <td style="text-align:right;color:#c00">${v.advanceDiesel === 'FULL' ? '4000(F)' : (v.advanceDiesel || '—')}</td>
      <td style="text-align:right;color:#c00">${v.advanceCash || '—'}</td>
      <td style="text-align:right;color:#c00">${v.advanceOnline || '—'}</td>
      <td style="text-align:right">${v.munshi || '—'}</td>
      <td style="text-align:right">${v.shortage || '—'}</td>
      <td style="text-align:right;font-weight:800;color:${n >= 0 ? '#16a34a' : '#dc2626'}">Rs.${Math.round(n).toLocaleString()}</td>
      <td style="text-align:right">${p ? 'Rs.' + Math.round(p).toLocaleString() : '—'}</td>
      <td style="text-align:center;font-weight:700;color:${o <= 0 ? '#16a34a' : '#b45309'}">
        ${o <= 0 ? `✓ Paid${v.paymentClearedDate ? `<div style="font-size:8px;color:#666;font-weight:normal">${v.paymentClearedDate}</div>` : ''}` : 'Rs.' + Math.round(o).toLocaleString()}
      </td>
    </tr>`;
  }).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Balance Sheet — ${truckNo}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;padding:10mm}
  h1{font-size:16px;font-weight:900;text-align:center;letter-spacing:1px}
  .sub{text-align:center;font-size:10px;color:#555;margin:2px 0 10px}
  .meta{display:flex;justify-content:space-between;margin-bottom:10px;padding:8px 12px;background:#f5f5f5;border-radius:4px}
  table{width:100%;border-collapse:collapse}th{padding:6px 8px;background:#333;color:#fff;font-size:10px;text-align:left}
  td{padding:5px 8px;border-bottom:1px solid #e5e5e5}
  .tot{background:#eee;font-weight:bold}.sig{display:flex;justify-content:space-between;margin-top:28px}
  .sl{min-width:120px;border-top:1px solid #000;padding-top:4px;text-align:center;font-size:10px}
  @media print{body{padding:0}}</style></head><body>
  <h1>Vikas Goods Transport</h1>
  <div class="sub">Balance Statement — ${tabName}</div>
  <div class="meta">
    <span><b>Truck:</b> ${truckNo}</span>
    <span><b>Period:</b> ${label}</span>
    <span><b>Trips:</b> ${rows.length}</span>
    <span><b>Printed:</b> ${new Date().toLocaleDateString('en-IN')}</span>
  </div>
  <table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
  <tbody>${tbody}</tbody>
  <tfoot><tr class="tot">
    <td colspan="4">TOTALS (${rows.length} trips)</td>
    <td style="text-align:right">${rows.reduce((s, v) => s + (parseFloat(v.weight) || 0), 0).toFixed(2)}</td>
    <td></td>
    <td style="text-align:right">Rs.${Math.round(rows.reduce((s, v) => s + (parseFloat(v.total) || 0), 0)).toLocaleString()}</td>
    <td colspan="5"></td>
    <td style="text-align:right;font-weight:800">Rs.${Math.round(net).toLocaleString()}</td>
    <td style="text-align:right">Rs.${Math.round(paid).toLocaleString()}</td>
    <td style="text-align:center;font-weight:800;color:${out <= 0 ? '#16a34a' : '#b45309'}">${out <= 0 ? '✓ Cleared' : 'Rs.' + Math.round(out).toLocaleString() + ' due'}</td>
  </tr></tfoot></table>
  <div class="sig"><div class="sl">Driver</div><div class="sl">Authorised Sign</div></div>
  <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
  </body></html>`;
  const w = window.open('', '_blank', 'width=1000,height=640');
  w.document.write(html); w.document.close();
}

/* ── Editable Row ── */
function VoucherRow({ v, idx, onSave, checked, onCheck, role, permissions }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const startEdit = () => {
    setForm({
      advanceDiesel: v.advanceDiesel || '', advanceCash: v.advanceCash || '',
      advanceOnline: v.advanceOnline || '', munshi: v.munshi || '',
      shortage: v.shortage || '', paidBalance: v.paidBalance || '',
      rate: v.rate || '', weight: v.weight || '', total: v.total || ''
    });
    setEditing(true);
  };
  const executeSave = async () => {
    setSaving(true); setIsConfirming(false);
    try { await ax.patch(API_V + '/' + v.id, form); setEditing(false); onSave(); }
    catch { alert('Save failed'); } finally { setSaving(false); }
  };
  const S = (k, val) => setForm(f => ({ ...f, [k]: val }));
  const FI = (key, w = '68px', txt = false) =>
    txt
      ? <input type="text" value={form[key] || ''} onChange={e => S(key, e.target.value)}
        style={{ width: w, background: 'var(--bg-input)', border: '1px solid var(--primary)', borderRadius: '5px', padding: '3px 6px', color: 'var(--text)', fontSize: '11.5px', fontFamily: 'inherit' }} />
      : <input type="number" step="any" value={form[key] || ''} onChange={e => S(key, e.target.value)}
        style={{ width: w, background: 'var(--bg-input)', border: '1px solid var(--primary)', borderRadius: '5px', padding: '3px 6px', color: 'var(--text)', fontSize: '11.5px', fontFamily: 'inherit' }} />;

  const cv = editing ? { ...v, ...form } : v;
  const net = calcNet(cv);
  const paid = parseFloat(cv.paidBalance) || 0;
  const outstanding = Math.max(0, net - paid);
  const cleared = outstanding <= 0;
  const bg = checked ? 'rgba(99,102,241,0.07)' : (idx % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)');

  return (
    <tr style={{ background: editing ? 'var(--bg-input)' : bg, outline: checked ? '1px solid var(--primary)' : '' }}
      onMouseEnter={e => { if (!editing && !checked) e.currentTarget.style.background = 'var(--bg-row-hover)'; }}
      onMouseLeave={e => { if (!editing && !checked) e.currentTarget.style.background = bg; }}>

      {/* Checkbox */}
      <td style={{ ...TD, textAlign: 'center', padding: '6px 8px' }}>
        <input type="checkbox" checked={checked} onChange={() => onCheck(v.id)}
          style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: 'var(--primary)' }} />
      </td>
      <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{idx + 1}</td>
      <td style={{ ...TD }}>{v.date}</td>
      <td style={{ ...TD }}><span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>#{v.lrNo}</span></td>
      <td style={{ ...TD }}>{v.destination || v.partyName || '—'}</td>
      <td style={{ ...TD, textAlign: 'right' }}>{editing ? FI('weight', '60px') : (v.weight || '—')}</td>
      <td style={{ ...TD, textAlign: 'right' }}>{editing ? FI('rate', '60px') : (v.rate || '—')}</td>
      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>
        {editing ? FI('total', '75px') : fmtRs((parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0))}
      </td>
      <td style={{ ...TD, textAlign: 'right', color: 'var(--warn)' }}>
        {editing ? FI('advanceDiesel', '70px', true) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <span style={{ fontWeight: v.isDieselVerified ? 800 : 400 }}>
              {v.advanceDiesel === 'FULL' ? '4000 (Est.)' : (v.advanceDiesel || '—')}
            </span>
            {v.isFullTank && <span style={{ fontSize: '8px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '1px 3px', borderRadius: '3px', fontWeight: 800 }}>FULL TANK</span>}
          </div>
        )}
      </td>
      <td style={{ ...TD, textAlign: 'right', color: 'var(--warn)' }}>{editing ? FI('advanceCash') : (v.advanceCash || '—')}</td>
      <td style={{ ...TD, textAlign: 'right', color: 'var(--warn)' }}>
        {editing
          ? FI('advanceOnline')
          : (parseFloat(v.advanceOnline) > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
              <span>{v.advanceOnline}</span>
              {v.isOnlinePaid ?
                <span style={{ fontSize: '9px', background: 'rgba(16,185,129,0.1)', color: 'var(--accent)', padding: '1px 4px', borderRadius: '3px', fontWeight: 800 }}>PAID</span> :
                <span style={{ fontSize: '9px', background: 'rgba(244,63,94,0.1)', color: 'var(--danger)', padding: '1px 4px', borderRadius: '3px', fontWeight: 800 }}>PENDING</span>
              }
            </div>
          ) : '—')}
      </td>
      <td style={{ ...TD, textAlign: 'right' }}>{editing ? FI('munshi') : (v.munshi || '—')}</td>
      <td style={{ ...TD, textAlign: 'right' }}>{editing ? FI('shortage') : (v.shortage || '—')}</td>
      <td style={{
        ...TD, textAlign: 'right', fontWeight: 800, fontSize: '13px',
        color: net >= 0 ? 'var(--accent)' : 'var(--danger)'
      }}>
        {fmtRs(net)}
      </td>
      <td style={{ ...TD, textAlign: 'right' }}>{editing ? FI('paidBalance') : (paid ? fmtRs(paid) : '—')}</td>
      <td style={{ ...TD, textAlign: 'center' }}>
        {cleared
          ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', borderRadius: '5px', background: 'rgba(16,185,129,0.1)', color: 'var(--accent)', fontSize: '11px', fontWeight: 700 }}><Check size={10} /> Paid</span>
            {v.paymentClearedDate && <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600 }}>{fmtDate(v.paymentClearedDate)}</span>}
          </div>
          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', borderRadius: '5px', background: 'rgba(245,158,11,0.1)', color: 'var(--warn)', fontSize: '11px', fontWeight: 700 }}>{fmtRs(outstanding)}</span>}
      </td>
      {role === 'admin' && <td style={{ ...TD, fontSize: '12px', color: 'var(--text-muted)' }}>{v.createdBy || '—'}</td>}
      {role === 'admin' && <td style={{ ...TD, fontSize: '12px', color: 'var(--text-muted)' }}>{v.updatedBy || '—'}</td>}
      <td style={{ ...TD, textAlign: 'center' }}>
        {editing ? (
          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
            <button className="btn btn-p btn-icon btn-sm" onClick={() => setIsConfirming(true)} disabled={saving} title="Save Edit">{saving ? <Loader2 size={12} className="spin" /> : <Save size={12} />}</button>
            <button className="btn btn-g btn-icon btn-sm" onClick={() => setEditing(false)} title="Cancel"><X size={12} /></button>
          </div>
        ) : (role === 'admin' || permissions?.balance === 'edit' || permissions?.voucher === 'edit') ? (
          <button className="btn btn-g btn-icon btn-sm" onClick={startEdit}><Pencil size={12} /></button>
        ) : null}
      </td>
      <ConfirmSaveModal
        isOpen={isConfirming}
        onClose={() => setIsConfirming(false)}
        onConfirm={executeSave}
        title="Save Edit"
        message="Are you sure you want to save this modified row?"
        isSaving={saving}
      />
    </tr>
  );
}

/* ── Month Section ── */
function MonthSection({ ym, rows, onSave, selected, onCheck, onCheckAll, tabName, selTruck, filters, onFilterChange, role, permissions }) {
  const [open, setOpen] = useState(true);

  const monthChecked = rows.filter(v => selected.has(v.id));
  const allSelected = rows.length > 0 && monthChecked.length === rows.length;
  const someSelected = monthChecked.length > 0 && !allSelected;

  const totals = useMemo(() => ({
    weight: rows.reduce((s, v) => s + (parseFloat(v.weight) || 0), 0).toFixed(2),
    gross: rows.reduce((s, v) => s + ((parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0)), 0),
    net: rows.reduce((s, v) => s + calcNet(v), 0),
    paid: rows.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0),
    out: rows.reduce((s, v) => Math.max(0, calcNet(v) - (parseFloat(v.paidBalance) || 0)) + s, 0),
  }), [rows]);

  const [marking, setMarking] = useState(false);
  const [confirmMarkRows, setConfirmMarkRows] = useState(null);
  const [paymentClearedDate, setPaymentClearedDate] = useState(new Date().toISOString().slice(0, 10));

  const triggerMarkPaid = (targetRows) => {
    const unpaid = targetRows.filter(v => calcNet(v) > (parseFloat(v.paidBalance) || 0));
    if (!unpaid.length) { alert('All selected entries already paid!'); return; }
    setConfirmMarkRows(unpaid);
  };

  const executeMarkPaid = async () => {
    setMarking(true);
    const unpaid = confirmMarkRows;
    const date = paymentClearedDate;
    setConfirmMarkRows(null);
    try {
      await Promise.all(unpaid.map(v => ax.patch(API_V + '/' + v.id, {
        paidBalance: String(calcNet(v).toFixed(2)),
        paymentClearedDate: date
      })));
      onSave();
    }
    catch { alert('Error'); } finally { setMarking(false); }
  };

  return (
    <div className="card" style={{ marginBottom: '14px', overflow: 'hidden' }}>
      {/* Month header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '11px 16px', borderBottom: open ? '1px solid var(--border)' : 'none',
        background: 'var(--bg-card)', flexWrap: 'wrap', gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '9px', background: 'rgba(245,158,11,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            {open ? <ChevronUp size={15} color="#f59e0b" /> : <ChevronDown size={15} color="#f59e0b" />}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text)' }}>{monthLabel(ym)}</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 600, marginTop: '1px' }}>
              {rows.length} trips · Net {fmtRs(totals.net)} · Paid {fmtRs(totals.paid)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
          {totals.out > 0
            ? <span style={{ fontSize: '12px', color: 'var(--warn)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={13} />{fmtRs(totals.out)} due</span>
            : <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={13} />Cleared</span>}
          {/* Mark all in month */}
          {(role === 'admin' || permissions?.balance === 'edit') && (
            <button className="btn btn-g btn-sm" onClick={() => triggerMarkPaid(rows)} disabled={marking} title="Mark all rows in this month as Paid">
              {marking ? <Loader2 size={12} className="spin" /> : <><CheckCircle2 size={12} /> Mark Month Paid</>}
            </button>
          )}
          {/* Mark selected in month */}
          {monthChecked.length > 0 && (role === 'admin' || permissions?.balance === 'edit') && (
            <button className="btn btn-p btn-sm" onClick={() => triggerMarkPaid(monthChecked)}>
              <CheckCircle2 size={12} /> Mark {monthChecked.length} Paid
            </button>
          )}
          {/* Print month */}
          <button className="btn btn-g btn-sm" onClick={() => doPrint(rows, selTruck, monthLabel(ym), tabName)}>
            <Printer size={12} /> Print Month
          </button>
          {/* Print selected in month */}
          {monthChecked.length > 0 && (
            <button className="btn btn-g btn-sm" onClick={() => doPrint(monthChecked, selTruck, monthLabel(ym) + ' (selected)', tabName)}>
              <Printer size={12} /> Print {monthChecked.length} Selected
            </button>
          )}
          <button className="btn btn-g btn-sm" onClick={() => exportToExcel(rows.map(v => ({ Date: v.date, LR: v.lrNo, Dest: v.destination || v.partyName, Weight: v.weight, Rate: v.rate, Total: (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0), Diesel: v.advanceDiesel, Cash: v.advanceCash, Online: v.advanceOnline, Munshi: v.munshi, Shortage: v.shortage, Net: calcNet(v), Paid: v.paidBalance, Status: Math.max(0, calcNet(v) - (parseFloat(v.paidBalance) || 0)) <= 0 ? 'Paid' : 'Pending', 'Payment Date': v.paymentClearedDate || '—' })), `Balance_${selTruck}_${ym}`)}><Download size={12} /> Excel</button>
          <button className="btn btn-g btn-sm" onClick={() => exportToPDF(rows, `Balance Sheet: ${selTruck} (${monthLabel(ym)})`, ['date', 'lrNo', 'destination', 'weight', 'rate', 'total', 'advanceDiesel', 'advanceCash', 'advanceOnline', 'munshi', 'shortage', 'Net', 'paidBalance', 'paymentClearedDate'])}><Printer size={12} /> PDF</button>
        </div>
      </div>

      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                <th style={{ ...TH, textAlign: 'center', padding: '7px 8px' }}>
                  <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected; }}
                    onChange={() => onCheckAll(rows, !allSelected)}
                    style={{ width: '13px', height: '13px', cursor: 'pointer', accentColor: 'var(--primary)' }} />
                </th>
                <th style={TH}>#</th>
                <th style={TH}><ColumnFilter label="Date" colKey="date" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}><ColumnFilter label="LR No." colKey="lrNo" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}><ColumnFilter label="Destination" colKey="destination" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}><ColumnFilter label="Weight" colKey="weight" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}><ColumnFilter label="Rate" colKey="rate" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}>Gross (Rs.)</th>
                <th style={TH}><ColumnFilter label="Diesel" colKey="advanceDiesel" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}><ColumnFilter label="Cash" colKey="advanceCash" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}><ColumnFilter label="Online" colKey="advanceOnline" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}><ColumnFilter label="Munshi" colKey="munshi" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}><ColumnFilter label="Shortage" colKey="shortage" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}>Net Bal</th>
                <th style={TH}>Paid</th>
                <th style={TH}>Status</th>
                {role === 'admin' && <th style={TH}>Created By</th>}
                {role === 'admin' && <th style={TH}>Updated By</th>}
                <th style={TH}>Edit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v, i) => (
                <VoucherRow key={v.id} v={v} idx={i} onSave={onSave}
                  checked={selected.has(v.id)} onCheck={onCheck} role={role} permissions={permissions} />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ ...TDF, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
                  Totals ({rows.length} trips)
                </td>
                <td style={{ ...TDF, textAlign: 'right' }}>{totals.weight}</td>
                <td style={TDF}></td>
                <td style={{ ...TDF, textAlign: 'right' }}>{fmtRs(totals.gross)}</td>
                <td colSpan={5} style={TDF}></td>
                <td style={{ ...TDF, textAlign: 'right', color: 'var(--accent)', fontSize: '13px' }}>{fmtRs(totals.net)}</td>
                <td style={{ ...TDF, textAlign: 'right' }}>{fmtRs(totals.paid)}</td>
                <td style={{ ...TDF, textAlign: 'center', color: totals.out > 0 ? 'var(--warn)' : 'var(--accent)', fontSize: '13px' }}>
                  {totals.out > 0 ? fmtRs(totals.out) : <><Check size={11} /> Cleared</>}
                </td>
                <td colSpan={role === 'admin' ? 3 : 1} style={TDF}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <AnimatePresence>
        {confirmMarkRows && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
            <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ width: '360px', background: 'var(--bg-card)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', padding: '28px 24px' }}>
              <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px', textAlign: 'center' }}>Mark as Paid</div>
              <div style={{ fontSize: '13px', color: 'var(--text-sub)', marginBottom: '20px', textAlign: 'center' }}>
                Select the date when these {confirmMarkRows.length} trip(s) were paid.
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Payment Date</label>
                <input type="date" className="fi" value={paymentClearedDate} onChange={e => setPaymentClearedDate(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button type="button" className="btn btn-g" onClick={() => setConfirmMarkRows(null)} disabled={marking}>Cancel</button>
                <button type="button" className="btn btn-p" onClick={executeMarkPaid} disabled={marking} title="Confirm Marking Paid">
                  {marking ? <Loader2 size={13} className="spin" /> : <><Check size={13} /> Confirm Paid</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ══════ MAIN ══════ */
export default function BalanceSheet({ initialTab, lockedType, role = 'user', permissions = {} }) {
  const [tab, setTab] = useState(lockedType || initialTab || 'Dump');
  const [vouchers, setVouchers] = useState([]);
  const [selTruck, setSelTruck] = useState(null);
  const [truckSearch, setTruckSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [marking, setMarking] = useState(false);
  const [paymentClearedDate, setPaymentClearedDate] = useState(new Date().toISOString().slice(0, 10));

  // Excel-style filters
  const [filters, setFilters] = useState({});
  const handleFilterChange = (key, val) => setFilters(f => ({ ...f, [key]: val }));

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  useEffect(() => { fetchVouchers(); setSelTruck(null); setTruckSearch(''); setSelected(new Set()); }, [tab]);
  useEffect(() => { setSelected(new Set()); }, [selTruck, filters]);

  const fetchVouchers = async () => {
    try { setVouchers((await ax.get(API_V + '/' + tab)).data); } catch { }
  };

  const truckGroups = useMemo(() => {
    const map = {};
    vouchers.forEach(v => { const t = v.truckNo || 'Unknown'; (map[t] = map[t] || []).push(v); });
    return map;
  }, [vouchers]);

  const allTrucks = useMemo(() =>
    Object.keys(truckGroups)
      .sort(),
    [truckGroups]);

  /* filtered + grouped by month */
  const monthMap = useMemo(() => {
    if (!selTruck) return {};
    let rows = [...(truckGroups[selTruck] || [])];
    
    // Apply dynamic column filters
    Object.keys(filters).forEach(key => {
      const selectedValues = filters[key];
      if (selectedValues && selectedValues.length > 0) {
        rows = rows.filter(v => selectedValues.includes(String(v[key] ?? '')));
      }
    });

    rows.sort((a, b) => a.date < b.date ? 1 : -1);
    const map = {};
    rows.forEach(v => { const ym = (v.date || '').slice(0, 7) || 'Unknown'; (map[ym] = map[ym] || []).push(v); });
    return map;
  }, [selTruck, truckGroups, filters]);

  const sortedMonths = Object.keys(monthMap).sort((a, b) => b.localeCompare(a));
  const allVisibleRows = useMemo(() => sortedMonths.flatMap(ym => monthMap[ym]), [monthMap]);

  /* Checkbox handlers */
  const onCheck = useCallback(id => {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const onCheckAll = useCallback((rows, addAll) => {
    setSelected(s => { const n = new Set(s); rows.forEach(v => addAll ? n.add(v.id) : n.delete(v.id)); return n; });
  }, []);

  /* Selection-based derived values */
  const selRows = allVisibleRows.filter(v => selected.has(v.id));
  const selNet = selRows.reduce((s, v) => s + calcNet(v), 0);
  const selPaid = selRows.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0);
  const selOut = Math.max(0, selNet - selPaid);
  const allVis = allVisibleRows.length > 0 && selected.size === allVisibleRows.length;
  const someSelected = allVisibleRows.length > 0 && selected.size > 0 && selected.size < allVisibleRows.length;
  const [confirmMarkPaid, setConfirmMarkPaid] = useState(null);

  const triggerMarkSelectedPaid = () => {
    const unpaid = selRows.filter(v => calcNet(v) > (parseFloat(v.paidBalance) || 0));
    if (!unpaid.length) { alert('All selected already paid!'); return; }
    setConfirmMarkPaid(unpaid);
  };

  const executeMarkSelectedPaid = async () => {
    setMarking(true);
    const unpaid = confirmMarkPaid;
    const date = paymentClearedDate;
    setConfirmMarkPaid(null);
    try {
      await Promise.all(unpaid.map(v => ax.patch(API_V + '/' + v.id, {
        paidBalance: String(calcNet(v).toFixed(2)),
        paymentClearedDate: date
      })));
      fetchVouchers();
    }
    catch { alert('Error'); } finally { setMarking(false); }
  };

  /* Truck quick totals */
  const truckTotals = useMemo(() => {
    if (!selTruck) return null;
    const rows = truckGroups[selTruck] || [];
    const net = rows.reduce((s, v) => s + calcNet(v), 0);
    const paid = rows.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0);
    return { trips: rows.length, net, paid, outstanding: Math.max(0, net - paid) };
  }, [selTruck, truckGroups]);

  const truckSummaries = useMemo(() => {
    let list = allTrucks.map(truck => {
      const rows = truckGroups[truck] || [];
      const net = rows.reduce((s, v) => s + calcNet(v), 0);
      const paid = rows.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0);
      return { 
        truck, 
        trips: String(rows.length), 
        gross: rows.reduce((s, v) => s + (parseFloat(v.total) || 0), 0), 
        net, 
        paid, 
        outstanding: Math.max(0, net - paid),
        status: (Math.max(0, net - paid) <= 0 ? 'Cleared' : 'Pending')
      };
    });

    // Apply overview filters
    Object.keys(filters).forEach(key => {
      const selectedValues = filters[key];
      if (selectedValues && selectedValues.length > 0) {
        list = list.filter(t => selectedValues.includes(String(t[key] ?? '')));
      }
    });

    return list;
  }, [allTrucks, truckGroups, filters]);

  return (
    <div>
      <div className="page-hd">
        <div>
          <h1><BarChart3 size={20} color="#f59e0b" /> Balance Sheet</h1>
          <p>{selTruck ? selTruck + ' — monthly details' : 'Per-vehicle payment tracking'}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {selTruck && <button className="btn btn-g btn-sm" onClick={() => setSelTruck(null)}><ChevronLeft size={14} /> All Trucks</button>}
          {!lockedType && (
            <div className="tab-grp">
              {TYPES.map(t => <button key={t} className={`tab-btn${tab === t ? ' tab-amber' : ''}`} onClick={() => setTab(t)}>{t.replace('_', ' ')}</button>)}
            </div>
          )}
        </div>
      </div>

      {selTruck ? (
        <div>
          {/* Truck summary */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
            {[
              { label: 'Total Trips', val: truckTotals.trips, color: 'var(--primary)' },
              { label: 'Net Balance', val: fmtRs(truckTotals.net), color: 'var(--text)' },
              { label: 'Total Paid', val: fmtRs(truckTotals.paid), color: 'var(--accent)' },
              { label: 'Outstanding', val: fmtRs(truckTotals.outstanding), color: truckTotals.outstanding > 0 ? 'var(--warn)' : 'var(--accent)' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px',
                padding: '11px 18px', display: 'inline-flex', flexDirection: 'column', gap: '4px', minWidth: '130px'
              }}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                <span style={{ fontSize: '17px', fontWeight: 900, color, lineHeight: 1 }}>{val}</span>
              </div>
            ))}
          </div>

          {/* Active Filters Summary */}
          {Object.keys(filters).some(k => filters[k].length > 0) && (
            <div className="card" style={{ marginBottom: '14px' }}>
              <div style={{ padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', background: 'var(--bg-filter)' }}>
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
            </div>
          )}

          {/* Select-all action bar */}
          {allVisibleRows.length > 0 && (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px',
              padding: '10px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'
            }}>
              <input type="checkbox" checked={allVis} ref={el => { if (el) el.indeterminate = someSelected; }}
                onChange={() => onCheckAll(allVisibleRows, !allVis)}
                style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: 'var(--primary)' }} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>
                {selected.size === 0 ? 'Select entries to mark/print' : 'Selected: ' + selected.size + ' of ' + allVisibleRows.length}
              </span>
              {selected.size > 0 && (<>
                <div style={{ height: '18px', width: '1px', background: 'var(--border)' }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Net: {fmtRs(selNet)}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>Paid: {fmtRs(selPaid)}</span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: selOut > 0 ? 'var(--warn)' : 'var(--accent)' }}>
                  Due: {selOut > 0 ? fmtRs(selOut) : 'Cleared ✓'}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '7px' }}>
                {(role === 'admin' || permissions?.balance === 'edit') && (
                  <button className="btn btn-p btn-sm" onClick={triggerMarkSelectedPaid} disabled={marking} title="Mark selected entries as Paid">
                    {marking ? <Loader2 size={13} className="spin" /> : <><CheckCircle2 size={13} /> Mark {selected.size} as Paid</>}
                  </button>
                )}
                  <button className="btn btn-g btn-sm" onClick={() => doPrint(selRows, selTruck, `${selected.size} selected`, tab)}>
                    <Printer size={13} /> Print {selected.size} Selected
                  </button>
                  <button className="btn btn-g btn-sm" onClick={() => setSelected(new Set())}>
                    <X size={13} /> Clear
                  </button>
                </div>
              </>)}
            </div>
          )}

          {sortedMonths.length === 0 && <div style={{ color: 'var(--text-muted)', padding: '40px', textAlign: 'center', fontSize: '13px' }}>No vouchers in this period</div>}
            <MonthSection key={ym} ym={ym} rows={monthMap[ym]} onSave={fetchVouchers}
              selected={selected} onCheck={onCheck} onCheckAll={onCheckAll}
              tabName={tab} selTruck={selTruck} filters={filters} onFilterChange={handleFilterChange}
              role={role} permissions={permissions} />

          <AnimatePresence>
            {confirmMarkPaid && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
                <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  style={{ width: '360px', background: 'var(--bg-card)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', padding: '28px 24px' }}>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px', textAlign: 'center' }}>Mark as Paid</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-sub)', marginBottom: '20px', textAlign: 'center' }}>
                    Select the date when these {confirmMarkPaid.length} selected trip(s) were paid.
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Payment Date</label>
                    <input type="date" className="fi" value={paymentClearedDate} onChange={e => setPaymentClearedDate(e.target.value)} style={{ width: '100%' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button type="button" className="btn btn-g" onClick={() => setConfirmMarkPaid(null)} disabled={marking}>Cancel</button>
                    <button type="button" className="btn btn-p" onClick={executeMarkSelectedPaid} disabled={marking} title="Confirm Marking Paid">
                      {marking ? <Loader2 size={13} className="spin" /> : <><Check size={13} /> Confirm Paid</>}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        /* ── OVERVIEW ── */
        <div className="card">
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon ci-amber"><Truck size={17} /></div>
              <div className="card-title-text">
                <h3>All Vehicles — {tab.replace('_', ' ')}</h3>
                <p>{allTrucks.length} trucks · click a row to view monthly details</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {Object.keys(filters).length > 0 && (
                <button className="btn btn-sm btn-g" style={{ height: '32px', fontSize: '10px' }} onClick={() => setFilters({})}>Clear Filters</button>
              )}
              <button className="btn btn-g btn-sm" onClick={() => exportToExcel(truckSummaries.map(t => ({ Truck: t.truck, Trips: t.trips, Gross: t.gross, Net: t.net, Paid: t.paid, Outstanding: t.outstanding, Status: t.outstanding <= 0 ? 'Cleared' : 'Pending' })), `Balance_Overview_${tab}`)}><Download size={13} /> Excel</button>
              <button className="btn btn-g btn-sm" onClick={() => exportToPDF(truckSummaries, `Balance Sheet Overview - ${tab.replace('_', ' ')}`, ['truck', 'trips', 'gross', 'net', 'paid', 'outstanding'])}><Printer size={13} /> PDF</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={TH}>#</th>
                  <th style={TH}><ColumnFilter label="Truck No." colKey="truck" data={truckSummaries} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                  <th style={TH}><ColumnFilter label="Trips" colKey="trips" data={truckSummaries} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                  <th style={TH}>Gross</th>
                  <th style={TH}>Net Balance</th>
                  <th style={TH}>Paid</th>
                  <th style={TH}>Outstanding</th>
                  <th style={TH}><ColumnFilter label="Status" colKey="status" data={truckSummaries} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                </tr>
              </thead>
              <tbody>
                {truckSummaries.length === 0 && <tr><td colSpan={8} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No records</td></tr>}
                {truckSummaries.map(({ truck, trips, gross, net, paid, outstanding }, i) => (
                  <tr key={truck}
                    style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)', cursor: 'pointer', transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-row-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)'}
                    onClick={() => setSelTruck(truck)}>
                    <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ ...TD }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Truck size={14} color="#f59e0b" /></div>
                        <span style={{ fontWeight: 800, color: 'var(--text)', fontSize: '13px' }}>{truck}</span>
                      </div>
                    </td>
                    <td style={{ ...TD, textAlign: 'center', fontWeight: 700 }}>{trips}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{fmtRs(gross)}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>{fmtRs(net)}</td>
                    <td style={{ ...TD, textAlign: 'right', color: 'var(--accent)', fontWeight: 700 }}>{fmtRs(paid)}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: outstanding > 0 ? 'var(--warn)' : 'var(--accent)', fontSize: '13px' }}>{outstanding > 0 ? fmtRs(outstanding) : '—'}</td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      {outstanding <= 0
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(16,185,129,0.1)', color: 'var(--accent)', fontSize: '11px', fontWeight: 700 }}><Check size={10} /> Cleared</span>
                        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)', color: 'var(--warn)', fontSize: '11px', fontWeight: 700 }}>Pending</span>}
                    </td>
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