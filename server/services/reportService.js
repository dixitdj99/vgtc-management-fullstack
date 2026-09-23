/**
 * reportService.js
 * Generates vehicle history reports as PDF (pdfkit) or Excel (xlsx).
 */
const PDFDocument = require("pdfkit");
const XLSX = require("xlsx");
const { db, isAvailable } = require("../firebase");
const localStore = require("../utils/localStore");

function normTruck(t) { return String(t || "").toUpperCase().replace(/\s+/g, ""); }
function fmtDate(d) {
    if (!d) return "—";
    try {
        const str = String(d);
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) { const [y,m,day]=str.split("-"); return `${day}/${m}/${y}`; }
        return new Date(d).toLocaleDateString("en-IN");
    } catch(_){ return String(d); }
}
function fmtRs(n){ const num=parseFloat(n)||0; return "Rs."+num.toLocaleString("en-IN",{minimumFractionDigits:0,maximumFractionDigits:0}); }

async function fetchVouchersForTruck(truckNo, month, year, req) {
    const normalised = normTruck(truckNo);
    const collectionNames = ["vouchers","dev_vouchers","prod_vouchers","dev_jksuper_vouchers","dev_jklakshmi_vouchers","jksuper_vouchers","jklakshmi_vouchers"];
    let allVouchers = [];
    for (const colName of collectionNames) {
        try {
            let docs = [];
            if (!isAvailable()) { docs = localStore.getAll(colName) || []; }
            else {
                const snap = await db.collection(colName).where("truckNo","==",normalised).get();
                docs = snap.docs.map(d=>({id:d.id,...d.data()}));
            }
            allVouchers.push(...docs);
        } catch(_) {}
    }
    const seen = new Set();
    allVouchers = allVouchers.filter(v => { if(seen.has(v.id)) return false; seen.add(v.id); return normTruck(v.truckNo)===normalised; });
    if (month && year) {
        const monthPad = String(month).padStart(2,"0");
        allVouchers = allVouchers.filter(v => { const dateStr=String(v.date||v.createdAt||""); return dateStr.startsWith(`${year}-${monthPad}`); });
    }
    allVouchers.sort((a,b)=>String(a.date||"").localeCompare(String(b.date||"")));
    return allVouchers;
}

function computeVoucherFinancials(v) {
    const weight = parseFloat(v.weight||0);
    const rate = parseFloat(v.rate||0);
    const gross = parseFloat(v.freight)||(rate*weight);
    const diesel = isNaN(parseFloat(v.advanceDiesel))?0:(parseFloat(v.advanceDiesel)||0);
    const cash = parseFloat(v.advanceCash)||0;
    const online = parseFloat(v.advanceOnline)||0;
    const isBill = v.type === 'Kosli_Bill' || v.type === 'Jajjhar_Bill' || v.type === 'Bahadurgarh_Bill';
    const munshi = isBill ? 0 : (parseFloat(v.munshi)||(weight>0?(weight<18?50:100):0));
    const shortage = parseFloat(v.shortage)||0;
    const commission = parseFloat(v.commission)||0;
    const tyrePuncture = parseFloat(v.tyrePuncture)||0;
    const tyreGreasing = (parseFloat(v.tyreGreasingAir)||0)+(parseFloat(v.tyreGreasing)||0)+(parseFloat(v.tyreAir)||0);
    const extraCash = parseFloat(v.extraCash)||0;
    const totalDeductions = diesel+cash+online+munshi+shortage+commission+tyrePuncture+tyreGreasing+extraCash;
    const net = gross-totalDeductions;
    return {weight,rate,gross,diesel,cash,online,munshi,shortage,commission,tyrePuncture,tyreGreasing,extraCash,totalDeductions,net};
}

