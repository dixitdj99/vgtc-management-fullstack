import React, { useState, useMemo } from 'react';
import ax from '../api';
import { useAuth } from '../auth/AuthContext';
import {
    Receipt, FileText, BookOpen, Wallet, AlertTriangle, TrendingUp,
    Truck, ArrowRight, Plus, RefreshCw, Activity, Gauge, IndianRupee, LayoutGrid,
    ClipboardList, CheckCircle2, Package, AlertCircle
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
                    <span style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 700 }}>Failed to load</span>
                    {onRetry && (
                        <button className="btn btn-g btn-sm" onClick={e => { e.stopPropagation(); onRetry(); }} style={{ padding: '2px 6px', height: 'auto', fontSize: '10px' }}>
                            <RefreshCw size={11} />
                        </button>
                    )}
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
 */
function TodayRollCall({ source, onSaved, canEdit }) {
    const [busy, setBusy] = useState(null);
    const [done, setDone] = useState({});
    const [error, setError] = useState(null);

    const roster = source.data;
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
                    source: 'manual',
                }],
            });
            setDone(d => ({ ...d, [row.profileId]: status }));
            onSaved();
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
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
    const { cfg, isDump, lrs, vouchers, cashbook, maintAlerts, vehicles, attendanceToday, kpis, recentActivity, ownVehiclesDuty, marketVehicles, refetch } = useDashboardData();
    const { todayLrCount, outstanding, cashInHand, fleetAlerts } = kpis;
    const { fetchLrs, fetchVouchers, fetchCashbook, fetchAlerts, fetchVehicles, fetchAttendanceToday } = refetch;

    const [dutyFilter, setDutyFilter] = useState('all'); // 'all' | 'free' | 'loaded' | 'trip'
    const [marketFilter, setMarketFilter] = useState('all'); // 'all' | 'truck' | 'tractor'
    const [marketSearch, setMarketSearch] = useState('');

    const filteredMarketList = useMemo(() => {
        if (!marketVehicles?.list) return [];
        let list = marketVehicles.list;
        if (marketFilter === 'tractor') {
            list = list.filter(v => (v.vehicleType || '').toLowerCase().includes('tractor'));
        } else if (marketFilter === 'truck') {
            list = list.filter(v => !(v.vehicleType || '').toLowerCase().includes('tractor'));
        }
        if (marketSearch.trim()) {
            const q = marketSearch.toLowerCase();
            list = list.filter(v =>
                (v.truckNo || '').toLowerCase().includes(q) ||
                (v.ownerName || '').toLowerCase().includes(q) ||
                (v.driverName || '').toLowerCase().includes(q) ||
                (v.vehicleType || '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [marketVehicles, marketFilter, marketSearch]);

    // Same rule the Attendance module uses. The server checks it too — this
    // only decides whether the buttons are live.
    const canMarkAttendance = isAdmin || user?.permissions?.attendance === 'edit';
    const canSeeFleetDuty = isAdmin || user?.permissions?.vehicle === 'edit' || user?.permissions?.lr_dump === 'edit' || user?.permissions?.lr_jkl === 'edit';

    /* ── Quick actions (permission-aware) ── */
    const actions = [
        { id: cfg.ids.lr, label: 'New LR Entry', icon: Receipt, color: '#6366f1' },
        { id: cfg.ids.voucher, label: isDump ? 'New Bill' : 'New Voucher', icon: FileText, color: '#8b5cf6' },
        { id: cfg.ids.cashbook, label: 'Cashbook', icon: BookOpen, color: '#10b981' },
    ].filter(a => filteredNavIds.has(a.id));

    const greeting = (() => {
        const h = new Date().getHours();
        return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    })();

    const filteredDutyList = useMemo(() => {
        if (!ownVehiclesDuty?.list) return [];
        if (dutyFilter === 'free') return ownVehiclesDuty.list.filter(x => x.status === 'FREE');
        if (dutyFilter === 'loaded') return ownVehiclesDuty.list.filter(x => x.status === 'LOADED');
        if (dutyFilter === 'trip') return ownVehiclesDuty.list.filter(x => x.status === 'ON_TRIP');
        return ownVehiclesDuty.list;
    }, [ownVehiclesDuty, dutyFilter]);

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

            {/* Today's roll-call, marked here. Admin only (hidden on dump logins) */}
            {isAdmin && !isDump && (
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
                
                {isDump ? (
                    <>
                        <KpiCard icon={FileText} label="Today's Bills" color="#8b5cf6"
                            loading={vouchers.loading} error={vouchers.error} onRetry={fetchVouchers}
                            value={kpis.todayBillCount ?? '0'} sub="Bills generated today"
                            onClick={filteredNavIds.has(cfg.ids.voucher) ? () => navTo(cfg.ids.voucher) : undefined} />
                        <KpiCard icon={Truck} label="Market Vehicles" color="#f59e0b"
                            loading={vehicles.loading} error={vehicles.error} onRetry={fetchVehicles}
                            value={`${kpis.marketVehicles?.total || 0} Registered`}
                            sub={`${kpis.marketVehicles?.trucksCount || 0} Trucks · ${kpis.marketVehicles?.tractorsCount || 0} Tractors`}
                            onClick={() => {
                                const el = document.getElementById('market-vehicles-card');
                                if (el) el.scrollIntoView({ behavior: 'smooth' });
                            }} />
                        <KpiCard icon={Package} label="Today's Bags" color="#10b981"
                            loading={lrs.loading} error={lrs.error} onRetry={fetchLrs}
                            value={`${kpis.todayBagsCount ? kpis.todayBagsCount.toLocaleString('en-IN') : '0'} Bags`}
                            sub={`${((kpis.todayBagsCount || 0) * 0.05).toFixed(2)} MT loaded volume`}
                            onClick={filteredNavIds.has(cfg.ids.lr) ? () => navTo(cfg.ids.lr) : undefined} />
                    </>
                ) : (
                    <>
                        <KpiCard icon={IndianRupee} label="Outstanding" color="#f59e0b"
                            loading={vouchers.loading || vehicles.loading} error={vouchers.error} onRetry={fetchVouchers}
                            value={outstanding != null ? fmtRs(outstanding) : '—'} sub="Unpaid freight across vouchers"
                            onClick={filteredNavIds.has(cfg.ids.balance) ? () => navTo(cfg.ids.balance) : undefined} />
                        <KpiCard icon={Wallet} label="Cash in hand" color="#10b981"
                            loading={cashbook.loading || vouchers.loading} error={cashbook.error} onRetry={fetchCashbook}
                            value={cashInHand != null ? `${cashInHand < 0 ? '-' : ''}${fmtRs(cashInHand)}` : '—'} sub="Deposits − outflows − advances"
                            onClick={filteredNavIds.has(cfg.ids.cashbook) ? () => navTo(cfg.ids.cashbook) : undefined} />
                        <KpiCard icon={Truck} label="Own Fleet Today"
                            color={ownVehiclesDuty?.freeCount > 0 ? "#f59e0b" : "#10b981"}
                            loading={vehicles.loading || lrs.loading || vouchers.loading}
                            error={vehicles.error}
                            onRetry={() => { fetchVehicles(); fetchLrs(); fetchVouchers(); }}
                            value={ownVehiclesDuty ? `${ownVehiclesDuty.workingCount}/${ownVehiclesDuty.totalOwn} Active` : '—'}
                            sub={ownVehiclesDuty?.freeCount > 0 ? `⚠️ ${ownVehiclesDuty.freeCount} free today — Assign load` : `✅ All ${ownVehiclesDuty?.totalOwn || 0} trucks on duty`}
                            onClick={() => {
                                const el = document.getElementById('own-vehicles-duty-card');
                                if (el) el.scrollIntoView({ behavior: 'smooth' });
                            }} />
                    </>
                )}
            </div>

            {/* Modules this account can open */}
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

            {(isAdmin || canSeeFleetDuty) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                {/* Recent activity */}
                <div className="card">
                    <div className="card-header">
                        <div className="card-title-block">
                            <div className="card-icon ci-indigo"><TrendingUp size={17} /></div>
                            <div className="card-title-text"><h3>Recent Activity</h3><p>{isDump ? 'Latest LRs & bills' : 'Latest LRs & vouchers'}</p></div>
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
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{isDump && item.kind === 'Voucher' ? 'Bill' : item.kind} · {item.date || '—'}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {isDump ? (
                    /* Market Vehicles (Trucks & Tractors) Card for Kosli, Jhajjar, Bahadurgarh */
                    <div className="card" id="market-vehicles-card" style={{ display: 'flex', flexDirection: 'column' }}>
                        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                            <div className="card-title-block">
                                <div className="card-icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                                    <Truck size={17} />
                                </div>
                                <div className="card-title-text">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h3>Market Vehicles (Trucks &amp; Tractors)</h3>
                                        <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                                            {filteredMarketList.length} LISTED
                                        </span>
                                    </div>
                                    <p>{marketVehicles?.trucksCount || 0} Trucks · {marketVehicles?.tractorsCount || 0} Tractors available</p>
                                </div>
                            </div>

                            {/* Filter switcher */}
                            <div style={{ display: 'flex', gap: '4px', background: 'var(--bg)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                {[
                                    { id: 'all', label: `All (${marketVehicles?.total || 0})` },
                                    { id: 'truck', label: `Trucks (${marketVehicles?.trucksCount || 0})` },
                                    { id: 'tractor', label: `Tractors (${marketVehicles?.tractorsCount || 0})` },
                                ].map(tab => {
                                    const isAct = marketFilter === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => setMarketFilter(tab.id)}
                                            style={{
                                                border: 'none',
                                                cursor: 'pointer',
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                fontSize: '11px',
                                                fontWeight: isAct ? 800 : 600,
                                                background: isAct ? 'var(--bg-card)' : 'transparent',
                                                color: isAct ? 'var(--text)' : 'var(--text-muted)',
                                                boxShadow: isAct ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                transition: 'all 0.12s'
                                            }}
                                        >
                                            {tab.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Search filter in card */}
                        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-row)' }}>
                            <input
                                className="fi"
                                style={{ height: '32px', fontSize: '11.5px' }}
                                placeholder="Search truck no, tractor, owner, driver..."
                                value={marketSearch}
                                onChange={e => setMarketSearch(e.target.value)}
                            />
                        </div>

                        {/* Vehicles list */}
                        <div style={{ padding: '4px 0', maxHeight: '340px', overflowY: 'auto' }}>
                            {vehicles.loading ? (
                                [1, 2, 3, 4].map(i => (
                                    <div key={i} style={{ padding: '12px 20px' }}><span className="skeleton skeleton-text" /></div>
                                ))
                            ) : filteredMarketList.length === 0 ? (
                                <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                    No market vehicles found matching filter
                                </div>
                            ) : (
                                filteredMarketList.map((v, i) => {
                                    const isTractor = (v.vehicleType || '').toLowerCase().includes('tractor');
                                    return (
                                        <div key={v.id || v.truckNo} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 18px', borderBottom: i < filteredMarketList.length - 1 ? '1px solid var(--border-row)' : 'none' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ padding: '7px', borderRadius: '8px', background: isTractor ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: isTractor ? '#10b981' : '#f59e0b' }}>
                                                    {isTractor ? '🚜' : '🚛'}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
                                                        {v.truckNo}
                                                        <span style={{ marginLeft: '6px', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-input)', color: 'var(--text-muted)', fontWeight: 700 }}>
                                                            {v.vehicleType || 'Truck'}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                        {v.driverName ? `Driver: ${v.driverName}` : v.ownerName ? `Owner: ${v.ownerName}` : 'Market Vehicle'}
                                                        {v.driverContact ? ` (${v.driverContact})` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <button className="btn btn-g btn-sm" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={() => navTo('vendors_dump')}>
                                                View →
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                ) : (
                    /* Own Vehicles Duty Status Card (Replaces Fleet Alerts) for Jharli */
                    <div className="card" id="own-vehicles-duty-card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        <div className="card-title-block">
                            <div className="card-icon" style={{
                                background: (ownVehiclesDuty?.freeCount || 0) > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)',
                                color: (ownVehiclesDuty?.freeCount || 0) > 0 ? '#f59e0b' : '#10b981'
                            }}>
                                <Truck size={17} />
                            </div>
                            <div className="card-title-text">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <h3>Own Vehicles Duty (Today)</h3>
                                    {(ownVehiclesDuty?.freeCount || 0) > 0 ? (
                                        <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                                            {ownVehiclesDuty.freeCount} IDLE
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                                            ALL WORKING
                                        </span>
                                    )}
                                </div>
                                <p>Ensure no own vehicle is free · Keep all trucks on work</p>
                            </div>
                        </div>

                        {/* Filter switcher */}
                        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            {[
                                { id: 'all', label: `All (${ownVehiclesDuty?.totalOwn || 0})` },
                                { id: 'free', label: `Free (${ownVehiclesDuty?.freeCount || 0})`, alert: (ownVehiclesDuty?.freeCount || 0) > 0 },
                                { id: 'loaded', label: `Loaded (${ownVehiclesDuty?.loadedCount || 0})` },
                                { id: 'trip', label: `On Trip (${ownVehiclesDuty?.onTripCount || 0})` },
                            ].map(tab => {
                                const isAct = dutyFilter === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setDutyFilter(tab.id)}
                                        style={{
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            fontSize: '11px',
                                            fontWeight: isAct ? 800 : 600,
                                            background: isAct ? 'var(--bg-card)' : 'transparent',
                                            color: isAct ? (tab.alert ? '#ef4444' : 'var(--text)') : (tab.alert ? '#f59e0b' : 'var(--text-muted)'),
                                            boxShadow: isAct ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                            transition: 'all 0.12s'
                                        }}
                                    >
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Vehicles duty list */}
                    <div style={{ padding: '4px 0', maxHeight: '380px', overflowY: 'auto' }}>
                        {vehicles.loading ? (
                            [1, 2, 3, 4].map(i => (
                                <div key={i} style={{ padding: '12px 20px' }}>
                                    <span className="skeleton skeleton-text" />
                                </div>
                            ))
                        ) : filteredDutyList.length === 0 ? (
                            <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                No vehicles in this category
                            </div>
                        ) : (
                            filteredDutyList.map((v, i) => {
                                const isOnTrip = v.status === 'ON_TRIP';
                                const isLoaded = v.status === 'LOADED';

                                const statusCfg = isOnTrip ? {
                                    color: '#10b981',
                                    bg: 'rgba(16,185,129,0.12)',
                                    border: 'rgba(16,185,129,0.25)',
                                    label: 'ON TRIP',
                                    icon: CheckCircle2
                                } : isLoaded ? {
                                    color: '#3b82f6',
                                    bg: 'rgba(59,130,246,0.12)',
                                    border: 'rgba(59,130,246,0.25)',
                                    label: 'LOADED',
                                    icon: Package
                                } : {
                                    color: '#ef4444',
                                    bg: 'rgba(239,68,68,0.12)',
                                    border: 'rgba(239,68,68,0.25)',
                                    label: 'FREE / IDLE',
                                    icon: AlertCircle
                                };
                                const StatusIcon = statusCfg.icon;

                                return (
                                    <div
                                        key={v.id || v.truckNo}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '12px',
                                            padding: '11px 20px',
                                            borderBottom: i < filteredDutyList.length - 1 ? '1px solid var(--border-row)' : 'none',
                                            flexWrap: 'wrap'
                                        }}
                                    >
                                        {/* Truck & Driver Info */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '200px' }}>
                                            <div style={{
                                                background: statusCfg.bg,
                                                color: statusCfg.color,
                                                padding: '8px',
                                                borderRadius: '10px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                <Truck size={15} />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', letterSpacing: '0.02em' }}>
                                                    {v.truckNo}
                                                </div>
                                                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                    👤 {v.driverName}{v.driverContact ? ` (${v.driverContact})` : ''}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Trip / Duty Details */}
                                        <div style={{ flex: 1, minWidth: '160px' }}>
                                            {isOnTrip ? (
                                                <div>
                                                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#10b981' }}>
                                                        Trip to {v.activeTrip?.destination || '—'}
                                                    </div>
                                                    <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                        {v.activeTrip?.partyName || '—'}{v.activeTrip?.voucherNo ? ` · Vch #${v.activeTrip.voucherNo}` : v.activeTrip?.lrNo ? ` · LR #${v.activeTrip.lrNo}` : ''}
                                                        {v.activeTrip?.bags ? ` · ${v.activeTrip.bags} Bags` : ''}
                                                    </div>
                                                </div>
                                            ) : isLoaded ? (
                                                <div>
                                                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#3b82f6' }}>
                                                        Loaded for {v.activeTrip?.destination || '—'}
                                                    </div>
                                                    <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                        {v.activeTrip?.partyName || '—'}{v.activeTrip?.lrNo ? ` · LR #${v.activeTrip.lrNo}` : ''}
                                                        {v.activeTrip?.bags ? ` · ${v.activeTrip.bags} Bags` : ''}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div>
                                                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b' }}>
                                                        Idle Today — No Trip Assigned
                                                    </div>
                                                    <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                        {v.lastActivity ? `Last trip: ${dayLabel(v.lastActivity.date?.slice(0, 10))} to ${v.lastActivity.destination}` : 'Ready for assignment'}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Status badge only (NO buttons) */}
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <span style={{
                                                fontSize: '11px',
                                                fontWeight: 800,
                                                padding: '4px 10px',
                                                borderRadius: '20px',
                                                background: statusCfg.bg,
                                                color: statusCfg.color,
                                                border: `1px solid ${statusCfg.border}`,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}>
                                                <StatusIcon size={12} />
                                                {statusCfg.label}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
                )}
            </div>
            )}
        </div>
    );
}
