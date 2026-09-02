import React, { useState, useEffect, useMemo } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Plus, ArrowDownCircle, ArrowUpCircle, Trash2,
  AlertTriangle, X, Check, RefreshCw, Wallet, CreditCard,
  TrendingDown, Smartphone, FileText, Filter, Download, Printer, Search, Loader2,
  User, Truck, RotateCcw, Users
} from 'lucide-react';
import ConfirmSaveModal from '../components/ConfirmSaveModal';
import { exportToExcel, exportToPDF, buildExportRows } from '../utils/exportUtils';
import Pagination from '../components/Pagination';
import useFormShortcuts, { markInvalidFields } from '../hooks/useFormShortcuts';
import { getSticky, rememberSticky } from '../utils/stickyDefaults';
import TableScroll from '../components/TableScroll';

const PAGE_SIZE = 20;

const fmtRs = n => 'Rs.' + Math.abs(Math.round(n)).toLocaleString('en-IN');
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const API_V = `/vouchers`;

/* ── sub-components (module scope so parent re-renders don't remount them) ── */
const DelConfirm = ({ id, label, apiCb, onClose, onDone }) => {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await ax.delete(apiCb + '/' + id); onDone(); }
    catch (e) { alert(e.response?.data?.error || 'Delete failed'); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div initial={{ opacity: 0, scale: 0.93 }} animate={{ opacity: 1, scale: 1 }} style={{ width: '90%', maxWidth: '320px', background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: '16px', padding: '26px 22px', textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <AlertTriangle size={24} color="var(--danger)" />
        </div>
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>Delete Entry?</div>
        <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginBottom: '20px' }}>{label}</div>
        <div style={{ display: 'flex', gap: '9px', justifyContent: 'center' }}>
          <button className="btn btn-g" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-d" onClick={go} disabled={busy} title="Confirm Delete">{busy ? <Loader2 size={13} className="spin" /> : <><Trash2 size={13} /> Delete</>}</button>
        </div>
      </motion.div>
    </div>
  );
};

// Sentinel for "someone not on the roster". Not an entity key, so it cannot
// collide with a real `type::id`.
const CUSTOM_KEY = '__custom__';

