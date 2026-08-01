/**
 * fakeNic.js — a stand-in for the NIC e-way bill API that encrypts exactly the
 * way the spec does.
 *
 * VGTC has no NIC credentials yet and will not for weeks, so without this the
 * whole transport layer would ship on assertion alone. This server does the
 * real thing in reverse — RSA-decrypts the app_key, AES-encrypts the sek,
 * wraps each response in the rek/data/hmac envelope — which means ewbClient's
 * authenticate and get paths are genuinely exercised rather than mocked past.
 *
 * The one thing it cannot prove is that NIC agrees with our reading of
 * "app_key": we send 32 random bytes base64-encoded inside the RSA blob and use
 * the raw bytes as the AES key, which is what the published sample code does.
 * That is the first thing to check on day one with sandbox.
 */

const http = require('http');
const crypto = require('crypto');

const CREDS = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    username: 'vgtcapi',
    password: 'test-password',
    gstin: '06AAACJ6715G1ZR',
};

/** A GetEwayBill response shaped like NIC's own sample, carrying cement. */
const DETAIL = {
    ewbNo: 151000256262,
    ewayBillDate: '01/08/2026 06:44:00 PM',
    docNo: '7330200286',
    docDate: '01/08/2026',
    fromGstin: '06AAACJ6715G1ZR',
    fromTrdName: 'JK Cement Plant',
    toTrdName: 'Sai Building Material',
    toGstin: '06ALDPA4968K1ZZ',
    toPlace: 'Sohna',
    totInvValue: 19100.0,
    validUpto: '03/08/2026 11:59:00 PM',
    status: 'ACT',
    itemList: [{ productName: 'JK SUPER PPC CEMENT', hsnCode: 252329, quantity: 2.5, qtyUnit: 'MT' }],
    VehiclListDetails: [{ vehicleNo: 'HR47G9999' }],
};

const LIST = [{
    ewbNo: 151000256262,
    ewbDate: '01/08/2026 06:44:00 PM',
    docNo: '7330200286',
    docDate: '01/08/2026',
    genGstin: '06AAACJ6715G1ZR',
    status: 'ACT',
}];

/**
 * Starts the server and points process.env at it.
 * @returns {Promise<{close: Function, detailCalls: () => number}>}
 */
function startFakeNic() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const SEK = crypto.randomBytes(32);
    let detailCalls = 0;

    const aesEnc = (buf, key) => {
        const c = crypto.createCipheriv('aes-256-ecb', key, null);
        return Buffer.concat([c.update(buf), c.final()]).toString('base64');
    };

    // Node 22 refuses PKCS1 private decryption (CVE-2024-PEND). NIC decrypts on
    // its own stack; what matters here is that the client emitted a correctly
    // padded PKCS1 type-2 block, so unpad by hand rather than weaken the client.
    const rsaDec = (v) => {
        const raw = crypto.privateDecrypt(
            { key: privateKey, padding: crypto.constants.RSA_NO_PADDING }, Buffer.from(v, 'base64'));
        if (raw[0] !== 0x00 || raw[1] !== 0x02) throw new Error('not a PKCS1 type-2 block');
        const sep = raw.indexOf(0x00, 2);
        if (sep < 0) throw new Error('no PKCS1 separator');
        return raw.subarray(sep + 1).toString();
    };

    const envelope = (payload) => {
        const rek = crypto.randomBytes(32);
        const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
        return {
            status: '1',
            rek: aesEnc(rek, SEK),
            data: aesEnc(Buffer.from(b64), rek),
            hmac: crypto.createHmac('sha256', rek).update(b64).digest('base64'),
        };
    };

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://x');
        const send = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };

        if (url.pathname.endsWith('/authenticate')) {
            let body = '';
            req.on('data', c => (body += c));
            req.on('end', () => {
                try {
                    const b = JSON.parse(body);
                    if (req.headers['client-id'] !== CREDS.clientId || req.headers['gstin'] !== CREDS.gstin) {
                        return send({ status: '0', error: 'bad headers' });
                    }
                    if (rsaDec(b.password) !== CREDS.password) return send({ status: '0', error: 'bad password' });
                    const appKey = Buffer.from(rsaDec(b.app_key), 'base64');
                    if (appKey.length !== 32) return send({ status: '0', error: `app_key is ${appKey.length} bytes` });
                    send({ status: '1', authtoken: 'tok-123', sek: aesEnc(SEK, appKey) });
                } catch (e) { send({ status: '0', error: e.message }); }
            });
            return;
        }

        if (req.headers['authtoken'] !== 'tok-123') return send({ status: '0', error: 'invalid token' });
        if (url.pathname.endsWith('/GetEwayBillsForTransporter')) return send(envelope(LIST));
        if (url.pathname.endsWith('/GetEwayBill')) { detailCalls++; return send(envelope(DETAIL)); }
        send({ status: '0', error: 'unknown method' });
    });

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const saved = { ...process.env };
            Object.assign(process.env, {
                EWB_ENABLED: 'true',
                EWB_BASE_URL: `http://127.0.0.1:${server.address().port}`,
                EWB_CLIENT_ID: CREDS.clientId,
                EWB_CLIENT_SECRET: CREDS.clientSecret,
                EWB_USERNAME: CREDS.username,
                EWB_PASSWORD: CREDS.password,
                EWB_GSTIN: CREDS.gstin,
                EWB_PUBLIC_KEY: pubPem,
            });
            resolve({
                detailCalls: () => detailCalls,
                close: () => {
                    server.close();
                    for (const k of ['EWB_ENABLED', 'EWB_BASE_URL', 'EWB_CLIENT_ID', 'EWB_CLIENT_SECRET',
                        'EWB_USERNAME', 'EWB_PASSWORD', 'EWB_GSTIN', 'EWB_PUBLIC_KEY']) {
                        if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
                    }
                    require('../utils/ewbClient').clearSession();
                },
            });
        });
    });
}

module.exports = { startFakeNic, DETAIL, LIST, CREDS };
