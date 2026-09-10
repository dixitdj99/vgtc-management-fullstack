import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import ax from '../api';
import { 
  Wrench, Plus, Search, Calendar, DollarSign, Trash2, 
  AlertTriangle, Sparkles, CheckCircle2, Truck, Filter, X,
  RefreshCw, FileText, Layers, Tag, ArrowUpRight, ArrowDownLeft,
  CircleDollarSign, Info, Eye
} from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import TruckLoader from '../components/TruckLoader';

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
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
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
                  background: idx === highlightedIndex ? 'var(--bg-th)' : 'transparent',
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

const BRANDS = ['MRF', 'Apollo', 'JK Tyre', 'CEAT', 'Michelin', 'Bridgestone', 'Goodyear', 'Double Coin', 'Triangle', 'Other'];

// Vehicle Tyre & Spare Configuration
const VEHICLE_CONFIGS = {
  '6': {
    name: 'Canter (6-Wheel)',
    short: 'Canter 6W',
    mounted: 6,
    spares: 1,
    total: 7,
    positions: [
      'Front Left (Steering)',
      'Front Right (Steering)',
      'Rear Left Outer',
      'Rear Left Inner',
      'Rear Right Outer',
      'Rear Right Inner',
      'Spare Tyre 1'
    ]
  },
  '18': {
    name: 'Trailer (18-Wheel)',
    short: 'Trailer 18W',
    mounted: 18,
    spares: 2,
    total: 20,
    positions: [
      'Front Axle 1 - Left Steering',
      'Front Axle 1 - Right Steering',
      'Front Axle 2 - Left',
      'Front Axle 2 - Right',
      'Rear Axle 1 - Left Outer',
      'Rear Axle 1 - Left Inner',
      'Rear Axle 1 - Right Inner',
      'Rear Axle 1 - Right Outer',
      'Rear Axle 2 - Left Outer',
      'Rear Axle 2 - Left Inner',
      'Rear Axle 2 - Right Inner',
      'Rear Axle 2 - Right Outer',
      'Rear Axle 3 - Left Outer',
      'Rear Axle 3 - Left Inner',
      'Rear Axle 3 - Right Inner',
      'Rear Axle 3 - Right Outer',
      'Spare Tyre 1',
      'Spare Tyre 2'
    ]
  }
};

const REASONS = [
  { id: 'blasted', label: '💥 Blasted / Burst', desc: 'Tyre blasted on road/trip' },
  { id: 'damaged', label: '⚠️ Damaged / Cut', desc: 'Sidewall cut or heavy puncture' },
  { id: 'worn', label: '🔄 Worn Out', desc: 'Normal wear & tear replacement' },
  { id: 'upgrade', label: '🆕 Upgrade / New Tyre', desc: 'Preventative new tyre installation' },
];

const CONDITIONS = [
  { id: 'new', label: '🆕 Brand New Tyre' },
  { id: 'retread', label: '♻️ Retreaded Tyre' },
  { id: 'used', label: '🛠️ Used / Second Hand' },
];

const DISPOSAL_OPTIONS = [
  { id: 'sold', label: '💰 Sold Scrap', desc: 'Sold old tyre for cash' },
  { id: 'stored', label: '📦 Stored in Yard', desc: 'Kept in godown / retread stock' },
  { id: 'discarded', label: '🗑️ Discarded', desc: 'Unusable / Scrapped (₹0)' },
];

