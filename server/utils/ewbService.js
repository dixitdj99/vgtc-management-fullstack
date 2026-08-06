/**
 * ewbService.js — turning e-way bills into challan drafts.
 *
 * The cement plant names VGTC as transporter when it generates an e-way bill,
 * so NIC already holds almost everything the Stock → Challan form asks for:
 * truck, party, material, quantity, document number and date. Only the LR
 * number is VGTC's own and has to be typed.
 *
 * Where a field cannot be trusted — an unrecognised product name, a unit that
 * is neither bags nor tonnes, a bill whose Part-B has no vehicle yet — the
 * draft carries a `needsReview` entry rather than a confident guess. A wrong
 * bag count that looks right is worse than a blank the operator fills in.
 *
 * Protocol lives in ewbClient.js; this file knows about cement.
 */

const ewbClient = require('./ewbClient');

/** VGTC's whole trade: a cement bag is 50 kg, so 20 bags to the tonne. */
const MT_PER_BAG = 0.05;

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* ── Field mapping ────────────────────────────────────────────────────────── */

/**
 * NIC's `docDate` is DD/MM/YYYY; the form wants YYYY-MM-DD.
 * Returns '' rather than an Invalid Date for anything unexpected.
 */
function toIsoDate(ddmmyyyy) {
    const m = String(ddmmyyyy || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

/**
 * Matches NIC's free-text product name against the plant's material list.
 *
 * Plants write "JK SUPER OPC 43 GRADE" where the app says "OPC43", so an exact
 * match is not enough. Longest match wins: "OPC53 FS" must not lose to "OPC FS"
 * on a name that contains both.
 *
 * @returns {string|null} the material name, or null when nothing matches
 */
function matchMaterial(productName, materials = []) {
    const p = norm(productName);
    if (!p) return null;
    const ranked = [...materials].sort((a, b) => norm(b).length - norm(a).length);
    return ranked.find(m => norm(m) && (p === norm(m) || p.includes(norm(m)))) || null;
}

/**
 * Bags, from whatever unit the plant used.
 * @returns {{bags: number|null, note: string|null}}
 */
function toBags(quantity, qtyUnit) {
    const qty = parseFloat(quantity) || 0;
    if (qty <= 0) return { bags: null, note: 'quantity is zero or missing' };

    const u = norm(qtyUnit);
    if (!u || u === 'BAG' || u === 'BAGS' || u === 'NOS' || u === 'NO' || u === 'PCS' || u === 'UNT') {
        return { bags: Math.round(qty), note: null };
    }
    if (u === 'MT' || u === 'TON' || u === 'TONNE' || u === 'TONNES' || u === 'TON') {
        return { bags: Math.round(qty / MT_PER_BAG), note: null };
    }
    if (u === 'KGS' || u === 'KG') {
        return { bags: Math.round(qty / 50), note: null };
    }
    // Something we have not seen. Carry the number through so the operator has
    // a starting point, but say plainly that it was not understood.
    return { bags: Math.round(qty), note: `unit "${qtyUnit}" not recognised — check the bag count` };
}

/**
 * The truck. Part-B can be filled after the bill is generated and can be
 * updated en route, so the last vehicle listed is the current one.
 */
function currentVehicle(detail) {
    const list = detail?.VehiclListDetails || detail?.vehiclListDetails || [];
    for (let i = list.length - 1; i >= 0; i--) {
        const no = String(list[i]?.vehicleNo || '').trim();
        if (no) return no.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    return '';
}

/**
 * An e-way bill, as the challan form wants it.
 *
 * @param {object} detail a GetEwayBill response
 * @param {{materials?: string[]}} opts the plant's valid material names
 * @returns {object} draft with a `needsReview` array — empty means ready to save
 */
function toChallanDraft(detail, { materials = [] } = {}) {
    const needsReview = [];

    const items = Array.isArray(detail?.itemList) ? detail.itemList : [];
    const mapped = items.map((it, i) => {
        const type = matchMaterial(it.productName, materials);
        if (!type) {
            needsReview.push(`material "${it.productName || 'unnamed'}" is not on this plant's list — pick one`);
        }
        const { bags, note } = toBags(it.quantity, it.qtyUnit);
        if (note) needsReview.push(`line ${i + 1}: ${note}`);
        return { type, totalBags: bags || 0, sourceName: it.productName || '', hsnCode: it.hsnCode || '' };
    });

    if (!items.length) needsReview.push('the e-way bill lists no items');

    const truckNo = currentVehicle(detail);
    if (!truckNo) needsReview.push('no vehicle on Part-B yet — enter the truck number');

    const date = toIsoDate(detail?.docDate);
    if (!date) needsReview.push('document date could not be read');

    return {
        ewbNo: String(detail?.ewbNo || ''),
        truckNo,
        // Both shapes: createChallan takes materials[], the form binds the singles.
        materials: mapped.filter(m => m.type).map(m => ({ type: m.type, totalBags: m.totalBags })),
        material: mapped[0]?.type || '',
        quantity: mapped.reduce((s, m) => s + (m.totalBags || 0), 0) || '',
        partyName: detail?.toTrdName || '',
        partyCode: detail?.toGstin || '',
        billNo: String(detail?.docNo || ''),
        date,
        destination: detail?.toPlace || '',
        remark: detail?.ewbNo ? `EWB ${detail.ewbNo}` : '',
        // Context the operator can eyeball against the paper in their hand.
        totInvValue: parseFloat(detail?.totInvValue ?? detail?.totalValue) || 0,
        fromTrdName: detail?.fromTrdName || '',
        validUpto: detail?.validUpto || '',
        unmatchedItems: mapped.filter(m => !m.type).map(m => m.sourceName),
        needsReview,
    };
}

/* ── API calls ────────────────────────────────────────────────────────────── */

/** DD/MM/YYYY, the only date format the e-way bill API accepts. */
const toEwbDate = (d) => {
    const dt = d instanceof Date ? d : new Date(d);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`;
};

/** Bills assigned to VGTC as transporter, for one generated date. */
async function listForTransporter(date) {
    const res = await ewbClient.get('GetEwayBillsForTransporter', { date: toEwbDate(date) });
    // NIC returns either a bare array or one wrapped in a named property.
    if (Array.isArray(res)) return res;
    return res?.ewbList || res?.data || [];
}

/** Everything on one bill: items, vehicles, consignee. */
const getDetail = (ewbNo) => ewbClient.get('GetEwayBill', { ewbNo: String(ewbNo) });

module.exports = {
    listForTransporter,
    getDetail,
    toChallanDraft,
    isConfigured: ewbClient.isConfigured,
    missingConfig: ewbClient.missingConfig,
    // Exported for tests.
    _internal: { toIsoDate, toEwbDate, matchMaterial, toBags, currentVehicle, MT_PER_BAG },
};
