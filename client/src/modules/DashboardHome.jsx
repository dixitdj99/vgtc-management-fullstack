import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import ax from '../api';
import { motion } from 'framer-motion';
import {
    Receipt, FileText, BookOpen, Wallet, AlertTriangle, TrendingUp,
    Truck, ArrowRight, Plus, RefreshCw, Activity, Gauge, IndianRupee
} from 'lucide-react';
import { calcOutstanding, checkExpiry } from '../utils/voucherCalc';

const fmtRs = n => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');
const today = () => new Date().toISOString().split('T')[0];

const navTo = (active, subActive) =>
    window.dispatchEvent(new CustomEvent('nav-module', { detail: { active, subActive } }));

/* Per-plant endpoint/config map */
const plantConfig = (plant, godown) => {
    if (plant === 'jklakshmi') {
        return {
            lrApi: '/jkl/lr', cashbookApi: '/jkl/cashbook',
            voucherTypes: ['Dump', 'JK_Lakshmi', 'JK_Super'],
            ids: { lr: 'lr_jharli', voucher: 'voucher_jharli', cashbook: 'cashbook_jharli', balance: 'balance_jharli', vehicles: 'vehicles_jharli' },
        };
    }
    // jksuper — godown narrows voucher types the same way FILTERED_NAV does
    let voucherTypes = ['Kosli_Bill', 'Jajjhar_Bill', 'JK_Super'];
    if (godown === 'kosli') voucherTypes = ['Kosli_Bill'];
    else if (godown === 'jhajjar') voucherTypes = ['Jajjhar_Bill'];
    return {
        lrApi: '/lr', cashbookApi: '/cashbook',
        voucherTypes,
        ids: { lr: 'lr_dump', voucher: 'voucher_dump', cashbook: 'cashbook_dump', balance: 'balance_dump', vehicles: 'vehicles_dump' },
    };
};

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

