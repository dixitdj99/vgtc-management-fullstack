import { writeFileSync } from 'fs';

const code = `import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { BarChart3, Search, ChevronDown, ChevronUp, ChevronLeft, Check, Truck, Calendar, Filter, CheckCircle2, AlertCircle } from 'lucide-react';

const API_V  = 'http://localhost:5000/api/vouchers';
const TYPES  = ['Dump', 'JK_Lakshmi', 'JK_Super'];

/* Calculate net balance for a single voucher row */
function calcNet(v) {
  const gross   = parseFloat(v.total) || 0;
  const diesel  = v.advanceDiesel === 'FULL' ? 4000 : (parseFloat(v.advanceDiesel) || 0);
  const cash    = parseFloat(v.advanceCash)    || 0;
  const online  = parseFloat(v.advanceOnline)  || 0;
  const munshi  = parseFloat(v.munshi)         || 0;
  const shortage= parseFloat(v.shortage)       || 0;
  return gross - diesel - cash - online - munshi - shortage;
}

const TH = { padding:'9px 13px', textAlign:'left', fontSize:'10px', fontWeight:700,
  color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em',
  borderBottom:'1px solid var(--border)', whiteSpace:'nowrap', background:'var(--bg-th)', cursor:'pointer', userSelect:'none' };
const TD = { padding:'9px 11px', fontSize:'12.5px', color:'var(--text-sub)',
  verticalAlign:'middle', borderBottom:'1px solid var(--border-row)', whiteSpace:'nowrap' };
const TDF= { ...TD, padding:'10px 11px', background:'var(--bg-tf)', fontWeight:800, color:'var(--text)' };

/* ── In-line editable cell ── */
function EditCell({ value, onSave, prefix='Rs.' }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || '');
  if (editing) return (
    <input autoFocus type="number" style={{ width:'80px', background:'var(--bg-input)', border:'1px solid var(--primary)',
      borderRadius:'6px', padding:'4px 7px', color:'var(--text)', fontSize:'12px', fontFamily:'inherit' }}
      value={val} onChange={e => setVal(e.target.value)}
      onBlur={() => { onSave(val); setEditing(false); }}
      onKeyDown={e => { if (e.key==='Enter') { onSave(val); setEditing(false); } if (e.key==='Escape') setEditing(false); }}
    />
  );
  return (
    <span onClick={() => setEditing(true)} style={{ cursor:'pointer', padding:'3px 7px', borderRadius:'6px',
      border:'1px dashed var(--border)', display:'inline-block', minWidth:'60px', textAlign:'right',
      color: value ? 'var(--text)' : 'var(--text-muted)', fontSize:'12.5px',
      transition:'border 0.15s' }}
      title="Click to edit">
      {value ? prefix+Number(value).toLocaleString() : '—'}
    </span>
  );
}

export default function BalanceSheet() {
  const [tab,       setTab]       = useState('Dump');
  const [vouchers,  setVouchers]  = useState([]);
  const [selTruck,  setSelTruck]  = useState(null);   // selected truck
  const [truckSearch, setTruckSearch] = useState('');
  const [fFrom,     setFFrom]     = useState('');
  const [fTo,       setFTo]       = useState('');
  const [sortCol,   setSortCol]   = useState('date');
  const [sortDir,   setSortDir]   = useState('desc');
  const [marking,   setMarking]   = useState(false);

  useEffect(() => { fetchVouchers(); }, [tab]);
  useEffect(() => { setSelTruck(null); setTruckSearch(''); setFFrom(''); setFTo(''); }, [tab]);

  const fetchVouchers = async () => {
    try { setVouchers((await axios.get(API_V + '/' + tab)).data); } catch {}
  };

  const updateField = async (id, field, val) => {
    try { await axios.patch(API_V + '/' + id, { [field]: val }); fetchVouchers(); } catch {}
  };

  /* Group by truck */
  const truckGroups = useMemo(() => {
    const map = {};
    vouchers.forEach(v => {
      const t = v.truckNo || 'Unknown';
      if (!map[t]) map[t] = [];
      map[t].push(v);
    });
    return map;
  }, [vouchers]);

  const allTrucks = useMemo(() =>
    Object.keys(truckGroups)
      .filter(t => !truckSearch || t.toLowerCase().includes(truckSearch.toLowerCase()))
      .sort(),
    [truckGroups, truckSearch]);

  /* Detail rows for selected truck, filtered by date range */
  const detailRows = useMemo(() => {
    if (!selTruck) return [];
    let rows = truckGroups[selTruck] || [];
    if (fFrom) rows = rows.filter(v => v.date >= fFrom);
    if (fTo)   rows = rows.filter(v => v.date <= fTo);
    return [...rows].sort((a, b) => {
      let av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
      if (sortCol==='lrNo'||sortCol==='total'||sortCol==='weight') { av=parseFloat(av)||0; bv=parseFloat(bv)||0; }
      if (av < bv) return sortDir==='asc' ? -1 : 1;
      if (av > bv) return sortDir==='asc' ?  1 : -1;
      return 0;
    });
  }, [selTruck, truckGroups, fFrom, fTo, sortCol, sortDir]);

  /* Detail totals */
  const detailTotals = useMemo(() => ({
    weight:    detailRows.reduce((s,v) => s+(parseFloat(v.weight)||0), 0).toFixed(2),
    gross:     detailRows.reduce((s,v) => s+(parseFloat(v.total)||0), 0),
    netBal:    detailRows.reduce((s,v) => s+calcNet(v), 0),
    paid:      detailRows.reduce((s,v) => s+(parseFloat(v.paidBalance)||0), 0),
    outstanding: detailRows.reduce((s,v) => {
      const net = calcNet(v), paid = parseFloat(v.paidBalance)||0;
      return s + Math.max(0, net - paid);
    }, 0),
  }), [detailRows]);

  /* Truck summary for the overview table */
  const truckSummaries = useMemo(() => allTrucks.map(truck => {
    const rows = truckGroups[truck] || [];
    const gross = rows.reduce((s,v) => s+(parseFloat(v.total)||0), 0);
    const netBal= rows.reduce((s,v) => s+calcNet(v), 0);
    const paid  = rows.reduce((s,v) => s+(parseFloat(v.paidBalance)||0), 0);
    const out   = Math.max(0, netBal - paid);
    return { truck, trips: rows.length, gross, netBal, paid, outstanding: out };
  }), [allTrucks, truckGroups]);

  const toggleSort = col => {
    if (sortCol===col) setSortDir(d => d==='asc'?'desc':'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };
  const SortIcon = ({ col }) => sortCol===col
    ? (sortDir==='asc' ? <ChevronUp size={11}/> : <ChevronDown size={11}/>)
    : <ChevronDown size={11} style={{ opacity:0.3 }}/>;

  /* Mark period as paid */
  const markAsPaid = async () => {
    if (!detailRows.length) return;
    const unpaid = detailRows.filter(v => {
      const net = calcNet(v), paid = parseFloat(v.paidBalance)||0;
      return net > paid;
    });
    if (!unpaid.length) { alert('All visible vouchers are already paid'); return; }
    if (!window.confirm(\`Mark \${unpaid.length} voucher(s) as PAID for \${selTruck}?\`)) return;
    setMarking(true);
    try {
      await Promise.all(unpaid.map(v => axios.patch(API_V + '/' + v.id, { paidBalance: calcNet(v).toFixed(2) })));
      fetchVouchers();
    } catch { alert('Error marking paid'); } finally { setMarking(false); }
  };

  const fmtRs = n => 'Rs.' + Math.round(n).toLocaleString();

  return (
    <div>
      {/* Page header */}
      <div className="page-hd">
        <div>
          <h1><BarChart3 size={20} color="#f59e0b"/> Balance Sheet</h1>
          <p>Per-vehicle payment tracking</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
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

      {/* ── DETAIL VIEW (truck selected) ── */}
      {selTruck ? (
        <div>
          {/* Filter + actions bar */}
          <div className="card" style={{ marginBottom:'14px' }}>
            <div style={{ padding:'12px 16px', display:'flex', flexWrap:'wrap', gap:'10px', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 14px',
                background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)',
                borderRadius:'10px', flex:'0 0 auto' }}>
                <Truck size={15} color="#f59e0b"/>
                <span style={{ fontWeight:800, fontSize:'14px', color:'var(--text)' }}>{selTruck}</span>
                <span style={{ fontSize:'11px', color:'var(--text-muted)', fontWeight:600 }}>{detailRows.length} trips</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                <Calendar size={13} style={{ color:'var(--text-muted)' }}/>
                <input className="fi" style={{ width:'135px',height:'32px',fontSize:'12px' }}
                  type="date" value={fFrom} onChange={e=>setFFrom(e.target.value)} placeholder="From"/>
                <span style={{ color:'var(--text-muted)',fontSize:'11px' }}>to</span>
                <input className="fi" style={{ width:'135px',height:'32px',fontSize:'12px' }}
                  type="date" value={fTo} onChange={e=>setFTo(e.target.value)} placeholder="To"/>
                {(fFrom||fTo) && (
                  <button className="btn btn-g btn-sm" onClick={()=>{setFFrom('');setFTo('');}}>✕ Clear</button>
                )}
              </div>
              <div style={{ marginLeft:'auto', display:'flex', gap:'8px', alignItems:'center' }}>
                {/* Outstanding summary */}
                {detailTotals.outstanding > 0 ? (
                  <div style={{ display:'flex',alignItems:'center',gap:'6px',fontSize:'12.5px',color:'var(--warn)',fontWeight:700 }}>
                    <AlertCircle size={14}/> Outstanding: {fmtRs(detailTotals.outstanding)}
                  </div>
                ) : detailRows.length > 0 ? (
                  <div style={{ display:'flex',alignItems:'center',gap:'6px',fontSize:'12.5px',color:'var(--accent)',fontWeight:700 }}>
                    <CheckCircle2 size={14}/> All Paid
                  </div>
                ) : null}
                <button className="btn btn-p btn-sm" onClick={markAsPaid} disabled={marking||!detailRows.length}>
                  {marking ? 'Marking...' : <><CheckCircle2 size={13}/> Mark Period as Paid</>}
                </button>
              </div>
            </div>
          </div>

          {/* Detail sheet */}
          <div className="card">
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12.5px' }}>
                <thead>
                  <tr>
                    {[
                      {key:'#',     label:'#',          sort:false},
                      {key:'date',  label:'Date',        sort:true},
                      {key:'lrNo',  label:'LR No.',      sort:true},
                      {key:'weight',label:'Weight (MT)', sort:true},
                      {key:'rate',  label:'Rate',        sort:true},
                      {key:'total', label:'Gross (Rs.)', sort:true},
                      {key:'diesel',label:'Diesel Adv',  sort:false},
                      {key:'cash',  label:'Cash Adv',    sort:false},
                      {key:'online',label:'Online Adv',  sort:false},
                      {key:'munshi',label:'Munshi',      sort:false},
                      {key:'shortage',label:'Shortage',  sort:false},
                      {key:'net',   label:'Net Balance', sort:false},
                      {key:'paidBalance',label:'Paid',   sort:false},
                      {key:'status',label:'Status',      sort:false},
                    ].map(col => (
                      <th key={col.key} style={{ ...TH, cursor: col.sort ? 'pointer' : 'default' }}
                        onClick={() => col.sort && toggleSort(col.key)}>
                        <span style={{ display:'inline-flex',alignItems:'center',gap:'3px' }}>
                          {col.label}{col.sort && <SortIcon col={col.key}/>}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detailRows.length===0 && (
                    <tr><td colSpan={14} style={{ ...TD, textAlign:'center', color:'var(--text-muted)', padding:'36px' }}>
                      No vouchers in this period
                    </td></tr>
                  )}
                  {detailRows.map((v, i) => {
                    const net      = calcNet(v);
                    const diesel   = v.advanceDiesel==='FULL' ? '4000(F)' : (v.advanceDiesel||'—');
                    const paid     = parseFloat(v.paidBalance) || 0;
                    const outstanding = Math.max(0, net - paid);
                    const cleared  = outstanding <= 0;
                    return (
                      <tr key={v.id}
                        style={{ background: i%2===0?'var(--bg-row-even)':'var(--bg-row-odd)', transition:'background 0.12s' }}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--bg-row-hover)'}
                        onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'var(--bg-row-even)':'var(--bg-row-odd)'}>
                        <td style={{ ...TD,textAlign:'center',color:'var(--text-muted)',fontWeight:700 }}>{i+1}</td>
                        <td style={{ ...TD,whiteSpace:'nowrap' }}>{v.date}</td>
                        <td style={{ ...TD }}><span style={{ fontFamily:'monospace',fontWeight:800,color:'var(--primary)' }}>#{v.lrNo}</span></td>
                        <td style={{ ...TD,textAlign:'right' }}>{v.weight}</td>
                        <td style={{ ...TD,textAlign:'right' }}>{v.rate}</td>
                        <td style={{ ...TD,textAlign:'right',fontWeight:700 }}>{fmtRs(parseFloat(v.total)||0)}</td>
                        <td style={{ ...TD,textAlign:'right',color:'var(--warn)' }}>{diesel}</td>
                        <td style={{ ...TD,textAlign:'right',color:'var(--warn)' }}>{v.advanceCash||'—'}</td>
                        <td style={{ ...TD,textAlign:'right',color:'var(--warn)' }}>{v.advanceOnline||'—'}</td>
                        <td style={{ ...TD,textAlign:'right' }}>{v.munshi||'—'}</td>
                        <td style={{ ...TD,textAlign:'center' }}>
                          <EditCell value={v.shortage} onSave={val => updateField(v.id,'shortage',val)}/>
                        </td>
                        <td style={{ ...TD,textAlign:'right',fontWeight:800,color: net>=0?'var(--accent)':'var(--danger)' }}>
                          {fmtRs(net)}
                        </td>
                        <td style={{ ...TD,textAlign:'center' }}>
                          <EditCell value={v.paidBalance} onSave={val => updateField(v.id,'paidBalance',val)}/>
                        </td>
                        <td style={{ ...TD,textAlign:'center' }}>
                          {cleared ? (
                            <span style={{ display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 9px',borderRadius:'6px',
                              background:'rgba(16,185,129,0.1)',color:'var(--accent)',fontSize:'11px',fontWeight:700 }}>
                              <Check size={10}/> Paid
                            </span>
                          ) : (
                            <span style={{ display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 9px',borderRadius:'6px',
                              background:'rgba(245,158,11,0.1)',color:'var(--warn)',fontSize:'11px',fontWeight:700 }}>
                              {fmtRs(outstanding)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {detailRows.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop:'2px solid var(--border)' }}>
                      <td colSpan={3} style={{ ...TDF,color:'var(--text-muted)',fontSize:'10px',textTransform:'uppercase',letterSpacing:'0.08em' }}>
                        Totals ({detailRows.length} trips)
                      </td>
                      <td style={{ ...TDF,textAlign:'right' }}>{detailTotals.weight}</td>
                      <td style={{ ...TDF }}></td>
                      <td style={{ ...TDF,textAlign:'right' }}>{fmtRs(detailTotals.gross)}</td>
                      <td colSpan={5} style={{ ...TDF }}></td>
                      <td style={{ ...TDF,textAlign:'right',color:'var(--accent)',fontSize:'14px' }}>{fmtRs(detailTotals.netBal)}</td>
                      <td style={{ ...TDF,textAlign:'right' }}>{fmtRs(detailTotals.paid)}</td>
                      <td style={{ ...TDF,textAlign:'center',color: detailTotals.outstanding>0?'var(--warn)':'var(--accent)', fontSize:'13px' }}>
                        {detailTotals.outstanding > 0 ? fmtRs(detailTotals.outstanding) : <><Check size={12}/> Cleared</>}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ── OVERVIEW: all trucks ── */
        <div className="card">
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon ci-amber"><Truck size={17}/></div>
              <div className="card-title-text">
                <h3>All Vehicles — {tab.replace('_',' ')}</h3>
                <p>{allTrucks.length} trucks · click a row to view details</p>
              </div>
            </div>
            <div style={{ display:'flex',gap:'8px',alignItems:'center' }}>
              <div style={{ position:'relative' }}>
                <Search size={12} style={{ position:'absolute',left:'9px',top:'50%',transform:'translateY(-50%)',color:'var(--text-muted)' }}/>
                <input className="fi" style={{ paddingLeft:'27px',height:'32px',width:'160px',fontSize:'12px' }}
                  type="text" placeholder="Search truck..." value={truckSearch} onChange={e=>setTruckSearch(e.target.value)}/>
              </div>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12.5px' }}>
              <thead>
                <tr>
                  {['#','Truck No.','Trips','Net Balance','Paid','Outstanding','Status'].map(h => (
                    <th key={h} style={{ ...TH, cursor:'default' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {truckSummaries.length===0 && (
                  <tr><td colSpan={7} style={{...TD,textAlign:'center',color:'var(--text-muted)',padding:'36px'}}>No records</td></tr>
                )}
                {truckSummaries.map(({ truck, trips, gross, netBal, paid, outstanding }, i) => (
                  <tr key={truck}
                    style={{ background:i%2===0?'var(--bg-row-even)':'var(--bg-row-odd)', cursor:'pointer', transition:'background 0.12s' }}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--bg-row-hover)'}
                    onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'var(--bg-row-even)':'var(--bg-row-odd)'}
                    onClick={() => setSelTruck(truck)}>
                    <td style={{ ...TD,textAlign:'center',color:'var(--text-muted)',fontWeight:700 }}>{i+1}</td>
                    <td style={{ ...TD }}>
                      <div style={{ display:'flex',alignItems:'center',gap:'8px' }}>
                        <div style={{ width:'30px',height:'30px',borderRadius:'8px',background:'rgba(245,158,11,0.1)',
                          display:'flex',alignItems:'center',justifyContent:'center' }}>
                          <Truck size={14} color="#f59e0b"/>
                        </div>
                        <span style={{ fontWeight:800,color:'var(--text)',fontSize:'13px' }}>{truck}</span>
                      </div>
                    </td>
                    <td style={{ ...TD,textAlign:'center',fontWeight:700 }}>{trips}</td>
                    <td style={{ ...TD,textAlign:'right',fontWeight:700,color:'var(--text)' }}>{fmtRs(netBal)}</td>
                    <td style={{ ...TD,textAlign:'right',color:'var(--accent)',fontWeight:700 }}>{fmtRs(paid)}</td>
                    <td style={{ ...TD,textAlign:'right',fontWeight:800,
                      color: outstanding>0?'var(--warn)':'var(--accent)',fontSize:'13px' }}>
                      {outstanding > 0 ? fmtRs(outstanding) : '—'}
                    </td>
                    <td style={{ ...TD,textAlign:'center' }}>
                      {outstanding <= 0 ? (
                        <span style={{ display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 9px',borderRadius:'6px',
                          background:'rgba(16,185,129,0.1)',color:'var(--accent)',fontSize:'11px',fontWeight:700 }}>
                          <Check size={10}/> Cleared
                        </span>
                      ) : (
                        <span style={{ display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 9px',borderRadius:'6px',
                          background:'rgba(245,158,11,0.1)',color:'var(--warn)',fontSize:'11px',fontWeight:700 }}>
                          Pending
                        </span>
                      )}
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
