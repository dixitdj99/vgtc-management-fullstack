import React, { useState, useEffect } from 'react';
import ax from '../../api';
import { Briefcase, Plus, X, Trash2, Edit3, Phone, MapPin, Search, User, Tag } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';

/**
 * Firms & Vendors — tyre sellers, manual-entry vendors, and any other firm the
 * office deals with (spare parts, cranes, workshops…).
 *
 * These lived in Staff Profiles because they share the profiles collection,
 * which put "Tyre" in the same dropdown as "Driver" and mixed companies into a
 * screen about people. Staff Profiles now shows people only; firms are managed
 * here. Fixed kinds keep their historic type values ('Tyre', 'Manual') so the
 * tyre module and old records keep working; anything new is type 'Firm' with a
 * free-text category, so a new kind of firm needs no code change.
 */

const FIRM_KINDS = [
    { id: 'Tyre', label: 'Tyre Seller' },
    { id: 'Manual', label: 'Manual Vendor' },
    { id: 'Firm', label: 'Other (custom category)' },
];
const FIRM_TYPES = FIRM_KINDS.map(k => k.id);

const kindLabel = (p) =>
    p.type === 'Firm' ? (p.category || 'Firm') : (FIRM_KINDS.find(k => k.id === p.type)?.label || p.type);

