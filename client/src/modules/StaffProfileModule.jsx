import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, Building2, User, Phone, MapPin, Banknote, Calendar, Shield, Truck, Settings } from 'lucide-react';
import ax from '../api';

const PUMP_BRANDS = ['Jio', 'Nayara', 'Indian Oil', 'HP', 'Bharat'];
const BRAND_LOGOS = {
    'Jio': 'https://upload.wikimedia.org/wikipedia/commons/5/50/Reliance_Jio_Logo.svg',
    'Nayara': 'https://nayaraenergy.com/assets/images/logo.png',
    'Indian Oil': 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8c/Indian_Oil_Logo.svg/1200px-Indian_Oil_Logo.svg.png',
    'HP': 'https://upload.wikimedia.org/wikipedia/en/thumb/3/30/Hindustan_Petroleum_Logo.svg/1200px-Hindustan_Petroleum_Logo.svg.png',
    'Bharat': 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c5/Bharat_Petroleum_Logo.svg/1200px-Bharat_Petroleum_Logo.svg.png'
};

const PROFILE_TYPES = ['Driver', 'Office Staff', 'Pump', 'Tyre', 'Manual'];
// Vendor-type profiles: no salary formula, no leaves
const VENDOR_TYPES = ['Pump', 'Tyre', 'Manual'];
const DEPARTMENTS = ['Office', 'Dump', 'Accountant', 'Electrician', 'Labour', 'Driver'];

const calculateMonthsAndDays = (joined, exit) => {
    if (!joined) return 'N/A';
    const start = new Date(joined);
    const end = exit ? new Date(exit) : new Date();
    if (isNaN(start.getTime())) return 'N/A';
    
    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    let days = end.getDate() - start.getDate();
    
    if (days < 0) {
        months--;
        const lastMonth = new Date(end.getFullYear(), end.getMonth(), 0);
        days += lastMonth.getDate();
    }
    
    if (months < 0) return 'Just joined';
    return `${months}m ${days}d`;
};

