import React, { useMemo, useState } from 'react';
import ax from '../api';

export const RENEWAL_TYPES = ['pollution', 'fitness', 'insurance'];
export const emptyRenewal = () => ({ documentType: 'pollution', paidOn: new Date().toISOString().slice(0, 10), validFrom: '', expiresOn: '', amount: '', paymentMethod: '', reference: '', notes: '' });

export const parseVehicleDocs = raw => {
    if (raw && typeof raw === 'object') return raw;
    try { return JSON.parse(raw || '{}') || {}; } catch { return {}; }
};

export function allDocumentRenewals(vehicles = []) {
    return vehicles.flatMap(vehicle => (vehicle.documentRenewals || []).map(record => ({ ...record, truckNo: vehicle.truckNo, vehicleId: vehicle.id })))
        .sort((a, b) => `${b.paidOn || ''}${b.createdAt || ''}`.localeCompare(`${a.paidOn || ''}${a.createdAt || ''}`));
}

const label = type => type ? type[0].toUpperCase() + type.slice(1) : '';
const formatMoney = amount => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

export function RenewalFields({ value, onChange }) {
    const set = (key, next) => onChange({ ...value, [key]: next });
    return <div className="fg fg-3">
        <div className="field-h"><label>Document</label><select className="fi" value={value.documentType} onChange={e => set('documentType', e.target.value)}>{RENEWAL_TYPES.map(type => <option key={type} value={type}>{label(type)}</option>)}</select></div>
        <div className="field-h"><label>Amount paid (₹)</label><input className="fi" type="number" min="0" step="0.01" required value={value.amount} onChange={e => set('amount', e.target.value)} /></div>
        <div className="field-h"><label>Payment date</label><input className="fi" type="date" required value={value.paidOn} onChange={e => set('paidOn', e.target.value)} /></div>
        <div className="field-h"><label>Valid from</label><input className="fi" type="date" required value={value.validFrom} onChange={e => set('validFrom', e.target.value)} /></div>
        <div className="field-h"><label>Next renewal / expiry</label><input className="fi" type="date" min={value.validFrom || undefined} required value={value.expiresOn} onChange={e => set('expiresOn', e.target.value)} /></div>
        <div className="field-h"><label>Payment method</label><select className="fi" value={value.paymentMethod} onChange={e => set('paymentMethod', e.target.value)}><option value="">Select method</option><option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Card</option><option>Other</option></select></div>
        <div className="field-h"><label>Receipt / reference</label><input className="fi" value={value.reference} onChange={e => set('reference', e.target.value)} /></div>
        <div className="field-h"><label>Notes</label><input className="fi" value={value.notes} onChange={e => set('notes', e.target.value)} /></div>
    </div>;
}

export default function VehicleDocumentRenewals({ vehicles = [], onSaved, compact = false, canEdit = true }) {
    const [vehicleId, setVehicleId] = useState('');
    const [form, setForm] = useState(emptyRenewal);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);
    const records = useMemo(() => allDocumentRenewals(vehicles), [vehicles]);
    const today = new Date().toISOString().slice(0, 10);
    const alerts = useMemo(() => vehicles.flatMap(vehicle => RENEWAL_TYPES.map(type => ({ vehicle, type, expiry: parseVehicleDocs(vehicle.docs)[type] })))
        .filter(row => row.expiry && row.expiry <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10))
        .sort((a, b) => a.expiry.localeCompare(b.expiry)), [vehicles]);

    const submit = async event => {
        event.preventDefault();
        if (!vehicleId) { setError('Select vehicle'); return; }
        if (form.expiresOn <= form.validFrom) { setError('Next renewal must be after valid-from date'); return; }
        setSaving(true); setError('');
        try {
            await ax.post(`/vehicles/${encodeURIComponent(vehicleId)}/document-renewals`, { ...form, amount: Number(form.amount) }, { _requireOnline: true });
            setForm(emptyRenewal()); setShowForm(false);
            await onSaved?.();
        } catch (err) { setError(err.response?.data?.error || 'Could not save renewal'); }
        finally { setSaving(false); }
    };

    return <div className="card" style={{ marginBottom: '16px' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div className="card-title-block"><div className="card-title-text"><h3>Document renewals & payments</h3><p>Pollution, Fitness and Insurance · {alerts.length} due within 30 days</p></div></div>
            {canEdit && <button type="button" className="btn btn-p btn-sm" onClick={() => setShowForm(open => !open)}>{showForm ? 'Close' : 'Update document status'}</button>}
        </div>
        {showForm && canEdit && <form onSubmit={submit} style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
            <div className="field-h" style={{ marginBottom: '12px' }}><label>Vehicle</label><select className="fi" required value={vehicleId} onChange={e => setVehicleId(e.target.value)}><option value="">Select vehicle</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.truckNo}</option>)}</select></div>
            <RenewalFields value={form} onChange={setForm} />
            {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
            <button type="submit" className="btn btn-p" disabled={saving} style={{ marginTop: '12px' }}>{saving ? 'Saving...' : 'Save renewal & payment'}</button>
        </form>}
        {alerts.length > 0 && <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>{alerts.slice(0, compact ? 6 : 30).map(row => <span key={`${row.vehicle.id}-${row.type}`} style={{ padding: '5px 8px', borderRadius: '6px', background: row.expiry < today ? 'rgba(239,68,68,.12)' : 'rgba(245,158,11,.12)', color: row.expiry < today ? '#ef4444' : '#f59e0b', fontSize: '11px', fontWeight: 700 }}>{row.vehicle.truckNo} · {label(row.type)} · {row.expiry}</span>)}</div>}
        {!compact && <div style={{ overflowX: 'auto' }}><table className="data-table" style={{ width: '100%' }}><thead><tr><th>Paid on</th><th>Vehicle</th><th>Document</th><th>Valid period</th><th>Paid</th><th>Method</th><th>Receipt / notes</th></tr></thead><tbody>{records.map(r => <tr key={r.id}><td>{r.paidOn}</td><td>{r.truckNo}</td><td>{label(r.documentType)}</td><td>{r.validFrom} → {r.expiresOn}</td><td>{formatMoney(r.amount)}</td><td>{r.paymentMethod || '—'}</td><td>{[r.reference, r.notes].filter(Boolean).join(' · ') || '—'}</td></tr>)}{records.length === 0 && <tr><td colSpan="7" style={{ textAlign: 'center', padding: '24px' }}>No renewal payments recorded</td></tr>}</tbody></table></div>}
    </div>;
}