async function generateVehicleMonthlyPdf(truckNo, month, year, req) {
    const vouchers = await fetchVouchersForTruck(truckNo, month, year, req);
    const monthName = month ? new Date(2000,month-1,1).toLocaleString("en-IN",{month:"long"}) : "All";
    const periodLabel = (month&&year) ? `${monthName} ${year}` : (year ? `Year ${year}` : "Full History");
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 30, size: "A4" });
        const chunks = [];
        doc.on("data", chunk => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        const PW = 595.28; const M = 30;
        doc.rect(M,M,PW-M*2,70).fillAndStroke("#0f172a","#0f172a");
        doc.fillColor("#fff").fontSize(16).font("Helvetica-Bold").text("VIKAS GOODS TRANSPORT CO.",M+10,M+10,{width:PW-M*2-20,align:"center"});
        doc.fontSize(9).font("Helvetica").text("Jharli, Jhajjar (Hr.) | 9416319445, 9728954901, 9728284849",M+10,M+32,{width:PW-M*2-20,align:"center"});
        doc.fontSize(11).font("Helvetica-Bold").text(`VEHICLE STATEMENT — ${String(truckNo).toUpperCase()}`,M+10,M+50,{width:PW-M*2-20,align:"center"});
        let y = M+85;
        doc.fillColor("#000").fontSize(10).font("Helvetica-Bold").text(`Period: ${periodLabel}`,M,y).text(`Generated: ${new Date().toLocaleDateString("en-IN")}`,M,y,{width:PW-M*2,align:"right"});
        y+=18; doc.moveTo(M,y).lineTo(PW-M,y).stroke("#e2e8f0").lineWidth(1); y+=8;
        if (!vouchers.length) {
            doc.fillColor("#64748b").fontSize(11).font("Helvetica").text("No trips found for this period.",M,y,{width:PW-M*2,align:"center"});
            doc.end(); return;
        }
        const colWidths=[30,50,50,90,52,55,55,55,55];
        const headers=["#","Date","LR #","Route","Wt(MT)","Gross","Deduct","Net","Paid?"];
        const colX=[M];
        colWidths.forEach((w,i)=>{ colX.push((colX[i]||M)+w); });
        const drawRow=(rowY,values,isBold,bgColor)=>{
            if(bgColor){ doc.rect(M,rowY-3,PW-M*2,16).fill(bgColor); }
            doc.fillColor("#000").fontSize(7.5).font(isBold?"Helvetica-Bold":"Helvetica");
            values.forEach((val,i)=>{ doc.text(String(val),colX[i],rowY,{width:colWidths[i]-2,align:i>=4?"right":"left"}); });
        };
        drawRow(y,headers,true,"#f1f5f9"); y+=16;
        doc.moveTo(M,y).lineTo(PW-M,y).strokeColor("#000").lineWidth(0.5).stroke(); y+=4;
        let totalGross=0,totalDeductions=0,totalNet=0,paidCount=0;
        vouchers.forEach((v,i)=>{
            if(y>750){ doc.addPage(); y=M+20; drawRow(y,headers,true,"#f1f5f9"); y+=20; }
            const fin=computeVoucherFinancials(v);
            totalGross+=fin.gross; totalDeductions+=fin.totalDeductions; totalNet+=fin.net;
            if(v.paidBalance||v.paymentClearedDate) paidCount++;
            const lrLabel=(v.deliveries&&v.deliveries.length>0)?v.deliveries.map(d=>d.lrNo).filter(Boolean).join(","):(v.lrNo||"?");
            const route=`${v.source||"?"}→${v.destination||"?"}`;
            const isPaid=(v.paidBalance||v.paymentClearedDate)?"Yes":"No";
            drawRow(y,[i+1,fmtDate(v.date),lrLabel,route.length>20?route.slice(0,19)+"…":route,fin.weight.toFixed(1),fin.gross.toFixed(0),fin.totalDeductions.toFixed(0),fin.net.toFixed(0),isPaid],false,i%2===0?"#fff":"#f8fafc");
            y+=16;
        });
        y+=4; doc.moveTo(M,y).lineTo(PW-M,y).strokeColor("#000").lineWidth(1).stroke(); y+=4;
        drawRow(y,["",`${vouchers.length} trips`,"","","",totalGross.toFixed(0),totalDeductions.toFixed(0),totalNet.toFixed(0),`${paidCount}/${vouchers.length}`],true,"#e0f2fe");
        y+=24;
        doc.rect(M,y,PW-M*2,55).fill("#0f172a");
        doc.fillColor("#fff").fontSize(9.5).font("Helvetica-Bold").text(`Total Gross: ${fmtRs(totalGross)}`,M+12,y+8).text(`Total Deductions: ${fmtRs(totalDeductions)}`,M+12,y+22).text(`Net Freight: ${fmtRs(totalNet)}`,M+12,y+36);
        doc.fontSize(13).text(`Net Payable: ${fmtRs(totalNet)}`,M,y+20,{width:PW-M*2-12,align:"right"});
        y+=65;
        doc.fillColor("#64748b").fontSize(7.5).font("Helvetica").text(`Generated by VGTC Management System | ${new Date().toLocaleString("en-IN")}`,M,y,{width:PW-M*2,align:"center"});
        doc.end();
    });
}

