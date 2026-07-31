import React from 'react';
import { useAuth } from '../auth/AuthContext';
import {
    Receipt, FileText, BookOpen, Wallet, AlertTriangle, TrendingUp,
    Truck, ArrowRight, Plus, RefreshCw, Activity, Gauge, IndianRupee, LayoutGrid
} from 'lucide-react';
import useDashboardData from '../hooks/useDashboardData';

const fmtRs = n => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

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

export default function DashboardHome({ filteredNavIds = new Set(), navItems = [] }) {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const { cfg, lrs, vouchers, cashbook, maintAlerts, vehicles, kpis, recentActivity, refetch } = useDashboardData();
    const { todayLrCount, outstanding, cashInHand, fleetAlerts } = kpis;
    const { fetchLrs, fetchVouchers, fetchCashbook, fetchAlerts, fetchVehicles } = refetch;

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
