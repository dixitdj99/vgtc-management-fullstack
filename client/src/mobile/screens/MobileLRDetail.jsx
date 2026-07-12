import React from 'react';
import { Truck, MapPin, Calendar, Package, MessageSquare } from 'lucide-react';
import MobileScreen from '../components/MobileScreen';

export default function MobileLRDetail({ lr }) {
    // Normalize materials: newer LRs store materials[]; older store flat fields
    const materials = lr.materials?.length
        ? lr.materials
        : [{ type: lr.material, weight: lr.weight, bags: lr.totalBags, loadingType: lr.loadingType }];

    return (
        <MobileScreen>
            <div className="m-card">
                <div className="m-card-title">
                    <span style={{ fontFamily: 'monospace', color: 'var(--primary)', fontSize: 18 }}>#{lr.lrNo}</span>
                    {lr.status && <span className="m-chip">{lr.status}</span>}
                </div>
                <div className="m-row"><span className="m-row-label"><Truck size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Truck</span><span className="m-row-val">{lr.truckNo || '—'}</span></div>
                <div className="m-row"><span className="m-row-label">Party</span><span className="m-row-val">{lr.partyName || '—'}</span></div>
                <div className="m-row"><span className="m-row-label"><MapPin size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Destination</span><span className="m-row-val">{lr.destination || '—'}</span></div>
                <div className="m-row"><span className="m-row-label"><Calendar size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Date</span><span className="m-row-val">{lr.date || '—'}</span></div>
            </div>

            <div className="m-section-hd">Materials</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {materials.map((m, i) => (
                    <div key={i} className="m-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Package size={15} color="var(--primary)" />
                            <span style={{ fontWeight: 800, color: 'var(--text)' }}>{m.type || '—'}</span>
                            {m.loadingType && <span className="m-chip" style={{ marginLeft: 'auto', background: m.loadingType === 'Crossing' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)', color: m.loadingType === 'Crossing' ? '#f59e0b' : 'var(--accent)' }}>{m.loadingType}</span>}
                        </div>
                        <div className="m-row" style={{ marginTop: 6 }}><span className="m-row-label">Weight</span><span className="m-row-val">{m.weight || '—'} MT</span></div>
                        <div className="m-row"><span className="m-row-label">Bags</span><span className="m-row-val">{m.bags || m.totalBags || '—'}</span></div>
                        {m.billing && m.billing !== 'No' && <div className="m-row"><span className="m-row-label">Challan</span><span className="m-row-val">{m.billing}</span></div>}
                    </div>
                ))}
            </div>

            {lr.note && (
                <>
                    <div className="m-section-hd">Note</div>
                    <div className="m-card" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <MessageSquare size={15} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ fontSize: 13, color: 'var(--text)' }}>{lr.note}</span>
                    </div>
                </>
            )}
        </MobileScreen>
    );
}
