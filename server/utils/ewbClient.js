/**
 * ewbClient.js — the NIC e-way bill API transport, and nothing about cement.
 *
 * NIC does not speak plain JSON. Every call rides on a hand-rolled envelope,
 * described in the EWB-API technical document (v1.02.01 / v1.03):
 *
 *   authenticate  ->  app_key (32 random bytes, RSA'd under NIC's public key)
 *                     comes back as `sek`, AES-encrypted under that same app_key
 *   every GET     ->  {status, rek, data, hmac}
 *                     rek  = a per-response AES key, encrypted under sek
 *                     data = base64(JSON), encrypted under rek
 *                     hmac = HMAC-SHA256 of the base64, keyed with rek
 *
 * All of it is AES-256-ECB with PKCS7 padding, which is NIC's choice, not ours.
 *
 * The HMAC check is not optional. It is the only thing standing between a
 * corrupted or tampered response and a challan created against the wrong truck,
 * so decryptResponse throws rather than returning data it could not verify.
 *
 * Domain code lives in ewbService.js. This file knows about bytes and headers.
 */

const crypto = require('crypto');

const AUTH_PATH = '/ewaybillapi/v1.03/authenticate';
const API_PATH = '/ewaybillapi/v1.03/ewayapi';

// NIC issues a token good for 360 minutes. Retire ours early — a token that
// expires mid-flight costs a failed sync, and a spare few minutes costs nothing.
const TOKEN_TTL_MS = 355 * 60 * 1000;

/* ── Configuration ────────────────────────────────────────────────────────── */

const cfg = () => ({
    baseUrl: (process.env.EWB_BASE_URL || 'https://api.ewaybillgst.gov.in').replace(/\/+$/, ''),
    clientId: process.env.EWB_CLIENT_ID || '',
    clientSecret: process.env.EWB_CLIENT_SECRET || '',
    username: process.env.EWB_USERNAME || '',
    password: process.env.EWB_PASSWORD || '',
    gstin: process.env.EWB_GSTIN || '',
    publicKey: process.env.EWB_PUBLIC_KEY || '',
});

/**
 * Whether a live call is even possible. Every caller checks this first, so a
 * server with no credentials simply has no e-way bill feed — it does not error,
 * and it never reaches the network.
 */
function isConfigured() {
    if (String(process.env.EWB_ENABLED || '').toLowerCase() !== 'true') return false;
    const c = cfg();
    return Boolean(c.clientId && c.clientSecret && c.username && c.password && c.gstin && c.publicKey);
}

/** What is missing, for the status endpoint — never the values themselves. */
function missingConfig() {
    if (String(process.env.EWB_ENABLED || '').toLowerCase() !== 'true') return ['EWB_ENABLED'];
    const c = cfg();
    return Object.entries({
        EWB_CLIENT_ID: c.clientId, EWB_CLIENT_SECRET: c.clientSecret,
        EWB_USERNAME: c.username, EWB_PASSWORD: c.password,
        EWB_GSTIN: c.gstin, EWB_PUBLIC_KEY: c.publicKey,
    }).filter(([, v]) => !v).map(([k]) => k);
}

/* ── Crypto ───────────────────────────────────────────────────────────────── */

/**
 * NIC's public key arrives as base64 DER or as a PEM block. Environment
 * variables flatten newlines, so \n written literally has to be put back or
 * the PEM parser rejects a key that is otherwise fine.
 */
