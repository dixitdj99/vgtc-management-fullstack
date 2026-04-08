import React, { useState, useEffect, useMemo, useRef } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, Check, Printer, Search, RefreshCw, 
  Filter, ChevronRight, ChevronDown, Calendar, 
  User, Hash, ListChecks, Download, ExternalLink, AlertCircle
} from 'lucide-react';
import ColumnFilter from '../components/ColumnFilter';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 20;

const TH = { padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg-th)', borderBottom: '1px solid var(--border)', textAlign: 'left' };
const TD = { padding: '10px 12px', fontSize: '13px', color: 'var(--text-sub)', borderBottom: '1px solid var(--border-row)', verticalAlign: 'middle' };

export default function InvoiceModule({ brand = 'dump', role = 'user', permissions = {} }) {
  const [lrs, setLrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filters, setFilters] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().split('T')[0]
  });

  const [viewMode, setViewMode] = useState('selection'); // 'selection' | 'preview'
  const [tempInvoiceData, setTempInvoiceData] = useState(null);

  useEffect(() => {
    fetchLrs();
  }, [brand]);

  const fetchLrs = async () => {
    setLoading(true);
    try {
      const res = await ax.get(`/lr?brand=${brand}`);
      // Only keep LRs that are "Billed" (or specifically attached challans) and not already invoiced
      const billable = res.data.filter(lr => (lr.billing && lr.billing !== 'No') && !lr.invoiceGenerated);
      setLrs(billable);
    } catch (e) {
      console.error('Fetch LRs failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const filteredLrs = useMemo(() => {
    let list = [...lrs];
    Object.keys(filters).forEach(key => {
      const vals = filters[key];
      if (vals && vals.length > 0) {
        list = list.filter(s => vals.includes(String(s[key] ?? '')));
      }
    });
    return list;
  }, [lrs, filters]);

  const paginatedLrs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredLrs.slice(start, start + PAGE_SIZE);
  }, [filteredLrs, currentPage]);

  const onFilterUpdate = (k, v) => {
    setFilters(f => ({ ...f, [k]: v }));
    setCurrentPage(1);
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllInPage = () => {
    const next = new Set(selectedIds);
    paginatedLrs.forEach(lr => next.add(lr.id));
    setSelectedIds(next);
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedItems = useMemo(() => lrs.filter(lr => selectedIds.has(lr.id)), [lrs, selectedIds]);

  const handleGenerate = async () => {
    if (selectedIds.size === 0) return alert('Select at least one Loading Receipt');
    if (!invoiceForm.invoiceNumber) return alert('Enter Invoice Number');

    // Group selected items by Party (Invoice must be for a single party)
    const parties = new Set(selectedItems.map(lr => lr.partyName));
    if (parties.size > 1) {
       return alert('An invoice can only be generated for a single Party. Multiple parties selected: ' + Array.from(parties).join(', '));
    }

    setGenerating(true);
    try {
      const payload = {
        ids: Array.from(selectedIds),
        invoiceNumber: invoiceForm.invoiceNumber,
        invoiceDate: invoiceForm.invoiceDate,
        partyName: selectedItems[0]?.partyName,
        items: selectedItems,
        brand: brand
      };

      await ax.post('/lr/invoice/generate', payload);
      
      setTempInvoiceData(payload);
      setViewMode('preview');
      fetchLrs();
      setSelectedIds(new Set());
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to generate invoice');
    } finally {
      setGenerating(false);
    }
  };

  const printInvoice = () => {
    const pwin = window.open('', '_blank');
    const items = tempInvoiceData.items;
    const totalWeight = items.reduce((s, v) => s + (parseFloat(v.weight) || 0), 0);
    const totalBags = items.reduce((s, v) => s + (parseInt(v.totalBags || 0)), 0);

    const html = `
      <html>
        <head>
          <title>Invoice - ${tempInvoiceData.invoiceNumber}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1e293b; line-height: 1.4; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 20px; margin-bottom: 30px; }
            .company-info h1 { margin: 0; color: #1e293b; font-size: 24px; }
            .invoice-details { text-align: right; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
            .meta-box h3 { font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
            .meta-box p { margin: 0; font-weight: bold; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f8fafc; text-align: left; padding: 10px; font-size: 11px; font-weight: bold; text-transform: uppercase; border-bottom: 2px solid #1e293b; }
            td { padding: 10px; font-size: 12px; border-bottom: 1px solid #e2e8f0; }
            .totals-row { background: #f8fafc; font-weight: bold; }
            .footer { margin-top: 60px; display: flex; justify-content: space-between; align-items: flex-end; }
            .stamp { border: 2px solid #1e293b; padding: 10px 20px; font-weight: bold; text-transform: uppercase; transform: rotate(-5deg); opacity: 0.8; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-info">
              <h1>VIKAS GOODS TRANSPORT</h1>
              <p style="margin:4px 0; font-size: 12px; color: #64748b;">Premium Logistics & Transport Services</p>
              <p style="margin:0; font-size: 11px;">Jharli, Jhajjar, Haryana | +91 9999999999</p>
            </div>
            <div class="invoice-details">
              <h2 style="margin:0; color: #6366f1;">TAX INVOICE</h2>
              <p style="margin:4px 0;"># ${tempInvoiceData.invoiceNumber}</p>
              <p style="margin:0; font-size: 12px; color: #64748b;">${new Date(tempInvoiceData.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-box">
              <h3>Billed To</h3>
              <p>${tempInvoiceData.partyName}</p>
              <p style="font-weight: normal; font-size: 12px; color: #64748b; margin-top: 4px;">Registered Customer</p>
            </div>
            <div class="meta-box">
              <h3>Transport Summary</h3>
              <p>${items.length} Loading Receipts Attached</p>
              <p style="font-weight: normal; font-size: 12px; color: #64748b; margin-top: 4px;">Brand: ${brand === 'jkl' ? 'JK Lakshmi' : 'JK Super'}</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>LR No.</th>
                <th>Truck No.</th>
                <th>Destination</th>
                <th>Material</th>
                <th style="text-align: right;">Bags</th>
                <th style="text-align: right;">Weight (MT)</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(v => `
                <tr>
                  <td>${new Date(v.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                  <td>#${v.lrNo}</td>
                  <td style="font-weight: 600;">${v.truckNo}</td>
                  <td>${v.destination}</td>
                  <td>${v.material}</td>
                  <td style="text-align: right;">${v.totalBags}</td>
                  <td style="text-align: right; font-weight: 600;">${parseFloat(v.weight).toFixed(2)} MT</td>
                </tr>
              `).join('')}
              <tr class="totals-row">
                <td colspan="5" style="text-align: right; text-transform: uppercase; font-size: 10px;">Consolidated Totals</td>
                <td style="text-align: right;">${totalBags}</td>
                <td style="text-align: right; color: #6366f1;">${totalWeight.toFixed(2)} MT</td>
              </tr>
            </tbody>
          </table>

          <div class="footer">
            <div style="font-size: 10px; color: #94a3b8; max-width: 300px;">
              <p>Certified that the particulars given above are true and correct. This document serves as a consolidated statement of the loading receipts listed above.</p>
            </div>
            <div style="text-align: center;">
              <div style="border-top: 1px solid #1e293b; width: 150px; margin-bottom: 5px;"></div>
              <p style="font-size: 11px; font-weight: bold; margin: 0;">Authorized Signatory</p>
            </div>
          </div>

          <p style="text-align: center; font-size: 9px; color: #cbd5e1; margin-top: 40px;">
            Generated via Vikas Goods MS on ${new Date().toLocaleString()}
          </p>

          <script>window.print(); setTimeout(() => window.close(), 100);</script>
        </body>
      </html>
    `;
    pwin.document.write(html);
    pwin.document.close();
  };

  const totalSelectedWeight = selectedItems.reduce((s, lr) => s + (parseFloat(lr.weight) || 0), 0);
  const totalSelectedBags = selectedItems.reduce((s, lr) => s + (parseInt(lr.totalBags) || 0), 0);

  return (
    <div style={{ padding: '0 20px 40px' }}>
      <div className="page-hd">
        <div>
          <h1><FileText size={20} color="var(--accent)" /> Generate Invoice</h1>
          <p>Consolidate Loading Receipts into a formal Tax Invoice</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
           {viewMode === 'preview' && (
             <button className="btn btn-g btn-sm" onClick={() => setViewMode('selection')}>
               <ListChecks size={14} /> Back to Selection
             </button>
           )}
           <button className="btn btn-g btn-sm" onClick={fetchLrs} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'ani-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {viewMode === 'selection' ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {/* ── SELECTION UI ── */}
            <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', alignItems: 'start' }}>
              
              <div className="card">
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="card-title-block">
                    <div className="card-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}><ListChecks size={17} /></div>
                    <div className="card-title-text"><h3>Billable Receipts</h3><p>{filteredLrs.length} pending invoicing</p></div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-g btn-sm" onClick={selectAllInPage}>Select All Page</button>
                      <button className="btn btn-icon" onClick={clearSelection} title="Clear All"><RefreshCw size={14} /></button>
                  </div>
                </div>

                <div className="tbl-wrap" style={{ maxHeight: '600px' }}>
                  <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, textAlign: 'center', width: '40px' }}>
                           <Check size={14} />
                        </th>
                        <th style={TH}>Date <ColumnFilter label="" colKey="date" data={lrs} activeFilters={filters} onFilterChange={onFilterUpdate} /></th>
                        <th style={TH}>LR No. <ColumnFilter label="" colKey="lrNo" data={lrs} activeFilters={filters} onFilterChange={onFilterUpdate} /></th>
                        <th style={TH}>Party <ColumnFilter label="" colKey="partyName" data={lrs} activeFilters={filters} onFilterChange={onFilterUpdate} /></th>
                        <th style={TH}>Truck <ColumnFilter label="" colKey="truckNo" data={lrs} activeFilters={filters} onFilterChange={onFilterUpdate} /></th>
                        <th style={TH}>Bags</th>
                        <th style={TH}>Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                          <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading billable items...</td></tr>
                      ) : filteredLrs.length === 0 ? (
                          <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No billable receipts found. Ensure the "Billing" column is not "No".</td></tr>
                      ) : (
                        paginatedLrs.map((lr, i) => (
                          <tr key={lr.id} 
                            onClick={() => toggleSelect(lr.id)}
                            style={{ 
                              background: selectedIds.has(lr.id) ? 'rgba(99,102,241,0.05)' : (i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)'),
                              cursor: 'pointer'
                            }}>
                            <td style={{ ...TD, textAlign: 'center' }}>
                               <input type="checkbox" checked={selectedIds.has(lr.id)} readOnly style={{ accentColor: '#6366f1' }} />
                            </td>
                            <td style={TD}>{new Date(lr.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                            <td style={{ ...TD, fontWeight: 700, color: 'var(--accent)' }}>#{lr.lrNo}</td>
                            <td style={TD}>{lr.partyName}</td>
                            <td style={{ ...TD, fontWeight: 800 }}>{lr.truckNo}</td>
                            <td style={TD}>{lr.totalBags}</td>
                            <td style={{ ...TD, fontWeight: 700 }}>{parseFloat(lr.weight).toFixed(2)} MT</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                  <Pagination 
                    currentPage={currentPage}
                    totalItems={filteredLrs.length}
                    pageSize={PAGE_SIZE}
                    onPageChange={setCurrentPage}
                  />
                </div>
              </div>

              {/* ── GENERATE PANEL ── */}
              <div style={{ position: 'sticky', top: '20px' }}>
                <div className="card">
                  <div className="card-header">
                    <div className="card-title-block">
                      <div className="card-icon" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--accent)' }}><ExternalLink size={17} /></div>
                      <div className="card-title-text"><h3>Invoice Summary</h3><p>{selectedIds.size} LRs selected</p></div>
                    </div>
                  </div>
                  
                  <div style={{ padding: '20px' }}>
                    <div style={{ display: 'grid', gap: '15px' }}>
                      <div className="field">
                        <label><Hash size={13} /> Invoice Number</label>
                        <input className="fi" type="text" placeholder="e.g. VG/24-25/001" value={invoiceForm.invoiceNumber} onChange={e => setInvoiceForm({...invoiceForm, invoiceNumber: e.target.value})} />
                      </div>

                      <div className="field">
                        <label><Calendar size={13} /> Invoice Date</label>
                        <input className="fi" type="date" value={invoiceForm.invoiceDate} onChange={e => setInvoiceForm({...invoiceForm, invoiceDate: e.target.value})} />
                      </div>

                      <div style={{ 
                        background: 'var(--bg)', padding: '15px', borderRadius: '12px', border: '1px dashed var(--border)',
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'
                      }}>
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Bags</div>
                          <div style={{ fontSize: '18px', fontWeight: 900 }}>{totalSelectedBags}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Weight</div>
                          <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--accent)' }}>{totalSelectedWeight.toFixed(2)} MT</div>
                        </div>
                      </div>

                      {selectedIds.size > 0 && Array.from(new Set(selectedItems.map(lr => lr.partyName))).length > 1 && (
                        <div style={{ background: 'rgba(244,63,94,0.1)', padding: '10px', borderRadius: '8px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <AlertCircle size={16} color="#f43f5e" />
                          <div style={{ fontSize: '11px', color: '#f43f5e', fontWeight: 600 }}>Multiple parties selected. Please filter by a single party to generate an invoice.</div>
                        </div>
                      )}

                      <button className="btn btn-a" 
                        disabled={generating || selectedIds.size === 0 || Array.from(new Set(selectedItems.map(lr => lr.partyName))).length > 1} 
                        onClick={handleGenerate}
                        style={{ padding: '12px', width: '100%' }}>
                        {generating ? <><RefreshCw size={16} className="ani-spin" /> Generating...</> : <><Check size={16} /> Generate Invoice</>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
            {/* ── PREVIEW UI ── */}
            <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
              <div className="card-header" style={{ background: 'var(--primary)', color: 'white' }}>
                 <div className="card-title-block">
                    <div className="card-icon" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}><Check size={17} /></div>
                    <div className="card-title-text"><h3 style={{color:'white'}}>Invoice Generated Successfully</h3><p style={{color:'white', opacity:0.8}}>Backup saved to Google Drive</p></div>
                 </div>
                 <button className="btn btn-icon" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none' }} onClick={printInvoice}>
                   <Printer size={18} />
                 </button>
              </div>

              <div style={{ padding: '40px', background: 'white', color: '#1e293b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #e2e8f0', paddingBottom: '20px', marginBottom: '30px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '24px' }}>VIKAS GOODS TRANSPORT</h2>
                    <p style={{ margin: '5px 0', color: '#64748b' }}>Tax Invoice Consignment</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#6366f1' }}>#{tempInvoiceData.invoiceNumber}</div>
                    <div style={{ color: '#64748b' }}>{new Date(tempInvoiceData.invoiceDate).toLocaleDateString()}</div>
                  </div>
                </div>

                <div style={{ marginBottom: '30px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase' }}>Consignee / Party</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '5px' }}>{tempInvoiceData.partyName}</div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                     <tr style={{ background: '#f8fafc' }}>
                       <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>LR No</th>
                       <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0' }}>Truck</th>
                       <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #e2e8f0' }}>Weight</th>
                     </tr>
                  </thead>
                  <tbody>
                    {tempInvoiceData.items.map(item => (
                      <tr key={item.id}>
                        <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9' }}>#{item.lrNo}</td>
                        <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9' }}>{item.truckNo}</td>
                        <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontWeight: 'bold' }}>{parseFloat(item.weight).toFixed(2)} MT</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#f8fafc', fontWeight: 'bold' }}>
                      <td colSpan={2} style={{ padding: '12px', textAlign: 'right' }}>TOTAL WEIGHT</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#6366f1' }}>{totalSelectedWeight.toFixed(2)} MT</td>
                    </tr>
                  </tbody>
                </table>

                <div style={{ marginTop: '50px', display: 'flex', justifyContent: 'center', gap: '15px' }} className="no-print">
                   <button className="btn btn-p" onClick={printInvoice}>
                     <Printer size={16} /> Print Official Copy
                   </button>
                   <button className="btn btn-g" onClick={() => setViewMode('selection')}>
                     Done & Back
                   </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
