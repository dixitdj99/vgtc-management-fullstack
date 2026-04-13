import React, { useState, useEffect, useMemo } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { Fuel, Search, Filter, Calendar, Check, X, Pencil, Droplet, ArrowRight, Save, AlertCircle } from 'lucide-react';
import ConfirmSaveModal from '../components/ConfirmSaveModal';
import { useAuth } from '../auth/AuthContext';
import ColumnFilter from '../components/ColumnFilter';

const API_V = `/vouchers`;
const PUMPS = ['S.K Pump', 'Shiva Pump', 'Karoli'];

export default function DieselModule({ role = 'user', permissions = {} }) {
    const { plant } = useAuth();
    const [vouchers, setVouchers] = useState([]);
    // Default filter to Pending status as requested previously
    const [filters, setFilters] = useState({ status: ['Pending'] });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    
    // Filters
    const handleFilterChange = (key, val) => setFilters(f => ({ ...f, [key]: val }));

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

    const handleQuickVerify = async (v) => {
        if (v.advanceDiesel === 'FULL' || (v.isFullTank && (!v.advanceDiesel || isNaN(parseFloat(v.advanceDiesel))))) {
            alert('This voucher is marked as Full Tank. Please click the Edit/Pencil icon to enter the actual amount in Rupees before verifying.');
            return;
        }
        try {
            await ax.patch(`${API_V}/${v.id}`, { isDieselVerified: true });
            fetchData();
        } catch (err) {
            alert('Verification failed');
        }
    };

    const handleSave = async (id) => {
        // Block save if diesel is FULL tank but no actual amount has been entered
        if (editForm.isFullTank && (!editForm.advanceDiesel || isNaN(parseFloat(editForm.advanceDiesel)))) {
            alert('Please enter the actual diesel amount before saving. The value cannot be left empty when Full Tank is selected.');
            return;
        }

        setSaving(true);
        try {
            const finalValue = editForm.advanceDiesel || '0';
            
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
        let list = [...vouchers];
        
        Object.keys(filters).forEach(key => {
            const vals = filters[key];
            if (vals && vals.length > 0) {
                if (key === 'status') {
                    // Map "Verified" / "Pending" back to isDieselVerified
                    list = list.filter(v => {
                        const s = v.isDieselVerified ? 'Verified' : 'Pending';
                        return vals.includes(s);
                    });
                } else {
                    list = list.filter(v => vals.includes(String(v[key] ?? '')));
                }
            }
        });

        return list;
    }, [vouchers, filters]);

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

            {/* Active Filters Summary */}
            {Object.keys(filters).some(k => filters[k].length > 0) && (
                <div className="card" style={{ marginBottom: '20px' }}>
                    <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase' }}>Active Filters:</span>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {Object.keys(filters).map(k => filters[k].length > 0 && (
                                <span key={k} className="badge badge-tag">{k}: {filters[k].length}</span>
                            ))}
                        </div>
                        <button className="btn btn-sm btn-g" style={{ marginLeft: 'auto' }} onClick={() => setFilters({ status: ['Pending'] })}>Reset to Pending</button>
                        <button className="btn btn-sm btn-d" onClick={() => setFilters({})}>Clear All</button>
                    </div>
                </div>
            )}

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
                <div className="tbl-wrap">
                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading records...</div>
                    ) : (
                        <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-th)' }}>
                                    <th style={TH}><ColumnFilter label="Date" colKey="date" data={vouchers} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                                    <th style={TH}><ColumnFilter label="Truck No." colKey="truckNo" data={vouchers} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                                    <th style={TH}><ColumnFilter label="Pump Name" colKey="pump" data={vouchers} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                                    <th style={TH}><ColumnFilter label="Status" colKey="status" data={vouchers.map(v => ({ ...v, status: v.isDieselVerified ? 'Verified' : 'Pending' }))} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                                    <th style={TH}>Details</th>
                                    {role === 'admin' && <th style={TH}>Created By</th>}
                                    {role === 'admin' && <th style={TH}>Updated By</th>}
                                    <th style={{ ...TH, textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No records matching filters</td></tr>
                                ) : (
                                    filtered.map(v => (
                                        <tr key={v.id} style={{ transition: 'background 0.2s', opacity: v.isDieselVerified ? 0.75 : 1 }}>
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
                                            {role === 'admin' && <td style={TD}>{v.createdBy || '—'}</td>}
                                            {role === 'admin' && <td style={TD}>{v.updatedBy || '—'}</td>}
                                            <td style={{ ...TD, textAlign: 'center' }}>
                                                {editingId === v.id ? (
                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                        <button className="btn btn-p btn-icon btn-sm" title="Save & Verify" onClick={() => handleSave(v.id)} disabled={saving || !(role === 'admin' || permissions?.diesel === 'edit')}><Save size={14} /></button>
                                                        <button className="btn btn-g btn-icon btn-sm" onClick={() => setEditingId(null)} disabled={saving}><X size={14} /></button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                        {!v.isDieselVerified && (role === 'admin' || permissions?.diesel === 'edit') && (
                                                            <button 
                                                                className="btn btn-p btn-icon btn-sm" 
                                                                title="Quick Verify" 
                                                                style={{ background: '#10b981', borderColor: '#10b981' }}
                                                                onClick={() => handleQuickVerify(v)}
                                                            >
                                                                <Check size={14} />
                                                            </button>
                                                        )}
                                                        {(role === 'admin' || permissions?.diesel === 'edit') && (
                                                            <button className="btn btn-g btn-icon btn-sm" title="Reconcile Details" onClick={() => handleEdit(v)}><Pencil size={14} /></button>
                                                        )}
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

