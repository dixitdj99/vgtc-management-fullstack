/**
 * pnl.js — the firm's profit and loss, assembled from every module.
 *
 * The Profit & Loss page used to do this arithmetic inline, and got it wrong in
 * ways nobody could see: it read `v.diesel`, `v.cash` and `v.online` off a
 * voucher, which stores `advanceDiesel`, `advanceCash` and `advanceOnline`, so
 * diesel always totalled zero; and it filtered pump, tyre, maintenance and
 * labour payments by `p.truckNo`, a field payment records have never carried,
 * so every one of them was silently dropped. Money that is not counted does not
 * announce itself, which is exactly why this is now a separate file with tests
 * against real numbers.
 *
 * Deliberately free of imports and JSX so the server test suite can load it the
 * same way it loads the rest of the client's arithmetic.
 *
 * The model, decided with the firm:
 *
 *   - Own trucks earn their freight. Income is the trip's gross, counted on the
 *     day of the trip, and the running costs are the firm's.
 *   - Market trucks earn a commission. The client's bill and the owner's payout
 *     are both somebody else's money passing through, so only what the firm
 *     keeps — commission, munshi, shortage — is income, and none of the trip
 *     costs are the firm's.
 *   - Salary counts when it is paid, from the Pay module, not as it is earned.
 *
 * Invoices are therefore not income here: the freight they bill is already
 * counted on the trip. They stay on the page for GST and for saying which trips
 * are still unbilled.
 */

const num = (x) => parseFloat(x) || 0;
const upper = (s) => String(s || '').trim().toUpperCase();

/** What a full tank is assumed to cost until someone verifies the real amount. */
export const FULL_TANK_ESTIMATE = 4000;

export const PNL_GROUPS = [
  { key: 'income', label: 'Income', kind: 'income' },
  { key: 'running', label: 'Fleet running costs', kind: 'expense' },
  { key: 'people', label: 'People', kind: 'expense' },
  { key: 'finance', label: 'Finance', kind: 'expense' },
  { key: 'overheads', label: 'Overheads', kind: 'expense' },
];

