const crypto = require('crypto');

const WEBHOOK_PATH = '/api/whatsapp/webhook';

const isWebhookPost = (req) => req.method === 'POST' &&
    req.path.replace(/\/$/, '') === WEBHOOK_PATH;

// Meta signs the exact request bytes, not the parsed JSON representation.
const captureMetaWebhookBody = (req, _res, body) => {
    if (isWebhookPost(req)) req.rawMetaWebhookBody = Buffer.from(body);
};

const verifyMetaWebhookSignature = (req, res, next) => {
    if (req.method !== 'POST') return next();

    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
        console.error('[WA-Webhook] META_APP_SECRET is not configured.');
        return res.sendStatus(503);
    }

    const signature = req.get('X-Hub-Signature-256') || '';
    if (!/^sha256=[a-f0-9]{64}$/i.test(signature) || !Buffer.isBuffer(req.rawMetaWebhookBody)) {
        return res.sendStatus(403);
    }

    const supplied = Buffer.from(signature.slice(7), 'hex');
    const expected = crypto.createHmac('sha256', appSecret)
        .update(req.rawMetaWebhookBody)
        .digest();
    if (!crypto.timingSafeEqual(supplied, expected)) return res.sendStatus(403);

    next();
};

module.exports = { captureMetaWebhookBody, verifyMetaWebhookSignature };