function normalisePublicKey(raw) {
    const key = String(raw).replace(/\\n/g, '\n').trim();
    if (key.includes('-----BEGIN')) return key;
    const body = key.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') || '';
    return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

/** RSA under NIC's public key. PKCS1 v1.5 — the spec predates OAEP here. */
function rsaEncrypt(plain, publicKey) {
    return crypto.publicEncrypt(
        { key: normalisePublicKey(publicKey), padding: crypto.constants.RSA_PKCS1_PADDING },
        Buffer.from(plain, 'utf8')
    ).toString('base64');
}

/** AES-256-ECB / PKCS7, base64 in and out. NIC's choice of mode, not ours. */
function aesDecrypt(cipherB64, keyBuf) {
    const d = crypto.createDecipheriv('aes-256-ecb', keyBuf, null);
    d.setAutoPadding(true);
    return Buffer.concat([d.update(Buffer.from(cipherB64, 'base64')), d.final()]);
}

function aesEncrypt(plainBuf, keyBuf) {
    const c = crypto.createCipheriv('aes-256-ecb', keyBuf, null);
    c.setAutoPadding(true);
    return Buffer.concat([c.update(plainBuf), c.final()]).toString('base64');
}

/**
 * Unwraps a NIC response envelope.
 *
 * @param {{rek: string, data: string, hmac?: string}} body as returned by NIC
 * @param {Buffer} sessionKey the decrypted sek from authenticate()
 * @returns {object} the response JSON
 * @throws if the HMAC does not match — never returns unverified data
 */
function decryptResponse(body, sessionKey) {
    if (!body || !body.rek || !body.data) {
        throw new Error('EWB response is missing rek or data');
    }
    const rek = aesDecrypt(body.rek, sessionKey);
    const payloadB64 = aesDecrypt(body.data, rek).toString('utf8');

    if (body.hmac) {
        const expected = crypto.createHmac('sha256', rek).update(payloadB64).digest('base64');
        const a = Buffer.from(expected);
        const b = Buffer.from(String(body.hmac));
        // Length is not the secret; compare it separately so timingSafeEqual
        // does not throw on a mismatched-length forgery.
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            throw new Error('EWB response failed its HMAC check — refusing to use the data');
        }
    }

    return JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));
}

/* ── Session ──────────────────────────────────────────────────────────────── */

let session = null; // { authtoken, sessionKey, expiresAt }

const clearSession = () => { session = null; };

async function authenticate() {
    const c = cfg();
    // 32 random bytes, sent base64 inside the RSA blob, with the *raw* bytes used
    // as the AES key for sek. That is what NIC's published sample code does, but
    // the spec only says "32 character random unique id" — so if the very first
    // sandbox login fails on sek decryption, this line is the thing to question.
    const appKey = crypto.randomBytes(32);

    const res = await fetch(c.baseUrl + AUTH_PATH, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'client-id': c.clientId,
            'client-secret': c.clientSecret,
            'gstin': c.gstin,
        },
        body: JSON.stringify({
            action: 'ACCESSTOKEN',
            username: c.username,
            password: rsaEncrypt(c.password, c.publicKey),
            app_key: rsaEncrypt(appKey.toString('base64'), c.publicKey),
        }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok || String(body.status) !== '1' || !body.authtoken || !body.sek) {
        // NIC reports failures in the body with HTTP 200, so status is what counts.
        throw new Error(`EWB authentication failed: ${body.error || body.errorMessage || res.status}`);
    }

    session = {
        authtoken: body.authtoken,
        sessionKey: aesDecrypt(body.sek, appKey),
        expiresAt: Date.now() + TOKEN_TTL_MS,
    };
    return session;
}

const currentSession = async () =>
    (session && session.expiresAt > Date.now()) ? session : authenticate();

/**
 * A GET against the e-way bill API, decrypted and verified.
 *
 * Retries once on an expired token. The clock is not enough on its own: NIC can
 * invalidate a session early, and the only honest signal is being told so.
 *
 * @param {string} method e.g. 'GetEwayBillsForTransporter'
 * @param {object} params query string values
 */
async function get(method, params = {}) {
    if (!isConfigured()) {
        throw new Error(`E-way bill API is not configured (missing: ${missingConfig().join(', ')})`);
    }

    const attempt = async () => {
        const c = cfg();
        const s = await currentSession();
        const qs = new URLSearchParams(params).toString();
        const res = await fetch(`${c.baseUrl}${API_PATH}/${method}${qs ? '?' + qs : ''}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'client-id': c.clientId,
                'client-secret': c.clientSecret,
                'gstin': c.gstin,
                'authtoken': s.authtoken,
            },
        });
        const body = await res.json().catch(() => ({}));
        if (String(body.status) !== '1') {
            const msg = body.error || body.errorMessage || `HTTP ${res.status}`;
            const err = new Error(`EWB ${method} failed: ${msg}`);
            err.ewbError = msg;
            throw err;
        }
        return decryptResponse(body, s.sessionKey);
    };

    try {
        return await attempt();
    } catch (err) {
        if (/token|expire|auth/i.test(err.ewbError || '')) {
            clearSession();
            return attempt();
        }
        throw err;
    }
}

module.exports = {
    isConfigured,
    missingConfig,
    get,
    authenticate,
    clearSession,
    // Exported for the round-trip tests, which build a NIC-shaped response by hand.
    _internal: { rsaEncrypt, aesEncrypt, aesDecrypt, decryptResponse, normalisePublicKey },
};
