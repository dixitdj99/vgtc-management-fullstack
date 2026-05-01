const nodemailer = require('nodemailer');

async function test() {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: "vikaskumar909040@gmail.com",
            pass: "inbxylzvycovjzpt"
        }
    });

    try {
        console.log("Sending test email...");
        await transporter.sendMail({
            from: 'vikaskumar909040@gmail.com',
            to: 'vikaskumar909040@gmail.com',
            subject: 'VGTC Test Alert',
            text: 'This is a test to verify your app password.'
        });
        console.log("SUCCESS!");
    } catch (e) {
        console.error("FAILED:", e.message);
    }
}

test();
