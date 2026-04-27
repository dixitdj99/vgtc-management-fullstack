import React, { useState, useEffect, useMemo } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Banknote, Truck, Calendar, CheckCircle2, AlertCircle, ChevronLeft, Search, Check, HandCoins, AlertTriangle, X
} from 'lucide-react';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use';
import ColumnFilter from '../components/ColumnFilter';

const API_V = '/vouchers';
const TYPES = ['Dump', 'JK_Lakshmi', 'JK_Super'];

function calcNet(v) {
  const gross = (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);
  const diesel = v.advanceDiesel === 'FULL' ? 4000 : (parseFloat(v.advanceDiesel) || 0);
  const cash = parseFloat(v.advanceCash) || 0;
  const online = parseFloat(v.advanceOnline) || 0;
  const munshi = parseFloat(v.munshi) || 0;
  const shortage = parseFloat(v.shortage) || 0;
  return gross - diesel - cash - online - munshi - shortage;
}

const fmtRs = n => 'Rs.' + Math.round(n).toLocaleString('en-IN');
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const TH = {
  padding: '8px 10px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.07em', background: 'var(--bg-th)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
};
const TD = { padding: '7px 9px', fontSize: '12px', color: 'var(--text-sub)', verticalAlign: 'middle', whiteSpace: 'nowrap' };

// Utility to check if an LR requires diesel verification and isn't verified yet
function hasUnverifiedDiesel(v) {
  const dieselVal = parseFloat(v.advanceDiesel);
  const hasDiesel = (!isNaN(dieselVal) && dieselVal > 0) || v.advanceDiesel === 'FULL' || v.isFullTank;
  return hasDiesel && !v.isDieselVerified;
}