/** 'YYYY-MM' from whatever shape the date arrived in. */
export function monthOf(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr);
  let m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  m = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/); // DD.MM.YYYY
  if (m) return `${m[3]}-${m[2]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return null;
}

/**
 * The firm's own trucks. Same rule as Trip Profit and Mileage: a truck
 * registered before `ownershipType` existed carries the firm's name instead,
 * and matching on the flag alone drops those trucks off the sheet entirely.
 */
export function ownFleet(vehicles = []) {
  const s = new Set();
  vehicles.forEach(v => {
    const isSelf = v.ownershipType === 'self' || (v.ownerName || '').toLowerCase().includes('vikas');
    if (isSelf && v.truckNo) s.add(upper(v.truckNo));
  });
  return s;
}

/** Freight on a voucher, priced per drop when it carries several. */
export function voucherGross(v = {}) {
  if (v.deliveries?.length > 0) {
    return v.deliveries.reduce((s, d) => s + num(d.weight) * num(d.rate), 0);
  }
  return num(v.weight) * num(v.rate);
}

/** Diesel charged to a trip. 'FULL' means a full tank nobody has verified yet. */
export function voucherDiesel(v = {}) {
  return v.advanceDiesel === 'FULL' ? FULL_TANK_ESTIMATE : num(v.advanceDiesel);
}

/** Munshi, defaulting from the weight when none was entered — as calcNet does. */
export function voucherMunshi(v = {}) {
  const weight = num(v.weight);
  return num(v.munshi) || (weight > 0 ? (weight < 18 ? 50 : 100) : 0);
}

/**
 * Tyre and grease charges recovered on the trip. `extraCash` is authoritative
 * for the extra-money lines — voucherExtras.js keeps it written as the total on
 * every save precisely so the dozen places that read it need not know the money
 * arrived in pieces.
 */
export function voucherTripExtras(v = {}) {
  return num(v.tyrePuncture) + num(v.tyreGreasing) + num(v.tyreAir)
    + num(v.tyreGreasingAir) + num(v.extraCash);
}

const PLANTS = ['Kosli', 'Bahadurgarh', 'Jhajjar', 'Jharli'];

const plantOfType = (type) => ({
  Kosli_Bill: 'Kosli',
  Bahadurgarh_Bill: 'Bahadurgarh',
  Jajjhar_Bill: 'Jhajjar',
  JK_Super: 'Jharli',
  JK_Lakshmi: 'Jharli',
}[type] || null);

/**
 * Which plant a record belongs to. A voucher says so itself; anything else is
 * placed by its remark, or by wherever its truck usually runs.
 */
export function plantIndex(vouchers = []) {
  const counts = {};
  vouchers.forEach(v => {
    const truck = upper(v.truckNo);
    const plant = plantOfType(v.type);
    if (!truck || !plant) return;
    counts[truck] = counts[truck] || {};
    counts[truck][plant] = (counts[truck][plant] || 0) + 1;
  });
  const home = {};
  Object.entries(counts).forEach(([truck, byPlant]) => {
    home[truck] = Object.entries(byPlant).sort((a, b) => b[1] - a[1])[0][0];
  });

  return function plantOf({ type, truckNo, remark } = {}) {
    const direct = plantOfType(type);
    if (direct) return direct;
    const text = upper(remark);
    const named = PLANTS.find(p => text.includes(upper(p)));
    if (named) return named;
    return home[upper(truckNo)] || 'Jharli';
  };
}

const OFFICE_WORDS = ['OFFICE', 'RENT', 'ELECTRICITY', 'STATIONERY', 'WATER',
  'INTERNET', 'TEA', 'COFFEE', 'STAFF FOOD', 'MISC', 'CLEANING'];
const LABOUR_WORDS = ['LABOUR', 'HANDLING', 'HAMALI', 'LOADING', 'UNLOADING'];

const hasWord = (text, words) => {
  const t = upper(text);
  return words.some(w => t.includes(w));
};

/** Salary and advances to a person. `Manual Entry` comes from the staff ledger. */
const SALARY_CATEGORIES = new Set(['Salary', 'Advance', 'Manual Entry']);

/**
 * Paying the pump's monthly bill is the same money as the diesel already
 * charged to the trips; the same goes for settling a tyre or workshop vendor
 * against work already logged. These are shown on the page but kept out of the
 * total, so the cash is visible without being counted twice.
 */
const SETTLEMENT_CATEGORIES = new Set(['Pump', 'Tyre', 'Maintenance']);

function parseEmi(raw) {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Months from `startDate` to `today`, counting one only once its day passed. */
function elapsedMonths(startStr, emiDay, today) {
  const start = new Date(startStr);
  const now = new Date(today);
  if (isNaN(start.getTime()) || isNaN(now.getTime())) return 0;
  let m = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  const day = parseInt(emiDay, 10) || start.getDate();
  if (now.getDate() < day) m--;
  return Math.max(0, m);
}

const addMonths = (startStr, n, day) => {
  const start = new Date(startStr);
  const d = new Date(start.getFullYear(), start.getMonth() + n, 1);
  const dd = String(parseInt(day, 10) || start.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${dd}`;
};

/**
 * Every line of the firm's profit and loss, one record per real transaction.
 *
 * `today` is injectable so a test asserting on an EMI that has fallen due does
 * not change its answer tomorrow.
 *
 * @returns {Array<{id, date, month, kind, group, category, description,
 *                  amount, truckNo, fleet, location, ref, source}>}
 *          `kind` is 'income', 'expense' or 'settlement'; settlements are real
 *          money that is already counted elsewhere and must be left out of totals.
 */