export default function DashboardHome({ filteredNavIds = new Set() }) {
    const { user, plant, godown } = useAuth();
    const cfg = useMemo(() => plantConfig(plant, godown), [plant, godown]);

    // Each data source independent: { loading, data, error }
    const [lrs, setLrs] = useState({ loading: true, data: null, error: false });
    const [vouchers, setVouchers] = useState({ loading: true, data: null, error: false });
    const [cashbook, setCashbook] = useState({ loading: true, data: null, error: false });
    const [maintAlerts, setMaintAlerts] = useState({ loading: true, data: null, error: false });
    const [vehicles, setVehicles] = useState({ loading: true, data: null, error: false });

    const fetchLrs = () => {
        setLrs(s => ({ ...s, loading: true, error: false }));
        ax.get(cfg.lrApi)
            .then(r => setLrs({ loading: false, data: r.data || [], error: false }))
            .catch(() => setLrs({ loading: false, data: null, error: true }));
    };
    const fetchVouchers = () => {
        setVouchers(s => ({ ...s, loading: true, error: false }));
        Promise.all(cfg.voucherTypes.map(t => ax.get(`/vouchers/${t}`).then(r => r.data || []).catch(() => [])))
            .then(lists => setVouchers({ loading: false, data: lists.flat(), error: false }))
            .catch(() => setVouchers({ loading: false, data: null, error: true }));
    };
    const fetchCashbook = () => {
        setCashbook(s => ({ ...s, loading: true, error: false }));
        ax.get(cfg.cashbookApi)
            .then(r => setCashbook({ loading: false, data: r.data || [], error: false }))
            .catch(() => setCashbook({ loading: false, data: null, error: true }));
    };
    const fetchAlerts = () => {
        setMaintAlerts(s => ({ ...s, loading: true, error: false }));
        ax.get('/maintenance/alerts')
            .then(r => setMaintAlerts({ loading: false, data: r.data || [], error: false }))
            .catch(() => setMaintAlerts({ loading: false, data: null, error: true }));
    };
    const fetchVehicles = () => {
        setVehicles(s => ({ ...s, loading: true, error: false }));
        ax.get('/vehicles')
            .then(r => setVehicles({ loading: false, data: r.data || [], error: false }))
            .catch(() => setVehicles({ loading: false, data: null, error: true }));
    };

    useEffect(() => {
        fetchLrs(); fetchVouchers(); fetchCashbook(); fetchAlerts(); fetchVehicles();
    }, [cfg]);

    /* ── KPI computations ── */
    const todayLrCount = useMemo(() => {
        if (!lrs.data) return null;
        const t = today();
        return lrs.data.filter(lr => String(lr.date || '').slice(0, 10) === t).length;
    }, [lrs.data]);

    const vehicleMap = useMemo(() => {
        const m = {};
        (vehicles.data || []).forEach(v => { m[(v.truckNo || '').replace(/\s/g, '').toUpperCase()] = v; });
        return m;
    }, [vehicles.data]);

    const outstanding = useMemo(() => {
        if (!vouchers.data) return null;
        return vouchers.data.reduce((s, v) => {
            const veh = vehicleMap[(v.truckNo || '').replace(/\s/g, '').toUpperCase()];
            return s + calcOutstanding(v, veh);
        }, 0);
    }, [vouchers.data, vehicleMap]);

    // Same formula as CashbookModule "current balance":
    // deposits − cash outs − voucher cash advances
    const cashInHand = useMemo(() => {
        if (!cashbook.data || !vouchers.data) return null;
        const deposits = cashbook.data.filter(e => e.type === 'deposit').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        const cashOuts = cashbook.data.filter(e => e.type === 'cash_out').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        const voucherAdv = vouchers.data.reduce((s, v) => s + Math.abs(parseFloat(v.advanceCash) || 0), 0);
        return deposits - cashOuts - voucherAdv;
    }, [cashbook.data, vouchers.data]);

    const fleetAlerts = useMemo(() => {
        if (!maintAlerts.data && !vehicles.data) return null;
        const list = [];
        (maintAlerts.data || []).forEach(a => {
            if (a.status === 'OVERDUE' || a.status === 'DUE_SOON') {
                list.push({
                    key: `m-${a.truckNo}-${a.partName}`,
                    truckNo: a.truckNo,
                    text: `${a.partName} service ${a.status === 'OVERDUE' ? 'overdue' : `due in ${a.daysRemaining}d`}`,
                    severity: a.status === 'OVERDUE' ? 2 : 1,
                });
            }
        });
        (vehicles.data || []).forEach(v => {
            let docs = {};
            try { docs = JSON.parse(v.docs || '{}'); } catch { }
            Object.entries(docs).forEach(([type, date]) => {
                const r = checkExpiry(date);
                if (r && r.status !== 'ok') {
                    list.push({
                        key: `d-${v.truckNo}-${type}`,
                        truckNo: v.truckNo,
                        text: `${type.toUpperCase()} ${r.status === 'expired' ? `expired ${r.days}d ago` : `expires in ${r.days}d`}`,
                        severity: r.status === 'expired' ? 2 : 1,
                    });
                }
            });
        });
        return list.sort((a, b) => b.severity - a.severity);
    }, [maintAlerts.data, vehicles.data]);

    const recentActivity = useMemo(() => {
        const getTime = (x) => {
            const c = x.createdAt;
            if (c?.seconds) return c.seconds * 1000;
            const t = new Date(c || x.date || 0).getTime();
            return isNaN(t) ? 0 : t;
        };
        const items = [
            ...(vouchers.data || []).map(v => ({ kind: 'Voucher', icon: FileText, label: `LR #${v.lrNo} · ${v.truckNo || ''} · ${v.destination || v.type || ''}`, date: v.date, ts: getTime(v) })),
            ...(lrs.data || []).map(lr => ({ kind: 'LR', icon: Receipt, label: `LR #${lr.lrNo} · ${lr.truckNo || ''} · ${lr.material || ''}`, date: lr.date, ts: getTime(lr) })),
        ];
        return items.sort((a, b) => b.ts - a.ts).slice(0, 8);
    }, [vouchers.data, lrs.data]);

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
        </div>
    );
}