const QuickProfileModal = ({ isOpen, onClose, onCreated }) => {
  const [qForm, setQForm] = useState({ name: '', type: 'Expense', phone: '', department: '' });
  const [qSaving, setQSaving] = useState(false);
  const [qErr, setQErr] = useState('');

  if (!isOpen) return null;

  const handleQSubmit = async (e) => {
    e.preventDefault();
    if (!qForm.name.trim()) { setQErr('Profile name is required'); return; }
    setQSaving(true); setQErr('');
    try {
      if (qForm.type === 'Vehicle') {
        const truckNo = qForm.name.trim().toUpperCase();
        const res = await ax.post('/vehicles', { truckNo, ownerName: qForm.department || 'Office' });
        onCreated({ entityType: 'vehicle', entityId: res.data.truckNo || truckNo, name: res.data.truckNo || truckNo, raw: res.data });
      } else {
        const res = await ax.post('/profiles', { name: qForm.name.trim(), type: qForm.type, phone: qForm.phone, department: qForm.department });
        const pType = qForm.type === 'Driver' ? 'driver' : 'staff';
        onCreated({ entityType: pType, entityId: res.data.id, name: res.data.name, raw: res.data });
      }
      onClose();
    } catch (err) {
      setQErr(err.response?.data?.error || 'Failed to create profile');
    } finally { setQSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ width: '90%', maxWidth: '400px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={18} color="var(--primary)" /> Quick Create Profile
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <form onSubmit={handleQSubmit}>
          <div className="fg" style={{ gap: '12px' }}>
            <div className="field-h">
              <label>Profile Name *</label>
              <input className="fi" type="text" placeholder="e.g. Office Spend, Ramesh Driver, Tea Vendor, Mechanic" value={qForm.name} onChange={e => setQForm(f => ({ ...f, name: e.target.value }))} autoFocus required />
            </div>
            <div className="field-h">
              <label>Profile Category *</label>
              <select className="fi" value={qForm.type} onChange={e => setQForm(f => ({ ...f, type: e.target.value }))}>
                <option value="Expense">🏢 Office Spend / Expense</option>
                <option value="Driver">👨‍✈️ Driver</option>
                <option value="Office Staff">👨‍💼 Office Staff</option>
                <option value="Labour">👷 Labour</option>
                <option value="Vehicle">🚛 Vehicle</option>
                <option value="Others">👤 Others / Other Staff</option>
              </select>
            </div>
            <div className="field-h">
              <label>Phone / Details (Optional)</label>
              <input className="fi" type="text" placeholder="e.g. Phone or department" value={qForm.phone} onChange={e => setQForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            {qErr && <div style={{ color: 'var(--danger)', fontSize: '12px', fontWeight: 700 }}>{qErr}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <button type="button" className="btn" style={{ border: '1px solid var(--border)', background: 'transparent' }} onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-p" disabled={qSaving}>{qSaving ? <Loader2 size={14} className="spin" /> : 'Save & Select'}</button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const ProfileSearchSelect = ({ value, onChange, profiles = [], drivers = [], vehicles = [], staffList = [], onOpenQuickModal, mode = 'all' }) => {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = React.useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const expenseProfiles = useMemo(() => profiles.filter(p => p.type === 'Expense' || p.name?.toLowerCase().includes('office') || p.name?.toLowerCase().includes('spend')), [profiles]);

  const driverProfiles = useMemo(() => profiles.filter(p => (p.type === 'Driver' || p.department === 'Driver') && !expenseProfiles.some(e => e.id === p.id)), [profiles, expenseProfiles]);

  const staffProfiles = useMemo(() => profiles.filter(p =>
    !expenseProfiles.some(e => e.id === p.id) &&
    !driverProfiles.some(d => d.id === p.id) &&
    (p.type === 'Office Staff' || p.type === 'Staff' || p.type === 'Labour' || p.department === 'Office' || p.department === 'Accountant' || p.department === 'Electrician' || p.department === 'Labour')
  ), [profiles, expenseProfiles, driverProfiles]);

  const otherProfiles = useMemo(() => profiles.filter(p =>
    !expenseProfiles.some(e => e.id === p.id) &&
    !driverProfiles.some(d => d.id === p.id) &&
    !staffProfiles.some(s => s.id === p.id)
  ), [profiles, expenseProfiles, driverProfiles, staffProfiles]);

  const allOptions = useMemo(() => {
    const list = [];
    // Person cash-out must pick a real driver/staff — Office Spend is its own kind.
    if (mode !== 'person') {
      expenseProfiles.forEach(s => list.push({ key: `staff::${s.id}`, label: s.name, sub: 'Office Spend', category: '🏢 Office Spend / Expenses' }));
    }
    driverProfiles.forEach(d => list.push({ key: `driver::${d.id}`, label: d.name, sub: d.vehicleNo ? `Truck: ${d.vehicleNo}` : 'Driver', category: '👨‍✈️ Drivers' }));
    if (mode !== 'person') {
      vehicles.forEach(v => list.push({ key: `vehicle::${v.truckNo}`, label: v.truckNo, sub: v.ownerName || v.driverName || 'Vehicle', category: '🚛 Vehicles' }));
    }
    staffProfiles.forEach(s => list.push({ key: `staff::${s.id}`, label: s.name, sub: s.department || 'Staff', category: '👨‍💼 Staff Members & Labour' }));
    otherProfiles.forEach(s => list.push({ key: `staff::${s.id}`, label: s.name, sub: s.type || s.department || 'Others', category: '👤 Others / Other Profiles' }));
    return list;
  }, [expenseProfiles, driverProfiles, vehicles, staffProfiles, otherProfiles, mode]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return allOptions;
    const q = search.toLowerCase();
    return allOptions.filter(o => o.label.toLowerCase().includes(q) || o.sub.toLowerCase().includes(q) || o.category.toLowerCase().includes(q));
  }, [allOptions, search]);

  const selectedOpt = allOptions.find(o => o.key === value);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <label style={{ marginBottom: 0 }}>{mode === 'person' ? 'Choose profile *' : 'Give Cash To (Select Profile) *'}</label>
        <button type="button" className="btn btn-g btn-sm" onClick={onOpenQuickModal} style={{ fontSize: '11px', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Plus size={12} /> Quick Profile
        </button>
      </div>

      <div style={{ position: 'relative' }}>
        <input
          type="text"
          className="fi"
          placeholder={selectedOpt ? `${selectedOpt.label} (${selectedOpt.sub})` : (mode === 'person' ? '🔍 Type driver or staff name…' : '🔍 Type to search profile, driver, staff, vehicle...')}
          value={isOpen ? search : (selectedOpt ? `${selectedOpt.label} (${selectedOpt.sub})` : '')}
          onChange={e => { setSearch(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          style={{ paddingLeft: '32px', fontWeight: selectedOpt && !isOpen ? 700 : 400, color: selectedOpt && !isOpen ? 'var(--primary)' : 'var(--text)' }}
        />
        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        {selectedOpt && !isOpen && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(''); setSearch(''); setIsOpen(true); }}
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px' }}
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: 'var(--bg-card)', border: '1px solid var(--primary)', borderRadius: '10px', marginTop: '4px', maxHeight: '250px', overflowY: 'auto', boxShadow: '0 12px 30px rgba(0,0,0,0.2)' }}>
          <div style={{ padding: '6px 10px', background: 'var(--bg-th)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{filteredOptions.length} Profiles Available</span>
            <span>Click to Select</span>
          </div>
          {filteredOptions.length === 0 ? (
            <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
              No profiles found for "{search}".
              <div style={{ marginTop: '8px' }}>
                <button type="button" className="btn btn-p btn-sm" onClick={() => { setIsOpen(false); onOpenQuickModal(); }}>
                  <Plus size={12} /> Create "{search}" as Quick Profile
                </button>
              </div>
            </div>
          ) : (
            filteredOptions.map(opt => (
              <div
                key={opt.key}
                onClick={() => { onChange(opt.key); setIsOpen(false); setSearch(''); }}
                style={{
                  padding: '9px 12px', borderBottom: '1px solid var(--border-row)', cursor: 'pointer',
                  background: opt.key === value ? 'rgba(99,102,241,0.14)' : 'transparent',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: opt.key === value ? 'var(--primary)' : 'var(--text)' }}>{opt.label}</div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '1px' }}>{opt.category} • {opt.sub}</div>
                </div>
                {opt.key === value && <Check size={16} color="var(--primary)" />}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const EntryForm = ({ type, apiCb, onSave, onCancel, drivers, staffList, vehicles, profiles = [], onQuickProfileCreated }) => {
  const officeProf = useMemo(() => profiles.find(p => p.name?.toLowerCase().includes('office spend') || p.name?.toLowerCase().includes('office expense')) || profiles.find(p => p.type === 'Expense'), [profiles]);

  const [form, setForm] = useState({ amount: '', date: getSticky('cashbook.date', new Date().toISOString().slice(0, 10)), remark: '', entityKey: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [showQuickModal, setShowQuickModal] = useState(false);
  const isDeposit = type === 'deposit';
  const isOffice = type === 'office_spend';
  const isPersonCash = type === 'cash_out';

  const parseEntityKey = (key) => {
    if (!key) return {};
    const [entityType, entityId] = key.split('::');
    let entityName = '';
    if (entityType === 'driver') entityName = drivers.find(d => d.id === entityId)?.name || profiles.find(p => p.id === entityId)?.name || '';
    else if (entityType === 'staff') entityName = profiles.find(s => s.id === entityId)?.name || staffList.find(s => s.id === entityId)?.name || '';
    else if (entityType === 'vehicle') entityName = vehicles.find(v => v.truckNo === entityId)?.truckNo || entityId;
    return { entityType, entityId, entityName };
  };

  const requestSave = () => {
    setErr('');
    if (markInvalidFields(formRef.current)) return;
    if (!form.amount || parseFloat(form.amount) <= 0) { setErr('Enter a valid amount'); return; }
    if (isPersonCash && !form.entityKey) { setErr('Select the driver or staff profile'); return; }
    if (isPersonCash) {
      const e = parseEntityKey(form.entityKey);
      if (e.entityType !== 'driver' && e.entityType !== 'staff') {
        setErr('Cash out must be on a driver or staff profile'); return;
      }
    }
    if (isOffice && !officeProf) { setErr('Office Spend profile missing'); return; }
    setIsConfirming(true);
  };
  const handleFormRequest = e => { e.preventDefault(); requestSave(); };

  const formRef = useFormShortcuts({
    onSave: requestSave,
    onCancel,
    enabled: !isConfirming,
  });

  const executeSave = async () => {
    setSaving(true); setIsConfirming(false);
    try {
      if (isDeposit) {
        await ax.post(apiCb + '/deposit', { amount: form.amount, date: form.date, remark: form.remark });
      } else if (isOffice) {
        await ax.post(apiCb + '/cash-out-linked', {
          amount: form.amount, date: form.date, remark: form.remark,
          entityType: 'expense',
          entityId: officeProf.id,
          entityName: officeProf.name || 'Office Spend',
        });
      } else {
        const entity = parseEntityKey(form.entityKey);
        await ax.post(apiCb + '/cash-out-linked', { amount: form.amount, date: form.date, remark: form.remark, ...entity });
      }
      rememberSticky('cashbook.date', form.date);
      setForm({ amount: '', date: form.date, remark: '', entityKey: '' }); onSave();
    }
    catch (e) { setErr(e.response?.data?.error || e.message || 'Error'); }
    finally { setSaving(false); }
  };

  const selectedEntity = parseEntityKey(form.entityKey);
  const confirmMsg = isDeposit
    ? `Are you sure you want to save this Deposit of Rs.${form.amount}?`
    : isOffice
      ? `Office Spend of Rs.${form.amount} (company expense).`
      : `Cash Out of Rs.${form.amount} to ${selectedEntity.entityName}.\n\nThis is added as an Advance on their Pay balance.`;

  const handleQuickCreated = (newEntity) => {
    if (onQuickProfileCreated) onQuickProfileCreated(newEntity);
    const key = `${newEntity.entityType}::${newEntity.entityId}`;
    setForm(f => ({ ...f, entityKey: key }));
  };

  return (
    <motion.div ref={formRef} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ background: 'var(--bg-card)', border: `1px solid ${isDeposit ? 'rgba(16,185,129,0.25)' : isOffice ? 'rgba(245,158,11,0.35)' : 'rgba(244,63,94,0.25)'}`, borderRadius: '14px', padding: '18px 20px', marginBottom: '14px' }}>
      <QuickProfileModal isOpen={showQuickModal} onClose={() => setShowQuickModal(false)} onCreated={handleQuickCreated} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '14px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDeposit ? 'rgba(16,185,129,0.12)' : isOffice ? 'rgba(245,158,11,0.12)' : 'rgba(244,63,94,0.1)' }}>
          {isDeposit ? <ArrowDownCircle size={16} color="var(--accent)" /> : isOffice ? <Wallet size={16} color="#f59e0b" /> : <ArrowUpCircle size={16} color="var(--danger)" />}
        </div>
        <span style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text)' }}>{isDeposit ? 'Add Deposit' : isOffice ? 'Office Spend' : 'Cash Out'}</span>
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Enter = next · Ctrl+S = save · Esc = close</span>
      </div>
      <form onSubmit={handleFormRequest}>
        <div className="fg fg-2" style={{ gap: '14px' }}>
          {isPersonCash && (
            <div style={{ gridColumn: '1 / -1' }}>
              <ProfileSearchSelect
                mode="person"
                value={form.entityKey}
                onChange={key => setForm(f => ({ ...f, entityKey: key }))}
                profiles={profiles}
                drivers={drivers}
                vehicles={vehicles}
                staffList={staffList}
                onOpenQuickModal={() => setShowQuickModal(true)}
              />
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#0ea5e9', marginTop: '6px' }}>
                Amount is posted as an Advance on this profile in Pay.
              </div>
            </div>
          )}
          <div className="field-h">
            <label>Amount (Rs.) *</label>
            <input className="fi" type="number" step="0.01" placeholder="0" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="field-h">
            <label>Date *</label>
            <input className="fi" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
          </div>
          <div className="field-h" style={{ gridColumn: '1 / -1' }}>
            <label>Remark</label>
            <input className="fi" type="text" placeholder={isDeposit ? 'e.g. Opening balance' : isOffice ? 'e.g. Electricity, stationery, tea' : 'e.g. Cash given to driver'} value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} />
          </div>
          {err && <div className="field-error" style={{ gridColumn: '1 / -1', color: 'var(--danger)', fontSize: '12px', fontWeight: 700 }}>{err}</div>}
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <button type="button" className="btn" style={{ border: '1px solid var(--border)', background: 'transparent' }} onClick={onCancel}>Cancel</button>
            <button type="submit" className={`btn ${isDeposit ? 'btn-a' : 'btn-d'}`} style={{ fontWeight: 800 }} disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : 'Confirm Save'}
            </button>
          </div>
        </div>
      </form>
      <ConfirmSaveModal isOpen={isConfirming} onClose={() => setIsConfirming(false)} onConfirm={executeSave} title={isDeposit ? 'Confirm Deposit' : isOffice ? 'Confirm Office Spend' : 'Confirm Cash Out'} message={confirmMsg} isSaving={saving} />
    </motion.div>
  );
};

/* ══════ MAIN ══════ */
export default function CashbookModule({ initialTab, moduleType, role = 'user', permissions = {} }) {
  /* ── local state ── */
  const API_CB = moduleType === 'jkl' ? `/jkl/cashbook` : `/cashbook`;
  const VTYPES = moduleType === 'jkl' ? ['JK_Lakshmi', 'JK_Super', 'Dump'] : ['Dump', 'JK_Super', 'JK_Lakshmi'];

  const [cbEntries, setCbEntries] = useState([]);
  const [allVouchers, setAllVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('ledger');
  const [showForm, setShowForm] = useState(null); // 'deposit' | 'cash_out' | 'office_spend' | null
  const [delTarget, setDelTarget] = useState(null);
  const [onlinePaidTarget, setOnlinePaidTarget] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [profiles, setProfiles] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [returnTarget, setReturnTarget] = useState(null); // { id, label, date, remark }

  const drivers = useMemo(() => profiles.filter(p => p.type === 'Driver'), [profiles]);
  const staffList = useMemo(() => profiles.filter(p => p.type === 'Office Staff' || p.type === 'Labour'), [profiles]);

  /* Filter states */
  const [fSearch, setFSearch] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [fPaid, setFPaid] = useState('all');

  const onTabChange = (t) => {
    setTab(t);
    setCurrentPage(1);
  };

  const onFilterChange = (setter, val) => {
    setter(val);
    setCurrentPage(1);
  };

  useEffect(() => {
    if (initialTab) onTabChange(initialTab);
  }, [initialTab]);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [cb, profs, vehs, ...voucherArrays] = await Promise.all([
        ax.get(API_CB).then(r => r.data),
        ax.get('/profiles').then(r => r.data).catch(() => []),
        ax.get('/vehicles').then(r => r.data).catch(() => []),
        ...VTYPES.map(t => ax.get(`/vouchers/${t}`).then(r =>
          r.data.map(v => ({ ...v, vType: t }))
        )),
      ]);
      setCbEntries(cb);
      setVehicles(vehs);
      setAllVouchers(voucherArrays.flat());

      let updatedProfs = Array.isArray(profs) ? profs : [];
      const hasOfficeSpend = updatedProfs.some(p => p.name?.toLowerCase().includes('office spend') || p.name?.toLowerCase().includes('office expense'));
      if (!hasOfficeSpend) {
        try {
          const created = (await ax.post('/profiles', { name: 'Office Spend', type: 'Expense', department: 'Office' })).data;
          if (created && created.id) updatedProfs = [created, ...updatedProfs];
        } catch (err) {
          console.warn('Auto-create Office Spend profile fallback:', err);
          updatedProfs = [{ id: 'office_spend', name: 'Office Spend', type: 'Expense', department: 'Office' }, ...updatedProfs];
        }
      }
      setProfiles(updatedProfs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  /* ── Derived voucher lists ── */

  /**
   * Get the real LR number label for a voucher.
   * For multi-delivery vouchers, LR numbers live on the drops; the top-level
   * `lrNo` is a parent reference (often blank). We surface the real numbers so
   * the cashbook matches what the driver and the party see on the load slip.
   */
  const getVoucherLrLabel = (v) => {
    if (v.deliveries && v.deliveries.length > 0) {
      const dlrNos = v.deliveries.map(d => d.lrNo).filter(Boolean);
      if (dlrNos.length > 0) return dlrNos.join(', ');
    }
    return v.lrNo || '?';
  };

  const voucherCashAdv = useMemo(() =>
    allVouchers
      .filter(v => parseFloat(v.advanceCash) > 0 || parseFloat(v.extraCash) > 0)
      .map(v => {
        const lrLabel = getVoucherLrLabel(v);
        const advCash = parseFloat(v.advanceCash) || 0;
        const extraCash = parseFloat(v.extraCash) || 0;
        const totalCash = advCash + extraCash;
        // Build a readable sub-note when extra cash is present alongside the advance.
        // "Advance Rs.X + Extra Rs.Y" lets the cashbook explain the combined total
        // without needing a second row for the same trip.
        let breakdownNote = '';
        if (advCash > 0 && extraCash > 0) {
          const extraLabel = v.extraCashRemark ? `Extra (${v.extraCashRemark})` : 'Extra Cash';
          breakdownNote = `Advance Rs.${Math.round(advCash).toLocaleString('en-IN')} + ${extraLabel} Rs.${Math.round(extraCash).toLocaleString('en-IN')}`;
        } else if (extraCash > 0) {
          breakdownNote = v.extraCashRemark ? `Extra Cash (${v.extraCashRemark})` : 'Extra Cash';
        }
        return {
          id: 'v_cash_' + v.id,
          voucherId: v.id,
          date: v.date,
          type: 'voucher_cash',
          amount: -totalCash,
          remark: `Cash Advance — Truck ${v.truckNo || '?'} | LR #${lrLabel} [${v.vType}]`,
          breakdownNote,
          advanceCash: advCash,
          extraCash,
          truckNo: v.truckNo,
          lrNo: lrLabel,
          vType: v.vType,
          createdBy: v.createdBy,
          updatedBy: v.updatedBy
        };
      })
      .sort((a, b) => b.date > a.date ? 1 : -1),
    [allVouchers]);

  // Vehicle expenses from vouchers (tyre puncture, greasing/air only).
  // Extra cash is now merged into the cash advance row above so it is not
  // double-counted here as a separate cashbook entry.
  const voucherVehicleExpenses = useMemo(() => {
    const expenses = [];
    allVouchers.forEach(v => {
      const lrLabel = getVoucherLrLabel(v);
      // Also check old separate fields for backward compatibility
      const greasingAmt = (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0);
      if (greasingAmt > 0 && !parseFloat(v.tyreGreasingAir)) {
        expenses.push({
          id: `v_tyreGA_${v.id}`, voucherId: v.id, date: v.date, type: 'voucher_expense',
          amount: -greasingAmt, remark: `Tyre Greasing & Air — Truck ${v.truckNo || '?'} | LR #${lrLabel}`,
          truckNo: v.truckNo, lrNo: lrLabel, vType: v.vType,
        });
      }
      const fields = [
        { key: 'tyrePuncture', label: 'Tyre Puncture' },
        { key: 'tyreGreasingAir', label: 'Tyre Greasing & Air' },
        // extraCash is intentionally excluded here — it is now bundled with the
        // cash advance row in voucherCashAdv so the ledger shows one combined line
        // per trip instead of a fragmented second entry.
      ];
      fields.forEach(f => {
        const amt = parseFloat(v[f.key]) || 0;
        if (amt > 0) {
          expenses.push({
            id: `v_${f.key}_${v.id}`,
            voucherId: v.id, date: v.date, type: 'voucher_expense',
            amount: -amt,
            remark: `${f.label} — Truck ${v.truckNo || '?'} | LR #${lrLabel}`,
            truckNo: v.truckNo, lrNo: lrLabel, vType: v.vType,
          });
        }
      });
    });
    return expenses.sort((a, b) => b.date > a.date ? 1 : -1);
  }, [allVouchers]);

  const onlineAdvList = useMemo(() =>
    allVouchers
      .filter(v => parseFloat(v.advanceOnline) > 0)
      .map(v => {
        const lrLabel = getVoucherLrLabel(v);
        return {
          id: 'v_online_' + v.id,
          date: v.date,
          amount: parseFloat(v.advanceOnline) || 0,
          remark: `Online Advance — Truck ${v.truckNo || '?'} | LR #${lrLabel} [${v.vType}]`,
          truckNo: v.truckNo,
          lrNo: lrLabel,
          vType: v.vType,
          isOnlinePaid: v.isOnlinePaid || false,
          onlinePaidDate: v.onlinePaidDate || null,
          createdBy: v.createdBy,
          updatedBy: v.updatedBy
        };
      })
      .sort((a, b) => b.date > a.date ? 1 : -1),
    [allVouchers]);

  /* ── Manual entries (deposits and cash-outs) ── */
  const deposits = useMemo(() => cbEntries.filter(e => e.type === 'deposit'), [cbEntries]);
  const cashOuts = useMemo(() => cbEntries.filter(e => e.type === 'cash_out'), [cbEntries]);

  const [officeSpendMonth, setOfficeSpendMonth] = useState(new Date().toISOString().slice(0, 7));

  const officeSpendEntries = useMemo(() => {
    return cashOuts.filter(e => {
      const nameMatch = (e.entityName || '').toLowerCase().includes('office') || (e.entityName || '').toLowerCase().includes('spend') || (e.entityName || '').toLowerCase().includes('expense');
      const remarkMatch = (e.remark || '').toLowerCase().includes('office') || (e.remark || '').toLowerCase().includes('bill');
      const isExpenseType = e.entityType === 'expense' || e.entityId === 'office_spend';
      return isExpenseType || nameMatch || (!e.entityType && remarkMatch);
    });
  }, [cashOuts]);

  const filteredOfficeSpendEntries = useMemo(() => {
    return officeSpendEntries.filter(e => {
      if (officeSpendMonth && (e.date || '').slice(0, 7) !== officeSpendMonth) return false;
      if (fSearch) {
        const q = fSearch.toLowerCase();
        const match = (e.remark || '').toLowerCase().includes(q) || (e.entityName || '').toLowerCase().includes(q) || String(e.amount).includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [officeSpendEntries, officeSpendMonth, fSearch]);

  const totalMonthlyOfficeSpend = useMemo(() => {
    return filteredOfficeSpendEntries.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  }, [filteredOfficeSpendEntries]);

  const officeSpendCategoryBreakdown = useMemo(() => {
    const map = {};
    filteredOfficeSpendEntries.forEach(e => {
      const cat = e.remark ? e.remark.trim() : (e.entityName || 'General Office Expense');
      if (!map[cat]) map[cat] = { category: cat, total: 0, count: 0 };
      map[cat].total += parseFloat(e.amount) || 0;
      map[cat].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredOfficeSpendEntries]);
  const ledgerWithBalance = useMemo(() => {
    const rows = [
      ...deposits.map(e => ({
        ...e, credit: e.isReturned ? 0 : e.amount, debit: 0,
        label: e.remark || (e.isRefundEntry ? 'Cash Returned' : 'Deposit'),
        badge: e.isRefundEntry ? 'refund' : 'deposit', deletable: !e.isRefundEntry,
      })),
      ...cashOuts.map(e => ({
        ...e, credit: 0, debit: e.isReturned ? 0 : e.amount,
        label: e.remark || 'Cash Out',
        badge: e.isReturned ? 'returned' : 'cash_out', deletable: !e.isReturned,
      })),
      ...voucherCashAdv.map(e => ({
        ...e, credit: 0, debit: Math.abs(e.amount),
        label: e.remark,
        badge: 'voucher_cash', deletable: false,
      })),
      ...voucherVehicleExpenses.map(e => ({
        ...e, credit: 0, debit: Math.abs(e.amount),
        label: e.remark,
        badge: 'voucher_expense', deletable: false,
      })),
    ].sort((a, b) => {
      const da = a.date || '', db = b.date || '';
      if (da !== db) return da < db ? -1 : 1;

      // Money in before money out, within the day.
      //
      // Rows built from vouchers carry no createdAt — they are derived, not
      // stored — so comparing timestamps put every one of them ahead of the
      // day's deposit ('' is never greater than a real date). A day that opened
      // with cash in hand was drawn down first and topped up afterwards, and
      // the running balance dived to a five-figure minus before the deposit
      // that had actually been made first. That is what the office meant by
      // "we added the balance and it still went minus".
      //
      // A cash box cannot be overdrawn, so receipts lead. It is also how a cash
      // book is read.
      const ca = a.credit > 0 ? 0 : 1, cb = b.credit > 0 ? 0 : 1;
      if (ca !== cb) return ca - cb;

      // Then whatever ordering the records themselves support, and finally the
      // id so the sequence is the same on every render. The old comparator
      // returned -1 for equal rows and never 0, which is not a valid ordering:
      // it claims a < b and b < a at once, and leaves the result up to the
      // sort implementation.
      const ta = a.createdAt || '', tb = b.createdAt || '';
      if (ta !== tb) return ta < tb ? -1 : 1;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
    let bal = 0;
    return rows.map(r => {
      bal = bal + r.credit - r.debit;
      return { ...r, balance: bal };
    });
  }, [deposits, cashOuts, voucherCashAdv, voucherVehicleExpenses]);

  /* ── Monthly summary with carry-forward ── */
  const monthlySummary = useMemo(() => {
    const monthMap = {};
    ledgerWithBalance.forEach(r => {
      const d = r.date || '';
      const ym = d.slice(0, 7); // "2026-05"
      if (!ym) return;
      if (!monthMap[ym]) monthMap[ym] = { ym, credit: 0, debit: 0, entries: 0 };
      monthMap[ym].credit += r.credit || 0;
      monthMap[ym].debit += r.debit || 0;
      monthMap[ym].entries++;
    });
    const months = Object.values(monthMap).sort((a, b) => a.ym.localeCompare(b.ym));
    let carry = 0;
    return months.map(m => {
      const opening = carry;
      const net = m.credit - m.debit;
      carry = opening + net;
      return { ...m, opening, closing: carry };
    });
  }, [ledgerWithBalance]);

  /* ── Filtered data ── */
  const filterRows = (rows, applyPaidFilter = false) => {
    return rows.filter(r => {
      let match = true;
      if (fFrom && r.date < fFrom) match = false;
      if (fTo && r.date > fTo) match = false;
      if (fSearch) {
        const q = fSearch.toLowerCase();
        const str = `${r.label || r.remark || ''} ${r.truckNo || ''} ${r.lrNo || ''}`.toLowerCase();
        if (!str.includes(q)) match = false;
      }
      if (applyPaidFilter) {
        if (fPaid === 'paid' && !r.isOnlinePaid) match = false;
        if (fPaid === 'unpaid' && r.isOnlinePaid) match = false;
      }
      return match;
    });
  };

  const filteredLedger = useMemo(() => filterRows(ledgerWithBalance), [ledgerWithBalance, fFrom, fTo, fSearch]);
  const filteredDeposits = useMemo(() => filterRows(deposits.map(e => ({ ...e, credit: e.amount, debit: 0, label: e.remark || 'Deposit', badge: 'deposit', deletable: true }))), [deposits, fFrom, fTo, fSearch]);
  const filteredVoucherCash = useMemo(() => filterRows(voucherCashAdv.map(e => ({ ...e, credit: 0, debit: Math.abs(e.amount), label: e.remark, badge: 'voucher_cash', deletable: false }))), [voucherCashAdv, fFrom, fTo, fSearch]);
  const filteredCashOuts = useMemo(() => filterRows(cashOuts.map(e => ({ ...e, credit: 0, debit: e.amount, label: e.remark || 'Cash Out', badge: 'cash_out', deletable: true }))), [cashOuts, fFrom, fTo, fSearch]);
  // Tyre work and extra cash off a voucher. These were in the running ledger and
  // in the totals but had no list of their own, so the only way to see the
  // Rs.5,700 they came to was to read all 72 rows and pick them out. Deposits,
  // cash advances and cash-outs added up to 64 of a 72-row ledger and nothing
  // on the screen said where the other eight were.
  const filteredVehicleExpenses = useMemo(
    () => filterRows(voucherVehicleExpenses.map(e => ({
      ...e, credit: 0, debit: Math.abs(e.amount),
      label: e.remark, badge: 'voucher_expense', deletable: false,
    }))),
    [voucherVehicleExpenses, fFrom, fTo, fSearch],
  );
  const filteredOnline = useMemo(() => filterRows(onlineAdvList, true), [onlineAdvList, fFrom, fTo, fSearch, fPaid]);

  const activeRows = tab === 'ledger' ? filteredLedger :
    tab === 'deposits' ? filteredDeposits :
      tab === 'voucher_cash' ? filteredVoucherCash :
        tab === 'voucher_expense' ? filteredVehicleExpenses :
          filteredCashOuts;

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return activeRows.slice(start, start + PAGE_SIZE);
  }, [activeRows, currentPage]);

  /* ── Summary stats ── */
  /**
   * The last line of the ledger, not a second sum of the same money.
   *
   * This used to add deposits and subtract cash-outs and voucher cash advances,
   * and stop there — it never subtracted the vehicle expenses a voucher carries
   * (tyre puncture, greasing and air, extra cash), though the ledger below
   * counts every one of them as a debit. The headline figure therefore read
   * high by exactly that total and disagreed with the balance printed on the
   * last row of the same screen. It also ignored returns, counting money that
   * had been handed back.
   */
  const currentBalance = ledgerWithBalance.length
    ? ledgerWithBalance[ledgerWithBalance.length - 1].balance
    : 0;
  const totalDeposited = filteredDeposits.reduce((s, e) => s + e.credit, 0);
  const currentMonthYM = new Date().toISOString().slice(0, 7);
  const currentMonthDeposit = deposits.filter(e => (e.date || '').startsWith(currentMonthYM)).reduce((s, e) => s + e.amount, 0);
  const currentMonthName = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const totalOnline = filteredOnline.reduce((s, e) => s + e.amount, 0);

  const BADGE_STYLE = {
    deposit: { bg: 'rgba(16,185,129,0.1)', color: 'var(--accent)', label: 'Deposit' },
    cash_out: { bg: 'rgba(244,63,94,0.1)', color: 'var(--danger)', label: 'Cash Out' },
    voucher_cash: { bg: 'rgba(99,102,241,0.1)', color: 'var(--primary)', label: 'Voucher Adv' },
    refund: { bg: 'rgba(14,165,233,0.1)', color: '#0ea5e9', label: 'Refund' },
    returned: { bg: 'rgba(156,163,175,0.15)', color: '#9ca3af', label: 'Returned' },
    voucher_expense: { bg: 'rgba(251,146,60,0.1)', color: '#f97316', label: 'Veh. Expense' },
  };

  const ENTITY_ICON = { driver: User, vehicle: Truck, staff: Users };

  const handleReturn = async () => {
    if (!returnTarget) return;
    try {
      await ax.post(API_CB + '/' + returnTarget.id + '/return', { date: returnTarget.date, remark: returnTarget.remark });
      setReturnTarget(null);
      fetchAll();
    } catch (e) { alert(e.response?.data?.error || 'Return failed'); }
  };

  const toggleOnlinePaid = async (voucherId, currentStatus, paymentDate = null) => {
    try {
      const payload = { isOnlinePaid: !currentStatus };
      if (!currentStatus && paymentDate) {
        payload.onlinePaidDate = paymentDate;
      } else if (currentStatus) {
        payload.onlinePaidDate = null; // Clear it if marking unpaid
      }
      await ax.patch(`${API_V}/${voucherId}`, payload);
      fetchAll();
      setOnlinePaidTarget(null);
    } catch (e) {
      alert('Failed to update online payment status');
    }
  };

  const TH = {
    padding: '8px 11px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.07em', background: 'var(--bg-th)',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
  };
  const TD = { padding: '9px 11px', fontSize: '12.5px', color: 'var(--text-sub)', verticalAlign: 'middle', borderBottom: '1px solid var(--border-row)' };

  /* ── Render helper: ledger table ── */
  const LedgerTable = ({ rows, showBalance = true, showBadge = true }) => (
    <TableScroll className="tbl-cards">
      <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
        <thead><tr>
          <th style={TH}>Date</th>
          <th style={TH}>ID</th>
          <th style={TH}>Description</th>
          {showBadge && <th style={TH}>Type</th>}
          <th style={{ ...TH, textAlign: 'right', color: 'var(--accent)' }}>Credit (In)</th>
          <th style={{ ...TH, textAlign: 'right', color: 'var(--danger)' }}>Debit (Out)</th>
          {showBalance && <th style={{ ...TH, textAlign: 'right' }}>Balance</th>}
          {role === 'admin' && <th style={TH}>Created By</th>}
          {role === 'admin' && <th style={TH}>Updated By</th>}
          <th style={{ ...TH, textAlign: 'center' }}>Action</th>
        </tr></thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={8} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>No entries yet</td></tr>
          )}
          {rows.map((r, i) => {
            const bs = BADGE_STYLE[r.badge] || BADGE_STYLE['deposit'];
            return (
              <tr key={r.id}
                style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                <td className="t-card-title" style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                <td data-label="ID" style={{ ...TD }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 900, color: '#6366f1', background: 'rgba(99,102,241,0.08)', padding: '2px 6px', borderRadius: '5px', fontSize: '11.5px' }}>
                    #{r.entryId || '—'}
                  </span>
                </td>
                <td data-label="Description" style={{ ...TD, maxWidth: '320px' }}>
                  <div style={{ fontWeight: 600, color: r.isReturned ? 'var(--text-muted)' : 'var(--text)', fontSize: '12.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: r.isReturned ? 'line-through' : 'none' }}>
                    {r.label}
                  </div>
                  {r.breakdownNote && (
                    <div style={{ fontSize: '10.5px', color: '#f97316', marginTop: '2px', fontWeight: 600 }}>
                      ↳ {r.breakdownNote}
                    </div>
                  )}
                  {r.entityType && r.entityName && (() => {
                    const EIcon = ENTITY_ICON[r.entityType] || User;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '1px 7px', borderRadius: '5px', background: 'rgba(99,102,241,0.08)', fontSize: '10.5px', fontWeight: 700, color: 'var(--primary)' }}>
                          <EIcon size={11} /> {r.entityName}
                        </div>
                        {r.type === 'cash_out' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 800, background: r.isCleared ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)', color: r.isCleared ? 'var(--accent)' : 'var(--danger)' }}>
                            {r.isCleared ? 'Deducted from last pay' : 'Pending deduction'}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  {(r.truckNo || r.lrNo) && !r.entityType && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                      {r.truckNo && (
                        <>
                          Truck: <span
                            onClick={() => {
                                const event = new CustomEvent('nav-module', {
                                    detail: { active: 'vehicles_dump', search: r.truckNo }
                                });
                                window.dispatchEvent(event);
                            }}
                            style={{ color: 'var(--primary)', fontWeight: 800, cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            {r.truckNo}
                          </span>
                        </>
                      )} {r.lrNo && `| LR #${r.lrNo}`}
                    </div>
                  )}
                </td>
                {showBadge && (
                  <td data-label="Type" style={{ ...TD }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 700, background: bs.bg, color: bs.color }}>
                      {bs.label}
                    </span>
                  </td>
                )}
                <td data-label="Credit (In)" style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontSize: '13px' }}>
                  {r.credit > 0 ? fmtRs(r.credit) : '—'}
                </td>
                <td data-label="Debit (Out)" style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--danger)', fontSize: '13px' }}>
                  {r.debit > 0 ? fmtRs(r.debit) : '—'}
                </td>
                {showBalance && (
                  <td data-label="Balance" style={{
                    ...TD, textAlign: 'right', fontWeight: 800, fontSize: '13px',
                    color: r.balance >= 0 ? 'var(--accent)' : 'var(--danger)'
                  }}>
                    {fmtRs(r.balance)}
                  </td>
                )}
                {role === 'admin' && <td data-label="Created By" style={TD}>{r.createdBy || '—'}</td>}
                {role === 'admin' && <td data-label="Updated By" style={TD}>{r.updatedBy || '—'}</td>}
                <td className="t-card-actions" style={{ ...TD, textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                    {r.type === 'cash_out' && r.entityType && !r.isReturned && (role === 'admin' || permissions?.cashbook === 'edit') && (
                      <button className="btn btn-sm" title="Mark as Returned" style={{ padding: '3px 7px', fontSize: '10px', fontWeight: 700, background: 'rgba(14,165,233,0.1)', color: '#0ea5e9', border: '1px solid rgba(14,165,233,0.2)', borderRadius: '6px', cursor: 'pointer' }}
                        onClick={() => setReturnTarget({ id: r.id, label: `${r.entityName} — ${fmtRs(r.amount)}`, date: new Date().toISOString().slice(0, 10), remark: '' })}>
                        <RotateCcw size={11} /> Return
                      </button>
                    )}
                    {r.deletable !== false && role === 'admin' ? (
                      <button className="btn btn-d btn-icon btn-sm" title="Delete entry"
                        onClick={() => setDelTarget({ id: r.id, label: r.label })}>
                        <Trash2 size={13} />
                      </button>
                    ) : (
                      !r.entityType && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.deletable !== false ? 'Restricted' : 'Auto'}</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        {showBalance && rows.length > 0 && (() => {
          const last = rows[rows.length - 1];
          const totCr = rows.reduce((s, r) => s + r.credit, 0);
          const totDb = rows.reduce((s, r) => s + r.debit, 0);
          return (
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-tf)' }}>
                <td colSpan={showBadge ? 2 : 2} style={{ ...TD, fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>Totals</td>
                {showBadge && <td style={TD}></td>}
                <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: 'var(--accent)', fontSize: '13px' }}>{fmtRs(totCr)}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: 'var(--danger)', fontSize: '13px' }}>{fmtRs(totDb)}</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 900, fontSize: '14px', color: last.balance >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{fmtRs(last.balance)}</td>
                <td colSpan={role === 'admin' ? 3 : 1} style={TD}></td>
              </tr>
            </tfoot>
          );
        })()}
      </table>
    </TableScroll>
  );

  /* Online advances table (grouped by date) */
  const OnlineTable = ({ rows }) => {
    const groupedRows = rows.reduce((acc, r) => {
      const d = r.date || 'Unknown Date';
      if (!acc[d]) acc[d] = [];
      acc[d].push(r);
      return acc;
    }, {});
    
    const sortedDates = Object.keys(groupedRows).sort((a, b) => b > a ? 1 : -1);
    // Running serial counter across ALL date groups so the number doesn't reset
    // when you move from one day's block to the next (the user was reading each
    // date group as a "page" and each one restarted at #1).
    let runningSerial = 0;

    return (
      <TableScroll>
        {sortedDates.length === 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <tbody>
              <tr><td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>No online advances in vouchers</td></tr>
            </tbody>
          </table>
        )}
        
        {sortedDates.map(date => {
          const dateRows = groupedRows[date];
          const dailyTotal = dateRows.reduce((s, r) => s + r.amount, 0);
          return (
            <div key={date} style={{ marginBottom: '24px' }}>
              <div style={{ padding: '8px 14px', background: 'var(--bg-tf)', borderTop: '2px solid var(--border)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>
                  {date === 'Unknown Date' ? date : fmtDate(date)}
                </span>
                <span style={{ fontWeight: 800, fontSize: '13px', color: '#0ea5e9' }}>Daily Total: {fmtRs(dailyTotal)}</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead><tr>
                  <th style={TH}>#</th>
                  <th style={TH}>Truck</th>
                  <th style={TH}>LR No.</th>
                  <th style={TH}>Type</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Online Amount</th>
                  {role === 'admin' && <th style={TH}>Created By</th>}
                  {role === 'admin' && <th style={TH}>Updated By</th>}
                  <th style={{ ...TH, textAlign: 'center' }}>Status</th>
                </tr></thead>
                <tbody>
                  {dateRows.map((r, i) => {
                    runningSerial++;
                    const serial = runningSerial;
                    return (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                      <td style={{ ...TD, color: 'var(--text-muted)', fontWeight: 700, textAlign: 'center' }}>{serial}</td>
                      <td style={{ ...TD, fontWeight: 700, color: 'var(--text)' }}>{r.truckNo || '—'}</td>
                      <td style={{ ...TD }}><span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>#{r.lrNo}</span></td>
                      <td style={{ ...TD }}><span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: 'rgba(14,165,233,0.1)', color: '#0ea5e9' }}>{r.vType}</span></td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: '#0ea5e9', fontSize: '13px' }}>{fmtRs(r.amount)}</td>
                      {role === 'admin' && <td style={TD}>{r.createdBy || '—'}</td>}
                      {role === 'admin' && <td style={TD}>{r.updatedBy || '—'}</td>}
                      <td style={{ ...TD, textAlign: 'center' }}>
                          <button
                            onClick={() => r.isOnlinePaid ? toggleOnlinePaid(r.id.replace('v_online_', ''), true) : setOnlinePaidTarget({ id: r.id.replace('v_online_', ''), defaultDate: new Date().toISOString().slice(0, 10), date: new Date().toISOString().slice(0, 10) })}
                            className={`btn btn-sm ${r.isOnlinePaid ? 'btn-g' : 'btn-a'}`}
                            disabled={!(role === 'admin' || permissions?.cashbook === 'edit' || permissions?.voucher === 'edit')}
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                          >
                            {r.isOnlinePaid ? <><Check size={12} /> Paid{r.onlinePaidDate ? ` (${fmtDate(r.onlinePaidDate)})` : ''}</> : 'Mark Paid'}
                          </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}

        {rows.length > 0 && (
          <div style={{ padding: '12px 14px', background: 'var(--bg-tf)', borderTop: '2px solid var(--border)', borderBottom: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '-24px', marginBottom: '24px' }}>
            <span style={{ fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>Grand Total Online Advance</span>
            <span style={{ fontWeight: 900, fontSize: '15px', color: '#0ea5e9' }}>{fmtRs(rows.reduce((sum, r) => sum + r.amount, 0))}</span>
          </div>
        )}
      </TableScroll>
    );
  };

  const tabRows = {
    ledger: ledgerWithBalance,
    deposits: filteredDeposits,
    voucher_cash: filteredVoucherCash,
    cash_out: filteredCashOuts,
  };

  // Every field on the ledger row. The old lists dropped who took the cash, the
  // remark behind it, and whether a cash-out had been returned.
  const cashbookExportRows = () => buildExportRows(
    // Amount is signed the same way for every row: out is negative.
    // It used to be whatever the source record happened to hold, so a voucher
    // advance of 1,200 exported as -1200 while a cash-out of 2,000 exported as
    // +2000 — both money leaving the box, on the same printed page.
    activeRows.map(r => ({
      ...r,
      label: r.label || r.remark,
      amount: (r.credit || 0) - (r.debit || 0),
    })),
    { order: ['date', 'label', 'badge', 'entityType', 'entityName', 'credit', 'debit', 'amount', 'balance', 'truckNo', 'lrNo', 'remark'] },
  );

  const handleExportExcel = () => exportToExcel(cashbookExportRows(), `${tab}_export_${new Date().toISOString().slice(0, 10)}`);
  const handleExportPDF = () => exportToPDF(cashbookExportRows(), `Cashbook - ${tab}`, null, {
    archive: { module: 'Cashbook', name: `Cashbook ${tab} ${new Date().toISOString().slice(0, 10)}` },
  });

  return (
    <div>
      <AnimatePresence>
        {delTarget && (
          <DelConfirm id={delTarget.id} label={delTarget.label} apiCb={API_CB}
            onClose={() => setDelTarget(null)}
            onDone={() => { setDelTarget(null); fetchAll(); }} />
        )}
        {returnTarget && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              style={{ width: '90%', maxWidth: '360px', background: 'var(--bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <RotateCcw size={18} color="#0ea5e9" />
                <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>Mark as Returned</span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-sub)', marginBottom: '16px' }}>{returnTarget.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
                <div className="field-h">
                  <label>Return Date *</label>
                  <input type="date" className="fi" value={returnTarget.date} onChange={e => setReturnTarget(p => ({ ...p, date: e.target.value }))} required />
                </div>
                <div className="field-h">
                  <label>Remark</label>
                  <input type="text" className="fi" placeholder="e.g. Cash returned by driver" value={returnTarget.remark} onChange={e => setReturnTarget(p => ({ ...p, remark: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button className="btn btn-g" onClick={() => setReturnTarget(null)}>Cancel</button>
                <button className="btn btn-a" onClick={handleReturn}><RotateCcw size={14} /> Confirm Return</button>
              </div>
            </motion.div>
          </div>
        )}
        {onlinePaidTarget && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              style={{ width: '90%', maxWidth: '340px', background: 'var(--bg)', borderRadius: '16px', padding: '24px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '8px', color: 'var(--text)' }}>Select Payment Date</div>
              <div style={{ fontSize: '13px', color: 'var(--text-sub)', marginBottom: '18px' }}>When was this online advance paid?</div>
              <input type="date" value={onlinePaidTarget.date} onChange={e => setOnlinePaidTarget(prev => ({ ...prev, date: e.target.value }))} className="fi" style={{ width: '100%', marginBottom: '20px' }} />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button className="btn btn-g" onClick={() => setOnlinePaidTarget(null)}>Cancel</button>
                <button className="btn btn-a" onClick={() => toggleOnlinePaid(onlinePaidTarget.id, false, onlinePaidTarget.date)}><Check size={14} /> Confirm Paid</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', background: 'var(--bg-card)', padding: '10px 14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <div className="field" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="fi" type="text" placeholder="Search remarks, truck..." value={fSearch} onChange={e => onFilterChange(setFSearch, e.target.value)} style={{ paddingLeft: '32px' }} />
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <input className="fi" type="date" value={fFrom} onChange={e => onFilterChange(setFFrom, e.target.value)} title="From Date" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <input className="fi" type="date" value={fTo} onChange={e => onFilterChange(setFTo, e.target.value)} title="To Date" />
        </div>
        {(fSearch || fFrom || fTo) && (
          <button className="btn btn-g" onClick={() => { onFilterChange(setFSearch, ''); onFilterChange(setFFrom, ''); onFilterChange(setFTo, ''); onFilterChange(setFPaid, 'all'); }}>Clear Filters</button>
        )}
      </div>

      {/* Header */}
      <div className="page-hd">
        <div>
          <h1><BookOpen size={20} color="#10b981" /> {moduleType === 'jkl' ? 'JK Lakshmi Cashbook' : 'Cashbook'}</h1>
          <p>Cash flow tracking & ledger</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn btn-g btn-sm" onClick={fetchAll} title="Refresh Cashbook"><RefreshCw size={13} /> Refresh</button>
          {(role === 'admin' || permissions?.cashbook === 'edit') && (
            <>
              <button className="btn btn-a btn-sm" onClick={() => setShowForm(f => f === 'deposit' ? null : 'deposit')} title="Add Deposit Entry">
                <ArrowDownCircle size={14} /> Deposit
              </button>
              <button className="btn btn-d btn-sm" onClick={() => setShowForm(f => f === 'cash_out' ? null : 'cash_out')} title="Cash to a driver or staff">
                <ArrowUpCircle size={14} /> Cash Out
              </button>
              <button className="btn btn-g btn-sm" onClick={() => setShowForm(f => f === 'office_spend' ? null : 'office_spend')} title="Company office expense">
                <Wallet size={14} /> Office Spend
              </button>
            </>
          )}
        </div>
      </div>

      {/* Entry forms */}
      <AnimatePresence>
        {showForm && (
          <EntryForm key={showForm} type={showForm} apiCb={API_CB} onSave={() => { fetchAll(); setShowForm(null); }} onCancel={() => setShowForm(null)} drivers={drivers} staffList={staffList} vehicles={vehicles} profiles={profiles} onQuickProfileCreated={(newEnt) => { if (newEnt.entityType === 'vehicle') setVehicles(v => [newEnt.raw, ...v]); else setProfiles(p => [newEnt.raw, ...p]); }} />
        )}
      </AnimatePresence>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: '12px', marginBottom: '18px' }}>
        {[
          { label: 'Current Balance', val: currentBalance, Icon: Wallet, color: '#6366f1', big: true, note: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
          { label: `Deposited — ${currentMonthName}`, val: currentMonthDeposit, Icon: ArrowDownCircle, color: '#10b981', note: 'This month only' },
        ].map(({ label, val, Icon, color, big, note }) => (
          <div key={label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px',
            padding: '14px 18px', boxShadow: big ? '0 0 0 1px rgba(99,102,241,0.2)' : 'none'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
              <Icon size={16} color={color} />
            </div>
            <div style={{ fontSize: big ? '22px' : '18px', fontWeight: 900, color: val < 0 ? 'var(--danger)' : color, lineHeight: 1 }}>
              {val < 0 ? '-' : ''}{fmtRs(Math.abs(val))}
            </div>
            {note && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>{note}</div>}
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {[
          { id: 'ledger', label: 'Full Ledger', count: ledgerWithBalance.length },
          { id: 'office_spend', label: '🏢 Office Spend & Bills', count: officeSpendEntries.length },
          { id: 'monthly', label: 'Monthly Summary', count: '' },
          { id: 'deposits', label: 'Deposits', count: deposits.length },
          { id: 'voucher_cash', label: 'Voucher Cash Adv', count: voucherCashAdv.length },
          { id: 'voucher_expense', label: 'Vehicle Expenses', count: voucherVehicleExpenses.length },
          { id: 'cash_out', label: 'Cash Outs', count: cashOuts.length },
        ].map(({ id, label, count }) => (
          <button key={id} onClick={() => onTabChange(id)}
            style={{
              padding: '7px 14px', borderRadius: '9px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '12px', fontWeight: 700, transition: 'all 0.15s',
              borderColor: tab === id ? 'var(--primary)' : 'var(--border)',
              background: tab === id ? 'rgba(99,102,241,0.1)' : 'transparent',
              color: tab === id ? 'var(--primary)' : 'var(--text-muted)'
            }}>
            {label}
            {count !== '' && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 800, opacity: 0.7 }}>({count})</span>}
          </button>
        ))}
      </div>

      {/* Table content */}
      {tab === 'office_spend' ? (
        <div className="card">
          <div className="card-header" style={{ flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <div className="card-title-block">
              <div className="card-icon" style={{ background: 'rgba(244,63,94,0.12)', color: 'var(--danger)' }}>
                <Wallet size={17} />
              </div>
              <div className="card-title-text" style={{ flex: 1 }}>
                <h3>🏢 Office Spend & Monthly Bill Calculator</h3>
                <p>{filteredOfficeSpendEntries.length} expenses in selected month</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="month"
                className="fi"
                value={officeSpendMonth}
                onChange={e => setOfficeSpendMonth(e.target.value)}
                style={{ width: '150px' }}
              />
              <button className="btn btn-g btn-sm" onClick={() => setOfficeSpendMonth(new Date().toISOString().slice(0, 7))}>This Month</button>
              <button className="btn btn-g btn-sm" onClick={() => {
                const d = new Date(); d.setMonth(d.getMonth() - 1);
                setOfficeSpendMonth(d.toISOString().slice(0, 7));
              }}>Last Month</button>
              {officeSpendMonth && <button className="btn btn-g btn-sm" onClick={() => setOfficeSpendMonth('')}>All Months</button>}
              <button className="btn btn-g btn-sm" onClick={handleExportExcel} title="Export to Excel"><Download size={13} /> Excel</button>
              <button className="btn btn-g btn-sm" onClick={handleExportPDF} title="Export to PDF"><Printer size={13} /> PDF</button>
            </div>
          </div>

          {/* Metric Cards for Office Spend */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '12px', padding: '16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ background: 'var(--bg-row-even)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                Total Monthly Office Spend ({officeSpendMonth || 'All'})
              </div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--danger)' }}>
                {fmtRs(totalMonthlyOfficeSpend)}
              </div>
            </div>

            <div style={{ background: 'var(--bg-row-even)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                Total Expense Vouchers / Bills
              </div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--primary)' }}>
                {filteredOfficeSpendEntries.length} entries
              </div>
            </div>

            <div style={{ background: 'var(--bg-row-even)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                Avg Daily Office Expense
              </div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: '#f97316' }}>
                {fmtRs(totalMonthlyOfficeSpend / (officeSpendMonth ? 30 : Math.max(1, filteredOfficeSpendEntries.length)))}
              </div>
            </div>
          </div>

          {/* Category Breakdown */}
          {officeSpendCategoryBreakdown.length > 0 && (
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Monthly Expense Category Breakdown
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '8px' }}>
                {officeSpendCategoryBreakdown.map((cat, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-row-odd)', border: '1px solid var(--border-row)', borderRadius: '8px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text)' }}>{cat.category}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{cat.count} voucher{cat.count > 1 ? 's' : ''}</div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--danger)' }}>
                      {fmtRs(cat.total)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Table of Office Spend entries */}
          <TableScroll>
            <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead><tr>
                <th style={TH}>Date</th>
                <th style={TH}>Profile / Recipient</th>
                <th style={TH}>Expense / Remark</th>
                <th style={{ ...TH, textAlign: 'right', color: 'var(--danger)' }}>Amount (Out)</th>
                {role === 'admin' && <th style={TH}>Entered By</th>}
                <th style={{ ...TH, textAlign: 'center' }}>Action</th>
              </tr></thead>
              <tbody>
                {filteredOfficeSpendEntries.length === 0 && (
                  <tr><td colSpan={6} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>No Office Spend entries found for this period</td></tr>
                )}
                {filteredOfficeSpendEntries.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                    <td style={TD}>
                      <div style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '12.5px' }}>
                        {r.entityName || 'Office Spend'}
                      </div>
                    </td>
                    <td style={TD}>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {r.remark || 'General Office Expense'}
                      </div>
                    </td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: 'var(--danger)', fontSize: '13.5px' }}>
                      {fmtRs(r.amount)}
                    </td>
                    {role === 'admin' && <td style={TD}>{r.createdBy || '—'}</td>}
                    <td style={{ ...TD, textAlign: 'center' }}>
                      {role === 'admin' && (
                        <button className="btn btn-d btn-icon btn-sm" title="Delete Entry" onClick={() => setDelTarget({ id: r.id, label: `${r.remark || 'Office Spend'} (${fmtRs(r.amount)})` })}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {filteredOfficeSpendEntries.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-tf)' }}>
                    <td colSpan={3} style={{ ...TD, fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
                      Total Office Bill ({officeSpendMonth || 'All Months'})
                    </td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 900, color: 'var(--danger)', fontSize: '15px' }}>
                      {fmtRs(totalMonthlyOfficeSpend)}
                    </td>
                    <td colSpan={role === 'admin' ? 2 : 1} style={TD}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </TableScroll>
        </div>
      ) : tab === 'monthly' ? (
        <div className="card">
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon" style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--primary)' }}>
                <BookOpen size={17} />
              </div>
              <div className="card-title-text" style={{ flex: 1 }}>
                <h3>Monthly Summary (with carry-forward)</h3>
                <p>{monthlySummary.length} months</p>
              </div>
            </div>
          </div>
          <TableScroll>
            <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead><tr>
                <th style={TH}>Month</th>
                <th style={{ ...TH, textAlign: 'right' }}>Opening Balance</th>
                <th style={{ ...TH, textAlign: 'right', color: 'var(--accent)' }}>Credit (In)</th>
                <th style={{ ...TH, textAlign: 'right', color: 'var(--danger)' }}>Debit (Out)</th>
                <th style={{ ...TH, textAlign: 'right' }}>Net</th>
                <th style={{ ...TH, textAlign: 'right' }}>Closing Balance</th>
                <th style={{ ...TH, textAlign: 'center' }}>Entries</th>
              </tr></thead>
              <tbody>
                {monthlySummary.length === 0 && (
                  <tr><td colSpan={7} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>No entries yet</td></tr>
                )}
                {monthlySummary.map((m, i) => {
                  const net = m.credit - m.debit;
                  const monthName = new Date(m.ym + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
                  return (
                    <tr key={m.ym} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                      <td style={{ ...TD, fontWeight: 700, color: 'var(--text)' }}>{monthName}</td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 600, color: m.opening >= 0 ? '#6366f1' : 'var(--danger)' }}>
                        {m.opening !== 0 ? (m.opening < 0 ? '-' : '') + fmtRs(Math.abs(m.opening)) : '—'}
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontSize: '13px' }}>{fmtRs(m.credit)}</td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--danger)', fontSize: '13px' }}>{fmtRs(m.debit)}</td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: net >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                        {net >= 0 ? '+' : '-'}{fmtRs(Math.abs(net))}
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 900, fontSize: '14px', color: m.closing >= 0 ? '#6366f1' : 'var(--danger)' }}>
                        {m.closing < 0 ? '-' : ''}{fmtRs(Math.abs(m.closing))}
                      </td>
                      <td style={{ ...TD, textAlign: 'center', fontWeight: 600 }}>{m.entries}</td>
                    </tr>
                  );
                })}
              </tbody>
              {monthlySummary.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-tf)' }}>
                    <td style={{ ...TD, fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>Grand Total</td>
                    <td style={TD}></td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: 'var(--accent)', fontSize: '13px' }}>{fmtRs(monthlySummary.reduce((s, m) => s + m.credit, 0))}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: 'var(--danger)', fontSize: '13px' }}>{fmtRs(monthlySummary.reduce((s, m) => s + m.debit, 0))}</td>
                    <td style={TD}></td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 900, fontSize: '15px', color: (monthlySummary[monthlySummary.length - 1]?.closing || 0) >= 0 ? '#6366f1' : 'var(--danger)' }}>
                      {(() => { const c = monthlySummary[monthlySummary.length - 1]?.closing || 0; return (c < 0 ? '-' : '') + fmtRs(Math.abs(c)); })()}
                    </td>
                    <td style={{ ...TD, textAlign: 'center', fontWeight: 800 }}>{monthlySummary.reduce((s, m) => s + m.entries, 0)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </TableScroll>
        </div>
      ) : (
      <div className="card">
        <div className="card-header">
          <div className="card-title-block">
            <div className="card-icon" style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--accent)' }}>
              <BookOpen size={17} />
            </div>
            <div className="card-title-text" style={{ flex: 1 }}>
              <h3>
                {tab === 'ledger' ? 'Full Ledger (with running balance)' :
                  tab === 'deposits' ? 'Deposits' :
                    tab === 'voucher_cash' ? 'Voucher Cash Advances (auto-deducted)' :
                      tab === 'voucher_expense' ? 'Vehicle Expenses off Vouchers (recovered from the owner)' :
                        'Cash Outs & Other Expenses'}
              </h3>
              <p>
                {tab === 'ledger' ? ledgerWithBalance.length + ' transactions' :
                  tab === 'deposits' ? deposits.length + ' deposits' :
                    tab === 'voucher_cash' ? voucherCashAdv.length + ' advances from vouchers' :
                        cashOuts.length + ' cash out entries'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-g btn-sm" onClick={handleExportExcel} title="Export to Excel Form"><Download size={13} /> Excel</button>
              <button className="btn btn-g btn-sm" onClick={handleExportPDF} title="Export to PDF File"><Printer size={13} /> PDF</button>
            </div>
          </div>
        </div>
        {loading
          ? <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading…</div>
          : <>
              <LedgerTable
                  rows={paginatedRows}
                  showBalance={tab === 'ledger'}
                  showBadge={tab === 'ledger'} />

              <Pagination
                currentPage={currentPage}
                totalItems={activeRows.length}
                pageSize={PAGE_SIZE}
                onPageChange={setCurrentPage}
              />
            </>}
      </div>
      )}
    </div>
  );
}