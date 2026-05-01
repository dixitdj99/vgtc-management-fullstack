import React, { useState, useEffect, useMemo } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { Fuel, Search, Filter, Calendar, Check, X, Pencil, Droplet, ArrowRight, Save, AlertCircle, ChevronDown, ChevronUp, Printer, BookOpen } from 'lucide-react';
import ConfirmSaveModal from '../components/ConfirmSaveModal';
import { useAuth } from '../auth/AuthContext';
import ColumnFilter from '../components/ColumnFilter';

const API_V = `/vouchers`;

export default function DieselModule({ role = 'user', permissions = {} }) {
    const { plant } = useAuth();
    const [vouchers, setVouchers] = useState([]);
    // Default filter to Pending status as requested previously
    const [filters, setFilters] = useState({ status: ['Pending'] });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dieselTab, setDieselTab] = useState('records'); // records|pump_ledger
    const [expandedPump, setExpandedPump] = useState(null);
    const [profiles, setProfiles] = useState([]);
    
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
            // Fetch profiles for pump list
            const pRes = await ax.get('/profiles');
            setProfiles(pRes.data || []);

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

    /* Pump Ledger — group by pump name */
    const pumpGroups = useMemo(() => {
        const map = {};
        // Initialize with all pump profiles
        profiles.filter(p => p.type === 'Pump').forEach(p => {
            map[p.name] = { pump: p.name, entries: [], totalVerified: 0, totalUnverified: 0, totalAmount: 0, countVerified: 0, countPending: 0 };
        });

        vouchers.forEach(v => {
            const pump = v.pump || 'Unknown Pump';
            if (!map[pump]) map[pump] = { pump, entries: [], totalVerified: 0, totalUnverified: 0, totalAmount: 0, countVerified: 0, countPending: 0 };
            map[pump].entries.push(v);
            const amt = v.advanceDiesel === 'FULL' ? 0 : (parseFloat(v.advanceDiesel) || 0);
            map[pump].totalAmount += amt;
            if (v.isDieselVerified) {
                map[pump].totalVerified += amt;
                map[pump].countVerified++;
            } else {
                map[pump].totalUnverified += amt;
                map[pump].countPending++;
            }
        });
        return Object.values(map).sort((a, b) => b.totalAmount - a.totalAmount);
    }, [vouchers, profiles]);

    const fmtRs = n => 'Rs.' + Math.round(n).toLocaleString('en-IN');
    const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    return (
        <div className="page-container">
            <div className="page-hd">
                <div>
                    <h1><Droplet size={20} color="#3b82f6" /> Diesel Management</h1>
                    <p>Reconcile and update fuel records manually</p>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-card)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <button
                            onClick={() => setDieselTab('records')}
                            style={{
                                padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s',
                                background: dieselTab === 'records' ? '#3b82f6' : 'transparent',
                                color: dieselTab === 'records' ? '#fff' : 'var(--text-muted)'
                            }}>
                            <Droplet size={13} /> Records
                        </button>
                        <button
                            onClick={() => setDieselTab('pump_ledger')}
                            style={{
                                padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s',
                                background: dieselTab === 'pump_ledger' ? '#3b82f6' : 'transparent',
                                color: dieselTab === 'pump_ledger' ? '#fff' : 'var(--text-muted)'
                            }}>
                            <BookOpen size={13} /> Pump Ledger
                        </button>
                    </div>
                </div>
            </div>

            {dieselTab === 'records' && (<>
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
            </>)}

            {/* ── PUMP LEDGER TAB ── */}
            {dieselTab === 'pump_ledger' && (
                <div>
                    {/* Summary Cards */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        {[
                            { label: 'Total All Pumps', val: fmtRs(pumpGroups.reduce((s, p) => s + p.totalAmount, 0)), color: '#3b82f6' },
                            { label: 'Total Verified', val: fmtRs(pumpGroups.reduce((s, p) => s + p.totalVerified, 0)), color: '#10b981' },
                            { label: 'Total Unverified', val: fmtRs(pumpGroups.reduce((s, p) => s + p.totalUnverified, 0)), color: '#f59e0b' },
                            { label: 'Pending Entries', val: pumpGroups.reduce((s, p) => s + p.countPending, 0), color: '#f43f5e' },
                        ].map(({ label, val, color }) => (
                            <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '160px' }}>
                                <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                                <span style={{ fontSize: '20px', fontWeight: 900, color, lineHeight: 1 }}>{val}</span>
                            </div>
                        ))}
                    </div>

                    {/* Pump-wise Breakdown */}
                    {pumpGroups.map(pg => (
                        <div key={pg.pump} className="card" style={{ marginBottom: '12px' }}>
                            <div
                                className="card-header"
                                style={{ cursor: 'pointer', borderBottom: expandedPump === pg.pump ? '1px solid var(--border)' : 'none' }}
                                onClick={() => setExpandedPump(expandedPump === pg.pump ? null : pg.pump)}
                            >
                                <div className="card-title-block">
                                    <div className="card-icon" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}><Fuel size={17} /></div>
                                    <div className="card-title-text">
                                        <h3>{pg.pump}</h3>
                                        <p>{pg.entries.length} entries · {pg.countVerified} verified, {pg.countPending} pending</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Due</div>
                                        <div style={{ fontSize: '18px', fontWeight: 900, color: '#3b82f6' }}>{fmtRs(pg.totalAmount)}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <div style={{ textAlign: 'center', padding: '4px 10px', borderRadius: '6px', background: 'rgba(16,185,129,0.1)' }}>
                                            <div style={{ fontSize: '8px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>Verified</div>
                                            <div style={{ fontSize: '13px', fontWeight: 900, color: '#10b981' }}>{fmtRs(pg.totalVerified)}</div>
                                        </div>
                                        <div style={{ textAlign: 'center', padding: '4px 10px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)' }}>
                                            <div style={{ fontSize: '8px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>Unverified</div>
                                            <div style={{ fontSize: '13px', fontWeight: 900, color: '#f59e0b' }}>{fmtRs(pg.totalUnverified)}</div>
                                        </div>
                                    </div>
                                    {expandedPump === pg.pump ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                                </div>
                            </div>

                            <AnimatePresence>
                                {expandedPump === pg.pump && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                                        <div className="tbl-wrap">
                                            <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ background: 'var(--bg-th)' }}>
                                                        <th style={TH}>#</th>
                                                        <th style={TH}>Date</th>
                                                        <th style={TH}>Truck No.</th>
                                                        <th style={TH}>LR No.</th>
                                                        <th style={TH}>Amount</th>
                                                        <th style={TH}>Full Tank</th>
                                                        <th style={TH}>Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {pg.entries.sort((a, b) => new Date(b.date) - new Date(a.date)).map((v, i) => (
                                                        <tr key={v.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                                                            <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                                                            <td style={TD}>{fmtDate(v.date)}</td>
                                                            <td style={{ ...TD, fontWeight: 800 }}>{v.truckNo || '—'}</td>
                                                            <td style={{ ...TD, fontWeight: 700, color: 'var(--primary)' }}>#{v.lrNo || '—'}</td>
                                                            <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>
                                                                {v.advanceDiesel === 'FULL' ? 'PENDING COST' : fmtRs(parseFloat(v.advanceDiesel) || 0)}
                                                            </td>
                                                            <td style={TD}>
                                                                {v.isFullTank
                                                                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}><Droplet size={10} /> FULL</span>
                                                                    : <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
                                                                }
                                                            </td>
                                                            <td style={TD}>
                                                                {v.isDieselVerified
                                                                    ? <span className="badge badge-success" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>Verified</span>
                                                                    : <span className="badge badge-tag" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>Pending</span>
                                                                }
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr style={{ background: 'var(--bg-tf)' }}>
                                                        <td colSpan={4} style={{ ...TD, fontWeight: 800, borderTop: '2px solid var(--border)', fontSize: '10px', textTransform: 'uppercase' }}>Sub-Total ({pg.entries.length} entries)</td>
                                                        <td style={{ ...TD, textAlign: 'right', fontWeight: 900, borderTop: '2px solid var(--border)', color: '#3b82f6', fontSize: '14px' }}>{fmtRs(pg.totalAmount)}</td>
                                                        <td colSpan={2} style={{ ...TD, borderTop: '2px solid var(--border)' }}></td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}

                    {pumpGroups.length === 0 && (
                        <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>No diesel records found</div>
                    )}
                </div>
            )}
        </div>
    );
}

