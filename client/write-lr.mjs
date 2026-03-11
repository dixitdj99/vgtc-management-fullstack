import { writeFileSync } from 'fs';

const code = `import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Printer, FileSpreadsheet, Check, X, Receipt, Calendar, User, Tag, Pencil, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';

const API      = 'http://localhost:5000/api/lr';
const API_CHAL = 'http://localhost:5000/api/stock/challans';
const MATERIALS = ['PPC', 'OPC43', 'Adstar', 'Opc FS', 'Opc 53 FS', 'Weather'];

/* ── Print helper ── */
function printReceipt(allRows, lrNo) {
  const rows = allRows.filter(r => r.lrNo === lrNo);
  if (!rows.length) return;
  const base = rows[0];
  const materialsHtml = rows.map(m => \`
    <tr>
      <td style="padding:5px 10px;border:1px solid #ccc;">\${m.material}</td>
      <td style="padding:5px 10px;border:1px solid #ccc;text-align:center;">\${m.totalBags}</td>
      <td style="padding:5px 10px;border:1px solid #ccc;text-align:center;">\${Number(m.weight).toFixed(2)} MT</td>
    </tr>\`).join('');
  const totalBags   = rows.reduce((s, r) => s + (parseFloat(r.totalBags) || 0), 0);
  const totalWeight = rows.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0).toFixed(2);
  const challanLine = base.billing ? \`<div class="row"><span><span class="lbl">Challan:</span> <strong>\${base.billing}</strong></span></div>\` : '';
  const html = \`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>LR #\${lrNo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;padding:10mm}
.slip{width:148mm;margin:0 auto;border:2px solid #000;padding:10mm}
h1{font-size:17px;text-align:center;font-weight:900;letter-spacing:2px}
.sub{text-align:center;font-size:10px;color:#555;margin:2px 0 8px}
.div{border-top:1px dashed #000;margin:7px 0}
.row{display:flex;justify-content:space-between;margin-bottom:5px}
.lbl{font-weight:bold}
table{width:100%;border-collapse:collapse;margin-top:8px}
th{padding:5px 10px;background:#eee;border:1px solid #ccc;font-size:11px}
.c{text-align:center}.tot td{font-weight:bold;background:#f5f5f5}
.sig{display:flex;justify-content:space-between;margin-top:20px;font-size:11px}
.sl{border-top:1px solid #000;padding-top:4px;min-width:100px;text-align:center}
@media print{body{padding:0}}
</style></head>
<body><div class="slip">
<h1>J.K CEMENT</h1>
<div class="sub">Vikas Goods Transport — Loading Receipt</div>
<div class="div"></div>
<div class="row"><span><span class="lbl">LR No.:</span> #\${lrNo}</span><span><span class="lbl">Date:</span> \${base.date}</span></div>
<div class="row"><span><span class="lbl">Truck:</span> \${base.truckNo}</span></div>
<div class="row"><span><span class="lbl">Party:</span> \${base.partyName}</span></div>
\${challanLine}
<div class="div"></div>
<table>
<thead><tr><th>Material</th><th class="c">Bags</th><th class="c">Weight (MT)</th></tr></thead>
<tbody>
\${materialsHtml}
<tr class="tot">
<td style="padding:5px 10px;border:1px solid #ccc">TOTAL</td>
<td style="padding:5px 10px;border:1px solid #ccc;text-align:center">\${totalBags}</td>
<td style="padding:5px 10px;border:1px solid #ccc;text-align:center">\${totalWeight} MT</td>
</tr></tbody></table>
<div class="div"></div>
<div class="sig"><div class="sl">Driver</div><div class="sl">Loader</div><div class="sl">Authorised Sign</div></div>
</div>
<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
</body></html>\`;
  const win = window.open('', '_blank', 'width=650,height=540');
  win.document.write(html); win.document.close();
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
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.patch(API + '/' + row.id, form);
      onSave();
    } catch { alert('Update failed'); } finally { setSaving(false); }
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
              <input className="fi" type="text" value={form.truckNo} onChange={e => S('truckNo', e.target.value)} />
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
          <button className="btn btn-g" onClick={onClose}>Cancel</button>
          <button className="btn btn-p" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : <><Check size={14} /> Save Changes</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Delete Confirmation Modal ── */
function DeleteConfirm({ row, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const handleDelete = async () => {
    setDeleting(true);
    try { await axios.delete(API + '/' + row.id); onConfirm(); }
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
export default function LRModule({ role = 'user' }) {
  const [receipts,     setReceipts]     = useState([]);
  const [openChallans, setOpenChallans] = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [editRow,      setEditRow]      = useState(null);
  const [deleteRow,    setDeleteRow]    = useState(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    truckNo: '', partyName: '', billing: '',
    materials: [{ type: 'PPC', weight: '', bags: '' }],
  });

  useEffect(() => { fetchData(); fetchChallans(); }, []);

  const fetchData = async () => {
    try {
      const data = (await axios.get(API)).data;
      setReceipts([...data].sort((a, b) => b.lrNo - a.lrNo));
    } catch { }
  };

  const fetchChallans = async () => {
    try {
      const data = (await axios.get(API_CHAL)).data;
      setOpenChallans(data.filter(c => c.status === 'open'));
    } catch { }
  };

  const updMat = (i, field, val) => {
    const m = [...form.materials]; m[i] = { ...m[i], [field]: val };
    if (field === 'bags' && val) m[i].weight = (parseFloat(val) * 0.05).toFixed(2);
    setForm({ ...form, materials: m });
  };
  const addMat    = () => setForm({ ...form, materials: [...form.materials, { type: 'PPC', weight: '', bags: '' }] });
  const removeMat = idx => setForm({ ...form, materials: form.materials.filter((_, i) => i !== idx) });

  const handleSubmit = async e => {
    e.preventDefault(); setLoading(true);
    try {
      const res = await axios.post(API, form);
      // Auto-mark the selected challan as loaded
      if (form.billing) {
        const challan = openChallans.find(c => c.challanNo === form.billing);
        if (challan) {
          await axios.patch(API_CHAL.replace('/challans', '') + '/challans/' + challan.id, { status: 'loaded' });
        }
      }
      alert('Receipt #' + res.data.lrNo + ' created!');
      fetchData(); fetchChallans();
      setForm({ date: new Date().toISOString().split('T')[0], truckNo: '', partyName: '', billing: '', materials: [{ type: 'PPC', weight: '', bags: '' }] });
    } catch { alert('Error creating receipt'); } finally { setLoading(false); }
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(receipts.map(r => ({ LR_No: r.lrNo, Date: r.date, Truck: r.truckNo, Material: r.material, Weight_MT: r.weight, Bags: r.totalBags, Party: r.partyName, Challan: r.billing || '' })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'LRs');
    XLSX.writeFile(wb, 'VGTC_Receipts.xlsx');
  };

  return (
    <>
      {/* Edit Modal */}
      <AnimatePresence>
        {editRow && <EditModal row={editRow} openChallans={openChallans} onClose={() => setEditRow(null)} onSave={() => { setEditRow(null); fetchData(); fetchChallans(); }} />}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteRow && <DeleteConfirm row={deleteRow} onClose={() => setDeleteRow(null)} onConfirm={() => { setDeleteRow(null); fetchData(); }} />}
      </AnimatePresence>

      <div>
        <div className="page-hd">
          <div>
            <h1><Receipt size={20} color="#6366f1" /> Loading Receipt</h1>
            <p>Create and manage loading receipts</p>
          </div>
          <div className="page-hd-right">
            <button className="btn btn-s" onClick={exportExcel}><FileSpreadsheet size={15} /> Export Excel</button>
          </div>
        </div>
        <div className="two-col tc-form-list">
          {/* FORM */}
          <div className="card">
            <div className="card-header">
              <div className="card-title-block">
                <div className="card-icon ci-indigo"><Plus size={17} /></div>
                <div className="card-title-text"><h3>New Entry</h3><p>Fill loading details</p></div>
              </div>
            </div>
            <div className="card-body">
              <form onSubmit={handleSubmit}>
                <div className="fg fg-2">
                  <div className="field"><label><Calendar size={11} /> Date</label><input className="fi" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                  <div className="field"><label>Truck No.</label><input className="fi" type="text" placeholder="RJ00 XX 0000" value={form.truckNo} onChange={e => setForm({ ...form, truckNo: e.target.value })} required /></div>
                  <div className="field"><label><User size={11} /> Party Name</label><input className="fi" type="text" placeholder="Client name" value={form.partyName} onChange={e => setForm({ ...form, partyName: e.target.value })} required /></div>
                  <div className="field">
                    <label><Tag size={11} /> Challan</label>
                    <select className="fi" value={form.billing} onChange={e => setForm({ ...form, billing: e.target.value })}>
                      <option value="">— No Challan —</option>
                      {openChallans.map(c => (
                        <option key={c.id} value={c.challanNo}>
                          {c.challanNo} — {c.truckNo} ({c.material}, {c.quantity} bags)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <hr className="sep" />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Materials</span>
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
                <div className="card-title-text"><h3>Recent Receipts</h3><p>{receipts.length} entries · latest first</p></div>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead><tr>
                  <th>LR No.</th>
                  <th>Vehicle & Party</th>
                  <th>Material</th>
                  <th className="c">Challan</th>
                  <th className="c">Actions</th>
                </tr></thead>
                <tbody>
                  {receipts.length === 0 && <tr><td colSpan={5} className="t-empty">No receipts yet</td></tr>}
                  {receipts.map(lr => (
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
                        {lr.billing
                          ? <span className="badge badge-y" style={{fontFamily:'monospace',fontWeight:800}}>{lr.billing}</span>
                          : <span className="badge badge-n">None</span>}
                      </td>
                      <td className="c">
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button className="btn btn-g btn-icon" title={\`Print LR #\${lr.lrNo}\`} onClick={() => printReceipt(receipts, lr.lrNo)}>
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
}`;

writeFileSync('B:/VGTC Managemet/client/src/modules/LRModule.jsx', code, 'utf8');
console.log('LRModule.jsx written:', code.length, 'chars');
