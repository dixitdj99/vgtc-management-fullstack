import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import ax from '../api';
import * as XLSX from 'xlsx';
import {
  Users, Calendar, ChevronLeft, ChevronRight, Loader2, Save, BarChart3,
  Search, CheckCircle2, AlertTriangle, Sparkles, Download, RotateCcw,
} from 'lucide-react';
import { motion } from 'framer-motion';
import TruckLoader from '../components/TruckLoader';

/**
 * Attendance roll-call.
 *
 * Drivers and staff here cannot use apps, so they never touch this screen — a
 * supervisor does. The whole design follows from that:
 *
 *  - Everyone starts marked Present. The supervisor taps only the exceptions,
 *    which is the small minority on a normal day.
 *  - Drivers arrive pre-marked from their own trip records (vouchers, fuel logs),
 *    with the evidence shown on the tile. Drivers with no evidence either way are
 *    left blank and highlighted, so a real decision gets made instead of a guess.
 *  - Tiles are large, photo-led, and bilingual, because the person operating this
 *    at the gate is not necessarily reading English.
 */

const STATUSES = [
  { id: 'present',  label: 'Present',  hi: 'उपस्थित',   color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  { id: 'absent',   label: 'Absent',   hi: 'अनुपस्थित', color: '#f43f5e', bg: 'rgba(244,63,94,0.12)' },
  { id: 'half_day', label: 'Half Day', hi: 'आधा दिन',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  { id: 'leave',    label: 'Leave',    hi: 'छुट्टी',     color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
];

const STATUS_BY_ID = Object.fromEntries(STATUSES.map(s => [s.id, s]));
// Tapping a tile walks this order. Present -> Absent covers almost every change,
// and continuing to tap returns to the start, so a mis-tap is never a dead end.
const CYCLE = ['present', 'absent', 'half_day', 'leave'];

/**
 * Dates here are plain YYYY-MM-DD calendar days, not instants, so all arithmetic
 * runs in UTC and never touches the browser's zone.
 *
 * The trap: `new Date('2026-07-28T00:00:00')` parses as LOCAL midnight, and
 * `.toISOString()` then re-expresses it in UTC. In IST (UTC+5:30) that lands on
 * the previous day, so stepping forward appeared to do nothing and stepping back
 * skipped two days. Parsing the parts explicitly avoids the whole class of bug.
 */
const parseDay = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
};

const toDayString = (dt) => dt.toISOString().slice(0, 10);

/** Adds `delta` calendar days to a YYYY-MM-DD string. */
const addDays = (s, delta) => {
    const dt = parseDay(s);
    dt.setUTCDate(dt.getUTCDate() + delta);
    return toDayString(dt);
};

/** The user's own calendar date — deliberately local, not UTC. */
const today = () => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
};

const monthOf = d => d.slice(0, 7);
// timeZone: 'UTC' keeps the label on the day we actually asked for.
const fmtMonthLabel = m => parseDay(m + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtDateLabel = d => parseDay(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** Short enough to sit on a chip: "Sat 01 Aug". */
const fmtDayChip = d => parseDay(d).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
const initials = name => String(name || '?').trim().charAt(0).toUpperCase() || '?';

export default function AttendanceModule() {
  const { user } = useAuth();

  const [view, setView] = useState('daily');            // 'daily' | 'monthly'
  const [selectedDate, setSelectedDate] = useState(today());
  const [selectedMonth, setSelectedMonth] = useState(monthOf(today()));

  const [roster, setRoster] = useState(null);           // { date, rows, counts }
  const [summary, setSummary] = useState(null);         // { month, daysInMonth, rows }
  const [edits, setEdits] = useState({});               // profileId -> status
  const [touched, setTouched] = useState(new Set());    // profileIds the supervisor changed by hand
  const [query, setQuery] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState(null);

  const canEdit = user?.role === 'admin' || user?.permissions?.attendance === 'edit';

  /**
   * Days before today whose roll-call is unfinished.
   *
   * Today is excluded on purpose — it is the dashboard's job and is not "missed"
   * until the day is over. Reloaded after every save, so a day chased from here
   * drops out of the list.
   */
  const [pendingDays, setPendingDays] = useState([]);
  const loadPendingDays = useCallback(async () => {
    try {
      const { data } = await ax.get('/attendance/pending', { params: { days: 30 } });
      setPendingDays((data?.days || []).filter(d => !d.isToday));
    } catch { setPendingDays([]); }   // never block the roll-call over a side panel
  }, []);

  // Stepping through days quickly leaves several requests in flight at once, and
  // they can come back out of order — the grid would then show a different day
  // from the one in the header. Each load takes a ticket; only the newest one is
  // allowed to touch state.
  const requestRef = useRef(0);

  // ── Load the day's roll-call ───────────────────────────────────────────────
  const loadRoster = useCallback(async (date) => {
    const ticket = ++requestRef.current;
    const isStale = () => ticket !== requestRef.current;

    setLoading(true);
    setError(null);
    try {
      const { data } = await ax.get('/attendance/roster', { params: { date } });
      if (isStale()) return;

      // A server that does not know this route answers with the SPA's index.html
      // and a 200, which would otherwise render as a silently empty roll-call.
      if (!data || !Array.isArray(data.rows)) {
        setRoster(null);
        setError('The server did not return attendance data. It is probably running an older build — restart it and reload this page.');
        return;
      }

      setRoster(data);
      // Pre-fill: what is already saved wins, otherwise the suggestion. Drivers
      // with no evidence stay blank on purpose — see the unresolved banner below.
      const next = {};
      data.rows.forEach(r => {
        const value = r.status || r.suggested;
        if (value) next[r.profileId] = value;
      });
      setEdits(next);
      setTouched(new Set());
      setSavedAt(null);
    } catch (err) {
      if (isStale()) return;
      setError(err.response?.data?.error || err.message);
      setRoster(null);
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async (month) => {
    const ticket = ++requestRef.current;
    const isStale = () => ticket !== requestRef.current;

    setLoading(true);
    setError(null);
    try {
      const { data } = await ax.get('/attendance/summary', { params: { month } });
      if (isStale()) return;
      if (!data || !Array.isArray(data.rows)) {
        setSummary(null);
        setError('The server did not return a summary. It is probably running an older build — restart it and reload this page.');
        return;
      }
      setSummary(data);
    } catch (err) {
      if (isStale()) return;
      setError(err.response?.data?.error || err.message);
      setSummary(null);
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'daily') loadRoster(selectedDate);
  }, [view, selectedDate, loadRoster]);

  useEffect(() => { loadPendingDays(); }, [loadPendingDays]);

  useEffect(() => {
    if (view === 'monthly') loadSummary(selectedMonth);
  }, [view, selectedMonth, loadSummary]);

  /**
   * Auto-save.
   *
   * There is no Save button: a mark is written as soon as it is made. Debounced
   * rather than fired per tap, because a tile *cycles* — tapping through to
   * Leave passes Present, Absent and Half Day on the way, and each one would
   * otherwise be a write, with the intermediate ones landing in the audit trail
   * as decisions nobody made.
   *
   * One timer for the whole grid, not one per person: marking six people in a
   * row then becomes a single request rather than six.
   */
  const autoSaveTimer = useRef(null);
  const scheduleAutoSave = () => {
    if (!canEdit) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { autoSaveTimer.current = null; persist(); }, 600);
  };

  // ── Marking ────────────────────────────────────────────────────────────────
  const setStatus = (profileId, status) => {
    if (!canEdit) return;
    setEdits(e => ({ ...e, [profileId]: status }));
    setTouched(t => new Set(t).add(profileId));
    setSavedAt(null);
    scheduleAutoSave();
  };

  const cycleStatus = (profileId) => {
    const current = edits[profileId];
    // An unresolved driver starts at Present, since tapping means "he worked".
    const idx = CYCLE.indexOf(current);
    setStatus(profileId, CYCLE[(idx + 1) % CYCLE.length]);
  };

  const markAllPresent = () => {
    if (!canEdit || !roster) return;
    const next = {};
    roster.rows.forEach(r => { next[r.profileId] = 'present'; });
    setEdits(next);
    setTouched(new Set(roster.rows.map(r => r.profileId)));
    setSavedAt(null);
    scheduleAutoSave();
  };

  const resetToSuggested = () => {
    if (!canEdit || !roster) return;
    const next = {};
    roster.rows.forEach(r => {
      const value = r.status || r.suggested;
      if (value) next[r.profileId] = value;
    });
    setEdits(next);
    setTouched(new Set());
    setSavedAt(null);
    scheduleAutoSave();
  };

  const rows = roster?.rows || [];

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      String(r.name || '').toLowerCase().includes(q) ||
      String(r.vehicleNo || '').toLowerCase().includes(q) ||
      String(r.type || '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, half_day: 0, leave: 0, unresolved: 0 };
    rows.forEach(r => {
      const s = edits[r.profileId];
      if (!s) c.unresolved++;
      else if (c[s] !== undefined) c[s]++;
    });
    return c;
  }, [rows, edits]);

  /**
   * Two different questions, which used to share one answer.
   *
   * `pendingCount` is what the supervisor changed. A pre-selected suggestion is
   * not a change — counting it meant every freshly opened date announced
   * "2 changes not saved yet" and prompted on the way out, for marks nobody had
   * made.
   *
   * `unsavedCount` is everything on screen that is not in the database yet,
   * suggestions included. That is what still needs a Save press.
   */
  const pendingCount = useMemo(
    () => rows.filter(r => touched.has(r.profileId) && edits[r.profileId] !== r.status).length,
    [rows, edits, touched]
  );

  const unsavedCount = useMemo(
    () => rows.filter(r => edits[r.profileId] && edits[r.profileId] !== r.status).length,
    [rows, edits]
  );

  // ── Save ───────────────────────────────────────────────────────────────────
  /**
   * Writes whatever is on screen but not yet in the database.
   *
   * Only rows whose mark differs from the stored one are sent, so an auto-save
   * triggered by one tap does not rewrite the whole roll-call — and a person the
   * supervisor has not resolved is never given a status, because inventing an
   * "absent" is a wage decision.
   *
   * Reads state through a ref: it is called from a timer, where a closure would
   * hold whatever the grid looked like 600ms ago.
   */
  const stateRef = useRef({});
  stateRef.current = { rows, edits, touched, selectedDate, roster, canEdit };

  const persist = useCallback(async () => {
    const { rows: r0, edits: e0, touched: t0, selectedDate: date, roster: ros, canEdit: may } = stateRef.current;
    if (!may || !ros) return;

    const records = r0
      .filter(r => e0[r.profileId] && e0[r.profileId] !== r.status)
      .map(r => ({
        profileId: r.profileId,
        profileName: r.name,
        profileType: r.type,
        status: e0[r.profileId],
        // Untouched driver rows that came from trip data stay flagged derived,
        // so a later dispute can tell apart "the system worked this out" from
        // "a supervisor asserted this".
        source: !t0.has(r.profileId) && r.suggestedBy === 'trip_data' ? 'derived' : 'manual',
      }));

    if (!records.length) return;   // nothing changed — silence, not an error

    setSaving(true);
    setError(null);
    try {
      await ax.post('/attendance/bulk', { date, records });
      setSavedAt(Date.now());
      await loadRoster(date);
      // A day that is now complete has to leave the "earlier days" list, or the
      // banner keeps asking for work already done.
      loadPendingDays();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }, [loadRoster, loadPendingDays]);

  /**
   * A mark made in the last 600ms is still on a timer. Leaving the screen, or
   * closing the tab, has to write it first or it is simply lost — which is the
   * one thing auto-save must never do. Stepping to another date is handled in
   * changeDate below, because the timer would otherwise fire against the day
   * that has just been navigated to.
   */
  useEffect(() => () => {
    if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); persist(); }
  }, [persist]);

  useEffect(() => {
    const flush = () => { if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); persist(); } };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [persist]);

  /**
   * Moving to another date.
   *
   * A mark made in the last moment is still on the auto-save timer, and the
   * timer fires against whatever date is current when it goes off — so it is
   * written here, before the date moves, or it would land on the wrong day.
   * That is also why there is no longer a "you have unsaved changes" prompt:
   * there is nothing to lose by the time this returns.
   */
  const changeDate = useCallback(async (next) => {
    // `<input type="date">` fires while the field is still half-typed
    // ("0002-01-01"), which would otherwise fetch nonsense days on every
    // keystroke. Only act on a complete date.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(next || ''))) return;
    if (next === selectedDate) return;
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
      await persist();
    }
    setSelectedDate(next);
  }, [selectedDate, persist]);

  const shiftDate = delta => changeDate(addDays(selectedDate, delta));

  /** Same half-typed-value guard as changeDate, for `<input type="month">`. */
  const changeMonth = useCallback((next) => {
    if (!/^\d{4}-\d{2}$/.test(String(next || ''))) return;
    setSelectedMonth(next);
  }, []);

  const exportSummary = () => {
    if (!summary?.rows?.length) return;
    const sheet = XLSX.utils.json_to_sheet(summary.rows.map(r => ({
      Name: r.name,
      Type: r.type,
      Department: r.department,
      Present: r.present,
      Absent: r.absent,
      'Half Day': r.half_day,
      Leave: r.leave,
      'Paid Leave': r.paidLeave,
      'Unpaid Leave': r.unpaidLeave,
      'Leave Remaining': r.paidLeaveRemaining,
      'Days Marked': r.marked,
      'Days Unmarked': r.unmarked,
      'Payable Days': r.payableDays,
      'Fixed Salary': r.fixedSalary,
      'Estimated Pay': r.estimatedPay,
    })));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, summary.month);
    XLSX.writeFile(book, `attendance_${summary.month}.xlsx`);
  };

  // ── Chrome ─────────────────────────────────────────────────────────────────
  const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' };

  // Only the very first fetch of a view takes over the screen. Every later one —
  // stepping a day, picking a month — leaves the page mounted and swaps the data
  // underneath, so the arrows and the date field stay usable while it loads.
  // Unmounting them mid-load made the screen feel dead and dropped keystrokes in
  // the date input the moment a partial value fired a fetch.
  const firstLoad = loading && (view === 'daily' ? !roster : !summary);

  if (firstLoad) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', width: '100%' }}>
        <TruckLoader size={130} text="Loading staff attendance register..." />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', paddingBottom: '96px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={22} color="#6366f1" /> Attendance <span style={{ fontSize: '16px', color: 'var(--text-muted)', fontWeight: 700 }}>हाज़िरी</span>
          </h2>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {view === 'daily'
              ? 'Everyone starts Present — tap only the people who are not here.'
              : 'Monthly totals and payable days for payroll.'}
          </div>
        </div>
        <div style={{ display: 'flex', ...card, overflow: 'hidden' }}>
          {[{ id: 'daily', label: 'Daily Roll-Call', Icon: Calendar }, { id: 'monthly', label: 'Monthly Report', Icon: BarChart3 }].map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setView(id)} style={{
              padding: '9px 16px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
              background: view === id ? '#6366f1' : 'transparent',
              color: view === id ? '#fff' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s',
            }}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ ...card, borderColor: 'rgba(244,63,94,0.4)', background: 'rgba(244,63,94,0.08)', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', color: '#f43f5e', fontSize: '13px', fontWeight: 700 }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {firstLoad ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: '12px', color: 'var(--text-muted)' }}>
          <Loader2 size={20} className="spin" /> Loading…
        </div>
      ) : view === 'daily' ? (
        <DailyRollCall
          card={card}
          refreshing={loading}
          rows={visibleRows}
          allRows={rows}
          edits={edits}
          touched={touched}
          counts={counts}
          canEdit={canEdit}
          query={query}
          setQuery={setQuery}
          selectedDate={selectedDate}
          setSelectedDate={changeDate}
          shiftDate={shiftDate}
          cycleStatus={cycleStatus}
          setStatus={setStatus}
          markAllPresent={markAllPresent}
          resetToSuggested={resetToSuggested}
          pendingDays={pendingDays}
          saving={saving}
          savedAt={savedAt}
          pendingCount={pendingCount}
          unsavedCount={unsavedCount}
        />
      ) : (
        <MonthlyReport
          card={card}
          refreshing={loading}
          summary={summary}
          selectedMonth={selectedMonth}
          setSelectedMonth={changeMonth}
          exportSummary={exportSummary}
        />
      )}
    </div>
  );
}

