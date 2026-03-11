import { writeFileSync } from 'fs';

const code = `import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { BarChart3, Search, ChevronDown, ChevronUp, ChevronLeft, Check, Truck, CheckCircle2, AlertCircle, Pencil, X, Save } from 'lucide-react';

const API_V = 'http://localhost:5000/api/vouchers';
const TYPES = ['Dump', 'JK_Lakshmi', 'JK_Super'];

function calcNet(v) {
  const gross   = parseFloat(v.total)         || 0;
  const diesel  = v.advanceDiesel === 'FULL' ? 4000 : (parseFloat(v.advanceDiesel) || 0);
  const cash    = parseFloat(v.advanceCash)   || 0;
  const online  = parseFloat(v.advanceOnline) || 0;
  const munshi  = parseFloat(v.munshi)        || 0;
  const shortage= parseFloat(v.shortage)      || 0;
  return gross - diesel - cash - online - munshi - shortage;
}

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(y, m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}
const fmtRs = n => 'Rs.' + Math.round(n).toLocaleString('en-IN');

const TH = {
  padding: '8px 11px', fontSize: '10px', fontWeight: 700,
  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em',
  background: 'var(--bg-th)', borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap', position: 'sticky', top: 0,
};
const TD  = { padding: '8px 10px', fontSize: '12.5px', color: 'var(--text-sub)', verticalAlign: 'middle', whiteSpace: 'nowrap' };
const TDF = { ...TD, fontWeight: 800, color: 'var(--text)', background: 'var(--bg-tf)' };

/* ── Editable Row ── */
function VoucherRow({ v, idx, onSave }) {
  const [editing, setEditing] = useState(false);
  const [form,    setForm]    = useState({});
  const [saving,  setSaving]  = useState(false);

  const startEdit = () => {
    setForm({
      advanceDiesel: v.advanceDiesel || '',
      advanceCash:   v.advanceCash   || '',
      advanceOnline: v.advanceOnline || '',
      munshi:        v.munshi        || '',
      shortage:      v.shortage      || '',
      paidBalance:   v.paidBalance   || '',
      rate:          v.rate          || '',
      weight:        v.weight        || '',
      total:         v.total         || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.patch(API_V + '/' + v.id, form);
      setEditing(false);
      onSave();
    } catch { alert('Save failed'); }
    finally { setSaving(false); }
  };

  const S = (k, val) => setForm(f => ({ ...f, [k]: val }));
  const FI = (key, w = '70px') => (
    <input type="number" step="any" value={form[key] || ''} onChange={e => S(key, e.target.value)}
      style={{ width: w, background: 'var(--bg-input)', border: '1px solid var(--primary)',
        borderRadius: '5px', padding: '3px 6px', color: 'var(--text)', fontSize: '12px', fontFamily: 'inherit' }}/>
  );

  const net         = calcNet(editing ? { ...v, ...form } : v);
  const paid        = parseFloat(editing ? form.paidBalance : v.paidBalance) || 0;
  const outstanding = Math.max(0, net - paid);
  const cleared     = outstanding <= 0;
  const evenBg      = idx % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)';
  const editBg      = 'var(--bg-input)';

  return (
    <tr style={{ background: editing ? editBg : evenBg }}
      onMouseEnter={e => { if (!editing) e.currentTarget.style.background = 'var(--bg-row-hover)'; }}
      onMouseLeave={e => { if (!editing) e.currentTarget.style.background = evenBg; }}>

      <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{idx + 1}</td>
      <td style={{ ...TD }}>{v.date}</td>
      <td style={{ ...TD }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>#{v.lrNo}</span>
      </td>
      <td style={{ ...TD }}>{v.destination || v.partyName || '—'}</td>

      {/* Weight */}
      <td style={{ ...TD, textAlign: 'right' }}>
        {editing ? FI('weight', '65px') : (v.weight || '—')}
      </td>
      {/* Rate */}
      <td style={{ ...TD, textAlign: 'right' }}>
        {editing ? FI('rate', '65px') : (v.rate || '—')}
      </td>
      {/* Gross */}
      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>
        {editing ? FI('total', '80px') : fmtRs(parseFloat(v.total) || 0)}
      </td>
      {/* Diesel */}
      <td style={{ ...TD, textAlign: 'right', color: 'var(--warn)' }}>
        {editing
          ? <input type="text" value={form.advanceDiesel || ''} onChange={e => S('advanceDiesel', e.target.value)}
              placeholder="0 or FULL"
              style={{ width: '75px', background: 'var(--bg-input)', border: '1px solid var(--primary)',
                borderRadius: '5px', padding: '3px 6px', color: 'var(--text)', fontSize: '12px', fontFamily: 'inherit' }}/>
          : (v.advanceDiesel === 'FULL' ? '4000 (F)' : v.advanceDiesel || '—')}
      </td>
      {/* Cash */}
      <td style={{ ...TD, textAlign: 'right', color: 'var(--warn)' }}>
        {editing ? FI('advanceCash') : (v.advanceCash || '—')}
      </td>
      {/* Online */}
      <td style={{ ...TD, textAlign: 'right', color: 'var(--warn)' }}>
        {editing ? FI('advanceOnline') : (v.advanceOnline || '—')}
      </td>
      {/* Munshi */}
      <td style={{ ...TD, textAlign: 'right' }}>
        {editing ? FI('munshi') : (v.munshi || '—')}
      </td>
      {/* Shortage */}
      <td style={{ ...TD, textAlign: 'right' }}>
        {editing ? FI('shortage') : (v.shortage || '—')}
      </td>
      {/* Net Balance */}
      <td style={{ ...TD, textAlign: 'right', fontWeight: 800, fontSize: '13px',
        color: net >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
        {fmtRs(net)}
      </td>
      {/* Paid */}
      <td style={{ ...TD, textAlign: 'right' }}>
        {editing ? FI('paidBalance') : (v.paidBalance ? fmtRs(parseFloat(v.paidBalance)) : '—')}
      </td>
      {/* Outstanding / Status */}
      <td style={{ ...TD, textAlign: 'center' }}>
        {cleared
          ? <span style={{ display:'inline-flex',alignItems:'center',gap:'3px',padding:'2px 8px',borderRadius:'6px',background:'rgba(16,185,129,0.1)',color:'var(--accent)',fontSize:'11px',fontWeight:700 }}><Check size={10}/> Paid</span>
          : <span style={{ display:'inline-flex',alignItems:'center',gap:'3px',padding:'2px 8px',borderRadius:'6px',background:'rgba(245,158,11,0.1)',color:'var(--warn)',fontSize:'11px',fontWeight:700 }}>{fmtRs(outstanding)}</span>}
      </td>
      {/* Actions */}
      <td style={{ ...TD, textAlign: 'center' }}>
        {editing ? (
          <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
            <button className="btn btn-p btn-icon btn-sm" title="Save" onClick={handleSave} disabled={saving}>
              {saving ? '…' : <Save size={13}/>}
            </button>
            <button className="btn btn-g btn-icon btn-sm" title="Cancel" onClick={() => setEditing(false)}>
              <X size={13}/>
            </button>
          </div>
        ) : (
          <button className="btn btn-g btn-icon btn-sm" title="Edit row" onClick={startEdit}>
            <Pencil size={13}/>
          </button>
        )}
      </td>
    </tr>
  );
}

/* ── Month Section ── */
function MonthSection({ ym, rows, onSave }) {
  const [open,    setOpen]    = useState(true);
  const [marking, setMarking] = useState(false);

  const totals = useMemo(() => ({
    weight: rows.reduce((s, v) => s + (parseFloat(v.weight) || 0), 0).toFixed(2),
    gross:  rows.reduce((s, v) => s + (parseFloat(v.total)  || 0), 0),
    net:    rows.reduce((s, v) => s + calcNet(v), 0),
    paid:   rows.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0),
    outstanding: rows.reduce((s, v) => {
      const n = calcNet(v), p = parseFloat(v.paidBalance) || 0;
      return s + Math.max(0, n - p);
    }, 0),
  }), [rows]);

  const markPaid = async () => {
    const unpaid = rows.filter(v => calcNet(v) > (parseFloat(v.paidBalance) || 0));
    if (!unpaid.length) { alert('All entries in this month are already paid!'); return; }
    if (!window.confirm(\`Mark \${unpaid.length} voucher(s) as PAID for \${monthLabel(ym)}?\`)) return;
    setMarking(true);
    try {
      await Promise.all(unpaid.map(v => axios.patch(API_V + '/' + v.id, { paidBalance: String(calcNet(v).toFixed(2)) })));
      onSave();
    } catch { alert('Error'); } finally { setMarking(false); }
  };

  return (
    <div className="card" style={{ marginBottom: '16px', overflow: 'hidden' }}>
      {/* Month header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px', cursor: 'pointer', borderBottom: open ? '1px solid var(--border)' : 'none',
        background: 'var(--bg-card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }} onClick={() => setOpen(o => !o)}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(245,158,11,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {open ? <ChevronUp size={16} color="#f59e0b"/> : <ChevronDown size={16} color="#f59e0b"/>}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)' }}>{monthLabel(ym)}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>
              {rows.length} trips · Net {fmtRs(totals.net)} · Paid {fmtRs(totals.paid)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {totals.outstanding > 0 ? (
            <span style={{ display:'flex',alignItems:'center',gap:'5px',fontSize:'12.5px',color:'var(--warn)',fontWeight:800 }}>
              <AlertCircle size={14}/> {fmtRs(totals.outstanding)} due
            </span>
          ) : (
            <span style={{ display:'flex',alignItems:'center',gap:'5px',fontSize:'12px',color:'var(--accent)',fontWeight:700 }}>
              <CheckCircle2 size={14}/> Cleared
            </span>
          )}
          <button className="btn btn-p btn-sm" onClick={markPaid} disabled={marking}>
            {marking ? 'Marking…' : <><CheckCircle2 size={13}/> Mark Month Paid</>}
          </button>
        </div>
      </div>

      {/* Table */}
      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr>
                {['#','Date','LR No.','Destination','Weight','Rate','Gross','Diesel','Cash','Online','Munshi','Shortage','Net Bal','Paid','Status','Edit'].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((v, i) => (
                <VoucherRow key={v.id} v={v} idx={i} onSave={onSave}/>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)' }}>
                <td colSpan={4} style={{ ...TDF,fontSize:'10px',textTransform:'uppercase',letterSpacing:'0.07em',color:'var(--text-muted)' }}>
                  Monthly Totals ({rows.length} trips)
                </td>
                <td style={{ ...TDF, textAlign: 'right' }}>{totals.weight}</td>
                <td style={TDF}></td>
                <td style={{ ...TDF, textAlign: 'right' }}>{fmtRs(totals.gross)}</td>
                <td colSpan={5} style={TDF}></td>
                <td style={{ ...TDF, textAlign: 'right', color:'var(--accent)', fontSize:'13px' }}>{fmtRs(totals.net)}</td>
                <td style={{ ...TDF, textAlign: 'right' }}>{fmtRs(totals.paid)}</td>
                <td style={{ ...TDF, textAlign: 'center', color: totals.outstanding>0?'var(--warn)':'var(--accent)', fontSize:'13px' }}>
                  {totals.outstanding > 0 ? fmtRs(totals.outstanding) : <><Check size={12}/> Cleared</>}
                </td>
                <td style={TDF}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/* ══════ MAIN ══════ */
export default function BalanceSheet() {
  const [tab,         setTab]         = useState('Dump');
  const [vouchers,    setVouchers]    = useState([]);
  const [selTruck,    setSelTruck]    = useState(null);
  const [truckSearch, setTruckSearch] = useState('');

  useEffect(() => { fetchVouchers(); setSelTruck(null); setTruckSearch(''); }, [tab]);
  const fetchVouchers = async () => {
    try { setVouchers((await axios.get(API_V + '/' + tab)).data); } catch {}
  };

  const truckGroups = useMemo(() => {
    const map = {};
    vouchers.forEach(v => { const t = v.truckNo || 'Unknown'; (map[t] = map[t] || []).push(v); });
    return map;
  }, [vouchers]);

  const allTrucks = useMemo(() =>
    Object.keys(truckGroups)
      .filter(t => !truckSearch || t.toLowerCase().includes(truckSearch.toLowerCase()))
      .sort(),
    [truckGroups, truckSearch]);

  /* Month → rows for selected truck, sorted by date desc */
  const monthMap = useMemo(() => {
    if (!selTruck) return {};
    const rows = [...(truckGroups[selTruck] || [])].sort((a, b) => a.date < b.date ? 1 : -1);
    const map = {};
    rows.forEach(v => {
      const ym = (v.date || '').slice(0, 7) || 'Unknown';
      (map[ym] = map[ym] || []).push(v);
    });
    return map;
  }, [selTruck, truckGroups]);

  const sortedMonths = Object.keys(monthMap).sort((a, b) => b.localeCompare(a));

  /* Overall summary for selected truck */
  const truckTotals = useMemo(() => {
    if (!selTruck) return null;
    const rows = truckGroups[selTruck] || [];
    return {
      trips: rows.length,
      net:   rows.reduce((s, v) => s + calcNet(v), 0),
      paid:  rows.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0),
      outstanding: rows.reduce((s, v) => { const n=calcNet(v),p=parseFloat(v.paidBalance)||0; return s+Math.max(0,n-p); }, 0),
    };
  }, [selTruck, truckGroups]);

  /* Overview summaries per truck */
  const truckSummaries = useMemo(() => allTrucks.map(truck => {
    const rows = truckGroups[truck] || [];
    const net  = rows.reduce((s, v) => s + calcNet(v), 0);
    const paid = rows.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0);
    return { truck, trips: rows.length, gross: rows.reduce((s,v)=>s+(parseFloat(v.total)||0),0), net, paid, outstanding: Math.max(0, net - paid) };
  }), [allTrucks, truckGroups]);

  return (
    <div>
      <div className="page-hd">
        <div>
          <h1><BarChart3 size={20} color="#f59e0b"/> Balance Sheet</h1>
          <p>{selTruck ? \`\${selTruck} — monthly breakdown\` : 'Per-vehicle payment tracking'}</p>
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:'10px' }}>
          {selTruck && (
            <button className="btn btn-g btn-sm" onClick={() => setSelTruck(null)}>
              <ChevronLeft size={14}/> All Trucks
            </button>
          )}
          <div className="tab-grp">
            {TYPES.map(t => (
              <button key={t} className={\`tab-btn\${tab===t?' tab-amber':''}\`} onClick={() => setTab(t)}>
                {t.replace('_',' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selTruck ? (
        /* ── TRUCK DETAIL: monthly sections ── */
        <div>
          {/* Truck summary bar */}
          <div style={{ display:'flex',gap:'12px',flexWrap:'wrap',marginBottom:'16px' }}>
            {[
              { label:'Total Trips',   val: truckTotals.trips,                  isRs:false, color:'var(--primary)' },
              { label:'Net Balance',   val: fmtRs(truckTotals.net),             isRs:true,  color:'var(--text)'    },
              { label:'Total Paid',    val: fmtRs(truckTotals.paid),            isRs:true,  color:'var(--accent)'  },
              { label:'Outstanding',   val: fmtRs(truckTotals.outstanding),     isRs:true,  color: truckTotals.outstanding>0?'var(--warn)':'var(--accent)' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:'12px',
                padding:'12px 20px',display:'inline-flex',flexDirection:'column',gap:'4px',minWidth:'140px' }}>
                <span style={{ fontSize:'10px',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em' }}>{label}</span>
                <span style={{ fontSize:'18px',fontWeight:900,color,lineHeight:1 }}>{val}</span>
              </div>
            ))}
          </div>

          {/* One section per month */}
          {sortedMonths.length === 0 && <div style={{ color:'var(--text-muted)',padding:'40px',textAlign:'center' }}>No vouchers found</div>}
          {sortedMonths.map(ym => (
            <MonthSection key={ym} ym={ym} rows={monthMap[ym]} onSave={fetchVouchers}/>
          ))}
        </div>
      ) : (
        /* ── OVERVIEW: all trucks ── */
        <div className="card">
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon ci-amber"><Truck size={17}/></div>
              <div className="card-title-text">
                <h3>All Vehicles — {tab.replace('_',' ')}</h3>
                <p>{allTrucks.length} trucks · click a row to view monthly details</p>
              </div>
            </div>
            <div style={{ position:'relative' }}>
              <Search size={12} style={{ position:'absolute',left:'9px',top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)' }}/>
              <input className="fi" style={{ paddingLeft:'27px',height:'32px',width:'165px',fontSize:'12px' }}
                type="text" placeholder="Search truck..." value={truckSearch} onChange={e=>setTruckSearch(e.target.value)}/>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%',borderCollapse:'collapse',fontSize:'12.5px' }}>
              <thead>
                <tr>
                  {['#','Truck No.','Trips','Gross','Net Balance','Paid','Outstanding','Status'].map(h => (
                    <th key={h} style={{ ...TH, cursor:'default' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {truckSummaries.length === 0 && (
                  <tr><td colSpan={8} style={{ ...TD,textAlign:'center',color:'var(--text-muted)',padding:'40px' }}>No records</td></tr>
                )}
                {truckSummaries.map(({ truck, trips, gross, net, paid, outstanding }, i) => (
                  <tr key={truck}
                    style={{ background:i%2===0?'var(--bg-row-even)':'var(--bg-row-odd)', cursor:'pointer', transition:'background 0.12s' }}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--bg-row-hover)'}
                    onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'var(--bg-row-even)':'var(--bg-row-odd)'}
                    onClick={() => setSelTruck(truck)}>
                    <td style={{ ...TD,textAlign:'center',color:'var(--text-muted)',fontWeight:700 }}>{i+1}</td>
                    <td style={{ ...TD }}>
                      <div style={{ display:'flex',alignItems:'center',gap:'8px' }}>
                        <div style={{ width:'30px',height:'30px',borderRadius:'8px',background:'rgba(245,158,11,0.1)',display:'flex',alignItems:'center',justifyContent:'center' }}>
                          <Truck size={14} color="#f59e0b"/>
                        </div>
                        <span style={{ fontWeight:800,color:'var(--text)',fontSize:'13px' }}>{truck}</span>
                      </div>
                    </td>
                    <td style={{ ...TD,textAlign:'center',fontWeight:700 }}>{trips}</td>
                    <td style={{ ...TD,textAlign:'right' }}>{fmtRs(gross)}</td>
                    <td style={{ ...TD,textAlign:'right',fontWeight:700 }}>{fmtRs(net)}</td>
                    <td style={{ ...TD,textAlign:'right',color:'var(--accent)',fontWeight:700 }}>{fmtRs(paid)}</td>
                    <td style={{ ...TD,textAlign:'right',fontWeight:800,color:outstanding>0?'var(--warn)':'var(--accent)',fontSize:'13px' }}>
                      {outstanding > 0 ? fmtRs(outstanding) : '—'}
                    </td>
                    <td style={{ ...TD,textAlign:'center' }}>
                      {outstanding<=0
                        ? <span style={{ display:'inline-flex',alignItems:'center',gap:'4px',padding:'2px 8px',borderRadius:'6px',background:'rgba(16,185,129,0.1)',color:'var(--accent)',fontSize:'11px',fontWeight:700 }}><Check size={10}/> Cleared</span>
                        : <span style={{ display:'inline-flex',alignItems:'center',gap:'4px',padding:'2px 8px',borderRadius:'6px',background:'rgba(245,158,11,0.1)',color:'var(--warn)',fontSize:'11px',fontWeight:700 }}>Pending</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}`;

writeFileSync('B:/VGTC Managemet/client/src/modules/BalanceSheet.jsx', code, 'utf8');
console.log('BalanceSheet.jsx written:', code.length, 'chars');
