import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Wrench } from 'lucide-react';
import ax from '../api';
import MaintenanceTracker from './MaintenanceTracker';

const cash = value => `₹${Number(value || 0).toLocaleString('en-IN')}`;

export default function FleetMaintenanceList({ vehicles = [], canEdit = true }) {
  const [services, setServices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const [serviceResult, alertResult] = await Promise.all([
        ax.get('/maintenance/services'),
        ax.get('/maintenance/alerts'),
      ]);
      setServices(Array.isArray(serviceResult.data) ? serviceResult.data : []);
      setAlerts(Array.isArray(alertResult.data) ? alertResult.data : []);
      setError('');
    } catch (err) { setError(err.response?.data?.error || 'Could not load maintenance records.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);
  const fleet = useMemo(() => vehicles.filter(v => !query || v.truckNo?.toLowerCase().includes(query.toLowerCase())), [vehicles, query]);
  const fleetNumbers = useMemo(() => new Set(vehicles.map(v => v.truckNo)), [vehicles]);
  const visibleServices = useMemo(() => services.filter(s => fleetNumbers.has(s.truckNo) && (!query || s.truckNo?.toLowerCase().includes(query.toLowerCase()) || s.serviceType?.toLowerCase().includes(query.toLowerCase()))), [services, query, fleetNumbers]);
  const visibleAlerts = alerts.filter(a => fleetNumbers.has(a.truckNo) && (!query || a.truckNo?.toLowerCase().includes(query.toLowerCase())));

  return <div className="card" style={{ padding: 20 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <div><h2 style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><Wrench size={20} /> Fleet Maintenance</h2><p style={{ color: 'var(--text-muted)', margin: '5px 0 0' }}>Truck parts, service costs and upcoming checks</p></div>
      <input className="fi" style={{ maxWidth: 260 }} placeholder="Search truck or service" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search maintenance" />
    </div>
    {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error} <button className="btn" onClick={reload}>Retry</button></p>}
    <h3 style={{ margin: '24px 0 10px' }}>Service reminders</h3>
    {loading ? <p>Loading maintenance…</p> : visibleAlerts.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 10 }}>{visibleAlerts.map((a, i) => <button key={`${a.truckNo}-${a.partName}-${i}`} onClick={() => setSelected(a.truckNo)} style={{ textAlign: 'left', padding: 14, borderRadius: 10, border: `1px solid ${a.status === 'OVERDUE' ? '#ef4444' : '#f59e0b'}`, background: 'var(--bg-input)', color: 'var(--text)', cursor: 'pointer' }}><strong><AlertTriangle size={14} /> {a.truckNo} · {a.partName || 'Service'}</strong><div>{a.status === 'OVERDUE' ? 'Overdue' : 'Due soon'}{a.nextServiceDate ? ` · ${a.nextServiceDate}` : ''}{a.nextServiceKm ? ` · ${Number(a.nextServiceKm).toLocaleString()} km` : ''}{a.currentKm ? ` (last recorded ${Number(a.currentKm).toLocaleString()} km)` : ''}</div></button>)}</div> : <p style={{ color: 'var(--text-muted)' }}>No overdue or upcoming service checks.</p>}
    <h3 style={{ margin: '24px 0 10px' }}>Truck maintenance</h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>{fleet.map(v => <button key={v.id || v.truckNo} onClick={() => setSelected(v.truckNo)} style={{ textAlign: 'left', padding: 14, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', cursor: 'pointer' }}><strong>{v.truckNo}</strong><div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{v.make} {v.model} · {services.filter(s => s.truckNo === v.truckNo).length} full services</div><div style={{ fontSize: 12, color: 'var(--primary)', marginTop: 8 }}>View parts and record service →</div></button>)}</div>
    {!fleet.length && <p style={{ color: 'var(--text-muted)' }}>No trucks found.</p>}
    <h3 style={{ margin: '24px 0 10px' }}>Recent service records</h3>
    {visibleServices.length ? <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr style={{ background: 'var(--bg-th)' }}>{['Date', 'Truck', 'Service', 'Workshop', 'Parts', 'Cost', 'Next check'].map(h => <th key={h} style={{ textAlign: 'left', padding: 10 }}>{h}</th>)}</tr></thead><tbody>{visibleServices.map(s => <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setSelected(s.truckNo)}><td style={{ padding: 10 }}>{s.date}</td><td>{s.truckNo}</td><td>{s.serviceType}</td><td>{s.workshop || '—'}</td><td>{(s.parts || []).map(p => p.partName).join(', ') || '—'}</td><td>{cash(s.totalCost)}</td><td>{s.nextServiceDate || '—'}{s.nextServiceKm ? ` · ${s.nextServiceKm} km` : ''}</td></tr>)}</tbody></table></div> : <p style={{ color: 'var(--text-muted)' }}>No full service records yet. Choose truck to add one.</p>}
    {selected && <MaintenanceTracker truckNo={selected} canEdit={canEdit} onClose={() => { setSelected(null); reload(); }} />}
  </div>;
}
