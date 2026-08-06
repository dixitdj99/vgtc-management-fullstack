import React, { useState, useMemo } from 'react';
import ax from '../api';
import { useAuth } from '../auth/AuthContext';
import {
    Receipt, FileText, BookOpen, Wallet, AlertTriangle, TrendingUp,
    Truck, ArrowRight, Plus, RefreshCw, Activity, Gauge, IndianRupee, LayoutGrid,
    ClipboardList, CheckCircle2
} from 'lucide-react';
import useDashboardData from '../hooks/useDashboardData';

const fmtRs = n => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

/** "Mon, 04 Aug" — enough to recognise a day without reading a date string. */
const dayLabel = (iso) => {
    const d = new Date(`${iso}T00:00:00`);
    return isNaN(d) ? iso : d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
};

/** Same four statuses, same colours, as the Attendance module. */
const STATUSES = [
    { id: 'present', label: 'Present', color: '#10b981' },
    { id: 'absent', label: 'Absent', color: '#f43f5e' },
    { id: 'half_day', label: 'Half Day', color: '#f59e0b' },
    { id: 'leave', label: 'Leave', color: '#6366f1' },
];

const navTo = (active, subActive) =>
    window.dispatchEvent(new CustomEvent('nav-module', { detail: { active, subActive } }));

function KpiCard({ icon: Icon, label, value, sub, color, loading, error, onRetry, onClick }) {
    return (
        <div className="stat-card" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ background: `${color}18`, color, padding: '7px', borderRadius: '10px', display: 'flex' }}>
                        <Icon size={15} />
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                </div>
                {onClick && <ArrowRight size={13} color="var(--text-muted)" />}
            </div>
            {loading ? (
                <span className="skeleton" style={{ height: '26px', width: '60%' }} />
            ) : error ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text-muted)' }}>—</span>
                    <button className="btn btn-g btn-sm" onClick={e => { e.stopPropagation(); onRetry(); }} title="Retry">
                        <RefreshCw size={11} />
                    </button>
                </div>
            ) : (
                <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text)' }}>{value}</div>
            )}
            {sub && !loading && !error && <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginTop: '3px' }}>{sub}</div>}
        </div>
    );
}

/**
 * The modules this user may open, as cards.
 *
 * Recent Activity and Fleet Alerts told an operator what had happened; they did
 * not help them get anywhere. This is the same list the sidebar holds, laid out
 * so the next task is one click away — and it is built from the user's own
 * permissions, so two people see two different dashboards.
 */
