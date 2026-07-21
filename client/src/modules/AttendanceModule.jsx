import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import ax from '../api';
import { Users, CheckCircle2, XCircle, Clock, Calendar, ChevronLeft, ChevronRight, Loader2, Save, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';

const STATUSES = [
  { id: 'present',  label: 'Present',   color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  { id: 'absent',   label: 'Absent',    color: '#f43f5e', bg: 'rgba(244,63,94,0.12)' },
  { id: 'half_day', label: 'Half Day',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  { id: 'leave',    label: 'On Leave',  color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
];

const fmtMonthLabel = m => new Date(m + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const today = () => new Date().toISOString().slice(0, 10);
const monthOf = d => d.slice(0, 7);

export default function AttendanceModule() {
  const { user } = useAuth();
  const [profiles, setProfiles]     = useState([]);
  const [attendance, setAttendance] = useState([]); // { id, profileId, date, status }
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [selectedDate, setSelectedDate] = useState(today());
  const [view, setView]             = useState('daily'); // 'daily' | 'monthly'
  const [selectedMonth, setSelectedMonth] = useState(monthOf(today()));
  // local edits: { profileId -> status }
  const [edits, setEdits]           = useState({});

  const canEdit = user?.role === 'admin' || user?.permissions?.attendance === 'edit';

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [pRes, aRes] = await Promise.all([
          ax.get('/profiles').catch(() => ({ data: [] })),
          ax.get('/attendance').catch(() => ({ data: [] })),
        ]);
        const profList = Array.isArray(pRes.data) ? pRes.data : [];
        const attList = Array.isArray(aRes.data) ? aRes.data : [];
        setProfiles(profList.filter(p => p.type === 'Driver' || p.type === 'Staff' || p.type === 'Cleaner' || p.type === 'Munshi'));
        setAttendance(attList);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Pre-seed edits when date changes
  useEffect(() => {
    const map = {};
    (Array.isArray(attendance) ? attendance : [])
      .filter(a => a.date === selectedDate)
      .forEach(a => { map[a.profileId] = a.status; });
    setEdits(map);
    setSaved(false);
  }, [selectedDate, attendance]);

  // ── Stats for monthly view ─────────────────────────────────────────────────
  const monthlyStats = useMemo(() => {
    const safeAtt = Array.isArray(attendance) ? attendance : [];
    const monthRecs = safeAtt.filter(a => monthOf(a.date) === selectedMonth);
    const safeProf = Array.isArray(profiles) ? profiles : [];
    return safeProf.map(p => {
      const recs = monthRecs.filter(a => a.profileId === p.id);
      const counts = { present: 0, absent: 0, half_day: 0, leave: 0 };
      recs.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
      return { ...p, ...counts, total: recs.length };
    });
  }, [profiles, attendance, selectedMonth]);

  // ── Save (bulk) ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const records = profiles.map(p => ({
        profileId: p.id,
        profileName: p.name,
        profileType: p.type,
        status: edits[p.id] || 'absent',
      }));
      const res = await ax.post('/attendance/bulk', { date: selectedDate, records });
      // Merge saved into local state
      setAttendance(prev => {
        const safePrev = Array.isArray(prev) ? prev : [];
        const filtered = safePrev.filter(a => a.date !== selectedDate);
        return [...filtered, ...(res.data.records || [])];
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      alert('Save failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  // ── Date nav ───────────────────────────────────────────────────────────────
  const shiftDate = delta => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  // ── KPIs for selected date ─────────────────────────────────────────────────
  const dailyKpi = useMemo(() => {
    const safeAtt = Array.isArray(attendance) ? attendance : [];
    const recs = safeAtt.filter(a => a.date === selectedDate);
    const counts = { present: 0, absent: 0, half_day: 0, leave: 0 };
    recs.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
    return counts;
  }, [attendance, selectedDate]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '12px', color: 'var(--text-muted)' }}>
      <Loader2 size={20} className="spin" /> Loading attendance data...
    </div>
  );

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={22} color="#6366f1" /> Driver &amp; Staff Attendance
          </h2>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {profiles.length} staff members tracked
          </div>
        </div>
        {/* View toggle */}
        <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          {[{ id: 'daily', label: 'Daily Mark', Icon: Calendar }, { id: 'monthly', label: 'Monthly Report', Icon: BarChart3 }].map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setView(id)} style={{
              padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
              background: view === id ? '#6366f1' : 'transparent',
              color: view === id ? '#fff' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s',
            }}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Daily View ── */}
      {view === 'daily' && (
        <>
          {/* Date nav + KPIs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '4px' }}>
              <button onClick={() => shiftDate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}><ChevronLeft size={16} /></button>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="fi" style={{ width: '140px', textAlign: 'center', fontWeight: 700 }} />
              <button onClick={() => shiftDate(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}><ChevronRight size={16} /></button>
            </div>
            {/* Mini KPIs */}
            {STATUSES.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: s.bg, border: `1px solid ${s.color}30`, borderRadius: '8px', padding: '6px 12px' }}>
                <span style={{ fontSize: '18px', fontWeight: 900, color: s.color }}>{dailyKpi[s.id] || 0}</span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: s.color }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Staff list */}
          {profiles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <Users size={48} style={{ opacity: 0.15, marginBottom: '12px' }} />
              <div style={{ fontWeight: 700 }}>No staff profiles found</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>Add staff in the Staff Profiles module first.</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                {profiles.map((p, i) => {
                  const currentStatus = edits[p.id] || '';
                  return (
                    <motion.div key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                      {/* Avatar */}
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '15px', color: '#6366f1', flexShrink: 0 }}>
                        {(p.name || '?')[0].toUpperCase()}
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: '120px' }}>
                        <div style={{ fontWeight: 800, fontSize: '14px' }}>{p.name || '—'}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{p.type} {p.truckNo ? `· ${p.truckNo}` : ''}</div>
                      </div>
                      {/* Status buttons */}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {STATUSES.map(s => (
                          <button key={s.id} disabled={!canEdit}
                            onClick={() => setEdits(e => ({ ...e, [p.id]: s.id }))}
                            style={{
                              padding: '5px 12px', borderRadius: '6px', border: `1px solid ${currentStatus === s.id ? s.color : 'var(--border)'}`,
                              background: currentStatus === s.id ? s.bg : 'transparent',
                              color: currentStatus === s.id ? s.color : 'var(--text-muted)',
                              fontWeight: currentStatus === s.id ? 800 : 600, fontSize: '11px', cursor: canEdit ? 'pointer' : 'default',
                              transition: 'all 0.15s',
                            }}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {canEdit && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={handleSave} disabled={saving}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', borderRadius: '10px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', background: saved ? '#10b981' : '#6366f1', color: '#fff', fontWeight: 800, fontSize: '13px', transition: 'background 0.3s' }}>
                    {saving ? <Loader2 size={15} className="spin" /> : saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
                    {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Attendance'}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Monthly View ── */}
      {view === 'monthly' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="fi" style={{ width: '180px', fontWeight: 700 }} />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>{fmtMonthLabel(selectedMonth)}</span>
          </div>

          {profiles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <Users size={48} style={{ opacity: 0.15, marginBottom: '12px' }} />
              <div style={{ fontWeight: 700 }}>No staff profiles found</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Staff</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Type</th>
                    {STATUSES.map(s => (
                      <th key={s.id} style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: s.color, fontSize: '11px', textTransform: 'uppercase' }}>{s.label}</th>
                    ))}
                    <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Days Tracked</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyStats.map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-card)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700 }}>{p.name || '—'}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '12px' }}>{p.type}</td>
                      {STATUSES.map(s => (
                        <td key={s.id} style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', minWidth: '28px', padding: '2px 8px', borderRadius: '6px', background: p[s.id] > 0 ? s.bg : 'transparent', color: p[s.id] > 0 ? s.color : 'var(--text-muted)', fontWeight: p[s.id] > 0 ? 800 : 500, fontSize: '13px' }}>
                            {p[s.id] || 0}
                          </span>
                        </td>
                      ))}
                      <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>{p.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
