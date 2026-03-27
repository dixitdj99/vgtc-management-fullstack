import React, { useState, useEffect, useMemo, useRef } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShoppingCart, Plus, History, Trash2, RefreshCw, 
  Check, X, Search, Download, Printer, Filter, 
  IndianRupee, Package, User, FileText, Calendar, Weight,
  CreditCard, Banknote, ReceiptText
} from 'lucide-react';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import ColumnFilter from '../components/ColumnFilter';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 20;

const BASE_API = `/sell`;
const MATS_DUMP = ["PPC", "OPC43", "Adstar", "OPC FS", "OPC53 FS", "Weather"];
const MATS_JKL = ["PPC", "OPC43", "Pro+"];
const MCOL = { "PPC": "#6366f1", "OPC43": "#f59e0b", "Pro+": "#10b981", "Adstar": "#10b981", "OPC FS": "#0ea5e9", "OPC53 FS": "#a855f7", "Weather": "#f43f5e" };

export default function SellModule({ brand = 'dump', role = 'user', permissions = {} }) {
  const MATS = brand === 'jkl' ? MATS_JKL : MATS_DUMP;
  
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  const getEmptyForm = () => ({
    material: MATS[0],
    quantity: '',
    rate: '',
    customerName: '',
    remark: '',
    paymentType: 'cash',
    paymentStatus: 'paid',
    date: new Date().toISOString().slice(0, 10),
    brand: brand
  });

  const [form, setForm] = useState(getEmptyForm());
  const [filters, setFilters] = useState({});

  useEffect(() => {
    fetchSales();
    setCurrentPage(1);
  }, [brand]);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const res = await ax.get(`${BASE_API}?brand=${brand}`);
      setSales(res.data);
    } catch (e) {
      console.error('Fetch sales failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.quantity || parseFloat(form.quantity) <= 0) return setErr('Enter valid quantity');
    if (!form.rate || parseFloat(form.rate) <= 0) return setErr('Enter valid rate');
    
    setSaving(true);
    try {
      await ax.post(BASE_API, form);
      setForm(getEmptyForm());
      fetchSales();
    } catch (er) {
      setErr(er.response?.data?.error || 'Failed to record sale');
    } finally {
      setSaving(false);
    }
  };

  const updatePaymentStatus = async (id, status, pType) => {
    try {
      const data = { paymentStatus: status };
      if (pType) data.paymentType = pType;
      await ax.patch(`${BASE_API}/${id}`, data);
      fetchSales();
    } catch (e) {
      alert('Update failed');
    }
  };

  const deleteSale = async (id) => {
    if (role !== 'admin') return alert('Only admins can delete sales');
    if (!window.confirm('Are you sure you want to delete this sale?')) return;
    
    try {
      await ax.delete(`${BASE_API}/${id}`);
      fetchSales();
    } catch (e) {
      alert('Delete failed');
    }
  };

  const filteredSales = useMemo(() => {
    let list = [...sales];
    Object.keys(filters).forEach(key => {
      const vals = filters[key];
      if (vals && vals.length > 0) {
        list = list.filter(s => vals.includes(String(s[key] ?? '')));
      }
    });
    return list;
  }, [sales, filters]);

  // Pagination Logic
  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredSales.slice(start, start + PAGE_SIZE);
  }, [filteredSales, currentPage]);

  const onFilterUpdate = (k, v) => {
    setFilters(f => ({ ...f, [k]: v }));
    setCurrentPage(1);
  };

  const totalBags = filteredSales.reduce((s, x) => s + (parseInt(x.quantity) || 0), 0);
  const totalVal = filteredSales.reduce((s, x) => s + (parseFloat(x.totalAmount) || 0), 0);
  const totalCash = filteredSales.filter(s => s.paymentType === 'cash' && s.paymentStatus !== 'pending').reduce((s, x) => s + (parseFloat(x.totalAmount) || 0), 0);
  const totalOnline = filteredSales.filter(s => s.paymentType === 'online' && s.paymentStatus !== 'pending').reduce((s, x) => s + (parseFloat(x.totalAmount) || 0), 0);
  const totalPending = filteredSales.filter(s => s.paymentStatus === 'pending').reduce((s, x) => s + (parseFloat(x.totalAmount) || 0), 0);

  const TH = { padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg-th)', borderBottom: '1px solid var(--border)', textAlign: 'left' };
  const TD = { padding: '10px 12px', fontSize: '13px', color: 'var(--text-sub)', borderBottom: '1px solid var(--border-row)', verticalAlign: 'middle' };

  const weightMT = (parseFloat(form.quantity) || 0) * 0.05;
  const totalAmt = (parseFloat(form.quantity) || 0) * (parseFloat(form.rate) || 0);

  const printReceipt = (s) => {
    const pwin = window.open('', '_blank');
    const html = `
      <html>
        <head>
          <title>Receipt - ${s.customerName}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
            .content { margin-bottom: 30px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dashed #eee; padding-bottom: 4px; }
            .label { font-weight: bold; color: #666; }
            .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #999; }
            .stamp { text-align: right; margin-top: 30px; font-weight: bold; color: #10b981; text-transform: uppercase; border: 2px solid #10b981; display: inline-block; padding: 5px 15px; border-radius: 4px; transform: rotate(-5deg); }
            .stamp.pending { color: #f43f5e; border-color: #f43f5e; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin:0">VIKAS GOODS</h1>
            <p style="margin:5px 0">Cement Sales Receipt</p>
          </div>
          <div class="content">
            <div class="row"><span class="label">Date:</span> <span>${new Date(s.date).toLocaleDateString('en-IN')}</span></div>
            <div class="row"><span class="label">Customer Name:</span> <span>${s.customerName}</span></div>
            <div class="row"><span class="label">Material:</span> <span>${s.material}</span></div>
            <div class="row"><span class="label">Quantity:</span> <span>${s.quantity} Bags (${(s.quantity * 0.05).toFixed(2)} MT)</span></div>
            <div class="row"><span class="label">Rate per Bag:</span> <span>₹${s.rate}</span></div>
            <div class="row"><span class="label">Payment Mode:</span> <span style="text-transform: capitalize;">${s.paymentStatus === 'pending' ? 'Not Paid (Pending)' : s.paymentType}</span></div>
            <div class="row" style="border-top: 2px solid #333; padding-top: 10px; margin-top: 20px;">
              <span class="label" style="font-size: 1.2em; color: #000;">Total Amount:</span> 
              <span style="font-size: 1.2em; font-weight: 900; color: #000;">₹${s.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          <div style="text-align: right;">
            <div class="stamp ${s.paymentStatus === 'pending' ? 'pending' : ''}">
              ${s.paymentStatus === 'pending' ? 'NOT PAID / PENDING' : `PAID BY ${s.paymentType.toUpperCase()}`}
            </div>
          </div>
          <div class="footer">
            <p>Thank you for your business!</p>
            <p>Generated on ${new Date().toLocaleString()}</p>
          </div>
          <script>window.print(); setTimeout(() => window.close(), 100);</script>
        </body>
      </html>
    `;
    pwin.document.write(html);
    pwin.document.close();
  };

  return (
    <div style={{ padding: '0 20px 40px' }}>
      <div className="page-hd">
        <div>
          <h1><ShoppingCart size={20} color="var(--accent)" /> {brand === 'jkl' ? 'JK Lakshmi' : 'Dump'} Sell</h1>
          <p>Tracking internal sales and bag deductions</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-g btn-sm" onClick={fetchSales} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'ani-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* ── COLLECTION SUMMARY ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '25px' }}>
         <div className="card" style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid #6366f1' }}>
            <div style={{ padding: '8px', background: 'rgba(99,102,241,0.1)', borderRadius: '10px', color: '#6366f1' }}><ShoppingCart size={20} /></div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Sales</div>
              <div style={{ fontSize: '16px', fontWeight: 800 }}>₹{totalVal.toLocaleString('en-IN')}</div>
            </div>
         </div>
         <div className="card" style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid #10b981' }}>
            <div style={{ padding: '8px', background: 'rgba(16,185,129,0.1)', borderRadius: '10px', color: '#10b981' }}><Banknote size={20} /></div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cash (Paid)</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#10b981' }}>₹{totalCash.toLocaleString('en-IN')}</div>
            </div>
         </div>
         <div className="card" style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid #0ea5e9' }}>
            <div style={{ padding: '8px', background: 'rgba(14,165,233,0.1)', borderRadius: '10px', color: '#0ea5e9' }}><CreditCard size={20} /></div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Online (Paid)</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0ea5e9' }}>₹{totalOnline.toLocaleString('en-IN')}</div>
            </div>
         </div>
         <div className="card" style={{ padding: '15px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid #f43f5e' }}>
            <div style={{ padding: '8px', background: 'rgba(244,63,94,0.1)', borderRadius: '10px', color: '#f43f5e' }}><RefreshCw size={20} /></div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pending Pay</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#f43f5e' }}>₹{totalPending.toLocaleString('en-IN')}</div>
            </div>
         </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', alignItems: 'start' }}>
        
        {/* ── SALES HISTORY ── */}
        <div className="card">
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}><History size={17} /></div>
              <div className="card-title-text"><h3>Transaction Ledger</h3><p>{filteredSales.length} entries</p></div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-icon" title="Export Excel" onClick={() => exportToExcel(filteredSales, `Sales_Ledger_${brand}`)}><Download size={15} /></button>
            </div>
          </div>

          <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Date <ColumnFilter label="" colKey="date" data={sales} activeFilters={filters} onFilterChange={onFilterUpdate} /></th>
                  <th style={TH}>Material <ColumnFilter label="" colKey="material" data={sales} activeFilters={filters} onFilterChange={onFilterUpdate} /></th>
                   <th style={TH}>Customer <ColumnFilter label="" colKey="customerName" data={sales} activeFilters={filters} onFilterChange={onFilterUpdate} /></th>
                  <th style={{ ...TH, textAlign: 'center' }}>Type <ColumnFilter label="" colKey="paymentType" data={sales} activeFilters={filters} onFilterChange={onFilterUpdate} /></th>
                  <th style={{ ...TH, textAlign: 'center' }}>Status <ColumnFilter label="" colKey="paymentStatus" data={sales} activeFilters={filters} onFilterChange={onFilterUpdate} /></th>
                  <th style={{ ...TH, textAlign: 'right' }}>Bags</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Total</th>
                  <th style={{ ...TH, textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                    <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td></tr>
                ) : filteredSales.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No sales history found</td></tr>
                ) : (
                  paginatedSales.map((s, i) => (
                    <tr key={s.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
                      <td style={TD}>{new Date(s.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                      <td style={TD}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: MCOL[s.material] || '#ccc' }} />
                          {s.material}
                        </div>
                      </td>
                      <td style={TD}>
                        <div style={{ fontWeight: 600, color: 'var(--text)' }}>{s.customerName}</div>
                        <div style={{ fontSize: '10px', opacity: 0.7 }}>{s.remark}</div>
                      </td>
                       <td style={{ ...TD, textAlign: 'center' }}>
                         {s.paymentType === 'cash' ? <span style={{ color: '#10b981', fontSize: '11px', fontWeight: 700 }}>CASH</span> : <span style={{ color: '#0ea5e9', fontSize: '11px', fontWeight: 700 }}>ONLINE</span>}
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                         {s.paymentStatus === 'pending' 
                            ? <span style={{ padding: '2px 8px', borderRadius: '10px', background: 'rgba(244,63,94,0.1)', color: '#f43f5e', fontSize: '10px', fontWeight: 800 }}>PENDING</span>
                            : <span style={{ padding: '2px 8px', borderRadius: '10px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontSize: '10px', fontWeight: 800 }}>PAID</span>
                         }
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>
                        {s.quantity}
                        <div style={{ fontSize: '10px', fontWeight: 500 }}>{(s.quantity * 0.05).toFixed(2)} MT</div>
                      </td>
                      <td style={{ ...TD, textAlign: 'right', color: 'var(--accent)', fontWeight: 800 }}>₹{s.totalAmount.toLocaleString('en-IN')}</td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                         <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                           {s.paymentStatus === 'pending' && (
                             <>
                               <button className="btn-icon" title="Mark as Cash Paid" style={{ color: '#10b981' }} onClick={() => updatePaymentStatus(s.id, 'paid', 'cash')}><Banknote size={14} /></button>
                               <button className="btn-icon" title="Mark as Online Paid" style={{ color: '#0ea5e9' }} onClick={() => updatePaymentStatus(s.id, 'paid', 'online')}><CreditCard size={14} /></button>
                             </>
                           )}
                           <button className="btn-icon" title="Print Receipt" style={{ color: 'var(--accent)' }} onClick={() => printReceipt(s)}><ReceiptText size={14} /></button>
                           {role === 'admin' && (
                             <button className="btn-icon" style={{ color: 'var(--danger)' }} onClick={() => deleteSale(s.id)}><Trash2 size={14} /></button>
                           )}
                         </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot style={{ position: 'sticky', bottom: 0, background: 'var(--bg-card)', boxShadow: '0 -2px 10px rgba(0,0,0,0.05)' }}>
                <tr>
                   <td colSpan={4} style={{ ...TD, fontWeight: 800, textAlign: 'right' }}>SUBTOTAL:</td>
                   <td style={{ ...TD, fontWeight: 900, textAlign: 'right' }}>{totalBags} <br/><span style={{fontSize:'10px'}}>{(totalBags*0.05).toFixed(2)} MT</span></td>
                   <td style={{ ...TD, fontWeight: 900, textAlign: 'right', color: 'var(--accent)', fontSize: '15px' }}>₹{totalVal.toLocaleString('en-IN')}</td>
                   <td style={TD}></td>
                </tr>
              </tfoot>
            </table>

            <Pagination 
              currentPage={currentPage}
              totalItems={filteredSales.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>

        {/* ── NEW SALE FORM ── */}
        <div style={{ position: 'sticky', top: '20px' }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title-block">
                <div className="card-icon" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--accent)' }}><Plus size={17} /></div>
                <div className="card-title-text"><h3>New Direct Sale</h3><p>Record sale & deduct stock</p></div>
              </div>
            </div>
            
            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gap: '15px' }}>
                <div className="field">
                  <label><Calendar size={13} /> Date</label>
                  <input className="fi" type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
                </div>

                <div className="field">
                  <label><Package size={13} /> Material Brand</label>
                  <select className="fi" value={form.material} onChange={e => setForm({...form, material: e.target.value})}>
                    {MATS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label><Weight size={13} /> Bags</label>
                    <input className="fi" type="number" placeholder="50" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} />
                  </div>
                  <div className="field">
                    <label><Weight size={13} /> Weight (MT)</label>
                    <input className="fi" type="text" readOnly value={weightMT.toFixed(2) + ' MT'} style={{ background: 'var(--bg)', opacity: 0.8 }} />
                  </div>
                </div>

                <div className="field">
                  <label><IndianRupee size={13} /> Rate per Bag</label>
                  <input className="fi" type="number" step="0.01" placeholder="420.00" value={form.rate} onChange={e => setForm({...form, rate: e.target.value})} />
                </div>

                 <div className="field">
                    <label><CreditCard size={13} /> Payment & Status</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                        <button type="button" onClick={() => setForm({...form, paymentStatus: 'paid'})} className={`btn btn-sm ${form.paymentStatus === 'paid' ? 'btn-s' : 'btn-g'}`} style={{ height: '36px' }}>
                           <Check size={14} /> Paid
                        </button>
                        <button type="button" onClick={() => setForm({...form, paymentStatus: 'pending'})} className={`btn btn-sm ${form.paymentStatus === 'pending' ? 'btn-d' : 'btn-g'}`} style={{ height: '36px' }}>
                           <RefreshCw size={14} /> Pending
                        </button>
                    </div>
                    {form.paymentStatus === 'paid' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <button type="button" onClick={() => setForm({...form, paymentType: 'cash'})} className={`btn btn-sm ${form.paymentType === 'cash' ? 'btn-p' : 'btn-g'}`} style={{ height: '36px' }}>
                             <Banknote size={14} /> Cash
                          </button>
                          <button type="button" onClick={() => setForm({...form, paymentType: 'online'})} className={`btn btn-sm ${form.paymentType === 'online' ? 'btn-p' : 'btn-g'}`} style={{ height: '36px' }}>
                             <CreditCard size={14} /> Online
                          </button>
                      </div>
                    )}
                </div>

                <div className="field">
                  <label><User size={13} /> Customer Name</label>
                  <input className="fi" type="text" placeholder="e.g. Local Cash" value={form.customerName} onChange={e => setForm({...form, customerName: e.target.value})} />
                </div>

                <div className="field">
                  <label><FileText size={13} /> Remarks</label>
                  <textarea className="fi" rows={2} placeholder="Optional notes" value={form.remark} onChange={e => setForm({...form, remark: e.target.value})} />
                </div>

                <div style={{ 
                  background: 'var(--bg)', padding: '15px', borderRadius: '12px', border: '1px dashed var(--border)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Sale Amount</div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--accent)' }}>₹{totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                </div>

                {err && <div style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 600 }}>{err}</div>}

                <button type="submit" className="btn btn-a" disabled={saving || !(role === 'admin' || permissions?.sell === 'edit')} style={{ padding: '12px' }}>
                  {saving ? 'Processing...' : <><Check size={16} /> Confirm & Print Receipt</>}
                </button>
              </div>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
