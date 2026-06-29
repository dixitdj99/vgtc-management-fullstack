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
const TYPES = ['Dump', 'JK_Lakshmi', 'JK_Super', 'Kosli_Bill', 'Jajjhar_Bill', 'Bahadurgarh_Bill'];

function calcNet(v, vehicle) {
  const gross = (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);
  const diesel = v.advanceDiesel === 'FULL' ? 4000 : (parseFloat(v.advanceDiesel) || 0);
  const cash = parseFloat(v.advanceCash) || 0;
  const online = parseFloat(v.advanceOnline) || 0;
  const weight = parseFloat(v.weight) || 0;
  const munshi = parseFloat(v.munshi) || (weight > 0 ? (weight < 18 ? 50 : 100) : 0);
  const shortage = parseFloat(v.shortage) || 0;
  const commission = parseFloat(v.commission) || 0;
  const tyrePuncture = parseFloat(v.tyrePuncture) || 0;
  const tyreGreasingAir = (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0) + (parseFloat(v.tyreGreasingAir) || 0);
  const extraCash = parseFloat(v.extraCash) || 0;
  let net = gross - diesel - cash - online - munshi - shortage - commission - tyrePuncture - tyreGreasingAir - extraCash;

  // Market vehicle + No GPS + JK Lakshmi = ₹50 deduction
  if (vehicle && vehicle.ownershipType === 'market' && (!vehicle.gpsType || vehicle.gpsType === 'none') && v.type === 'JK_Lakshmi') {
    net -= 50;
  }
  return net;
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

export default function PayModule({ brand, role, permissions, initialView }) {
  const [vouchers, setVouchers] = useState([]);
  const [selTruck, setSelTruck] = useState(null);
  const [truckAllVouchers, setTruckAllVouchers] = useState([]);
  useEffect(() => {
    if (selTruck) fetchTruckAllVouchers(selTruck);
  }, [selTruck]);

  const fetchTruckAllVouchers = async (truck) => {
    try { 
        const res = await ax.get(API_V);
        setTruckAllVouchers(res.data.filter(v => v.truckNo === truck));
    } catch { setTruckAllVouchers([]); }
  };
  const [selectedLrs, setSelectedLrs] = useState(new Set());
  const [view, setView] = useState(initialView || 'freight');

  useEffect(() => { if (initialView) setView(initialView); }, [initialView]);
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
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [processing, setProcessing] = useState(false);
  const [miscDeductions, setMiscDeductions] = useState([]); // [{amount, remark, date}]
  const [showConfetti, setShowConfetti] = useState(false);
  const { width, height } = useWindowSize();

  const [filters, setFilters] = useState({});
  const handleFilterChange = (key, val) => setFilters(f => ({ ...f, [key]: val }));

  const [detailTab, setDetailTab] = useState('pending');
  const [vehiclesInfo, setVehiclesInfo] = useState([]);
  const selVehicle = useMemo(() => vehiclesInfo.find(v => v.truckNo === selTruck), [vehiclesInfo, selTruck]);
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
    // All locations share same trucks — fetch ALL voucher types
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
      const promises = typesToFetch.map(t => ax.get(API_V + '/' + t).then(r => r.data).catch(() => []));
      const results = await Promise.all(promises);
      setVouchers(results.flat());
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
      const vehicle = (vehiclesInfo || []).find(vh => vh.truckNo === truck);
      const net = rows.reduce((s, v) => s + calcNet(v, vehicle), 0);
      const paid = rows.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0);
      const pendingRows = rows.filter(v => calcNet(v, vehicle) > (parseFloat(v.paidBalance) || 0));
      // Calculate outstanding per-row to avoid overpaid rows cancelling unpaid ones
      const outstanding = rows.reduce((s, v) => s + Math.max(0, calcNet(v, vehicle) - (parseFloat(v.paidBalance) || 0)), 0);
      const types = [...new Set(rows.map(r => r.type?.replace('_', ' ') || 'Unknown'))].join(', ');
      return {
        truck,
        trips: String(rows.length),
        pendingTrips: String(pendingRows.length),
        net,
        paid,
        outstanding,
        status: (outstanding <= 0 ? 'Cleared' : 'Pending'),
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
  }, [allTrucks, truckGroups, filters, vehiclesInfo]);

  // Specific vehicle view
  const vehicleLrs = useMemo(() => {
    if (!selTruck) return [];
    let rows = truckGroups[selTruck] || [];
    // Only show pending or partially paid LRs
    rows = rows.filter(v => calcNet(v, selVehicle) > (parseFloat(v.paidBalance) || 0));

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
    rows = rows.filter(v => calcNet(v, selVehicle) <= (parseFloat(v.paidBalance) || 0) && (parseFloat(v.paidBalance) || 0) > 0);
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

  const gpsAccrual = useMemo(() => {
    if (!selTruck || !selVehicle || !selVehicle.gpsType || selVehicle.gpsType === 'none') return null;

    const gpsType = selVehicle.gpsType;
    const hasGps = gpsType === 'both' || gpsType === 'jkl' || gpsType === 'jksuper';
    if (!hasGps) return null;

    // ₹250 per GPS per month. 'both' = 2 GPS = ₹500/month
    const gpsCount = gpsType === 'both' ? 2 : 1;
    const perMonth = 250 * gpsCount;

    // Find last GPS deduction from vehicle_advances (not vouchers)
    let lastDeductionDate = null;
    (advances || []).forEach(a => {
      if (a.remark && a.remark.toLowerCase().includes('gps rent') && a.type === 'debit') {
        const d = new Date(a.date);
        if (!isNaN(d.getTime()) && (!lastDeductionDate || d > lastDeductionDate)) lastDeductionDate = d;
      }
    });

    // Calculate months pending since last deduction
    const today = new Date(paymentDate || Date.now());
    let startDate = lastDeductionDate;
    if (!startDate) {
      // No previous deduction — use first voucher date
      const firstV = (truckAllVouchers || []).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
      startDate = firstV ? new Date(firstV.date) : null;
    }
    if (!startDate) return null;

    // Full months since last deduction (deduct only 1 month at a time)
    const monthsDiff = (today.getFullYear() - startDate.getFullYear()) * 12 + (today.getMonth() - startDate.getMonth());
    const pendingMonths = Math.min(1, Math.max(0, monthsDiff));
    if (pendingMonths === 0) return null;

    const amount = pendingMonths * perMonth;
    const gpsLabel = gpsType === 'both' ? 'JKL + JK Super' : gpsType === 'jkl' ? 'JK Lakshmi' : 'JK Super';

    return { months: pendingMonths, gpsCount, perMonth, amount, gpsLabel };
  }, [selTruck, selVehicle, advances, truckAllVouchers, paymentDate]);

  const onCheckAll = (rows, addAll) => {
    setSelectedLrs(s => {
      const n = new Set(s);
      rows.forEach(v => addAll ? n.add(v.id) : n.delete(v.id));
      return n;
    });
  };

  const selRows = vehicleLrs.filter(v => selectedLrs.has(v.id));
  const selOutstanding = selRows.reduce((s, v) => s + Math.max(0, calcNet(v, selVehicle) - (parseFloat(v.paidBalance) || 0)), 0);

  // Vehicle expenses from selected entries (or all pending if none selected)
  const expenseSource = selRows.length > 0 ? selRows : vehicleLrs;
  const selVehicleExpenses = useMemo(() => {
    const expenses = [];
    expenseSource.forEach(v => {
      const tp = parseFloat(v.tyrePuncture) || 0;
      const tga = (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0) + (parseFloat(v.tyreGreasingAir) || 0);
      const ec = parseFloat(v.extraCash) || 0;
      const comm = parseFloat(v.commission) || 0;
      if (tp > 0) expenses.push({ label: 'Tyre Puncture', amount: tp, date: v.date, lrNo: v.lrNo });
      if (tga > 0) expenses.push({ label: 'Tyre Greasing & Air', amount: tga, date: v.date, lrNo: v.lrNo });
      if (ec > 0) expenses.push({ label: v.extraCashRemark ? `Extra Cash (${v.extraCashRemark})` : 'Extra Cash', amount: ec, date: v.date, lrNo: v.lrNo });
      if (comm > 0) expenses.push({ label: 'Commission', amount: comm, date: v.date, lrNo: v.lrNo });
    });
    return expenses;
  }, [expenseSource]);
  const totalVehicleExp = selVehicleExpenses.reduce((s, e) => s + e.amount, 0);
  
  // Validation checks
  const hasSelectedUnverified = selRows.some(hasUnverifiedDiesel);
  const canPay = selectedLrs.size > 0 && !hasSelectedUnverified && paymentDate;

  const handlePay = async () => {
    if (!canPay) return;
    setProcessing(true);
    try {
      await Promise.all(selRows.map(v =>
        ax.patch(API_V + '/' + v.id, {
          paidBalance: String(calcNet(v, selVehicle).toFixed(2)),
          paymentClearedDate: paymentDate,
          paymentMethod
        })
      ));
      
      // Auto-deduct GPS Rent
      if (gpsAccrual && gpsAccrual.amount > 0) {
        await ax.post('/vehicle-advances', {
          truckNo: selTruck,
          type: 'debit',
          amount: gpsAccrual.amount,
          date: paymentDate,
          remark: `GPS Rent (${gpsAccrual.months}m × ${gpsAccrual.gpsCount} GPS × ₹250) - ${gpsAccrual.gpsLabel}`
        });
      }

      // Save misc deductions as vehicle-advance entries
      for (const d of miscDeductions) {
        if (d.amount > 0) {
          await ax.post('/vehicle-advances', {
            truckNo: selTruck,
            type: 'debit',
            amount: d.amount,
            date: d.date || paymentDate,
            remark: d.remark || 'Miscellaneous Deduction'
          });
        }
      }
      setMiscDeductions([]);

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
          <h1><Banknote size={20} color="#10b981" /> Pay</h1>
          <p>{selTruck ? `Clearing payments for ${selTruck}` : 'Vehicle & staff payment settlement'}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--bg-input)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <button className={`btn btn-sm ${view === 'freight' ? 'btn-p' : 'btn-g'}`} style={{ border: 'none' }} onClick={() => setView('freight')}>Freight Pay</button>
            <button className={`btn btn-sm ${view === 'online' ? 'btn-p' : 'btn-g'}`} style={{ border: 'none' }} onClick={() => setView('online')}>Online Advances</button>
            <button className={`btn btn-sm ${view === 'firm' ? 'btn-p' : 'btn-g'}`} style={{ border: 'none' }} onClick={() => setView('firm')}>Firm Pay</button>
            <button className={`btn btn-sm ${view === 'staff' ? 'btn-p' : 'btn-g'}`} style={{ border: 'none' }} onClick={() => setView('staff')}>Staff Pay</button>
          </div>
          {selTruck && view === 'freight' && <button className="btn btn-g btn-sm" onClick={() => {setSelTruck(null); setSelectedLrs(new Set());}}><ChevronLeft size={14} /> All Trucks</button>}
        </div>
      </div>

      {view === 'online' ? (() => {
        const onlineList = vouchers
          .filter(v => parseFloat(v.advanceOnline) > 0)
          .map(v => ({ ...v, onlineAmt: parseFloat(v.advanceOnline) || 0 }))
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const unpaid = onlineList.filter(v => !v.isOnlinePaid);
        const paid = onlineList.filter(v => v.isOnlinePaid);
        const totalOnline = onlineList.reduce((s, v) => s + v.onlineAmt, 0);
        const totalUnpaid = unpaid.reduce((s, v) => s + v.onlineAmt, 0);

        const markPaidWithDate = async (id, paidDate) => {
          try {
            await ax.patch(API_V + '/' + id, { isOnlinePaid: true, onlinePaidDate: paidDate });
            fetchVouchers();
          } catch { alert('Update failed'); }
        };

        const markUnpaid = async (id) => {
          try {
            await ax.patch(API_V + '/' + id, { isOnlinePaid: false, onlinePaidDate: null });
            fetchVouchers();
          } catch { alert('Update failed'); }
        };

        // Group unpaid by date
        const unpaidByDate = {};
        unpaid.forEach(v => {
          const d = v.date || 'Unknown';
          if (!unpaidByDate[d]) unpaidByDate[d] = [];
          unpaidByDate[d].push(v);
        });
        const sortedDates = Object.keys(unpaidByDate).sort((a, b) => b.localeCompare(a));

        return (
          <div>
            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '20px' }}>
              {[
                { label: 'Total Online Advances', val: fmtRs(totalOnline), color: '#0ea5e9', count: onlineList.length },
                { label: 'Unpaid', val: fmtRs(totalUnpaid), color: '#f59e0b', count: unpaid.length },
                { label: 'Paid', val: fmtRs(totalOnline - totalUnpaid), color: '#10b981', count: paid.length },
              ].map(s => (
                <div key={s.label} className="stat-card" style={{ borderTop: `3px solid ${s.color}` }}>
                  <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{s.label}</div>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: s.color, marginTop: '4px' }}>{s.val}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{s.count} entries</div>
                </div>
              ))}
            </div>

            {/* Unpaid — grouped by date */}
            <div className="card" style={{ marginBottom: '20px' }}>
              <div className="card-header">
                <div className="card-title-block">
                  <div className="card-icon" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}><AlertCircle size={17} /></div>
                  <div className="card-title-text"><h3>Unpaid Online Advances</h3><p>{unpaid.length} pending</p></div>
                </div>
              </div>
              {sortedDates.length === 0 && (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600 }}>All online advances are paid!</div>
              )}
              {sortedDates.map(date => {
                const rows = unpaidByDate[date];
                const dayTotal = rows.reduce((s, v) => s + v.onlineAmt, 0);
                const daysSince = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
                const isLate = daysSince > 3;
                return (
                  <div key={date}>
                    <div style={{ padding: '8px 16px', background: isLate ? 'rgba(239,68,68,0.06)' : 'var(--bg-tf)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>{fmtDate(date)}</span>
                        {isLate && <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 7px', borderRadius: '4px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>{daysSince} DAYS OVERDUE</span>}
                      </div>
                      <span style={{ fontWeight: 800, fontSize: '13px', color: '#0ea5e9' }}>Day Total: {fmtRs(dayTotal)}</span>
                    </div>
                    <div className="tbl-wrap">
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                        <thead><tr>
                          <th style={TH}>#</th><th style={TH}>Truck</th><th style={TH}>LR No.</th>
                          <th style={TH}>Type</th><th style={{ ...TH, textAlign: 'right' }}>Amount</th>
                          <th style={{ ...TH, textAlign: 'center' }}>Pay Date</th><th style={{ ...TH, textAlign: 'center' }}>Action</th>
                        </tr></thead>
                        <tbody>
                          {rows.map((v, i) => (
                            <tr key={v.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                              <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                              <td style={{ ...TD, fontWeight: 700 }}>{v.truckNo || '—'}</td>
                              <td style={{ ...TD, fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>#{v.lrNo}</td>
                              <td style={TD}><span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 700, background: 'rgba(14,165,233,0.1)', color: '#0ea5e9' }}>{v.type?.replace('_', ' ')}</span></td>
                              <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: '#0ea5e9', fontSize: '13px' }}>{fmtRs(v.onlineAmt)}</td>
                              <td style={{ ...TD, textAlign: 'center' }}>
                                <input type="date" className="fi" defaultValue={new Date().toISOString().slice(0, 10)} id={`opd-${v.id}`}
                                  style={{ height: '28px', fontSize: '11px', padding: '2px 6px', width: '130px' }} />
                              </td>
                              <td style={{ ...TD, textAlign: 'center' }}>
                                <button className="btn btn-a btn-sm" style={{ fontSize: '11px', padding: '4px 10px' }}
                                  onClick={() => markPaidWithDate(v.id, document.getElementById(`opd-${v.id}`).value)}>
                                  <Check size={12} /> Pay
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Paid Table */}
            {paid.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <div className="card-title-block">
                    <div className="card-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}><CheckCircle2 size={17} /></div>
                    <div className="card-title-text"><h3>Paid Online Advances</h3><p>{paid.length} cleared</p></div>
                  </div>
                </div>
                <div className="tbl-wrap">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead><tr>
                      <th style={TH}>#</th><th style={TH}>Date</th><th style={TH}>Truck</th><th style={TH}>LR No.</th>
                      <th style={TH}>Type</th><th style={{ ...TH, textAlign: 'right' }}>Amount</th><th style={TH}>Paid On</th><th style={{ ...TH, textAlign: 'center' }}>Action</th>
                    </tr></thead>
                    <tbody>
                      {paid.map((v, i) => (
                        <tr key={v.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                          <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                          <td style={TD}>{fmtDate(v.date)}</td>
                          <td style={{ ...TD, fontWeight: 700 }}>{v.truckNo || '—'}</td>
                          <td style={{ ...TD, fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>#{v.lrNo}</td>
                          <td style={TD}><span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 700, background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>{v.type?.replace('_', ' ')}</span></td>
                          <td style={{ ...TD, textAlign: 'right', fontWeight: 800, fontSize: '13px' }}>{fmtRs(v.onlineAmt)}</td>
                          <td style={{ ...TD, fontWeight: 700, color: 'var(--accent)' }}>{fmtDate(v.onlinePaidDate)}</td>
                          <td style={{ ...TD, textAlign: 'center' }}>
                            <button className="btn btn-g btn-sm" style={{ fontSize: '10px', padding: '3px 8px' }} onClick={() => togglePaid(v.id, true)}>Undo</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })() : view === 'firm' ? (
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
                  <option value="__other__">+ Other (Type Manually)</option>
                </select>
                {firmForm.profileId === '__other__' && (
                  <input className="fi" style={{ marginTop: '8px' }} type="text" placeholder="Enter name (e.g. vendor, supplier, expense...)" value={firmForm.otherProfileName}
                    onChange={e => setFirmForm({...firmForm, otherProfileName: e.target.value})} autoFocus />
                )}
              </div>
              <div className="field">
                <label>Payment Category</label>
                <select className="fi" value={firmForm.category} onChange={e => setFirmForm({...firmForm, category: e.target.value})}>
                  <option value="Salary">Staff Salary</option>
                  <option value="Advance">Advance Payment</option>
                  <option value="Pump">Pump Payment</option>
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
                  {firmPayments.slice(0, 30).map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                      <td style={TD}>{fmtDate(p.date)}</td>
                      <td style={TD}>
                        <div style={{ fontWeight: 700 }}>{p.profileName || profiles.find(pr => pr.id === p.profileId)?.name || 'Unknown'}</div>
                        <div style={{ fontSize: '10px', opacity: 0.6 }}>{p.profileId ? (profiles.find(pr => pr.id === p.profileId)?.type || 'Profile') : 'Other'}</div>
                      </td>
                      <td style={TD}>
                        <span style={{ padding: '2px 6px', background: p.category === 'Pump' ? 'rgba(59,130,246,0.1)' : 'var(--bg-input)', color: p.category === 'Pump' ? '#3b82f6' : 'inherit', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>{p.category}</span>
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: 'var(--danger)' }}>₹{parseFloat(p.amount).toLocaleString()}</td>
                      <td style={{ ...TD, whiteSpace: 'normal', fontSize: '11px' }}>{p.remark}</td>
                    </tr>
                  ))}
                  {firmPayments.length === 0 && (
                    <tr><td colSpan={5} style={{ ...TD, textAlign: 'center', padding: '40px' }}>No firm payments recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : view === 'staff' ? (
        <div>
          {/* Staff Summary Cards */}
          {(() => {
            const staffProfiles = profiles.filter(p => p.type === 'Driver' || p.type === 'Office Staff' || p.type === 'Labour');
            const totalEarned = staffProfiles.reduce((s, p) => s + calculateSalary(p.dateJoined, p.dateExit, p.fixedSalary, p.leaves), 0);
            const totalPaid = staffProfiles.reduce((s, p) => s + firmPayments.filter(f => f.profileId === p.id).reduce((ss, f) => ss + (parseFloat(f.amount) || 0), 0), 0);
            const totalAdvance = staffProfiles.reduce((s, p) => s + firmPayments.filter(f => f.profileId === p.id && f.category === 'Advance').reduce((ss, f) => ss + (parseFloat(f.amount) || 0), 0), 0);
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '18px' }}>
                {[
                  { label: 'Total Staff', val: staffProfiles.length, fmt: v => v, color: '#6366f1' },
                  { label: 'Total Earned', val: totalEarned, fmt: v => `₹${v.toLocaleString('en-IN')}`, color: '#10b981' },
                  { label: 'Total Paid', val: totalPaid, fmt: v => `₹${v.toLocaleString('en-IN')}`, color: '#f59e0b' },
                  { label: 'Balance Due', val: totalEarned - totalPaid, fmt: v => `₹${Math.abs(v).toLocaleString('en-IN')}`, color: totalEarned - totalPaid > 0 ? '#ef4444' : '#10b981' },
                  { label: 'Advances Given', val: totalAdvance, fmt: v => `₹${v.toLocaleString('en-IN')}`, color: '#0ea5e9' },
                ].map(c => (
                  <div key={c.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>{c.label}</div>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: c.color }}>{c.fmt(c.val)}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Staff & Drivers Table */}
          <div className="card">
            <div className="card-header border-b">
              <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Staff & Drivers</h3>
            </div>
            <div className="tbl-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={TH}>Name</th>
                    <th style={TH}>Type</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Monthly Salary</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Earned</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Paid</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Balance</th>
                    <th style={{ ...TH, textAlign: 'right' }}>Advances</th>
                    <th style={{ ...TH, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.filter(p => p.type === 'Driver' || p.type === 'Office Staff' || p.type === 'Labour').map((p, i) => {
                    const earned = calculateSalary(p.dateJoined, p.dateExit, p.fixedSalary, p.leaves);
                    const paid = firmPayments.filter(f => f.profileId === p.id).reduce((s, f) => s + (parseFloat(f.amount) || 0), 0);
                    const balance = earned - paid;
                    const advAmt = firmPayments.filter(f => f.profileId === p.id && f.category === 'Advance').reduce((s, f) => s + (parseFloat(f.amount) || 0), 0);
                    return (
                      <tr key={p.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                        <td style={TD}>
                          <div style={{ fontWeight: 700, color: 'var(--text)' }}>{p.name}</div>
                          {p.department && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{p.department}</div>}
                        </td>
                        <td style={TD}>
                          <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, background: p.type === 'Driver' ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.1)', color: p.type === 'Driver' ? '#f59e0b' : '#6366f1' }}>{p.type}</span>
                        </td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>₹{(p.fixedSalary || 0).toLocaleString('en-IN')}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>₹{earned.toLocaleString('en-IN')}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>₹{paid.toLocaleString('en-IN')}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: balance > 0 ? 'var(--danger)' : 'var(--accent)' }}>₹{Math.abs(balance).toLocaleString('en-IN')}</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 600, color: '#0ea5e9' }}>{advAmt > 0 ? `₹${advAmt.toLocaleString('en-IN')}` : '—'}</td>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button className="btn btn-g btn-sm" style={{ fontSize: '10px', padding: '3px 8px' }}
                              onClick={() => setShowLedger(p)}>Ledger</button>
                            <button className="btn btn-p btn-sm" style={{ fontSize: '10px', padding: '3px 8px' }}
                              onClick={() => { setView('firm'); setFirmForm(f => ({ ...f, profileId: p.id, otherProfileName: '', category: 'Salary' })); }}>Pay</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {profiles.filter(p => p.type === 'Driver' || p.type === 'Office Staff' || p.type === 'Labour').length === 0 && (
                    <tr><td colSpan={8} style={{ ...TD, textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No staff/driver profiles found</td></tr>
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
                <h3>All Vehicles</h3>
                <p>Select a vehicle to view details & process payments</p>
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
                  <tr><td colSpan={7} style={{ ...TD, textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>All vehicles clear! No pending payments.</td></tr>
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
                    const out = Math.max(0, calcNet(v, selVehicle) - (parseFloat(v.paidBalance) || 0));
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
                      <th style={TH}>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paidLrs.map((v, i) => {
                      const net = calcNet(v, selVehicle);
                      const method = v.paymentMethod || 'Cash';
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
                          <td style={{ ...TD, textAlign: 'center' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 800, background: method === 'Online' ? 'rgba(10,110,209,0.1)' : 'rgba(16,185,129,0.1)', color: method === 'Online' ? '#0A6ED1' : '#10b981' }}>
                              {method === 'Online' ? '🏦' : '💵'} {method}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {paidLrs.length === 0 && (
                      <tr><td colSpan={9} style={{ ...TD, textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No payment history found for this vehicle.</td></tr>
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

              <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Selected LRs:</span>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>{selectedLrs.size}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border)', paddingTop: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-sub)', fontWeight: 700 }}>Freight Total:</span>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>{fmtRs(selOutstanding)}</span>
                </div>
                {/* Vehicle Expenses from selected entries */}
                {selVehicleExpenses.length > 0 && (
                  <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '8px', marginTop: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Vehicle Expenses{selRows.length > 0 ? ' (selected)' : ' (all pending)'} — already deducted</div>
                    {selVehicleExpenses.map((e, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>{e.label} <span style={{ color: 'var(--text-muted)', fontSize: '9px' }}>LR#{e.lrNo} · {e.date}</span></span>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b' }}>{fmtRs(e.amount)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dotted var(--border)', paddingTop: '4px', marginTop: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b' }}>Total Expenses:</span>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#f59e0b' }}>{fmtRs(totalVehicleExp)}</span>
                    </div>
                  </div>
                )}
                {gpsAccrual && (
                  <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '8px', marginTop: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--warn)', fontWeight: 700 }}>− GPS Rent ({gpsAccrual.gpsLabel}):</span>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--warn)' }}>− {fmtRs(gpsAccrual.amount)}</span>
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                      {gpsAccrual.gpsCount} GPS × ₹250 × {gpsAccrual.months} month{gpsAccrual.months > 1 ? 's' : ''}
                    </div>
                  </div>
                )}
                {/* Misc Deductions */}
                {miscDeductions.length > 0 && miscDeductions.map((d, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--border)', paddingTop: '6px', marginTop: '6px' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700 }}>− {d.remark || 'Misc'}</span>
                      {d.date && <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginLeft: '6px' }}>{d.date}</span>}
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#f59e0b', marginRight: '4px' }}>− {fmtRs(d.amount)}</span>
                    <button onClick={() => setMiscDeductions(p => p.filter((_, j) => j !== i))}
                      style={{ border: 'none', background: 'none', color: '#f43f5e', cursor: 'pointer', padding: '2px', fontSize: '12px' }}>×</button>
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--border)', paddingTop: '10px', marginTop: '10px' }}>
                  <span style={{ fontSize: '15px', color: 'var(--primary)', fontWeight: 900 }}>Net Payout:</span>
                  <span style={{ fontSize: '20px', fontWeight: 900, color: 'var(--primary)' }}>{fmtRs(selOutstanding - (gpsAccrual?.amount || 0) - miscDeductions.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0))}</span>
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Payment Date
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '8px', left: '10px' }}><Calendar size={14} color="var(--primary)" /></div>
                    <input type="date" className="fi" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                      style={{ width: '100%', paddingLeft: '32px' }} disabled={selectedLrs.size === 0 || hasSelectedUnverified} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Payment Method
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['Cash', 'Online'].map(m => (
                      <button key={m} type="button" onClick={() => setPaymentMethod(m)}
                        style={{
                          flex: 1, padding: '8px 12px', borderRadius: '8px', fontWeight: 700, fontSize: '12px',
                          border: `2px solid ${paymentMethod === m ? (m === 'Cash' ? '#10b981' : '#0A6ED1') : 'var(--border)'}`,
                          background: paymentMethod === m ? (m === 'Cash' ? 'rgba(16,185,129,0.1)' : 'rgba(10,110,209,0.1)') : 'var(--bg-input)',
                          color: paymentMethod === m ? (m === 'Cash' ? '#10b981' : '#0A6ED1') : 'var(--text-muted)',
                          cursor: 'pointer', transition: 'all 0.15s'
                        }}>
                        {m === 'Cash' ? '💵' : '🏦'} {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Misc Deductions — add extra deductions */}
              <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-input)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                  Extra Deductions
                </label>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <input className="fi" type="number" placeholder="₹ Amount" id="misc-amt"
                    style={{ width: '70px', fontSize: '11px', padding: '6px 8px' }} />
                  <input className="fi" type="text" placeholder="Reason (tyre, fine, etc.)" id="misc-remark"
                    style={{ flex: 1, fontSize: '11px', padding: '6px 8px' }} />
                </div>
                <button className="btn btn-g" onClick={() => {
                  const amt = parseFloat(document.getElementById('misc-amt')?.value);
                  const remark = document.getElementById('misc-remark')?.value?.trim();
                  if (!amt || amt <= 0) return;
                  setMiscDeductions(p => [...p, { amount: amt, remark: remark || 'Miscellaneous', date: paymentDate }]);
                  document.getElementById('misc-amt').value = '';
                  document.getElementById('misc-remark').value = '';
                }} style={{ width: '100%', fontSize: '11px', padding: '6px' }}>
                  + Add Deduction
                </button>
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
