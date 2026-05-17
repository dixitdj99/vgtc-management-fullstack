import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Check, RefreshCw, Calendar, Hash, Download, AlertCircle,
  ArrowLeft, ArrowRight, Printer, Eye, Settings2, Upload, Table2, X,
  ChevronDown, ChevronRight, Trash2, Plus, Clock, History, MoveRight
} from 'lucide-react';
import * as XLSX from 'xlsx';

const PLANT_OPTIONS = [
  { key: 'jksuper_jharli', label: 'JK Super Dump 1022', lrBrand: 'dump', gstRate: 9, invoiceType: 'Dump', description: 'Only Dump entries (blank SALES DOC TYPE)' },
  { key: 'jksuper_trade', label: 'JK Super Trade 1022', lrBrand: 'dump', gstRate: 9, invoiceType: 'Factory Trade', description: 'Only Factory Trade Sale entries' },
  { key: 'jksuper_nontrade', label: 'JK Super Non-Trade 1022', lrBrand: 'dump', gstRate: 9, invoiceType: 'Non-Trade', description: 'Only Factory Non-Trade entries' },
  { key: 'jklakshmi_jharli', label: 'JK Lakshmi 1022', lrBrand: 'jkl', gstRate: 6, invoiceType: 'all', description: 'All entry types' },
  { key: 'kosli_dump', label: 'Kosli Dump', lrBrand: 'kosli', gstRate: 6, invoiceType: 'all', description: 'All entry types' },
  { key: 'jhajjar_dump', label: 'Jhajjar Dump', lrBrand: 'jhajjar', gstRate: 6, invoiceType: 'all', description: 'All entry types' },
];

const TH = { padding: '6px 8px', fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', background: 'var(--bg-th)', borderBottom: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap' };
const TD = { padding: '5px 8px', fontSize: '11px', color: 'var(--text-sub)', borderBottom: '1px solid var(--border-row)' };
const fmtINR = (n) => (!n && n !== 0) ? '—' : '₹' + Math.round(n).toLocaleString('en-IN');
const fmtD2 = (n) => { const f = Math.abs(n).toFixed(2).split('.'); return (n<0?'-':'') + parseInt(f[0]).toLocaleString('en-IN') + '.' + f[1]; };

