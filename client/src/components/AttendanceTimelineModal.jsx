import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Clock, Fingerprint,
  LogIn, LogOut, ScanFace, Smartphone, UserX, X,
} from 'lucide-react';
import ax from '../api';

const STATUS_META = {
  present: { label: 'Present', color: '#10b981', bg: 'rgba(16,185,129,.12)' },
  half_day: { label: 'Half day', color: '#f59e0b', bg: 'rgba(245,158,11,.12)' },
  absent: { label: 'Absent', color: '#ef4444', bg: 'rgba(239,68,68,.12)' },
  leave: { label: 'Leave', color: '#8b5cf6', bg: 'rgba(139,92,246,.12)' },
  unmarked: { label: 'No record', color: '#94a3b8', bg: 'rgba(148,163,184,.12)' },
};

const isoDate = (date) => date.toISOString().slice(0, 10);
const businessToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const daysBefore = (endDate, count) => {
  const date = new Date(`${endDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - count);
  return isoDate(date);
};
const datesBetween = (from, to) => {
  const dates = [];
  const current = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (current <= end) {
    dates.push(isoDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
};
const displayDate = (date) => new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
  weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
});
const displayTime = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && /\d{1,2}:\d{2}/.test(value) && !value.includes('T')) return value;
  const parsed = new Date(value?.seconds ? value.seconds * 1000 : value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
};

function buildTimeline(records, from, to) {
  const byDate = new Map(datesBetween(from, to).map(date => [date, { date, status: 'unmarked', summary: null, punches: [] }]));

  records.forEach((record) => {
    if (!record.date || !byDate.has(record.date)) return;
    const day = byDate.get(record.date);
    if (record.isPunchLog) {
      day.punches.push(record);
      return;
    }
    // Prefer the canonical daily summary over backwards-compatible copies.
    if (!day.summary || record.isDailySummary) day.summary = record;
  });

  byDate.forEach((day) => {
    const latestPunch = [...day.punches].sort((a, b) => String(b.createdAt || b.markedAt || '').localeCompare(String(a.createdAt || a.markedAt || '')))[0];
    day.status = day.summary?.status || latestPunch?.status || 'unmarked';
    day.punches.sort((a, b) => String(a.createdAt || a.markedAt || a.punchTime || '').localeCompare(String(b.createdAt || b.markedAt || b.punchTime || '')));
  });

  const days = [...byDate.values()];
  const periods = [];
  days.forEach((day) => {
    const last = periods[periods.length - 1];
    if (last?.status === day.status) {
      last.to = day.date;
      last.days += 1;
    } else {
      periods.push({ status: day.status, from: day.date, to: day.date, days: 1 });
    }
  });
  return { days, periods };
}

export default function AttendanceTimelineModal({ profile, onClose }) {
  const [rangeDays, setRangeDays] = useState(90);
  const [offsetDays, setOffsetDays] = useState(0);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const to = daysBefore(businessToday(), offsetDays);
  const from = daysBefore(to, rangeDays - 1);

  useEffect(() => {
    const onKey = event => event.key === 'Escape' && onClose();
    const onRealtime = event => {
      const changedId = event.detail?.profileId;
      if (!changedId || changedId === (profile.id || profile.profileId)) setRefreshTick(tick => tick + 1);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('attendance-realtime', onRealtime);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('attendance-realtime', onRealtime);
    };
  }, [onClose, profile.id, profile.profileId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    ax.get('/attendance', {
      params: { from, to, profileId: profile.id || profile.profileId },
      _skipCache: true,
    }).then(({ data }) => {
      if (active) setRecords(Array.isArray(data) ? data : []);
    }).catch((err) => {
      if (active) setError(err.response?.data?.error || 'Could not load attendance timeline.');
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [profile.id, profile.profileId, rangeDays, offsetDays, refreshTick]);

  const timeline = useMemo(() => buildTimeline(records, from, to), [records, from, to]);
  const descendingDays = useMemo(() => [...timeline.days].reverse(), [timeline.days]);
  const totals = useMemo(() => timeline.days.reduce((acc, day) => {
    acc[day.status] = (acc[day.status] || 0) + 1;
    return acc;
  }, {}), [timeline.days]);
  const photo = profile.photo || profile.facePhoto || profile.photoUrl || profile.photos?.[0];
  const role = profile.profileType || profile.type || 'Staff';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${profile.name || profile.profileName} attendance timeline`}
      onMouseDown={event => event.target === event.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 10020, background: 'rgba(15,23,42,.72)', padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div className="adm-panel" style={{ width: 'min(980px, 100%)', maxHeight: '94vh', borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 28px 80px rgba(0,0,0,.35)' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 14, alignItems: 'center' }}>
          {photo ? <img src={photo} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(99,102,241,.35)' }} /> : (
            <div style={{ width: 52, height: 52, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(99,102,241,.12)', color: '#6366f1', fontWeight: 900, fontSize: 20 }}>
              {(profile.name || profile.profileName || 'U')[0].toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 19, color: 'var(--text)' }}>{profile.name || profile.profileName || 'Employee'} — Attendance Timeline</h2>
            <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text-muted)' }}>
              {role}{profile.vehicleNo ? ` · ${profile.vehicleNo}` : ''}{profile.phone ? ` · ${profile.phone}` : ''} · {displayDate(from)} to {displayDate(to)}
            </div>
          </div>
          <button type="button" className="adm-btn adm-btn--sm" onClick={() => setOffsetDays(days => days + rangeDays)} title="Show older dates"><ChevronLeft size={15} /> Older</button>
          <button type="button" className="adm-btn adm-btn--sm" disabled={offsetDays === 0} onClick={() => setOffsetDays(days => Math.max(0, days - rangeDays))} title="Show newer dates">Newer <ChevronRight size={15} /></button>
          <select className="adm-select" value={rangeDays} onChange={event => { setRangeDays(Number(event.target.value)); setOffsetDays(0); }} style={{ width: 125 }}>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button type="button" className="adm-btn adm-btn--sm" onClick={onClose} aria-label="Close timeline"><X size={17} /></button>
        </div>

        <div style={{ overflowY: 'auto', padding: 20 }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}><Clock className="adm-spin" style={{ margin: '0 auto 10px' }} />Loading complete timeline…</div>
          ) : error ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}><AlertCircle style={{ margin: '0 auto 8px' }} />{error}</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(105px, 1fr))', gap: 10 }}>
                {['present', 'half_day', 'absent', 'leave', 'unmarked'].map(status => (
                  <div key={status} style={{ padding: '12px 14px', border: '1px solid var(--border)', borderTop: `3px solid ${STATUS_META[status].color}`, borderRadius: 11, background: 'var(--bg-card)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{STATUS_META[status].label}</div>
                    <div style={{ color: STATUS_META[status].color, fontSize: 23, fontWeight: 900 }}>{totals[status] || 0}</div>
                  </div>
                ))}
              </div>

              <section style={{ marginTop: 18, padding: 16, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-card)' }}>
                <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--text)', marginBottom: 11 }}>Daily status line</div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${timeline.days.length}, minmax(3px, 1fr))`, gap: 2, height: 28 }}>
                  {timeline.days.map(day => <span key={day.date} title={`${displayDate(day.date)} — ${STATUS_META[day.status]?.label}`} style={{ display: 'block', borderRadius: 3, background: STATUS_META[day.status]?.color }} />)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
                  {Object.entries(STATUS_META).map(([key, meta]) => <span key={key} style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', gap: 5, alignItems: 'center' }}><i style={{ width: 8, height: 8, borderRadius: 2, background: meta.color }} />{meta.label}</span>)}
                </div>
              </section>

              <section style={{ marginTop: 18 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--text)', marginBottom: 10 }}>Present and absent periods</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {[...timeline.periods].reverse().map((period, index) => {
                    const meta = STATUS_META[period.status];
                    return <div key={`${period.from}-${index}`} style={{ padding: '8px 11px', borderRadius: 9, color: meta.color, background: meta.bg, border: `1px solid ${meta.color}35`, fontSize: 11.5, fontWeight: 700 }}>
                      {meta.label}: {displayDate(period.from)}{period.from !== period.to ? ` → ${displayDate(period.to)}` : ''} ({period.days}d)
                    </div>;
                  })}
                </div>
              </section>

              <section style={{ marginTop: 20 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--text)', marginBottom: 12 }}>Date-by-date details</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {descendingDays.map((day, index) => {
                    const meta = STATUS_META[day.status] || STATUS_META.unmarked;
                    const summary = day.summary || {};
                    const inTime = displayTime(summary.inTime);
                    const outTime = displayTime(summary.outTime);
                    return (
                      <div key={day.date} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr)', gap: 11 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span style={{ width: 12, height: 12, borderRadius: '50%', background: meta.color, boxShadow: `0 0 0 4px ${meta.bg}`, marginTop: 13, zIndex: 1 }} />
                          {index < descendingDays.length - 1 && <span style={{ width: 2, flex: 1, minHeight: 38, background: meta.color, opacity: .35 }} />}
                        </div>
                        <div style={{ marginBottom: 10, padding: '11px 13px', border: '1px solid var(--border)', borderLeft: `3px solid ${meta.color}`, borderRadius: 10, background: 'var(--bg-card)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><CalendarDays size={13} />{displayDate(day.date)}</span>
                            <span style={{ color: meta.color, background: meta.bg, borderRadius: 12, padding: '2px 8px', fontSize: 10.5, fontWeight: 900, textTransform: 'uppercase' }}>{meta.label}</span>
                          </div>
                          {(inTime || outTime || summary.durationHours != null) && <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 11.5, color: 'var(--text-sub)' }}>
                            {inTime && <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><LogIn size={13} color="#10b981" />In {inTime}</span>}
                            {outTime && <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><LogOut size={13} color="#ef4444" />Out {outTime}</span>}
                            {summary.durationHours != null && <span><Clock size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{Number(summary.durationHours).toFixed(2)} hrs</span>}
                          </div>}
                          {day.punches.length > 0 && <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {day.punches.map((punch, punchIndex) => {
                              const action = punch.terminalEvent || punch.eventType || punch.action || 'PUNCH';
                              return <span key={punch.id || punchIndex} title={punch.note || punch.overrideReason || ''} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, padding: '4px 7px', borderRadius: 7, background: 'var(--bg-th)', color: 'var(--text-sub)', border: '1px solid var(--border)' }}>
                                {punch.method === 'fingerprint' ? <Fingerprint size={11} /> : punch.method === 'face' ? <ScanFace size={11} /> : <Smartphone size={11} />}
                                {String(action).replaceAll('_', ' ')} · {displayTime(punch.punchTime || punch.terminalTime || punch.createdAt) || 'Logged'}
                              </span>;
                            })}
                          </div>}
                          {day.status === 'unmarked' && <div style={{ marginTop: 7, fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 5, alignItems: 'center' }}><UserX size={12} />No roll-call or terminal punch saved for this date.</div>}
                          {(summary.note || summary.overrideReason) && <div style={{ marginTop: 7, fontSize: 11, color: 'var(--text-muted)' }}>{summary.note || summary.overrideReason}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
