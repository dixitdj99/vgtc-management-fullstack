import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import ax from '../api';
import { cleanTruckNo } from '../utils/vehicleUtils';
import { buildPartySuggestions, resolvePartyName } from '../utils/partyNameUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Search, MapPin, Fuel, CreditCard, Wallet, Pencil, Trash2, Printer, Check, X, AlertTriangle, Plus, Filter, ChevronDown, ChevronUp, Download, Droplet, ArrowRight, Printer as PrinterIcon, Loader2, Gauge, Navigation } from 'lucide-react';
import ConfirmSaveModal from '../components/ConfirmSaveModal';
import { exportToExcel, exportToPDF, buildExportRows } from '../utils/exportUtils';
import ColumnFilter from '../components/ColumnFilter';
import Pagination from '../components/Pagination';
import useFormShortcuts, { markInvalidFields } from '../hooks/useFormShortcuts';
import { getSticky, rememberSticky } from '../utils/stickyDefaults';
import { openReceiptWindow, printHtml } from '../utils/receiptPrint';
import { archiveName } from '../utils/archiveDoc';
import { readExtras, extrasTotal, extrasPayload, printableExtras } from '../utils/voucherExtras';

const PAGE_SIZE = 20;

const API_V = `/vouchers`;
const API_LR = `/lr`;
const NONE_PUMP = 'None';
const TYPES = ['Kosli_Bill', 'Jajjhar_Bill', 'Bahadurgarh_Bill', 'Dump', 'JK_Lakshmi', 'JK_Super'];

const EMPTY_DELIVERY = { lrNo: '', destination: '', partyName: '', weight: '', bags: '', rate: '' };

// Compute gross for a voucher — handles both single and multi-delivery
const calcGrossV = (v) => {
    if (v.deliveries?.length > 0) {
        return v.deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0), 0);
    }
    return (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);
};

const hasDieselAdvance = (value) => String(value ?? '').trim() !== '';
const getAllowedPump = (pump, advanceDiesel, pumpOptions = []) => {
    if (!hasDieselAdvance(advanceDiesel)) return NONE_PUMP;
    const pumps = pumpOptions.filter(p => p !== NONE_PUMP);
    return pump && pump !== NONE_PUMP ? pump : (pumps[0] || NONE_PUMP);
};
const getPumpDisplay = (pump) => pump && pump !== NONE_PUMP ? pump : '—';

/**
 * A diesel advance must name a real fuel station. Saved with pump "None" it
 * lands in the pump ledger under no station, can never be matched to any
 * monthly bill, and therefore can never be verified or paid — the "None" rows
 * the ledger used to accumulate. Returns a user-facing reason, or null if fine.
 */
const dieselPumpProblem = (advanceDiesel, isFullTank, pump, pumpOptions = []) => {
    if (!hasDieselAdvance(advanceDiesel) && !isFullTank) return null;
    const stations = pumpOptions.filter(p => p !== NONE_PUMP);
    if (!stations.length) {
        return 'No fuel station is registered, so a diesel advance cannot be recorded. Add the station first under Admin Settings → Fuel Stations.';
    }
    if (!pump || pump === NONE_PUMP) {
        return 'Select the fuel station this diesel was taken from — a diesel advance cannot be saved without one.';
    }
    return null;
};
const isBillVoucherType = (type) => type === 'Kosli_Bill' || type === 'Jajjhar_Bill' || type === 'Bahadurgarh_Bill';

const getCalc = (w, r, hasComm) => {
    const wt = parseFloat(w) || 0, rt = parseFloat(r) || 0;
    const munshi = wt > 0 ? (wt < 18 ? 50 : 100) : 0;
    const commission = hasComm ? wt * 20 : 0;
    return { munshi, commission, total: rt * wt };
};

// Compute deductions and net payable for a voucher record
const getNet = (v) => {
    const gross = calcGrossV(v);
    const dieselPending = !!v.advanceDiesel && isNaN(parseFloat(v.advanceDiesel));
    const diesel = dieselPending ? 0 : (parseFloat(v.advanceDiesel) || 0);
    const cash = parseFloat(v.advanceCash) || 0;
    const online = parseFloat(v.advanceOnline) || 0;
    const munshi = parseFloat(v.munshi) || 0;
    const commission = parseFloat(v.commission) || 0;
    const tyrePuncture = parseFloat(v.tyrePuncture) || 0;
    const tyreGreasingAir = (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0) + (parseFloat(v.tyreGreasingAir) || 0);
    const extraCash = extrasTotal(readExtras(v));
    const vehicleExpenses = tyrePuncture + tyreGreasingAir + extraCash;
    const totalDeductions = diesel + cash + online + munshi + commission + vehicleExpenses;
    return { gross, diesel, cash, online, munshi, commission, tyrePuncture, tyreGreasingAir, extraCash, vehicleExpenses, totalDeductions, net: gross - totalDeductions, dieselPending };
};

