const nodemailer = require('nodemailer');
require('dotenv').config();

// Shipped placeholder from apphosting.yaml. Treated as "not configured" so a
// forgotten deploy step fails loudly at startup instead of silently swallowing
// every OTP, password reset, and fleet alert.
const PLACEHOLDER_SMTP_USER = 'your-email@gmail.com';

const isEmailConfigured = () =>
    !!process.env.SMTP_USER &&
    process.env.SMTP_USER !== PLACEHOLDER_SMTP_USER &&
    !!process.env.SMTP_PASS;

if (!isEmailConfigured()) {
    const reason = process.env.SMTP_USER === PLACEHOLDER_SMTP_USER
        ? `SMTP_USER is still the placeholder "${PLACEHOLDER_SMTP_USER}"`
        : 'SMTP_USER or SMTP_PASS is not set';
    console.error(`[Email] NOT CONFIGURED — ${reason}.`);
    console.error('[Email] Outbound mail is disabled: OTP login, password reset, and daily alerts will not be delivered.');
}

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const sendOTP = async (email, otp) => {
    if (!isEmailConfigured()) {
        console.warn('[Email] SMTP not configured. OTP email not sent. OTP is:', otp);
        return;
    }

    const mailOptions = {
        from: `"VGTC Transport" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Your Login OTP - VGTC Management',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; borderRadius: 12px;">
                <h2 style="color: #6366f1; text-align: center;">VGTC Secure Login</h2>
                <p>Hello,</p>
                <p>You are receiving this email because you requested a login OTP for your VGTC Management account.</p>
                <div style="background-color: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                    <span style="font-size: 32px; font-weight: 900; letter-spacing: 5px; color: #1f2937;">${otp}</span>
                </div>
                <p>This OTP is valid for 10 minutes. If you did not request this, please ignore this email.</p>
                <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                <p style="font-size: 11px; color: #6b7280; text-align: center;">&copy; 2024 Vikas Goods Transport. All rights reserved.</p>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[Email] OTP sent successfully to ${email}`);
    } catch (err) {
        console.error('[Email] Failed to send OTP email:', err.message);
        throw new Error('Failed to send OTP email');
    }
};

module.exports = { sendOTP, isEmailConfigured };
