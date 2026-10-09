import React, { useEffect, useMemo, useState } from 'react';
import { Edit2, Search, Truck, X } from 'lucide-react';
import ax from '../api';
import TruckLoader from '../components/TruckLoader';

const emptyForm = {
    name: '', fatherName: '', address: '', mobileNumbers: [''], vehicleNo: '', vehicleType: 'Trailer',
    licenseNumber: '', licenseExpiry: '', fixedSalary: '', dateJoined: '', dateExit: ''
};

const fieldStyle = { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)' };
const labelStyle = { display: 'grid', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' };

export default function DriverMasterModule({ role, permissions }) {
    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [showFormer, setShowFormer] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const canEdit = role === 'admin' || role === 'superadmin' || ['edit', 'delete'].includes(permissions?.vehicle);

    const reload = async () => {
        try {
            const { data } = await ax.get('/profiles');
            setProfiles(Array.isArray(data) ? data : []);
            setError('');
        } catch (err) {
            setError(err.response?.data?.error || 'Could not load drivers.');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { reload(); }, []);

    const drivers = useMemo(() => profiles.filter(p => p.type === 'Driver' && (showFormer || !p.dateExit) &&
        [p.name, p.licenseNumber, p.vehicleNo, p.phone, p.mobile, ...(p.mobileNumbers || [])].some(v => String(v || '').toLowerCase().includes(search.toLowerCase()))
    ).sort((a, b) => (a.name || '').localeCompare(b.name || '')), [profiles, search, showFormer]);

    const openEdit = (profile) => {
        setEditing(profile);
        setForm({ ...emptyForm, ...profile, mobileNumbers: (profile.mobileNumbers?.length ? profile.mobileNumbers : [profile.mobile || profile.phone || '']).map(String) });
        setError('');
    };

    const save = async (event) => {
        event.preventDefault();
        if (!editing || saving) return;
        if (form.dateExit && form.dateJoined && form.dateExit < form.dateJoined) { setError('Exit date cannot precede joining date.'); return; }
        setSaving(true);
        setError('');
        try {
            const payload = {
                name: form.name.trim(), fatherName: form.fatherName.trim(), address: form.address.trim(),
                mobileNumbers: form.mobileNumbers.map(v => v.trim()).filter(Boolean),
                mobile: form.mobileNumbers[0]?.trim() || '', phone: form.mobileNumbers[0]?.trim() || '',
                vehicleNo: form.vehicleNo.trim().toUpperCase(), vehicleType: form.vehicleType,
                licenseNumber: form.licenseNumber.trim().toUpperCase(), licenseExpiry: form.licenseExpiry,
                fixedSalary: Number(form.fixedSalary) || 0, dateJoined: form.dateJoined, dateExit: form.dateExit
            };
            await ax.patch(`/profiles/${editing.id}/driver-master`, payload);
            setProfiles(prev => prev.map(p => p.id === editing.id ? { ...p, ...payload } : p));
            setEditing(null);
        } catch (err) {
            setError(err.response?.data?.error || 'Could not save driver.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <TruckLoader size={120} text="Loading drivers..." />;

    return <div style={{ paddingBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
            <div style={{ background: 'var(--primary)', color: 'white', borderRadius: 12, padding: 12 }}><Truck size={24} /></div>
            <div><h2 style={{ margin: 0 }}>Driver Master</h2><div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Driver records shared with Staff Profiles</div></div>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                <Search size={16} /><input aria-label="Search drivers" placeholder="Search driver, licence, truck" value={search} onChange={e => setSearch(e.target.value)} style={{ border: 0, background: 'transparent', color: 'var(--text)', outline: 'none', minWidth: 230 }} />
            </label>
            <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={showFormer} onChange={e => setShowFormer(e.target.checked)} /> Show former drivers</label>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{drivers.length} drivers</span>
        </div>
        {error && <div role="alert" style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-card)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900, fontSize: 13 }}>
                <thead><tr style={{ background: 'var(--bg)', textAlign: 'left' }}>{['Driver', 'Licence number', 'Licence expiry', 'Joined', 'Truck', 'Monthly salary', 'Mobile', 'Status', ''].map(h => <th key={h} style={{ padding: '13px 12px', borderBottom: '1px solid var(--border)' }}>{h}</th>)}</tr></thead>
                <tbody>{drivers.map(p => <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 12, fontWeight: 700 }}>{p.name || '—'}</td>
                    <td style={{ padding: 12 }}>{p.licenseNumber || '—'}</td>
                    <td style={{ padding: 12, color: p.licenseExpiry && p.licenseExpiry < new Date().toISOString().slice(0, 10) ? 'var(--danger)' : 'inherit' }}>{p.licenseExpiry || '—'}</td>
                    <td style={{ padding: 12 }}>{p.dateJoined || '—'}</td><td style={{ padding: 12 }}>{p.vehicleNo || '—'}</td>
                    <td style={{ padding: 12 }}>₹{Number(p.fixedSalary || 0).toLocaleString('en-IN')}</td>
                    <td style={{ padding: 12 }}>{(p.mobileNumbers || []).join(', ') || p.mobile || p.phone || '—'}</td>
                    <td style={{ padding: 12 }}>{p.dateExit ? 'Former' : 'Available'}</td>
                    <td style={{ padding: 12 }}>{canEdit && <button type="button" onClick={() => openEdit(p)} style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}><Edit2 size={14} /> Edit</button>}</td>
                </tr>)}</tbody>
            </table>
            {!drivers.length && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No drivers found. Add driver in Admin → Staff Profiles.</div>}
        </div>
        {editing && <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null); }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.65)', display: 'grid', placeItems: 'center', padding: 16 }}>
            <form onSubmit={save} style={{ background: 'var(--bg-card)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: 'min(680px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}><h3 style={{ margin: 0 }}>Edit driver</h3><button type="button" aria-label="Close" onClick={() => setEditing(null)} style={{ background: 'none', border: 0, color: 'var(--text)', cursor: 'pointer' }}><X size={20} /></button></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
                    {[
                        ['name', 'Driver name', 'text', true], ['fatherName', 'Father name'], ['licenseNumber', 'Licence number'],
                        ['licenseExpiry', 'Licence expiry', 'date'], ['dateJoined', 'Joining date', 'date'], ['dateExit', 'Exit date', 'date'],
                        ['vehicleNo', 'Vehicle number'], ['fixedSalary', 'Monthly salary (₹)', 'number']
                    ].map(([key, label, type = 'text', required = false]) => <label key={key} style={labelStyle}>{label}<input type={type} required={required} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} value={form[key] ?? ''} onChange={e => setForm({ ...form, [key]: e.target.value })} style={fieldStyle} /></label>)}
                    <label style={labelStyle}>Vehicle type<select value={form.vehicleType} onChange={e => setForm({ ...form, vehicleType: e.target.value })} style={fieldStyle}><option>Trailer</option><option>Canter</option></select></label>
                    <label style={labelStyle}>Mobile numbers (comma separated)<input value={form.mobileNumbers.join(', ')} onChange={e => setForm({ ...form, mobileNumbers: e.target.value.split(',') })} style={fieldStyle} /></label>
                    <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Address<textarea rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={fieldStyle} /></label>
                </div>
                {error && <div role="alert" style={{ color: 'var(--danger)', marginTop: 14 }}>{error}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}><button type="button" onClick={() => setEditing(null)}>Cancel</button><button type="submit" disabled={saving} style={{ background: 'var(--primary)', color: 'white', border: 0, borderRadius: 8, padding: '10px 18px', cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save driver'}</button></div>
            </form>
        </div>}
    </div>;
}
