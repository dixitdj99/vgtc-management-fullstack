import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Clock, CheckCircle2, AlertCircle, AlertTriangle, X, Check,
  Printer, Share2, IndianRupee, ChevronLeft, ChevronRight, User, Truck,
  ShieldCheck, Wallet, ArrowRight, ArrowLeft, RefreshCw, Info, HelpCircle,
  FileText, CheckSquare, Square
} from 'lucide-react';
import ax from '../api';

const fmtRs = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function AttendanceSettlementModal({
  profile,
  onClose,
  onSuccess,
  brand = 'main',
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const currentMonthIso = todayIso.slice(0, 7);

  // Month state for settlement
  const [settleMonth, setSettleMonth] = useState(currentMonthIso);
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [attendanceRecords, setAttendanceRecords] = useState([]);

  // Base salary & wage settings
  const baseSalary = useMemo(() => {
    return parseFloat(profile?.fixedSalary) || parseFloat(profile?.salary) || 0;
  }, [profile]);

  // Month calendar bounds
  const monthInfo = useMemo(() => {
    const [y, m] = settleMonth.split('-').map(Number);
    const dateObj = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthLabel = dateObj.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const shortLabel = dateObj.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

    const allDates = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dStr = `${settleMonth}-${String(day).padStart(2, '0')}`;
      allDates.push(dStr);
    }

    return { y, m, daysInMonth, monthLabel, shortLabel, allDates };
  }, [settleMonth]);

  // Daily rate basis: 'calendar' (30/31 days) | 'working' (26 days) | 'custom'
  const [calcBasis, setCalcBasis] = useState('calendar');
  const [customDailyRate, setCustomDailyRate] = useState('');

  const effectiveDailyRate = useMemo(() => {
    if (calcBasis === 'custom' && customDailyRate !== '') {
      return parseFloat(customDailyRate) || 0;
    }
    const divisor = calcBasis === 'working' ? 26 : (monthInfo.daysInMonth || 30);
    return baseSalary > 0 ? Math.round(baseSalary / divisor) : 0;
  }, [baseSalary, calcBasis, customDailyRate, monthInfo.daysInMonth]);

  // Deduction config: Map of date -> { deduct: boolean, amount: number, status: string, note: string }
  const [deductionsMap, setDeductionsMap] = useState({});
  const [viewFilter, setViewFilter] = useState('absences'); // 'absences' | 'all'

  // Additional adjustments
  const [extraAllowance, setExtraAllowance] = useState('');
  const [otherDeduction, setOtherDeduction] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [payoutDate, setPayoutDate] = useState(todayIso);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [recordInCashbook, setRecordInCashbook] = useState(true);
  const [recordSalaryCredit, setRecordSalaryCredit] = useState(true);
  const [customRemark, setCustomRemark] = useState('');
  const [settling, setSettling] = useState(false);
  const [settleSuccess, setSettleSuccess] = useState(null);

  // Fetch attendance records whenever profile or settleMonth changes
  const fetchAttendance = async () => {
    if (!profile?.id) return;
    setLoadingAttendance(true);
    try {
      const res = await ax.get('attendance', {
        params: {
          profileId: profile.id,
          month: settleMonth,
        }
      });
      const recs = Array.isArray(res.data) ? res.data : [];
      setAttendanceRecords(recs);
    } catch (err) {
      console.error('Failed to load attendance for settlement:', err);
      setAttendanceRecords([]);
    } finally {
      setLoadingAttendance(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [profile?.id, settleMonth]);

  // Build day-by-day attendance status map
  const dailyAttendanceList = useMemo(() => {
    const recMap = new Map();
    attendanceRecords.forEach(r => {
      recMap.set(r.date, r);
    });

    return monthInfo.allDates.map(dateStr => {
      const rec = recMap.get(dateStr);
      const isPastOrToday = dateStr <= todayIso;
      const dayOfWeek = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
      const isSunday = dayOfWeek === 'Sun';

      let status = 'upcoming';
      let note = '';
      let source = '';

      if (rec) {
        status = rec.status || 'present';
        note = rec.note || '';
        source = rec.source || '';
      } else if (isPastOrToday) {
        status = isSunday ? 'leave' : 'absent';
        note = isSunday ? 'Weekly Off (Sunday)' : 'No attendance recorded';
      }

      return {
        date: dateStr,
        dayOfWeek,
        isSunday,
        status,
        note,
        source,
        isPastOrToday,
      };
    });
  }, [monthInfo.allDates, attendanceRecords, todayIso]);

  // Attendance summary counts
  const attendanceCounts = useMemo(() => {
    let present = 0;
    let halfDay = 0;
    let absent = 0;
    let leave = 0;
    let upcoming = 0;

    dailyAttendanceList.forEach(d => {
      if (d.status === 'present') present++;
      else if (d.status === 'half_day') halfDay++;
      else if (d.status === 'absent') absent++;
      else if (d.status === 'leave') leave++;
      else if (d.status === 'upcoming') upcoming++;
    });

    return { present, halfDay, absent, leave, upcoming };
  }, [dailyAttendanceList]);

  // Non-present days list (absences, leaves, half-days eligible for salary deduction)
  const nonPresentDays = useMemo(() => {
    return dailyAttendanceList.filter(d => ['absent', 'half_day', 'leave'].includes(d.status));
  }, [dailyAttendanceList]);

  // Initialize deductionsMap whenever nonPresentDays or effectiveDailyRate changes
  useEffect(() => {
    setDeductionsMap(prev => {
      const next = {};
      nonPresentDays.forEach(d => {
        const existing = prev[d.date];
        // By default, regular absences and half days are deducted; Sundays/leaves are excused unless clerk toggles
        const defaultDeduct = existing ? existing.deduct : (d.status === 'absent' || d.status === 'half_day');
        const defaultRate = d.status === 'half_day' ? Math.round(effectiveDailyRate * 0.5) : effectiveDailyRate;
        next[d.date] = {
          deduct: existing ? existing.deduct : defaultDeduct,
          amount: existing?.amount != null ? existing.amount : defaultRate,
          status: d.status,
          note: d.note,
        };
      });
      return next;
    });
  }, [nonPresentDays, effectiveDailyRate]);

  // Toggle deduction for all non-present days
  const handleToggleAllDeductions = (deductAll) => {
    setDeductionsMap(prev => {
      const next = {};
      nonPresentDays.forEach(d => {
        const defaultRate = d.status === 'half_day' ? Math.round(effectiveDailyRate * 0.5) : effectiveDailyRate;
        next[d.date] = {
          ...(prev[d.date] || {}),
          deduct: deductAll,
          amount: prev[d.date]?.amount != null ? prev[d.date].amount : defaultRate,
          status: d.status,
          note: d.note,
        };
      });
      return next;
    });
  };

  // Total leave/absence deductions
  const totalAttendanceDeductions = useMemo(() => {
    let sum = 0;
    Object.values(deductionsMap).forEach(v => {
      if (v.deduct) sum += (parseFloat(v.amount) || 0);
    });
    return sum;
  }, [deductionsMap]);

  const deductedDaysCount = useMemo(() => {
    return Object.values(deductionsMap).filter(v => v.deduct).length;
  }, [deductionsMap]);

  // Net Earned Salary for the month
  const netEarnedSalary = useMemo(() => {
    return Math.max(0, baseSalary - totalAttendanceDeductions);
  }, [baseSalary, totalAttendanceDeductions]);

  // Adjusted Month Salary (including extra allowance/bonus & other deductions)
  const adjustedMonthSalary = useMemo(() => {
    const allowance = parseFloat(extraAllowance) || 0;
    const fine = parseFloat(otherDeduction) || 0;
    return Math.max(0, netEarnedSalary + allowance - fine);
  }, [netEarnedSalary, extraAllowance, otherDeduction]);

  // Current Khata Net Balance Due (including past advances)
  const currentKhataDue = useMemo(() => {
    return profile?.khata?.summary?.netBalance || 0;
  }, [profile]);

  // Total net payable when adding current month's adjusted salary
  const totalNetPayableWithMonth = useMemo(() => {
    return currentKhataDue + (recordSalaryCredit ? adjustedMonthSalary : 0);
  }, [currentKhataDue, recordSalaryCredit, adjustedMonthSalary]);

  // Auto-fill settlement amount on first load
  useEffect(() => {
    if (totalNetPayableWithMonth > 0 && !settleAmount) {
      setSettleAmount(String(totalNetPayableWithMonth));
    } else if (adjustedMonthSalary > 0 && !settleAmount) {
      setSettleAmount(String(adjustedMonthSalary));
    }
  }, [totalNetPayableWithMonth, adjustedMonthSalary]);

  // Change month stepper
  const changeSettleMonth = (delta) => {
    const [y, m] = settleMonth.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    const nextMonthIso = d.toISOString().slice(0, 7);
    setSettleMonth(nextMonthIso);
  };

  // Handle Save Settlement
  const handleConfirmSettlement = async (e) => {
    e.preventDefault();
    const amt = parseFloat(settleAmount);
    if (isNaN(amt) || amt < 0) {
      alert('Please enter a valid payout amount (0 or more)');
      return;
    }

    setSettling(true);
    try {
      // 1. If recordSalaryCredit is true, record the adjusted earned salary credit
      if (recordSalaryCredit && adjustedMonthSalary > 0) {
        await ax.post('/payments', {
          profileId: profile.id,
          profileName: profile.name,
          amount: adjustedMonthSalary,
          date: payoutDate,
          category: 'Salary Credit',
          entryType: 'credit',
          paymentMethod: 'Salary Accrual',
          monthKey: settleMonth,
          remark: `Salary for ${monthInfo.shortLabel} (Base: ₹${baseSalary}, Attendance Deduction: -₹${totalAttendanceDeductions} for ${deductedDaysCount} days, Net: ₹${adjustedMonthSalary})`,
        });
      }

      // 2. Record the Settlement Payout (Debit)
      const defaultRemark = customRemark.trim() || `Salary Settlement for ${monthInfo.shortLabel} (${profile.name})`;
      let cashbookId = null;

      if (amt > 0) {
        if (paymentMethod === 'Cash' && recordInCashbook) {
          const cbPath = brand === 'jklakshmi' ? '/jkl/cashbook/cash-out-linked' : '/cashbook/cash-out-linked';
          const cbRes = await ax.post(cbPath, {
            amount: amt,
            date: payoutDate,
            remark: defaultRemark,
            entityType: profile.type === 'Driver' ? 'driver' : 'staff',
            entityId: profile.id,
            entityName: profile.name,
          });
          cashbookId = cbRes?.data?.id || null;
        } else {
          await ax.post('/payments', {
            profileId: profile.id,
            profileName: profile.name,
            amount: amt,
            date: payoutDate,
            category: 'Salary Settlement',
            entryType: 'debit',
            paymentMethod,
            remark: defaultRemark,
          });
        }
      }

      // Success payload for Slip
      const slipData = {
        profileName: profile.name,
        profileType: profile.type,
        vehicleNo: profile.vehicleNo,
        phone: profile.phone,
        month: monthInfo.monthLabel,
        monthKey: settleMonth,
        baseSalary,
        daysInMonth: monthInfo.daysInMonth,
        presentDays: attendanceCounts.present,
        halfDays: attendanceCounts.halfDay,
        absentDays: attendanceCounts.absent,
        leaveDays: attendanceCounts.leave,
        deductedDays: deductedDaysCount,
        dailyRate: effectiveDailyRate,
        attendanceDeductions: totalAttendanceDeductions,
        netEarned: netEarnedSalary,
        extraAllowance: parseFloat(extraAllowance) || 0,
        otherDeduction: parseFloat(otherDeduction) || 0,
        adjustedSalary: adjustedMonthSalary,
        payoutAmount: amt,
        payoutDate,
        paymentMethod,
        cashbookId,
        remark: defaultRemark,
      };

      // 3. Automatically dispatch WhatsApp Meta API notification to employee phone
      let waStatus = null;
      if (profile.phone) {
        try {
          await ax.post('/whatsapp/send-salary-settlement', {
            phone: profile.phone,
            settlementData: slipData
          });
          waStatus = { sent: true, phone: profile.phone };
        } catch (waErr) {
          console.warn('Auto WhatsApp notification notice:', waErr.message);
          waStatus = { sent: false, phone: profile.phone, error: waErr.response?.data?.error || waErr.message };
        }
      }

      setSettleSuccess({ ...slipData, waStatus });
      if (onSuccess) onSuccess(slipData);
    } catch (err) {
      console.error('Settlement confirmation failed:', err);
      alert(err.response?.data?.error || err.message || 'Settlement failed. Please check entries.');
    } finally {
      setSettling(false);
    }
  };

  // Print Salary Slip
  const handlePrintSlip = () => {
    if (!settleSuccess) return;
    const s = settleSuccess;
    const printWindow = window.open('', '_blank', 'width=850,height=650');
    if (!printWindow) {
      alert('Please allow pop-ups to print Salary Slip');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Salary Settlement Slip - ${s.profileName} - ${s.month}</title>
        <style>
          @page { size: A5 landscape; margin: 10mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 15px; color: #111; font-size: 13px; line-height: 1.4; }
          .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
          .header h2 { margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 0.5px; }
          .header p { margin: 2px 0 0; font-size: 12px; color: #444; font-weight: 600; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 12px; background: #f9fafb; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; }
          .meta-item { font-size: 12px; }
          .meta-item strong { color: #111; }
          .att-box { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; display: flex; justify-content: space-between; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          th, td { padding: 6px 10px; border: 1px solid #d1d5db; font-size: 12px; }
          th { background: #f3f4f6; text-align: left; }
          .text-right { text-align: right; }
          .total-row { font-weight: bold; background: #f9fafb; }
          .sig-row { display: flex; justify-content: space-between; margin-top: 30px; padding-top: 10px; }
          .sig-box { width: 140px; text-align: center; border-top: 1px dashed #444; font-size: 11px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>VIKAS GOODS TRANSPORT CO.</h2>
          <p>Staff & Driver Salary Settlement Voucher (${s.month})</p>
        </div>

        <div class="meta-grid">
          <div class="meta-item">Employee: <strong>${s.profileName}</strong> (${s.profileType})</div>
          <div class="meta-item">Voucher Date: <strong>${fmtDate(s.payoutDate)}</strong></div>
          <div class="meta-item">Vehicle: <strong>${s.vehicleNo || '—'}</strong></div>
          <div class="meta-item">Payment Mode: <strong>${s.paymentMethod}</strong></div>
        </div>

        <div class="att-box">
          <div><strong>Total Month Days:</strong> ${s.daysInMonth}</div>
          <div><strong>Present:</strong> ${s.presentDays}</div>
          <div><strong>Half Day:</strong> ${s.halfDays}</div>
          <div><strong>Absent / Leave:</strong> ${s.absentDays + s.leaveDays}</div>
          <div><strong>Deducted Days:</strong> ${s.deductedDays}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Particulars</th>
              <th class="text-right">Rate / Basis</th>
              <th class="text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Basic Fixed Salary</td>
              <td class="text-right">Monthly</td>
              <td class="text-right">${fmtRs(s.baseSalary)}</td>
            </tr>
            <tr>
              <td>Attendance / Leave Deduction (${s.deductedDays} days @ ${fmtRs(s.dailyRate)}/day)</td>
              <td class="text-right">${s.deductedDays} Days</td>
              <td class="text-right">- ${fmtRs(s.attendanceDeductions)}</td>
            </tr>
            ${s.extraAllowance > 0 ? `
              <tr>
                <td>Extra Allowance / Overtime / Incentive</td>
                <td class="text-right">Bonus</td>
                <td class="text-right">+ ${fmtRs(s.extraAllowance)}</td>
              </tr>
            ` : ''}
            ${s.otherDeduction > 0 ? `
              <tr>
                <td>Store / Material / Penalty Deduction</td>
                <td class="text-right">Adjustment</td>
                <td class="text-right">- ${fmtRs(s.otherDeduction)}</td>
              </tr>
            ` : ''}
            <tr class="total-row">
              <td><strong>Net Earned Salary</strong></td>
              <td class="text-right"><strong>Net Payable</strong></td>
              <td class="text-right"><strong>${fmtRs(s.adjustedSalary)}</strong></td>
            </tr>
            <tr style="background:#f3f4f6;font-weight:bold;font-size:13px;">
              <td><strong>Settlement Amount Paid</strong></td>
              <td class="text-right">Cleared (${s.paymentMethod})</td>
              <td class="text-right"><strong>${fmtRs(s.payoutAmount)}</strong></td>
            </tr>
          </tbody>
        </table>

        <div style="font-size: 11px; color: #555; margin-bottom: 8px;">
          <strong>Remarks:</strong> ${s.remark || 'Salary cleared as per biometric attendance records.'}
        </div>

        <div class="sig-row">
          <div class="sig-box">Employee Signature</div>
          <div class="sig-box">Cashier / Clerk</div>
          <div class="sig-box">Authorised Signatory</div>
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };



  // Display days list based on viewFilter
  const displayDays = viewFilter === 'all' ? dailyAttendanceList : nonPresentDays;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      minHeight: 'calc(100vh - 120px)',
      background: 'var(--bg)',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      overflow: 'hidden',
      marginBottom: '24px'
    }}>
      {/* ── TOP NAV / CONTEXT BAR (Spacious Full-Width) ── */}
      <div style={{
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: 16,
      }}>
        {/* Left: Back button & Employee Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            type="button"
            className="btn btn-g"
            onClick={onClose}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '13px', fontWeight: 700, padding: '7px 14px' }}
          >
            <ArrowLeft size={16} /> Back to Khata Book
          </button>

          <div style={{ height: 28, width: 1, background: 'var(--border)' }} />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>
                {profile.name}
              </h2>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'var(--bg-th)',
                border: '1px solid var(--border)',
                color: 'var(--text-sub)'
              }}>
                {profile.type || 'Staff'}
              </span>
              {profile.vehicleNo && (
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 4, background: 'var(--bg-th)' }}>
                  Truck: {profile.vehicleNo}
                </span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 2 }}>
              Fixed Monthly Salary: <strong style={{ color: 'var(--text)' }}>{fmtRs(baseSalary)}</strong>
              {profile.phone && <span style={{ marginLeft: 10 }}>Phone: {profile.phone}</span>}
            </div>
          </div>
        </div>

        {/* Center: Month Stepper */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'var(--bg)',
          padding: '4px 8px',
          borderRadius: 8,
          border: '1px solid var(--border)'
        }}>
          <button
            type="button"
            onClick={() => changeSettleMonth(-1)}
            title="Previous Month"
            style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}
          >
            <ChevronLeft size={16} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', fontSize: '13.5px', fontWeight: 800, color: 'var(--text)' }}>
            <Calendar size={14} color="var(--primary)" />
            {monthInfo.monthLabel}
          </div>

          <button
            type="button"
            onClick={() => changeSettleMonth(1)}
            title="Next Month"
            style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}
          >
            <ChevronRight size={16} />
          </button>

          {settleMonth !== currentMonthIso && (
            <button
              type="button"
              onClick={() => setSettleMonth(currentMonthIso)}
              style={{
                border: 'none',
                background: 'var(--primary)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                marginLeft: 4
              }}
            >
              Current Month
            </button>
          )}
        </div>

        {/* Right: Actions / Close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={fetchAttendance}
            className="btn btn-g"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '12px', padding: '6px 12px' }}
            title="Refresh Attendance"
          >
            <RefreshCw size={13} className={loadingAttendance ? 'spin' : ''} /> Reload Records
          </button>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-g"
            style={{ padding: '6px 10px', fontSize: '13px' }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── SETTLEMENT SUCCESS VIEW ── */}
      {settleSuccess ? (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '40px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '36px 40px',
            maxWidth: 620,
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
          }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'var(--bg-th)',
              border: '2px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: 'var(--text)'
            }}>
              <Check size={28} />
            </div>

            <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--text)' }}>
              Salary Settlement Completed
            </h3>
            <p style={{ margin: '8px 0 20px', fontSize: 13, color: 'var(--text-muted)' }}>
              Successfully recorded settlement for <strong>{settleSuccess.profileName}</strong> ({settleSuccess.month}).
            </p>

            <div style={{
              background: 'var(--bg-th)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '16px',
              textAlign: 'left',
              fontSize: 13,
              marginBottom: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Fixed Base Salary:</span>
                <strong>{fmtRs(settleSuccess.baseSalary)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Attendance Deductions ({settleSuccess.deductedDays} days):</span>
                <span>- {fmtRs(settleSuccess.attendanceDeductions)}</span>
              </div>
              {settleSuccess.extraAllowance > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Allowance / Incentive:</span>
                  <span>+ {fmtRs(settleSuccess.extraAllowance)}</span>
                </div>
              )}
              {settleSuccess.otherDeduction > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Fines / Penalties:</span>
                  <span>- {fmtRs(settleSuccess.otherDeduction)}</span>
                </div>
              )}
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 800 }}>
                <span>Adjusted Earned Salary:</span>
                <span>{fmtRs(settleSuccess.adjustedSalary)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 800 }}>
                <span>Amount Paid Now ({settleSuccess.paymentMethod}):</span>
                <span>{fmtRs(settleSuccess.payoutAmount)}</span>
              </div>
            </div>

            {settleSuccess.waStatus?.sent ? (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '12.5px',
                color: 'var(--text)',
                background: 'var(--bg-th)',
                border: '1px solid var(--border)',
                padding: '8px 16px',
                borderRadius: 6,
                marginBottom: 20
              }}>
                <CheckCircle2 size={16} color="var(--primary)" />
                <span>
                  Salary settlement voucher automatically sent to <strong>{settleSuccess.waStatus.phone}</strong> via Meta WhatsApp API.
                </span>
              </div>
            ) : settleSuccess.phone ? (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '12px',
                color: 'var(--text-muted)',
                background: 'var(--bg-th)',
                border: '1px solid var(--border)',
                padding: '6px 14px',
                borderRadius: 6,
                marginBottom: 20
              }}>
                <Info size={14} />
                <span>
                  WhatsApp dispatch notice: {settleSuccess.waStatus?.error || 'Message dispatched to ' + settleSuccess.phone}
                </span>
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-p"
                onClick={handlePrintSlip}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', fontSize: '13px', fontWeight: 700 }}
              >
                <Printer size={15} /> Print Salary Slip
              </button>

              <button
                type="button"
                className="btn btn-g"
                onClick={onClose}
                style={{ padding: '10px 20px', fontSize: '13px', fontWeight: 700 }}
              >
                Done / Back to Khata Book
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── 2-COLUMN FULL-WINDOW WORKSPACE ── */
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(380px, 1fr)',
          overflow: 'hidden',
          background: 'var(--bg)',
        }}>
          {/* ══════════════════════════════════════════════════════ */}
          {/* LEFT COLUMN: Attendance Verification & Leave Checklist */}
          {/* ══════════════════════════════════════════════════════ */}
          <div style={{
            overflowY: 'auto',
            padding: '24px 28px',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}>
            {/* 1. Summary Metrics Cards (Clean & Neutral) */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                1. Month Attendance Overview ({monthInfo.shortLabel})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Month Days</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>
                    {monthInfo.daysInMonth} <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Days</span>
                  </div>
                </div>

                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Present Days</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>
                    {attendanceCounts.present} <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Days</span>
                  </div>
                  {attendanceCounts.halfDay > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>
                      +{attendanceCounts.halfDay} half-day
                    </div>
                  )}
                </div>

                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Absent / Leaves</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>
                    {attendanceCounts.absent + attendanceCounts.leave} <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Days</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>
                    {attendanceCounts.absent} absent · {attendanceCounts.leave} leave
                  </div>
                </div>

                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Days Deducted</div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>
                    {deductedDaysCount} <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Days</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>
                    Total: {fmtRs(totalAttendanceDeductions)}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Daily Wage Rate Configuration */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    2. Daily Wage Calculation Basis
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 2 }}>
                    Determines the per-day deduction rate applied to unexcused absences.
                  </div>
                </div>

                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', background: 'var(--bg-th)', padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)' }}>
                  Rate: <strong>{fmtRs(effectiveDailyRate)}</strong> / day
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {/* Option 1: Calendar Days */}
                <label style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: calcBasis === 'calendar' ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: 'var(--bg)',
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="calcBasis"
                    checked={calcBasis === 'calendar'}
                    onChange={() => setCalcBasis('calendar')}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' }}>Calendar Days</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>
                      ₹{baseSalary} ÷ {monthInfo.daysInMonth} = {fmtRs(baseSalary > 0 ? baseSalary / monthInfo.daysInMonth : 0)}/day
                    </div>
                  </div>
                </label>

                {/* Option 2: 26 Working Days */}
                <label style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: calcBasis === 'working' ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: 'var(--bg)',
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="calcBasis"
                    checked={calcBasis === 'working'}
                    onChange={() => setCalcBasis('working')}
                    style={{ marginTop: 2 }}
                  />
                  <div>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' }}>26 Working Days</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>
                      ₹{baseSalary} ÷ 26 = {fmtRs(baseSalary > 0 ? baseSalary / 26 : 0)}/day
                    </div>
                  </div>
                </label>

                {/* Option 3: Custom Rate */}
                <label style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: calcBasis === 'custom' ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: 'var(--bg)',
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="calcBasis"
                    checked={calcBasis === 'custom'}
                    onChange={() => setCalcBasis('custom')}
                    style={{ marginTop: 2 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text)' }}>Custom Rate</div>
                    <input
                      type="number"
                      placeholder="₹ Rate / day"
                      value={customDailyRate}
                      onFocus={() => setCalcBasis('custom')}
                      onChange={e => setCustomDailyRate(e.target.value)}
                      className="fi"
                      style={{ height: 26, fontSize: 11, marginTop: 4, width: '100%', padding: '2px 6px' }}
                    />
                  </div>
                </label>
              </div>
            </div>

            {/* 3. Day-by-Day Absence & Leave Inspection Table */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-th)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10
              }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    3. Day-by-Day Attendance Checklist
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: 2 }}>
                    Tick the checkbox to deduct salary for that day, or leave unticked to waive (excuse/pay).
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* View filter */}
                  <div style={{ display: 'inline-flex', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)', padding: 2 }}>
                    <button
                      type="button"
                      onClick={() => setViewFilter('absences')}
                      style={{
                        border: 'none',
                        background: viewFilter === 'absences' ? 'var(--bg-card)' : 'transparent',
                        color: viewFilter === 'absences' ? 'var(--text)' : 'var(--text-muted)',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        padding: '4px 8px',
                        borderRadius: 4,
                        cursor: 'pointer'
                      }}
                    >
                      Absences Only ({nonPresentDays.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewFilter('all')}
                      style={{
                        border: 'none',
                        background: viewFilter === 'all' ? 'var(--bg-card)' : 'transparent',
                        color: viewFilter === 'all' ? 'var(--text)' : 'var(--text-muted)',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        padding: '4px 8px',
                        borderRadius: 4,
                        cursor: 'pointer'
                      }}
                    >
                      All Days ({monthInfo.daysInMonth})
                    </button>
                  </div>

                  {/* Batch toggles */}
                  {nonPresentDays.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleToggleAllDeductions(true)}
                        className="btn btn-g"
                        style={{ fontSize: '11px', padding: '4px 8px', fontWeight: 700 }}
                        title="Deduct all non-present days"
                      >
                        Deduct All
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleAllDeductions(false)}
                        className="btn btn-g"
                        style={{ fontSize: '11px', padding: '4px 8px', fontWeight: 700 }}
                        title="Waive all (Pay full salary)"
                      >
                        Waive All
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Table Body */}
              <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', width: '130px' }}>Date</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', width: '100px' }}>Status</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Details / Note</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', width: '130px' }}>Deduct Salary?</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', width: '110px' }}>Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayDays.map(day => {
                      const isEligible = ['absent', 'half_day', 'leave'].includes(day.status);
                      const currentDeduct = deductionsMap[day.date]?.deduct || false;
                      const currentAmt = deductionsMap[day.date]?.amount != null
                        ? deductionsMap[day.date].amount
                        : (day.status === 'half_day' ? Math.round(effectiveDailyRate * 0.5) : effectiveDailyRate);

                      return (
                        <tr
                          key={day.date}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            background: currentDeduct ? 'var(--bg-th)' : 'transparent',
                          }}
                        >
                          {/* Date & Weekday */}
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text)' }}>
                              {new Date(day.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6 }}>
                                ({day.dayOfWeek})
                              </span>
                            </div>
                          </td>

                          {/* Attendance Status */}
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            {day.status === 'present' ? (
                              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: 4 }}>
                                Present
                              </span>
                            ) : day.status === 'half_day' ? (
                              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: 4 }}>
                                Half Day
                              </span>
                            ) : day.status === 'leave' ? (
                              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: 4 }}>
                                Leave
                              </span>
                            ) : day.status === 'absent' ? (
                              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: 4 }}>
                                Absent
                              </span>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Upcoming</span>
                            )}
                          </td>

                          {/* Details / Notes */}
                          <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-sub)' }}>
                            {day.note ? (
                              <span>{day.note}</span>
                            ) : day.status === 'present' ? (
                              <span style={{ color: 'var(--text-muted)' }}>Regular working day</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>No punch record</span>
                            )}
                            {day.source && (
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 6 }}>
                                ({day.source})
                              </span>
                            )}
                          </td>

                          {/* Deduct Salary Toggle */}
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {isEligible ? (
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '11.5px', fontWeight: 700 }}>
                                <input
                                  type="checkbox"
                                  checked={currentDeduct}
                                  onChange={e => {
                                    const checked = e.target.checked;
                                    setDeductionsMap(prev => ({
                                      ...prev,
                                      [day.date]: {
                                        ...(prev[day.date] || {}),
                                        deduct: checked,
                                        amount: currentAmt,
                                        status: day.status,
                                        note: day.note,
                                      }
                                    }));
                                  }}
                                />
                                <span style={{ color: currentDeduct ? 'var(--text)' : 'var(--text-muted)' }}>
                                  {currentDeduct ? 'Deduct' : 'Waived'}
                                </span>
                              </label>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>

                          {/* Deduction Amount Input */}
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            {isEligible && currentDeduct ? (
                              <input
                                type="number"
                                min="0"
                                value={currentAmt}
                                onChange={e => {
                                  const val = e.target.value;
                                  setDeductionsMap(prev => ({
                                    ...prev,
                                    [day.date]: {
                                      ...(prev[day.date] || {}),
                                      deduct: true,
                                      amount: val,
                                      status: day.status,
                                      note: day.note,
                                    }
                                  }));
                                }}
                                className="fi"
                                style={{
                                  width: '80px',
                                  height: '26px',
                                  fontSize: '12px',
                                  textAlign: 'right',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                }}
                              />
                            ) : (
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {isEligible ? '₹0' : '—'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {displayDays.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No absences or leaves found for {monthInfo.monthLabel}. Attendance is 100% full!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════ */}
          {/* RIGHT COLUMN: Calculation Breakdown & Payout Form     */}
          {/* ══════════════════════════════════════════════════════ */}
          <div style={{
            overflowY: 'auto',
            padding: '24px 28px',
            background: 'var(--bg-card)',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}>
            <form onSubmit={handleConfirmSettlement} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Section 4: Month Salary Statement */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  4. Salary Calculation Breakdown
                </div>

                <div style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  fontSize: '13px'
                }}>
                  {/* Fixed Gross */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-sub)' }}>Fixed Base Salary:</span>
                    <strong style={{ fontSize: '14px', color: 'var(--text)' }}>{fmtRs(baseSalary)}</strong>
                  </div>

                  {/* Attendance Deductions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-sub)' }}>
                      Attendance Deductions ({deductedDaysCount} days):
                    </span>
                    <span style={{ fontWeight: 700, color: totalAttendanceDeductions > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                      - {fmtRs(totalAttendanceDeductions)}
                    </span>
                  </div>

                  <div style={{ height: 1, background: 'var(--border)' }} />

                  {/* Net Base Earned */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>Earned Base Salary:</span>
                    <strong style={{ fontSize: '14px', color: 'var(--text)' }}>{fmtRs(netEarnedSalary)}</strong>
                  </div>

                  {/* Optional Adjustments */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
                    <div>
                      <label style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
                        + Extra Allowance / Bonus
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="₹0"
                        value={extraAllowance}
                        onChange={e => setExtraAllowance(e.target.value)}
                        className="fi"
                        style={{ height: '30px', fontSize: '12px' }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
                        - Fine / Penalty / Store
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="₹0"
                        value={otherDeduction}
                        onChange={e => setOtherDeduction(e.target.value)}
                        className="fi"
                        style={{ height: '30px', fontSize: '12px' }}
                      />
                    </div>
                  </div>

                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

                  {/* Adjusted Month Salary */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text)' }}>
                        Net Adjusted Month Salary:
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Earned salary for {monthInfo.monthLabel}
                      </div>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text)' }}>
                      {fmtRs(adjustedMonthSalary)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 5: Khata Balance Reconciliation */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  5. Khata Book Balance Reconciliation
                </div>

                <div style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  fontSize: '12.5px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-sub)' }}>Previous Khata Net Balance Due:</span>
                    <strong>{fmtRs(currentKhataDue)}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-sub)' }}>+ Current Month Earned Salary:</span>
                    <strong>{fmtRs(adjustedMonthSalary)}</strong>
                  </div>

                  <div style={{ height: 1, background: 'var(--border)' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800 }}>
                    <span style={{ fontSize: '13px', color: 'var(--text)' }}>Total Net Balance to Settle:</span>
                    <span style={{ fontSize: '16px', color: 'var(--text)' }}>
                      {fmtRs(totalNetPayableWithMonth)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 6: Payment Payout Form */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  6. Payout & Payment Execution
                </div>

                <div style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14
                }}>
                  {/* Amount & Date */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          Payout Amount (₹) *
                        </label>
                        <button
                          type="button"
                          onClick={() => setSettleAmount(String(totalNetPayableWithMonth))}
                          style={{ border: 'none', background: 'transparent', color: 'var(--primary)', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                        >
                          Pay Full Balance
                        </button>
                      </div>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        required
                        className="fi"
                        style={{ height: '36px', fontSize: '14px', fontWeight: 800 }}
                        value={settleAmount}
                        onChange={e => setSettleAmount(e.target.value)}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                        Payout Date *
                      </label>
                      <input
                        type="date"
                        required
                        className="fi"
                        style={{ height: '36px', fontSize: '12px' }}
                        value={payoutDate}
                        onChange={e => setPayoutDate(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Payment Mode */}
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                      Payment Method
                    </label>
                    <select
                      className="fi"
                      style={{ height: '36px', fontSize: '12px' }}
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value)}
                    >
                      <option value="Cash">Physical Cash</option>
                      <option value="Bank Transfer">Bank Transfer (NEFT / IMPS)</option>
                      <option value="UPI">UPI / GPay / PhonePe</option>
                      <option value="Cheque">Cheque</option>
                    </select>
                  </div>

                  {/* Cashbook Integration Toggle */}
                  {paymentMethod === 'Cash' && (
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: 'var(--bg-card)',
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: '1px solid var(--border)'
                    }}>
                      <input
                        type="checkbox"
                        checked={recordInCashbook}
                        onChange={e => setRecordInCashbook(e.target.checked)}
                      />
                      <span>Record as Cash Out in Cashbook (Deduct drawer cash)</span>
                    </label>
                  )}

                  {/* Khata Credit Toggle */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: 'var(--bg-card)',
                    padding: '10px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border)'
                  }}>
                    <input
                      type="checkbox"
                      checked={recordSalaryCredit}
                      onChange={e => setRecordSalaryCredit(e.target.checked)}
                    />
                    <span>Post Adjusted Salary Credit into Khata Book</span>
                  </label>

                  {/* Custom Remark */}
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>
                      Settlement Remark (Optional)
                    </label>
                    <input
                      type="text"
                      className="fi"
                      style={{ height: '34px', fontSize: '12px' }}
                      placeholder={`e.g. Salary settlement for ${monthInfo.shortLabel}`}
                      value={customRemark}
                      onChange={e => setCustomRemark(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  className="btn btn-g"
                  onClick={onClose}
                  disabled={settling}
                  style={{ flex: 1, padding: '12px', fontSize: '13px', fontWeight: 700 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-p"
                  disabled={settling}
                  style={{ flex: 2, padding: '12px', fontSize: '13.5px', fontWeight: 800 }}
                >
                  {settling ? 'Recording Settlement...' : 'Confirm Salary Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
