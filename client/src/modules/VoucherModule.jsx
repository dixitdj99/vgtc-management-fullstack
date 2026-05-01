import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ax from '../api';
import { cleanTruckNo } from '../utils/vehicleUtils';
import { buildPartySuggestions, resolvePartyName } from '../utils/partyNameUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Search, MapPin, Fuel, CreditCard, Wallet, Pencil, Trash2, Printer, Check, X, AlertTriangle, Plus, Filter, ChevronDown, ChevronUp, Download, Droplet, ArrowRight, Printer as PrinterIcon, Loader2, Gauge, Navigation } from 'lucide-react';
import ConfirmSaveModal from '../components/ConfirmSaveModal';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import ColumnFilter from '../components/ColumnFilter';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 20;

const API_V = `/vouchers`;
const API_LR = `/lr`;
const NONE_PUMP = 'None';
const TYPES = ['Kosli_Bill', 'Jajjhar_Bill', 'Dump', 'JK_Lakshmi', 'JK_Super'];

const hasDieselAdvance = (value) => String(value ?? '').trim() !== '';
const getAllowedPump = (pump, advanceDiesel, pumpOptions = []) => {
    if (!hasDieselAdvance(advanceDiesel)) return NONE_PUMP;
    const pumps = pumpOptions.filter(p => p !== NONE_PUMP);
    return pump && pump !== NONE_PUMP ? pump : (pumps[0] || NONE_PUMP);
};
const getPumpDisplay = (pump) => pump && pump !== NONE_PUMP ? pump : '—';
const isBillVoucherType = (type) => type === 'Kosli_Bill' || type === 'Jajjhar_Bill';

const getCalc = (w, r, hasComm) => {
    const wt = parseFloat(w) || 0, rt = parseFloat(r) || 0;
    const munshi = wt > 0 ? (wt < 15 ? 50 : 100) : 0;
    const commission = hasComm ? wt * 20 : 0;
    return { munshi, commission, total: rt * wt };
};

// Compute deductions and net payable for a voucher record
const getNet = (v) => {
    const gross = (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);
    // dieselPending = true when diesel is set to a non-numeric value like 'FULL'
    const dieselPending = !!v.advanceDiesel && isNaN(parseFloat(v.advanceDiesel));
    const diesel = dieselPending ? 0 : (parseFloat(v.advanceDiesel) || 0);
    const cash = parseFloat(v.advanceCash) || 0;
    const online = parseFloat(v.advanceOnline) || 0;
    const munshi = parseFloat(v.munshi) || 0;
    const commission = parseFloat(v.commission) || 0;
    const totalDeductions = diesel + cash + online + munshi + commission;
    return { gross, diesel, cash, online, munshi, commission, totalDeductions, net: gross - totalDeductions, dieselPending };
};

