import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Banknote, CheckCircle, AlertCircle, RefreshCw, CreditCard, ShieldCheck, Info, ChevronRight } from 'lucide-react';
import ax from '../api';
import { fmtRs } from '../utils/format';

export default function EmiScheduleTracker({ vehicle, onClose, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Payment Form Overlay state
  const [payingInstallment, setPayingInstallment] = useState(null); // stores installment object being edited
  const [payForm, setPayForm] = useState({
    paymentDate: '',
    paymentMethod: 'Bank Transfer',
    refNo: '',
    bankName: '',
    remarks: ''
  });

  const emiDetails = useMemo(() => {
    if (!vehicle || !vehicle.emiDetails) return {};
    try {
      return typeof vehicle.emiDetails === 'string' 
        ? JSON.parse(vehicle.emiDetails) 
        : vehicle.emiDetails;
    } catch (e) {
      console.error('Failed to parse emiDetails:', e);
      return {};
    }
  }, [vehicle]);

  // Calculate elapsed months since start date
  const getElapsedMonths = (startStr, dayVal) => {
    if (!startStr) return 0;
    const start = new Date(startStr);
    if (isNaN(start.getTime())) return 0;
    const today = new Date();
    let m = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
    const dVal = parseInt(dayVal) || start.getDate();
    if (today.getDate() < dVal) m--;
    return Math.max(0, m);
  };

  const schedule = emiDetails.schedule || [];
  const todayStr = new Date().toISOString().slice(0, 10);
  
  const elapsed = getElapsedMonths(emiDetails.startDate, emiDetails.emiDay);
  const manualPaidCount = schedule.filter(item => item.status === 'paid').length;
  const schedulePaidCount = schedule.filter(item => item.status === 'paid' || item.dueDate <= todayStr).length;

  const paidCount = schedule.length > 0
    ? schedulePaidCount
    : Math.max(elapsed, (emiDetails.paidEmis || []).length);

  const totalTenure = parseInt(emiDetails.tenure) || 0;
  const pendingEmis = Math.max(0, totalTenure - paidCount);

  // Initializing pay form when installment is selected
  useEffect(() => {
    if (payingInstallment) {
      setPayForm({
        paymentDate: payingInstallment.paymentDate || new Date().toISOString().slice(0, 10),
        paymentMethod: payingInstallment.paymentMethod || 'Bank Transfer',
        refNo: payingInstallment.refNo || '',
        bankName: payingInstallment.bankName || emiDetails.bankName || '',
        remarks: payingInstallment.remarks || ''
      });
    }
  }, [payingInstallment, emiDetails.bankName]);

  // Helper to generate schedule dynamically
  const handleGenerateSchedule = async () => {
    const startDate = emiDetails.startDate;
    const tenure = parseInt(emiDetails.tenure) || 0;
    const amount = parseFloat(emiDetails.due) || 0;
    const emiDay = parseInt(emiDetails.emiDay) || (startDate ? new Date(startDate).getDate() : 5);

    if (!startDate || tenure <= 0 || amount <= 0) {
      alert('Please configure financing options (Start Date, Tenure, and EMI Amount) in Vehicle Profile first.');
      return;
    }

    if (schedule.length > 0 && !window.confirm('Generating a new schedule will reset any payment tracking status. Do you want to proceed?')) {
      return;
    }

    setLoading(true);
    try {
      const generated = [];
      const start = new Date(startDate);
      const existingPaid = emiDetails.paidEmis || [];

      for (let i = 1; i <= tenure; i++) {
        const dueDate = new Date(start.getFullYear(), start.getMonth() + i, emiDay);
        const dateStr = dueDate.toISOString().slice(0, 10);
        const monthStr = dateStr.slice(0, 7); // YYYY-MM
        const isPaid = existingPaid.includes(monthStr);

        generated.push({
          installmentNo: i,
          dueDate: dateStr,
          amount: amount,
          status: isPaid ? 'paid' : 'unpaid',
          paymentDate: isPaid ? dateStr : '',
          paymentMethod: 'Bank Transfer',
          refNo: '',
          bankName: isPaid ? (emiDetails.bankName || '') : '',
          remarks: isPaid ? 'Migrated from simple tracking' : ''
        });
      }

      const updatedDetails = {
        ...emiDetails,
        emiDay,
        schedule: generated
      };

      await ax.patch(`/vehicles/${vehicle.id}`, {
        emiDetails: JSON.stringify(updatedDetails)
      });

      onUpdate();
    } catch (e) {
      console.error(e);
      setError('Failed to generate schedule.');
    } finally {
      setLoading(false);
    }
  };

  // Mark specific installment as Paid or update details
  const handleSavePayment = async (e) => {
    e.preventDefault();
    if (!payingInstallment) return;

    setLoading(true);
    try {
      const updatedSchedule = schedule.map(item => {
        if (item.installmentNo === payingInstallment.installmentNo) {
          return {
            ...item,
            status: 'paid',
            paymentDate: payForm.paymentDate,
            paymentMethod: payForm.paymentMethod,
            refNo: payForm.refNo,
            bankName: payForm.bankName,
            remarks: payForm.remarks
          };
        }
        return item;
      });

      // Update paidEmis list for compatibility
      const paidEmis = updatedSchedule
        .filter(item => item.status === 'paid')
        .map(item => item.dueDate.slice(0, 7));

      const updatedDetails = {
        ...emiDetails,
        schedule: updatedSchedule,
        paidEmis: [...new Set(paidEmis)]
      };

      await ax.patch(`/vehicles/${vehicle.id}`, {
        emiDetails: JSON.stringify(updatedDetails)
      });

      setPayingInstallment(null);
      onUpdate();
    } catch (err) {
      console.error(err);
      alert('Failed to save payment status.');
    } finally {
      setLoading(false);
    }
  };

  // Mark installment as Unpaid
  const handleMarkUnpaid = async (installmentNo) => {
    if (!window.confirm(`Mark installment #${installmentNo} as Unpaid?`)) return;

    setLoading(true);
    try {
      const updatedSchedule = schedule.map(item => {
        if (item.installmentNo === installmentNo) {
          return {
            ...item,
            status: 'unpaid',
            paymentDate: '',
            refNo: '',
            bankName: '',
            remarks: ''
          };
        }
        return item;
      });

      // Update paidEmis list for compatibility
      const paidEmis = updatedSchedule
        .filter(item => item.status === 'paid')
        .map(item => item.dueDate.slice(0, 7));

      const updatedDetails = {
        ...emiDetails,
        schedule: updatedSchedule,
        paidEmis: [...new Set(paidEmis)]
      };

      await ax.patch(`/vehicles/${vehicle.id}`, {
        emiDetails: JSON.stringify(updatedDetails)
      });

      onUpdate();
    } catch (err) {
      console.error(err);
      alert('Failed to update status.');
    } finally {
      setLoading(false);
    }
  };

  // Financial Stats
  const totalLoanVal = parseFloat(emiDetails.total) || 0;
  const emiVal = parseFloat(emiDetails.due) || 0;
  const progressPercent = totalTenure > 0 ? Math.round((paidCount / totalTenure) * 100) : 0;
  const totalPaidAmount = paidCount * emiVal;
  const remainingAmount = pendingEmis * emiVal;

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      style={{ 
        position: 'fixed', 
        inset: 0, 
        zIndex: 2000, 
        background: 'rgba(0,0,0,0.8)', 
        backdropFilter: 'blur(8px)', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        padding: '20px' 
      }}
    >
      <motion.div 
        initial={{ y: 20, scale: 0.96 }} 
        animate={{ y: 0, scale: 1 }}
        style={{ 
          width: '100%', 
          maxWidth: '850px', 
          maxHeight: '90vh', 
          background: 'var(--bg-card)', 
          borderRadius: '16px', 
          border: '1px solid var(--border)', 
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)', 
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden' 
        }}
      >
        {/* Modal Header */}
        <div style={{ 
          background: 'linear-gradient(135deg, #1e293b, #0f172a)', 
          padding: '16px 24px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          borderBottom: '1px solid rgba(59,130,246,0.15)' 
        }}>
          <div>
            <div style={{ 
              fontSize: '18px', 
              fontWeight: 900, 
              color: '#f1f5f9', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px' 
            }}>
              <div style={{ 
                background: 'rgba(59,130,246,0.15)', 
                padding: '6px', 
                borderRadius: '8px' 
              }}>
                <Banknote size={18} color="#3b82f6" />
              </div>
              EMI Schedule Tracker — {vehicle.truckNo}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              {emiDetails.bankName || 'Unknown Bank'} • Loan Ref: {emiDetails.loanNo || 'N/A'}
            </div>
          </div>
          <button 
            onClick={onClose} 
            style={{ 
              background: 'rgba(255,255,255,0.05)', 
              border: '1px solid rgba(255,255,255,0.1)', 
              borderRadius: '8px', 
              padding: '6px', 
              cursor: 'pointer', 
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          
          {/* Quick Stats Grid */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', 
            gap: '12px', 
            marginBottom: '20px' 
          }}>
            {[
              { label: 'Total Loan', value: totalLoanVal > 0 ? fmtRs(totalLoanVal) : 'N/A', color: 'var(--text)' },
              { label: 'Monthly EMI', value: emiVal > 0 ? fmtRs(emiVal) : 'N/A', color: '#3b82f6' },
              { label: 'Paid EMIs', value: `${paidCount} / ${totalTenure} EMI`, color: '#10b981' },
              { label: 'Remaining EMIs', value: `${pendingEmis} EMI Left`, color: '#f43f5e' },
              { label: 'Outstanding Amt', value: fmtRs(remainingAmount), color: '#ef4444' }
            ].map((s, idx) => (
              <div key={idx} style={{ 
                background: 'var(--bg)', 
                border: '1px solid var(--border)', 
                borderRadius: '10px', 
                padding: '12px', 
                textAlign: 'center' 
              }}>
                <div style={{ fontSize: '8px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>{s.label}</div>
                <div style={{ fontSize: '14px', fontWeight: 900, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Progress Bar */}
          {totalTenure > 0 && (
            <div style={{ 
              background: 'rgba(59,130,246,0.05)', 
              border: '1px solid rgba(59,130,246,0.1)', 
              borderRadius: '10px', 
              padding: '14px', 
              marginBottom: '20px' 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-sub)' }}>
                <span>Repayment Progress</span>
                <span>{progressPercent}% Complete ({fmtRs(totalPaidAmount)} Paid)</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${progressPercent}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #10b981)', borderRadius: '4px' }}></div>
              </div>
            </div>
          )}

          {/* Schedule Area */}
          {schedule.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px 20px', 
              background: 'var(--bg)', 
              borderRadius: '12px', 
              border: '1px dashed var(--border)' 
            }}>
              <Info size={32} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
              <h4 style={{ fontWeight: 800, margin: '0 0 6px' }}>No EMI Schedule Generated</h4>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '380px', margin: '0 auto 16px' }}>
                Generate a month-by-month repayment schedule using the current financing details (Start Date: {emiDetails.startDate || 'Not Set'}, Tenure: {emiDetails.tenure || 0} Months, EMI: {fmtRs(emiVal)}).
              </p>
              <button 
                onClick={handleGenerateSchedule} 
                disabled={loading}
                className="btn btn-p" 
                style={{ background: '#3b82f6', color: 'white' }}
              >
                {loading ? 'Generating...' : <><RefreshCw size={13} style={{ marginRight: '6px' }} /> Generate Schedule</>}
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800 }}>Repayment Schedule ({schedule.length} Installments)</span>
                <button 
                  onClick={handleGenerateSchedule}
                  disabled={loading}
                  style={{ 
                    fontSize: '10px', 
                    fontWeight: 700, 
                    color: 'var(--text-muted)', 
                    border: 'none', 
                    background: 'transparent', 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <RefreshCw size={10} /> Reset Schedule
                </button>
              </div>

              {/* Table Wrapper */}
              <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-th)' }}>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Inst #</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Due Date</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Amount</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Status</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Payment details</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map((item) => (
                        <tr 
                          key={item.installmentNo} 
                          style={{ 
                            borderBottom: '1px solid var(--border-row)',
                            background: item.status === 'paid' ? 'rgba(16,185,129,0.02)' : 'transparent'
                          }}
                        >
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-muted)' }}>
                            #{item.installmentNo}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                            {new Date(item.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800 }}>
                            {fmtRs(item.amount)}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <span style={{ 
                              display: 'inline-block',
                              fontSize: '9px',
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: '20px',
                              background: (item.status === 'paid' || item.dueDate <= todayStr) ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                              color: (item.status === 'paid' || item.dueDate <= todayStr) ? '#10b981' : '#ef4444',
                              border: `1px solid ${(item.status === 'paid' || item.dueDate <= todayStr) ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`
                            }}>
                              {(item.status === 'paid' || item.dueDate <= todayStr) ? 'PAID' : 'PENDING'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '11px' }}>
                            {item.status === 'paid' ? (
                              <div>
                                <div>Paid on: {item.paymentDate ? new Date(item.paymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</div>
                                {item.refNo && <div style={{ fontSize: '9px', fontFamily: 'monospace' }}>Ref: {item.refNo}</div>}
                                {item.bankName && <div style={{ fontSize: '9px' }}>Via: {item.bankName} ({item.paymentMethod})</div>}
                              </div>
                            ) : item.dueDate <= todayStr ? (
                              <span style={{ fontStyle: 'italic', color: '#10b981' }}>Auto-paid (Elapsed)</span>
                            ) : (
                              <span style={{ fontStyle: 'italic' }}>Not paid yet</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            {item.status === 'paid' ? (
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                <button 
                                  onClick={() => setPayingInstallment(item)}
                                  className="btn btn-sm"
                                  style={{ padding: '2px 8px', fontSize: '10px', background: 'var(--bg-th)', border: '1px solid var(--border)' }}
                                >
                                  Edit Info
                                </button>
                                <button 
                                  onClick={() => handleMarkUnpaid(item.installmentNo)}
                                  className="btn btn-sm btn-d"
                                  style={{ padding: '2px 8px', fontSize: '10px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none' }}
                                >
                                  Unpay
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => setPayingInstallment(item)}
                                className="btn btn-sm btn-p"
                                style={{ padding: '4px 10px', fontSize: '10px', background: '#10b981', color: 'white', border: 'none' }}
                              >
                                Mark Paid
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ 
          background: 'var(--bg-th)', 
          padding: '12px 24px', 
          display: 'flex', 
          justifyContent: 'flex-end', 
          borderTop: '1px solid var(--border)' 
        }}>
          <button onClick={onClose} className="btn btn-g">Close</button>
        </div>
      </motion.div>

      {/* Payment Entry Form Dialog */}
      <AnimatePresence>
        {payingInstallment && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            style={{ 
              position: 'fixed', 
              inset: 0, 
              zIndex: 2100, 
              background: 'rgba(0,0,0,0.5)', 
              backdropFilter: 'blur(4px)', 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center' 
            }}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }} 
              animate={{ scale: 1, y: 0 }} 
              exit={{ scale: 0.95, y: 15 }}
              style={{ 
                width: '90%', 
                maxWidth: '420px', 
                background: 'var(--bg-card)', 
                borderRadius: '12px', 
                border: '1px solid var(--border)', 
                boxShadow: '0 20px 40px rgba(0,0,0,0.3)', 
                overflow: 'hidden' 
              }}
            >
              <div style={{ 
                padding: '14px 20px', 
                background: 'var(--bg-th)', 
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontWeight: 800, fontSize: '13px' }}>
                  💳 Record Installment #{payingInstallment.installmentNo} Payment
                </span>
                <button 
                  onClick={() => setPayingInstallment(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  <X size={14} />
                </button>
              </div>

              <form onSubmit={handleSavePayment} style={{ padding: '20px' }}>
                <div style={{ 
                  textAlign: 'center', 
                  padding: '8px', 
                  background: 'rgba(59,130,246,0.04)', 
                  border: '1px solid rgba(59,130,246,0.1)', 
                  borderRadius: '8px', 
                  marginBottom: '16px' 
                }}>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600 }}>INSTALLMENT AMOUNT</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--primary)' }}>
                    {fmtRs(payingInstallment.amount)}
                  </div>
                </div>

                <div className="fg fg-1" style={{ gap: '12px' }}>
                  <div className="field">
                    <label>Payment Date *</label>
                    <input 
                      className="fi" 
                      type="date" 
                      value={payForm.paymentDate} 
                      onChange={e => setPayForm({ ...payForm, paymentDate: e.target.value })} 
                      required 
                    />
                  </div>
                  
                  <div className="field">
                    <label>Payment Method</label>
                    <select 
                      className="fi" 
                      value={payForm.paymentMethod} 
                      onChange={e => setPayForm({ ...payForm, paymentMethod: e.target.value })}
                    >
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Online / UPI">Online / UPI</option>
                      <option value="Cash">Cash</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="field">
                    <label>Financing / Account Bank</label>
                    <input 
                      className="fi" 
                      type="text" 
                      placeholder="e.g. HDFC Bank" 
                      value={payForm.bankName} 
                      onChange={e => setPayForm({ ...payForm, bankName: e.target.value })} 
                    />
                  </div>

                  <div className="field">
                    <label>Txn Ref / UPI ID</label>
                    <input 
                      className="fi" 
                      type="text" 
                      placeholder="Optional ref number" 
                      value={payForm.refNo} 
                      onChange={e => setPayForm({ ...payForm, refNo: e.target.value })} 
                    />
                  </div>

                  <div className="field">
                    <label>Remarks</label>
                    <input 
                      className="fi" 
                      type="text" 
                      placeholder="Optional notes" 
                      value={payForm.remarks} 
                      onChange={e => setPayForm({ ...payForm, remarks: e.target.value })} 
                    />
                  </div>
                </div>

                <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                  <button 
                    type="submit" 
                    className="btn btn-p" 
                    style={{ flex: 1, background: '#10b981', color: 'white' }}
                  >
                    Save Payment
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setPayingInstallment(null)}
                    className="btn btn-g"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
