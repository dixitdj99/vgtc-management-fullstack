const nodemailer = require('nodemailer');
const vehicleService = require('./vehicleService');
require('dotenv').config();

const ALERT_EMAIL = process.env.ALERT_EMAIL || "vikaskumar909040@gmail.com";

// Human-friendly document name map
const DOC_LABELS = {
    rc:        'RC (Registration Certificate)',
    insurance: 'Insurance',
    permit:    'Permit',
    pollution: 'Pollution (PUC)',
    fitness:   'Fitness Certificate',
    tax:       'Road Tax',
    nationalPermit: 'National Permit',
};

const getDaysDiff = (dateStr) => {
    if (!dateStr) return null;
    const expiry = new Date(dateStr);
    if (isNaN(expiry)) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);
    return Math.round((expiry - now) / (1000 * 60 * 60 * 24));
};

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};


    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.SMTP_USER || "vikaskumar909040@gmail.com",
            pass: process.env.SMTP_PASS || "inbxylzvycovjzpt"
        },
        requireTLS: true
    });

    try {


        for (const v of vehicles) {
            // Standard docs from v.docs JSON
            let docs = {};
            try { docs = JSON.parse(v.docs || '{}'); } catch (e) {}

            const allDocs = { ...docs };
            if (v.nationalPermitDate) allDocs['nationalPermit'] = v.nationalPermitDate;

            for (const [docKey, dateStr] of Object.entries(allDocs)) {
                if (!dateStr) continue;
                const days = getDaysDiff(dateStr);
                if (days === null) continue;

                if (!docAlerts[docKey]) docAlerts[docKey] = { expired: [], near: [] };

                if (days < 0) {
                    docAlerts[docKey].expired.push({ truckNo: v.truckNo, date: dateStr, daysAgo: Math.abs(days) });
                } else if (days <= 30) {
                    docAlerts[docKey].near.push({ truckNo: v.truckNo, date: dateStr, daysLeft: days });
                }
            }
        }

        // Count total affected vehicles across all doc types
        const totalExpired = Object.values(docAlerts).reduce((s, d) => s + d.expired.length, 0);
        const totalNear    = Object.values(docAlerts).reduce((s, d) => s + d.near.length, 0);
        const hasAnyAlert  = totalExpired + totalNear > 0;

        const todayStr = new Date().toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
        });
        const nowStr = new Date().toLocaleString('en-IN', {
            dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Kolkata'
        });

        const smtpUser = process.env.SMTP_USER || "vikaskumar909040@gmail.com";
        const smtpPass = process.env.SMTP_PASS || "inbxylzvycovjzpt";

        let emailSubject, emailBody;

        if (!hasAnyAlert) {
            // ── All Clear ──────────────────────────────────────────────
            emailSubject = `✅ Vehicle Doc Alert — ${todayStr} — All Clear`;
            emailBody = `
                <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;border:1px solid #d1fae5;border-radius:14px;overflow:hidden;">
                    <div style="background:linear-gradient(135deg,#059669,#10b981);color:white;padding:28px 24px;text-align:center;">
                        <div style="font-size:42px;margin-bottom:8px;">✅</div>
                        <h1 style="margin:0;font-size:22px;font-weight:800;">All Vehicles — Documents Clear</h1>
                        <p style="margin:6px 0 0;opacity:0.85;font-size:13px;">Vehicle Doc Alert &nbsp;|&nbsp; ${todayStr}</p>
                    </div>
                    <div style="padding:32px;background:#fff;text-align:center;">
                        <div style="font-size:16px;color:#065f46;font-weight:600;margin-bottom:6px;">All ${vehicles.length} vehicles checked.</div>
                        <div style="font-size:13px;color:#6b7280;">No expired or expiring-soon documents found.</div>
                    </div>
                    <div style="background:#f0fdf4;padding:14px;text-align:center;font-size:11px;color:#6b7280;">
                        Checked on ${nowStr} &nbsp;|&nbsp; VGTC Intelligent Asset System
                    </div>
                </div>
            `;
        } else {
            // ── Document-wise Alert Report ─────────────────────────────
            emailSubject = `🚨 Vehicle Doc Alert — ${todayStr} — ${totalExpired} Expired, ${totalNear} Expiring Soon`;

            // Build one section per document type that has issues
            const docSections = Object.entries(docAlerts)
                .filter(([, d]) => d.expired.length > 0 || d.near.length > 0)
                .map(([docKey, data]) => {
                    const label = DOC_LABELS[docKey] || docKey.toUpperCase();

                    // Sort: expired first (most recently expired last), near by days left asc
                    data.expired.sort((a, b) => b.daysAgo - a.daysAgo);
                    data.near.sort((a, b) => a.daysLeft - b.daysLeft);

                    const expiredRows = data.expired.map(e => `
                        <tr>
                            <td style="padding:9px 14px;border-bottom:1px solid #fee2e2;font-weight:700;color:#1e293b;font-size:13px;">${e.truckNo}</td>
                            <td style="padding:9px 14px;border-bottom:1px solid #fee2e2;color:#6b7280;font-size:13px;">${formatDate(e.date)}</td>
                            <td style="padding:9px 14px;border-bottom:1px solid #fee2e2;font-size:12px;">
                                <span style="background:#fef2f2;color:#dc2626;padding:3px 10px;border-radius:20px;font-weight:800;border:1px solid #fecaca;">
                                    ❌ EXPIRED &nbsp;(${e.daysAgo}d ago)
                                </span>
                            </td>
                        </tr>
                    `).join('');

                    const nearRows = data.near.map(n => `
                        <tr>
                            <td style="padding:9px 14px;border-bottom:1px solid #fef9c3;font-weight:700;color:#1e293b;font-size:13px;">${n.truckNo}</td>
                            <td style="padding:9px 14px;border-bottom:1px solid #fef9c3;color:#6b7280;font-size:13px;">${formatDate(n.date)}</td>
                            <td style="padding:9px 14px;border-bottom:1px solid #fef9c3;font-size:12px;">
                                <span style="background:#fefce8;color:#b45309;padding:3px 10px;border-radius:20px;font-weight:800;border:1px solid #fde68a;">
                                    ⚠️ Need to Update &nbsp;(${n.daysLeft === 0 ? 'Today' : n.daysLeft + 'd left'})
                                </span>
                            </td>
                        </tr>
                    `).join('');

                    const sectionBg  = data.expired.length > 0 ? '#fff5f5' : '#fffbeb';
                    const borderColor= data.expired.length > 0 ? '#fca5a5' : '#fcd34d';
                    const headerBg   = data.expired.length > 0 ? '#ef4444' : '#f59e0b';
                    const badge = data.expired.length > 0
                        ? `<span style="background:rgba(255,255,255,0.2);padding:2px 10px;border-radius:20px;font-size:11px;">${data.expired.length} Expired${data.near.length > 0 ? ', ' + data.near.length + ' Expiring' : ''}</span>`
                        : `<span style="background:rgba(255,255,255,0.2);padding:2px 10px;border-radius:20px;font-size:11px;">${data.near.length} Expiring Soon</span>`;

                    return `
                        <div style="margin-bottom:24px;border:1px solid ${borderColor};border-radius:10px;overflow:hidden;">
                            <div style="background:${headerBg};color:white;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;">
                                <span style="font-weight:800;font-size:15px;">📄 ${label}</span>
                                ${badge}
                            </div>
                            <table style="width:100%;border-collapse:collapse;background:${sectionBg};">
                                <thead>
                                    <tr style="background:rgba(0,0,0,0.04);">
                                        <th style="padding:8px 14px;text-align:left;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Vehicle No.</th>
                                        <th style="padding:8px 14px;text-align:left;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Expiry Date</th>
                                        <th style="padding:8px 14px;text-align:left;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${expiredRows}
                                    ${nearRows}
                                </tbody>
                            </table>
                        </div>
                    `;
                }).join('');

            emailBody = `
                <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:680px;margin:0 auto;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">

                    <!-- Header -->
                    <div style="background:linear-gradient(135deg,#dc2626,#ef4444);color:white;padding:24px;text-align:center;">
                        <div style="font-size:36px;margin-bottom:6px;">🚨</div>
                        <h1 style="margin:0;font-size:22px;font-weight:800;">Vehicle Document Alert</h1>
                        <p style="margin:6px 0 0;opacity:0.85;font-size:13px;">${todayStr}</p>
                    </div>

                    <!-- Summary bar -->
                    <div style="display:flex;background:#1e293b;color:white;text-align:center;">
                        <div style="flex:1;padding:16px 8px;border-right:1px solid rgba(255,255,255,0.1);">
                            <div style="font-size:28px;font-weight:900;color:#f87171;">${totalExpired}</div>
                            <div style="font-size:11px;opacity:0.7;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Expired</div>
                        </div>
                        <div style="flex:1;padding:16px 8px;border-right:1px solid rgba(255,255,255,0.1);">
                            <div style="font-size:28px;font-weight:900;color:#fbbf24;">${totalNear}</div>
                            <div style="font-size:11px;opacity:0.7;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Need to Update</div>
                        </div>
                        <div style="flex:1;padding:16px 8px;">
                            <div style="font-size:28px;font-weight:900;color:#94a3b8;">${vehicles.length}</div>
                            <div style="font-size:11px;opacity:0.7;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Total Vehicles</div>
                        </div>
                    </div>

                    <!-- Document sections -->
                    <div style="padding:24px;background:#f8fafc;">
                        ${docSections}
                    </div>

                    <!-- Footer -->
                    <div style="background:#f1f5f9;padding:14px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
                        Generated on ${nowStr} &nbsp;|&nbsp; VGTC Intelligent Asset System &nbsp;|&nbsp; ${ALERT_EMAIL}
                    </div>
                </div>
            `;
        }

        console.log(`[Alert] Sending to ${ALERT_EMAIL} — Expired: ${totalExpired}, Near: ${totalNear}`);

        if (smtpUser && smtpPass) {
            await transporter.sendMail({
                from: `"VGTC Fleet Alerts" <${smtpUser}>`,
                to: ALERT_EMAIL,
                subject: emailSubject,
                html: emailBody
            });
            console.log('[Alert] Email sent successfully.');
        } else {
            console.log('[Alert] SKIPPING: SMTP credentials missing.');
        }

        // Also fire EMI report email in parallel
        sendEmiReport(col).catch(e => console.error('[EMI background]', e.message));

        return { success: true, totalExpired, totalNear };
    } catch (error) {
        console.error('Alert service error:', error);
        return { success: false, error: error.message };
    }
};

