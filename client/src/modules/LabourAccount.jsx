import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ax from '../api';
import {
  HardHat, Loader2, Save, X, IndianRupee, Calendar, Trash2, Plus,
  AlertTriangle, ChevronDown, ChevronRight, SlidersHorizontal, Download,
} from 'lucide-react';
import { buildExportRows, exportToExcel } from '../utils/exportUtils';
import TableScroll from '../components/TableScroll';

const API = '/labour-account';

const fmtRs = n => 'Rs.' + Math.round(n || 0).toLocaleString('en-IN');
const fmtDate = s => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const today = () => new Date().toISOString().slice(0, 10);

const TH = {
  padding: '9px 12px', fontSize: '10.5px', fontWeight: 800, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--bg-th)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', textAlign: 'left',
};
const TD = { padding: '8px 12px', fontSize: '12.5px', color: 'var(--text-sub)', whiteSpace: 'nowrap' };

/** Only these three earn. A Direct load, and a crossing on the way in, do not. */
const ACTIVITY_TINT = {
  godown_load: '#10b981',
  crossing_load: '#f59e0b',
  godown_unload: '#3b82f6',
};

export default function LabourAccount({ canEdit }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [summary, setSummary] = useState(null);
  const [meta, setMeta] = useState(null);
  const [entries, setEntries] = useState([]);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [openGroup, setOpenGroup] = useState(null);
  const [showRates, setShowRates] = useState(false);
  const [payFor, setPayFor] = useState(null);

  const load = useCallback(async () => {
    setErr('');
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const suffix = qs.toString() ? `?${qs}` : '';
      const [sRes, mRes, eRes] = await Promise.all([
        ax.get(`${API}/summary${suffix}`),
        ax.get(`${API}/meta`),
        ax.get(`${API}/entries${suffix}`),
      ]);
      setSummary(sRes.data);
      setMeta(mRes.data);
      setEntries(eRes.data || []);
    } catch (e) {
      setErr(e?.response?.data?.error || 'Could not load the labour account.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  /**
   * Materials that have actually moved, per crew. Merged with the stock
   * module's list in the rate dialog — the stock list is the palette, this
   * catches anything loaded under a name the stock module no longer carries.
   */
  const loadedMaterials = useMemo(() => {
    const byGroup = {};
    entries.forEach(e => {
      if (!e.material) return;
      (byGroup[e.group] = byGroup[e.group] || new Set()).add(e.material);
    });
    return Object.fromEntries(Object.entries(byGroup).map(([k, v]) => [k, [...v]]));
  }, [entries]);

  const savePayment = async (body) => {
    setSaving(true);
    try {
      await ax.post(`${API}/payments`, body);
      setPayFor(null);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.error || 'Could not record the payment.');
    } finally { setSaving(false); }
  };

  const deletePayment = async (id) => {
    if (!window.confirm('Remove this payment?')) return;
    try { await ax.delete(`${API}/payments/${id}`); await load(); }
    catch (e) { setErr(e?.response?.data?.error || 'Could not remove the payment.'); }
  };

  const saveRates = async (rates) => {
    setSaving(true);
    try {
      await ax.put(`${API}/rates`, rates);
      setShowRates(false);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.error || 'Could not save the rates.');
    } finally { setSaving(false); }
  };

  const exportEntries = () => exportToExcel(
    buildExportRows(entries.map(({ id, plantLabel, ...e }) => ({ ...e, plant: plantLabel })), {
      order: ['date', 'group', 'plant', 'source', 'ref', 'truckNo', 'material', 'type', 'activity', 'bags', 'rate', 'amount'],
    }),
    `Labour account ${from || 'all'} to ${to || today()}`,
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh', gap: '10px', color: 'var(--text-muted)' }}>
        <Loader2 size={18} className="spin" /> Pricing every loading receipt…
      </div>
    );
  }

  const noRates = summary?.groups?.every(g => g.earned === 0) && entries.length > 0;

  return (
    <div>
      {/* ── Period and actions ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Calendar size={14} color="var(--text-muted)" />
          <input className="fi" type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 'auto' }} title="From" />
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>to</span>
          <input className="fi" type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 'auto' }} title="To" />
          {(from || to) && (
            <button className="btn btn-g btn-sm" onClick={() => { setFrom(''); setTo(''); }}>All time</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-g btn-sm" onClick={exportEntries} disabled={!entries.length}>
            <Download size={13} /> Excel
          </button>
          <button className="btn btn-p btn-sm" onClick={() => setShowRates(true)}>
            <SlidersHorizontal size={13} /> Rates
          </button>
        </div>
      </div>

      {err && (
        <div style={{ padding: '12px 14px', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '10px', color: '#fb7185', fontSize: '12.5px', marginBottom: '14px' }}>
          {err}
        </div>
      )}

      {noRates && (
        <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', marginBottom: '14px' }}>
          <AlertTriangle size={15} color="#f59e0b" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div style={{ fontSize: '12.5px', color: 'var(--text)', lineHeight: 1.5 }}>
            <b style={{ color: '#f59e0b' }}>No rate has been entered yet</b>, so every amount below is zero.
            The work is all recorded — {entries.length} line{entries.length === 1 ? '' : 's'} of it — and will price itself the moment
            you set a rate per bag under <b>Rates</b>.
          </div>
        </div>
      )}

      {/* ── One card per crew ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px', marginBottom: '18px' }}>
        {(summary?.groups || []).map(g => (
          <div key={g.key} className="card" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <HardHat size={15} color="#10b981" />
                  <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)' }}>{g.label}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{g.hint}</div>
              </div>
              {canEdit && (
                <button className="btn btn-p btn-sm" onClick={() => setPayFor(g)} style={{ fontSize: '11px' }}>
                  <IndianRupee size={12} /> Pay
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
              {[
                ['Earned', g.earned, '#10b981'],
                ['Paid', g.paid, '#64748b'],
                ['Balance', g.balance, g.balance > 0 ? '#f59e0b' : '#10b981'],
              ].map(([label, val, tint]) => (
                <div key={label} style={{ background: 'var(--bg-input)', borderRadius: '9px', padding: '9px 10px' }}>
                  <div style={{ fontSize: '9.5px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                  <div style={{ fontSize: '15px', fontWeight: 900, color: tint, marginTop: '2px' }}>{fmtRs(val)}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
              {g.bags.toLocaleString('en-IN')} bags charged
              {g.unpricedBags > 0 && (
                <span style={{ color: '#f59e0b', fontWeight: 700 }}> · {g.unpricedBags.toLocaleString('en-IN')} of them at no rate</span>
              )}
            </div>

            <button
              onClick={() => setOpenGroup(openGroup === g.key ? null : g.key)}
              style={{ marginTop: '10px', background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '11.5px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', padding: 0 }}
            >
              {openGroup === g.key ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              Breakdown
            </button>

            {openGroup === g.key && (
              <div style={{ marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                {[['By work', g.byActivity, k => meta?.activityLabels?.[k] || k],
                  ['By plant', g.byPlant, k => k],
                  ['By material', g.byMaterial, k => k]].map(([title, bucket, label]) => {
                  const rows = Object.entries(bucket || {}).sort((a, b) => b[1].amount - a[1].amount);
                  if (!rows.length) return null;
                  return (
                    <div key={title} style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '9.5px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{title}</div>
                      {rows.map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '2px 0' }}>
                          <span>{label(k)} <span style={{ color: 'var(--text-muted)' }}>· {v.bags.toLocaleString('en-IN')} bags</span></span>
                          <strong style={{ color: 'var(--text)' }}>{fmtRs(v.amount)}</strong>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Payments made ── */}
      {(summary?.payments || []).length > 0 && (
        <div className="card" style={{ marginBottom: '18px' }}>
          <div className="card-header border-b">
            <div className="card-title-block">
              <div className="card-title-text"><h3>Payments made</h3><p>{summary.payments.length} recorded · {fmtRs(summary.totals.paid)}</p></div>
            </div>
          </div>
          <TableScroll>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={TH}>Date</th><th style={TH}>Crew</th><th style={TH}>Mode</th>
                <th style={TH}>Remark</th><th style={{ ...TH, textAlign: 'right' }}>Amount</th>
                {canEdit && <th style={TH} />}
              </tr></thead>
              <tbody>
                {summary.payments.map((p, i) => (
                  <tr key={p.id} style={{ background: i % 2 ? 'var(--bg-row-odd)' : 'var(--bg-row-even)' }}>
                    <td style={TD}>{fmtDate(p.date)}</td>
                    <td style={{ ...TD, fontWeight: 700 }}>{summary.groups.find(g => g.key === p.group)?.label || p.group}</td>
                    <td style={TD}>{p.mode}</td>
                    <td style={{ ...TD, whiteSpace: 'normal' }}>{p.remark || '—'}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: 'var(--text)' }}>{fmtRs(p.amount)}</td>
                    {canEdit && (
                      <td style={{ ...TD, textAlign: 'right' }}>
                        <button className="btn btn-g btn-sm" onClick={() => deletePayment(p.id)} style={{ padding: '3px 7px' }}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      )}

      {/* ── Every line behind the totals ── */}
      <div className="card">
        <div className="card-header border-b">
          <div className="card-title-block">
            <div className="card-title-text">
              <h3>The work</h3>
              <p>
                {entries.length} line{entries.length === 1 ? '' : 's'} from the loading receipts and MIGO entries.
                A Direct load is listed and charged nothing.
              </p>
            </div>
          </div>
        </div>
        <TableScroll style={{ maxHeight: '520px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={TH}>Date</th><th style={TH}>Crew</th><th style={TH}>Plant</th>
              <th style={TH}>Ref</th><th style={TH}>Truck</th><th style={TH}>Material</th>
              <th style={TH}>Work</th><th style={{ ...TH, textAlign: 'right' }}>Bags</th>
              <th style={{ ...TH, textAlign: 'right' }}>Rate</th><th style={{ ...TH, textAlign: 'right' }}>Amount</th>
            </tr></thead>
            <tbody>
              {entries.length === 0 && (
                <tr><td colSpan={10} style={{ ...TD, textAlign: 'center', padding: '34px', color: 'var(--text-muted)' }}>
                  No loading receipts or MIGO entries in this period.
                </td></tr>
              )}
              {entries.map((e, i) => (
                <tr key={e.id} style={{ background: i % 2 ? 'var(--bg-row-odd)' : 'var(--bg-row-even)', opacity: e.activity ? 1 : 0.55 }}>
                  <td style={TD}>{fmtDate(e.date)}</td>
                  <td style={TD}>{summary?.groups.find(g => g.key === e.group)?.label || e.group}</td>
                  <td style={TD}>{e.plantLabel}</td>
                  <td style={{ ...TD, fontFamily: 'monospace', fontSize: '11.5px' }}>{e.ref}</td>
                  <td style={{ ...TD, fontWeight: 700 }}>{e.truckNo || '—'}</td>
                  <td style={TD}>{e.material || '—'}</td>
                  <td style={TD}>
                    <span style={{
                      padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 800,
                      background: e.activity ? `${ACTIVITY_TINT[e.activity]}1a` : 'rgba(139,92,246,0.12)',
                      color: e.activity ? ACTIVITY_TINT[e.activity] : '#8b5cf6',
                    }}>
                      {e.type}{e.source === 'migo' ? ' · in' : ''}
                    </span>
                  </td>
                  <td style={{ ...TD, textAlign: 'right' }}>{e.bags.toLocaleString('en-IN')}</td>
                  <td style={{ ...TD, textAlign: 'right', color: e.activity && e.rate <= 0 ? '#f59e0b' : 'var(--text-muted)' }}>
                    {e.activity ? (e.rate > 0 ? e.rate : 'no rate') : '—'}
                  </td>
                  <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: e.amount > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                    {e.activity ? fmtRs(e.amount) : 'no labour'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </div>

      {payFor && (
        <PaymentDialog group={payFor} saving={saving} onClose={() => setPayFor(null)} onSave={savePayment} />
      )}
      {showRates && meta && summary && (
        <RatesDialog
          meta={meta} rates={summary.rates} loadedMaterials={loadedMaterials} canEdit={canEdit}
          saving={saving} onClose={() => setShowRates(false)} onSave={saveRates}
        />
      )}
    </div>
  );
}

/* ── Recording a payment to a crew ───────────────────────────────────────── */

function PaymentDialog({ group, saving, onClose, onSave }) {
  const [form, setForm] = useState({ amount: '', date: today(), mode: 'Cash', remark: '' });
  const owed = group.balance;

  return (
    <Modal title={`Pay ${group.label}`} onClose={onClose}>
      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '14px' }}>
        Earned {fmtRs(group.earned)} · already paid {fmtRs(group.paid)} ·{' '}
        <strong style={{ color: owed > 0 ? '#f59e0b' : '#10b981' }}>{fmtRs(owed)} outstanding</strong>
      </div>
      <div className="fg fg-2" style={{ gap: '12px' }}>
        <div className="field-h">
          <label>Amount (Rs.)</label>
          <input className="fi" type="number" min="1" value={form.amount} autoFocus
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
          {owed > 0 && (
            <button className="btn btn-g btn-sm" style={{ marginTop: '6px', fontSize: '11px' }}
              onClick={() => setForm(f => ({ ...f, amount: String(Math.round(owed)) }))}>
              Pay it all — {fmtRs(owed)}
            </button>
          )}
        </div>
        <div className="field-h">
          <label>Date</label>
          <input className="fi" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </div>
        <div className="field-h">
          <label>Mode</label>
          <select className="fi" value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>
            <option>Cash</option><option>Bank Transfer</option><option>UPI</option><option>Cheque</option>
          </select>
        </div>
        <div className="field-h">
          <label>Remark</label>
          <input className="fi" value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} placeholder="Optional" />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' }}>
        <button className="btn btn-g" onClick={onClose}>Cancel</button>
        <button className="btn btn-p" disabled={saving || !(parseFloat(form.amount) > 0)}
          onClick={() => onSave({ ...form, group: group.key })}>
          {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Record payment
        </button>
      </div>
    </Modal>
  );
}

/* ── The rate master ─────────────────────────────────────────────────────── */

/**
 * A default per crew and activity, plus a per-material override. The default is
 * what makes the screen usable before every material has been priced: leave a
 * material's box empty and it falls back, so one number gets the account
 * working and the detail can follow.
 */
function RatesDialog({ meta, rates, loadedMaterials, canEdit, saving, onClose, onSave }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(rates?.groups || {})));
  const [group, setGroup] = useState(meta.groups[0]?.key);
  const [newMaterial, setNewMaterial] = useState('');

  const g = draft[group] || { default: {}, materials: {} };
  // Each crew gets its own materials: the stock modules they work, plus
  // anything already loaded or already priced. Sharing one list across both
  // crews put the dumps' materials on Jharli's sheet, where they do not belong.
  const rows = useMemo(() => [...new Set([
    ...(meta.materials?.[group] || []),
    ...(loadedMaterials?.[group] || []),
    ...Object.keys(g.materials || {}),
  ])].sort(), [meta.materials, loadedMaterials, group, g.materials]);

  const setDefault = (activity, value) => setDraft(d => ({
    ...d, [group]: { ...d[group], default: { ...d[group]?.default, [activity]: value } },
  }));
  const setMaterial = (material, activity, value) => setDraft(d => {
    const mats = { ...(d[group]?.materials || {}) };
    const row = { ...(mats[material] || {}) };
    if (value === '') delete row[activity]; else row[activity] = value;
    if (Object.keys(row).length) mats[material] = row; else delete mats[material];
    return { ...d, [group]: { ...d[group], materials: mats } };
  });

  return (
    <Modal title="Labour rates — rupees per bag" onClose={onClose} wide>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {meta.groups.map(gr => (
          <button key={gr.key} className={`btn btn-sm ${group === gr.key ? 'btn-p' : 'btn-g'}`} onClick={() => setGroup(gr.key)}>
            {gr.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.5 }}>
        {meta.groups.find(gr => gr.key === group)?.hint} — {rows.length} material{rows.length === 1 ? '' : 's'} from
        their stock modules. A material left blank is charged at the default below.
        A <b>Direct</b> load, and a crossing arriving at MIGO, are never charged.
      </div>

      <TableScroll>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={TH}>Material</th>
            {meta.activities.map(a => <th key={a} style={{ ...TH, textAlign: 'right' }}>{meta.activityLabels[a]}</th>)}
          </tr></thead>
          <tbody>
            <tr style={{ background: 'var(--bg-row-even)' }}>
              <td style={{ ...TD, fontWeight: 800, color: 'var(--text)' }}>Default (all materials)</td>
              {meta.activities.map(a => (
                <td key={a} style={{ ...TD, textAlign: 'right' }}>
                  <input className="fi" type="number" step="any" min="0" disabled={!canEdit}
                    style={{ width: '90px', textAlign: 'right' }}
                    value={g.default?.[a] ?? ''} onChange={e => setDefault(a, e.target.value)} />
                </td>
              ))}
            </tr>
            {rows.map((m, i) => (
              <tr key={m} style={{ background: i % 2 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                <td style={{ ...TD, fontWeight: 700 }}>{m}</td>
                {meta.activities.map(a => (
                  <td key={a} style={{ ...TD, textAlign: 'right' }}>
                    <input className="fi" type="number" step="any" min="0" disabled={!canEdit}
                      placeholder={String(g.default?.[a] ?? 0)}
                      style={{ width: '90px', textAlign: 'right' }}
                      value={g.materials?.[m]?.[a] ?? ''} onChange={e => setMaterial(m, a, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>

      {canEdit && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
          <input className="fi" placeholder="Add a material not yet loaded" value={newMaterial}
            onChange={e => setNewMaterial(e.target.value)} style={{ maxWidth: '280px' }} />
          <button className="btn btn-g btn-sm" disabled={!newMaterial.trim()}
            onClick={() => { setMaterial(newMaterial.trim(), meta.activities[0], ''); setDraft(d => ({ ...d, [group]: { ...d[group], materials: { ...(d[group]?.materials || {}), [newMaterial.trim()]: d[group]?.materials?.[newMaterial.trim()] || {} } } })); setNewMaterial(''); }}>
            <Plus size={13} /> Add
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' }}>
        <button className="btn btn-g" onClick={onClose}>Close</button>
        {canEdit && (
          <button className="btn btn-p" disabled={saving} onClick={() => onSave({ groups: draft })}>
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Save rates
          </button>
        )}
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose, wide }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div onClick={e => e.stopPropagation()} className="card"
        style={{ width: '100%', maxWidth: wide ? '860px' : '560px', maxHeight: '88vh', overflowY: 'auto', padding: '20px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>{title}</h3>
          <button className="btn btn-g btn-sm" onClick={onClose} style={{ padding: '4px 8px' }}><X size={14} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