export default function InvoiceModule({ brand = 'dump' }) {
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  // ── Core State ──
  const [plantKey, setPlantKey] = useState(() => {
    if (brand === 'jkl') return 'jklakshmi_jharli';
    return 'jksuper_jharli';
  });
  const [view, setView] = useState('upload'); // upload | editor | generate | history
  const [billNoStart, setBillNoStart] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [maxPerBill, setMaxPerBill] = useState(20);

  // ── Invoice Data ──
  const [invoices, setInvoices] = useState([]); // [{billNo, type, gstRate, items:[], expanded}]
  const [pendingItems, setPendingItems] = useState([]);
  const [savedPending, setSavedPending] = useState([]);

  // ── Generate State ──
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [results, setResults] = useState([]); // [{billNo, status, pdfUrl, error}]

  // ── History ──
  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── LR data for matching ──
  const [lrs, setLrs] = useState([]);

  const selectedPlant = PLANT_OPTIONS.find(p => p.key === plantKey) || PLANT_OPTIONS[0];

  // ── Fetch LRs ──
  const fetchLrs = useCallback(async () => {
    try {
      const endpoints = { dump: '/lr', jkl: '/jkl/lr', kosli: '/kosli/lr', jhajjar: '/jhajjar/lr' };
      const ep = endpoints[selectedPlant.lrBrand] || '/lr';
      const res = await ax.get(`${ep}?brand=${selectedPlant.lrBrand}`);
      setLrs((res.data || []).filter(lr => !lr.invoiceGenerated));
    } catch { setLrs([]); }
  }, [selectedPlant]);

  // ── Fetch next bill number ──
  const fetchNextBillNo = useCallback(async () => {
    try {
      const res = await ax.get('/invoices/next-number');
      setBillNoStart(String(res.data.nextNo || 1));
    } catch { setBillNoStart('1'); }
  }, []);

  // ── Fetch saved pending ──
  const fetchPending = useCallback(async () => {
    try {
      const res = await ax.get('/invoices/pending');
      setSavedPending(res.data || []);
    } catch { setSavedPending([]); }
  }, []);

  // ── Fetch history ──
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await ax.get('/invoices');
      setHistoryList(res.data || []);
    } catch { setHistoryList([]); }
    setHistoryLoading(false);
  }, []);

  useEffect(() => { fetchLrs(); fetchNextBillNo(); fetchPending(); }, [fetchLrs, fetchNextBillNo, fetchPending]);

  // ══════════════════════════════════════════════════════════
  // EXCEL UPLOAD + PARSE
  // ══════════════════════════════════════════════════════════
  const handleExcelUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const ws1 = wb.Sheets[wb.SheetNames[0]];
        const sheet1 = XLSX.utils.sheet_to_json(ws1, { defval: '' });
        if (sheet1.length === 0) return alert('Sheet1 is empty');

        const isVikasFormat = sheet1[0] && ('SALES DOC TYPE' in sheet1[0] || 'TOTAL FRIGHT' in sheet1[0]);

        // Read Sheet2 for verification
        let sheet2LRs = new Map();
        if (wb.SheetNames.length > 1) {
          const ws2 = wb.Sheets[wb.SheetNames[1]];
          XLSX.utils.sheet_to_json(ws2, { defval: '' }).forEach(r => {
            const lr = String(r['LR No'] || '').trim();
            if (lr) sheet2LRs.set(lr, {
              billedQty: parseFloat(r['Billed Qty']) || 0,
              recQty: parseFloat(r['Recd. Qty']) || 0,
              shortQty: parseFloat(r['Short Qty']) || 0,
            });
          });
        }

        if (isVikasFormat) {
          const parseRow = (r) => {
            const qty = parseFloat(r['SALES QUANTITY - TO']) || 0;
            const totalFreight = parseFloat(r['TOTAL FRIGHT']) || 0;
            const rate = qty > 0 ? Math.round(totalFreight / qty) : 0;
            return {
              consigneeName: String(r['CUSTOMER DESCRIPTION'] || 'JK CEMENT WORKS').trim(),
              destination: String(r['CITY NAME'] || r['COUNTY NAME'] || '').trim(),
              truckNo: String(r['VEHICLE NUMBER'] || '').trim(),
              lrNo: String(r['LR NUMBER'] || '').trim(),
              invoiceNo: String(r['INVOICE NO'] || '').trim(),
              invoiceDate: String(r['BILLING DATE'] || '').trim(),
              billedQty: qty, recQty: qty, ratePMT: rate, totalFreight, shortQty: 0,
              salesDocType: String(r['SALES DOC TYPE'] || '').trim(),
            };
          };

          // Categorize all rows
          const dump = [], trade = [], nonTrade = [], pending = [];
          sheet1.forEach(r => {
            const p = parseRow(r);
            const dt = p.salesDocType.toLowerCase();
            if (!p.salesDocType) {
              // Dump — verify against Sheet2
              if (sheet2LRs.has(p.lrNo)) {
                const s2 = sheet2LRs.get(p.lrNo);
                p.recQty = s2.recQty; p.shortQty = s2.shortQty;
                if (s2.billedQty > 0) p.billedQty = s2.billedQty;
                dump.push(p);
              } else {
                pending.push({ ...p, reason: 'Not in Sheet2' });
              }
            } else if (dt.includes('trade') && !dt.includes('non')) {
              trade.push(p);
            } else if (dt.includes('non')) {
              nonTrade.push(p);
            } else trade.push(p);
          });

          // Filter based on selected plant type
          const wantType = selectedPlant.invoiceType;
          let selectedItems = [];
          let skippedCount = 0;

          if (wantType === 'Dump') {
            selectedItems = dump;
            skippedCount = trade.length + nonTrade.length;
          } else if (wantType === 'Factory Trade') {
            selectedItems = trade;
            skippedCount = dump.length + nonTrade.length + pending.length;
          } else if (wantType === 'Non-Trade') {
            selectedItems = nonTrade;
            skippedCount = dump.length + trade.length + pending.length;
          } else {
            selectedItems = [...dump, ...trade, ...nonTrade];
          }

          // Remove already-invoiced AND already-pending entries
          let alreadyInvoiced = 0;
          try {
            const [histRes, pendRes] = await Promise.all([
              ax.get('/invoices'),
              ax.get('/invoices/pending'),
            ]);
            // Collect all LRs that are already invoiced
            const invoicedLRs = new Set();
            (histRes.data || []).forEach(inv => (inv.items || []).forEach(it => { if (it.lrNo) invoicedLRs.add(it.lrNo); }));
            // Collect all LRs already in pending
            const pendingLRs = new Set();
            (pendRes.data || []).forEach(p => { if (p.lrNo) pendingLRs.add(p.lrNo); });

            const before = selectedItems.length;
            selectedItems = selectedItems.filter(it => !it.lrNo || !invoicedLRs.has(it.lrNo));
            alreadyInvoiced = before - selectedItems.length;

            // Filter pending: remove already invoiced AND already saved pending
            const filteredPending = pending.filter(it => it.lrNo && !invoicedLRs.has(it.lrNo) && !pendingLRs.has(it.lrNo));
            pending.length = 0;
            filteredPending.forEach(p => pending.push(p));
          } catch {}

          // Build invoices — chunk by maxPerBill
          let billCounter = parseInt(billNoStart) || 1;
          const invs = [];
          const perBill = maxPerBill || 20;
          for (let i = 0; i < selectedItems.length; i += perBill) {
            invs.push({
              billNo: String(billCounter++),
              type: wantType === 'all' ? 'Mixed' : wantType,
              gstRate: selectedPlant.gstRate,
              items: selectedItems.slice(i, i + perBill),
              expanded: invs.length === 0,
            });
          }

          setInvoices(invs);
          setPendingItems(wantType === 'Dump' ? pending : []);
          setResults([]);
          setView('editor');

          const msg = [`${selectedItems.length} new entries → ${invs.length} invoice(s)`];
          if (alreadyInvoiced > 0) msg.push(`${alreadyInvoiced} entries skipped (already invoiced)`);
          if (pending.length > 0 && wantType === 'Dump') msg.push(`${pending.length} pending (not in Sheet2)`);
          if (skippedCount > 0) msg.push(`${skippedCount} other type entries skipped`);
          alert(`${selectedPlant.label}\n${msg.join('\n')}`);

        } else {
          // Generic format
          const rows = sheet1;
          const parsed = rows.map(row => {
            const k = Object.keys(row);
            const f = (a) => { for (const x of a) { const m = k.find(c => c.toLowerCase().includes(x)); if (m) return m; } return null; };
            const v = (a) => { const c = f(a); return c ? String(row[c] ?? '').trim() : ''; };
            const n = (a) => parseFloat(v(a)) || 0;
            const qty = n(['billed', 'qty', 'weight', 'sales quantity']);
            const freight = n(['total fright', 'total freight', 'freight']);
            return {
              consigneeName: v(['consignee', 'customer', 'party']) || 'JK CEMENT WORKS',
              destination: v(['destination', 'city', 'county', 'to']),
              truckNo: v(['truck', 'vehicle']), lrNo: v(['lr no', 'lr number', 'lr']),
              invoiceNo: v(['invoice no', 'invoice', 'challan']),
              invoiceDate: v(['date', 'billing date', 'invoice date']),
              billedQty: qty, recQty: n(['rec', 'received']) || qty,
              ratePMT: qty > 0 && freight > 0 ? Math.round(freight / qty) : n(['rate']),
              shortQty: n(['short']),
            };
          });
          // Remove already-invoiced entries
          let genSkipped = 0;
          try {
            const hRes = await ax.get('/invoices');
            const invLRs = new Set();
            (hRes.data || []).forEach(inv => (inv.items || []).forEach(it => { if (it.lrNo) invLRs.add(it.lrNo); }));
            const before = parsed.length;
            parsed = parsed.filter(it => !it.lrNo || !invLRs.has(it.lrNo));
            genSkipped = before - parsed.length;
          } catch {}

          let bc = parseInt(billNoStart) || 1;
          const invs = [];
          const pb = maxPerBill || 20;
          for (let i = 0; i < parsed.length; i += pb) {
            invs.push({ billNo: String(bc++), type: 'General', gstRate: selectedPlant.gstRate, items: parsed.slice(i, i + pb), expanded: true });
          }
          setInvoices(invs);
          setPendingItems([]);
          setResults([]);
          setView('editor');
          const gMsg = [`${parsed.length} entries → ${invs.length} invoice(s)`];
          if (genSkipped > 0) gMsg.push(`${genSkipped} already invoiced (skipped)`);
          alert(gMsg.join('\n'));
        }
      } catch (err) {
        console.error('Excel parse error:', err);
        alert('Failed to parse: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // ══════════════════════════════════════════════════════════
  // INVOICE EDITOR HELPERS
  // ══════════════════════════════════════════════════════════
  const toggleExpand = (idx) => setInvoices(p => p.map((inv, i) => i === idx ? { ...inv, expanded: !inv.expanded } : inv));
  const updateBillNo = (idx, val) => setInvoices(p => p.map((inv, i) => i === idx ? { ...inv, billNo: val } : inv));

  const removeEntry = (invIdx, itemIdx) => {
    setInvoices(p => p.map((inv, i) => i === invIdx ? { ...inv, items: inv.items.filter((_, j) => j !== itemIdx) } : inv).filter(inv => inv.items.length > 0));
  };

  const moveEntry = (fromInvIdx, itemIdx, toInvIdx) => {
    const item = invoices[fromInvIdx]?.items[itemIdx];
    if (!item) return;
    setInvoices(p => {
      const next = [...p];
      next[fromInvIdx] = { ...next[fromInvIdx], items: next[fromInvIdx].items.filter((_, j) => j !== itemIdx) };
      next[toInvIdx] = { ...next[toInvIdx], items: [...next[toInvIdx].items, item] };
      return next.filter(inv => inv.items.length > 0);
    });
  };

  const addPendingToInvoice = (pendingIdx, invIdx) => {
    const item = pendingItems[pendingIdx];
    if (!item) return;
    setInvoices(p => p.map((inv, i) => i === invIdx ? { ...inv, items: [...inv.items, item] } : inv));
    setPendingItems(p => p.filter((_, i) => i !== pendingIdx));
  };

  const addSavedPendingToInvoice = (pendingItem, invIdx) => {
    setInvoices(p => p.map((inv, i) => i === invIdx ? { ...inv, items: [...inv.items, pendingItem] } : inv));
    setSavedPending(p => p.filter(x => x.id !== pendingItem.id));
    // Delete from Firestore
    ax.delete(`/invoices/pending/${pendingItem.id}`).catch(() => {});
  };

  const calcInvoice = (inv) => {
    const freight = inv.items.reduce((s, it) => s + (parseFloat(it.billedQty) || 0) * (parseFloat(it.ratePMT) || 0), 0);
    const gst = parseFloat((freight * inv.gstRate * 2 / 100).toFixed(2));
    return { freight, gst, total: freight + gst, billed: inv.items.reduce((s, it) => s + (parseFloat(it.billedQty) || 0), 0) };
  };

  // ══════════════════════════════════════════════════════════
  // GENERATE ALL PDFs
  // ══════════════════════════════════════════════════════════
  const handleGenerateAll = async () => {
    if (invoices.length === 0) return;
    setGenerating(true);
    setGenProgress(0);
    const res = [];

    // Save pending items to Firestore
    if (pendingItems.length > 0) {
      try {
        await ax.post('/invoices/pending', { items: pendingItems });
      } catch {}
    }

    for (let i = 0; i < invoices.length; i++) {
      const inv = invoices[i];
      setGenProgress(i + 1);
      try {
        // Match LR numbers
        const matchedIds = [];
        inv.items.forEach(it => {
          if (it.lrNo) {
            const num = String(it.lrNo).replace(/.*\//, '').trim();
            const match = lrs.find(lr => String(lr.lrNo) === num || String(lr.lrNo) === it.lrNo);
            if (match) matchedIds.push(match.id);
          }
        });

        // Map variant keys to actual server config keys
        const serverPlantKey = plantKey.replace('_trade', '_jharli').replace('_nontrade', '_jharli');
        const payload = {
          plantKey: serverPlantKey, billNo: inv.billNo, billDate, type: inv.type,
          gstRate: inv.gstRate, brand: selectedPlant.lrBrand, ids: matchedIds,
          items: inv.items.map(it => ({
            consigneeName: it.consigneeName, destination: it.destination,
            truckNo: it.truckNo, lrNo: it.lrNo, invoiceNo: it.invoiceNo,
            invoiceDate: it.invoiceDate, billedQty: parseFloat(it.billedQty) || 0,
            recQty: parseFloat(it.recQty) || 0, ratePMT: parseFloat(it.ratePMT) || 0,
            shortQty: parseFloat(it.shortQty) || 0,
          })),
        };

        const response = await ax.post('/invoices/generate', payload, { responseType: 'blob' });

        if (response.data.type?.includes('application/json')) {
          const text = await response.data.text();
          throw new Error(JSON.parse(text).error || 'Server error');
        }

        const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
        res.push({ billNo: inv.billNo, type: inv.type, status: 'success', pdfUrl: url, matchedLRs: matchedIds.length });
      } catch (err) {
        let msg = err.message;
        if (err.response?.data instanceof Blob) {
          try { msg = JSON.parse(await err.response.data.text()).error || msg; } catch {}
        } else if (err.response?.data?.error) msg = err.response.data.error;
        res.push({ billNo: inv.billNo, type: inv.type, status: 'failed', error: msg });
      }
    }

    setResults(res);
    setGenerating(false);
    setView('generate');
    fetchLrs();
    fetchHistory();
  };

  // Download template
  const downloadTemplate = () => {
    const h = ['Bill No', 'Consignee Name', 'Destination', 'Truck No', 'LR No', 'InvoiceNo', 'Invoice Date', 'Billed Qty', 'Rec Qty', 'Rate PMT', 'Short Qty'];
    const s = [['1', 'JK CEMENT WORKS', 'HISAR', 'HR63E9632', 'VGTC-26/1', '3387982535', '30.04.2025', 42, 42, 600, 0]];
    const ws = XLSX.utils.aoa_to_sheet([h, ...s]);
    ws['!cols'] = h.map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoice Data');
    XLSX.writeFile(wb, 'Invoice_Template.xlsx');
  };

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  const typeBg = (t) => t === 'Dump' ? '#3b82f6' : t === 'Factory Trade' ? '#f59e0b' : t === 'Non-Trade' ? '#8b5cf6' : '#6b7280';

  return (
    <div>
      {/* Header */}
      <div className="page-hd">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: '#10b981', color: 'white', padding: '10px', borderRadius: '12px' }}><FileText size={24} /></div>
          <div><h1>Generate Invoice</h1><p>Transportation Freight Bill — Tax Invoice</p></div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {view !== 'upload' && <button className="btn btn-g btn-sm" onClick={() => setView('upload')}><ArrowLeft size={14} /> Back</button>}
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '20px' }}>
        {[
          { key: 'upload', label: '1. Upload Excel', icon: Upload },
          { key: 'editor', label: '2. Edit Bills', icon: Settings2 },
          { key: 'generate', label: '3. Generated Invoices', icon: FileText },
        ].map((s, i) => (
          <div key={s.key} style={{
            flex: 1, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px',
            background: view === s.key ? 'var(--primary)' : 'var(--bg-th)',
            color: view === s.key ? 'white' : 'var(--text-muted)',
            fontWeight: view === s.key ? 800 : 600, fontSize: '11px', cursor: 'pointer',
            borderRadius: i === 0 ? '8px 0 0 8px' : i === 2 ? '0 8px 8px 0' : '0',
            borderRight: i < 2 ? '1px solid var(--border)' : 'none',
          }} onClick={() => { if (s.key === 'generate') fetchHistory(); setView(s.key); }}>
            <s.icon size={13} /> {s.label}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ═══ UPLOAD VIEW ═══ */}
        {view === 'upload' && (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Step 1: Select Invoice Type */}
              <div className="card">
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                  <h3 style={{ margin: 0, fontSize: '14px' }}>Step 1 — Select Invoice Type</h3>
                </div>
                <div style={{ padding: '12px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                  {PLANT_OPTIONS.map(p => (
                    <div key={p.key} onClick={() => setPlantKey(p.key)}
                      style={{
                        padding: '12px 14px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s',
                        border: plantKey === p.key ? '2px solid var(--primary)' : '1px solid var(--border)',
                        background: plantKey === p.key ? 'rgba(59,130,246,0.06)' : 'var(--bg)',
                      }}>
                      <div style={{ fontWeight: 800, fontSize: '13px', marginBottom: '4px', color: plantKey === p.key ? 'var(--primary)' : 'var(--text)' }}>{p.label}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{p.description}</div>
                      <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, color: 'white', background: typeBg(p.invoiceType === 'all' ? 'Mixed' : p.invoiceType), padding: '1px 6px', borderRadius: '8px' }}>{p.invoiceType === 'all' ? 'ALL' : p.invoiceType}</span>
                        <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-th)', padding: '1px 6px', borderRadius: '8px' }}>GST {p.gstRate}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 2: Settings + Upload */}
              <div className="card">
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                  <h3 style={{ margin: 0, fontSize: '14px' }}>Step 2 — Upload Excel & Set Bill Details</h3>
                </div>
                <div style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                    <div className="field" style={{ margin: 0, flex: 1, minWidth: '100px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 700 }}>Starting Bill No.</label>
                      <input className="fi" type="text" placeholder="e.g. 92" value={billNoStart} onChange={e => setBillNoStart(e.target.value)} />
                    </div>
                    <div className="field" style={{ margin: 0, flex: 1, minWidth: '140px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 700 }}>Bill Date</label>
                      <input className="fi" type="date" value={billDate} onChange={e => setBillDate(e.target.value)} />
                    </div>
                    <div className="field" style={{ margin: 0, minWidth: '90px' }}>
                      <label style={{ fontSize: '10px', fontWeight: 700 }}>Entries/Bill</label>
                      <input className="fi" type="number" min="5" max="100" value={maxPerBill} onChange={e => setMaxPerBill(parseInt(e.target.value) || 20)} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} style={{ display: 'none' }} />
                    <button className="btn btn-a" onClick={() => fileInputRef.current?.click()} style={{ padding: '12px 28px', fontSize: '13px', flex: 1 }}>
                      <Upload size={15} /> Upload Excel File
                    </button>
                    <button className="btn btn-g" onClick={downloadTemplate} style={{ padding: '12px 16px', fontSize: '11px' }}>
                      <Download size={13} /> Template
                    </button>
                  </div>
                  <div style={{ marginTop: '12px', padding: '10px 12px', background: 'var(--bg)', borderRadius: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Selected: <strong style={{ color: 'var(--text)' }}>{selectedPlant.label}</strong> — will extract only <strong style={{ color: typeBg(selectedPlant.invoiceType === 'all' ? 'Mixed' : selectedPlant.invoiceType) }}>{selectedPlant.invoiceType === 'all' ? 'all' : selectedPlant.invoiceType}</strong> entries from the Excel file
                  </div>
                </div>
              </div>

              {/* Saved Pending */}
              {savedPending.length > 0 && (
                <div className="card" style={{ gridColumn: '1 / -1', borderColor: '#f59e0b' }}>
                  <div className="card-header" style={{ background: 'rgba(245,158,11,0.06)' }}>
                    <div className="card-title-block">
                      <div className="card-icon" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}><Clock size={17} /></div>
                      <div className="card-title-text"><h3>{savedPending.length} Pending Entries</h3><p>From previous sessions — upload Excel to include these</p></div>
                    </div>
                  </div>
                  <div style={{ padding: '12px', maxHeight: '200px', overflowY: 'auto' }}>
                    {savedPending.slice(0, 10).map((p, i) => (
                      <div key={p.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', fontSize: '11px', borderBottom: '1px solid var(--border-row)' }}>
                        <span style={{ fontWeight: 700 }}>{p.lrNo}</span>
                        <span>{p.truckNo}</span>
                        <span>{p.destination}</span>
                        <span style={{ color: '#f59e0b' }}>{fmtINR(p.totalFreight)}</span>
                        <button onClick={() => { ax.delete(`/invoices/pending/${p.id}`).then(() => setSavedPending(pr => pr.filter(x => x.id !== p.id))).catch(() => {}); }}
                          style={{ border: 'none', background: 'none', color: '#f43f5e', cursor: 'pointer', padding: '2px' }}><X size={12} /></button>
                      </div>
                    ))}
                    {savedPending.length > 10 && <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>+{savedPending.length - 10} more</div>}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ═══ EDITOR VIEW ═══ */}
        {view === 'editor' && (
          <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Top controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>
                {invoices.length} Invoice(s) • {invoices.reduce((s, inv) => s + inv.items.length, 0)} entries
                {pendingItems.length > 0 && <span style={{ color: '#f59e0b' }}> • {pendingItems.length} pending</span>}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select className="fi" value={plantKey} onChange={e => setPlantKey(e.target.value)} style={{ width: '160px', fontSize: '11px' }}>
                  {PLANT_OPTIONS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
                <input className="fi" type="date" value={billDate} onChange={e => setBillDate(e.target.value)} style={{ width: '130px', fontSize: '11px' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg)', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Per Bill:</span>
                  <input className="fi" type="number" min="5" max="50" value={maxPerBill}
                    onChange={e => setMaxPerBill(parseInt(e.target.value) || 20)}
                    style={{ width: '45px', fontSize: '11px', padding: '2px 4px', textAlign: 'center' }} />
                  <button className="btn btn-g btn-sm" onClick={() => {
                    // Re-split all invoices by new maxPerBill
                    const allItems = invoices.flatMap(inv => inv.items);
                    const type = invoices[0]?.type || 'Dump';
                    const gst = invoices[0]?.gstRate || selectedPlant.gstRate;
                    let bc = parseInt(invoices[0]?.billNo) || parseInt(billNoStart) || 1;
                    const pb = maxPerBill || 20;
                    const newInvs = [];
                    for (let i = 0; i < allItems.length; i += pb) {
                      newInvs.push({ billNo: String(bc++), type, gstRate: gst, items: allItems.slice(i, i + pb), expanded: newInvs.length === 0 });
                    }
                    setInvoices(newInvs);
                  }} style={{ fontSize: '9px', padding: '2px 6px', whiteSpace: 'nowrap' }}>Re-split</button>
                </div>
                <button className="btn btn-a" onClick={handleGenerateAll} disabled={generating || invoices.length === 0} style={{ fontSize: '12px' }}>
                  {generating ? <><RefreshCw size={13} className="ani-spin" /> {genProgress}/{invoices.length}</> : <><FileText size={13} /> Generate All</>}
                </button>
              </div>
            </div>

            {/* Invoice Cards */}
            {invoices.map((inv, gi) => {
              const calc = calcInvoice(inv);
              return (
                <div key={gi} className="card" style={{ overflow: 'hidden' }}>
                  {/* Invoice Header */}
                  <div onClick={() => toggleExpand(gi)}
                    style={{ padding: '10px 14px', background: 'var(--bg-th)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {inv.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'white', background: typeBg(inv.type), padding: '2px 8px', borderRadius: '10px' }}>{inv.type}</span>
                      <span style={{ fontWeight: 800 }}>Bill #</span>
                      <input className="fi" type="text" value={inv.billNo} onClick={e => e.stopPropagation()}
                        onChange={e => updateBillNo(gi, e.target.value)}
                        style={{ width: '60px', fontSize: '12px', padding: '2px 6px', fontWeight: 800, textAlign: 'center' }} />
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{inv.items.length} entries</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg)', padding: '2px 6px', borderRadius: '4px' }}>GST {inv.gstRate}%</span>
                      <span style={{ fontWeight: 800, color: '#10b981', fontSize: '13px' }}>{fmtINR(calc.freight)}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>+GST {fmtINR(calc.gst)} = <strong style={{ color: 'var(--text)' }}>{fmtINR(calc.total)}</strong></span>
                    </div>
                  </div>

                  {/* Invoice Items Table */}
                  {inv.expanded && (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ ...TH, width: '28px' }}>#</th>
                            <th style={TH}>Consignee</th>
                            <th style={TH}>Dest.</th>
                            <th style={TH}>Truck</th>
                            <th style={TH}>LR No</th>
                            <th style={TH}>Inv. No</th>
                            <th style={TH}>Date</th>
                            <th style={{ ...TH, textAlign: 'right' }}>Qty</th>
                            <th style={{ ...TH, textAlign: 'right' }}>Rec.</th>
                            <th style={{ ...TH, textAlign: 'right' }}>Rate</th>
                            <th style={{ ...TH, textAlign: 'right' }}>Freight</th>
                            <th style={{ ...TH, textAlign: 'right' }}>Short</th>
                            <th style={{ ...TH, width: '60px' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inv.items.map((it, ri) => {
                            const fr = (parseFloat(it.billedQty) || 0) * (parseFloat(it.ratePMT) || 0);
                            return (
                              <tr key={ri} style={{ background: ri % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                                <td style={{ ...TD, textAlign: 'center', fontSize: '10px' }}>{ri + 1}</td>
                                <td style={{ ...TD, fontSize: '10px' }}>{it.consigneeName}</td>
                                <td style={{ ...TD, fontSize: '10px' }}>{it.destination}</td>
                                <td style={{ ...TD, fontSize: '10px', fontWeight: 700 }}>{it.truckNo}</td>
                                <td style={{ ...TD, fontSize: '10px' }}>{it.lrNo}</td>
                                <td style={{ ...TD, fontSize: '10px' }}>{it.invoiceNo}</td>
                                <td style={{ ...TD, fontSize: '10px' }}>{it.invoiceDate}</td>
                                <td style={{ ...TD, fontSize: '10px', textAlign: 'right' }}>{it.billedQty}</td>
                                <td style={{ ...TD, fontSize: '10px', textAlign: 'right' }}>{it.recQty}</td>
                                <td style={{ ...TD, fontSize: '10px', textAlign: 'right' }}>{it.ratePMT}</td>
                                <td style={{ ...TD, fontSize: '10px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{fmtD2(fr)}</td>
                                <td style={{ ...TD, fontSize: '10px', textAlign: 'right', color: it.shortQty > 0 ? '#f43f5e' : '' }}>{it.shortQty || ''}</td>
                                <td style={{ ...TD, display: 'flex', gap: '2px' }}>
                                  {invoices.length > 1 && (
                                    <select onChange={e => { if (e.target.value) moveEntry(gi, ri, parseInt(e.target.value)); e.target.value = ''; }}
                                      style={{ fontSize: '9px', padding: '1px', width: '35px', background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                                      <option value="">→</option>
                                      {invoices.map((inv2, j) => j !== gi ? <option key={j} value={j}>#{inv2.billNo}</option> : null)}
                                    </select>
                                  )}
                                  <button onClick={() => removeEntry(gi, ri)} style={{ border: 'none', background: 'none', color: '#f43f5e', cursor: 'pointer', padding: '2px' }}><X size={12} /></button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Pending Items */}
            {(pendingItems.length > 0 || savedPending.length > 0) && (
              <div className="card" style={{ borderColor: '#f59e0b' }}>
                <div className="card-header" style={{ background: 'rgba(245,158,11,0.06)' }}>
                  <div className="card-title-block">
                    <div className="card-icon" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}><AlertCircle size={17} /></div>
                    <div className="card-title-text">
                      <h3>Pending — {pendingItems.length + savedPending.length} Entries</h3>
                      <p>Not matched in Sheet2. Add to a bill or save for later.</p>
                    </div>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={TH}>#</th><th style={TH}>LR No</th><th style={TH}>Truck</th>
                        <th style={TH}>Consignee</th><th style={TH}>Dest.</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Qty</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Freight</th>
                        <th style={TH}>Add to Bill</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingItems.map((it, i) => (
                        <tr key={`p-${i}`} style={{ background: 'rgba(245,158,11,0.03)' }}>
                          <td style={TD}>{i + 1}</td>
                          <td style={{ ...TD, fontWeight: 700, color: '#f59e0b' }}>{it.lrNo}</td>
                          <td style={{ ...TD, fontWeight: 700 }}>{it.truckNo}</td>
                          <td style={TD}>{it.consigneeName}</td>
                          <td style={TD}>{it.destination}</td>
                          <td style={{ ...TD, textAlign: 'right' }}>{it.billedQty}</td>
                          <td style={{ ...TD, textAlign: 'right' }}>{fmtINR(it.totalFreight || (it.billedQty * it.ratePMT))}</td>
                          <td style={TD}>
                            <select onChange={e => { if (e.target.value) addPendingToInvoice(i, parseInt(e.target.value)); }}
                              style={{ fontSize: '9px', padding: '2px', background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                              <option value="">Add to...</option>
                              {invoices.map((inv, j) => <option key={j} value={j}>Bill #{inv.billNo}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                      {savedPending.map((it, i) => (
                        <tr key={`sp-${it.id}`} style={{ background: 'rgba(245,158,11,0.06)' }}>
                          <td style={{ ...TD, color: '#f59e0b' }}>S{i + 1}</td>
                          <td style={{ ...TD, fontWeight: 700, color: '#f59e0b' }}>{it.lrNo}</td>
                          <td style={{ ...TD, fontWeight: 700 }}>{it.truckNo}</td>
                          <td style={TD}>{it.consigneeName}</td>
                          <td style={TD}>{it.destination}</td>
                          <td style={{ ...TD, textAlign: 'right' }}>{it.billedQty}</td>
                          <td style={{ ...TD, textAlign: 'right' }}>{fmtINR(it.totalFreight)}</td>
                          <td style={{ ...TD, display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <select onChange={e => { if (e.target.value) addSavedPendingToInvoice(it, parseInt(e.target.value)); }}
                              style={{ fontSize: '9px', padding: '2px', background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                              <option value="">Add to...</option>
                              {invoices.map((inv, j) => <option key={j} value={j}>Bill #{inv.billNo}</option>)}
                            </select>
                            <button onClick={() => { ax.delete(`/invoices/pending/${it.id}`).then(() => setSavedPending(p => p.filter(x => x.id !== it.id))).catch(() => {}); }}
                              style={{ border: 'none', background: 'none', color: '#f43f5e', cursor: 'pointer', padding: '2px' }} title="Remove"><X size={12} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ GENERATED INVOICES VIEW ═══ */}
        {view === 'generate' && (
          <motion.div key="gen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Just Generated — current batch results */}
            {results.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <div className="card-title-block">
                    <div className="card-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}><Check size={17} /></div>
                    <div className="card-title-text">
                      <h3>Just Generated — {results.filter(r => r.status === 'success').length}/{results.length} Successful</h3>
                      <p>{results.filter(r => r.status === 'success').reduce((s, r) => s + (r.matchedLRs || 0), 0)} LRs marked as invoiced</p>
                    </div>
                  </div>
                  <button className="btn btn-g btn-sm" onClick={() => { setView('upload'); setInvoices([]); setResults([]); fetchNextBillNo(); fetchPending(); }}>
                    <Plus size={13} /> New Batch
                  </button>
                </div>
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {results.map((r, i) => (
                    <div key={i} style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: 'var(--bg)', borderRadius: '8px', border: `1px solid ${r.status === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {r.status === 'success' ? <Check size={15} color="#10b981" /> : <X size={15} color="#f43f5e" />}
                        <span style={{ fontWeight: 800, fontSize: '13px' }}>Bill #{r.billNo}</span>
                        <span style={{ fontSize: '9px', fontWeight: 700, color: 'white', background: typeBg(r.type), padding: '2px 6px', borderRadius: '8px' }}>{r.type}</span>
                        {r.status === 'failed' && <span style={{ fontSize: '11px', color: '#f43f5e' }}>{r.error}</span>}
                      </div>
                      {r.status === 'success' && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn btn-sm btn-g" onClick={() => window.open(r.pdfUrl, '_blank')} style={{ fontSize: '10px' }}>
                            <Eye size={11} /> View
                          </button>
                          <a href={r.pdfUrl} download={`Invoice_Bill-${r.billNo}.pdf`} className="btn btn-sm btn-p" style={{ fontSize: '10px' }}>
                            <Download size={11} /> Download
                          </a>
                          <button className="btn btn-sm btn-g" onClick={() => { const w = window.open(r.pdfUrl); if (w) setTimeout(() => w.print(), 500); }} style={{ fontSize: '10px' }}>
                            <Printer size={11} /> Print
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Generated Invoices */}
            <div className="card">
              <div className="card-header">
                <div className="card-title-block">
                  <div className="card-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}><FileText size={17} /></div>
                  <div className="card-title-text"><h3>All Generated Invoices</h3><p>{historyList.length} total</p></div>
                </div>
                <button className="btn btn-g btn-sm" onClick={fetchHistory} disabled={historyLoading}>
                  <RefreshCw size={13} className={historyLoading ? 'ani-spin' : ''} />
                </button>
              </div>
              <div className="tbl-wrap" style={{ maxHeight: '500px' }}>
                <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={TH}>Bill No</th>
                      <th style={TH}>Date</th>
                      <th style={TH}>Type</th>
                      <th style={{ ...TH, textAlign: 'center' }}>Entries</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Freight</th>
                      <th style={{ ...TH, textAlign: 'center' }}>GST</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Total</th>
                      <th style={TH}>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyLoading ? (
                      <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td></tr>
                    ) : historyList.length === 0 ? (
                      <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No invoices generated yet</td></tr>
                    ) : historyList.map((inv, i) => (
                      <tr key={inv.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                        <td style={{ ...TD, fontWeight: 800 }}>#{inv.billNo}</td>
                        <td style={TD}>{inv.billDate}</td>
                        <td style={TD}>
                          <span style={{ fontSize: '9px', fontWeight: 700, color: 'white', background: typeBg(inv.type), padding: '1px 6px', borderRadius: '8px' }}>{inv.type}</span>
                        </td>
                        <td style={{ ...TD, textAlign: 'center' }}>{inv.itemCount}</td>
                        <td style={{ ...TD, textAlign: 'right' }}>{fmtINR(inv.totalFreight)}</td>
                        <td style={{ ...TD, textAlign: 'center', fontSize: '10px' }}>{inv.gstRate}%</td>
                        <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: '#10b981' }}>{fmtINR(inv.totalWithGST)}</td>
                        <td style={{ ...TD, fontSize: '10px' }}>
                          {inv.createdAt?.seconds ? new Date(inv.createdAt.seconds * 1000).toLocaleDateString('en-IN') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
