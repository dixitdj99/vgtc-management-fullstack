import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Search, User, Truck, Phone, Calendar, ArrowUpRight, ArrowDownLeft,
  Plus, CheckCircle2, AlertCircle, X, Trash2, Printer, Share2, Wallet,
  Building, Check, Layers, ChevronRight, IndianRupee, Clock, AlertTriangle, FileText,
  Package, ShieldAlert, ArrowRight, ExternalLink
} from 'lucide-react';
import ax from '../api';
import TableScroll from '../components/TableScroll';
import AttendanceSettlementModal from '../components/AttendanceSettlementModal';

const fmtRs = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const TH_STYLE = {
  padding: '10px 14px',
  fontSize: '11px',
  fontWeight: 800,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  background: 'var(--bg-th)',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
  textAlign: 'left',
};

const TD_STYLE = {
  padding: '10px 14px',
  fontSize: '12.5px',
  color: 'var(--text-sub)',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
};

/**
 * Calculates monthly salary credits for a profile from dateJoined up to current month.
 */
export function generateSalaryCredits(profile) {
  const credits = [];
  const fixedSalary = parseFloat(profile.fixedSalary) || 0;
  if (fixedSalary <= 0) return credits;

  const start = profile.dateJoined ? new Date(profile.dateJoined) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = profile.dateExit ? new Date(profile.dateExit) : new Date();

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return credits;

  let current = new Date(start.getFullYear(), start.getMonth(), 1);
  const nowEnd = new Date(end.getFullYear(), end.getMonth() + 1, 0);

  while (current <= nowEnd) {
    const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    const activeStart = monthStart < start ? start : monthStart;
    const activeEnd = monthEnd > end ? end : monthEnd;

    const daysInMonth = monthEnd.getDate();
    const activeDays = Math.ceil(Math.abs(activeEnd - activeStart) / (1000 * 60 * 60 * 24)) + 1;

    let leaveDays = 0;
    (profile.leaves || []).forEach(l => {
      if (l.start && l.end) {
        const lStart = new Date(l.start);
        const lEnd = new Date(l.end);
        if (lStart <= activeEnd && lEnd >= activeStart) {
          const overlapStart = lStart < activeStart ? activeStart : lStart;
          const overlapEnd = lEnd > activeEnd ? activeEnd : lEnd;
          leaveDays += Math.ceil(Math.abs(overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
        }
      }
    });

    const billableDays = Math.max(0, activeDays - leaveDays);
    const earnedAmount = daysInMonth > 0 ? Math.round((fixedSalary / daysInMonth) * billableDays) : fixedSalary;
    const monthKey = current.toISOString().slice(0, 7);
    const monthLabel = current.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

    credits.push({
      id: `auto_sal_${profile.id}_${monthKey}`,
      isAutoSalary: true,
      monthKey,
      date: activeEnd.toISOString().slice(0, 10),
      desc: `Salary Accrual - ${monthLabel} (${billableDays} working days)`,
      category: 'Salary Accrual',
      entryType: 'credit',
      credit: earnedAmount,
      debit: 0,
      paymentMethod: 'Salary Earned',
      isNonCash: true,
    });

    current.setMonth(current.getMonth() + 1);
  }

  return credits;
}

/**
 * Builds the complete unified ledger entries (credits & debits) for a profile.
 */
export function buildProfileLedger(profile, firmPayments = [], cashbookEntries = []) {
  if (!profile) return { entries: [], summary: { totalCredit: 0, totalDebit: 0, totalCashAdv: 0, totalNonCash: 0, netBalance: 0 } };

  const pId = profile.id;
  const pName = (profile.name || '').toLowerCase().trim();

  // 1. Fetch profile payments (advances, manual credits, non-cash deductions, settlements)
  const matchedPayments = firmPayments.filter(p => p.profileId === pId || (p.profileName && p.profileName.toLowerCase().trim() === pName));
  const linkedCbIds = new Set(matchedPayments.map(p => p.cashbookEntryId).filter(Boolean));

  // 2. Fetch direct cashbook cash_outs that were not already linked to payments
  const matchedCb = cashbookEntries.filter(e => {
    if (e.type !== 'cash_out') return false;
    const idMatch = e.entityId && e.entityId === pId;
    const nameMatch = e.entityName && e.entityName.toLowerCase().trim() === pName;
    return idMatch || nameMatch;
  }).filter(e => !linkedCbIds.has(e.id));

  // 3. Auto-generated salary credits
  const autoCredits = generateSalaryCredits(profile);

  // Check which months already have a manual Salary Credit entry so we don't double count
  const manualSalaryMonthKeys = new Set(
    matchedPayments
      .filter(p => (p.category === 'Salary' || p.category === 'Salary Accrual' || p.category === 'Salary Credit') && p.entryType === 'credit')
      .map(p => (p.date || '').slice(0, 7))
  );

  const finalAutoCredits = autoCredits.filter(ac => !manualSalaryMonthKeys.has(ac.monthKey));

  // 4. Map payment records
  const paymentEntries = matchedPayments.map(p => {
    const isCredit = p.entryType === 'credit';
    const amt = parseFloat(p.amount) || 0;
    const isNonCash = p.isNonCash || p.paymentMethod === 'Non-Cash Adjustment' || p.category === 'Material / Store Deduction' || p.category === 'Material Adjustment' || p.category === 'Penalty';
    const isCashAdv = !isCredit && (p.category === 'Advance' || p.cashbookEntryId || p.paymentMethod === 'Cash');

    return {
      id: p.id,
      date: p.date || (p.createdAt ? p.createdAt.slice(0, 10) : ''),
      desc: p.remark || p.category || (isCredit ? 'Credit Entry' : 'Debit Entry'),
      category: p.category || (isCredit ? 'Credit' : 'Debit'),
      entryType: isCredit ? 'credit' : 'debit',
      credit: isCredit ? amt : 0,
      debit: isCredit ? 0 : amt,
      paymentMethod: p.paymentMethod || (isNonCash ? 'Non-Cash' : 'Cash'),
      isNonCash: !!isNonCash,
      isCashAdv: !!isCashAdv,
      cashbookEntryId: p.cashbookEntryId,
      source: p.cashbookEntryId ? 'Cashbook' : 'Pay Module',
      canDelete: true,
      raw: p,
    };
  });

  // 5. Map unlinked cashbook entries
  const cbEntries = matchedCb.map(e => {
    const amt = parseFloat(e.amount) || 0;
    return {
      id: `cb_${e.id}`,
      date: e.date || (e.createdAt ? e.createdAt.slice(0, 10) : ''),
      desc: e.remark || 'Cash Advance (from Cashbook)',
      category: 'Cash Advance',
      entryType: 'debit',
      credit: 0,
      debit: amt,
      paymentMethod: 'Cash',
      isNonCash: false,
      isCashAdv: true,
      cashbookEntryId: e.id,
      source: 'Cashbook',
      canDelete: false,
    };
  });

  // Combine and sort chronologically
  const allEntries = [...finalAutoCredits, ...paymentEntries, ...cbEntries].sort((a, b) => {
    const dComp = (a.date || '').localeCompare(b.date || '');
    if (dComp !== 0) return dComp;
    // Credits first if on same date
    return (b.credit || 0) - (a.credit || 0);
  });

  // Compute running balances
  let running = 0;
  let totalCredit = 0;
  let totalDebit = 0;
  let totalCashAdv = 0;
  let totalNonCash = 0;

  const entriesWithBalance = allEntries.map(entry => {
    running += (entry.credit - entry.debit);
    totalCredit += entry.credit;
    totalDebit += entry.debit;
    if (entry.isCashAdv) totalCashAdv += entry.debit;
    if (entry.isNonCash && entry.debit > 0) totalNonCash += entry.debit;

    return {
      ...entry,
      runningBalance: running,
    };
  });

  return {
    entries: entriesWithBalance,
    summary: {
      totalCredit,
      totalDebit,
      totalCashAdv,
      totalNonCash,
      netBalance: running, // Positive = Company owes person, Negative = Person owes company
    }
  };
}

export default function StaffKhataBook({
  profiles = [],
  firmPayments = [],
  cashbookEntries = [],
  onRefresh,
  canEdit = true,
  brand = 'main',
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [balanceFilter, setBalanceFilter] = useState('All'); // All, Due, Excess, Settled
  const [selectedProfile, setSelectedProfile] = useState(null);

  // Quick modals
  const [showAddEntryModal, setShowAddEntryModal] = useState(null); // null | profile
  const [showSettleModal, setShowSettleModal] = useState(null); // null | profile
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Form states for Add Entry
  const [entryForm, setEntryForm] = useState({
    type: 'non_cash_deduction', // non_cash_deduction | cash_advance | bank_transfer | salary_credit | opening_balance
    amount: '',
    category: 'Cement Bags',
    itemName: '',
    date: new Date().toISOString().slice(0, 10),
    remark: '',
    alsoRecordInCashbook: false,
    creditMonth: new Date().toISOString().slice(0, 7),
  });
  const [savingEntry, setSavingEntry] = useState(false);

  // Time filter inside personal ledger
  const [ledgerTimeFilter, setLedgerTimeFilter] = useState('all'); // all | 3months | 6months | this_month

  // Exclude fuel pumps/vendors
  const validProfiles = useMemo(() => {
    return profiles.filter(p => {
      const t = (p.type || '').toLowerCase();
      const d = (p.department || '').toLowerCase();
      const n = (p.name || '').toLowerCase();
      if (t.includes('pump') || d.includes('pump') || n.includes('pump')) return false;
      return true;
    });
  }, [profiles]);

  // Compute ledgers for all profiles
  const profilesWithKhata = useMemo(() => {
    return validProfiles.map(p => {
      const ledger = buildProfileLedger(p, firmPayments, cashbookEntries);
      return {
        ...p,
        khata: ledger,
      };
    });
  }, [validProfiles, firmPayments, cashbookEntries]);

  // Filtering
  const filteredProfiles = useMemo(() => {
    return profilesWithKhata.filter(p => {
      if (roleFilter !== 'All') {
        if (roleFilter === 'Other') {
          if (['Driver', 'Office Staff', 'Labour'].includes(p.type)) return false;
        } else if (p.type !== roleFilter) {
          return false;
        }
      }

      const bal = p.khata.summary.netBalance;
      if (balanceFilter === 'Due' && bal <= 0) return false;
      if (balanceFilter === 'Excess' && bal >= 0) return false;
      if (balanceFilter === 'Settled' && bal !== 0) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const match =
          (p.name || '').toLowerCase().includes(q) ||
          (p.phone || '').includes(q) ||
          (p.vehicleNo || '').toLowerCase().includes(q) ||
          (p.department || '').toLowerCase().includes(q) ||
          (p.fatherName || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [profilesWithKhata, roleFilter, balanceFilter, searchTerm]);

  // Aggregates for header stats
  const stats = useMemo(() => {
    let totalMonthlyCommitment = 0;
    let totalNetPayable = 0;
    let totalAdvances = 0;
    let totalNonCashDeductions = 0;

    profilesWithKhata.forEach(p => {
      totalMonthlyCommitment += parseFloat(p.fixedSalary) || 0;
      if (p.khata.summary.netBalance > 0) {
        totalNetPayable += p.khata.summary.netBalance;
      }
      totalAdvances += p.khata.summary.totalCashAdv;
      totalNonCashDeductions += p.khata.summary.totalNonCash;
    });

    return {
      count: validProfiles.length,
      totalMonthlyCommitment,
      totalNetPayable,
      totalAdvances,
      totalNonCashDeductions,
    };
  }, [profilesWithKhata, validProfiles]);

  // Handle open ledger for a profile
  const activeProfileData = useMemo(() => {
    if (!selectedProfile) return null;
    return profilesWithKhata.find(p => p.id === selectedProfile.id) || selectedProfile;
  }, [selectedProfile, profilesWithKhata]);

  // Filter ledger entries by time
  const activeLedgerEntries = useMemo(() => {
    if (!activeProfileData?.khata) return [];
    const all = activeProfileData.khata.entries;
    if (ledgerTimeFilter === 'all') return all;

    const now = new Date();
    const cutoff = new Date();
    if (ledgerTimeFilter === 'this_month') {
      cutoff.setDate(1);
    } else if (ledgerTimeFilter === '3months') {
      cutoff.setMonth(now.getMonth() - 3);
    } else if (ledgerTimeFilter === '6months') {
      cutoff.setMonth(now.getMonth() - 6);
    }

    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return all.filter(e => (e.date || '') >= cutoffStr);
  }, [activeProfileData, ledgerTimeFilter]);

  // Quick Open Add Entry Modal
  const openAddEntry = (profile, defaultType = 'non_cash_deduction') => {
    setShowAddEntryModal(profile);
    setEntryForm({
      type: defaultType,
      amount: '',
      category: defaultType === 'non_cash_deduction' ? 'Cement Bags' : 'Advance',
      itemName: '',
      date: new Date().toISOString().slice(0, 10),
      remark: '',
      alsoRecordInCashbook: false,
      creditMonth: new Date().toISOString().slice(0, 7),
    });
  };

  // Quick Open Settlement Modal
  const openSettleModal = (profile) => {
    setShowSettleModal(profile);
  };

  // Submit Add Entry
  const handleSaveEntry = async (e) => {
    e.preventDefault();
    if (!showAddEntryModal) return;
    const amt = parseFloat(entryForm.amount);
    if (!amt || amt <= 0) return alert('Please enter a valid amount');

    setSavingEntry(true);
    try {
      const p = showAddEntryModal;
      const isCredit = entryForm.type === 'salary_credit' || entryForm.type === 'opening_balance';
      const isNonCash = entryForm.type === 'non_cash_deduction' || entryForm.type === 'salary_credit';

      let remarkText = entryForm.remark;
      if (entryForm.type === 'non_cash_deduction') {
        const item = entryForm.itemName.trim() || entryForm.category;
        remarkText = entryForm.remark ? `${item} - ${entryForm.remark}` : item;
      } else if (entryForm.type === 'salary_credit') {
        const mLabel = entryForm.creditMonth ? new Date(entryForm.creditMonth + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '';
        remarkText = entryForm.remark ? `Salary Credit (${mLabel}) - ${entryForm.remark}` : `Salary Credit for ${mLabel}`;
      }

      // If user chose to also record Cash Advance in Cashbook:
      if (entryForm.type === 'cash_advance' && entryForm.alsoRecordInCashbook) {
        const cbPath = brand === 'jklakshmi' ? '/jkl/cashbook/cash-out-linked' : '/cashbook/cash-out-linked';
        await ax.post(cbPath, {
          amount: amt,
          date: entryForm.date,
          remark: remarkText || `Cash Advance to ${p.name}`,
          entityType: p.type === 'Driver' ? 'driver' : 'staff',
          entityId: p.id,
          entityName: p.name,
        });
      } else {
        // Record in profile_payments directly (Zero cashbook impact for non-cash deduction!)
        await ax.post('/payments', {
          profileId: p.id,
          profileName: p.name,
          amount: amt,
          date: entryForm.date,
          category: entryForm.type === 'non_cash_deduction' ? 'Material / Store Deduction' :
                    entryForm.type === 'cash_advance' ? 'Advance' :
                    entryForm.type === 'bank_transfer' ? 'Bank Advance' :
                    entryForm.type === 'salary_credit' ? 'Salary Credit' : 'Opening Balance',
          entryType: isCredit ? 'credit' : 'debit',
          paymentMethod: entryForm.type === 'non_cash_deduction' ? 'Non-Cash Adjustment' :
                         entryForm.type === 'bank_transfer' ? 'Bank Transfer' :
                         isCredit ? 'Accrual' : 'Cash',
          isNonCash: isNonCash,
          remark: remarkText,
          itemName: entryForm.itemName || undefined,
        });
      }

      setShowAddEntryModal(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Save entry failed:', err);
      alert(err.response?.data?.error || 'Failed to save entry');
    } finally {
      setSavingEntry(false);
    }
  };

  // Delete an entry
  const handleDeleteEntry = async (entry) => {
    if (!entry.canDelete) return;
    if (!window.confirm(`Are you sure you want to delete this entry: "${entry.desc}" (₹${(entry.credit || entry.debit).toLocaleString('en-IN')})?`)) return;

    try {
      await ax.delete(`/payments/${entry.id}`);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert('Failed to delete entry');
    }
  };

  // Generate WhatsApp text
  const generateWhatsAppMessage = (pData) => {
    if (!pData) return '';
    const name = pData.name || 'Staff';
    const role = pData.type || 'Profile';
    const sum = pData.khata.summary;

    const lines = [
      `*VIKAS GOODS TRANSPORT CO.* 🚛`,
      `*Staff & Driver Khata Statement*`,
      `----------------------------------------`,
      `👤 *Name:* ${name} (${role})`,
      pData.vehicleNo ? `🚚 *Vehicle:* ${pData.vehicleNo}` : null,
      pData.phone ? `📱 *Phone:* ${pData.phone}` : null,
      pData.fixedSalary ? `💰 *Fixed Monthly Salary:* ${fmtRs(pData.fixedSalary)}` : null,
      `----------------------------------------`,
      `📊 *Khata Summary:*`,
      `➕ Total Salary Earned: *${fmtRs(sum.totalCredit)}*`,
      `➖ Cash Advances Taken: *${fmtRs(sum.totalCashAdv)}*`,
      `🧱 Non-Cash Deductions: *${fmtRs(sum.totalNonCash)}*`,
      `----------------------------------------`,
      sum.netBalance > 0
        ? `✅ *Net Payable Balance:* *${fmtRs(sum.netBalance)}*`
        : sum.netBalance < 0
        ? `⚠️ *Excess Advance to Recover:* *${fmtRs(Math.abs(sum.netBalance))}*`
        : `🤝 *Account Status: Fully Settled (₹0)*`,
      `----------------------------------------`,
      `📅 Generated On: ${new Date().toLocaleDateString('en-IN')}`,
      `_For any discrepancy, contact office accounts._`
    ].filter(Boolean);

    return lines.join('\n');
  };

  if (showSettleModal) {
    return (
      <AttendanceSettlementModal
        profile={showSettleModal}
        brand={brand}
        onClose={() => setShowSettleModal(null)}
        onSuccess={() => {
          setShowSettleModal(null);
          if (onRefresh) onRefresh();
        }}
      />
    );
  }

  return (
    <div>
      {/* Top Title & Header */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen size={20} color="var(--primary)" /> Staff & Driver Khata Book
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Individual ledgers, non-cash adjustments, and multi-month accumulated salary settlement
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '250px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="fi"
                style={{ paddingLeft: '32px', height: '34px', fontSize: '12px' }}
                placeholder="Search name, phone, truck..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-row)' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: '4px' }}>Role:</span>
            {['All', 'Driver', 'Office Staff', 'Labour', 'Other'].map(type => (
              <button
                key={type}
                className={`btn btn-sm ${roleFilter === type ? 'btn-p' : 'btn-g'}`}
                style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: 'none' }}
                onClick={() => setRoleFilter(type)}
              >
                {type === 'All' ? 'All Roles' : type}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: '4px' }}>Balance:</span>
            {[
              { id: 'All', label: 'All Profiles' },
              { id: 'Due', label: 'Balance Due (To Pay)' },
              { id: 'Excess', label: 'Advance Excess' },
              { id: 'Settled', label: 'Settled (₹0)' },
            ].map(b => (
              <button
                key={b.id}
                className={`btn btn-sm ${balanceFilter === b.id ? 'btn-p' : 'btn-g'}`}
                style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: 'none' }}
                onClick={() => setBalanceFilter(b.id)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Overview Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '18px' }}>
        {[
          { label: 'Staff & Drivers', val: stats.count, fmt: v => v, color: '#6366f1' },
          { label: 'Monthly Payroll', val: stats.totalMonthlyCommitment, fmt: fmtRs, color: '#10b981' },
          { label: 'Cash Advances Taken', val: stats.totalAdvances, fmt: fmtRs, color: '#0ea5e9' },
          { label: 'Non-Cash Deductions', val: stats.totalNonCashDeductions, fmt: fmtRs, color: '#f59e0b' },
          { label: 'Net Payable Balance (To Staff)', val: stats.totalNetPayable, fmt: fmtRs, color: '#10b981', highlight: true },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--bg-card)', border: c.highlight ? '1.5px solid rgba(16,185,129,0.4)' : '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>{c.label}</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: c.color }}>{c.fmt(c.val)}</div>
          </div>
        ))}
      </div>

      {/* Directory Table */}
      <div className="card">
        <TableScroll>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                <th style={TH_STYLE}>Staff / Driver</th>
                <th style={TH_STYLE}>Role / Vehicle</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}>Monthly Salary</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}>Total Earned</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Cash Advances</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Non-Cash Deductions</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}>Net Khata Balance</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.map((p, i) => {
                const khata = p.khata;
                const sum = khata.summary;
                const fixedSal = parseFloat(p.fixedSalary) || 0;

                const roleBadgeColor = {
                  Driver: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', icon: Truck },
                  'Office Staff': { bg: 'rgba(99,102,241,0.1)', color: '#6366f1', icon: User },
                  Labour: { bg: 'rgba(14,165,233,0.1)', color: '#0ea5e9', icon: User },
                }[p.type] || { bg: 'var(--bg-input)', color: 'var(--text)', icon: User };

                const RoleIcon = roleBadgeColor.icon;

                return (
                  <tr key={p.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)', transition: 'background 0.1s' }}>
                    <td style={TD_STYLE}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: roleBadgeColor.bg, color: roleBadgeColor.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px' }}>
                          {p.name ? p.name.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: '13px' }}>{p.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {p.phone || (p.mobileNumbers && p.mobileNumbers[0]) || 'No phone'}
                            {p.fatherName ? ` · S/o ${p.fatherName}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={TD_STYLE}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '5px', fontSize: '10.5px', fontWeight: 700, background: roleBadgeColor.bg, color: roleBadgeColor.color }}>
                          <RoleIcon size={12} /> {p.type || 'Staff'}
                        </span>
                        {p.vehicleNo && (
                          <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '11px', color: '#f59e0b', background: 'rgba(245,158,11,0.08)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(245,158,11,0.2)' }}>
                            {p.vehicleNo}
                          </span>
                        )}
                      </div>
                    </td>

                    <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 700 }}>
                      {fixedSal > 0 ? fmtRs(fixedSal) : '—'}
                    </td>

                    <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                      {fmtRs(sum.totalCredit)}
                    </td>

                    <td style={{ ...TD_STYLE, textAlign: 'center' }}>
                      {sum.totalCashAdv > 0 ? (
                        <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, background: 'rgba(14,165,233,0.1)', color: '#0ea5e9' }}>
                          {fmtRs(sum.totalCashAdv)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>

                    <td style={{ ...TD_STYLE, textAlign: 'center' }}>
                      {sum.totalNonCash > 0 ? (
                        <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                          {fmtRs(sum.totalNonCash)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>

                    <td style={{ ...TD_STYLE, textAlign: 'right' }}>
                      {sum.netBalance > 0 ? (
                        <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 900, background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                          {fmtRs(sum.netBalance)} Payable
                        </span>
                      ) : sum.netBalance < 0 ? (
                        <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 900, background: 'rgba(244,63,94,0.12)', color: '#f43f5e', border: '1px solid rgba(244,63,94,0.3)' }}>
                          {fmtRs(Math.abs(sum.netBalance))} Excess
                        </span>
                      ) : (
                        <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: 'var(--bg-input)', color: 'var(--text-muted)' }}>
                          Settled (₹0)
                        </span>
                      )}
                    </td>

                    <td style={{ ...TD_STYLE, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-sm btn-p"
                          style={{ fontSize: '10.5px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => setSelectedProfile(p)}
                        >
                          <BookOpen size={12} /> Open Khata
                        </button>

                        <button
                          className="btn btn-sm"
                          style={{ fontSize: '10.5px', padding: '4px 8px', background: 'rgba(245,158,11,0.1)', color: '#d97706', border: '1px solid rgba(245,158,11,0.25)', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                          title="Deduct fines, goods, spares, adjustments without touching physical cash"
                          onClick={() => openAddEntry(p, 'non_cash_deduction')}
                        >
                          <Package size={12} /> + Deduction
                        </button>

                        {(sum.netBalance > 0 || parseFloat(p.fixedSalary) > 0) && (
                          <button
                            className="btn btn-sm"
                            style={{ fontSize: '10.5px', padding: '4px 8px', background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            onClick={() => openSettleModal(p)}
                            title="Attendance & Salary Settlement"
                          >
                            <CheckCircle2 size={12} /> Settle & Pay
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredProfiles.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...TD_STYLE, textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No staff or driver profiles found matching filter/search
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </div>

      {/* ========================================================================= */}
      {/* PERSONAL KHATA BOOK MODAL (DETAILED LEDGER)                                */}
      {/* ========================================================================= */}
      {activeProfileData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '960px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', overflow: 'hidden' }}
          >
            {/* Header */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-th)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'rgba(99,102,241,0.15)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '18px' }}>
                  {activeProfileData.name ? activeProfileData.name.charAt(0).toUpperCase() : '?'}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
                      {activeProfileData.name} — Khata Book
                    </h3>
                    <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: 'rgba(99,102,241,0.12)', color: 'var(--primary)' }}>
                      {activeProfileData.type || 'Profile'}
                    </span>
                    {activeProfileData.vehicleNo && (
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '11px', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                        {activeProfileData.vehicleNo}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {activeProfileData.phone ? `Phone: ${activeProfileData.phone} · ` : ''}
                    {activeProfileData.dateJoined ? `Joined: ${fmtDate(activeProfileData.dateJoined)} · ` : ''}
                    Fixed Salary: {fmtRs(activeProfileData.fixedSalary)} / mo
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  className="btn btn-sm btn-g"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  onClick={() => setShowShareModal(true)}
                >
                  <Share2 size={13} /> WhatsApp Share
                </button>
                <button
                  className="btn btn-sm btn-g"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  onClick={() => setShowPrintModal(true)}
                >
                  <Printer size={13} /> Print
                </button>
                <button
                  onClick={() => setSelectedProfile(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', borderRadius: '6px' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Sub-KPI Highlights Bar */}
            <div style={{ padding: '14px 22px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              <div style={{ background: 'var(--bg-input)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Salary Earned</div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#10b981' }}>{fmtRs(activeProfileData.khata.summary.totalCredit)}</div>
              </div>

              <div style={{ background: 'var(--bg-input)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cash Advances Taken</div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#0ea5e9' }}>{fmtRs(activeProfileData.khata.summary.totalCashAdv)}</div>
              </div>

              <div style={{ background: 'var(--bg-input)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Non-Cash Deductions</div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#f59e0b' }}>{fmtRs(activeProfileData.khata.summary.totalNonCash)}</div>
              </div>

              <div style={{ background: activeProfileData.khata.summary.netBalance > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', padding: '10px 14px', borderRadius: '10px', border: `1px solid ${activeProfileData.khata.summary.netBalance > 0 ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}` }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: activeProfileData.khata.summary.netBalance > 0 ? '#10b981' : '#f43f5e', textTransform: 'uppercase' }}>
                  {activeProfileData.khata.summary.netBalance > 0 ? 'Closing Payable Balance' : activeProfileData.khata.summary.netBalance < 0 ? 'Excess Advance to Recover' : 'Closing Balance'}
                </div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: activeProfileData.khata.summary.netBalance > 0 ? '#10b981' : activeProfileData.khata.summary.netBalance < 0 ? '#f43f5e' : 'var(--text-muted)' }}>
                  {fmtRs(Math.abs(activeProfileData.khata.summary.netBalance))}
                </div>
              </div>
            </div>

            {/* Actions Bar & Time Scope */}
            <div style={{ padding: '10px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', background: 'var(--bg-th)' }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: '4px' }}>Range:</span>
                {[
                  { id: 'all', label: 'All Time (Cumulative)' },
                  { id: 'this_month', label: 'This Month' },
                  { id: '3months', label: 'Last 3 Months' },
                  { id: '6months', label: 'Last 6 Months' },
                ].map(t => (
                  <button
                    key={t.id}
                    className={`btn btn-sm ${ledgerTimeFilter === t.id ? 'btn-p' : 'btn-g'}`}
                    style={{ fontSize: '10.5px', padding: '3px 8px', borderRadius: '5px', border: 'none' }}
                    onClick={() => setLedgerTimeFilter(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-sm"
                  style={{ background: '#f59e0b', color: '#fff', border: 'none', fontWeight: 700, fontSize: '11px', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => openAddEntry(activeProfileData, 'non_cash_deduction')}
                >
                  <Package size={13} /> + Non-Cash Deduction
                </button>

                <button
                  className="btn btn-sm btn-p"
                  style={{ fontSize: '11px', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => openAddEntry(activeProfileData, 'cash_advance')}
                >
                  <Plus size={13} /> + Cash / Advance
                </button>

                {(activeProfileData.khata.summary.netBalance > 0 || parseFloat(activeProfileData.fixedSalary) > 0) && (
                  <button
                    className="btn btn-sm"
                    style={{ background: '#10b981', color: '#fff', border: 'none', fontWeight: 800, fontSize: '11px', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => openSettleModal(activeProfileData)}
                    title="Attendance-linked Salary Settlement"
                  >
                    <CheckCircle2 size={13} /> Settle & Pay
                  </button>
                )}
              </div>
            </div>

            {/* Ledger Transactions Table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-th)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ ...TH_STYLE, width: '90px' }}>Date</th>
                    <th style={TH_STYLE}>Description / Item Particulars</th>
                    <th style={TH_STYLE}>Category / Tag</th>
                    <th style={{ ...TH_STYLE, textAlign: 'right', color: '#10b981' }}>Credit (+)</th>
                    <th style={{ ...TH_STYLE, textAlign: 'right', color: '#f43f5e' }}>Debit (-)</th>
                    <th style={{ ...TH_STYLE, textAlign: 'right' }}>Running Balance</th>
                    <th style={{ ...TH_STYLE, textAlign: 'center', width: '60px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeLedgerEntries.map((e, idx) => {
                    const isCredit = e.credit > 0;
                    const isNonCashDeduction = e.isNonCash && e.debit > 0;

                    return (
                      <tr key={e.id || idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                        <td style={{ ...TD_STYLE, fontWeight: 600 }}>{fmtDate(e.date)}</td>

                        <td style={{ ...TD_STYLE, maxWidth: '280px', whiteSpace: 'normal' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text)' }}>
                            {e.desc}
                          </div>
                          {e.source && (
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              Source: {e.source} {e.paymentMethod ? `· ${e.paymentMethod}` : ''}
                            </div>
                          )}
                        </td>

                        <td style={TD_STYLE}>
                          {isCredit ? (
                            <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 700, background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                              {e.category}
                            </span>
                          ) : isNonCashDeduction ? (
                            <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 700, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                              🧱 {e.category} (Non-Cash)
                            </span>
                          ) : (
                            <span style={{ padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 700, background: 'rgba(244,63,94,0.1)', color: '#f43f5e' }}>
                              💵 {e.category}
                            </span>
                          )}
                        </td>

                        <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 800, color: '#10b981' }}>
                          {e.credit > 0 ? fmtRs(e.credit) : '—'}
                        </td>

                        <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 800, color: '#f43f5e' }}>
                          {e.debit > 0 ? fmtRs(e.debit) : '—'}
                        </td>

                        <td style={{ ...TD_STYLE, textAlign: 'right', fontWeight: 900, color: e.runningBalance >= 0 ? '#10b981' : '#f43f5e' }}>
                          {fmtRs(e.runningBalance)}
                        </td>

                        <td style={{ ...TD_STYLE, textAlign: 'center' }}>
                          {e.canDelete && canEdit ? (
                            <button
                              onClick={() => handleDeleteEntry(e)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                              title="Delete this entry"
                            >
                              <Trash2 size={13} />
                            </button>
                          ) : (
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {activeLedgerEntries.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ ...TD_STYLE, textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
                        No transactions recorded in this time period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', background: 'var(--bg-th)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                Total {activeLedgerEntries.length} transaction entries · Showing {ledgerTimeFilter.replace(/_/g, ' ')}
              </div>
              <button className="btn btn-g" onClick={() => setSelectedProfile(null)} style={{ padding: '6px 16px', fontSize: '12px' }}>
                Close Khata
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD KHATA ENTRY (NON-CASH DEDUCTION / ADVANCE / SALARY CREDIT)     */}
      {/* ========================================================================= */}
      {showAddEntryModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '540px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-th)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>
                  + Add Khata Entry
                </h3>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Recording for: <strong style={{ color: 'var(--text)' }}>{showAddEntryModal.name}</strong> ({showAddEntryModal.type})
                </div>
              </div>
              <button onClick={() => setShowAddEntryModal(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEntry} style={{ padding: '20px' }}>
              {/* Type Switcher */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Entry Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {[
                    { id: 'non_cash_deduction', label: '📦 Deduction', sub: 'No cash out' },
                    { id: 'cash_advance', label: '💵 Cash Advance', sub: 'Physical cash' },
                    { id: 'salary_credit', label: '📅 Salary / Credit', sub: 'Earning credit' },
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setEntryForm(f => ({ ...f, type: t.id }))}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: entryForm.type === t.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                        background: entryForm.type === t.id ? 'rgba(99,102,241,0.1)' : 'var(--bg-input)',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '11.5px', fontWeight: 800, color: entryForm.type === t.id ? 'var(--primary)' : 'var(--text)' }}>{t.label}</div>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{t.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Informative Guidance Banner for Non-Cash */}
              {entryForm.type === 'non_cash_deduction' && (
                <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#d97706', fontSize: '11.5px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <Package size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Non-Cash Adjustment:</strong> This entry subtracts from the person's salary balance without deducting from the physical cash drawer. Cashbook is <strong>not</strong> affected!
                  </div>
                </div>
              )}

              {/* Amount & Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Amount (₹) *</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    className="fi"
                    style={{ height: '36px', fontSize: '14px', fontWeight: 800 }}
                    placeholder="e.g. 3000"
                    value={entryForm.amount}
                    onChange={e => setEntryForm(f => ({ ...f, amount: e.target.value }))}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Date *</label>
                  <input
                    type="date"
                    required
                    className="fi"
                    style={{ height: '36px', fontSize: '12px' }}
                    value={entryForm.date}
                    onChange={e => setEntryForm(f => ({ ...f, date: e.target.value }))}
                  />
                </div>
              </div>

              {/* Category selector for Non-Cash */}
              {entryForm.type === 'non_cash_deduction' && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Deduction Category</label>
                  <select
                    className="fi"
                    style={{ height: '36px', fontSize: '12px' }}
                    value={entryForm.category}
                    onChange={e => setEntryForm(f => ({ ...f, category: e.target.value }))}
                  >
                    <option value="Cement Bags">Cement Bags</option>
                    <option value="Diesel Deduction">Diesel Deduction</option>
                    <option value="Vehicle Spares">Vehicle Spare Parts / Tyre</option>
                    <option value="Challan / Fine">Challan / Traffic Fine</option>
                    <option value="Store / Ration">Store / Ration Item</option>
                    <option value="Advance Adjustment">Advance Adjustment</option>
                    <option value="Other Non-Cash">Other Non-Cash Deduction</option>
                  </select>
                </div>
              )}

              {/* Specific Item / Particulars for Cement/Store */}
              {entryForm.type === 'non_cash_deduction' && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Item Name / Quantity</label>
                  <input
                    type="text"
                    className="fi"
                    style={{ height: '36px', fontSize: '12px' }}
                    placeholder="e.g. 10 Bags JK Super Cement @ ₹300"
                    value={entryForm.itemName}
                    onChange={e => setEntryForm(f => ({ ...f, itemName: e.target.value }))}
                  />
                </div>
              )}

              {/* Salary Credit Month Picker */}
              {entryForm.type === 'salary_credit' && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Credit Month</label>
                  <input
                    type="month"
                    className="fi"
                    style={{ height: '36px', fontSize: '12px' }}
                    value={entryForm.creditMonth}
                    onChange={e => setEntryForm(f => ({ ...f, creditMonth: e.target.value }))}
                  />
                </div>
              )}

              {/* Checkbox: Also record Cash Advance in Cashbook */}
              {entryForm.type === 'cash_advance' && (
                <div style={{ marginBottom: '14px', background: 'var(--bg-input)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                    <input
                      type="checkbox"
                      checked={entryForm.alsoRecordInCashbook}
                      onChange={e => setEntryForm(f => ({ ...f, alsoRecordInCashbook: e.target.checked }))}
                    />
                    <span>Also record in Cashbook as Cash Out (subtract from cash-in-hand)</span>
                  </label>
                </div>
              )}

              {/* Remark */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>Remark / Notes</label>
                <input
                  type="text"
                  className="fi"
                  style={{ height: '36px', fontSize: '12px' }}
                  placeholder="Optional remarks..."
                  value={entryForm.remark}
                  onChange={e => setEntryForm(f => ({ ...f, remark: e.target.value }))}
                />
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-g" onClick={() => setShowAddEntryModal(null)} disabled={savingEntry}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-p" disabled={savingEntry} style={{ padding: '8px 20px', fontWeight: 800 }}>
                  {savingEntry ? 'Saving...' : 'Save Entry'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}



      {/* ========================================================================= */}
      {/* MODAL: WHATSAPP SHARE STATEMENT                                           */}
      {/* ========================================================================= */}
      {showShareModal && activeProfileData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '560px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-th)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Share2 size={16} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>
                  Share Khata Statement via WhatsApp
                </h3>
              </div>
              <button onClick={() => setShowShareModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 0 }}>
                Copy or send this statement breakdown directly to {activeProfileData.name}:
              </p>

              <textarea
                readOnly
                className="fi"
                style={{ width: '100%', height: '220px', fontSize: '12px', fontFamily: 'monospace', padding: '12px', resize: 'none', background: 'var(--bg-input)', lineHeight: 1.5 }}
                value={generateWhatsAppMessage(activeProfileData)}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                <button
                  type="button"
                  className="btn btn-g"
                  onClick={() => {
                    navigator.clipboard.writeText(generateWhatsAppMessage(activeProfileData));
                    alert('Statement copied to clipboard!');
                  }}
                >
                  Copy Text
                </button>

                <button
                  type="button"
                  className="btn"
                  style={{ background: '#25D366', color: '#fff', border: 'none', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}
                  onClick={() => {
                    const text = encodeURIComponent(generateWhatsAppMessage(activeProfileData));
                    const phone = (activeProfileData.phone || (activeProfileData.mobileNumbers && activeProfileData.mobileNumbers[0]) || '').replace(/\D/g, '');
                    const url = phone ? `https://wa.me/91${phone.slice(-10)}?text=${text}` : `https://wa.me/?text=${text}`;
                    window.open(url, '_blank');
                  }}
                >
                  <ExternalLink size={14} /> Open in WhatsApp
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PRINT STATEMENT MODAL                                                     */}
      {/* ========================================================================= */}
      {showPrintModal && activeProfileData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', color: '#000', borderRadius: '12px', width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', padding: '32px', boxShadow: '0 25px 50px rgba(0,0,0,0.4)', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px' }}>
              <button onClick={() => window.print()} style={{ padding: '6px 14px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}>
                🖨️ Print
              </button>
              <button onClick={() => setShowPrintModal(false)} style={{ padding: '6px 12px', background: '#e5e7eb', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}>
                ✕ Close
              </button>
            </div>

            <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '16px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>VIKAS GOODS TRANSPORT CO.</h2>
              <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '4px' }}>FLEET MANAGEMENT & TRANSPORT CONTRACTORS</div>
              <div style={{ fontSize: '15px', fontWeight: 800, marginTop: '8px', textDecoration: 'underline' }}>STAFF & DRIVER KHATA STATEMENT</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px', fontSize: '13px' }}>
              <div><strong>Name:</strong> {activeProfileData.name} ({activeProfileData.type})</div>
              <div><strong>Date:</strong> {new Date().toLocaleDateString('en-IN')}</div>
              {activeProfileData.fatherName && <div><strong>Father Name:</strong> {activeProfileData.fatherName}</div>}
              {activeProfileData.vehicleNo && <div><strong>Assigned Vehicle:</strong> {activeProfileData.vehicleNo}</div>}
              {activeProfileData.phone && <div><strong>Mobile:</strong> {activeProfileData.phone}</div>}
              {activeProfileData.fixedSalary && <div><strong>Fixed Salary:</strong> ₹{parseFloat(activeProfileData.fixedSalary).toLocaleString('en-IN')} / month</div>}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '20px' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', borderTop: '1px solid #000', borderBottom: '1px solid #000' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Particulars / Description</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Credit (+)</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Debit (-)</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {activeLedgerEntries.map((e, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '8px' }}>{fmtDate(e.date)}</td>
                    <td style={{ padding: '8px' }}>{e.desc}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{e.credit > 0 ? `₹${e.credit.toLocaleString('en-IN')}` : '-'}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{e.debit > 0 ? `₹${e.debit.toLocaleString('en-IN')}` : '-'}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800 }}>₹{e.runningBalance.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', marginBottom: '32px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Total Earned</div>
                  <div style={{ fontSize: '15px', fontWeight: 800 }}>₹{activeProfileData.khata.summary.totalCredit.toLocaleString('en-IN')}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Cash Advances</div>
                  <div style={{ fontSize: '15px', fontWeight: 800 }}>₹{activeProfileData.khata.summary.totalCashAdv.toLocaleString('en-IN')}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Non-Cash Deductions</div>
                  <div style={{ fontSize: '15px', fontWeight: 800 }}>₹{activeProfileData.khata.summary.totalNonCash.toLocaleString('en-IN')}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Net Closing Balance</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: activeProfileData.khata.summary.netBalance >= 0 ? '#059669' : '#dc2626' }}>
                    ₹{activeProfileData.khata.summary.netBalance.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '60px', paddingTop: '20px' }}>
              <div style={{ textAlign: 'center', width: '200px', borderTop: '1px solid #000', paddingTop: '8px', fontSize: '12px' }}>
                Employee / Driver Signature
              </div>
              <div style={{ textAlign: 'center', width: '200px', borderTop: '1px solid #000', paddingTop: '8px', fontSize: '12px' }}>
                Authorized Signatory (VGTC)
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
