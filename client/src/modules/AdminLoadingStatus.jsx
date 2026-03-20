import React, { useState, useEffect } from 'react';
import api from '../api';
import { Truck, RefreshCw, Edit2 } from 'lucide-react';

export default function AdminLoadingStatus() {
  const [brand, setBrand] = useState('jksuper');
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);

  const fetchReceipts = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const endpoint = brand === 'jklakshmi' ? '/jkl/lr' : '/lr';
      const res = await api.get(endpoint);
      const today = new Date().toISOString().split('T')[0];
      setReceipts(res.data.filter(r => r.date && r.date.split('T')[0] === today).reverse());
    } catch (error) {
      console.error('Failed to fetch:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { 
    fetchReceipts(); 
    const interval = setInterval(() => fetchReceipts(true), 5000);
    return () => clearInterval(interval);
  }, [brand]);

  const updateStatus = async (id, newStatus) => {
    try {
      const endpoint = brand === 'jklakshmi' ? `/jkl/lr/${id}` : `/lr/${id}`;
      await api.patch(endpoint, { status: newStatus });
      setReceipts(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
      setEditingId(null);
    } catch (error) {
      console.error('Update failed:', error);
      alert('Failed to update. Please try again.');
    }
  };

  return (
    <div className="module-content" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}>
          <Truck /> Live Loading Overview
        </h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <select value={brand} onChange={e => setBrand(e.target.value)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontWeight: 'bold' }}>
            <option value="jksuper">JK Super</option>
            <option value="jklakshmi">JK Lakshmi</option>
          </select>
          <button onClick={fetchReceipts} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading real-time status...</div>
      ) : receipts.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: '12px', border: '1px dashed var(--border)' }}>
          No loading orders found for today.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'rgba(0,0,0,0.02)' }}>
                <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', width: '40px' }}>#</th>
                <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vehicle</th>
                <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>LR No</th>
                <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Material</th>
                <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Quantity</th>
                <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', width: '30%' }}>Status Progress</th>
                <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r, index) => {
                const getProgress = () => {
                  if (r.status === 'Loaded') return { width: '100%', color: '#10b981', label: 'Loaded' };
                  if (r.status === 'Started') return { width: '50%', color: '#3b82f6', label: 'Started' };
                  return { width: '10%', color: '#94a3b8', label: 'Pending' };
                };
                const prog = getProgress();

                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s', ':hover': { background: 'rgba(0,0,0,0.01)' } }}>
                    <td style={{ padding: '16px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{index + 1}</td>
                    <td style={{ padding: '16px', fontWeight: 'bold', color: 'var(--text)', fontSize: '15px' }}>{r.truckNo}</td>
                    <td style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '600' }}>{r.lrNo}</td>
                    <td style={{ padding: '16px', color: 'var(--text)' }}>{r.material}</td>
                    <td style={{ padding: '16px', fontWeight: 'bold', color: 'var(--text)' }}>{r.totalBags} Bags</td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ flex: 1, height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: prog.width, background: prog.color, height: '100%', transition: 'all 0.4s ease' }} />
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: prog.color, minWidth: '60px' }}>{prog.label}</span>
                      </div>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      {editingId === r.id ? (
                        <select 
                          onChange={(e) => updateStatus(r.id, e.target.value)} 
                          onBlur={() => setEditingId(null)}
                          defaultValue={r.status || 'Pending'}
                          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--primary)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                          <option value="Pending">Pending</option>
                          <option value="Started">Started</option>
                          <option value="Loaded">Loaded</option>
                        </select>
                      ) : (
                        <button onClick={() => setEditingId(r.id)} style={{ background: 'none', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', transition: 'all 0.2s' }}>
                          <Edit2 size={14}/> Override
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
