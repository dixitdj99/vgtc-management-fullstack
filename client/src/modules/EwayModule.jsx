import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import ax from '../api';
import { 
  FileCheck, AlertTriangle, CheckCircle2, RefreshCw, Plus, Search, 
  Truck, Calendar, Package, Clock, ArrowRight, Loader2, Tag, ChevronRight, X, User, MapPin, ShieldAlert,
  Globe, ShieldCheck, Settings, ExternalLink, Cpu
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const STATUS_CONFIG = {
  active: { label: 'Active', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)' },
  expired_unloaded: { label: 'Expired (Unloaded)', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' },
  loaded: { label: 'Loaded (LR Completed)', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)' },
  reissued: { label: 'Re-issued', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
  cancelled: { label: 'Cancelled', color: '#6b7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.3)' },
};

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return isoStr; }
}

export default function EwayModule() {
  const { user } = useAuth();
  const [ewayBills, setEwayBills] = useState([]);
  const [challans, setChallans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'expired_unloaded' | 'active' | 'loaded' | 'reissued'

  // Modal States
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [reissueTarget, setReissueTarget] = useState(null); // bill object to reissue
  const [syncingEwb, setSyncingEwb] = useState(null);
  const [saving, setSaving] = useState(false);

  // Government NIC Credentials config state
  const [nicConfig, setNicConfig] = useState({
    gstin: '06AAAAA0000A1Z5',
    username: '',
    password: '',
    clientId: '',
    clientSecret: '',
    env: 'sandbox'
  });

  // Form state for new issuance
  const [form, setForm] = useState({
    ewayBillNo: '',
    challanNo: '',
    truckNo: '',
    partyName: '',
    destination: '',
    material: 'PPC',
    quantity: '',
    validUntilHours: 24
  });

  // Re-issue form state
  const [reissueForm, setReissueForm] = useState({
    newEwayBillNo: '',
    validUntilHours: 24,
    truckNo: '',
    extendOnGovtPortal: true
  });

  const canEdit = user?.role === 'admin' || user?.permissions?.eway === 'edit';

  const fetchData = async () => {
    setLoading(true);
    try {
      const [eRes, cRes] = await Promise.all([
        ax.get('/eway').catch(() => ({ data: [] })),
        ax.get('/stock/challans').catch(() => ({ data: [] }))
      ]);

      const bills = eRes.data || [];
      const openChs = (cRes.data || []).filter(c => c.status === 'open' || c.status === 'partially_loaded');

      setEwayBills(bills);
      setChallans(openChs);
    } catch (e) {
      console.error('Failed to load E-Way bills data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Compute expired & pending unloaded bills that need urgent re-issuance
  const expiredUnloadedList = useMemo(() => {
    return ewayBills.filter(b => {
      const status = b.calculatedStatus || b.status;
      return status === 'expired_unloaded';
    });
  }, [ewayBills]);

  // Combined filtered list
  const filteredBills = useMemo(() => {
    return ewayBills.filter(b => {
      const status = b.calculatedStatus || b.status;
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return (b.ewayBillNo || '').toLowerCase().includes(s) ||
               (b.truckNo || '').toLowerCase().includes(s) ||
               (b.challanNo || '').toLowerCase().includes(s) ||
               (b.partyName || '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [ewayBills, statusFilter, search]);

  // Live Sync with NIC Government E-Way Portal
  const handleLiveNicSync = async (bill) => {
    setSyncingEwb(bill.ewayBillNo);
    try {
      const res = await ax.post(`/eway/sync-nic/${bill.ewayBillNo}`);
      if (res.data && res.data.liveDetails) {
        const det = res.data.liveDetails;
        alert(`Govt E-Way Portal Sync Success!\n\n• Status: ${det.status}\n• Valid Until: ${formatDate(det.validUpto)}\n• Vehicle: ${det.vehicleNo || '—'}\n• Place: ${det.fromPlace || ''} -> ${det.toPlace || ''}`);
        fetchData();
      }
    } catch (err) {
      alert('Govt NIC Portal Sync Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setSyncingEwb(null);
    }
  };

  // Open Re-issue Modal
  const openReissue = (bill) => {
    setReissueTarget(bill);
    setReissueForm({
      newEwayBillNo: `EWAY-${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      validUntilHours: 24,
      truckNo: bill.truckNo || '',
      extendOnGovtPortal: true
    });
  };

  // Submit Re-issue
  const handleReissueSubmit = async (e) => {
    e.preventDefault();
    if (!reissueTarget) return;
    if (!reissueForm.newEwayBillNo) { alert('Please enter a new E-Way Bill Number'); return; }

    setSaving(true);
    try {
      const res = await ax.post(`/eway/${reissueTarget.id}/reissue`, {
        newEwayBillNo: reissueForm.newEwayBillNo,
        validUntilHours: reissueForm.validUntilHours,
        truckNo: reissueForm.truckNo,
        extendOnGovtPortal: reissueForm.extendOnGovtPortal
      });
      
      const newNo = res.data?.newBill?.ewayBillNo || reissueForm.newEwayBillNo;
      alert(`E-Way Bill successfully re-issued as #${newNo}!\n${res.data?.govtAck ? '⚡ Extended & updated on Government NIC Portal.' : 'Vehicle is now valid for loading.'}`);
      setReissueTarget(null);
      fetchData();
    } catch (err) {
      alert('Re-issuance failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  // Submit New Issue
  const handleIssueSubmit = async (e) => {
    e.preventDefault();
    if (!form.ewayBillNo || !form.truckNo) {
      alert('E-Way Bill Number and Truck Number are required');
      return;
    }

    setSaving(true);
    try {
      const validUntil = new Date(Date.now() + (parseInt(form.validUntilHours) || 24) * 60 * 60 * 1000).toISOString();
      await ax.post('/eway', {
        ...form,
        validUntil
      });
      alert(`E-Way Bill #${form.ewayBillNo} issued successfully!`);
      setShowIssueModal(false);
      setForm({ ewayBillNo: '', challanNo: '', truckNo: '', partyName: '', destination: '', material: 'PPC', quantity: '', validUntilHours: 24 });
      fetchData();
    } catch (err) {
      alert('Issuance failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '12px', color: 'var(--text-muted)' }}>
        <Loader2 size={24} className="spin" color="var(--primary)" /> Loading E-Way Bill System...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <FileCheck size={26} color="var(--primary)" /> E-Way Bill Management &amp; Govt Portal Sync
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Globe size={14} color="#10b981" /> Direct NIC Govt API Sync Enabled · Auto-detect expired E-Way bills for pending orders and re-issue in 1-click.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {user?.role === 'admin' && (
            <button className="btn btn-g" onClick={() => window.location.href = '/admin'} title="Configure NIC Govt Credentials in Admin Settings">
              <Settings size={14} /> Govt API Settings
            </button>
          )}
          <button className="btn btn-g" onClick={fetchData} title="Refresh Data">
            <RefreshCw size={14} /> Refresh
          </button>
          {canEdit && (
            <button className="btn btn-p" onClick={() => setShowIssueModal(true)}>
              <Plus size={16} /> Issue E-Way Bill
            </button>
          )}
        </div>
      </div>

      {/* ── URGENT ALERT CARD FOR EXPIRED UNLOADED VEHICLES ── */}
      {expiredUnloadedList.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          style={{ 
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(220, 38, 38, 0.14))', 
            border: '1px solid rgba(239, 68, 68, 0.3)', 
            borderRadius: '16px', 
            padding: '20px 24px', 
            marginBottom: '28px',
            boxShadow: '0 8px 24px rgba(239, 68, 68, 0.12)' 
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldAlert size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#b91c1c' }}>
                  Action Required: {expiredUnloadedList.length} Vehicle(s) Have Expired E-Way Bills
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#7f1d1d', fontWeight: 600 }}>
                  Vehicles are ready for loading but E-Way bills expired. Click "Re-Issue E-Way Bill" to generate a new valid E-Way bill immediately.
                </p>
              </div>
            </div>

            <button 
              className="btn" 
              style={{ background: '#ef4444', color: '#fff', border: 'none', fontWeight: 800, fontSize: '12px', padding: '8px 16px' }}
              onClick={() => setStatusFilter('expired_unloaded')}
            >
              View All Expired ({expiredUnloadedList.length})
            </button>
          </div>

          {/* Grid of expired pending bills */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
            {expiredUnloadedList.map(b => (
              <div key={b.id} style={{ background: 'var(--bg-card)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 800, fontSize: '14px', color: '#b91c1c', fontFamily: 'monospace' }}>#{b.ewayBillNo}</span>
                    <span style={{ padding: '3px 8px', borderRadius: '6px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }}>Expired</span>
                  </div>

                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Truck size={14} color="var(--primary)" /> {b.truckNo || 'Unassigned'}
                    {b.challanNo && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(Challan #{b.challanNo})</span>}
                  </div>

                  <div style={{ fontSize: '11.5px', color: 'var(--text-sub)', display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '12px' }}>
                    <div>Party: <strong>{b.partyName || '—'}</strong></div>
                    <div>Destination: {b.destination || '—'}</div>
                    <div>Expired On: <strong style={{ color: '#ef4444' }}>{formatDate(b.validUntil)}</strong></div>
                  </div>
                </div>

                {canEdit && (
                  <button 
                    onClick={() => openReissue(b)} 
                    style={{ 
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', 
                      background: '#10b981', color: '#fff', border: 'none', padding: '9px', borderRadius: '8px', 
                      fontWeight: 800, fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 6px rgba(16,185,129,0.3)' 
                    }}
                  >
                    <RefreshCw size={14} /> Re-Issue E-Way Bill Now
                  </button>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── KPI Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total E-Way Bills', count: ewayBills.length, color: '#6366f1', icon: FileCheck, filter: 'all' },
          { label: 'Expired (Unloaded)', count: expiredUnloadedList.length, color: '#ef4444', icon: AlertTriangle, filter: 'expired_unloaded' },
          { label: 'Active Valid Bills', count: ewayBills.filter(b => (b.calculatedStatus || b.status) === 'active').length, color: '#10b981', icon: CheckCircle2, filter: 'active' },
          { label: 'Re-Issued Bills', count: ewayBills.filter(b => b.status === 'reissued').length, color: '#f59e0b', icon: RefreshCw, filter: 'reissued' },
        ].map(k => (
          <div 
            key={k.label} 
            onClick={() => setStatusFilter(k.filter)}
            style={{ 
              background: 'var(--bg-card)', border: statusFilter === k.filter ? `2px solid ${k.color}` : '1px solid var(--border)', 
              borderRadius: '14px', padding: '16px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: 'var(--shadow)' 
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</span>
              <k.icon size={18} color={k.color} />
            </div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: k.color }}>{k.count}</div>
          </div>
        ))}
      </div>

      {/* ── Search & Filter Toolbar ── */}
      <div className="card" style={{ padding: '16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ position: 'relative', width: '320px' }}>
          <input 
            className="fi" 
            type="text" 
            placeholder="Search E-Way Bill #, Truck #, Party..." 
            value={search} 
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '34px', fontSize: '13px' }}
          />
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {['all', 'expired_unloaded', 'active', 'reissued', 'loaded'].map(st => {
            const cfg = STATUS_CONFIG[st] || { label: 'All Bills' };
            const isActive = statusFilter === st;
            return (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: isActive ? `1px solid ${cfg.color || 'var(--primary)'}` : '1px solid var(--border)',
                  background: isActive ? (cfg.bg || 'rgba(99,102,241,0.12)') : 'transparent',
                  color: isActive ? (cfg.color || 'var(--primary)') : 'var(--text-muted)',
                  fontWeight: isActive ? 800 : 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main E-Way Bills Table ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {filteredBills.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <FileCheck size={48} style={{ opacity: 0.2, marginBottom: '12px' }} />
            <div style={{ fontWeight: 800, fontSize: '15px' }}>No E-Way Bills Found</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>Issue a new E-Way bill or adjust search filters.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-th)', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>E-Way Bill #</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Truck No.</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Challan / Order</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Party &amp; Destination</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Issued / Valid Until</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredBills.map((b, i) => {
                  const statusKey = b.calculatedStatus || b.status;
                  const cfg = STATUS_CONFIG[statusKey] || STATUS_CONFIG.active;
                  const isExpired = statusKey === 'expired_unloaded';
                  const isSyncing = syncingEwb === b.ewayBillNo;

                  return (
                    <tr key={b.id || i} style={{ borderBottom: '1px solid var(--border)', background: isExpired ? 'rgba(239, 68, 68, 0.03)' : (i % 2 === 0 ? 'transparent' : 'var(--bg-row-odd)') }}>
                      <td style={{ padding: '12px 16px', fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)', fontSize: '13.5px' }}>
                        #{b.ewayBillNo}
                        {b.reissuedFrom && (
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Re-issued from #{b.reissuedFrom}</div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 800, color: 'var(--text)' }}>
                        {b.truckNo || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-sub)' }}>
                        {b.challanNo ? `Challan #${b.challanNo}` : 'Direct Order'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 700 }}>{b.partyName || '—'}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{b.destination || '—'}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '11.5px' }}>
                        <div>Valid: <strong>{formatDate(b.validUntil)}</strong></div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Issued: {formatDate(b.issuedDate)}</div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{ padding: '4px 10px', borderRadius: '8px', background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, fontSize: '11px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {isExpired && <AlertTriangle size={12} />}
                          {cfg.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          <button 
                            onClick={() => handleLiveNicSync(b)}
                            disabled={isSyncing}
                            className="btn btn-g"
                            style={{ padding: '5px 9px', fontSize: '11px', fontWeight: 700 }}
                            title="Live Sync with Govt NIC Portal"
                          >
                            {isSyncing ? <Loader2 size={12} className="spin" /> : <><Globe size={12} color="#10b981" /> Sync NIC</>}
                          </button>
                          {isExpired && canEdit && (
                            <button 
                              onClick={() => openReissue(b)}
                              style={{ padding: '6px 12px', borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', fontWeight: 800, fontSize: '11px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <RefreshCw size={12} /> Re-Issue
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL: RE-ISSUE E-WAY BILL ── */}
      <AnimatePresence>
        {reissueTarget && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} style={{ width: '92%', maxWidth: '500px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <RefreshCw size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>Re-Issue E-Way Bill</h3>
                    <p style={{ margin: '1px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>Expired Bill #{reissueTarget.ewayBillNo}</p>
                  </div>
                </div>
                <button onClick={() => setReissueTarget(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
              </div>

              <form onSubmit={handleReissueSubmit} style={{ padding: '20px 22px' }}>
                <div className="fg" style={{ gap: '14px' }}>
                  <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', padding: '10px 14px', borderRadius: '10px', fontSize: '12px' }}>
                    <div>Truck: <strong>{reissueTarget.truckNo}</strong> · Party: <strong>{reissueTarget.partyName || '—'}</strong></div>
                    <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>Challan: {reissueTarget.challanNo || 'Direct'} · Material: {reissueTarget.material}</div>
                  </div>

                  <div className="field">
                    <label>New E-Way Bill Number *</label>
                    <div className="fi-row">
                      <input 
                        className="fi" 
                        type="text" 
                        placeholder="Enter 12-digit E-Way Bill No" 
                        value={reissueForm.newEwayBillNo} 
                        onChange={e => setReissueForm({ ...reissueForm, newEwayBillNo: e.target.value })} 
                        required 
                      />
                      <button 
                        type="button" 
                        className="btn btn-g" 
                        onClick={() => setReissueForm({ ...reissueForm, newEwayBillNo: `EWAY-${Math.floor(1000000000 + Math.random() * 9000000000)}` })}
                        title="Auto-Generate Number"
                      >
                        Auto
                      </button>
                    </div>
                  </div>

                  <div className="field">
                    <label>Truck Number (Update if vehicle changed)</label>
                    <input 
                      className="fi" 
                      type="text" 
                      value={reissueForm.truckNo} 
                      onChange={e => setReissueForm({ ...reissueForm, truckNo: e.target.value.toUpperCase() })} 
                    />
                  </div>

                  <div className="field">
                    <label>Validity Extension (Hours)</label>
                    <select className="fi" value={reissueForm.validUntilHours} onChange={e => setReissueForm({ ...reissueForm, validUntilHours: e.target.value })}>
                      <option value={24}>24 Hours (+1 Day)</option>
                      <option value={48}>48 Hours (+2 Days)</option>
                      <option value={72}>72 Hours (+3 Days)</option>
                      <option value={12}>12 Hours</option>
                    </select>
                  </div>

                  <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.06)', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input 
                      type="checkbox" 
                      id="extendGovt"
                      checked={reissueForm.extendOnGovtPortal}
                      onChange={e => setReissueForm({ ...reissueForm, extendOnGovtPortal: e.target.checked })}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <label htmlFor="extendGovt" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', cursor: 'pointer', margin: 0 }}>
                      Submit Validity Extension to Govt Portal (<span style={{ color: '#10b981' }}>ewaybillgst.gov.in</span>)
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                  <button type="button" className="btn btn-g" onClick={() => setReissueTarget(null)}>Cancel</button>
                  <button type="submit" className="btn btn-p" style={{ background: '#10b981' }} disabled={saving}>
                    {saving ? <Loader2 size={14} className="spin" /> : <><RefreshCw size={14} /> Confirm &amp; Re-Issue</>}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: GOVT API SETTINGS ── */}
      <AnimatePresence>
        {showConfigModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} style={{ width: '92%', maxWidth: '520px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Globe size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>Government E-Way API Configuration</h3>
                    <p style={{ margin: '1px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>NIC / GSP credentials for direct ewaybillgst.gov.in sync</p>
                  </div>
                </div>
                <button onClick={() => setShowConfigModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
              </div>

              <div style={{ padding: '20px 22px' }}>
                <div className="fg fg-2" style={{ gap: '14px' }}>
                  <div className="field">
                    <label>Company GSTIN *</label>
                    <input className="fi" type="text" placeholder="06AAAAA0000A1Z5" value={nicConfig.gstin} onChange={e => setNicConfig({ ...nicConfig, gstin: e.target.value.toUpperCase() })} />
                  </div>

                  <div className="field">
                    <label>API Environment</label>
                    <select className="fi" value={nicConfig.env} onChange={e => setNicConfig({ ...nicConfig, env: e.target.value })}>
                      <option value="sandbox">Sandbox / Test Mode</option>
                      <option value="production">Production (Live NIC Portal)</option>
                    </select>
                  </div>

                  <div className="field">
                    <label>API Username</label>
                    <input className="fi" type="text" placeholder="NIC API Username" value={nicConfig.username} onChange={e => setNicConfig({ ...nicConfig, username: e.target.value })} />
                  </div>

                  <div className="field">
                    <label>API Password</label>
                    <input className="fi" type="password" placeholder="••••••••" value={nicConfig.password} onChange={e => setNicConfig({ ...nicConfig, password: e.target.value })} />
                  </div>

                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>GSP Client ID (Optional)</label>
                    <input className="fi" type="text" placeholder="Client ID from ClearTax / MasterIndia / NIC" value={nicConfig.clientId} onChange={e => setNicConfig({ ...nicConfig, clientId: e.target.value })} />
                  </div>
                </div>

                <div style={{ marginTop: '16px', padding: '12px 14px', background: 'var(--bg)', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  💡 <strong>Tip:</strong> You can also set these permanently in server <code>.env</code> under <code>EWAY_GSTIN</code>, <code>EWAY_USERNAME</code>, and <code>EWAY_PASSWORD</code>.
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                  <button type="button" className="btn btn-g" onClick={() => setShowConfigModal(false)}>Close</button>
                  <button type="button" className="btn btn-p" onClick={() => { alert('NIC API Settings saved for session!'); setShowConfigModal(false); }}>
                    Save Settings
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: ISSUE NEW E-WAY BILL ── */}
      <AnimatePresence>
        {showIssueModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} style={{ width: '92%', maxWidth: '520px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Plus size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>Issue New E-Way Bill</h3>
                    <p style={{ margin: '1px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>Generate E-Way Bill for order or challan</p>
                  </div>
                </div>
                <button onClick={() => setShowIssueModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
              </div>

              <form onSubmit={handleIssueSubmit} style={{ padding: '20px 22px' }}>
                <div className="fg fg-2" style={{ gap: '14px' }}>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>E-Way Bill Number *</label>
                    <input className="fi" type="text" placeholder="e.g. 121098475634" value={form.ewayBillNo} onChange={e => setForm({ ...form, ewayBillNo: e.target.value })} required />
                  </div>

                  <div className="field">
                    <label>Select Pending Challan (Optional)</label>
                    <select className="fi" value={form.challanNo} onChange={e => {
                      const chNo = e.target.value;
                      const sel = challans.find(c => c.challanNo === chNo);
                      if (sel) {
                        setForm(f => ({ ...f, challanNo: chNo, truckNo: sel.truckNo || '', partyName: sel.partyName || '', destination: sel.destination || '', material: sel.material || 'PPC', quantity: sel.quantity || '' }));
                      } else {
                        setForm(f => ({ ...f, challanNo: chNo }));
                      }
                    }}>
                      <option value="">-- None (Manual Entry) --</option>
                      {challans.map(c => (
                        <option key={c.id} value={c.challanNo}>Challan #{c.challanNo} ({c.truckNo})</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label>Truck Number *</label>
                    <input className="fi" type="text" placeholder="GJ01AB1234" value={form.truckNo} onChange={e => setForm({ ...form, truckNo: e.target.value.toUpperCase() })} required />
                  </div>

                  <div className="field">
                    <label>Party Name</label>
                    <input className="fi" type="text" placeholder="Customer / Receiver" value={form.partyName} onChange={e => setForm({ ...form, partyName: e.target.value })} />
                  </div>

                  <div className="field">
                    <label>Destination</label>
                    <input className="fi" type="text" placeholder="Delivery city" value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} />
                  </div>

                  <div className="field">
                    <label>Material</label>
                    <input className="fi" type="text" placeholder="PPC / OPC" value={form.material} onChange={e => setForm({ ...form, material: e.target.value })} />
                  </div>

                  <div className="field">
                    <label>Quantity (Bags)</label>
                    <input className="fi" type="number" placeholder="500" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
                  </div>

                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>Validity Duration</label>
                    <select className="fi" value={form.validUntilHours} onChange={e => setForm({ ...form, validUntilHours: e.target.value })}>
                      <option value={24}>24 Hours (Standard)</option>
                      <option value={48}>48 Hours (2 Days)</option>
                      <option value={72}>72 Hours (3 Days)</option>
                      <option value={12}>12 Hours</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                  <button type="button" className="btn btn-g" onClick={() => setShowIssueModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-p" disabled={saving}>
                    {saving ? <Loader2 size={14} className="spin" /> : <><Plus size={14} /> Issue E-Way Bill</>}
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
