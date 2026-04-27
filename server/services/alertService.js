const nodemailer = require('nodemailer');
const vehicleService = require('./vehicleService');
require('dotenv').config();

const ALERT_EMAIL = "vikaskumar909040@gmail.com";

// SMTP Configuration for Gmail
// Note: For Gmail, use an "App Password" (https://myaccount.google.com/apppasswords)
const checkExpiry = (dateStr) => {
    if (!dateStr) return null;
    const expiry = new Date(dateStr);
    const now = new Date();
    const diff = (expiry - now) / (1000 * 60 * 60 * 24);
    if (diff < 0) return 'expired';
    if (diff < 30) return 'near';
    return 'ok';
};

const sendDailyAlertReport = async (col) => {
    // Initialize transporter inside the function to ensure env vars are loaded
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.SMTP_USER || "vikaskumar909040@gmail.com", 
            pass: process.env.SMTP_PASS || "inbxylzvycovjzpt" // Use provided fallback
        },
        requireTLS: true
    });

    try {
        const vehicles = await vehicleService.getAllVehicles(col);
        let criticalAlerts = [];

        vehicles.forEach(v => {
            let issues = [];
            
            // Document Checks
            try {
                const docs = JSON.parse(v.docs || '{}');
                Object.entries(docs).forEach(([type, date]) => {
                    const status = checkExpiry(date);
                    if (status === 'expired') issues.push(`❌ ${type.toUpperCase()} EXPIRED on ${date}`);
                    if (status === 'near') issues.push(`⚠️ ${type.toUpperCase()} expiring soon: ${date}`);
                });
            } catch (e) {}

            // National Permit
            if (v.nationalPermitDate) {
                const npStatus = checkExpiry(v.nationalPermitDate);
                if (npStatus === 'expired') issues.push(`❌ National Permit EXPIRED on ${v.nationalPermitDate}`);
                if (npStatus === 'near') issues.push(`⚠️ National Permit expiring: ${v.nationalPermitDate}`);
            }

            // EMI Due
            try {
                const emi = JSON.parse(v.emiDetails || '{}');
                if (emi.startDate) {
                    const dueDay = new Date(emi.startDate).getDate();
                    const today = new Date().getDate();
                    if (Math.abs(dueDay - today) <= 3) {
                        issues.push(`💰 EMI Due in approx ${Math.abs(dueDay - today)} days (Due Date: Day ${dueDay})`);
                    }
                }
            } catch (e) {}

            if (issues.length > 0) {
                criticalAlerts.push({
                    truckNo: v.truckNo,
                    issues: issues
                });
            }
        });

        if (criticalAlerts.length === 0) return { success: true, message: "No alerts today." };

        const emailBody = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                <div style="background: #ef4444; color: white; padding: 20px; text-align: center;">
                    <h1 style="margin: 0; font-size: 20px;">🚨 VGTC Critical Fleet Report</h1>
                    <p style="margin: 5px 0 0 0; opacity: 0.9;">Daily Expiry & Financial Alert</p>
                </div>
                <div style="padding: 24px; background: white;">
                    ${criticalAlerts.map(a => `
                        <div style="margin-bottom: 24px; padding: 16px; border: 1px solid #fee2e2; border-radius: 8px; background: #fffcfc;">
                            <h3 style="color: #b91c1c; margin: 0 0 12px 0; border-bottom: 2px solid #fee2e2; padding-bottom: 8px;">Vehicle: ${a.truckNo}</h3>
                            <ul style="color: #7f1d1d; margin: 0; padding-left: 20px;">
                                ${a.issues.map(issue => `<li style="margin-bottom: 6px;">${issue}</li>`).join('')}
                            </ul>
                        </div>
                    `).join('')}
                </div>
                <div style="background: #f8fafc; padding: 15px; text-align: center; font-size: 11px; color: #64748b;">
                    Sent automatically by VGTC Intelligent Asset System<br/>
                    Registered Mail: ${ALERT_EMAIL}
                </div>
            </div>
        `;

        console.log("Attempting to send alert email to:", ALERT_EMAIL);
        
        if (process.env.SMTP_PASS) {
            await transporter.sendMail({
                from: '"VGTC Fleet Alerts" <vikaskumar909040@gmail.com>',
                to: ALERT_EMAIL,
                subject: `🚨 VGTC Fleet Alerts: ${criticalAlerts.length} Vehicles Require Attention`,
                html: emailBody
            });
            console.log("Alert email sent successfully.");
        } else {
            console.log("SKIPPING EMAIL: SMTP_PASS not found in .env");
        }

        return { success: true, count: criticalAlerts.length };
    } catch (error) {
        console.error("Alert service error:", error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendDailyAlertReport
};