// ── Daily roll-call ──────────────────────────────────────────────────────────

function DailyRollCall({
  card, refreshing, rows, allRows, edits, touched, counts, canEdit, query, setQuery,
  selectedDate, setSelectedDate, shiftDate, cycleStatus, setStatus,
  markAllPresent, resetToSuggested, pendingDays = [], saving, savedAt, pendingCount, unsavedCount,
}) {
  const unresolved = allRows.filter(r => !edits[r.profileId]);
  const derivedCount = allRows.filter(r => r.suggestedBy === 'trip_data').length;

  // While the newly picked day is in flight the tiles below still belong to the
  // previous one. Fade them and stop taps landing on them, so nobody marks
  // someone against a date that is already gone.
  const stale = refreshing
    ? { opacity: 0.4, pointerEvents: 'none', transition: 'opacity 0.15s' }
    : { transition: 'opacity 0.15s' };

  return (
    <>
      {/*
        Earlier days nobody finished. The dashboard only ever offers today, so
        this is where a missed day is caught — and it needs to be here anyway,
        because fixing one wants the trip evidence and the month view beside it.
      */}
      {pendingDays.length > 0 && (
        <div style={{ ...card, padding: '12px 14px', marginBottom: '14px', borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '9px' }}>
            <AlertTriangle size={14} color="#f59e0b" />
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {pendingDays.length} earlier day{pendingDays.length === 1 ? '' : 's'} not marked
            </span>
          </div>
          <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
            {pendingDays.map(d => (
              <button key={d.date} onClick={() => setSelectedDate(d.date)}
                title={`${d.pending} of ${d.total} still to mark`}
                style={{
                  padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${d.date === selectedDate ? '#f59e0b' : 'var(--border)'}`,
                  background: d.date === selectedDate ? 'rgba(245,158,11,0.15)' : 'var(--bg-input)',
                  color: 'var(--text)', fontSize: '12px', fontWeight: 700,
                }}>
                {fmtDayChip(d.date)}
                <span style={{ color: '#f59e0b', marginLeft: '6px', fontWeight: 800 }}>{d.pending}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Date navigation — stays live through the reload */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', ...card, padding: '4px' }}>
          <button onClick={() => shiftDate(-1)} aria-label="Previous day" style={navBtn}><ChevronLeft size={16} /></button>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="fi" style={{ width: '150px', textAlign: 'center', fontWeight: 700 }} />
          <button onClick={() => shiftDate(1)} aria-label="Next day" style={navBtn}><ChevronRight size={16} /></button>
        </div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {fmtDateLabel(selectedDate)}
          {refreshing && <Loader2 size={13} className="spin" style={{ color: '#6366f1' }} />}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a name or truck…" className="fi" style={{ paddingLeft: '30px', width: '200px' }} />
        </div>
      </div>

      <div style={stale}>
      {/* Tally */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {STATUSES.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'baseline', gap: '6px', background: s.bg, border: `1px solid ${s.color}30`, borderRadius: '8px', padding: '6px 12px' }}>
            <span style={{ fontSize: '18px', fontWeight: 900, color: s.color }}>{counts[s.id]}</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: s.color }}>{s.label}</span>
            <span style={{ fontSize: '10px', color: s.color, opacity: 0.75 }}>{s.hi}</span>
          </div>
        ))}
        {derivedCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '8px', padding: '6px 12px' }}>
            <Sparkles size={13} color="#6366f1" />
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#6366f1' }}>{derivedCount} from trip records</span>
          </div>
        )}
      </div>

      {/* Drivers with no evidence either way */}
      {unresolved.length > 0 && (
        <div style={{ ...card, borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.07)', padding: '12px 16px', marginBottom: '14px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div style={{ fontSize: '12.5px', color: 'var(--text)', lineHeight: 1.5 }}>
            <b style={{ color: '#f59e0b' }}>{unresolved.length} not yet marked.</b>{' '}
            No trip or fuel record for {unresolved.length === 1 ? 'this driver' : 'these drivers'} on this date, so nothing is assumed —
            tap each tile to decide. Unmarked people are left out of the save entirely.
            <div style={{ marginTop: '6px', fontWeight: 700, color: 'var(--text-muted)' }}>
              {unresolved.map(r => r.name).join(' · ')}
            </div>
          </div>
        </div>
      )}

      {/* Bulk actions */}
      {canEdit && allRows.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <button onClick={markAllPresent} style={ghostBtn}><CheckCircle2 size={13} /> Mark all present</button>
          <button onClick={resetToSuggested} style={ghostBtn}><RotateCcw size={13} /> Reset to suggested</button>
        </div>
      )}

      {/* The grid */}
      {allRows.length === 0 ? (
        <EmptyState
          title="No staff or drivers found"
          hint="Add people under Admin Settings → Driver & Staff Profiles. Everyone appears here except fuel pumps, tyre and manual vendors, and labour, which is tracked separately."
        />
      ) : rows.length === 0 ? (
        <EmptyState title="Nobody matches that search" hint="Clear the search box to see the full roll-call." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px' }}>
          {rows.map((r, i) => (
            <PersonTile
              key={r.profileId}
              row={r}
              status={edits[r.profileId]}
              isTouched={touched.has(r.profileId)}
              canEdit={canEdit}
              index={i}
              onCycle={() => cycleStatus(r.profileId)}
              onPick={(s) => setStatus(r.profileId, s)}
            />
          ))}
        </div>
      )}
      </div>

      {/*
        Status, not a save button. Every mark is written the moment it is made,
        so the only thing left to say is whether it has landed — and to say it
        plainly, because a supervisor used to pressing Save needs to see that it
        happened without them.
      */}
      {canEdit && allRows.length > 0 && (
        <div style={{
          position: 'sticky', bottom: '16px', marginTop: '20px', display: 'flex',
          alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          ...card, padding: '12px 16px', boxShadow: '0 8px 24px -8px rgba(0,0,0,0.25)',
          backdropFilter: 'blur(8px)',
        }}>
          {saving
            ? <Loader2 size={15} className="spin" style={{ color: '#6366f1' }} />
            : unsavedCount > 0
              ? <Save size={15} style={{ color: 'var(--text-muted)' }} />
              : <CheckCircle2 size={15} style={{ color: '#10b981' }} />}
          <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', fontWeight: 600 }}>
            {refreshing
              ? `Loading ${fmtDateLabel(selectedDate)}…`
              : saving
                ? 'Saving…'
                : unsavedCount > 0
                  ? <><b style={{ color: 'var(--text)' }}>{unsavedCount}</b> mark{unsavedCount === 1 ? '' : 's'} saving in a moment…</>
                  : savedAt
                    ? <span style={{ color: '#10b981', fontWeight: 800 }}>
                        Saved automatically · {counts.present + counts.half_day + counts.leave + counts.absent} people recorded for {fmtDateLabel(selectedDate)}
                      </span>
                    : counts.unresolved > 0
                      ? <><b style={{ color: 'var(--text)' }}>{counts.unresolved}</b> still to mark — each one saves as you tap it</>
                      : 'Everyone marked. Saved automatically.'}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * One person. The whole tile is the button — a big target for someone marking
 * twenty people quickly on a phone at the gate.
 */
function PersonTile({ row, status, isTouched, canEdit, index, onCycle, onPick }) {
  const s = STATUS_BY_ID[status];
  const unresolved = !status;
  const isDriver = row.type === 'Driver';
  const showDerivedBadge = isDriver && row.suggestedBy === 'trip_data' && !isTouched;
  /**
   * A default-suggested tile is a proposal, not a record. It used to render
   * exactly like a confirmed Present, so non-drivers looked "already marked" on
   * every date the supervisor opened. Only unsaved, untouched rows say so —
   * once it is saved (`row.status`) or tapped, it is a real mark.
   */
  const showSuggestedBadge = row.suggestedBy === 'default' && !row.status && !isTouched;

  const borderColor = unresolved ? '#f59e0b' : s.color;
  const bg = unresolved ? 'rgba(245,158,11,0.07)' : s.bg;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.3) }}
      style={{
        background: 'var(--bg-card)', border: `2px solid ${borderColor}`, borderRadius: '14px',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}
    >
      <button
        onClick={onCycle}
        disabled={!canEdit}
        title={canEdit ? 'Tap to change status' : 'You do not have edit access'}
        style={{
          border: 'none', background: bg, cursor: canEdit ? 'pointer' : 'default',
          padding: '14px 12px 12px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: '8px', textAlign: 'center', width: '100%',
          transition: 'background 0.2s',
        }}
      >
        {/* Face — the only thing a low-literacy operator needs to recognise */}
        {row.photo ? (
          <img src={row.photo} alt="" style={{
            width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover',
            border: `2px solid ${borderColor}`, flexShrink: 0,
          }} />
        ) : (
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%', flexShrink: 0,
            background: 'rgba(99,102,241,0.12)', color: '#6366f1',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: '24px', border: `2px solid ${borderColor}`,
          }}>
            {initials(row.name)}
          </div>
        )}

        <div style={{ width: '100%' }}>
          <div style={{ fontWeight: 800, fontSize: '13.5px', lineHeight: 1.25, wordBreak: 'break-word' }}>
            {row.name || '—'}
          </div>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {row.type}{row.vehicleNo ? ` · ${row.vehicleNo}` : ''}
          </div>
        </div>

        {/* Current status, in both languages */}
        <div style={{
          padding: '4px 12px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 900,
          background: unresolved ? 'rgba(245,158,11,0.18)' : 'var(--bg-card)',
          color: borderColor, border: `1px solid ${borderColor}40`,
        }}>
          {unresolved ? 'Not marked · तय करें' : `${s.label} · ${s.hi}`}
        </div>

        {showDerivedBadge && (
          <div title={row.evidence.map(e => `${e.type}: ${e.ref}`).join('\n')} style={{
            display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px',
            fontWeight: 700, color: '#6366f1',
          }}>
            <Sparkles size={10} />
            {row.evidence.length} trip record{row.evidence.length === 1 ? '' : 's'}
          </div>
        )}

        {showSuggestedBadge && (
          <div title="Suggested by default, not saved yet — tap to change, then Save." style={{
            display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px',
            fontWeight: 700, color: 'var(--text-muted)',
          }}>
            <Sparkles size={10} />
            Suggested · सुझाव
          </div>
        )}
      </button>

      {/* Precise picker, so half-day and leave don't need repeated tapping */}
      {canEdit && (
        <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
          {STATUSES.map(opt => (
            <button
              key={opt.id}
              onClick={() => onPick(opt.id)}
              title={`${opt.label} · ${opt.hi}`}
              aria-label={opt.label}
              style={{
                flex: 1, border: 'none', cursor: 'pointer', padding: '7px 0',
                background: status === opt.id ? opt.color : 'transparent',
                color: status === opt.id ? '#fff' : 'var(--text-muted)',
                fontWeight: 900, fontSize: '10px', transition: 'all 0.15s',
                borderRight: '1px solid var(--border)',
              }}
            >
              {opt.label === 'Half Day' ? '½' : opt.label[0]}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── Monthly report ───────────────────────────────────────────────────────────

function MonthlyReport({ card, refreshing, summary, selectedMonth, setSelectedMonth, exportSummary }) {
  const rows = summary?.rows || [];
  const totals = useMemo(() => rows.reduce((acc, r) => ({
    payableDays: acc.payableDays + r.payableDays,
    estimatedPay: acc.estimatedPay + r.estimatedPay,
    unmarked: acc.unmarked + r.unmarked,
  }), { payableDays: 0, estimatedPay: 0, unmarked: 0 }), [rows]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="fi" style={{ width: '180px', fontWeight: 700 }} />
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
          {fmtMonthLabel(selectedMonth)}
          {refreshing && <Loader2 size={13} className="spin" style={{ color: '#6366f1' }} />}
        </span>
        <div style={{ flex: 1 }} />
        {/* Exporting mid-reload would write the previous month's numbers under this month's name. */}
        <button onClick={exportSummary} disabled={!rows.length || refreshing} style={{ ...ghostBtn, opacity: rows.length && !refreshing ? 1 : 0.5 }}>
          <Download size={13} /> Export to Excel
        </button>
      </div>

      <div style={{ opacity: refreshing ? 0.4 : 1, pointerEvents: refreshing ? 'none' : 'auto', transition: 'opacity 0.15s' }}>
      {rows.length === 0 ? (
        <EmptyState title="Nothing recorded this month" hint="Mark a day in the Daily Roll-Call tab and it will appear here." />
      ) : (
        <>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <Kpi label="Payable days" value={totals.payableDays} card={card} />
            <Kpi label="Estimated payroll" value={`₹${totals.estimatedPay.toLocaleString('en-IN')}`} card={card} />
            <Kpi label="Days still unmarked" value={totals.unmarked} card={card} tone={totals.unmarked ? '#f59e0b' : undefined} />
          </div>

          <div style={{ ...card, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '860px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={th('left')}>Person</th>
                  {STATUSES.map(s => <th key={s.id} style={{ ...th('center'), color: s.color }}>{s.label}</th>)}
                  <th style={th('center')}>Paid leave</th>
                  <th style={th('center')}>Unpaid</th>
                  <th style={th('center')}>Unmarked</th>
                  <th style={th('center')}>Payable days</th>
                  <th style={th('right')}>Est. pay</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.profileId} style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? 'rgba(127,127,127,0.04)' : 'transparent' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 800 }}>{r.name || '—'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.type}</div>
                    </td>
                    {STATUSES.map(s => (
                      <td key={s.id} style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', minWidth: '28px', padding: '2px 8px', borderRadius: '6px',
                          background: r[s.id] > 0 ? s.bg : 'transparent',
                          color: r[s.id] > 0 ? s.color : 'var(--text-muted)',
                          fontWeight: r[s.id] > 0 ? 800 : 500,
                        }}>{r[s.id] || 0}</span>
                      </td>
                    ))}
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>
                      {r.paidLeave}
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}> / {r.paidLeaveEntitlement}</span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: r.unpaidLeave ? '#f43f5e' : 'var(--text-muted)' }}>{r.unpaidLeave}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: r.unmarked ? '#f59e0b' : 'var(--text-muted)' }}>{r.unmarked}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 900 }}>{r.payableDays}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800 }}>
                      {r.fixedSalary ? `₹${r.estimatedPay.toLocaleString('en-IN')}` : <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px' }}>no salary set</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '10px', lineHeight: 1.6 }}>
            Payable days count a half day as 0.5 and paid leave as a full day, capped at each person's
            annual entitlement — leave beyond the cap is unpaid. Estimated pay pro-rates the fixed salary
            across the calendar days in the month. Treat it as a starting figure for payroll, not a final one.
          </div>
        </>
      )}
      </div>
    </>
  );
}

// ── Small shared bits ────────────────────────────────────────────────────────

const th = (align) => ({
  padding: '10px 14px', textAlign: align, fontWeight: 800,
  color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', whiteSpace: 'nowrap',
});

const navBtn = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '6px',
  borderRadius: '6px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)',
};

const ghostBtn = {
  display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
  borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)',
  color: 'var(--text-muted)', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
};

function Kpi({ label, value, card, tone }) {
  return (
    <div style={{ ...card, padding: '10px 16px' }}>
      <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 900, marginTop: '2px', color: tone || 'var(--text)' }}>{value}</div>
    </div>
  );
}

function EmptyState({ title, hint }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
      <Users size={48} style={{ opacity: 0.15, marginBottom: '12px' }} />
      <div style={{ fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: '12px', marginTop: '6px', maxWidth: '420px', margin: '6px auto 0', lineHeight: 1.5 }}>{hint}</div>
    </div>
  );
}
