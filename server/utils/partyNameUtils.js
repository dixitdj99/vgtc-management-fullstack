const PARTY_PREFIX_REGEX = /^M\/S\.?\s*/i;

const normalizePartyName = (value) =>
    String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();

const getPartySimilarityKey = (value) =>
    normalizePartyName(value)
        .replace(PARTY_PREFIX_REGEX, '')
        .replace(/[^A-Z0-9]/g, '');

// Flag likely typos only. Never use fuzzy matching to merge financial records.
const isLikelyPartyName = (left, right) => {
    const a = getPartySimilarityKey(left);
    const b = getPartySimilarityKey(right);
    if (!a || !b) return false;
    if (a === b) return true;
    if (Math.min(a.length, b.length) < 6 || Math.abs(a.length - b.length) > 1) return false;
    if (a.length === b.length) {
        const diff = [...a].map((ch, i) => ch === b[i] ? -1 : i).filter(i => i >= 0);
        return diff.length === 1 || (diff.length === 2 && diff[1] === diff[0] + 1
            && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]);
    }
    const short = a.length < b.length ? a : b;
    const long = a.length < b.length ? b : a;
    let i = 0, j = 0, skipped = false;
    while (i < short.length && j < long.length) {
        if (short[i] === long[j]) { i++; j++; }
        else if (skipped) return false;
        else { skipped = true; j++; }
    }
    return true;
};

const isDummyPartyName = (value) => {
    if (!value) return true;
    const n = normalizePartyName(value);
    if (!n) return true;
    if (/\b(TEST|DUMMY|SAMPLE|MOCK)\b/i.test(n)) return true;
    if (n.includes('AUTO LR TEST') || n.includes('MANUAL LR TEST') || n.includes('BAD LR TEST') || n.includes('VOUCHER FIRST TEST') || n.includes('TEST OWNER') || n.includes('API TEST PARTY')) {
        return true;
    }
    return false;
};

module.exports = {
    normalizePartyName,
    getPartySimilarityKey,
    isLikelyPartyName,
    isDummyPartyName
};

