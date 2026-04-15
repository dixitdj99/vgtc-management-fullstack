import React, { useState, useEffect, useMemo } from 'react';
import ax from '../api';
import { cleanTruckNo } from '../utils/vehicleUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Briefcase, Car, Check, ChevronDown, ChevronRight, CreditCard, Edit3, Phone, Plus, Search, Trash2, Truck, User, X } from 'lucide-react';
import ConfirmSaveModal from '../components/ConfirmSaveModal';

const API = `/vehicles`;

const getEmptyForm = () => ({
    truckNo: '',
    ownerName: '',
    ownerContact: '',
    driverName: '',
    driverContact: '',
    vehicleType: 'Trailer',
    bankDetails: JSON.stringify({ name: '', bank: '', account: '', ifsc: '' })
});

const parseBank = (str) => {
    try {
        const parsed = JSON.parse(str);
        if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch { }
    // Legacy fallback
    return { name: '', bank: '', account: str || '', ifsc: '' };
};

/* ── Delete Modal ── */
function DeleteConfirm({ vehicle, onClose, onConfirm }) {
    const [deleting, setDeleting] = useState(false);
    const handleDelete = async () => {
        setDeleting(true);
        try { await ax.delete(`${API}/${vehicle.id}`); onConfirm(); }
        catch { alert('Delete failed'); } finally { setDeleting(false); }
    };
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ width: '90%', maxWidth: '380px', background: '#0f172a', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.6)', padding: '28px 24px', textAlign: 'center' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <AlertTriangle size={26} color="#f43f5e" />
                </div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#f1f5f9', marginBottom: '8px' }}>Delete Vehicle?</div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px' }}><strong style={{ color: '#f1f5f9' }}>{vehicle.truckNo}</strong> ({vehicle.ownerName})</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '22px' }}>This action cannot be undone.</div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button className="btn btn-g" onClick={onClose}>Cancel</button>
                    <button className="btn btn-d" onClick={handleDelete} disabled={deleting}>
                        {deleting ? 'Deleting...' : <><Trash2 size={13} /> Delete</>}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

export default function VehicleModule({ role = 'user', permissions = {} }) {
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // UI State
    const [tab, setTab] = useState('list'); // 'list' or 'add'
    const [fSearch, setFSearch] = useState('');
    const [expandedOwners, setExpandedOwners] = useState({});
    const [deleteTarget, setDeleteTarget] = useState(null);

    // Form State
    const [form, setForm] = useState(getEmptyForm());
    const [editId, setEditId] = useState(null);
    const [isConfirmingSave, setIsConfirmingSave] = useState(false);
    const [err, setErr] = useState('');

    const fetchData = async () => {
        try {
            const { data } = await ax.get(API);
            setVehicles(data);
        } catch (error) {
            console.error("Failed to load vehicles", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Compute grouped owners
    const owners = useMemo(() => {
        const map = {};
        const lowerSearch = fSearch.toLowerCase();

        vehicles.forEach(v => {
            // filtering
            const match = `${v.truckNo} ${v.ownerName} ${v.ownerContact} ${v.driverName}`.toLowerCase().includes(lowerSearch);
            if (fSearch && !match) return;

            const oName = v.ownerName || 'Unknown Owner';
            if (!map[oName]) {
                map[oName] = {
                    name: oName,
                    vehicles: [],
                    bankDetails: v.bankDetails || '', // Use the first available bank details
                    contact: v.ownerContact || ''
                };
            }

            // Upgrade bank details if we find a better one from another vehicle
            if (!map[oName].bankDetails && v.bankDetails) map[oName].bankDetails = v.bankDetails;
            if (!map[oName].contact && v.ownerContact) map[oName].contact = v.ownerContact;

            map[oName].vehicles.push(v);
        });

        return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
    }, [vehicles, fSearch]);

    const handleEdit = (v) => {
        setForm({
            truckNo: v.truckNo || '', ownerName: v.ownerName || '', ownerContact: v.ownerContact || '',
            driverName: v.driverName || '', driverContact: v.driverContact || '',
            vehicleType: v.vehicleType || 'Trailer', bankDetails: v.bankDetails || JSON.stringify({ name: '', bank: '', account: '', ifsc: '' })
        });
        setEditId(v.id);
        setTab('add');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSaveRequest = (e) => {
        e.preventDefault();
        if (!form.truckNo || !form.ownerName) { setErr('Truck Number and Owner Name are required'); return; }
        const duplicate = vehicles.find(v => v.id !== editId && cleanTruckNo(v.truckNo) === cleanTruckNo(form.truckNo));
        if (duplicate) { setErr(`Truck number ${cleanTruckNo(form.truckNo)} already exists in vehicle details`); return; }
        setErr('');
        setIsConfirmingSave(true);
    };

    const executeSave = async () => {
        setSaving(true); setIsConfirmingSave(false);
        try {
            if (editId) {
                if (!(role === 'admin' || permissions?.vehicle === 'edit')) {
                    setErr('Permission denied (Edit access required)');
                    setSaving(false);
                    return;
                }
                await ax.patch(`${API}/${editId}`, form);
            } else {
                if (!(role === 'admin' || permissions?.vehicle === 'edit')) {
                    setErr('Permission denied (Add access required)');
                    setSaving(false);
                    return;
                }
                await ax.post(API, form);
            }
            await fetchData();
            setForm(getEmptyForm());
            setEditId(null);
            setTab('list');
        } catch (error) {
            setErr(error.response?.data?.error || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const toggleOwner = (name) => {
        setExpandedOwners(prev => ({ ...prev, [name]: !prev[name] }));
    };

    const autofillFromOwner = (ownerName) => {
        const existing = vehicles.find(v => v.ownerName === ownerName);
        if (existing) {
            setForm(f => ({
                ...f,
                ownerName: existing.ownerName,
                ownerContact: f.ownerContact || existing.ownerContact || '',
                bankDetails: f.bankDetails || existing.bankDetails || ''
            }));
        } else {
            setForm(f => ({ ...f, ownerName }));
        }
    };

    const toggleToNew = () => {
        if (!(role === 'admin' || permissions?.vehicle === 'edit')) {
            alert('Permission denied');
            return;
        }
        setForm(getEmptyForm());
        setEditId(null);
        setTab('add');
    };

    // Unique owners for datalist
    const uniqueOwners = [...new Set(vehicles.map(v => v.ownerName))].filter(Boolean);
    const uniqueTruckNos = [...new Set(vehicles.map(v => cleanTruckNo(v.truckNo)).filter(Boolean))].sort();

    return (
        <div>
            {/* Delete Modal */}
            <AnimatePresence>
                {deleteTarget && (
                    <DeleteConfirm 
                        vehicle={deleteTarget} 
                        onClose={() => setDeleteTarget(null)} 
                        onConfirm={() => { 
                            setDeleteTarget(null); 
                            fetchData();
                            if (editId === deleteTarget.id) {
                                setEditId(null);
                                setForm(getEmptyForm());
                                setTab('list');
                            }
                        }} 
                    />
                )}
            </AnimatePresence>

            <ConfirmSaveModal
                isOpen={isConfirmingSave}
                onClose={() => setIsConfirmingSave(false)}
                onConfirm={executeSave}
                title={editId ? "Update Vehicle" : "Add Vehicle"}
                message={`Are you sure you want to save ${form.truckNo} for ${form.ownerName}?`}
                isSaving={saving}
            />

            <div className="page-hd">
                <div>
                    <h1><Truck size={20} color="#10b981" /> Vehicle & Owner Directory</h1>
                    <p>Manage transport vehicles, owners, drivers and bank details</p>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                <button className={`tab-btn${tab === 'list' ? ' tab-indigo' : ''}`} onClick={() => setTab('list')}>
                    <Briefcase size={14} /> Owner Directory
                </button>
                <button className={`tab-btn${tab === 'add' ? ' tab-indigo' : ''}`} onClick={toggleToNew}>
                    {editId ? <><Edit3 size={14} /> Edit Vehicle</> : <><Plus size={14} /> Add New Vehicle</>}
                </button>
            </div>

            {tab === 'add' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card">
                    <div className="card-header">
                        <div className="card-title-block">
                            <div className="card-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}><Truck size={17} /></div>
                            <div className="card-title-text">
                                <h3>{editId ? 'Edit Vehicle Details' : 'Register New Vehicle'}</h3>
                                <p>Add vehicle, ownership, and payment info</p>
                            </div>
                        </div>
                    </div>
                    <form className="card-body" onSubmit={handleSaveRequest}>
                        <div className="fg fg-2">
                            <div className="field">
                                <label>Truck No. *</label>
                                <input className="fi" type="text" placeholder="e.g. RJ01AB1234 or HR361234" value={form.truckNo} onChange={e => setForm({ ...form, truckNo: cleanTruckNo(e.target.value) })} required list="vehicle-truck-list" />
                                <datalist id="vehicle-truck-list">
                                    {uniqueTruckNos.map(no => <option key={no} value={no} />)}
                                </datalist>
                            </div>
                            <div className="field">
                                <label>Vehicle Type</label>
                                <select className="fi" value={form.vehicleType} onChange={e => setForm({ ...form, vehicleType: e.target.value })}>
                                    <option value="Trailer">Trailer</option>
                                    <option value="Canter">Canter</option>
                                    <option value="Dump Truck">Dump Truck</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </div>

                        <hr className="sep" />
                        <h4 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <User size={15} color="var(--primary)" /> Owner Information
                        </h4>

                        <div className="fg fg-2">
                            <div className="field">
                                <label>Owner Name * <span style={{ color: 'var(--text-muted)', fontWeight: 'normal', fontSize: '10px' }}>(Select existing to copy bank details)</span></label>
                                <input className="fi" type="text" placeholder="Name or Company" value={form.ownerName} onChange={e => autofillFromOwner(e.target.value)} required list="owner-list" />
                                <datalist id="owner-list">
                                    {uniqueOwners.map(o => <option key={o} value={o} />)}
                                </datalist>
                            </div>
                            <div className="field">
                                <label>Owner Contact</label>
                                <input className="fi" type="text" placeholder="Phone number" value={form.ownerContact} onChange={e => setForm({ ...form, ownerContact: e.target.value })} />
                            </div>
                        </div>

                        <div className="field">
                            <label><CreditCard size={11} /> Bank Payment Details (for Owner)</label>
                            <div style={{ padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div className="fg fg-2" style={{ marginBottom: 0 }}>
                                    <div className="field" style={{ marginBottom: 0 }}>
                                        <label style={{ fontSize: '10px' }}>Account Holder Name</label>
                                        <input className="fi" type="text" placeholder="Name on account" value={parseBank(form.bankDetails).name} onChange={e => {
                                            const b = parseBank(form.bankDetails); b.name = e.target.value; setForm({ ...form, bankDetails: JSON.stringify(b) });
                                        }} />
                                    </div>
                                    <div className="field" style={{ marginBottom: 0 }}>
                                        <label style={{ fontSize: '10px' }}>Bank Name</label>
                                        <input className="fi" type="text" placeholder="e.g. HDFC Bank" value={parseBank(form.bankDetails).bank} onChange={e => {
                                            const b = parseBank(form.bankDetails); b.bank = e.target.value; setForm({ ...form, bankDetails: JSON.stringify(b) });
                                        }} />
                                    </div>
                                </div>
                                <div className="fg fg-2" style={{ marginBottom: 0 }}>
                                    <div className="field" style={{ marginBottom: 0 }}>
                                        <label style={{ fontSize: '10px' }}>Account Number</label>
                                        <input className="fi" type="text" placeholder="Account no." value={parseBank(form.bankDetails).account} onChange={e => {
                                            const b = parseBank(form.bankDetails); b.account = e.target.value; setForm({ ...form, bankDetails: JSON.stringify(b) });
                                        }} />
                                    </div>
                                    <div className="field" style={{ marginBottom: 0 }}>
                                        <label style={{ fontSize: '10px' }}>IFSC Code</label>
                                        <input className="fi" type="text" placeholder="IFSC Code" value={parseBank(form.bankDetails).ifsc} onChange={e => {
                                            const b = parseBank(form.bankDetails); b.ifsc = e.target.value; setForm({ ...form, bankDetails: JSON.stringify(b) });
                                        }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <hr className="sep" />
                        <h4 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Car size={15} color="var(--primary)" /> Driver Information (Optional)
                        </h4>

                        <div className="fg fg-2">
                            <div className="field">
                                <label>Driver Name</label>
                                <input className="fi" type="text" placeholder="Current driver" value={form.driverName} onChange={e => setForm({ ...form, driverName: e.target.value })} />
                            </div>
                            <div className="field">
                                <label>Driver Contact</label>
                                <input className="fi" type="text" placeholder="Phone number" value={form.driverContact} onChange={e => setForm({ ...form, driverContact: e.target.value })} />
                            </div>
                        </div>

                        {err && <div style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 600, marginTop: '8px' }}>{err}</div>}

                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                            <button type="submit" className="btn btn-p" disabled={saving} style={{ flex: 1 }}>
                                {saving ? 'Saving...' : <><Check size={14} /> Save Vehicle Record</>}
                            </button>
                            {editId && (
                                <>
                                    {(role === 'admin' || permissions?.vehicle === 'edit') && (
                                        <button 
                                            type="button" 
                                            className="btn btn-d" 
                                            onClick={() => {
                                                const v = vehicles.find(v => v.id === editId);
                                                if (v) setDeleteTarget(v);
                                            }}
                                            style={{ padding: '0 20px' }}
                                        >
                                            <Trash2 size={14} /> Delete
                                        </button>
                                    )}
                                    <button type="button" className="btn btn-g" onClick={toggleToNew}>Cancel Edit</button>
                                </>
                            )}
                        </div>
                    </form>
                </motion.div>
            )}

            {tab === 'list' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card">
                    <div className="card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
                        <div className="card-title-block">
                            <div className="card-icon ci-indigo"><Briefcase size={17} /></div>
                            <div className="card-title-text" style={{ flex: 1 }}>
                                <h3>Registered Owners</h3>
                                <p>{owners.length} owners, {vehicles.length} vehicles</p>
                            </div>
                        </div>
                        <div style={{ position: 'relative', minWidth: '220px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input className="fi" type="text" placeholder="Search vehicle, owner, driver..." value={fSearch} onChange={e => setFSearch(e.target.value)} style={{ paddingLeft: '32px' }} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {loading ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600 }}>Loading vehicles...</div>
                        ) : owners.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600 }}>No vehicles or owners found.</div>
                        ) : (
                            owners.map(owner => {
                                const isExp = expandedOwners[owner.name] !== false; // Default expanded
                                return (
                                    <div key={owner.name} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <div
                                            onClick={() => toggleOwner(owner.name)}
                                            style={{ padding: '16px 20px', background: isExp ? 'var(--bg-th)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'background 0.2s' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ color: 'var(--text-muted)', display: 'flex' }}>
                                                    {isExp ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>{owner.name}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: 700, color: 'var(--primary)', background: 'rgba(99,102,241,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{owner.vehicles.length} Vehicle(s)</span>
                                                        {owner.contact && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={10} /> {owner.contact}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            {owner.bankDetails && (
                                                <div style={{ fontSize: '11px', background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '6px 10px', borderRadius: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    <CreditCard size={13} style={{ flexShrink: 0 }} /> Bank Info Saved
                                                </div>
                                            )}
                                        </div>

                                        <AnimatePresence>
                                            {isExp && (
                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                                                    <div style={{ padding: '0 20px 16px 44px' }}>
                                                        {owner.bankDetails && (() => {
                                                            const b = parseBank(owner.bankDetails);
                                                            return (
                                                                <div style={{ marginBottom: '12px', padding: '12px', background: 'var(--bg-input)', border: '1px dashed var(--border-input)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-sub)' }}>
                                                                    <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '6px' }}>💳 Bank Details:</strong>
                                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                                        {b.name && <div><span style={{ opacity: 0.6 }}>Name:</span> <strong style={{ color: 'var(--text)' }}>{b.name}</strong></div>}
                                                                        {b.bank && <div><span style={{ opacity: 0.6 }}>Bank:</span> <strong style={{ color: 'var(--text)' }}>{b.bank}</strong></div>}
                                                                        {b.account && <div><span style={{ opacity: 0.6 }}>A/C No:</span> <strong style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{b.account}</strong></div>}
                                                                        {b.ifsc && <div><span style={{ opacity: 0.6 }}>IFSC:</span> <strong style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{b.ifsc}</strong></div>}
                                                                    </div>
                                                                    {(!b.name && !b.bank && !b.ifsc && b.account) && <div>{b.account}</div>}
                                                                </div>
                                                            )
                                                        })()}

                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                                                            {owner.vehicles.map(v => (
                                                                <div key={v.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', position: 'relative' }}>
                                                                    <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '4px' }}>
                                                                        {(role === 'admin' || permissions?.vehicle === 'edit') && (
                                                                            <button className="btn btn-g btn-icon btn-sm" onClick={() => handleEdit(v)} title="Edit"><Edit3 size={12} /></button>
                                                                        )}
                                                                        {role === 'admin' && (
                                                                            <button className="btn btn-d btn-icon btn-sm" onClick={() => setDeleteTarget(v)} title="Delete"><Trash2 size={12} /></button>
                                                                        )}
                                                                    </div>

                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                                        <div style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '6px', borderRadius: '8px' }}><Truck size={14} /></div>
                                                                        <div style={{ fontSize: '15px', fontWeight: 900, fontFamily: 'monospace', color: 'var(--text)' }}>{v.truckNo}</div>
                                                                        <div style={{ fontSize: '10px', background: 'var(--bg-input)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, color: 'var(--text-sub)' }}>{v.vehicleType || 'Trailer'}</div>
                                                                    </div>

                                                                    {(v.driverName || v.driverContact) && (
                                                                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border)', fontSize: '12px', color: 'var(--text-sub)' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}><User size={12} /> <strong style={{ color: 'var(--text)' }}>Driver:</strong> {v.driverName || 'N/A'}</div>
                                                                            {v.driverContact && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '18px' }}><Phone size={10} /> {v.driverContact}</div>}
                                                                        </div>
                                                                    )}
                                                                    {(role === 'admin' && (v.createdBy || v.updatedBy)) && (
                                                                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border)', fontSize: '10px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                                                                            <span>Created: {v.createdBy || '—'}</span>
                                                                            <span>Updated: {v.updatedBy || '—'}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </motion.div>
            )}
        </div>
    );
}
