/**
 * VGTC Mobile SMS Gateway Bridge
 * --------------------------------------------------
 * Runs on your Android phone using Termux.
 * Exposes a local LAN HTTP server on port 8080 and connects to the VGTC Cloud Server
 * in real-time to send SMS natively via the phone's SIM card balance.
 *
 * Setup instructions on phone:
 * 1. Install Termux & Termux:API from F-Droid.
 * 2. In Termux, run:
 *    pkg update && pkg install nodejs termux-api
 * 3. Create a directory, paste this script as sms-gateway.js, and run:
 *    npm install express axios
 * 4. Run the script:
 *    node sms-gateway.js
 */

const express = require('express');
const { exec } = require('child_process');
const axios = require('axios');
const http = require('http');

// CONFIGURATION
const CLOUD_SERVER_URL = 'http://localhost:5000'; // Replace with your cloud backend URL
const ORG_ID = 'default';                        // Replace with your VGTC Org ID
const PORT = 8080;                                // Local LAN port

const app = express();
app.use(express.json());

/**
 * Sends a native SMS using the Termux API shell command.
 */
function sendNativeSms(phone, message) {
    return new Promise((resolve, reject) => {
        // Clean phone number (needs to be just digits)
        const cleanPhone = String(phone).replace(/\D/g, '');
        // Escape quotes in message
        const escapedMessage = String(message).replace(/"/g, '\\"');
        
        console.log(`[SIM] Sending to ${cleanPhone}: "${message}"`);
        
        const cmd = `termux-sms-send -n ${cleanPhone} "${escapedMessage}"`;
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error('[SIM] SMS command error:', error.message);
                return reject(error);
            }
            if (stderr) {
                console.error('[SIM] SMS command stderr:', stderr);
                return reject(new Error(stderr));
            }
            console.log('[SIM] SMS sent successfully!');
            resolve(stdout);
        });
    });
}

// ── LOCAL LAN SERVER ─────────────────────────────────────────────────────────

// POST /send - Instant local LAN trigger
app.post('/send', async (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) {
        return res.status(400).json({ error: 'phone and message are required' });
    }
    
    try {
        await sendNativeSms(phone, message);
        res.json({ success: true, method: 'LAN' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'online', mode: 'dual-gateway' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[LAN] Local SMS server listening on http://0.0.0.0:${PORT}`);
    console.log(`[LAN] VGTC website can send local offline SMS using: http://<this-phone-ip>:${PORT}/send`);
});

// ── CLOUD SSE REAL-TIME LISTENER ─────────────────────────────────────────────

function connectToCloudStream() {
    const streamUrl = `${CLOUD_SERVER_URL.replace(/\/$/, '')}/api/sms/stream?orgId=${ORG_ID}`;
    console.log(`[Cloud] Connecting to real-time SMS stream at: ${streamUrl}`);

    http.get(streamUrl, (res) => {
        if (res.statusCode !== 200) {
            console.error(`[Cloud] Failed to connect to stream. Status code: ${res.statusCode}`);
            reconnect();
            return;
        }

        console.log('[Cloud] Connected to real-time SMS stream. Listening for new messages...');
        
        res.setEncoding('utf8');
        res.on('data', async (chunk) => {
            // SSE events arrive with "data: <json>\n\n"
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const payload = JSON.parse(line.substring(6));
                        console.log('[Cloud] Received real-time message:', payload);
                        
                        // Send native SMS
                        try {
                            await sendNativeSms(payload.phone, payload.message);
                            // Report success back to server
                            await reportStatus(payload.id, 'sent');
                        } catch (sendErr) {
                            await reportStatus(payload.id, 'failed', sendErr.message);
                        }
                    } catch (parseErr) {
                        // ignore keepalive or invalid json comments
                    }
                }
            }
        });

        res.on('end', () => {
            console.warn('[Cloud] Stream connection ended by server.');
            reconnect();
        });

        res.on('error', (err) => {
            console.error('[Cloud] Stream connection error:', err.message);
            reconnect();
        });
    }).on('error', (err) => {
        console.error('[Cloud] Failed to connect to server:', err.message);
        reconnect();
    });
}

async function reportStatus(id, status, error = '') {
    try {
        await axios.post(`${CLOUD_SERVER_URL.replace(/\/$/, '')}/api/sms/status`, {
            id, status, error, orgId: ORG_ID
        });
        console.log(`[Cloud] Reported status for ${id}: ${status}`);
    } catch (err) {
        console.error(`[Cloud] Failed to report status for ${id}:`, err.message);
    }
}

let reconnectTimeout = null;
function reconnect() {
    if (reconnectTimeout) return;
    console.log('[Cloud] Reconnecting in 5 seconds...');
    reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        connectToCloudStream();
    }, 5000);
}

// Start cloud listener
connectToCloudStream();
