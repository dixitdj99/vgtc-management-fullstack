const nodemailer = require('nodemailer');
const vehicleService = require('./vehicleService');
const mileageService = require('./mileageService');
const maintenanceService = require('./maintenanceService');
require('dotenv').config();

const ALERT_EMAIL = "vikaskumar909040@gmail.com";

// Returns { status: 'expired'|'near'|'ok', days }  or null if no date
const checkExpiry = (dateStr) => {
    if (!dateStr) return null;
    const expiry = new Date(dateStr);
    if (isNaN(expiry.getTime())) return null;
    const diff = (expiry - new Date()) / (1000 * 60 * 60 * 24);
    if (diff < 0)  return { status: 'expired', days: Math.abs(Math.floor(diff)) };
    if (diff < 30) return { status: 'near',    days: Math.floor(diff) };
    return             { status: 'ok',      days: Math.floor(diff) };
};

const DOC_LABELS = { rc: 'RC', pollution: 'Pollution', permit: 'Permit', insurance: 'Insurance', fitness: 'Fitness', tax: 'Tax' };

const docStatusHtml = (type, date) => {
    const label = DOC_LABELS[type] || type.toUpperCase();
    if (!date) return `<tr><td style="padding:4px 8px;color:#94a3b8">${label}</td><td style="padding:4px 8px;color:#94a3b8">—</td><td style="padding:4px 8px;color:#94a3b8">No date</td></tr>`;
    const r = checkExpiry(date);
    if (!r) return `<tr><td style="padding:4px 8px;color:#94a3b8">${label}</td><td style="padding:4px 8px;color:#94a3b8">${date}</td><td style="padding:4px 8px;color:#94a3b8">Invalid date</td></tr>`;
    const icon  = r.status === 'expired' ? '❌' : r.status === 'near' ? '⚠️' : '✅';
    const color = r.status === 'expired' ? '#b91c1c' : r.status === 'near' ? '#92400e' : '#166534';
    const note  = r.status === 'expired' ? `Expired ${r.days}d ago` : `${r.days}d left`;
    return `<tr><td style="padding:4px 8px;font-weight:600;color:#374151">${label}</td><td style="padding:4px 8px;font-family:monospace;color:#374151">${date}</td><td style="padding:4px 8px;color:${color};font-weight:700">${icon} ${note}</td></tr>`;
};

const SMTP_USER = process.env.SMTP_USER || "vikaskumar909040@gmail.com";
const SMTP_PASS = process.env.SMTP_PASS || "inbxylzvycovjzpt";

const makeTransporter = () => nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS }
});