export default function PayModule({ brand, role, permissions }) {
  const [vouchers, setVouchers] = useState([]);
  const [selTruck, setSelTruck] = useState(null);
  const [selectedLrs, setSelectedLrs] = useState(new Set());
  const [view, setView] = useState('freight'); // 'freight' or 'firm'
  const [profiles, setProfiles] = useState([]);
  const [firmPayments, setFirmPayments] = useState([]);
  const [showLedger, setShowLedger] = useState(null);
  
  // Firm Payment Form
  const [firmForm, setFirmForm] = useState({
    profileId: '',
    otherProfileName: '',
    category: 'Advance',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    remark: '',
    paymentMethod: 'Cash'
  });
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'month', '15days', 'custom'
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [processing, setProcessing] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const { width, height } = useWindowSize();

  const [filters, setFilters] = useState({});
  const handleFilterChange = (key, val) => setFilters(f => ({ ...f, [key]: val }));

  const [detailTab, setDetailTab] = useState('pending');
  const [vehiclesInfo, setVehiclesInfo] = useState([]);
  const [receiptModal, setReceiptModal] = useState(null);

  // Vehicle Advance states (synced with Balance Sheet)
  const [advances, setAdvances] = useState([]);
  const [advForm, setAdvForm] = useState({ type: 'debit', amount: '', date: new Date().toISOString().slice(0, 10), remark: '' });
  const [advSaving, setAdvSaving] = useState(false);
  const [showAdvForm, setShowAdvForm] = useState(false);

  const advanceBalance = useMemo(() =>
    advances.reduce((bal, a) => bal + (a.type === 'credit' ? a.amount : -a.amount), 0),
  [advances]);

  const getTypesForBrand = () => {
    if (brand === 'jkl') return ['Dump', 'JK_Lakshmi'];
    if (brand === 'dump') return ['Dump', 'JK_Super'];
    return [...TYPES];
  };

  useEffect(() => {
    fetchVouchers();
    fetchVehicles();
    fetchProfiles();
    fetchFirmPayments();
    setSelTruck(null);
    setSelectedLrs(new Set());
    setDateFilter('all');
    setDetailTab('pending');
    setAdvances([]);
  }, [brand]);

  useEffect(() => {
    if (selTruck) fetchAdvances(selTruck);
    else setAdvances([]);
  }, [selTruck]);

  const fetchAdvances = async (truck) => {
    try { setAdvances((await ax.get('/vehicle-advances/' + encodeURIComponent(truck))).data); }
    catch { setAdvances([]); }
  };

  const handleAdvSubmit = async (e) => {
    e.preventDefault();
    if (!advForm.amount || parseFloat(advForm.amount) <= 0) return;
    setAdvSaving(true);
    try {
      await ax.post('/vehicle-advances', { ...advForm, truckNo: selTruck });
      setAdvForm({ type: 'debit', amount: '', date: new Date().toISOString().slice(0, 10), remark: '' });
      setShowAdvForm(false);
      fetchAdvances(selTruck);
    } catch (er) { alert(er.response?.data?.error || 'Failed to save advance'); }
    finally { setAdvSaving(false); }
  };

  const handleAdvDelete = async (id) => {
    if (!window.confirm('Delete this advance entry?')) return;
    try { await ax.delete('/vehicle-advances/' + id); fetchAdvances(selTruck); }
    catch { alert('Delete failed'); }
  };

  const fetchProfiles = async () => {
    try {
      const { data } = await ax.get('/profiles');
      setProfiles(data);
    } catch (e) { console.error(e); }
  };

  const calculateSalary = (joined, exit, fixedSalary, leaves = []) => {
    if (!joined || !fixedSalary) return 0;
    const start = new Date(joined);
    const end = exit ? new Date(exit) : new Date();
    if (isNaN(start.getTime()) || start > end) return 0;

    const diffTime = Math.abs(end - start);
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
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

  const getProfileBalance = (p) => {
    const earned = calculateSalary(p.dateJoined, p.dateExit, p.fixedSalary, p.leaves);
    const paid = firmPayments.filter(pay => pay.profileId === p.id).reduce((s, pay) => s + parseFloat(pay.amount || 0), 0);
    return earned - paid;
  };

  const fetchFirmPayments = async () => {
    try {
      const { data } = await ax.get('/payments');
      setFirmPayments(data);
    } catch (e) { console.error(e); }
  };

  const fetchVehicles = async () => {
    try {
      const res = await ax.get('/vehicles');
      setVehiclesInfo(res.data);
    } catch (e) {
      console.error('Failed to fetch vehicles', e);
    }
  };

  const fetchVouchers = async () => {
    try {
      const typesToFetch = getTypesForBrand();
      const promises = typesToFetch.map(t => ax.get(API_V + '/' + t));
      const results = await Promise.all(promises);
      let allVouchers = [];
      results.forEach(res => {
        allVouchers = allVouchers.concat(res.data);
      });
      setVouchers(allVouchers);
    } catch (err) {
      console.error('Failed to fetch vouchers for payment module', err);
    }
  };

  const truckGroups = useMemo(() => {
    const map = {};
    vouchers.forEach(v => {
      const t = v.truckNo || 'Unknown';
      if (!map[t]) map[t] = [];
      map[t].push(v);
    });
    return map;
  }, [vouchers]);

  const allTrucks = useMemo(() => Object.keys(truckGroups).sort(), [truckGroups]);

  const truckSummaries = useMemo(() => {
    let list = allTrucks.map(truck => {
      const rows = truckGroups[truck] || [];
      const net = rows.reduce((s, v) => s + calcNet(v), 0);
      const paid = rows.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0);
      const pendingRows = rows.filter(v => calcNet(v) > (parseFloat(v.paidBalance) || 0));
      const types = [...new Set(rows.map(r => r.type?.replace('_', ' ') || 'Unknown'))].join(', ');
      return { 
        truck, 
        trips: String(rows.length), 
        pendingTrips: String(pendingRows.length),
        net, 
        paid, 
        outstanding: Math.max(0, net - paid),
        status: (Math.max(0, net - paid) <= 0 ? 'Cleared' : 'Pending'),
        hasUnverified: pendingRows.some(hasUnverifiedDiesel),
        types
      };
    });

    Object.keys(filters).forEach(key => {
      const selectedValues = filters[key];
      if (selectedValues && selectedValues.length > 0) {
        list = list.filter(t => selectedValues.includes(String(t[key] ?? '')));
      }
    });

    return list;
  }, [allTrucks, truckGroups, filters]);

  // Specific vehicle view
  const vehicleLrs = useMemo(() => {
    if (!selTruck) return [];
    let rows = truckGroups[selTruck] || [];
    // Only show pending or partially paid LRs
    rows = rows.filter(v => calcNet(v) > (parseFloat(v.paidBalance) || 0));

    // Date filtering
    if (dateFilter !== 'all') {
      const today = new Date();
      let start, end;
      if (dateFilter === 'month') {
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      } else if (dateFilter === '15days') {
        start = new Date(today);
        start.setDate(today.getDate() - 15);
        end = today;
      } else if (dateFilter === 'custom' && customStart && customEnd) {
        start = new Date(customStart);
        end = new Date(customEnd);
      }
      
      if (start && end) {
        rows = rows.filter(v => {
          if (!v.date) return false;
          const d = new Date(v.date);
          // Set to start of day for accurate comparison
          d.setHours(0,0,0,0);
          start.setHours(0,0,0,0);
          end.setHours(23,59,59,999);
          return d >= start && d <= end;
        });
      }
    }

    return rows.sort((a, b) => a.date < b.date ? 1 : -1);
  }, [selTruck, truckGroups, dateFilter, customStart, customEnd]);

  // History vehicle view
  const paidLrs = useMemo(() => {
    if (!selTruck) return [];
    let rows = truckGroups[selTruck] || [];
    // Show fully paid LRs
    rows = rows.filter(v => calcNet(v) <= (parseFloat(v.paidBalance) || 0) && (parseFloat(v.paidBalance) || 0) > 0);
    return rows.sort((a, b) => {
      const d1 = new Date(a.paymentClearedDate || 0);
      const d2 = new Date(b.paymentClearedDate || 0);
      return d2 - d1;
    });
  }, [selTruck, truckGroups]);

  const onCheck = (id) => {
    setSelectedLrs(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const onCheckAll = (rows, addAll) => {
    setSelectedLrs(s => {
      const n = new Set(s);
      rows.forEach(v => addAll ? n.add(v.id) : n.delete(v.id));
      return n;
    });
  };

  const selRows = vehicleLrs.filter(v => selectedLrs.has(v.id));
  const selOutstanding = selRows.reduce((s, v) => s + Math.max(0, calcNet(v) - (parseFloat(v.paidBalance) || 0)), 0);
  
  // Validation checks
  const hasSelectedUnverified = selRows.some(hasUnverifiedDiesel);
  const canPay = selectedLrs.size > 0 && !hasSelectedUnverified && paymentDate;

  const handlePay = async () => {
    if (!canPay) return;
    setProcessing(true);
    try {
      await Promise.all(selRows.map(v => 
        ax.patch(API_V + '/' + v.id, {
          paidBalance: String(calcNet(v).toFixed(2)),
          paymentClearedDate: paymentDate
        })
      ));
      
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
      
      const tv = vehiclesInfo.find(v => v.truckNo === selTruck);
      setReceiptModal({
        truckNo: selTruck,
        date: paymentDate,
        amount: selOutstanding,
        phone: tv?.ownerContact || ''
      });

      setSelectedLrs(new Set());
      await fetchVouchers();
      
    } catch (err) {
      alert('Payment processing failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };



  return (
    <div>
      {showConfetti && <div style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}><Confetti width={width} height={height} recycle={false} numberOfPieces={300} /></div>}
      
      {/* WhatsApp Receipt Modal */}
      {receiptModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card" style={{ width: '400px', maxWidth: '90vw', overflow: 'hidden' }}>
            <div style={{ background: '#10b981', color: 'white', padding: '20px', textAlign: 'center', position: 'relative' }}>
              <button 
                onClick={() => setReceiptModal(null)}
                style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={16} />
              </button>
              <CheckCircle2 size={48} style={{ margin: '0 auto 12px auto' }} />
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>Payment Successful!</h2>
              <p style={{ margin: '4px 0 0 0', opacity: 0.9, fontSize: '14px' }}>{fmtRs(receiptModal.amount)} settled for {receiptModal.truckNo}</p>
            </div>
            <div style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '12px', textAlign: 'center' }}>Send Receipt to Owner</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-sub)', textAlign: 'center', marginBottom: '20px' }}>
                Share a detailed breakdown of this payment via WhatsApp.
              </p>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>WhatsApp Number</label>
                <input 
                  type="text" 
                  className="fi" 
                  value={receiptModal.phone} 
                  onChange={e => setReceiptModal({ ...receiptModal, phone: e.target.value })}
                  placeholder="e.g. 9876543210" 
                  style={{ fontSize: '16px', letterSpacing: '1px', textAlign: 'center', fontWeight: 'bold' }}
                />
              </div>

              <button 
                className="btn" 
                style={{ width: '100%', padding: '14px', background: '#25D366', color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={() => {
                  const num = receiptModal.phone.replace(/[^0-9]/g, '');
                  if (num.length < 10) { alert('Please enter a valid phone number.'); return; }
                  
                  // Construct Link
                  const baseUrl = window.location.origin;
                  const receiptLink = `${baseUrl}/receipt/${encodeURIComponent(receiptModal.truckNo)}/${encodeURIComponent(receiptModal.date)}`;
                  
                  const message = `Hello, your pending freight payment of ${fmtRs(receiptModal.amount)} for truck ${receiptModal.truckNo} has been cleared on ${fmtDate(receiptModal.date)}. \n\nView your full payment breakdown here: \n${receiptLink}`;
                  
                  // Open WhatsApp
                  window.open(`https://wa.me/91${num}?text=${encodeURIComponent(message)}`, '_blank');
                  setReceiptModal(null);
                }}
              >
                Send via WhatsApp
              </button>
              
              <button 
                className="btn btn-g" 
                style={{ width: '100%', padding: '12px', marginTop: '12px', borderRadius: '8px' }}
                onClick={() => setReceiptModal(null)}
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
      
      <div className="page-hd">
        <div>
          <h1><Banknote size={20} color="#10b981" /> Pay Module</h1>
          <p>{selTruck ? `Clearing payments for ${selTruck}` : 'Vehicle payment settlement system'}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--bg-input)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <button className={`btn btn-sm ${view === 'freight' ? 'btn-p' : 'btn-g'}`} style={{ border: 'none' }} onClick={() => setView('freight')}>Freight Pay</button>
            <button className={`btn btn-sm ${view === 'firm' ? 'btn-p' : 'btn-g'}`} style={{ border: 'none' }} onClick={() => setView('firm')}>Firm Pay</button>
          </div>
          {selTruck && view === 'freight' && <button className="btn btn-g btn-sm" onClick={() => {setSelTruck(null); setSelectedLrs(new Set());}}><ChevronLeft size={14} /> All Trucks</button>}
        </div>
      </div>

      {view === 'firm' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '20px' }}>
          {/* Firm Payment Form */}
          <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HandCoins size={20} color="var(--primary)" /> Record Firm Payment
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ margin: 0 }}>Select Profile</label>
                  {firmForm.profileId && firmForm.profileId !== '__other__' && (
                    <button onClick={() => setShowLedger(profiles.find(p => p.id === firmForm.profileId))} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>View Full Ledger</button>
                  )}
                </div>
                <select className="fi" value={firmForm.profileId} onChange={e => setFirmForm({...firmForm, profileId: e.target.value, otherProfileName: ''})}>
                  <option value="">-- Select Profile --</option>
                  {profiles.map(p => {
                    const bal = getProfileBalance(p);
                    return (
                      <option key={p.id} value={p.id}>{p.name} ({p.type}) | Bal: ₹{bal.toLocaleString()}</option>
                    );
                  })}
                  <option value="__other__">➕ Other (Type Manually)</option>
                </select>
                {firmForm.profileId === '__other__' && (
                  <input
                    className="fi"
                    style={{ marginTop: '8px' }}
                    type="text"
                    placeholder="Enter name (e.g. vendor, supplier, expense...)"
                    value={firmForm.otherProfileName}
                    onChange={e => setFirmForm({...firmForm, otherProfileName: e.target.value})}
                    autoFocus
                  />
                )}
              </div>
              <div className="field">
                <label>Payment Category</label>
                <select className="fi" value={firmForm.category} onChange={e => setFirmForm({...firmForm, category: e.target.value})}>
                  <option value="Salary">Staff Salary</option>
                  <option value="Advance">Advance Payment</option>
                  <option value="Tyre">Tyre Expense</option>
                  <option value="Maintenance">Vehicle Maintenance</option>
                  <option value="Other">Other Expenses</option>
                </select>
              </div>
              <div className="fg fg-2">
                <div className="field">
                  <label>Amount (₹)</label>
                  <input type="number" className="fi" value={firmForm.amount} onChange={e => setFirmForm({...firmForm, amount: e.target.value})} placeholder="0.00" />
                </div>
                <div className="field">
                  <label>Date</label>
                  <input type="date" className="fi" value={firmForm.date} onChange={e => setFirmForm({...firmForm, date: e.target.value})} />
                </div>
              </div>
              <div className="field">
                <label>Remark / Note</label>
                <textarea className="fi" value={firmForm.remark} onChange={e => setFirmForm({...firmForm, remark: e.target.value})} placeholder="Payment details..." style={{ minHeight: '80px' }} />
              </div>
              <button className="btn btn-p" style={{ width: '100%', padding: '14px', fontSize: '15px', fontWeight: 700 }} 
                onClick={async () => {
                  if (!firmForm.profileId || !firmForm.amount) { alert('Please select a profile and enter an amount'); return; }
                  if (firmForm.profileId === '__other__' && !firmForm.otherProfileName.trim()) { alert('Please enter a name for Other'); return; }
                  try {
                    const payload = {
                      ...firmForm,
                      profileId: firmForm.profileId === '__other__' ? null : firmForm.profileId,
                      profileName: firmForm.profileId === '__other__' ? firmForm.otherProfileName.trim() : (profiles.find(p => p.id === firmForm.profileId)?.name || ''),
                    };
                    await ax.post('/payments', payload);
                    setFirmForm({...firmForm, amount: '', remark: '', otherProfileName: ''});
                    fetchFirmPayments();
                    alert('Payment recorded successfully');
                  } catch (e) { alert('Failed to record payment'); }
                }}>
                Confirm Payment
              </button>
            </div>
          </div>

          {/* Recent Firm Payments */}
          <div className="card">
            <div className="card-header border-b">
              <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Recent Firm Payments</h3>
            </div>
            <div className="tbl-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={TH}>Date</th>
                    <th style={TH}>Profile</th>
                    <th style={TH}>Category</th>
                    <th style={TH}>Amount</th>
                    <th style={TH}>Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {firmPayments.slice(0, 20).map((p, i) => {
                    const prof = profiles.find(pr => pr.id === p.profileId);
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                        <td style={TD}>{fmtDate(p.date)}</td>
                        <td style={TD}>
                          <div style={{ fontWeight: 700 }}>{p.profileName || profiles.find(pr => pr.id === p.profileId)?.name || 'Unknown'}</div>
                          <div style={{ fontSize: '10px', opacity: 0.6 }}>{p.profileId ? (profiles.find(pr => pr.id === p.profileId)?.type || 'Profile') : 'Other'}</div>
                        </td>
                        <td style={TD}>
                          <span style={{ padding: '2px 6px', background: 'var(--bg-input)', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>{p.category}</span>
                        </td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: 'var(--danger)' }}>₹{parseFloat(p.amount).toLocaleString()}</td>
                        <td style={{ ...TD, whiteSpace: 'normal', fontSize: '11px' }}>{p.remark}</td>
                      </tr>
                    );
                  })}
                  {firmPayments.length === 0 && (
                    <tr><td colSpan={5} style={{ ...TD, textAlign: 'center', padding: '40px' }}>No firm payments recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <React.Fragment>
          {!selTruck ? (
        // OVERVIEW LIST
        <div className="card">
          <div className="card-header border-b">
            <div className="card-title-block">
              <div className="card-icon" style={{ background: 'rgba(16,185,129,0.1)' }}><HandCoins size={17} color="#10b981" /></div>
              <div className="card-title-text">
                <h3>Pending Payments ({brand === 'jkl' ? 'JK Lakshmi Area' : 'JK Super Area'})</h3>
                <p>Select a vehicle to process LRs</p>
              </div>
            </div>
          </div>
          <div className="tbl-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={TH}>#</th>
                  <th style={TH}><ColumnFilter label="Truck No." colKey="truck" data={truckSummaries} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                  <th style={TH}>Trip Types</th>
                  <th style={TH}>Pending Trips</th>
                  <th style={TH}>Outstanding Due</th>
                  <th style={TH}>Diesel Status</th>
                  <th style={TH}>Action</th>
                </tr>
              </thead>
              <tbody>
                {truckSummaries.filter(ts => ts.outstanding > 0).map((ts, i) => (
                  <tr key={ts.truck} 
                    style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)', cursor: 'pointer', transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-row-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)'}
                    onClick={() => { setSelTruck(ts.truck); setDetailTab('pending'); }}
                  >
                    <td style={{ ...TD, textAlign: 'center', fontWeight: 'bold', color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td style={{ ...TD }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Truck size={14} color="#f59e0b" />
                        </div>
                        <span style={{ fontWeight: 800, color: 'var(--text)', fontSize: '13px' }}>{ts.truck}</span>
                      </div>
                    </td>
                    <td style={{ ...TD, textAlign: 'center', fontWeight: 600, color: 'var(--text-sub)' }}>{ts.types}</td>
                    <td style={{ ...TD, textAlign: 'center', fontWeight: 700 }}>{ts.pendingTrips}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: 'var(--warn)', fontSize: '14px' }}>{fmtRs(ts.outstanding)}</td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      {ts.hasUnverified ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '4px', background: 'rgba(244,63,94,0.1)', color: 'var(--danger)', fontSize: '10px', fontWeight: 700 }}>
                          <AlertTriangle size={11} /> Unverified Diesel
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '4px', background: 'rgba(16,185,129,0.1)', color: 'var(--accent)', fontSize: '10px', fontWeight: 700 }}>
                          <CheckCircle2 size={11} /> Clear
                        </span>
                      )}
                    </td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      <button className="btn btn-p btn-sm">Pay Now</button>
                    </td>
                  </tr>
                ))}
                {truckSummaries.filter(ts => ts.outstanding > 0).length === 0 && (
                  <tr><td colSpan={6} style={{ ...TD, textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>All vehicles clear! No pending payments.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // DETAIL VIEW
        <div style={{ display: 'grid', gridTemplateColumns: detailTab === 'pending' ? 'minmax(0, 1fr) 300px' : 'minmax(0, 1fr)', gap: '14px', alignItems: 'start' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Controls Bar for Vehicle */}
            <div className="card" style={{ padding: '14px 20px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Truck size={20} color="#10b981" />
                </div>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text)', margin: 0 }}>{selTruck}</h2>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Vehicle Settlement Details</div>
                </div>
              </div>

              {/* Detail Tabs */}
              <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-input)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <button className={`btn btn-sm ${detailTab === 'pending' ? 'btn-p' : 'btn-g'}`} style={{ border: 'none' }} onClick={() => setDetailTab('pending')}>
                  Pending ({vehicleLrs.length})
                </button>
                <button className={`btn btn-sm ${detailTab === 'history' ? 'btn-p' : 'btn-g'}`} style={{ border: 'none' }} onClick={() => setDetailTab('history')}>
                  History ({paidLrs.length})
                </button>
                <button className={`btn btn-sm ${detailTab === 'advance' ? 'btn-p' : 'btn-g'}`} style={{ border: 'none', position: 'relative' }} onClick={() => setDetailTab('advance')}>
                  Advance Pay
                  {advances.length > 0 && <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: advanceBalance >= 0 ? '#10b981' : '#f43f5e', color: 'white', borderRadius: '50%', width: '14px', height: '14px', fontSize: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{advances.length}</span>}
                </button>
              </div>
            </div>

            {detailTab === 'pending' ? (
              <React.Fragment>
                {/* Date Filters */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-card)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <button className={`btn btn-sm ${dateFilter === 'all' ? 'btn-p' : 'btn-g'}`} style={{ border: 'none' }} onClick={() => setDateFilter('all')}>All Pending</button>
                    <button className={`btn btn-sm ${dateFilter === 'month' ? 'btn-p' : 'btn-g'}`} style={{ border: 'none' }} onClick={() => setDateFilter('month')}>This Month</button>
                    <button className={`btn btn-sm ${dateFilter === '15days' ? 'btn-p' : 'btn-g'}`} style={{ border: 'none' }} onClick={() => setDateFilter('15days')}>Last 15 Days</button>
                    <button className={`btn btn-sm ${dateFilter === 'custom' ? 'btn-p' : 'btn-g'}`} style={{ border: 'none' }} onClick={() => setDateFilter('custom')}>Custom</button>
                  </div>
                  {dateFilter === 'custom' && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="fi" style={{ padding: '6px' }} />
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>to</span>
                      <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="fi" style={{ padding: '6px' }} />
                    </div>
                  )}
                </div>

                  {/* LRs Table */}
                  <div className="card tbl-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, textAlign: 'center', width: '40px' }}>
                      <input type="checkbox" 
                        checked={vehicleLrs.length > 0 && selectedLrs.size === vehicleLrs.length}
                        ref={el => { if (el) el.indeterminate = vehicleLrs.length > 0 && selectedLrs.size > 0 && selectedLrs.size < vehicleLrs.length; }}
                        onChange={() => onCheckAll(vehicleLrs, selectedLrs.size !== vehicleLrs.length)}
                        style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: 'var(--primary)' }} />
                    </th>
                    <th style={TH}>Date</th>
                    <th style={TH}>LR No.</th>
                    <th style={TH}>Trip Type</th>
                    <th style={TH}>Destination</th>
                    <th style={TH}>Pending Net</th>
                    <th style={TH}>Diesel Status</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicleLrs.map((v, i) => {
                    const isChecked = selectedLrs.has(v.id);
                    const out = Math.max(0, calcNet(v) - (parseFloat(v.paidBalance) || 0));
                    const unverified = hasUnverifiedDiesel(v);
                    const bg = isChecked ? (unverified ? 'rgba(244,63,94,0.08)' : 'rgba(16,185,129,0.08)') : (i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)');

                    return (
                      <tr key={v.id} style={{ background: bg, borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          <input type="checkbox" checked={isChecked} onChange={() => onCheck(v.id)}
                            style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: unverified ? 'var(--danger)' : 'var(--accent)' }} />
                        </td>
                        <td style={{ ...TD }}>{fmtDate(v.date)}</td>
                        <td style={{ ...TD, fontWeight: 800, color: 'var(--primary)' }}>#{v.lrNo}</td>
                        <td style={{ ...TD, fontWeight: 700, color: 'var(--text-sub)' }}>{v.type?.replace('_', ' ') || 'Unknown'}</td>
                        <td style={{ ...TD }}>{v.destination || v.partyName || '—'}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{fmtRs(out)}</td>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          {unverified ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--danger)', fontSize: '10px', fontWeight: 800 }}>
                              <AlertTriangle size={12} /> Pending Verification
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--accent)', fontSize: '10px', fontWeight: 800 }}>
                              <CheckCircle2 size={12} /> Clear
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {vehicleLrs.length === 0 && (
                    <tr><td colSpan={6} style={{ ...TD, textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No pending LRs found for selected dates.</td></tr>
                  )}
                </tbody>
              </table>
                  </div>
              </React.Fragment>
            ) : detailTab === 'advance' ? (
              // ADVANCE PAY TAB
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '16px' }}>
                {/* Form */}
                <div className="card" style={{ padding: '20px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Banknote size={16} color="var(--primary)" /> Record Advance
                  </h3>
                  <form onSubmit={handleAdvSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div className="field">
                      <label>Transaction Type</label>
                      <select className="fi" value={advForm.type} onChange={e => setAdvForm(f => ({ ...f, type: e.target.value }))}>
                        <option value="debit">We Give Advance to Owner (Debit −)</option>
                        <option value="credit">Owner Returns / We Receive (Credit +)</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Amount (₹)</label>
                      <input className="fi" type="number" step="any" min="1" placeholder="Amount" value={advForm.amount} onChange={e => setAdvForm(f => ({ ...f, amount: e.target.value }))} required />
                    </div>
                    <div className="field">
                      <label>Date</label>
                      <input className="fi" type="date" value={advForm.date} onChange={e => setAdvForm(f => ({ ...f, date: e.target.value }))} />
                    </div>
                    <div className="field">
                      <label>Remark</label>
                      <input className="fi" type="text" placeholder="e.g. Advance for fuel / Return of advance" value={advForm.remark} onChange={e => setAdvForm(f => ({ ...f, remark: e.target.value }))} />
                    </div>
                    <div style={{ padding: '12px', borderRadius: '8px', background: advanceBalance >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)', border: `1px solid ${advanceBalance >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}`, textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Current Advance Balance</div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: advanceBalance >= 0 ? '#10b981' : '#f43f5e' }}>{fmtRs(advanceBalance)}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{advanceBalance >= 0 ? 'Owner has given advance' : 'We have given advance'}</div>
                    </div>
                    <button type="submit" className="btn btn-p" style={{ width: '100%', padding: '12px', fontWeight: 700 }} disabled={advSaving}>
                      {advSaving ? 'Saving...' : <><Check size={14} /> Save Entry</>}
                    </button>
                  </form>
                </div>

                {/* Advance Ledger */}
                <div className="card tbl-wrap">
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Advance Ledger — {selTruck}</span>
                    <span style={{ fontSize: '13px', fontWeight: 900, color: advanceBalance >= 0 ? '#10b981' : '#f43f5e' }}>Balance: {fmtRs(advanceBalance)}</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th style={TH}>#</th>
                        <th style={TH}>Date</th>
                        <th style={TH}>Type</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Credit (+)</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Debit (−)</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Balance</th>
                        <th style={TH}>Remark</th>
                        {role === 'admin' && <th style={TH}>Del</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {advances.length === 0 && <tr><td colSpan={role === 'admin' ? 8 : 7} style={{ ...TD, textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No advance entries yet</td></tr>}
                      {[...advances].reverse().map((a, i, arr) => {
                        const runBal = arr.slice(0, i + 1).reduce((s, x) => s + (x.type === 'credit' ? x.amount : -x.amount), 0);
                        return (
                          <tr key={a.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)', borderBottom: '1px solid var(--border)' }}>
                            <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                            <td style={TD}>{fmtDate(a.date)}</td>
                            <td style={TD}>
                              {a.type === 'credit'
                                ? <span style={{ padding: '2px 7px', borderRadius: '5px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontSize: '10px', fontWeight: 800 }}>↓ Received</span>
                                : <span style={{ padding: '2px 7px', borderRadius: '5px', background: 'rgba(244,63,94,0.1)', color: '#f43f5e', fontSize: '10px', fontWeight: 800 }}>↑ Given</span>}
                            </td>
                            <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{a.type === 'credit' ? fmtRs(a.amount) : '—'}</td>
                            <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#f43f5e' }}>{a.type === 'debit' ? fmtRs(a.amount) : '—'}</td>
                            <td style={{ ...TD, textAlign: 'right', fontWeight: 900, color: runBal >= 0 ? '#10b981' : '#f43f5e' }}>{fmtRs(runBal)}</td>
                            <td style={{ ...TD, color: 'var(--text-sub)' }}>{a.remark || '—'}</td>
                            {role === 'admin' && <td style={{ ...TD, textAlign: 'center' }}><button className="btn btn-d btn-icon btn-sm" onClick={() => handleAdvDelete(a.id)} title="Delete"><X size={12} /></button></td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              // HISTORY TABLE
              <div className="card tbl-wrap">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={TH}>#</th>
                      <th style={TH}>Cleared Date</th>
                      <th style={TH}>LR Date</th>
                      <th style={TH}>LR No.</th>
                      <th style={TH}>Trip Type</th>
                      <th style={TH}>Destination</th>
                      <th style={TH}>Total Bill</th>
                      <th style={TH}>Amount Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paidLrs.map((v, i) => {
                      const net = calcNet(v);
                      return (
                        <tr key={v.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)', borderBottom: '1px solid var(--border)' }}>
                          <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                          <td style={{ ...TD, fontWeight: 800, color: 'var(--accent)' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <CheckCircle2 size={12} /> {fmtDate(v.paymentClearedDate)}
                            </span>
                          </td>
                          <td style={{ ...TD }}>{fmtDate(v.date)}</td>
                          <td style={{ ...TD, fontWeight: 800, color: 'var(--primary)' }}>#{v.lrNo}</td>
                          <td style={{ ...TD, fontWeight: 700, color: 'var(--text-sub)' }}>{v.type?.replace('_', ' ') || 'Unknown'}</td>
                          <td style={{ ...TD }}>{v.destination || v.partyName || '—'}</td>
                          <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>{fmtRs(net)}</td>
                          <td style={{ ...TD, textAlign: 'right', fontWeight: 900, color: 'var(--text)' }}>{fmtRs(v.paidBalance)}</td>
                        </tr>
                      );
                    })}
                    {paidLrs.length === 0 && (
                      <tr><td colSpan={7} style={{ ...TD, textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No payment history found for this vehicle.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Payment Panel */}
          {detailTab === 'pending' && (
            <div className="card" style={{ padding: '20px', position: 'sticky', top: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 900, color: 'var(--text)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Banknote size={16} /> Settlement Panel
              </h3>

              {/* Advance Balance Quick View */}
              {advances.length > 0 && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '12px', background: advanceBalance >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)', border: `1px solid ${advanceBalance >= 0 ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>Advance Balance:</span>
                  <span style={{ fontSize: '14px', fontWeight: 900, color: advanceBalance >= 0 ? '#10b981' : '#f43f5e' }}>{fmtRs(advanceBalance)}</span>
                </div>
              )}

              <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Selected LRs:</span>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>{selectedLrs.size}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border)', paddingTop: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-sub)', fontWeight: 700 }}>Total to Pay:</span>
                  <span style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text)' }}>{fmtRs(selOutstanding)}</span>
                </div>
              </div>

              {hasSelectedUnverified && (
                <div style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <AlertTriangle size={16} color="#f43f5e" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '11px', color: '#f43f5e', fontWeight: 'bold' }}>
                      Cannot proceed with payment. Some selected LRs have unverified diesel entries. Please verify them in the Diesel Module first.
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Payment Date
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '8px', left: '10px' }}><Calendar size={14} color="var(--primary)" /></div>
                  <input type="date" className="fi" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} 
                    style={{ width: '100%', paddingLeft: '32px' }} disabled={selectedLrs.size === 0 || hasSelectedUnverified} />
                </div>
              </div>

              <button className="btn btn-p" 
                style={{ width: '100%', padding: '12px', fontSize: '14px', borderRadius: '10px', pointerEvents: (!canPay || processing) ? 'none' : 'auto', opacity: (!canPay || processing) ? 0.6 : 1 }}
                onClick={handlePay}
              >
                {processing ? 'Processing...' : (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <CheckCircle2 size={16} /> Confirm Payment
                  </span>
                )}
              </button>

              <button className="btn btn-g" style={{ width: '100%', padding: '10px', marginTop: '8px', fontSize: '12px', fontWeight: 700 }}
                onClick={() => setDetailTab('advance')}>
                <Banknote size={13} /> Add Advance Entry
              </button>
            </div>
          )}
        </div>
      )}
        </React.Fragment>
      )}

      {/* Ledger Modal in Pay Module */}
      {showLedger && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: 'var(--bg-card)', width: '100%', maxWidth: '900px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--primary)', color: 'white' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>Profile Ledger: {showLedger.name}</h2>
                                <div style={{ fontSize: '12px', opacity: 0.8 }}>{showLedger.type}</div>
                            </div>
                            <button onClick={() => setShowLedger(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', width: '32px', height: '32px', borderRadius: '50%', color: 'white', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
                        </div>
                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
                                        <th style={{ padding: '12px' }}>Date</th>
                                        <th style={{ padding: '12px' }}>Description</th>
                                        <th style={{ padding: '12px', textAlign: 'right' }}>Credit (+)</th>
                                        <th style={{ padding: '12px', textAlign: 'right' }}>Debit (-)</th>
                                        <th style={{ padding: '12px', textAlign: 'right' }}>Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        let runningBalance = 0;
                                        const entries = [
                                            ...(() => {
                                                const credits = [];
                                                const start = new Date(showLedger.dateJoined);
                                                const end = showLedger.dateExit ? new Date(showLedger.dateExit) : new Date();
                                                let current = new Date(start.getFullYear(), start.getMonth(), 1);
                                                while (current <= end) {
                                                    const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
                                                    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
                                                    const activeMonthStart = monthStart < start ? start : monthStart;
                                                    const activeMonthEnd = monthEnd > end ? end : monthEnd;
                                                    const daysInPeriod = Math.ceil(Math.abs(activeMonthEnd - activeMonthStart) / (1000 * 60 * 60 * 24)) + 1;
                                                    let leaveInMonth = 0;
                                                    (showLedger.leaves || []).forEach(l => {
                                                        if (l.start && l.end) {
                                                            const lStart = new Date(l.start);
                                                            const lEnd = new Date(l.end);
                                                            if (lStart <= activeMonthEnd && lEnd >= activeMonthStart) {
                                                                const overlapStart = lStart < activeMonthStart ? activeMonthStart : lStart;
                                                                const overlapEnd = lEnd > activeMonthEnd ? activeMonthEnd : lEnd;
                                                                leaveInMonth += Math.ceil(Math.abs(overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
                                                            }
                                                        }
                                                    });
                                                    const billableDays = Math.max(0, daysInPeriod - leaveInMonth);
                                                    credits.push({
                                                        date: activeMonthEnd,
                                                        desc: `Salary Credit - ${current.toLocaleString('default', { month: 'long', year: 'numeric' })} (${billableDays} working days)`,
                                                        credit: Math.round((showLedger.fixedSalary / 30) * billableDays),
                                                        debit: 0
                                                    });
                                                    current.setMonth(current.getMonth() + 1);
                                                }
                                                return credits;
                                            })(),
                                            ...firmPayments.filter(p => p.profileId === showLedger.id).map(p => ({
                                                date: new Date(p.date),
                                                desc: `${p.category}: ${p.remark}`,
                                                credit: 0,
                                                debit: parseFloat(p.amount || 0)
                                            }))
                                        ].sort((a, b) => a.date - b.date);

                                        return entries.map((e, idx) => {
                                            runningBalance += (e.credit - e.debit);
                                            return (
                                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '12px' }}>{e.date.toLocaleDateString()}</td>
                                                    <td style={{ padding: '12px' }}>{e.desc}</td>
                                                    <td style={{ padding: '12px', textAlign: 'right', color: 'var(--primary)', fontWeight: 600 }}>{e.credit > 0 ? `₹${e.credit.toLocaleString()}` : '-'}</td>
                                                    <td style={{ padding: '12px', textAlign: 'right', color: 'var(--danger)', fontWeight: 600 }}>{e.debit > 0 ? `₹${e.debit.toLocaleString()}` : '-'}</td>
                                                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800 }}>₹{runningBalance.toLocaleString()}</td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
    </div>
  );
}
