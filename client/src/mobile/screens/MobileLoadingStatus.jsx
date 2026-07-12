import React, { useState, useEffect, useMemo } from 'react';
import { Truck, Shield, Users, Package, Clock, MessageSquare, RefreshCw } from 'lucide-react';
import ax from '../../api';
import { useAuth } from '../../auth/AuthContext';
import MobileScreen from '../components/MobileScreen';
import { EmptyState, SkeletonList } from '../components/common';

const ENDPOINTS = { kosli: '/kosli/lr', jhajjar: '/jhajjar/lr', bahadurgarh: '/bahadurgarh/lr', jklakshmi: '/jkl/lr', dump: '/lr' };
const STATUS = {
    Loaded: { color: '#10b981', label: 'Loaded', pct: 100 },
    Started: { color: '#3b82f6', label: 'Started', pct: 55 },
    Pending: { color: '#94a3b8', label: 'Pending', pct: 12 },
};

const brandFor = (plant, godown) =>
    plant === 'jklakshmi' ? 'jklakshmi' : (godown === 'jhajjar' ? 'jhajjar' : godown === 'kosli' ? 'kosli' : godown === 'bahadurgarh' ? 'bahadurgarh' : 'dump');

function Duration({ r, now }) {
    if (!r.startedAt) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
    const start = new Date(r.startedAt).getTime();
    const end = r.loadedAt ? new Date(r.loadedAt).getTime() : now;
    const ms = Math.max(0, end - start);
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
    const loaded = r.status === 'Loaded';
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: loaded ? 'var(--text-muted)' : 'var(--primary)', fontWeight: 700, fontSize: 12.5 }}>
            <Clock size={13} />{`${h > 0 ? h + 'h ' : ''}${m}m ${s}s`}{loaded ? ' total' : '…'}
        </span>
    );
}

export default function MobileLoadingStatus({ plant, godown }) {
    const { user, hasPermission } = useAuth();
    const isAdmin = user?.role === 'admin';
    const brand = useMemo(() => brandFor(plant, godown), [plant, godown]);
    const [rows, setRows] = useState(null);
    const [fleet, setFleet] = useState({ total: 0, self: 0, market: 0, other: 0 });
    const [now, setNow] = useState(Date.now());
    const [error, setError] = useState(false);

    const endpoint = ENDPOINTS[brand] || '/kosli/lr';

    const load = (silent) => {
        if (!silent) { setRows(null); setError(false); }
        ax.get(endpoint, { params: { _t: Date.now() } }).then(r => {
            const today = new Date().toISOString().split('T')[0];
            setRows((r.data || []).filter(x => x.date && x.date.split('T')[0] === today).reverse());
        }).catch(() => { setRows([]); setError(true); });
        ax.get('/vehicles').then(r => {
            const v = Array.isArray(r.data) ? r.data : [];
            setFleet(v.reduce((a, x) => {
                const t = (x.ownershipType || 'market').toLowerCase();
                if (t === 'self') a.self++; else if (t === 'market') a.market++; else a.other++;
                a.total++; return a;
            }, { total: 0, self: 0, market: 0, other: 0 }));
        }).catch(() => {});
    };

    useEffect(() => {
        load();
        const tick = setInterval(() => setNow(Date.now()), 1000);
        const sync = setInterval(() => load(true), 10000);
        return () => { clearInterval(tick); clearInterval(sync); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [endpoint]);

    const setStatus = async (id, status) => {
        try {
            await ax.patch(`${endpoint}/${id}`, { status });
            setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r));
        } catch { alert('Update failed'); }
    };

    const tiles = [
        { label: 'Total Fleet', value: fleet.total, color: '#6366f1', Icon: Truck },
        { label: 'Self', value: fleet.self, color: '#10b981', Icon: Shield },
        { label: 'Market', value: fleet.market, color: '#f59e0b', Icon: Users },
        { label: 'Other', value: fleet.other, color: '#8b5cf6', Icon: Package },
    ];

    return (
        <MobileScreen>
            <div className="m-kpi-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 6 }}>
                {tiles.map(t => (
                    <div key={t.label} className="m-kpi" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="m-kpi-ico" style={{ background: `${t.color}18`, color: t.color, margin: 0 }}><t.Icon size={16} /></div>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 900, color: t.color }}>{t.value}</div>
                            <div className="m-kpi-label">{t.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="m-section-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Today's Loading · <span style={{ color: '#10b981' }}>LIVE</span></span>
                <button className="m-appbar-btn" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', width: 32, height: 32 }} onClick={() => load()}><RefreshCw size={14} /></button>
            </div>

            {rows === null ? <SkeletonList count={4} />
                : rows.length === 0 ? <EmptyState icon={Truck} title={error ? 'Could not load' : 'No loading orders today'} />
                    : (
                        <div className="m-list">
                            {rows.map((r, i) => {
                                const st = STATUS[r.status] || STATUS.Pending;
                                const loaded = r.status === 'Loaded';
                                return (
                                    <div key={r.id} className="m-card" style={{ opacity: loaded ? 0.7 : 1 }}>
                                        <div className="m-card-title">
                                            <span style={{ fontFamily: 'monospace' }}>{r.truckNo}</span>
                                            <span className="m-chip" style={{ background: `${st.color}18`, color: st.color }}>{st.label.toUpperCase()}</span>
                                        </div>
                                        <div className="m-card-sub">LR #{r.lrNo} · {r.material || '—'} · {r.totalBags || 0} bags</div>

                                        {/* Progress bar */}
                                        <div style={{ height: 6, borderRadius: 99, background: 'var(--bg-th)', margin: '10px 0 8px', overflow: 'hidden' }}>
                                            <div style={{ width: `${st.pct}%`, height: '100%', background: st.color, borderRadius: 99, transition: 'width 0.4s' }} />
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Duration r={r} now={now} />
                                            {isAdmin ? (
                                                <select className="m-select" style={{ width: 'auto', height: 36, padding: '0 10px', fontSize: 13 }}
                                                    value={r.status || 'Pending'} onChange={e => setStatus(r.id, e.target.value)}>
                                                    <option value="Pending">Pending</option>
                                                    <option value="Started">Started</option>
                                                    <option value="Loaded">Loaded</option>
                                                </select>
                                            ) : null}
                                        </div>

                                        {r.note && (
                                            <div style={{ display: 'flex', gap: 6, marginTop: 10, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 8, padding: '7px 9px' }}>
                                                <MessageSquare size={13} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
                                                <span style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.4 }}>{r.note}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
        </MobileScreen>
    );
}
