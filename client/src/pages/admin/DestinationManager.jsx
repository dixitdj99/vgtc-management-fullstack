import React, { useState, useEffect } from 'react';
import ax from '../../api';
import { MapPin, Plus, X, Trash2, Edit3, Search, Calendar, History, TrendingUp, Check } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';
import TableScroll from '../../components/TableScroll';

export default function DestinationManager() {
    const [destinations, setDestinations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    
    // Modal states
    const [showAddDest, setShowAddDest] = useState(false);
    const [showRatePeriod, setShowRatePeriod] = useState(false);
    const [selectedDest, setSelectedDest] = useState(null);
    const [delTarget, setDelTarget] = useState(null);
    const [busy, setBusy] = useState(false);

    // Form states
    const [destForm, setDestForm] = useState({
        name: '',
        rate: '',
        startDate: new Date().toISOString().split('T')[0],
        endDate: ''
    });

    const [ratePeriodForm, setRatePeriodForm] = useState({
        rate: '',
        startDate: new Date().toISOString().split('T')[0],
        endDate: ''
    });

    const fetchDestinations = async () => {
        setLoading(true);
        try {
            const res = await ax.get('/destinations');
            setDestinations(res.data || []);
        } catch (e) {
            console.error('Failed to fetch destinations', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDestinations();
    }, []);

    const handleCreateDestination = async (e) => {
        e.preventDefault();
        if (!destForm.name.trim()) return;
        setBusy(true);
        try {
            await ax.post('/destinations', {
                name: destForm.name.trim(),
                rate: Number(destForm.rate) || 0,
                startDate: destForm.startDate,
                endDate: destForm.endDate || null
            });
            setShowAddDest(false);
            setDestForm({ name: '', rate: '', startDate: new Date().toISOString().split('T')[0], endDate: '' });
            fetchDestinations();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to create destination');
        } finally {
            setBusy(false);
        }
    };

    const handleAddRatePeriod = async (e) => {
        e.preventDefault();
        if (!selectedDest || !ratePeriodForm.rate) return;
        setBusy(true);
        try {
            await ax.post(`/destinations/${selectedDest.id}/rate-period`, {
                rate: Number(ratePeriodForm.rate),
                startDate: ratePeriodForm.startDate,
                endDate: ratePeriodForm.endDate || null
            });
            setShowRatePeriod(false);
            setSelectedDest(null);
            setRatePeriodForm({ rate: '', startDate: new Date().toISOString().split('T')[0], endDate: '' });
            fetchDestinations();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to add rate period');
        } finally {
            setBusy(false);
        }
    };

    const handleDeleteDestination = async () => {
        if (!delTarget) return;
        setBusy(true);
        try {
            await ax.delete(`/destinations/${delTarget.id}`);
            setDelTarget(null);
            fetchDestinations();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to delete destination');
        } finally {
            setBusy(false);
        }
    };

    const filtered = destinations.filter(d => 
        (d.name || '').toLowerCase().includes(search.toLowerCase())
    );

    const formatDateDisplay = (dateStr) => {
        if (!dateStr) return 'Onward';
        try {
            const parts = dateStr.slice(0, 10).split('-');
            if (parts.length === 3) {
                return `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
            return dateStr;
        } catch {
            return dateStr;
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <ConfirmDialog
                open={!!delTarget}
                title="Delete Destination?"
                message={<>Delete <strong style={{ color: 'var(--text)' }}>{delTarget?.name}</strong>? This cannot be undone.</>}
                confirmText="Delete"
                danger
                onConfirm={handleDeleteDestination}
                onCancel={() => setDelTarget(null)}
            />

            {/* Header & Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <MapPin size={20} color="#3b82f6" /> Destination Freight Rates
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-sub)', margin: '2px 0 0 0' }}>
                        Manage destinations, effective date range rate history, and autofill rules for vouchers
                    </p>
                </div>
                <button className="btn btn-p" onClick={() => setShowAddDest(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Plus size={16} /> Add New Destination
                </button>
            </div>

            {/* Search & Stats Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: 'var(--bg-card)', padding: '14px 18px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ position: 'relative', width: '280px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        className="fi"
                        type="text"
                        placeholder="Search destination name..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ paddingLeft: '34px', height: '36px', fontSize: '13px' }}
                    />
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-sub)', fontWeight: 600 }}>
                    Total Destinations: <span style={{ color: 'var(--text)', fontWeight: 800 }}>{destinations.length}</span>
                </div>
            </div>

            {/* Destination List Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <TableScroll>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-th)', borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Destination Name</th>
                                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Current Rate (₹/MT)</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Time Period Rate History</th>
                                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="4" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading destinations...</td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan="4" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        {search ? 'No destinations found matching search.' : 'No destinations added yet.'}
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((d, idx) => {
                                    const history = d.rateHistory || [];
                                    return (
                                        <tr key={d.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                                            <td style={{ padding: '12px 16px', fontWeight: 800, color: 'var(--text)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <MapPin size={15} color="#3b82f6" />
                                                    <span>{d.name}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#10b981', fontSize: '14px' }}>
                                                ₹{d.currentRate || 0}
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    {history.length === 0 ? (
                                                        <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>No rate history recorded</span>
                                                    ) : (
                                                        history.map((h, i) => {
                                                            const isLast = i === history.length - 1;
                                                            return (
                                                                <div key={h.id || i} style={{ 
                                                                    display: 'inline-flex', 
                                                                    alignItems: 'center', 
                                                                    gap: '8px', 
                                                                    fontSize: '11.5px',
                                                                    background: isLast ? 'rgba(16,185,129,0.1)' : 'var(--bg-th)',
                                                                    border: `1px solid ${isLast ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                                                                    padding: '3px 8px',
                                                                    borderRadius: '6px',
                                                                    width: 'fit-content'
                                                                }}>
                                                                    <Calendar size={11} color={isLast ? '#10b981' : 'var(--text-muted)'} />
                                                                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                                                                        {formatDateDisplay(h.startDate)} to {formatDateDisplay(h.endDate)}:
                                                                    </span>
                                                                    <span style={{ fontWeight: 800, color: isLast ? '#10b981' : 'var(--text)' }}>
                                                                        ₹{h.rate}/MT
                                                                    </span>
                                                                    {isLast && (
                                                                        <span style={{ fontSize: '9px', fontWeight: 800, background: '#10b981', color: '#fff', padding: '1px 5px', borderRadius: '4px', textTransform: 'uppercase' }}>Active</span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                                    <button 
                                                        className="btn btn-g btn-sm"
                                                        onClick={() => { setSelectedDest(d); setShowRatePeriod(true); }}
                                                        title="Add Rate Change / New Time Period"
                                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px' }}
                                                    >
                                                        <TrendingUp size={13} color="#3b82f6" /> Rate Change
                                                    </button>
                                                    <button
                                                        className="btn btn-d btn-icon btn-sm"
                                                        onClick={() => setDelTarget(d)}
                                                        title="Delete Destination"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </TableScroll>
            </div>

            {/* Modal 1: Add New Destination */}
            {showAddDest && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
                    <div style={{ width: '90%', maxWidth: '420px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                            <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <MapPin size={18} color="#3b82f6" /> Add Destination
                            </h4>
                            <button onClick={() => setShowAddDest(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleCreateDestination} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div className="field">
                                <label>Destination Name *</label>
                                <input 
                                    className="fi" 
                                    type="text" 
                                    placeholder="e.g. Rewari" 
                                    value={destForm.name} 
                                    onChange={e => setDestForm(f => ({ ...f, name: e.target.value }))} 
                                    required 
                                    autoFocus
                                />
                            </div>
                            <div className="field">
                                <label>Rate (Rs/MT) *</label>
                                <input 
                                    className="fi" 
                                    type="number" 
                                    placeholder="e.g. 260" 
                                    value={destForm.rate} 
                                    onChange={e => setDestForm(f => ({ ...f, rate: e.target.value }))} 
                                    required 
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div className="field">
                                    <label>Start Date *</label>
                                    <input 
                                        className="fi" 
                                        type="date" 
                                        value={destForm.startDate} 
                                        onChange={e => setDestForm(f => ({ ...f, startDate: e.target.value }))} 
                                        required 
                                    />
                                </div>
                                <div className="field">
                                    <label>End Date (Optional)</label>
                                    <input 
                                        className="fi" 
                                        type="date" 
                                        value={destForm.endDate} 
                                        onChange={e => setDestForm(f => ({ ...f, endDate: e.target.value }))} 
                                        placeholder="Leave empty for onward"
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                                <button type="button" className="btn btn-g" onClick={() => setShowAddDest(false)}>Cancel</button>
                                <button type="submit" className="btn btn-p" disabled={busy}>
                                    {busy ? 'Saving...' : 'Save Destination'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal 2: Add Rate Change / New Period */}
            {showRatePeriod && selectedDest && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
                    <div style={{ width: '90%', maxWidth: '420px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                            <div>
                                <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <TrendingUp size={18} color="#3b82f6" /> Rate Change for {selectedDest.name}
                                </h4>
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                                    Record a rate change starting from a specific effective date
                                </p>
                            </div>
                            <button onClick={() => setShowRatePeriod(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleAddRatePeriod} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div className="field">
                                <label>New Rate (Rs/MT) *</label>
                                <input 
                                    className="fi" 
                                    type="number" 
                                    placeholder="e.g. 270" 
                                    value={ratePeriodForm.rate} 
                                    onChange={e => setRatePeriodForm(f => ({ ...f, rate: e.target.value }))} 
                                    required 
                                    autoFocus
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div className="field">
                                    <label>Effective From Date *</label>
                                    <input 
                                        className="fi" 
                                        type="date" 
                                        value={ratePeriodForm.startDate} 
                                        onChange={e => setRatePeriodForm(f => ({ ...f, startDate: e.target.value }))} 
                                        required 
                                    />
                                </div>
                                <div className="field">
                                    <label>Effective To Date</label>
                                    <input 
                                        className="fi" 
                                        type="date" 
                                        value={ratePeriodForm.endDate} 
                                        onChange={e => setRatePeriodForm(f => ({ ...f, endDate: e.target.value }))} 
                                        placeholder="Leave empty for onward"
                                    />
                                </div>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-th)', padding: '10px', borderRadius: '8px' }}>
                                💡 Note: Adding a new rate will automatically close previous open-ended rate periods prior to this effective date.
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                                <button type="button" className="btn btn-g" onClick={() => setShowRatePeriod(false)}>Cancel</button>
                                <button type="submit" className="btn btn-p" disabled={busy}>
                                    {busy ? 'Saving...' : 'Add Rate Period'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
