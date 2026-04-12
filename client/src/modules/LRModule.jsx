import React, { useState, useEffect, useMemo, useRef } from 'react';
import ax from '../api';
import { validateTruckNo, cleanTruckNo } from '../utils/vehicleUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Calendar, Check, Download, Edit3, FileSpreadsheet, MapPin, MessageSquare, Mic, MicOff, Package, Pencil, Play, Pause, Plus, Printer, Receipt, Search, Tag, Trash2, User, Volume2, X, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import ConfirmSaveModal from '../components/ConfirmSaveModal';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import ColumnFilter from '../components/ColumnFilter';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 20;

const BASE_API = ``;
const MATS_DUMP_FALLBACK = ['PPC', 'OPC43', 'Adstar', 'Opc FS', 'Opc 53 FS', 'Weather'];
const MATS_JKL_FALLBACK = ['PPC', 'OPC43', 'Pro+'];

// validateTruckNo and cleanTruckNo imported from ../utils/vehicleUtils

/* ── Print helper ── */
function printReceipt(allRows, lrNo, allChallans = []) {
  const rows = allRows.filter(r => r.lrNo === lrNo);
  if (!rows.length) return;
  const base = rows[0];
  const materialsHtml = rows.map(m => `
    <tr>
      <td style="padding:5px 10px;border:1px solid #ccc;">${m.material}</td>
      <td style="padding:5px 10px;border:1px solid #ccc;text-align:center;">
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;
          background:${m.loadingType === 'Crossing' ? '#fef3c7' : '#dcfce7'};
          color:${m.loadingType === 'Crossing' ? '#92400e' : '#166534'};
          border:1px solid ${m.loadingType === 'Crossing' ? '#fcd34d' : '#86efac'}">
          ${m.loadingType || 'From Godown'}
        </span>
      </td>
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
        <thead><tr><th>Material</th><th style="text-align:center;">Loading Type</th><th style="text-align:center;">Bags</th><th style="text-align:center;">Weight (MT)</th></tr></thead>
        <tbody>
          ${materialsHtml}
          <tr class="tot">
            <td colspan="2" style="text-align:right;">Total</td>
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
function EditModal({ row, openChallans, allChallans, vehicles, onClose, onSave, brand, stockMap = {} }) {
  const [form, setForm] = useState({
    lrNo: row.lrNo,
    date: row.date,
    truckNo: row.truckNo,
    partyName: row.partyName,
    billing: row.billing || '',
    usedChallans: [], // Resolved below
    material: row.material,
    weight: row.weight,
    totalBags: row.totalBags,
    destination: row.destination || '',
    loadingType: row.loadingType || 'From Godown',
    note: row.note || '',
    voiceMessageBase64: row.voiceMessageBase64 || '',
  });
  const [loading, setLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showChalPopup, setShowChalPopup] = useState(false);

  // Voice recording inside EditModal
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState('');
  const [voicePreviewAudio, setVoicePreviewAudio] = useState(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setVoicePreviewUrl(url);
        const reader = new FileReader();
        reader.onloadend = () => {
          const b64 = reader.result.split(',')[1];
          setForm(f => ({ ...f, voiceMessageBase64: b64 }));
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current = mr; mr.start(); setIsRecording(true);
    } catch { alert('Mic access denied'); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const playPreview = () => {
    if (!voicePreviewUrl) return;
    if (voicePreviewAudio) { voicePreviewAudio.pause(); setVoicePreviewAudio(null); setIsPlayingPreview(false); return; }
    const audio = new Audio(voicePreviewUrl);
    setVoicePreviewAudio(audio); setIsPlayingPreview(true); audio.play();
    audio.onended = () => { setIsPlayingPreview(false); setVoicePreviewAudio(null); };
  };

  const clearVoice = () => {
    if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
    setVoicePreviewUrl('');
    setForm(f => ({ ...f, voiceMessageBase64: '' }));
  };

  // Resolution of usedChallans on mount
  useEffect(() => {
    if (row.billing && allChallans.length > 0) {
      const nos = row.billing.split(',').map(s => s.trim());
      const resolved = allChallans.filter(c => nos.includes(c.challanNo));
      setForm(f => ({ ...f, usedChallans: resolved }));
    }
  }, [row.billing, allChallans]);

  const MATERIALS = row.brandMats || (brand === 'jkl' ? MATS_JKL_FALLBACK : MATS_DUMP_FALLBACK);
  let ENDPOINT;
  if (brand === 'jkl') ENDPOINT = `${BASE_API}/jkl/stock/challans`;
  else if (brand === 'kosli') ENDPOINT = `${BASE_API}/kosli/stock/challans`;
  else if (brand === 'jhajjar') ENDPOINT = `${BASE_API}/jhajjar/stock/challans`;
  else ENDPOINT = `${BASE_API}/stock/challans`;

  const executeSave = async () => {
    setIsConfirming(false);

    // 1. Strict Quantity Validation
    const lrBags = parseInt(form.totalBags || 0);
    let totalChallanBags = 0;
    
    form.usedChallans.forEach(c => {
      if (c.materials) {
        const mat = c.materials.find(m => m.type === form.material);
        if (mat) {
           totalChallanBags += (mat.totalBags - (mat.loadedBags || 0));
           if (row.billing.includes(c.challanNo) && row.material === form.material) {
             totalChallanBags += parseInt(row.totalBags || 0);
           }
        }
      } else if (c.material === form.material) {
        totalChallanBags += (parseInt(c.quantity || 0) - (c.loadedBags || 0));
        if (row.billing.includes(c.challanNo) && row.material === form.material) {
           totalChallanBags += parseInt(row.totalBags || 0);
        }
      }
    });

    if (form.usedChallans.length > 0 && lrBags > totalChallanBags) {
       alert(`Not Enough Bags!\nLoading Receipt has ${lrBags} bags, but selected challans only provide ${totalChallanBags} bags of ${form.material}.\n\nPlease select more challans or reduce LR bags.`);
       return;
    }

    setLoading(true);
    const oldBags = parseInt(row.totalBags || 0);
    const newBags = parseInt(form.totalBags || 0);
    
    // Validate physical stock
    if (form.material === row.material) {
      if (newBags > oldBags) {
        const extraNeeded = newBags - oldBags;
        const limit = stockMap[form.material]?.physical || 0;
        if (extraNeeded > limit) {
          alert(`Low Stock! Cannot increase loading receipt.\nYou need ${extraNeeded} more bags of ${form.material}, but only ${limit} bags are physically available.`);
          setLoading(false);
          return;
        }
      }
    } else {
      const limit = stockMap[form.material]?.physical || 0;
      if (newBags > limit) {
        alert(`Low Stock! Cannot change material type to ${form.material}.\nYou need ${newBags} bags of ${form.material}, but only ${limit} bags are physically available.`);
        setLoading(false);
        return;
      }
    }

    try {
      const finalBilling = form.usedChallans.map(c => c.challanNo).join(', ');
      const payload = { ...form, billing: finalBilling };
      delete payload.usedChallans; // remove UI state
      if (!payload.voiceMessageBase64) payload.voiceMessageBase64 = row.voiceMessageBase64 || "";
      
      let SYNC_API;
      if (brand === 'jkl') SYNC_API = `${BASE_API}/jkl/stock/sync-lr`;
      else if (brand === 'kosli') SYNC_API = `${BASE_API}/kosli/stock/sync-lr`;
      else if (brand === 'jhajjar') SYNC_API = `${BASE_API}/jhajjar/stock/sync-lr`;
      else SYNC_API = `${BASE_API}/stock/sync-lr`;
      await ax.post(SYNC_API, {
        oldChallanNos: row.billing,
        newChallanNos: finalBilling,
        material: form.material,
        quantity: form.totalBags
      });

      await ax.put(`${ENDPOINT.replace('/stock/challans', '/lr')}/${row.id}`, payload);
      onSave();
    } catch (e) { 
      console.error(e);
      alert('Update failed: ' + (e.response?.data?.error || e.message)); 
    } finally { setLoading(false); }
  };

  const S = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)'
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        style={{ width: '94%', maxWidth: '520px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.6)', overflow: 'hidden' }}
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
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="fg fg-2">
            <div className="field"><label>LR Number</label><input className="fi" type="number" value={form.lrNo} onChange={e => S('lrNo', e.target.value)} /></div>
            <div className="field"><label><Calendar size={11} /> Date</label><input className="fi" type="date" value={form.date} onChange={e => S('date', e.target.value)} /></div>
            <div className="field">
              <label>Truck No.</label>
              <input className="fi" type="text" value={form.truckNo} onChange={e => S('truckNo', e.target.value.toUpperCase().replace(/\s/g, ''))} />
            </div>
            <div className="field"><label><User size={11} /> Party Name</label><input className="fi" type="text" value={form.partyName} onChange={e => S('partyName', e.target.value)} /></div>
            <div className="field"><label>Destination</label><input className="fi" type="text" value={form.destination} onChange={e => S('destination', e.target.value)} /></div>
          </div>
          <hr className="sep" style={{ margin: '4px 0' }} />
          <div className="fg fg-3">
            <div className="field">
              <label>
                Material
                {form.billing && form.billing !== 'No' && (
                  <span style={{ color: '#f59e0b', marginLeft: '6px', fontSize: '9px', textTransform: 'none', background: 'rgba(245,158,11,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                    Challan: {form.billing}
                  </span>
                )}
              </label>
              <select className="fi" value={form.material} onChange={e => S('material', e.target.value)}>
                {MATERIALS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Loading Type</label>
              <select className="fi" value={form.loadingType} onChange={e => S('loadingType', e.target.value)}>
                <option value="From Godown">From Godown</option>
                <option value="Crossing">Crossing</option>
              </select>
            </div>
            <div className="field">
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Bags</span>
                <span style={{ color: '#10b981', fontSize: '9px', fontWeight: 800 }}>STOCK: {stockMap[form.material]?.physical || 0}</span>
              </label>
              <input className="fi" type="number" value={form.totalBags} onChange={e => {
                const bags = e.target.value;
                setForm(f => ({ ...f, totalBags: bags, weight: bags ? (parseFloat(bags) * 0.05).toFixed(2) : '' }));
              }} />
            </div>
            <div className="field"><label>Weight (MT)</label><input className="fi" type="number" step="0.01" value={form.weight} onChange={e => S('weight', e.target.value)} /></div>
          </div>
          
          <div className="field">
            <label><Tag size={11} /> Challan Selection</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button type="button" onClick={() => setShowChalPopup(true)} style={{ padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f1f5f9', fontSize: '12px', fontWeight: 600, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                   <Tag size={14} color="#f59e0b" />
                   {form.usedChallans.length > 0 ? `${form.usedChallans.length} Challan(s) Selected` : '— Select —'}
                </span>
                <Pencil size={12} opacity={0.5} />
              </button>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {form.usedChallans.map(c => (
                  <div key={c.challanNo} style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', padding: '4px 10px', borderRadius: '12px', fontSize: '10px', fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {c.challanNo}
                    <X size={10} style={{ cursor: 'pointer' }} onClick={() => setForm(f => ({ ...f, usedChallans: f.usedChallans.filter(uc => uc.challanNo !== c.challanNo) }))} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <hr className="sep" style={{ margin: '4px 0' }} />
          
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><MessageSquare size={11} /> Note for Labour</label>
            <textarea className="fi" rows={2} placeholder="Add instructions..." value={form.note} onChange={e => S('note', e.target.value)} style={{ resize: 'vertical', minHeight: '60px' }} />
          </div>

          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Volume2 size={11} /> Voice Message</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {!isRecording ? (
                <button type="button" onClick={startRecording} className="btn btn-g btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.25)' }}>
                  <Mic size={13} /> {voicePreviewUrl || form.voiceMessageBase64 ? 'Change Voice' : 'Record Voice'}
                </button>
              ) : (
                <button type="button" onClick={stopRecording} className="btn btn-d btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', animation: 'pulse 1s infinite' }}>
                  <MicOff size={13} /> Stop Recording
                </button>
              )}
              {(voicePreviewUrl || form.voiceMessageBase64) && !isRecording && (
                <>
                  <button type="button" onClick={playPreview} className="btn btn-g btn-sm">
                    {isPlayingPreview ? <Pause size={12} /> : <Play size={12} />}
                  </button>
                  <button type="button" onClick={clearVoice} className="btn btn-d btn-sm"><X size={12} /></button>
                  <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 700 }}>✓ Voice Attached</span>
                </>
              )}
              {isRecording && <span style={{ fontSize: '10px', color: '#f43f5e', fontWeight: 700 }}>Recording...</span>}
            </div>
          </div>
        </div>

        {/* Modal footer */}
        <div style={{ display: 'flex', gap: '10px', padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.07)', justifyContent: 'flex-end' }}>
          <button className="btn btn-g" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-p" onClick={() => setIsConfirming(true)} disabled={loading}>
            {loading ? <Loader2 size={14} className="spin" /> : <><Check size={14} /> Save Changes</>}
          </button>
        </div>

        {showChalPopup && (
           <ChallanPopup 
             brand={brand} openChallans={openChallans} vehicles={vehicles} 
             selectedChallans={form.usedChallans} 
             onClose={() => setShowChalPopup(false)}
             onToggleSelect={(ch) => {
                const isSelected = form.usedChallans.find(c => c.challanNo === ch.challanNo);
                if (isSelected) {
                   setForm(f => ({ ...f, usedChallans: f.usedChallans.filter(uc => uc.challanNo !== ch.challanNo) }));
                } else {
                   if (form.truckNo && ch.truckNo !== form.truckNo) {
                      if (!window.confirm(`Warning: Challan is for vehicle ${ch.truckNo}, but LR is for ${form.truckNo}. Use anyway?`)) return;
                   }
                   setForm(f => ({ ...f, usedChallans: [...f.usedChallans, ch] }));
                }
             }}
           />
        )}
      </motion.div>
      <ConfirmSaveModal isOpen={isConfirming} onClose={() => setIsConfirming(false)} onConfirm={executeSave} title="Save Changes" message="Update this loading receipt?" isSaving={loading} />
    </div>
  );
}

/* ── Challan Popup Modal ── */
function ChallanPopup({ openChallans, selectedChallans, onClose, onToggleSelect, brand, vehicles = [], initialTab = 'select', preFill = null, onRefetch, onCreated }) {
  const [tab, setTab] = useState(initialTab); // 'select' | 'create'

  // For 'create' tab
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);

  // Use brandMats from parent
  const MATERIALS = vehicles[0]?.brandMats || (brand === 'jkl' ? MATS_JKL_FALLBACK : MATS_DUMP_FALLBACK);
  let ENDPOINT;
  if (brand === 'jkl') ENDPOINT = `${BASE_API}/jkl/stock/challans`;
  else if (brand === 'kosli') ENDPOINT = `${BASE_API}/kosli/stock/challans`;
  else if (brand === 'jhajjar') ENDPOINT = `${BASE_API}/jhajjar/stock/challans`;
  else ENDPOINT = `${BASE_API}/stock/challans`;

  const [chalForm, setChalForm] = useState({
    truckNo: preFill?.truckNo || '',
    date: preFill?.date || new Date().toISOString().split('T')[0],
    material: preFill?.material || MATERIALS[0],
    quantity: preFill?.quantity || '',
    partyName: preFill?.partyName || '',
    destination: preFill?.destination || '',
    remark: preFill?.remark || '',
    challanNo: ''
  });

  const S = (k, v) => setChalForm(f => ({ ...f, [k]: v }));

  const handleCreateRequest = (e) => {
    e.preventDefault();
    if (!chalForm.truckNo) { setErr('Truck number required'); return; }
    if (!validateTruckNo(chalForm.truckNo)) { setErr('Invalid truck format (e.g. RJ07GA1234)'); return; }
    if (!chalForm.quantity || parseFloat(chalForm.quantity) <= 0) { setErr('Enter valid quantity'); return; }
    setErr('');
    setIsConfirming(true);
  };

  const executeCreate = async () => {
    setSaving(true); setIsConfirming(false);
    try {
      // Validate duplicate challan number before creating
      if (chalForm.challanNo && chalForm.challanNo.trim()) {
        const existing = await ax.get(ENDPOINT).catch(() => ({ data: [] }));
        const dup = existing.data.find(c => c.challanNo === chalForm.challanNo.trim());
        if (dup) {
          setErr(`Challan number "${chalForm.challanNo.trim()}" already exists. Use a different number or leave blank for auto-generation.`);
          setSaving(false);
          return;
        }
      }
      const res = await ax.post(ENDPOINT, chalForm);
      const created = res.data;
      // Go back to select tab so user can see newly created challan
      setTab('select');
      setChalForm({ truckNo: '', date: new Date().toISOString().split('T')[0], material: MATERIALS[0], quantity: '', partyName: '', destination: '', remark: '', challanNo: '' });
      // Notify parent to refetch challans
      if (onRefetch) onRefetch();
      // Pass full challan object (with quantity) to parent
      if (onCreated) onCreated(created.challanNo, parseInt(chalForm.quantity) || 0);
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
        style={{ width: '94%', maxWidth: '560px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.6)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}
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
                            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                              {c.partyName || 'No Party'} {c.destination ? ` · ${c.destination}` : ''} · {new Date(c.date).toLocaleDateString('en-IN')}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {c.materials ? (
                              c.materials.map((m, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(99,102,241,0.1)', padding: '2px 6px', borderRadius: '4px', color: '#818cf8', fontSize: '10px', fontWeight: 700 }}>
                                    <Package size={10} /> {m.type}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>
                                    {m.totalBags - m.loadedBags} bags <span style={{ opacity: 0.7 }}>({((m.totalBags - m.loadedBags) * 0.05).toFixed(2)} MT)</span> left
                                  </div>
                                </div>
                              ))
                            ) : (
                              // legacy fallback rendering
                              <>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(99,102,241,0.1)', padding: '4px 8px', borderRadius: '6px', color: '#818cf8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                                  <Package size={12} /> {c.material}
                                </div>
                                 <div style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 700 }}>
                                   {c.quantity} bags <span style={{ opacity: 0.7 }}>({(c.quantity * 0.05).toFixed(2)} MT)</span>
                                 </div>
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
                  <div className="field">
                    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Challan No. (Manual No / LR No)</span>
                      <span style={{ fontSize: '9px', fontWeight: 800, color: '#f59e0b' }}>OPTIONAL — Leave blank for auto-gen</span>
                    </label>
                    <input className="fi" type="text" placeholder="e.g. 1234 or LR-501" value={chalForm.challanNo} onChange={e => S('challanNo', e.target.value)} />
                  </div>
                  <div className="fg fg-2">
                    <div className="field">
                      <label>Truck No. *</label>
                      <input className="fi" type="text" placeholder="GJ01AB1234" value={chalForm.truckNo} onChange={e => S('truckNo', e.target.value.toUpperCase().replace(/\s/g, ''))} required list="chal-truck-list" />
                      <datalist id="chal-truck-list">
                        {vehicles.map(v => <option key={v.id} value={v.truckNo} />)}
                      </datalist>
                      {!validateTruckNo(chalForm.truckNo) && chalForm.truckNo && <div style={{color: '#f43f5e', fontSize: '9px', fontWeight: 800, marginTop: '4px'}}>Invalid format (e.g. RJ07GA1234 or HR361234)</div>}
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
                      {chalForm.quantity && <div style={{ fontSize: '10px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>= {(chalForm.quantity * 0.05).toFixed(2)} MT</div>}
                    </div>
                  </div>
                  <div className="fg fg-2">
                    <div className="field">
                      <label><User size={11} /> Party Name</label>
                      <input className="fi" type="text" placeholder="Customer name" value={chalForm.partyName} onChange={e => S('partyName', e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Destination</label>
                      <input className="fi" type="text" placeholder="Delivery location" value={chalForm.destination} onChange={e => S('destination', e.target.value)} />
                    </div>
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
            <button type="submit" form="createChalForm" className="btn btn-p" disabled={saving} title="Create Challan">
              {saving ? <Loader2 size={14} className="spin" /> : <><Tag size={14} /> Create Challan</>}
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
    try {
      // Refund stock first
      let SYNC_API;
      if (apiUrl.includes('/jkl/lr')) SYNC_API = `${BASE_API}/jkl/stock/sync-lr`;
      else if (apiUrl.includes('/kosli/lr')) SYNC_API = `${BASE_API}/kosli/stock/sync-lr`;
      else if (apiUrl.includes('/jhajjar/lr')) SYNC_API = `${BASE_API}/jhajjar/stock/sync-lr`;
      else SYNC_API = `${BASE_API}/stock/sync-lr`;
      if (row.billing) {
        await ax.post(SYNC_API, {
          oldChallanNos: row.billing,
          newChallanNos: "",
          material: row.material,
          quantity: row.totalBags
        });
      }
      await ax.delete(apiUrl + '/' + row.id);
      onConfirm();
    } catch (e) { 
      console.error(e);
      alert('Delete failed: ' + (e.response?.data?.error || e.message)); 
    } finally { setDeleting(false); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }}
        style={{ width: '90%', maxWidth: '380px', background: '#0f172a', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.6)', padding: '28px 24px', textAlign: 'center' }}
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
          <button className="btn btn-d" onClick={handleDelete} disabled={deleting} title="Confirm Delete">
            {deleting ? <Loader2 size={13} className="spin" /> : <><Trash2 size={13} /> Delete</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Main LR Module ── */
export default function LRModule({ role = 'user', brand = 'dump', permissions = {} }) {
  // canEdit: true if admin, or if the specific brand permission OR generic 'lr' permission is 'edit'
  const lrKey = brand === 'kosli' ? 'lr_kosli' : brand === 'jhajjar' ? 'lr_jhajjar' : 'lr_jkl';
  const canEdit = role === 'admin' || permissions?.[lrKey] === 'edit' || permissions?.lr === 'edit';

  let API, API_STOCK;
  if (brand === 'jkl') {
    API = `${BASE_API}/jkl/lr`;
    API_STOCK = `${BASE_API}/jkl/stock`;
  } else if (brand === 'kosli') {
    API = `${BASE_API}/kosli/lr`;
    API_STOCK = `${BASE_API}/kosli/stock`;
  } else if (brand === 'jhajjar') {
    API = `${BASE_API}/jhajjar/lr`;
    API_STOCK = `${BASE_API}/jhajjar/stock`;
  } else {
    API = `${BASE_API}/lr`;
    API_STOCK = `${BASE_API}/stock`;
  }
  const API_CHAL = `${API_STOCK}/challans`;
  
  const [materialObjs, setMaterialObjs] = useState([]);
  const MATERIALS = materialObjs.length > 0 ? materialObjs.map(m => m.name) : (brand === 'jkl' ? MATS_JKL_FALLBACK : MATS_DUMP_FALLBACK);

  const [receipts, setReceipts] = useState([]);
  const [openChallans, setOpenChallans] = useState([]);
  const [allChallans, setAllChallans] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [additions, setAdditions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showChalPopup, setShowChalPopup] = useState(false);
  const [chalPreFill, setChalPreFill] = useState(null);
  const [linkingLrId, setLinkingLrId] = useState(null);
  const [isConfirmingSave, setIsConfirmingSave] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    truckNo: '', partyName: '',
    destination: '',
    note: '',
    voiceMessageBase64: '',
    usedChallans: [], // array of selected challan objects
    materials: [{ type: MATERIALS[0], loadingType: 'From Godown', weight: '', bags: '', billing: 'No' }],
  });

  // ── Voice Recording State ──────────────────────────────
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState('');
  const [voicePreviewAudio, setVoicePreviewAudio] = useState(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setVoicePreviewUrl(url);
        // Convert to base64
        const reader = new FileReader();
        reader.onloadend = () => {
          const b64 = reader.result.split(',')[1];
          setForm(f => ({ ...f, voiceMessageBase64: b64 }));
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
    } catch (e) {
      alert('Microphone access denied. Please allow mic access to record.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const playPreview = () => {
    if (!voicePreviewUrl) return;
    if (voicePreviewAudio) { voicePreviewAudio.pause(); setVoicePreviewAudio(null); setIsPlayingPreview(false); return; }
    const audio = new Audio(voicePreviewUrl);
    setVoicePreviewAudio(audio);
    setIsPlayingPreview(true);
    audio.play();
    audio.onended = () => { setIsPlayingPreview(false); setVoicePreviewAudio(null); };
  };

  const clearVoice = () => {
    if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
    setVoicePreviewUrl('');
    setForm(f => ({ ...f, voiceMessageBase64: '' }));
  };

  /* Excel-style filters */
  const [filters, setFilters] = useState({});
  const handleFilterChange = (key, val) => {
    setFilters(f => ({ ...f, [key]: val }));
    setCurrentPage(1);
  };

  const fetchData = async () => {
    try {
      const data = (await ax.get(API)).data;
      setReceipts([...data].sort((a, b) => b.lrNo - a.lrNo));
    } catch { }
  };

  const fetchChallans = async () => {
    try {
      const data = (await ax.get(API_CHAL)).data;
      setAllChallans(data);
      setOpenChallans(data.filter(c => c.status === 'open' || c.status === 'partially_loaded'));
    } catch { }
  };

  const fetchVehicles = async () => {
    try {
      const data = (await ax.get(`/vehicles`)).data;
      setVehicles(data);
    } catch { }
  };

  const fetchAdditions = async () => {
    try {
      const data = (await ax.get(`${API_STOCK}/additions`)).data;
      setAdditions(data);
    } catch { }
  };

  const fetchMaterials = async () => {
    try {
       const data = (await ax.get(`${API_STOCK}/materials/list`)).data;
       if (data && data.length > 0) setMaterialObjs(data);
    } catch { }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchData(), fetchChallans(), fetchVehicles(), fetchAdditions(), fetchMaterials()]).finally(() => setLoading(false));
    setCurrentPage(1);
  }, [brand]);

  const stockMap = useMemo(() => {
    const m = {};
    MATERIALS.forEach(mat => {
      const added = additions.filter(a => a.material === mat).reduce((s, a) => s + (parseFloat(a.quantity) || 0), 0);
      const consumedRows = receipts.filter(l => l.material === mat);
      const totalLoaded = consumedRows.reduce((s, l) => s + (parseInt(l.totalBags) || 0), 0);

      // Pending = bags not yet covered by any challan (includes fully uncovered AND partially covered LRs)
      let pending = 0;
      consumedRows.forEach(l => {
        const lrBags = parseInt(l.totalBags) || 0;
        if (!l.billing || l.billing === 'No') {
          pending += lrBags;
        } else {
          let covered = 0;
          l.billing.split(',').forEach(cNo => {
            const ch = allChallans.find(c => c.challanNo === cNo.trim());
            if (ch) {
              if (ch.materials) {
                const matEntry = ch.materials.find(mo => mo.type === mat);
                if (matEntry) covered += (matEntry.totalBags || 0);
              } else if (ch.material === mat) {
                covered += parseInt(ch.quantity || 0);
              }
            }
          });
          pending += Math.max(0, lrBags - covered);
        }
      });

      m[mat] = {
        physical: added - totalLoaded,
        pendingChallan: pending
      };
    });
    return m;
  }, [additions, receipts, allChallans, MATERIALS]);

  const updMat = (i, field, val) => {
    const m = [...form.materials]; m[i] = { ...m[i], [field]: val };
    if (field === 'bags' && val) m[i].weight = (parseFloat(val) * 0.05).toFixed(2);
    setForm({ ...form, materials: m });
  };
  const addMat = () => setForm({ ...form, materials: [...form.materials, { type: MATERIALS[0], loadingType: 'From Godown', weight: '', bags: '', billing: 'No' }] });
  const removeMat = idx => setForm({ ...form, materials: form.materials.filter((_, i) => i !== idx) });

  const handleFormRequest = e => {
    e.preventDefault();
    if (!validateTruckNo(form.truckNo)) {
      alert('Invalid truck number format. Please enter in GJ01AB1234 format (No spaces).');
      return;
    }
    // Validate physical stock
    for (const mat of form.materials) {
      if (!mat.bags) continue;
      const needed = parseInt(mat.bags);
      const limit = (stockMap[mat.type]?.physical) || 0;
      if (needed > limit) {
        alert(`Low Stock! Cannot create loading receipt.\nYou need ${needed} bags of ${mat.type}, but only ${limit} bags are physically available in the godown.`);
        return;
      }
    }
    setIsConfirmingSave(true);
  };

  const handleChallanCreatedFromLR = async (newChNo, challanQty) => {
    if (!linkingLrId) return;
    setLoading(true);
    try {
      const receipt = receipts.find(r => r.id === linkingLrId);
      if (!receipt) return;

      const lrBags = parseInt(receipt.totalBags || 0);

      // Calculate how many bags are already covered by existing linked challans
      let alreadyCovered = 0;
      if (receipt.billing && receipt.billing !== 'No') {
        receipt.billing.split(',').forEach(cNo => {
          const existCh = allChallans.find(c => c.challanNo === cNo.trim());
          if (existCh) {
            if (existCh.materials) {
              const mat = existCh.materials.find(m => m.type === receipt.material);
              if (mat) alreadyCovered += (mat.totalBags || 0);
            } else if (existCh.material === receipt.material) {
              alreadyCovered += parseInt(existCh.quantity || 0);
            }
          }
        });
      }

      // Only deduct what the LR still needs (not the full challan qty)
      const remainingNeeded = Math.max(0, lrBags - alreadyCovered);
      const toDeduct = Math.min(parseInt(challanQty || 0), remainingNeeded);

      // Build new billing: append to existing billing if already partially linked
      const existingBilling = (receipt.billing && receipt.billing !== 'No') ? receipt.billing : '';
      const newBilling = existingBilling ? `${existingBilling}, ${newChNo}` : newChNo;

      // 1. Update LR billing
      await ax.patch(`${API}/${linkingLrId}/billing`, { billing: newBilling });

      // 2. Sync stock — only deduct the bags the LR actually needs from this challan
      let SYNC_API;
      if (brand === 'jkl') SYNC_API = `${BASE_API}/jkl/stock/sync-lr`;
      else if (brand === 'kosli') SYNC_API = `${BASE_API}/kosli/stock/sync-lr`;
      else if (brand === 'jhajjar') SYNC_API = `${BASE_API}/jhajjar/stock/sync-lr`;
      else SYNC_API = `${BASE_API}/stock/sync-lr`;
      await ax.post(SYNC_API, {
        oldChallanNos: '',
        newChallanNos: newChNo,
        material: receipt.material,
        quantity: toDeduct
      });

      const stillRemaining = lrBags - alreadyCovered - toDeduct;
      if (stillRemaining > 0) {
        alert(`Challan ${newChNo} created and linked!\n\nCovered: ${toDeduct} bags. Remaining: ${stillRemaining} bag(s) still Challan Pending.`);
      } else {
        alert(`Challan ${newChNo} created and linked to LR! All bags covered.`);
      }
      fetchData();
      fetchChallans();
    } catch (e) {
      alert('Linking failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
      setLinkingLrId(null);
      setChalPreFill(null);
      setShowChalPopup(false);
    }
  };

  const executeSaveLR = async () => {
    setIsConfirmingSave(false);
    
    // 1. Strict Quantity Validation
    for (const m of form.materials) {
      if (m.billing && m.billing !== 'No') {
          const lrBags = parseInt(m.bags || 0);
          let totalChallanBags = 0;
          const nos = m.billing.split(',').map(s => s.trim());
          const used = allChallans.filter(c => nos.includes(c.challanNo));

          used.forEach(c => {
             if (c.materials) {
                const mat = c.materials.find(cm => cm.type === m.type);
                if (mat) totalChallanBags += (mat.totalBags - (mat.loadedBags || 0));
             } else if (c.material === m.type) {
                totalChallanBags += (parseInt(c.quantity || 0) - (c.loadedBags || 0));
             }
          });

          if (lrBags > totalChallanBags) {
             alert(`Not Enough Bags in ${m.type}!\nLR needs ${lrBags} bags, but selected challan(s) only provide ${totalChallanBags} bags.\n\nPlease fix the bag count or selection.`);
             return;
          }
      }
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        billing: form.usedChallans.map(c => c.challanNo).join(', ')
      };

      const res = await ax.post(API, payload);
      
      let SYNC_API;
      if (brand === 'jkl') SYNC_API = `${BASE_API}/jkl/stock/sync-lr`;
      else if (brand === 'kosli') SYNC_API = `${BASE_API}/kosli/stock/sync-lr`;
      else if (brand === 'jhajjar') SYNC_API = `${BASE_API}/jhajjar/stock/sync-lr`;
      else SYNC_API = `${BASE_API}/stock/sync-lr`;
      for (const m of form.materials) {
        if (m.bags && m.billing && m.billing !== 'No') {
          await ax.post(SYNC_API, {
            oldChallanNos: "",
            newChallanNos: m.billing,
            material: m.type,
            quantity: m.bags
          });
        }
      }

      alert('Receipt #' + res.data.lrNo + ' created!');
      fetchData(); fetchChallans();
      clearVoice();
      setForm({ date: new Date().toISOString().split('T')[0], truckNo: '', partyName: '', destination: '', note: '', voiceMessageBase64: '', usedChallans: [], materials: [{ type: 'PPC', loadingType: 'From Godown', weight: '', bags: '', billing: 'No' }] });

    } catch (e) {
      const errDetails = e.response?.data?.error || e.response?.data || e.message || String(e);
      console.error("LR Create error:", errDetails);
      alert('Error creating receipt: ' + JSON.stringify(errDetails));
    } finally { setLoading(false); }
  };

  const filteredReceipts = useMemo(() => {
    let list = [...receipts];
    
    // Dynamic filtering
    Object.keys(filters).forEach(key => {
        const vals = filters[key];
        if (vals && vals.length > 0) {
            list = list.filter(r => vals.includes(String(r[key] ?? '')));
        }
    });

    return list;
  }, [receipts, filters]);

  // Pagination Logic
  const paginatedReceipts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredReceipts.slice(start, start + PAGE_SIZE);
  }, [filteredReceipts, currentPage]);

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
        {editRow && <EditModal row={{ ...editRow, brandMats: MATERIALS }} brand={brand} openChallans={openChallans} allChallans={allChallans} vehicles={vehicles} stockMap={stockMap} onClose={() => setEditRow(null)} onSave={() => { setEditRow(null); fetchData(); fetchChallans(); }} />}
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
            vehicles={vehicles.length ? vehicles.map(v => ({ ...v, brandMats: MATERIALS })) : [{ brandMats: MATERIALS }]}
            selectedChallans={form.usedChallans}
            preFill={chalPreFill}
            onClose={() => { setShowChalPopup(false); setChalPreFill(null); setLinkingLrId(null); }}
            onRefetch={() => fetchChallans()}
            onCreated={handleChallanCreatedFromLR}
            onToggleSelect={async (ch) => {
              // If we're linking a challan to an EXISTING LR row (from table button), handle separately
              if (linkingLrId) {
                setLoading(true);
                try {
                  const receipt = receipts.find(r => r.id === linkingLrId);
                  if (!receipt) return;

                  // Compute bags this challan can supply for this LR's material
                  let challanBags = 0;
                  if (ch.materials) {
                    const mat = ch.materials.find(m => m.type === receipt.material);
                    if (mat) challanBags = (mat.totalBags || 0) - (mat.loadedBags || 0);
                  } else if (ch.material === receipt.material) {
                    challanBags = parseInt(ch.quantity || 0) - (ch.loadedBags || 0);
                  }

                  // Compute how many bags are ALREADY covered by previously linked challans
                  let alreadyCovered = 0;
                  if (receipt.billing && receipt.billing !== 'No') {
                    receipt.billing.split(',').forEach(cNo => {
                      const existCh = allChallans.find(c => c.challanNo === cNo.trim());
                      if (existCh) {
                        if (existCh.materials) {
                          const mat = existCh.materials.find(m => m.type === receipt.material);
                          if (mat) alreadyCovered += (mat.totalBags || 0);
                        } else if (existCh.material === receipt.material) {
                          alreadyCovered += parseInt(existCh.quantity || 0);
                        }
                      }
                    });
                  }

                  // Only deduct as many bags as the LR still needs — not the full challan capacity
                  const remainingNeeded = Math.max(0, parseInt(receipt.totalBags || 0) - alreadyCovered);
                  const toDeduct = Math.min(challanBags, remainingNeeded);

                  const existingBilling = (receipt.billing && receipt.billing !== 'No') ? receipt.billing : '';
                  const newBilling = existingBilling ? `${existingBilling}, ${ch.challanNo}` : ch.challanNo;

                  // 1. Patch LR billing
                  await ax.patch(`${API}/${linkingLrId}/billing`, { billing: newBilling });

                  // 2. Sync stock (deduct challan bags from open challan)
                  let SYNC_API;
                  if (brand === 'jkl') SYNC_API = `${BASE_API}/jkl/stock/sync-lr`;
                  else if (brand === 'kosli') SYNC_API = `${BASE_API}/kosli/stock/sync-lr`;
                  else if (brand === 'jhajjar') SYNC_API = `${BASE_API}/jhajjar/stock/sync-lr`;
                  else SYNC_API = `${BASE_API}/stock/sync-lr`;
                  await ax.post(SYNC_API, {
                    oldChallanNos: '',
                    newChallanNos: ch.challanNo,
                    material: receipt.material,
                    quantity: toDeduct  // only the bags the LR actually still needs
                  });

                  fetchData(); fetchChallans();
                  setShowChalPopup(false); setChalPreFill(null); setLinkingLrId(null);
                } catch (e) {
                  alert('Linking failed: ' + (e.response?.data?.error || e.message));
                } finally { setLoading(false); }
                return; // stop here — do NOT modify the new-LR form
              }

              // --- New LR creation form flow ---
              const isSelected = form.usedChallans.find(c => c.challanNo === ch.challanNo);
              let newUsed;
              if (isSelected) {
                newUsed = form.usedChallans.filter(c => c.challanNo !== ch.challanNo);
              } else {
                if (form.truckNo && ch.truckNo !== form.truckNo) {
                  const ok = window.confirm(`Warning: This challan is for vehicle ${ch.truckNo}, but the LR is for ${form.truckNo}. \n\nDo you want to use this challan?`);
                  if (!ok) return;
                }
                newUsed = [...form.usedChallans, ch];
              }

              if (newUsed.length > 0 && !form.destination) {
                setForm(f => ({ ...f, destination: newUsed[0].destination || '', usedChallans: newUsed }));
              } else {
                setForm(f => ({ ...f, usedChallans: newUsed }));
              }

              const combinedMaterials = [];
              newUsed.forEach(c => {
                if (c.materials) {
                  c.materials.forEach(m => {
                    const left = m.totalBags - (m.loadedBags || 0);
                    if (left > 0) combinedMaterials.push({ type: m.type, loadingType: 'From Godown', bags: String(left), weight: (left * 0.05).toFixed(2), billing: c.challanNo, partyName: c.partyName || '' });
                  });
                } else {
                  combinedMaterials.push({ type: c.material, loadingType: 'From Godown', bags: String(c.quantity), weight: (c.quantity * 0.05).toFixed(2), billing: c.challanNo, partyName: c.partyName || '' });
                }
              });
              if (combinedMaterials.length === 0 && newUsed.length === 0) {
                combinedMaterials.push({ type: MATERIALS[0], loadingType: 'From Godown', weight: '', bags: '', billing: 'No' });
              }
              setForm({ ...form, usedChallans: newUsed, materials: combinedMaterials });
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
            <button className="btn btn-p" onClick={() => setShowChalPopup('create')} title="Add a new Challan"><Plus size={15} /> Add New Challan</button>
            <button className="btn btn-s" onClick={exportExcel} title="Export to Excel Spreadsheet"><Download size={15} /> Export Excel</button>
            <button className="btn btn-s" onClick={dlPDF} title="Export to PDF Document"><Printer size={15} /> Export PDF</button>
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
                    <input className="fi" type="text" placeholder="e.g. RJ07GA1234" value={form.truckNo} onChange={e => setForm({ ...form, truckNo: cleanTruckNo(e.target.value) })} required list="truck-list" />
                    <datalist id="truck-list">
                      {vehicles.map(v => <option key={v.id} value={v.truckNo} />)}
                    </datalist>
                    {!validateTruckNo(form.truckNo) && form.truckNo && <span style={{color: '#f43f5e', fontSize: '9px', fontWeight: 800, marginTop: '4px', display: 'block'}}>Invalid format (e.g. RJ07GA1234 or HR361234)</span>}
                  </div>
                  <div className="field"><label><User size={11} /> Party Name</label><input className="fi" type="text" placeholder="Client name" value={form.partyName} onChange={e => setForm({ ...form, partyName: e.target.value })} required /></div>
                  <div className="field"><label><MapPin size={11} /> Destination</label><input className="fi" type="text" placeholder="Delivery city" value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} /></div>
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
                  <button type="button" className="btn btn-g btn-sm" onClick={addMat} title="Add Material"><Plus size={13} /> Add</button>
                </div>
                {form.materials.map((m, i) => (
                  <motion.div key={i} className="mat-row" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="mat-row-hd">
                      <span className="mat-lbl">
                        Material #{i + 1}
                        {m.billing && m.billing !== 'No' && (
                          <span style={{ color: '#f59e0b', marginLeft: '8px', fontSize: '9px', textTransform: 'none', background: 'rgba(245,158,11,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                            Challan: {m.billing} • {m.partyName || '—'}
                          </span>
                        )}
                      </span>
                      {i > 0 && <button type="button" className="btn btn-d btn-sm btn-icon" onClick={() => removeMat(i)}><Trash2 size={13} /></button>}
                    </div>
                    <div className="fg" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', display: 'grid', gap: '14px' }}>
                      <div className="field"><label>Type</label>
                        <select className="fi" value={m.type} onChange={e => updMat(i, 'type', e.target.value)}>
                          {MATERIALS.map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>Loading Type</label>
                        <select className="fi" value={m.loadingType} onChange={e => updMat(i, 'loadingType', e.target.value)}>
                          <option value="From Godown">From Godown</option>
                          <option value="Crossing">Crossing</option>
                        </select>
                      </div>
                      <div className="field">
                        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Bags</span>
                          {m.type && (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                               <span style={{ color: '#10b981', fontSize: '9px', fontWeight: 800 }}>
                                 STOCK: {stockMap[m.type]?.physical || 0} bags ({((stockMap[m.type]?.physical || 0) * 0.05).toFixed(2)} MT)
                               </span>
                               <span style={{ color: '#f59e0b', fontSize: '9px', fontWeight: 800 }}>
                                 CHALLAN PENDING: {stockMap[m.type]?.pendingChallan || 0} bags ({((stockMap[m.type]?.pendingChallan || 0) * 0.05).toFixed(2)} MT)
                               </span>
                            </div>
                          )}
                        </label>
                        <input className="fi" type="number" placeholder="0" value={m.bags} onChange={e => updMat(i, 'bags', e.target.value)} />
                      </div>
                      <div className="field"><label>Weight (MT)</label><input className="fi" type="number" step="0.01" placeholder="0.00" value={m.weight} onChange={e => updMat(i, 'weight', e.target.value)} /></div>
                    </div>
                  </motion.div>
                ))}
                <hr className="sep" style={{ margin: '8px 0' }} />
                {/* Note */}
                <div className="field" style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><MessageSquare size={11} /> Note for Labour (optional)</label>
                  <textarea className="fi" rows={2} placeholder="e.g. Handle carefully, load from gate 2..." value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                    style={{ resize: 'vertical', minHeight: '60px' }} />
                </div>
                {/* Voice Message */}
                <div className="field" style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Volume2 size={11} /> Voice Message (optional)</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {!isRecording ? (
                      <button type="button" onClick={startRecording} className="btn btn-g btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.25)' }}>
                        <Mic size={13} /> {voicePreviewUrl ? 'Re-record' : 'Record Voice'}
                      </button>
                    ) : (
                      <button type="button" onClick={stopRecording} className="btn btn-d btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', animation: 'pulse 1s infinite' }}>
                        <MicOff size={13} /> Stop Recording
                      </button>
                    )}
                    {voicePreviewUrl && (
                      <>
                        <button type="button" onClick={playPreview} className="btn btn-g btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          {isPlayingPreview ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Preview</>}
                        </button>
                        <button type="button" onClick={clearVoice} className="btn btn-d btn-sm" title="Remove voice">
                          <X size={12} />
                        </button>
                        <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 700 }}>✓ Voice recorded</span>
                      </>
                    )}
                    {isRecording && <span style={{ fontSize: '11px', color: '#f43f5e', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f43f5e', display: 'inline-block', animation: 'pulse 1s infinite' }} /> Recording...</span>}
                  </div>
                </div>
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

            {Object.keys(filters).some(k => filters[k].length > 0) && (
              <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', background: 'var(--bg-filter)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase' }}>Active Filters:</span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {Object.keys(filters).map(k => filters[k].length > 0 && (
                        <span key={k} className="badge badge-tag" style={{ fontSize: '9px' }}>
                            {k}: {filters[k].length} selected
                        </span>
                    ))}
                </div>
                <button className="btn btn-sm btn-g" style={{ marginLeft: 'auto', height: '24px', fontSize: '10px' }} onClick={() => setFilters({})}>Clear All Filters</button>
              </div>
            )}

            <div className="tbl-wrap">
              <table className="tbl" style={{ minWidth: '1200px' }}>
                <thead><tr>
                  <th style={{ padding: '8px 12px' }}><ColumnFilter label="LR No." colKey="lrNo" data={receipts} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                  <th style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <ColumnFilter label="Vehicle" colKey="truckNo" data={receipts} activeFilters={filters} onFilterChange={handleFilterChange} />
                        <ColumnFilter label="Party" colKey="partyName" data={receipts} activeFilters={filters} onFilterChange={handleFilterChange} />
                        <ColumnFilter label="Dest" colKey="destination" data={receipts} activeFilters={filters} onFilterChange={handleFilterChange} />
                        <ColumnFilter label="Date" colKey="date" data={receipts} activeFilters={filters} onFilterChange={handleFilterChange} />
                    </div>
                  </th>
                  <th style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <ColumnFilter label="Material" colKey="material" data={receipts} activeFilters={filters} onFilterChange={handleFilterChange} />
                        <ColumnFilter label="Loading" colKey="loadingType" data={receipts} activeFilters={filters} onFilterChange={handleFilterChange} />
                    </div>
                  </th>
                  <th className="c" style={{ padding: '8px 12px' }}><ColumnFilter label="Source Challan" colKey="billing" data={receipts} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                  {role === 'admin' && <th style={{ padding: '8px 12px' }}>Created By</th>}
                  {role === 'admin' && <th style={{ padding: '8px 12px' }}>Updated By</th>}
                  <th className="c" style={{ padding: '8px 12px' }}>Actions</th>
                </tr></thead>
                <tbody>
                  {filteredReceipts.length === 0 ? <tr><td colSpan={role === 'admin' ? 9 : 7} className="t-empty" style={{ textAlign: 'center', padding: '36px' }}>No receipts found</td></tr>
                    : paginatedReceipts.map(lr => (
                      <tr key={lr.id}>
                        <td><span className="t-lr">#{lr.lrNo}</span></td>
                        <td>
                          <div className="t-main">{lr.truckNo}</div>
                          <div className="t-sub">{lr.partyName} · {lr.destination || '—'} · {lr.date}</div>
                        </td>
                        <td>
                          <span className="badge badge-tag">{lr.material}</span>
                          <div className="t-sub">{lr.weight} MT · {lr.totalBags} bags</div>
                          {lr.loadingType && <div className="t-sub" style={{ marginTop: '4px', fontWeight: 800, fontSize: '10px', color: lr.loadingType === 'Crossing' ? '#f59e0b' : '#10b981' }}>{lr.loadingType}</div>}
                        </td>
                        <td className="c">
                          {(() => {
                            // Determine how many bags are not yet covered by any challan
                            const lrBags = parseInt(lr.totalBags || 0);
                            const hasBilling = lr.billing && lr.billing !== 'No';
                            let coveredBags = 0;
                            if (hasBilling) {
                              lr.billing.split(',').forEach(cNo => {
                                const ch = allChallans.find(c => c.challanNo === cNo.trim());
                                if (ch) {
                                  if (ch.materials) {
                                    const mat = ch.materials.find(m => m.type === lr.material);
                                    if (mat) coveredBags += (mat.totalBags || 0);
                                  } else if (ch.material === lr.material) {
                                    coveredBags += parseInt(ch.quantity || 0);
                                  }
                                }
                              });
                            }
                            const remainingBags = lrBags - coveredBags;
                            const isPartiallyCovered = hasBilling && remainingBags > 0;
                            const isFullyCovered = hasBilling && remainingBags <= 0;

                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                                {hasBilling && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                                    {lr.billing.split(',').map((cNo, idx) => {
                                      const ch = allChallans.find(c => c.challanNo === cNo.trim());
                                      const hasMaterial = ch && ch.materials ? ch.materials.some(m => m.type === lr.material) : (ch && ch.material === lr.material);
                                      if (!hasMaterial && lr.billing.includes(',')) return null;
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
                                    {isPartiallyCovered && (
                                      <span style={{ fontSize: '9px', fontWeight: 800, color: '#f43f5e', background: 'rgba(244,63,94,0.1)', padding: '2px 7px', borderRadius: '4px', border: '1px solid rgba(244,63,94,0.25)' }}>
                                        {remainingBags} bags ({(remainingBags * 0.05).toFixed(2)} MT) pending
                                      </span>
                                    )}
                                  </div>
                                )}
                                {(!hasBilling || isPartiallyCovered) && (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                    {!hasBilling && <span className="badge badge-n">Pending Challan</span>}
                                    <button
                                      className="btn btn-a btn-sm"
                                      onClick={() => {
                                        setLinkingLrId(lr.id);
                                        setChalPreFill({
                                          truckNo: lr.truckNo,
                                          material: lr.material,
                                          quantity: isPartiallyCovered ? remainingBags : lr.totalBags,
                                          partyName: lr.partyName,
                                          destination: lr.destination,
                                          date: lr.date
                                        });
                                        setShowChalPopup('create');
                                      }}
                                      style={{ fontSize: '9px', padding: '3px 8px', fontWeight: 800 }}
                                    >
                                      <Tag size={10} /> Challan Pending
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        {role === 'admin' && <td style={{ color: 'var(--text-sub)', fontSize: '12px' }}>{lr.createdBy || '—'}</td>}
                        {role === 'admin' && <td style={{ color: 'var(--text-sub)', fontSize: '12px' }}>{lr.updatedBy || '—'}</td>}
                        <td className="c">
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button className="btn btn-g btn-icon" title={`Print LR #${lr.lrNo} `} onClick={() => printReceipt(receipts, lr.lrNo, allChallans)}>
                              <Printer size={14} />
                            </button>
                            {canEdit && (
                              <button className="btn btn-g btn-icon" title="Edit" onClick={() => setEditRow(lr)}>
                                <Pencil size={14} />
                              </button>
                            )}
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

            <Pagination 
              currentPage={currentPage}
              totalItems={filteredReceipts.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </div>
    </>
  );
}