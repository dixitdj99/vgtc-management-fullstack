const PARTY_PREFIX_REGEX = /^M\/S\.?\s*/i;

export const normalizePartyName = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .toUpperCase();

export const getPartySimilarityKey = (value) =>
  normalizePartyName(value)
    .replace(PARTY_PREFIX_REGEX, '')
    .replace(/[^A-Z0-9]/g, '');

export const resolvePartyName = (value, existingNames = []) => {
  const normalized = normalizePartyName(value);
  if (!normalized) return '';

  const targetKey = getPartySimilarityKey(normalized);
  const match = existingNames.find((name) => getPartySimilarityKey(name) === targetKey);
  return match ? normalizePartyName(match) : normalized;
};

export const isDummyParty = (name) => {
  if (!name) return true;
  const n = normalizePartyName(name);
  if (!n) return true;
  if (/\b(TEST|DUMMY|SAMPLE|MOCK)\b/i.test(n)) return true;
  if (n.includes('AUTO LR TEST') || n.includes('MANUAL LR TEST') || n.includes('BAD LR TEST') || n.includes('VOUCHER FIRST TEST') || n.includes('TEST OWNER') || n.includes('API TEST PARTY')) {
    return true;
  }
  return false;
};

export const buildPartySuggestions = (...groups) => {
  const map = new Map();

  groups.flat(Infinity).forEach((name) => {
    const normalized = normalizePartyName(name);
    if (!normalized || isDummyParty(normalized)) return;

    const key = getPartySimilarityKey(normalized);
    if (!key || map.has(key)) return;
    map.set(key, normalized);
  });

  return [...map.values()].sort((a, b) => a.localeCompare(b));
};
