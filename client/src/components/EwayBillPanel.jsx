/**
 * EwayBillPanel — the loads NIC already knows are on VGTC's trucks.
 *
 * The cement plant names VGTC as transporter when it generates an e-way bill,
 * which means the truck, party, material, quantity, document number and date
 * are already recorded before the driver reaches the gate. Tapping a row fills
 * the challan form with all of it; only the LR number is VGTC's own to type.
 *
 * Two things the design leans on:
 *
 *  - **Nothing is hidden.** Every field the server was unsure about — an
 *    unrecognised product name, a bill whose Part-B has no vehicle yet — is
 *    listed on the row before it is applied. A wrong bag count that looks right
 *    is worse than a blank.
 *
 *  - **Silence is not failure.** Most days this panel will say the feed is not
 *    connected, because NIC credentials take weeks. That reads as a note, not an
 *    error, on a screen the yard uses all day.
 */

import React, { useState, useEffect, useCallback } from 'react';
import ax from '../api';
import { Truck, RefreshCw, AlertTriangle, Loader2, ChevronRight, EyeOff } from 'lucide-react';

const fmtRs = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');

export default function EwayBillPanel({ materials = [], onApply, refreshKey = 0 }) {
    const [state, setState] = useState({ loading: true, configured: false, bills: [] });
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const qs = materials.length ? `?materials=${encodeURIComponent(materials.join(','))}` : '';
            const [pending, status] = await Promise.all([
                ax.get(`/eway/pending${qs}`).then(r => r.data),
                ax.get('/eway/status').then(r => r.data).catch(() => ({})),
            ]);
            setState({
                loading: false,
                configured: !!pending.configured,
                bills: pending.bills || [],
                missing: pending.missing || [],
                lastSyncAt: status.lastSyncAt || null,
                lastError: status.lastError || null,
            });
            setError('');
        } catch (e) {
            // A feed that cannot be reached must not break the challan form under it.
            setState(s => ({ ...s, loading: false, configured: false, bills: [] }));
            setError(e.response?.data?.error || e.message);
        }
    // materials is rebuilt each render upstream; its contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [materials.join(',')]);

    useEffect(() => { load(); }, [load, refreshKey]);

    const sync = async () => {
        setSyncing(true);
        try { await ax.post('/eway/sync'); await load(); }
        catch (e) { setError(e.response?.data?.error || 'Sync failed'); }
        finally { setSyncing(false); }
    };

    const ignore = async (ewbNo) => {
        try {
            await ax.post(`/eway/${ewbNo}/status`, { status: 'ignored' });
            setState(s => ({ ...s, bills: s.bills.filter(b => b.ewbNo !== ewbNo) }));
        } catch (e) { setError(e.response?.data?.error || 'Could not hide that bill'); }
    };

    if (state.loading) return null;

    // Not connected is the ordinary state until credentials arrive. One quiet line.
    if (!state.configured) {
        return (
            <div style={{ padding: '10px 14px', marginBottom: '14px', border: '1px dashed var(--border)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                <Truck size={13} />
                <span>E-way bill feed not connected — challans are entered by hand.</span>
                {error && <span style={{ color: '#f43f5e', marginLeft: 'auto' }}>{error}</span>}
            </div>
        );
    }

    return (
        <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-header"><div className="card-title-block">
                <div className="card-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}><Truck size={17} /></div>
                <div className="card-title-text">
                    <h3>Pending e-way bills</h3>
                    <p>{state.bills.length ? 'Tap a load to fill the challan below' : 'Nothing waiting — every synced bill has been used or hidden'}</p>
                </div>
            </div>
                <button type="button" className="btn btn-g btn-sm" onClick={sync} disabled={syncing} title="Fetch from NIC now">
                    {syncing ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} Refresh
                </button>
            </div>

            {(error || state.lastError) && (
                <div style={{ margin: '0 20px 10px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(244,63,94,0.08)', color: '#f43f5e', fontSize: '11px', fontWeight: 700 }}>
                    {error || state.lastError}
                </div>
            )}

            <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {state.bills.map(({ ewbNo, draft }) => {
                    const flags = draft.needsReview || [];
                    return (
                        <div key={ewbNo}
                            style={{ border: `1px solid ${flags.length ? 'rgba(245,158,11,0.45)' : 'var(--border)'}`, borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg)' }}>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)', fontSize: '12px' }}>{draft.truckNo || '— no truck —'}</span>
                                <span style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text)' }}>{draft.partyName || 'Unnamed party'}</span>
                                {draft.destination && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>→ {draft.destination}</span>}
                                <span style={{ marginLeft: 'auto', fontSize: '11.5px', fontWeight: 800, color: 'var(--accent)' }}>{fmtRs(draft.totInvValue)}</span>
                            </div>

                            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--text-sub)' }}>
                                <span>{draft.material || '—'} · <strong>{(draft.quantity || 0).toLocaleString('en-IN')}</strong> bags</span>
                                <span>Bill {draft.billNo || '—'}</span>
                                <span>{draft.date || '—'}</span>
                                <span style={{ fontFamily: 'monospace', opacity: 0.7 }}>EWB {ewbNo}</span>
                            </div>

                            {flags.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '10.5px', color: 'var(--warn)', fontWeight: 700 }}>
                                    <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: '1px' }} />
                                    <span>{flags.join(' · ')}</span>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                                <button type="button" className="btn btn-p btn-sm" onClick={() => onApply(ewbNo, draft)}>
                                    Use this <ChevronRight size={13} />
                                </button>
                                <button type="button" className="btn btn-g btn-sm" onClick={() => ignore(ewbNo)} title="Not ours, or already handled">
                                    <EyeOff size={13} /> Hide
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {state.lastSyncAt && (
                <div style={{ padding: '0 20px 12px', fontSize: '10px', color: 'var(--text-muted)' }}>
                    Last checked {new Date(state.lastSyncAt).toLocaleString('en-IN')}
                </div>
            )}
        </div>
    );
}