export function buildPnlRecords(data = {}) {
  const {
    vouchers = [], vehicles = [], payments = [], cashbook = [],
    maintenance = [], tyres = [], tolls = [],
    today = new Date().toISOString().slice(0, 10),
  } = data;

  const own = ownFleet(vehicles);
  const plantOf = plantIndex(vouchers);
  const out = [];
  const push = (r) => {
    if (!(r.amount > 0)) return;
    out.push({ fleet: 'firm', truckNo: '', ref: '', location: 'Jharli', ...r, month: monthOf(r.date) });
  };

  // ── Trips ────────────────────────────────────────────────────────────────
  vouchers.forEach((v, i) => {
    const id = v.id || `v${i}`;
    const truck = upper(v.truckNo);
    const isOwn = own.has(truck);
    const lr = v.deliveries?.length
      ? v.deliveries.map(d => d.lrNo).filter(Boolean).join(', ')
      : (v.lrNo || '');
    const base = {
      date: v.date,
      truckNo: truck,
      location: plantOf(v),
      ref: lr ? `LR ${lr}` : 'Voucher',
      source: 'voucher',
      fleet: isOwn ? 'own' : 'market',
    };

    if (isOwn) {
      // The firm's own truck: the freight is the firm's earning, and every
      // rupee the trip burns is the firm's cost.
      push({ ...base, id: `freight-${id}`, kind: 'income', group: 'income',
        category: 'Own-fleet freight',
        description: `Freight on ${truck}${v.destination ? ` to ${v.destination}` : ''}`,
        amount: voucherGross(v) });

      push({ ...base, id: `diesel-${id}`, kind: 'expense', group: 'running',
        category: 'Diesel',
        description: v.advanceDiesel === 'FULL'
          ? `Full tank for ${truck} — estimated, not yet verified`
          : `Trip diesel for ${truck}`,
        amount: voucherDiesel(v) });

      push({ ...base, id: `tripadv-${id}`, kind: 'expense', group: 'running',
        category: 'Driver trip advances',
        description: `Cash and online advance to the driver of ${truck}`,
        amount: num(v.advanceCash) + num(v.advanceOnline) });

      push({ ...base, id: `tripextra-${id}`, kind: 'expense', group: 'running',
        category: 'Trip extras',
        description: `Puncture, grease and extra cash on ${truck}`,
        amount: voucherTripExtras(v) });
    } else {
      // A hired truck: the client's bill and the owner's payout are money
      // passing through. Only what the firm keeps is income.
      push({ ...base, id: `comm-${id}`, kind: 'income', group: 'income',
        category: 'Commission earned',
        description: `Commission on ${truck || 'a market truck'}`,
        amount: num(v.commission) });

      push({ ...base, id: `munshi-${id}`, kind: 'income', group: 'income',
        category: 'Munshi retained',
        description: `Munshi held back from ${truck || 'a market truck'}`,
        amount: voucherMunshi(v) });

      push({ ...base, id: `short-${id}`, kind: 'income', group: 'income',
        category: 'Shortage recovered',
        description: `Shortage recovered from ${truck || 'a market truck'}`,
        amount: num(v.shortage) });
    }
  });

  // ── Payments from the Pay module ─────────────────────────────────────────
  // No `truckNo` filter here: payment records have never carried one, and
  // filtering on it is what used to discard every pump, tyre and workshop
  // settlement without a word.
  payments.forEach((p, i) => {
    const id = p.id || `p${i}`;
    const who = p.profileName || p.otherProfileName || 'a profile';
    const base = { date: p.date, source: 'payment', ref: p.paymentMethod || 'Pay',
      location: plantOf({ remark: p.remark }) };
    const amount = num(p.amount);

    if (SALARY_CATEGORIES.has(p.category)) {
      push({ ...base, id: `pay-${id}`, kind: 'expense', group: 'people',
        category: 'Driver & staff salary',
        description: `${p.category} paid to ${who}`, amount });
    } else if (SETTLEMENT_CATEGORIES.has(p.category)) {
      push({ ...base, id: `settle-${id}`, kind: 'settlement', group: 'settlement',
        category: `${p.category} settlement`,
        description: `Settled with ${who}${p.remark ? ` — ${p.remark}` : ''}`, amount });
    } else {
      const office = hasWord(p.remark, OFFICE_WORDS);
      push({ ...base, id: `other-${id}`, kind: 'expense', group: 'overheads',
        category: office ? 'Office expenses' : 'Other firm expenses',
        description: p.remark || `Payment to ${who}`, amount });
    }
  });

  // ── Cashbook ─────────────────────────────────────────────────────────────
  // A returned cash-out and its refund cancel each other, so both sides are
  // skipped rather than counted and then subtracted.
  cashbook.forEach((cb, i) => {
    if (cb.isRefundEntry || cb.isReturned) return;
    const id = cb.id || `cb${i}`;
    const truck = upper(cb.truckNo || cb.vehicleNo || (cb.entityType === 'vehicle' ? cb.entityId : ''));
    const amount = num(cb.amount);
    const base = { date: cb.date, truckNo: truck, source: 'cashbook', ref: 'Cashbook',
      location: plantOf({ truckNo: truck, remark: cb.remark }),
      fleet: truck ? (own.has(truck) ? 'own' : 'market') : 'firm' };

    if (cb.type === 'deposit') {
      push({ ...base, id: `dep-${id}`, kind: 'income', group: 'income',
        category: 'Other receipts', description: cb.remark || 'Cash deposit', amount });
      return;
    }
    if (cb.type !== 'cash_out') return;

    if (cb.entityType === 'driver' || cb.entityType === 'staff') {
      push({ ...base, id: `cbstaff-${id}`, kind: 'expense', group: 'people',
        category: 'Driver & staff salary',
        description: cb.remark || `Cash to ${cb.entityName || 'staff'}`, amount });
    } else if (cb.entityType === 'vehicle') {
      // The mirror of a vehicle advance. Counted here, once — the app writes
      // the pair together and there is no list-all route for the other side.
      push({ ...base, id: `cbveh-${id}`, kind: 'expense', group: 'running',
        category: 'Driver trip advances',
        description: cb.remark || `Advance against ${truck}`, amount });
    } else if (hasWord(cb.remark, LABOUR_WORDS)) {
      push({ ...base, id: `cblab-${id}`, kind: 'expense', group: 'people',
        category: 'Labour & handling', description: cb.remark || 'Labour', amount });
    } else {
      const office = hasWord(cb.remark, OFFICE_WORDS);
      push({ ...base, id: `cbgen-${id}`, kind: 'expense', group: 'overheads',
        category: office ? 'Office expenses' : 'Other firm expenses',
        description: cb.remark || 'Cash out', amount });
    }
  });

  // ── Vehicle loan EMIs ────────────────────────────────────────────────────
  vehicles.forEach((veh, i) => {
    const truck = upper(veh.truckNo);
    if (!own.has(truck)) return;
    const emi = parseEmi(veh.emiDetails);
    if (!emi) return;
    const due = num(emi.due);
    const bank = emi.bankName || 'the bank';
    const base = { truckNo: truck, fleet: 'own', source: 'vehicle',
      ref: emi.loanNo || 'EMI', location: plantOf({ truckNo: truck }),
      kind: 'expense', group: 'finance', category: 'Vehicle loan EMI' };
    const schedule = emi.schedule || [];

    if (schedule.length > 0) {
      // An installment is a cost once its due date passes, whether or not
      // anyone has ticked it off — which is how EmiScheduleTracker reads it.
      schedule.forEach(it => {
        const fallen = it.status === 'paid' || (it.dueDate && it.dueDate <= today);
        if (!fallen) return;
        push({ ...base, id: `emi-${veh.id || i}-${it.installmentNo}`,
          date: it.paymentDate || it.dueDate,
          description: `EMI #${it.installmentNo} on ${truck} to ${bank}`,
          amount: num(it.amount) || due });
      });
      return;
    }
    if ((emi.paidEmis || []).length > 0) {
      emi.paidEmis.forEach(m => {
        push({ ...base, id: `emi-${veh.id || i}-${m}`, date: `${m}-05`,
          description: `EMI on ${truck} to ${bank}`, amount: due });
      });
      return;
    }
    // No schedule was ever generated. The loan is still being repaid, so
    // accrue one instalment a month, capped at the tenure. The first falls due
    // a month after the start date, which is where handleGenerateSchedule puts
    // it — off by one here and every accrued date would name the wrong month.
    if (emi.startDate && due > 0) {
      const tenure = parseInt(emi.tenure, 10) || 0;
      let n = elapsedMonths(emi.startDate, emi.emiDay, today);
      if (tenure > 0) n = Math.min(n, tenure);
      for (let k = 1; k <= n; k++) {
        push({ ...base, id: `emi-${veh.id || i}-auto${k}`,
          date: addMonths(emi.startDate, k, emi.emiDay),
          description: `EMI on ${truck} to ${bank} — from the loan terms, no schedule recorded`,
          amount: due });
      }
    }
  });

  // ── Workshop, tyres and tolls ────────────────────────────────────────────
  maintenance.forEach((m, i) => {
    const truck = upper(m.truckNo);
    if (!own.has(truck)) return;
    push({ id: `maint-${m.id || i}`, date: m.date, kind: 'expense', group: 'running',
      category: 'Maintenance', truckNo: truck, fleet: 'own', source: 'maintenance',
      ref: m.vendor || 'Workshop', location: plantOf({ truckNo: truck }),
      description: `${m.partName || 'Repair'} on ${truck}`,
      amount: num(m.cost) + num(m.labourCost) });
  });

  tyres.forEach((t, i) => {
    // A tyre is a cost when it is bought. Stock not yet fitted is still the
    // firm's money, so it counts firm-wide — but one fitted to a truck the firm
    // does not own is the owner's tyre, and charging it here buried the sheet
    // under a fleet the firm never paid for.
    const truck = upper(t.fitment?.truckNo);
    if (truck && !own.has(truck)) return;
    push({ id: `tyre-${t.id || i}`, date: t.purchaseDate, kind: 'expense', group: 'running',
      category: 'Tyres', truckNo: truck, fleet: truck ? 'own' : 'firm',
      source: 'tyre', ref: t.serialNo || 'Tyre',
      location: truck ? plantOf({ truckNo: truck }) : 'Jharli',
      description: `${t.brand || 'Tyre'} ${t.size || ''} ${truck ? `on ${truck}` : '— stock'}`.trim(),
      amount: num(t.purchasePrice) });
  });

  tolls.forEach((t, i) => {
    const truck = upper(t.truckNo);
    if (!own.has(truck)) return;
    push({ id: `toll-${t.id || i}`, date: t.date, kind: 'expense', group: 'running',
      category: 'Tolls', truckNo: truck, fleet: 'own', source: 'toll',
      ref: t.route || 'Toll', location: plantOf({ truckNo: truck }),
      description: `Toll on ${truck}${t.route ? ` — ${t.route}` : ''}`,
      amount: num(t.amount) });
  });

  return out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/**
 * Totals for a set of records. Settlements are money that really left the firm
 * but is already counted as a trip cost, so they are reported separately and
 * never folded into the expense total.
 */
export function summarisePnl(records = []) {
  const groups = {};
  PNL_GROUPS.forEach(g => { groups[g.key] = { ...g, total: 0, categories: {} }; });

  let income = 0, expense = 0, settlements = 0;
  records.forEach(r => {
    if (r.kind === 'settlement') { settlements += r.amount; return; }
    const g = groups[r.group];
    if (g) {
      g.total += r.amount;
      g.categories[r.category] = (g.categories[r.category] || 0) + r.amount;
    }
    if (r.kind === 'income') income += r.amount; else expense += r.amount;
  });

  const net = income - expense;
  return {
    income,
    expense,
    net,
    settlements,
    margin: income > 0 ? (net / income) * 100 : 0,
    groups: PNL_GROUPS.map(g => groups[g.key]),
  };
}

/** One row per own truck: what it earned, what it cost, what is left. */
export function perTruck(records = []) {
  const map = new Map();
  records.forEach(r => {
    if (r.kind === 'settlement' || r.fleet !== 'own' || !r.truckNo) return;
    if (!map.has(r.truckNo)) map.set(r.truckNo, { truckNo: r.truckNo, income: 0, expense: 0, categories: {} });
    const row = map.get(r.truckNo);
    if (r.kind === 'income') row.income += r.amount; else row.expense += r.amount;
    row.categories[r.category] = (row.categories[r.category] || 0) + r.amount;
  });
  return [...map.values()]
    .map(r => ({ ...r, net: r.income - r.expense }))
    .sort((a, b) => b.net - a.net);
}

/**
 * What the sheet could not see. A page that quietly reports zero because a
 * collection failed to load is worse than one that says so.
 */
export function pnlCoverage(data = {}, records = []) {
  const { vouchers = [], vehicles = [], payments = [], loadFailures = [] } = data;
  const own = ownFleet(vehicles);
  const notes = [];

  const noRate = vouchers.filter(v => own.has(upper(v.truckNo)) && voucherGross(v) <= 0).length;
  if (noRate) notes.push(`${noRate} own-fleet trip${noRate === 1 ? '' : 's'} earn nothing here — no rate has been entered`);

  const fullTank = vouchers.filter(v => v.advanceDiesel === 'FULL').length;
  if (fullTank) notes.push(`${fullTank} full-tank trip${fullTank === 1 ? '' : 's'} counted at the ₹${FULL_TANK_ESTIMATE.toLocaleString('en-IN')} estimate — verify the diesel to correct it`);

  // An empty `emiDetails` object is what a vehicle carries when nobody filled
  // the loan in, so the instalment amount is what decides whether there is one.
  const noEmi = [...own].filter(t => {
    const veh = vehicles.find(v => upper(v.truckNo) === t);
    return veh && num(parseEmi(veh.emiDetails)?.due) <= 0;
  }).length;
  if (noEmi) notes.push(`${noEmi} own truck${noEmi === 1 ? ' has' : 's have'} no loan details — any EMI on ${noEmi === 1 ? 'it' : 'them'} is missing`);

  const settled = records.filter(r => r.kind === 'settlement').reduce((s, r) => s + r.amount, 0);
  if (settled > 0) notes.push(`₹${Math.round(settled).toLocaleString('en-IN')} of pump, tyre and workshop settlements is left out — that money is already counted as a trip cost`);

  if (payments.length) notes.push('Payments carry no truck number, so pump, tyre and workshop money is shown firm-wide rather than per truck');

  loadFailures.forEach(name => notes.push(`${name} did not load — those costs are missing from this sheet`));

  return notes;
}
