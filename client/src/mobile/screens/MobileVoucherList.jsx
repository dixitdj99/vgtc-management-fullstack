import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Search, Truck, ChevronRight } from 'lucide-react';
import ax from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { plantConfig } from '../../hooks/useDashboardData';
import { calcNet } from '../../utils/voucherCalc';
import { fmtRs } from '../../utils/format';
import MobileScreen from '../components/MobileScreen';
import FAB from '../components/FAB';
import { EmptyState, SkeletonList } from '../components/common';
import MobileVoucherDetail from './MobileVoucherDetail';
import MobileVoucherForm from './MobileVoucherForm';

export default function MobileVoucherList({ plant, godown, nav }) {
    const { hasPermission } = useAuth();
    const cfg = useMemo(() => plantConfig(plant, godown), [plant, godown]);
    const [rows, setRows] = useState(null);
    const [error, setError] = useState(false);
    const [q, setQ] = useState('');
    const [type, setType] = useState(cfg.voucherTypes[0]);

    const load = () => {
        setError(false); setRows(null);
        Promise.all(cfg.voucherTypes.map(t => ax.get(`/vouchers/${t}`).then(r => (r.data || []).map(v => ({ ...v, _type: t }))).catch(() => [])))
            .then(lists => setRows(lists.flat()))
            .catch(() => { setRows([]); setError(true); });
    };
    useEffect(load, [cfg.lrApi]);

    const filtered = useMemo(() => {
        if (!rows) return [];
        const s = q.trim().toLowerCase();
        return rows
            .filter(v => v._type === type)
            .filter(v => !s || `${v.lrNo} ${v.truckNo} ${v.partyName} ${v.destination}`.toLowerCase().includes(s))
            .sort((a, b) => (b.lrNo || 0) - (a.lrNo || 0));
    }, [rows, q, type]);

    const canCreate = hasPermission(cfg.ids.voucher, 'edit') || hasPermission('voucher_jksuper', 'edit') || hasPermission('voucher_jkl', 'edit');

    const openCreate = () => nav.openSheet({
        title: 'New Voucher',
        render: () => <MobileVoucherForm plant={plant} cfg={cfg} defaultType={type} onDone={() => { window.history.back(); load(); }} />,
    });
    const openDetail = (v) => nav.push({ key: `v-${v.id}`, title: `Voucher #${v.lrNo}`, render: () => <MobileVoucherDetail v={v} /> });

    return (
        <>
            <MobileScreen>
                <div className="m-chip-row" style={{ marginBottom: 12 }}>
                    {cfg.voucherTypes.map(t => (
                        <span key={t} className={`m-chip selectable${type === t ? ' on' : ''}`} onClick={() => setType(t)}>{t.replace(/_/g, ' ')}</span>
                    ))}
                </div>
                <div style={{ position: 'relative', marginBottom: 14 }}>
                    <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="m-input" style={{ paddingLeft: 40 }} placeholder="Search LR, truck, party…" value={q} onChange={e => setQ(e.target.value)} />
                </div>

                {rows === null ? <SkeletonList count={6} />
                    : filtered.length === 0 ? <EmptyState icon={FileText} title={error ? 'Could not load' : 'No vouchers'} hint={error ? '' : q ? 'Try a different search.' : 'Tap + to create one.'} />
                        : (
                            <div className="m-list">
                                {filtered.map(v => {
                                    const net = calcNet(v);
                                    return (
                                        <div key={v.id} className="m-card tappable" onClick={() => openDetail(v)}>
                                            <div className="m-card-title">
                                                <span style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>#{v.lrNo}</span>
                                                <span style={{ color: net >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{fmtRs(net)}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                                                <Truck size={13} color="var(--text-muted)" /> {v.truckNo || '—'}
                                            </div>
                                            <div className="m-card-sub">{v.partyName || '—'} · {v.destination || '—'} · {v.date}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
            </MobileScreen>
            {canCreate && <FAB onClick={openCreate} label="New Voucher" />}
        </>
    );
}
