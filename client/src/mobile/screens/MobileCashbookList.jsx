import React, { useState, useEffect, useMemo } from 'react';
import { Wallet, ArrowDownCircle, ArrowUpCircle, Plus } from 'lucide-react';
import ax from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { plantConfig } from '../../hooks/useDashboardData';
import { fmtRs, fmtDate } from '../../utils/format';
import MobileScreen from '../components/MobileScreen';
import { EmptyState, SkeletonList } from '../components/common';
import MobileCashbookForm from './MobileCashbookForm';

export default function MobileCashbookList({ plant, godown, nav }) {
    const { hasPermission } = useAuth();
    const cfg = useMemo(() => plantConfig(plant, godown), [plant, godown]);
    const [entries, setEntries] = useState(null);
    const [vouchers, setVouchers] = useState([]);
    const [error, setError] = useState(false);

    const load = () => {
        setError(false); setEntries(null);
        ax.get(cfg.cashbookApi)
            .then(r => setEntries([...(r.data || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''))))
            .catch(() => { setEntries([]); setError(true); });
        Promise.all(cfg.voucherTypes.map(t => ax.get(`/vouchers/${t}`).then(r => r.data || []).catch(() => [])))
            .then(lists => setVouchers(lists.flat())).catch(() => {});
    };
    useEffect(load, [cfg.cashbookApi]);

    const balance = useMemo(() => {
        if (!entries) return null;
        const dep = entries.filter(e => e.type === 'deposit').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        const out = entries.filter(e => e.type === 'cash_out').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        const adv = vouchers.reduce((s, v) => s + Math.abs(parseFloat(v.advanceCash) || 0), 0);
        return dep - out - adv;
    }, [entries, vouchers]);

    const canEdit = hasPermission('cashbook', 'edit');

    const openForm = (kind) => nav.openSheet({
        title: kind === 'deposit' ? 'Add Deposit' : 'Cash Out',
        render: () => <MobileCashbookForm kind={kind} cfg={cfg} onDone={() => { window.history.back(); load(); }} />,
    });

    return (
        <>
            <MobileScreen>
                {/* Balance header */}
                <div className="m-card" style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-2))', border: 'none', color: '#fff', marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.85 }}>Cash in Hand</div>
                    <div style={{ fontSize: 30, fontWeight: 900, marginTop: 4 }}>
                        {balance === null ? '—' : `${balance < 0 ? '-' : ''}${fmtRs(balance)}`}
                    </div>
                    {canEdit && (
                        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                            <button className="m-btn" style={{ height: 44, background: 'rgba(255,255,255,0.18)', color: '#fff' }} onClick={() => openForm('deposit')}><ArrowDownCircle size={16} /> Deposit</button>
                            <button className="m-btn" style={{ height: 44, background: 'rgba(255,255,255,0.18)', color: '#fff' }} onClick={() => openForm('cash_out')}><ArrowUpCircle size={16} /> Cash Out</button>
                        </div>
                    )}
                </div>

                <div className="m-section-hd">Recent Entries</div>
                {entries === null ? <SkeletonList count={6} />
                    : entries.length === 0 ? <EmptyState icon={Wallet} title={error ? 'Could not load' : 'No entries yet'} hint={error ? '' : canEdit ? 'Add a deposit or cash out above.' : ''} />
                        : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {entries.slice(0, 80).map(e => {
                                    const isDep = e.type === 'deposit';
                                    return (
                                        <div key={e.id} className="m-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <div style={{ background: isDep ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)', color: isDep ? 'var(--accent)' : 'var(--danger)', padding: 8, borderRadius: 10, display: 'flex', flexShrink: 0 }}>
                                                {isDep ? <ArrowDownCircle size={18} /> : <ArrowUpCircle size={18} />}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.remark || (isDep ? 'Deposit' : 'Cash Out')}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{fmtDate(e.date)}{e.entityName ? ` · ${e.entityName}` : ''}</div>
                                            </div>
                                            <div style={{ fontWeight: 900, fontSize: 15, color: isDep ? 'var(--accent)' : 'var(--danger)', flexShrink: 0 }}>
                                                {isDep ? '+' : '−'}{fmtRs(e.amount)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
            </MobileScreen>
        </>
    );
}
