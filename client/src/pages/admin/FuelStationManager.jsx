import React, { useState, useEffect } from 'react';
import ax from '../../api';
import { Fuel, Plus, Check, X, Trash2, Edit3, Phone, MapPin, Banknote, Search, User, FileDown, FileCheck } from 'lucide-react';
import { exportToExcel } from '../../utils/exportUtils';

// Every sheet that can carry a diesel advance. The old list stopped at the
// Jharli three, so diesel bought against Kosli/Jhajjar/Bahadurgarh bills never
// counted in any station's totals here.
const ALL_VOUCHER_TYPES = ['Dump', 'JK_Lakshmi', 'JK_Super', 'Kosli_Bill', 'Jajjhar_Bill', 'Bahadurgarh_Bill'];

export default function FuelStationManager() {
  const [stations, setStations] = useState([]);
  const [payments, setPayments] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [stmtMonth, setStmtMonth] = useState(new Date().toISOString().slice(0, 7));
  const [form, setForm] = useState({ name: '', address: '', contactPerson: '', mobileNumbers: [''], dieselRate: '', openingBalance: '' });

  const fetchAll = async () => {
    try {
      const [profRes, payRes, ...vRes] = await Promise.all([
        ax.get('/profiles', { _skipCache: true }),
        ax.get('/payments', { _skipCache: true }).catch(() => ({ data: [] })),
        ...ALL_VOUCHER_TYPES.map(t => ax.get(`/vouchers/${t}`).then(r => r.data).catch(() => [])),
      ]);
      setStations((profRes.data || []).filter(p => (p.type || '').toLowerCase() === 'pump'));
      setPayments((payRes.data || []).filter(p => p.category === 'Pump'));
      setVouchers(vRes.flat().filter(v => v.advanceDiesel || v.isFullTank));
    } catch {}
  };

  useEffect(() => { fetchAll(); }, []);

  const openAdd = () => {
    setEditTarget(null);
    setForm({ name: '', address: '', contactPerson: '', mobileNumbers: [''], dieselRate: '', openingBalance: '' });
    setShowForm(true);
  };

  const openEdit = (s) => {
    setEditTarget(s);
    setForm({
      name: s.name || '',
      address: s.address || '',
      contactPerson: s.contactPerson || s.fatherName || '',
      mobileNumbers: s.mobileNumbers?.length ? [...s.mobileNumbers] : [''],
      dieselRate: s.dieselRate || '',
      openingBalance: s.openingBalance || '',
    });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: 'pump',
        address: form.address.trim(),
        contactPerson: form.contactPerson.trim(),
        fatherName: form.contactPerson.trim(),
        mobileNumbers: form.mobileNumbers.filter(m => m.trim()),
        // Current pump rate is informational; opening balance is money owed
        // from before the system and counts into the station's balance below.
        dieselRate: parseFloat(form.dieselRate) || 0,
        openingBalance: parseFloat(form.openingBalance) || 0,
      };
      if (editTarget) {
        await ax.put(`/profiles/${editTarget.id}`, payload);
      } else {
        await ax.post('/profiles', payload);
      }
      setShowForm(false);
      setEditTarget(null);
      fetchAll();
    } catch (err) { alert(err.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this fuel station?')) return;
    try { await ax.delete(`/profiles/${id}`); fetchAll(); }
    catch { alert('Delete failed'); }
  };

  const filtered = stations.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.name || '').toLowerCase().includes(q) ||
      (s.address || '').toLowerCase().includes(q) ||
      (s.mobileNumbers || []).join(' ').includes(q);
  });

  const amtOf = v => v.advanceDiesel === 'FULL' ? 4000 : (parseFloat(v.advanceDiesel) || 0);
  const pumpVouchersOf = (name) => vouchers.filter(v => (v.pump || '').toLowerCase() === (name || '').toLowerCase());

  const getPumpDiesel = (name) => {
    const pumpVouchers = pumpVouchersOf(name);
    return {
      total: pumpVouchers.reduce((s, v) => s + amtOf(v), 0),
      count: pumpVouchers.length,
      // What the Monthly Bill tab would pay this station right now — checked
      // against the bill, not yet settled by a pump payment.
      billPending: pumpVouchers
        .filter(v => v.isDieselVerified && !v.dieselBillPaymentId)
        .reduce((s, v) => s + amtOf(v), 0),
      unverified: pumpVouchers.filter(v => !v.isDieselVerified).length,
    };
  };
  const getPumpPaid = (id, name) => {
    // Older payments carry only profileId; the monthly-bill flow records
    // profileName too, so match on either.
    const list = payments.filter(p => p.profileId === id || (name && p.profileName === name));
    return { paid: list.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0), count: list.length };
  };

  /** Everything on one station for one month, as the pump's accountant reads it. */
  const exportStatement = (s) => {
    const inMonth = d => (d || '').slice(0, 7) === stmtMonth;
    const entries = pumpVouchersOf(s.name).filter(v => inMonth(v.date));
    const pays = payments.filter(p => (p.profileId === s.id || p.profileName === s.name) && inMonth(p.date));
    // A statement of two different record types, so the columns are composed by
    // hand rather than dumped — a union of voucher and payment fields would be
    // mostly blanks. The diesel detail is carried through so nothing about the
    // fill itself is lost.
    const rows = [
      ...entries.map(v => ({
        Date: v.date, Kind: 'Diesel', Truck: v.truckNo || '', LR: v.lrNo || '', Sheet: (v.type || '').replace(/_/g, ' '),
        Amount: v.advanceDiesel === 'FULL' ? 'FULL (cost pending)' : amtOf(v),
        Status: v.dieselBillPaymentId ? 'Settled' : v.isDieselVerified ? 'Verified' : 'Unverified',
        Litres: v.dieselActualLitres || '',
        Booked: v.advanceDiesel || '',
        Full_Tank: v.isFullTank ? 'Yes' : '',
        Verified_On: v.dieselVerifiedAt ? String(v.dieselVerifiedAt).slice(0, 10) : '',
        Verified_By: v.dieselVerifiedBy || '',
        Party: v.partyName || '',
        Remark: '',
      })),
      ...pays.map(p => ({
        Date: p.date, Kind: 'Payment', Truck: '', LR: '', Sheet: p.paymentMethod || '',
        Amount: -(parseFloat(p.amount) || 0),
        Status: p.remark || '',
        Litres: '', Booked: '', Full_Tank: '', Verified_On: '', Verified_By: '', Party: '',
        Remark: p.remark || '',
      })),
    ].sort((a, b) => String(a.Date).localeCompare(String(b.Date)));
    if (!rows.length) { alert(`Nothing recorded for ${s.name} in ${stmtMonth}.`); return; }
    exportToExcel(rows, `PumpStatement_${s.name.replace(/[^a-z0-9]+/gi, '_')}_${stmtMonth}`);
  };

  /** Hand this pump to Diesel Control → Monthly Bill in the main app. */
  const openMonthlyBill = (s) => {
    localStorage.setItem('vgtc-diesel-bill-pump', s.name);
    localStorage.setItem('vgtc-active', 'diesel_jharli');
    window.location.href = '/';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Fuel size={22} color="#3b82f6" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>Fuel Stations</h2>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Manage diesel pump stations — appears in LR, Voucher & Diesel module</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Month the per-station Statement button exports. */}
          <input type="month" value={stmtMonth} onChange={e => setStmtMonth(e.target.value)} title="Statement month"
            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '13px' }} />
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '32px', padding: '8px 12px 8px 32px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: '13px', width: '200px' }} />
          </div>
          <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#3b82f6', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={16} /> Add Station
          </button>
        </div>
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '90%', maxWidth: '440px', background: 'var(--bg-card)', borderRadius: '16px', padding: '28px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>{editTarget ? 'Edit Station' : 'Add New Station'}</h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="field">
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Station Name *</label>
                <input className="fi" type="text" placeholder="e.g. HP Petrol Pump, Jharli" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="field">
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Owner / Contact Person</label>
                <input className="fi" type="text" placeholder="Owner name" value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} />
              </div>
              <div className="field">
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Address / Location</label>
                <input className="fi" type="text" placeholder="Full address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="field">
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Diesel Rate (Rs./L)</label>
                  <input className="fi" type="number" step="0.01" placeholder="e.g. 92.50" value={form.dieselRate} onChange={e => setForm(f => ({ ...f, dieselRate: e.target.value }))} />
                </div>
                <div className="field">
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Opening Balance (Rs.)</label>
                  <input className="fi" type="number" placeholder="owed before system" value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} />
                </div>
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
                  style={{ fontSize: '11px', fontWeight: 700, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>+ Add Number</button>
              </div>
              <button type="submit" disabled={busy} style={{ padding: '12px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: 'white', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
                {busy ? 'Saving...' : editTarget ? 'Update Station' : 'Add Station'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Station Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
        {filtered.map(s => {
          const diesel = getPumpDiesel(s.name);
          const paid = getPumpPaid(s.id, s.name);
          const balance = (parseFloat(s.openingBalance) || 0) + diesel.total - paid.paid;
          return (
            <div key={s.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ height: '4px', background: balance > 0 ? '#f59e0b' : '#10b981', width: '100%' }} />
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 4px 0' }}>{s.name}</h3>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Fuel size={14} /> Fuel Station · {diesel.count} entries
                      {(parseFloat(s.dieselRate) || 0) > 0 && <span style={{ marginLeft: '6px', fontWeight: 700, color: '#3b82f6' }}>@ ₹{s.dieselRate}/L</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => openEdit(s)} style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: 'none', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Edit"><Edit3 size={16} /></button>
                    <button onClick={() => handleDelete(s.id)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Delete"><Trash2 size={16} /></button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                    <User size={15} color="var(--text-muted)" />
                    <span><span style={{ color: 'var(--text-muted)' }}>Owner:</span> {s.contactPerson || s.fatherName || 'N/A'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px' }}>
                    <MapPin size={15} color="var(--text-muted)" style={{ marginTop: '2px' }} />
                    <span style={{ flex: 1 }}>{s.address || 'N/A'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                    <Phone size={15} color="var(--text-muted)" />
                    <span>{(s.mobileNumbers || []).filter(Boolean).join(', ') || 'N/A'}</span>
                  </div>
                </div>

                {/* Diesel & Payment summary */}
                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px dashed var(--border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Total Diesel</div>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: '#3b82f6' }}>₹{diesel.total.toLocaleString('en-IN')}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Paid</div>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: '#10b981' }}>₹{paid.paid.toLocaleString('en-IN')}</div>
                      {paid.count > 0 && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{paid.count} payment{paid.count > 1 ? 's' : ''}</div>}
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Bill Pending</div>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: diesel.billPending > 0 ? '#6366f1' : 'var(--text-muted)' }}>₹{diesel.billPending.toLocaleString('en-IN')}</div>
                      {diesel.unverified > 0 && <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 700 }}>{diesel.unverified} unverified</div>}
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Balance</div>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: balance > 0 ? '#f59e0b' : '#10b981' }}>₹{Math.abs(balance).toLocaleString('en-IN')}</div>
                      {(parseFloat(s.openingBalance) || 0) > 0 && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>incl. ₹{Number(s.openingBalance).toLocaleString('en-IN')} opening</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                    <button onClick={() => openMonthlyBill(s)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '8px', border: 'none', background: 'rgba(99,102,241,0.12)', color: '#818cf8', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                      title="Open Diesel Control → Monthly Bill with this pump preselected">
                      <FileCheck size={14} /> Monthly Bill
                    </button>
                    <button onClick={() => exportStatement(s)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '8px', border: 'none', background: 'rgba(16,185,129,0.12)', color: '#10b981', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                      title={`Excel statement of entries + payments for ${stmtMonth}`}>
                      <FileDown size={14} /> Statement
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: '16px', border: '1px dashed var(--border)' }}>
          No fuel stations found. Click "Add Station" to get started.
        </div>
      )}
    </div>
  );
}