// ── EMI Schedule Email ────────────────────────────────────────────────────────

const sendEmiReport = async (col) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.SMTP_USER || "vikaskumar909040@gmail.com",
            pass: process.env.SMTP_PASS || "inbxylzvycovjzpt"
        },
        requireTLS: true
    });

    try {
        const vehicles = await vehicleService.getAllVehicles(col);

        // Only vehicles whose EMI is due EXACTLY today (day-of-month match)
        const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getDate();
        const emiVehicles = [];
        for (const v of vehicles) {
            let emi = {};
            try { emi = JSON.parse(v.emiDetails || '{}'); } catch (e) {}
            if (!emi.startDate) continue;                          // no start date = no schedule

            const dueDayNum = new Date(emi.startDate).getDate();
            if (dueDayNum !== today) continue;                     // ← only today's EMIs

            const totalTenure  = parseInt(emi.tenure)   || 0;
            const paidCount    = (emi.paidEmis || []).length;
            const pendingCount = Math.max(0, totalTenure - paidCount);
            const monthlyEmi   = parseFloat(emi.due)     || 0;
            const pendingAmt   = parseFloat(emi.pending) || (pendingCount * monthlyEmi) || 0;
            const totalLoan    = parseFloat(emi.total)   || 0;
            const interestRate = parseFloat(emi.interestRate) || 0;

            const suffix = today === 1 ? 'st' : today === 2 ? 'nd' : today === 3 ? 'rd' : 'th';
            const dueDayStr = `${today}${suffix} of every month`;

            emiVehicles.push({
                truckNo:     v.truckNo,
                bankName:    emi.bankName  || '—',
                loanNo:      emi.loanNo    || '—',
                monthlyEmi,
                totalLoan,
                interestRate,
                totalTenure,
                paidCount,
                pendingCount,
                pendingAmt,
                dueDayStr,
            });
        }

        const todayStr = new Date().toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
        });
        const nowStr = new Date().toLocaleString('en-IN', {
            dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Kolkata'
        });

        const smtpUser = process.env.SMTP_USER || "vikaskumar909040@gmail.com";
        const smtpPass = process.env.SMTP_PASS || "inbxylzvycovjzpt";

        // ── Skip entirely if no EMIs are due today ──
        if (emiVehicles.length === 0) {
            console.log(`[EMI] No EMIs scheduled for today (${today}). Skipping email.`);
            return { success: true, count: 0, skipped: true };
        }

        const totalOutstanding = emiVehicles.reduce((s, e) => s + e.pendingAmt, 0);

        let emailBody;

        { // always the data table branch (empty case skipped above via early return)
            // Sort by pending amount descending
            emiVehicles.sort((a, b) => b.pendingAmt - a.pendingAmt);

            const tableRows = emiVehicles.map(e => {
                const progressPct = e.totalTenure > 0 ? Math.round((e.paidCount / e.totalTenure) * 100) : 0;

                return `
                    <tr style="background:#ffffff;border-bottom:1px solid #e2e8f0;">
                        <td style="padding:12px 14px;font-weight:800;color:#1e293b;font-size:13px;white-space:nowrap;">
                            🚛 ${e.truckNo}<br/>
                            <span style="font-size:10px;font-weight:500;color:#94a3b8;font-family:monospace;">${e.loanNo}</span>
                        </td>
                        <td style="padding:12px 14px;">
                            <div style="font-weight:700;color:#4f46e5;font-size:13px;">${e.bankName}</div>
                            <div style="font-size:11px;color:#94a3b8;">${e.interestRate ? e.interestRate + '% p.a.' : ''}</div>
                        </td>
                        <td style="padding:12px 14px;text-align:center;">
                            <div style="font-size:20px;font-weight:900;color:#1e293b;">₹${e.monthlyEmi.toLocaleString('en-IN')}</div>
                            <div style="font-size:10px;color:#94a3b8;">${e.dueDayStr}</div>
                        </td>
                        <td style="padding:12px 14px;text-align:center;">
                            <div style="font-size:12px;color:#059669;font-weight:700;">${e.paidCount} Paid</div>
                            <div style="font-size:12px;color:#ef4444;font-weight:700;">${e.pendingCount} Left</div>
                            <div style="font-size:10px;color:#94a3b8;">of ${e.totalTenure} total</div>
                            <div style="background:#e2e8f0;border-radius:99px;height:5px;margin-top:5px;overflow:hidden;">
                                <div style="background:#059669;height:100%;width:${progressPct}%;border-radius:99px;"></div>
                            </div>
                        </td>
                        <td style="padding:12px 14px;text-align:right;">
                            <div style="font-size:16px;font-weight:900;color:#dc2626;">₹${e.pendingAmt.toLocaleString('en-IN')}</div>
                            <div style="font-size:10px;color:#94a3b8;">Outstanding</div>
                        </td>
                    </tr>`;
            }).join('');

            emailBody = `
                <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:760px;margin:0 auto;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">

                    <!-- Header -->
                    <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;padding:24px;text-align:center;">
                        <div style="font-size:36px;margin-bottom:6px;">🏦</div>
                        <h1 style="margin:0;font-size:22px;font-weight:800;">EMI Schedule Report</h1>
                        <p style="margin:6px 0 0;opacity:0.85;font-size:13px;">${todayStr}</p>
                    </div>

                    <!-- Summary bar -->
                    <div style="display:flex;background:#1e293b;color:white;text-align:center;">
                        <div style="flex:1;padding:16px 8px;border-right:1px solid rgba(255,255,255,0.1);">
                            <div style="font-size:26px;font-weight:900;color:#a5b4fc;">${emiVehicles.length}</div>
                            <div style="font-size:11px;opacity:0.7;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">EMIs Due Today</div>
                        </div>
                        <div style="flex:1;padding:16px 8px;border-right:1px solid rgba(255,255,255,0.1);">
                            <div style="font-size:26px;font-weight:900;color:#fbbf24;">⚡ TODAY</div>
                            <div style="font-size:11px;opacity:0.7;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">EMI Due Date</div>
                        </div>
                        <div style="flex:1;padding:16px 8px;">
                            <div style="font-size:22px;font-weight:900;color:#f87171;">₹${totalOutstanding.toLocaleString('en-IN')}</div>
                            <div style="font-size:11px;opacity:0.7;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Total Outstanding</div>
                        </div>
                    </div>

                    <!-- Table -->
                    <div style="overflow-x:auto;background:#fff;">
                        <table style="width:100%;border-collapse:collapse;min-width:600px;">
                            <thead>
                                <tr style="background:#f1f5f9;">
                                    <th style="padding:10px 14px;text-align:left;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Vehicle / Loan No.</th>
                                    <th style="padding:10px 14px;text-align:left;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Bank</th>
                                    <th style="padding:10px 14px;text-align:center;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Monthly EMI</th>
                                    <th style="padding:10px 14px;text-align:center;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">EMI Progress</th>
                                    <th style="padding:10px 14px;text-align:right;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Remaining</th>
                                </tr>
                            </thead>
                            <tbody>${tableRows}</tbody>
                        </table>
                    </div>

                    <!-- Footer -->
                    <div style="background:#f8fafc;padding:14px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;">
                        Generated on ${nowStr} &nbsp;|&nbsp; VGTC Intelligent Asset System &nbsp;|&nbsp; ${ALERT_EMAIL}
                    </div>
                </div>`;
        }

        const emailSubject = `🏦 Vehicle EMI Due Today — ${todayStr} — ${emiVehicles.length} Vehicle${emiVehicles.length > 1 ? 's' : ''} — ₹${emiVehicles.reduce((s,e)=>s+e.monthlyEmi,0).toLocaleString('en-IN')} Total`;

        console.log(`[EMI] Sending EMI report to ${ALERT_EMAIL} (${emiVehicles.length} loans)...`);

        if (smtpUser && smtpPass) {
            await transporter.sendMail({
                from: `"VGTC Fleet Alerts" <${smtpUser}>`,
                to: ALERT_EMAIL,
                subject: emailSubject,
                html: emailBody
            });
            console.log('[EMI] Email sent successfully.');
        }

        return { success: true, count: emiVehicles.length };
    } catch (error) {
        console.error('EMI report error:', error);
        return { success: false, error: error.message };
    }
};

module.exports = { sendDailyAlertReport, sendEmiReport };
