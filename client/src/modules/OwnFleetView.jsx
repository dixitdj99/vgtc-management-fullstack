import React, { useEffect, useMemo, useState } from 'react';
import { Search, Truck } from 'lucide-react';
import ax from '../api';
import TruckLoader from '../components/TruckLoader';
import { isOwnFleetVehicle } from '../utils/vehicleUtils';
import VehicleDocumentRenewals from '../components/VehicleDocumentRenewals';
import FleetMaintenanceList from '../components/FleetMaintenanceList';
import { useAuth } from '../auth/AuthContext';

const parseObject = (value) => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}'); } catch { return {}; }
};

const displayDate = (value) => value
  ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

export default function OwnFleetView({ initialTab = 'fleet' }) {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(initialTab === 'maintenance' ? 'maintenance' : 'fleet');
  useEffect(() => { setTab(initialTab === 'maintenance' ? 'maintenance' : 'fleet'); }, [initialTab]);
  const refreshVehicles = async () => {
    const { data } = await ax.get('/vehicles');
    setVehicles((data || []).filter(isOwnFleetVehicle));
  };

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
          <p>Company-owned fleet, document status and renewal payments.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 16 }}>
        <button type="button" className={`tab-btn${tab === 'fleet' ? ' tab-amber' : ''}`} onClick={() => setTab('fleet')}>Vehicles & documents</button>
        <button type="button" className={`tab-btn${tab === 'maintenance' ? ' tab-amber' : ''}`} onClick={() => setTab('maintenance')}>Maintenance</button>
      </div>

      {tab === 'maintenance' ? <FleetMaintenanceList vehicles={vehicles} canEdit={user?.role === 'admin' || ['edit', 'delete'].includes(user?.permissions?.vehicle)} /> : <>

      <VehicleDocumentRenewals vehicles={vehicles} onSaved={refreshVehicles} canEdit={user?.role === 'admin' || user?.role === 'superadmin' || ['edit', 'delete'].includes(user?.permissions?.vehicle)} />

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
      </>}
    </div>
  );
}
