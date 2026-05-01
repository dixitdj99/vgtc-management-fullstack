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

module.exports = {
    normalizePartyName,
    getPartySimilarityKey
};
