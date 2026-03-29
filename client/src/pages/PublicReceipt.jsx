import React, { useState, useEffect } from 'react';

import api from '../api';
import { FileText, Truck, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';

const fmtRs = n => 'Rs. ' + Math.round(n || 0).toLocaleString('en-IN');
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function PublicReceipt({ externalTruckNo, externalDate }) {
  const truckNo = externalTruckNo;
  const date = externalDate;
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchReceipts = async () => {
      try {
        setLoading(true);
        // We use the public endpoint which doesn't check localStorage tokens
        const res = await api.get(`/public/receipt/${encodeURIComponent(truckNo)}/${encodeURIComponent(date)}`);
        setReceipts(res.data);
      } catch (err) {
        console.error('Failed to fetch public receipt:', err);
        setError('Failed to load receipt details. The link may be invalid or expired.');
      } finally {
        setLoading(false);
      }
    };
    if (truckNo && date) {
      fetchReceipts();
    }
  }, [truckNo, date]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: '#64748b' }}>
        Loading receipt details...
      </div>
    );
  }

  if (error || receipts.length === 0) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', textAlign: 'center', maxWidth: '400px' }}>
          <AlertCircle size={48} color="#f43f5e" style={{ marginBottom: '16px' }} />
          <h2 style={{ fontSize: '18px', color: '#1e293b', marginBottom: '8px' }}>Receipt Not Found</h2>
          <p style={{ color: '#64748b', fontSize: '14px' }}>{error || 'No payment records found for this truck on the specified date.'}</p>
        </div>
      </div>
    );
  }

  const totals = receipts.reduce((acc, r) => {
    acc.gross += r.gross;
    acc.diesel += r.dieselAmount;
    acc.cash += r.advanceCash;
    acc.online += r.advanceOnline;
    acc.munshi += r.munshi;
    acc.shortage += r.shortage;
    acc.paid += r.paidBalance;
    return acc;
  }, { gross: 0, diesel: 0, cash: 0, online: 0, munshi: 0, shortage: 0, paid: 0 });

  return (
    <div style={{ backgroundColor: '#f1f5f9', minHeight: '100vh', padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
        
        {/* Header */}
        <div style={{ background: '#10b981', color: 'white', padding: '24px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', marginBottom: '12px' }}>
            <CheckCircle2 size={32} />
          </div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 'bold' }}>Payment Settled</h1>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>VGTC Management Systems</div>
        </div>

        {/* Info Cards */}
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>
                <Truck size={14} /> Vehicle No.
              </div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>{truckNo}</div>
            </div>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>
                <Calendar size={14} /> Cleared Date
              </div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>{fmtDate(date)}</div>
            </div>
          </div>

          {/* Trips Breakdown */}
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#334155', marginBottom: '12px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Trips Breakdown ({receipts.length})</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '30px' }}>
            {receipts.map((r, i) => (
              <div key={r.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', background: '#ffffff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>LR No: {r.lrNo}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{fmtDate(r.date)} • {r.type?.replace('_', ' ')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: '#10b981' }}>{fmtRs(r.gross)}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Gross Total</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                    <span>Diesel (-):</span> <span style={{ fontWeight: '600' }}>{fmtRs(r.dieselAmount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                    <span>Cash (-):</span> <span style={{ fontWeight: '600' }}>{fmtRs(r.advanceCash)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                    <span>Online (-):</span> <span style={{ fontWeight: '600' }}>{fmtRs(r.advanceOnline)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                    <span>Deductions (-):</span> <span style={{ fontWeight: '600' }}>{fmtRs(r.munshi + r.shortage)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1' }}>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>Net Payout:</span>
                  <span style={{ fontSize: '16px', fontWeight: '900', color: '#0f172a' }}>{fmtRs(r.paidBalance)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Grand Total */}
          <div style={{ background: '#f1f5f9', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: '16px', textAlign: 'center' }}>Consolidated Summary</h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', color: '#475569' }}>
              <span>Total Gross Freight</span>
              <span style={{ fontWeight: '600' }}>{fmtRs(totals.gross)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', color: '#f43f5e' }}>
              <span>Total Advances (Diesel/Cash/Online)</span>
              <span style={{ fontWeight: '600' }}>-{fmtRs(totals.diesel + totals.cash + totals.online)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '14px', color: '#f43f5e' }}>
              <span>Total Deductions (Munshi/Shortage)</span>
              <span style={{ fontWeight: '600' }}>-{fmtRs(totals.munshi + totals.shortage)}</span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #cbd5e1', paddingTop: '16px' }}>
              <span style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>Final Amount Paid</span>
              <span style={{ fontSize: '24px', fontWeight: '900', color: '#10b981' }}>{fmtRs(totals.paid)}</span>
            </div>
          </div>
          
          <div style={{ textAlign: 'center', marginTop: '30px', color: '#94a3b8', fontSize: '12px' }}>
            This is an automatically generated receipt. <br/> Do not reply to this link.
          </div>

        </div>
      </div>
    </div>
  );
}
