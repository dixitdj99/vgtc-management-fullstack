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

export const buildPartySuggestions = (...groups) => {
  const map = new Map();

  groups.flat(Infinity).forEach((name) => {
    const normalized = normalizePartyName(name);
    if (!normalized) return;

    const key = getPartySimilarityKey(normalized);
    if (!key || map.has(key)) return;
    map.set(key, normalized);
  });

  return [...map.values()].sort((a, b) => a.localeCompare(b));
};
