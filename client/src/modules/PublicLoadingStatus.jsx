import React, { useState, useEffect } from 'react';
import api from '../api';
import { Truck, Package, CheckCircle, Clock, RefreshCw, Smartphone, X, Share, MoreVertical, Download } from 'lucide-react';

const ProgressBar = ({ status, startedAt, loadedAt, now }) => {
  const isLoaded = status === 'Loaded';
  const isStarted = status === 'Started';
  
  const getWidth = () => {
    if (isLoaded) return 100;
    if (isStarted && startedAt) {
      const start = new Date(startedAt).getTime();
      const elapsed = Math.floor((now - start) / 60000);
      // Creep from 15% to 95% over 30 minutes
      return Math.min(95, 15 + (elapsed * 2.5)); 
    }
    return 10;
  };

  const width = getWidth();
  const color = isLoaded ? '#10b981' : (isStarted ? '#3b82f6' : '#94a3b8');

  return (
    <div style={{ width: '100%', maxWidth: '140px' }}>
      <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '4px' }}>
        <div style={{ 
          width: `${width}%`, height: '100%', background: color, 
          transition: 'width 0.5s ease-out',
          boxShadow: isStarted ? `0 0 10px ${color}44` : 'none'
        }} />
      </div>
    </div>
  );
};

export default function PublicLoadingStatus() {
  const [brand, setBrand] = useState('jksuper');
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [now, setNow] = useState(Date.now());

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
    const tickInt = setInterval(() => setNow(Date.now()), 1000); // 1s tick for duration
    const interval = setInterval(() => fetchReceipts(true), 10000); // 10s data sync
    return () => { clearInterval(tickInt); clearInterval(interval); };
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
      
      {/* Install Guide Modal */}
      {showInstallGuide && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setShowInstallGuide(false)}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', maxWidth: '360px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a', fontWeight: 'bold', fontSize: '18px' }}>
                 <Download size={20} color="#6366f1" /> Install App
              </div>
              <button onClick={() => setShowInstallGuide(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>
            
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#475569', lineHeight: '1.5' }}>Install this portal on your phone for quick one-tap access like a regular app!</p>

            <div style={{ marginBottom: '20px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}><Smartphone size={16} /> For Android (Chrome)</h4>
              <ol style={{ margin: 0, paddingLeft: '20px', color: '#475569', fontSize: '13px', lineHeight: '1.6' }}>
                <li>Tap the <strong>3-dots menu</strong> <MoreVertical size={12} style={{verticalAlign: 'middle'}}/> at the top right of your browser.</li>
                <li>Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>
                <li>Confirm by tapping <strong>Add</strong>.</li>
              </ol>
            </div>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}><Smartphone size={16} /> For iPhone (Safari)</h4>
              <ol style={{ margin: 0, paddingLeft: '20px', color: '#475569', fontSize: '13px', lineHeight: '1.6' }}>
                <li>Tap the <strong>Share</strong> button <Share size={12} style={{verticalAlign: 'middle'}}/> at the bottom of the screen.</li>
                <li>Scroll down and tap <strong>"Add to Home Screen"</strong> <span style={{fontSize: '14px'}}>+</span>.</li>
                <li>Confirm by tapping <strong>Add</strong> at the top right.</li>
              </ol>
            </div>
            
            <button onClick={() => setShowInstallGuide(false)} style={{ width: '100%', marginTop: '20px', background: '#6366f1', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' }}>Got it</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ backgroundColor: '#1e293b', color: 'white', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Truck /> Loading Status Updates
          </h1>
          <button onClick={() => setShowInstallGuide(true)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
            <Download size={14} /> Install
          </button>
        </div>
        
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
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Material</div>
                          <div style={{ fontSize: '14px', color: '#334155', fontWeight: '600' }}>{r.material || 'N/A'}</div>
                        </div>
                        <div style={{ flex: 1, borderLeft: '1px solid #e2e8f0', paddingLeft: '12px' }}>
                          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 'bold' }}>Progress</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                            <ProgressBar status={r.status} startedAt={r.startedAt} loadedAt={r.loadedAt} now={now} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 800, color: r.status === 'Started' ? '#3b82f6' : '#94a3b8' }}>
                               <Clock size={10} /> 
                               {r.startedAt ? (() => {
                                  const start = new Date(r.startedAt).getTime();
                                  const end = r.loadedAt ? new Date(r.loadedAt).getTime() : now;
                                  const diffMs = Math.max(0, end - start);
                                  const mins = Math.floor(diffMs / 60000);
                                  const secs = Math.floor((diffMs % 60000) / 1000);
                                  return `${mins}m ${secs}s`;
                               })() : 'Pending'}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '10px', color: r.status === 'Started' ? '#3b82f6' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Update Status: {r.status || 'Pending'}
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
