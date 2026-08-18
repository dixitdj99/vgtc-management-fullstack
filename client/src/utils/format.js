export const fmtRs = (n) => {
    if (n === null || n === undefined || isNaN(n)) return 'Rs.0';
    return 'Rs.' + Math.round(n).toLocaleString('en-IN');
};

/**
 * Format any date string / timestamp into DD-MM-YYYY format (e.g., "18-08-2026").
 * @param {string|number|Date|object} date 
 * @returns {string} Date formatted as DD-MM-YYYY or '—'
 */
export const fmtDate = (date) => {
    if (!date) return '—';

    if (typeof date === 'string') {
        const s = date.trim();
        if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
            const [y, m, d] = s.split('-');
            return `${d}-${m}-${y}`;
        }
        if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) {
            const [y, m, d] = s.split('/');
            return `${d}-${m}-${y}`;
        }
    }

    let d;
    if (typeof date === 'object' && date?.seconds) {
        d = new Date(date.seconds * 1000);
    } else if (typeof date === 'object' && date?._seconds) {
        d = new Date(date._seconds * 1000);
    } else {
        d = new Date(date);
    }

    if (isNaN(d.getTime())) return String(date || '—');

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
};
