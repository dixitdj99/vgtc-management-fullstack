import React from 'react';
import { Receipt, IndianRupee, Wallet, AlertTriangle, TrendingUp, Truck, RefreshCw } from 'lucide-react';
import MobileScreen from '../components/MobileScreen';
import useDashboardData from '../../hooks/useDashboardData';
import { useAuth } from '../../auth/AuthContext';

const fmtRs = n => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

function Kpi({ icon: Icon, label, value, color, loading, error, onRetry, onClick }) {
    return (
        <div className="m-kpi" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
            <div className="m-kpi-ico" style={{ background: `${color}18`, color }}><Icon size={17} /></div>
            <div className="m-kpi-label">{label}</div>
            {loading ? (
                <span className="m-skel" style={{ height: 24, width: '60%', display: 'block', marginTop: 4 }} />
            ) : error ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <span className="m-kpi-val" style={{ color: 'var(--text-muted)' }}>—</span>
                    <button className="m-appbar-btn" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', width: 30, height: 30 }} onClick={e => { e.stopPropagation(); onRetry(); }}><RefreshCw size={13} /></button>
                </div>
            ) : (
                <div className="m-kpi-val">{value}</div>
            )}
        </div>
    );
}

export default function MobileDashboard({ filteredNavIds, nav }) {
    const { user } = useAuth();
    const { cfg, lrs, vouchers, cashbook, maintAlerts, vehicles, kpis, recentActivity, refetch } = useDashboardData();
    const { todayLrCount, outstanding, cashInHand, fleetAlerts } = kpis;

    const greeting = (() => {
        const h = new Date().getHours();
        return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    })();

    // Map a module id to its mobile tab if it's a core tab, else no-op
    const goTab = (moduleId) => {
        if (moduleId === cfg.ids.lr) nav.setTab('lr');
        else if (moduleId === cfg.ids.voucher) nav.setTab('voucher');
        else if (moduleId === cfg.ids.cashbook) nav.setTab('cash');
        else nav.setTab('more');
    };

    return (
        <MobileScreen>
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>{greeting},</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)' }}>{user?.name || user?.username || 'there'}</div>
            </div>

            <div className="m-kpi-grid">
                <Kpi icon={Receipt} label="Today's LRs" color="#6366f1"
                    loading={lrs.loading} error={lrs.error} onRetry={refetch.fetchLrs}
                    value={todayLrCount ?? '—'}
                    onClick={filteredNavIds.has(cfg.ids.lr) ? () => nav.setTab('lr') : undefined} />
                <Kpi icon={IndianRupee} label="Outstanding" color="#f59e0b"
                    loading={vouchers.loading || vehicles.loading} error={vouchers.error} onRetry={refetch.fetchVouchers}
                    value={outstanding != null ? fmtRs(outstanding) : '—'} />
                <Kpi icon={Wallet} label="Cash in hand" color="#10b981"
                    loading={cashbook.loading || vouchers.loading} error={cashbook.error} onRetry={refetch.fetchCashbook}
                    value={cashInHand != null ? `${cashInHand < 0 ? '-' : ''}${fmtRs(cashInHand)}` : '—'}
                    onClick={filteredNavIds.has(cfg.ids.cashbook) ? () => nav.setTab('cash') : undefined} />
                <Kpi icon={AlertTriangle} label="Fleet alerts" color="#ef4444"
                    loading={maintAlerts.loading && vehicles.loading} error={maintAlerts.error && vehicles.error}
                    onRetry={() => { refetch.fetchAlerts(); refetch.fetchVehicles(); }}
                    value={fleetAlerts ? fleetAlerts.length : '—'} />
            </div>

            <div className="m-section-hd">Recent Activity</div>
            <div className="m-card" style={{ padding: '4px 14px' }}>
                {(lrs.loading || vouchers.loading) ? (
                    [1, 2, 3].map(i => <div key={i} className="m-row"><span className="m-skel" style={{ height: 16, width: '80%' }} /></div>)
                ) : recentActivity.length === 0 ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted)' }}>No recent entries</div>
                ) : recentActivity.map((item, i) => (
                    <div key={i} className="m-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <div style={{ background: 'var(--primary-glow)', color: 'var(--primary)', padding: 6, borderRadius: 8, display: 'flex', flexShrink: 0 }}><item.icon size={13} /></div>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{item.kind} · {item.date || '—'}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="m-section-hd">Fleet Alerts</div>
            <div className="m-card" style={{ padding: '4px 14px' }}>
                {(maintAlerts.loading && vehicles.loading) ? (
                    [1, 2].map(i => <div key={i} className="m-row"><span className="m-skel" style={{ height: 16, width: '70%' }} /></div>)
                ) : !fleetAlerts || fleetAlerts.length === 0 ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12.5, color: 'var(--accent)', fontWeight: 700 }}>✓ All vehicles OK</div>
                ) : fleetAlerts.slice(0, 6).map(a => (
                    <div key={a.key} className="m-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <div style={{ background: a.severity === 2 ? 'var(--danger-glow)' : 'rgba(245,158,11,0.12)', color: a.severity === 2 ? 'var(--danger)' : '#f59e0b', padding: 6, borderRadius: 8, display: 'flex', flexShrink: 0 }}><Truck size={13} /></div>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text)', fontFamily: 'monospace' }}>{a.truckNo}</div>
                                <div style={{ fontSize: 11, color: a.severity === 2 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 600 }}>{a.text}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </MobileScreen>
    );
}
