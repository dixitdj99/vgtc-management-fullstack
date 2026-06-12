/**
 * Shared voucher net/outstanding math.
 * Mirrors calcNet in modules/BalanceSheet.jsx (lines ~15-36) — if the deduction
 * rules change there, change them here too.
 */
export function calcNet(v, vehicle) {
    const gross = v.deliveries?.length > 0
        ? v.deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0), 0)
        : (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);
    const diesel = v.advanceDiesel === 'FULL' ? 4000 : (parseFloat(v.advanceDiesel) || 0);
    const cash = parseFloat(v.advanceCash) || 0;
    const online = parseFloat(v.advanceOnline) || 0;
    const weight = parseFloat(v.weight) || 0;
    const munshi = parseFloat(v.munshi) || (weight > 0 ? (weight < 18 ? 50 : 100) : 0);
    const commission = parseFloat(v.commission) || 0;
    const shortage = parseFloat(v.shortage) || 0;
    const tyrePuncture = parseFloat(v.tyrePuncture) || 0;
    const tyreGreasingAir = (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0) + (parseFloat(v.tyreGreasingAir) || 0);
    const extraCash = parseFloat(v.extraCash) || 0;
    let net = gross - diesel - cash - online - munshi - commission - shortage - tyrePuncture - tyreGreasingAir - extraCash;

    // Market vehicle + No GPS + JK Lakshmi = ₹50 deduction
    if (vehicle && vehicle.ownershipType === 'market' && (!vehicle.gpsType || vehicle.gpsType === 'none') && v.type === 'JK_Lakshmi') {
        net -= 50;
    }
    return net;
}

export function calcOutstanding(v, vehicle) {
    return Math.max(0, calcNet(v, vehicle) - (parseFloat(v.paidBalance) || 0));
}

/** Document/EMI expiry status: expired | near (<30d) | ok | null (no/invalid date) */
export function checkExpiry(dateStr) {
    if (!dateStr) return null;
    const expiry = new Date(dateStr);
    if (isNaN(expiry.getTime())) return null;
    const diff = (expiry - new Date()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return { status: 'expired', days: Math.abs(Math.floor(diff)) };
    if (diff < 30) return { status: 'near', days: Math.floor(diff) };
    return { status: 'ok', days: Math.floor(diff) };
}