/* ── Print ── */
function printVoucher(v, org = {}, brand = '', signedBy = 'VGTC') {
    const orgName = org.name || 'VIKAS GOODS TRANSPORT CO.';
    const isBill = v.type === 'Kosli_Bill' || v.type === 'Jajjhar_Bill' || v.type === 'Bahadurgarh_Bill';

    const n = getNet(v);
    const hasDeliveries = v.deliveries && v.deliveries.length > 0;
    const totalWeight = hasDeliveries
        ? v.deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0), 0)
        : (parseFloat(v.weight) || 0);
    const totalBags = hasDeliveries
        ? v.deliveries.reduce((s, d) => s + (parseInt(d.bags) || 0), 0)
        : (parseInt(v.bags) || 0);

    /**
     * The LR numbers this voucher actually covers.
     *
     * A multi-delivery voucher's own `lrNo` is a parent reference — often blank,
     * printed as "AUTO" — while the real numbers sit on the drops. The driver and
     * the party both identify the load by those, so the slip has to carry them.
     */
    const lrLabel = hasDeliveries
        ? v.deliveries.map(d => d.lrNo).filter(Boolean).map(n => `#${n}`).join(', ')
          || (v.lrNo ? `#${v.lrNo}` : 'AUTO')
        : (v.lrNo ? `#${v.lrNo}` : 'AUTO');

    /**
     * Nobody has priced this trip yet. Gross is then zero, so net comes out as
     * the bare deductions — a negative "NET PAYABLE" that reads as though the
     * driver owes the company. The slip says the rate is missing and lists the
     * deductions instead.
     */
    const rateMissing = hasDeliveries
        ? !v.deliveries.some(d => parseFloat(d.rate) > 0)
        : !(parseFloat(v.rate) > 0);

    // The rate the freight was worked out at. Multi-delivery vouchers can carry a
    // different rate per drop, so show each one rather than a misleading single figure.
    const rateLabel = (() => {
        const rates = [...new Set((hasDeliveries ? v.deliveries.map(d => d.rate) : [v.rate])
            .map(r => parseFloat(r) || 0).filter(r => r > 0))];
        if (!rates.length) return '';
        return rates.map(r => `Rs. ${r.toLocaleString('en-IN')}`).join(' / ') + ' / MT';
    })();

    // Each extra is its own row carrying its own remark. Folding the remark into
    // the label made a long note push the amount clean off the slip.
    const deductionRows = [
        { lbl: 'Diesel Advance', val: n.diesel, raw: v.advanceDiesel },
        { lbl: 'Cash Advance', val: n.cash, raw: v.advanceCash },
        { lbl: 'Online Advance', val: n.online, raw: v.advanceOnline },
        { lbl: 'Munshi', val: n.munshi, raw: v.munshi },
        { lbl: 'Commission', val: n.commission, raw: v.commission },
        { lbl: 'Tyre Puncture', val: n.tyrePuncture },
        { lbl: 'Tyre Greasing & Air', val: n.tyreGreasingAir },
    ].filter(d => d.val > 0 || (d.lbl === 'Diesel Advance' && v.advanceDiesel && v.advanceDiesel !== '0'))
        .concat(printableExtras(v).map(e => ({ lbl: 'Extra Cash', note: e.remark, val: e.amount })));

    // One archive descriptor for all three voucher layouts — same document,
    // whichever way it is drawn.
    const archive = {
        module: 'Vouchers',
        kind: isBill ? 'Statements' : 'Documents',
        plant: (v.type || '').replace(/_/g, ' ') || 'Other',
        name: archiveName('Voucher', v.lrNo || (hasDeliveries ? v.deliveries.map(d => d.lrNo).join('-') : v.id?.slice(0, 6)), v.truckNo, v.date),
        meta: { lrNo: v.lrNo, truckNo: v.truckNo, date: v.date, type: v.type },
    };

    if (brand === 'jklakshmi') {
        openReceiptWindow({
            archive,
            title: `Voucher #${v.lrNo || (hasDeliveries ? v.deliveries.map(d => d.lrNo).join(',') : '')}`,
            fontSize: '9.5pt',
            styles: `
      .hd {
        text-align: center;
        border-bottom: 2.5px solid #000;
        padding-bottom: 1.5mm;
        margin-bottom: 2mm;
      }
      .hd .co {
        font-size: 13pt;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .hd .sub {
        font-size: 8.5pt;
        font-weight: bold;
        color: #000;
        margin-top: 1px;
      }
      .lr-row {
        display: flex;
        justify-content: space-between;
        font-size: 10pt;
        font-weight: bold;
        margin-bottom: 2mm;
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
        gap: 8px;
        padding: 2.5px 6px;
        border-bottom: 1.5px solid #000;
        font-size: 9.5pt;
      }
      .line:last-child { border-bottom: none; }
      .lbl {
        font-weight: 800;
        font-size: 8.5pt;
        text-transform: uppercase;
        color: #000;
        /* Must be allowed to shrink. A long remark used to hold the label at its
           full width and squeeze the amount off the right-hand edge. */
        min-width: 0;
      }
      /* The remark sits under its label in normal case — uppercase runs long and
         a remark is a sentence, not a heading. */
      .lbl .note {
        display: block;
        font-weight: 600;
        font-size: 7.5pt;
        text-transform: none;
        letter-spacing: 0;
        line-height: 1.2;
        margin-top: 0.5px;
        word-break: break-word;
      }
      .val {
        font-weight: 900;
        text-align: right;
        flex-shrink: 0;
        white-space: nowrap;
      }
      .net-banner {
        background: #000;
        color: #fff;
        display: flex;
        justify-content: space-between;
        padding: 4px 8px;
        font-size: 11pt;
        font-weight: 900;
        border-radius: 3px;
        margin: 2mm 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .sig-section {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        margin-top: auto;
        padding-top: 2mm;
      }
      .sig-box {
        text-align: center;
        font-size: 8.5pt;
        font-weight: bold;
        border-top: 2px solid #000;
        padding-top: 2px;
        width: 18mm;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .digital-sig-box {
        border: 2px solid #000;
        background: #fff;
        border-radius: 4px;
        padding: 2px 6px;
        text-align: center;
        width: 30mm;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .digital-sig-title {
        font-size: 6pt;
        color: #000;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.1px;
        display: block;
      }
      .digital-sig-text {
        font-family: 'Brush Script MT', cursive, sans-serif;
        font-size: 14pt;
        color: #000;
        font-weight: bold;
        line-height: 0.95;
        margin: 1px 0;
      }
      .digital-sig-footer {
        font-size: 5.5pt;
        color: #000;
        display: block;
      }
      /* One card per LR — the JK Super layout, which states each drop's own
         destination, bags, weight and rate instead of one combined line. */
      .dlv-list { margin-bottom: 2mm; }
      .dlv {
        border: 1.5px solid #000;
        border-radius: 3px;
        padding: 1.5mm 2mm;
        margin-bottom: 1.2mm;
      }
      .dlv-top {
        display: flex;
        justify-content: space-between;
        gap: 2mm;
        font-weight: 900;
        font-size: 9.5pt;
      }
      .dlv-dest { text-align: right; }
      .dlv-party { font-size: 8pt; font-weight: 700; margin-top: 0.3mm; }
      .dlv-nums {
        display: flex;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 1.5mm;
        font-size: 8.5pt;
        font-weight: 800;
        margin-top: 0.8mm;
      }
      .dlv-gross { font-weight: 900; }
      .dlv-total {
        display: flex;
        justify-content: space-between;
        gap: 2mm;
        font-weight: 900;
        font-size: 9pt;
        border-top: 2px solid #000;
        padding-top: 1mm;
      }`,
            body: `
    <div class="container">
      <div>
        <div class="hd">
          <div class="co">Vikas Goods Transport</div>
          <div class="sub">Jharli, Jhajjar | Mob: 9416319445</div>
        </div>

        <div class="lr-row">
          <span>Voucher for LR: ${lrLabel}</span>
          <span>Date: ${v.date}</span>
        </div>

        <div class="sec">
          <div class="line"><span class="lbl">Truck No</span><span class="val" style="font-size: 11pt; font-weight: 900;">${v.truckNo}</span></div>
          ${hasDeliveries ? '' : `
          <div class="line"><span class="lbl">Party Name</span><span class="val">${v.partyName || '—'}</span></div>
          <div class="line"><span class="lbl">Destination</span><span class="val">${v.destination || '—'}</span></div>
          <div class="line"><span class="lbl">Bags / Weight</span><span class="val">${totalBags} Bags / ${totalWeight} MT</span></div>
          ${rateLabel ? `<div class="line"><span class="lbl">Rate</span><span class="val">${rateLabel}</span></div>` : ''}`}
        </div>

        ${hasDeliveries ? `
        <!-- One card per LR, the way the JK Super slip does it. A combined
             "Bags / Weight" line hid which drop carried what, and the rates can
             differ per destination — so each LR states its own. -->
        <div class="dlv-list">
          ${v.deliveries.map(d => {
            const rowGross = (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0);
            return `<div class="dlv">
              <div class="dlv-top"><span class="dlv-lr">LR #${d.lrNo || '—'}</span><span class="dlv-dest">${d.destination || '—'}</span></div>
              ${d.partyName ? `<div class="dlv-party">${d.partyName}</div>` : ''}
              <div class="dlv-nums">
                <span><b>${parseFloat(d.weight || 0).toFixed(2)}</b> MT</span>
                <span><b>${d.bags || '—'}</b> bags</span>
                <span>@ ${d.rate || '—'}</span>
                <span class="dlv-gross">${rowGross > 0 ? 'Rs. ' + Math.round(rowGross).toLocaleString('en-IN') : 'rate?'}</span>
              </div>
            </div>`;
          }).join('')}
          <div class="dlv-total">
            <span>TOTAL · ${v.deliveries.length} destinations</span>
            <span>${totalWeight} MT · ${totalBags} bags</span>
          </div>
        </div>` : ''}

        <div class="sec">
          <div class="line"><span class="lbl">Gross Freight</span><span class="val">${rateMissing ? '—' : 'Rs. ' + Math.round(n.gross).toLocaleString('en-IN')}</span></div>
          ${deductionRows.map(d => `<div class="line"><span class="lbl">${d.lbl}${d.note ? `<span class="note">${d.note}</span>` : ''}</span><span class="val">- ${n.dieselPending && d.lbl==='Diesel Advance' ? 'FULL' : 'Rs. ' + Math.round(d.val).toLocaleString('en-IN')}</span></div>`).join('')}
        </div>

        ${rateMissing
            ? `<div style="background:#92400e;color:#fff;text-align:center;padding:5px 6px;font-size:9pt;font-weight:800;margin-top:2mm;border-radius:3px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                 RATE NOT UPDATED — BALANCE PENDING
                 <div style="font-size:7.5pt;font-weight:600;margin-top:1px;">Deductions above total Rs. ${Math.round(n.totalDeductions).toLocaleString('en-IN')}</div>
               </div>`
            : n.dieselPending
            ? `<div style="background:#92400e;color:#fff;text-align:center;padding:5px;font-size:9.5pt;font-weight:800;margin-top:2mm;border-radius:3px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">DIESEL PENDING (FULL TANK)</div>`
            : `<div class="net-banner"><span>NET PAYABLE</span><span>Rs. ${Math.round(n.net).toLocaleString('en-IN')}</span></div>`}
      </div>

      <div class="sig-section">
        <div class="sig-box">Driver</div>
        <div class="sig-box">Receiver</div>
        <div class="digital-sig-box">
          <span class="digital-sig-title">Digitally Signed</span>
          <span class="digital-sig-text">${signedBy}</span>
          <span class="digital-sig-footer">System Verified</span>
        </div>
      </div>
    </div>`,
        });
        return;
    }
    // deductionRows already defined above

    let html = '';

    if (isBill) {
        // New Bill Format from sample
        html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${orgName} Bill</title>
    <style>
        body { background-color: #fff; display: flex; justify-content: center; align-items: flex-start; min-height: 100vh; margin: 0; font-family: Arial, sans-serif; padding: 5mm; }
        .receipt-container { width: 210mm; height: 148.5mm; background-color: #fdfdfb; border: 1px solid #000; padding: 5px; box-sizing: border-box; display: flex; flex-direction: column; color: #000; overflow: hidden; margin: 0 auto; }
        .header { display: flex; align-items: center; padding-bottom: 5px; }
        .header-left { width: 15%; display: flex; justify-content: center; align-items: center; }
        .header-center { width: 70%; text-align: center; }
        .header-right { width: 15%; font-size: 9px; font-weight: bold; align-self: flex-start; text-align: right; padding-top: 5px; padding-right: 5px; }
        .company-name { font-size: 21px; font-weight: 900; margin: 0 0 2px 0; letter-spacing: 0.5px; }
        .auth-badge { background-color: #000; color: #fff; display: inline-block; padding: 2px 15px; font-size: 11px; font-weight: bold; margin-bottom: 2px; }
        .address-text { font-size: 11px; font-weight: bold; margin: 1px 0; }
        .head-office { font-size: 10px; margin: 1px 0; }
        .info-grid { display: flex; border-top: 1px solid #000; border-bottom: 1px solid #000; font-size: 11px; font-weight: bold; }
        .info-col-1 { width: 20%; border-right: 1px solid #000; display: flex; flex-direction: column; }
        .info-col-1 > div { padding: 3px 5px; display: flex; align-items: center; }
        .info-col-1 > div:nth-child(1) { border-bottom: 1px solid #000; height: 18px; }
        .info-col-1 > div:nth-child(2) { border-bottom: 1px solid #000; flex-grow: 1; justify-content: center; text-align: center; }
        .info-col-1 > div:nth-child(3) { height: 18px; justify-content: center; }
        .info-col-2 { width: 50%; border-right: 1px solid #000; display: flex; flex-direction: column; }
        .info-col-2 > div { padding: 3px 5px; border-bottom: 1px solid #000; display: flex; align-items: flex-end; height: 16px; }
        .info-col-2 > div:last-child { border-bottom: none; justify-content: space-between; align-items: center; }
        .info-col-3 { width: 30%; display: flex; flex-direction: column; }
        .info-col-3 > div { padding: 3px 5px; border-bottom: 1px solid #000; display: flex; align-items: flex-end; height: 16px; }
        .info-col-3 > div:last-child { border-bottom: none; justify-content: space-between; align-items: center; }
        .line-fill { flex-grow: 1; border-bottom: 1px solid #000; margin-left: 5px; height: 10px; }
        .dotted-fill { flex-grow: 1; border-bottom: 1px dotted #000; margin-left: 5px; height: 10px; }
        .main-table { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: fixed; flex-grow: 1; }
        .main-table th, .main-table td { border: 1px solid #000; padding: 3px; }
        .main-table th { font-weight: bold; text-align: center; }
        .col-bags { width: 6%; } .col-desc { width: 24%; } .col-weight { width: 7%; } .col-rate { width: 8%; } .col-freight { width: 9.33%; } .col-remark { width: 17%; }
        .split-header { padding: 0 !important; } .split-header .top-part { border-bottom: 1px solid #000; padding: 2px; } .split-header .bottom-part { display: flex; justify-content: space-between; padding: 2px; }
        .body-row td { border-bottom: none; vertical-align: top; }
        .advance-cell { text-align: center; vertical-align: middle !important; font-size: 11px; font-weight: bold; }
        .billed-cell { text-align: center; vertical-align: middle !important; font-size: 14px; font-weight: bold; line-height: 1.2; }
        .desc-text { font-size: 10px; line-height: 1.5; }
        .remark-text { font-size: 10px; line-height: 2; }
        .footer { font-size: 8px; margin-top: 2px; line-height: 1.1; }
        .declaration { margin: 2px 0; text-align: left; }
        .service-tax-note { text-align: center; font-weight: bold; font-size: 9px; margin: 2px 0; }
        .hindi-note { margin: 2px 0; }
        .signatures { display: flex; justify-content: space-between; margin-top: 8px; font-size: 11px; font-weight: bold; padding: 0 10px; }
        @media print { body { padding: 0; background-color: #fff; } .receipt-container { margin: 0; } }
    </style>
</head>
<body>
    <div class="receipt-container">
        <div class="header">
            <div class="header-left">
               <img src="/krishna-logo.jpg" alt="Krishna Logo" style="max-width: 100%; max-height: 50px;">
            </div>
            <div class="header-center">
                <div class="company-name">${orgName}</div>
                <div class="auth-badge">Authorised Transport for : J.K. Super Cement Ltd.</div>
                <div class="address-text">Near Gaushala, Rewari Road, Jhajjar (Hr.)</div>
                <div class="address-text">Mob. : 9728284849, 9416319445</div>
                <div class="head-office">Head Office : Near Rao Gopal Dev Chowk, Narnaul Road, Rewari</div>
            </div>
            <div class="header-right">GSTIN : 06ARIPK9021C2Z2</div>
        </div>
        <div class="info-grid">
            <div class="info-col-1">
                <div>Consignor</div>
                <div>J.K. Super Cement Ltd.</div>
                <div>${v.type === 'Kosli_Bill' ? 'Kosli' : (v.type === 'Jajjhar_Bill' ? 'Jhajjar' : 'Bahadurgarh')}</div>
            </div>
            <div class="info-col-2">
                <div>M/s. <span style="margin-left: 10px; font-weight: normal; font-size: 13px;">${v.partyName || ''}</span>${v.partyName ? '' : '<div class="line-fill"></div>'}</div>
                <div><span style="font-size: 10px;">Party Code:</span> <span style="margin-left: 5px; font-weight: normal; font-size: 12px;">${v.partyCode || ''}</span>${v.partyCode ? '' : '<div class="line-fill" style="margin-left: 0;"></div>'}</div>
                <div><div class="line-fill" style="margin-left: 0;"></div></div>
                <div><span>S.T.L. No.</span><span>C.S.T. No.</span></div>
            </div>
            <div class="info-col-3">
                <div>Truck No. <span style="margin-left: 5px; font-weight: normal;">${v.truckNo || ''}</span>${v.truckNo ? '' : '<div class="dotted-fill"></div>'}</div>
                <div>From : ${v.type === 'Kosli_Bill' ? 'Kosli' : (v.type === 'Jajjhar_Bill' ? 'Jhajjar' : 'Bahadurgarh')}</div>
                <div>To <span style="margin-left: 5px; font-weight: normal;">${v.destination || ''}</span>${v.destination ? '' : '<div class="line-fill"></div>'}</div>
                <div><span>LR No. <span style="margin-left: 8px; font-weight: normal; font-size: 13px;">${v.lrNo || ''}</span></span><span style="font-weight: normal;">Date: ${v.date}</span></div>
            </div>
        </div>
        <table class="main-table">
            <thead>
                <tr>
                    <th rowspan="2" class="col-bags">No. of<br>Bags</th>
                    <th rowspan="2" class="col-desc">Description said to contain</th>
                    <th colspan="2">Actual Weight</th>
                    <th rowspan="2" class="col-rate">Rate</th>
                    <th colspan="3">FRIEGHT</th>
                    <th rowspan="2" class="col-remark">Remark</th>
                </tr>
                <tr>
                    <th class="col-weight">Qn.</th>
                    <th class="col-weight">Kg.</th>
                    <th class="col-freight split-header"><div class="top-part">FRIEGHT</div><div class="bottom-part"><span>Rs.</span><span>P.</span></div></th>
                    <th class="col-freight split-header"><div class="top-part">Paid</div><div class="bottom-part"><span>Rs.</span><span>P.</span></div></th>
                    <th class="col-freight split-header"><div class="top-part">To Pay</div><div class="bottom-part"><span>Rs.</span><span>P.</span></div></th>
                </tr>
            </thead>
            <tbody>
                ${(() => {
                const mats = (v.materials && v.materials.length > 0)
                    ? v.materials
                    : [{ type: v.materialName || 'CEMENT', bags: v.bags, weight: v.weight }];
                const rowspan = mats.length;
                return mats.map((mat, idx) => `
                    <tr class="body-row" style="height: ${Math.max(80, Math.floor(160 / rowspan))}px;">
                        <td style="text-align: center; font-size: 13px; border-bottom: ${idx < rowspan - 1 ? '1px dashed #ccc' : 'none'};">${mat.bags || ''}</td>
                        <td class="desc-text" style="border-bottom: ${idx < rowspan - 1 ? '1px dashed #ccc' : 'none'};">
                            CEMENT${mat.type ? ' - ' + mat.type : ''}<br>
                            Grade<br>
                            <b><i>J.K. Super Cement</i></b><br>
                            ${idx === 0 ? 'Bill No. : ' + (v.billNo || '') + '<br>Shipment No. :<br>D.I. No.' : ''}
                        </td>
                        <td colspan="2" style="text-align: center; font-size: 13px; border-bottom: ${idx < rowspan - 1 ? '1px dashed #ccc' : 'none'};">${parseFloat(mat.weight || 0).toFixed(2)} MT</td>
                        <td style="text-align: center; font-size: 12px; border-bottom: ${idx < rowspan - 1 ? '1px dashed #ccc' : 'none'};">${idx === 0 ? (v.rate || '') : ''}</td>
                        ${idx === 0 ? `
                        <td colspan="2" class="advance-cell" rowspan="${rowspan}">Advance = <br/>${n.dieselPending ? 'FULL (Pending)' : (!n.totalDeductions ? '—' : 'Rs.' + Math.round(n.totalDeductions).toLocaleString())}</td>
                        <td class="billed-cell" rowspan="${rowspan}">To<br>be<br>Billed<br/><br/>
                            <span style="font-size: 12px;">${n.dieselPending ? '—' : 'Rs.' + Math.round(n.net).toLocaleString()}</span>
                        </td>
                        <td class="remark-text" rowspan="${rowspan}">Driver Name<br>D.L. No.<br>Owner Permit No.<br>Permit No.<br>Address<br/><br/>${getPumpDisplay(v.pump) !== '—' ? 'Pump: ' + getPumpDisplay(v.pump) : ''}</td>
                        ` : ''}
                    </tr>`).join('');
            })()}
                <tr>
                    <td colspan="2" style="font-weight: bold; border-top: 1px solid #000; text-align: center;">Total</td>
                    <td colspan="2" style="border-top: 1px solid #000; text-align: center; font-weight: bold;">${v.weight || ''} MT</td>
                    <td style="border-top: 1px solid #000;"></td>
                    <td colspan="3" style="border-top: 1px solid #000; text-align: center; font-weight: bold;">Gross: Rs.${Math.round(n.gross).toLocaleString()}</td>
                    <td style="border-top: 1px solid #000;"></td>
                </tr>
            </tbody>
        </table>
        <div class="footer">
            <div class="declaration">*I/We declare that we have not taken credit of Excise Duty paid on inputs or capital goods or credit of Service Tax paid on Input Services used for providing of Goods by Road Services under the provision of Cenvat Credit Rule 2004*./ I/We also declare that we have not availed the benefit under notification No. 12/2003 ST2 - 16.8.2011</div>
            <div class="service-tax-note">Service Tax to be paid by Consignor</div>
            <div class="hindi-note">नोट : 1. बिल्टी की पहुंच 15 दिन के अन्दर की जावें, अन्यथा किरायें का 2% काटा जायेगा और एक माह के बाद पहुंच का किराया नहीं दिया जायेगा।<br>2. गाड़ी में रस्सा तिरपाल अनिवार्य है अन्यथा गाड़ी नहीं भरी जाएगी। All Disputes arising out of it shall have the Jurisdiction for Jhajjar</div>
            <div class="signatures">
                <div style="width: 30%;"></div>
                <div style="width: 30%; text-align: center;">Sign. of Driver</div>
                <div style="width: 40%; text-align: right; text-transform: uppercase;">Sign. of Clerk <b>for</b><br>${orgName}</div>
            </div>
        </div>
    </div>
    <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
</body>
</html>`;
    } else {
        // Counter slip for Dump / JK_Lakshmi / JK_Super (supports multi-delivery)
        const fmtRsP = (x) => 'Rs.' + Math.round(x).toLocaleString('en-IN');
        const hasDeliveries = v.deliveries && v.deliveries.length > 0;
        const totalWeight = hasDeliveries
            ? v.deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0), 0)
            : (parseFloat(v.weight) || 0);
        const totalBags = hasDeliveries
            ? v.deliveries.reduce((s, d) => s + (parseInt(d.bags) || 0), 0)
            : (parseInt(v.bags) || 0);

        // Seven columns across a 79mm roll would be unreadable, so each delivery
        // is a block of its own. The slip has no fixed height any more, so a
        // voucher with six destinations simply prints longer.
        const deliveryTableHTML = hasDeliveries ? `
<div class="dlv-list">
  ${v.deliveries.map(d => {
            const rowGross = (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0);
            return `<div class="dlv">
      <div class="dlv-top"><span class="dlv-lr">#${d.lrNo || '—'}</span><span class="dlv-dest">${d.destination || '—'}</span></div>
      ${d.partyName ? `<div class="dlv-party">${d.partyName}</div>` : ''}
      <div class="dlv-nums">
        <span><b>${parseFloat(d.weight || 0).toFixed(2)}</b> MT</span>
        <span><b>${d.bags || '—'}</b> bags</span>
        <span>@ ${d.rate || '—'}</span>
        <span class="dlv-gross">${rowGross > 0 ? fmtRsP(rowGross) : '—'}</span>
      </div>
    </div>`;
        }).join('')}
  <div class="dlv-total">
    <span>TOTAL · ${v.deliveries.length} dest.</span>
    <span>${totalWeight.toFixed(2)} MT · ${totalBags.toLocaleString('en-IN')} bags</span>
  </div>
</div>` : `
<div class="sec">
  <div class="line"><span class="lbl">Date</span><span class="val">${v.date}</span></div>
  <div class="line"><span class="lbl">Truck</span><span class="val">${v.truckNo}</span></div>
  <div class="line"><span class="lbl">Party</span><span class="val">${v.partyName || '—'}</span></div>
  <div class="line"><span class="lbl">Destination</span><span class="val">${v.destination || '—'}</span></div>
</div>
<div class="stat-row">
  <div class="stat"><div class="stat-k">Weight</div><div class="stat-v">${v.weight} MT</div></div>
  <div class="stat"><div class="stat-k">Bags</div><div class="stat-v">${v.bags}</div></div>
  <div class="stat"><div class="stat-k">Rate</div><div class="stat-v">${v.rate}/MT</div></div>
</div>`;

        openReceiptWindow({
            archive,
            title: `Voucher #${v.lrNo || (hasDeliveries ? v.deliveries.map(d => d.lrNo).join(',') : '')}`,
            fontSize: '10px',
            styles: `
.hd { text-align: center; border-bottom: 1.5px solid #000; padding-bottom: 4px; margin-bottom: 5px; }
.hd h1 { font-size: 15px; font-weight: 900; margin: 0; }
.hd p { font-size: 9.5px; font-weight: 800; margin: 1px 0; }
.ref-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; margin-bottom: 5px; }
.ref-lr { display: inline-block; border: 1.5px solid #000; padding: 2px 10px; font-size: 13px; font-weight: 900; }
.ref-meta { text-align: right; font-size: 9.5px; font-weight: 800; }
.ref-type { font-weight: 900; text-transform: uppercase; }
.sec { border: 1.5px solid #000; border-radius: 3px; margin-bottom: 5px; overflow: hidden; }
.line { display: flex; justify-content: space-between; align-items: center; gap: 6px; padding: 3.5px 6px; border-bottom: 1px solid #000; }
.line:last-child { border-bottom: none; }
.lbl { font-weight: 800; font-size: 9px; text-transform: uppercase; flex-shrink: 0; }
.val { font-weight: 900; text-align: right; font-size: 10.5px; }
.stat-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3px; margin-bottom: 5px; }
.stat { border: 1px solid #000; padding: 3px 4px; text-align: center; }
.stat-k { font-size: 7.5px; font-weight: 800; text-transform: uppercase; }
.stat-v { font-size: 12.5px; font-weight: 900; }
.dlv-list { margin-bottom: 5px; }
.dlv { border: 1px solid #000; border-radius: 3px; padding: 3px 5px; margin-bottom: 3px; }
.dlv-top { display: flex; justify-content: space-between; gap: 6px; font-weight: 900; }
.dlv-lr { font-size: 11.5px; }
.dlv-dest { text-align: right; }
.dlv-party { font-size: 9.5px; font-weight: 800; }
.dlv-nums { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px; font-size: 9.5px; font-weight: 800; margin-top: 2px; }
.dlv-gross { font-weight: 900; }
.dlv-total { display: flex; justify-content: space-between; gap: 6px; font-weight: 900; font-size: 10px; border-top: 1.5px solid #000; padding-top: 3px; }
.money { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
.money td { padding: 3px 4px; font-weight: 800; }
.money .amt { text-align: right; font-weight: 900; white-space: nowrap; vertical-align: top; }
.money .note { display: block; font-size: 8.5px; font-weight: 600; line-height: 1.2; margin-top: 0.5px; }
.money .ded td { border-bottom: 1px solid #000; }
.money .tot td { border-top: 1.5px solid #000; font-weight: 900; }
.net {
  display: flex; justify-content: space-between; gap: 6px;
  padding: 5px 8px; background: #000; color: #fff;
  font-size: 12px; font-weight: 900; margin: 4px 0;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.net-pending {
  background: #92400e; color: #fff; text-align: center; padding: 5px;
  font-size: 10px; font-weight: 800; margin: 4px 0;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.pump { font-size: 9.5px; font-weight: 800; text-align: center; margin-bottom: 3px; }
.sig-foot { margin-top: auto; }
.sig { display: flex; justify-content: space-between; gap: 6px; padding-top: 12px; }
.sig div { flex: 1; text-align: center; font-size: 9px; font-weight: 900; border-top: 1.5px solid #000; padding-top: 3px; }
.signed { margin-top: 6px; border: 1.5px solid #000; border-radius: 3px; padding: 3px 6px; text-align: center; }
.signed-k { display: block; font-size: 7px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; }
.signed-v { display: block; font-family: 'Brush Script MT', cursive, sans-serif; font-size: 15px; font-weight: 700; line-height: 1.1; }
.signed-f { display: block; font-size: 7px; font-weight: 700; }`,
            body: `
<div class="container">
  <div>
    <div class="hd">
      <h1>VIKAS GOODS TRANSPORT</h1>
      <p>Jharli, Jhajjar | 9416319445</p>
    </div>

    <div class="ref-row">
      <div>
        ${hasDeliveries
                    ? `<div class="ref-lr">LR ${lrLabel}</div>
           ${v.lrNo ? `<div style="font-size:9px;font-weight:800;margin-top:2px">Ref: #${v.lrNo}</div>` : ''}`
                    : `<div class="ref-lr">LR ${lrLabel}</div>`}
      </div>
      <div class="ref-meta">
        <div class="ref-type">${v.type ? v.type.replace(/_/g, ' ') : ''}</div>
        <div style="margin-top:1px"><b>Date:</b> ${v.date}</div>
        <div><b>Truck:</b> ${v.truckNo}</div>
      </div>
    </div>

    ${deliveryTableHTML}

    <table class="money">
      <tr><td style="font-weight:700">Gross ${rateMissing ? '(rate not entered)' : hasDeliveries ? `(${v.deliveries.length} destinations)` : `(${v.weight}×${v.rate})`}</td><td class="amt">${rateMissing ? '—' : fmtRsP(n.gross)}</td></tr>
      ${deductionRows.map(d => `<tr class="ded"><td>${d.lbl}${d.note ? `<span class="note">${d.note}</span>` : ''}</td><td class="amt">- ${n.dieselPending && d.lbl === 'Diesel Advance' ? 'FULL' : fmtRsP(d.val)}</td></tr>`).join('')}
      ${deductionRows.length > 0 && !n.dieselPending ? `<tr class="tot"><td>Total Deductions</td><td class="amt">- ${fmtRsP(n.totalDeductions)}</td></tr>` : ''}
    </table>

    ${rateMissing
                    ? `<div class="net-pending">RATE NOT UPDATED — BALANCE PENDING</div>`
                    : n.dieselPending
                    ? `<div class="net-pending">NET PAYABLE — DIESEL PENDING (FULL TANK)</div>`
                    : `<div class="net"><span>NET PAYABLE</span><span>${fmtRsP(n.net)}</span></div>`}

    ${getPumpDisplay(v.pump) !== '—' ? `<div class="pump">Pump: ${getPumpDisplay(v.pump)}</div>` : ''}
  </div>

  <div class="sig-foot">
    <div class="sig">
      <div>Driver</div>
      <div>Accountant</div>
    </div>
    <div class="signed">
      <span class="signed-k">Digitally Signed</span>
      <span class="signed-v">${signedBy}</span>
      <span class="signed-f">System Verified</span>
    </div>
  </div>
</div>`,
        });
        return;
    }

    printHtml(html, { width: 850, height: 600, archive });
}

/* ── Extra money ── */

/**
 * The extra-money lines on a voucher: an amount and its own remark, as many as
 * the trip needed. Grease at one dhaba and a puncture tip at the next are two
 * different things, and lumping them into one figure loses the reason for both.
 *
 * Shared by the create form and the edit modal. The edit modal went a long time
 * with no expense fields at all, which is what a second copy of a form invites.
 */
function ExtraMoneyList({ extras = [], onChange }) {
    const update = (i, k, val) => onChange(extras.map((e, j) => (j === i ? { ...e, [k]: val } : e)));
    const add = () => onChange([...extras, { amount: '', remark: '' }]);
    const remove = (i) => onChange(extras.filter((_, j) => j !== i));
    const total = extrasTotal(extras);

    return (
        <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>💰 Extra Money</span>
                {total > 0 && <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#f59e0b', marginLeft: 'auto' }}>₹{total.toLocaleString('en-IN')}</span>}
            </div>

            {extras.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input className="fi" type="number" placeholder="₹0" value={e.amount ?? ''}
                        onChange={ev => update(i, 'amount', ev.target.value)}
                        style={{ width: '110px', flexShrink: 0 }} />
                    <input className="fi" type="text" placeholder="Reason — e.g. grease ke paise" value={e.remark || ''}
                        onChange={ev => update(i, 'remark', ev.target.value)}
                        style={{ flex: 1, minWidth: 0 }} />
                    <button type="button" onClick={() => remove(i)} title="Remove this line"
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '7px', color: '#f43f5e', cursor: 'pointer', padding: '8px', display: 'flex', flexShrink: 0 }}>
                        <X size={14} />
                    </button>
                </div>
            ))}

            <button type="button" onClick={add}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'none', border: '1px dashed var(--border)', borderRadius: '8px', padding: '9px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11.5px', fontWeight: 700 }}>
                <Plus size={13} /> {extras.length ? 'Add another' : 'Add extra money'}
            </button>
        </div>
    );
}

/* ── Edit Modal ── */
function EditModal({ v, onClose, onSave, partySuggestions = [], vehicleNumbers = [], isVGTCTruck = () => false, pumpOptions = [], driverOptions = [] }) {
    const [form, setForm] = useState({
        // Older vouchers pre-date the driver field and have only a name, so fall
        // back to matching that name against the roster to pre-select the row.
        driverId: v.driverId || driverOptions.find(d => d.name === v.driverName)?.id || '',
        driverName: v.driverName || '',
        lrNo: v.lrNo, date: v.date, truckNo: v.truckNo, destination: v.destination || '', partyName: v.partyName || '',
        weight: v.weight, bags: v.bags, rate: v.rate, pump: getAllowedPump(v.pump, v.advanceDiesel, pumpOptions),
        advanceDiesel: v.advanceDiesel || '', advanceCash: v.advanceCash || '',
        advanceOnline: v.advanceOnline || '', hasCommission: !!v.hasCommission,
        billNo: v.billNo || '', partyCode: v.partyCode || '', materialName: v.materialName || '',
        startKm: v.startKm || '', endKm: v.endKm || '',
        // A voucher covering several LRs prices each drop separately. Editing has
        // to reach them, or the rate shown on the sheet cannot be corrected.
        deliveries: (v.deliveries || []).map(d => ({ ...d })),
        tyrePuncture: v.tyrePuncture || '',
        // Older vouchers split this across tyreGreasing and tyreAir, and getNet
        // still adds all three. Show the sum, or the field reads empty on a
        // voucher that is plainly deducting for greasing.
        tyreGreasingAir: (parseFloat(v.tyreGreasingAir) || 0) + (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0) || '',
        extras: readExtras(v),
    });
    const [saving, setSaving] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const S = (k, val) => setForm(f => ({ ...f, [k]: val }));
    const setPartyName = (value) => S('partyName', resolvePartyName(value, partySuggestions));
    const isSelf = isVGTCTruck(form.truckNo);

    const isMultiLr = form.deliveries.length > 0;
    const setDelivery = (i, key, val) =>
        S('deliveries', form.deliveries.map((d, j) => (j === i ? { ...d, [key]: val } : d)));
    const deliveriesGross = form.deliveries.reduce(
        (s, d) => s + (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0), 0);

    // Validate BEFORE the confirm modal opens — not after the user already confirmed
    const requestSave = () => {
        if (markInvalidFields(modalRef.current)) return;
        if (isBillVoucherType(v.type) && !String(form.billNo || '').trim()) return;
        // Same rule as the create form: diesel needs a real station or the
        // pump ledger gets an unbillable "None" row.
        const pumpProblem = dieselPumpProblem(form.advanceDiesel, form.isFullTank, form.pump, pumpOptions);
        if (pumpProblem) { alert(pumpProblem); return; }
        setIsConfirming(true);
    };

    const modalRef = useFormShortcuts({
        onSave: requestSave,
        onCancel: onClose,
        enabled: !isConfirming,
    });

    useEffect(() => {
        setForm(f => {
            const nextPump = getAllowedPump(f.pump, f.advanceDiesel, pumpOptions);
            return f.pump === nextPump ? f : { ...f, pump: nextPump };
        });
    }, [form.advanceDiesel, pumpOptions]);

    const executeSave = async () => {
        setSaving(true); setIsConfirming(false);
        // A multi-LR voucher's weight and total come from the drops. Running
        // getCalc on the blank top-level weight would have written total: 0 and
        // wiped the freight — which is why editing a rate here appeared not to
        // save: the number went in and the figure everything else reads went to
        // nothing.
        const totalWeight = isMultiLr
            ? form.deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0), 0)
            : form.weight;
        const calc = isMultiLr
            ? {
                ...getCalc(totalWeight, 0, form.hasCommission),
                total: String(Math.round(deliveriesGross)),
                weight: String(totalWeight),
                bags: String(form.deliveries.reduce((s, d) => s + (parseInt(d.bags) || 0), 0)),
            }
            : getCalc(form.weight, form.rate, form.hasCommission);
        try {
            await ax.patch(API_V + '/' + v.id, {
                ...form,
                partyName: resolvePartyName(form.partyName, partySuggestions),
                ...calc,
                // The greasing field above holds the sum of the legacy pair, so
                // clear them or the old amounts get deducted a second time.
                tyreGreasing: '', tyreAir: '',
                // Deliberately not blanking the tyre fields for a market truck:
                // isSelf reads a vehicle list that loads asynchronously, and a
                // modal opened before it arrives would wipe a real charge.
                ...extrasPayload(form.extras),
            });
            onSave();
        } catch { alert('Update failed'); } finally { setSaving(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
            <motion.div ref={modalRef} initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ width: '94%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.55)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={16} color="#10b981" /></div>
                        <div><div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>Edit Voucher</div><div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '2px' }}>
                            {v.deliveries?.length > 0
                                ? `LR ${v.deliveries.map(d => '#' + d.lrNo).filter(Boolean).join(', ')}`
                                : `LR #${v.lrNo}`}
                        </div></div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex' }}><X size={18} /></button>
                </div>
                <div className="fg fg-2" style={{ padding: '20px 22px', gap: '12px' }}>
                    <div className="field-h">
                        <label>LR No. *</label>
                        <input className="fi" type="number" value={form.lrNo} onChange={e => S('lrNo', e.target.value)} required />
                    </div>
                    <div className="field-h">
                        <label>Date *</label>
                        <input className="fi" type="date" value={form.date} onChange={e => S('date', e.target.value)} required />
                    </div>
                    <div className="field-h">
                        <label>Truck No. *</label>
                        <div style={{ position: 'relative', width: '100%' }}>
                            <input className="fi" type="text" value={form.truckNo} onChange={e => S('truckNo', cleanTruckNo(e.target.value))} list={`voucher-truck-list-${v.id}`} required />
                            <datalist id={`voucher-truck-list-${v.id}`}>
                                {vehicleNumbers.map(no => <option key={no} value={no} />)}
                            </datalist>
                        </div>
                    </div>
                    <div className="field-h">
                        <label>Driver</label>
                        <select
                            className="fi"
                            value={form.driverId}
                            onChange={e => {
                                const d = driverOptions.find(x => x.id === e.target.value);
                                setForm(f => ({ ...f, driverId: d?.id || '', driverName: d?.name || '' }));
                            }}
                        >
                            <option value="">— not recorded —</option>
                            {driverOptions.map(d => (
                                <option key={d.id} value={d.id}>{d.name}{d.vehicleNo ? ` (${d.vehicleNo})` : ''}</option>
                            ))}
                        </select>
                    </div>
                    <div className="field-h">
                        <label>Destination</label>
                        <input className="fi" type="text" value={form.destination} onChange={e => S('destination', e.target.value)} />
                    </div>
                    <div className="field-h">
                        <label>Party Name</label>
                        <div style={{ position: 'relative', width: '100%' }}>
                            <input className="fi" type="text" value={form.partyName} onChange={e => setPartyName(e.target.value)} list={`voucher-party-list-${v.id}`} />
                            <datalist id={`voucher-party-list-${v.id}`}>
                                {partySuggestions.map(name => <option key={name} value={name} />)}
                            </datalist>
                        </div>
                    </div>
                    {(v.type === 'Kosli_Bill' || v.type === 'Jajjhar_Bill' || v.type === 'Bahadurgarh_Bill') && (
                        <>
                            <div className="field-h">
                                <label>Party Code</label>
                                <input className="fi" type="text" value={form.partyCode} onChange={e => S('partyCode', e.target.value)} />
                            </div>
                            <div className="field-h">
                                <label>Bill No *</label>
                                <input className="fi" type="text" value={form.billNo} onChange={e => S('billNo', e.target.value)} required />
                            </div>
                            <div className="field-h">
                                <label>Material Name</label>
                                <input className="fi" type="text" value={form.materialName} onChange={e => S('materialName', e.target.value)} />
                            </div>
                        </>
                    )}
                    <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0', gridColumn: '1 / -1' }} />

                    {/* One voucher, several LRs: each drop has its own destination
                        and its own rate, so each is priced on its own line. The
                        single weight/rate below would be meaningless here. */}
                    {isMultiLr && (
                        <div style={{ gridColumn: '1 / -1' }}>
                            <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                                {form.deliveries.length} LRs on this voucher
                            </div>
                            <div className="tbl-wrap">
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                    <thead><tr>
                                        {['LR No.', 'Destination', 'Party', 'Bags', 'Weight (MT)', 'Rate', 'Gross'].map(h => (
                                            <th key={h} style={{ padding: '6px 8px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr></thead>
                                    <tbody>
                                        {form.deliveries.map((d, i) => {
                                            const g = (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0);
                                            const cell = (k, w, type = 'text') => (
                                                <input className="fi" type={type} step="any" value={d[k] ?? ''}
                                                    onChange={e => setDelivery(i, k, e.target.value)}
                                                    style={{ width: w, padding: '4px 7px', fontSize: '12px', height: '30px' }} />
                                            );
                                            return (
                                                <tr key={i}>
                                                    <td style={{ padding: '4px 8px' }}>{cell('lrNo', '70px')}</td>
                                                    <td style={{ padding: '4px 8px' }}>{cell('destination', '120px')}</td>
                                                    <td style={{ padding: '4px 8px' }}>{cell('partyName', '120px')}</td>
                                                    <td style={{ padding: '4px 8px' }}>{cell('bags', '70px', 'number')}</td>
                                                    <td style={{ padding: '4px 8px' }}>{cell('weight', '80px', 'number')}</td>
                                                    <td style={{ padding: '4px 8px' }}>{cell('rate', '75px', 'number')}</td>
                                                    <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 800, color: g > 0 ? 'var(--accent)' : 'var(--warn)', whiteSpace: 'nowrap' }}>
                                                        {g > 0 ? 'Rs.' + Math.round(g).toLocaleString('en-IN') : 'rate?'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: 800, color: 'var(--text)' }}>
                                Total gross: {deliveriesGross > 0
                                    ? 'Rs.' + Math.round(deliveriesGross).toLocaleString('en-IN')
                                    : <span style={{ color: 'var(--warn)' }}>rate not entered</span>}
                            </div>
                        </div>
                    )}

                    {!isMultiLr && (
                    <div className="field-h">
                        <label>Weight (MT)</label>
                        <input className="fi" type="number" step="0.01" value={form.weight}
                            onChange={e => {
                                const val = e.target.value;
                                setForm(f => ({ ...f, weight: val, bags: val ? Math.round(parseFloat(val) * 20) : '' }));
                            }}
                        />
                    </div>
                    )}
                    {!isMultiLr && (
                    <div className="field-h">
                        <label>Bags</label>
                        <input className="fi" type="number" value={form.bags}
                            onChange={e => {
                                const val = e.target.value;
                                setForm(f => ({ ...f, bags: val, weight: val ? (parseFloat(val) * 0.05).toFixed(2) : '' }));
                            }}
                        />
                    </div>
                    )}
                    {!isMultiLr && (
                    <div className="field-h">
                        <label>Rate (Rs/MT)</label>
                        <input className="fi" type="number" value={form.rate} onChange={e => S('rate', e.target.value)} />
                    </div>
                    )}
                    <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0', gridColumn: '1 / -1' }} />
                    <div className="field-h">
                        <label>Diesel Advance</label>
                        <input className="fi" type="text" value={form.advanceDiesel} onChange={e => S('advanceDiesel', e.target.value)} />
                    </div>
                    <div className="field-h">
                        <label>Cash Advance</label>
                        <input className="fi" type="number" value={form.advanceCash} onChange={e => S('advanceCash', e.target.value)} />
                    </div>
                    <div className="field-h">
                        <label>Online Advance</label>
                        <input className="fi" type="number" value={form.advanceOnline} onChange={e => S('advanceOnline', e.target.value)} />
                    </div>
                    <div className="field-h">
                        <label>Fuel Station</label>
                        <select className="fi" value={form.pump} onChange={e => S('pump', e.target.value)}>
                            {pumpOptions.map(p => <option key={p}>{p}</option>)}
                        </select>
                    </div>
                    <div className="field-h">
                        <label>Commission</label>
                        <div style={{ display: 'flex', alignItems: 'center', height: '40px' }}>
                            <input type="checkbox" id="ec" checked={form.hasCommission} onChange={e => S('hasCommission', e.target.checked)} style={{ marginRight: '8px' }} />
                            <label htmlFor="ec" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-sub)', textTransform: 'none', width: 'auto' }}>Rs.20/MT</label>
                        </div>
                    </div>
                    {isSelf && (
                        <div className="field-h">
                            <label><Gauge size={11} style={{ marginRight: '4px' }} /> Odometer</label>
                            <input className="fi" type="number" value={form.endKm} onChange={e => S('endKm', e.target.value)} />
                        </div>
                    )}

                    {/* Same rule as the create form: tyre work on our own trucks,
                        extra money on any of them. These were missing here entirely,
                        so an expense entered at creation could not be corrected. */}
                    <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0', gridColumn: '1 / -1' }} />
                    {isSelf && (
                        <>
                            <div className="field-h">
                                <label>🔧 Tyre Puncture</label>
                                <input className="fi" type="number" placeholder="₹0" value={form.tyrePuncture} onChange={e => S('tyrePuncture', e.target.value)} />
                            </div>
                            <div className="field-h">
                                <label>⚙️ Tyre Greasing & Air</label>
                                <input className="fi" type="number" placeholder="₹0" value={form.tyreGreasingAir} onChange={e => S('tyreGreasingAir', e.target.value)} />
                            </div>
                        </>
                    )}
                    <ExtraMoneyList extras={form.extras} onChange={list => S('extras', list)} />
                </div>
                <div style={{ display: 'flex', gap: '10px', padding: '14px 22px', borderTop: '1px solid var(--border)', justifyContent: 'flex-end' }}>
                    <button className="btn btn-g" onClick={onClose} disabled={saving}>Cancel</button>
                    <button className="btn btn-p" onClick={requestSave} disabled={saving} title="Save Changes">{saving ? <Loader2 size={14} className="spin" /> : <><Check size={14} /> Save Changes</>}</button>
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

/* ══════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════ */
export default function VoucherModule({ role = 'user', initialTab, lockedType, permissions = {}, brand }) {
    const { user } = useAuth();
    const org = user?.org || {};
    // Whoever is logged in signs the vouchers they print.
    const signedBy = user?.name || user?.username || 'VGTC';
    // canEdit: checks brand-specific voucher key and generic fallback
    const voucherKey = brand === 'jklakshmi' ? 'voucher_jkl' : 'voucher_jksuper';
    const canEdit = role === 'admin'
        || permissions?.[voucherKey] === 'edit'
        || permissions?.voucher === 'edit'
        || permissions?.bill_kosli === 'edit'
        || permissions?.bill_jhajjar === 'edit';
    // For non-VGTC orgs (brand='main'), always use 'main' type — no sub-tabs
    const isGeneric = brand === 'main';
    const [vType, setVType] = useState(isGeneric ? 'main' : (lockedType || initialTab || getSticky('voucher.type', brand === 'bahadurgarh' ? 'Bahadurgarh_Bill' : 'Kosli_Bill')));

    useEffect(() => { if (lockedType) setVType(lockedType); }, [lockedType]);

    const [vouchers, setVouchers] = useState([]);
    const [tableLoading, setTableLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lrMaterials, setLrMaterials] = useState([]);
    const [lrAlreadyUsed, setLrAlreadyUsed] = useState(false);
    const [editVoucher, setEditVoucher] = useState(null);
    const [delVoucher, setDelVoucher] = useState(null);
    // Opens on the list. The form was taking the whole first screen on a module
    // people mostly come to in order to look something up.
    const [formOpen, setFormOpen] = useState(false);
    const [isConfirmingSave, setIsConfirmingSave] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    // Filters
    const [filters, setFilters] = useState({});
    const [sortCol, setSortCol] = useState('date');
    const [sortDir, setSortDir] = useState('desc');

    const handleFilterChange = (key, val) => {
        setFilters(f => ({ ...f, [key]: val }));
        setCurrentPage(1);
    };

    const [profiles, setProfiles] = useState([]);
    const pumpOptions = useMemo(() => {
        const names = profiles
            .filter(p => p.type?.toLowerCase() === 'pump')
            .map(p => p.name);
        return [NONE_PUMP, ...new Set(names)];
    }, [profiles]);

    // Recording who actually drove is what lets attendance be derived instead of
    // marked by hand — see server/services/attendanceService.js.
    const driverOptions = useMemo(
        () => profiles
            .filter(p => p.type === 'Driver' && !p.dateExit)
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
        [profiles]
    );

    /** The driver a truck is normally assigned to, used to pre-fill the field. */
    const defaultDriverForTruck = useCallback((truckNo) => {
        const key = cleanTruckNo(truckNo);
        if (!key) return null;
        return driverOptions.find(d => cleanTruckNo(d.vehicleNo) === key) || null;
    }, [driverOptions]);

    const [form, setForm] = useState({
        lrNo: '', date: getSticky('voucher.date', new Date().toISOString().split('T')[0]),
        driverId: '', driverName: '',
        truckNo: '', destination: '', partyName: '', weight: '', bags: '',
        rate: '', pump: NONE_PUMP, advanceDiesel: '', advanceCash: '', advanceOnline: '',
        hasCommission: false, isFullTank: false,
        startKm: '', endKm: '', billNo: '', partyCode: '', materialName: '',
        materials: [],
        tyrePuncture: '', tyreGreasingAir: '', extras: [],
    });
    const [showVehicleExpenses, setShowVehicleExpenses] = useState(false);

    // Must be declared before deliveries state (used in useEffect dependency)
    const isFactory = vType === 'JK_Super' || vType === 'JK_Lakshmi';

    // Multi-delivery state (JK_Super / JK_Lakshmi only)
    const [deliveries, setDeliveries] = useState([{ ...EMPTY_DELIVERY }]);

    const updateDelivery = (idx, key, val) => {
        setDeliveries(d => d.map((row, i) => {
            if (i !== idx) return row;
            const updated = { ...row, [key]: val };
            // Auto-compute bags when weight changes and vice-versa
            if (key === 'weight' && val) updated.bags = String(Math.round(parseFloat(val) * 20));
            if (key === 'bags' && val) updated.weight = (parseFloat(val) * 0.05).toFixed(2);
            return updated;
        }));
    };
    const removeDelivery = (idx) => setDeliveries(d => d.filter((_, i) => i !== idx));
    const addDelivery = () => setDeliveries(d => [...d, { ...EMPTY_DELIVERY }]);

    const deliveryTotals = useMemo(() => {
        const totalWeight = deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0), 0);
        const totalBags = deliveries.reduce((s, d) => s + (parseInt(d.bags) || 0), 0);
        const totalGross = deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0), 0);
        return { totalWeight, totalBags, totalGross };
    }, [deliveries]);

    // Reset deliveries when switching to/from factory type
    useEffect(() => {
        if (!isFactory) setDeliveries([{ ...EMPTY_DELIVERY }]);
    }, [isFactory]);

    const [lastKmInfo, setLastKmInfo] = useState(null); // { endKm, lrNo, date }
    const [fetchingKm, setFetchingKm] = useState(false);
    const [vgtcTrucks, setVgtcTrucks] = useState(new Set()); // truck numbers owned by Vikas Goods Transport
    const [vehicleNumbers, setVehicleNumbers] = useState([]);

    // Fetch vehicle registry and profiles
    const refreshData = useCallback(() => {
        ax.get('/vehicles').then(r => {
            const numbers = [...new Set((r.data || []).map(v => cleanTruckNo(v.truckNo)).filter(Boolean))].sort();
            const vgtcSet = new Set(
                r.data
                    .filter(v => (v.ownerName || '').toLowerCase().includes('vikas') || v.ownershipType === 'self')
                    .map(v => cleanTruckNo(v.truckNo))
            );
            setVehicleNumbers(numbers);
            setVgtcTrucks(vgtcSet);
        }).catch(() => { });

        ax.get('/profiles').then(r => setProfiles(r.data || [])).catch(() => { });
    }, []);

    useEffect(() => {
        refreshData();
    }, [refreshData]);

    useEffect(() => {
        if (formOpen) refreshData();
    }, [formOpen, refreshData]);

    const isVGTCTruck = (truckNo) => vgtcTrucks.has(cleanTruckNo(truckNo));
    const isSelfTruck = isVGTCTruck(form.truckNo);
    // Tyre work only counts towards the total when it is actually on offer.
    const formExpenseTotal = (isSelfTruck ? (parseFloat(form.tyrePuncture) || 0) + (parseFloat(form.tyreGreasingAir) || 0) : 0)
        + extrasTotal(form.extras);

    // Update tab when initialTab prop changes from sidebar navigation
    useEffect(() => {
        if (initialTab) setVType(initialTab);
    }, [initialTab]);

    useEffect(() => {
        fetchVouchers();
        setCurrentPage(1);
    }, [vType]);

    const fetchVouchers = async () => {
        try { setVouchers((await ax.get(API_V + '/' + vType)).data); } catch { }
        finally { setTableLoading(false); }
    };

    const knownPartyNames = useMemo(() => buildPartySuggestions(
        vouchers.map(v => v.partyName),
        lrMaterials.map(m => m.partyName)
    ), [vouchers, lrMaterials]);

    // Collect ALL used LR numbers from existing vouchers (top-level + delivery rows)
    const usedLRSet = useMemo(() => {
        const s = new Set();
        vouchers.forEach(v => {
            // top-level lrNo (could be comma-separated for old multi-lr vouchers)
            if (v.lrNo) String(v.lrNo).split(',').map(x => x.trim()).filter(Boolean).forEach(lr => s.add(lr));
            // delivery-level lrNos
            (v.deliveries || []).forEach(d => { if (d.lrNo) s.add(String(d.lrNo).trim()); });
        });
        return s;
    }, [vouchers]);

    // For factory types: check which delivery rows have duplicate LRs
    const [dupLRModal, setDupLRModal] = useState(null); // { lrNos: [...] } — shown on save attempt

    // Factory types: compute next LR number from existing voucher list
    // Dump & Bill types: user enters LR from loading receipt (no auto-number)
    // isFactory declared earlier (before deliveries state) to avoid TDZ
    const nextLrNo = useMemo(() => {
        if (!isFactory) return '';
        if (vouchers.length === 0) return '1';
        const max = Math.max(...vouchers.map(v => parseInt(v.lrNo) || 0));
        return String(max + 1);
    }, [isFactory, vouchers]);

    // Auto-fill LR No for factory types, clear for dump/bill types
    useEffect(() => {
        if (isFactory) {
            setForm(f => ({ ...f, lrNo: nextLrNo }));
            setLrAlreadyUsed(false);
        } else {
            setForm(f => ({ ...f, lrNo: '' }));
            setLrAlreadyUsed(false);
        }
    }, [nextLrNo, isFactory]);

    /* Auto-fetch last km when truckNo changes — for VGTC trucks across all voucher types */
    const fetchLastKm = useCallback(async (truck) => {
        if (!truck || !isVGTCTruck(truck)) { setLastKmInfo(null); return; }
        setFetchingKm(true);
        try {
            const { data } = await ax.get(`/mileage/last-km/${encodeURIComponent(truck)}`);
            setLastKmInfo(data.endKm ? data : null);
            if (data.endKm) setForm(f => ({ ...f, startKm: String(data.endKm) }));
            else setForm(f => ({ ...f, startKm: '' }));
        } catch { setLastKmInfo(null); }
        finally { setFetchingKm(false); }
    }, [vgtcTrucks]);

    /* LR search — Dump & Bill types auto-fetch from loading receipts */
    /* JK_Super and JK_Lakshmi are factory vouchers — no LR fetch, independent numbering */
    const handleLrSearch = async val => {
        setForm(f => ({ ...f, lrNo: val }));
        setLrAlreadyUsed(false);
        setLrMaterials([]);
        if (!val) return;

        // Factory vouchers — only check for duplicates, no LR fetch
        if (vType === 'JK_Super' || vType === 'JK_Lakshmi') {
            const alreadyUsed = vouchers.some(v => {
                if (!v.lrNo) return false;
                return String(v.lrNo).split(',').map(s => s.trim()).includes(val.trim());
            });
            if (alreadyUsed) setLrAlreadyUsed(true);
            return;
        }

        const lrNumbers = val.split(',').map(s => s.trim()).filter(Boolean);
        if (lrNumbers.length === 0) return;

        // Check if ANY of these LRs are already assigned to an existing voucher of the same type
        const alreadyUsed = vouchers.some(v => {
            if (!v.lrNo) return false;
            const vLrs = String(v.lrNo).split(',').map(s => s.trim());
            return lrNumbers.some(lr => vLrs.includes(lr));
        });

        if (alreadyUsed) {
            setLrAlreadyUsed(true);
            return;
        }

        // Determine LR endpoint based on voucher type (dump/bill)
        let lrEndpoint;
        if (vType === 'Kosli_Bill') lrEndpoint = '/kosli/lr';
        else if (vType === 'Jajjhar_Bill') lrEndpoint = '/jhajjar/lr';
        else if (vType === 'Bahadurgarh_Bill') lrEndpoint = '/bahadurgarh/lr';
        else if (brand === 'jklakshmi' || brand === 'jkl') lrEndpoint = '/jkl/lr';
        else lrEndpoint = '/lr';

        // Fetch LR details from the correct receipts collection
        try {
            const all = (await ax.get(lrEndpoint)).data;
            const rows = all.filter(l => lrNumbers.includes(String(l.lrNo)));
            if (rows.length > 0) {
                setLrMaterials(rows);
                const tw = rows.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0);
                const tb = rows.reduce((s, r) => s + (parseInt(r.totalBags) || 0), 0);
                const truck = rows[0].truckNo || '';
                // Aggregate all materials into an array for multi-material bill support
                const materialsData = rows.map(r => ({
                    type: r.material || '',
                    bags: parseInt(r.totalBags) || 0,
                    weight: parseFloat(r.weight) || 0
                }));
                const combinedMaterialName = [...new Set(materialsData.map(m => m.type).filter(Boolean))].join(', ');
                const combinedPartyName = [...new Set(rows.map(r => r.partyName).filter(Boolean))].join(' & ');
                const combinedPartyCode = [...new Set(rows.map(r => r.partyCode).filter(Boolean))].join(', ');
                const combinedDestination = [...new Set(rows.map(r => r.destination).filter(Boolean))].join(', ');

                const assignedDriver = defaultDriverForTruck(truck);
                setForm(f => ({
                    ...f,
                    truckNo: truck,
                    ...(f.driverId ? {} : { driverId: assignedDriver?.id || '', driverName: assignedDriver?.name || '' }),
                    date: rows[0].date || f.date,
                    weight: tw.toFixed(2),
                    bags: String(tb),
                    destination: combinedDestination || f.destination,
                    partyName: combinedPartyName || f.partyName,
                    partyCode: combinedPartyCode || f.partyCode,
                    materialName: combinedMaterialName,
                    materials: materialsData
                }));
                // Fetch last km for the auto-filled truck
                if (truck) fetchLastKm(truck);
            }
        } catch (err) { console.error(err); }
    };


    // When user manually changes truckNo (not via LR auto-fill), also fetch last km
    const handleTruckNoChange = (val) => {
        const clean = cleanTruckNo(val);
        const assigned = defaultDriverForTruck(clean);
        setForm(f => ({
            ...f,
            truckNo: clean,
            // Pre-fill the truck's usual driver, but never overwrite a driver the
            // user has already picked — a relief driver is exactly the case this
            // field exists for.
            ...(f.driverId ? {} : { driverId: assigned?.id || '', driverName: assigned?.name || '' }),
        }));
        fetchLastKm(clean);
    };

    const handleDriverChange = (driverId) => {
        const d = driverOptions.find(x => x.id === driverId);
        setForm(f => ({ ...f, driverId: d?.id || '', driverName: d?.name || '' }));
    };
    const handlePartyNameChange = (val) => set('partyName', resolvePartyName(val, knownPartyNames));


    const requestVoucherSave = () => {
        if (lrAlreadyUsed) return;
        if (markInvalidFields(voucherFormRef.current)) return;
        if (isBillVoucherType(vType) && !String(form.billNo || '').trim()) {
            alert('Bill No is required for bills');
            return;
        }
        if (isFactory && !form.truckNo) {
            alert('Truck No. is required');
            return;
        }
        // Diesel advance without a station would create an unbillable "None"
        // row in the pump ledger.
        const pumpProblem = dieselPumpProblem(form.advanceDiesel, form.isFullTank, form.pump, pumpOptions);
        if (pumpProblem) { alert(pumpProblem); return; }

        // Check delivery LR duplicates for factory types
        if (isFactory) {
            const duplicates = deliveries
                .map(d => d.lrNo?.trim())
                .filter(lr => lr && usedLRSet.has(lr));
            if (duplicates.length > 0) {
                setDupLRModal({ lrNos: [...new Set(duplicates)] });
                return;
            }
        }

        setIsConfirmingSave(true);
    };
    const handleFormRequest = e => { e.preventDefault(); requestVoucherSave(); };

    // Tally-style keyboard entry. Inline page form — no Esc-close. Yields to stacked modals.
    const voucherFormRef = useFormShortcuts({
        onSave: requestVoucherSave,
        enabled: !isConfirmingSave && !editVoucher && !delVoucher && !dupLRModal,
        autoFocus: false,
    });

    const executeSaveVoucher = async () => {
        setSaving(true); setIsConfirmingSave(false);
        const validDeliveries = isFactory ? deliveries.filter(d => d.weight || d.lrNo || d.destination) : [];
        const hasMultiDelivery = validDeliveries.length > 0;
        const totalW = hasMultiDelivery ? deliveryTotals.totalWeight : parseFloat(form.weight) || 0;
        const totalB = hasMultiDelivery ? deliveryTotals.totalBags : parseInt(form.bags) || 0;
        const calc = getCalc(totalW, validDeliveries[0]?.rate || form.rate, form.hasCommission);
        const payload = {
            ...form,
            partyName: hasMultiDelivery ? (validDeliveries.map(d => d.partyName).filter(Boolean).join(', ') || form.partyName) : resolvePartyName(form.partyName, knownPartyNames),
            destination: hasMultiDelivery ? validDeliveries.map(d => d.destination).filter(Boolean).join(', ') : form.destination,
            weight: String(totalW.toFixed ? totalW.toFixed(2) : totalW),
            bags: String(totalB),
            type: vType, brand,
            ...calc,
            materials: form.materials || [],
            // Tyre work is only offered on our own trucks; if the number was
            // switched to a market vehicle after typing, those figures go with it.
            ...(isSelfTruck ? {} : { tyrePuncture: '', tyreGreasingAir: '' }),
            ...extrasPayload(form.extras),
            ...(hasMultiDelivery ? { deliveries: validDeliveries } : {}),
        };
        try {
            const res = await ax.post(API_V, payload);
            rememberSticky('voucher.date', form.date);
            if (!lockedType && !isGeneric) rememberSticky('voucher.type', vType);
            fetchVouchers(); setLrMaterials([]); setLrAlreadyUsed(false); setLastKmInfo(null);
            const newVoucher = res.data;
            setForm(f => ({ ...f, lrNo: '', truckNo: '', driverId: '', driverName: '', weight: '', bags: '', rate: '', pump: NONE_PUMP, destination: '', partyName: '', advanceDiesel: '', advanceCash: '', advanceOnline: '', isFullTank: false, startKm: '', endKm: '', billNo: '', partyCode: '', materialName: '', materials: [], tyrePuncture: '', tyreGreasingAir: '', extras: [] }));
            setDeliveries([{ ...EMPTY_DELIVERY }]);
            setShowVehicleExpenses(false);

            if (window.confirm('Voucher created successfully! Do you want to print it?')) {
                // Merge over the payload: the response is authoritative for what
                // was stored, but a partial response must not blank the slip.
                printVoucher({ ...payload, ...newVoucher }, org, brand, signedBy);
            }
        } catch { alert('Error saving voucher'); } finally { setSaving(false); }
    };

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    useEffect(() => {
        setForm(f => {
            const nextPump = getAllowedPump(f.pump, f.advanceDiesel, pumpOptions);
            return f.pump === nextPump ? f : { ...f, pump: nextPump };
        });
    }, [form.advanceDiesel, pumpOptions]);

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

        // Dynamic filtering based on active column filters
        Object.keys(filters).forEach(key => {
            const selectedValues = filters[key];
            if (selectedValues && selectedValues.length > 0) {
                list = list.filter(v => selectedValues.includes(String(v[key] ?? '')));
            }
        });

        list.sort((a, b) => {
            let av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
            if (sortCol === 'total' || sortCol === 'weight' || sortCol === 'lrNo') { av = parseFloat(av) || 0; bv = parseFloat(bv) || 0; }
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return list;
    }, [vouchers, filters, sortCol, sortDir]);

    // Pagination Logic
    const paginatedVouchers = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return filtered.slice(start, start + PAGE_SIZE);
    }, [filtered, currentPage]);

    /* Totals row */
    const totals = useMemo(() => ({
        weight: filtered.reduce((s, v) => s + (parseFloat(v.weight) || 0), 0).toFixed(2),
        bags: filtered.reduce((s, v) => s + (parseFloat(v.bags) || 0), 0),
        total: filtered.reduce((s, v) => s + ((parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0)), 0),
    }), [filtered]);

    // Everything the voucher holds, including the deductions the old thirteen
    // columns omitted — commission, tyre work, every extra payment and its
    // remark, and the multi-delivery breakdown.
    const voucherExportRows = () => buildExportRows(filtered, {
        order: ['lrNo', 'date', 'truckNo', 'partyName', 'destination', 'weight', 'bags', 'rate'],
        computed: {
            Pump: v => getPumpDisplay(v.pump),
            Gross: v => Math.round(calcGrossV(v)),
            'Net Payable': v => Math.round(getNet(v).net),
        },
    });
    const exportVoucherExcel = () => exportToExcel(voucherExportRows(), `Vouchers_${vType}_${new Date().toISOString().slice(0, 10)}`);
    const exportVoucherPDF = () => exportToPDF(voucherExportRows(), `${vType.replace('_', ' ')} Vouchers`, null, {
        archive: {
            module: 'Vouchers',
            plant: vType.replace(/_/g, ' '),
            name: archiveName('Vouchers Export', vType, new Date().toISOString().slice(0, 10)),
        },
    });

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
            <AnimatePresence>{editVoucher && <EditModal v={editVoucher} pumpOptions={pumpOptions} partySuggestions={knownPartyNames} vehicleNumbers={vehicleNumbers} driverOptions={driverOptions} isVGTCTruck={isVGTCTruck} onClose={() => setEditVoucher(null)} onSave={() => { setEditVoucher(null); fetchVouchers(); }} />}</AnimatePresence>
            <AnimatePresence>{delVoucher && <DeleteConfirm v={delVoucher} onClose={() => setDelVoucher(null)} onConfirm={() => { setDelVoucher(null); fetchVouchers(); }} />}</AnimatePresence>

            {/* Duplicate LR popup */}
            <AnimatePresence>
                {dupLRModal && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
                        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                            style={{ width: '90%', maxWidth: '400px', background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', padding: '28px 24px', textAlign: 'center' }}>
                            <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                <AlertTriangle size={26} color="#f43f5e" />
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>Duplicate LR Number{dupLRModal.lrNos.length > 1 ? 's' : ''}</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-sub)', marginBottom: '12px' }}>
                                The following LR number{dupLRModal.lrNos.length > 1 ? 's are' : ' is'} already assigned to an existing voucher:
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginBottom: '20px' }}>
                                {dupLRModal.lrNos.map(lr => (
                                    <span key={lr} style={{ display: 'inline-block', padding: '4px 12px', background: 'rgba(244,63,94,0.1)', color: '#f43f5e', borderRadius: '6px', fontWeight: 900, fontFamily: 'monospace', fontSize: '14px' }}>#{lr}</span>
                                ))}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>Please use a different LR number for each delivery.</div>
                            <button className="btn btn-p" onClick={() => setDupLRModal(null)} style={{ minWidth: '120px' }}>OK, Fix It</button>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <div>
                {/* ── Page Header ── */}
                <div className="page-hd">
                    <div>
                        <h1><FileText size={20} color={lockedType === 'JK_Lakshmi' ? '#f59e0b' : '#10b981'} /> {isGeneric ? 'Voucher' : (lockedType === 'JK_Lakshmi' ? 'JK Lakshmi Voucher' : 'Voucher Management')}</h1>
                        <p>{isGeneric ? 'Manage voucher entries' : (lockedType === 'JK_Lakshmi' ? 'Manage JK Lakshmi vouchers' : 'Dump Bills · J.K Lakshmi · J.K Super')}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {!lockedType && !isGeneric && (
                            <div className="tab-grp">
                                {TYPES.map(t => <button key={t} className={`tab-btn${vType === t ? ' tab-indigo' : ''}`} onClick={() => setVType(t)}>{t.replace('_', ' ')}</button>)}
                            </div>
                        )}
                        {canEdit && (
                            <button className={`btn ${formOpen ? 'btn-g' : 'btn-p'}`} onClick={() => setFormOpen(o => !o)}
                                title={formOpen ? 'Close the form' : 'Create a new voucher'}>
                                {formOpen ? <><X size={15} /> Close Form</> : <><Plus size={15} /> Create New Voucher</>}
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Entry Form — hidden until asked for ── */}
                {formOpen && (
                <div className="card" style={{ marginBottom: '18px' }}>
                    <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setFormOpen(o => !o)}>
                        <div className="card-title-block">
                            <div className="card-icon ci-green"><Plus size={17} /></div>
                            <div className="card-title-text"><h3>New {isGeneric ? 'Voucher' : vType.replace('_', ' ') + ' Voucher'}</h3><p>{form.date}</p></div>
                        </div>
                        <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700 }}>
                            <X size={15} /> Close
                        </button>
                    </div>

                    <AnimatePresence initial={false}>
                        {formOpen && (
                            <motion.div key="form" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: 'easeInOut' }} style={{ overflow: 'hidden' }}>
                                <div className="card-body">
                                    <form onSubmit={handleFormRequest} ref={voucherFormRef}>
                                        <div className="fg fg-2">
                                            {!isFactory && (
                                                <div className="field-h">
                                                    <label><Search size={11} style={{ marginRight: '4px' }} /> LR Number *</label>
                                                    <input
                                                        className="fi" type="text" placeholder="Enter LR number"
                                                        value={form.lrNo}
                                                        onChange={e => handleLrSearch(e.target.value)}
                                                        style={lrAlreadyUsed ? { borderColor: '#f43f5e', boxShadow: '0 0 0 2px rgba(244,63,94,0.18)' } : {}}
                                                        required
                                                    />
                                                </div>
                                            )}
                                            <div className="field-h">
                                                <label>Truck No. *</label>
                                                <div style={{ position: 'relative', width: '100%' }}>
                                                    <input className="fi" type="text" placeholder={vType.includes('Bill') ? 'Auto-filled from LR' : 'Enter truck number'} value={form.truckNo} onChange={e => handleTruckNoChange(e.target.value)} required list="voucher-truck-list" />
                                                    <datalist id="voucher-truck-list">
                                                        {vehicleNumbers.map(no => <option key={no} value={no} />)}
                                                    </datalist>
                                                </div>
                                            </div>
                                            <div className="field-h">
                                                <label>Driver</label>
                                                <select
                                                    className="fi"
                                                    value={form.driverId}
                                                    onChange={e => handleDriverChange(e.target.value)}
                                                >
                                                    <option value="">— not recorded —</option>
                                                    {driverOptions.map(d => (
                                                        <option key={d.id} value={d.id}>
                                                            {d.name}{d.vehicleNo ? ` (${d.vehicleNo})` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '3px' }}>
                                                    {form.driverId
                                                        ? (defaultDriverForTruck(form.truckNo)?.id === form.driverId
                                                            ? 'Usual driver for this truck. Change it if someone else drove.'
                                                            : 'Relief driver — attendance will be credited to this person.')
                                                        : driverOptions.length
                                                            ? 'Pick who drove, so their attendance is marked automatically.'
                                                            : 'No drivers yet. Add them under Staff Profiles.'}
                                                </div>
                                            </div>
                                            {!isFactory && <>
                                                <div className="field-h">
                                                    <label><MapPin size={11} style={{ marginRight: '4px' }} /> Destination</label>
                                                    <input className="fi" type="text" placeholder={vType.includes('Bill') ? 'Auto-filled from LR' : 'Enter city'} value={form.destination} onChange={e => set('destination', e.target.value)} />
                                                </div>
                                                <div className="field-h">
                                                    <label>Party Name</label>
                                                    <div style={{ position: 'relative', width: '100%' }}>
                                                        <input className="fi" type="text" placeholder="Auto-filled from LR" value={form.partyName} onChange={e => handlePartyNameChange(e.target.value)} list="voucher-party-list" />
                                                        <datalist id="voucher-party-list">
                                                            {knownPartyNames.map(name => <option key={name} value={name} />)}
                                                        </datalist>
                                                    </div>
                                                </div>
                                            </>}
                                            {(vType === 'Kosli_Bill' || vType === 'Jajjhar_Bill' || vType === 'Bahadurgarh_Bill') && (
                                                <>
                                                    <div className="field-h">
                                                        <label>Party Code</label>
                                                        <input className="fi" type="text" placeholder="Optional" value={form.partyCode} onChange={e => set('partyCode', e.target.value)} />
                                                    </div>
                                                    <div className="field-h">
                                                        <label>Bill No *</label>
                                                        <input className="fi" type="text" placeholder="Enter bill number" value={form.billNo} onChange={e => set('billNo', e.target.value)} required />
                                                    </div>
                                                    <div className="field-h">
                                                        <label>Material Name</label>
                                                        <input className="fi" type="text" placeholder="To print with CEMENT" value={form.materialName} onChange={e => set('materialName', e.target.value)} />
                                                    </div>
                                                </>
                                            )}
                                            <div className="field-h">
                                                <label>Date *</label>
                                                <input className="fi" type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
                                            </div>

                                            {lrAlreadyUsed && (
                                                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '9px', padding: '9px 14px' }}>
                                                    <AlertTriangle size={15} color="#f43f5e" style={{ flexShrink: 0 }} />
                                                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#f43f5e' }}>LR #{form.lrNo} is already assigned to a {vType.replace('_', ' ')} voucher. Please use a different LR number.</span>
                                                </div>
                                            )}

                                            {lrMaterials.length > 0 && (
                                                <div style={{ gridColumn: '1 / -1', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: '10px', padding: '10px 14px' }}>
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

                                            {/* ── Multi-delivery table for JK_Super / JK_Lakshmi ── */}
                                            {isFactory && (
                                                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <MapPin size={12} /> Delivery Entries
                                                            <span style={{ fontWeight: 600, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>— one row per LR / destination</span>
                                                        </span>
                                                        <button type="button" className="btn btn-p btn-sm" onClick={addDelivery}>
                                                            <Plus size={12} /> Add Destination
                                                        </button>
                                                    </div>
                                                    <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                            <thead>
                                                                <tr style={{ background: 'var(--bg-th)' }}>
                                                                    {['LR No.', 'Destination', 'Party Name', 'Weight (MT)', 'Total Bags', 'Rate (Rs/MT)', 'Gross', ''].map(h => (
                                                                        <th key={h} style={{ padding: '7px 10px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', textAlign: h === 'Gross' || h === 'Weight (MT)' || h === 'Rate (Rs/MT)' || h === 'Total Bags' ? 'right' : 'left' }}>{h}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {deliveries.map((d, idx) => {
                                                                    const rowGross = (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0);
                                                                    const isDupLR = d.lrNo?.trim() && usedLRSet.has(d.lrNo.trim());
                                                                    return (
                                                                        <tr key={idx} style={{ background: isDupLR ? 'rgba(244,63,94,0.04)' : idx % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                                                                            <td style={{ padding: '5px 8px' }}>
                                                                                <input className="fi" type="text" placeholder="e.g. 101" value={d.lrNo}
                                                                                    onChange={e => updateDelivery(idx, 'lrNo', e.target.value)}
                                                                                    style={{
                                                                                        width: '80px', padding: '4px 7px', fontSize: '12px',
                                                                                        ...(isDupLR ? { borderColor: '#f43f5e', boxShadow: '0 0 0 2px rgba(244,63,94,0.15)' } : {})
                                                                                    }} />
                                                                                {isDupLR && <div style={{ fontSize: '9px', color: '#f43f5e', fontWeight: 800, marginTop: '2px' }}>⚠ Already used</div>}
                                                                            </td>
                                                                            <td style={{ padding: '5px 8px' }}>
                                                                                <input className="fi" type="text" placeholder="City / Party" value={d.destination}
                                                                                    onChange={e => updateDelivery(idx, 'destination', e.target.value)}
                                                                                    style={{ width: '130px', padding: '4px 7px', fontSize: '12px' }} />
                                                                            </td>
                                                                            <td style={{ padding: '5px 8px' }}>
                                                                                <input className="fi" type="text" placeholder="Party name" value={d.partyName}
                                                                                    onChange={e => updateDelivery(idx, 'partyName', e.target.value)}
                                                                                    list={`del-party-${idx}`}
                                                                                    style={{ width: '150px', padding: '4px 7px', fontSize: '12px' }} />
                                                                                <datalist id={`del-party-${idx}`}>
                                                                                    {knownPartyNames.map(n => <option key={n} value={n} />)}
                                                                                </datalist>
                                                                            </td>
                                                                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                                                                                <input className="fi" type="number" step="0.01" placeholder="0.00" value={d.weight}
                                                                                    onChange={e => updateDelivery(idx, 'weight', e.target.value)}
                                                                                    style={{ width: '80px', padding: '4px 7px', fontSize: '12px', textAlign: 'right' }} />
                                                                            </td>
                                                                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                                                                                <input className="fi" type="number" placeholder="0" value={d.bags}
                                                                                    onChange={e => updateDelivery(idx, 'bags', e.target.value)}
                                                                                    style={{ width: '75px', padding: '4px 7px', fontSize: '12px', textAlign: 'right' }} />
                                                                            </td>
                                                                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                                                                                <input className="fi" type="number" placeholder="0" value={d.rate}
                                                                                    onChange={e => updateDelivery(idx, 'rate', e.target.value)}
                                                                                    style={{ width: '80px', padding: '4px 7px', fontSize: '12px', textAlign: 'right' }} />
                                                                            </td>
                                                                            <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 700, color: rowGross > 0 ? 'var(--accent)' : 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                                                                                {rowGross > 0 ? 'Rs.' + Math.round(rowGross).toLocaleString('en-IN') : '—'}
                                                                            </td>
                                                                            <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                                                                                {deliveries.length > 1 && (
                                                                                    <button type="button" className="btn btn-d btn-icon btn-sm" onClick={() => removeDelivery(idx)} title="Remove row"><X size={11} /></button>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                            {/* Totals row */}
                                                            <tfoot>
                                                                <tr style={{ background: 'var(--bg-tf)', borderTop: '2px solid var(--border)' }}>
                                                                    <td colSpan={3} style={{ padding: '7px 10px', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                                                        Total ({deliveries.length} {deliveries.length === 1 ? 'destination' : 'destinations'})
                                                                    </td>
                                                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 900, fontSize: '13px', color: 'var(--text)' }}>
                                                                        {deliveryTotals.totalWeight > 0 ? deliveryTotals.totalWeight.toFixed(2) + ' MT' : '—'}
                                                                    </td>
                                                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 900, fontSize: '13px', color: 'var(--text)' }}>
                                                                        {deliveryTotals.totalBags > 0 ? deliveryTotals.totalBags.toLocaleString('en-IN') : '—'}
                                                                    </td>
                                                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)', fontSize: '11px' }}>Various</td>
                                                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 900, fontSize: '14px', color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                                                                        {deliveryTotals.totalGross > 0 ? 'Rs.' + Math.round(deliveryTotals.totalGross).toLocaleString('en-IN') : '—'}
                                                                    </td>
                                                                    <td />
                                                                </tr>
                                                            </tfoot>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}

                                            {!isFactory && (
                                                <>
                                                    <div className="field-h">
                                                        <label>Weight (MT)</label>
                                                        <input className="fi" type="number" step="0.01" placeholder="0.00" value={form.weight}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                setForm(f => ({ ...f, weight: val, bags: val ? Math.round(parseFloat(val) * 20) : '' }));
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="field-h">
                                                        <label>Total Bags</label>
                                                        <input className="fi" type="number" placeholder="0" value={form.bags}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                setForm(f => ({ ...f, bags: val, weight: val ? (parseFloat(val) * 0.05).toFixed(2) : '' }));
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="field-h">
                                                        <label>Rate (Rs/MT)</label>
                                                        <input className="fi" type="number" placeholder="0" value={form.rate} onChange={e => set('rate', e.target.value)} />
                                                    </div>
                                                    <div className="field-h">
                                                        <label>Fuel Station</label>
                                                        <select className="fi" value={form.pump} onChange={e => set('pump', e.target.value)}>
                                                            {pumpOptions.map(p => <option key={p}>{p}</option>)}
                                                        </select>
                                                    </div>
                                                </>
                                            )}
                                            {isFactory && (
                                                <div className="field-h">
                                                    <label>Fuel Station</label>
                                                    <select className="fi" value={form.pump} onChange={e => set('pump', e.target.value)}>
                                                        {pumpOptions.map(p => <option key={p}>{p}</option>)}
                                                    </select>
                                                </div>
                                            )}
                                            <div className="field-h">
                                                <label><Fuel size={11} style={{ marginRight: '4px' }} /> Diesel Advance</label>
                                                {/* No registered station → diesel cannot be recorded at all.
                                                    Saved with pump "None" it can never be matched to a monthly
                                                    bill, so it is blocked here instead of failing at save. */}
                                                {pumpOptions.filter(p => p !== NONE_PUMP).length === 0 ? (
                                                    <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--warn)', padding: '9px 12px', background: 'rgba(245,158,11,0.08)', border: '1px dashed rgba(245,158,11,0.4)', borderRadius: '8px', width: '100%' }}>
                                                        No fuel station registered — add one under Admin Settings → Fuel Stations to record diesel.
                                                    </div>
                                                ) : (
                                                    <div className="fi-row" style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                                        <input className="fi" type="text" placeholder="Amount" value={form.advanceDiesel} disabled={form.isFullTank} onChange={e => set('advanceDiesel', e.target.value)} />
                                                        <button type="button" style={{ minWidth: '60px' }} className={`btn ${form.isFullTank ? 'btn-p' : 'btn-g'}`}
                                                            onClick={() => setForm(f => ({ ...f, isFullTank: !f.isFullTank, advanceDiesel: !f.isFullTank ? 'FULL' : '' }))}>Full</button>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="field-h">
                                                <label><Wallet size={11} style={{ marginRight: '4px' }} /> Cash Advance</label>
                                                <input className="fi" type="number" placeholder="0" value={form.advanceCash} onChange={e => set('advanceCash', e.target.value)} />
                                            </div>
                                            <div className="field-h">
                                                <label><CreditCard size={11} style={{ marginRight: '4px' }} /> Online Advance</label>
                                                <div className="fi-row" style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                                    <input className="fi" type="number" placeholder="0" value={form.advanceOnline} onChange={e => set('advanceOnline', e.target.value)} />
                                                    <button type="button" className="btn btn-g btn-sm"
                                                        onClick={() => window.dispatchEvent(new CustomEvent('nav-module', { detail: { active: brand === 'jklakshmi' ? 'pay_jharli' : 'pay_dump', subActive: 'online' } }))}
                                                        style={{ fontSize: '11px', whiteSpace: 'nowrap', padding: '0 10px', height: '38px', flexShrink: 0 }}>
                                                        View All →
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="field-h">
                                                <label>Commission</label>
                                                <div style={{ display: 'flex', alignItems: 'center', height: '38px' }}>
                                                    <input type="checkbox" id="comm" checked={form.hasCommission} onChange={e => set('hasCommission', e.target.checked)} style={{ marginRight: '8px' }} />
                                                    <label htmlFor="comm" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-sub)', textTransform: 'none', width: 'auto' }}>Rs.20/MT</label>
                                                </div>
                                            </div>

                                            {/* ── Vehicle Expenses ──
                                                Extra money can be handed to any driver, so it shows on every
                                                truck. Tyre work is VGTC's own maintenance bill and stays on
                                                self trucks — a market vehicle's punctures are not ours. */}
                                            {form.truckNo && (
                                                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <button type="button" onClick={() => setShowVehicleExpenses(s => !s)}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: showVehicleExpenses ? 'rgba(245,158,11,0.06)' : 'none', border: '1px dashed var(--border)', borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', width: '100%', color: showVehicleExpenses ? '#f59e0b' : 'var(--text-muted)', fontSize: '12px', fontWeight: 700, transition: 'all 0.15s' }}>
                                                        <span style={{ transform: showVehicleExpenses ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>▶</span>
                                                        {isSelfTruck ? '🔧 Vehicle Expenses (Tyre, Extra Money)' : '💰 Extra Money'}
                                                        {formExpenseTotal > 0 && (
                                                            <span style={{ color: '#f59e0b', marginLeft: 'auto' }}>₹{formExpenseTotal.toLocaleString('en-IN')}</span>
                                                        )}
                                                    </button>
                                                    {showVehicleExpenses && (
                                                        <div className="fg fg-2" style={{ padding: '14px', background: 'var(--bg)', borderRadius: '10px', border: '1px solid var(--border)', gap: '12px' }}>
                                                            {isSelfTruck && (
                                                                <>
                                                                    <div className="field-h">
                                                                        <label>🔧 Tyre Puncture</label>
                                                                        <input className="fi" type="number" placeholder="₹0" value={form.tyrePuncture} onChange={e => set('tyrePuncture', e.target.value)} />
                                                                    </div>
                                                                    <div className="field-h">
                                                                        <label>⚙️ Tyre Greasing & Air</label>
                                                                        <input className="fi" type="number" placeholder="₹0" value={form.tyreGreasingAir} onChange={e => set('tyreGreasingAir', e.target.value)} />
                                                                    </div>
                                                                </>
                                                            )}
                                                            <ExtraMoneyList extras={form.extras} onChange={list => set('extras', list)} />
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* ── Odometer KM fields — VGTC trucks only, all voucher types ── */}
                                            {isVGTCTruck(form.truckNo) && (
                                                <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'inherit', gap: 'inherit' }}>
                                                    <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <Gauge size={14} color="#f59e0b" />
                                                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Odometer / Mileage</span>
                                                    </div>
                                                    <div className="field-h">
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                            <Gauge size={11} /> Current Odometer
                                                            {fetchingKm && <Loader2 size={10} className="spin" style={{ opacity: 0.5 }} />}
                                                        </label>
                                                        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                                            <input
                                                                className="fi"
                                                                type="number"
                                                                placeholder="e.g. 45850"
                                                                value={form.endKm}
                                                                onChange={e => set('endKm', e.target.value)}
                                                            />
                                                            {lastKmInfo && (
                                                                <div style={{ marginTop: '4px', fontSize: '10px', color: '#10b981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <Check size={10} /> Last trip (LR#{lastKmInfo.lrNo}) ended at {lastKmInfo.endKm} km on {lastKmInfo.date}
                                                                </div>
                                                            )}
                                                            {!lastKmInfo && form.truckNo && !fetchingKm && (
                                                                <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                                    No previous trip found — entering this will start tracking
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
                                            <button type="submit" className="btn btn-p" style={{ minWidth: '160px', padding: '11px 24px' }} disabled={saving || lrAlreadyUsed} title="Save Voucher">
                                                {saving ? <Loader2 size={15} className="spin" /> : <><Check size={15} /> Save Voucher</>}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                )}

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
                            <button className="btn btn-g btn-sm" onClick={exportVoucherExcel} title="Export to Excel Spreadsheet"><Download size={13} /> Excel</button>
                            <button className="btn btn-g btn-sm" onClick={exportVoucherPDF} title="Export to PDF Document"><Printer size={13} /> PDF</button>
                        </div>
                    </div>

                    {/* Filter summary */}
                    {Object.keys(filters).some(k => filters[k].length > 0) && (
                        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--bg-filter)' }}>
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

                    {/* Sheet table */}
                    <div className="tbl-wrap">
                        <table className="tbl" style={{ minWidth: '1400px', width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-th)' }}>
                                    <th style={{ ...TH, width: '40px', textAlign: 'center' }}>#</th>
                                    {[
                                        { key: 'lrNo', label: 'LR No.' },
                                        { key: 'date', label: 'Date' },
                                        { key: 'truckNo', label: 'Truck' },
                                        { key: 'destination', label: 'Destination' },
                                        { key: 'weight', label: 'Weight' },
                                        { key: 'bags', label: 'Bags' },
                                        { key: 'rate', label: 'Rate' },
                                        { key: 'pump', label: 'Pump' },
                                        { key: 'advanceDiesel', label: 'Diesel Adv.' },
                                        { key: 'advanceCash', label: 'Cash Adv.' },
                                        { key: 'advanceOnline', label: 'Online Adv.' },
                                        { key: 'munshi', label: 'Munshi' },
                                        { key: 'total', label: 'Total (Rs)' },
                                        ...(role === 'admin' ? [
                                            { key: 'createdBy', label: 'Created By' },
                                            { key: 'updatedBy', label: 'Updated By' }
                                        ] : []),
                                    ].map(col => (
                                        <th key={col.key} style={{ ...TH, userSelect: 'none' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div onClick={() => toggleSort(col.key)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    {col.label} <SortIcon col={col.key} />
                                                </div>
                                                <ColumnFilter
                                                    label=""
                                                    colKey={col.key}
                                                    data={vouchers}
                                                    activeFilters={filters}
                                                    onFilterChange={handleFilterChange}
                                                />
                                            </div>
                                        </th>
                                    ))}
                                    <th style={{ ...TH, textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableLoading && filtered.length === 0 && (
                                    [1, 2, 3, 4, 5].map(i => (
                                        <tr key={`sk-${i}`} className="skeleton-row">
                                            {Array.from({ length: 15 }).map((_, j) => (
                                                <td key={j}><span className="skeleton skeleton-text" /></td>
                                            ))}
                                        </tr>
                                    ))
                                )}
                                {!tableLoading && filtered.length === 0 && (
                                    <tr><td colSpan={15} style={{ padding: '40px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>No records found</td></tr>
                                )}
                                {paginatedVouchers.map((v, i) => (
                                    <tr key={v.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)', transition: 'background 0.12s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-row-hover)'}
                                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)'}>
                                        <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                                        <td style={{ ...TD }}>
                                            {v.deliveries?.length > 0
                                                ? <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    {v.deliveries.map((d, di) => (
                                                        <span key={di} style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)', fontSize: '11px' }}>#{d.lrNo || '—'}</span>
                                                    ))}
                                                </div>
                                                : <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>#{v.lrNo}</span>}
                                        </td>
                                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>{v.date}</td>
                                        <td style={{ ...TD, fontWeight: 700 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {v.truckNo}
                                                {v.endKm && (
                                                    <span style={{ fontSize: '9px', fontWeight: 800, background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '2px 5px', borderRadius: '4px' }} title={`Mileage Tracked: Odo ${v.endKm}`}>
                                                        <Gauge size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />
                                                        TRIP
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ ...TD }}>
                                            {v.deliveries?.length > 0
                                                ? <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    {v.deliveries.map((d, di) => (
                                                        <div key={di} style={{ fontSize: '11px' }}>
                                                            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{d.destination || '—'}</span>
                                                            {d.partyName && <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}> · {d.partyName}</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                                : v.destination || '—'}
                                        </td>
                                        <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>
                                            {v.deliveries?.length > 0
                                                ? <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'flex-end' }}>
                                                    {v.deliveries.map((d, di) => <span key={di} style={{ fontSize: '11px' }}>{d.weight || '—'}</span>)}
                                                    {/* The lines above are one destination each; this is the load.
                                                        Spelled out — a sigma reads as noise to anyone who did not
                                                        put it there. */}
                                                    <span style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 900, borderTop: '1px solid var(--border)', paddingTop: '1px', marginTop: '1px', whiteSpace: 'nowrap' }}>
                                                        Total {v.deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0), 0).toFixed(2)}
                                                    </span>
                                                </div>
                                                : v.weight}
                                        </td>
                                        <td style={{ ...TD, textAlign: 'right' }}>
                                            {v.deliveries?.length > 0
                                                ? <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'flex-end' }}>
                                                    {v.deliveries.map((d, di) => <span key={di} style={{ fontSize: '11px', fontWeight: 700 }}>{d.bags || '—'}</span>)}
                                                    <span style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 900, borderTop: '1px solid var(--border)', paddingTop: '1px', marginTop: '1px', whiteSpace: 'nowrap' }}>
                                                        Total {v.deliveries.reduce((s, d) => s + (parseInt(d.bags) || 0), 0).toLocaleString('en-IN')}
                                                    </span>
                                                </div>
                                                : <><div style={{ fontWeight: 700 }}>{(parseFloat(v.bags) || 0).toLocaleString()}</div>
                                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{((parseFloat(v.bags) || 0) * 0.05).toFixed(2)} MT</div></>}
                                        </td>
                                        <td style={{ ...TD, textAlign: 'right' }}>
                                            {v.deliveries?.length > 0
                                                ? <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'flex-end' }}>
                                                    {v.deliveries.map((d, di) => <span key={di} style={{ fontSize: '11px' }}>{d.rate || '—'}</span>)}
                                                </div>
                                                : v.rate}
                                        </td>
                                        <td style={{ ...TD }}>{getPumpDisplay(v.pump)}</td>
                                        <td style={{ ...TD, textAlign: 'right' }}>{v.advanceDiesel || '—'}</td>
                                        <td style={{ ...TD, textAlign: 'right' }}>{v.advanceCash || '—'}</td>
                                        <td style={{ ...TD, textAlign: 'right' }}>{v.advanceOnline || '—'}</td>
                                        <td style={{ ...TD, textAlign: 'right' }}>{v.munshi || 0}</td>
                                        <td style={{ ...TD, textAlign: 'right' }}>
                                            {(() => {
                                                const n = getNet(v);
                                                return (
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}
                                                            title={`${v.weight} MT × Rs.${v.rate}/MT`}>
                                                            Rs.{Math.round(n.gross).toLocaleString()}
                                                        </span>
                                                        {n.dieselPending && (
                                                            <span style={{ fontSize: '10px', color: '#b45309', fontWeight: 700, background: '#fef3c7', padding: '1px 5px', borderRadius: '4px' }}
                                                                title="Diesel advance is FULL TANK — amount not yet entered">
                                                                ⏳ Diesel pending
                                                            </span>
                                                        )}
                                                        {!n.dieselPending && n.totalDeductions > 0 && (
                                                            <span style={{ fontSize: '10px', color: '#f43f5e', fontWeight: 600 }}
                                                                title={`Deductions: Diesel Rs.${n.diesel} + Cash Rs.${n.cash} + Online Rs.${n.online} + Munshi Rs.${n.munshi}${n.commission > 0 ? ' + Comm Rs.' + n.commission : ''}`}>
                                                                − Rs.{Math.round(n.totalDeductions).toLocaleString()}
                                                            </span>
                                                        )}
                                                        <span style={{ fontSize: '13px', fontWeight: 900, color: n.dieselPending ? '#b45309' : 'var(--accent)', borderTop: (n.dieselPending || n.totalDeductions > 0) ? '1px solid var(--border)' : 'none', paddingTop: (n.dieselPending || n.totalDeductions > 0) ? '2px' : '0' }}>
                                                            {n.dieselPending ? '—' : `Rs.${Math.round(n.net).toLocaleString()}`}
                                                        </span>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        {role === 'admin' && <td style={{ ...TD }}>{v.createdBy || '—'}</td>}
                                        {role === 'admin' && <td style={{ ...TD }}>{v.updatedBy || '—'}</td>}
                                        <td style={{ ...TD, textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                                                <button className="btn btn-g btn-icon btn-sm" title="Print" onClick={() => printVoucher(v, org, brand, signedBy)}><Printer size={13} /></button>
                                                {canEdit && (
                                                    <button className="btn btn-g btn-icon btn-sm" title="Edit" onClick={() => setEditVoucher(v)}><Pencil size={13} /></button>
                                                )}
                                                {role === 'admin' && (
                                                    <button className="btn btn-d btn-icon btn-sm" title="Delete" onClick={() => setDelVoucher(v)}><Trash2 size={13} /></button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>

                        </table>
                    </div>

                    <Pagination
                        currentPage={currentPage}
                        totalItems={filtered.length}
                        pageSize={PAGE_SIZE}
                        onPageChange={setCurrentPage}
                    />
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
