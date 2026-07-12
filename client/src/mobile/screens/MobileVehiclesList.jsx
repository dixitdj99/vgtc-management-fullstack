import React, { useState, useEffect, useMemo } from 'react';
import { Truck, Search, ChevronRight, User, Phone } from 'lucide-react';
import ax from '../../api';
import { checkExpiry } from '../../utils/voucherCalc';
import MobileScreen from '../components/MobileScreen';
import { EmptyState, SkeletonList } from '../components/common';

function MobileVehicleDetail({ v }) {
    let docs = {};
    try { docs = JSON.parse(v.docs || '{}'); } catch { }
    const docRows = Object.entries(docs).filter(([, d]) => d);

    return (
        <MobileScreen>
            <div className="m-card">
                <div className="m-card-title">
                    <span style={{ fontFamily: 'monospace' }}>{v.truckNo}</span>
                </div>
                <div className="m-row"><span className="m-row-label"><User size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Owner</span><span className="m-row-val">{v.ownerName || '—'}</span></div>
                <div className="m-row"><span className="m-row-label">Driver</span><span className="m-row-val">{v.driverName || '—'}</span></div>
                {v.driverContact && <div className="m-row"><span className="m-row-label"><Phone size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Contact</span><span className="m-row-val">{v.driverContact}</span></div>}
                <div className="m-row"><span className="m-row-label">Type</span><span className="m-row-val">{v.vehicleType || '—'}</span></div>
                <div className="m-row"><span className="m-row-label">GPS</span><span className="m-row-val">{(v.gpsType || 'none').toUpperCase()}</span></div>
            </div>

            {docRows.length > 0 && (
                <>
                    <div className="m-section-hd">Documents</div>
                    <div className="m-card">
                        {docRows.map(([type, date]) => {
                            const r = checkExpiry(date);
                            const color = !r ? 'var(--text-muted)' : r.status === 'expired' ? 'var(--danger)' : r.status === 'near' ? '#f59e0b' : 'var(--accent)';
                            const note = !r ? date : r.status === 'expired' ? `Expired ${r.days}d ago` : r.status === 'near' ? `${r.days}d left` : '✓ OK';
                            return (
                                <div key={type} className="m-row">
                                    <span className="m-row-label">{type.toUpperCase()}</span>
                                    <span className="m-row-val" style={{ color }}>{note}</span>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </MobileScreen>
    );
}

export default function MobileVehiclesList({ nav }) {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState(false);
    const [q, setQ] = useState('');

    useEffect(() => {
        ax.get('/vehicles')
            .then(r => setRows([...(r.data || [])].sort((a, b) => (a.truckNo || '').localeCompare(b.truckNo || ''))))
            .catch(() => { setRows([]); setError(true); });
    }, []);

    const filtered = useMemo(() => {
        if (!rows) return [];
        const s = q.trim().toLowerCase();
        if (!s) return rows;
        return rows.filter(v => `${v.truckNo} ${v.ownerName} ${v.driverName}`.toLowerCase().includes(s));
    }, [rows, q]);

    return (
        <MobileScreen>
            <div style={{ position: 'relative', marginBottom: 14 }}>
                <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input className="m-input" style={{ paddingLeft: 40 }} placeholder="Search truck, owner, driver…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            {rows === null ? <SkeletonList count={6} />
                : filtered.length === 0 ? <EmptyState icon={Truck} title={error ? 'Could not load' : 'No vehicles'} />
                    : (
                        <div className="m-list">
                            {filtered.map(v => (
                                <div key={v.id} className="m-card tappable" onClick={() => nav.push({ key: `veh-${v.id}`, title: v.truckNo, render: () => <MobileVehicleDetail v={v} /> })}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--primary)', padding: 8, borderRadius: 10, flexShrink: 0 }}><Truck size={18} /></div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{v.truckNo}</div>
                                            <div className="m-card-sub">{v.ownerName || '—'}{v.driverName ? ` · ${v.driverName}` : ''}</div>
                                        </div>
                                        <ChevronRight size={16} color="var(--text-muted)" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
        </MobileScreen>
    );
}