export default function FirmManager() {
    const [firms, setFirms] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [kindFilter, setKindFilter] = useState('all');
    const [delTarget, setDelTarget] = useState(null);

    const emptyForm = { type: 'Tyre', category: '', name: '', contactPerson: '', address: '', description: '', mobileNumbers: [''] };
    const [form, setForm] = useState(emptyForm);

    const fetchAll = async () => {
        try {
            const res = await ax.get('/profiles', { _skipCache: true });
            setFirms((res.data || []).filter(p => FIRM_TYPES.includes(p.type)));
        } catch { /* list stays as-is */ }
    };
    useEffect(() => { fetchAll(); }, []);

    const openAdd = () => { setEditTarget(null); setForm(emptyForm); setShowForm(true); };
    const openEdit = (p) => {
        setEditTarget(p);
        setForm({
            type: p.type || 'Firm',
            category: p.category || '',
            name: p.name || '',
            contactPerson: p.contactPerson || p.fatherName || '',
            address: p.address || '',
            description: p.description || '',
            mobileNumbers: p.mobileNumbers?.length ? [...p.mobileNumbers] : [''],
        });
        setShowForm(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        if (form.type === 'Firm' && !form.category.trim()) { alert('Enter a category for the firm (e.g. Spare Parts, Crane).'); return; }
        setBusy(true);
        try {
            const payload = {
                name: form.name.trim(),
                type: form.type,
                category: form.type === 'Firm' ? form.category.trim() : '',
                contactPerson: form.contactPerson.trim(),
                fatherName: form.contactPerson.trim(),
                address: form.address.trim(),
                description: form.description.trim(),
                mobileNumbers: form.mobileNumbers.filter(m => m.trim()),
            };
            if (editTarget) await ax.put(`/profiles/${editTarget.id}`, payload);
            else await ax.post('/profiles', payload);
            setShowForm(false);
            setEditTarget(null);
            fetchAll();
        } catch (err) { alert(err.response?.data?.error || 'Failed'); }
        finally { setBusy(false); }
    };

    const handleDelete = async () => {
        if (!delTarget) return;
        try { await ax.delete(`/profiles/${delTarget.id}`); fetchAll(); setDelTarget(null); }
        catch { alert('Delete failed'); setDelTarget(null); }
    };

    const filtered = firms.filter(p => {
        if (kindFilter !== 'all' && p.type !== kindFilter) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (p.name || '').toLowerCase().includes(q)
            || (p.category || '').toLowerCase().includes(q)
            || (p.address || '').toLowerCase().includes(q)
            || (p.mobileNumbers || []).join(' ').includes(q);
    });

    const KIND_COLORS = { Tyre: '#f59e0b', Manual: '#6366f1', Firm: '#10b981' };

    return (
        <div>
            <ConfirmDialog
                open={!!delTarget}
                title="Delete this firm?"
                message={<>Delete <strong style={{ color: 'var(--text)' }}>{delTarget?.name}</strong>? This will permanently remove this firm from the system.</>}
                confirmText="Delete Firm"
                danger
                onConfirm={handleDelete}
                onCancel={() => setDelTarget(null)}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Briefcase size={22} color="#10b981" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>Firms & Vendors</h2>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Tyre sellers, manual vendors, and any other firm — people stay in Staff Profiles</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select className="fi" style={{ width: '170px' }} value={kindFilter} onChange={e => setKindFilter(e.target.value)}>
                        <option value="all">All kinds</option>
                        {FIRM_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                    </select>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
                            style={{ paddingLeft: '32px', padding: '8px 12px 8px 32px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '13px', width: '190px' }} />
                    </div>
                    <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#10b981', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
                        <Plus size={16} /> Add Firm
                    </button>
                </div>
            </div>

            {showForm && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '90%', maxWidth: '460px', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-card)', borderRadius: '16px', padding: '28px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>{editTarget ? 'Edit Firm' : 'Add New Firm'}</h3>
                            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div className="field">
                                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Kind *</label>
                                <select className="fi" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                                    {FIRM_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                                </select>
                            </div>
                            {form.type === 'Firm' && (
                                <div className="field">
                                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Category *</label>
                                    <input className="fi" type="text" placeholder="e.g. Spare Parts, Crane, Workshop" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                                </div>
                            )}
                            <div className="field">
                                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Firm Name *</label>
                                <input className="fi" type="text" placeholder="e.g. Sharma Tyre House" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                            </div>
                            <div className="field">
                                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Owner / Contact Person</label>
                                <input className="fi" type="text" value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} />
                            </div>
                            <div className="field">
                                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Address</label>
                                <input className="fi" type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                            </div>
                            <div className="field">
                                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Notes</label>
                                <textarea className="fi" rows={2} placeholder="What this firm supplies, payment terms…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                            </div>
                            <div className="field">
                                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Mobile Numbers</label>
                                {form.mobileNumbers.map((m, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                                        <input className="fi" type="tel" placeholder="Mobile number" value={m}
                                            onChange={e => { const nums = [...form.mobileNumbers]; nums[i] = e.target.value; setForm(f => ({ ...f, mobileNumbers: nums })); }}
                                            style={{ flex: 1 }} />
                                        {form.mobileNumbers.length > 1 && (
                                            <button type="button" onClick={() => setForm(f => ({ ...f, mobileNumbers: f.mobileNumbers.filter((_, j) => j !== i) }))}
                                                style={{ background: 'rgba(244,63,94,0.1)', color: '#f43f5e', border: 'none', borderRadius: '6px', padding: '0 8px', cursor: 'pointer' }}><X size={14} /></button>
                                        )}
                                    </div>
                                ))}
                                <button type="button" onClick={() => setForm(f => ({ ...f, mobileNumbers: [...f.mobileNumbers, ''] }))}
                                    style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>+ Add Number</button>
                            </div>
                            <button type="submit" disabled={busy} style={{ padding: '12px', borderRadius: '8px', border: 'none', background: '#10b981', color: 'white', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
                                {busy ? 'Saving...' : editTarget ? 'Update Firm' : 'Add Firm'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                {filtered.map(p => (
                    <div key={p.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                        <div style={{ height: '4px', background: KIND_COLORS[p.type] || '#10b981', width: '100%' }} />
                        <div style={{ padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                                <div>
                                    <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 6px 0' }}>{p.name}</h3>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800, background: `${KIND_COLORS[p.type] || '#10b981'}18`, color: KIND_COLORS[p.type] || '#10b981' }}>
                                        <Tag size={11} /> {kindLabel(p)}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => openEdit(p)} style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: 'none', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Edit"><Edit3 size={16} /></button>
                                    <button onClick={() => setDelTarget(p)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Delete"><Trash2 size={16} /></button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><User size={14} color="var(--text-muted)" /><span><span style={{ color: 'var(--text-muted)' }}>Contact:</span> {p.contactPerson || p.fatherName || 'N/A'}</span></div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Phone size={14} color="var(--text-muted)" /><span>{(p.mobileNumbers || []).filter(Boolean).join(', ') || 'N/A'}</span></div>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}><MapPin size={14} color="var(--text-muted)" style={{ marginTop: '2px' }} /><span style={{ flex: 1 }}>{p.address || 'N/A'}</span></div>
                                {p.description && <div style={{ fontSize: '12px', color: 'var(--text-muted)', paddingTop: '6px', borderTop: '1px dashed var(--border)' }}>{p.description}</div>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: '16px', border: '1px dashed var(--border)' }}>
                    No firms yet. Existing tyre and manual vendors appear here automatically; click "Add Firm" for anything new.
                </div>
            )}
        </div>
    );
}
