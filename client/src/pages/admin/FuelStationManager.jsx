import React, { useState, useEffect } from 'react';
import ax from '../../api';
import { Fuel, Plus, Check, X, Trash2, Edit3 } from 'lucide-react';

export default function FuelStationManager() {
  const [stations, setStations] = useState([]);
  const [form, setForm] = useState('');
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');

  const fetch = async () => {
    try {
      const all = (await ax.get('/profiles')).data;
      setStations(all.filter(p => p.type === 'pump'));
    } catch {}
  };

  useEffect(() => { fetch(); }, []);

  const handleAdd = async e => {
    e.preventDefault();
    if (!form.trim()) return;
    setBusy(true);
    try {
      await ax.post('/profiles', { name: form.trim(), type: 'pump' });
      setForm('');
      fetch();
    } catch (err) { alert(err.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const handleDelete = async id => {
    if (!confirm('Delete this fuel station?')) return;
    try { await ax.delete(`/profiles/${id}`); fetch(); }
    catch { alert('Delete failed'); }
  };

  const handleEdit = async id => {
    if (!editName.trim()) return;
    try {
      await ax.put(`/profiles/${id}`, { name: editName.trim(), type: 'pump' });
      setEditId(null); setEditName('');
      fetch();
    } catch { alert('Update failed'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Fuel size={22} color="#3b82f6" />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>Fuel Station Management</h2>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Add, edit or remove diesel pump stations. These appear in Loading Receipt & Voucher forms.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px' }}>
        {/* Add Form */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={16} /> Add New Station
          </h3>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Station Name</label>
              <input
                type="text" placeholder="e.g. HP Petrol Pump, Jharli"
                value={form} onChange={e => setForm(e.target.value)} required
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', fontSize: '14px', color: 'var(--text)', outline: 'none', width: '100%' }}
              />
            </div>
            <button type="submit" disabled={busy} style={{
              padding: '10px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: 'white',
              fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
            }}>
              {busy ? '...' : <><Plus size={14} /> Add Station</>}
            </button>
          </form>

          <div style={{ marginTop: '20px', padding: '14px', borderRadius: '8px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Where this list appears</div>
            <ul style={{ fontSize: '12px', color: 'var(--text-sub)', paddingLeft: '16px', lineHeight: 1.8 }}>
              <li>Loading Receipt form — Fuel Station dropdown</li>
              <li>Voucher form — Pump/Station selection</li>
              <li>Print receipts — shows selected station</li>
            </ul>
          </div>
        </div>

        {/* Station List */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>All Stations ({stations.length})</h3>
          </div>

          {stations.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '10px', color: 'var(--text-muted)', fontSize: '13px' }}>
              No fuel stations added yet. Add one to get started.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {stations.map((s, i) => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border)', borderRadius: '10px', transition: 'border-color 0.15s'
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(59,130,246,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <Fuel size={16} color="#3b82f6" />
                  </div>

                  {editId === s.id ? (
                    <div style={{ flex: 1, display: 'flex', gap: '8px' }}>
                      <input
                        type="text" value={editName} onChange={e => setEditName(e.target.value)}
                        style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', color: 'var(--text)', outline: 'none' }}
                      />
                      <button onClick={() => handleEdit(s.id)} style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Check size={14} /></button>
                      <button onClick={() => { setEditId(null); setEditName(''); }} style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
                    </div>
                  ) : (
                    <>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>{s.name}</div>
                      </div>
                      <button onClick={() => { setEditId(s.id); setEditName(s.name); }} title="Edit" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: 'none', borderRadius: '8px', padding: '7px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Edit3 size={14} /></button>
                      <button onClick={() => handleDelete(s.id)} title="Delete" style={{ background: 'rgba(244,63,94,0.1)', color: '#fb7185', border: 'none', borderRadius: '8px', padding: '7px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={14} /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
