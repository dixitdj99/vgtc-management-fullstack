import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import ax from '../api';
import { cleanTruckNo } from '../utils/vehicleUtils';
import { Building2, Plus, Search, Phone, Edit3, Trash2, X as XIcon, Truck, MapPin, CreditCard, Users, Loader2, ChevronDown, ChevronUp, FileText, Calendar, AlertTriangle, ShieldCheck, DollarSign } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const fmtRs = n => 'Rs.' + Math.round(n || 0).toLocaleString('en-IN');
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const parseJson = (val, fallback = {}) => {
  if (typeof val === 'object' && val !== null) return val;
  try {
    const parsed = JSON.parse(val);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
  } catch {}
  return fallback || {};
};

const getDocStatus = (dateStr) => {
  if (!dateStr) return { status: 'missing', label: 'Missing', color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' };
  const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return { status: 'expired', label: 'Expired', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' };
  if (diff <= 30) return { status: 'due_soon', label: `${Math.ceil(diff)}d left`, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' };
  return { status: 'valid', label: 'Valid', color: '#10b981', bg: 'rgba(16,185,129,0.1)' };
};

const EMPTY_FORM = {
  name: '', phone: '', altPhone: '', address: '', pan: '', aadhaar: '',
  bankName: '', accountNo: '', ifsc: '', vehicles: [], rateCards: [], notes: '', isActive: true
};

const EMPTY_VEHICLE_FORM = {
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
  docs: JSON.stringify({ rc: '', pollution: '', permit: '', insurance: '', fitness: '', tax: '' }),
  fastag: '',
  targetMileage: 0
};

export default function VendorModule() {
  const { user } = useAuth();
  const [vendors, setVendors] = useState([]);
  const [allVehicles, setAllVehicles] = useState([]);
  const [allVouchers, setAllVouchers] = useState([]);
  const [allTolls, setAllTolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Vendor Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [vehicleInput, setVehicleInput] = useState('');
  const [rateInput, setRateInput] = useState({ route: '', ratePerMT: '', ratePerTrip: '', notes: '' });

  // Market Vehicle Add / Edit Modal State
  const [isVehModalOpen, setIsVehModalOpen] = useState(false);
  const [editingVehId, setEditingVehId] = useState(null);
  const [vehFormData, setVehFormData] = useState({ ...EMPTY_VEHICLE_FORM });
  const [targetVendorForVeh, setTargetVendorForVeh] = useState(null);
  const [vehSaving, setVehSaving] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [vRes, vehRes, vocRes, tollRes] = await Promise.all([
        ax.get('/vendors'),
        ax.get('/vehicles'),
        ax.get('/vouchers').catch(() => ({ data: [] })),
        ax.get('/tolls').catch(() => ({ data: [] }))
      ]);
      setVendors(vRes.data || []);
      setAllVehicles(vehRes.data || []);
      setAllVouchers(vocRes.data || []);
      setAllTolls(tollRes.data || []);
    } catch { setError('Failed to load vendor data.'); }
    finally { setLoading(false); }
  };

  // Compute truck balance map
  const truckBalanceMap = useMemo(() => {
    const map = {};
    (allVouchers || []).forEach(voucher => {
      const truck = cleanTruckNo(voucher.truckNo);
      if (!truck) return;
      if (!map[truck]) map[truck] = { net: 0, paid: 0, toll: 0, tripCount: 0 };
      map[truck].tripCount++;
      const gross = voucher.deliveries?.length > 0
        ? voucher.deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0), 0)
        : (parseFloat(voucher.weight) || 0) * (parseFloat(voucher.rate) || 0);
      const diesel = voucher.advanceDiesel === 'FULL' ? 4000 : (parseFloat(voucher.advanceDiesel) || 0);
      const cash = parseFloat(voucher.advanceCash) || 0;
      const online = parseFloat(voucher.advanceOnline) || 0;
      const weight = parseFloat(voucher.weight) || 0;
      const munshi = parseFloat(voucher.munshi) || (weight > 0 ? (weight < 18 ? 50 : 100) : 0);
      const commission = parseFloat(voucher.commission) || 0;
      const shortage = parseFloat(voucher.shortage) || 0;
      const tyres = (parseFloat(voucher.tyrePuncture) || 0) + (parseFloat(voucher.tyreGreasingAir) || 0) + (parseFloat(voucher.tyreGreasing) || 0) + (parseFloat(voucher.tyreAir) || 0) + (parseFloat(voucher.extraCash) || 0);
      const net = gross - diesel - cash - online - munshi - commission - shortage - tyres;
      map[truck].net += net;
      map[truck].paid += parseFloat(voucher.paidBalance) || 0;
    });

    (allTolls || []).forEach(t => {
      const truck = cleanTruckNo(t.truckNo);
      if (!truck) return;
      if (!map[truck]) map[truck] = { net: 0, paid: 0, toll: 0, tripCount: 0 };
      map[truck].toll = (map[truck].toll || 0) + (parseFloat(t.amount) || 0);
    });

    Object.keys(map).forEach(t => {
      const r = map[t];
      r.outstanding = Math.max(0, r.net - (r.toll || 0) - r.paid);
    });
    return map;
  }, [allVouchers, allTolls]);

  // Map of vehicles indexed by cleaned truckNo
  const vehicleMap = useMemo(() => {
    const map = {};
    allVehicles.forEach(v => {
      const t = cleanTruckNo(v.truckNo);
      if (t) map[t] = v;
    });
    return map;
  }, [allVehicles]);

  const openModal = (vendor = null) => {
    if (vendor) {
      setEditingId(vendor.id);
      setFormData({ ...EMPTY_FORM, ...vendor });
    } else {
      setEditingId(null);
      setFormData({ ...EMPTY_FORM });
    }
    setError('');
    setVehicleInput('');
    setRateInput({ route: '', ratePerMT: '', ratePerTrip: '', notes: '' });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true); setError('');
      if (editingId) {
        await ax.patch(`/vendors/${editingId}`, formData);
      } else {
        await ax.post('/vendors', formData);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err) { setError(err.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this vendor?')) return;
    try {
      await ax.delete(`/vendors/${id}`);
      fetchData();
    } catch { setError('Delete failed'); }
  };

  const addVehicleToForm = () => {
    const v = cleanTruckNo(vehicleInput);
    if (!v) return;
    if (formData.vehicles.includes(v)) return;
    setFormData(f => ({ ...f, vehicles: [...f.vehicles, v] }));
    setVehicleInput('');
  };

  const removeVehicleFromForm = (v) => {
    setFormData(f => ({ ...f, vehicles: f.vehicles.filter(x => x !== v) }));
  };

  const addRate = () => {
    if (!rateInput.route.trim()) return;
    setFormData(f => ({ ...f, rateCards: [...f.rateCards, { ...rateInput, ratePerMT: Number(rateInput.ratePerMT) || 0, ratePerTrip: Number(rateInput.ratePerTrip) || 0 }] }));
    setRateInput({ route: '', ratePerMT: '', ratePerTrip: '', notes: '' });
  };

  const removeRate = (i) => {
    setFormData(f => ({ ...f, rateCards: f.rateCards.filter((_, idx) => idx !== i) }));
  };

  // Add / Edit Market Vehicle
  const openVehModal = (vendor, existingVeh = null) => {
    setTargetVendorForVeh(vendor);
    if (existingVeh) {
      setEditingVehId(existingVeh.id);
      setVehFormData({ ...EMPTY_VEHICLE_FORM, ...existingVeh, ownershipType: 'market' });
    } else {
      setEditingVehId(null);
      setVehFormData({ ...EMPTY_VEHICLE_FORM, ownerName: vendor.name, ownerContact: vendor.phone, ownershipType: 'market' });
    }
    setIsVehModalOpen(true);
  };

  const handleVehSubmit = async (e) => {
    e.preventDefault();
    try {
      setVehSaving(true);
      const cleanedNo = cleanTruckNo(vehFormData.truckNo);
      const payload = { ...vehFormData, truckNo: cleanedNo, ownershipType: 'market' };
      
      let savedVeh;
      if (editingVehId) {
        const res = await ax.patch(`/vehicles/${editingVehId}`, payload);
        savedVeh = res.data;
      } else {
        const res = await ax.post('/vehicles', payload);
        savedVeh = res.data;
      }

      // Also ensure truckNo is in vendor's vehicles array
      if (targetVendorForVeh && cleanedNo) {
        const currentVehs = targetVendorForVeh.vehicles || [];
        if (!currentVehs.includes(cleanedNo)) {
          await ax.patch(`/vendors/${targetVendorForVeh.id}`, {
            vehicles: [...currentVehs, cleanedNo]
          });
        }
      }

      setIsVehModalOpen(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save market vehicle');
    } finally {
      setVehSaving(false);
    }
  };

  const filtered = vendors.filter(v => {
    const q = searchTerm.toLowerCase();
    return !q || v.name?.toLowerCase().includes(q) || v.phone?.includes(q) || (v.vehicles || []).some(veh => veh.toLowerCase().includes(q));
  });

  const activeCount = vendors.filter(v => v.isActive !== false).length;
  const totalMarketVehicles = useMemo(() => {
    const vendorTrucks = new Set(vendors.flatMap(v => v.vehicles || []));
    const marketInDb = allVehicles.filter(v => v.ownershipType === 'market').map(v => cleanTruckNo(v.truckNo));
    return new Set([...vendorTrucks, ...marketInDb]).size;
  }, [vendors, allVehicles]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '12px', color: 'var(--text-muted)' }}>
      <Loader2 size={20} className="spin" /> Loading market vehicle vendors...
    </div>
  );

  return (
    <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>Market Vehicle Vendors</h1>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>Manage market truck owners, assigned vehicles, specifications, document expirations, and rate cards.</p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Total Market Vendors', value: vendors.length, color: '#6366f1', icon: <Building2 size={16} /> },
          { label: 'Active Vendors', value: activeCount, color: '#10b981', icon: <Users size={16} /> },
          { label: 'Market Vehicles Tracked', value: totalMarketVehicles, color: '#f59e0b', icon: <Truck size={16} /> },
        ].map((kpi, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: `${kpi.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: kpi.color }}>{kpi.icon}</div>
            <div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: kpi.color }}>{kpi.value}</div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="fi" placeholder="Search vendor name, phone, or truck number..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '36px', width: '100%' }} />
        </div>
        <button className="btn btn-p" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', fontWeight: 800 }} onClick={() => openModal()}>
          <Plus size={16} /> Register New Vendor
        </button>
      </div>

      {/* Vendor List */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
          <Building2 size={48} style={{ opacity: 0.2, marginBottom: '12px' }} />
          <div style={{ fontSize: '14px', fontWeight: 700 }}>{searchTerm ? 'No vendors match your search' : 'No vendors registered yet'}</div>
          <div style={{ fontSize: '12px', marginTop: '4px' }}>Click "Register New Vendor" to add a market vehicle supplier.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map(v => {
            const vendorTruckNos = (v.vehicles || []).map(cleanTruckNo);
            return (
              <div key={v.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', transition: 'box-shadow 0.2s' }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: v.isActive !== false ? 'rgba(16,185,129,0.1)' : 'rgba(156,163,175,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: v.isActive !== false ? '#10b981' : '#9ca3af', fontWeight: 900, fontSize: '16px' }}>
                    {v.name?.charAt(0) || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {v.name}
                      {v.isActive === false && <span style={{ fontSize: '9px', background: '#fee2e2', color: '#dc2626', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>INACTIVE</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '14px', marginTop: '3px', flexWrap: 'wrap' }}>
                      {v.phone && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Phone size={11} /> {v.phone}</span>}
                      {v.address && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={11} /> {v.address}</span>}
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b', fontWeight: 700 }}><Truck size={11} /> {vendorTruckNos.length} Market Vehicles</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button className="btn" onClick={e => { e.stopPropagation(); openVehModal(v); }} style={{ padding: '6px 12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b', borderRadius: '8px', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Plus size={13} /> Add Vehicle
                    </button>
                    <button className="btn" onClick={e => { e.stopPropagation(); openModal(v); }} style={{ padding: '6px 10px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#6366f1', borderRadius: '8px' }} title="Edit Vendor">
                      <Edit3 size={13} />
                    </button>
                    <button className="btn" onClick={e => { e.stopPropagation(); handleDelete(v.id); }} style={{ padding: '6px 10px', background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.2)', color: '#f43f5e', borderRadius: '8px' }} title="Delete Vendor">
                      <Trash2 size={13} />
                    </button>
                    {expandedId === v.id ? <ChevronUp size={18} color="var(--text-muted)" /> : <ChevronDown size={18} color="var(--text-muted)" />}
                  </div>
                </div>

                {/* Expanded detail */}
                <AnimatePresence>
                  {expandedId === v.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                      <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)' }}>
                        
                        {/* Vendor Basic & Bank Info */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '16px', padding: '14px', background: 'var(--bg-th)', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '12px' }}>
                          <div><span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>PAN:</span> <strong style={{ color: 'var(--text)' }}>{v.pan || '—'}</strong></div>
                          <div><span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Aadhaar:</span> <strong style={{ color: 'var(--text)' }}>{v.aadhaar || '—'}</strong></div>
                          <div><span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Alt Phone:</span> <strong style={{ color: 'var(--text)' }}>{v.altPhone || '—'}</strong></div>
                          <div><span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Bank:</span> <strong style={{ color: 'var(--text)' }}>{v.bankName || '—'}</strong></div>
                          <div><span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Account No:</span> <strong style={{ color: 'var(--text)' }}>{v.accountNo || '—'}</strong></div>
                          <div><span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>IFSC:</span> <strong style={{ color: 'var(--text)' }}>{v.ifsc || '—'}</strong></div>
                        </div>

                        {/* Market Vehicles Full Details Section */}
                        <div style={{ marginTop: '18px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Truck size={14} /> Market Fleet & Vehicle Details ({vendorTruckNos.length})
                            </div>
                            <button onClick={() => openVehModal(v)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '11px', fontWeight: 800 }}>
                              + Register Vehicle Specs
                            </button>
                          </div>

                          {vendorTruckNos.length === 0 ? (
                            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', background: 'var(--bg-input)', borderRadius: '10px' }}>
                              No market vehicles assigned to this vendor. Click "+ Register Vehicle Specs" to add.
                            </div>
                          ) : (
                            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                  <tr style={{ background: 'var(--bg-th)', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Truck No</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Make / Type</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Driver Details</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Permit & Insurance Expiry</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Voucher Trips</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Outstanding Bal</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {vendorTruckNos.map(truckNo => {
                                    const veh = vehicleMap[truckNo] || {};
                                    const docs = parseJson(veh.docs);
                                    const permitStatus = getDocStatus(docs.permit || veh.nationalPermitDate);
                                    const insuranceStatus = getDocStatus(docs.insurance);
                                    const tb = truckBalanceMap[truckNo] || { tripCount: 0, outstanding: 0 };

                                    return (
                                      <tr key={truckNo} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '10px 12px', fontWeight: 900, color: 'var(--primary)' }}>
                                          {truckNo}
                                        </td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                                          {veh.make || 'Tata'} {veh.model ? `(${veh.model})` : ''} • {veh.vehicleType || 'Trailer'}
                                        </td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text)' }}>
                                          <div style={{ fontWeight: 700 }}>{veh.driverName || 'Unassigned'}</div>
                                          {veh.driverContact && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{veh.driverContact}</div>}
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: permitStatus.bg, color: permitStatus.color, fontWeight: 700 }}>
                                              Permit: {permitStatus.label}
                                            </span>
                                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: insuranceStatus.bg, color: insuranceStatus.color, fontWeight: 700 }}>
                                              Ins: {insuranceStatus.label}
                                            </span>
                                          </div>
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                                          {tb.tripCount} Trips
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, color: tb.outstanding > 0 ? '#ef4444' : '#10b981' }}>
                                          {fmtRs(tb.outstanding)}
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                          <button onClick={() => openVehModal(v, veh.id ? veh : { truckNo })}
                                            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: 700, color: 'var(--primary)' }}>
                                            {veh.id ? 'Edit Details' : 'Add Specs'}
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Rate Cards */}
                        {(v.rateCards || []).length > 0 && (
                          <div style={{ marginTop: '18px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <CreditCard size={14} /> Rate Cards
                            </div>
                            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                  <tr style={{ background: 'var(--bg-th)', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Route</th>
                                    <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>₹/MT</th>
                                    <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>₹/Trip</th>
                                    <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Notes</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {v.rateCards.map((r, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                      <td style={{ padding: '8px 12px', fontWeight: 700 }}>{r.route}</td>
                                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981', fontWeight: 800 }}>{r.ratePerMT ? `₹${r.ratePerMT}` : '—'}</td>
                                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#6366f1', fontWeight: 800 }}>{r.ratePerTrip ? `₹${r.ratePerTrip}` : '—'}</td>
                                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{r.notes || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {v.notes && (
                          <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>📝 {v.notes}</div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal — Add / Edit Vendor */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '640px', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>{editingId ? 'Edit Market Vendor' : 'Register New Market Vendor'}</h3>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><XIcon size={18} /></button>
              </div>
              <form onSubmit={handleSubmit} style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                <div className="fg fg-2" style={{ gap: '14px' }}>
                  {/* Basic Info */}
                  <div className="field-h" style={{ gridColumn: '1 / -1' }}>
                    <label>Vendor / Owner Name *</label>
                    <input className="fi" required value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="e.g. RAJESH KUMAR" />
                  </div>
                  <div className="field-h">
                    <label>Phone *</label>
                    <input className="fi" value={formData.phone} onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))} placeholder="9876543210" />
                  </div>
                  <div className="field-h">
                    <label>Alt Phone</label>
                    <input className="fi" value={formData.altPhone} onChange={e => setFormData(f => ({ ...f, altPhone: e.target.value }))} placeholder="Optional" />
                  </div>
                  <div className="field-h" style={{ gridColumn: '1 / -1' }}>
                    <label>Address</label>
                    <input className="fi" value={formData.address} onChange={e => setFormData(f => ({ ...f, address: e.target.value }))} placeholder="Village / City / District" />
                  </div>
                  <div className="field-h">
                    <label>PAN</label>
                    <input className="fi" value={formData.pan} onChange={e => setFormData(f => ({ ...f, pan: e.target.value }))} placeholder="ABCDE1234F" />
                  </div>
                  <div className="field-h">
                    <label>Aadhaar</label>
                    <input className="fi" value={formData.aadhaar} onChange={e => setFormData(f => ({ ...f, aadhaar: e.target.value }))} placeholder="1234 5678 9012" />
                  </div>

                  {/* Bank */}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <CreditCard size={14} color="#6366f1" />
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bank Details</span>
                  </div>
                  <div className="field-h" style={{ gridColumn: '1 / -1' }}>
                    <label>Bank Name</label>
                    <input className="fi" value={formData.bankName} onChange={e => setFormData(f => ({ ...f, bankName: e.target.value }))} placeholder="e.g. State Bank of India" />
                  </div>
                  <div className="field-h">
                    <label>Account No.</label>
                    <input className="fi" value={formData.accountNo} onChange={e => setFormData(f => ({ ...f, accountNo: e.target.value }))} />
                  </div>
                  <div className="field-h">
                    <label>IFSC Code</label>
                    <input className="fi" value={formData.ifsc} onChange={e => setFormData(f => ({ ...f, ifsc: e.target.value }))} placeholder="SBIN0001234" />
                  </div>

                  {/* Vehicles */}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <Truck size={14} color="#f59e0b" />
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Assigned Market Vehicles</span>
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
                    <input className="fi" style={{ flex: 1 }} value={vehicleInput} onChange={e => setVehicleInput(e.target.value)} placeholder="Enter truck no. e.g. HR47B4010"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVehicleToForm(); } }} />
                    <button type="button" className="btn btn-p" onClick={addVehicleToForm} style={{ padding: '8px 16px', fontWeight: 800 }}>Add</button>
                  </div>
                  {formData.vehicles.length > 0 && (
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {formData.vehicles.map(v => (
                        <span key={v} style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {v}
                          <XIcon size={12} style={{ cursor: 'pointer', opacity: 0.6 }} onClick={() => removeVehicleFromForm(v)} />
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Rate Cards */}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <CreditCard size={14} color="#10b981" />
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rate Cards</span>
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 80px 80px auto', gap: '6px', alignItems: 'end' }}>
                    <input className="fi" value={rateInput.route} onChange={e => setRateInput(r => ({ ...r, route: e.target.value }))} placeholder="Route" />
                    <input className="fi" type="number" value={rateInput.ratePerMT} onChange={e => setRateInput(r => ({ ...r, ratePerMT: e.target.value }))} placeholder="₹/MT" />
                    <input className="fi" type="number" value={rateInput.ratePerTrip} onChange={e => setRateInput(r => ({ ...r, ratePerTrip: e.target.value }))} placeholder="₹/Trip" />
                    <button type="button" className="btn btn-g" onClick={addRate} style={{ padding: '8px 12px', fontWeight: 800 }}>+</button>
                  </div>
                  {formData.rateCards.length > 0 && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      {formData.rateCards.map((r, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', background: 'var(--bg-input)', borderRadius: '6px', marginBottom: '4px', fontSize: '12px' }}>
                          <span style={{ flex: 1, fontWeight: 700 }}>{r.route}</span>
                          {r.ratePerMT > 0 && <span style={{ color: '#10b981', fontWeight: 800 }}>₹{r.ratePerMT}/MT</span>}
                          {r.ratePerTrip > 0 && <span style={{ color: '#6366f1', fontWeight: 800 }}>₹{r.ratePerTrip}/Trip</span>}
                          <XIcon size={12} style={{ cursor: 'pointer', color: '#f43f5e' }} onClick={() => removeRate(i)} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Notes + Status */}
                  <div className="field-h" style={{ gridColumn: '1 / -1' }}>
                    <label>Notes</label>
                    <textarea className="fi" rows={2} value={formData.notes} onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))} placeholder="Any remarks..." />
                  </div>
                  <div className="field-h">
                    <label>Status</label>
                    <select className="fi" value={formData.isActive ? 'active' : 'inactive'} onChange={e => setFormData(f => ({ ...f, isActive: e.target.value === 'active' }))}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  {error && <div style={{ gridColumn: '1 / -1', color: 'var(--danger)', fontSize: '12px', fontWeight: 700 }}>{error}</div>}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                    <button type="button" className="btn" style={{ border: '1px solid var(--border)', background: 'transparent' }} onClick={() => setIsModalOpen(false)}>Cancel</button>
                    <button type="submit" className="btn btn-g" style={{ fontWeight: 800 }} disabled={saving}>{saving ? 'Saving...' : (editingId ? 'Update Vendor' : 'Register Vendor')}</button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal — Add / Edit Market Vehicle Details */}
      <AnimatePresence>
        {isVehModalOpen && (
          <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '680px', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>
                  {editingVehId ? `Edit Market Vehicle Specs — ${vehFormData.truckNo}` : `Register Market Vehicle for ${targetVendorForVeh?.name}`}
                </h3>
                <button type="button" onClick={() => setIsVehModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><XIcon size={18} /></button>
              </div>

              <form onSubmit={handleVehSubmit} style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div className="field-h">
                    <label style={{ fontSize: '11px', fontWeight: 700 }}>Truck No. *</label>
                    <input className="fi" required value={vehFormData.truckNo} onChange={e => setVehFormData(f => ({ ...f, truckNo: cleanTruckNo(e.target.value) }))} placeholder="e.g. HR47B4010" />
                  </div>
                  <div className="field-h">
                    <label style={{ fontSize: '11px', fontWeight: 700 }}>Make & Model</label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <select className="fi" style={{ flex: 1 }} value={vehFormData.make} onChange={e => setVehFormData(f => ({ ...f, make: e.target.value }))}>
                        <option value="Tata">Tata</option>
                        <option value="Ashok Leyland">Ashok Leyland</option>
                        <option value="BharatBenz">BharatBenz</option>
                        <option value="Eicher">Eicher</option>
                        <option value="Mahindra">Mahindra</option>
                      </select>
                      <input className="fi" style={{ flex: 1 }} placeholder="Model" value={vehFormData.model} onChange={e => setVehFormData(f => ({ ...f, model: e.target.value }))} />
                    </div>
                  </div>
                  <div className="field-h">
                    <label style={{ fontSize: '11px', fontWeight: 700 }}>Type</label>
                    <select className="fi" value={vehFormData.vehicleType} onChange={e => setVehFormData(f => ({ ...f, vehicleType: e.target.value }))}>
                      <option value="Trailer">Trailer</option>
                      <option value="Dump Truck">Dump Truck</option>
                      <option value="Canter">Canter</option>
                    </select>
                  </div>

                  <div className="field-h">
                    <label style={{ fontSize: '11px', fontWeight: 700 }}>Driver Name</label>
                    <input className="fi" value={vehFormData.driverName} onChange={e => setVehFormData(f => ({ ...f, driverName: e.target.value }))} placeholder="Driver name" />
                  </div>
                  <div className="field-h">
                    <label style={{ fontSize: '11px', fontWeight: 700 }}>Driver Contact</label>
                    <input className="fi" value={vehFormData.driverContact} onChange={e => setVehFormData(f => ({ ...f, driverContact: e.target.value }))} placeholder="Mobile number" />
                  </div>
                  <div className="field-h">
                    <label style={{ fontSize: '11px', fontWeight: 700 }}>National Permit Expiry</label>
                    <input className="fi" type="date" value={vehFormData.nationalPermitDate} onChange={e => setVehFormData(f => ({ ...f, nationalPermitDate: e.target.value }))} />
                  </div>

                  {/* Documents Expiration Dates */}
                  {(() => {
                    const docs = parseJson(vehFormData.docs);
                    const updateDoc = (key, val) => {
                      const updated = { ...docs, [key]: val };
                      setVehFormData(f => ({ ...f, docs: JSON.stringify(updated) }));
                    };
                    return (
                      <>
                        <div style={{ gridColumn: '1 / -1', marginTop: '10px', fontSize: '11px', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          📄 Document Expiry Dates
                        </div>
                        <div className="field-h">
                          <label style={{ fontSize: '11px', fontWeight: 700 }}>RC Expiry</label>
                          <input className="fi" type="date" value={docs.rc || ''} onChange={e => updateDoc('rc', e.target.value)} />
                        </div>
                        <div className="field-h">
                          <label style={{ fontSize: '11px', fontWeight: 700 }}>Insurance Expiry</label>
                          <input className="fi" type="date" value={docs.insurance || ''} onChange={e => updateDoc('insurance', e.target.value)} />
                        </div>
                        <div className="field-h">
                          <label style={{ fontSize: '11px', fontWeight: 700 }}>Pollution Expiry</label>
                          <input className="fi" type="date" value={docs.pollution || ''} onChange={e => updateDoc('pollution', e.target.value)} />
                        </div>
                        <div className="field-h">
                          <label style={{ fontSize: '11px', fontWeight: 700 }}>Fitness Expiry</label>
                          <input className="fi" type="date" value={docs.fitness || ''} onChange={e => updateDoc('fitness', e.target.value)} />
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="btn" style={{ border: '1px solid var(--border)', background: 'transparent' }} onClick={() => setIsVehModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-g" style={{ fontWeight: 800 }} disabled={vehSaving}>
                    {vehSaving ? 'Saving...' : 'Save Vehicle Specs'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
