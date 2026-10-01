import React, { useEffect, useMemo, useState } from 'react';
import { Search, Truck } from 'lucide-react';
import ax from '../api';
import TruckLoader from '../components/TruckLoader';
import { isOwnFleetVehicle } from '../utils/vehicleUtils';

const parseObject = (value) => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}'); } catch { return {}; }
};

const displayDate = (value) => value
  ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

export default function OwnFleetView() {
  const [vehicles, setVehicles] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    ax.get('/vehicles')
      .then(({ data }) => { if (live) setVehicles((data || []).filter(isOwnFleetVehicle)); })
      .catch((err) => { if (live) setError(err.response?.data?.error || 'Could not load own fleet'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return vehicles;
    return vehicles.filter(v => [v.truckNo, v.vehicleType, v.make, v.model, v.driverName]
      .some(value => String(value || '').toLowerCase().includes(query)));
  }, [vehicles, search]);

  if (loading) return <TruckLoader size={130} text="Loading own fleet..." />;

  return (
    <div style={{ width: '100%' }}>
      <div className="page-hd">
        <div>
          <h1>Fleet Management</h1>
          <p>Permanent read-only view of complete company-owned fleet.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
        <div style={{ position: 'relative', maxWidth: '460px' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="fi" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vehicle, type, make, or driver" style={{ width: '100%', paddingLeft: 36 }} />
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-th)', borderBottom: '2px solid var(--border)' }}>
              {['Vehicle', 'Type / Make', 'Driver', 'Weights', 'Registration', 'Documents', 'GPS / FASTag'].map(label => (
                <th key={label} style={{ padding: '11px 13px', textAlign: 'left', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(vehicle => {
              const docs = parseObject(vehicle.docs);
              return (
                <tr key={vehicle.id || vehicle.truckNo} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: 13, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 900 }}><Truck size={14} color="#10b981" />{vehicle.truckNo}</div>
                    <div style={{ color: 'var(--text-muted)', marginTop: 3 }}>{vehicle.ownerName || 'Company owned'}</div>
                  </td>
                  <td style={{ padding: 13 }}><strong>{vehicle.vehicleType || '—'}</strong><div>{[vehicle.make, vehicle.model].filter(Boolean).join(' ') || '—'}</div></td>
                  <td style={{ padding: 13 }}><strong>{vehicle.driverName || 'Unassigned'}</strong><div>{vehicle.driverContact || '—'}</div></td>
                  <td style={{ padding: 13, whiteSpace: 'nowrap' }}>Gross: {vehicle.grossWeight || 0}<br />Unladen: {vehicle.unladenWeight || 0}</td>
                  <td style={{ padding: 13, whiteSpace: 'nowrap' }}>Registered: {displayDate(vehicle.regDate)}<br />Permit: {displayDate(docs.permit || vehicle.nationalPermitDate)}</td>
                  <td style={{ padding: 13, whiteSpace: 'nowrap' }}>Insurance: {displayDate(docs.insurance)}<br />Fitness: {displayDate(docs.fitness)}<br />PUC: {displayDate(docs.pollution)}</td>
                  <td style={{ padding: 13 }}><strong>{String(vehicle.gpsType || 'none').toUpperCase()}</strong><div>{vehicle.fastag || 'No FASTag ID'}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length && <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>No own-fleet vehicles found.</div>}
      </div>
    </div>
  );
}