const fmtRs = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function TyreModule() {
  const { user } = useAuth();
  const [tyres, setTyres] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [selfVehicles, setSelfVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Search & Filters state
  const [search, setSearch] = useState('');
  const [entryTypeFilter, setEntryTypeFilter] = useState('all'); // 'all' | 'replacement' | 'voucher_repair'
  const [reasonFilter, setReasonFilter] = useState('all');
  const [truckFilter, setTruckFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('vehicles'); // 'vehicles' | 'history'

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [vehicleHistoryModal, setVehicleHistoryModal] = useState(null); // truckNo | null

  // Form State for Tyre Replacement
  const [form, setForm] = useState({
    truckNo: '',
    vehicleType: '18', // '6' = Canter, '18' = Trailer
    date: new Date().toISOString().slice(0, 10),
    reason: 'blasted',
    position: VEHICLE_CONFIGS['18'].positions[0],
    condition: 'new',
    brand: 'Apollo',
    newPrice: '',
    oldDisposal: 'sold', // 'sold', 'stored', 'discarded'
    scrapPrice: '',
    vendor: '',
    remarks: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [tyresRes, vehiclesRes, vouchersRes] = await Promise.all([
        ax.get('/tyres'),
        ax.get('/vehicles').catch(() => ({ data: [] })),
        ax.get('/vouchers').catch(() => ({ data: [] }))
      ]);
      setTyres(tyresRes.data || []);
      setVouchers(vouchersRes.data || []);

      const allVeh = vehiclesRes.data || [];
      const selfVeh = allVeh.filter(v =>
        v.ownershipType === 'self' || (v.ownerName || '').toLowerCase().includes('vikas')
      );
      setSelfVehicles(selfVeh);
    } catch (err) {
      console.error('Failed to fetch tyre records:', err);
      setError('Failed to fetch tyre change history.');
    } finally {
      setLoading(false);
    }
  };

  // Helper to infer vehicle type
  const getVehicleType = (truckNo) => {
    const veh = selfVehicles.find(v => v.truckNo === truckNo);
    if (!veh) return '18';
    const desc = `${veh.vehicleType || ''} ${veh.model || ''} ${veh.make || ''}`.toLowerCase();
    if (desc.includes('canter') || desc.includes('6 wheel') || desc.includes('6w')) return '6';
    return '18';
  };

  // Handle truck selection in form to auto-set vehicle type and position
  const handleTruckChange = (truckNo) => {
    const vType = getVehicleType(truckNo);
    const cfg = VEHICLE_CONFIGS[vType] || VEHICLE_CONFIGS['18'];
    setForm(prev => ({
      ...prev,
      truckNo,
      vehicleType: vType,
      position: cfg.positions[0]
    }));
  };

  const handleOpenAddModal = (prefillTruck = '') => {
    const truckNo = prefillTruck || (selfVehicles[0]?.truckNo || '');
    const vType = getVehicleType(truckNo);
    const cfg = VEHICLE_CONFIGS[vType] || VEHICLE_CONFIGS['18'];

    setForm({
      truckNo,
      vehicleType: vType,
      date: new Date().toISOString().slice(0, 10),
      reason: 'blasted',
      position: cfg.positions[0],
      condition: 'new',
      brand: 'Apollo',
      newPrice: '',
      oldDisposal: 'sold',
      scrapPrice: '',
      vendor: '',
      remarks: ''
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.truckNo.trim()) return alert('Please select or enter a truck number');

    const newCost = parseFloat(form.newPrice) || 0;
    const scrapPrice = form.oldDisposal === 'sold' ? (parseFloat(form.scrapPrice) || 0) : 0;
    const netCost = Math.max(0, newCost - scrapPrice);
    const cleanTruck = form.truckNo.trim().toUpperCase();

    // Auto-generate serialNo behind the scenes for backend compatibility
    const autoSerial = `TYR-${cleanTruck}-${Date.now().toString().slice(-6)}`;

    const payload = {
      serialNo: autoSerial,
      brand: form.brand,
      type: form.condition,
      purchasePrice: netCost, // Store net cost for accounting/PnL compatibility
      purchaseDate: form.date,
      status: 'fitted',
      fitment: {
        truckNo: cleanTruck,
        vehicleType: form.vehicleType,
        position: form.position,
        reason: form.reason,
        vendor: form.vendor,
        newPrice: newCost,
        oldDisposal: form.oldDisposal,
        scrapPrice: scrapPrice,
        netCost: netCost,
        fittedDate: form.date
      },
      notes: `${form.reason === 'blasted' ? '💥 Blasted' : form.reason === 'damaged' ? '⚠️ Damaged' : form.reason === 'worn' ? '🔄 Worn Out' : '🆕 Upgrade'}${form.oldDisposal === 'sold' ? ` (Scrap Sold: ${fmtRs(scrapPrice)})` : ''}: ${form.remarks || 'Tyre replaced'}`
    };

    setSaving(true);
    try {
      await ax.post('/tyres', payload);
      setModalOpen(false);
      fetchData();
    } catch (err) {
      console.error('Failed to save tyre change record:', err);
      alert(err.response?.data?.error || 'Failed to save tyre change record.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!delTarget) return;
    try {
      await ax.delete(`/tyres/${delTarget.id}`);
      setDelTarget(null);
      fetchData();
    } catch (err) {
      console.error('Failed to delete record:', err);
      alert('Failed to delete tyre record.');
    }
  };

  // Normalised tyre replacement records (own fleet vehicles only, excluding auto-seeded demo data)
  const replacementList = useMemo(() => {
    const selfTruckSet = new Set(selfVehicles.map(v => v.truckNo));
    return tyres
      .filter(t => {
        const notes = (t.notes || '').toLowerCase();
        const serial = (t.serialNo || '').toLowerCase();
        if (notes.includes('auto-seeded') || notes.includes('seeded') || serial.includes('seeded')) {
          return false; // Skip auto-seeded mock data so history starts clean & blank
        }
        const fitTruck = (t.fitment?.truckNo || t.truckNo || '').trim().toUpperCase();
        if (!fitTruck) return false;
        return selfTruckSet.has(fitTruck);
      })
      .map(t => {
        const fit = t.fitment || {};
        const truckNo = (fit.truckNo || t.truckNo || 'Unknown').trim().toUpperCase();
        const reason = fit.reason || (t.notes && t.notes.includes('Blasted') ? 'blasted' : 'worn');
        const position = fit.position || 'Wheel Position';
        const vehicleType = fit.vehicleType || getVehicleType(truckNo);
        const newPrice = fit.newPrice !== undefined ? parseFloat(fit.newPrice) : (parseFloat(t.purchasePrice) || 0);
        const scrapPrice = parseFloat(fit.scrapPrice) || 0;
        const oldDisposal = fit.oldDisposal || (scrapPrice > 0 ? 'sold' : 'stored');
        const netCost = fit.netCost !== undefined ? parseFloat(fit.netCost) : (newPrice - scrapPrice);

        return {
          id: t.id,
          entryType: 'replacement',
          date: t.purchaseDate || t.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10),
          truckNo,
          vehicleType,
          position,
          reason,
          condition: t.type || 'new',
          brand: t.brand || 'Apollo',
          newPrice,
          oldDisposal,
          scrapPrice,
          netCost,
          vendor: fit.vendor || '',
          remarks: t.notes || '',
          raw: t
        };
      });
  }, [tyres, selfVehicles]);

  // Trip Voucher Puncture & Air Repair Entries (own fleet vehicles only)
  const voucherRepairList = useMemo(() => {
    const list = [];
    const selfTruckSet = new Set(selfVehicles.map(v => v.truckNo));
    vouchers.forEach(v => {
      const tNo = (v.truckNo || '').trim().toUpperCase();
      if (!tNo || !selfTruckSet.has(tNo)) return; // Skip market trucks

      const pnc = parseFloat(v.tyrePuncture) || 0;
      const air = (parseFloat(v.tyreGreasingAir) || 0) + (parseFloat(v.tyreAir) || 0);
      const totalRepair = pnc + air;
      if (totalRepair > 0) {
        list.push({
          id: `vch_${v.id}`,
          entryType: 'voucher_repair',
          date: v.date || new Date().toISOString().slice(0, 10),
          truckNo: tNo,
          vehicleType: getVehicleType(tNo),
          position: 'Puncture / Air Service',
          reason: 'puncture_repair',
          condition: 'service',
          brand: 'Trip Voucher',
          newPrice: totalRepair,
          pncAmount: pnc,
          airAmount: air,
          oldDisposal: 'none',
          scrapPrice: 0,
          netCost: totalRepair,
          lrNo: v.lrNo || '',
          billNo: v.billNo || '',
          remarks: `Trip Puncture (${fmtRs(pnc)}) & Air (${fmtRs(air)}) - Bill #${v.billNo || 'N/A'}, LR #${v.lrNo || 'N/A'}`
        });
      }
    });
    return list;
  }, [vouchers, selfVehicles]);

  // Combined Maintenance History
  const combinedHistory = useMemo(() => {
    return [...replacementList, ...voucherRepairList].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [replacementList, voucherRepairList]);

  // Filtered History for Table
  const filteredHistory = useMemo(() => {
    return combinedHistory.filter(item => {
      if (entryTypeFilter !== 'all' && item.entryType !== entryTypeFilter) return false;
      if (truckFilter !== 'all' && item.truckNo !== truckFilter) return false;
      if (reasonFilter !== 'all' && item.reason !== reasonFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTruck = item.truckNo.toLowerCase().includes(q);
        const matchPos = item.position.toLowerCase().includes(q);
        const matchBrand = item.brand.toLowerCase().includes(q);
        const matchRemarks = item.remarks.toLowerCase().includes(q);
        if (!matchTruck && !matchPos && !matchBrand && !matchRemarks) return false;
      }
      return true;
    });
  }, [combinedHistory, entryTypeFilter, truckFilter, reasonFilter, search]);

  // Fleet Summary Map per Vehicle (own fleet vehicles ONLY)
  const vehicleStatsMap = useMemo(() => {
    const map = {};

    // Initialize all self vehicles
    selfVehicles.forEach(v => {
      const vType = getVehicleType(v.truckNo);
      const cfg = VEHICLE_CONFIGS[vType] || VEHICLE_CONFIGS['18'];

      map[v.truckNo] = {
        truckNo: v.truckNo,
        vehicleType: vType,
        config: cfg,
        totalReplacements: 0,
        totalNewCost: 0,
        totalScrapIncome: 0,
        totalPunctureAirCost: 0,
        totalVoucherRepairs: 0,
        netExpense: 0,
        hasNewTyres: false,
        newTyreCount: 0,
        blastedCount: 0,
        lastChangeDate: null,
        lastReason: null
      };
    });

    // Populate with replacements & voucher repairs for self vehicles ONLY
    combinedHistory.forEach(item => {
      const entry = map[item.truckNo];
      if (!entry) return; // Skip market vehicles

      if (item.entryType === 'replacement') {
        entry.totalReplacements += 1;
        entry.totalNewCost += item.newPrice;
        entry.totalScrapIncome += item.scrapPrice;
        entry.netExpense += item.netCost;

        if (item.condition === 'new') {
          entry.hasNewTyres = true;
          entry.newTyreCount += 1;
        }
        if (item.reason === 'blasted') {
          entry.blastedCount += 1;
        }
      } else if (item.entryType === 'voucher_repair') {
        entry.totalVoucherRepairs += 1;
        entry.totalPunctureAirCost += item.netCost;
        entry.netExpense += item.netCost;
      }

      if (!entry.lastChangeDate || new Date(item.date) > new Date(entry.lastChangeDate)) {
        entry.lastChangeDate = item.date;
        entry.lastReason = item.reason;
      }
    });

    return map;
  }, [selfVehicles, combinedHistory]);

  // Overall Header Metrics
  const totalNewCostSum = useMemo(() => replacementList.reduce((s, x) => s + x.newPrice, 0), [replacementList]);
  const totalScrapIncomeSum = useMemo(() => replacementList.reduce((s, x) => s + x.scrapPrice, 0), [replacementList]);
  const totalVunctureAirCostSum = useMemo(() => voucherRepairList.reduce((s, x) => s + x.netCost, 0), [voucherRepairList]);
  const overallNetExpenseSum = useMemo(() => (totalNewCostSum - totalScrapIncomeSum + totalVunctureAirCostSum), [totalNewCostSum, totalScrapIncomeSum, totalVunctureAirCostSum]);
  const totalBlastedCount = useMemo(() => replacementList.filter(x => x.reason === 'blasted').length, [replacementList]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', width: '100%' }}>
        <TruckLoader size={120} text="Loading tyre change records..." />
      </div>
    );
  }

  return (
    <div style={{ width: '100%', paddingBottom: '40px' }}>
      <ConfirmDialog
        open={!!delTarget}
        title="Delete Tyre Record?"
        message={<>Delete tyre change entry for truck <strong style={{ color: 'var(--text)' }}>{delTarget?.truckNo}</strong> ({fmtDate(delTarget?.date)})?</>}
        confirmText="Delete Entry"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDelTarget(null)}
      />

      {/* Page Header */}
      <div className="page-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: '#f59e0b', color: 'white', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wrench size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>Tyre Management & Vehicle History</h1>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
              Log tyre changes, old tyre scrap sales (sold vs stored), and track trip voucher puncture & air expenses.
            </p>
          </div>
        </div>

        <button 
          className="btn btn-p" 
          onClick={() => handleOpenAddModal()} 
          style={{ background: '#f59e0b', color: 'white', padding: '9px 18px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 800, border: 'none', cursor: 'pointer' }}
        >
          <Plus size={18} /> Record Tyre Change
        </button>
      </div>

      {/* Summary Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div className="card" style={{ padding: '16px', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net Tyre Expense</span>
            <div style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '6px', borderRadius: '8px' }}>
              <DollarSign size={16} />
            </div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#6366f1' }}>{fmtRs(overallNetExpenseSum)}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>New tyres - Scrap sales + Puncture repairs</div>
        </div>

        <div className="card" style={{ padding: '16px', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>💰 Scrap Sale Income</span>
            <div style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '6px', borderRadius: '8px' }}>
              <CircleDollarSign size={16} />
            </div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#10b981' }}>{fmtRs(totalScrapIncomeSum)}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Cash received from sold blasted/old tyres</div>
        </div>

        <div className="card" style={{ padding: '16px', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>💥 Blasted Tyres</span>
            <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '6px', borderRadius: '8px' }}>
              <AlertTriangle size={16} />
            </div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#ef4444' }}>{totalBlastedCount}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Tyres replaced due to blasting</div>
        </div>

        <div className="card" style={{ padding: '16px', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Voucher Punctures & Air</span>
            <div style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', padding: '6px', borderRadius: '8px' }}>
              <Wrench size={16} />
            </div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#f59e0b' }}>{fmtRs(totalVunctureAirCostSum)}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>From {voucherRepairList.length} trip voucher entries</div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
        <button
          onClick={() => setActiveTab('vehicles')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 800,
            border: 'none',
            background: activeTab === 'vehicles' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'vehicles' ? 'white' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Truck size={15} /> Fleet Tyre Status ({Object.keys(vehicleStatsMap).length} Trucks)
        </button>

        <button
          onClick={() => setActiveTab('history')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 800,
            border: 'none',
            background: activeTab === 'history' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'history' ? 'white' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <FileText size={15} /> Tyre & Repair History ({filteredHistory.length})
        </button>
      </div>

      {activeTab === 'vehicles' ? (
        /* Fleet Vehicles Tyre Status View */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '16px' }}>
          {Object.values(vehicleStatsMap).map(v => (
            <div key={v.truckNo} className="card" style={{ padding: '18px', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, fontFamily: 'monospace', color: 'var(--primary)' }}>
                      {v.truckNo}
                    </h3>
                    {/* Vehicle Type & Tyre Count Breakdown */}
                    <div style={{ fontSize: '11.5px', color: 'var(--text)', fontWeight: 800, marginTop: '2px' }}>
                      {v.vehicleType === '6' ? '🚚 Canter (6 Tyres + 1 Spare = 7 Total)' : '🚛 Trailer (18 Tyres + 2 Spares = 20 Total)'}
                    </div>
                  </div>

                  {v.hasNewTyres ? (
                    <span style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', padding: '4px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      ⭐ {v.newTyreCount} New
                    </span>
                  ) : v.blastedCount > 0 ? (
                    <span style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '4px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      💥 {v.blastedCount} Blasted
                    </span>
                  ) : null}
                </div>

                {/* Tyre Count & Wheel Breakdown Card */}
                <div style={{ background: 'var(--bg-th)', padding: '10px 12px', borderRadius: '10px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px' }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Mounted Tyres:</span>
                    <strong style={{ color: 'var(--text)' }}>{v.config.mounted} Tyres</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px' }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Spare Tyres:</span>
                    <strong style={{ color: '#10b981' }}>{v.config.spares} Spare Tyre{v.config.spares > 1 ? 's' : ''}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', borderTop: '1px solid var(--border)', paddingTop: '4px', marginTop: '2px' }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 800 }}>Total Wheel Capacity:</span>
                    <strong style={{ color: 'var(--primary)' }}>{v.config.total} Wheels Total</strong>
                  </div>
                </div>

                {/* Stats Breakdown Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px', fontSize: '11.5px' }}>
                  <div style={{ background: 'var(--bg-th)', padding: '8px 10px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Replaced Tyres</div>
                    <div style={{ fontWeight: 900, color: 'var(--text)' }}>{v.totalReplacements} tyres</div>
                  </div>

                  <div style={{ background: 'var(--bg-th)', padding: '8px 10px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Scrap Sales Income</div>
                    <div style={{ fontWeight: 900, color: '#10b981' }}>{fmtRs(v.totalScrapIncome)}</div>
                  </div>

                  <div style={{ background: 'var(--bg-th)', padding: '8px 10px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Voucher Punctures</div>
                    <div style={{ fontWeight: 900, color: '#f59e0b' }}>{fmtRs(v.totalPunctureAirCost)}</div>
                  </div>

                  <div style={{ background: 'var(--bg-th)', padding: '8px 10px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Net Tyre Cost</div>
                    <div style={{ fontWeight: 900, color: '#6366f1' }}>{fmtRs(v.netExpense)}</div>
                  </div>
                </div>

                {v.lastChangeDate && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                    Last activity: <strong style={{ color: 'var(--text)' }}>{fmtDate(v.lastChangeDate)}</strong> {v.lastReason === 'blasted' ? '(💥 Blasted)' : ''}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-g"
                  onClick={() => setVehicleHistoryModal(v.truckNo)}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', border: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  <Eye size={14} /> View History
                </button>
                <button
                  className="btn btn-p"
                  onClick={() => handleOpenAddModal(v.truckNo)}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', background: '#f59e0b', color: 'white', border: 'none', cursor: 'pointer' }}
                >
                  <Plus size={14} /> Record Change
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* History Search & Filter View */
        <>
          <div className="card" style={{ padding: '12px 16px', marginBottom: '16px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
              <Search size={16} color="var(--text-muted)" />
              <input
                type="text"
                placeholder="Search truck no, position, brand, remarks, LR/Bill No..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--text)', fontSize: '13px', width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Entry Type Filter */}
              <select
                value={entryTypeFilter}
                onChange={e => setEntryTypeFilter(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '8px', fontSize: '12px', background: 'var(--bg-th)', color: 'var(--text)', border: '1px solid var(--border)', fontWeight: 600 }}
              >
                <option value="all">All Entry Types</option>
                <option value="replacement">🆕 Tyre Replacements</option>
                <option value="voucher_repair">🔧 Voucher Punctures & Air</option>
              </select>

              {/* Truck Selector Filter */}
              <select
                value={truckFilter}
                onChange={e => setTruckFilter(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '8px', fontSize: '12px', background: 'var(--bg-th)', color: 'var(--text)', border: '1px solid var(--border)', fontWeight: 600 }}
              >
                <option value="all">All Vehicles</option>
                {selfVehicles.map(v => (
                  <option key={v.truckNo} value={v.truckNo}>{v.truckNo}</option>
                ))}
              </select>

              {/* Reason Filter */}
              <select
                value={reasonFilter}
                onChange={e => setReasonFilter(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '8px', fontSize: '12px', background: 'var(--bg-th)', color: 'var(--text)', border: '1px solid var(--border)', fontWeight: 600 }}
              >
                <option value="all">All Reasons</option>
                <option value="blasted">💥 Blasted / Burst</option>
                <option value="damaged">⚠️ Damaged</option>
                <option value="worn">🔄 Worn Out</option>
                <option value="upgrade">🆕 Upgrade</option>
                <option value="puncture_repair">🔧 Voucher Puncture/Air</option>
              </select>

              {(search || entryTypeFilter !== 'all' || truckFilter !== 'all' || reasonFilter !== 'all') && (
                <button
                  onClick={() => { setSearch(''); setEntryTypeFilter('all'); setTruckFilter('all'); setReasonFilter('all'); }}
                  style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <X size={14} /> Clear
                </button>
              )}
            </div>
          </div>

          {/* History Table */}
          <div className="card tbl-wrap" style={{ borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-th)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>
                Tyre Change & Repair Log ({filteredHistory.length} entries)
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-th)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 14px', fontWeight: 800, width: '40px' }}>#</th>
                    <th style={{ padding: '10px 14px', fontWeight: 800 }}>DATE</th>
                    <th style={{ padding: '10px 14px', fontWeight: 800 }}>TRUCK NO</th>
                    <th style={{ padding: '10px 14px', fontWeight: 800 }}>EVENT / REASON</th>
                    <th style={{ padding: '10px 14px', fontWeight: 800 }}>POSITION / AXLE</th>
                    <th style={{ padding: '10px 14px', fontWeight: 800 }}>NEW COST / REPAIR</th>
                    <th style={{ padding: '10px 14px', fontWeight: 800 }}>OLD TYRE DISPOSAL</th>
                    <th style={{ padding: '10px 14px', fontWeight: 800 }}>NET COST</th>
                    <th style={{ padding: '10px 14px', fontWeight: 800 }}>REMARKS / REFERENCES</th>
                    <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'center' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                        No tyre replacement or puncture repair entries found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((item, index) => {
                      const isBlasted = item.reason === 'blasted';
                      const isVoucher = item.entryType === 'voucher_repair';
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', background: isBlasted ? 'rgba(239,68,68,0.02)' : isVoucher ? 'rgba(245,158,11,0.02)' : 'transparent' }}>
                          <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>{index + 1}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 700 }}>{fmtDate(item.date)}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 900, color: 'var(--primary)', fontFamily: 'monospace', fontSize: '13px' }}>
                            {item.truckNo}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {isBlasted ? (
                              <span style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                💥 Blasted
                              </span>
                            ) : isVoucher ? (
                              <span style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                🔧 Puncture / Air
                              </span>
                            ) : item.reason === 'damaged' ? (
                              <span style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                ⚠️ Damaged
                              </span>
                            ) : item.reason === 'upgrade' ? (
                              <span style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                🆕 Upgrade
                              </span>
                            ) : (
                              <span style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.3)', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                🔄 Worn Out
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text)' }}>
                            {item.position}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 800 }}>{fmtRs(item.newPrice)}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.brand}</div>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {isVoucher ? (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
                            ) : item.oldDisposal === 'sold' ? (
                              <div>
                                <span style={{ color: '#10b981', fontWeight: 800, fontSize: '12px' }}>💰 Sold for {fmtRs(item.scrapPrice)}</span>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Scrap income credit</div>
                              </div>
                            ) : item.oldDisposal === 'stored' ? (
                              <span style={{ color: '#6366f1', fontWeight: 700, fontSize: '11.5px' }}>📦 Stored in Yard</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>🗑️ Discarded (₹0)</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 900, color: '#6366f1' }}>
                            {fmtRs(item.netCost)}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '11.5px', maxWidth: '240px' }}>
                            {item.remarks || '—'}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            {!isVoucher ? (
                              <button
                                onClick={() => setDelTarget(item)}
                                title="Delete Record"
                                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '5px 8px', borderRadius: '6px', cursor: 'pointer' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : (
                              <span title="Trip voucher entries are managed in Vouchers Module" style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Voucher</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Record Tyre Replacement Modal */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '540px', borderRadius: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 20px 50px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
            <div style={{ background: '#f59e0b', color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Wrench size={20} />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900 }}>Record Tyre Change</h3>
              </div>
              <button onClick={() => setModalOpen(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                
                {/* Truck Selection & Vehicle Type */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                      Truck No. *
                    </label>
                    <AutocompleteInput
                      value={form.truckNo}
                      onChange={e => handleTruckChange(e.target.value)}
                      suggestions={selfVehicles.map(v => v.truckNo)}
                      placeholder="Select Truck (e.g. HR63E9632)"
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                      Vehicle Wheel Config
                    </label>
                    <select
                      className="fi"
                      value={form.vehicleType}
                      onChange={e => {
                        const vType = e.target.value;
                        const cfg = VEHICLE_CONFIGS[vType] || VEHICLE_CONFIGS['18'];
                        setForm(f => ({ ...f, vehicleType: vType, position: cfg.positions[0] }));
                      }}
                      style={{ fontSize: '12px', fontWeight: 700 }}
                    >
                      <option value="18">🚛 Trailer (18 + 2 Spares = 20)</option>
                      <option value="6">🚚 Canter (6 + 1 Spare = 7)</option>
                    </select>
                  </div>
                </div>

                {/* Replacement Reason */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Reason for Replacement *
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {REASONS.map(r => (
                      <button
                        type="button"
                        key={r.id}
                        onClick={() => setForm(f => ({ ...f, reason: r.id }))}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '8px',
                          fontSize: '11.5px',
                          fontWeight: form.reason === r.id ? 900 : 600,
                          border: form.reason === r.id ? '2px solid #f59e0b' : '1px solid var(--border)',
                          background: form.reason === r.id ? 'rgba(245,158,11,0.12)' : 'var(--bg-th)',
                          color: form.reason === r.id ? '#f59e0b' : 'var(--text)',
                          textAlign: 'left',
                          cursor: 'pointer'
                        }}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Position / Axle */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                    Tyre Position / Axle Location *
                  </label>
                  <select
                    className="fi"
                    value={form.position}
                    onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                    required
                    style={{ fontSize: '12.5px', fontWeight: 700 }}
                  >
                    {(VEHICLE_CONFIGS[form.vehicleType] || VEHICLE_CONFIGS['18']).positions.map(pos => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                </div>

                {/* New Tyre Condition & Brand */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                      New Tyre Condition *
                    </label>
                    <select
                      className="fi"
                      value={form.condition}
                      onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}
                      style={{ fontSize: '12px', fontWeight: 700 }}
                    >
                      {CONDITIONS.map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                      Brand / Company
                    </label>
                    <select
                      className="fi"
                      value={form.brand}
                      onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                      style={{ fontSize: '12px', fontWeight: 700 }}
                    >
                      {BRANDS.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Date & New Tyre Cost */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                      Date of Replacement *
                    </label>
                    <input
                      type="date"
                      className="fi"
                      value={form.date}
                      onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                      New Tyre Price (₹) *
                    </label>
                    <input
                      type="number"
                      className="fi"
                      placeholder="e.g. 24000"
                      value={form.newPrice}
                      onChange={e => setForm(f => ({ ...f, newPrice: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                {/* Old / Blasted Tyre Disposal Options */}
                <div style={{ background: 'var(--bg-th)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Old / Blasted Tyre Disposal
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                    {DISPOSAL_OPTIONS.map(d => (
                      <button
                        type="button"
                        key={d.id}
                        onClick={() => setForm(f => ({ ...f, oldDisposal: d.id }))}
                        style={{
                          padding: '7px 8px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: form.oldDisposal === d.id ? 900 : 600,
                          border: form.oldDisposal === d.id ? '2px solid #10b981' : '1px solid var(--border)',
                          background: form.oldDisposal === d.id ? 'rgba(16,185,129,0.12)' : 'var(--bg-card)',
                          color: form.oldDisposal === d.id ? '#10b981' : 'var(--text)',
                          textAlign: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>

                  {form.oldDisposal === 'sold' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#10b981', marginBottom: '4px' }}>
                        Scrap Sale Amount Received (₹) *
                      </label>
                      <input
                        type="number"
                        className="fi"
                        placeholder="e.g. 1500 (enter sale price)"
                        value={form.scrapPrice}
                        onChange={e => setForm(f => ({ ...f, scrapPrice: e.target.value }))}
                        required={form.oldDisposal === 'sold'}
                      />
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Net cost will be: <strong>{fmtRs((parseFloat(form.newPrice) || 0) - (parseFloat(form.scrapPrice) || 0))}</strong>
                      </div>
                    </div>
                  )}
                </div>

                {/* Vendor / Remarks */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                    Remarks / Shop Name
                  </label>
                  <input
                    type="text"
                    className="fi"
                    placeholder="e.g. Bought from MRF Shop, Jaipur Highway"
                    value={form.remarks}
                    onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button type="button" className="btn btn-g" onClick={() => setModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-p" disabled={saving} style={{ background: '#f59e0b', border: 'none', color: 'white', fontWeight: 800 }}>
                    {saving ? 'Saving...' : 'Save Tyre Record'}
                  </button>
                </div>

              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vehicle Detailed Tyre History Modal */}
      {vehicleHistoryModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '780px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', borderRadius: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
            <div style={{ background: 'var(--primary)', color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, fontFamily: 'monospace' }}>
                  {vehicleHistoryModal} — Full Tyre & Maintenance History
                </h3>
                <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '2px' }}>
                  {vehicleStatsMap[vehicleHistoryModal]?.config.name} ({vehicleStatsMap[vehicleHistoryModal]?.config.mounted} Mounted + {vehicleStatsMap[vehicleHistoryModal]?.config.spares} Spare = {vehicleStatsMap[vehicleHistoryModal]?.config.total} Total Wheels)
                </div>
              </div>
              <button onClick={() => setVehicleHistoryModal(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              {/* Vehicle Tyre Summary Bar */}
              {(() => {
                const stat = vehicleStatsMap[vehicleHistoryModal];
                if (!stat) return null;
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', background: 'var(--bg-th)', padding: '12px', borderRadius: '10px', marginBottom: '16px', fontSize: '12px' }}>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Replaced Tyres</div>
                      <div style={{ fontWeight: 900, fontSize: '15px', color: 'var(--text)' }}>{stat.totalReplacements} tyres</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Scrap Income</div>
                      <div style={{ fontWeight: 900, fontSize: '15px', color: '#10b981' }}>{fmtRs(stat.totalScrapIncome)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Voucher Punctures</div>
                      <div style={{ fontWeight: 900, fontSize: '15px', color: '#f59e0b' }}>{fmtRs(stat.totalPunctureAirCost)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Net Expense</div>
                      <div style={{ fontWeight: 900, fontSize: '15px', color: '#6366f1' }}>{fmtRs(stat.netExpense)}</div>
                    </div>
                  </div>
                );
              })()}

              <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
                Timeline of Tyre Replacements & Trip Punctures
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {combinedHistory.filter(x => x.truckNo === vehicleHistoryModal).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                    No tyre change or repair records logged for truck {vehicleHistoryModal} yet.
                  </div>
                ) : (
                  combinedHistory.filter(x => x.truckNo === vehicleHistoryModal).map(item => (
                    <div key={item.id} style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-th)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 800, fontSize: '12.5px' }}>{fmtDate(item.date)}</span>
                          {item.reason === 'blasted' ? (
                            <span style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', padding: '2px 8px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 900 }}>💥 Blasted</span>
                          ) : item.entryType === 'voucher_repair' ? (
                            <span style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', padding: '2px 8px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 900 }}>🔧 Voucher Repair</span>
                          ) : (
                            <span style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', padding: '2px 8px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 900 }}>🆕 Replacement</span>
                          )}
                        </div>

                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>
                          {item.position} {item.brand ? `(${item.brand})` : ''}
                        </div>

                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {item.remarks}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        {item.entryType === 'replacement' ? (
                          <>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>New Tyre: {fmtRs(item.newPrice)}</div>
                            {item.oldDisposal === 'sold' && (
                              <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 700 }}>Scrap Sold: -{fmtRs(item.scrapPrice)}</div>
                            )}
                            <div style={{ fontSize: '14px', fontWeight: 900, color: '#6366f1', marginTop: '2px' }}>Net: {fmtRs(item.netCost)}</div>
                          </>
                        ) : (
                          <div style={{ fontSize: '14px', fontWeight: 900, color: '#f59e0b' }}>
                            {fmtRs(item.netCost)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-th)', textAlign: 'right' }}>
              <button className="btn btn-g" onClick={() => setVehicleHistoryModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
