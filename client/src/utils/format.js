export const fmtRs = (n) => {
    if (n === null || n === undefined || isNaN(n)) return 'Rs.0';
    return 'Rs.' + Math.round(n).toLocaleString('en-IN');
};

export const fmtDate = (date) => {
    if (!date) return '—';
    // Handle Firestore Timestamp objects
    if (date && typeof date === 'object' && date.seconds) {
        return new Date(date.seconds * 1000).toLocaleDateString('en-IN');
    }
    if (date && typeof date === 'object' && date._seconds) {
        return new Date(date._seconds * 1000).toLocaleDateString('en-IN');
    }
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN');
};
