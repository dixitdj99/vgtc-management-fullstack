/**
 * AllBalanceSheet — every plant's trips in one list.
 *
 * There are six balance sheets, one per voucher type, and each is vehicle-first:
 * pick a truck, open its months, tick entries, send them to Pay. A truck that ran
 * for three plants this month has to be found and sent three times, and no sheet
 * shows the clerk the other two.
 *
 * This is the read-across view. One flat row per trip, the plant and truck as
 * columns, filters over the lot, and a single Send to Pay that groups whatever
 * is ticked into one batch per (type, truck) — which is the shape the batch API
 * already takes.
 *
 * Two rules it lives by:
 *
 *  - **The numbers must agree with the six sheets.** calcNet, calcGross,
 *    payBlockers and the row itself are imported from BalanceSheet.jsx, not
 *    reimplemented. A combined view that disagrees with what it summarises is
 *    worse than no combined view.
 *
 *  - **It must not widen anyone's access.** Rows are limited to the plants the
 *    user already holds a balance_* permission for, so this screen shows more
 *    conveniently, never more.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import ax from '../api';
import {
  BarChart3, Loader2, Search, Banknote, AlertTriangle, X, Download, Printer,
  Truck as TruckIcon, Trash2, RotateCcw,
} from 'lucide-react';
import ColumnFilter from '../components/ColumnFilter';
import { columnValues } from '../components/ColumnFilter';
import Pagination from '../components/Pagination';
import { exportToExcel, exportToPDF, buildExportRows } from '../utils/exportUtils';
import { calcNet, calcGross, payBlockers, pumpNameOf, lrLabelOf, explodeAll, VoucherRow, VoucherEditModal, TH, TD } from './BalanceSheet';
import TableScroll from '../components/TableScroll';
import TruckLoader from '../components/TruckLoader';

const API_V = '/vouchers';

/** The six sheets, and the permission each one already answers to. */
export const TYPE_META = {
  Kosli_Bill: { label: 'Kosli Bill', short: 'Kosli', permKey: 'balance_kosli', color: '#6366f1' },
  Jajjhar_Bill: { label: 'Jhajjar Bill', short: 'Jhajjar', permKey: 'balance_jhajjar', color: '#0ea5e9' },
  Bahadurgarh_Bill: { label: 'Bahadurgarh Bill', short: 'Bahadurgarh', permKey: 'balance_bahadurgarh', color: '#d97706' },
  JK_Super: { label: 'JK Super', short: 'JK Super', permKey: 'balance_jksuper', color: '#10b981' },
  Dump: { label: 'JKL Dump', short: 'JKL Dump', permKey: 'balance_jkl_dump', color: '#f59e0b' },
  JK_Lakshmi: { label: 'JK Lakshmi', short: 'JK Lakshmi', permKey: 'balance_jkl', color: '#f43f5e' },
};

const fmtRs = n => 'Rs.' + Math.round(n || 0).toLocaleString('en-IN');

/** Which of the six a user may see. Admin sees all; everyone else, what they hold. */
export function visibleTypes(role, permissions = {}) {
  if (role === 'admin') return Object.keys(TYPE_META);
  return Object.entries(TYPE_META)
    .filter(([, m]) => permissions?.[m.permKey])
    .map(([type]) => type);
}

/**
 * Ticked trips -> the batches the API wants, one per (type, truck).
 *
 * A batch belongs to a truck within a plant, so a selection spanning both has to
 * be split before it is sent. Exported for the tests, which is where this is
 * worth pinning down: getting it wrong sends a trip under the wrong plant and
 * the balance sheet it came from never shows it as gone.
 */
