import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ax from '../api';
import { cleanTruckNo } from '../utils/vehicleUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Banknote, Briefcase, Car, Check, ChevronDown, ChevronRight, CreditCard, Edit3, FileText, Info, Phone, Plus, Search, Trash2, Truck, User, Wrench, X } from 'lucide-react';
import ConfirmSaveModal from '../components/ConfirmSaveModal';
import MaintenanceTracker from '../components/MaintenanceTracker';

const API = `/vehicles`;

const getEmptyForm = () => ({
    truckNo: '',
    ownerName: '',
    ownerContact: '',
    driverName: '',
    driverContact: '',
    vehicleType: 'Trailer',
    ownershipType: 'market',
    make: 'Tata',
    model: '',
    grossWeight: '',
    unladenWeight: '',
    regDate: '',
    nationalPermitDate: '',
    rcDetails: JSON.stringify({ engineNo: '', chassisNo: '', fitnessNo: '' }),
    docNumbers: JSON.stringify({ rcNo: '', insuranceNo: '', pollutionNo: '', permitNo: '', fitnessNo: '', taxNo: '' }),
    bankDetails: JSON.stringify({ name: '', bank: '', account: '', ifsc: '' }),
    gpsType: 'none',
    emiDetails: JSON.stringify({ tenure: '', startDate: '', dueDate: '', loanNo: '', pending: '', total: '', due: '', interestRate: '', bankName: '', paidEmis: [] }),
    docs: JSON.stringify({ rc: '', pollution: '', permit: '', insurance: '', fitness: '', tax: '' }),
    fastag: '',
    targetMileage: 0
});

