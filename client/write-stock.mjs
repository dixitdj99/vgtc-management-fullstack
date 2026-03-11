import { writeFileSync } from 'fs';

const MATERIALS = ['PPC', 'OPC43', 'Adstar', 'OPC FS', 'OPC53 FS', 'Weather'];
const MAT_COLORS = { 'PPC': '#6366f1', 'OPC43': '#f59e0b', 'Adstar': '#10b981', 'OPC FS': '#0ea5e9', 'OPC53 FS': '#a855f7', 'Weather': '#f43f5e' };

const code = `import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Plus, TrendingDown, FileText, Archive, CheckCircle2,
  XCircle, AlertCircle, Clock, Trash2, RefreshCw, ChevronDown,
  ChevronUp, X, Save, Check, Tag } from 'lucide-react';

const API   = 'http://localhost:5000/api/stock';
const API_LR= 'http://localhost:5000/api/lr';
const MATS  = ${JSON.stringify(MATERIALS)};
const MCOL  = ${JSON.stringify(MAT_COLORS)};
const STATUS_META = {
  open:      { label:'Open / On Hold', color:'var(--warn)',   Icon: Clock         },
  loaded:    { label:'Loaded',         color:'var(--accent)',  Icon: CheckCircle2  },
  cancelled: { label:'Cancelled',      color:'var(--danger)',  Icon: XCircle       },
};

const fmtBags = n => Number(n||0).toLocaleString('en-IN') + ' bags';
const fmtWt   = n => parseFloat(n||0).toFixed(2) + ' MT';
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';

/* ── form helper ── */
const fi = (label, node) => (
  <div className="field" style={{flex:1,minWidth:'120px'}}>
    <label>{label}</label>{node}
  </div>
);

/* ─────────────────────────────────────────────
   MATERIAL CARD
───────────────────────────────────────────── */
function MatCard({ mat, added, lrUsed, held }) {
  const available = added - lrUsed - held;
  const total     = added - lrUsed;
  const col       = MCOL[mat] || '#6366f1';
  return (
    <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:'14px',
      padding:'15px 18px',borderTop:\`3px solid \${col}\`}}>
      <div style={{display:'flex',alignItems:'center',gap:'9px',marginBottom:'12px'}}>
        <div style={{width:'32px',height:'32px',borderRadius:'9px',background:col+'22',
          display:'flex',alignItems:'center',justifyContent:'center'}}>
          <Package size={16} color={col}/>
        </div>
        <span style={{fontWeight:800,fontSize:'13.5px',color:'var(--text)'}}>{mat}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px'}}>
        {[
          {label:'Available', val: available, color: available<0?'var(--danger)':col},
          {label:'On Hold',   val: held,      color:'var(--warn)'},
          {label:'Total',     val: total,     color:'var(--text)'},
        ].map(({label,val,color})=>(
          <div key={label} style={{textAlign:'center',padding:'8px 6px',background:'var(--bg)',borderRadius:'8px'}}>
            <div style={{fontSize:'18px',fontWeight:900,color,lineHeight:1}}>{val.toLocaleString('en-IN')}</div>
            <div style={{fontSize:'9.5px',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.07em',marginTop:'3px'}}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════
   MAIN
═════════════════════════════════════════════════ */
export default function StockModule() {
  const [additions, setAdditions] = useState([]);
  const [challans,  setChallans]  = useState([]);
  const [lrs,       setLrs]       = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState('overview'); // overview|add|challan|history
  const [challanFilter, setChallanFilter] = useState('open'); // open|loaded|cancelled|all
  const [delTarget, setDelTarget] = useState(null);

  /* forms */
  const emptyAdd  = { material: MATS[0], quantity:'', date: new Date().toISOString().slice(0,10), remark:'' };
  const emptyChal = { truckNo:'', material: MATS[0], quantity:'', partyName:'', date: new Date().toISOString().slice(0,10), remark:'' };
  const [addForm,  setAddForm]  = useState(emptyAdd);
  const [chalForm, setChalForm] = useState(emptyChal);
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState('');

  useEffect(() => { fetchAll(); }, []);
  const fetchAll = async () => {
    setLoading(true);
    try {
      const [ad, ch, lr] = await Promise.all([
        axios.get(API + '/additions').then(r=>r.data),
        axios.get(API + '/challans').then(r=>r.data),
        axios.get(API_LR).then(r=>r.data),
      ]);
      setAdditions(ad); setChallans(ch); setLrs(lr);
    } catch(e){ console.error(e); }
    finally{ setLoading(false); }
  };

  /* ── stock math per material ── */
  const stockMap = useMemo(() => {
    const m = {};
    MATS.forEach(mat => {
      const added   = additions.filter(a=>a.material===mat).reduce((s,a)=>s+(parseFloat(a.quantity)||0),0);
      const lrUsed  = lrs.filter(l=>l.material===mat).reduce((s,l)=>s+(parseInt(l.totalBags)||0),0);
      const held    = challans.filter(c=>c.material===mat&&c.status==='open').reduce((s,c)=>s+(parseFloat(c.quantity)||0),0);
      m[mat] = { added, lrUsed, held, available: added-lrUsed-held, total: added-lrUsed };
    });
    return m;
  }, [additions, challans, lrs]);

  const totalAvailable = MATS.reduce((s,mat)=>s+(stockMap[mat]?.available||0),0);
  const totalHeld      = MATS.reduce((s,mat)=>s+(stockMap[mat]?.held||0),0);

  /* ── handlers ── */
  const submitAdd = async e => {
    e.preventDefault(); setErr('');
    if(!addForm.quantity||parseFloat(addForm.quantity)<=0){setErr('Enter valid quantity');return;}
    setSaving(true);
    try{ await axios.post(API+'/additions', addForm); setAddForm(emptyAdd); fetchAll(); }
    catch(er){ setErr(er.response?.data?.error||'Error'); } finally{ setSaving(false); }
  };

  const submitChallan = async e => {
    e.preventDefault(); setErr('');
    if(!chalForm.truckNo){setErr('Truck number required');return;}
    if(!chalForm.quantity||parseFloat(chalForm.quantity)<=0){setErr('Enter valid quantity');return;}
    // Check availability
    const avail = stockMap[chalForm.material]?.available || 0;
    if(parseFloat(chalForm.quantity) > avail){
      if(!window.confirm(\`Only \${avail} bags available. Create challan anyway?\`)) return;
    }
    setSaving(true);
    try{ await axios.post(API+'/challans', chalForm); setChalForm(emptyChal); fetchAll(); }
    catch(er){ setErr(er.response?.data?.error||'Error'); } finally{ setSaving(false); }
  };

  const updateStatus = async (id, status) => {
    try{ await axios.patch(API+'/challans/'+id, { status }); fetchAll(); }
    catch(er){ alert(er.response?.data?.error||'Error'); }
  };

  const deleteItem = async () => {
    if(!delTarget) return;
    try{
      if(delTarget.type==='addition') await axios.delete(API+'/additions/'+delTarget.id);
      else                            await axios.delete(API+'/challans/'+delTarget.id);
      fetchAll();
    } catch(er){ alert('Delete failed'); }
    setDelTarget(null);
  };

  const TH = {padding:'8px 11px',fontSize:'10px',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',
    letterSpacing:'0.07em',background:'var(--bg-th)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'};
  const TD = {padding:'8px 10px',fontSize:'12.5px',color:'var(--text-sub)',verticalAlign:'middle',borderBottom:'1px solid var(--border-row)'};

  /* ── filtered challans ── */
  const filteredChallans = useMemo(()=>
    challanFilter==='all' ? challans : challans.filter(c=>c.status===challanFilter),
    [challans, challanFilter]);

  /* ── History rows combined (additions + LR deductions) sorted by date ── */
  const historyRows = useMemo(() => {
    const rows = [
      ...additions.map(a=>({ ...a, txType:'add',   debit:0,    credit: a.quantity, label:\`Stock Added — \${a.remark||'Manual entry'}\` })),
      ...lrs.map(l=>      ({ ...l, txType:'lr',    debit:l.totalBags||0, credit:0, label:\`LR #\${l.lrNo} — Truck \${l.truckNo||'?'}\` })),
    ].sort((a,b)=>(a.date||'') > (b.date||'') ? -1 : 1);
    return rows;
  }, [additions, lrs]);

  return (
    <div>
      {/* Delete confirm */}
      <AnimatePresence>
        {delTarget && (
          <div style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <motion.div initial={{opacity:0,scale:0.94}} animate={{opacity:1,scale:1}}
              style={{background:'var(--bg-card)',border:'1px solid rgba(244,63,94,0.25)',borderRadius:'16px',padding:'26px 22px',width:'300px',textAlign:'center'}}>
              <AlertCircle size={28} color="var(--danger)" style={{marginBottom:'12px'}}/>
              <div style={{fontWeight:800,color:'var(--text)',marginBottom:'6px',fontSize:'14px'}}>Delete Entry?</div>
              <div style={{fontSize:'12px',color:'var(--text-muted)',marginBottom:'18px'}}>{delTarget.label}</div>
              <div style={{display:'flex',gap:'8px',justifyContent:'center'}}>
                <button className="btn btn-g" onClick={()=>setDelTarget(null)}>Cancel</button>
                <button className="btn btn-d" onClick={deleteItem}><Trash2 size={13}/> Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="page-hd">
        <div>
          <h1><Package size={20} color="#a855f7"/> Dump Stock</h1>
          <p>Material inventory & challan management</p>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          <button className="btn btn-g btn-sm" onClick={fetchAll}><RefreshCw size={13}/> Refresh</button>
        </div>
      </div>

      {/* Material cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:'12px',marginBottom:'18px'}}>
        {MATS.map(mat => <MatCard key={mat} mat={mat} {...(stockMap[mat]||{added:0,lrUsed:0,held:0})}/>)}
      </div>

      {/* Quick summary strip */}
      <div style={{display:'flex',gap:'10px',marginBottom:'16px',flexWrap:'wrap'}}>
        {[
          {label:'Total Available',    val: totalAvailable, color:'#a855f7'},
          {label:'Total On Hold',      val: totalHeld,      color:'var(--warn)'},
          {label:'Open Challans',      val: challans.filter(c=>c.status==='open').length, color:'var(--primary)', unit:'challans'},
        ].map(({label,val,color,unit='bags'})=>(
          <div key={label} style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:'12px',padding:'12px 18px',display:'flex',flexDirection:'column',gap:'3px',minWidth:'150px'}}>
            <span style={{fontSize:'9px',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em'}}>{label}</span>
            <span style={{fontSize:'20px',fontWeight:900,color,lineHeight:1}}>{val.toLocaleString('en-IN')}</span>
            <span style={{fontSize:'10px',color:'var(--text-muted)'}}>{unit}</span>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div style={{display:'flex',gap:'6px',marginBottom:'14px',flexWrap:'wrap'}}>
        {[
          {id:'overview', label:'Overview',  icon:<Package size={13}/>},
          {id:'add',      label:'Add Stock', icon:<Plus size={13}/>},
          {id:'challan',  label:'Challans',  icon:<Tag size={13}/>},
          {id:'history',  label:'History',   icon:<FileText size={13}/>},
        ].map(({id,label,icon})=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{padding:'7px 14px',borderRadius:'9px',border:'1px solid',cursor:'pointer',fontFamily:'inherit',
              fontSize:'12px',fontWeight:700,display:'flex',alignItems:'center',gap:'5px',transition:'all 0.15s',
              borderColor:tab===id?'#a855f7':'var(--border)',
              background:tab===id?'rgba(168,85,247,0.1)':'transparent',
              color:tab===id?'#a855f7':'var(--text-muted)'}}>
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab==='overview' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon" style={{background:'rgba(168,85,247,0.1)',color:'#a855f7'}}><Package size={17}/></div>
              <div className="card-title-text"><h3>Stock Summary by Material</h3><p>Current inventory levels</p></div>
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>
                {['Material','Added (bags)','LR Consumed','On Hold','Available','Status'].map(h=>(
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {MATS.map((mat,i)=>{
                  const {added,lrUsed,held,available}=stockMap[mat]||{};
                  const col=MCOL[mat];
                  return (
                    <tr key={mat} style={{background:i%2===0?'var(--bg-row-even)':'var(--bg-row-odd)'}}>
                      <td style={{...TD,fontWeight:800}}>
                        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                          <div style={{width:'8px',height:'8px',borderRadius:'50%',background:col,flexShrink:0}}/>
                          {mat}
                        </div>
                      </td>
                      <td style={{...TD,textAlign:'right',fontWeight:700,color:'var(--accent)'}}>{(added||0).toLocaleString()}</td>
                      <td style={{...TD,textAlign:'right',color:'var(--danger)'}}>{(lrUsed||0).toLocaleString()}</td>
                      <td style={{...TD,textAlign:'right',color:'var(--warn)'}}>{(held||0).toLocaleString()}</td>
                      <td style={{...TD,textAlign:'right',fontWeight:800,fontSize:'13px',color:available<0?'var(--danger)':col}}>{(available||0).toLocaleString()}</td>
                      <td style={{...TD}}>
                        {available < 0
                          ? <span style={{padding:'2px 8px',borderRadius:'5px',background:'rgba(244,63,94,0.1)',color:'var(--danger)',fontSize:'11px',fontWeight:700}}>⚠ Deficit</span>
                          : available===0
                          ? <span style={{padding:'2px 8px',borderRadius:'5px',background:'rgba(245,158,11,0.1)',color:'var(--warn)',fontSize:'11px',fontWeight:700}}>Empty</span>
                          : <span style={{padding:'2px 8px',borderRadius:'5px',background:'rgba(16,185,129,0.1)',color:'var(--accent)',fontSize:'11px',fontWeight:700}}>✓ In Stock</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ADD STOCK TAB ── */}
      {tab==='add' && (
        <div>
          <div className="card" style={{marginBottom:'14px'}}>
            <div className="card-header"><div className="card-title-block">
              <div className="card-icon" style={{background:'rgba(16,185,129,0.1)',color:'var(--accent)'}}><Plus size={17}/></div>
              <div className="card-title-text"><h3>Add Stock Entry</h3><p>Record new material delivery</p></div>
            </div></div>
            <form onSubmit={submitAdd} style={{padding:'14px 18px'}}>
              <div style={{display:'flex',flexWrap:'wrap',gap:'10px',alignItems:'flex-end'}}>
                {fi('Material', <select className="fi" value={addForm.material} onChange={e=>setAddForm(f=>({...f,material:e.target.value}))}>
                  {MATS.map(m=><option key={m}>{m}</option>)}</select>)}
                {fi('Quantity (bags)', <input className="fi" type="number" step="1" min="1" required placeholder="e.g. 500"
                  value={addForm.quantity} onChange={e=>setAddForm(f=>({...f,quantity:e.target.value}))}/>)}
                {fi('Date', <input className="fi" type="date" value={addForm.date} onChange={e=>setAddForm(f=>({...f,date:e.target.value}))}/>)}
                {fi('Remark', <input className="fi" type="text" placeholder="Supplier name / note"
                  value={addForm.remark} onChange={e=>setAddForm(f=>({...f,remark:e.target.value}))}/>)}
                <button type="submit" className="btn btn-a" disabled={saving} style={{height:'38px',alignSelf:'flex-end'}}>
                  {saving?'…':<><Check size={14}/> Add Stock</>}
                </button>
              </div>
              {err && <div style={{fontSize:'12px',color:'var(--danger)',marginTop:'7px',fontWeight:600}}>{err}</div>}
            </form>
          </div>

          {/* Additions history */}
          <div className="card">
            <div className="card-header"><div className="card-title-block">
              <div className="card-icon" style={{background:'rgba(168,85,247,0.1)',color:'#a855f7'}}><Archive size={17}/></div>
              <div className="card-title-text"><h3>Stock Addition History</h3><p>{additions.length} entries</p></div>
            </div></div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>{['#','Date','Material','Quantity','Remark','Action'].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {additions.length===0&&<tr><td colSpan={6} style={{...TD,textAlign:'center',color:'var(--text-muted)',padding:'36px'}}>No additions yet</td></tr>}
                  {[...additions].sort((a,b)=>a.date>b.date?-1:1).map((a,i)=>(
                    <tr key={a.id} style={{background:i%2===0?'var(--bg-row-even)':'var(--bg-row-odd)'}}>
                      <td style={{...TD,textAlign:'center',color:'var(--text-muted)',fontWeight:700}}>{i+1}</td>
                      <td style={{...TD,whiteSpace:'nowrap'}}>{fmtDate(a.date)}</td>
                      <td style={{...TD}}>
                        <span style={{display:'inline-flex',alignItems:'center',gap:'5px'}}>
                          <span style={{width:'8px',height:'8px',borderRadius:'50%',background:MCOL[a.material],display:'inline-block'}}/>
                          {a.material}
                        </span>
                      </td>
                      <td style={{...TD,textAlign:'right',fontWeight:700,color:'var(--accent)'}}>{(a.quantity||0).toLocaleString()} bags</td>
                      <td style={{...TD,color:'var(--text-muted)'}}>{a.remark||'—'}</td>
                      <td style={{...TD,textAlign:'center'}}>
                        <button className="btn btn-d btn-icon btn-sm" onClick={()=>setDelTarget({id:a.id,type:'addition',label:a.material+' — '+a.quantity+' bags'})}>
                          <Trash2 size={13}/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── CHALLAN TAB ── */}
      {tab==='challan' && (
        <div>
          {/* Create Challan Form */}
          <div className="card" style={{marginBottom:'14px'}}>
            <div className="card-header"><div className="card-title-block">
              <div className="card-icon" style={{background:'rgba(245,158,11,0.1)',color:'var(--warn)'}}><Tag size={17}/></div>
              <div className="card-title-text"><h3>Create New Challan</h3><p>Assign stock to a vehicle (goes to Hold)</p></div>
            </div></div>
            <form onSubmit={submitChallan} style={{padding:'14px 18px'}}>
              <div style={{display:'flex',flexWrap:'wrap',gap:'10px',alignItems:'flex-end'}}>
                {fi('Truck No.', <input className="fi" type="text" placeholder="e.g. GJ01AB1234" required
                  value={chalForm.truckNo} onChange={e=>setChalForm(f=>({...f,truckNo:e.target.value}))}/>)}
                {fi('Material', <select className="fi" value={chalForm.material} onChange={e=>setChalForm(f=>({...f,material:e.target.value}))}>
                  {MATS.map(m=><option key={m}>{m}</option>)}</select>)}
                {fi('Quantity (bags)', <input className="fi" type="number" step="1" min="1" required placeholder="bags"
                  value={chalForm.quantity} onChange={e=>setChalForm(f=>({...f,quantity:e.target.value}))}/>)}
                {fi('Party Name', <input className="fi" type="text" placeholder="Customer / party"
                  value={chalForm.partyName} onChange={e=>setChalForm(f=>({...f,partyName:e.target.value}))}/>)}
                {fi('Date', <input className="fi" type="date" value={chalForm.date} onChange={e=>setChalForm(f=>({...f,date:e.target.value}))}/>)}
                {fi('Remark', <input className="fi" type="text" placeholder="Notes"
                  value={chalForm.remark} onChange={e=>setChalForm(f=>({...f,remark:e.target.value}))}/>)}
                <button type="submit" className="btn btn-p" disabled={saving} style={{height:'38px',alignSelf:'flex-end'}}>
                  {saving?'…':<><Tag size={14}/> Create Challan</>}
                </button>
              </div>
              {chalForm.material && (
                <div style={{marginTop:'8px',fontSize:'12px',color:'var(--text-muted)',fontWeight:600}}>
                  📦 {chalForm.material} available: <strong style={{color:'var(--text)'}}>{(stockMap[chalForm.material]?.available||0).toLocaleString()} bags</strong>
                </div>
              )}
              {err && <div style={{fontSize:'12px',color:'var(--danger)',marginTop:'7px',fontWeight:600}}>{err}</div>}
            </form>
          </div>

          {/* Challan List */}
          <div className="card">
            <div className="card-header" style={{flexWrap:'wrap',gap:'8px'}}>
              <div className="card-title-block">
                <div className="card-icon" style={{background:'rgba(245,158,11,0.1)',color:'var(--warn)'}}><FileText size={17}/></div>
                <div className="card-title-text"><h3>Challan List</h3><p>{filteredChallans.length} challans</p></div>
              </div>
              <div style={{display:'flex',gap:'6px'}}>
                {['open','loaded','cancelled','all'].map(s=>(
                  <button key={s} onClick={()=>setChallanFilter(s)}
                    style={{padding:'5px 11px',borderRadius:'7px',border:'1px solid',cursor:'pointer',fontFamily:'inherit',
                      fontSize:'11px',fontWeight:700,textTransform:'capitalize',transition:'all 0.13s',
                      borderColor:challanFilter===s?'var(--primary)':'var(--border)',
                      background:challanFilter===s?'rgba(99,102,241,0.1)':'transparent',
                      color:challanFilter===s?'var(--primary)':'var(--text-muted)'}}>
                    {s==='open'?'On Hold':s}
                    <span style={{opacity:0.7,marginLeft:'4px',fontSize:'10px'}}>
                      ({challans.filter(c=>s==='all'||c.status===s).length})
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>
                  {['Challan#','Date','Truck','Material','Qty (bags)','Party','Remark','Status','Actions'].map(h=>(
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filteredChallans.length===0&&<tr><td colSpan={9} style={{...TD,textAlign:'center',color:'var(--text-muted)',padding:'36px'}}>No challans</td></tr>}
                  {[...filteredChallans].sort((a,b)=>a.date>b.date?-1:1).map((c,i)=>{
                    const sm=STATUS_META[c.status]||STATUS_META.open;
                    return (
                      <tr key={c.id} style={{background:i%2===0?'var(--bg-row-even)':'var(--bg-row-odd)'}}>
                        <td style={{...TD,fontWeight:800,color:'var(--primary)',fontFamily:'monospace'}}>{c.challanNo}</td>
                        <td style={{...TD,whiteSpace:'nowrap'}}>{fmtDate(c.date)}</td>
                        <td style={{...TD,fontWeight:700,color:'var(--text)'}}>{c.truckNo}</td>
                        <td style={{...TD}}>
                          <span style={{display:'inline-flex',alignItems:'center',gap:'5px'}}>
                            <span style={{width:'8px',height:'8px',borderRadius:'50%',background:MCOL[c.material],display:'inline-block'}}/>
                            {c.material}
                          </span>
                        </td>
                        <td style={{...TD,textAlign:'right',fontWeight:700}}>{(c.quantity||0).toLocaleString()}</td>
                        <td style={{...TD}}>{c.partyName||'—'}</td>
                        <td style={{...TD,color:'var(--text-muted)',maxWidth:'140px',overflow:'hidden',textOverflow:'ellipsis'}}>{c.remark||'—'}</td>
                        <td style={{...TD}}>
                          <span style={{display:'inline-flex',alignItems:'center',gap:'4px',padding:'2px 8px',borderRadius:'6px',fontSize:'11px',fontWeight:700,
                            background:sm.color+'22',color:sm.color}}>
                            <sm.Icon size={11}/>{sm.label}
                          </span>
                        </td>
                        <td style={{...TD}}>
                          <div style={{display:'flex',gap:'4px',justifyContent:'center'}}>
                            {c.status==='open' && (<>
                              <button className="btn btn-a btn-sm btn-icon" title="Mark as Loaded"
                                onClick={()=>updateStatus(c.id,'loaded')}><CheckCircle2 size={13}/></button>
                              <button className="btn btn-d btn-sm btn-icon" title="Cancel Challan"
                                onClick={()=>updateStatus(c.id,'cancelled')}><XCircle size={13}/></button>
                            </>)}
                            {c.status!=='open' && (
                              <button className="btn btn-g btn-sm btn-icon" title="Re-open"
                                onClick={()=>updateStatus(c.id,'open')}><RefreshCw size={12}/></button>
                            )}
                            <button className="btn btn-d btn-sm btn-icon" title="Delete"
                              onClick={()=>setDelTarget({id:c.id,type:'challan',label:c.challanNo+' — '+c.truckNo})}>
                              <Trash2 size={13}/>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab==='history' && (
        <div className="card">
          <div className="card-header"><div className="card-title-block">
            <div className="card-icon" style={{background:'rgba(99,102,241,0.1)',color:'var(--primary)'}}><FileText size={17}/></div>
            <div className="card-title-text"><h3>Full Stock History</h3><p>Additions + LR deductions combined</p></div>
          </div></div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>
                {['Date','Type','LR/Ref','Truck','Material','In (bags)','Out (bags)'].map(h=>
                  <th key={h} style={TH}>{h}</th>)}
              </tr></thead>
              <tbody>
                {historyRows.length===0&&<tr><td colSpan={7} style={{...TD,textAlign:'center',color:'var(--text-muted)',padding:'36px'}}>No history</td></tr>}
                {historyRows.map((r,i)=>(
                  <tr key={r.id} style={{background:i%2===0?'var(--bg-row-even)':'var(--bg-row-odd)'}}>
                    <td style={{...TD,whiteSpace:'nowrap'}}>{fmtDate(r.date)}</td>
                    <td style={{...TD}}>
                      {r.txType==='add'
                        ?<span style={{padding:'2px 8px',borderRadius:'5px',background:'rgba(16,185,129,0.1)',color:'var(--accent)',fontSize:'11px',fontWeight:700}}>Stock In</span>
                        :<span style={{padding:'2px 8px',borderRadius:'5px',background:'rgba(244,63,94,0.1)',color:'var(--danger)',fontSize:'11px',fontWeight:700}}>LR Use</span>}
                    </td>
                    <td style={{...TD,fontFamily:'monospace',fontWeight:700,color:'var(--primary)'}}>
                      {r.txType==='lr'?\`#\${r.lrNo}\`:r.remark||'—'}
                    </td>
                    <td style={{...TD}}>{r.truckNo||'—'}</td>
                    <td style={{...TD}}>
                      <span style={{display:'inline-flex',alignItems:'center',gap:'5px'}}>
                        <span style={{width:'7px',height:'7px',borderRadius:'50%',background:MCOL[r.material],display:'inline-block'}}/>
                        {r.material||'—'}
                      </span>
                    </td>
                    <td style={{...TD,textAlign:'right',fontWeight:700,color:'var(--accent)'}}>
                      {r.credit>0?(r.credit||0).toLocaleString():'—'}
                    </td>
                    <td style={{...TD,textAlign:'right',fontWeight:700,color:'var(--danger)'}}>
                      {r.debit>0?(r.debit||0).toLocaleString():'—'}
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

writeFileSync('B:/VGTC Managemet/client/src/modules/StockModule.jsx', code, 'utf8');
console.log('StockModule.jsx written:', code.length, 'chars');
