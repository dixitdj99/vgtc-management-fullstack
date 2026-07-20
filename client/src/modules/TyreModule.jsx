import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import ax from '../api';
import { 
  Wrench, Plus, Search, Calendar, DollarSign, Edit3, Trash2, ArrowLeft, 
  FileText, CheckCircle2, XCircle, Loader2, Disc, User, HelpCircle, 
  RotateCw, RefreshCw, X as XIcon 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── Autocomplete / Suggestion Dropdown ── */
function AutocompleteInput({ value, onChange, suggestions = [], placeholder, required = false, className = "fi" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);

  const filtered = useMemo(() => {
    if (!suggestions) return [];
    if (!value) return suggestions.slice(0, 50);
    const search = value.toLowerCase();
    return suggestions.filter(item => {
      const str = typeof item === 'string' ? item : (item.truckNo || item.name || '');
      return str.toLowerCase().includes(search);
    }).slice(0, 50);
  }, [value, suggestions]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [filtered]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      setIsOpen(false);
      return;
    }
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
        e.preventDefault();
        const item = filtered[highlightedIndex];
        const displayVal = typeof item === 'string' ? item : (item.truckNo || item.name || '');
        onChange({ target: { value: displayVal } });
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {isOpen && filtered.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 1000,
          maxHeight: '200px',
          overflowY: 'auto'
        }}>
          {filtered.map((item, idx) => {
            const displayVal = typeof item === 'string' ? item : (item.truckNo || item.name || '');
            return (
              <div
                key={idx}
                onClick={() => {
                  onChange({ target: { value: displayVal } });
                  setIsOpen(false);
                }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: idx === highlightedIndex ? 'var(--bg-row-even)' : 'transparent',
                  color: 'var(--text)',
                  fontSize: '13px'
                }}
              >
                {displayVal}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const BRANDS = ['MRF', 'Apollo', 'JK Tyre', 'CEAT', 'Michelin', 'Bridgestone', 'Goodyear', 'Double Coin', 'Aeolus', 'Triangle', 'Other'];
const SIZES = ['10.00R20', '295/80R22.5', '11R22.5', '12R22.5', '10.00-20', '7.50-16', 'Other'];
const POSITIONS = [
  { id: 'FL', name: 'Front Left', axle: 'front' },
  { id: 'FR', name: 'Front Right', axle: 'front' },
  { id: 'RLO1', name: 'Rear Left Outer 1', axle: 'rear1' },
  { id: 'RLI1', name: 'Rear Left Inner 1', axle: 'rear1' },
  { id: 'RRI1', name: 'Rear Right Inner 1', axle: 'rear1' },
  { id: 'RRO1', name: 'Rear Right Outer 1', axle: 'rear1' },
  { id: 'RLO2', name: 'Rear Left Outer 2', axle: 'rear2' },
  { id: 'RLI2', name: 'Rear Left Inner 2', axle: 'rear2' },
  { id: 'RRI2', name: 'Rear Right Inner 2', axle: 'rear2' },
  { id: 'RRO2', name: 'Rear Right Outer 2', axle: 'rear2' },
  { id: 'SP', name: 'Spare Tyre', axle: 'spare' }
];

const fmtRs = n => '₹' + Math.round(n).toLocaleString('en-IN');
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function TyreModule() {
  const { user } = useAuth();
  const [tyres, setTyres] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [truckFilter, setTruckFilter] = useState('all');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isFitModalOpen, setIsFitModalOpen] = useState(false);
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [isRetreadModalOpen, setIsRetreadModalOpen] = useState(false);
  const [isScrapModalOpen, setIsScrapModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  const [selectedTyre, setSelectedTyre] = useState(null);
  const [fitPosition, setFitPosition] = useState(''); // Preset fit position from visual map

  // Forms state
  const [addForm, setAddForm] = useState({
    serialNo: '', brand: 'MRF', size: '10.00R20', type: 'new', purchasePrice: '', purchaseDate: new Date().toISOString().slice(0, 10), notes: ''
  });
  const [fitForm, setFitForm] = useState({
    truckNo: '', position: 'FL', fittedAtKm: '', fittedDate: new Date().toISOString().slice(0, 10)
  });
  const [removeForm, setRemoveForm] = useState({
    removalDate: new Date().toISOString().slice(0, 10), removalKm: '', nextStatus: 'available'
  });
  const [retreadForm, setRetreadForm] = useState({
    retreadDate: new Date().toISOString().slice(0, 10), retreadCost: '', retreaderName: '', notes: ''
  });
  const [scrapForm, setScrapForm] = useState({
    scrapDate: new Date().toISOString().slice(0, 10), notes: ''
  });

  const [selfVehiclesList, setSelfVehiclesList] = useState([]);
  const [vouchers, setVouchers] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tyresRes, vehiclesRes, vouchersRes] = await Promise.all([
        ax.get('/tyres'),
        ax.get('/vehicles'),
        ax.get('/vouchers').catch(() => ({ data: [] }))
      ]);
      setTyres(tyresRes.data || []);
      const allVeh = vehiclesRes.data || [];
      const selfVeh = allVeh.filter(v => v.ownershipType === 'self');
      setSelfVehiclesList(selfVeh);
      setVehicles(selfVeh.map(v => v.truckNo));
      setVouchers(vouchersRes.data || []);
    } catch (err) {
      setError('Failed to fetch tyre records.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      await ax.post('/tyres', addForm);
      setIsAddModalOpen(false);
      setAddForm({
        serialNo: '', brand: 'MRF', size: '10.00R20', type: 'new', purchasePrice: '', purchaseDate: new Date().toISOString().slice(0, 10), notes: ''
      });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to register tyre.');
    }
  };

  const handleFitSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      const tyreId = selectedTyre.id;
      await ax.post(`/tyres/${tyreId}/fit`, fitForm);
      setIsFitModalOpen(false);
      setSelectedTyre(null);
      setFitForm({
        truckNo: '', position: 'FL', fittedAtKm: '', fittedDate: new Date().toISOString().slice(0, 10)
      });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fit tyre.');
    }
  };

  const handleRemoveSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      const tyreId = selectedTyre.id;
      await ax.post(`/tyres/${tyreId}/remove`, removeForm);
      setIsRemoveModalOpen(false);
      setSelectedTyre(null);
      setRemoveForm({
        removalDate: new Date().toISOString().slice(0, 10), removalKm: '', nextStatus: 'available'
      });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove tyre.');
    }
  };

  const handleRetreadSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      const tyreId = selectedTyre.id;
      await ax.post(`/tyres/${tyreId}/retread`, retreadForm);
      setIsRetreadModalOpen(false);
      setSelectedTyre(null);
      setRetreadForm({
        retreadDate: new Date().toISOString().slice(0, 10), retreadCost: '', retreaderName: '', notes: ''
      });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record retread.');
    }
  };

  const handleScrapSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      const tyreId = selectedTyre.id;
      await ax.post(`/tyres/${tyreId}/scrap`, scrapForm);
      setIsScrapModalOpen(false);
      setSelectedTyre(null);
      setScrapForm({
        scrapDate: new Date().toISOString().slice(0, 10), notes: ''
      });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to scrap tyre.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this tyre from inventory permanently?')) return;
    try {
      await ax.delete(`/tyres/${id}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete tyre.');
    }
  };

  const openFitModal = (tyre, position = '') => {
    setSelectedTyre(tyre);
    setFitForm(f => ({ ...f, position: position || 'FL' }));
    setIsFitModalOpen(true);
  };

  const openRemoveModal = (tyre) => {
    setSelectedTyre(tyre);
    setIsRemoveModalOpen(true);
  };

  const openRetreadModal = (tyre) => {
    setSelectedTyre(tyre);
    setIsRetreadModalOpen(true);
  };

  const openScrapModal = (tyre) => {
    setSelectedTyre(tyre);
    setIsScrapModalOpen(true);
  };

  const openHistoryModal = (tyre) => {
    setSelectedTyre(tyre);
    setIsHistoryModalOpen(true);
  };

  const getTyreAtPosition = (truck, pos) => {
    return tyres.find(t => t.status === 'fitted' && t.fitment?.truckNo === truck && t.fitment?.position === pos);
  };

  // Filter logic
  const filteredTyres = tyres.filter(t => {
    const matchesSearch = t.serialNo.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          t.brand.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesTruck = truckFilter === 'all' || (t.status === 'fitted' && t.fitment?.truckNo === truckFilter);
    return matchesSearch && matchesStatus && matchesTruck;
  });

  // Self Vehicles Set
  const selfTruckSet = useMemo(() => new Set(selfVehiclesList.map(v => v.truckNo)), [selfVehiclesList]);

  // Calculate Tyre Expenses ONLY for Self Vehicles
  const selfTyreExpenses = useMemo(() => {
    // 1. Voucher Tyre Expenses for Self Vehicles
    let voucherExpense = 0;
    const vehicleVoucherExpenses = {};

    (vouchers || []).forEach(v => {
      if (!v.truckNo || !selfTruckSet.has(v.truckNo)) return;
      const pnc = parseFloat(v.tyrePuncture) || 0;
      const gre = (parseFloat(v.tyreGreasingAir) || 0) + (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0);
      const ext = parseFloat(v.extraCash) || 0;
      const sum = pnc + gre + ext;

      voucherExpense += sum;
      vehicleVoucherExpenses[v.truckNo] = (vehicleVoucherExpenses[v.truckNo] || 0) + sum;
    });

    // 2. Tyre Purchase & Retread Costs for Self Vehicles
    let inventoryExpense = 0;
    const vehicleInventoryExpenses = {};

    tyres.forEach(t => {
      const fittedTruck = t.fitment?.truckNo;
      if (t.status === 'fitted' && fittedTruck && selfTruckSet.has(fittedTruck)) {
        const cost = (parseFloat(t.purchasePrice) || 0) + (parseFloat(t.retreadCost) || 0);
        inventoryExpense += cost;
        vehicleInventoryExpenses[fittedTruck] = (vehicleInventoryExpenses[fittedTruck] || 0) + cost;
      }
    });

    return {
      total: voucherExpense + inventoryExpense,
      voucherExpense,
      inventoryExpense,
      vehicleVoucherExpenses,
      vehicleInventoryExpenses
    };
  }, [vouchers, tyres, selfTruckSet]);

  // Unique self trucks & fitted trucks for filter dropdown
  const selfTrucksList = useMemo(() => selfVehiclesList.map(v => v.truckNo).sort(), [selfVehiclesList]);
  const fittedTrucks = useMemo(() => {
    const fitted = tyres.filter(t => t.status === 'fitted').map(t => t.fitment?.truckNo).filter(Boolean);
    return [...new Set([...selfTrucksList, ...fitted])].sort();
  }, [tyres, selfTrucksList]);

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '40px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text)', margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>Tyre Management</h1>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>Track tyre life cycles, assignments, rotating positions, and running distances for Self Vehicles.</p>
        </div>
        <button onClick={() => setIsAddModalOpen(true)} style={{ 
          background: 'var(--primary)', color: 'white', border: 'none', padding: '12px 24px', 
          borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '8px', 
          fontSize: '14px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 20px rgba(139, 92, 246, 0.3)' 
        }}>
          <Plus size={18} /> Register New Tyre
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Self Fleet Count', val: `${selfVehiclesList.length} Trucks`, color: '#3b82f6' },
          { label: 'Total Self Tyre Cost', val: fmtRs(selfTyreExpenses.total), color: '#10b981' },
          { label: 'Fitted on Fleet', val: tyres.filter(t => t.status === 'fitted' && selfTruckSet.has(t.fitment?.truckNo)).length, color: '#6366f1' },
          { label: 'Available (In stock)', val: tyres.filter(t => t.status === 'available').length, color: '#06b6d4' },
          { label: 'Sent for Retread', val: tyres.filter(t => t.status === 'retreading').length, color: '#f59e0b' }
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color, lineHeight: 1.2, marginTop: '8px' }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Self Vehicles Fleet List Section */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>🚛 Self Vehicles Tyre Ledger</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>Tyre costs and maintenance calculated exclusively for Own Fleet vehicles.</p>
          </div>
        </div>
        {selfVehiclesList.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No self vehicles registered in Fleet Management.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-th)', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Truck No.</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Make / Model</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Fitted Tyres</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Voucher Tyre Exp.</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Tyre Cost</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {selfVehiclesList.map(v => {
                  const fittedCount = tyres.filter(t => t.status === 'fitted' && t.fitment?.truckNo === v.truckNo).length;
                  const vExp = selfTyreExpenses.vehicleVoucherExpenses[v.truckNo] || 0;
                  const iExp = selfTyreExpenses.vehicleInventoryExpenses[v.truckNo] || 0;
                  const totalExp = vExp + iExp;
                  return (
                    <tr key={v.id || v.truckNo} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 900, color: 'var(--primary)' }}>{v.truckNo}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{v.make} {v.model ? `(${v.model})` : ''}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '12px', background: fittedCount > 0 ? 'rgba(16,185,129,0.1)' : 'var(--bg-th)', color: fittedCount > 0 ? '#10b981' : 'var(--text-muted)' }}>
                          {fittedCount} Tyres
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>{fmtRs(vExp)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 900, color: '#10b981' }}>{fmtRs(totalExp)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <button 
                          onClick={() => setTruckFilter(v.truckNo)}
                          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: 'var(--primary)' }}
                        >
                          View Axle Map
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

      {/* Interactive Visual Truck Map */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Axle-Wise Fitment Map</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>Select a truck to view or manage its current tyre placements in real-time.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)' }}>Select Truck:</span>
            <select 
              value={truckFilter} 
              onChange={e => {
                setTruckFilter(e.target.value);
                if (e.target.value !== 'all') {
                  // Keep statusFilter all or fitted
                  if (statusFilter !== 'all' && statusFilter !== 'fitted') setStatusFilter('all');
                }
              }} 
              style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text)', fontWeight: 600 }}
            >
              <option value="all">— Select Vehicle —</option>
              {fittedTrucks.map(truck => <option key={truck} value={truck}>{truck}</option>)}
            </select>
          </div>
        </div>

        {truckFilter === 'all' ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '16px', background: 'var(--bg-row-even)' }}>
            <Disc size={36} style={{ color: 'var(--text-muted)', marginBottom: '12px', opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Choose a vehicle from the dropdown above to render the 10-wheeler visual layout.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px 0' }}>
            <div style={{ position: 'relative', width: '280px', background: 'rgba(0,0,0,0.02)', border: '2px solid var(--border)', borderRadius: '30px', padding: '40px 20px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
              <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: 'var(--primary)', color: 'white', fontSize: '9px', fontWeight: 800, padding: '3px 10px', borderRadius: '10px' }}>FRONT (CAB)</div>
              
              {/* Front Axle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {['FL', 'FR'].map(pos => {
                  const t = getTyreAtPosition(truckFilter, pos);
                  return (
                    <div key={pos} style={{ width: '80px', textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px' }}>{pos}</div>
                      {t ? (
                        <div onClick={() => openRemoveModal(t)} style={{ cursor: 'pointer', background: 'var(--bg-input)', border: '2px solid #10b981', borderRadius: '8px', padding: '8px 4px', minHeight: '64px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <div style={{ fontSize: '11px', fontWeight: 900 }}>{t.serialNo}</div>
                          <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>{t.brand}</div>
                          <div style={{ fontSize: '9px', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>{t.totalKmRun.toLocaleString()} km</div>
                        </div>
                      ) : (
                        <div onClick={() => {
                          const av = tyres.find(ty => ty.status === 'available');
                          if (av) openFitModal(av, pos);
                          else alert('No available tyres in stock. Please register a tyre first.');
                        }} style={{ cursor: 'pointer', border: '2px dashed var(--border)', borderRadius: '8px', padding: '8px 4px', minHeight: '64px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                          <Plus size={14} />
                          <span style={{ fontSize: '9px', fontWeight: 700 }}>Empty</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Rear Axle 1 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {/* Left side duals */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['RLO1', 'RLI1'].map(pos => {
                    const t = getTyreAtPosition(truckFilter, pos);
                    return (
                      <div key={pos} style={{ width: '42px', textAlign: 'center' }}>
                        {t ? (
                          <div onClick={() => openRemoveModal(t)} style={{ cursor: 'pointer', background: 'var(--bg-input)', border: '2px solid #10b981', borderRadius: '6px', padding: '6px 2px', minHeight: '56px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <div style={{ fontSize: '9px', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.serialNo}</div>
                            <div style={{ fontSize: '8px', color: '#10b981', marginTop: '2px' }}>{t.totalKmRun} km</div>
                          </div>
                        ) : (
                          <div onClick={() => {
                            const av = tyres.find(ty => ty.status === 'available');
                            if (av) openFitModal(av, pos);
                            else alert('No available tyres in stock.');
                          }} style={{ cursor: 'pointer', border: '2px dashed var(--border)', borderRadius: '6px', padding: '6px 2px', minHeight: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                            <Plus size={10} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Right side duals */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['RRI1', 'RRO1'].map(pos => {
                    const t = getTyreAtPosition(truckFilter, pos);
                    return (
                      <div key={pos} style={{ width: '42px', textAlign: 'center' }}>
                        {t ? (
                          <div onClick={() => openRemoveModal(t)} style={{ cursor: 'pointer', background: 'var(--bg-input)', border: '2px solid #10b981', borderRadius: '6px', padding: '6px 2px', minHeight: '56px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <div style={{ fontSize: '9px', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.serialNo}</div>
                            <div style={{ fontSize: '8px', color: '#10b981', marginTop: '2px' }}>{t.totalKmRun} km</div>
                          </div>
                        ) : (
                          <div onClick={() => {
                            const av = tyres.find(ty => ty.status === 'available');
                            if (av) openFitModal(av, pos);
                            else alert('No available tyres in stock.');
                          }} style={{ cursor: 'pointer', border: '2px dashed var(--border)', borderRadius: '6px', padding: '6px 2px', minHeight: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                            <Plus size={10} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rear Axle 2 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {/* Left side duals */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['RLO2', 'RLI2'].map(pos => {
                    const t = getTyreAtPosition(truckFilter, pos);
                    return (
                      <div key={pos} style={{ width: '42px', textAlign: 'center' }}>
                        {t ? (
                          <div onClick={() => openRemoveModal(t)} style={{ cursor: 'pointer', background: 'var(--bg-input)', border: '2px solid #10b981', borderRadius: '6px', padding: '6px 2px', minHeight: '56px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <div style={{ fontSize: '9px', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.serialNo}</div>
                            <div style={{ fontSize: '8px', color: '#10b981', marginTop: '2px' }}>{t.totalKmRun} km</div>
                          </div>
                        ) : (
                          <div onClick={() => {
                            const av = tyres.find(ty => ty.status === 'available');
                            if (av) openFitModal(av, pos);
                            else alert('No available tyres in stock.');
                          }} style={{ cursor: 'pointer', border: '2px dashed var(--border)', borderRadius: '6px', padding: '6px 2px', minHeight: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                            <Plus size={10} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Right side duals */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['RRI2', 'RRO2'].map(pos => {
                    const t = getTyreAtPosition(truckFilter, pos);
                    return (
                      <div key={pos} style={{ width: '42px', textAlign: 'center' }}>
                        {t ? (
                          <div onClick={() => openRemoveModal(t)} style={{ cursor: 'pointer', background: 'var(--bg-input)', border: '2px solid #10b981', borderRadius: '6px', padding: '6px 2px', minHeight: '56px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <div style={{ fontSize: '9px', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.serialNo}</div>
                            <div style={{ fontSize: '8px', color: '#10b981', marginTop: '2px' }}>{t.totalKmRun} km</div>
                          </div>
                        ) : (
                          <div onClick={() => {
                            const av = tyres.find(ty => ty.status === 'available');
                            if (av) openFitModal(av, pos);
                            else alert('No available tyres in stock.');
                          }} style={{ cursor: 'pointer', border: '2px dashed var(--border)', borderRadius: '6px', padding: '6px 2px', minHeight: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                            <Plus size={10} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Spare Tyre */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '15px' }}>
                <div style={{ width: '80px', textAlign: 'center' }}>
                  <div style={{ fontSize: '8px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '3px' }}>SPARE (SP)</div>
                  {(() => {
                    const t = getTyreAtPosition(truckFilter, 'SP');
                    return t ? (
                      <div onClick={() => openRemoveModal(t)} style={{ cursor: 'pointer', background: 'var(--bg-input)', border: '2px solid #10b981', borderRadius: '8px', padding: '6px 4px', minHeight: '54px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ fontSize: '10px', fontWeight: 900 }}>{t.serialNo}</div>
                        <div style={{ fontSize: '8px', color: '#10b981', marginTop: '2px' }}>{t.totalKmRun} km</div>
                      </div>
                    ) : (
                      <div onClick={() => {
                        const av = tyres.find(ty => ty.status === 'available');
                        if (av) openFitModal(av, 'SP');
                        else alert('No available tyres in stock.');
                      }} style={{ cursor: 'pointer', border: '2px dashed var(--border)', borderRadius: '8px', padding: '6px 4px', minHeight: '54px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        <Plus size={12} />
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toolbar filters */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            className="fi"
            placeholder="Search Serial No or Brand..." 
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '38px' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-card)', padding: '3px', borderRadius: '10px', border: '1px solid var(--border)', height: '38px', alignItems: 'center' }}>
          {['all', 'available', 'fitted', 'retreading', 'scrapped'].map(t => (
            <button key={t} onClick={() => setStatusFilter(t)} style={{
              height: '30px', padding: '0 12px', borderRadius: '7px', border: 'none', fontSize: '12px', fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer',
              background: statusFilter === t ? 'var(--accent)' : 'transparent',
              color: statusFilter === t ? 'white' : 'var(--text-muted)',
              transition: 'all 0.15s'
            }}>
              {t === 'available' ? 'Available' : t === 'fitted' ? 'Fitted' : t === 'retreading' ? 'Retread' : t === 'scrapped' ? 'Scrapped' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Tyres */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading Tyre Ledger...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {filteredTyres.map(tyre => (
            <motion.div key={tyre.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', position: 'relative' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '2px 6px', borderRadius: '4px' }}>
                      {tyre.size}
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', background: 'var(--bg-input)', color: 'var(--text-muted)', padding: '2px 6px', borderRadius: '4px' }}>
                      {tyre.type}
                    </span>
                  </div>
                  <h3 style={{ margin: '6px 0 2px 0', fontSize: '18px', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.02em' }}>{tyre.serialNo}</h3>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>{tyre.brand}</div>
                </div>
                
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => openHistoryModal(tyre)} title="Rotation History" className="btn btn-sm btn-g btn-icon"><RefreshCw size={13} /></button>
                  <button onClick={() => handleDelete(tyre.id)} title="Delete Tyre" className="btn btn-sm btn-d btn-icon"><Trash2 size={13} /></button>
                </div>
              </div>

              {/* Status Specific Details */}
              <div style={{ background: 'var(--bg-input)', borderRadius: '12px', padding: '12px', marginBottom: '14px', fontSize: '13px' }}>
                {tyre.status === 'fitted' && tyre.fitment && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Vehicle Fitted:</span>
                      <span style={{ fontWeight: 800, color: '#10b981' }}>{tyre.fitment.truckNo}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Position:</span>
                      <span style={{ fontWeight: 700 }}>{tyre.fitment.position}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Fitted Date:</span>
                      <span>{fmtDate(tyre.fitment.fittedDate)}</span>
                    </div>
                  </div>
                )}
                {tyre.status === 'available' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ color: '#10b981', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={14} /> Ready for Fitment
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Purchase: {fmtDate(tyre.purchaseDate)} (Cost: {fmtRs(tyre.purchasePrice)})</div>
                  </div>
                )}
                {tyre.status === 'retreading' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ color: '#f59e0b', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <RotateCw size={14} className="spin" /> Out for Retreading
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Send for retread to reuse tyre casing.</div>
                  </div>
                )}
                {tyre.status === 'scrapped' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ color: 'var(--danger)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <XCircle size={14} /> Scrapped
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Scrap Date: {fmtDate(tyre.scrapDate)}</div>
                  </div>
                )}
              </div>

              {/* Running summary & Quick action */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Life KM Run</div>
                  <div style={{ fontSize: '15px', fontWeight: 900 }}>{tyre.totalKmRun.toLocaleString()} KM</div>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  {tyre.status === 'available' && (
                    <button onClick={() => openFitModal(tyre)} className="btn btn-sm btn-g" style={{ fontWeight: 800 }}>Fit Tyre</button>
                  )}
                  {tyre.status === 'fitted' && (
                    <button onClick={() => openRemoveModal(tyre)} className="btn btn-sm btn-d" style={{ fontWeight: 800 }}>Remove</button>
                  )}
                  {tyre.status === 'retreading' && (
                    <button onClick={() => openRetreadModal(tyre)} className="btn btn-sm btn-g" style={{ fontWeight: 800, background: '#f59e0b', borderColor: '#f59e0b' }}>Record Retread</button>
                  )}
                  {tyre.status !== 'scrapped' && tyre.status !== 'fitted' && tyre.status !== 'retreading' && (
                    <>
                      <button onClick={() => openRetreadModal(tyre)} className="btn btn-sm" style={{ fontWeight: 700, border: '1px solid var(--border)', background: 'transparent' }}>Retread</button>
                      <button onClick={() => openScrapModal(tyre)} className="btn btn-sm btn-d" style={{ fontWeight: 700 }}>Scrap</button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
          {filteredTyres.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: '16px', border: '1px dashed var(--border)' }}>
              No tyres registered matching these filters.
            </div>
          )}
        </div>
      )}

      {/* Modal 1: Register New Tyre */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '520px', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Register New Tyre</h3>
                <button type="button" onClick={() => setIsAddModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><XIcon size={18} /></button>
              </div>
              <form onSubmit={handleAddSubmit} style={{ padding: '20px' }}>
                <div className="fg fg-2" style={{ gap: '14px' }}>
                  <div className="field-h" style={{ gridColumn: '1 / -1' }}>
                    <label>Serial No. *</label>
                    <input className="fi" type="text" placeholder="e.g. MRF-84930129" value={addForm.serialNo} onChange={e => setAddForm({ ...addForm, serialNo: e.target.value })} required />
                  </div>
                  <div className="field-h">
                    <label>Brand</label>
                    <select className="fi" value={addForm.brand} onChange={e => setAddForm({ ...addForm, brand: e.target.value })}>
                      {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div className="field-h">
                    <label>Size</label>
                    <select className="fi" value={addForm.size} onChange={e => setAddForm({ ...addForm, size: e.target.value })}>
                      {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="field-h">
                    <label>Type</label>
                    <select className="fi" value={addForm.type} onChange={e => setAddForm({ ...addForm, type: e.target.value })}>
                      <option value="new">New Tyre</option>
                      <option value="retread">Retreaded Tyre</option>
                      <option value="old">Old / Used Tyre</option>
                    </select>
                  </div>
                  <div className="field-h">
                    <label>Cost</label>
                    <input className="fi" type="number" placeholder="₹" value={addForm.purchasePrice} onChange={e => setAddForm({ ...addForm, purchasePrice: e.target.value })} />
                  </div>
                  <div className="field-h" style={{ gridColumn: '1 / -1' }}>
                    <label>Purchase Date</label>
                    <input className="fi" type="date" value={addForm.purchaseDate} onChange={e => setAddForm({ ...addForm, purchaseDate: e.target.value })} />
                  </div>
                  <div className="field-h" style={{ gridColumn: '1 / -1' }}>
                    <label>Notes</label>
                    <textarea className="fi" rows={2} placeholder="Optional purchase notes..." value={addForm.notes} onChange={e => setAddForm({ ...addForm, notes: e.target.value })} />
                  </div>
                  {error && <div style={{ gridColumn: '1 / -1', color: 'var(--danger)', fontSize: '12px', fontWeight: 700 }}>{error}</div>}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                    <button type="button" className="btn" style={{ border: '1px solid var(--border)', background: 'transparent' }} onClick={() => setIsAddModalOpen(false)}>Cancel</button>
                    <button type="submit" className="btn btn-g" style={{ fontWeight: 800 }}>Register Tyre</button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 2: Fit Tyre to Vehicle */}
      <AnimatePresence>
        {isFitModalOpen && selectedTyre && (
          <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '500px', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Fit Tyre — {selectedTyre.serialNo}</h3>
                <button type="button" onClick={() => setIsFitModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><XIcon size={18} /></button>
              </div>
              <form onSubmit={handleFitSubmit} style={{ padding: '20px' }}>
                <div className="fg fg-2" style={{ gap: '14px' }}>
                  <div className="field-h" style={{ gridColumn: '1 / -1' }}>
                    <label>Truck No. *</label>
                    <AutocompleteInput 
                      value={fitForm.truckNo} 
                      onChange={e => setFitForm({ ...fitForm, truckNo: e.target.value.toUpperCase() })} 
                      suggestions={vehicles} 
                      placeholder="Enter truck e.g. HR47G1234"
                      required={true}
                    />
                  </div>
                  <div className="field-h" style={{ gridColumn: '1 / -1' }}>
                    <label>Position *</label>
                    <select className="fi" value={fitForm.position} onChange={e => setFitForm({ ...fitForm, position: e.target.value })}>
                      {POSITIONS.map(p => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                    </select>
                  </div>
                  <div className="field-h">
                    <label>Fit Odometer *</label>
                    <input className="fi" type="number" placeholder="KM" value={fitForm.fittedAtKm} onChange={e => setFitForm({ ...fitForm, fittedAtKm: e.target.value })} required />
                  </div>
                  <div className="field-h">
                    <label>Fit Date *</label>
                    <input className="fi" type="date" value={fitForm.fittedDate} onChange={e => setFitForm({ ...fitForm, fittedDate: e.target.value })} required />
                  </div>
                  {error && <div style={{ gridColumn: '1 / -1', color: 'var(--danger)', fontSize: '12px', fontWeight: 700 }}>{error}</div>}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                    <button type="button" className="btn" style={{ border: '1px solid var(--border)', background: 'transparent' }} onClick={() => setIsFitModalOpen(false)}>Cancel</button>
                    <button type="submit" className="btn btn-g" style={{ fontWeight: 800 }}>Confirm Fitment</button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 3: Remove Tyre */}
      <AnimatePresence>
        {isRemoveModalOpen && selectedTyre && (
          <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '500px', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Remove Tyre — {selectedTyre.serialNo}</h3>
                <button type="button" onClick={() => setIsRemoveModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><XIcon size={18} /></button>
              </div>
              <form onSubmit={handleRemoveSubmit} style={{ padding: '20px' }}>
                <div className="fg fg-2" style={{ gap: '14px' }}>
                  {selectedTyre.fitment && (
                    <div style={{ gridColumn: '1 / -1', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', padding: '10px 14px', borderRadius: '8px', fontSize: '12px' }}>
                      Fitted to <strong style={{ color: '#10b981' }}>{selectedTyre.fitment.truckNo}</strong> at position <strong>{selectedTyre.fitment.position}</strong> with Odometer <strong>{selectedTyre.fitment.fittedAtKm.toLocaleString()} KM</strong>.
                    </div>
                  )}
                  <div className="field-h">
                    <label>Removal KM *</label>
                    <input className="fi" type="number" placeholder="KM" value={removeForm.removalKm} onChange={e => setRemoveForm({ ...removeForm, removalKm: e.target.value })} required />
                  </div>
                  <div className="field-h">
                    <label>Removal Date *</label>
                    <input className="fi" type="date" value={removeForm.removalDate} onChange={e => setRemoveForm({ ...removeForm, removalDate: e.target.value })} required />
                  </div>
                  <div className="field-h" style={{ gridColumn: '1 / -1' }}>
                    <label>Next Status *</label>
                    <select className="fi" value={removeForm.nextStatus} onChange={e => setRemoveForm({ ...removeForm, nextStatus: e.target.value })}>
                      <option value="available">Available (Put back in stock)</option>
                      <option value="retreading">Sent for Retreading</option>
                      <option value="scrapped">Scrapped (Out of service)</option>
                    </select>
                  </div>
                  {error && <div style={{ gridColumn: '1 / -1', color: 'var(--danger)', fontSize: '12px', fontWeight: 700 }}>{error}</div>}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                    <button type="button" className="btn" style={{ border: '1px solid var(--border)', background: 'transparent' }} onClick={() => setIsRemoveModalOpen(false)}>Cancel</button>
                    <button type="submit" className="btn btn-d" style={{ fontWeight: 800 }}>Confirm Removal</button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 4: Record Retread */}
      <AnimatePresence>
        {isRetreadModalOpen && selectedTyre && (
          <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '500px', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Record Retread — {selectedTyre.serialNo}</h3>
                <button type="button" onClick={() => setIsRetreadModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><XIcon size={18} /></button>
              </div>
              <form onSubmit={handleRetreadSubmit} style={{ padding: '20px' }}>
                <div className="fg fg-2" style={{ gap: '14px' }}>
                  <div className="field-h">
                    <label>Retread Date *</label>
                    <input className="fi" type="date" value={retreadForm.retreadDate} onChange={e => setRetreadForm({ ...retreadForm, retreadDate: e.target.value })} required />
                  </div>
                  <div className="field-h">
                    <label>Retread Cost *</label>
                    <input className="fi" type="number" placeholder="₹" value={retreadForm.retreadCost} onChange={e => setRetreadForm({ ...retreadForm, retreadCost: e.target.value })} required />
                  </div>
                  <div className="field-h" style={{ gridColumn: '1 / -1' }}>
                    <label>Retreader Vendor</label>
                    <input className="fi" type="text" placeholder="e.g. Apollo Retread Center" value={retreadForm.retreaderName} onChange={e => setRetreadForm({ ...retreadForm, retreaderName: e.target.value })} />
                  </div>
                  <div className="field-h" style={{ gridColumn: '1 / -1' }}>
                    <label>Notes</label>
                    <textarea className="fi" rows={2} placeholder="Retreading comments..." value={retreadForm.notes} onChange={e => setRetreadForm({ ...retreadForm, notes: e.target.value })} />
                  </div>
                  {error && <div style={{ gridColumn: '1 / -1', color: 'var(--danger)', fontSize: '12px', fontWeight: 700 }}>{error}</div>}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                    <button type="button" className="btn" style={{ border: '1px solid var(--border)', background: 'transparent' }} onClick={() => setIsRetreadModalOpen(false)}>Cancel</button>
                    <button type="submit" className="btn btn-g" style={{ fontWeight: 800 }}>Confirm Retread</button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 5: Scrap Tyre */}
      <AnimatePresence>
        {isScrapModalOpen && selectedTyre && (
          <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '500px', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Scrap Tyre — {selectedTyre.serialNo}</h3>
                <button type="button" onClick={() => setIsScrapModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><XIcon size={18} /></button>
              </div>
              <form onSubmit={handleScrapSubmit} style={{ padding: '20px' }}>
                <div className="fg fg-2" style={{ gap: '14px' }}>
                  <div className="field-h" style={{ gridColumn: '1 / -1' }}>
                    <label>Scrap Date *</label>
                    <input className="fi" type="date" value={scrapForm.scrapDate} onChange={e => setScrapForm({ ...scrapForm, scrapDate: e.target.value })} required />
                  </div>
                  <div className="field-h" style={{ gridColumn: '1 / -1' }}>
                    <label>Reason / Notes</label>
                    <textarea className="fi" rows={3} placeholder="Provide details e.g. Side cut, worn out, tread wear limit..." value={scrapForm.notes} onChange={e => setScrapForm({ ...scrapForm, notes: e.target.value })} />
                  </div>
                  {error && <div style={{ gridColumn: '1 / -1', color: 'var(--danger)', fontSize: '12px', fontWeight: 700 }}>{error}</div>}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                    <button type="button" className="btn" style={{ border: '1px solid var(--border)', background: 'transparent' }} onClick={() => setIsScrapModalOpen(false)}>Cancel</button>
                    <button type="submit" className="btn btn-d" style={{ fontWeight: 800 }}>Scrap Tyre</button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 6: Rotation History */}
      <AnimatePresence>
        {isHistoryModalOpen && selectedTyre && (
          <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ background: 'var(--bg-card)', borderRadius: '20px', width: '100%', maxWidth: '700px', border: '1px solid var(--border)', boxShadow: '0 24px 60px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>Tyre rotation & run history</h3>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Serial: {selectedTyre.serialNo} · Brand: {selectedTyre.brand}</div>
                </div>
                <button type="button" onClick={() => setIsHistoryModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><XIcon size={20} /></button>
              </div>
              <div style={{ padding: '24px', maxHeight: '60vh', overflowY: 'auto' }}>
                
                {/* Statistics header */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ flex: 1, background: 'var(--bg-input)', borderRadius: '12px', padding: '12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Accumulated Running</div>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>{selectedTyre.totalKmRun.toLocaleString()} KM</div>
                  </div>
                  <div style={{ flex: 1, background: 'var(--bg-input)', borderRadius: '12px', padding: '12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Rotations</div>
                    <div style={{ fontSize: '20px', fontWeight: 900, marginTop: '4px' }}>{(selectedTyre.rotationHistory || []).length}</div>
                  </div>
                </div>

                {/* Timeline */}
                <div style={{ position: 'relative', borderLeft: '2px solid var(--border)', marginLeft: '12px', paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  {/* Current Fitment */}
                  {selectedTyre.status === 'fitted' && selectedTyre.fitment && (
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', left: '-31px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', background: '#10b981', border: '2px solid var(--bg-card)' }}></div>
                      <div style={{ fontWeight: 800, color: '#10b981', fontSize: '13px' }}>Currently Active Fitment</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Fitted on <strong style={{ color: 'var(--text)' }}>{selectedTyre.fitment.truckNo}</strong> at position <strong style={{ color: 'var(--text)' }}>{selectedTyre.fitment.position}</strong> since {fmtDate(selectedTyre.fitment.fittedDate)} (Fit Odometer: {selectedTyre.fitment.fittedAtKm.toLocaleString()} KM).
                      </div>
                    </div>
                  )}

                  {/* Historical rotations */}
                  {(selectedTyre.rotationHistory || []).slice().reverse().map((h, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', left: '-31px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--primary)', border: '2px solid var(--bg-card)' }}></div>
                      <div style={{ fontWeight: 800, fontSize: '13px' }}>Fitted on {h.truckNo} ({h.position})</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <span>Fitment: {fmtDate(h.fittedDate)} ({h.fittedAtKm.toLocaleString()} KM)</span>
                        <span style={{ margin: '0 8px' }}>→</span>
                        <span>Removal: {fmtDate(h.removedDate)} ({h.removedAtKm.toLocaleString()} KM)</span>
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', marginTop: '4px', background: 'rgba(139,92,246,0.08)', display: 'inline-block', padding: '2px 8px', borderRadius: '4px' }}>
                        Ran: {h.kmRun.toLocaleString()} KM
                      </div>
                    </div>
                  ))}

                  {/* Registered date */}
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '-31px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--text-muted)', border: '2px solid var(--bg-card)' }}></div>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-muted)' }}>Registered in Inventory</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Purchased on {fmtDate(selectedTyre.purchaseDate)} as a <strong>{selectedTyre.type}</strong> tyre.
                    </div>
                  </div>

                </div>

              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', background: 'var(--bg-row-even)' }}>
                <button type="button" className="btn btn-g" style={{ fontWeight: 800 }} onClick={() => setIsHistoryModalOpen(false)}>Close History</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
