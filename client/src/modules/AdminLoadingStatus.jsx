import React, { useState, useEffect } from 'react';
import api from '../api';
import { Truck, RefreshCw, Edit2, Cloud, CloudRain, Sun, Thermometer, Clock, QrCode, Smartphone, X } from 'lucide-react';

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
      <div style={{ height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden', marginBottom: '4px' }}>
        <div style={{ 
          width: `${width}%`, height: '100%', background: color, 
          transition: 'width 0.5s ease-out',
          boxShadow: isStarted ? `0 0 10px ${color}44` : 'none'
        }} />
      </div>
    </div>
  );
};

export default function AdminLoadingStatus({ globalWeather, role = 'user' }) {
  const [brand, setBrand] = useState('jksuper');
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [showQR, setShowQR] = useState(false);
  const city = 'Jharli, Jhajjar, Haryana';

  // Map globalWeather properties required by the local view
  const weather = {
    temp: globalWeather?.temp || 25,
    cond: globalWeather?.cond || 'Clear',
    advice: globalWeather?.advice || 'Loading weather...',
    isRain: globalWeather?.code >= 1063 && globalWeather?.code <= 1246
  };

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
    const tickInt = setInterval(() => setNow(Date.now()), 1000); // Live second tick
    const fetchInt = setInterval(() => fetchReceipts(true), 10000); // 10s data sync
    return () => { clearInterval(tickInt); clearInterval(fetchInt); };
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
      
      {/* QR Code Popup Modal */}
      {showQR && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setShowQR(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '24px', maxWidth: '320px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', textAlign: 'center', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}>
                 <Smartphone size={20} color="var(--primary)" /> Scan to Open
              </div>
              <button onClick={() => setShowQR(false)} style={{ background: 'var(--bg)', border: 'none', borderRadius: '50%', padding: '6px', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: '12px', display: 'inline-block', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
               <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.origin + '/loading-status')}`} alt="QR Code" style={{ display: 'block', width: '200px', height: '200px' }} />
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>Scan this QR code with any smartphone camera to instantly open the public real-time driver tracking portal.</p>
          </div>
        </div>
      )}

      {/* Weather Alert Header */}
      {weather.isRain && (
        <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#dc2626', padding: '12px 20px', borderRadius: '12px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '15px', animation: 'pulse 2s infinite' }}>
          <CloudRain size={24} />
          <div>
            <div style={{ fontWeight: 800, fontSize: '15px' }}>⚠️ WEATHER ALERT: POTENTIAL LOADING DELAY</div>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>Rain detected in Ahmedabad. Please ensure all material and trucks are covered.</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text)' }}>
            <Truck /> Live Loading Overview
            <span style={{ height: '20px', width: '1px', background: 'var(--border)', margin: '0 4px' }} />
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600, color: 'var(--text-sub)' }}>
              {weather.isRain ? <CloudRain size={16} color="var(--danger)" /> : (weather.temp > 30 ? <Sun size={16} color="#fbbf24" /> : <Cloud size={16} />)}
              {weather.temp}°C • Jharli, Haryana
            </span>
          </h2>
          <span style={{ fontSize: '11px', fontWeight: 800, color: weather.isRain ? 'var(--danger)' : 'var(--accent)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {weather.advice}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowQR(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '6px', border: '1px solid var(--primary)', background: 'var(--primary)', color: 'white', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
            <QrCode size={16} /> Share QR
          </button>
          <select value={brand} onChange={e => setBrand(e.target.value)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontWeight: 'bold' }}>
            <option value="jksuper">JK Super</option>
            <option value="jklakshmi">JK Lakshmi</option>
          </select>
          <button onClick={fetchReceipts} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
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
        <div className="tbl-wrap" style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'rgba(0,0,0,0.02)' }}>
                <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', width: '40px' }}>#</th>
                <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vehicle</th>
                <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>LR No</th>
                <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Material</th>
                <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Quantity</th>
                <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Visual Status</th>
                <th style={{ padding: '16px', fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Duration</th>
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
                const isLoaded = r.status === 'Loaded';

                return (
                  <tr key={r.id} style={{ 
                    borderBottom: '1px solid var(--border)', 
                    transition: 'background 0.2s', 
                    opacity: isLoaded ? 0.6 : 1,
                    backgroundColor: isLoaded ? 'rgba(0,0,0,0.01)' : 'transparent',
                    ':hover': { background: 'rgba(0,0,0,0.01)' } 
                  }}>
                    <td style={{ padding: '16px', fontWeight: 'bold', color: 'var(--text-muted)' }}>{index + 1}</td>
                    <td style={{ padding: '16px', fontWeight: 'bold', color: 'var(--text)', fontSize: '15px' }}>{r.truckNo}</td>
                    <td style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: '600' }}>{r.lrNo}</td>
                    <td style={{ padding: '16px', color: 'var(--text)' }}>{r.material}</td>
                    <td style={{ padding: '16px', fontWeight: 'bold', color: 'var(--text)' }}>{r.totalBags} Bags</td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <ProgressBar status={r.status} startedAt={r.startedAt} loadedAt={r.loadedAt} now={now} />
                        <span style={{ fontSize: '11px', fontWeight: 800, color: prog.color, letterSpacing: '0.05em' }}>{prog.label.toUpperCase()}</span>
                      </div>
                    </td>
                    <td style={{ padding: '16px' }}>
                      {r.startedAt ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isLoaded ? 'var(--text-muted)' : 'var(--primary)', fontWeight: 700, fontSize: '13px' }}>
                          <Clock size={14} />
                          {(() => {
                            const start = new Date(r.startedAt).getTime();
                            const end = r.loadedAt ? new Date(r.loadedAt).getTime() : now;
                            const diffMs = Math.max(0, end - start);
                            
                            const hrs = Math.floor(diffMs / 3600000);
                            const mins = Math.floor((diffMs % 3600000) / 60000);
                            const secs = Math.floor((diffMs % 60000) / 1000);
                            
                            const timeStr = `${hrs > 0 ? hrs + 'h ' : ''}${mins}m ${secs}s`;
                            return isLoaded ? `${timeStr} (Total)` : `${timeStr} ...`;
                          })()}
                        </div>
                      ) : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>}
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      {role === 'admin' ? (
                        editingId === r.id ? (
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
                        )
                      ) : (
                        <span style={{ fontSize: '11px', fontWeight: 800, color: prog.color, background: `${prog.color}11`, padding: '4px 10px', borderRadius: '20px', border: `1px solid ${prog.color}33` }}>
                          {prog.label.toUpperCase()}
                        </span>
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
