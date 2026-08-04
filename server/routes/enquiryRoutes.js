const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { getEnvCol } = require('../utils/collectionUtils');

/**
 * Enquiries from the public landing page.
 *
 * The page carries no JavaScript, so this is a plain HTML form POST: the
 * browser navigates here and we answer with a page. That is also why the
 * responses below are HTML rather than JSON — there is nothing on the other
 * end to render an error object.
 *
 * Unauthenticated by necessity, which makes it the only door into this server
 * a stranger can knock on. Hence the honeypot, the rate limit, the field caps
 * and the refusal to store anything we did not ask for.
 */

const COL = 'enquiries';

/** Longest we will store for each field. Anything more is not a truck number. */
const LIMITS = {
    name: 80, phone: 20, vehicleNo: 20, vehicleType: 40,
    capacity: 20, city: 60, message: 800, kind: 20,
};

/**
 * Drops control characters and keeps everything printable, so a name keeps
 * its spaces and hyphens. Done by character code rather than a regex literal:
 * the escape for a control range is easy to get wrong, and getting it wrong
 * here silently mangles every name that reaches the office.
 */
const clean = (v, max) => String(v == null ? '' : v)
    .split('')
    .filter(ch => { const c = ch.charCodeAt(0); return c >= 32 && c !== 127; })
    .join('')
    .trim()
    .slice(0, max);

/** A reply that matches the landing page, since the browser lands on it. */
function page(heading, body, ok = true) {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading} — Vikas Goods Transport Co.</title>
<meta name="robots" content="noindex">
<style>
  body{margin:0;background:#050507;color:#fff;min-height:100vh;display:flex;align-items:center;
    justify-content:center;padding:24px;
    font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
  .box{max-width:520px;text-align:center}
  .mark{width:64px;height:64px;border-radius:18px;margin:0 auto 24px;display:flex;
    align-items:center;justify-content:center;
    background:linear-gradient(135deg,${ok ? '#4f7cff,#8b5cf6' : '#f59e0b,#ef4444'})}
  h1{font-size:28px;letter-spacing:-.02em;margin:0 0 12px}
  p{color:#98a0b4;margin:0 0 28px}
  a{display:inline-flex;align-items:center;gap:8px;background:#fff;color:#08080c;
    text-decoration:none;font-weight:700;border-radius:999px;padding:13px 26px;font-size:14.5px;
    text-transform:uppercase;letter-spacing:.03em}
</style></head>
<body><div class="box">
  <div class="mark">
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6"
      stroke-linecap="round" stroke-linejoin="round">${ok ? '<path d="M20 6 9 17l-5-5"/>' : '<path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="10"/>'}</svg>
  </div>
  <h1>${heading}</h1>
  <p>${body}</p>
  <a href="/home">Back to the site</a>
</div></body></html>`;
}

// Six a day from one address is generous for a real person and useless to a
// spammer. Keyed on the proxy-corrected IP — see `trust proxy` in index.js.
const limiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 6,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).type('html').send(page(
        'Too many enquiries',
        'We have already had several enquiries from this connection today. Please try again tomorrow.',
        false,
    )),
});

router.post('/', limiter, express.urlencoded({ extended: false, limit: '32kb' }), async (req, res) => {
    try {
        // Honeypot. A real person never sees this field, so anything in it is a
        // bot — answered with the same thank-you so it learns nothing.
        if (clean(req.body.website, 100)) {
            return res.status(200).type('html').send(page(
                'Thank you',
                'We have your details and the office will be in touch.',
            ));
        }

        const entry = {};
        for (const [field, max] of Object.entries(LIMITS)) entry[field] = clean(req.body[field], max);

        if (!entry.name || !entry.phone) {
            return res.status(400).type('html').send(page(
                'We need a little more',
                'Please give us at least your name and a phone number so the office can call you back.',
                false,
            ));
        }
        // Indian mobile numbers, with or without the country code or spacing.
        const digits = entry.phone.replace(/\D/g, '');
        if (digits.length < 10 || digits.length > 12) {
            return res.status(400).type('html').send(page(
                'That number does not look right',
                'Please enter a 10-digit mobile number so we can reach you.',
                false,
            ));
        }

        const record = {
            ...entry,
            phone: digits,
            kind: entry.kind === 'transport' ? 'transport' : 'vehicle',
            orgId: 'vgtc',
            status: 'new',
            source: 'landing-page',
            createdAt: new Date().toISOString(),
        };

        const { db, isAvailable } = require('../firebase');
        const localStore = require('../utils/localStore');
        const col = getEnvCol(COL);
        if (isAvailable()) await db.collection(col).doc().set(record);
        else localStore.insert(col, record);

        return res.status(201).type('html').send(page(
            'Thank you',
            'We have your details. The office will call you back on the number you gave.',
        ));
    } catch (err) {
        console.error('[Enquiry] failed to record:', err.message);
        // Never show a stack trace to the public.
        return res.status(500).type('html').send(page(
            'Something went wrong',
            'We could not record your details just now. Please try again in a little while.',
            false,
        ));
    }
});

/**
 * For the office. This router is mounted without auth so a stranger can post
 * the form, which means the read side has to guard itself — otherwise every
 * enquiry, with names and phone numbers, is a public URL away.
 */
const { requireAuth } = require('../middleware/auth');
router.get('/list', requireAuth, async (req, res) => {
    try {
        const { db, isAvailable } = require('../firebase');
        const localStore = require('../utils/localStore');
        const col = getEnvCol(COL);
        const rows = isAvailable()
            ? (await db.collection(col).get()).docs.map(d => ({ id: d.id, ...d.data() }))
            : localStore.getAll(col);
        rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