// Build data for a single vehicle — returns { issues[], docRows[], emiHtml, serviceHtml, mileageHtml }
const buildVehicleSection = async (v, mileageStats, orgId) => {
    const issues  = [];
    const docRows = [];

    // ── Mileage ───────────────────────────────────────────────────
    const truckKey = (v.truckNo || '').replace(/\s/g, '').toUpperCase();
    const stats = mileageStats[truckKey];
    let mileageHtml = '<span style="color:#94a3b8">No mileage data</span>';
    if (stats) {
        if (v.targetMileage > 0) {
            const diff = v.targetMileage - stats.avg;
            if (diff > 0.5) {
                issues.push(`⛽ Fuel avg mismatch: Actual <b>${stats.avg}</b> vs Target <b>${v.targetMileage}</b> km/L (${diff.toFixed(2)} below)`);
                mileageHtml = `<span style="color:#b91c1c;font-weight:700">⚠️ ${stats.avg} km/L (target: ${v.targetMileage})</span>`;
            } else {
                mileageHtml = `<span style="color:#166534">✅ ${stats.avg} km/L (target: ${v.targetMileage})</span>`;
            }
        } else {
            mileageHtml = `<span style="color:#374151">${stats.avg} km/L</span>`;
        }
    }

    // ── Documents ─────────────────────────────────────────────────
    try {
        const docs = JSON.parse(v.docs || '{}');
        ['rc', 'pollution', 'permit', 'insurance', 'fitness', 'tax'].forEach(type => {
            docRows.push(docStatusHtml(type, docs[type]));
            if (docs[type]) {
                const r = checkExpiry(docs[type]);
                if (r && r.status === 'expired') issues.push(`❌ ${DOC_LABELS[type]} EXPIRED (${r.days}d ago)`);
                else if (r && r.status === 'near')    issues.push(`⚠️ ${DOC_LABELS[type]} expiring in ${r.days}d`);
            }
        });
        Object.entries(docs).forEach(([type, date]) => {
            if (!['rc','pollution','permit','insurance','fitness','tax'].includes(type) && date) {
                docRows.push(docStatusHtml(type, date));
                const r = checkExpiry(date);
                if (r && r.status === 'expired') issues.push(`❌ ${type.toUpperCase()} EXPIRED (${r.days}d ago)`);
                else if (r && r.status === 'near')    issues.push(`⚠️ ${type.toUpperCase()} expiring in ${r.days}d`);
            }
        });
    } catch {}

    // National Permit
    if (v.nationalPermitDate) {
        const r = checkExpiry(v.nationalPermitDate);
        if (r) {
            const icon  = r.status === 'expired' ? '❌' : r.status === 'near' ? '⚠️' : '✅';
            const color = r.status === 'expired' ? '#b91c1c' : r.status === 'near' ? '#92400e' : '#166534';
            const note  = r.status === 'expired' ? `Expired ${r.days}d ago` : `${r.days}d left`;
            docRows.push(`<tr><td style="padding:4px 8px;font-weight:600;color:#374151">Nat. Permit</td><td style="padding:4px 8px;font-family:monospace;color:#374151">${v.nationalPermitDate}</td><td style="padding:4px 8px;color:${color};font-weight:700">${icon} ${note}</td></tr>`);
            if (r.status === 'expired') issues.push(`❌ National Permit EXPIRED (${r.days}d ago)`);
            else if (r.status === 'near') issues.push(`⚠️ National Permit expiring in ${r.days}d`);
        }
    }

    // ── EMI — only if dueDate is set in vehicle profile ──────────
    let emiHtml = '';
    try {
        const emi = JSON.parse(v.emiDetails || '{}');
        // Only alert if dueDate is explicitly scheduled in vehicle profile
        if (emi.loanNo && emi.dueDate) {
            const r = checkExpiry(emi.dueDate);
            const amount = emi.due ? `₹${parseFloat(emi.due).toLocaleString('en-IN')}` : 'Amount TBD';
            const paidCount = (emi.paidEmis || []).length;
            const totalTenure = parseInt(emi.tenure) || 0;
            const pendingEmis = totalTenure > 0 ? totalTenure - paidCount : '—';

            if (r && (r.status === 'expired' || r.status === 'near')) {
                const urgency = r.status === 'expired'
                    ? `OVERDUE by ${r.days} day(s)`
                    : `due in ${r.days} day(s)`;
                issues.push(`💰 EMI Payment ${urgency}: <b>${amount}</b> (${emi.bankName || 'Bank'}, Loan: ${emi.loanNo})`);
                emiHtml = `
                    <div style="margin-top:10px;padding:10px 14px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px">
                        <div style="font-size:12px;font-weight:800;color:#92400e;margin-bottom:6px">💰 EMI Alert</div>
                        <div style="font-size:13px;color:#78350f">
                            <b>${amount}/month</b> — ${emi.bankName || 'Bank'} · Loan: <span style="font-family:monospace">${emi.loanNo}</span>
                        </div>
                        <div style="font-size:11px;color:#92400e;margin-top:4px">
                            Due Date: <b>${emi.dueDate}</b> · Paid: ${paidCount} / Pending: ${pendingEmis}
                            ${emi.pending ? ` · Outstanding: ₹${parseFloat(emi.pending).toLocaleString('en-IN')}` : ''}
                        </div>
                    </div>`;
            } else if (r && r.status === 'ok') {
                emiHtml = `
                    <div style="margin-top:10px;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:12px;color:#166534">
                        ✅ EMI ${amount}/month · ${emi.bankName || 'Bank'} · Due: ${emi.dueDate} (${r.days}d away) · Paid: ${paidCount}/${totalTenure || '?'}
                    </div>`;
            }
        }
    } catch {}

    // ── Service Due — from maintenance records ────────────────────
    let serviceHtml = '';
    try {
        const maintAlerts = await maintenanceService.getMaintenanceAlerts(orgId);
        const myAlerts = maintAlerts.filter(a => (a.truckNo || '').replace(/\s/g,'').toUpperCase() === truckKey);
        if (myAlerts.length > 0) {
            const overdueItems  = myAlerts.filter(a => a.status === 'OVERDUE');
            const dueSoonItems  = myAlerts.filter(a => a.status === 'DUE_SOON');
            overdueItems.forEach(a  => issues.push(`🔧 Service OVERDUE: <b>${a.partName}</b> (last: ${a.lastServiceDate})`));
            dueSoonItems.forEach(a  => issues.push(`🔧 Service due soon: <b>${a.partName}</b> (in ${a.daysRemaining}d)`));

            const rows = myAlerts.map(a => {
                const icon  = a.status === 'OVERDUE' ? '❌' : '⚠️';
                const color = a.status === 'OVERDUE' ? '#b91c1c' : '#92400e';
                return `<tr>
                    <td style="padding:4px 8px;font-weight:600;color:#374151">${a.partName}</td>
                    <td style="padding:4px 8px;font-family:monospace;color:#374151">${a.lastServiceDate}</td>
                    <td style="padding:4px 8px;color:${color};font-weight:700">${icon} ${a.status === 'OVERDUE' ? 'Overdue' : `${a.daysRemaining}d left`}</td>
                </tr>`;
            }).join('');

            serviceHtml = `
                <div style="margin-top:10px">
                    <div style="font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">🔧 Service Due</div>
                    <table style="width:100%;border-collapse:collapse;font-size:12px">
                        <thead><tr style="background:#fef9c3"><th style="padding:4px 8px;text-align:left;color:#713f12;font-size:11px">Part</th><th style="padding:4px 8px;text-align:left;color:#713f12;font-size:11px">Last Serviced</th><th style="padding:4px 8px;text-align:left;color:#713f12;font-size:11px">Status</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`;
        }
    } catch {}

    return { issues, docRows, emiHtml, serviceHtml, mileageHtml };
};