/* ── Print ── */
function printVoucher(v) {
    const isBill = v.type === 'Kosli_Bill' || v.type === 'Jajjhar_Bill';

    const n = getNet(v);
    const deductionRows = [
        { lbl: 'Diesel Advance', val: n.diesel, raw: v.advanceDiesel },
        { lbl: 'Cash Advance', val: n.cash, raw: v.advanceCash },
        { lbl: 'Online Advance', val: n.online, raw: v.advanceOnline },
        { lbl: 'Munshi', val: n.munshi, raw: v.munshi },
        { lbl: 'Commission', val: n.commission, raw: v.commission },
    ].filter(d => d.val > 0 || (d.lbl === 'Diesel Advance' && v.advanceDiesel && v.advanceDiesel !== '0'));

    const deductionHTML = deductionRows.map(d => {
        const isDieselPending = d.lbl === 'Diesel Advance' && n.dieselPending;
        const valDisplay = isDieselPending
            ? `FULL`
            : `- Rs.${d.val.toLocaleString()}`;
        return `<tr><td style="padding:3px 0;color:#444;font-size:12px">${d.lbl}</td><td style="padding:3px 0;text-align:right;font-size:12px;color:#c0392b">${valDisplay}</td></tr>`;
    }).join('');

    let html = '';

    if (isBill) {
        // New Bill Format from sample
        html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vikas Goods Transport Bill</title>
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
                <div class="company-name">M/S. VIKAS GOODS TRANSPORT CO.</div>
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
                <div>${v.type === 'Kosli_Bill' ? 'Kosli' : 'Jhajjar'}</div>
            </div>
            <div class="info-col-2">
                <div>M/s. <span style="margin-left: 10px; font-weight: normal; font-size: 13px;">${v.partyName || ''}</span>${v.partyName ? '' : '<div class="line-fill"></div>'}</div>
                <div><span style="font-size: 10px;">Party Code:</span> <span style="margin-left: 5px; font-weight: normal; font-size: 12px;">${v.partyCode || ''}</span>${v.partyCode ? '' : '<div class="line-fill" style="margin-left: 0;"></div>'}</div>
                <div><div class="line-fill" style="margin-left: 0;"></div></div>
                <div><span>S.T.L. No.</span><span>C.S.T. No.</span></div>
            </div>
            <div class="info-col-3">
                <div>Truck No. <span style="margin-left: 5px; font-weight: normal;">${v.truckNo || ''}</span>${v.truckNo ? '' : '<div class="dotted-fill"></div>'}</div>
                <div>From : ${v.type === 'Kosli_Bill' ? 'Kosli' : 'Jhajjar'}</div>
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
                        <td colspan="2" style="text-align: center; font-size: 13px; border-bottom: ${idx < rowspan - 1 ? '1px dashed #ccc' : 'none'};">${ parseFloat(mat.weight || 0).toFixed(2)} MT</td>
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
                <div style="width: 40%; text-align: right;">Sign. of Clerk <b>for</b><br>VIKAS GOODS TRANSPORT</div>
            </div>
        </div>
    </div>
    <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
</body>
</html>`;
    } else {
        // Generic Slip Format for JK_Super, JK_Lakshmi, etc.
        html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Voucher #${v.lrNo}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;padding:10mm}
.slip{width:165mm;margin:0 auto;border:2px solid #000;padding:10mm}
h1{font-size:17px;text-align:center;font-weight:900;letter-spacing:2px}
.sub{text-align:center;font-size:10px;color:#555;margin:2px 0 8px}
.div{border-top:1px dashed #000;margin:7px 0}
.row{display:flex;justify-content:space-between;margin-bottom:5px;font-size:12px}
.lbl{font-weight:bold}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0}
.cell{padding:5px 8px;border:1px solid #ccc;border-radius:4px}
.cell-lbl{font-size:9px;font-weight:bold;color:#666;text-transform:uppercase;margin-bottom:2px}
.cell-val{font-size:13px;font-weight:bold}
.calc-box{border:1px solid #ccc;border-radius:6px;padding:8px 10px;margin-top:8px;background:#fafafa}
.calc-title{font-size:9px;font-weight:bold;color:#666;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px}
.calc-table{width:100%}
.gross-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #ddd;font-size:13px;font-weight:bold}
.gross-formula{font-size:9px;color:#666;margin-top:1px}
.total-box{display:flex;justify-content:space-between;padding:10px 12px;background:#000;color:#fff;border-radius:5px;margin-top:8px;font-size:15px;font-weight:900}
.total-pending{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#92400e;color:#fff;border-radius:5px;margin-top:8px;font-size:13px;font-weight:900}
.pending-badge{font-size:9px;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:3px;font-weight:800;letter-spacing:0.04em}
.pending-note{font-size:9.5px;color:#92400e;font-weight:700;margin-top:5px;padding:5px 8px;background:#fffbeb;border:1px solid #fcd34d;border-radius:4px;line-height:1.4}
.sig{display:flex;justify-content:space-between;margin-top:18px;font-size:11px}
.sl{border-top:1px solid #000;padding-top:4px;min-width:100px;text-align:center}
@media print{body{padding:0}}</style></head>
<body><div class="slip">
<h1>VIKAS GOODS TRANSPORT</h1>
<div class="sub">${v.type ? v.type.replace('_', ' ') : ''} Voucher</div>
<div class="div"></div>
<div class="row"><span><span class="lbl">LR No.:</span> #${v.lrNo}</span><span><span class="lbl">Date:</span> ${v.date}</span></div>
<div class="row"><span><span class="lbl">Truck:</span> ${v.truckNo}</span><span><span class="lbl">Destination:</span> ${v.destination || '—'}</span></div>
<div class="div"></div>
<div class="grid">
<div class="cell"><div class="cell-lbl">Weight</div><div class="cell-val">${v.weight} MT</div></div>
<div class="cell"><div class="cell-lbl">Bags</div><div class="cell-val">${v.bags}</div></div>
<div class="cell"><div class="cell-lbl">Rate</div><div class="cell-val">Rs.${v.rate}/MT</div></div>
<div class="cell"><div class="cell-lbl">Pump</div><div class="cell-val">${getPumpDisplay(v.pump)}</div></div>
</div>
<div class="calc-box">
<div class="calc-title">Payment Calculation</div>
<div class="gross-row">
  <span>Gross Total</span>
  <span>Rs.${Math.round(n.gross).toLocaleString()}</span>
</div>
<div class="gross-formula">${v.weight} MT × Rs.${v.rate}/MT</div>
${deductionRows.length > 0 ? `<table class="calc-table" style="margin-top:6px">${deductionHTML}${!n.dieselPending ? `<tr style="border-top:1px solid #bbb"><td style="padding:4px 0;font-weight:bold;font-size:12px">Total Deductions</td><td style="text-align:right;font-weight:bold;font-size:12px;color:#c0392b">- Rs.${Math.round(n.totalDeductions).toLocaleString()}</td></tr>` : ''}</table>` : ''}
</div>
${n.dieselPending
    ? `<div class="total-pending"><span>NET PAYABLE</span><span class="pending-badge">&#8987; DIESEL PENDING</span></div>
       <div class="pending-note">&#9888; Diesel advance is <strong>FULL TANK</strong> &mdash; the actual amount has not been entered yet. Net payable will be finalised once the diesel amount is updated in the system.</div>`
    : `<div class="total-box"><span>NET PAYABLE</span><span>Rs.${Math.round(n.net).toLocaleString()}</span></div>`
}
<div class="div"></div>
<div class="sig"><div class="sl">Driver</div><div class="sl">Accountant</div><div class="sl">Authorised</div></div>
</div>
<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
</body></html>`;
    }

    const win = window.open('', '_blank', isBill ? 'width=850,height=600' : 'width=700,height=620');
    win.document.write(html); win.document.close();
}

/* ── Edit Modal ── */
function EditModal({ v, onClose, onSave, partySuggestions = [], vehicleNumbers = [], isVGTCTruck = () => false, pumpOptions = [] }) {
    const [form, setForm] = useState({
        lrNo: v.lrNo, date: v.date, truckNo: v.truckNo, destination: v.destination || '', partyName: v.partyName || '',
        weight: v.weight, bags: v.bags, rate: v.rate, pump: getAllowedPump(v.pump, v.advanceDiesel, pumpOptions),
        advanceDiesel: v.advanceDiesel || '', advanceCash: v.advanceCash || '',
        advanceOnline: v.advanceOnline || '', hasCommission: !!v.hasCommission,
        billNo: v.billNo || '', partyCode: v.partyCode || '', materialName: v.materialName || '',
        startKm: v.startKm || '', endKm: v.endKm || ''
    });
    const [saving, setSaving] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const S = (k, val) => setForm(f => ({ ...f, [k]: val }));
    const setPartyName = (value) => S('partyName', resolvePartyName(value, partySuggestions));

    useEffect(() => {
        setForm(f => {
            const nextPump = getAllowedPump(f.pump, f.advanceDiesel, pumpOptions);
            return f.pump === nextPump ? f : { ...f, pump: nextPump };
        });
    }, [form.advanceDiesel, pumpOptions]);

    const executeSave = async () => {
        setSaving(true); setIsConfirming(false);
        const calc = getCalc(form.weight, form.rate, form.hasCommission);
        if (isBillVoucherType(v.type) && !String(form.billNo || '').trim()) {
            alert('Bill No is required for bills');
            setSaving(false);
            return;
        }
        try {
            await ax.patch(API_V + '/' + v.id, { ...form, partyName: resolvePartyName(form.partyName, partySuggestions), ...calc });
            onSave();
        } catch { alert('Update failed'); } finally { setSaving(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ width: '94%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.55)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={16} color="#10b981" /></div>
                        <div><div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>Edit Voucher</div><div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '2px' }}>LR #{v.lrNo}</div></div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex' }}><X size={18} /></button>
                </div>
                <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="fg fg-3">
                        <div className="field"><label>LR No.</label><input className="fi" type="number" value={form.lrNo} onChange={e => S('lrNo', e.target.value)} /></div>
                        <div className="field"><label>Date</label><input className="fi" type="date" value={form.date} onChange={e => S('date', e.target.value)} /></div>
                        <div className="field">
                            <label>Truck No.</label>
                            <input className="fi" type="text" value={form.truckNo} onChange={e => S('truckNo', cleanTruckNo(e.target.value))} list={`voucher-truck-list-${v.id}`} />
                            <datalist id={`voucher-truck-list-${v.id}`}>
                                {vehicleNumbers.map(no => <option key={no} value={no} />)}
                            </datalist>
                        </div>
                        <div className="field"><label>Destination</label><input className="fi" type="text" value={form.destination} onChange={e => S('destination', e.target.value)} /></div>
                        <div className="field">
                            <label>Party Name</label>
                            <input className="fi" type="text" value={form.partyName} onChange={e => setPartyName(e.target.value)} list={`voucher-party-list-${v.id}`} />
                            <datalist id={`voucher-party-list-${v.id}`}>
                                {partySuggestions.map(name => <option key={name} value={name} />)}
                            </datalist>
                        </div>
                        {(v.type === 'Kosli_Bill' || v.type === 'Jajjhar_Bill') && (
                            <>
                                <div className="field"><label>Party Code</label><input className="fi" type="text" value={form.partyCode} onChange={e => S('partyCode', e.target.value)} /></div>
                                <div className="field"><label>Bill No</label><input className="fi" type="text" value={form.billNo} onChange={e => S('billNo', e.target.value)} required /></div>
                                <div className="field"><label>Material Name</label><input className="fi" type="text" value={form.materialName} onChange={e => S('materialName', e.target.value)} /></div>
                            </>
                        )}
                    </div>
                    <hr className="sep" style={{ margin: '2px 0' }} />
                    <div className="fg fg-3">
                        <div className="field">
                            <label>Weight (MT)</label>
                            <input className="fi" type="number" step="0.01" value={form.weight} 
                                onChange={e => {
                                    const val = e.target.value;
                                    setForm(f => ({ ...f, weight: val, bags: val ? Math.round(parseFloat(val) * 20) : '' }));
                                }} 
                            />
                        </div>
                        <div className="field">
                            <label>Bags</label>
                            <input className="fi" type="number" value={form.bags} 
                                onChange={e => {
                                    const val = e.target.value;
                                    setForm(f => ({ ...f, bags: val, weight: val ? (parseFloat(val) * 0.05).toFixed(2) : '' }));
                                }} 
                            />
                        </div>
                        <div className="field"><label>Rate (Rs/MT)</label><input className="fi" type="number" value={form.rate} onChange={e => S('rate', e.target.value)} /></div>
                    </div>
                    <div className="fg fg-3">
                        <div className="field"><label>Diesel Advance</label><input className="fi" type="text" value={form.advanceDiesel} onChange={e => S('advanceDiesel', e.target.value)} /></div>
                        <div className="field"><label>Cash Advance</label><input className="fi" type="number" value={form.advanceCash} onChange={e => S('advanceCash', e.target.value)} /></div>
                        <div className="field"><label>Online Advance</label><input className="fi" type="number" value={form.advanceOnline} onChange={e => S('advanceOnline', e.target.value)} /></div>
                    </div>
                    <div className="field"><label>Fuel Station</label>
                        <select className="fi" value={form.pump} onChange={e => S('pump', e.target.value)}>
                            {pumpOptions.map(p => <option key={p}>{p}</option>)}
                        </select>
                    </div>
                    <div className="chk-row">
                        <input type="checkbox" id="ec" checked={form.hasCommission} onChange={e => S('hasCommission', e.target.checked)} />
                        <label htmlFor="ec">Commission — Rs.20/MT</label>
                    </div>
                    {isVGTCTruck(form.truckNo) && (
                        <div className="fg fg-1" style={{ marginTop: '8px' }}>
                            <div className="field">
                                <label><Gauge size={11}/> Current Odometer</label>
                                <input className="fi" type="number" value={form.endKm} onChange={e => S('endKm', e.target.value)} />
                            </div>
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '10px', padding: '14px 22px', borderTop: '1px solid var(--border)', justifyContent: 'flex-end' }}>
                    <button className="btn btn-g" onClick={onClose} disabled={saving}>Cancel</button>
                    <button className="btn btn-p" onClick={() => setIsConfirming(true)} disabled={saving} title="Save Changes">{saving ? <Loader2 size={14} className="spin" /> : <><Check size={14} /> Save Changes</>}</button>
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
    // canEdit: checks brand-specific voucher key and generic fallback
    const voucherKey = brand === 'jklakshmi' ? 'voucher_jkl' : 'voucher_jksuper';
    const canEdit = role === 'admin'
        || permissions?.[voucherKey] === 'edit'
        || permissions?.voucher === 'edit'
        || permissions?.bill_kosli === 'edit'
        || permissions?.bill_jhajjar === 'edit';
    const [vType, setVType] = useState(lockedType || initialTab || 'Kosli_Bill');

    const [vouchers, setVouchers] = useState([]);
    const [saving, setSaving] = useState(false);
    const [lrMaterials, setLrMaterials] = useState([]);
    const [lrAlreadyUsed, setLrAlreadyUsed] = useState(false);
    const [editVoucher, setEditVoucher] = useState(null);
    const [delVoucher, setDelVoucher] = useState(null);
    const [formOpen, setFormOpen] = useState(true);
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

    const [form, setForm] = useState({
        lrNo: '', date: new Date().toISOString().split('T')[0],
        truckNo: '', destination: '', partyName: '', weight: '', bags: '',
        rate: '', pump: NONE_PUMP, advanceDiesel: '', advanceCash: '', advanceOnline: '',
        hasCommission: false, isFullTank: false,
        startKm: '', endKm: '', billNo: '', partyCode: '', materialName: '',
        materials: []
    });
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
        }).catch(() => {});

        ax.get('/profiles').then(r => setProfiles(r.data || [])).catch(() => {});
    }, []);

    useEffect(() => {
        refreshData();
    }, [refreshData]);

    useEffect(() => {
        if (formOpen) refreshData();
    }, [formOpen, refreshData]);

    const isVGTCTruck = (truckNo) => vgtcTrucks.has(truckNo);

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
    };

    const knownPartyNames = useMemo(() => buildPartySuggestions(
        vouchers.map(v => v.partyName),
        lrMaterials.map(m => m.partyName)
    ), [vouchers, lrMaterials]);

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
            // Dump bills — clear LR field on tab switch
            setForm(f => ({ ...f, lrNo: '' }));
            setLrAlreadyUsed(false);
        }
    }, [nextLrNo]);

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

    /* LR search — only Dump Bills auto-fetch from /lr receipts */
    /* JK_Super and JK_Lakshmi have custom LR numbers — no auto-fetch, but still prevent duplicates */
    const handleLrSearch = async val => {
        setForm(f => ({ ...f, lrNo: val }));
        setLrAlreadyUsed(false);
        setLrMaterials([]);
        if (!val) return;

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

        // Determine which LR endpoint to call based on bill type AND brand
        let lrEndpoint = '/lr'; // default for Dump
        if (brand === 'jklakshmi' || brand === 'jkl') {
            lrEndpoint = '/jkl/lr';
        } else {
            if (vType === 'Kosli_Bill') lrEndpoint = '/kosli/lr';
            else if (vType === 'Jajjhar_Bill') lrEndpoint = '/jhajjar/lr';
        }

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
                
                setForm(f => ({
                    ...f,
                    truckNo: truck,
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
        set('truckNo', clean);
        fetchLastKm(clean);
    };
    const handlePartyNameChange = (val) => set('partyName', resolvePartyName(val, knownPartyNames));


    const handleFormRequest = e => {
        e.preventDefault();
        if (lrAlreadyUsed) return;  // Block save if LR is already assigned
        if (isBillVoucherType(vType) && !String(form.billNo || '').trim()) {
            alert('Bill No is required for bills');
            return;
        }
        setIsConfirmingSave(true);
    };

    const executeSaveVoucher = async () => {
        setSaving(true); setIsConfirmingSave(false);
        const calc = getCalc(form.weight, form.rate, form.hasCommission);
        try {
            await ax.post(API_V, { ...form, partyName: resolvePartyName(form.partyName, knownPartyNames), type: vType, brand, ...calc, materials: form.materials || [] });
            fetchVouchers(); setLrMaterials([]); setLrAlreadyUsed(false); setLastKmInfo(null);
            setForm(f => ({ ...f, lrNo: '', truckNo: '', weight: '', bags: '', rate: '', pump: NONE_PUMP, destination: '', partyName: '', advanceDiesel: '', advanceCash: '', advanceOnline: '', isFullTank: false, startKm: '', endKm: '', billNo: '', partyCode: '', materialName: '', materials: [] }));
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

    const exportVoucherExcel = () => exportToExcel(filtered.map(v => ({ LR: v.lrNo, Date: v.date, Truck: v.truckNo, Dest: v.destination, Weight: v.weight, Bags: v.bags, Rate: v.rate, Pump: getPumpDisplay(v.pump), Diesel_Adv: v.advanceDiesel, Cash_Adv: v.advanceCash, Online_Adv: v.advanceOnline, Munshi: v.munshi, Total: (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0) })), `Vouchers_${vType}_${new Date().toISOString().slice(0, 10)}`);
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
            <AnimatePresence>{editVoucher && <EditModal v={editVoucher} pumpOptions={pumpOptions} partySuggestions={knownPartyNames} vehicleNumbers={vehicleNumbers} isVGTCTruck={isVGTCTruck} onClose={() => setEditVoucher(null)} onSave={() => { setEditVoucher(null); fetchVouchers(); }} />}</AnimatePresence>
            <AnimatePresence>{delVoucher && <DeleteConfirm v={delVoucher} onClose={() => setDelVoucher(null)} onConfirm={() => { setDelVoucher(null); fetchVouchers(); }} />}</AnimatePresence>

            <div>
                {/* ── Page Header ── */}
                <div className="page-hd">
                    <div>
                        <h1><FileText size={20} color={lockedType === 'JK_Lakshmi' ? '#f59e0b' : '#10b981'} /> {lockedType === 'JK_Lakshmi' ? 'JK Lakshmi Voucher' : 'Voucher Management'}</h1>
                        <p>{lockedType === 'JK_Lakshmi' ? 'Manage JK Lakshmi vouchers' : 'Dump Bills · J.K Lakshmi · J.K Super'}</p>
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
                                        <div className="fg fg-5" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
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
                                                <input className="fi" type="text" placeholder={vType.includes('Bill') ? 'Auto-filled' : 'Enter truck no.'} value={form.truckNo} onChange={e => handleTruckNoChange(e.target.value)} required list="voucher-truck-list" />
                                                <datalist id="voucher-truck-list">
                                                    {vehicleNumbers.map(no => <option key={no} value={no} />)}
                                                </datalist>
                                            </div>
                                            <div className="field">
                                                <label><MapPin size={11} /> Destination</label>
                                                <input className="fi" type="text" placeholder={vType.includes('Bill') ? 'Auto-filled from LR' : 'Enter city'} value={form.destination} onChange={e => set('destination', e.target.value)} />
                                            </div>
                                            <div className="field">
                                                <label>Party Name</label>
                                                <input className="fi" type="text" placeholder="Auto-filled from LR" value={form.partyName} onChange={e => handlePartyNameChange(e.target.value)} list="voucher-party-list" />
                                                <datalist id="voucher-party-list">
                                                    {knownPartyNames.map(name => <option key={name} value={name} />)}
                                                </datalist>
                                            </div>
                                            {(vType === 'Kosli_Bill' || vType === 'Jajjhar_Bill') && (
                                                <>
                                                    <div className="field">
                                                        <label>Party Code</label>
                                                        <input className="fi" type="text" placeholder="Optional" value={form.partyCode} onChange={e => set('partyCode', e.target.value)} />
                                                    </div>
                                                    <div className="field">
                                                        <label>Bill No</label>
                                                        <input className="fi" type="text" placeholder="Required" value={form.billNo} onChange={e => set('billNo', e.target.value)} required />
                                                    </div>
                                                    <div className="field">
                                                        <label>Material Name</label>
                                                        <input className="fi" type="text" placeholder="To print with CEMENT" value={form.materialName} onChange={e => set('materialName', e.target.value)} />
                                                    </div>
                                                </>
                                            )}
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
                                            <div className="field">
                                                <label>Weight (MT)</label>
                                                <input className="fi" type="number" step="0.01" placeholder="0.00" value={form.weight} 
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        setForm(f => ({ ...f, weight: val, bags: val ? Math.round(parseFloat(val) * 20) : '' }));
                                                    }} 
                                                />
                                            </div>
                                            <div className="field">
                                                <label>Total Bags</label>
                                                <input className="fi" type="number" placeholder="0" value={form.bags} 
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        setForm(f => ({ ...f, bags: val, weight: val ? (parseFloat(val) * 0.05).toFixed(2) : '' }));
                                                    }} 
                                                />
                                            </div>
                                            <div className="field"><label>Rate (Rs/MT)</label><input className="fi" type="number" placeholder="0" value={form.rate} onChange={e => set('rate', e.target.value)} /></div>
                                            <div className="field"><label>Fuel Station</label>
                                                <select className="fi" value={form.pump} onChange={e => set('pump', e.target.value)}>
                                                    {pumpOptions.map(p => <option key={p}>{p}</option>)}
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
                                        {/* ── Odometer KM fields — VGTC trucks only, all voucher types ── */}
                                        {isVGTCTruck(form.truckNo) && (
                                            <div style={{ marginTop: '12px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                    <Gauge size={14} color="#f59e0b" />
                                                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Odometer / Mileage</span>
                                                </div>
                                                <div className="fg fg-1">
                                                    <div className="field">
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                            <Gauge size={11} /> Current Odometer
                                                            {fetchingKm && <Loader2 size={10} className="spin" style={{ opacity: 0.5 }} />}
                                                        </label>
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
                                {filtered.length === 0 && (
                                    <tr><td colSpan={15} style={{ padding: '40px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>No records found</td></tr>
                                )}
                                {paginatedVouchers.map((v, i) => (
                                    <tr key={v.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)', transition: 'background 0.12s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-row-hover)'}
                                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)'}>
                                        <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                                        <td style={{ ...TD }}><span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>#{v.lrNo}</span></td>
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
                                        <td style={{ ...TD }}>{v.destination || '—'}</td>
                                        <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{v.weight}</td>
                                        <td style={{ ...TD, textAlign: 'right' }}>
                                            <div style={{ fontWeight: 700 }}>{(parseFloat(v.bags) || 0).toLocaleString()}</div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{((parseFloat(v.bags) || 0) * 0.05).toFixed(2)} MT</div>
                                        </td>
                                        <td style={{ ...TD, textAlign: 'right' }}>{v.rate}</td>
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
                                                <button className="btn btn-g btn-icon btn-sm" title="Print" onClick={() => printVoucher(v)}><Printer size={13} /></button>
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