const parseJson = (str, fallback = {}) => {
    try {
        const parsed = JSON.parse(str);
        if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch { }
    return fallback;
};

/* ── Vehicle Visualizer ── */
function VehicleVisualizer() {
    return (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="card" style={{ marginBottom: '24px', overflow: 'hidden', border: '1px solid var(--primary-glow)' }}>
            <div className="card-header" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="card-title-block">
                    <div className="card-icon" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}><Info size={17} /></div>
                    <div className="card-title-text">
                        <h3>Vehicle Anatomy & Parts Guide</h3>
                        <p>Locate key components for maintenance (Tata/Ashok Leyland style)</p>
                    </div>
                </div>
            </div>
            <div style={{ position: 'relative', background: '#0f172a', padding: '30px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '320px' }}>
                <img src="/commercial_vehicle_parts_diagram_1777288985862.png" alt="Vehicle Parts Diagram" style={{ maxWidth: '100%', height: 'auto', borderRadius: '12px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }} />
                
                <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', padding: '6px 12px', borderRadius: '20px', fontSize: '10px', color: '#10b981', fontWeight: 800 }}>ENGINE AREA</div>
                    <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', padding: '6px 12px', borderRadius: '20px', fontSize: '10px', color: '#3b82f6', fontWeight: 800 }}>CHASSIS FRAME</div>
                    <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', padding: '6px 12px', borderRadius: '20px', fontSize: '10px', color: '#f59e0b', fontWeight: 800 }}>AXLE SYSTEM</div>
                </div>

                <div style={{ position: 'absolute', bottom: '20px', left: '20px', background: 'rgba(0,0,0,0.7)', padding: '12px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', maxWidth: '280px' }}>
                    <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '8px' }}>Maintenance Checkpoints</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {['Fuel Tank', 'Battery Box', 'Air Filter', 'Propeller Shaft'].map(p => (
                            <div key={p} style={{ fontSize: '11px', color: '#f1f5f9', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#3b82f6' }} /> {p}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

/* ── Delete Modal (Dual Verification) ── */
function DeleteConfirm({ vehicle, onClose, onConfirm }) {
    const [step, setStep] = useState(1);
    const [confirmText, setConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);
    const truckNo = vehicle.truckNo || '';
    const isMatch = confirmText.toUpperCase().replace(/\s/g, '') === truckNo.toUpperCase().replace(/\s/g, '');

    const handleDelete = async () => {
        setDeleting(true);
        try { await ax.delete(`${API}/${vehicle.id}`); onConfirm(); }
        catch { alert('Delete failed'); } finally { setDeleting(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
            <motion.div initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ width: '90%', maxWidth: '420px', background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.6)', padding: '28px 24px', textAlign: 'center' }}>
                <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <AlertTriangle size={26} color="#f43f5e" />
                </div>

                {/* Step indicator */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
                    <div style={{ width: '28px', height: '4px', borderRadius: '2px', background: '#f43f5e' }} />
                    <div style={{ width: '28px', height: '4px', borderRadius: '2px', background: step === 2 ? '#f43f5e' : 'var(--border)' }} />
                </div>

                {step === 1 ? (
                    <>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>Delete Vehicle?</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                            <strong style={{ color: 'var(--text)' }}>{truckNo}</strong> ({vehicle.ownerName || 'No Owner'})
                        </div>
                        <div style={{ fontSize: '11px', color: '#f43f5e', marginBottom: '22px', fontWeight: 600 }}>
                            ⚠️ This will permanently remove this vehicle and all its data.
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button className="btn btn-g" onClick={onClose}>Cancel</button>
                            <button className="btn btn-d" onClick={() => setStep(2)}>
                                <AlertTriangle size={13} /> Yes, I want to delete
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#f43f5e', marginBottom: '8px' }}>⚠️ Final Confirmation</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                            Type <strong style={{ color: 'var(--text)', fontFamily: 'monospace', background: 'var(--bg-input)', padding: '2px 8px', borderRadius: '4px', letterSpacing: '1px' }}>{truckNo}</strong> to confirm deletion
                        </div>
                        <input
                            className="fi"
                            type="text"
                            placeholder={`Type ${truckNo} here...`}
                            value={confirmText}
                            onChange={e => setConfirmText(e.target.value)}
                            style={{ textAlign: 'center', fontSize: '16px', fontWeight: 700, letterSpacing: '1px', marginBottom: '16px', border: isMatch ? '2px solid #f43f5e' : '1px solid var(--border)' }}
                            autoFocus
                        />
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button className="btn btn-g" onClick={onClose}>Cancel</button>
                            <button
                                className="btn btn-d"
                                onClick={handleDelete}
                                disabled={!isMatch || deleting}
                                style={{ opacity: isMatch ? 1 : 0.4, cursor: isMatch ? 'pointer' : 'not-allowed' }}
                            >
                                {deleting ? 'Deleting...' : <><Trash2 size={13} /> Permanently Delete</>}
                            </button>
                        </div>
                    </>
                )}
            </motion.div>
        </div>
    );
}

export default function VehicleModule({ role = 'user', permissions = {} }) {
    const [vehicles, setVehicles] = useState([]);
    const [parties, setParties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // UI State
    const [tab, setTab] = useState('list'); 
    const [ownershipFilter, setOwnershipFilter] = useState('all'); 
    const [fSearch, setFSearch] = useState('');
    const [expandedOwners, setExpandedOwners] = useState({});
    const [profiles, setProfiles] = useState([]);
    const [loadingProfiles, setLoadingProfiles] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [maintenanceTarget, setMaintenanceTarget] = useState(null);
    
    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [vRes, pRes] = await Promise.all([
                ax.get(API),
                ax.get('/profiles')
            ]);
            setVehicles(vRes.data || []);
            setProfiles(pRes.data || []);
        } catch (error) {
            console.error("Failed to load data", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Form State
    const [form, setForm] = useState(getEmptyForm());
    const [editId, setEditId] = useState(null);
    const [isConfirmingSave, setIsConfirmingSave] = useState(false);
    const [err, setErr] = useState('');

    const checkExpiry = (dateStr) => {
        if (!dateStr) return null;
        const expiry = new Date(dateStr);
        const now = new Date();
        const diff = (expiry - now) / (1000 * 60 * 60 * 24);
        if (diff < 0) return 'expired';
        if (diff < 30) return 'near';
        return 'ok';
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            const [vRes, pRes, prRes] = await Promise.all([
                ax.get(API),
                ax.get('/parties').catch(() => ({ data: [] })),
                ax.get('/profiles').catch(() => ({ data: [] }))
            ]);
            setVehicles(vRes.data || []);
            setParties(pRes.data || []);
            setProfiles(prRes.data || []);
        } catch (error) {
            console.error("Failed to load data", error);
        } finally {
            setLoading(false);
        }
    };

    const isNearExpiry = (v) => {
        const d = parseJson(v.docs);
        return Object.values(d).some(date => checkExpiry(date) === 'near' || checkExpiry(date) === 'expired');
    };

    const getDocIcon = (type, date) => {
        const status = checkExpiry(date);
        if (!date) return null;
        const color = status === 'expired' ? 'var(--danger)' : status === 'near' ? '#f59e0b' : '#10b981';
        return (
            <div key={type} style={{ fontSize: '10px', color, display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-input)', padding: '2px 6px', borderRadius: '4px', border: `1px solid ${status === 'ok' ? 'var(--border)' : color}` }}>
                {status !== 'ok' && <AlertTriangle size={10} />}
                <span style={{ fontWeight: 800 }}>{type.toUpperCase()}:</span> {new Date(date).toLocaleDateString('en-IN')}
            </div>
        );
    };

    const handleEdit = (v) => {
        setForm({
            ...getEmptyForm(),
            ...v,
            bankDetails: v.bankDetails || getEmptyForm().bankDetails,
            emiDetails: v.emiDetails || getEmptyForm().emiDetails,
            docs: v.docs || getEmptyForm().docs
        });
        setEditId(v.id);
        setTab('add');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSaveRequest = (e) => {
        e.preventDefault();
        if (form.ownershipType === 'self') {
            form.ownerName = 'Vikas Transport (Self)';
        }
        if (!form.truckNo || !form.ownerName) { setErr('Truck Number and Owner Name are required'); return; }
        const duplicate = vehicles.find(v => v.id !== editId && cleanTruckNo(v.truckNo) === cleanTruckNo(form.truckNo));
        if (duplicate) { setErr(`Truck number ${cleanTruckNo(form.truckNo)} already exists`); return; }
        setErr('');
        setIsConfirmingSave(true);
    };

    const executeGPSDeduction = async () => {
        if (!window.confirm('Run monthly GPS deduction? (₹250 per device)')) return;
        try {
            const { data } = await ax.post(`${API}/deduct-gps`, {
                date: new Date().toISOString().slice(0, 10),
                remark: `Deducted on ${new Date().toLocaleDateString('en-IN')}`
            });
            alert(data.message);
        } catch (error) {
            alert(error.response?.data?.error || 'GPS Deduction failed');
        }
    };

    const executeSave = async () => {
        setSaving(true); setIsConfirmingSave(false);
        try {
            if (editId) {
                await ax.patch(`${API}/${editId}`, form);
            } else {
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
        // Try finding in Party Master first
        const party = parties.find(p => p.name === ownerName.toUpperCase());
        if (party) {
            setForm(f => ({
                ...f,
                ownerName: party.name,
                ownerId: party.id,
                ownerContact: f.ownerContact || party.phone || '',
                bankDetails: f.bankDetails || party.bankDetails || ''
            }));
            return;
        }

        // Fallback to existing vehicles logic
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

    const calculateEMI = (p, r, n) => {
        const principal = parseFloat(p) || 0;
        const rate = (parseFloat(r) || 0) / 12 / 100;
        const months = parseInt(n) || 0;
        if (!principal || !rate || !months) return 0;
        const emi = principal * rate * (Math.pow(1 + rate, months) / (Math.pow(1 + rate, months) - 1));
        return Math.round(emi);
    };

    const handleMarkPaid = async (v) => {
        if (!window.confirm('Mark current month EMI as paid/deducted?')) return;
        const d = parseJson(v.emiDetails);
        const paid = d.paidEmis || [];
        paid.push(new Date().toISOString().slice(0, 7)); // Save YYYY-MM
        d.paidEmis = [...new Set(paid)];
        try {
            await ax.patch(`${API}/${v.id}`, { emiDetails: JSON.stringify(d) });
            fetchData();
        } catch { alert('Update failed'); }
    };

    const calculateAge = (date) => {
        if (!date) return 'N/A';
        const start = new Date(date);
        const now = new Date();
        const diff = now.getFullYear() - start.getFullYear();
        return diff > 0 ? `${diff} Years` : 'New';
    };

    const handleSendAlerts = async () => {
        const email = "VIKASKUMAR909040@GMAIL.COM";
        
        try {
            // Trigger Backend Email Alert
            const res = await ax.get('/vehicles/alerts/report');
            if (res.data.success) {
                alert(`Alerts Processed! Email report sent to ${email} (Check your Inbox/Spam).`);
            } else {
                alert(`Email skip: ${res.data.message || 'No alerts to send today.'}`);
            }
        } catch (err) {
            console.error('Email trigger failed:', err);
            alert('Failed to send email alert. Check server connection.');
        }
    };

    const toggleToNew = () => {
        setForm(getEmptyForm());
        setEditId(null);
        setTab('add');
    };

    // Owners grouping
    const owners = useMemo(() => {
        const map = {};
        const lowerSearch = fSearch.toLowerCase();
        vehicles.forEach(v => {
            if (ownershipFilter !== 'all' && v.ownershipType !== ownershipFilter) return;
            const match = `${v.truckNo} ${v.ownerName} ${v.ownerContact} ${v.driverName} ${v.fastag} ${v.make} ${v.model}`.toLowerCase().includes(lowerSearch);
            if (fSearch && !match) return;

            const oName = v.ownerName || 'Unknown Owner';
            if (!map[oName]) map[oName] = { name: oName, vehicles: [], bankDetails: v.bankDetails || '', contact: v.ownerContact || '' };
            if (!map[oName].bankDetails && v.bankDetails) map[oName].bankDetails = v.bankDetails;
            map[oName].vehicles.push(v);
        });
        return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
    }, [vehicles, fSearch, ownershipFilter]);

    const uniqueOwners = [...new Set([...parties.filter(p => p.type === 'supplier' || p.type === 'transporter').map(p => p.name), ...vehicles.map(v => v.ownerName)])].filter(Boolean).sort();
    const uniqueTruckNos = [...new Set(vehicles.map(v => cleanTruckNo(v.truckNo)).filter(Boolean))].sort();

    return (
        <div>
            <AnimatePresence>
                {deleteTarget && <DeleteConfirm vehicle={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => { setDeleteTarget(null); fetchData(); }} />}
            </AnimatePresence>

            <AnimatePresence>
                {maintenanceTarget && <MaintenanceTracker truckNo={maintenanceTarget.truckNo} onClose={() => setMaintenanceTarget(null)} />}
            </AnimatePresence>

            <ConfirmSaveModal isOpen={isConfirmingSave} onClose={() => setIsConfirmingSave(false)} onConfirm={executeSave} title={editId ? "Update Vehicle" : "Add Vehicle"} message={`Save changes for ${form.truckNo}?`} isSaving={saving} />

            <div className="page-hd">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: 'var(--primary)', color: 'white', padding: '10px', borderRadius: '12px', boxShadow: '0 8px 16px var(--primary-glow)' }}><Truck size={24} /></div>
                    <div>
                        <h1>Fleet & Asset Management</h1>
                        <p>Detailed RC inventory, EMI tracking, and commercial documentation</p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className={`tab-btn${tab === 'list' ? ' tab-indigo' : ''}`} onClick={() => setTab('list')}><Briefcase size={14} /> Asset List</button>
                    <button className={`tab-btn${tab === 'add' ? ' tab-indigo' : ''}`} onClick={toggleToNew}>{editId ? <><Edit3 size={14} /> Update Record</> : <><Plus size={14} /> New Vehicle Profile</>}</button>
                </div>
                {tab === 'list' && (
                    <div className="tab-grp">
                        <button className="tab-btn tab-indigo" onClick={handleSendAlerts} style={{ marginRight: '10px', background: '#3b82f6', color: 'white' }}>
                            <FileText size={14} /> Send Email Alerts
                        </button>
                        <button className={`tab-btn${ownershipFilter === 'all' ? ' tab-indigo' : ''}`} onClick={() => setOwnershipFilter('all')}>All</button>
                        <button className={`tab-btn${ownershipFilter === 'self' ? ' tab-indigo' : ''}`} onClick={() => setOwnershipFilter('self')}>Self</button>
                        <button className={`tab-btn${ownershipFilter === 'market' ? ' tab-indigo' : ''}`} onClick={() => setOwnershipFilter('market')}>Market</button>
                    </div>
                )}
            </div>

            {tab === 'list' && ownershipFilter === 'self' && <VehicleVisualizer />}

            {tab === 'add' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card">
                    <form className="card-body" onSubmit={handleSaveRequest}>
                        <div className="fg fg-3">
                            <div className="field">
                                <label>Truck No. *</label>
                                <input className="fi" type="text" placeholder="RJXX-XXXX" value={form.truckNo} onChange={e => setForm({ ...form, truckNo: cleanTruckNo(e.target.value) })} required list="truck-list" />
                                <datalist id="truck-list">{uniqueTruckNos.map(no => <option key={no} value={no} />)}</datalist>
                            </div>
                            <div className="field">
                                <label>Make & Model</label>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <select className="fi" style={{ flex: 1 }} value={form.make} onChange={e => setForm({ ...form, make: e.target.value })}>
                                        <option value="Tata">Tata</option>
                                        <option value="Ashok Leyland">Ashok Leyland</option>
                                        <option value="BharatBenz">BharatBenz</option>
                                        <option value="Eicher">Eicher</option>
                                        <option value="Mahindra">Mahindra</option>
                                    </select>
                                    <input className="fi" style={{ flex: 1 }} type="text" placeholder="e.g. 3518, 4018" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} />
                                </div>
                            </div>
                            <div className="field">
                                <label>Type</label>
                                <select className="fi" value={form.vehicleType} onChange={e => setForm({ ...form, vehicleType: e.target.value })}>
                                    <option value="Trailer">Trailer</option>
                                    <option value="Dump Truck">Dump Truck</option>
                                    <option value="Canter">Canter</option>
                                </select>
                            </div>
                            <div className="field">
                                <label>Ownership</label>
                                <select className="fi" value={form.ownershipType} onChange={e => setForm({ ...form, ownershipType: e.target.value })}>
                                    <option value="market">Market Vehicle</option>
                                    <option value="self">Self Vehicle</option>
                                </select>
                            </div>
                        </div>

                        <div className="fg fg-3">
                            <div className="field">
                                <label>Gross Weight (KG)</label>
                                <input className="fi" type="number" placeholder="GVW" value={form.grossWeight} onChange={e => setForm({ ...form, grossWeight: e.target.value })} />
                            </div>
                            <div className="field">
                                <label>Unladen Weight (KG)</label>
                                <input className="fi" type="number" placeholder="Kerb weight" value={form.unladenWeight} onChange={e => setForm({ ...form, unladenWeight: e.target.value })} />
                            </div>
                            <div className="field">
                                <label>Payload (Calculated)</label>
                                <div className="fi" style={{ background: 'var(--bg-th)', color: 'var(--primary)', fontWeight: 800 }}>
                                    {Math.max(0, (parseFloat(form.grossWeight) || 0) - (parseFloat(form.unladenWeight) || 0))} KG
                                </div>
                            </div>
                        </div>

                        <div className="fg fg-3">
                            <div className="field">
                                <label>Registration Date (Age: {calculateAge(form.regDate)})</label>
                                <input className="fi" type="date" value={form.regDate} onChange={e => setForm({ ...form, regDate: e.target.value })} />
                            </div>
                            <div className="field">
                                <label>National Permit Expiry</label>
                                <input className="fi" type="date" value={form.nationalPermitDate} onChange={e => setForm({ ...form, nationalPermitDate: e.target.value })} />
                            </div>
                            <div className="field">
                                <label>Target Average (KM/L)</label>
                                <input className="fi" type="number" step="0.1" placeholder="e.g. 4.5" value={form.targetMileage} onChange={e => setForm({ ...form, targetMileage: e.target.value })} />
                            </div>
                        </div>
                        {form.ownershipType !== 'self' && (
                            <>
                                <hr className="sep" />
                                <h4 style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <User size={15} color="var(--primary)" /> Owner Information
                                </h4>

                                <div className="fg fg-2">
                                    <div className="field">
                                        <label>Owner Name * <span style={{ color: 'var(--text-muted)', fontWeight: 'normal', fontSize: '10px' }}>(Select from Party Master to sync bank info)</span></label>
                                        <input className="fi" type="text" placeholder="Name or Company" value={form.ownerName} onChange={e => autofillFromOwner(e.target.value)} required={form.ownershipType !== 'self'} list="owner-list" />
                                        <datalist id="owner-list">
                                            {uniqueOwners.map(o => {
                                                const isMaster = parties.some(p => p.name === o);
                                                return <option key={o} value={o}>{isMaster ? '⭐ (Master Data)' : ''}</option>;
                                            })}
                                        </datalist>
                                    </div>
                                    <div className="field">
                                        <label>Owner Contact</label>
                                        <input className="fi" type="text" placeholder="Phone number" value={form.ownerContact} onChange={e => setForm({ ...form, ownerContact: e.target.value })} />
                                    </div>
                                </div>

                        <div style={{ marginTop: '20px', padding: '20px', background: 'var(--bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                            <h4 style={{ fontSize: '13px', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={16} color="var(--primary)" /> RC & Document Numbers Registry</h4>
                            <div className="fg fg-3">
                                <div className="field">
                                    <label>RC Number</label>
                                    <input className="fi" type="text" value={parseJson(form.docNumbers).rcNo} onChange={e => { const d = parseJson(form.docNumbers); d.rcNo = e.target.value; setForm({ ...form, docNumbers: JSON.stringify(d) }); }} />
                                </div>
                                <div className="field">
                                    <label>Insurance Policy No.</label>
                                    <input className="fi" type="text" value={parseJson(form.docNumbers).insuranceNo} onChange={e => { const d = parseJson(form.docNumbers); d.insuranceNo = e.target.value; setForm({ ...form, docNumbers: JSON.stringify(d) }); }} />
                                </div>
                                <div className="field">
                                    <label>Permit Number</label>
                                    <input className="fi" type="text" value={parseJson(form.docNumbers).permitNo} onChange={e => { const d = parseJson(form.docNumbers); d.permitNo = e.target.value; setForm({ ...form, docNumbers: JSON.stringify(d) }); }} />
                                </div>
                            </div>
                            <div className="fg fg-3">
                                <div className="field">
                                    <label>Engine No.</label>
                                    <input className="fi" type="text" value={parseJson(form.rcDetails).engineNo} onChange={e => { const d = parseJson(form.rcDetails); d.engineNo = e.target.value; setForm({ ...form, rcDetails: JSON.stringify(d) }); }} />
                                </div>
                                <div className="field">
                                    <label>Chassis No.</label>
                                    <input className="fi" type="text" value={parseJson(form.rcDetails).chassisNo} onChange={e => { const d = parseJson(form.rcDetails); d.chassisNo = e.target.value; setForm({ ...form, rcDetails: JSON.stringify(d) }); }} />
                                </div>
                                <div className="field">
                                    <label>Fastag Serial</label>
                                    <input className="fi" type="text" value={form.fastag || ''} onChange={e => setForm({ ...form, fastag: e.target.value })} />
                                </div>
                            </div>
                        </div>

                        {form.ownershipType === 'self' && (
                            <div style={{ marginTop: '20px', padding: '20px', background: 'rgba(59,130,246,0.05)', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.1)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <h4 style={{ fontSize: '13px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Banknote size={16} color="#3b82f6" /> EMI Loan Calculator & Tracking</h4>
                                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#3b82f6', background: 'rgba(59,130,246,0.1)', padding: '4px 10px', borderRadius: '20px' }}>AUTO CALCULATE ENABLED</div>
                                </div>
                                <div className="fg fg-3">
                                    <div className="field"><label>Financing Bank</label><input className="fi" type="text" placeholder="e.g. HDFC, SBI" value={parseJson(form.emiDetails).bankName} onChange={e => { const d = parseJson(form.emiDetails); d.bankName = e.target.value; setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                    <div className="field"><label>Loan Number</label><input className="fi" type="text" value={parseJson(form.emiDetails).loanNo} onChange={e => { const d = parseJson(form.emiDetails); d.loanNo = e.target.value; setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                    <div className="field"><label>Interest Rate (%)</label><input className="fi" type="number" step="0.1" value={parseJson(form.emiDetails).interestRate} onChange={e => { const d = parseJson(form.emiDetails); d.interestRate = e.target.value; d.due = calculateEMI(d.total, e.target.value, d.tenure); setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                </div>
                                <div className="fg fg-3">
                                    <div className="field"><label>Total Loan Amount (P)</label><input className="fi" type="number" value={parseJson(form.emiDetails).total} onChange={e => { const d = parseJson(form.emiDetails); d.total = e.target.value; d.due = calculateEMI(e.target.value, d.interestRate, d.tenure); setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                    <div className="field"><label>Tenure (Months)</label><input className="fi" type="number" value={parseJson(form.emiDetails).tenure} onChange={e => { const d = parseJson(form.emiDetails); d.tenure = e.target.value; d.due = calculateEMI(d.total, d.interestRate, e.target.value); setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                    <div className="field"><label>Monthly EMI Amount</label><input className="fi" type="number" value={parseJson(form.emiDetails).due} onChange={e => { const d = parseJson(form.emiDetails); d.due = e.target.value; setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                </div>
                                <div className="fg fg-2">
                                    <div className="field"><label>Loan Start Date</label><input className="fi" type="date" value={parseJson(form.emiDetails).startDate} onChange={e => { const d = parseJson(form.emiDetails); d.startDate = e.target.value; setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                    <div className="field"><label>Current Pending Principal</label><input className="fi" type="number" value={parseJson(form.emiDetails).pending} onChange={e => { const d = parseJson(form.emiDetails); d.pending = e.target.value; setForm({ ...form, emiDetails: JSON.stringify(d) }); }} /></div>
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: '20px', padding: '20px', background: 'var(--bg)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                            <h4 style={{ fontSize: '13px', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={16} /> Virtual RC & Documents</h4>
                            <div className="fg fg-3">
                                {['rc', 'pollution', 'permit', 'insurance', 'fitness', 'tax'].map(doc => (
                                    <div className="field" key={doc}>
                                        <label>{doc.toUpperCase()} Expiry</label>
                                        <input className="fi" type="date" value={parseJson(form.docs)[doc]} onChange={e => { const d = parseJson(form.docs); d[doc] = e.target.value; setForm({ ...form, docs: JSON.stringify(d) }); }} />
                                    </div>
                                ))}
                            </div>
                            <div className="field" style={{ marginTop: '12px' }}><label>Fastag ID</label><input className="fi" type="text" value={form.fastag || ''} onChange={e => setForm({ ...form, fastag: e.target.value })} /></div>
                        </div>

                        <div className="fg fg-2" style={{ marginTop: '20px' }}>
                            {form.ownershipType !== 'self' && (
                                <div className="field">
                                    <label>Owner Name</label>
                                    <input className="fi" type="text" value={form.ownerName} onChange={e => autofillFromOwner(e.target.value)} list="owner-list" />
                                    <datalist id="owner-list">{uniqueOwners.map(o => <option key={o} value={o} />)}</datalist>
                                </div>
                            )}
                            <div className="field">
                                <label>Driver Name</label>
                                <select className="fi" value={form.driverName} onChange={e => { const p = profiles.find(x => x.name === e.target.value); setForm({ ...form, driverName: e.target.value, driverContact: p?.mobileNumbers?.[0] || '' }); }}>
                                    <option value="">Select Driver</option>
                                    {profiles.filter(p => p.type === 'Driver').map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                </select>
                            </div>
                        </div>

                        {err && <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '12px', fontWeight: 600 }}>{err}</div>}
                        <div style={{ marginTop: '24px', display: 'flex', gap: '10px' }}>
                            <button type="submit" className="btn btn-p" disabled={saving} style={{ flex: 1 }}>{saving ? 'Saving...' : 'Save Vehicle'}</button>
                            <button type="button" className="btn btn-g" onClick={() => setTab('list')}>Cancel</button>
                        </div>
                    </form>
                </motion.div>
            )}

            {tab === 'list' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="card" style={{ padding: '16px' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input className="fi" type="text" placeholder="Search vehicle or owner..." value={fSearch} onChange={e => setFSearch(e.target.value)} style={{ paddingLeft: '40px' }} />
                        </div>
                    </div>

                    {owners.map(owner => (
                        <div key={owner.name} className="card" style={{ overflow: 'hidden' }}>
                            <div onClick={() => toggleOwner(owner.name)} style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: expandedOwners[owner.name] ? 'var(--bg-th)' : 'transparent' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    {expandedOwners[owner.name] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                    <div>
                                        <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {owner.name}
                                            {owner.vehicles.some(v => isNearExpiry(v)) && <span style={{ background: 'var(--danger)', color: 'white', fontSize: '9px', padding: '2px 6px', borderRadius: '4px' }}>ALERT</span>}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{owner.vehicles.length} Vehicles • {owner.contact || 'No Contact'}</div>
                                    </div>
                                </div>
                                <div style={{ fontSize: '11px', fontWeight: 700, color: '#10b981' }}><CreditCard size={12} /> Bank Details Linked</div>
                            </div>
                            
                            <AnimatePresence>
                                {expandedOwners[owner.name] && (
                                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} style={{ overflow: 'hidden' }}>
                                        <div style={{ padding: '20px', borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                                            {owner.vehicles.map(v => (
                                                <div key={v.id} style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', background: isNearExpiry(v) ? 'rgba(239,68,68,0.02)' : 'var(--bg-card)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                                        <div>
                                                            <div style={{ fontWeight: 900, fontSize: '18px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '0.5px' }}>
                                                                <Truck size={18} style={{ color: '#3b82f6' }} /> {v.truckNo}
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '8px', marginTop: '4px', marginBottom: '8px' }}>
                                                                <span style={{ fontSize: '11px', fontWeight: 800, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '2px 8px', borderRadius: '4px' }}>{v.make}</span>
                                                                {v.model && <span style={{ fontSize: '11px', fontWeight: 800, background: 'var(--bg-th)', color: 'var(--text)', padding: '2px 8px', borderRadius: '4px' }}>{v.model}</span>}
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '10px' }}>
                                                                <span style={{ fontWeight: 700 }}>{v.ownershipType.toUpperCase()}</span>
                                                                <span>• Age: {calculateAge(v.regDate)}</span>
                                                                {v.grossWeight > 0 && <span>• {v.grossWeight.toLocaleString()} KG</span>}
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                            {v.ownershipType === 'self' && (
                                                                <button onClick={() => setMaintenanceTarget(v)} title="Maintenance" style={{ color: '#f59e0b', border: 'none', background: 'rgba(245,158,11,0.08)', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center' }}><Wrench size={14} /></button>
                                                            )}
                                                            <button onClick={() => handleEdit(v)} title="Edit" style={{ color: 'var(--primary)', border: 'none', background: 'rgba(59,130,246,0.08)', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center' }}><Edit3 size={14} /></button>
                                                            <button onClick={() => setDeleteTarget(v)} title="Delete" style={{ color: '#f43f5e', border: 'none', background: 'rgba(244,63,94,0.08)', cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center' }}><Trash2 size={14} /></button>
                                                        </div>
                                                    </div>
                                                    
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                                                        {Object.entries(parseJson(v.docs)).map(([k, d]) => getDocIcon(k, d))}
                                                        {v.nationalPermitDate && getDocIcon('National Permit', v.nationalPermitDate)}
                                                    </div>

                                                    {v.ownershipType === 'self' && parseJson(v.emiDetails).loanNo && (() => {
                                                        const emi = parseJson(v.emiDetails);
                                                        const paidCount = (emi.paidEmis || []).length;
                                                        const totalTenure = parseInt(emi.tenure) || 0;
                                                        const pendingEmis = totalTenure - paidCount;
                                                        return (
                                                            <div style={{ padding: '14px', background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.05))', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.15)', marginBottom: '12px' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                                    <div>
                                                                        <div style={{ fontWeight: 900, color: '#3b82f6', fontSize: '14px', letterSpacing: '0.5px' }}>🏦 {emi.bankName || 'BANK'}</div>
                                                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>Loan: {emi.loanNo}</div>
                                                                    </div>
                                                                    <button 
                                                                        onClick={() => handleMarkPaid(v)}
                                                                        style={{ fontSize: '10px', fontWeight: 800, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer' }}
                                                                    >
                                                                        Mark Paid
                                                                    </button>
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px', padding: '10px', background: 'rgba(59,130,246,0.06)', borderRadius: '10px' }}>
                                                                    <div style={{ textAlign: 'center' }}>
                                                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>MONTHLY EMI</div>
                                                                        <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.5px' }}>₹{parseFloat(emi.due).toLocaleString()}</div>
                                                                        {emi.dueDate && <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 700 }}>Due: {emi.dueDate}</div>}
                                                                    </div>
                                                                </div>
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '11px', textAlign: 'center' }}>
                                                                    <div style={{ padding: '6px', background: 'rgba(16,185,129,0.06)', borderRadius: '8px' }}><div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Paid</div><strong style={{ color: '#10b981', fontSize: '14px' }}>{paidCount}</strong></div>
                                                                    <div style={{ padding: '6px', background: 'rgba(239,68,68,0.06)', borderRadius: '8px' }}><div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Pending</div><strong style={{ color: '#ef4444', fontSize: '14px' }}>{pendingEmis}</strong></div>
                                                                    <div style={{ padding: '6px', background: 'rgba(59,130,246,0.06)', borderRadius: '8px' }}><div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Rate</div><strong style={{ color: '#3b82f6', fontSize: '14px' }}>{emi.interestRate}%</strong></div>
                                                                </div>
                                                                {emi.pending && (
                                                                    <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed rgba(59,130,246,0.2)', fontSize: '11px', color: 'var(--text-sub)', textAlign: 'center' }}>
                                                                        Outstanding: <strong style={{ fontSize: '14px', color: '#ef4444' }}>₹{parseFloat(emi.pending).toLocaleString()}</strong>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* RC Quick Info */}
                                                    {v.rcDetails && parseJson(v.rcDetails).engineNo && (
                                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                                            <div>E: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{parseJson(v.rcDetails).engineNo}</span></div>
                                                            <div>C: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{parseJson(v.rcDetails).chassisNo}</span></div>
                                                        </div>
                                                    )}

                                                    {/* Maintenance Quick Button */}
                                                    <button onClick={() => setMaintenanceTarget(v)} style={{ width: '100%', padding: '8px', background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.03))', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#f59e0b', marginBottom: '10px' }}>
                                                        <Wrench size={12} /> Open Maintenance Tracker
                                                    </button>

                                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', fontSize: '12px', display: 'flex', justifyContent: 'space-between', color: 'var(--text-sub)' }}>
                                                        <span><User size={12} /> {v.driverName || 'No Driver'}</span>
                                                        {v.fastag && <span><CreditCard size={12} /> {v.fastag}</span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
