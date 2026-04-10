/**
 * Shared vehicle utilities used across all modules.
 *
 * Indian vehicle number formats:
 *   RJ 07 GA 1234  → standard 10 chars
 *   RJ 07 G 1234   → 9 chars (1 letter in middle)
 *   RJ 07 GAA 1234 → 11 chars (3 letters in middle)
 *   HR 36 1234     → 8 chars (no middle letters, older format)
 *   DL 2C 1234     → 8 chars (single digit state code)
 *
 * Regex explained:
 *   ^[A-Z]{2}      → 2 state letters (e.g. RJ, HR, DL)
 *   [0-9]{1,2}     → 1-2 district digits (e.g. 07, 1)
 *   [A-Z]{0,3}     → 0-3 series letters (e.g. GA, G, GAA, empty for old format)
 *   [0-9]{2,4}$    → 2-4 unique number digits (e.g. 1234, 99)
 */
export const validateTruckNo = (no) => {
  if (!no) return false;
  const clean = no.replace(/\s/g, '').toUpperCase();
  const regex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{2,4}$/;
  return regex.test(clean);
};

/**
 * Returns an uppercase, space-stripped version of the truck number.
 */
export const cleanTruckNo = (no) => {
  return (no || '').toUpperCase().replace(/\s/g, '');
};