const buildVehicleCardHtml = (v, section) => {
    const { issues, docRows, emiHtml, serviceHtml, mileageHtml } = section;
    const hasIssues   = issues.length > 0;
    const borderColor = hasIssues ? '#fee2e2' : '#d1fae5';
    const headerColor = hasIssues ? '#b91c1c' : '#166534';
    const bgColor     = hasIssues ? '#fffcfc' : '#f0fdf4';
    return `
        <div style="margin-bottom:20px;padding:16px;border:1px solid ${borderColor};border-radius:8px;background:${bgColor}">
            <h3 style="color:${headerColor};margin:0 0 10px 0;font-size:14px;border-bottom:1px solid ${borderColor};padding-bottom:8px">
                ${hasIssues ? '🚨' : '✅'} ${v.truckNo}${v.ownerName ? ` — ${v.ownerName}` : ''}
                ${v.vehicleType ? `<span style="font-size:10px;font-weight:400;color:#64748b;margin-left:8px">${v.vehicleType}</span>` : ''}
            </h3>
            ${hasIssues ? `<div style="margin-bottom:10px;padding:8px;background:#fee2e2;border-radius:6px"><b style="color:#b91c1c;font-size:12px">⚠️ Issues Found:</b><ul style="margin:4px 0 0 0;padding-left:18px;color:#7f1d1d;font-size:12px">${issues.map(i => `<li style="margin-bottom:4px">${i}</li>`).join('')}</ul></div>` : ''}
            <div style="font-size:12px;margin-bottom:8px"><b style="color:#374151">Mileage:</b> ${mileageHtml}</div>
            <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead><tr style="background:#f1f5f9"><th style="padding:4px 8px;text-align:left;color:#64748b;font-size:11px">Document</th><th style="padding:4px 8px;text-align:left;color:#64748b;font-size:11px">Expiry Date</th><th style="padding:4px 8px;text-align:left;color:#64748b;font-size:11px">Status</th></tr></thead>
                <tbody>${docRows.join('')}</tbody>
            </table>
            ${emiHtml}
            ${serviceHtml}
        </div>`;
};

const buildEmailHtml = (title, subtitle, summaryLine, vehicleCards) => {
    const sentAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    return `
        <div style="font-family:sans-serif;max-width:680px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
            <div style="background:#1e293b;color:white;padding:20px;text-align:center">
                <h1 style="margin:0;font-size:20px">${title}</h1>
                <p style="margin:6px 0 0 0;opacity:0.8;font-size:13px">${subtitle} · ${sentAt}</p>
            </div>
            <div style="padding:20px;background:white">
                ${summaryLine ? `<div style="margin-bottom:16px;padding:10px 14px;background:#f8fafc;border-radius:8px;font-size:12px;color:#374151">${summaryLine}</div>` : ''}
                ${vehicleCards}
            </div>
            <div style="background:#f8fafc;padding:12px;text-align:center;font-size:11px;color:#94a3b8">
                VGTC Intelligent Asset System · ${sentAt}
            </div>
        </div>`;
};

