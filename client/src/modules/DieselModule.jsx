import React, { useState, useEffect, useMemo } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { Fuel, Search, Filter, Calendar, Check, X, Pencil, Droplet, ArrowRight, Save, AlertCircle } from 'lucide-react';
import ConfirmSaveModal from '../components/ConfirmSaveModal';
import { useAuth } from '../auth/AuthContext';

const API_V = `/vouchers`;
const PUMPS = ['S.K Pump', 'Shiva Pump', 'Karoli'];

export default function DieselModule() {
    const { plant } = useAuth();
    const [vouchers, setVouchers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    
    // Filters
    const [fPump, setFPump] = useState('');
    const [fDateFrom, setFDateFrom] = useState('');
    const [fDateTo, setFDateTo] = useState('');
    const [fTruck, setFTruck] = useState('');
    const [fStatus, setFStatus] = useState('Pending'); // Default to Pending (Unverified)

    // Edit state
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ advanceDiesel: '', isFullTank: false });

    useEffect(() => {
        fetchData();
    }, [plant]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Types change based on plant
            const types = plant === 'jklakshmi' ? ['Dump', 'JK_Lakshmi'] : ['Dump', 'JK_Super'];
            const all = await Promise.all(types.map(t => ax.get(`${API_V}/${t}`)));
            const combined = all.flatMap(res => res.data)
                .filter(v => v.advanceDiesel || v.isFullTank); // Only show those with diesel advances
            
            // Sort by date desc
            combined.sort((a, b) => new Date(b.date) - new Date(a.date));
            setVouchers(combined);
        } catch (err) {
            console.error('Failed to fetch diesel records', err);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (v) => {
        setEditingId(v.id);
        setEditForm({ 
            advanceDiesel: v.advanceDiesel === 'FULL' ? '' : (v.advanceDiesel || ''), 
            isFullTank: !!v.isFullTank || v.advanceDiesel === 'FULL'
        });
    };

    const handleQuickVerify = async (id) => {
        try {
            await ax.patch(`${API_V}/${id}`, { isDieselVerified: true });
            fetchData();
        } catch (err) {
            alert('Verification failed');
        }
    };

    const handleSave = async (id) => {
        setSaving(true);
        try {
            // Save the actual amount entered, even if it's a full tank
            // If it's a full tank but they haven't entered an amount yet, keep it as 'FULL' for fallback
            const finalValue = editForm.advanceDiesel || (editForm.isFullTank ? 'FULL' : '0');
            
            await ax.patch(`${API_V}/${id}`, { 
                advanceDiesel: finalValue,
                isFullTank: editForm.isFullTank,
                isDieselVerified: true // Mark as verified when manually updated
            });
            setEditingId(null);
            fetchData();
        } catch (err) {
            alert('Update failed');
        } finally {
            setSaving(false);
        }
    };

    const filtered = useMemo(() => {
        // Check if any specific search filters are active
        const hasSearch = fPump || fDateFrom || fDateTo || fTruck;
        
        return vouchers.filter(v => {
            const matchPump = !fPump || v.pump === fPump;
            const matchDateFrom = !fDateFrom || v.date >= fDateFrom;
            const matchDateTo = !fDateTo || v.date <= fDateTo;
            const matchTruck = !fTruck || v.truckNo.toLowerCase().includes(fTruck.toLowerCase());
            
            // If no search filter is active, respect the fStatus filter
            // If any search filter is active, show All except if fStatus is explicitly changed (or just show All)
            // Based on user: "if we use filter show all the data verified or unverified also"
            let matchStatus = true;
            if (!hasSearch) {
                if (fStatus === 'Pending') matchStatus = !v.isDieselVerified;
                if (fStatus === 'Verified') matchStatus = !!v.isDieselVerified;
            } else {
                // If they explicitly chose a status while searching, respect it, otherwise show All
                if (fStatus === 'Pending') matchStatus = !v.isDieselVerified;
                else if (fStatus === 'Verified') matchStatus = !!v.isDieselVerified;
                else matchStatus = true;
            }

            return matchPump && matchDateFrom && matchDateTo && matchTruck && matchStatus;
        });
    }, [vouchers, fPump, fDateFrom, fDateTo, fTruck, fStatus]);

    const TH = { padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' };
    const TD = { padding: '12px 16px', fontSize: '13px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-sub)' };

    return (
        <div className="page-container">
            <div className="page-hd">
                <div>
                    <h1><Droplet size={20} color="#3b82f6" /> Diesel Management</h1>
                    <p>Reconcile and update fuel records manually</p>
                </div>
            </div>

            {/* Filters */}
            <div className="card" style={{ marginBottom: '20px' }}>
                <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'flex-end' }}>
                    <div className="field" style={{ flex: '1 1 150px' }}>
                        <label><Check size={12} /> Verification Status</label>
                        <select className="fi" value={fStatus} onChange={e => setFStatus(e.target.value)}>
                            <option value="All">All Data</option>
                            <option value="Pending">Unverified (Pending)</option>
                            <option value="Verified">Verified</option>
                        </select>
                    </div>
                    <div className="field" style={{ flex: '1 1 180px' }}>
                        <label><Fuel size={12} /> Fuel Pump</label>
                        <select className="fi" value={fPump} onChange={e => setFPump(e.target.value)}>
                            <option value="">All Pumps</option>
                            {PUMPS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div className="field" style={{ flex: '1 1 140px' }}>
                        <label><Calendar size={12} /> From Date</label>
                        <input type="date" className="fi" value={fDateFrom} onChange={e => setFDateFrom(e.target.value)} />
                    </div>
                    <div className="field" style={{ flex: '1 1 140px' }}>
                        <label><Calendar size={12} /> To Date</label>
                        <input type="date" className="fi" value={fDateTo} onChange={e => setFDateTo(e.target.value)} />
                    </div>
                    <div className="field" style={{ flex: '1 1 140px' }}>
                        <label><Search size={12} /> Truck No.</label>
                        <input type="text" className="fi" placeholder="Search Truck..." value={fTruck} onChange={e => setFTruck(e.target.value)} />
                    </div>
                    <button className="btn btn-g" onClick={() => { setFPump(''); setFDateFrom(''); setFDateTo(''); setFTruck(''); setFStatus('Pending'); }}>Clear</button>
                </div>
            </div>

            {/* List */}
            <div className="card">
                <div className="card-header" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="card-title-block">
                        <div className="card-icon ci-blue"><Droplet size={17} /></div>
                        <div className="card-title-text">
                            <h3>Fuel Advance Records</h3>
                            <p>{filtered.filter(v => !v.isDieselVerified).length} pending, {filtered.filter(v => v.isDieselVerified).length} verified</p>
                        </div>
                    </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading records...</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-th)' }}>
                                    <th style={TH}>Date</th>
                                    <th style={TH}>Truck No.</th>
                                    <th style={TH}>Pump Name</th>
                                    <th style={TH}>Status</th>
                                    <th style={TH}>Details</th>
                                    <th style={{ ...TH, textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No records matching filters</td></tr>
                                ) : (
                                    filtered.map(v => (
                                        <tr key={v.id} style={{ transition: 'background 0.2s', opacity: v.isDieselVerified && fStatus === 'All' ? 0.7 : 1 }}>
                                            <td style={TD}>{v.date}</td>
                                            <td style={{ ...TD, fontWeight: 700 }}>{v.truckNo}</td>
                                            <td style={TD}>{v.pump}</td>
                                            <td style={TD}>
                                                {v.isDieselVerified ? (
                                                    <span className="badge badge-success" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>Verified</span>
                                                ) : (
                                                    <span className="badge badge-tag" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>Pending</span>
                                                )}
                                            </td>
                                            <td style={TD}>
                                                {editingId === v.id ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <input 
                                                            type="text" 
                                                            className="fi" 
                                                            style={{ width: '100px', height: '32px' }}
                                                            placeholder="Actual Rs."
                                                            value={editForm.advanceDiesel}
                                                            onChange={e => setEditForm(f => ({ ...f, advanceDiesel: e.target.value }))}
                                                        />
                                                        <button 
                                                            className={`btn btn-sm ${editForm.isFullTank ? 'btn-p' : 'btn-g'}`}
                                                            style={{ fontSize: '10px', height: '32px' }}
                                                            onClick={() => setEditForm(f => ({ ...f, isFullTank: !f.isFullTank }))}
                                                        >
                                                            {editForm.isFullTank ? 'Full ✓' : 'Full?'}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontWeight: 800, color: 'var(--text)' }}>
                                                            {v.advanceDiesel === 'FULL' ? 'PENDING COST' : (v.advanceDiesel || '0')}
                                                        </span>
                                                        {v.isFullTank && <span title="Full Tank" style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '9px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '1px 4px', borderRadius: '4px', fontWeight: 700 }}>
                                                            <Droplet size={10} /> FULL
                                                        </span>}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ ...TD, textAlign: 'center' }}>
                                                {editingId === v.id ? (
                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                        <button className="btn btn-p btn-icon btn-sm" title="Save & Verify" onClick={() => handleSave(v.id)} disabled={saving}><Save size={14} /></button>
                                                        <button className="btn btn-g btn-icon btn-sm" onClick={() => setEditingId(null)} disabled={saving}><X size={14} /></button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                        {!v.isDieselVerified && (
                                                            <button 
                                                                className="btn btn-p btn-icon btn-sm" 
                                                                title="Quick Verify" 
                                                                style={{ background: '#10b981', borderColor: '#10b981' }}
                                                                onClick={() => handleQuickVerify(v.id)}
                                                            >
                                                                <Check size={14} />
                                                            </button>
                                                        )}
                                                        <button className="btn btn-g btn-icon btn-sm" title="Reconcile Details" onClick={() => handleEdit(v)}><Pencil size={14} /></button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