const StaffProfileModule = ({ role }) => {
    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [filterType, setFilterType] = useState('All');
    const [showLedger, setShowLedger] = useState(null);
    const [ledgerTimeFilter, setLedgerTimeFilter] = useState('all');
    const [showManualEntry, setShowManualEntry] = useState(false);
    const [manualEntry, setManualEntry] = useState({ date: new Date().toISOString().split('T')[0], desc: '', amount: '', type: 'debit' });
    const [payments, setPayments] = useState([]);
    const [allVouchers, setAllVouchers] = useState([]);
    const [allSales, setAllSales] = useState([]);


    const [form, setForm] = useState({
        type: 'Office Staff',
        department: 'Office',
        name: '',
        fatherName: '',
        address: '',
        bankDetails: [{ bankName: '', accountNo: '', ifsc: '' }],
        mobileNumbers: [''],
        // Driver specific
        vehicleNo: '',
        vehicleType: 'Trailer',
        dateJoined: '',
        dateExit: '',
        // Pump specific
        pumpOwnerName: '',
        pumpBrand: 'Indian Oil',
        pumpLocation: '',
        // Common
        fixedSalary: '',
        paidLeaveEntitlement: 12, // Paid leave days per year
        leaves: [],      // Unpaid leaves [{ start, end }]
        paidLeaves: [],  // Paid leaves   [{ start, end, reason }]
        description: ''  // Custom description for Manual types
    });

    useEffect(() => {
        fetchProfiles();
        fetchLedgerData();
    }, []);

    const fetchLedgerData = async () => {
        try {
            const [pRes, vDump, vJKL, vSuper, sDump, sJKL] = await Promise.all([
                ax.get('/payments'),
                ax.get('/vouchers/Dump').catch(()=>({data:[]})),
                ax.get('/vouchers/JK_Lakshmi').catch(()=>({data:[]})),
                ax.get('/vouchers/JK_Super').catch(()=>({data:[]})),
                ax.get('/sell?brand=dump').catch(()=>({data:[]})),
                ax.get('/sell?brand=jkl').catch(()=>({data:[]}))
            ]);
            setPayments(pRes.data || []);
            setAllVouchers([...(vDump.data||[]), ...(vJKL.data||[]), ...(vSuper.data||[])]);
            setAllSales([...(sDump.data||[]), ...(sJKL.data||[])]);
        } catch (e) { console.error("Ledger data fetch failed", e); }
    };

    const fetchProfiles = async () => {
        try {
            const { data } = await ax.get('/profiles');
            setProfiles(data);
        } catch (err) {
            console.error('Error fetching profiles', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...form,
                fixedSalary: parseFloat(form.fixedSalary) || 0
            };

            if (editingId) {
                await ax.put(`/profiles/${editingId}`, payload);
            } else {
                await ax.post('/profiles', payload);
            }
            setShowModal(false);
            fetchProfiles();
        } catch (err) {
            console.error('Error saving profile', err);
            alert('Failed to save profile');
        }
    };

    const handleManualEntry = async (e) => {
        e.preventDefault();
        try {
            // Save as a special category payment
            await ax.post('/payments', {
                profileId: showLedger.id,
                amount: manualEntry.amount,
                date: manualEntry.date,
                category: 'Manual Entry',
                remark: manualEntry.desc,
                mode: 'Manual'
            });
            setManualEntry({ date: new Date().toISOString().split('T')[0], desc: '', amount: '', type: 'debit' });
            setShowManualEntry(false);
            const pRes = await ax.get('/payments'); setPayments(pRes.data || []);
        } catch (err) { alert('Failed to save entry'); }
    };

    const getFilteredEntries = (entries) => {
        if (ledgerTimeFilter === 'all') return entries;
        const now = new Date();
        const cutoff = new Date();
        if (ledgerTimeFilter === 'month') cutoff.setMonth(now.getMonth() - 1);
        else if (ledgerTimeFilter === '6months') cutoff.setMonth(now.getMonth() - 6);
        return entries.filter(e => new Date(e.date) >= cutoff);
    };

    const isPump = (type) => type?.toLowerCase() === 'pump';

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this profile?')) return;
        try {
            await ax.delete(`/profiles/${id}`);
            fetchProfiles();
        } catch (err) {
            console.error('Error deleting profile', err);
            alert('Failed to delete profile');
        }
    };

    const resetForm = () => {
        setEditingId(null);
        setForm({
            type: 'Office Staff',
            department: 'Office',
            name: '',
            fatherName: '',
            address: '',
            bankDetails: [{ bankName: '', accountNo: '', ifsc: '' }],
            mobileNumbers: [''],
            vehicleNo: '',
            vehicleType: 'Trailer',
            fixedSalary: '',
            dateJoined: '',
            dateExit: '',
            pumpOwnerName: '',
            pumpBrand: 'Indian Oil',
            pumpLocation: '',
            paidLeaveEntitlement: 12,
            leaves: [],
            paidLeaves: []
        });
    };

    const openModal = (p = null) => {
        if (p) {
            setEditingId(p.id);
            setForm({
                type: p.type || 'Office Staff',
                department: p.department || 'Office',
                name: p.name || '',
                fatherName: p.fatherName || '',
                address: p.address || '',
                bankDetails: p.bankDetails && p.bankDetails.length ? p.bankDetails : [{ bankName: '', accountNo: '', ifsc: '' }],
                mobileNumbers: p.mobileNumbers && p.mobileNumbers.length ? p.mobileNumbers : [''],
                vehicleNo: p.vehicleNo || '',
                vehicleType: p.vehicleType || 'Trailer',
                fixedSalary: p.fixedSalary || '',
                dateJoined: p.dateJoined || '',
                dateExit: p.dateExit || '',
                pumpOwnerName: p.pumpOwnerName || '',
                pumpBrand: p.pumpBrand || 'Indian Oil',
                pumpLocation: p.pumpLocation || '',
                leaves: p.leaves || [],
                paidLeaves: p.paidLeaves || [],
                paidLeaveEntitlement: p.paidLeaveEntitlement ?? 12
            });
        } else {
            resetForm();
        }
        setShowModal(true);
    };

    // Calculate Accumulated Salary with Leave Deductions
    const calculateSalary = (joined, exit, fixedSalary, leaves = []) => {
        if (!joined || !fixedSalary) return 0;
        const start = new Date(joined);
        const end = exit ? new Date(exit) : new Date();
        if (isNaN(start.getTime()) || start > end) return 0;

        const diffTime = Math.abs(end - start);
        const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // Calculate leave days
        let leaveDays = 0;
        (leaves || []).forEach(l => {
            if (l.start && l.end) {
                const lStart = new Date(l.start);
                const lEnd = new Date(l.end);
                if (!isNaN(lStart.getTime()) && !isNaN(lEnd.getTime())) {
                    if (lStart <= end && lEnd >= start) {
                        const actualStart = lStart < start ? start : lStart;
                        const actualEnd = lEnd > end ? end : lEnd;
                        const lDiff = Math.abs(actualEnd - actualStart);
                        leaveDays += Math.ceil(lDiff / (1000 * 60 * 60 * 24)) + 1;
                    }
                }
            }
        });

        const workingDays = Math.max(0, totalDays - leaveDays);
        const perDaySalary = (parseFloat(fixedSalary) || 0) / 30;
        const result = Math.round(perDaySalary * workingDays);
        return isNaN(result) ? 0 : result;
    };

    const getLeaveDaysCount = (leaves = []) => {
        let count = 0;
        (leaves || []).forEach(l => {
            if (l.start && l.end) {
                const s = new Date(l.start);
                const e = new Date(l.end);
                if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
                    const diff = Math.abs(e - s);
                    count += Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
                }
            }
        });
        return count;
    };

    // Paid leave days used (separate — does NOT deduct from salary)
    const getPaidLeaveDaysCount = (paidLeaves = []) => getLeaveDaysCount(paidLeaves);

    // Entitlement per year based on dateJoined→exit period
    const getTotalPaidLeaveEntitlement = (entitlementPerYear, dateJoined, dateExit) => {
        if (!dateJoined || !entitlementPerYear) return entitlementPerYear || 12;
        const start = new Date(dateJoined);
        const end = dateExit ? new Date(dateExit) : new Date();
        if (isNaN(start.getTime())) return entitlementPerYear || 12;
        const months = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1);
        return Math.round((entitlementPerYear / 12) * months);
    };

    const filtered = profiles.filter(p => {
        if (filterType !== 'All' && p.type !== filterType) return false;
        const s = searchTerm.toLowerCase();
        return (p.name || '').toLowerCase().includes(s) || 
               (p.department || '').toLowerCase().includes(s) ||
               (p.mobileNumbers || []).join(' ').includes(s);
    });

    if (loading) return <div style={{ padding: '20px' }}>Loading Profiles...</div>;

    return (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto', color: 'var(--text)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 16px var(--primary-glow)' }}>
                        <User size={24} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>Profiles</h2>
                        <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Manage Drivers, Office Staff, and Labour</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <div className="search-bar" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 12px', width: '250px' }}>
                        <Search size={16} color="var(--text-muted)" />
                        <input
                            type="text"
                            placeholder="Search by name or mobile..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ border: 'none', background: 'transparent', color: 'var(--text)', padding: '10px', width: '100%', outline: 'none' }}
                        />
                    </div>
                    <select
                        value={filterType}
                        onChange={e => setFilterType(e.target.value)}
                        style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', outline: 'none' }}
                    >
                        <option value="All">All Types</option>
                        {PROFILE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {role === 'admin' && (
                        <button onClick={() => openModal()} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--primary)', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px var(--primary-glow)' }}>
                            <Plus size={18} /> Add Profile
                        </button>
                    )}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
                {filtered.map(p => (
                    <div key={p.id} style={{ background: 'var(--bg-card)', border: `1px solid var(--border)`, borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', position: 'relative' }}>
                        <div style={{ height: '4px', background: p.dateExit ? 'var(--danger)' : 'var(--success)', width: '100%' }} />
                        
                        <div style={{ padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                <div>
                                    <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 4px 0' }}>{p.type === 'Pump' ? p.name : p.name}</h3>
                                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {p.type === 'Driver' ? <Truck size={14} /> : p.type === 'Pump' ? <Building2 size={14} /> : <User size={14} />}
                                        {p.type} {p.type !== 'Pump' && `• ${p.department}`}
                                        {p.type === 'Pump' && p.pumpBrand && (
                                            <span style={{ marginLeft: '8px', padding: '2px 6px', background: 'var(--bg)', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{p.pumpBrand}</span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    {p.type === 'Pump' && BRAND_LOGOS[p.pumpBrand] && (
                                        <img src={BRAND_LOGOS[p.pumpBrand]} alt={p.pumpBrand} style={{ height: '24px', objectFit: 'contain' }} />
                                    )}
                                    {role === 'admin' && (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => setShowLedger(p)} style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', border: 'none', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="View Ledger"><Banknote size={16} /></button>
                                            <button onClick={() => openModal(p)} style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: 'none', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Edit2 size={16} /></button>
                                            <button onClick={() => handleDelete(p.id)} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={16} /></button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {p.type !== 'Pump' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                                        <Shield size={16} color="var(--text-muted)" />
                                        <span><span style={{ color: 'var(--text-muted)' }}>Father:</span> {p.fatherName || 'N/A'}</span>
                                    </div>
                                )}
                                {p.type === 'Pump' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                                        <User size={16} color="var(--text-muted)" />
                                        <span><span style={{ color: 'var(--text-muted)' }}>Owner:</span> {p.pumpOwnerName || 'N/A'}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px' }}>
                                    <MapPin size={16} color="var(--text-muted)" style={{ marginTop: '2px' }} />
                                    <span style={{ flex: 1 }}>{p.type === 'Pump' ? p.pumpLocation : p.address || 'N/A'}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                                    <Phone size={16} color="var(--text-muted)" />
                                    <span>{(p.mobileNumbers || []).join(', ') || 'N/A'}</span>
                                </div>
                                {p.type === 'Driver' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', background: 'var(--bg)', padding: '8px', borderRadius: '8px' }}>
                                        <Truck size={16} color="#f59e0b" />
                                        <span style={{ fontWeight: 700, color: '#f59e0b' }}>{p.vehicleNo || 'No Vehicle'}</span>
                                        {p.vehicleType && <span style={{ color: 'var(--text-muted)' }}>({p.vehicleType})</span>}
                                    </div>
                                )}
                            </div>

                            {p.type === 'Manual' && p.description && (
                                <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', background: 'rgba(0,0,0,0.03)', padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                    {p.description}
                                </div>
                            )}

                             {/* Salary / Total Paid block */}
                            {VENDOR_TYPES.includes(p.type) ? (
                                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px dashed var(--border)' }}>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Total {isPump(p.type) ? 'Transactions' : 'Paid to Vendor'}</div>
                                    <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Banknote size={16} />
                                        ₹{(payments || []).filter(pm => pm.profileId === p.id).reduce((s, pm) => s + parseFloat(pm.amount || 0), 0).toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{(payments || []).filter(pm => pm.profileId === p.id).length} transaction(s) recorded</div>
                                </div>
                            ) : (
                            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px dashed var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Salary Details</div>
                                    <div style={{ fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Banknote size={16} color="var(--success)" />
                                        ₹{p.fixedSalary?.toLocaleString() || 0} <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>/mo</span>
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Net Earned</div>
                                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary)' }}>
                                        ₹{calculateSalary(p.dateJoined, p.dateExit, p.fixedSalary, p.leaves).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                            )}

                            {/* Leave Badges — only for non-vendor types */}
                            {!VENDOR_TYPES.includes(p.type) && (p.leaves?.length > 0 || p.paidLeaves?.length > 0) && (
                                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {p.leaves && p.leaves.length > 0 && (
                                        <div style={{ fontSize: '11px', color: 'var(--danger)', fontWeight: 700, background: 'rgba(239,68,68,0.08)', padding: '4px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            ⚠️ {getLeaveDaysCount(p.leaves)}d unpaid (deducted)
                                        </div>
                                    )}
                                    {p.paidLeaves && p.paidLeaves.length > 0 && (() => {
                                        const used = getPaidLeaveDaysCount(p.paidLeaves);
                                        const entitled = getTotalPaidLeaveEntitlement(p.paidLeaveEntitlement ?? 12, p.dateJoined, p.dateExit);
                                        const over = used > entitled;
                                        return (
                                            <div style={{ fontSize: '11px', color: over ? 'var(--danger)' : 'var(--success)', fontWeight: 700, background: over ? 'rgba(244,63,94,0.08)' : 'rgba(16,185,129,0.08)', padding: '4px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                ✅ {used}/{entitled}d paid leave{over ? ' (over)' : ''}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            <div style={{ marginTop: '16px', background: 'var(--bg)', padding: '12px', borderRadius: '8px', fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Joined</div>
                                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={12} /> {p.dateJoined ? new Date(p.dateJoined).toLocaleDateString() : 'N/A'}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>{p.dateExit ? 'Exited' : 'Tenure'}</div>
                                    <div style={{ fontWeight: 600, color: p.dateExit ? 'var(--danger)' : 'var(--text)' }}>
                                        {p.dateExit ? new Date(p.dateExit).toLocaleDateString() : calculateMonthsAndDays(p.dateJoined, p.dateExit)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: '16px', border: '1px dashed var(--border)' }}>
                    <User size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                    <h3>No Profiles Found</h3>
                    <p>Click "Add Profile" to create a new staff record.</p>
                </div>
            )}

            {/* Profile Modal */}
            {showModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: 'var(--bg-card)', width: '100%', maxWidth: '800px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>{editingId ? 'Edit Profile' : 'New Profile'}</h2>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '24px', color: 'var(--text-muted)', cursor: 'pointer' }}>&times;</button>
                        </div>
                        
                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                            <form id="profileForm" onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Profile Type</label>
                                    <select value={form.type} onChange={e => {
                                        const type = e.target.value;
                                        setForm({...form, type, department: type === 'Driver' ? 'Driver' : form.department})
                                    }} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}>
                                        {PROFILE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>

                                {!VENDOR_TYPES.includes(form.type) && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Department</label>
                                    <select value={form.department} onChange={e => setForm({...form, department: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}>
                                        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                </div>
                                )}

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>{form.type === 'Pump' ? 'Pump Name' : 'Full Name'}</label>
                                    <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                                </div>

                                {form.type === 'Manual' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
                                        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Profile Description / Role</label>
                                        <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="e.g. Local Material Supplier" style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                                    </div>
                                )}

                                {!VENDOR_TYPES.includes(form.type) && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Father's Name</label>
                                        <input value={form.fatherName} onChange={e => setForm({...form, fatherName: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                                    </div>
                                )}

                                {form.type === 'Pump' && (
                                    <>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Pump Owner Name</label>
                                            <input value={form.pumpOwnerName} onChange={e => setForm({...form, pumpOwnerName: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Pump Brand</label>
                                            <select value={form.pumpBrand} onChange={e => setForm({...form, pumpBrand: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}>
                                                {PUMP_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Pump Location</label>
                                            <input value={form.pumpLocation} onChange={e => setForm({...form, pumpLocation: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                                        </div>
                                    </>
                                )}

                                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>{form.type === 'Pump' ? 'Pump Address' : 'Address'}</label>
                                    <textarea value={form.address} onChange={e => setForm({...form, address: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', minHeight: '60px', resize: 'vertical' }} />
                                </div>

                                {/* Mobile Numbers (Array) */}
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>Mobile Numbers</label>
                                    {form.mobileNumbers.map((num, i) => (
                                        <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                                            <input value={num} onChange={e => {
                                                const newNums = [...form.mobileNumbers];
                                                newNums[i] = e.target.value;
                                                setForm({...form, mobileNumbers: newNums});
                                            }} placeholder="Enter mobile number" style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                                            {i > 0 && <button type="button" onClick={() => {
                                                const newNums = form.mobileNumbers.filter((_, idx) => idx !== i);
                                                setForm({...form, mobileNumbers: newNums});
                                            }} style={{ background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '8px', padding: '0 12px', cursor: 'pointer' }}><Trash2 size={16} /></button>}
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => setForm({...form, mobileNumbers: [...form.mobileNumbers, '']})} style={{ fontSize: '13px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontWeight: 600 }}>+ Add Another Number</button>
                                </div>

                                {/* Bank Details (Array) */}
                                <div style={{ gridColumn: '1 / -1', background: 'rgba(0,0,0,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                    <label style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', display: 'block' }}>Bank Details</label>
                                    {form.bankDetails.map((bank, i) => (
                                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '10px', marginBottom: '12px', alignItems: 'end' }}>
                                            <div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Bank Name</div>
                                                <input value={bank.bankName} onChange={e => {
                                                    const newBanks = [...form.bankDetails];
                                                    newBanks[i].bankName = e.target.value;
                                                    setForm({...form, bankDetails: newBanks});
                                                }} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Account No</div>
                                                <input value={bank.accountNo} onChange={e => {
                                                    const newBanks = [...form.bankDetails];
                                                    newBanks[i].accountNo = e.target.value;
                                                    setForm({...form, bankDetails: newBanks});
                                                }} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>IFSC Code</div>
                                                <input value={bank.ifsc} onChange={e => {
                                                    const newBanks = [...form.bankDetails];
                                                    newBanks[i].ifsc = e.target.value;
                                                    setForm({...form, bankDetails: newBanks});
                                                }} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                                            </div>
                                            {i > 0 && <button type="button" onClick={() => {
                                                const newBanks = form.bankDetails.filter((_, idx) => idx !== i);
                                                setForm({...form, bankDetails: newBanks});
                                            }} style={{ background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '6px', height: '36px', width: '36px', display: 'flex', alignItems: 'center', justifyItems: 'center', cursor: 'pointer' }}><Trash2 size={16} style={{margin:'0 auto'}} /></button>}
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => setForm({...form, bankDetails: [...form.bankDetails, { bankName: '', accountNo: '', ifsc: '' }]})} style={{ fontSize: '13px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontWeight: 600 }}>+ Add Another Bank</button>
                                </div>

                                {/* Driver Specific Details */}
                                {form.type === 'Driver' && (
                                    <>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b' }}>Vehicle Number</label>
                                            <input required value={form.vehicleNo} onChange={e => setForm({...form, vehicleNo: e.target.value.toUpperCase()})} placeholder="HR 55 ..." style={{ padding: '10px', borderRadius: '8px', border: '1px solid #f59e0b', background: 'rgba(245, 158, 11, 0.05)', color: 'var(--text)', textTransform: 'uppercase' }} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <label style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b' }}>Vehicle Type</label>
                                            <select value={form.vehicleType} onChange={e => setForm({...form, vehicleType: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #f59e0b', background: 'rgba(245, 158, 11, 0.05)', color: 'var(--text)' }}>
                                                <option value="Trailer">Trailer</option>
                                                <option value="Canter">Canter</option>
                                            </select>
                                        </div>
                                    </>
                                )}

                                {!VENDOR_TYPES.includes(form.type) && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: form.type === 'Driver' ? '1 / -1' : 'auto' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--success)' }}>Fixed Monthly Salary (₹)</label>
                                    <input type="number" required min="0" step="0.01" value={form.fixedSalary} onChange={e => setForm({...form, fixedSalary: e.target.value})} placeholder="e.g. 20000" style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--success)', background: 'rgba(16, 185, 129, 0.05)', color: 'var(--text)', fontSize: '16px', fontWeight: 700 }} />
                                </div>
                                )}

                                {!VENDOR_TYPES.includes(form.type) && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Date of Joining</label>
                                    <input type="date" required value={form.dateJoined} onChange={e => setForm({...form, dateJoined: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                                </div>
                                )}

                                {!VENDOR_TYPES.includes(form.type) && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--danger)' }}>Date of Exit (Leave blank if active)</label>
                                    <input type="date" value={form.dateExit} onChange={e => setForm({...form, dateExit: e.target.value})} style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
                                </div>
                                )}

                                {!VENDOR_TYPES.includes(form.type) && (
                                <div style={{ gridColumn: '1 / -1', marginTop: '10px', padding: '16px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                                    <label style={{ fontSize: '14px', fontWeight: 700, color: 'var(--danger)', marginBottom: '12px', display: 'block' }}>Unpaid Leaves</label>
                                    {(form.leaves || []).map((leave, i) => (
                                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                                            <input type="date" value={leave.start} onChange={e => {
                                                const newLeaves = [...form.leaves];
                                                newLeaves[i].start = e.target.value;
                                                setForm({...form, leaves: newLeaves});
                                            }} className="fi" style={{ padding: '8px' }} />
                                            <input type="date" value={leave.end} onChange={e => {
                                                const newLeaves = [...form.leaves];
                                                newLeaves[i].end = e.target.value;
                                                setForm({...form, leaves: newLeaves});
                                            }} className="fi" style={{ padding: '8px' }} />
                                            <button type="button" onClick={() => {
                                                const newLeaves = form.leaves.filter((_, idx) => idx !== i);
                                                setForm({...form, leaves: newLeaves});
                                            }} style={{ background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '6px', padding: '8px' }}><Trash2 size={16} /></button>
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => setForm({...form, leaves: [...(form.leaves || []), { start: '', end: '' }]})} style={{ fontSize: '13px', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontWeight: 600 }}>+ Add Unpaid Leave Period</button>
                                </div>
                                )}

                                {!VENDOR_TYPES.includes(form.type) && (
                                <div style={{ gridColumn: '1 / -1', marginTop: '10px', padding: '16px', background: 'rgba(16,185,129,0.05)', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.15)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                                        <label style={{ fontSize: '14px', fontWeight: 700, color: 'var(--success)', margin: 0 }}>Paid Leaves</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Entitlement / Year:</span>
                                            <input
                                                type="number" min="0" max="365"
                                                value={form.paidLeaveEntitlement}
                                                onChange={e => setForm({...form, paidLeaveEntitlement: parseInt(e.target.value) || 0})}
                                                style={{ width: '70px', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.4)', background: 'var(--bg)', color: 'var(--text)', fontWeight: 700, textAlign: 'center' }}
                                            />
                                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>days</span>
                                        </div>
                                    </div>
                                    {(() => {
                                        const usedDays = getPaidLeaveDaysCount(form.paidLeaves);
                                        const totalEntitlement = getTotalPaidLeaveEntitlement(form.paidLeaveEntitlement, form.dateJoined, form.dateExit);
                                        const pct = totalEntitlement > 0 ? Math.min(100, Math.round((usedDays / totalEntitlement) * 100)) : 0;
                                        const overUsed = usedDays > totalEntitlement;
                                        return (
                                            <div style={{ marginBottom: '12px', padding: '10px 12px', background: 'var(--bg)', borderRadius: '8px', border: `1px solid ${overUsed ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.2)'}` }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px', fontWeight: 700 }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>Used: <span style={{ color: overUsed ? 'var(--danger)' : 'var(--success)' }}>{usedDays} days</span></span>
                                                    <span style={{ color: 'var(--text-muted)' }}>Entitled: <span style={{ color: 'var(--text)' }}>{totalEntitlement} days</span></span>
                                                </div>
                                                <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${pct}%`, background: overUsed ? 'var(--danger)' : 'var(--success)', borderRadius: '3px', transition: 'width 0.3s' }} />
                                                </div>
                                                {overUsed && <div style={{ fontSize: '10px', color: 'var(--danger)', marginTop: '4px', fontWeight: 700 }}>⚠ {usedDays - totalEntitlement} days over entitlement — consider converting to unpaid</div>}
                                            </div>
                                        );
                                    })()}
                                    {(form.paidLeaves || []).map((leave, i) => (
                                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr auto', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                                            <input type="date" value={leave.start} onChange={e => {
                                                const n = [...(form.paidLeaves||[])]; n[i] = {...n[i], start: e.target.value};
                                                setForm({...form, paidLeaves: n});
                                            }} className="fi" style={{ padding: '8px' }} />
                                            <input type="date" value={leave.end} onChange={e => {
                                                const n = [...(form.paidLeaves||[])]; n[i] = {...n[i], end: e.target.value};
                                                setForm({...form, paidLeaves: n});
                                            }} className="fi" style={{ padding: '8px' }} />
                                            <input type="text" value={leave.reason || ''} onChange={e => {
                                                const n = [...(form.paidLeaves||[])]; n[i] = {...n[i], reason: e.target.value};
                                                setForm({...form, paidLeaves: n});
                                            }} className="fi" style={{ padding: '8px' }} placeholder="Reason (optional)" />
                                            <button type="button" onClick={() => {
                                                const n = (form.paidLeaves||[]).filter((_, idx) => idx !== i);
                                                setForm({...form, paidLeaves: n});
                                            }} style={{ background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '6px', padding: '8px' }}><Trash2 size={16} /></button>
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => setForm({...form, paidLeaves: [...(form.paidLeaves || []), { start: '', end: '', reason: '' }]})} style={{ fontSize: '13px', color: 'var(--success)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontWeight: 600 }}>+ Add Paid Leave Period</button>
                                </div>
                                )}

                            </form>
                        </div>
                        
                        <div style={{ padding: '20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button type="button" onClick={() => setShowModal(false)} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button type="submit" form="profileForm" style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px var(--primary-glow)' }}>Save Profile</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Ledger Modal */}
            {showLedger && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: 'var(--bg-card)', width: '100%', maxWidth: '900px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--primary)', color: 'white' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>{showLedger.name}</h2>
                                    <div style={{ fontSize: '11px', opacity: 0.8 }}>{showLedger.type} Ledger</div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginLeft: '20px' }}>
                                    <select 
                                        value={ledgerTimeFilter} 
                                        onChange={e => setLedgerTimeFilter(e.target.value)}
                                        style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', fontWeight: 600, outline: 'none' }}
                                    >
                                        <option value="all" style={{ color: 'black' }}>All Time</option>
                                        <option value="month" style={{ color: 'black' }}>Last 30 Days</option>
                                        <option value="6months" style={{ color: 'black' }}>Last 6 Months</option>
                                    </select>
                                    <button 
                                        onClick={() => setShowManualEntry(true)}
                                        style={{ background: 'white', color: 'var(--primary)', border: 'none', borderRadius: '6px', padding: '4px 12px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        + Add Entry
                                    </button>
                                </div>
                            </div>
                            <button onClick={() => { setShowLedger(null); setLedgerTimeFilter('all'); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', width: '28px', height: '28px', borderRadius: '50%', color: 'white', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
                        </div>

                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                            {/* Summary Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                                {!VENDOR_TYPES.includes(showLedger.type) ? (
                                    <>
                                        <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Salary Earned</div>
                                            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)' }}>₹{calculateSalary(showLedger.dateJoined, showLedger.dateExit, showLedger.fixedSalary, showLedger.leaves).toLocaleString()}</div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>After {getLeaveDaysCount(showLedger.leaves||[])}d unpaid deduction</div>
                                        </div>
                                        <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payments Received</div>
                                            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--danger)' }}>
                                                ₹{payments.filter(p => p.profileId === showLedger.id).reduce((s, p) => s + parseFloat(p.amount || 0), 0).toLocaleString()}
                                            </div>
                                        </div>
                                        <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Balance</div>
                                            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--success)' }}>
                                                ₹{(calculateSalary(showLedger.dateJoined, showLedger.dateExit, showLedger.fixedSalary, showLedger.leaves) - payments.filter(p => p.profileId === showLedger.id).reduce((s, p) => s + parseFloat(p.amount || 0), 0)).toLocaleString()}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Purchases</div>
                                            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)' }}>
                                                ₹{allVouchers.filter(v => v.pump?.toLowerCase().trim() === showLedger.name?.toLowerCase().trim()).reduce((s, v) => s + (parseFloat(v.advanceDiesel) || 0), 0).toLocaleString()}
                                            </div>
                                        </div>
                                        {!isPump(showLedger.type) && (
                                            <>
                                                <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Material Sales</div>
                                                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#f59e0b' }}>
                                                        ₹{allSales.filter(s => s.customerName?.toLowerCase().trim() === showLedger.name?.toLowerCase().trim()).reduce((s, x) => s + (parseFloat(x.totalAmount) || 0), 0).toLocaleString()}
                                                    </div>
                                                </div>
                                                <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Payments (Paid)</div>
                                                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--danger)' }}>
                                                        ₹{payments.filter(p => p.profileId === showLedger.id).reduce((s, p) => s + parseFloat(p.amount || 0), 0).toLocaleString()}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                        <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Outstanding</div>
                                            {(() => {
                                                const bills = allVouchers.filter(v => v.pump?.toLowerCase().trim() === showLedger.name?.toLowerCase().trim()).reduce((s, v) => s + (parseFloat(v.advanceDiesel) || 0), 0);
                                                const sales = allSales.filter(s => s.customerName?.toLowerCase().trim() === showLedger.name?.toLowerCase().trim()).reduce((s, x) => s + (parseFloat(x.totalAmount) || 0), 0);
                                                const paid = payments.filter(p => p.profileId === showLedger.id).reduce((s, p) => s + parseFloat(p.amount || 0), 0);
                                                const bal = bills - sales - paid;
                                                return <div style={{ fontSize: '18px', fontWeight: 900, color: bal >= 0 ? 'var(--success)' : 'var(--danger)' }}>₹{bal.toLocaleString()}</div>;
                                            })()}
                                        </div>
                                    </>
                                )}
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
                                        <th style={{ padding: '12px' }}>Date</th>
                                        <th style={{ padding: '12px' }}>Description / Entry Details</th>
                                        <th style={{ padding: '12px', textAlign: 'right' }}>Credit</th>
                                        <th style={{ padding: '12px', textAlign: 'right' }}>Debit</th>
                                        <th style={{ padding: '12px', textAlign: 'right' }}>Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style={{ background: 'var(--bg)', fontStyle: 'italic' }}>
                                        <td style={{ padding: '12px' }}>{new Date(showLedger.dateJoined).toLocaleDateString()}</td>
                                        <td style={{ padding: '12px' }}>Opening Balance (Joining)</td>
                                        <td style={{ padding: '12px', textAlign: 'right' }}>—</td>
                                        <td style={{ padding: '12px', textAlign: 'right' }}>—</td>
                                        <td style={{ padding: '12px', textAlign: 'right' }}>₹0</td>
                                    </tr>
                                    {(() => {
                                        try {
                                            const entries = (() => {
                                                const list = [];
                                                const perDay = (parseFloat(showLedger.fixedSalary) || 0) / 30;

                                                // 1. Staff Salary Credits
                                                if (!VENDOR_TYPES.includes(showLedger.type)) {
                                                    const start = new Date(showLedger.dateJoined);
                                                    const end = showLedger.dateExit ? new Date(showLedger.dateExit) : new Date();
                                                    if (!isNaN(start.getTime())) {
                                                        let current = new Date(start.getFullYear(), start.getMonth(), 1);
                                                        let safety = 0;
                                                        while (current <= end && safety < 120) {
                                                            safety++;
                                                            const monthName = current.toLocaleString('default', { month: 'long', year: 'numeric' });
                                                            const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
                                                            const monthEnd   = new Date(current.getFullYear(), current.getMonth() + 1, 0);
                                                            const activeStart = monthStart < start ? start : monthStart;
                                                            const activeEnd   = monthEnd   > end   ? end   : monthEnd;
                                                            const daysInPeriod = Math.ceil(Math.abs(activeEnd - activeStart) / (1000 * 60 * 60 * 24)) + 1;

                                                            let leaveInMonth = 0;
                                                            (showLedger.leaves || []).forEach(l => {
                                                                if (l.start && l.end) {
                                                                    const lStart = new Date(l.start); const lEnd = new Date(l.end);
                                                                    if (!isNaN(lStart.getTime()) && !isNaN(lEnd.getTime())) {
                                                                        if (lStart <= activeEnd && lEnd >= activeStart) {
                                                                            const overlapStart = lStart < activeStart ? activeStart : lStart;
                                                                            const overlapEnd = lEnd > activeEnd ? activeEnd : lEnd;
                                                                            leaveInMonth += Math.ceil(Math.abs(overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
                                                                        }
                                                                    }
                                                                }
                                                            });

                                                            const billableDays = Math.max(0, daysInPeriod - leaveInMonth);
                                                            const netCredit = Math.round(perDay * billableDays);
                                                            list.push({ date: activeEnd, desc: `Salary — ${monthName} (${billableDays} working days)`, credit: netCredit, debit: 0, type: 'salary' });
                                                            current.setMonth(current.getMonth() + 1);
                                                        }
                                                    }
                                                }

                                                // 2. Vendor Purchases (Diesel from Vouchers)
                                                allVouchers.filter(v => v.pump?.toLowerCase().trim() === showLedger.name?.toLowerCase().trim()).forEach(v => {
                                                    const amt = parseFloat(v.advanceDiesel) || 0;
                                                    if (amt > 0) {
                                                        list.push({
                                                            date: new Date(v.date),
                                                            desc: `⛽ Diesel Purchase: ${v.truckNo} (Voucher #${v.lrNo})`,
                                                            credit: amt,
                                                            debit: 0,
                                                            type: 'purchase'
                                                        });
                                                    }
                                                });

                                                // 3. Vendor/Others Material Sales
                                                allSales.filter(s => s.customerName?.toLowerCase().trim() === showLedger.name?.toLowerCase().trim()).forEach(s => {
                                                    const amt = parseFloat(s.totalAmount) || 0;
                                                    if (amt > 0) {
                                                        list.push({
                                                            date: new Date(s.date),
                                                            desc: `🛒 Material Sale: ${s.material} (${s.quantity} Bags)`,
                                                            credit: 0,
                                                            debit: amt,
                                                            type: 'sell'
                                                        });
                                                    }
                                                });

                                                // 4. Payments
                                                (payments || []).filter(p => p.profileId === showLedger.id).forEach(p => {
                                                    list.push({
                                                        date: new Date(p.date),
                                                        desc: `💸 ${p.category}: ${p.remark || '—'}`,
                                                        credit: 0,
                                                        debit: parseFloat(p.amount || 0),
                                                        type: 'payment'
                                                    });
                                                });

                                                return getFilteredEntries(list.sort((a, b) => a.date - b.date));
                                            })();

                                            let runningBalance = 0;
                                            return entries.map((e, idx) => {
                                                runningBalance += (e.credit - e.debit);
                                                const isPayment = e.type === 'payment';
                                                const isPurchase = e.type === 'purchase';
                                                const isSell = e.type === 'sell';
                                                const rowBg = isPayment || isSell
                                                        ? 'rgba(239,68,68,0.03)'
                                                        : isPurchase
                                                            ? 'rgba(16,185,129,0.03)'
                                                            : 'transparent';
                                                return (
                                                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: rowBg }}>
                                                        <td style={{ padding: '10px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                                                            {e.date instanceof Date && !isNaN(e.date) ? e.date.toLocaleDateString('en-IN') : '—'}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', fontSize: '12px', color: (isPayment || isSell) ? 'var(--danger)' : isPurchase ? 'var(--success)' : 'var(--text)' }}>
                                                            {e.desc}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981', fontWeight: 700, fontSize: '13px' }}>
                                                            {e.credit > 0 ? `+₹${e.credit.toLocaleString()}` : '—'}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--danger)', fontWeight: 700, fontSize: '13px' }}>
                                                            {e.debit > 0 ? `-₹${e.debit.toLocaleString()}` : '—'}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, fontSize: '13px', color: runningBalance >= 0 ? 'var(--text)' : 'var(--danger)' }}>
                                                            ₹{runningBalance.toLocaleString()}
                                                        </td>
                                                    </tr>
                                                );
                                            });
                                        } catch (err) {
                                            console.error("Ledger calculation error:", err);
                                            return <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: 'var(--danger)' }}>Error calculating ledger: {err.message}</td></tr>;
                                        }
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Manual Entry Modal */}
            {showManualEntry && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '320px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800 }}>Add Ledger Entry</h3>
                        <form onSubmit={handleManualEntry}>
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>Date</label>
                                <input type="date" className="fi" value={manualEntry.date} onChange={e => setManualEntry({...manualEntry, date: e.target.value})} required />
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>Description</label>
                                <input type="text" className="fi" placeholder="e.g. Repair adjustment" value={manualEntry.desc} onChange={e => setManualEntry({...manualEntry, desc: e.target.value})} required />
                            </div>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>Amount</label>
                                <input type="number" className="fi" placeholder="0" value={manualEntry.amount} onChange={e => setManualEntry({...manualEntry, amount: e.target.value})} required />
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button type="button" onClick={() => setShowManualEntry(false)} className="btn btn-g" style={{ flex: 1 }}>Cancel</button>
                                <button type="submit" className="btn btn-p" style={{ flex: 1 }}>Add Entry</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StaffProfileModule;