function ModuleGrid({ navItems, onOpen }) {
    if (!navItems.length) {
        return (
            <div style={{ padding: '28px 20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                No modules have been granted to this account yet — ask an admin for access.
            </div>
        );
    }
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '10px', padding: '14px' }}>
            {navItems.map(n => {
                const Icon = n.Icon;
                const color = n.color || '#6366f1';
                return (
                    <button key={n.id} onClick={() => onOpen(n)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left',
                            padding: '12px 14px', borderRadius: '12px', cursor: 'pointer',
                            border: '1px solid var(--border)', background: 'var(--bg-card)',
                            fontFamily: 'inherit', transition: 'transform 0.12s, border-color 0.12s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = color; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                        <span style={{ background: `${color}18`, color, padding: '9px', borderRadius: '10px', display: 'flex', flexShrink: 0 }}>
                            {Icon ? <Icon size={17} /> : <LayoutGrid size={17} />}
                        </span>
                        <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: 'var(--text)' }}>{n.label}</span>
                            {n.sub?.length > 0 && (
                                <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                    {n.sub.length} sections
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/**
 * Today's roll-call, marked here rather than anywhere else.
 *
 * It only ever shows today. A day that was missed is a different job — it needs
 * the trip evidence and the month view — and that lives in the Attendance
 * module. The point of this card is that today gets done before it becomes one
 * of those.
 *
 * One tap, one write. No Save button: these are four explicit buttons rather
 * than a control that cycles, so a tap is a decision and can go straight to the
 * server. Nobody is written without a status being chosen — defaulting an
 * unresolved person to absent would be a wage decision taken by a dashboard.
 */
function TodayRollCall({ source, onSaved, canEdit }) {
    const [busy, setBusy] = useState(null);       // profileId currently being written
    const [done, setDone] = useState({});         // profileId -> status, saved this session
    const [error, setError] = useState(null);

    const roster = source.data;
    // Anyone already saved on the server, plus anyone saved from here since the
    // card loaded — the refetch confirms it, this keeps the row from flickering
    // back while that request is in flight.
    const pending = useMemo(
        () => (roster?.rows || []).filter(r => !r.status && !done[r.profileId]),
        [roster, done],
    );

    if (source.loading) {
        return (
            <div className="card" style={{ marginBottom: '18px', padding: '16px 18px' }}>
                <span className="skeleton" style={{ height: '18px', width: '220px' }} />
            </div>
        );
    }
    if (source.error || !roster) return null;

    const savedHere = Object.keys(done).length;

    if (!pending.length) {
        return (
            <div className="card" style={{ marginBottom: '18px', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle2 size={16} color="#10b981" />
                <span style={{ fontSize: '13px', color: 'var(--text-sub)' }}>
                    {savedHere > 0
                        ? `Attendance saved — ${savedHere} ${savedHere === 1 ? 'person' : 'people'} marked for today.`
                        : `Today's attendance is marked. ${roster.counts?.saved ?? 0} of ${roster.counts?.total ?? 0} recorded.`}
                </span>
            </div>
        );
    }

    const mark = async (row, status) => {
        if (!canEdit || busy) return;
        setBusy(row.profileId);
        setError(null);
        try {
            await ax.post('/attendance/bulk', {
                date: roster.date,
                records: [{
                    profileId: row.profileId,
                    profileName: row.name,
                    profileType: row.type,
                    status,
                    // Marked by hand here, never derived — the dashboard shows no
                    // trip evidence, so it cannot claim the system worked it out.
                    source: 'manual',
                }],
            });
            setDone(d => ({ ...d, [row.profileId]: status }));
            onSaved();          // refetch in the background; the row has already gone
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Could not save.');
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="card" style={{ marginBottom: '18px', borderColor: 'rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.04)' }}>
            <div className="card-header border-b" style={{ borderColor: 'rgba(245,158,11,0.2)' }}>
                <div className="card-title-block">
                    <div className="card-icon" style={{ background: 'rgba(245,158,11,0.12)' }}>
                        <ClipboardList size={17} color="#f59e0b" />
                    </div>
                    <div className="card-title-text">
                        <h3>Mark today's attendance</h3>
                        <p>{dayLabel(roster.date)} · {pending.length} of {roster.counts?.total ?? pending.length} still to mark · saves as you tap</p>
                    </div>
                </div>
                {canEdit && (
                    <button className="btn btn-g btn-sm" disabled={!!busy}
                        title="Mark everyone below present"
                        onClick={async () => { for (const r of [...pending]) await mark(r, 'present'); }}>
                        <CheckCircle2 size={13} /> All present
                    </button>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {pending.map((r, i) => (
                    <div key={r.profileId} style={{
                        display: 'flex', alignItems: 'center', gap: '14px', padding: '11px 18px',
                        borderTop: i === 0 ? 'none' : '1px solid var(--border-row)', flexWrap: 'wrap',
                    }}>
                        <div style={{ flex: 1, minWidth: '150px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--text)' }}>{r.name || 'Unnamed'}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {[r.type, r.department, r.vehicleNo].filter(Boolean).join(' · ') || '—'}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', opacity: busy === r.profileId ? 0.5 : 1 }}>
                            {STATUSES.map(s => (
                                <button key={s.id} type="button" disabled={!canEdit || !!busy}
                                    onClick={() => mark(r, s.id)}
                                    style={{
                                        padding: '5px 12px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 800,
                                        cursor: canEdit && !busy ? 'pointer' : 'not-allowed',
                                        border: '1px solid var(--border)',
                                        background: 'var(--bg-input)', color: s.color,
                                        transition: 'all .12s',
                                    }}
                                    onMouseEnter={e => { if (canEdit && !busy) { e.currentTarget.style.background = `${s.color}22`; e.currentTarget.style.borderColor = s.color; } }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-input)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border-row)' }}>
                <span style={{ fontSize: '12.5px', color: error ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {error || (savedHere > 0
                        ? `${savedHere} saved. ${pending.length} left.`
                        : 'Tap a status and it is saved straight away.')}
                </span>
            </div>
        </div>
    );
}

export default function DashboardHome({ filteredNavIds = new Set(), navItems = [] }) {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const { cfg, lrs, vouchers, cashbook, maintAlerts, vehicles, attendanceToday, kpis, recentActivity, refetch } = useDashboardData();
    const { todayLrCount, outstanding, cashInHand, fleetAlerts } = kpis;
    const { fetchLrs, fetchVouchers, fetchCashbook, fetchAlerts, fetchVehicles, fetchAttendanceToday } = refetch;

    // Same rule the Attendance module uses. The server checks it too — this
    // only decides whether the buttons are live.
    const canMarkAttendance = isAdmin || user?.permissions?.attendance === 'edit';

    /* ── Quick actions (permission-aware) ── */
    const actions = [
        { id: cfg.ids.lr, label: 'New LR Entry', icon: Receipt, color: '#6366f1' },
        { id: cfg.ids.voucher, label: 'New Voucher', icon: FileText, color: '#8b5cf6' },
        { id: cfg.ids.cashbook, label: 'Cashbook', icon: BookOpen, color: '#10b981' },
    ].filter(a => filteredNavIds.has(a.id));

    const greeting = (() => {
        const h = new Date().getHours();
        return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    })();

    return (
        <div className="page-container">
            <div className="page-hd">
                <div>
                    <h1><Activity size={20} color="#6366f1" /> Dashboard</h1>
                    <p>{greeting}, {user?.name || user?.username || 'there'} — business at a glance</p>
                </div>
                <div className="page-hd-right">
                    {actions.map(a => (
                        <button key={a.id} className="btn btn-p btn-sm" onClick={() => navTo(a.id)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Plus size={13} /> {a.label}
                        </button>
                    ))}
                </div>
            </div>

            {/*
              Today's roll-call, marked here. Admin only: it names staff, and
              chasing an unfinished day is an admin's job. Days that were
              already missed are the Attendance module's business, not this
              card's — the point here is that today never becomes one of them.
            */}
            {isAdmin && (
                <TodayRollCall
                    source={attendanceToday}
                    canEdit={canMarkAttendance}
                    onSaved={fetchAttendanceToday}
                />
            )}

            {/* KPI row */}
            <div className="stat-grid">
                <KpiCard icon={Receipt} label="Today's LRs" color="#6366f1"
                    loading={lrs.loading} error={lrs.error} onRetry={fetchLrs}
                    value={todayLrCount ?? '—'} sub="Loading receipts created today"
                    onClick={filteredNavIds.has(cfg.ids.lr) ? () => navTo(cfg.ids.lr) : undefined} />
                <KpiCard icon={IndianRupee} label="Outstanding" color="#f59e0b"
                    loading={vouchers.loading || vehicles.loading} error={vouchers.error} onRetry={fetchVouchers}
                    value={outstanding != null ? fmtRs(outstanding) : '—'} sub="Unpaid freight across vouchers"
                    onClick={filteredNavIds.has(cfg.ids.balance) ? () => navTo(cfg.ids.balance) : undefined} />
                <KpiCard icon={Wallet} label="Cash in hand" color="#10b981"
                    loading={cashbook.loading || vouchers.loading} error={cashbook.error} onRetry={fetchCashbook}
                    value={cashInHand != null ? `${cashInHand < 0 ? '-' : ''}${fmtRs(cashInHand)}` : '—'} sub="Deposits − outflows − advances"
                    onClick={filteredNavIds.has(cfg.ids.cashbook) ? () => navTo(cfg.ids.cashbook) : undefined} />
                <KpiCard icon={AlertTriangle} label="Fleet alerts" color="#ef4444"
                    loading={maintAlerts.loading && vehicles.loading} error={maintAlerts.error && vehicles.error} onRetry={() => { fetchAlerts(); fetchVehicles(); }}
                    value={fleetAlerts ? fleetAlerts.length : '—'} sub="Service due + document expiry"
                    onClick={filteredNavIds.has(cfg.ids.vehicles) ? () => navTo(cfg.ids.vehicles) : undefined} />
            </div>

            {/* Modules this account can open. Replaces the activity and alert
                panels for everyone but an admin, who keeps them below. */}
            <div className="card" style={{ marginBottom: '16px' }}>
                <div className="card-header">
                    <div className="card-title-block">
                        <div className="card-icon ci-indigo"><LayoutGrid size={17} /></div>
                        <div className="card-title-text">
                            <h3>Your Modules</h3>
                            <p>{navItems.length} available to you — tap to open</p>
                        </div>
                    </div>
                </div>
                <ModuleGrid navItems={navItems} onOpen={n => navTo(n.id, n.sub?.[0]?.id || '')} />
            </div>

            {isAdmin && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                {/* Recent activity */}
                <div className="card">
                    <div className="card-header">
                        <div className="card-title-block">
                            <div className="card-icon ci-indigo"><TrendingUp size={17} /></div>
                            <div className="card-title-text"><h3>Recent Activity</h3><p>Latest LRs &amp; vouchers</p></div>
                        </div>
                    </div>
                    <div style={{ padding: '8px 0' }}>
                        {(lrs.loading || vouchers.loading) ? (
                            [1, 2, 3, 4].map(i => (
                                <div key={i} style={{ padding: '10px 20px' }}><span className="skeleton skeleton-text" /></div>
                            ))
                        ) : recentActivity.length === 0 ? (
                            <div style={{ padding: '28px 20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>No recent entries</div>
                        ) : recentActivity.map((item, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 20px', borderBottom: i < recentActivity.length - 1 ? '1px solid var(--border-row)' : 'none' }}>
                                <div style={{ background: 'var(--primary-glow)', color: 'var(--primary)', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                    <item.icon size={13} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{item.kind} · {item.date || '—'}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Alerts preview */}
                <div className="card">
                    <div className="card-header">
                        <div className="card-title-block">
                            <div className="card-icon" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}><AlertTriangle size={17} /></div>
                            <div className="card-title-text"><h3>Fleet Alerts</h3><p>Service &amp; document expiry</p></div>
                        </div>
                        {filteredNavIds.has(cfg.ids.vehicles) && (
                            <button className="btn btn-g btn-sm" onClick={() => navTo(cfg.ids.vehicles)}>View all <ArrowRight size={12} /></button>
                        )}
                    </div>
                    <div style={{ padding: '8px 0' }}>
                        {(maintAlerts.loading && vehicles.loading) ? (
                            [1, 2, 3].map(i => (
                                <div key={i} style={{ padding: '10px 20px' }}><span className="skeleton skeleton-text" /></div>
                            ))
                        ) : !fleetAlerts || fleetAlerts.length === 0 ? (
                            <div style={{ padding: '28px 20px', textAlign: 'center', fontSize: '12px', color: 'var(--accent)', fontWeight: 700 }}>✓ All vehicles OK</div>
                        ) : fleetAlerts.slice(0, 5).map((a, i, arr) => (
                            <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border-row)' : 'none' }}>
                                <div style={{ background: a.severity === 2 ? 'var(--danger-glow)' : 'rgba(245,158,11,0.12)', color: a.severity === 2 ? 'var(--danger)' : '#f59e0b', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                    <Truck size={13} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace' }}>{a.truckNo}</div>
                                    <div style={{ fontSize: '11px', color: a.severity === 2 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 600 }}>{a.text}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            )}
        </div>
    );
}
