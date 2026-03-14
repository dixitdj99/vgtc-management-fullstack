import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Calendar, Check, Download, Edit3, FileSpreadsheet, Package, Pencil, Plus, Printer, Receipt, Search, Tag, Trash2, User, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import ConfirmSaveModal from '../components/ConfirmSaveModal';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';

const BASE_API = `/api`;
const MATS_DUMP = ['PPC', 'OPC43', 'Adstar', 'Opc FS', 'Opc 53 FS', 'Weather'];
const MATS_JKL = ['PPC', 'OPC43', 'Pro+'];

/* ── Print helper ── */
function printReceipt(allRows, lrNo, allChallans = []) {
  const rows = allRows.filter(r => r.lrNo === lrNo);
  if (!rows.length) return;
  const base = rows[0];
  const materialsHtml = rows.map(m => `
    <tr>
      <td style="padding:5px 10px;border:1px solid #ccc;">${m.material}</td>
      <td style="padding:5px 10px;border:1px solid #ccc;text-align:center;">${m.totalBags}</td>
      <td style="padding:5px 10px;border:1px solid #ccc;text-align:center;">${Number(m.weight).toFixed(2)} MT</td>
    </tr>
  `).join('');
  const totalBags = rows.reduce((s, r) => s + (parseFloat(r.totalBags) || 0), 0);
  const totalWeight = rows.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0).toFixed(2);

  let challanLine = '';
  if (base.billing) {
    const challanNos = base.billing.split(',').map(s => s.trim());
    const challanDetails = challanNos.map(cNo => {
      const ch = allChallans.find(c => c.challanNo === cNo);
      let dateStr = '';
      if (ch && ch.date) {
        dateStr = ` (Dated: ${new Date(ch.date).toLocaleDateString('en-IN')})`;
      }
      if (ch && ch.materials) {
        const mats = ch.materials.map(m => `${m.type}: ${m.totalBags - (m.loadedBags || 0)} left`).join(', ');
        return `<div style="font-size: 11px; color: #475569; margin-top: 4px;">${cNo}${dateStr} — Bal: ${mats}</div>`;
      } else if (ch) {
        return `<div style="font-size: 11px; color: #475569; margin-top: 4px;">${cNo}${dateStr} — Bal: ${ch.material} (${ch.quantity} bags)</div>`;
      }
      return `<div style="font-size: 11px; color: #475569; margin-top: 4px;">${cNo}</div>`;
    }).join('');

    challanLine = `<div class="row" style="grid-column: 1 / -1; display: block;">
         <span class="lbl">Attached Challans</span>
         <span class="val" style="display:block; margin-bottom: 6px;">${base.billing}</span>
         ${challanDetails}
      </div>`;
  }

  const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <title>LR #${lrNo}</title>
      <style>
        body { font-family: 'Inter', system-ui, sans-serif; padding: 30px; color: #1e293b; max-width: 800px; margin: 0 auto; }
        .hd { border-bottom: 3px solid #6366f1; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
        .hd h1 { margin: 0; color: #6366f1; font-size: 26px; font-weight: 900; letter-spacing: -0.5px; }
        .hd .lr-no { font-size: 20px; font-weight: 800; color: #0f172a; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px; }
        .row { display: flex; justify-content: space-between; padding: 8px 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; }
        .lbl { color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; display: block; margin-bottom: 2px; }
        .val { font-size: 14px; font-weight: 700; color: #1e293b; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 13px; }
        th { background: #f1f5f9; padding: 10px; text-align: left; border: 1px solid #cbd5e1; color: #475569; font-weight: 700; }
        td { padding: 8px 10px; border: 1px solid #cbd5e1; }
        .tot { font-weight: 800; background: #f8fafc; }
        .btn-print { display: block; width: 100%; padding: 12px; background: #10b981; color: white; text-align: center; font-weight: 800; border: none; border-radius: 8px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; }
        @media print { .btn-print { display: none; } body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="hd">
        <h1>Loading Receipt</h1>
        <div class="lr-no">LR #${lrNo}</div>
      </div>
      <div class="grid">
        <div class="row"><div><span class="lbl">Date</span><span class="val">${new Date(base.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></div></div>
        <div class="row"><div><span class="lbl">Truck No.</span><span class="val">${base.truckNo}</span></div></div>
        <div class="row" style="grid-column: 1 / -1;"><div><span class="lbl">Party Name</span><span class="val">${base.partyName}</span></div></div>
      </div>
      ${challanLine}
      <table>
        <thead><tr><th>Material</th><th style="text-align:center;">Bags</th><th style="text-align:center;">Weight (MT)</th></tr></thead>
        <tbody>
          ${materialsHtml}
          <tr class="tot">
            <td style="text-align:right;">Total</td>
            <td style="text-align:center;">${totalBags}</td>
            <td style="text-align:center;">${totalWeight} MT</td>
          </tr>
        </tbody>
      </table>
      <button class="btn-print" onclick="window.print()">Print Receipt</button>
      <script>setTimeout(() => window.print(), 500);</script>
    </body>
  </html>`;
  const w = window.open('', '_blank', 'width=800,height=600');
  w.document.write(html); w.document.close();
}

/* ── Edit Modal ── */
function EditModal({ row, openChallans, onClose, onSave }) {
  const [form, setForm] = useState({
    lrNo: row.lrNo,
    date: row.date,
    truckNo: row.truckNo,
    partyName: row.partyName,
    billing: row.billing || '',
    material: row.material,
    weight: row.weight,
    totalBags: row.totalBags,
  });
  const [loading, setLoading] = useState(false); // Renamed from saving to loading
  const [isConfirming, setIsConfirming] = useState(false);

  const MATERIALS = brand === 'jkl' ? MATS_JKL : MATS_DUMP;
  const ENDPOINT = brand === 'jkl' ? `${BASE_API}/jkl/stock/challans` : `${BASE_API}/stock/challans`;

  const executeSave = async () => {
    setLoading(true);
    setIsConfirming(false);
    try {
      const payload = { ...form };
      if (form.billing) {
        payload.billing = form.billing;
        if (form.billing !== row.billing) {
          try { await axios.patch(`${ENDPOINT}/${row.id}/billing`, { billing: payload.billing }); }
          catch (e) { console.warn('Failed to update billing', e); }
        }
      }
      await axios.put(`${ENDPOINT.replace('/stock/challans', '/lr')}/${row.id}`, payload);
      onSave();
    } catch (e) { alert('Update failed'); } finally { setLoading(false); }
  };

  const S = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)'
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        style={{ width: '520px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.6)', overflow: 'hidden' }}
      >
        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Pencil size={16} color="#6366f1" />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#f1f5f9' }}>Edit Receipt</div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '2px' }}>ID: {row.id.slice(0, 10)}...</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', padding: '6px', borderRadius: '8px' }}>
            <X size={18} />
          </button>
        </div>
        {/* Modal body */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="fg fg-2">
            <div className="field">
              <label>LR Number</label>
              <input className="fi" type="number" value={form.lrNo} onChange={e => S('lrNo', e.target.value)} />
            </div>
            <div className="field">
              <label><Calendar size={11} /> Date</label>
              <input className="fi" type="date" value={form.date} onChange={e => S('date', e.target.value)} />
            </div>
            <div className="field">
              <label>Truck No.</label>
              <input className="fi" type="text" value={form.truckNo} onChange={e => S('truckNo', e.target.value.toUpperCase())} />
            </div>
            <div className="field">
              <label><User size={11} /> Party Name</label>
              <input className="fi" type="text" value={form.partyName} onChange={e => S('partyName', e.target.value)} />
            </div>
          </div>
          <hr className="sep" style={{ margin: '4px 0' }} />
          <div className="fg fg-3">
            <div className="field">
              <label>Material</label>
              <select className="fi" value={form.material} onChange={e => S('material', e.target.value)}>
                {MATERIALS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Bags</label>
              <input className="fi" type="number" value={form.totalBags} onChange={e => S('totalBags', e.target.value)} />
            </div>
            <div className="field">
              <label>Weight (MT)</label>
              <input className="fi" type="number" step="0.01" value={form.weight} onChange={e => S('weight', e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label><Tag size={11} /> Challan</label>
            <select className="fi" value={form.billing} onChange={e => S('billing', e.target.value)}>
              <option value="">— No Challan —</option>
              {/* Include current challan even if it's loaded */}
              {form.billing && !openChallans.find(c => c.challanNo === form.billing) && (
                <option value={form.billing}>{form.billing} (current)</option>
              )}
              {openChallans.map(c => (
                <option key={c.id} value={c.challanNo}>{c.challanNo} — {c.truckNo} ({c.material})</option>
              ))}
            </select>
          </div>
        </div>
        {/* Modal footer */}
        <div style={{ display: 'flex', gap: '10px', padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.07)', justifyContent: 'flex-end' }}>
          <button className="btn btn-g" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-p" onClick={() => setIsConfirming(true)} disabled={loading}>
            {loading ? 'Saving...' : <><Check size={14} /> Save Changes</>}
          </button>
        </div>
      </motion.div>
      <ConfirmSaveModal
        isOpen={isConfirming}
        onClose={() => setIsConfirming(false)}
        onConfirm={executeSave}
        title="Save Changes"
        message="Are you sure you want to save changes to this loading receipt?"
        isSaving={loading}
      />
    </div>
  );
}

/* ── Challan Popup Modal ── */
function ChallanPopup({ openChallans, selectedChallans, onClose, onToggleSelect, brand, vehicles = [], initialTab = 'select' }) {
  const [tab, setTab] = useState(initialTab); // 'select' | 'create'

  // For 'create' tab
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  const MATERIALS = brand === 'jkl' ? MATS_JKL : MATS_DUMP;
  const ENDPOINT = brand === 'jkl' ? `${BASE_API}/jkl/stock/challans` : `${BASE_API}/stock/challans`;

  const [chalForm, setChalForm] = useState({
    truckNo: '', date: new Date().toISOString().split('T')[0], material: MATERIALS[0], quantity: '', partyName: '', remark: ''
  });

  const S = (k, v) => setChalForm(f => ({ ...f, [k]: v }));

  const handleCreateRequest = (e) => {
    e.preventDefault();
    if (!chalForm.truckNo) { setErr('Truck number required'); return; }
    if (!chalForm.quantity || parseFloat(chalForm.quantity) <= 0) { setErr('Enter valid quantity'); return; }
    setErr('');
    setIsConfirming(true);
  };

  const executeCreate = async () => {
    setSaving(true); setIsConfirming(false);
    try {
      await axios.post(ENDPOINT, chalForm);
      // Go back to select tab so user can see newly created challan
      setTab('select');
      setChalForm({ truckNo: '', date: new Date().toISOString().split('T')[0], material: MATERIALS[0], quantity: '', partyName: '', remark: '' });
      // Notify parent to refetch challans
      if (onRefetch) onRefetch();
    } catch (er) {
      setErr(er.response?.data?.error || 'Error creating challan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)'
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        style={{ width: '560px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.6)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Tag size={16} color="#f59e0b" />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#f1f5f9' }}>Select or Create Challan</div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '2px' }}>Loading Receipt Attachment</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', padding: '6px', borderRadius: '8px' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', padding: '0 22px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <button style={{
            background: 'transparent', border: 'none', padding: '12px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            color: tab === 'select' ? '#f59e0b' : '#94a3b8', borderBottom: tab === 'select' ? '2px solid #f59e0b' : '2px solid transparent'
          }} onClick={() => setTab('select')}>Select Existing</button>

          <button style={{
            background: 'transparent', border: 'none', padding: '12px 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            color: tab === 'create' ? '#f59e0b' : '#94a3b8', borderBottom: tab === 'create' ? '2px solid #f59e0b' : '2px solid transparent'
          }} onClick={() => setTab('create')}>Create New</button>
        </div>

        <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1 }}>
          <AnimatePresence mode="wait">
            {tab === 'select' && (
              <motion.div key="select" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Open Challans ({openChallans.length})</div>

                {openChallans.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: '13px' }}>No open challans available. Create a new one.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {openChallans.map(c => {
                      const isSelected = selectedChallans.find(sc => sc.challanNo === c.challanNo);
                      return (
                        <div
                          key={c.id}
                          onClick={() => onToggleSelect(c)}
                          style={{ padding: '14px', background: isSelected ? 'rgba(245,158,11,0.05)' : 'var(--bg-card)', border: isSelected ? '1px solid rgba(245,158,11,0.5)' : '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span style={{ fontWeight: 800, color: '#f59e0b', fontFamily: 'monospace' }}>{c.challanNo}</span>
                              <span style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 700 }}>{c.truckNo}</span>
                              {isSelected && <span style={{ padding: '2px 6px', background: '#f59e0b', color: '#000', borderRadius: '4px', fontSize: '9px', fontWeight: 800 }}>SELECTED</span>}
                            </div>
                            <div style={{ fontSize: '12px', color: '#94a3b8' }}>{c.partyName || 'No Party'} · {new Date(c.date).toLocaleDateString('en-IN')}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {c.materials ? (
                              c.materials.map((m, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(99,102,241,0.1)', padding: '2px 6px', borderRadius: '4px', color: '#818cf8', fontSize: '10px', fontWeight: 700 }}>
                                    <Package size={10} /> {m.type}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>{m.totalBags - m.loadedBags} left</div>
                                </div>
                              ))
                            ) : (
                              // legacy fallback rendering
                              <>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(99,102,241,0.1)', padding: '4px 8px', borderRadius: '6px', color: '#818cf8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                                  <Package size={12} /> {c.material}
                                </div>
                                <div style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 700 }}>{c.quantity} bags</div>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {tab === 'create' && (
              <motion.div key="create" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                <form id="createChalForm" onSubmit={handleCreateRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="fg fg-2">
                    <div className="field">
                      <label>Truck No. *</label>
                      <input className="fi" type="text" placeholder="GJ01AB1234" value={chalForm.truckNo} onChange={e => S('truckNo', e.target.value.toUpperCase())} required list="chal-truck-list" />
                      <datalist id="chal-truck-list">
                        {vehicles.map(v => <option key={v.id} value={v.truckNo} />)}
                      </datalist>
                    </div>
                    <div className="field">
                      <label><Calendar size={11} /> Date *</label>
                      <input className="fi" type="date" value={chalForm.date} onChange={e => S('date', e.target.value)} required />
                    </div>
                  </div>
                  <div className="fg fg-2">
                    <div className="field">
                      <label>Material *</label>
                      <select className="fi" value={chalForm.material} onChange={e => S('material', e.target.value)}>
                        {MATERIALS.map(m => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label>Quantity (bags) *</label>
                      <input className="fi" type="number" step="1" min="1" placeholder="0" value={chalForm.quantity} onChange={e => S('quantity', e.target.value)} required />
                    </div>
                  </div>
                  <div className="field">
                    <label><User size={11} /> Party Name</label>
                    <input className="fi" type="text" placeholder="Customer name" value={chalForm.partyName} onChange={e => S('partyName', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Remark / Notes</label>
                    <input className="fi" type="text" placeholder="Optional notes" value={chalForm.remark} onChange={e => S('remark', e.target.value)} />
                  </div>
                  {err && <div style={{ fontSize: '12px', color: '#f43f5e', fontWeight: 600 }}>{err}</div>}
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {tab === 'select' && (
          <div style={{ display: 'flex', gap: '10px', padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.07)', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>{selectedChallans.length} challan(s) selected</span>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-g" onClick={onClose}>Close</button>
              <button className="btn btn-p" onClick={onClose}><Check size={14} /> Done</button>
            </div>
          </div>
        )}

        {tab === 'create' && (
          <div style={{ display: 'flex', gap: '10px', padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.07)', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.2)' }}>
            <button className="btn btn-g" onClick={() => setTab('select')} disabled={saving}>Cancel</button>
            <button type="submit" form="createChalForm" className="btn btn-p" disabled={saving}>
              {saving ? 'Creating...' : <><Tag size={14} /> Create Challan</>}
            </button>
          </div>
        )}
      </motion.div>
      <ConfirmSaveModal
        isOpen={isConfirming}
        onClose={() => setIsConfirming(false)}
        onConfirm={executeCreate}
        title="Create Challan"
        message={`Are you sure you want to create a new Challan for truck ${chalForm.truckNo} ? `}
        isSaving={saving}
      />
    </div>
  );
}

/* ── Main LR Module ── */
function DeleteConfirm({ row, apiUrl, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const handleDelete = async () => {
    setDeleting(true);
    try { await axios.delete(apiUrl + '/' + row.id); onConfirm(); }
    catch { alert('Delete failed'); } finally { setDeleting(false); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }}
        style={{ width: '380px', background: '#0f172a', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.6)', padding: '28px 24px', textAlign: 'center' }}
      >
        <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <AlertTriangle size={26} color="#f43f5e" />
        </div>
        <div style={{ fontSize: '16px', fontWeight: 800, color: '#f1f5f9', marginBottom: '8px' }}>Delete Entry?</div>
        <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '6px' }}>
          LR <strong style={{ color: '#f1f5f9' }}>#{row.lrNo}</strong> · {row.material} · {row.truckNo}
        </div>
        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '22px' }}>This action cannot be undone.</div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button className="btn btn-g" onClick={onClose}>Cancel</button>
          <button className="btn btn-d" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : <><Trash2 size={13} /> Delete</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Main LR Module ── */
export default function LRModule({ role = 'user', brand = 'dump' }) {
  const API = brand === 'jkl' ? `${BASE_API}/jkl/lr` : `${BASE_API}/lr`;
  const API_CHAL = brand === 'jkl' ? `${BASE_API}/jkl/stock/challans` : `${BASE_API}/stock/challans`;
  const MATERIALS = brand === 'jkl' ? MATS_JKL : MATS_DUMP;

  const [receipts, setReceipts] = useState([]);
  const [openChallans, setOpenChallans] = useState([]);
  const [allChallans, setAllChallans] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [showChalPopup, setShowChalPopup] = useState(false);
  const [isConfirmingSave, setIsConfirmingSave] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    truckNo: '', partyName: '',
    usedChallans: [], // array of selected challan objects
    materials: [{ type: MATERIALS[0], weight: '', bags: '' }],
  });

  const [fSearch, setFSearch] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');

  const fetchData = async () => {
    try {
      const data = (await axios.get(API)).data;
      setReceipts([...data].sort((a, b) => b.lrNo - a.lrNo));
    } catch { }
  };

  const fetchChallans = async () => {
    try {
      const data = (await axios.get(API_CHAL)).data;
      setAllChallans(data);
      setOpenChallans(data.filter(c => c.status === 'open' || c.status === 'partially_loaded'));
    } catch { }
  };

  const fetchVehicles = async () => {
    try {
      const data = (await axios.get(`/api/vehicles`)).data;
      setVehicles(data);
    } catch { }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchData(), fetchChallans(), fetchVehicles()]).finally(() => setLoading(false));
  }, [brand]);

  const updMat = (i, field, val) => {
    const m = [...form.materials]; m[i] = { ...m[i], [field]: val };
    if (field === 'bags' && val) m[i].weight = (parseFloat(val) * 0.05).toFixed(2);
    setForm({ ...form, materials: m });
  };
  const addMat = () => setForm({ ...form, materials: [...form.materials, { type: 'PPC', weight: '', bags: '' }] });
  const removeMat = idx => setForm({ ...form, materials: form.materials.filter((_, i) => i !== idx) });

  const handleFormRequest = e => {
    e.preventDefault();
    setIsConfirmingSave(true);
  };

  const executeSaveLR = async () => {
    setLoading(true); setIsConfirmingSave(false);
    try {
      // 1. Calculate how much of each material is used
      // Since an LR might only load a subset of what's attached to the challan
      // We will try to deduct from the attached challans in order
      const matDeductions = {};
      form.materials.forEach(m => {
        matDeductions[m.type] = (matDeductions[m.type] || 0) + parseInt(m.bags);
      });

      const payload = {
        ...form,
        billing: form.usedChallans.map(c => c.challanNo).join(', ')
      };

      const res = await axios.post(API, payload);

      // 2. Perform challan deductions
      for (const ch of form.usedChallans) {
        const chDeductions = [];
        if (ch.materials) {
          ch.materials.forEach(m => {
            let availableInReq = matDeductions[m.type] || 0;
            if (availableInReq > 0) {
              let amountToDeduct = Math.min(availableInReq, m.totalBags - m.loadedBags);
              if (amountToDeduct > 0) {
                chDeductions.push({ type: m.type, bags: amountToDeduct });
                matDeductions[m.type] -= amountToDeduct;
              }
            }
          });
        } else {
          // Legacy fallback
          let availableInReq = matDeductions[ch.material] || 0;
          if (availableInReq > 0) {
            chDeductions.push({ type: ch.material, bags: availableInReq });
            matDeductions[ch.material] -= availableInReq;
          }
        }

        if (chDeductions.length > 0) {
          await axios.post(API_CHAL.replace('/challans', '') + '/challans/deduct', {
            id: ch.id,
            deductions: chDeductions
          });
        }
      }

      alert('Receipt #' + res.data.lrNo + ' created!');
      fetchData(); fetchChallans();
      setForm({ date: new Date().toISOString().split('T')[0], truckNo: '', partyName: '', usedChallans: [], materials: [{ type: 'PPC', weight: '', bags: '' }] });
    } catch (e) {
      const errDetails = e.response?.data?.error || e.response?.data || e.message || String(e);
      console.error("LR Create error:", errDetails);
      alert('Error creating receipt: ' + JSON.stringify(errDetails));
    } finally { setLoading(false); }
  };

  const filteredReceipts = useMemo(() => {
    return receipts.filter(r => {
      if (fFrom && r.date < fFrom) return false;
      if (fTo && r.date > fTo) return false;
      if (fSearch) {
        const q = fSearch.toLowerCase();
        if (!`${r.lrNo} ${r.truckNo} ${r.partyName} ${r.material} ${r.billing || ''} `.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [receipts, fFrom, fTo, fSearch]);

  const exportExcel = () => {
    exportToExcel(filteredReceipts.map(r => ({ LR_No: r.lrNo, Date: r.date, Truck: r.truckNo, Material: r.material, Weight_MT: r.weight, Bags: r.totalBags, Party: r.partyName, Challan: r.billing || '' })), `Receipts_${new Date().toISOString().slice(0, 10)} `);
  };

  const dlPDF = () => {
    exportToPDF(filteredReceipts, 'Loading Receipts', ['lrNo', 'date', 'truckNo', 'material', 'weight', 'totalBags', 'partyName', 'billing']);
  };

  return (
    <>
      <ConfirmSaveModal
        isOpen={isConfirmingSave}
        onClose={() => setIsConfirmingSave(false)}
        onConfirm={executeSaveLR}
        title="Create Loading Receipt"
        message={`Are you sure you want to create a new LR for truck ${form.truckNo} ? `}
        isSaving={loading}
      />

      {/* Edit Modal */}
      <AnimatePresence>
        {editRow && <EditModal row={editRow} openChallans={openChallans} onClose={() => setEditRow(null)} onSave={() => { setEditRow(null); fetchData(); fetchChallans(); }} />}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteRow && <DeleteConfirm row={deleteRow} apiUrl={API} onClose={() => setDeleteRow(null)} onConfirm={() => { setDeleteRow(null); fetchData(); }} />}
      </AnimatePresence>

      {/* Challan Selection Popup */}
      <AnimatePresence>
        {showChalPopup && (
          <ChallanPopup
            brand={brand}
            initialTab={showChalPopup === 'create' ? 'create' : 'select'}
            openChallans={openChallans}
            vehicles={vehicles || []}
            selectedChallans={form.usedChallans}
            onClose={() => setShowChalPopup(false)}
            onRefetch={() => fetchChallans()}
            onToggleSelect={(ch) => {
              const isSelected = form.usedChallans.find(c => c.challanNo === ch.challanNo);
              let newUsed;
              if (isSelected) {
                newUsed = form.usedChallans.filter(c => c.challanNo !== ch.challanNo);
              } else {
                newUsed = [...form.usedChallans, ch];
              }

              // Remap materials based on latest selected challans
              const combinedMaterials = [];
              newUsed.forEach(c => {
                if (c.materials) {
                  c.materials.forEach(m => {
                    let left = m.totalBags - m.loadedBags;
                    if (left > 0) {
                      // Find if this material type is already in combined; if so just add bags
                      const existing = combinedMaterials.find(cm => cm.type === m.type);
                      if (existing) {
                        existing.bags = String(parseInt(existing.bags || 0) + left);
                        existing.weight = (parseInt(existing.bags) * 0.05).toFixed(2);
                      } else {
                        combinedMaterials.push({ type: m.type, bags: String(left), weight: (left * 0.05).toFixed(2) });
                      }
                    }
                  });
                } else {
                  // legacy fallback
                  const existing = combinedMaterials.find(cm => cm.type === c.material);
                  if (existing) {
                    existing.bags = String(parseInt(existing.bags || 0) + c.quantity);
                    existing.weight = (parseInt(existing.bags) * 0.05).toFixed(2);
                  } else {
                    combinedMaterials.push({ type: c.material, bags: String(c.quantity), weight: (c.quantity * 0.05).toFixed(2) });
                  }
                }
              });

              if (combinedMaterials.length === 0 && newUsed.length === 0) {
                combinedMaterials.push({ type: 'PPC', weight: '', bags: '' });
              }

              setForm({ ...form, usedChallans: newUsed, materials: combinedMaterials });
            }}
            onCreate={async (newChNo) => {
              await fetchChallans();
              // Wait for fetch, then act as if it was selected manually next render, or just switch to select tab
              setShowChalPopup(false);
            }}
          />
        )}
      </AnimatePresence>

      <div>
        <div className="page-hd">
          <div>
            <h1><Receipt size={20} color="#6366f1" /> {brand === 'jkl' ? 'JK Lakshmi Loading Receipt' : 'Loading Receipt'}</h1>
            <p>Create and manage loading receipts</p>
          </div>
          <div className="page-hd-right" style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-p" onClick={() => setShowChalPopup('create')}><Plus size={15} /> Add New Challan</button>
            <button className="btn btn-s" onClick={exportExcel}><Download size={15} /> Export Excel</button>
            <button className="btn btn-s" onClick={dlPDF}><Printer size={15} /> Export PDF</button>
          </div>
        </div>
        <div className="tc-form-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* FORM */}
          <div className="card">
            <div className="card-header">
              <div className="card-title-block">
                <div className="card-icon ci-indigo"><Plus size={17} /></div>
                <div className="card-title-text"><h3>New Entry</h3><p>Fill loading details</p></div>
              </div>
            </div>
            <div className="card-body">
              <form onSubmit={handleFormRequest}>
                <div className="fg fg-2">
                  <div className="field"><label><Calendar size={11} /> Date</label><input className="fi" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                  <div className="field">
                    <label>Truck No. (Auto-suggests from Vehicles)</label>
                    <input className="fi" type="text" placeholder="RJ00 XX 0000" value={form.truckNo} onChange={e => setForm({ ...form, truckNo: e.target.value.toUpperCase() })} required list="truck-list" />
                    <datalist id="truck-list">
                      {vehicles.map(v => <option key={v.id} value={v.truckNo} />)}
                    </datalist>
                  </div>
                  <div className="field"><label><User size={11} /> Party Name</label><input className="fi" type="text" placeholder="Client name" value={form.partyName} onChange={e => setForm({ ...form, partyName: e.target.value })} required /></div>
                  <div className="field">
                    <label><Tag size={11} /> Challan Selection</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setShowChalPopup(true)}
                        style={{
                          padding: '8px 10px', background: form.usedChallans.length > 0 ? 'rgba(245,158,11,0.1)' : 'var(--bg-input)',
                          border: form.usedChallans.length > 0 ? '1px solid rgba(245,158,11,0.3)' : '1px solid var(--border-input)',
                          borderRadius: '8px', color: form.usedChallans.length > 0 ? '#f59e0b' : 'var(--text)',
                          fontSize: '11px', fontWeight: 600, textAlign: 'left', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Tag size={12} opacity={form.usedChallans.length > 0 ? 1 : 0.5} />
                          {form.usedChallans.length > 0 ? `Selected ${form.usedChallans.length} Challan(s)` : '— Select / Create —'}
                        </span>
                        {form.usedChallans.length > 0 && <span style={{ fontSize: '10px', background: 'rgba(245,158,11,0.2)', padding: '2px 6px', borderRadius: '4px' }}>Edit Selection</span>}
                      </button>

                      {form.usedChallans.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {form.usedChallans.map(c => (
                            <div key={c.challanNo} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-input)', border: '1px solid var(--border-input)', padding: '3px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 700 }}>
                              <span style={{ color: '#f59e0b' }}>{c.challanNo}</span>
                              <button type="button" onClick={() => {
                                const newChals = form.usedChallans.filter(uc => uc.challanNo !== c.challanNo);
                                setForm({ ...form, usedChallans: newChals });
                              }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}><X size={10} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <hr className="sep" />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Materials <span style={{ textTransform: 'none', color: '#10b981', marginLeft: '6px' }}>(You can edit quantities for partial loading)</span></span>
                  <button type="button" className="btn btn-g btn-sm" onClick={addMat}><Plus size={13} /> Add</button>
                </div>
                {form.materials.map((m, i) => (
                  <motion.div key={i} className="mat-row" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="mat-row-hd">
                      <span className="mat-lbl">Material #{i + 1}</span>
                      {i > 0 && <button type="button" className="btn btn-d btn-sm btn-icon" onClick={() => removeMat(i)}><Trash2 size={13} /></button>}
                    </div>
                    <div className="fg fg-3">
                      <div className="field"><label>Type</label>
                        <select className="fi" value={m.type} onChange={e => updMat(i, 'type', e.target.value)}>
                          {MATERIALS.map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                      <div className="field"><label>Bags</label><input className="fi" type="number" placeholder="0" value={m.bags} onChange={e => updMat(i, 'bags', e.target.value)} /></div>
                      <div className="field"><label>Weight (MT)</label><input className="fi" type="number" step="0.01" placeholder="0.00" value={m.weight} onChange={e => updMat(i, 'weight', e.target.value)} /></div>
                    </div>
                  </motion.div>
                ))}
                <button type="submit" className="btn btn-p btn-full" disabled={loading}>{loading ? 'Saving...' : 'Save Receipt'}</button>
              </form>
            </div>
          </div>

          {/* LIST */}
          <div className="card">
            <div className="card-header">
              <div className="card-title-block">
                <div className="card-icon ci-indigo"><FileSpreadsheet size={17} /></div>
                <div className="card-title-text" style={{ flex: 1 }}><h3>Recent Receipts</h3><p>{filteredReceipts.length} entries shown</p></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', background: 'var(--bg-tf)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: 1, minWidth: '150px', marginBottom: 0 }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input className="fi" type="text" placeholder="Search LR, truck, party..." value={fSearch} onChange={e => setFSearch(e.target.value)} style={{ paddingLeft: '32px' }} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <input className="fi" type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} title="From Date" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <input className="fi" type="date" value={fTo} onChange={e => setFTo(e.target.value)} title="To Date" />
              </div>
              {(fSearch || fFrom || fTo) && (
                <button className="btn btn-g" onClick={() => { setFSearch(''); setFFrom(''); setFTo(''); }}>Clear Filters</button>
              )}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead><tr>
                  <th>LR No.</th>
                  <th>Vehicle & Party</th>
                  <th>Material & Usage</th>
                  <th className="c">Source Challan</th>
                  <th className="c">Actions</th>
                </tr></thead>
                <tbody>
                  {filteredReceipts.length === 0 ? <tr><td colSpan={5} className="t-empty" style={{ textAlign: 'center', padding: '36px' }}>No receipts found</td></tr>
                    : filteredReceipts.map(lr => (
                      <tr key={lr.id}>
                        <td><span className="t-lr">#{lr.lrNo}</span></td>
                        <td>
                          <div className="t-main">{lr.truckNo}</div>
                          <div className="t-sub">{lr.partyName} · {lr.date}</div>
                        </td>
                        <td>
                          <span className="badge badge-tag">{lr.material}</span>
                          <div className="t-sub">{lr.weight} MT · {lr.totalBags} bags</div>
                        </td>
                        <td className="c">
                          {lr.billing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                              {lr.billing.split(',').map((cNo, idx) => {
                                const ch = allChallans.find(c => c.challanNo === cNo.trim());
                                // Only show the challan if it contains the material of this LR row
                                const hasMaterial = ch && ch.materials ? ch.materials.some(m => m.type === lr.material) : (ch && ch.material === lr.material);
                                if (!hasMaterial && lr.billing.includes(',')) return null; // Hide if multi-challan and this one doesn't match

                                return (
                                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span className="badge badge-y" style={{ fontFamily: 'monospace', fontWeight: 800 }}>{cNo.trim()}</span>
                                    {ch && ch.date && (
                                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                        {new Date(ch.date).toLocaleDateString('en-GB').replace(/\//g, '-')}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : <span className="badge badge-n">None</span>}
                        </td>
                        <td className="c">
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button className="btn btn-g btn-icon" title={`Print LR #${lr.lrNo} `} onClick={() => printReceipt(receipts, lr.lrNo, allChallans)}>
                              <Printer size={14} />
                            </button>
                            <button className="btn btn-g btn-icon" title="Edit" onClick={() => setEditRow(lr)}>
                              <Pencil size={14} />
                            </button>
                            {role === 'admin' && (
                              <button className="btn btn-d btn-icon" title="Delete" onClick={() => setDeleteRow(lr)}>
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}