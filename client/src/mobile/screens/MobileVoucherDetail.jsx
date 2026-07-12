import React from 'react';
import { Truck, MapPin } from 'lucide-react';
import MobileScreen from '../components/MobileScreen';
import { calcNet } from '../../utils/voucherCalc';
import { fmtRs } from '../../utils/format';

const Row = ({ label, value, strong, color }) => (
    <div className="m-row">
        <span className="m-row-label">{label}</span>
        <span className="m-row-val" style={{ color, fontWeight: strong ? 900 : 700 }}>{value}</span>
    </div>
);

export default function MobileVoucherDetail({ v }) {
    const net = calcNet(v);
    const gross = (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);
    const deliveries = v.deliveries?.length ? v.deliveries : null;

    return (
        <MobileScreen>
            <div className="m-card">
                <div className="m-card-title">
                    <span style={{ fontFamily: 'monospace', color: 'var(--primary)', fontSize: 18 }}>#{v.lrNo}</span>
                    {v.type && <span className="m-chip">{v.type.replace(/_/g, ' ')}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0', fontSize: 14, fontWeight: 700 }}>
                    <Truck size={14} color="var(--text-muted)" /> {v.truckNo || '—'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
                    <MapPin size={13} /> {v.destination || '—'} · {v.partyName || '—'}
                </div>
            </div>

            {deliveries && (
                <>
                    <div className="m-section-hd">Deliveries</div>
                    {deliveries.map((d, i) => (
                        <div key={i} className="m-card" style={{ marginBottom: 10 }}>
                            <Row label="LR" value={`#${d.lrNo || '—'}`} />
                            <Row label="Destination" value={d.destination || '—'} />
                            <Row label="Weight" value={`${d.weight || '—'} MT`} />
                            <Row label="Rate" value={d.rate || '—'} />
                        </div>
                    ))}
                </>
            )}

            <div className="m-section-hd">Freight</div>
            <div className="m-card">
                {!deliveries && <><Row label="Weight" value={`${v.weight || '—'} MT`} /><Row label="Rate" value={v.rate || '—'} /></>}
                <Row label="Gross" value={fmtRs(gross)} />
                <Row label="Diesel Adv." value={v.advanceDiesel || '—'} color="var(--warn)" />
                <Row label="Cash Adv." value={v.advanceCash || '—'} color="var(--warn)" />
                <Row label="Online Adv." value={v.advanceOnline || '—'} color="var(--warn)" />
                <Row label="Munshi" value={v.munshi || '—'} />
                <Row label="Net Payable" value={fmtRs(net)} strong color={net >= 0 ? 'var(--accent)' : 'var(--danger)'} />
            </div>
        </MobileScreen>
    );
}
