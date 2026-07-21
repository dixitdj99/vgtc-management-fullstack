import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import ax from '../api';
import { cleanTruckNo } from '../utils/vehicleUtils';
import { Truck, Plus, Search, Phone, Edit3, Trash2, X as XIcon, CreditCard, Users, Loader2, ChevronDown, ChevronUp, FileText, Calendar, AlertTriangle, ShieldCheck, DollarSign, Compass, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const fmtRs = n => 'Rs. ' + Math.round(n || 0).toLocaleString('en-IN');
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
  if (!dateStr) return { status: 'missing', label: 'Missing', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' };
  const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return { status: 'expired', label: 'Expired', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' };
  if (diff <= 30) return { status: 'due_soon', label: `${Math.ceil(diff)}d left`, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' };
  return { status: 'valid', label: 'Valid', color: '#10b981', bg: 'rgba(16,185,129,0.1)' };
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
  const [vehicles, setVehicles] = useState([]);
  const [allVouchers, setAllVouchers] = useState([]);
  const [allTolls, setAllTolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filtering & Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [docFilter, setDocFilter] = useState('all'); // all, expired_missing, valid
  const [gpsFilter, setGpsFilter] = useState('all'); // all, none, jkl, js, both
  const [typeFilter, setTypeFilter] = useState('all'); // all, Trailer, Canter, Dump Truck
  
  // Expanded card state
  const [expandedId, setExpandedId] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_VEHICLE_FORM });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const [vehRes, vocRes, tollRes] = await Promise.all([
        ax.get('/vehicles'),
        ax.get('/vouchers').catch(() => ({ data: [] })),
        ax.get('/tolls').catch(() => ({ data: [] }))
      ]);
      
      // Filter out self-owned fleet vehicles, keeping only market vehicles
      const marketVehicles = (vehRes.data || []).filter(v => v.ownershipType !== 'self');
      setVehicles(marketVehicles);
      setAllVouchers(vocRes.data || []);
      setAllTolls(tollRes.data || []);
    } catch (err) {
      setError('Failed to load fleet data. Please check connection.');
    } finally {
      setLoading(false);
    }
  };

  // Compute truck balance map (trips and outstanding calculations)
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

  // Main list filtering
  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      // 1. Search filter
      const q = searchTerm.toLowerCase();
      const matchSearch = !q || 
        (v.truckNo || '').toLowerCase().includes(q) || 
        (v.ownerName || '').toLowerCase().includes(q) || 
        (v.driverName || '').toLowerCase().includes(q);

      if (!matchSearch) return false;

      // 2. GPS filter
      if (gpsFilter !== 'all') {
        if (v.gpsType !== gpsFilter) return false;
      }

      // 3. Vehicle type filter
      if (typeFilter !== 'all') {
        if (v.vehicleType !== typeFilter) return false;
      }

      // 4. Document Status filter
      if (docFilter !== 'all') {
        const docs = parseJson(v.docs);
        const permitStatus = getDocStatus(docs.permit || v.nationalPermitDate);
        const insuranceStatus = getDocStatus(docs.insurance);
        const fitnessStatus = getDocStatus(docs.fitness);
        const pollutionStatus = getDocStatus(docs.pollution);
        
        const hasExpiredOrMissing = 
          permitStatus.status === 'expired' || permitStatus.status === 'missing' ||
          insuranceStatus.status === 'expired' || insuranceStatus.status === 'missing' ||
          fitnessStatus.status === 'expired' || fitnessStatus.status === 'missing' ||
          pollutionStatus.status === 'expired' || pollutionStatus.status === 'missing';

        if (docFilter === 'expired_missing' && !hasExpiredOrMissing) return false;
        if (docFilter === 'valid' && hasExpiredOrMissing) return false;
      }

      return true;
    });
  }, [vehicles, searchTerm, docFilter, gpsFilter, typeFilter]);

  // KPI Calculations
  const stats = useMemo(() => {
    let totalOutstanding = 0;
    let activeFleetCount = 0;
    let expiredDocsCount = 0;

    vehicles.forEach(v => {
      const truck = cleanTruckNo(v.truckNo);
      const bal = truckBalanceMap[truck];
      if (bal) {
        totalOutstanding += bal.outstanding || 0;
        if (bal.tripCount > 0) activeFleetCount++;
      }

      // Check document expirations
      const docs = parseJson(v.docs);
      const permitStatus = getDocStatus(docs.permit || v.nationalPermitDate);
      const insuranceStatus = getDocStatus(docs.insurance);
      const fitnessStatus = getDocStatus(docs.fitness);
      const pollutionStatus = getDocStatus(docs.pollution);

      if (
        permitStatus.status === 'expired' || permitStatus.status === 'missing' ||
        insuranceStatus.status === 'expired' || insuranceStatus.status === 'missing' ||
        fitnessStatus.status === 'expired' || fitnessStatus.status === 'missing' ||
        pollutionStatus.status === 'expired' || pollutionStatus.status === 'missing'
      ) {
        expiredDocsCount++;
      }
    });

    return {
      total: vehicles.length,
      active: activeFleetCount,
      expired: expiredDocsCount,
      outstanding: totalOutstanding
    };
  }, [vehicles, truckBalanceMap]);

  // Open Add/Edit Modal
  const openModal = (veh = null) => {
    if (veh) {
      setEditingId(veh.id);
      // Pre-fill form, ensuring nested JSON objects are preserved as strings
      const rcDetailsStr = typeof veh.rcDetails === 'object' ? JSON.stringify(veh.rcDetails) : (veh.rcDetails || JSON.stringify({ engineNo: '', chassisNo: '', fitnessNo: '' }));
      const docNumbersStr = typeof veh.docNumbers === 'object' ? JSON.stringify(veh.docNumbers) : (veh.docNumbers || JSON.stringify({ rcNo: '', insuranceNo: '', pollutionNo: '', permitNo: '', fitnessNo: '', taxNo: '' }));
      const bankDetailsStr = typeof veh.bankDetails === 'object' ? JSON.stringify(veh.bankDetails) : (veh.bankDetails || JSON.stringify({ name: '', bank: '', account: '', ifsc: '' }));
      const docsStr = typeof veh.docs === 'object' ? JSON.stringify(veh.docs) : (veh.docs || JSON.stringify({ rc: '', pollution: '', permit: '', insurance: '', fitness: '', tax: '' }));

      setFormData({
        ...EMPTY_VEHICLE_FORM,
        ...veh,
        rcDetails: rcDetailsStr,
        docNumbers: docNumbersStr,
        bankDetails: bankDetailsStr,
        docs: docsStr,
        ownershipType: 'market'
      });
    } else {
      setEditingId(null);
      setFormData({ ...EMPTY_VEHICLE_FORM });
    }
    setError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError('');
      const cleanedNo = cleanTruckNo(formData.truckNo);
      if (!cleanedNo) throw new Error('Valid truck number is required.');

      const payload = { 
        ...formData, 
        truckNo: cleanedNo, 
        ownershipType: 'market' 
      };

      if (editingId) {
        await ax.patch(`/vehicles/${editingId}`, payload);
      } else {
        await ax.post('/vehicles', payload);
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to save vehicle details');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, truckNo) => {
    if (!window.confirm(`Are you sure you want to delete vehicle ${truckNo}?`)) return;
    try {
      await ax.delete(`/vehicles/${id}`);
      fetchData();
    } catch {
      alert('Failed to delete vehicle.');
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '12px', color: 'var(--text-muted)' }}>
      <Loader2 size={20} className="spin" /> Loading market vehicle registry...
    </div>
  );

  return (
    <div style={{ padding: '24px', maxWidth: '1300px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>Market Fleet & Vehicles</h1>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>Monitor third-party/market vehicles, document expirations, drivers, trip logs, and outstanding balances.</p>
        </div>
        <button className="btn btn-p" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', fontWeight: 800 }} onClick={() => openModal()}>
          <Plus size={16} /> Register Market Vehicle
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Market Vehicles', value: stats.total, color: '#f59e0b', icon: <Truck size={16} /> },
          { label: 'Active In Trips', value: stats.active, color: '#10b981', icon: <Compass size={16} /> },
          { label: 'Expired/Missing Docs', value: stats.expired, color: '#ef4444', icon: <AlertTriangle size={16} /> },
          { label: 'Outstanding Balance', value: fmtRs(stats.outstanding), color: '#6366f1', icon: <DollarSign size={16} /> },
        ].map((kpi, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: `${kpi.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: kpi.color }}>{kpi.icon}</div>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text)' }}>{kpi.value}</div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar / Filters */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ flex: 1, minWidth: '260px', position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="fi" placeholder="Search truck no, owner name, driver name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '36px', width: '100%' }} />
          </div>

          {/* Vehicle Type Filter */}
          <div style={{ width: '150px' }}>
            <select className="fi" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="all">All Vehicle Types</option>
              <option value="Trailer">Trailer</option>
              <option value="Canter">Canter</option>
              <option value="Dump Truck">Dump Truck</option>
            </select>
          </div>

          {/* GPS Type Filter */}
          <div style={{ width: '150px' }}>
            <select className="fi" value={gpsFilter} onChange={e => setGpsFilter(e.target.value)}>
              <option value="all">All GPS Setups</option>
              <option value="none">No GPS</option>
              <option value="jkl">JK Lakshmi GPS</option>
              <option value="js">JK Super GPS</option>
              <option value="both">Both GPS</option>
            </select>
          </div>

          {/* Document Status Filter */}
          <div style={{ width: '170px' }}>
            <select className="fi" value={docFilter} onChange={e => setDocFilter(e.target.value)}>
              <option value="all">All Document Statuses</option>
              <option value="expired_missing">Expired / Missing Docs</option>
              <option value="valid">All Valid Docs</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      {filteredVehicles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border)' }}>
          <Truck size={48} style={{ opacity: 0.2, marginBottom: '12px' }} />
          <div style={{ fontSize: '14px', fontWeight: 700 }}>No vehicles match your filters</div>
          <div style={{ fontSize: '12px', marginTop: '4px' }}>Try resetting the search query or drop-down filters.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredVehicles.map(v => {
            const cleanNo = cleanTruckNo(v.truckNo);
            const bal = truckBalanceMap[cleanNo] || { tripCount: 0, outstanding: 0 };
            
            const docs = parseJson(v.docs);
            const permitStatus = getDocStatus(docs.permit || v.nationalPermitDate);
            const insuranceStatus = getDocStatus(docs.insurance);
            const fitnessStatus = getDocStatus(docs.fitness);
            const pollutionStatus = getDocStatus(docs.pollution);
            
            const isExpanded = expandedId === v.id;

            return (
              <div key={v.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', transition: 'all 0.2s' }}>
                
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : v.id)}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(245,158,11,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                    <Truck size={20} />
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: '16px', color: 'var(--text)' }}>{v.truckNo}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{v.make} • {v.vehicleType}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Owner/Supplier</div>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>{v.ownerName || '—'}</div>
                      {v.ownerContact && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{v.ownerContact}</div>}
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Driver</div>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)', marginTop: '2px' }}>{v.driverName || 'Unassigned'}</div>
                      {v.driverContact && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{v.driverContact}</div>}
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Docs Alert</div>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                        <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', fontWeight: 800, background: permitStatus.bg, color: permitStatus.color }} title={`Permit: ${permitStatus.label}`}>P</span>
                        <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', fontWeight: 800, background: insuranceStatus.bg, color: insuranceStatus.color }} title={`Insurance: ${insuranceStatus.label}`}>I</span>
                        <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', fontWeight: 800, background: fitnessStatus.bg, color: fitnessStatus.color }} title={`Fitness: ${fitnessStatus.label}`}>F</span>
                        <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', fontWeight: 800, background: pollutionStatus.bg, color: pollutionStatus.color }} title={`Pollution: ${pollutionStatus.label}`}>O</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Trips & Balance</div>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)', marginTop: '2px' }}>{bal.tripCount} Trips</div>
                      <div style={{ fontWeight: 900, fontSize: '12px', color: bal.outstanding > 0 ? '#ef4444' : '#10b981' }}>{fmtRs(bal.outstanding)}</div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={e => e.stopPropagation()}>
                    <button className="btn" onClick={() => openModal(v)} style={{ padding: '7px 11px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#6366f1', borderRadius: '8px' }} title="Edit Specs">
                      <Edit3 size={13} />
                    </button>
                    <button className="btn" onClick={() => handleDelete(v.id, v.truckNo)} style={{ padding: '7px 11px', background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.2)', color: '#f43f5e', borderRadius: '8px' }} title="Delete Vehicle">
                      <Trash2 size={13} />
                    </button>
                    <button className="btn" onClick={() => setExpandedId(isExpanded ? null : v.id)} style={{ padding: '7px', background: 'transparent' }}>
                      {isExpanded ? <ChevronUp size={18} color="var(--text-muted)" /> : <ChevronDown size={18} color="var(--text-muted)" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                      <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-th)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginTop: '16px' }}>
                          
                          {/* Left Column: Bank Details & Metadata */}
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <CreditCard size={13} /> Bank Transfer Settings
                            </div>
                            {(() => {
                              const bank = parseJson(v.bankDetails);
                              return (
                                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <div><span style={{ color: 'var(--text-muted)' }}>A/C Name:</span> <strong style={{ color: 'var(--text)' }}>{bank.name || '—'}</strong></div>
                                  <div><span style={{ color: 'var(--text-muted)' }}>Bank Name:</span> <strong style={{ color: 'var(--text)' }}>{bank.bank || '—'}</strong></div>
                                  <div><span style={{ color: 'var(--text-muted)' }}>Account No:</span> <strong style={{ color: 'var(--text)' }}>{bank.account || '—'}</strong></div>
                                  <div><span style={{ color: 'var(--text-muted)' }}>IFSC Code:</span> <strong style={{ color: 'var(--text)' }}>{bank.ifsc || '—'}</strong></div>
                                </div>
                              );
                            })()}

                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Layers size={13} /> Fleet Metadata
                            </div>
                            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <div><span style={{ color: 'var(--text-muted)' }}>Gross Weight:</span> <strong style={{ color: 'var(--text)' }}>{v.grossWeight ? `${v.grossWeight} MT` : '—'}</strong></div>
                              <div><span style={{ color: 'var(--text-muted)' }}>Unladen Weight:</span> <strong style={{ color: 'var(--text)' }}>{v.unladenWeight ? `${v.unladenWeight} MT` : '—'}</strong></div>
                              <div><span style={{ color: 'var(--text-muted)' }}>Registration Date:</span> <strong style={{ color: 'var(--text)' }}>{fmtDate(v.regDate)}</strong></div>
                              <div><span style={{ color: 'var(--text-muted)' }}>Target Mileage:</span> <strong style={{ color: 'var(--text)' }}>{v.targetMileage ? `${v.targetMileage} km/l` : '—'}</strong></div>
                              <div><span style={{ color: 'var(--text-muted)' }}>Fastag ID:</span> <strong style={{ color: 'var(--text)' }}>{v.fastag || '—'}</strong></div>
                              <div><span style={{ color: 'var(--text-muted)' }}>GPS Setup:</span> <strong style={{ color: 'var(--text)', textTransform: 'uppercase' }}>{v.gpsType || 'none'}</strong></div>
                            </div>
                          </div>

                          {/* Right Column: Detailed Document Statuses */}
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <FileText size={13} /> Document Expirations
                            </div>
                            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {[
                                { name: 'National Permit', val: docs.permit || v.nationalPermitDate },
                                { name: 'Insurance Coverage', val: docs.insurance },
                                { name: 'Fitness Certificate', val: docs.fitness },
                                { name: 'Pollution Control (PUC)', val: docs.pollution },
                                { name: 'Road Registration (RC)', val: docs.rc },
                                { name: 'Road Tax Payment', val: docs.tax }
                              ].map((doc, idx) => {
                                const st = getDocStatus(doc.val);
                                return (
                                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                                    <div>
                                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{doc.name}</span>
                                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Expiry: {fmtDate(doc.val)}</div>
                                    </div>
                                    <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '6px', fontWeight: 800, background: st.bg, color: st.color }}>
                                      {st.label}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal — Add / Edit Market Vehicle Details */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '680px', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
              
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>
                  {editingId ? `Edit Market Vehicle Specifications — ${formData.truckNo}` : 'Register New Market Vehicle'}
                </h3>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><XIcon size={18} /></button>
              </div>

              <form onSubmit={handleSubmit} style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                <div className="fg fg-3">
                  
                  {/* Basic Specifications */}
                  <div style={{ gridColumn: '1 / -1', marginBottom: '4px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🚛 Vehicle Specifications
                    </div>
                  </div>

                  <div className="field">
                    <label>Truck Number *</label>
                    <input className="fi" required disabled={!!editingId} value={formData.truckNo} onChange={e => setFormData(f => ({ ...f, truckNo: cleanTruckNo(e.target.value) }))} placeholder="e.g. HR47B4010" />
                  </div>

                  <div className="field">
                    <label>Make & Model</label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <select className="fi" style={{ flex: 1 }} value={formData.make} onChange={e => setFormData(f => ({ ...f, make: e.target.value }))}>
                        <option value="Tata">Tata</option>
                        <option value="Ashok Leyland">Ashok Leyland</option>
                        <option value="BharatBenz">BharatBenz</option>
                        <option value="Eicher">Eicher</option>
                        <option value="Mahindra">Mahindra</option>
                      </select>
                      <input className="fi" style={{ flex: 1 }} placeholder="Model" value={formData.model} onChange={e => setFormData(f => ({ ...f, model: e.target.value }))} />
                    </div>
                  </div>

                  <div className="field">
                    <label>Vehicle Type</label>
                    <select className="fi" value={formData.vehicleType} onChange={e => setFormData(f => ({ ...f, vehicleType: e.target.value }))}>
                      <option value="Trailer">Trailer</option>
                      <option value="Dump Truck">Dump Truck</option>
                      <option value="Canter">Canter</option>
                    </select>
                  </div>

                  <div className="field">
                    <label>GPS Setup</label>
                    <select className="fi" value={formData.gpsType} onChange={e => setFormData(f => ({ ...f, gpsType: e.target.value }))}>
                      <option value="none">No GPS Setup</option>
                      <option value="jkl">JK Lakshmi GPS</option>
                      <option value="js">JK Super GPS</option>
                      <option value="both">Both GPS Systems</option>
                    </select>
                  </div>

                  {/* Weights and Mileage */}
                  <div className="field">
                    <label>Gross Weight (MT)</label>
                    <input className="fi" type="number" step="0.01" value={formData.grossWeight} onChange={e => setFormData(f => ({ ...f, grossWeight: e.target.value }))} placeholder="e.g. 49.00" />
                  </div>

                  <div className="field">
                    <label>Unladen Weight (MT)</label>
                    <input className="fi" type="number" step="0.01" value={formData.unladenWeight} onChange={e => setFormData(f => ({ ...f, unladenWeight: e.target.value }))} placeholder="e.g. 11.50" />
                  </div>

                  <div className="field">
                    <label>Target Mileage (km/l)</label>
                    <input className="fi" type="number" step="0.1" value={formData.targetMileage} onChange={e => setFormData(f => ({ ...f, targetMileage: e.target.value }))} placeholder="e.g. 2.8" />
                  </div>

                  <div className="field">
                    <label>Fastag Card ID</label>
                    <input className="fi" value={formData.fastag} onChange={e => setFormData(f => ({ ...f, fastag: e.target.value }))} placeholder="Card Tag Number" />
                  </div>

                  {/* Supplier & Driver Contact */}
                  <div style={{ gridColumn: '1 / -1', marginTop: '12px', marginBottom: '4px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      👤 Supplier & Driver Details
                    </div>
                  </div>

                  <div className="field">
                    <label>Owner / Supplier Name</label>
                    <input className="fi" value={formData.ownerName} onChange={e => setFormData(f => ({ ...f, ownerName: e.target.value }))} placeholder="e.g. RAJESH KUMAR" />
                  </div>

                  <div className="field">
                    <label>Owner Contact Phone</label>
                    <input className="fi" value={formData.ownerContact} onChange={e => setFormData(f => ({ ...f, ownerContact: e.target.value }))} placeholder="e.g. 9876543210" />
                  </div>

                  <div className="field">
                    <label>Driver Name</label>
                    <input className="fi" value={formData.driverName} onChange={e => setFormData(f => ({ ...f, driverName: e.target.value }))} placeholder="Active driver name" />
                  </div>

                  <div className="field">
                    <label>Driver Contact Phone</label>
                    <input className="fi" value={formData.driverContact} onChange={e => setFormData(f => ({ ...f, driverContact: e.target.value }))} placeholder="Driver mobile number" />
                  </div>

                  {/* Bank Transfer Details */}
                  <div style={{ gridColumn: '1 / -1', marginTop: '12px', marginBottom: '4px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🏦 Bank Transfer Details
                    </div>
                  </div>
                  {(() => {
                    const bank = parseJson(formData.bankDetails);
                    const updateBank = (key, val) => {
                      const updated = { ...bank, [key]: val };
                      setFormData(f => ({ ...f, bankDetails: JSON.stringify(updated) }));
                    };
                    return (
                      <>
                        <div className="field">
                          <label>Account Holder Name</label>
                          <input className="fi" value={bank.name || ''} onChange={e => updateBank('name', e.target.value)} placeholder="Name in Bank Account" />
                        </div>
                        <div className="field">
                          <label>Bank Name</label>
                          <input className="fi" value={bank.bank || ''} onChange={e => updateBank('bank', e.target.value)} placeholder="Bank name & branch" />
                        </div>
                        <div className="field">
                          <label>Account Number</label>
                          <input className="fi" value={bank.account || ''} onChange={e => updateBank('account', e.target.value)} placeholder="Account no." />
                        </div>
                        <div className="field">
                          <label>IFSC Code</label>
                          <input className="fi" value={bank.ifsc || ''} onChange={e => updateBank('ifsc', e.target.value)} placeholder="IFSC code" />
                        </div>
                      </>
                    );
                  })()}

                  {/* Document Expiration Dates */}
                  <div style={{ gridColumn: '1 / -1', marginTop: '12px', marginBottom: '4px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      📅 Document Expiry Dates
                    </div>
                  </div>
                  {(() => {
                    const docs = parseJson(formData.docs);
                    const updateDoc = (key, val) => {
                      const updated = { ...docs, [key]: val };
                      setFormData(f => ({ ...f, docs: JSON.stringify(updated) }));
                    };
                    return (
                      <>
                        <div className="field">
                          <label>RC Expiry</label>
                          <input className="fi" type="date" value={docs.rc || ''} onChange={e => updateDoc('rc', e.target.value)} />
                        </div>
                        <div className="field">
                          <label>National Permit Expiry</label>
                          <input className="fi" type="date" value={docs.permit || formData.nationalPermitDate || ''} onChange={e => {
                            updateDoc('permit', e.target.value);
                            setFormData(f => ({ ...f, nationalPermitDate: e.target.value }));
                          }} />
                        </div>
                        <div className="field">
                          <label>Insurance Expiry</label>
                          <input className="fi" type="date" value={docs.insurance || ''} onChange={e => updateDoc('insurance', e.target.value)} />
                        </div>
                        <div className="field">
                          <label>Pollution Expiry (PUC)</label>
                          <input className="fi" type="date" value={docs.pollution || ''} onChange={e => updateDoc('pollution', e.target.value)} />
                        </div>
                        <div className="field">
                          <label>Fitness Expiry</label>
                          <input className="fi" type="date" value={docs.fitness || ''} onChange={e => updateDoc('fitness', e.target.value)} />
                        </div>
                        <div className="field">
                          <label>Road Tax Expiry</label>
                          <input className="fi" type="date" value={docs.tax || ''} onChange={e => updateDoc('tax', e.target.value)} />
                        </div>
                      </>
                    );
                  })()}

                </div>

                {error && <div style={{ color: 'var(--danger)', fontSize: '12px', fontWeight: 700, marginTop: '16px' }}>{error}</div>}

                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="btn" style={{ border: '1px solid var(--border)', background: 'transparent' }} onClick={() => setIsModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-g" style={{ fontWeight: 800 }} disabled={saving}>
                    {saving ? 'Saving...' : (editingId ? 'Save Changes' : 'Register Vehicle')}
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
