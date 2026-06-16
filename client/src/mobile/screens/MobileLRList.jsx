import React, { useState, useEffect, useMemo } from 'react';
import { Receipt, Search, Truck, ChevronRight } from 'lucide-react';
import ax from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { plantConfig } from '../../hooks/useDashboardData';
import MobileScreen from '../components/MobileScreen';
import FAB from '../components/FAB';
import { EmptyState, SkeletonList } from '../components/common';
import MobileLRDetail from './MobileLRDetail';
import MobileLRForm from './MobileLRForm';

const brandFor = (plant, godown) =>
    plant === 'jklakshmi' ? 'jkl' : (godown === 'jhajjar' ? 'jhajjar' : 'kosli');

export default function MobileLRList({ plant, godown, filteredNavIds, nav }) {
    const { user, hasPermission } = useAuth();
    const cfg = useMemo(() => plantConfig(plant, godown), [plant, godown]);
    const brand = brandFor(plant, godown);
    const [rows, setRows] = useState(null);
    const [error, setError] = useState(false);
    const [q, setQ] = useState('');

    const load = () => {
        setError(false); setRows(null);
        ax.get(cfg.lrApi)
            .then(r => setRows([...(r.data || [])].sort((a, b) => (b.lrNo || 0) - (a.lrNo || 0))))
            .catch(() => { setRows([]); setError(true); });
    };
    useEffect(load, [cfg.lrApi]);

    const filtered = useMemo(() => {
        if (!rows) return [];
        const s = q.trim().toLowerCase();
        if (!s) return rows;
        return rows.filter(lr =>
            `${lr.lrNo} ${lr.truckNo} ${lr.partyName} ${lr.destination} ${lr.material}`.toLowerCase().includes(s));
    }, [rows, q]);

    const canCreate = hasPermission(cfg.ids.lr, 'edit') || hasPermission('lr_kosli', 'edit') || hasPermission('lr_jhajjar', 'edit') || hasPermission('lr_jkl', 'edit');

    const openCreate = () => nav.openSheet({
        title: 'New Loading Receipt',
        render: () => <MobileLRForm brand={brand} cfg={cfg} onDone={() => { window.history.back(); load(); }} />,
    });

    const openDetail = (lr) => nav.push({
        key: `lr-${lr.id}`,
        title: `LR #${lr.lrNo}`,
        render: () => <MobileLRDetail lr={lr} />,
    });

    return (
        <>
            <MobileScreen>
                <div style={{ position: 'relative', marginBottom: 14 }}>
                    <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="m-input" style={{ paddingLeft: 40 }} placeholder="Search LR, truck, party…" value={q} onChange={e => setQ(e.target.value)} />
                </div>

                {rows === null ? <SkeletonList count={6} />
                    : filtered.length === 0 ? <EmptyState icon={Receipt} title={error ? 'Could not load' : 'No loading receipts'} hint={error ? 'Pull data again from the menu.' : q ? 'Try a different search.' : 'Tap + to create one.'} />
                        : (
                            <div className="m-list">
                                {filtered.map(lr => (
                                    <div key={lr.id} className="m-card tappable" onClick={() => openDetail(lr)}>
                                        <div className="m-card-title">
                                            <span style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>#{lr.lrNo}</span>
                                            <ChevronRight size={16} color="var(--text-muted)" />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                                            <Truck size={13} color="var(--text-muted)" /> {lr.truckNo || '—'}
                                        </div>
                                        <div className="m-card-sub">{lr.partyName || '—'} · {lr.destination || '—'}</div>
                                        <div className="m-chip-row" style={{ marginTop: 8 }}>
                                            {lr.material && <span className="m-chip">{lr.material}</span>}
                                            {lr.weight && <span className="m-chip" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>{lr.weight} MT</span>}
                                            <span className="m-chip" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>{lr.date}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
            </MobileScreen>
            {canCreate && <FAB onClick={openCreate} label="New LR" />}
        </>
    );
}
