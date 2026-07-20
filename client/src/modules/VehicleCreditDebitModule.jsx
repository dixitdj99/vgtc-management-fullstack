import React, { useState, useEffect } from 'react';
import { CreditCard, Plus, Trash2, Search, Filter, AlertCircle, CheckCircle2, DollarSign, ArrowUpRight, ArrowDownLeft, X } from 'lucide-react';
import ax from '../api';
import { fmtRs } from '../utils/format';

export default function VehicleCreditDebitModule() {
  const [advances, setAdvances] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('uncleared'); // 'all', 'uncleared', 'cleared'
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    truckNo: '',
    type: 'credit', // 'credit' = Received, 'debit' = Given
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    remark: '',
    addToCashbook: true,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [advRes, vehRes] = await Promise.all([
        ax.get('/vehicle-advances'),
        ax.get('/vehicles').catch(() => ({ data: [] }))
      ]);
      setAdvances(advRes.data || []);
      setVehicles(vehRes.data || []);
    } catch (e) {
      console.error('Failed to fetch vehicle advances:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.truckNo.trim()) return alert('Please enter or select a truck number');
    if (!formData.amount || parseFloat(formData.amount) <= 0) return alert('Please enter a valid positive amount');

    setSaving(true);
    try {
      await ax.post('/vehicle-advances', {
        ...formData,
        amount: parseFloat(formData.amount),
        truckNo: formData.truckNo.toUpperCase().trim(),
      });
      setModalOpen(false);
      setFormData({
        truckNo: '',
        type: 'credit',
        amount: '',
        date: new Date().toISOString().slice(0, 10),
        remark: '',
        addToCashbook: true,
      });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add vehicle advance');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this vehicle advance record?')) return;
    try {
      await ax.delete(`/vehicle-advances/${id}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete record');
    }
  };

  // Filter records (exclude GPS Rent entries)
  const filtered = advances.filter(a => {
    if (a.isGpsRent || (a.remark || '').toLowerCase().includes('gps rent')) return false;
    const matchesSearch = !search || (a.truckNo || '').toLowerCase().includes(search.toLowerCase()) || (a.remark || '').toLowerCase().includes(search.toLowerCase());
    if (statusFilter === 'uncleared') return matchesSearch && !a.isCleared;
    if (statusFilter === 'cleared') return matchesSearch && a.isCleared;
    return matchesSearch;
  });

  // Calculate stats (exclude GPS Rent entries)
  const unclearedAdvances = advances.filter(a => !a.isCleared && !a.isGpsRent && !(a.remark || '').toLowerCase().includes('gps rent'));
  
  // If search filter is active, update the stats cards and net balance to reflect only the searched truck
  const statsAdvances = search
    ? unclearedAdvances.filter(a => (a.truckNo || '').toLowerCase().includes(search.toLowerCase()) || (a.remark || '').toLowerCase().includes(search.toLowerCase()))
    : unclearedAdvances;

  const totalCredit = statsAdvances.filter(a => a.type === 'credit').reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
  const totalDebit = statsAdvances.filter(a => a.type === 'debit').reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
  const netRunningBalance = totalCredit - totalDebit;

  // Running balance calculation per truck, sorted chronologically (oldest first)
  const advancesWithBalanceMap = Object.freeze((() => {
    const sorted = [...advances].sort((a, b) => new Date(a.date) - new Date(b.date));
    const balances = {};
    const map = {};
    sorted.forEach(item => {
      if (item.isGpsRent || (item.remark || '').toLowerCase().includes('gps rent')) return;
      const truck = item.truckNo;
      const current = balances[truck] || 0;
      const next = item.type === 'credit' ? current + item.amount : current - item.amount;
      balances[truck] = next;
      map[item.id] = next;
    });
    return map;
  })());

  const listWithBalance = filtered.map(item => ({
    ...item,
    runningBalance: advancesWithBalanceMap[item.id] || 0
  }));

  return (
    <div className="module-wrap" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div className="page-hd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: '#10b981', color: 'white', padding: '10px', borderRadius: '12px' }}>
            <CreditCard size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>Vehicle Credit & Debit Ledger</h1>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
              Track advance credits & debits per vehicle number. Applied automatically during Freight Pay.
            </p>
          </div>
        </div>
        <button className="btn btn-p" onClick={() => setModalOpen(true)} style={{ background: '#10b981', color: 'white', padding: '8px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
          <Plus size={16} /> Add Entry
        </button>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div className="card" style={{ padding: '16px', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vehicle Credit (+ Received)</span>
            <div style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '6px', borderRadius: '8px' }}>
              <ArrowUpRight size={16} />
            </div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#10b981' }}>{fmtRs(totalCredit)}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Active advance received from vehicles</div>
        </div>

        <div className="card" style={{ padding: '16px', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vehicle Debit (- Given)</span>
            <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '6px', borderRadius: '8px' }}>
              <ArrowDownLeft size={16} />
            </div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#ef4444' }}>{fmtRs(totalDebit)}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Advances paid out to vehicles</div>
        </div>

        <div className="card" style={{ padding: '16px', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net Running Balance</span>
            <div style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '6px', borderRadius: '8px' }}>
              <DollarSign size={16} />
            </div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: netRunningBalance >= 0 ? '#10b981' : '#ef4444' }}>
            {fmtRs(netRunningBalance)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Available balance to offset in Freight Pay</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: '20px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
          <Search size={16} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Search by Truck No (e.g. HR63E9632)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--text)', fontSize: '13px', width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { id: 'uncleared', label: 'Active (Uncleared)' },
            { id: 'cleared', label: 'Cleared in Pay' },
            { id: 'all', label: 'All Records' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: statusFilter === tab.id ? 800 : 600,
                border: '1px solid var(--border)',
                background: statusFilter === tab.id ? 'var(--primary)' : 'var(--bg-th)',
                color: statusFilter === tab.id ? 'white' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Vehicle Advance Ledger Table */}
      <div className="card" style={{ borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-th)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>
            Vehicle Advance Ledger ({listWithBalance.length} entries)
          </div>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
            Balance: <strong style={{ color: netRunningBalance >= 0 ? '#10b981' : '#ef4444' }}>{fmtRs(netRunningBalance)}</strong>
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-th)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 14px', fontWeight: 800, width: '40px' }}>#</th>
                <th style={{ padding: '10px 14px', fontWeight: 800 }}>DATE</th>
                <th style={{ padding: '10px 14px', fontWeight: 800 }}>TRUCK NO</th>
                <th style={{ padding: '10px 14px', fontWeight: 800 }}>TYPE</th>
                <th style={{ padding: '10px 14px', fontWeight: 800 }}>CREDIT (+)</th>
                <th style={{ padding: '10px 14px', fontWeight: 800 }}>DEBIT (-)</th>
                <th style={{ padding: '10px 14px', fontWeight: 800 }}>RUNNING BALANCE</th>
                <th style={{ padding: '10px 14px', fontWeight: 800 }}>STATUS</th>
                <th style={{ padding: '10px 14px', fontWeight: 800 }}>REMARK</th>
                <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'center' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    Loading vehicle advances...
                  </td>
                </tr>
              ) : listWithBalance.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    No vehicle credit/debit records found. Click "+ Add Entry" to create one.
                  </td>
                </tr>
              ) : (
                listWithBalance.map((item, idx) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-row)', opacity: item.isCleared ? 0.7 : 1 }}>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600 }}>{idx + 1}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700 }}>{new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 900, color: 'var(--primary)' }}>{item.truckNo}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {item.type === 'credit' ? (
                        <span style={{ padding: '2px 8px', borderRadius: '99px', background: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 800, fontSize: '10px' }}>
                          ⊕ Received
                        </span>
                      ) : (
                        <span style={{ padding: '2px 8px', borderRadius: '99px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 800, fontSize: '10px' }}>
                          ⊖ Given
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 800, color: '#10b981' }}>
                      {item.type === 'credit' ? fmtRs(item.amount) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 800, color: '#ef4444' }}>
                      {item.type === 'debit' ? fmtRs(item.amount) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 900, color: item.runningBalance >= 0 ? '#10b981' : '#ef4444' }}>
                      {fmtRs(item.runningBalance)}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {item.isCleared ? (
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-th)', color: 'var(--text-muted)', fontWeight: 700 }}>
                          ✓ Cleared in Pay
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 800 }}>
                          Active
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-sub)', fontSize: '11px' }}>
                      {item.remark || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleDelete(item.id)}
                        title="Delete entry"
                        style={{ border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Entry Modal */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '24px', borderRadius: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontWeight: 900, fontSize: '16px' }}>Add Vehicle Advance Entry</h3>
              <button onClick={() => setModalOpen(false)} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Truck / Vehicle No</label>
                <input
                  type="text"
                  placeholder="e.g. HR63E9632"
                  value={formData.truckNo}
                  onChange={(e) => setFormData({ ...formData, truckNo: e.target.value })}
                  required
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-th)', color: 'var(--text)', outline: 'none', fontSize: '13px', fontWeight: 800 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>Transaction Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'credit', addToCashbook: true })}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: formData.type === 'credit' ? '2px solid #10b981' : '1px solid var(--border)',
                      background: formData.type === 'credit' ? 'rgba(16,185,129,0.1)' : 'var(--bg-th)',
                      color: formData.type === 'credit' ? '#10b981' : 'var(--text-muted)',
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    ⊕ Credit (+ Received)
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'debit', addToCashbook: true })}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      border: formData.type === 'debit' ? '2px solid #ef4444' : '1px solid var(--border)',
                      background: formData.type === 'debit' ? 'rgba(239,68,68,0.1)' : 'var(--bg-th)',
                      color: formData.type === 'debit' ? '#ef4444' : 'var(--text-muted)',
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    ⊖ Debit (- Given)
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Amount (₹)</label>
                  <input
                    type="number"
                    placeholder="e.g. 1000"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    required
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-th)', color: 'var(--text)', outline: 'none', fontSize: '13px', fontWeight: 800 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Date</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-th)', color: 'var(--text)', outline: 'none', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>Remark / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Fuel advance / Cash credit"
                  value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-th)', color: 'var(--text)', outline: 'none', fontSize: '13px' }}
                />
              </div>

              {/* Cashbook choice */}
              <div style={{ marginTop: '4px', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-th)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="chkCashbook"
                  checked={formData.addToCashbook}
                  onChange={(e) => setFormData({ ...formData, addToCashbook: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="chkCashbook" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', cursor: 'pointer', margin: 0, textTransform: 'none' }}>
                  Automatically add entry to Cashbook ({formData.type === 'credit' ? 'Deposit' : 'Cash Out'})
                </label>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button type="button" className="btn btn-g" onClick={() => setModalOpen(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-p" disabled={saving} style={{ flex: 1, background: '#10b981', color: 'white' }}>
                  {saving ? 'Saving...' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