async function generateVehicleMonthlyExcel(truckNo, month, year, req) {
    const vouchers = await fetchVouchersForTruck(truckNo, month, year, req);
    const monthName = month ? new Date(2000,month-1,1).toLocaleString("en-IN",{month:"long"}) : "All";
    const periodLabel = (month&&year)?`${monthName} ${year}`:(year?`Year ${year}`:"Full History");
    const wb = XLSX.utils.book_new();
    const rows = [
        ["VIKAS GOODS TRANSPORT CO. — VEHICLE STATEMENT"],
        [`Truck: ${String(truckNo).toUpperCase()}`],
        [`Period: ${periodLabel}`],
        [`Generated: ${new Date().toLocaleString("en-IN")}`],
        [],
        ["#","Date","LR No","Voucher No","Source","Destination","Party","Weight (MT)","Rate","Gross","Diesel Adv","Cash Adv","Online Adv","Munshi","Shortage","Commission","Tyre+Grease","Extra","Total Deductions","Net Freight","Paid?","Payment Date"]
    ];
    let tg=0,td=0,tn=0,tw=0;
    vouchers.forEach((v,i)=>{
        const fin=computeVoucherFinancials(v);
        tg+=fin.gross; td+=fin.totalDeductions; tn+=fin.net; tw+=fin.weight;
        const lrLabel=(v.deliveries&&v.deliveries.length>0)?v.deliveries.map(d=>d.lrNo).filter(Boolean).join(", "):(v.lrNo||"");
        rows.push([i+1,fmtDate(v.date),lrLabel,v.voucherNo||"",v.source||"",v.destination||"",v.partyName||"",fin.weight,fin.rate,fin.gross,fin.diesel,fin.cash,fin.online,fin.munshi,fin.shortage,fin.commission,fin.tyrePuncture+fin.tyreGreasing,fin.extraCash,fin.totalDeductions,fin.net,(v.paidBalance||v.paymentClearedDate)?"Paid":"Pending",fmtDate(v.paymentClearedDate)]);
    });
    rows.push([]);
    rows.push(["","TOTALS","","","","","",tw.toFixed(2),"",tg.toFixed(2),"","","","","","","","",td.toFixed(2),tn.toFixed(2),"",""]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"]=[{wch:5},{wch:12},{wch:12},{wch:14},{wch:14},{wch:14},{wch:20},{wch:10},{wch:8},{wch:12},{wch:10},{wch:10},{wch:10},{wch:8},{wch:10},{wch:10},{wch:10},{wch:10},{wch:14},{wch:12},{wch:10},{wch:14}];
    XLSX.utils.book_append_sheet(wb, ws, "Trips");
    const sumWs = XLSX.utils.aoa_to_sheet([["VIKAS GOODS TRANSPORT CO."],["Vehicle Statement Summary"],[],["Truck",String(truckNo).toUpperCase()],["Period",periodLabel],["Total Trips",vouchers.length],["Total Weight (MT)",tw.toFixed(2)],["Gross Freight",tg.toFixed(2)],["Total Deductions",td.toFixed(2)],["Net Freight",tn.toFixed(2)],[],["Generated",new Date().toLocaleString("en-IN")]]);
    XLSX.utils.book_append_sheet(wb, sumWs, "Summary");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

module.exports = { generateVehicleMonthlyPdf, generateVehicleMonthlyExcel, fetchVouchersForTruck, computeVoucherFinancials };
