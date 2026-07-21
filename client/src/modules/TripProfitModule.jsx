import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import ax from '../api';
import { TrendingUp, TrendingDown, Truck, MapPin, Calendar, Search, Loader2, ArrowUpRight, ArrowDownRight, Filter, ChevronDown, ChevronUp, Fuel, Banknote, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const fmtRs = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const calcGross = (v) => {
  if (v.deliveries?.length) return v.deliveries.reduce((s, d) => s + (parseFloat(d.weight) || 0) * (parseFloat(d.rate) || 0), 0);
  return (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);
};

const calcNet = (v) => {
  const gross = calcGross(v);
  const diesel = v.advanceDiesel === 'FULL' ? 4000 : (parseFloat(v.advanceDiesel) || 0);
  const cash = parseFloat(v.advanceCash) || 0;
  const online = parseFloat(v.advanceOnline) || 0;
  const munshi = parseFloat(v.munshi) || 0;
  const commission = parseFloat(v.commission) || 0;
  const shortage = parseFloat(v.shortage) || 0;
  const tyrePuncture = parseFloat(v.tyrePuncture) || 0;
  const tyreGreasing = parseFloat(v.tyreGreasingAir) || 0;
  const extraCash = parseFloat(v.extraCash) || 0;
  const deductions = diesel + cash + online + munshi + commission + shortage + tyrePuncture + tyreGreasing + extraCash;
  return { gross, diesel, cash, online, munshi, commission, shortage, deductions, net: gross - deductions };
};

export default function TripProfitModule() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [vouchers, setVouchers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('All');
  const [selectedTruck, setSelectedTruck] = useState('All');
  const [expandedId, setExpandedId] = useState(null);
  const [sortBy, setSortBy] = useState('date'); // date, profit, margin

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [vRes, vehRes] = await Promise.all([
          ax.get('/vouchers').catch(() => ({ data: [] })),
          ax.get('/vehicles').catch(() => ({ data: [] })),
        ]);
        setVouchers(vRes.data || []);
        setVehicles(vehRes.data || []);
      } catch { }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  // Build a set of self-owned truck numbers
  const selfTrucks = useMemo(() => {
    const s = new Set();
    vehicles.forEach(v => { if (v.ownershipType === 'self' && v.truckNo) s.add(v.truckNo.trim().toUpperCase()); });
    return s;
  }, [vehicles]);

  // Compute trip-level profit for each voucher
  const trips = useMemo(() => {
    return vouchers.map(v => {
      const nums = calcNet(v);
      const truckNo = (v.truckNo || '').trim().toUpperCase();
      const isSelf = selfTrucks.has(truckNo);
      // Commission is firm revenue from market trucks
      const firmRevenue = isSelf ? nums.net : (parseFloat(v.commission) || 0);
      const firmCost = isSelf ? nums.deductions : 0;
      const margin = nums.gross > 0 ? ((firmRevenue / nums.gross) * 100) : 0;

      return {
        id: v.id || v._id,
        lrNo: v.lrNo || '',
        truckNo,
        destination: v.destination || '',
        partyName: v.partyName || '',
        date: v.date || '',
        type: v.type || '',
        weight: parseFloat(v.weight) || (v.deliveries?.reduce((s, d) => s + (parseFloat(d.weight) || 0), 0) || 0),
        ...nums,
        isSelf,
        firmRevenue,
        firmCost,
        margin,
      };
    }).filter(t => t.gross > 0); // only trips with actual freight
  }, [vouchers, selfTrucks]);

  // Unique months & trucks for filters
  const months = useMemo(() => {
    const s = new Set();
    trips.forEach(t => {
      if (t.date) {
        const m = t.date.match(/^(\d{4})-(\d{2})/);
        if (m) s.add(`${m[1]}-${m[2]}`);
      }
    });
    return Array.from(s).sort().reverse();
  }, [trips]);

  const truckList = useMemo(() => {
    const s = new Set();
    trips.forEach(t => { if (t.truckNo) s.add(t.truckNo); });
    return Array.from(s).sort();
  }, [trips]);

  // Filter
  const filtered = useMemo(() => {
    let list = trips;
    if (selectedMonth !== 'All') list = list.filter(t => t.date?.startsWith(selectedMonth));
    if (selectedTruck !== 'All') list = list.filter(t => t.truckNo === selectedTruck);
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(t => t.lrNo?.toLowerCase().includes(q) || t.truckNo?.toLowerCase().includes(q) || t.destination?.toLowerCase().includes(q) || t.partyName?.toLowerCase().includes(q));
    }
    // Sort
    if (sortBy === 'profit') list = [...list].sort((a, b) => b.firmRevenue - a.firmRevenue);
    else if (sortBy === 'margin') list = [...list].sort((a, b) => b.margin - a.margin);
    else list = [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return list;
  }, [trips, selectedMonth, selectedTruck, searchTerm, sortBy]);

  // KPIs
  const kpi = useMemo(() => {
    const totalGross = filtered.reduce((s, t) => s + t.gross, 0);
    const totalNet = filtered.reduce((s, t) => s + t.firmRevenue, 0);
    const totalDiesel = filtered.reduce((s, t) => s + t.diesel, 0);
    const avgMargin = filtered.length > 0 ? (totalNet / totalGross) * 100 : 0;
    return { trips: filtered.length, totalGross, totalNet, totalDiesel, avgMargin };
  }, [filtered]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '12px', color: 'var(--text-muted)' }}>
      <Loader2 size={20} className="spin" /> Analyzing trip data...
    </div>
  );

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '22px' }}>
        {[
          { label: 'Total Trips', value: kpi.trips, fmt: false, color: '#6366f1', icon: <Package size={16} /> },
          { label: 'Gross Freight', value: kpi.totalGross, fmt: true, color: '#3b82f6', icon: <Banknote size={16} /> },
          { label: 'Firm Revenue', value: kpi.totalNet, fmt: true, color: '#10b981', icon: <TrendingUp size={16} /> },
          { label: 'Diesel Cost', value: kpi.totalDiesel, fmt: true, color: '#f59e0b', icon: <Fuel size={16} /> },
          { label: 'Avg Margin', value: `${kpi.avgMargin.toFixed(1)}%`, fmt: false, color: kpi.avgMargin >= 0 ? '#10b981' : '#f43f5e', icon: kpi.avgMargin >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} /> },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: `${k.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.color }}>{k.icon}</div>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: k.color }}>{k.fmt ? fmtRs(k.value) : k.value}</div>
              <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '180px', position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="fi" placeholder="Search LR, truck, party, destination..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ paddingLeft: '34px', width: '100%' }} />
        </div>
        <select className="fi" style={{ width: 'auto', minWidth: '140px' }} value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
          <option value="All">All Months</option>
          {months.map(m => <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</option>)}
        </select>
        <select className="fi" style={{ width: 'auto', minWidth: '140px' }} value={selectedTruck} onChange={e => setSelectedTruck(e.target.value)}>
          <option value="All">All Trucks</option>
          {truckList.map(t => <option key={t} value={t}>{t} {selfTrucks.has(t) ? '(Own)' : '(Market)'}</option>)}
        </select>
        <select className="fi" style={{ width: 'auto', minWidth: '120px' }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="date">Sort: Date</option>
          <option value="profit">Sort: Profit</option>
          <option value="margin">Sort: Margin</option>
        </select>
      </div>

      {/* Trip List */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <TrendingUp size={48} style={{ opacity: 0.15, marginBottom: '12px' }} />
          <div style={{ fontSize: '14px', fontWeight: 700 }}>No trips found</div>
          <div style={{ fontSize: '12px', marginTop: '4px' }}>Adjust filters or create vouchers to see trip-wise profit data.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(t => {
            const isExpanded = expandedId === t.id;
            const profitColor = t.firmRevenue >= 0 ? '#10b981' : '#f43f5e';
            return (
              <div key={t.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : t.id)}>
                  {/* Left: Truck badge */}
                  <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: t.isSelf ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Truck size={18} color={t.isSelf ? '#10b981' : '#f59e0b'} />
                  </div>

                  {/* Center: Trip info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: '13px' }}>{t.truckNo}</span>
                      {t.lrNo && <span style={{ fontSize: '10px', background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>LR #{t.lrNo}</span>}
                      <span style={{ fontSize: '10px', background: t.isSelf ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)', color: t.isSelf ? '#10b981' : '#f59e0b', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>{t.isSelf ? 'OWN' : 'MARKET'}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {t.destination && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><MapPin size={10} /> {t.destination}</span>}
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Calendar size={10} /> {fmtDate(t.date)}</span>
                      {t.weight > 0 && <span>{t.weight.toFixed(1)} MT</span>}
                    </div>
                  </div>

                  {/* Right: Profit */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: profitColor }}>{fmtRs(t.firmRevenue)}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>of {fmtRs(t.gross)} gross</div>
                  </div>
                  <div style={{ width: '40px', textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: profitColor }}>{t.margin.toFixed(0)}%</div>
                    {isExpanded ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
                  </div>
                </div>

                {/* Expanded breakdown */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                      <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--border)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginTop: '12px', fontSize: '12px' }}>
                          <div style={{ background: 'rgba(59,130,246,0.06)', borderRadius: '8px', padding: '10px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gross Freight</div>
                            <div style={{ fontSize: '16px', fontWeight: 900, color: '#3b82f6', marginTop: '2px' }}>{fmtRs(t.gross)}</div>
                          </div>
                          <div style={{ background: 'rgba(245,158,11,0.06)', borderRadius: '8px', padding: '10px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Deductions</div>
                            <div style={{ fontSize: '16px', fontWeight: 900, color: '#f59e0b', marginTop: '2px' }}>{fmtRs(t.deductions)}</div>
                          </div>
                          <div style={{ background: `${profitColor}0a`, borderRadius: '8px', padding: '10px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net / Firm Revenue</div>
                            <div style={{ fontSize: '16px', fontWeight: 900, color: profitColor, marginTop: '2px' }}>{fmtRs(t.firmRevenue)}</div>
                          </div>
                        </div>

                        {/* Deduction breakdown */}
                        <div style={{ marginTop: '12px', fontSize: '12px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Deduction Breakdown</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                            {[
                              { label: 'Diesel Advance', val: t.diesel },
                              { label: 'Cash Advance', val: t.cash },
                              { label: 'Online Advance', val: t.online },
                              { label: 'Munshi / Broker', val: t.munshi },
                              { label: 'Commission', val: t.commission },
                              { label: 'Shortage', val: t.shortage },
                            ].filter(d => d.val > 0).map((d, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                                <span style={{ color: 'var(--text-muted)' }}>{d.label}</span>
                                <span style={{ fontWeight: 800, color: '#f59e0b' }}>{fmtRs(d.val)}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {t.partyName && (
                          <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                            Party: <strong style={{ color: 'var(--text)' }}>{t.partyName}</strong>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