// ── Fleet-wide report (all vehicles) ──────────────────────────────────────────
const sendDailyAlertReport = async (orgId, col) => {
    const transporter = makeTransporter();
    try {
        const vehicles    = await vehicleService.getAllVehicles(orgId, col);
        if (!vehicles || vehicles.length === 0) {
            return { success: false, message: 'No vehicles found in database.' };
        }

        // Pass a fake req-like object so mileageService uses correct env collection
        const fakeReq = { user: {}, query: {}, orgId };
        const mileageStats = await mileageService.calculateMileageSummary(orgId, fakeReq);

        let criticalAlerts = [];
        const cardHtmlList = [];

        for (const v of vehicles) {
            const section = await buildVehicleSection(v, mileageStats, orgId);
            cardHtmlList.push(buildVehicleCardHtml(v, section));
            if (section.issues.length > 0) criticalAlerts.push(v.truckNo);
        }

        const alertCount = criticalAlerts.length;
        const titleEmoji = alertCount > 0 ? '🚨' : '✅';
        const title      = alertCount > 0 ? '🚨 VGTC Fleet Alert Report' : '✅ VGTC Fleet Status Report';
        const subtitle   = alertCount > 0 ? `${alertCount} vehicle(s) require attention` : 'All vehicles OK';
        const summary    = `<b>Total:</b> ${vehicles.length} &nbsp;|&nbsp; <span style="color:#b91c1c"><b>Issues:</b> ${alertCount}</span> &nbsp;|&nbsp; <span style="color:#166534"><b>OK:</b> ${vehicles.length - alertCount}</span>`;

        const emailBody = buildEmailHtml(title, subtitle, summary, cardHtmlList.join(''));
        const subject   = alertCount > 0
            ? `🚨 VGTC Fleet: ${alertCount}/${vehicles.length} vehicle(s) need attention`
            : `✅ VGTC Fleet: All ${vehicles.length} vehicles OK`;

        console.log(`[Alert] Fleet report: ${alertCount}/${vehicles.length} have issues`);
        await transporter.sendMail({ from: `"VGTC Fleet Alerts" <${SMTP_USER}>`, to: ALERT_EMAIL, subject, html: emailBody });
        console.log('[Alert] Email sent.');
        return { success: true, count: alertCount, total: vehicles.length };
    } catch (err) {
        console.error('[Alert] Fleet report error:', err);
        return { success: false, error: err.message };
    }
};

// ── Single-vehicle alert ───────────────────────────────────────────────────────
const sendVehicleAlert = async (orgId, vehicleId, col) => {
    const transporter = makeTransporter();
    try {
        const vehicles = await vehicleService.getAllVehicles(orgId, col);
        const v = vehicles.find(x => x.id === vehicleId);
        if (!v) return { success: false, message: 'Vehicle not found.' };

        const fakeReq  = { user: {}, query: {}, orgId };
        const mileageStats = await mileageService.calculateMileageSummary(orgId, fakeReq);

        const section   = await buildVehicleSection(v, mileageStats, orgId);
        const cardHtml  = buildVehicleCardHtml(v, section);
        const alertCount = section.issues.length;

        const title    = alertCount > 0 ? `🚨 Alert: ${v.truckNo}` : `✅ Status OK: ${v.truckNo}`;
        const subtitle = alertCount > 0 ? `${alertCount} issue(s) found` : 'No issues detected';
        const emailBody = buildEmailHtml(title, subtitle, '', cardHtml);
        const subject   = alertCount > 0
            ? `🚨 VGTC Vehicle Alert: ${v.truckNo} — ${alertCount} issue(s)`
            : `✅ VGTC Vehicle Status: ${v.truckNo} — All OK`;

        console.log(`[Alert] Vehicle ${v.truckNo}: ${alertCount} issues`);
        await transporter.sendMail({ from: `"VGTC Fleet Alerts" <${SMTP_USER}>`, to: ALERT_EMAIL, subject, html: emailBody });
        console.log('[Alert] Vehicle alert email sent.');
        return { success: true, truckNo: v.truckNo, count: alertCount };
    } catch (err) {
        console.error('[Alert] Vehicle alert error:', err);
        return { success: false, error: err.message };
    }
};

module.exports = { sendDailyAlertReport, sendVehicleAlert };
