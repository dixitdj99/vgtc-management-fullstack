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
    isDummyPartyName
};