export function groupIntoBatches(trips) {
  const groups = new Map();
  for (const v of trips) {
    // Escaped rather than typed literally: a raw NUL in the source makes git and
    // grep treat this whole file as binary, so it stops showing diffs.
    const key = `${v.type}\u0000${v.truckNo}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  }
  return [...groups.values()].map(rows => {
    const dates = rows.map(r => r.date).filter(Boolean).sort();
    return {
      type: rows[0].type,
      truckNo: rows[0].truckNo,
      voucherIds: rows.map(r => r.id),
      periodFrom: dates[0] || null,
      periodTo: dates[dates.length - 1] || null,
    };
  });
}

const STATUS = {
  all: 'All',
  pending: 'Pending',
  sent: 'Sent to Pay',
  paid: 'Paid',
};

export default function AllBalanceSheet({ role = 'user', permissions = {} }) {
  const { user } = useAuth();
  const orgName = user?.org?.name || 'VIKAS GOODS TRANSPORT CO.';

  const [vouchers, setVouchers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [batches, setBatches] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({});
  const [status, setStatus] = useState('all');
  const [truckSearch, setTruckSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [sending, setSending] = useState(false);
  const [sendBlocked, setSendBlocked] = useState(null);
  const [delVoucher, setDelVoucher] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [dieselTarget, setDieselTarget] = useState(null);
  const [dieselForm, setDieselForm] = useState({ amount: '' });

  const allowedTypes = useMemo(() => visibleTypes(role, permissions), [role, permissions]);
  const canEdit = role === 'admin' || permissions?.balance === 'edit';

  /* ── Data ─────────────────────────────────────────────────────────────── */

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, vehRes, bRes] = await Promise.all([
        // One request for every type — the same route the per-plant sheets use
        // to look a truck up across plants.
        ax.get(API_V, { _skipCache: true }).then(r => r.data).catch(() => []),
        ax.get('/vehicles').then(r => r.data).catch(() => []),
        ax.get('/freight-batches', { params: { open: 1 }, _skipCache: true }).then(r => r.data).catch(() => []),
      ]);
      setVouchers(Array.isArray(vRes) ? vRes : []);
      setVehicles(Array.isArray(vehRes) ? vehRes : []);
      setBatches(Array.isArray(bRes) ? bRes : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /** voucherId -> the open batch holding it, so a row can show it has gone. */
  const sentIds = useMemo(() => {
    const map = new Map();
    batches.forEach(b => (b.voucherIds || []).forEach(id => map.set(id, b)));
    return map;
  }, [batches]);

  const vehicleOf = useCallback(
    truckNo => (vehicles || []).find(x => x.truckNo === truckNo),
    [vehicles],
  );

  /* ── Rows ─────────────────────────────────────────────────────────────── */

  /** Every trip the user may see, decorated with what the filters and table need. */
  const rows = useMemo(() => {
    const allow = new Set(allowedTypes);
    const src = vouchers.filter(v => allow.has(v.type));

    // Status belongs to the voucher, never to a leg.
    //
    // A leg carries only its own freight; the diesel, the cash, the munshi and
    // the payment all sit on the first one. Judged on its own arithmetic the
    // first leg of a heavily-advanced trip owes nothing and reads as "paid",
    // while its siblings still owe and read as "sent" — so one voucher landed
    // in three different tabs and no tab ever showed the whole trip. Worked out
    // once per voucher and stamped on every leg of it.
    const voucherState = new Map();
    for (const v of src) {
      const net = calcNet(v, vehicleOf(v.truckNo));
      const outstanding = Math.max(0, net - (parseFloat(v.paidBalance) || 0));
      const isSent = sentIds.has(v.id);
      const isCleared = !!v.paymentClearedDate || !!v.isPaid || (parseFloat(v.paidBalance) > 0 && outstanding <= 0);
      voucherState.set(v.id, {
        _voucherNet: net,
        _voucherOutstanding: outstanding,
        _sent: isSent,
        // "Pending" is the clerk's work list: still owed or uncleared, not yet handed over.
        _status: isCleared ? 'paid' : isSent ? 'sent' : 'pending',
      });
    }

    // A voucher covering several LRs becomes one row per LR — each drop has its
    // own destination, rate and LR number. See explodeVoucher.
    return explodeAll(src)
      .map(v => {
        const vehicle = vehicleOf(v.truckNo);
        const net = calcNet(v, vehicle);
        const paid = parseFloat(v.paidBalance) || 0;
        return {
          ...v,
          plant: TYPE_META[v.type]?.short || v.type || '—',
          _vehicle: vehicle,
          // This leg's own figures, which is what its row shows and what makes
          // the legs add up to the voucher.
          _net: net,
          _paid: paid,
          _outstanding: Math.max(0, net - paid),
          // Whether it has been sent or settled comes from the voucher.
          ...voucherState.get(v._parentId || v.id),
        };
      })
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [vouchers, allowedTypes, vehicleOf, sentIds]);

  const filtered = useMemo(() => {
    const q = truckSearch.trim().toUpperCase();
    return rows.filter(v => {
      if (status !== 'all' && v._status !== status) return false;
      if (q && !String(v.truckNo || '').toUpperCase().includes(q)) return false;
      // ColumnFilter stores an array of accepted values per column.
      for (const [key, vals] of Object.entries(filters)) {
        if (!vals?.length) continue;
        if (!columnValues(v, key).some(x => vals.includes(x))) return false;
      }
      return true;
    });
  }, [rows, filters, status, truckSearch]);

  // Paging is not optional here — unfiltered, this is every trip ever recorded.
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );
  useEffect(() => { setPage(1); }, [filters, status, truckSearch, pageSize]);

  // Gross, net and paid add up across legs by construction — the deductions sit
  // on one leg and the freight is split, so the parts come to the whole.
  //
  // Outstanding does not. It is floored at zero per row, so a first leg that is
  // Rs.5,860 in hand contributes nothing instead of offsetting its siblings, and
  // a trip owing 1,250 was counted at 7,110. Taken once per voucher.
  const totals = useMemo(() => {
    const counted = new Set();
    return filtered.reduce((acc, v) => {
      const vid = v._parentId || v.id;
      const firstSeen = !counted.has(vid);
      if (firstSeen) counted.add(vid);
      return {
        trips: acc.trips + 1,
        gross: acc.gross + calcGross(v),
        net: acc.net + v._net,
        paid: acc.paid + v._paid,
        outstanding: acc.outstanding + (firstSeen ? (v._voucherOutstanding ?? v._outstanding) : 0),
      };
    }, { trips: 0, gross: 0, net: 0, paid: 0, outstanding: 0 });
  }, [filtered]);

  /* ── Selection ────────────────────────────────────────────────────────── */

  // Held above the page slice, so ticking survives paging. Without that,
  // "select this month across plants" is impossible on an unfiltered list.
  const onCheck = useCallback(id => {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  // Every leg of a ticked voucher: the deductions sit on the first leg and the
  // freight is spread across the rest, so totalling the ticked rows alone would
  // understate what the trip is worth.
  const selRows = useMemo(() => filtered.filter(v => selected.has(v._parentId || v.id)), [filtered, selected]);

  /**
   * The records behind the selection, one per voucher -- what a write
   * addresses.
   *
   * This used to keep the row rather than the voucher. Every leg of a
   * multi-LR voucher shares the parent key, a Map keeps the last value for
   * a repeated key, and the last leg is one with `_leg > 0` -- which the
   * filter then dropped. The whole voucher fell out of the selection and
   * Send to Pay had nothing to send.
   *
   * Status and outstanding are recomputed on the voucher, not summed from
   * the legs. A leg whose deductions outrun its own freight reports zero
   * outstanding rather than a negative one, so adding legs up overstates
   * the trip: -5,860 + 4,740 + 2,370 sums to 7,110 as legs and is 1,250 as
   * a voucher.
   */
  const selVouchers = useMemo(() => {
    const byVoucher = new Map();
    for (const r of selRows) {
      const key = r._parentId || r.id;
      if (!byVoucher.has(key)) byVoucher.set(key, r._original || r);
    }
    return [...byVoucher.values()].map(voucher => {
      const vehicle = vehicleOf(voucher.truckNo);
      const net = calcNet(voucher, vehicle);
      const paid = parseFloat(voucher.paidBalance) || 0;
      const outstanding = Math.max(0, net - paid);
      const isSent = sentIds.has(voucher.id);
      return {
        ...voucher,
        plant: TYPE_META[voucher.type]?.short || voucher.type || String.fromCharCode(8212),
        _vehicle: vehicle,
        _net: net,
        _paid: paid,
        _outstanding: outstanding,
        _sent: isSent,
        _status: (!!voucher.paymentClearedDate || !!voucher.isPaid || (parseFloat(voucher.paidBalance) > 0 && outstanding <= 0)) ? "paid" : isSent ? "sent" : "pending",
      };
    });
  }, [selRows, vehicleOf, sentIds]);
  // Legs after the first are a view of the same voucher — sending one would
  // send the trip twice, so only the voucher itself is selectable.
  const sendable = useMemo(() => filtered.filter(v => v._status === 'pending' && !(v._leg > 0)), [filtered]);

  const toggleAllFiltered = () => {
    const ids = sendable.map(v => v.id);
    const allOn = ids.length > 0 && ids.every(id => selected.has(id));
    setSelected(s => {
      const n = new Set(s);
      ids.forEach(id => allOn ? n.delete(id) : n.add(id));
      return n;
    });
  };

  /* ── Send to Pay ──────────────────────────────────────────────────────── */

  const sendSelectedToPay = async () => {
    // Whole vouchers only: a leg has a synthetic id the batch API would reject,
    // and sending both legs would send the trip twice.
    const trips = selVouchers.filter(v => v._status === 'pending');
    if (!trips.length || sending) return;

    // Stop on the whole selection rather than quietly sending the good ones —
    // half a batch is worse than none, because the clerk cannot tell which half.
    const notReady = trips
      .map(v => ({ v, problems: payBlockers(v) }))
      .filter(x => x.problems.length);
    if (notReady.length) { setSendBlocked(notReady); return; }

    setSending(true);
    try {
      const payload = groupIntoBatches(trips);
      const { data } = await ax.post('/freight-batches', { batches: payload });
      await fetchAll();
      setSelected(new Set());
      const skipped = data.skipped?.length
        ? `\n${data.skipped.length} entry(s) were already sent and were left out.` : '';
      const trucks = new Set(trips.map(t => t.truckNo)).size;
      alert(`Sent ${trips.length} trip${trips.length === 1 ? '' : 's'} across ${payload.length} batch${payload.length === 1 ? '' : 'es'} (${trucks} truck${trucks === 1 ? '' : 's'}) to Pay.${skipped}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not send to Pay');
      fetchAll();
    } finally { setSending(false); }
  };

  /* ── Row actions ──────────────────────────────────────────────────────── */

  const deleteVoucher = async () => {
    if (!delVoucher) return;
    try { await ax.delete(`${API_V}/${delVoucher.id}`); setDelVoucher(null); fetchAll(); }
    catch { alert('Delete failed'); }
  };

  const verifyDiesel = async () => {
    if (!dieselTarget) return;
    try {
      // Amount only. Verification is a check that the money is right; litres and
      // the pump were being retyped from what the voucher already held.
      await ax.patch(`${API_V}/${dieselTarget.id}/verify-diesel`, {
        dieselActualAmount: dieselForm.amount,   // only read for a full tank
      });
      setDieselTarget(null); setDieselForm({ amount: '' }); fetchAll();
    } catch { alert('Verification failed'); }
  };

  /* ── Truck strip ──────────────────────────────────────────────────────── */

  /** The one truck the filters have narrowed to, if they have. */
  const soleTruck = useMemo(() => {
    const set = new Set(filtered.map(v => v.truckNo).filter(Boolean));
    return set.size === 1 ? [...set][0] : null;
  }, [filtered]);

  useEffect(() => {
    if (!soleTruck) { setAdvances([]); return; }
    let cancelled = false;
    ax.get(`/vehicle-advances/${encodeURIComponent(soleTruck)}`)
      .then(r => { if (!cancelled) setAdvances(r.data || []); })
      .catch(() => { if (!cancelled) setAdvances([]); });
    return () => { cancelled = true; };
  }, [soleTruck]);

  // Manual entries only, same rule as the per-plant sheet — GPS rent and
  // payment-cleared rows are posted automatically and would double-count.
  const advanceBalance = useMemo(() => advances
    .filter(a => {
      const r = (a.remark || '').toLowerCase();
      return !(r.includes('gps rent') || r.includes('auto-deduct') || r.includes('payment cleared'));
    })
    .reduce((bal, a) => bal + (a.type === 'credit' ? a.amount : -a.amount), 0), [advances]);

  /* ── Export ───────────────────────────────────────────────────────────── */

  /**
   * Every field on the trip, through the same builder the per-plant sheet uses,
   * so an export from either place carries the same columns. The row already
   * knows its own net and outstanding, so those are read rather than recomputed.
   */
  const exportRows = (list = filtered) => buildExportRows(list, {
    order: ['plant', 'date', 'truckNo', 'lrNo', 'billNo', 'partyCode', 'partyName', 'destination', 'weight', 'rate'],
    computed: {
      Gross: v => Math.round(calcGross(v)),
      'Net Balance': v => Math.round(v._net),
      Paid: v => Math.round(v._paid),
      Outstanding: v => Math.round(v._outstanding),
      Status: v => STATUS[v._status],
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);

  /* ── Render ───────────────────────────────────────────────────────────── */

  if (!allowedTypes.length) {
    return (
      <div className="page-hd">
        <h1><BarChart3 size={20} color="#f59e0b" /> All Balance Sheet</h1>
        <p>You do not have access to any plant's balance sheet yet. Ask an admin to grant one.</p>
      </div>
    );
  }

  const allSendableTicked = sendable.length > 0 && sendable.every(v => selected.has(v.id));

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', width: '100%' }}>
        <TruckLoader size={130} text="Loading balance dump register across all plants..." />
      </div>
    );
  }

  return (
    // Nineteen columns of figures. On a wide monitor the 1440px cap left a
    // third of the screen empty while the table itself had to be scrolled.
    <div className="page-full">
      <div className="page-hd">
        <div>
          <h1><BarChart3 size={20} color="#f59e0b" /> All Balance Sheet</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn btn-g btn-sm" onClick={fetchAll} disabled={loading} title="Reload">
            {loading ? <Loader2 size={13} className="spin" /> : <RotateCcw size={13} />} Refresh
          </button>
          <button className="btn btn-g btn-sm" onClick={() => exportToExcel(exportRows(), `All_Balance_${stamp}`)}>
            <Download size={13} /> Excel
          </button>
          <button className="btn btn-g btn-sm"
            onClick={() => exportToPDF(exportRows(), `${orgName} — All Balance Sheet`, null,
              { archive: { module: 'Balance Sheet', name: `All Plants Export ${stamp}` } })}>
            <Printer size={13} /> PDF
          </button>
          {/* Ticked rows only. Sitting beside the full export rather than
              replacing it, so it is never a question which one a press gives
              you — a 48-page PDF when eight rows were wanted is a wasted
              print run, and the reverse is worse. */}
          {selRows.length > 0 && (
            <button className="btn btn-p btn-sm"
              title={`Export only the ${selRows.length} ticked ${selRows.length === 1 ? 'entry' : 'entries'}`}
              onClick={() => exportToPDF(
                exportRows(selRows),
                `${orgName} — All Balance Sheet (selected)`,
                null,
                { archive: { module: 'Balance Sheet', name: `Selected Export ${stamp}` } })}>
              <Printer size={13} /> PDF ({selRows.length} selected)
            </button>
          )}
        </div>
      </div>

      {/* One truck in view — show what the per-truck sheet would */}
      {soleTruck && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 16px', marginBottom: '14px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 900, fontSize: '14px', color: 'var(--text)' }}>
            <TruckIcon size={15} color="var(--primary)" /> {soleTruck}
          </span>
          {[
            ['Trips', totals.trips],
            ['Net', fmtRs(totals.net)],
            ['Outstanding', fmtRs(totals.outstanding)],
            ['Vehicle advance', fmtRs(advanceBalance)],
          ].map(([k, val]) => (
            <span key={k} style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 700 }}>
              {k}: <strong style={{ color: 'var(--text)' }}>{val}</strong>
            </span>
          ))}
          <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            Across {new Set(filtered.map(v => v.type)).size} plant(s)
          </span>
        </div>
      )}

      {/* Status chips + truck search */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
        {Object.entries(STATUS).map(([key, label]) => {
          const n = key === 'all' ? rows.length : rows.filter(v => v._status === key).length;
          const on = status === key;
          return (
            <button key={key} type="button" onClick={() => setStatus(key)}
              style={{ padding: '6px 13px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 800, cursor: 'pointer',
                border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
                background: on ? 'rgba(99,102,241,0.1)' : 'transparent',
                color: on ? 'var(--primary)' : 'var(--text-muted)' }}>
              {label} <span style={{ opacity: 0.7 }}>({n.toLocaleString('en-IN')})</span>
            </button>
          );
        })}
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="fi" placeholder="Search truck…" value={truckSearch}
            onChange={e => setTruckSearch(e.target.value)}
            style={{ paddingLeft: '28px', height: '32px', width: '190px', fontSize: '12px' }} />
        </div>
        {Object.values(filters).some(v => v?.length) && (
          <button className="btn btn-g btn-sm" onClick={() => setFilters({})}><X size={12} /> Clear filters</button>
        )}
      </div>

      {/* Send to Pay */}
      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', marginBottom: '14px' }}>
          <Banknote size={16} color="#10b981" />
          <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>Send to Pay</span>
          <button className="btn btn-g btn-sm" onClick={toggleAllFiltered} disabled={!sendable.length}>
            {allSendableTicked ? 'Untick all' : `Tick all pending (${sendable.length})`}
          </button>
          {/* One ticked entry — edit it without hunting for its row. */}
          {selVouchers.length === 1 && (
            <button className="btn btn-g btn-sm" onClick={() => setEditRow(selVouchers[0]?._original || selVouchers[0])} title="Edit this entry">
              Edit Entry
            </button>
          )}
          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 700 }}>
            {selVouchers.length} selected
            {selRows.length > 0 && <> · {fmtRs(selVouchers.reduce((s, v) => s + v._outstanding, 0))} · {groupIntoBatches(selVouchers.filter(v => v._status === 'pending')).length} batch(es)</>}
                  {/*
                    A selection that cannot be sent used to look identical to
                    one that could: the same button, the same bar, and a press
                    that did nothing. The commonest reason is not an error at
                    all -- the deductions came to more than the freight, so the
                    trip owes nothing and there is nothing to pay out.
                  */}
                  {selVouchers.length > 0 && !selVouchers.some(v => v._status === "pending") && (
                    <span style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--warn)", marginTop: "2px" }}>
                      {selVouchers.every(v => v._sent)
                        ? "Already sent to Pay."
                        : selVouchers.every(v => v._outstanding <= 0)
                          ? `Nothing owed on ${selVouchers.length === 1 ? "this trip" : "these trips"} — deductions came to more than the freight. Recover it under Vehicle Credit & Debit.`
                          : "Nothing here can be sent — already sent, or nothing owed."}
                    </span>
                  )}
          </span>
          <button className="btn btn-p btn-sm" style={{ marginLeft: 'auto' }}
            onClick={sendSelectedToPay} disabled={sending || !selVouchers.some(v => v._status === 'pending')}>
            {sending ? <Loader2 size={13} className="spin" /> : <Banknote size={13} />} Send {selVouchers.filter(v => v._status === 'pending').length || ''} to Pay
          </button>
        </div>
      )}

      {/* The list */}
      <div className="card">
        <TableScroll>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-th)', position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{ ...TH, textAlign: 'center', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}>
                  <input type="checkbox" checked={allSendableTicked} onChange={toggleAllFiltered}
                    style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: 'var(--primary)' }} />
                </th>
                <th style={{ ...TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}>#</th>
                <th style={{ ...TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}><ColumnFilter label="Plant" colKey="plant" data={rows} activeFilters={filters} onFilterChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))} /></th>
                <th style={{ ...TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}><ColumnFilter label="Truck" colKey="truckNo" data={rows} activeFilters={filters} onFilterChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))} /></th>
                <th style={{ ...TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}><ColumnFilter label="Date" colKey="date" data={rows} activeFilters={filters} onFilterChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))} /></th>
                <th style={{ ...TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}><ColumnFilter label="ID" colKey="entryId" data={rows} activeFilters={filters} onFilterChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))} /></th>
                <th style={{ ...TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}><ColumnFilter label="LR No." colKey="lrNo" data={rows} activeFilters={filters} onFilterChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))} /></th>
                <th style={{ ...TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}><ColumnFilter label="Bill No." colKey="billNo" data={rows} activeFilters={filters} onFilterChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))} /></th>
                <th style={{ ...TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}><ColumnFilter label="Party Code" colKey="partyCode" data={rows} activeFilters={filters} onFilterChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))} /></th>
                <th style={{ ...TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}><ColumnFilter label="Destination" colKey="destination" data={rows} activeFilters={filters} onFilterChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))} /></th>
                <th style={{ ...TH, textAlign: 'right', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}>Weight</th>
                <th style={{ ...TH, textAlign: 'right', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}>Rate</th>
                <th style={{ ...TH, textAlign: 'right', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}>Gross</th>
                <th style={{ ...TH, textAlign: 'right', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}><ColumnFilter label="Diesel" colKey="advanceDiesel" data={rows} activeFilters={filters} onFilterChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))} /></th>
                <th style={{ ...TH, textAlign: 'right', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}><ColumnFilter label="Cash" colKey="advanceCash" data={rows} activeFilters={filters} onFilterChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))} /></th>
                <th style={{ ...TH, textAlign: 'right', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}><ColumnFilter label="Online" colKey="advanceOnline" data={rows} activeFilters={filters} onFilterChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))} /></th>
                <th style={{ ...TH, textAlign: 'right', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}><ColumnFilter label="Munshi" colKey="munshi" data={rows} activeFilters={filters} onFilterChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))} /></th>
                <th style={{ ...TH, textAlign: 'right', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}><ColumnFilter label="Shortage" colKey="shortage" data={rows} activeFilters={filters} onFilterChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))} /></th>
                <th style={{ ...TH, textAlign: 'left', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}><ColumnFilter label="Remarks" colKey="remark" data={rows} activeFilters={filters} onFilterChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))} /></th>
                <th style={{ ...TH, textAlign: 'right', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}>Veh. Exp</th>
                <th style={{ ...TH, textAlign: 'right', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}>Net Bal</th>
                <th style={{ ...TH, textAlign: 'right', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}>Paid</th>
                <th style={{ ...TH, textAlign: 'center', position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}>Status</th>
                {role === 'admin' && <th style={{ ...TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}>Created By</th>}
                {role === 'admin' && <th style={{ ...TH, position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-th)' }}>Updated By</th>}
                <th style={{ ...TH, position: 'sticky', top: 0, right: 0, zIndex: 20, background: 'var(--bg-th)', boxShadow: '-3px 0 6px rgba(0,0,0,0.18)', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!pageRows.length && (
                <tr><td colSpan={role === 'admin' ? 26 : 24} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                  No trips match these filters.
                </td></tr>
              )}
              {pageRows.map((v, i) => {
                const meta = TYPE_META[v.type];
                return (
                  <VoucherRow
                    key={v.id}
                    v={v}
                    idx={(page - 1) * pageSize + i}
                    vehicle={v._vehicle}
                    // Fixed column set across six types: bill columns always
                    // render, and read "—" for the three that have no bill.
                    isBillType
                    role={role}
                    permissions={permissions}
                    checked={selected.has(v._parentId || v.id)}
                    onCheck={onCheck}
                    onSave={fetchAll}
                    onDelete={setDelVoucher}
                    onEdit={setEditRow}
                    // onEdit already receives the whole voucher from the row.
                    onVerifyDiesel={t => { setDieselTarget(t); setDieselForm({ amount: '' }); }}
                    leadCells={<>
                      <td data-label="Plant" style={{ ...TD }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 800, background: `${meta?.color || '#64748b'}1a`, color: meta?.color || 'var(--text-muted)' }}>
                          {v.plant}
                        </span>
                        {v._sent && <div style={{ fontSize: '9px', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>SENT TO PAY</div>}
                      </td>
                      <td data-label="Truck" style={{ ...TD, fontWeight: 800, color: 'var(--text)' }}>{v.truckNo || '—'}</td>
                    </>}
                  />
                );
              })}
            </tbody>
          </table>
        </TableScroll>
        <Pagination
          currentPage={page}
          totalItems={filtered.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Edit an entry — the same dialog the per-plant sheets use, so a trip
          edited from here and from its own sheet behaves identically. */}
      {editRow && (
        <VoucherEditModal v={editRow} vehicle={editRow._vehicle}
          onClose={() => setEditRow(null)} onSaved={fetchAll} />
      )}

      {/* Blocked-send explanation */}
      {sendBlocked && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
          <div style={{ width: '94%', maxWidth: '520px', maxHeight: '80vh', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '16px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <AlertTriangle size={20} color="#f59e0b" />
              <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>Not ready to send</span>
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--text-sub)', marginBottom: '14px' }}>
              Nothing was sent. These entries have to be settled first — send the rest by unticking them.
            </p>
            {sendBlocked.map(({ v, problems }) => (
              <div key={v.id} style={{ padding: '9px 12px', borderRadius: '8px', background: 'var(--bg)', marginBottom: '7px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)' }}>
                  {v.plant} · {v.truckNo} · LR {lrLabelOf(v)}
                </div>
                <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700 }}>{problems.join(' · ')}</div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
              <button className="btn btn-g" onClick={() => setSendBlocked(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {delVoucher && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
          <div style={{ width: '90%', maxWidth: '360px', background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: '16px', padding: '26px', textAlign: 'center' }}>
            <Trash2 size={24} color="#f43f5e" />
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', margin: '10px 0 6px' }}>Delete this trip?</div>
            <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginBottom: '18px' }}>
              {delVoucher.plant} · LR #{delVoucher.lrNo} · {delVoucher.truckNo}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button className="btn btn-g" onClick={() => setDelVoucher(null)}>Cancel</button>
              <button className="btn btn-d" onClick={deleteVoucher}><Trash2 size={13} /> Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Diesel verification */}
      {dieselTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
          <div style={{ width: '90%', maxWidth: '380px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px' }}>
            {(() => {
              // The pump and the amount are already on the voucher — the only
              // figure the app cannot know is what a full tank actually cost.
              const isFull = dieselTarget.advanceDiesel === 'FULL' || dieselTarget.isFullTank;
              const spend = isFull ? (parseFloat(dieselForm.amount) || 0) : (parseFloat(dieselTarget.advanceDiesel) || 0);
              return (
                <>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Verify diesel</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginBottom: '4px' }}>
                    {dieselTarget.plant} · LR #{dieselTarget.lrNo} · {dieselTarget.truckNo}
                  </div>
                  <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--warn)', marginBottom: '16px' }}>
                    {isFull ? 'Booked as a full tank — carrying the Rs.4,000 estimate' : `Booked Rs.${dieselTarget.advanceDiesel}`}
                    {pumpNameOf(dieselTarget) ? ` · ${pumpNameOf(dieselTarget)}` : ''}
                  </div>

                  {isFull ? (
                    <div className="field-h" style={{ marginBottom: '16px' }}>
                      <label>Actual amount (Rs.) *</label>
                      <input className="fi" type="number" autoFocus placeholder="what the tank actually cost"
                        value={dieselForm.amount}
                        onChange={e => setDieselForm(f => ({ ...f, amount: e.target.value }))} />
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                        Replaces the estimate, so the net balance becomes the real one.
                      </span>
                    </div>
                  ) : (
                    <div style={{ marginBottom: '16px', fontSize: '12px', color: 'var(--text-sub)' }}>
                      Confirm this is what the driver actually spent.
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button className="btn btn-g" onClick={() => setDieselTarget(null)}>Cancel</button>
                    <button className="btn btn-p" onClick={verifyDiesel}
                      disabled={isFull && !(spend > 0)}
                      title={isFull && !(spend > 0) ? 'Enter what the full tank cost' : 'Verify'}>
                      Verify {spend > 0 ? `Rs.${spend.toLocaleString('en-IN')}` : ''}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
