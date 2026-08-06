import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, AlertCircle, Pencil, X, Save, Printer, Calendar, BarChart3, ChevronLeft, ChevronUp, ChevronDown, Check, Download, Truck, Search, Loader2, Trash2, AlertTriangle, Plus, ArrowDownCircle, ArrowUpCircle, Wallet, MessageCircle, TrendingDown, Clock, Banknote, ArrowRight, CornerDownRight
} from 'lucide-react';
import ConfirmSaveModal from '../components/ConfirmSaveModal';
import { exportToExcel, exportToPDF, buildExportRows } from '../utils/exportUtils';
import { printHtml, reportWatermarkCss } from '../utils/receiptPrint';
import { archiveName } from '../utils/archiveDoc';
import { extrasPayload, readExtras } from '../utils/voucherExtras';
import ColumnFilter from '../components/ColumnFilter';
import { columnValues } from '../components/ColumnFilter';
import TableScroll from '../components/TableScroll';

const API_V = `/vouchers`;
const TYPES = ['Kosli_Bill', 'Jajjhar_Bill', 'Bahadurgarh_Bill', 'Dump', 'JK_Lakshmi', 'JK_Super'];

/**
 * The deduction rules, exported so the All-Over sheet computes identical
 * figures rather than a second copy that drifts. A combined view that disagrees
 * with the sheets it summarises is worse than no combined view.
 */
export function calcNet(v, vehicle) {
  const gross = v.deliveries?.length > 0
    ? v.deliveries.reduce((s, d) => s + (parseFloat(d.weight)||0) * (parseFloat(d.rate)||0), 0)
    : (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);
  const diesel = v.advanceDiesel === 'FULL' ? 4000 : (parseFloat(v.advanceDiesel) || 0);
  const cash = parseFloat(v.advanceCash) || 0;
  const online = parseFloat(v.advanceOnline) || 0;
  const weight = parseFloat(v.weight) || 0;
  // Munshi defaults from the weight when none was entered. `_noDeductions` is
  // set on the second and later legs of a split voucher, where the whole
  // munshi already sits on the first — without it the fallback would quietly
  // charge it again per leg.
  const munshi = v._noDeductions ? 0 : (parseFloat(v.munshi) || (weight > 0 ? (weight < 18 ? 50 : 100) : 0));
  const commission = parseFloat(v.commission) || 0;
  const shortage = parseFloat(v.shortage) || 0;
  const tyrePuncture = parseFloat(v.tyrePuncture) || 0;
  const tyreGreasingAir = (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0) + (parseFloat(v.tyreGreasingAir) || 0);
  const extraCash = parseFloat(v.extraCash) || 0;
  let net = gross - diesel - cash - online - munshi - commission - shortage - tyrePuncture - tyreGreasingAir - extraCash;

  // Market vehicle + No GPS + JK Lakshmi = ₹50 deduction
  if (vehicle && vehicle.ownershipType === 'market' && (!vehicle.gpsType || vehicle.gpsType === 'none') && v.type === 'JK_Lakshmi') {
    net -= 50;
  }
  return net;
}
export function calcGross(v) {
  if (v.deliveries?.length > 0)
    return v.deliveries.reduce((s, d) => s + (parseFloat(d.weight)||0) * (parseFloat(d.rate)||0), 0);
  return (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);
}
function calcTotalDeductions(v, vehicle) {
  return calcGross(v) - calcNet(v, vehicle);
}
function calcMarginPct(v, vehicle) {
  const g = calcGross(v);
  return g > 0 ? (calcTotalDeductions(v, vehicle) / g) * 100 : 0;
}
function daysAgo(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr)) / 86400000);
}

/**
 * Why a trip is not fit to be sent to Pay.
 *
 * Sending an unsettled entry pushes an incomplete figure into Pay, and once it
 * is paid the balance sheet is wrong with no obvious sign why — so it is caught
 * here rather than discovered later.
 *
 * Module scope so the All-Over sheet applies the same bar. It was a useCallback
 * with no dependencies; nothing about it was ever per-render.
 *
 * @returns {string[]} empty when the trip is ready
 */
