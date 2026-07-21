import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import ax from '../api';
import { Building2, Plus, Search, MapPin, Phone, Mail, Edit3, Trash2, ArrowLeft, Briefcase, FileText, CheckCircle2, XCircle, BookOpen, Loader2, X as XIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const fmtRs = n => 'Rs.' + Math.round(n).toLocaleString('en-IN');
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function PartyMaster() {
  const { user } = useAuth();
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [ledgerParty, setLedgerParty] = useState(null);
  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerTab, setLedgerTab] = useState('vouchers');

  const openLedger = async (party) => {
    setLedgerParty(party);
    setLedgerData(null);
    setLedgerLoading(true);
    setLedgerTab('vouchers');
    try {
      const res = await ax.get(`/parties/${party.id}/ledger`);
      setLedgerData(res.data);
    } catch { setLedgerData({ vouchers: [], lrs: [], summary: {} }); }
    finally { setLedgerLoading(false); }
  };
  
  const [formData, setFormData] = useState({
    name: '', type: 'customer', contactPerson: '', phone: '', email: '',
    address: '', gstin: '', pan: '', bankDetails: '', openingBalance: 0, balanceType: 'credit', isActive: true
  });

  useEffect(() => {
    fetchParties();
  }, []);

  const fetchParties = async () => {
    try {
      setLoading(true);
      const res = await ax.get('/parties');
      setParties(res.data);
    } catch (err) {
      setError('Failed to fetch parties');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (party = null) => {
    if (party) {
      setEditingId(party.id);
      setFormData({ ...party });
    } else {
      setEditingId(null);
      setFormData({
        name: '', type: 'customer', contactPerson: '', phone: '', email: '',
        address: '', gstin: '', pan: '', bankDetails: '', openingBalance: 0, balanceType: 'credit', isActive: true
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      if (editingId) {
        await ax.patch(`/parties/${editingId}`, formData);
      } else {
        await ax.post('/parties', formData);
      }
      setIsModalOpen(false);
      fetchParties();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save party');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this party?')) return;
    try {
      await ax.delete(`/parties/${id}`);
      fetchParties();
    } catch (err) {
      alert('Failed to delete');
    }
  };

  const filteredParties = parties.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.gstin && p.gstin.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = filterType === 'all' || p.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* Header with quick action */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text)', margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>Master Data</h1>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>Manage your global directory of customers, suppliers, and brokers.</p>
        </div>
        <button onClick={() => handleOpenModal()} style={{ 
          background: 'var(--primary)', color: 'white', border: 'none', padding: '12px 24px', 
          borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '8px', 
          fontSize: '14px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 20px rgba(139, 92, 246, 0.3)' 
        }}>
          <Plus size={18} /> Add New Party
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
          <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Search by Name or GSTIN..." 
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '12px 14px 12px 40px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-card)', padding: '6px', borderRadius: '12px', border: '1px solid var(--border)' }}>
          {['all', 'customer', 'supplier', 'broker', 'transporter'].map(t => (
            <button key={t} onClick={() => setFilterType(t)} style={{
              padding: '6px 12px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 600, textTransform: 'capitalize', cursor: 'pointer',
              background: filterType === t ? 'var(--accent)' : 'transparent',
              color: filterType === t ? 'white' : 'var(--text-muted)',
              transition: 'all 0.2s'
            }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading Master Data...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {filteredParties.map(party => (
            <motion.div key={party.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', position: 'relative' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>{party.type}</div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>{party.name}</h3>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => openLedger(party)} title="View Party Ledger" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', padding: '4px' }}><BookOpen size={14} /></button>
                  <button onClick={() => handleOpenModal(party)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}><Edit3 size={14} /></button>
                  <button onClick={() => handleDelete(party.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f43f5e', padding: '4px' }}><Trash2 size={14} /></button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                {party.contactPerson && <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><User size={14} /> {party.contactPerson}</div>}
                {party.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Phone size={14} /> {party.phone}</div>}
                {party.gstin && <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={14} /> GST: <span style={{ fontWeight: 700, color: 'var(--text)' }}>{party.gstin}</span></div>}
              </div>

              <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: party.isActive ? '#10b981' : 'var(--danger)' }}>
                  {party.isActive ? '• Active' : '• Inactive'}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
                  Bal: ₹{Number(party.openingBalance).toLocaleString()} {party.balanceType === 'debit' ? 'Dr' : 'Cr'}
                </span>
              </div>
            </motion.div>
          ))}
          {filteredParties.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: '16px', border: '1px dashed var(--border)' }}>
              No parties found matching your criteria.
            </div>
          )}
        </div>
      )}

      {/* Party Ledger Modal */}
      <AnimatePresence>
        {ledgerParty && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ background: 'var(--bg-card)', borderRadius: '20px', width: '100%', maxWidth: '820px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', border: '1px solid rgba(99,102,241,0.25)', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
              {/* Header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text)' }}>{ledgerParty.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', textTransform: 'capitalize' }}>{ledgerParty.type} · Party Ledger</div>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setLedgerParty(null)}><XIcon size={20} /></button>
              </div>
              {ledgerLoading ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--text-muted)' }}><Loader2 size={18} className="spin" /> Loading ledger...</div>
              ) : ledgerData ? (
                <>
                  {/* Summary cards */}
                  <div style={{ padding: '16px 24px', display: 'flex', gap: '10px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
                    {[
                      { label: 'Vouchers', val: ledgerData.summary.trips || 0, color: 'var(--primary)' },
                      { label: 'Loading Receipts', val: ledgerData.summary.lrCount || 0, color: '#6366f1' },
                      { label: 'Total Net', val: fmtRs(ledgerData.summary.totalNet || 0), color: 'var(--accent)' },
                      { label: 'Outstanding', val: fmtRs(ledgerData.summary.outstanding || 0), color: (ledgerData.summary.outstanding || 0) > 0 ? 'var(--warn)' : 'var(--accent)' },
                      { label: 'Last Activity', val: fmtDate(ledgerData.summary.lastActivity), color: 'var(--text-muted)' },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ background: 'var(--bg-input)', borderRadius: '10px', padding: '8px 14px', minWidth: '120px' }}>
                        <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
                        <div style={{ fontSize: '15px', fontWeight: 900, color, lineHeight: 1.2, marginTop: '2px' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  {/* Tabs */}
                  <div style={{ padding: '10px 24px 0', display: 'flex', gap: '8px' }}>
                    {[['vouchers', 'Vouchers'], ['lrs', 'Loading Receipts']].map(([key, label]) => (
                      <button key={key} onClick={() => setLedgerTab(key)} className={`tab-btn${ledgerTab === key ? ' tab-indigo' : ''}`}>{label}</button>
                    ))}
                  </div>
                  {/* Table */}
                  <div style={{ flex: 1, overflow: 'auto', padding: '12px 24px 20px' }}>
                    {ledgerTab === 'vouchers' && (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                        <thead><tr style={{ background: 'var(--bg-th)' }}>
                          {['Date', 'LR No.', 'Truck', 'Destination', 'Weight', 'Gross', 'Net Balance', 'Paid', 'Outstanding'].map(h => (
                            <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {ledgerData.vouchers.length === 0 ? <tr><td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No vouchers found</td></tr>
                            : ledgerData.vouchers.map((v, i) => {
                              const g = (parseFloat(v.weight)||0) * (parseFloat(v.rate)||0);
                              const d = v.advanceDiesel === 'FULL' ? 4000 : (parseFloat(v.advanceDiesel)||0);
                              const net = g - d - (parseFloat(v.advanceCash)||0) - (parseFloat(v.advanceOnline)||0) - (parseFloat(v.munshi)||0) - (parseFloat(v.shortage)||0) - (parseFloat(v.commission)||0);
                              const paid = parseFloat(v.paidBalance) || 0;
                              const out = Math.max(0, net - paid);
                              return <tr key={v.id} style={{ background: i%2===0?'var(--bg-row-even)':'var(--bg-row-odd)', borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '6px 12px' }}>{fmtDate(v.date)}</td>
                                <td style={{ padding: '6px 12px', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>#{v.lrNo}</td>
                                <td style={{ padding: '6px 12px', fontWeight: 700 }}>{v.truckNo}</td>
                                <td style={{ padding: '6px 12px' }}>{v.destination || '—'}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right' }}>{v.weight}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmtRs(g)}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--accent)' }}>{fmtRs(net)}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right' }}>{paid ? fmtRs(paid) : '—'}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 800, color: out>0?'var(--warn)':'var(--accent)' }}>{out>0?fmtRs(out):'✓'}</td>
                              </tr>;
                            })}
                        </tbody>
                      </table>
                    )}
                    {ledgerTab === 'lrs' && (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                        <thead><tr style={{ background: 'var(--bg-th)' }}>
                          {['Date', 'LR No.', 'Truck', 'Material', 'Weight', 'Bags', 'Destination', 'Status'].map(h => (
                            <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {ledgerData.lrs.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No loading receipts found</td></tr>
                            : ledgerData.lrs.map((l, i) => (
                              <tr key={l.id} style={{ background: i%2===0?'var(--bg-row-even)':'var(--bg-row-odd)', borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '6px 12px' }}>{fmtDate(l.date)}</td>
                                <td style={{ padding: '6px 12px', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>#{l.lrNo}</td>
                                <td style={{ padding: '6px 12px', fontWeight: 700 }}>{l.truckNo}</td>
                                <td style={{ padding: '6px 12px' }}>{l.material}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right' }}>{l.weight}</td>
                                <td style={{ padding: '6px 12px', textAlign: 'right' }}>{l.totalBags}</td>
                                <td style={{ padding: '6px 12px' }}>{l.destination || '—'}</td>
                                <td style={{ padding: '6px 12px' }}><span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: l.status === 'Billed' || l.status === 'Delivered' ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)', color: l.status === 'Billed' || l.status === 'Delivered' ? '#10b981' : '#6366f1' }}>{l.status || 'Created'}</span></td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : null}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              style={{ background: 'var(--bg-card)', borderRadius: '24px', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}
            >
              <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 10 }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>{editingId ? 'Edit Party' : 'Create New Party'}</h2>
                <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><XCircle size={24} /></button>
              </div>

              <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
                {error && <div style={{ padding: '12px', background: 'rgba(244,63,94,0.1)', color: 'var(--danger)', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', fontWeight: 600 }}>{error}</div>}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  {/* Basic Info */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '16px' }}>Basic Info</h3>
                  </div>

                  <div className="field-h">
                    <label>Party Name *</label>
                    <input className="fi" type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required placeholder="e.g. M/S ABC Logistics" />
                  </div>
                  <div className="field-h">
                    <label>Party Type</label>
                    <select className="fi" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                      <option value="customer">Customer</option>
                      <option value="supplier">Supplier</option>
                      <option value="broker">Broker</option>
                      <option value="transporter">Transporter</option>
                    </select>
                  </div>

                  {/* Contact Info */}
                  <div style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '16px' }}>Contact Details</h3>
                  </div>

                  <div className="field-h">
                    <label>Contact Person</label>
                    <input className="fi" type="text" value={formData.contactPerson} onChange={e => setFormData({...formData, contactPerson: e.target.value})} placeholder="Name" />
                  </div>
                  <div className="field-h">
                    <label>Phone Number</label>
                    <input className="fi" type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="+91..." />
                  </div>
                  <div className="field-h" style={{ gridColumn: '1 / -1' }}>
                    <label>Address</label>
                    <textarea className="fi" rows="2" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="Full address..." />
                  </div>

                  {/* Tax & Financials */}
                  <div style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '16px' }}>Tax & Financials</h3>
                  </div>

                  <div className="field-h">
                    <label>GSTIN</label>
                    <input className="fi" type="text" value={formData.gstin} onChange={e => setFormData({...formData, gstin: e.target.value.toUpperCase()})} placeholder="22AAAAA0000A1Z5" />
                  </div>
                  <div className="field-h">
                    <label>PAN Number</label>
                    <input className="fi" type="text" value={formData.pan} onChange={e => setFormData({...formData, pan: e.target.value.toUpperCase()})} placeholder="AAAAA0000A" />
                  </div>
                  <div className="field-h">
                    <label>Opening Balance (₹)</label>
                    <input className="fi" type="number" value={formData.openingBalance} onChange={e => setFormData({...formData, openingBalance: e.target.value})} />
                  </div>
                  <div className="field-h">
                    <label>Balance Type</label>
                    <select className="fi" value={formData.balanceType} onChange={e => setFormData({...formData, balanceType: e.target.value})}>
                      <option value="credit">Credit (They owe us)</option>
                      <option value="debit">Debit (We owe them)</option>
                    </select>
                  </div>
                  <div className="field-h" style={{ gridColumn: '1 / -1' }}>
                    <label>Bank Details</label>
                    <textarea className="fi" rows="2" value={formData.bankDetails} onChange={e => setFormData({...formData, bankDetails: e.target.value})} placeholder="A/C No, IFSC, Bank Name" />
                  </div>
                </div>

                <div style={{ marginTop: '32px', paddingTop: '20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>
                    <input type="checkbox" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} style={{ width: '18px', height: '18px' }} />
                    Party is Active
                  </label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button type="button" onClick={() => setIsModalOpen(false)} className="btn" style={{ background: 'var(--bg-input)' }}>Cancel</button>
                    <button type="submit" className="btn btn-p" style={{ padding: '10px 24px' }}>Save Party</button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Helper icon
function User({ size }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
}
