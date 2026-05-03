import React, { useState, useEffect, useMemo, useRef } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Check, Printer, Search, RefreshCw,
  Filter, ChevronRight, ChevronDown, Calendar,
  User, Hash, ListChecks, Download, ExternalLink, AlertCircle,
  Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, X, Eye
} from 'lucide-react';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 25;
const TH = { padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg-th)', borderBottom: '1px solid var(--border)', textAlign: 'left' };
const TD = { padding: '10px 12px', fontSize: '13px', color: 'var(--text-sub)', borderBottom: '1px solid var(--border-row)', verticalAlign: 'middle' };

export default function InvoiceModule({ brand = 'dump', role = 'user', permissions = {} }) {
  // ── State ─────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState('upload'); // 'upload' | 'review' | 'generating' | 'done'
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [selectedIdxs, setSelectedIdxs] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [billForm, setBillForm] = useState({
    billNo: '',
    billDate: new Date().toISOString().split('T')[0],
    gstRate: '12',
  });
  const [filterMode, setFilterMode] = useState('valid'); // 'all' | 'valid' | 'invalid'
  const [searchTerm, setSearchTerm] = useState('');
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  // ── Upload handler ────────────────────────────────────────
  const handleFile = async (f) => {
    if (!f) return;
    setFile(f);
    setParsing(true);
    setParseError('');
    setParsedData(null);
    setSelectedIdxs(new Set());

    try {
      const formData = new FormData();
      formData.append('file', f);
      const res = await ax.post('/invoice-upload/parse', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setParsedData(res.data);
      // Auto-select all valid entries
      const validSet = new Set();
      res.data.entries.forEach(e => { if (e.foundInSheet2) validSet.add(e.idx); });
      setSelectedIdxs(validSet);
      setViewMode('review');
    } catch (e) {
      setParseError(e.response?.data?.error || 'Failed to parse file');
    } finally {
      setParsing(false);
    }
  };

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); };
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);

  // ── Filtering ─────────────────────────────────────────────
  const filteredEntries = useMemo(() => {
    if (!parsedData) return [];
    let list = parsedData.entries;
    if (filterMode === 'valid') list = list.filter(e => e.foundInSheet2);
    else if (filterMode === 'invalid') list = list.filter(e => !e.foundInSheet2);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(e =>
        (e.lrNo || '').toLowerCase().includes(q) ||
        (e.vehicleNo || '').toLowerCase().includes(q) ||
        (e.customerDescription || '').toLowerCase().includes(q) ||
        (e.cityName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [parsedData, filterMode, searchTerm]);

  const paginatedEntries = useMemo(() => {
    const s = (currentPage - 1) * PAGE_SIZE;
    return filteredEntries.slice(s, s + PAGE_SIZE);
  }, [filteredEntries, currentPage]);

  const selectedEntries = useMemo(() => {
    if (!parsedData) return [];
    return parsedData.entries.filter(e => selectedIdxs.has(e.idx));
  }, [parsedData, selectedIdxs]);

  const totalFreight = selectedEntries.reduce((s, e) => s + (e.totalFreight || 0), 0);
  const totalBags = selectedEntries.reduce((s, e) => s + (e.salesQty || 0), 0);

  // ── Toggle selection ──────────────────────────────────────
  const toggle = (idx) => {
    setSelectedIdxs(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const selectAllValid = () => {
    if (!parsedData) return;
    const s = new Set();
    parsedData.entries.forEach(e => { if (e.foundInSheet2) s.add(e.idx); });
    setSelectedIdxs(s);
  };
  const clearAll = () => setSelectedIdxs(new Set());

  // ── Generate ──────────────────────────────────────────────
  const handleGenerate = async () => {
    if (selectedIdxs.size === 0) return alert('Select at least one entry');
    if (!billForm.billNo) return alert('Enter Bill Number');

    setGenerating(true);
    try {
      const res = await ax.post('/invoice-upload/generate', {
        entries: selectedEntries,
        billNo: billForm.billNo,
        billDate: billForm.billDate,
        gstRate: billForm.gstRate,
      }, { responseType: 'blob' });

      // Download the PDF
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `FreightBill_${billForm.billNo}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setViewMode('done');
    } catch (e) {
      alert('Failed to generate invoice: ' + (e.message || 'Unknown error'));
    } finally {
      setGenerating(false);
    }
  };

  // ── Reset ─────────────────────────────────────────────────
  const reset = () => {
    setViewMode('upload');
    setFile(null);
    setParsedData(null);
    setSelectedIdxs(new Set());
    setParseError('');
    setCurrentPage(1);
    setBillForm({ billNo: '', billDate: new Date().toISOString().split('T')[0], gstRate: '12' });
  };

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div style={{ padding: '0 20px 40px' }}>
      <div className="page-hd">
        <div>
          <h1><FileText size={20} color="var(--accent)" /> Generate Freight Bill</h1>
          <p>Upload JK Cement XLSX → Verify GRN → Generate PDF Invoice</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {viewMode !== 'upload' && (
            <button className="btn btn-g btn-sm" onClick={reset}>
              <Upload size={14} /> New Upload
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ── UPLOAD VIEW ────────────────────────────────────── */}
        {viewMode === 'upload' && (
          <motion.div key="upload" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="card" style={{ maxWidth: '640px', margin: '40px auto' }}>
              <div className="card-header">
                <div className="card-title-block">
                  <div className="card-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}><FileSpreadsheet size={17} /></div>
                  <div className="card-title-text"><h3>Upload Billing File</h3><p>JK Cement XLSX with billing + GRN sheets</p></div>
                </div>
              </div>
              <div style={{ padding: '30px' }}>
                <div
                  onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: '16px', padding: '50px 30px', textAlign: 'center', cursor: 'pointer',
                    background: dragOver ? 'rgba(99,102,241,0.05)' : 'var(--bg)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                    onChange={e => handleFile(e.target.files[0])} />
                  {parsing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <Loader2 size={36} className="ani-spin" color="var(--accent)" />
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-sub)' }}>Parsing XLSX...</div>
                    </div>
                  ) : (
                    <>
                      <Upload size={40} color="var(--text-muted)" style={{ marginBottom: '14px' }} />
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-sub)', marginBottom: '6px' }}>
                        Drop XLSX file here or click to browse
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Supports .xlsx files with Sheet1 (billing) + Sheet2 (GRN data)
                      </div>
                    </>
                  )}
                </div>
                {parseError && (
                  <div style={{ marginTop: '16px', background: 'rgba(244,63,94,0.1)', padding: '12px 16px', borderRadius: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <AlertCircle size={16} color="#f43f5e" />
                    <span style={{ fontSize: '13px', color: '#f43f5e', fontWeight: 600 }}>{parseError}</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── REVIEW VIEW ────────────────────────────────────── */}
        {(viewMode === 'review' || viewMode === 'generating') && parsedData && (
          <motion.div key="review" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {/* Stats Bar */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {[
                { label: 'Sheet1 Total', val: parsedData.totalSheet1, color: '#6366f1' },
                { label: 'Dump Entries', val: parsedData.totalFiltered, color: '#f59e0b' },
                { label: 'Verified (GRN)', val: parsedData.validCount, color: '#10b981' },
                { label: 'Missing GRN', val: parsedData.invalidCount, color: '#f43f5e' },
                { label: 'Selected', val: selectedIdxs.size, color: '#8b5cf6' },
              ].map(s => (
                <div key={s.label} style={{
                  flex: '1 1 120px', background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '12px', padding: '12px 16px', minWidth: '120px'
                }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{s.label}</div>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: s.color }}>{s.val}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', alignItems: 'start' }}>
              {/* ── Left: Table ── */}
              <div className="card">
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div className="card-title-block">
                    <div className="card-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}><ListChecks size={17} /></div>
                    <div className="card-title-text"><h3>Filtered Entries</h3><p>Blank Sale Doc Type — JK Super Dump</p></div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {['all', 'valid', 'invalid'].map(m => (
                      <button key={m} className={`btn btn-sm ${filterMode === m ? 'btn-a' : 'btn-g'}`}
                        onClick={() => { setFilterMode(m); setCurrentPage(1); }}
                        style={{ fontSize: '11px', textTransform: 'capitalize' }}>
                        {m === 'valid' ? '✅ Verified' : m === 'invalid' ? '❌ Missing' : '📋 All'}
                      </button>
                    ))}
                    <button className="btn btn-g btn-sm" onClick={selectAllValid} title="Select all verified">Select All ✅</button>
                    <button className="btn btn-g btn-sm" onClick={clearAll} title="Clear"><X size={12} /></button>
                  </div>
                </div>

                {/* Search */}
                <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg)', borderRadius: '8px', padding: '6px 12px' }}>
                    <Search size={14} color="var(--text-muted)" />
                    <input style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-sub)', fontSize: '13px', width: '100%' }}
                      placeholder="Search LR, Truck, Party, City..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
                  </div>
                </div>

                <div className="tbl-wrap" style={{ maxHeight: '520px' }}>
                  <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, textAlign: 'center', width: '36px' }}><Check size={13} /></th>
                        <th style={TH}>GRN</th>
                        <th style={TH}>LR No.</th>
                        <th style={TH}>Vehicle</th>
                        <th style={TH}>Consignee</th>
                        <th style={TH}>City</th>
                        <th style={TH}>Date</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Qty</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Freight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedEntries.length === 0 ? (
                        <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No entries match filter</td></tr>
                      ) : paginatedEntries.map((e, i) => {
                        const sel = selectedIdxs.has(e.idx);
                        const canSelect = e.foundInSheet2;
                        return (
                          <tr key={e.idx}
                            onClick={() => canSelect && toggle(e.idx)}
                            style={{
                              background: sel ? 'rgba(99,102,241,0.06)' : !canSelect ? 'rgba(244,63,94,0.03)' : (i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)'),
                              cursor: canSelect ? 'pointer' : 'not-allowed', opacity: canSelect ? 1 : 0.55,
                            }}>
                            <td style={{ ...TD, textAlign: 'center' }}>
                              <input type="checkbox" checked={sel} disabled={!canSelect} readOnly style={{ accentColor: '#6366f1' }} />
                            </td>
                            <td style={{ ...TD, textAlign: 'center' }}>
                              {e.foundInSheet2
                                ? <CheckCircle size={15} color="#10b981" />
                                : <XCircle size={15} color="#f43f5e" />}
                            </td>
                            <td style={{ ...TD, fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace', fontSize: '12px' }}>{e.lrNo}</td>
                            <td style={{ ...TD, fontWeight: 700 }}>{e.vehicleNo}</td>
                            <td style={{ ...TD, fontSize: '12px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.customerDescription}</td>
                            <td style={TD}>{e.cityName || e.countyName}</td>
                            <td style={{ ...TD, fontSize: '12px' }}>{e.billingDate}</td>
                            <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>{e.salesQty}</td>
                            <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#10b981' }}>₹{(e.totalFreight || 0).toLocaleString('en-IN')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination currentPage={currentPage} totalItems={filteredEntries.length} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
              </div>

              {/* ── Right: Generate Panel ── */}
              <div style={{ position: 'sticky', top: '20px' }}>
                <div className="card">
                  <div className="card-header">
                    <div className="card-title-block">
                      <div className="card-icon" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}><FileText size={17} /></div>
                      <div className="card-title-text"><h3>Freight Bill</h3><p>{selectedIdxs.size} entries selected</p></div>
                    </div>
                  </div>
                  <div style={{ padding: '20px', display: 'grid', gap: '14px' }}>
                    <div className="field">
                      <label><Hash size={13} /> Bill Number *</label>
                      <input className="fi" type="text" placeholder="e.g. 36" value={billForm.billNo}
                        onChange={e => setBillForm({ ...billForm, billNo: e.target.value })} />
                    </div>
                    <div className="field">
                      <label><Calendar size={13} /> Bill Date</label>
                      <input className="fi" type="date" value={billForm.billDate}
                        onChange={e => setBillForm({ ...billForm, billDate: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>GST Rate (%)</label>
                      <select className="fi" value={billForm.gstRate} onChange={e => setBillForm({ ...billForm, gstRate: e.target.value })}>
                        <option value="12">12% (6% CGST + 6% SGST)</option>
                        <option value="5">5% (2.5% + 2.5%)</option>
                        <option value="18">18% (9% + 9%)</option>
                      </select>
                    </div>

                    {/* Summary */}
                    <div style={{
                      background: 'var(--bg)', padding: '14px', borderRadius: '12px', border: '1px dashed var(--border)',
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'
                    }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Bags</div>
                        <div style={{ fontSize: '18px', fontWeight: 900 }}>{totalBags.toLocaleString('en-IN')}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Freight</div>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--accent)' }}>₹{totalFreight.toLocaleString('en-IN')}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>GST ({billForm.gstRate}%)</div>
                        <div style={{ fontSize: '14px', fontWeight: 700 }}>₹{Math.round(totalFreight * parseFloat(billForm.gstRate) / 100).toLocaleString('en-IN')}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Grand Total</div>
                        <div style={{ fontSize: '14px', fontWeight: 900, color: '#f59e0b' }}>
                          ₹{Math.round(totalFreight * (1 + parseFloat(billForm.gstRate) / 100)).toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>

                    {selectedIdxs.size > 0 && parsedData.invalidCount > 0 && selectedEntries.some(e => !e.foundInSheet2) && (
                      <div style={{ background: 'rgba(244,63,94,0.1)', padding: '10px', borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <AlertCircle size={14} color="#f43f5e" />
                        <span style={{ fontSize: '11px', color: '#f43f5e', fontWeight: 600 }}>Some selected entries are missing GRN verification</span>
                      </div>
                    )}

                    <button className="btn btn-a" disabled={generating || selectedIdxs.size === 0 || !billForm.billNo}
                      onClick={handleGenerate} style={{ padding: '13px', width: '100%' }}>
                      {generating
                        ? <><Loader2 size={16} className="ani-spin" /> Generating PDF...</>
                        : <><Download size={16} /> Generate & Download PDF</>}
                    </button>
                  </div>
                </div>

                {/* File info */}
                <div style={{ marginTop: '12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>Uploaded File</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-sub)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileSpreadsheet size={14} color="#10b981" />
                    {file?.name || 'Unknown'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {file ? `${(file.size / 1024).toFixed(1)} KB` : ''}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── DONE VIEW ──────────────────────────────────────── */}
        {viewMode === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
            <div className="card" style={{ maxWidth: '500px', margin: '60px auto', textAlign: 'center' }}>
              <div style={{ padding: '50px 30px' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <CheckCircle size={32} color="#10b981" />
                </div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>Invoice Generated!</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '6px' }}>
                  Bill #{billForm.billNo} — {selectedIdxs.size} entries — ₹{totalFreight.toLocaleString('en-IN')} freight
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '30px' }}>
                  PDF has been downloaded to your browser
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button className="btn btn-a" onClick={reset}><Upload size={14} /> Generate Another</button>
                  <button className="btn btn-g" onClick={() => setViewMode('review')}><Eye size={14} /> Back to Review</button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
