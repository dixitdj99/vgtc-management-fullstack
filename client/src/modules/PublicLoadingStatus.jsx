import React, { useState, useEffect } from 'react';
import api from '../api';
import { Truck, Package, CheckCircle, Clock, RefreshCw } from 'lucide-react';

export default function PublicLoadingStatus() {
  const [brand, setBrand] = useState('jksuper');
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReceipts = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const endpoint = brand === 'jklakshmi' ? '/jkl/lr' : '/lr';
      const res = await api.get(endpoint);
      
      // Filter for today's data only
      const today = new Date().toISOString().split('T')[0];
      const todaysData = res.data.filter(r => {
        const rDate = r.date ? r.date.split('T')[0] : '';
        return rDate === today;
      }).reverse();
      
      setReceipts(todaysData);
    } catch (error) {
      console.error('Failed to fetch loading receipts:', error);
      if (!silent) alert('Network error while fetching receipts.');
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
    } catch (error) {
      console.error('Update failed:', error);
      alert('Failed to update status. Please try again.');
    }
  };

  return (
    <div style={{ backgroundColor: '#f8fafc', height: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#1e293b', color: 'white', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', position: 'sticky', top: 0, zIndex: 10 }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Truck /> Loading Status Updates
        </h1>
        
        {/* Brand Selector */}
        <div style={{ display: 'flex', gap: '8px', background: '#334155', padding: '4px', borderRadius: '8px' }}>
          <button 
            onClick={() => setBrand('jksuper')}
            style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px',
              backgroundColor: brand === 'jksuper' ? '#6366f1' : 'transparent', 
              color: brand === 'jksuper' ? 'white' : '#94a3b8', transition: 'all 0.2s', cursor: 'pointer' }}>
            JK Super
          </button>
          <button 
            onClick={() => setBrand('jklakshmi')}
            style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px',
              backgroundColor: brand === 'jklakshmi' ? '#f59e0b' : 'transparent', 
              color: brand === 'jklakshmi' ? 'white' : '#94a3b8', transition: 'all 0.2s', cursor: 'pointer' }}>
            JK Lakshmi
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '16px', paddingBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '16px', color: '#475569' }}>Today's Vehicles</h2>
          <button onClick={fetchReceipts} style={{ background: 'none', border: 'none', color: '#6366f1', padding: '8px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading Data...</div>
        ) : receipts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', background: 'white', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
            No vehicle loadings found for today.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {receipts.map((r, index) => {
              const isLoaded = r.status === 'Loaded';
              return (
                <div key={r.id} style={{ 
                  background: 'white', 
                  borderRadius: '12px', 
                  padding: isLoaded ? '12px 16px' : '16px', 
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)', 
                  border: isLoaded ? '1px solid #d1fae5' : '1px solid #e2e8f0',
                  opacity: isLoaded ? 0.9 : 1
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: isLoaded ? '0' : '12px', alignItems: 'center' }}>
                    <div style={{ fontSize: isLoaded ? '16px' : '18px', fontWeight: 'bold', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ backgroundColor: isLoaded ? '#d1fae5' : '#f1f5f9', color: isLoaded ? '#065f46' : '#475569', padding: '3px 6px', borderRadius: '6px', fontSize: '12px' }}>#{index + 1}</span>
                      {r.truckNo || 'Unknown Vehicle'}
                    </div>
                    {isLoaded ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981', fontSize: '13px', fontWeight: '700' }}>
                        <CheckCircle size={16} /> Loaded
                        <button onClick={() => updateStatus(r.id, 'Started')} style={{ marginLeft: '8px', padding: '4px 8px', borderRadius: '4px', background: '#f1f5f9', border: 'none', fontSize: '10px', color: '#64748b', cursor: 'pointer' }}>Edit</button>
                      </div>
                    ) : (
                      <div style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}>LR: {r.lrNo}</div>
                    )}
                  </div>
                  
                  {!isLoaded && (
                    <>
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Material</div>
                          <div style={{ fontSize: '14px', color: '#334155', fontWeight: '600' }}>{r.material || 'N/A'}</div>
                        </div>
                        <div style={{ flex: 1, borderLeft: '1px solid #e2e8f0', paddingLeft: '12px' }}>
                          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Quantity</div>
                          <div style={{ fontSize: '14px', color: '#334155', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Package size={14}/> {r.totalBags || 0} Bags
                          </div>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '10px', color: r.status === 'Started' ? '#3b82f6' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Current Status: {r.status || 'Pending'}
                        </div>
                        
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            onClick={() => updateStatus(r.id, 'Started')}
                            disabled={r.status === 'Started'}
                            style={{ 
                              flex: 1, padding: '12px', border: 'none', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                              backgroundColor: r.status === 'Started' ? '#f1f5f9' : '#3b82f6',
                              color: r.status === 'Started' ? '#94a3b8' : 'white', cursor: r.status === 'Started' ? 'not-allowed' : 'pointer', fontSize: '14px'
                            }}>
                            <Clock size={16} /> Started
                          </button>
                          <button 
                            onClick={() => updateStatus(r.id, 'Loaded')}
                            style={{ 
                              flex: 1, padding: '12px', border: 'none', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                              backgroundColor: '#10b981', color: 'white', fontSize: '14px', cursor: 'pointer'
                            }}>
                            <CheckCircle size={16} /> Loaded
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
