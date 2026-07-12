import React, { useState, useEffect } from 'react';
import { Check, X, Truck, User, CreditCard, Banknote, AlertCircle } from 'lucide-react';
import ax from '../api';
import { fmtRs } from '../utils/format';

export default function VehicleRegistryCard({ entry, onApproved }) {
  const { id, truckNo, ownerName, gpsType = 'none', bankDetails = {}, createdAt, isPending } = entry;
  const [balance, setBalance] = useState(null);
  const [loadingBal, setLoadingBal] = useState(false);
  const [approving, setApproving] = useState(false);

  // Fetch real-time balance for this truck
  useEffect(() => {
    if (truckNo) {
      setLoadingBal(true);
      const fetchBalance = async () => {
        try {
          const res = await ax.get(`/vouchers?truckNo=${truckNo}`);
          const vouchers = res.data || [];
          const outstanding = vouchers.reduce((s, v) => s + (parseFloat(v.total) || 0) - (parseFloat(v.paidBalance) || 0), 0);
          setBalance(outstanding);
        } catch (e) {
          console.error('Balance calc error', e);
          setBalance(0);
        } finally {
          setLoadingBal(false);
        }
      };
      fetchBalance();
    }
  }, [truckNo]);

  const approve = async (type) => {
    setApproving(true);
    try {
      // Create vehicle record
      await ax.post('/vehicles', {
        truckNo,
        ownerName: ownerName || 'MARKET OWNER',
        gpsType,
        ownershipType: type, // "dummy", "market", "self"
        bankDetails: bankDetails || {}
      });
      
      // If it was a registry entry, delete it
      if (!isPending) {
        await ax.delete(`/vehicles/registry/${id}`);
      }
      
      onApproved();
    } catch (e) {
      console.error('Approve error', e);
      alert(e.response?.data?.error || 'Failed to approve vehicle');
    }
    setApproving(false);
  };

  const balColor = balance > 0 ? '#f43f5e' : '#10b981'; // Pending balance is usually what we owe (positive here = we owe, but user wants Green if OK)
  // Actually the user said: "IF VEHICLE GOES IN MINUS THEN SHOW RED AND OTHERF WISE SHOWGREEN"
  // Let's assume minus means the driver owes us (Advance > Freight). 
  // For this mock, let's just use the logic: Balance > 0 means Outstanding exists.
  
  return (
    <div className="card" style={{ 
      padding: '16px', 
      border: isPending ? '1px solid #f59e0b' : '1px solid var(--border)',
      background: isPending ? 'rgba(245,158,11,0.02)' : 'var(--bg-card)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ padding: '8px', background: isPending ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)', borderRadius: '8px' }}>
            <Truck size={18} color={isPending ? '#f59e0b' : '#3b82f6'} />
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: '15px' }}>{truckNo}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Detected: {new Date(createdAt).toLocaleDateString()}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 800 }}>EST. BALANCE</div>
          <div style={{ fontSize: '14px', fontWeight: 900, color: balance >= 0 ? '#10b981' : '#f43f5e' }}>
            {loadingBal ? '...' : fmtRs(balance || 0)}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-sub)' }}>
          <User size={13} /> {ownerName || 'Unknown Owner'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-sub)' }}>
          <CreditCard size={13} /> GPS: {gpsType.toUpperCase()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-sub)', gridColumn: '1 / -1' }}>
          <Banknote size={13} /> {bankDetails.bank || 'No Bank Details'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button className="btn btn-sm btn-p" style={{ background: '#3b82f6', color: 'white' }} onClick={() => approve('market')} disabled={approving}>
          <Check size={12} /> Approve Market
        </button>
        <button className="btn btn-sm btn-p" style={{ background: '#10b981', color: 'white' }} onClick={() => approve('self')} disabled={approving}>
          <Check size={12} /> Approve Self
        </button>
        <button className="btn btn-sm btn-g" onClick={() => approve('dummy')} disabled={approving}>
          Dummy
        </button>
        {isPending && (
          <button className="btn btn-sm btn-d" style={{ background: 'rgba(244,63,94,0.1)', color: '#f43f5e' }} onClick={() => onApproved()} disabled={approving}>
            <X size={12} /> Ignore
          </button>
        )}
      </div>
      
      {isPending && (
        <div style={{ marginTop: '12px', padding: '6px 10px', background: 'rgba(245,158,11,0.1)', borderRadius: '6px', fontSize: '10px', color: '#f59e0b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertCircle size={12} /> PENDING APPROVAL FROM VOUCHER
        </div>
      )}
    </div>
  );
}