export function payBlockers(v) {
  const problems = [];
  const dieselVal = parseFloat(v.advanceDiesel);
  const hasDiesel = (!isNaN(dieselVal) && dieselVal > 0) || v.advanceDiesel === 'FULL' || v.isFullTank;
  if (hasDiesel && !v.isDieselVerified) problems.push('Diesel not verified');
  if ((parseFloat(v.advanceOnline) || 0) > 0 && !v.isOnlinePaid) problems.push('Online advance not paid');

  // A multi-drop voucher prices each drop, and the rate box at the top of the
  // form stays empty — the saved record keeps it that way. Reading `v.rate`
  // alone therefore called every such voucher unpriced and refused to send it,
  // however carefully each drop had been rated. Ask the drops, and name the one
  // that is genuinely missing rather than the voucher as a whole.
  const unpriced = v.deliveries?.length
    ? v.deliveries.filter(d => !(parseFloat(d.rate) > 0))
    : null;
  if (unpriced) {
    if (unpriced.length)
      problems.push(`Rate not entered on LR ${unpriced.map(d => `#${d.lrNo || '?'}`).join(', ')}`);
  } else if (!(parseFloat(v.rate) > 0)) {
    problems.push('Rate not entered');
  }
  return problems;
}

/**
 * The LR numbers a voucher covers, for anything addressing the whole record.
 *
 * A multi-drop voucher carries its LRs on the drops; its own `lrNo` is left
 * over from the form and means nothing to the yard. Printing that field was
 * reported as a message naming an LR that did not exist.
 */
export const lrLabelOf = (v) => {
  const fromDrops = (v?.deliveries || []).map(d => d.lrNo).filter(Boolean);
  if (fromDrops.length) return fromDrops.map(n => `#${n}`).join(' + ');
  return v?.lrNo ? `#${v.lrNo}` : '—';
};

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(y, m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}
const fmtRs = n => 'Rs.' + Math.round(n).toLocaleString('en-IN');
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/**
 * The pump recorded on the voucher, or blank. 'None' is the sentinel the
 * voucher form writes when no station was picked, so it is not a name.
 */
export const pumpNameOf = (v) => {
  const p = v?.dieselPumpName || v?.pump || '';
  return p && p !== 'None' ? p : '';
};

/**
 * One voucher covering several LRs, shown as one row per LR.
 *
 * Each drop has its own destination, weight and rate, and its own LR number —
 * which is how the yard identifies a load — so a single row hid the numbers
 * people actually work from.
 *
 * The deductions are for the whole trip: one diesel advance, one cash advance,
 * one munshi. They are not divisible by destination without inventing a split,
 * so they all sit on the **first** leg and the rest show pure freight. The legs
 * therefore add up to exactly what the voucher is worth, and no figure is made
 * up. It also means only the first leg is actionable — ticking, paying and
 * editing belong to the voucher, not to a leg of it.
 *
 * Display only. One voucher remains one record.
 *
 * @returns {object[]} one entry for a plain voucher, one per drop otherwise
 */
export function explodeVoucher(v) {
  if (!v?.deliveries?.length) return [v];
  return v.deliveries.map((d, i) => {
    const leg = {
      ...v,
      // Synthetic, stable id for React keys. `_parentId` is what any write must
      // use — a leg is not a record.
      id: i === 0 ? v.id : `${v.id}::leg${i}`,
      _parentId: v.id,
      _leg: i,
      _legs: v.deliveries.length,
      _isLeg: true,
      // The whole voucher, deliveries intact. A leg has them stripped so it
      // prices from its own drop — but anything that writes, above all the edit
      // dialog, needs the real record or it would save a voucher with one LR.
      _original: v,
      // Priced from this drop alone, so calcGross uses weight × rate.
      deliveries: undefined,
      lrNo: d.lrNo || v.lrNo,
      destination: d.destination || v.destination,
      partyName: d.partyName || v.partyName,
      weight: d.weight,
      bags: d.bags,
      rate: d.rate,
    };
    if (i === 0) return leg;
    return {
      ...leg,
      _noDeductions: true,
      advanceDiesel: '', advanceCash: '', advanceOnline: '',
      munshi: '', shortage: '', commission: '',
      tyrePuncture: '', tyreGreasing: '', tyreAir: '', tyreGreasingAir: '',
      extraCash: '', extraCashRemark: '', extras: [],
      // Payment is recorded against the voucher, so it belongs to the first leg.
      paidBalance: '', paymentClearedDate: '',
    };
  });
}

/** Legs for display, flattened. */
export const explodeAll = (vouchers) => (vouchers || []).flatMap(explodeVoucher);

/**
 * A balance-sheet row as an export row: everything the voucher carries, plus
 * the four figures the sheet works out and never stores. Shared by the monthly
 * export and the All-Over sheet so the two cannot disagree.
 */
export const balanceExportRows = (rows, vehicle) => buildExportRows(rows, {
  order: ['date', 'lrNo', 'truckNo', 'billNo', 'partyCode', 'partyName', 'destination', 'weight', 'rate'],
  computed: {
    Gross: v => Math.round(calcGross(v)),
    'Net Balance': v => Math.round(calcNet(v, vehicle)),
    Outstanding: v => Math.round(Math.max(0, calcNet(v, vehicle) - (parseFloat(v.paidBalance) || 0))),
    Status: v => (Math.max(0, calcNet(v, vehicle) - (parseFloat(v.paidBalance) || 0)) <= 0 ? 'Paid' : 'Pending'),
  },
});

export const TH = {
  padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.07em', background: 'var(--bg-th)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
};
export const TD = { padding: '9px 12px', fontSize: '12.5px', color: 'var(--text-sub)', verticalAlign: 'middle', whiteSpace: 'nowrap' };
const TDF = { ...TD, fontWeight: 800, color: 'var(--text)', background: 'var(--bg-tf)', borderTop: '2px solid var(--border)' };

/* ── Monthly P&L Report ── */
function doPrintMonthlyPL(ym, rows, tabName, orgName, vehicle) {
  if (!rows || !rows.length) { alert('No data for this month'); return; }
  const label = (() => { const [y, m] = ym.split('-'); return new Date(y, m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' }); })();

  const totalGross = rows.reduce((s, v) => s + (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0), 0);
  const totalNet = rows.reduce((s, v) => s + calcNet(v, vehicle), 0);
  const totalDed = totalGross - totalNet;
  const totalPaid = rows.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0);
  const totalOut = Math.max(0, totalNet - totalPaid);
  const avgMargin = totalGross > 0 ? (totalDed / totalGross * 100) : 0;

  const dedBreakdown = {
    diesel: rows.reduce((s, v) => s + (v.advanceDiesel === 'FULL' ? 4000 : (parseFloat(v.advanceDiesel) || 0)), 0),
    cash: rows.reduce((s, v) => s + (parseFloat(v.advanceCash) || 0), 0),
    online: rows.reduce((s, v) => s + (parseFloat(v.advanceOnline) || 0), 0),
    munshi: rows.reduce((s, v) => { const w = parseFloat(v.weight)||0; return s + (parseFloat(v.munshi)||(w>0?(w<18?50:100):0)); }, 0),
    shortage: rows.reduce((s, v) => s + (parseFloat(v.shortage) || 0), 0),
    commission: rows.reduce((s, v) => s + (parseFloat(v.commission) || 0), 0),
    tyres: rows.reduce((s, v) => s + (parseFloat(v.tyrePuncture)||0) + (parseFloat(v.tyreGreasingAir)||0) + (parseFloat(v.tyreGreasing)||0) + (parseFloat(v.tyreAir)||0) + (parseFloat(v.extraCash)||0), 0),
  };

  const tbody = rows.map((v, i) => {
    const n = calcNet(v, vehicle);
    const g = (parseFloat(v.weight)||0) * (parseFloat(v.rate)||0);
    const margin = g > 0 ? ((g-n)/g*100) : 0;
    return `<tr style="background:${i%2===0?'#f9f9f9':'#fff'}">
      <td>${i+1}</td><td>${v.date||''}</td><td>#${v.lrNo||''}</td>
      <td>${v.destination||v.partyName||'—'}</td>
      <td style="text-align:right">${v.weight||''}</td>
      <td style="text-align:right">Rs.${Math.round(g).toLocaleString()}</td>
      <td style="text-align:right;color:#c00">Rs.${Math.round(g-n).toLocaleString()}</td>
      <td style="text-align:right;font-weight:800;color:#16a34a">Rs.${Math.round(n).toLocaleString()}</td>
      <td style="text-align:center;color:${margin<20?'#16a34a':margin<40?'#b45309':'#dc2626'}">${margin.toFixed(1)}%</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Monthly P&L — ${label}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;padding:10mm}
  h1{font-size:16px;font-weight:900;text-align:center}.sub{text-align:center;font-size:10px;color:#666;margin:3px 0 10px}
  .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
  .card{border:1px solid #ddd;border-radius:6px;padding:10px;text-align:center}
  .card-label{font-size:9px;color:#666;font-weight:700;text-transform:uppercase;margin-bottom:4px}
  .card-val{font-size:15px;font-weight:900}
  .breakdown{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px;background:#f5f5f5;padding:8px;border-radius:6px}
  .brow{display:flex;justify-content:space-between;font-size:10px;padding:2px 0;border-bottom:1px solid #e5e5e5}
  table{width:100%;border-collapse:collapse}th{padding:5px 8px;background:#333;color:#fff;font-size:10px}
  td{padding:4px 8px;border-bottom:1px solid #eee}.tot{background:#eee;font-weight:bold}
  @media print{body{padding:0}}    ${reportWatermarkCss()}
  </style></head><body>
  <h1>${orgName}</h1>
  <div class="sub">Monthly P&L Report — ${tabName} — ${label}</div>
  <div class="summary">
    <div class="card"><div class="card-label">Trips</div><div class="card-val">${rows.length}</div></div>
    <div class="card"><div class="card-label">Total Gross</div><div class="card-val" style="color:#2563eb">Rs.${Math.round(totalGross).toLocaleString()}</div></div>
    <div class="card"><div class="card-label">Total Net</div><div class="card-val" style="color:#16a34a">Rs.${Math.round(totalNet).toLocaleString()}</div></div>
    <div class="card"><div class="card-label">Avg Margin</div><div class="card-val" style="color:${avgMargin<20?'#16a34a':avgMargin<40?'#b45309':'#dc2626'}">${avgMargin.toFixed(1)}%</div></div>
  </div>
  <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#666;margin-bottom:6px">Deduction Breakdown</div>
  <div class="breakdown">
    ${Object.entries(dedBreakdown).map(([k, v]) => `<div class="brow"><span style="text-transform:capitalize">${k}</span><span style="font-weight:700">Rs.${Math.round(v).toLocaleString()}</span></div>`).join('')}
    <div class="brow" style="font-weight:800"><span>TOTAL DEDUCTIONS</span><span>Rs.${Math.round(totalDed).toLocaleString()}</span></div>
    <div class="brow" style="font-weight:800;color:${totalOut>0?'#b45309':'#16a34a'}"><span>Outstanding</span><span>${totalOut>0?'Rs.'+Math.round(totalOut).toLocaleString():'✓ Cleared'}</span></div>
  </div>
  <table><thead><tr><th>#</th><th>Date</th><th>LR No.</th><th>Route</th><th>Weight</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Margin%</th></tr></thead>
  <tbody>${tbody}</tbody>
  <tfoot><tr class="tot"><td colspan="4">TOTALS</td>
    <td></td><td style="text-align:right">Rs.${Math.round(totalGross).toLocaleString()}</td>
    <td style="text-align:right;color:#c00">Rs.${Math.round(totalDed).toLocaleString()}</td>
    <td style="text-align:right;font-weight:800;color:#16a34a">Rs.${Math.round(totalNet).toLocaleString()}</td>
    <td style="text-align:center">${avgMargin.toFixed(1)}%</td>
  </tr></tfoot></table>
  <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
  </body></html>`;
  printHtml(html, {
    width: 1000, height: 700,
    archive: {
      module: 'Balance Sheet', kind: 'Statements',
      plant: (tabName || '').replace(/_/g, ' '),
      name: archiveName('Monthly P&L', tabName, ym),
      meta: { month: ym, type: tabName, trips: rows.length },
    },
  });
}

/* ── Print Driver (used from both selection bar and month header) ── */
function doPrint(rows, truckNo, label, tabName, orgName, vehicle) {
  if (!rows.length) { alert('No rows to print'); return; }
  const net = rows.reduce((s, v) => s + calcNet(v, vehicle), 0);
  const paid = rows.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0);
  const out = Math.max(0, net - paid);
  const isBillType = tabName === 'Kosli_Bill' || tabName === 'Jajjhar_Bill' || tabName === 'Bahadurgarh_Bill';
  const cols = ['#', 'Date', 'LR No.', ...(isBillType ? ['Bill No.', 'Party Code'] : []), 'Destination', 'Weight', 'Rate', 'Gross', 'Diesel', 'Cash', 'Online', 'Munshi', 'Shortage', 'Net Bal', 'Paid', 'Status'];
  const tbody = rows.map((v, i) => {
    const n = calcNet(v, vehicle), p = parseFloat(v.paidBalance) || 0, o = Math.max(0, n - p);
    return `<tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#fff'}">
      <td>${i + 1}</td><td>${v.date || ''}</td><td>#${v.lrNo || ''}</td>
      ${isBillType ? `<td>${v.billNo || '—'}</td><td>${v.partyCode || '—'}</td>` : ''}
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
      <td style="text-align:center;font-weight:700;color:${n < 0 ? '#6366f1' : o <= 0 ? '#16a34a' : '#b45309'}">
        ${n < 0 ? `Adjusted (Rs.${Math.abs(Math.round(n)).toLocaleString()})` : o <= 0 ? `✓ Paid${v.paymentClearedDate ? `<div style="font-size:8px;color:#666;font-weight:normal">${v.paymentClearedDate}</div>` : ''}` : 'Rs.' + Math.round(o).toLocaleString()}
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
  @media print{body{padding:0}}    ${reportWatermarkCss()}
  </style></head><body>
  <h1>${orgName}</h1>
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
  printHtml(html, {
    width: 1000, height: 640,
    archive: {
      module: 'Balance Sheet', kind: 'Statements',
      plant: (tabName || '').replace(/_/g, ' '),
      name: archiveName('Statement', truckNo, label),
      meta: { truckNo, period: label, type: tabName, trips: rows.length },
    },
  });
}

/* ── Edit Entry ── */

/**
 * Editing a balance-sheet entry in a proper dialog.
 *
 * It used to happen inline: the row turned into twenty ~55px inputs squeezed
 * into table cells, several of them stacked two-deep inside one column. Nothing
 * was labelled once you were in it, the row jumped width as you typed, and on a
 * laptop half the fields were off the right-hand edge behind a scrollbar. This
 * shows the same fields grouped and labelled, with the net recomputing as you
 * go, so the person editing can see what their change does before saving.
 *
 * Shared by every balance sheet — the per-plant ones and the All-Over view —
 * so there is one place the entry can be edited and one place to fix.
 */
export function VoucherEditModal({ v, vehicle, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    date: v.date || '', lrNo: v.lrNo || '', truckNo: v.truckNo || '',
    partyName: v.partyName || '', destination: v.destination || '',
    billNo: v.billNo || '', partyCode: v.partyCode || '',
    weight: v.weight ?? '', rate: v.rate ?? '',
    advanceDiesel: v.advanceDiesel ?? '', advanceCash: v.advanceCash ?? '',
    advanceOnline: v.advanceOnline ?? '', munshi: v.munshi ?? '',
    shortage: v.shortage ?? '', commission: v.commission ?? '',
    tyrePuncture: v.tyrePuncture ?? '',
    // Older records split this across two fields and getNet adds both, so show
    // the sum or the box reads empty on an entry that plainly deducts for it.
    tyreGreasingAir: (parseFloat(v.tyreGreasingAir) || 0) + (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0) || '',
    paidBalance: v.paidBalance ?? '', paymentClearedDate: v.paymentClearedDate || '',
    extras: readExtras(v),
    // A multi-delivery voucher prices each drop, so the rate lives here, not on
    // the voucher. Editing has to reach them or the sheet shows a rate nobody
    // can change.
    deliveries: (v.deliveries || []).map(d => ({ ...d })),
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const S = (k, val) => setForm(f => ({ ...f, [k]: val }));

  // Multi-delivery vouchers price each drop, so weight and rate here would be
  // meaningless — the sheet shows the per-delivery breakdown instead.
  const multiDrop = v.deliveries?.length > 0;

  const preview = { ...v, ...form, extras: form.extras, deliveries: form.deliveries };
  const net = calcNet(preview, vehicle);
  const paid = parseFloat(form.paidBalance) || 0;
  const outstanding = Math.max(0, net - paid);
  const rateMissing = multiDrop
    ? !form.deliveries.some(d => parseFloat(d.rate) > 0)
    : !(parseFloat(form.rate) > 0);

  const setDelivery = (i, key, val) =>
    S('deliveries', form.deliveries.map((d, j) => (j === i ? { ...d, [key]: val } : d)));

  const save = async () => {
    setSaving(true); setErr('');
    try {
      await ax.patch(`${API_V}/${v.id}`, {
        ...form,
        // The greasing box holds the sum of the legacy pair, so clear them or
        // the old amounts are deducted twice.
        tyreGreasing: '', tyreAir: '',
        // `total` is stored on the voucher and read by the exports, the Google
        // Sheet mirror and the voucher list. The balance sheet derives gross
        // from weight × rate and would have looked right while everything else
        // still showed the old figure.
        total: String(Math.round(calcGross(preview))),
        ...extrasPayload(form.extras),
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not save');
    } finally { setSaving(false); }
  };

  const Field = ({ label, k, type = 'number', wide, hint }) => (
    <div className="field-h" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}</label>
      <input className="fi" type={type} step={type === 'number' ? 'any' : undefined}
        value={form[k] ?? ''} onChange={e => S(k, e.target.value)} />
      {hint && <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>{hint}</span>}
    </div>
  );

  const setExtra = (i, key, val) => S('extras', form.extras.map((e, j) => (j === i ? { ...e, [key]: val } : e)));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        style={{ width: '96%', maxWidth: '760px', maxHeight: '92vh', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.55)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '18px 22px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={16} color="var(--primary)" /></div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>Edit Entry</div>
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '2px' }}>
              LR #{v.lrNo} · {v.truckNo} · {(v.type || '').replace(/_/g, ' ')}
            </div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', display: 'flex' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '18px 22px' }}>
          <SectionLabel>Trip</SectionLabel>
          <div className="fg fg-2" style={{ gap: '12px' }}>
            <Field label="Date" k="date" type="date" />
            <Field label="LR No." k="lrNo" type="text" />
            <Field label="Truck No." k="truckNo" type="text" />
            <Field label="Party" k="partyName" type="text" />
            <Field label="Destination" k="destination" type="text" />
            <Field label="Bill No." k="billNo" type="text" />
            <Field label="Party Code" k="partyCode" type="text" />
            {!multiDrop && <Field label="Weight (MT)" k="weight" />}
            {!multiDrop && <Field label="Rate (Rs/MT)" k="rate" hint={rateMissing ? 'Needed before the balance means anything' : undefined} />}
          </div>
          {multiDrop && (
            <>
              <SectionLabel>Destinations — {form.deliveries.length} drops, each with its own rate</SectionLabel>
              <TableScroll>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      {['LR No.', 'Destination', 'Party', 'Weight (MT)', 'Rate (Rs/MT)', 'Gross'].map(h => (
                        <th key={h} style={{ ...TH, padding: '7px 8px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.deliveries.map((d, i) => {
                      const g = (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0);
                      const cell = (k, w) => (
                        <input className="fi" type={k === 'weight' || k === 'rate' ? 'number' : 'text'} step="any"
                          value={d[k] ?? ''} onChange={e => setDelivery(i, k, e.target.value)}
                          style={{ width: w, padding: '4px 7px', fontSize: '12px', height: '30px' }} />
                      );
                      return (
                        <tr key={i}>
                          <td style={{ ...TD, padding: '5px 8px' }}>{cell('lrNo', '70px')}</td>
                          <td style={{ ...TD, padding: '5px 8px' }}>{cell('destination', '130px')}</td>
                          <td style={{ ...TD, padding: '5px 8px' }}>{cell('partyName', '130px')}</td>
                          <td style={{ ...TD, padding: '5px 8px' }}>{cell('weight', '80px')}</td>
                          <td style={{ ...TD, padding: '5px 8px' }}>{cell('rate', '80px')}</td>
                          <td style={{ ...TD, padding: '5px 8px', textAlign: 'right', fontWeight: 800, color: g > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                            {g > 0 ? fmtRs(g) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScroll>
            </>
          )}

          <SectionLabel>Advances</SectionLabel>
          <div className="fg fg-2" style={{ gap: '12px' }}>
            <Field label="Diesel" k="advanceDiesel" type="text" hint={String(form.advanceDiesel).toUpperCase() === 'FULL' ? 'Full tank — counted as Rs.4,000 until verified' : undefined} />
            <Field label="Cash" k="advanceCash" />
            <Field label="Online" k="advanceOnline" />
          </div>

          <SectionLabel>Deductions</SectionLabel>
          <div className="fg fg-2" style={{ gap: '12px' }}>
            <Field label="Munshi" k="munshi" />
            <Field label="Shortage" k="shortage" />
            <Field label="Commission" k="commission" />
            <Field label="Tyre Puncture" k="tyrePuncture" />
            <Field label="Tyre Greasing & Air" k="tyreGreasingAir" />
          </div>

          <SectionLabel>Extra money</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {form.extras.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input className="fi" type="number" placeholder="₹0" value={e.amount ?? ''}
                  onChange={ev => setExtra(i, 'amount', ev.target.value)} style={{ width: '110px', flexShrink: 0 }} />
                <input className="fi" type="text" placeholder="Reason — e.g. grease ke paise" value={e.remark || ''}
                  onChange={ev => setExtra(i, 'remark', ev.target.value)} style={{ flex: 1, minWidth: 0 }} />
                <button type="button" onClick={() => S('extras', form.extras.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '7px', color: '#f43f5e', cursor: 'pointer', padding: '8px', display: 'flex', flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => S('extras', [...form.extras, { amount: '', remark: '' }])}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'none', border: '1px dashed var(--border)', borderRadius: '8px', padding: '9px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11.5px', fontWeight: 700 }}>
              <Plus size={13} /> {form.extras.length ? 'Add another' : 'Add extra money'}
            </button>
          </div>

          <SectionLabel>Payment</SectionLabel>
          <div className="fg fg-2" style={{ gap: '12px' }}>
            <Field label="Paid" k="paidBalance" />
            <Field label="Payment Cleared Date" k="paymentClearedDate" type="date" />
          </div>

          {/* The reason this is a dialog: you can see what the change does. */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '18px', padding: '12px 14px', borderRadius: '10px', background: 'var(--bg)', border: '1px solid var(--border)' }}>
            {rateMissing
              ? <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--warn)' }}>Enter a rate to get the final balance</span>
              : <>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>Gross <strong style={{ color: 'var(--text)' }}>{fmtRs(calcGross(preview))}</strong></span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>Net <strong style={{ color: net >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{fmtRs(net)}</strong></span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>Outstanding <strong style={{ color: outstanding > 0 ? 'var(--warn)' : 'var(--accent)' }}>{outstanding > 0 ? fmtRs(outstanding) : 'Cleared'}</strong></span>
              </>}
          </div>

          {err && <div style={{ marginTop: '10px', fontSize: '12px', fontWeight: 700, color: 'var(--danger)' }}>{err}</div>}
        </div>

        <div style={{ display: 'flex', gap: '10px', padding: '14px 22px', borderTop: '1px solid var(--border)', justifyContent: 'flex-end', position: 'sticky', bottom: 0, background: 'var(--bg-card)' }}>
          <button className="btn btn-g" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-p" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={14} className="spin" /> : <><Save size={14} /> Save Changes</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const SectionLabel = ({ children }) => (
  <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '18px 0 8px', paddingBottom: '5px', borderBottom: '1px solid var(--border)' }}>
    {children}
  </div>
);

/* ── Editable Row ── */
/**
 * @param {React.ReactNode} [leadCells] extra <td>s inserted after the row number.
 *   The per-plant sheets pass nothing — they are already scoped to one plant and
 *   one truck. The All-Over sheet passes Plant and Truck, which is the only way
 *   its rows differ, so it can share this row rather than keep a second copy of
 *   editing, deleting, WhatsApp and diesel verification.
 */
export function VoucherRow({ v, idx, onSave, checked, onCheck, onDelete, role, permissions, isBillType, vehicle, showPnL, onVerifyDiesel, leadCells = null, onEdit = null }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const startEdit = () => {
    setForm({
      advanceDiesel: v.advanceDiesel || '', advanceCash: v.advanceCash || '',
      advanceOnline: v.advanceOnline || '', munshi: v.munshi || '',
      shortage: v.shortage || '', paidBalance: v.paidBalance || '',
      rate: v.rate || '', weight: v.weight || '', total: v.total || '',
      commission: v.commission || '', tyrePuncture: v.tyrePuncture || '',
      tyreGreasingAir: v.tyreGreasingAir || '', extraCash: v.extraCash || '',
      extraCashRemark: v.extraCashRemark || '',
    });
    setEditing(true);
  };

  const hasVehicleExp = (parseFloat(v.commission) || 0) + (parseFloat(v.tyrePuncture) || 0) + (parseFloat(v.tyreGreasingAir) || 0) + (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0) + (parseFloat(v.extraCash) || 0) > 0;
  const executeSave = async () => {
    setSaving(true); setIsConfirming(false);
    // The sheet edits Extra as one lump figure, but a voucher can hold several
    // extra lines each with its own remark. Collapse them to one line only when
    // that figure was actually touched — otherwise saving some other column here
    // would quietly flatten the driver's remarks.
    const extraTouched = String(form.extraCash ?? '') !== String(v.extraCash ?? '');
    const payload = extraTouched
      ? { ...form, ...extrasPayload([{ amount: form.extraCash, remark: form.extraCashRemark }]) }
      : form;
    try { await ax.patch(API_V + '/' + v.id, payload); setEditing(false); onSave(); }
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
  const net = calcNet(cv, vehicle);
  const paid = parseFloat(cv.paidBalance) || 0;
  const outstanding = Math.max(0, net - paid);
  const cleared = outstanding <= 0;
  const bg = checked ? 'rgba(99,102,241,0.16)' : (idx % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)');
  const days = outstanding > 0 ? daysAgo(v.date) : 0;
  const overdueColor = days > 30 ? '#f43f5e' : days > 15 ? '#f59e0b' : null;

  const gross = calcGross(cv);

  /**
   * Nobody has priced this trip yet. A multi-delivery voucher carries a rate per
   * drop, so one priced destination is enough to call the voucher rated — the
   * balance is then real, even if incomplete.
   */
  const rateMissing = cv.deliveries?.length > 0
    ? !cv.deliveries.some(d => parseFloat(d.rate) > 0)
    : !(parseFloat(cv.rate) > 0);

  const waText = `*VGTC Voucher*\nLR #${v.lrNo} | ${v.truckNo || ''}\nDate: ${v.date || ''}\nRoute: ${v.destination || v.partyName || '—'}\nGross: Rs.${Math.round(gross).toLocaleString('en-IN')}\n${rateMissing ? 'Rate not entered — balance pending' : `Net Bal: Rs.${Math.round(net).toLocaleString('en-IN')}\nOutstanding: ${outstanding > 0 ? 'Rs.' + Math.round(outstanding).toLocaleString('en-IN') : 'Cleared ✓'}`}`;

  return (
    /*
     * Selected rows are tinted, not outlined. Ticking one leg of a multi-LR
     * voucher ticks all of them, so the per-row outlines met and drew a box
     * around the group -- which read as a permanent bracket stamped on the
     * voucher rather than as "these are the rows you picked".
     */
    <tr style={{ background: editing ? 'var(--bg-input)' : bg, borderLeft: overdueColor && !editing ? `3px solid ${overdueColor}` : '' }}
      onMouseEnter={e => { if (!editing && !checked) e.currentTarget.style.background = 'var(--bg-row-hover)'; }}
      onMouseLeave={e => { if (!editing && !checked) e.currentTarget.style.background = bg; }}>

      {/* Checkbox */}
      <td className="t-card-checkbox" style={{ ...TD, textAlign: 'center', padding: '6px 8px' }}>
        {/* A continuation LR of the voucher above. It sits with the tick
            box because that is what the row shares with its voucher:
            ticking any leg ticks them all. */}
        {v._leg > 0 && (
          <CornerDownRight size={12} style={{ color: "var(--text-muted)", marginRight: "3px", verticalAlign: "-2px" }} />
        )}
        <input type="checkbox" checked={checked} onChange={() => onCheck(v.id)}
          style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: 'var(--primary)' }} />
      </td>
      <td className="t-card-hide" style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{idx + 1}</td>
      {/* Plant and truck on the combined sheet. Declared and documented but
          never rendered, so those two headers stood over the wrong cells and
          every column after them read one place to the left — a date under
          "Plant", a rate under "Destination", a gross under "Weight". */}
      {leadCells}
      <td className="t-card-title" style={{ ...TD }}>{v.date}</td>
      <td data-label="LR No." style={{ ...TD }}>
        {v.deliveries?.length > 0
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {v.deliveries.map((d, di) => <span key={di} style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)', fontSize: '11px' }}>#{d.lrNo || '—'}</span>)}
            </div>
          : <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>#{v.lrNo}</span>}
        {v.invoiceGenerated && (() => {
          const bills = [...new Set((v.invoicedLrNos || []).map(e => String(e.billNo)))];
          const label = bills.length ? bills.map(b => `#${b}`).join(', ') : (v.invoiceBillNo ? `#${v.invoiceBillNo}` : '');
          const partial = v.deliveries?.length > 0 && (v.invoicedLrNos || []).length < v.deliveries.length;
          return (
            <span title={`Client invoice generated${label ? ` — Bill ${label}` : ''}${v.invoiceDate ? ` (${v.invoiceDate})` : ''}${partial ? ' — some deliveries not yet billed' : ''}`}
              style={{ display: 'inline-block', fontSize: '9px', fontWeight: 900, color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '1px 5px', borderRadius: '6px', marginLeft: '4px', whiteSpace: 'nowrap' }}>
              INV{label ? ` ${label}` : ''}{partial ? '*' : ''}
            </span>
          );
        })()}
      </td>
      {isBillType && <td data-label="Bill No." style={{ ...TD }}>{v.billNo || '—'}</td>}
      {isBillType && <td data-label="Party Code" style={{ ...TD }}>{v.partyCode || '—'}</td>}
      <td data-label="Destination" style={{ ...TD }}>
        {v.deliveries?.length > 0
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {v.deliveries.map((d, di) => (
                <div key={di} style={{ fontSize: '11px' }}>
                  <span style={{ fontWeight: 700 }}>{d.destination || '—'}</span>
                  {d.partyName && <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}> · {d.partyName}</span>}
                </div>
              ))}
            </div>
          : (v.destination || v.partyName || '—')}
      </td>
      <td data-label="Weight" style={{ ...TD, textAlign: 'right' }}>
        {editing ? FI('weight', '60px') : (v.deliveries?.length > 0
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'flex-end' }}>
              {v.deliveries.map((d, di) => <span key={di} style={{ fontSize: '10px' }}>{d.weight}</span>)}
              {/* Same wording as the voucher list — the sigma meant "total" and
                  only read that way to whoever wrote it. */}
              <span style={{ fontWeight: 900, color: 'var(--accent)', fontSize: '11px', borderTop: '1px solid var(--border)', paddingTop: '1px', whiteSpace: 'nowrap' }}>
                Total {v.deliveries.reduce((s, d) => s + (parseFloat(d.weight)||0), 0).toFixed(2)}
              </span>
            </div>
          : (v.weight || '—'))}
      </td>
      <td data-label="Rate" style={{ ...TD, textAlign: 'right' }}>
        {editing ? FI('rate', '60px') : (v.deliveries?.length > 0
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'flex-end' }}>
              {v.deliveries.map((d, di) => <span key={di} style={{ fontSize: '10px' }}>{d.rate}</span>)}
            </div>
          : (v.rate || '—'))}
      </td>
      <td data-label="Gross" style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>
        {editing ? FI('total', '75px') : fmtRs(calcGross(cv))}
      </td>
      <td data-label="Diesel" style={{ ...TD, textAlign: 'right', color: 'var(--warn)' }}>
        {editing ? FI('advanceDiesel', '70px', true) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <span style={{ fontWeight: v.isDieselVerified ? 800 : 400 }}>
              {v.advanceDiesel === 'FULL' ? '4000 (Est.)' : (v.advanceDiesel || '—')}
            </span>
            {v.isDieselVerified
              ? <span style={{ fontSize: '8px', background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '1px 5px', borderRadius: '3px', fontWeight: 800 }}>✓ {v.dieselActualLitres ? v.dieselActualLitres + 'L' : 'Verified'}{v.dieselPumpName ? ' · ' + v.dieselPumpName : ''}</span>
              : (parseFloat(v.advanceDiesel) > 0 || v.advanceDiesel === 'FULL') && !editing && (role === 'admin' || permissions?.balance === 'edit') && (
                <button style={{ fontSize: '8px', fontWeight: 800, padding: '1px 5px', borderRadius: '3px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', cursor: 'pointer' }}
                  onClick={() => onVerifyDiesel && onVerifyDiesel(v)}>
                  ⚠ Verify Diesel
                </button>
              )
            }
            {v.isFullTank && <span style={{ fontSize: '8px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '1px 3px', borderRadius: '3px', fontWeight: 800 }}>FULL TANK</span>}
          </div>
        )}
      </td>
      <td data-label="Cash" style={{ ...TD, textAlign: 'right', color: 'var(--warn)' }}>{editing ? FI('advanceCash') : (v.advanceCash || '—')}</td>
      <td data-label="Online" style={{ ...TD, textAlign: 'right', color: 'var(--warn)' }}>
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
      <td data-label="Munshi" style={{ ...TD, textAlign: 'right' }}>{editing ? FI('munshi') : (v.munshi || '—')}</td>
      <td data-label="Shortage" style={{ ...TD, textAlign: 'right' }}>{editing ? FI('shortage') : (v.shortage || '—')}</td>
      <td data-label="Expenses" style={{ ...TD, textAlign: 'right', fontSize: '11px', padding: '4px 6px' }}>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '80px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ fontSize: '9px', color: 'var(--text-muted)', width: '50px' }}>Comm.</span>{FI('commission', '55px')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ fontSize: '9px', color: 'var(--text-muted)', width: '50px' }}>Puncture</span>{FI('tyrePuncture', '55px')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ fontSize: '9px', color: 'var(--text-muted)', width: '50px' }}>Grease</span>{FI('tyreGreasingAir', '55px')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ fontSize: '9px', color: 'var(--text-muted)', width: '50px' }}>Extra</span>{FI('extraCash', '55px')}</div>
          </div>
        ) : hasVehicleExp ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {(parseFloat(v.commission) || 0) > 0 && <div style={{ fontSize: '11px', color: '#f59e0b' }}>Com: {Math.round(parseFloat(v.commission))}</div>}
            {(parseFloat(v.tyrePuncture) || 0) > 0 && <div style={{ fontSize: '11px', color: '#f59e0b' }}>Pnc: {Math.round(parseFloat(v.tyrePuncture))}</div>}
            {((parseFloat(v.tyreGreasingAir) || 0) + (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0)) > 0 && <div style={{ fontSize: '11px', color: '#f59e0b' }}>G&A: {Math.round((parseFloat(v.tyreGreasingAir) || 0) + (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0))}</div>}
            {(parseFloat(v.extraCash) || 0) > 0 && <div style={{ fontSize: '11px', color: '#f59e0b' }}>Ext: {Math.round(parseFloat(v.extraCash))}</div>}
          </div>
        ) : '—'}
      </td>
      <td data-label="Net Bal" style={{
        ...TD, textAlign: 'right', fontWeight: 800, fontSize: '13px',
        color: net >= 0 ? 'var(--accent)' : 'var(--danger)'
      }}>
        {fmtRs(net)}
      </td>
      <td data-label="Paid" style={{ ...TD, textAlign: 'right' }}>{editing ? FI('paidBalance') : (paid ? fmtRs(paid) : '—')}</td>
      <td data-label="Status" style={{ ...TD, textAlign: 'center' }}>
        {net < 0
          ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', borderRadius: '5px', background: 'rgba(99,102,241,0.1)', color: '#6366f1', fontSize: '11px', fontWeight: 700 }}>Adjusted</span>
            <span style={{ fontSize: '9px', color: '#6366f1', fontWeight: 700 }}>{fmtRs(Math.abs(net))}</span>
          </div>
          : cleared
            ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '6px', background: 'rgba(16,185,129,0.1)', color: 'var(--accent)', fontSize: '12px', fontWeight: 700 }}><Check size={11} /> Paid</span>
              {v.paymentClearedDate && <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{fmtDate(v.paymentClearedDate)}</span>}
            </div>
            : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)', color: 'var(--warn)', fontSize: '12px', fontWeight: 700 }}>{fmtRs(outstanding)}</span>
              {days > 15 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 800, color: overdueColor }}><Clock size={9} />{days}d overdue</span>}
            </div>}
      </td>
      {showPnL && (() => {
        const deductions = calcTotalDeductions(cv, vehicle);
        const margin = calcMarginPct(cv, vehicle);
        return <>
          <td data-label="Deductions" style={{ ...TD, textAlign: 'right', color: 'var(--danger)', fontWeight: 700 }}>{gross > 0 ? fmtRs(deductions) : '—'}</td>
          <td data-label="Margin %" style={{ ...TD, textAlign: 'center' }}>
            {gross > 0 ? <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: '5px', fontSize: '11px', fontWeight: 800, background: margin < 20 ? 'rgba(16,185,129,0.1)' : margin < 40 ? 'rgba(245,158,11,0.1)' : 'rgba(244,63,94,0.1)', color: margin < 20 ? '#10b981' : margin < 40 ? '#f59e0b' : '#f43f5e' }}>{margin.toFixed(1)}%</span> : '—'}
          </td>
        </>;
      })()}
      {role === 'admin' && <td data-label="Created By" style={{ ...TD, fontSize: '12px', color: 'var(--text-muted)' }}>{v.createdBy || '—'}</td>}
      {role === 'admin' && <td data-label="Updated By" style={{ ...TD, fontSize: '12px', color: 'var(--text-muted)' }}>{v.updatedBy || '—'}</td>}
      <td className="t-card-actions" style={{ ...TD, textAlign: 'center' }}>
        {editing ? (
          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
            <button className="btn btn-p btn-icon btn-sm" onClick={() => setIsConfirming(true)} disabled={saving} title="Save Edit">{saving ? <Loader2 size={12} className="spin" /> : <Save size={12} />}</button>
            <button className="btn btn-g btn-icon btn-sm" onClick={() => setEditing(false)} title="Cancel"><X size={12} /></button>
          </div>
        ) : (
          v._leg > 0 ? (
            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
              {(role === 'admin' || permissions?.balance === 'edit' || permissions?.voucher === 'edit') && (
                <button className="btn btn-g btn-icon btn-sm" title="Edit this voucher — every LR on it"
                  onClick={() => (onEdit ? onEdit(v._original || v) : startEdit())}><Pencil size={12} /></button>
              )}
              {/* The legs carry stripped deliveries, so name the voucher from the
                  original record — reading it off the leg printed "part of LR #". */}
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                with LR #{v._original?.deliveries?.[0]?.lrNo || '—'}
              </span>
            </div>
          ) : (
          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
            <button className="btn btn-g btn-icon btn-sm" title="Share via WhatsApp"
              onClick={() => window.open('https://wa.me/?text=' + encodeURIComponent(waText), '_blank')}>
              <MessageCircle size={12} color="#25d366" />
            </button>
            {(role === 'admin' || permissions?.balance === 'edit' || permissions?.balance === 'delete' || permissions?.voucher === 'edit' || permissions?.voucher === 'delete') && <>
              <button className="btn btn-g btn-icon btn-sm" onClick={() => (onEdit ? onEdit(v._original || v) : startEdit())} title="Edit Record"><Pencil size={12} /></button>
              {(role === 'admin' || permissions?.balance === 'delete' || permissions?.voucher === 'delete') && <button className="btn btn-d btn-icon btn-sm" onClick={() => onDelete(v._original || v)} title="Delete Record"><Trash2 size={12} /></button>}
            </>}
          </div>
          )
        )}
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
        style={{ width: '90%', maxWidth: '360px', background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', padding: '28px 24px', textAlign: 'center' }}>
        <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><AlertTriangle size={26} color="#f43f5e" /></div>
        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>Delete Voucher?</div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-sub)', marginBottom: '6px' }}>LR <strong style={{ color: 'var(--text)' }}>#{v.lrNo}</strong> · {v.truckNo} · {v.date}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '22px' }}>This cannot be undone.</div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button className="btn btn-g" onClick={onClose}>Cancel</button>
          <button className="btn btn-d" onClick={go} disabled={deleting} title="Confirm Delete">{deleting ? <Loader2 size={13} className="spin" /> : <><Trash2 size={13} /> Delete</>}</button>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Month Section ── */
function MonthSection({ ym, rows, onSave, selected, onCheck, onCheckAll, onDelete, tabName, selTruck, filters, onFilterChange, role, permissions, orgName, vehicle, showPnL, onVerifyDiesel, onEdit }) {
  const isBillType = tabName === 'Kosli_Bill' || tabName === 'Jajjhar_Bill' || tabName === 'Bahadurgarh_Bill';
  const [open, setOpen] = useState(true);

  const monthChecked = rows.filter(v => selected.has(v.id));
  const allSelected = rows.length > 0 && monthChecked.length === rows.length;
  const someSelected = monthChecked.length > 0 && !allSelected;

  const totals = useMemo(() => {
    const net = rows.reduce((s, v) => s + calcNet(v, vehicle), 0);
    const paid = rows.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0);
    // Separate positive outstanding and negative (adjusted) amounts
    const positiveOut = rows.reduce((s, v) => {
      const n = calcNet(v, vehicle);
      const p = parseFloat(v.paidBalance) || 0;
      return n > 0 ? s + Math.max(0, n - p) : s;
    }, 0);
    const adjustedAmount = rows.reduce((s, v) => {
      const n = calcNet(v, vehicle);
      return n < 0 ? s + Math.abs(n) : s;
    }, 0);
    return {
      weight: rows.reduce((s, v) => s + (parseFloat(v.weight) || 0), 0).toFixed(2),
      gross: rows.reduce((s, v) => s + calcGross(v), 0),
      net,
      paid,
      out: Math.max(0, positiveOut - adjustedAmount),
      adjusted: adjustedAmount,
    };
  }, [rows, vehicle]);

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
        paidBalance: String(calcNet(v, vehicle).toFixed(2)),
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
        padding: '14px 18px', borderBottom: open ? '1px solid var(--border)' : 'none',
        background: 'var(--bg-card)',
      }}>
        {/* Row 1: Title + Status */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '8px', marginBottom: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '9px', background: 'rgba(245,158,11,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              {open ? <ChevronUp size={16} color="#f59e0b" /> : <ChevronDown size={16} color="#f59e0b" />}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)' }}>{monthLabel(ym)}</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>
                {rows.length} trips · Net {fmtRs(totals.net)} · Paid {fmtRs(totals.paid)}{totals.adjusted > 0 ? ` · Adjusted ${fmtRs(totals.adjusted)}` : ''}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {totals.out > 0
              ? <span style={{ fontSize: '13px', color: 'var(--warn)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={14} />{fmtRs(totals.out)} due</span>
              : <span style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={14} />Cleared</span>}
            {totals.adjusted > 0 && <span style={{ fontSize: '11.5px', color: '#6366f1', fontWeight: 700 }}>({fmtRs(totals.adjusted)} adjusted)</span>}
          </div>
        </div>
        {/* Row 2: Action Buttons */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
          paddingTop: '8px', borderTop: '1px solid var(--border)'
        }}>
          {/* Mark paid buttons */}
          {(role === 'admin' || permissions?.balance === 'edit') && (
            <button className="btn btn-g btn-sm" onClick={() => triggerMarkPaid(rows)} disabled={marking} title="Mark all rows in this month as Paid">
              {marking ? <Loader2 size={12} className="spin" /> : <><CheckCircle2 size={12} /> Mark Month Paid</>}
            </button>
          )}
          {monthChecked.length > 0 && (role === 'admin' || permissions?.balance === 'edit') && (
            <button className="btn btn-p btn-sm" onClick={() => triggerMarkPaid(monthChecked)}>
              <CheckCircle2 size={12} /> Mark {monthChecked.length} Paid
            </button>
          )}
          <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
          {/* Print buttons */}
          <button className="btn btn-g btn-sm" onClick={() => doPrint(rows, selTruck, monthLabel(ym), tabName, orgName, vehicle)}>
            <Printer size={12} /> Print Month
          </button>
          {monthChecked.length > 0 && (
            <button className="btn btn-g btn-sm" onClick={() => doPrint(monthChecked, selTruck, monthLabel(ym) + ' (selected)', tabName, orgName, vehicle)}>
              <Printer size={12} /> Print {monthChecked.length} Selected
            </button>
          )}
          <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
          {/* Export buttons — every field on the record, plus the figures the
              sheet derives. The old hand-picked lists dropped commission, tyre,
              extra money and outstanding without saying so. */}
          <button className="btn btn-g btn-sm" onClick={() => exportToExcel(balanceExportRows(rows, vehicle), `Balance_${selTruck}_${ym}`)}><Download size={12} /> Excel</button>
          <button className="btn btn-g btn-sm" onClick={() => exportToPDF(balanceExportRows(rows, vehicle), `Balance Sheet: ${selTruck} (${monthLabel(ym)})`, null,
            { archive: { module: 'Balance Sheet', plant: (tabName || '').replace(/_/g, ' '), name: archiveName('Export', tabName, selTruck, ym) } })}><Printer size={12} /> PDF</button>
        </div>
      </div>

      {open && (
        <TableScroll className="tbl-cards">
          <table style={{ minWidth: showPnL ? '1620px' : '1400px', width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
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
                {isBillType && <th style={TH}><ColumnFilter label="Bill No." colKey="billNo" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>}
                {isBillType && <th style={TH}><ColumnFilter label="Party Code" colKey="partyCode" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>}
                <th style={TH}><ColumnFilter label="Destination" colKey="destination" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}><ColumnFilter label="Weight" colKey="weight" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}><ColumnFilter label="Rate" colKey="rate" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}>Gross (Rs.)</th>
                <th style={TH}><ColumnFilter label="Diesel" colKey="advanceDiesel" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}><ColumnFilter label="Cash" colKey="advanceCash" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}><ColumnFilter label="Online" colKey="advanceOnline" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}><ColumnFilter label="Munshi" colKey="munshi" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}><ColumnFilter label="Shortage" colKey="shortage" data={rows} activeFilters={filters} onFilterChange={onFilterChange} /></th>
                <th style={TH}>Expenses</th>
                <th style={TH}>Net Bal</th>
                <th style={TH}>Paid</th>
                <th style={TH}>Status</th>
                {showPnL && <th style={{ ...TH, color: '#f43f5e' }}>Deductions</th>}
                {showPnL && <th style={{ ...TH, color: '#6366f1' }}>Margin %</th>}
                {role === 'admin' && <th style={TH}>Created By</th>}
                {role === 'admin' && <th style={TH}>Updated By</th>}
                <th style={TH}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v, i) => (
                <VoucherRow key={v.id} v={v} idx={i} onSave={onSave}
                  checked={selected.has(v._parentId || v.id)} onCheck={onCheck} onDelete={onDelete} role={role} permissions={permissions} isBillType={isBillType} vehicle={vehicle} showPnL={showPnL} onVerifyDiesel={onVerifyDiesel} onEdit={onEdit} />
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
                <td colSpan={6} style={TDF}></td>
                <td style={{ ...TDF, textAlign: 'right', color: 'var(--accent)', fontSize: '13px' }}>{fmtRs(totals.net)}</td>
                <td style={{ ...TDF, textAlign: 'right' }}>{fmtRs(totals.paid)}</td>
                <td style={{ ...TDF, textAlign: 'center', fontSize: '13px' }}>
                  {totals.out > 0
                    ? <span style={{ color: 'var(--warn)' }}>{fmtRs(totals.out)}</span>
                    : <span style={{ color: 'var(--accent)' }}><Check size={11} /> Cleared</span>}
                  {totals.adjusted > 0 && <div style={{ fontSize: '9px', color: '#6366f1', fontWeight: 700, marginTop: '2px' }}>Adj: {fmtRs(totals.adjusted)}</div>}
                </td>
                {showPnL && (() => {
                  const totalDed = rows.reduce((s, v) => s + calcTotalDeductions(v, vehicle), 0);
                  const avgMargin = totals.gross > 0 ? (totalDed / totals.gross * 100) : 0;
                  return <>
                    <td style={{ ...TDF, textAlign: 'right', color: 'var(--danger)' }}>{fmtRs(totalDed)}</td>
                    <td style={{ ...TDF, textAlign: 'center', color: '#6366f1' }}>{avgMargin.toFixed(1)}%</td>
                  </>;
                })()}
                <td colSpan={role === 'admin' ? 3 : 1} style={TDF}></td>
              </tr>
            </tfoot>
          </table>
        </TableScroll>
      )}
      <AnimatePresence>
        {confirmMarkRows && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
            <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ width: '90%', maxWidth: '360px', background: 'var(--bg-card)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', padding: '28px 24px' }}>
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
export default function BalanceSheet({ initialTab, lockedType, role = 'user', permissions = {}, brand }) {
  const { user, hasPermission } = useAuth();
  const orgName = user?.org?.name || 'VIKAS GOODS TRANSPORT CO.';
  // For non-VGTC orgs (brand='main'), always use 'main' type — no sub-tabs
  const isGeneric = brand === 'main';
  const [tab, setTab] = useState(isGeneric ? 'main' : (lockedType || initialTab || (brand === 'bahadurgarh' ? 'Bahadurgarh_Bill' : 'Kosli_Bill')));
  const [vouchers, setVouchers] = useState([]);
  const [selTruck, setSelTruck] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const selVehicle = useMemo(() => (vehicles || []).find(v => v.truckNo === selTruck), [vehicles, selTruck]);
  const [truckSearch, setTruckSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [delVoucher, setDelVoucher] = useState(null);
  const [marking, setMarking] = useState(false);
  const [paymentClearedDate, setPaymentClearedDate] = useState(new Date().toISOString().slice(0, 10));
  const [truckAllVouchers, setTruckAllVouchers] = useState([]);

  // Vehicle Advance states
  const [advances, setAdvances] = useState([]);
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [advForm, setAdvForm] = useState({ type: 'credit', amount: '', date: new Date().toISOString().slice(0, 10), remark: '' });
  const [advSaving, setAdvSaving] = useState(false);
  const [showAdvances, setShowAdvances] = useState(false);

  // Excel-style filters
  const [filters, setFilters] = useState({});
  const handleFilterChange = (key, val) => setFilters(f => ({ ...f, [key]: val }));
  const [showPnL, setShowPnL] = useState(false);
  const [showMonthPLModal, setShowMonthPLModal] = useState(false);
  const [selectedPLMonth, setSelectedPLMonth] = useState('');
  // The entry open in the edit dialog. Also reachable from the selection bar,
  // which is where a clerk who has just ticked a row looks for it.
  const [editRow, setEditRow] = useState(null);
  const [dieselVerifyTarget, setDieselVerifyTarget] = useState(null);
  const [dieselVerifyForm, setDieselVerifyForm] = useState({ amount: '' });
  const [dieselVerifySaving, setDieselVerifySaving] = useState(false);

  // ── Send to Pay ───────────────────────────────────────────────────────────
  // Done one truck at a time, from inside that truck's entries: the clerk opens
  // it, ticks the entries to hand over — with Monthly / All Pending / Till Date
  // as quick selections — and sends those. Batches hold only trip ids; every
  // rupee is still computed here and in Pay from the same vouchers, so there is
  // nothing to keep in sync.
  const [batches, setBatches] = useState([]);
  const [sending, setSending] = useState(false);
  // Quick-select presets inside a truck. The clerk still confirms the ticked
  // entries before sending — a preset only sets the selection.
  const [payMonth, setPayMonth] = useState(new Date().toISOString().slice(0, 7));
  const [payTillDate, setPayTillDate] = useState(new Date().toISOString().slice(0, 10));

  const fetchBatches = useCallback(async () => {
    try { setBatches((await ax.get('/freight-batches', { params: { open: 1 }, _skipCache: true })).data || []); }
    catch { setBatches([]); }
  }, []);
  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  /** voucherId -> the open batch holding it, so a row can show it is already gone. */
  const sentVoucherIds = useMemo(() => {
    const map = new Map();
    batches.forEach(b => (b.voucherIds || []).forEach(id => map.set(id, b)));
    return map;
  }, [batches]);


  const executeDieselVerify = async () => {
    if (!dieselVerifyTarget) return;
    setDieselVerifySaving(true);
    try {
      await ax.patch(`${API_V}/${dieselVerifyTarget.id}/verify-diesel`, {
        // Amount only. Litres and the pump were being retyped from what the
        // voucher already held; the server leaves any earlier values alone.
        // Read only for a full tank, so verification can never re-price a trip
        // that was already costed.
        dieselActualAmount: dieselVerifyForm.amount,
      });
      setDieselVerifyTarget(null);
      fetchVouchers();
    } catch { alert('Verification failed'); }
    finally { setDieselVerifySaving(false); }
  };

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (lockedType) setTab(lockedType);
  }, [lockedType]);

  const fetchVehicles = useCallback(async () => {
    try { setVehicles((await ax.get('/vehicles')).data); }
    catch { setVehicles([]); }
  }, []);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);
  useEffect(() => { fetchVouchers(); setSelTruck(null); setTruckSearch(''); setSelected(new Set()); }, [tab]);
  useEffect(() => { setSelected(new Set()); }, [selTruck, filters]);
  useEffect(() => {
    if (selTruck) {
        fetchAdvances(selTruck);
        fetchTruckAllVouchers(selTruck);
    }
  }, [selTruck]);

  const fetchVouchers = async () => {
    try { setVouchers((await ax.get(API_V + '/' + tab)).data); }
    catch (err) { console.error('BalanceSheet fetch failed:', tab, err); setVouchers([]); }
  };

  const fetchTruckAllVouchers = async (truck) => {
    try { 
        const res = await ax.get(API_V); // This gets all vouchers
        const filtered = res.data.filter(v => v.truckNo === truck);
        setTruckAllVouchers(filtered);
    } catch { setTruckAllVouchers([]); }
  };

  const fetchAdvances = async (truck) => {
    try { setAdvances((await ax.get('/vehicle-advances/' + encodeURIComponent(truck))).data); } catch { setAdvances([]); }
  };

  const handleAdvSubmit = async (e) => {
    e.preventDefault();
    if (!advForm.amount || parseFloat(advForm.amount) <= 0) return;
    setAdvSaving(true);
    try {
      await ax.post('/vehicle-advances', { ...advForm, truckNo: selTruck });
      setAdvForm({ type: 'credit', amount: '', date: new Date().toISOString().slice(0, 10), remark: '' });
      setShowAdvanceForm(false);
      fetchAdvances(selTruck);
    } catch (er) { alert(er.response?.data?.error || 'Failed'); }
    finally { setAdvSaving(false); }
  };

  const handleAdvDelete = async (id) => {
    if (!window.confirm('Delete this advance entry?')) return;
    try { await ax.delete('/vehicle-advances/' + id); fetchAdvances(selTruck); }
    catch { alert('Delete failed'); }
  };

  // Manual advances only (exclude auto GPS rent, payment deductions)
  const isAutoEntry = (a) => {
    const r = (a.remark || '').toLowerCase();
    return r.includes('gps rent') || r.includes('auto-deduct') || r.includes('payment cleared');
  };
  const manualAdvances = useMemo(() => advances.filter(a => !isAutoEntry(a)), [advances]);
  const advanceBalance = useMemo(() => {
    return manualAdvances.reduce((bal, a) => bal + (a.type === 'credit' ? a.amount : -a.amount), 0);
  }, [manualAdvances]);

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
        rows = rows.filter(v => columnValues(v, key).some(x => selectedValues.includes(x)));
      }
    });

    rows.sort((a, b) => a.date < b.date ? 1 : -1);
    // Split last, so a voucher's legs stay together and filters still match on
    // the voucher's own fields.
    const map = {};
    explodeAll(rows).forEach(v => { const ym = (v.date || '').slice(0, 7) || 'Unknown'; (map[ym] = map[ym] || []).push(v); });
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
  /**
   * Ticking a voucher takes all of its legs.
   *
   * Only the first leg carries a checkbox, but it also carries every deduction
   * while the freight is spread across the rest. Totalling the ticked rows alone
   * would charge the whole trip's diesel against one destination's freight and
   * understate what is owed — so the legs come along for the money and for the
   * printed statement.
   */
  const selRows = allVisibleRows.filter(v => selected.has(v._parentId || v.id));

  /**
   * The real records behind that selection, one per voucher. A leg has a
   * synthetic id and stripped deductions, so anything that writes — marking
   * paid, sending to Pay — has to address the voucher itself.
   */
  const selVouchers = [...new Map(
    selRows.map(v => [v._parentId || v.id, v._original || v]),
  ).values()];
  const selNet = selRows.reduce((s, v) => s + calcNet(v, selVehicle), 0);
  const selPaid = selRows.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0);
  const selOut = Math.max(0, selNet - selPaid);
  const allVis = allVisibleRows.length > 0 && selected.size === allVisibleRows.length;
  const someSelected = allVisibleRows.length > 0 && selected.size > 0 && selected.size < allVisibleRows.length;
  const [confirmMarkPaid, setConfirmMarkPaid] = useState(null);

  const triggerMarkSelectedPaid = () => {
    // Whole vouchers: a leg's net is only its own freight, so paying against it
    // would settle a fraction of the trip.
    const unpaid = selVouchers.filter(v => calcNet(v, selVehicle) > (parseFloat(v.paidBalance) || 0));
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
        paidBalance: String(calcNet(v, selVehicle).toFixed(2)),
        paymentClearedDate: date
      })));
      fetchVouchers();
    }
    catch { alert('Error'); } finally { setMarking(false); }
  };

  /* GPS Rent Accrual — ₹250 per GPS per full month since last deduction */
  const gpsAccrual = useMemo(() => {
    if (!selTruck || !selVehicle || !selVehicle.gpsType || selVehicle.gpsType === 'none') return null;

    const gpsType = selVehicle.gpsType;
    const gpsCount = gpsType === 'both' ? 2 : 1;
    const perMonth = 250 * gpsCount;

    // Find last GPS deduction from vehicle advances
    const allVouchers = truckAllVouchers || [];
    const gpsDeductions = allVouchers.filter(v =>
      v.remark && v.remark.toLowerCase().includes('gps rent') && v.type === 'debit'
    );
    let lastDeductionDate = null;
    gpsDeductions.forEach(v => {
      const d = new Date(v.date);
      if (!isNaN(d.getTime()) && (!lastDeductionDate || d > lastDeductionDate)) lastDeductionDate = d;
    });

    const today = new Date();
    let startDate = lastDeductionDate;
    if (!startDate) {
      const firstV = allVouchers.sort((a, b) => new Date(a.date) - new Date(b.date))[0];
      startDate = firstV ? new Date(firstV.date) : null;
    }
    if (!startDate) return null;

    const months = Math.max(0, (today.getFullYear() - startDate.getFullYear()) * 12 + (today.getMonth() - startDate.getMonth()));
    if (months === 0) return null;

    const gpsLabel = gpsType === 'both' ? 'JKL + JK Super' : gpsType === 'jkl' ? 'JKL' : 'JKS';
    return {
      totalAmount: months * perMonth,
      months,
      gpsCount,
      perMonth,
      label: `GPS Rent (${gpsCount} × ₹250 × ${months}m)`
    };
  }, [selTruck, selVehicle, truckAllVouchers]);

  /* Truck quick totals */
  const truckTotals = useMemo(() => {
    if (!selTruck) return null;
    const rows = truckGroups[selTruck] || [];
    const net = rows.reduce((s, v) => s + calcNet(v, selVehicle), 0);
    const paid = rows.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0);
    const positiveOut = rows.reduce((s, v) => {
      const n = calcNet(v, selVehicle);
      const p = parseFloat(v.paidBalance) || 0;
      return n > 0 ? s + Math.max(0, n - p) : s;
    }, 0);
    const adjusted = rows.reduce((s, v) => {
      const n = calcNet(v, selVehicle);
      return n < 0 ? s + Math.abs(n) : s;
    }, 0);
    return { trips: rows.length, net, paid, outstanding: Math.max(0, positiveOut - adjusted), adjusted };
  }, [selTruck, truckGroups, selVehicle]);

  const truckSummaries = useMemo(() => {
    const list = allTrucks.map(truck => {
      const rows = truckGroups[truck] || [];
      const vehicle = (vehicles || []).find(vh => vh.truckNo === truck);
      const net = rows.reduce((s, v) => s + calcNet(v, vehicle), 0);
      const paid = rows.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0);
      return { 
        truck, 
        trips: String(rows.length), 
        gross: rows.reduce((s, v) => s + calcGross(v), 0),
        net, 
        paid, 
        outstanding: Math.max(0, net - paid),
        status: (Math.max(0, net - paid) <= 0 ? 'Cleared' : 'Pending'),
        gpsType: vehicle?.gpsType || 'none',
      };
    });

    // Apply overview filters
    let filtered = list;
    Object.keys(filters).forEach(key => {
      const selectedValues = filters[key];
      if (selectedValues && selectedValues.length > 0) {
        filtered = filtered.filter(t => columnValues(t, key).some(x => selectedValues.includes(x)));
      }
    });

    return filtered;
  }, [allTrucks, truckGroups, filters, vehicles]);

  // Already whole — every field the summary carries, rounded for the sheet.
  const overviewExportRows = useMemo(() => buildExportRows(truckSummaries, {
    order: ['truck', 'trips', 'gross', 'net', 'paid', 'outstanding', 'status', 'gpsType'],
  }), [truckSummaries]);

  /**
   * An entry can go to Pay only if it still owes something and has not already
   * been handed over. Anything else is filtered out of every preset, so the
   * clerk cannot send the same trip twice by accident.
   */
  const canSendToPay = useCallback(
    v => !(v._leg > 0) && calcNet(v, selVehicle) > (parseFloat(v.paidBalance) || 0) && !sentVoucherIds.has(v._parentId || v.id),
    [selVehicle, sentVoucherIds],
  );

  // payBlockers now lives at module scope — see the top of this file.

  // Raised instead of sending when any ticked entry is not ready.
  const [sendBlocked, setSendBlocked] = useState(null);

  const sendableRows = useMemo(() => allVisibleRows.filter(canSendToPay), [allVisibleRows, canSendToPay]);
  const alreadySentCount = useMemo(
    () => allVisibleRows.filter(v => !(v._leg > 0) && sentVoucherIds.has(v._parentId || v.id)).length,
    [allVisibleRows, sentVoucherIds],
  );
  const notReadyCount = useMemo(
    () => sendableRows.filter(v => payBlockers(v).length).length,
    [sendableRows, payBlockers],
  );

  /** Presets only set the tick boxes — the clerk still reviews before sending. */
  const applyPayPreset = (kind) => {
    let rows = sendableRows;
    if (kind === 'month') rows = rows.filter(v => (v.date || '').slice(0, 7) === payMonth);
    if (kind === 'till') rows = rows.filter(v => v.date && v.date <= payTillDate);
    // 'pending' is every sendable entry, which is what sendableRows already is.
    setSelected(new Set(rows.map(v => v.id)));
    if (!rows.length) alert('Nothing matches that — those entries are either paid or already sent to Pay.');
  };

  const sendSelectedToPay = async () => {
    const trips = selVouchers.filter(canSendToPay);
    if (!trips.length || sending) return;

    // Everything ticked has to be complete. Stop on the whole selection rather
    // than quietly sending the good ones — the clerk asked for these entries.
    const notReady = trips
      .map(v => ({ v, problems: payBlockers(v) }))
      .filter(x => x.problems.length);
    if (notReady.length) { setSendBlocked(notReady); return; }

    setSending(true);
    try {
      // The period is taken from what was actually ticked, so the batch records
      // the real span rather than whatever the preset happened to be.
      const dates = trips.map(v => v.date).filter(Boolean).sort();
      const { data } = await ax.post('/freight-batches', {
        batches: [{
          type: tab,
          truckNo: selTruck,
          voucherIds: trips.map(v => v.id),
          periodFrom: dates[0] || null,
          periodTo: dates[dates.length - 1] || null,
        }],
      });
      await fetchBatches();
      setSelected(new Set());
      const skipped = data.skipped?.length ? `\n${data.skipped.length} entry(s) were already sent and were left out.` : '';
      alert(`Sent ${trips.length} entr${trips.length === 1 ? 'y' : 'ies'} for ${selTruck} to Pay.${skipped}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not send to Pay');
      fetchBatches();
    } finally { setSending(false); }
  };

  return (
    <div>
      <div className="page-hd">
        <div>
          <h1><BarChart3 size={20} color="#f59e0b" /> Balance Sheet</h1>
          <p style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {selTruck ? selTruck + ' — monthly details' : 'Per-vehicle payment tracking'}
            {selTruck && selVehicle && (
              selVehicle.gpsType === 'both'
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 9px', borderRadius: '6px', background: 'rgba(99,102,241,0.14)', color: '#818cf8', fontSize: '10px', fontWeight: 800, border: '1px solid rgba(99,102,241,0.25)' }}>📡 Both GPS Fitted</span>
                : selVehicle.gpsType === 'jkl'
                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 9px', borderRadius: '6px', background: 'rgba(245,158,11,0.14)', color: '#f59e0b', fontSize: '10px', fontWeight: 800, border: '1px solid rgba(245,158,11,0.25)' }}>📡 JK Lakshmi GPS</span>
                  : selVehicle.gpsType === 'jksuper'
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 9px', borderRadius: '6px', background: 'rgba(16,185,129,0.14)', color: '#10b981', fontSize: '10px', fontWeight: 800, border: '1px solid rgba(16,185,129,0.25)' }}>📡 JK Super GPS</span>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 9px', borderRadius: '6px', background: 'rgba(100,116,139,0.1)', color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700 }}>No GPS</span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {selTruck && <button className="btn btn-g btn-sm" onClick={() => setSelTruck(null)}><ChevronLeft size={14} /> All Trucks</button>}
          <button className={`btn btn-sm ${showPnL ? 'btn-p' : 'btn-g'}`} onClick={() => setShowPnL(s => !s)} title="Toggle P&L columns (deductions + margin %)">
            <TrendingDown size={13} /> {showPnL ? 'Hide P&L' : 'P&L View'}
          </button>
          {/* A whole-month report, so it belongs with the other page-level
              actions rather than in the row that acts on ticked entries. */}
          {selTruck && sortedMonths.length > 0 && (
            <button className="btn btn-g btn-sm" onClick={() => { setSelectedPLMonth(sortedMonths[0] || ''); setShowMonthPLModal(true); }}>
              <Printer size={13} /> Monthly P&L Report
            </button>
          )}
          {!lockedType && !isGeneric && (
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
            {(() => {
              const gpsDeduction = gpsAccrual?.totalAmount || 0;
              const rows = truckGroups[selTruck] || [];
              const vehicleExp = rows.reduce((s, v) => s + (parseFloat(v.tyrePuncture) || 0) + (parseFloat(v.tyreGreasingAir) || 0) + (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0) + (parseFloat(v.extraCash) || 0), 0);
              const netPayable = truckTotals.outstanding + advanceBalance - gpsDeduction;
              return [
                { label: 'Total Trips', val: truckTotals.trips, color: 'var(--primary)' },
                { label: 'Net Balance', val: fmtRs(truckTotals.net), color: 'var(--text)' },
                { label: 'Total Paid', val: fmtRs(truckTotals.paid), color: 'var(--accent)' },
                { label: 'Outstanding', val: fmtRs(truckTotals.outstanding), color: truckTotals.outstanding > 0 ? 'var(--warn)' : 'var(--accent)' },
                ...(truckTotals.adjusted > 0 ? [{ label: 'Adjusted', val: fmtRs(truckTotals.adjusted), color: '#6366f1' }] : []),
                { label: 'Advance Balance', val: fmtRs(advanceBalance), color: advanceBalance >= 0 ? '#10b981' : '#f43f5e' },
                ...(gpsDeduction > 0 ? [{ label: gpsAccrual.label, val: fmtRs(gpsDeduction), color: 'var(--warn)' }] : []),
                ...(vehicleExp > 0 ? [{ label: 'Vehicle Expenses', val: fmtRs(vehicleExp), color: '#f59e0b' }] : []),
                { label: 'NET PAYABLE', val: fmtRs(netPayable), color: netPayable > 0 ? '#10b981' : '#f43f5e' },
              ];
            })().map(({ label, val, color }) => (
              <div key={label} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px',
                padding: '14px 22px', display: 'inline-flex', flexDirection: 'column', gap: '5px', minWidth: '145px'
              }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                <span style={{ fontSize: '20px', fontWeight: 900, color, lineHeight: 1 }}>{val}</span>
              </div>
            ))}
          </div>

          {/* ── Vehicle Advance Ledger ── */}
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setShowAdvances(s => !s)}>
              <div className="card-title-block">
                <div className="card-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}><Wallet size={17} /></div>
                <div className="card-title-text">
                  <h3>Vehicle Advance Ledger</h3>
                  <p>{manualAdvances.length} entries · Balance: {fmtRs(advanceBalance)}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {(role === 'admin' || permissions?.balance === 'edit') && (
                  <button className="btn btn-p btn-sm" onClick={(e) => { e.stopPropagation(); setShowAdvanceForm(f => !f); setShowAdvances(true); }}>
                    <Plus size={12} /> Add Entry
                  </button>
                )}
                {showAdvances ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
              </div>
            </div>

            <AnimatePresence>
              {showAdvances && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>

                  {/* Add Advance Form */}
                  {showAdvanceForm && (
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-input)' }}>
                      <form onSubmit={handleAdvSubmit}>
                        <div className="fg fg-2" style={{ gap: '12px' }}>
                          <div className="field-h">
                            <label>Type</label>
                            <select className="fi" value={advForm.type} onChange={e => setAdvForm(f => ({ ...f, type: e.target.value }))}>
                              <option value="credit">Vehicle Owner Submits (Credit +)</option>
                              <option value="debit">We Give to Owner (Debit −)</option>
                            </select>
                          </div>
                          <div className="field-h">
                            <label>Amount (Rs.)</label>
                            <input className="fi" type="number" step="any" min="1" placeholder="Amount" value={advForm.amount} onChange={e => setAdvForm(f => ({ ...f, amount: e.target.value }))} required />
                          </div>
                          <div className="field-h">
                            <label>Date</label>
                            <input className="fi" type="date" value={advForm.date} onChange={e => setAdvForm(f => ({ ...f, date: e.target.value }))} />
                          </div>
                          <div className="field-h" style={{ gridColumn: '1 / -1' }}>
                            <label>Remark</label>
                            <input className="fi" type="text" placeholder="e.g. Cash received" value={advForm.remark} onChange={e => setAdvForm(f => ({ ...f, remark: e.target.value }))} />
                          </div>
                          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                            <button type="button" className="btn btn-g" onClick={() => setShowAdvanceForm(false)}>
                              Cancel
                            </button>
                            <button type="submit" className="btn btn-p" disabled={advSaving}>
                              {advSaving ? 'Saving...' : <><Check size={13} /> Save Entry</>}
                            </button>
                          </div>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Advance Transactions Table */}
                  <TableScroll>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                      <thead>
                        <tr>
                          <th style={TH}>#</th>
                          <th style={TH}>Date</th>
                          <th style={TH}>Type</th>
                          <th style={TH}>Credit (+)</th>
                          <th style={TH}>Debit (−)</th>
                          <th style={TH}>Running Balance</th>
                          <th style={TH}>Remark</th>
                          {role === 'admin' && <th style={TH}>Action</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {manualAdvances.length === 0 && (
                          <tr><td colSpan={role === 'admin' ? 8 : 7} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>No manual advance entries</td></tr>
                        )}
                        {[...manualAdvances].reverse().map((a, i, arr) => {
                          const runBal = arr.slice(0, i + 1).reduce((s, x) => s + (x.type === 'credit' ? x.amount : -x.amount), 0);
                          return (
                            <tr key={a.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                              <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                              <td style={TD}>{fmtDate(a.date)}</td>
                              <td style={TD}>
                                {a.type === 'credit'
                                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '5px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontSize: '10px', fontWeight: 800 }}><ArrowDownCircle size={11} /> Received</span>
                                  : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '5px', background: 'rgba(244,63,94,0.1)', color: '#f43f5e', fontSize: '10px', fontWeight: 800 }}><ArrowUpCircle size={11} /> Given</span>
                                }
                              </td>
                              <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{a.type === 'credit' ? fmtRs(a.amount) : '—'}</td>
                              <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#f43f5e' }}>{a.type === 'debit' ? fmtRs(a.amount) : '—'}</td>
                              <td style={{ ...TD, textAlign: 'right', fontWeight: 900, color: runBal >= 0 ? '#10b981' : '#f43f5e', fontSize: '13px' }}>{fmtRs(runBal)}</td>
                              <td style={{ ...TD, color: 'var(--text-sub)' }}>{a.remark || '—'}</td>
                              {role === 'admin' && (
                                <td style={{ ...TD, textAlign: 'center' }}>
                                  <button className="btn btn-d btn-icon btn-sm" onClick={() => handleAdvDelete(a.id)} title="Delete"><Trash2 size={12} /></button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                      {manualAdvances.length > 0 && (
                        <tfoot>
                          <tr>
                            <td colSpan={3} style={{ ...TDF, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>Total ({manualAdvances.length} entries)</td>
                            <td style={{ ...TDF, textAlign: 'right', fontWeight: 800, color: '#10b981' }}>{fmtRs(manualAdvances.filter(a => a.type === 'credit').reduce((s, a) => s + a.amount, 0))}</td>
                            <td style={{ ...TDF, textAlign: 'right', fontWeight: 800, color: '#f43f5e' }}>{fmtRs(manualAdvances.filter(a => a.type === 'debit').reduce((s, a) => s + a.amount, 0))}</td>
                            <td style={{ ...TDF, textAlign: 'right', fontWeight: 900, color: advanceBalance >= 0 ? '#10b981' : '#f43f5e', fontSize: '14px' }}>{fmtRs(advanceBalance)}</td>
                            <td colSpan={role === 'admin' ? 2 : 1} style={TDF}></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </TableScroll>
                </motion.div>
              )}
            </AnimatePresence>
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

          {/* Send to Pay — pick the entries for this truck, then hand them over. */}
          {allVisibleRows.length > 0 && (role === 'admin' || permissions?.balance === 'edit') && (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px',
              padding: '12px 18px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Banknote size={16} color="#10b981" />
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>Send to Pay</span>
              </div>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 600 }}>Select:</span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <input type="month" className="fi" style={{ width: '135px', height: '30px', fontSize: '11.5px' }}
                  value={payMonth} onChange={e => setPayMonth(e.target.value)} />
                <button className="btn btn-g btn-sm" onClick={() => applyPayPreset('month')}>Monthly</button>
              </div>

              <button className="btn btn-g btn-sm" onClick={() => applyPayPreset('pending')}
                title="Every entry still owing that has not been sent yet">
                All Pending
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <input type="date" className="fi" style={{ width: '140px', height: '30px', fontSize: '11.5px' }}
                  value={payTillDate} onChange={e => setPayTillDate(e.target.value)} />
                <button className="btn btn-g btn-sm" onClick={() => applyPayPreset('till')}>Till Date</button>
              </div>

              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {sendableRows.length} sendable
                  {alreadySentCount > 0 && <> · <span style={{ color: 'var(--primary)' }}>{alreadySentCount} already sent</span></>}
                  {notReadyCount > 0 && <> · <span style={{ color: '#f43f5e' }}>{notReadyCount} not ready</span></>}
                </span>
                <button className="btn btn-p btn-sm"
                  disabled={sending || selVouchers.filter(canSendToPay).length === 0}
                  onClick={sendSelectedToPay}>
                  {sending ? <Loader2 size={13} className="spin" /> : <ArrowRight size={13} />}
                  {sending ? 'Sending…' : `Send ${selVouchers.filter(canSendToPay).length} to Pay`}
                </button>
              </div>
            </div>
          )}

          {/* Select-all action bar */}
          {allVisibleRows.length > 0 && (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px',
              padding: '12px 18px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap'
            }}>
              <input type="checkbox" checked={allVis} ref={el => { if (el) el.indeterminate = someSelected; }}
                onChange={() => onCheckAll(allVisibleRows, !allVis)}
                style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: 'var(--primary)' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)' }}>
                {selected.size === 0 ? 'Select entries to mark/print' : 'Selected: ' + selected.size + ' of ' + allVisibleRows.length}
              </span>
              {selected.size > 0 && (<>
                <div style={{ height: '20px', width: '1px', background: 'var(--border)' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>Net: {fmtRs(selNet)}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)' }}>Paid: {fmtRs(selPaid)}</span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: selOut > 0 ? 'var(--warn)' : 'var(--accent)' }}>
                  Due: {selOut > 0 ? fmtRs(selOut) : 'Cleared ✓'}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '7px' }}>
                  {/* Edit acts on one entry, so it only appears when one is ticked —
                      offering it for twelve would mean guessing which. */}
                  {selected.size === 1 && (role === 'admin' || permissions?.balance === 'edit') && (
                    <button className="btn btn-g btn-sm" onClick={() => setEditRow(selRows[0])} title="Edit this entry">
                      <Pencil size={13} /> Edit Entry
                    </button>
                  )}
                  {/* Print is the action for whatever is ticked, so it leads. */}
                  <button className="btn btn-p btn-sm" onClick={() => doPrint(selRows, selTruck, `${selected.size} selected`, tab, orgName, selVehicle)}>
                    <Printer size={13} /> Print {selected.size} Selected
                  </button>
                  {(role === 'admin' || permissions?.balance === 'edit') && (
                    <button className="btn btn-g btn-sm" onClick={triggerMarkSelectedPaid} disabled={marking} title="Mark selected entries as Paid">
                      {marking ? <Loader2 size={13} className="spin" /> : <><CheckCircle2 size={13} /> Mark {selected.size} as Paid</>}
                    </button>
                  )}
                  <button className="btn btn-g btn-sm" onClick={() => setSelected(new Set())}>
                    <X size={13} /> Clear
                  </button>
                </div>
              </>)}
            </div>
          )}

          {sortedMonths.length === 0 && <div style={{ color: 'var(--text-muted)', padding: '40px', textAlign: 'center', fontSize: '13px' }}>No vouchers in this period</div>}
          {sortedMonths.map(ym => (
            <MonthSection key={ym} ym={ym} rows={monthMap[ym]} onSave={fetchVouchers}
              selected={selected} onCheck={onCheck} onCheckAll={onCheckAll} onDelete={setDelVoucher}
              tabName={tab} selTruck={selTruck} filters={filters} onFilterChange={handleFilterChange}
              role={role} permissions={permissions} orgName={orgName} vehicle={selVehicle} showPnL={showPnL}
              onVerifyDiesel={(v) => {
                setDieselVerifyTarget(v);
                setDieselVerifyForm({ amount: '' });
              }}
              onEdit={setEditRow} />
          ))}

          <AnimatePresence>
            {editRow && (
              <VoucherEditModal v={editRow} vehicle={selVehicle}
                onClose={() => setEditRow(null)} onSaved={fetchVouchers} />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {delVoucher && (
              <DeleteConfirm
                v={delVoucher}
                onClose={() => setDelVoucher(null)}
                onConfirm={() => { setDelVoucher(null); fetchVouchers(); }}
              />
            )}
          </AnimatePresence>

          {/* Diesel Verification Modal */}
          <AnimatePresence>
            {dieselVerifyTarget && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
                <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  style={{ width: '90%', maxWidth: '380px', background: 'var(--bg-card)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', padding: '28px 24px' }}>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>Verify Diesel</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginBottom: '4px' }}>LR <strong>#{dieselVerifyTarget.lrNo}</strong> · {dieselVerifyTarget.truckNo} · {dieselVerifyTarget.date}</div>
                  <div style={{ fontSize: '11px', color: 'var(--warn)', marginBottom: '18px', fontWeight: 700 }}>
                    Advance given: {dieselVerifyTarget.advanceDiesel === 'FULL' ? 'Full Tank (Est. Rs.4000)' : `Rs.${dieselVerifyTarget.advanceDiesel}`}
                  </div>
                  {(() => {
                    // The voucher already records which pump and how much, so
                    // asking again is asking the clerk to retype what the app
                    // knows. The one thing it cannot know is what a full tank
                    // actually cost — that is the only field worth demanding.
                    const isFull = dieselVerifyTarget.advanceDiesel === 'FULL' || dieselVerifyTarget.isFullTank;
                    const spend = isFull
                      ? (parseFloat(dieselVerifyForm.amount) || 0)
                      : (parseFloat(dieselVerifyTarget.advanceDiesel) || 0);
                    return (
                      <>
                        {isFull ? (
                          <div className="field-h" style={{ marginBottom: '18px' }}>
                            <label>Actual Amount (Rs.) *</label>
                            <input className="fi" type="number" step="1" autoFocus placeholder="what the tank actually cost"
                              value={dieselVerifyForm.amount}
                              onChange={e => setDieselVerifyForm(f => ({ ...f, amount: e.target.value }))} />
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                              Booked as a full tank, so the sheet has been carrying the Rs.4,000 estimate. This replaces it.
                            </span>
                          </div>
                        ) : (
                          <div style={{ marginBottom: '18px', fontSize: '12px', color: 'var(--text-sub)' }}>
                            Confirm this is what the driver actually spent.
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                          <button className="btn btn-g" onClick={() => setDieselVerifyTarget(null)} disabled={dieselVerifySaving}>Cancel</button>
                          <button className="btn btn-p" onClick={executeDieselVerify}
                            disabled={dieselVerifySaving || (isFull && !(spend > 0))}
                            title={isFull && !(spend > 0) ? 'Enter what the full tank cost' : 'Mark verified'}>
                            {dieselVerifySaving ? <Loader2 size={13} className="spin" /> : <><Check size={13} /> Verify {spend > 0 ? `Rs.${spend.toLocaleString('en-IN')}` : ''}</>}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Monthly P&L Report Modal */}
          <AnimatePresence>
            {showMonthPLModal && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
                <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  style={{ width: '90%', maxWidth: '400px', background: 'var(--bg-card)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', padding: '28px 24px' }}>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>Monthly P&L Report</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginBottom: '20px' }}>Select a month to generate the P&L breakdown PDF for <strong>{selTruck}</strong>.</div>
                  <div className="field-h" style={{ marginBottom: '20px' }}>
                    <label>Month</label>
                    <select className="fi" value={selectedPLMonth} onChange={e => setSelectedPLMonth(e.target.value)}>
                      {sortedMonths.map(ym => {
                        const [y, m] = ym.split('-');
                        const label = new Date(y, m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
                        return <option key={ym} value={ym}>{label} ({(monthMap[ym] || []).length} trips)</option>;
                      })}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button className="btn btn-g" onClick={() => setShowMonthPLModal(false)}>Cancel</button>
                    <button className="btn btn-p" onClick={() => { doPrintMonthlyPL(selectedPLMonth, monthMap[selectedPLMonth] || [], tab, orgName, selVehicle); setShowMonthPLModal(false); }}>
                      <Printer size={13} /> Print P&L Report
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Entries that are not ready to be handed to Pay. */}
          <AnimatePresence>
            {sendBlocked && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
                onClick={() => setSendBlocked(null)}>
                <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  onClick={e => e.stopPropagation()}
                  style={{ width: '94%', maxWidth: '520px', maxHeight: '80vh', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', padding: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <AlertTriangle size={19} color="#f43f5e" />
                    </div>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>
                        {sendBlocked.length} entr{sendBlocked.length === 1 ? 'y is' : 'ies are'} not ready for Pay
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Nothing has been sent. Fix these, then send again.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '16px 0' }}>
                    {sendBlocked.map(({ v, problems }) => (
                      <div key={v.id} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', background: 'var(--bg-tf)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>
                            LR {lrLabelOf(v)} <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '11.5px' }}>· {v.date || '—'}</span>
                          </span>
                          <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)' }}>{v.destination || v.partyName || ''}</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                          {problems.map(p => (
                            <span key={p} style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800, background: 'rgba(244,63,94,0.1)', color: '#f43f5e' }}>{p}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '16px' }}>
                    Verify diesel in the Diesel Control module, mark online advances paid under Pay → Online Advance,
                    and enter any missing rate on the entry itself.
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-p" onClick={() => setSendBlocked(null)}>Got it</button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {confirmMarkPaid && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
                <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  style={{ width: '90%', maxWidth: '360px', background: 'var(--bg-card)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', padding: '28px 24px' }}>
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
        <div>
        {(() => {
          const overdueCount = truckSummaries.filter(t => {
            const rows = truckGroups[t.truck] || [];
            const veh = (vehicles || []).find(vh => vh.truckNo === t.truck);
            return rows.some(v => {
              const n = calcNet(v, veh), p = parseFloat(v.paidBalance) || 0;
              return Math.max(0, n - p) > 0 && daysAgo(v.date) > 30;
            });
          }).length;
          return overdueCount > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: 'rgba(244,63,94,0.07)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '10px', marginBottom: '14px' }}>
              <AlertCircle size={15} color="#f43f5e" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#f43f5e' }}>
                {overdueCount} truck{overdueCount > 1 ? 's have' : ' has'} trips with payments overdue 30+ days — click to view
              </span>
            </div>
          ) : null;
        })()}
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
              <button className="btn btn-g btn-sm" onClick={() => exportToExcel(overviewExportRows, `Balance_Overview_${tab}`)}><Download size={13} /> Excel</button>
              <button className="btn btn-g btn-sm" onClick={() => exportToPDF(overviewExportRows, `Balance Sheet Overview - ${tab.replace('_', ' ')}`)}><Printer size={13} /> PDF</button>
            </div>
          </div>
          <TableScroll>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={TH}>#</th>
                  <th style={TH}><ColumnFilter label="Truck No." colKey="truck" data={truckSummaries} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                  <th style={TH}><ColumnFilter label="GPS" colKey="gpsType" data={truckSummaries} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                  <th style={TH}><ColumnFilter label="Trips" colKey="trips" data={truckSummaries} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                  <th style={TH}>Gross</th>
                  <th style={TH}>Net Balance</th>
                  <th style={TH}>Paid</th>
                  <th style={TH}>Outstanding</th>
                  <th style={TH}><ColumnFilter label="Status" colKey="status" data={truckSummaries} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                  <th style={TH}>Sent to Pay</th>
                </tr>
              </thead>
              <tbody>
                {truckSummaries.length === 0 && <tr><td colSpan={10} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No records</td></tr>}
                {truckSummaries.map(({ truck, trips, gross, net, paid, outstanding, gpsType }, i) => (
                  <tr key={truck}
                    style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)', cursor: 'pointer', transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-row-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)'}
                    onClick={() => setSelTruck(truck)}>
                    <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ ...TD }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Truck size={15} color="#f59e0b" /></div>
                        <span style={{ fontWeight: 800, color: 'var(--text)', fontSize: '13.5px' }}>{truck}</span>
                      </div>
                    </td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      {(!gpsType || gpsType === 'none')
                        ? <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>—</span>
                        : gpsType === 'both'
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', borderRadius: '6px', background: 'rgba(99,102,241,0.12)', color: '#818cf8', fontSize: '10px', fontWeight: 800 }}>📡 Both GPS</span>
                          : gpsType === 'jkl'
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', borderRadius: '6px', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontSize: '10px', fontWeight: 800 }}>📡 JKL</span>
                            : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', borderRadius: '6px', background: 'rgba(16,185,129,0.12)', color: '#10b981', fontSize: '10px', fontWeight: 800 }}>📡 JKS</span>
                      }
                    </td>
                    <td style={{ ...TD, textAlign: 'center', fontWeight: 700 }}>{trips}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{fmtRs(gross)}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>{fmtRs(net)}</td>
                    <td style={{ ...TD, textAlign: 'right', color: 'var(--accent)', fontWeight: 700 }}>{fmtRs(paid)}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: outstanding > 0 ? 'var(--warn)' : 'var(--accent)', fontSize: '13px' }}>{outstanding > 0 ? fmtRs(outstanding) : '—'}</td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      {outstanding <= 0
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(16,185,129,0.1)', color: 'var(--accent)', fontSize: '11px', fontWeight: 700 }}><Check size={10} /> Cleared</span>
                        : (() => {
                          const veh = (vehicles||[]).find(vh => vh.truckNo === truck);
                          const rows2 = truckGroups[truck] || [];
                          const maxDays = rows2.reduce((m, v) => {
                            const n = calcNet(v, veh), p = parseFloat(v.paidBalance)||0;
                            return Math.max(0, n-p) > 0 ? Math.max(m, daysAgo(v.date)) : m;
                          }, 0);
                          const color = maxDays > 30 ? '#f43f5e' : 'var(--warn)';
                          return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)', color: 'var(--warn)', fontSize: '11px', fontWeight: 700 }}>Pending</span>
                            {maxDays > 15 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '9px', fontWeight: 800, color }}><Clock size={8} />{maxDays}d</span>}
                          </div>;
                        })()
                      }
                    </td>
                    {/* Already handed to Pay — stops the same trips going twice
                        and tells the clerk when the office owes it by. */}
                    <td style={{ ...TD, textAlign: 'center' }}>
                      {(() => {
                        const open = batches.filter(b => b.truckNo === truck);
                        if (!open.length) return <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>;
                        const trips = open.reduce((s, b) => s + (b.voucherIds || []).length, 0);
                        const due = open.map(b => b.dueDate).filter(Boolean).sort()[0];
                        const overdue = due && due < new Date().toISOString().slice(0, 10);
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', fontSize: '11px', fontWeight: 700 }}>
                              <ArrowRight size={10} /> {trips} trip{trips === 1 ? '' : 's'}
                            </span>
                            {due && (
                              <span style={{ fontSize: '9px', fontWeight: 800, color: overdue ? '#f43f5e' : 'var(--text-muted)' }}>
                                due {due}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
        </div>
      )}
    </div>
  );
}