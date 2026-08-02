import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, DollarSign, Calendar, ArrowUpRight, ArrowDownRight, Download,
  RefreshCw, ChevronRight, ChevronDown, BarChart3, Truck, MapPin,
  Landmark, Printer, AlertTriangle,
} from 'lucide-react';
import ax from '../../api';
import {
  buildPnlRecords, summarisePnl, perTruck, pnlCoverage, monthOf,
} from '../../utils/pnl';
import { buildExportRows, exportToExcel, exportToPDF } from '../../utils/exportUtils';
import { archiveName } from '../../utils/archiveDoc';

const fmtRs = (val) => '₹' + Math.round(val || 0).toLocaleString('en-IN');
const fmtSigned = (val) => (val < 0 ? '-' : '') + fmtRs(Math.abs(val));

const monthLabel = (yyyyMm) => {
  if (!yyyyMm || yyyyMm === 'All') return 'All time';
  const [y, m] = yyyyMm.split('-');
  return new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1)
    .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const fmtDate = (s) => (s
  ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—');

/** The sources this sheet reads, and the label to name in the coverage strip. */
const SOURCES = [
  ['vouchers', '/vouchers', 'Vouchers'],
  ['invoices', '/invoices', 'Invoices'],
  ['payments', '/payments', 'Payments'],
  ['vehicles', '/vehicles', 'Vehicles'],
  ['cashbook', '/cashbook', 'Cashbook'],
  ['maintenance', '/maintenance', 'Maintenance'],
  ['tyres', '/tyres', 'Tyres'],
  ['tolls', '/tolls', 'Tolls'],
];

const CARD = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: '18px', padding: '18px',
};
const LABEL = {
  fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};
const TH = {
  padding: '11px 18px', textAlign: 'left', fontWeight: 800,
  color: 'var(--text-muted)', fontSize: '10.5px', textTransform: 'uppercase',
  letterSpacing: '0.04em', whiteSpace: 'nowrap',
};
const TD = { padding: '11px 18px', fontSize: '13px', color: 'var(--text-sub)' };

const GREEN = '#34d399';
const RED = '#fb7185';

export default function ProfitLossSheet() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState({});
  const [loadFailures, setLoadFailures] = useState([]);

  const [selectedMonth, setSelectedMonth] = useState(null); // null until data lands
  const [selectedVehicle, setSelectedVehicle] = useState('All');
  const [selectedLocation, setSelectedLocation] = useState('All');
  const [expanded, setExpanded] = useState(() => new Set());

  const fetchAllData = async () => {
    setRefreshing(true);
    const failures = [];
    const results = await Promise.all(SOURCES.map(async ([key, url, label]) => {
      try {
        const { data: rows } = await ax.get(url);
        return [key, Array.isArray(rows) ? rows : []];
      } catch {
        // A collection this account cannot read must not read as a genuine zero.
        failures.push(label);
        return [key, []];
      }
    }));
    setData(Object.fromEntries(results));
    setLoadFailures(failures);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { fetchAllData(); }, []);

  const records = useMemo(() => buildPnlRecords(data), [data]);

  const months = useMemo(() => {
    const s = new Set();
    records.forEach(r => { if (r.month) s.add(r.month); });
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [records]);

  // Open on the month being worked, not on every rupee ever recorded. Runs
  // once — picking "All time" afterwards has to stick.
  useEffect(() => {
    if (selectedMonth === null && months.length > 0) setSelectedMonth(months[0]);
  }, [months, selectedMonth]);

  const trucks = useMemo(() => {
    const s = new Set();
    records.forEach(r => { if (r.truckNo && r.fleet === 'own') s.add(r.truckNo); });
    return [...s].sort();
  }, [records]);

  const filtered = useMemo(() => records.filter(r => (
    (!selectedMonth || selectedMonth === 'All' || r.month === selectedMonth)
    && (selectedVehicle === 'All' || r.truckNo === selectedVehicle)
    && (selectedLocation === 'All' || r.location === selectedLocation)
  )), [records, selectedMonth, selectedVehicle, selectedLocation]);

  const summary = useMemo(() => summarisePnl(filtered), [filtered]);
  const truckRows = useMemo(() => perTruck(filtered), [filtered]);
  const coverage = useMemo(() => pnlCoverage({ ...data, loadFailures }, filtered),
    [data, loadFailures, filtered]);

  const periodText = [
    monthLabel(selectedMonth || 'All'),
    selectedLocation === 'All' ? 'all plants' : selectedLocation,
    selectedVehicle === 'All' ? 'all trucks' : selectedVehicle,
  ].join(' · ');

  // ── Monthly trend ────────────────────────────────────────────────────────
  const trend = useMemo(() => {
    const byMonth = {};
    records
      .filter(r => (selectedVehicle === 'All' || r.truckNo === selectedVehicle)
        && (selectedLocation === 'All' || r.location === selectedLocation)
        && r.kind !== 'settlement')
      .forEach(r => {
        if (!r.month) return;
        byMonth[r.month] = byMonth[r.month] || { month: r.month, income: 0, expense: 0 };
        if (r.kind === 'income') byMonth[r.month].income += r.amount;
        else byMonth[r.month].expense += r.amount;
      });
    return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [records, selectedVehicle, selectedLocation]);

  // ── GST, from invoices — the freight itself is already counted on the trip ──
  const gst = useMemo(() => {
    const invoices = (data.invoices || []).filter(inv => {
      const st = String(inv.status || '').toLowerCase();
      if (st !== 'passed' && st !== 'paid') return false;
      if (selectedMonth && selectedMonth !== 'All' && monthOf(inv.billDate) !== selectedMonth) return false;
      return true;
    });
    const outward = invoices.reduce(
      (s, inv) => s + Math.max(0, (parseFloat(inv.totalWithGST) || 0) - (parseFloat(inv.totalFreight) || 0)), 0);
    // Standard 18% inclusive on the parts, tyres and office bills that carry it.
    const inward = filtered
      .filter(r => ['Maintenance', 'Tyres', 'Office expenses'].includes(r.category))
      .reduce((s, r) => s + (r.amount * 18) / 118, 0);
    return { outward, inward, net: outward - inward, billed: invoices.length };
  }, [data.invoices, filtered, selectedMonth]);

  const toggle = (key) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // ── Export ───────────────────────────────────────────────────────────────
  const exportRows = () => buildExportRows(
    filtered.map(({ id, ...r }) => r),
    { order: ['date', 'month', 'kind', 'group', 'category', 'description', 'amount', 'truckNo', 'fleet', 'location', 'ref', 'source'] },
  );
  const fileName = archiveName('Profit and Loss', selectedLocation, selectedVehicle, selectedMonth || 'All');

  const handleExcel = () => exportToExcel(exportRows(), fileName);
  const handlePDF = () => exportToPDF(exportRows(), `Profit & Loss — ${periodText}`, null, {
    archive: { module: 'Profit & Loss', kind: 'Statements', name: fileName },
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: '12px', color: 'var(--text-muted)' }}>
        <RefreshCw size={18} className="ani-spin" /> Adding up every module…
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: '50px' }}>

      {/* ── Header and filters ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 900, color: 'var(--text)', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
            Profit &amp; Loss
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>{periodText}</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <Picker icon={<MapPin size={14} color="var(--primary)" />} value={selectedLocation} onChange={setSelectedLocation}
            options={[['All', 'All plants'], ['Kosli', 'Kosli'], ['Bahadurgarh', 'Bahadurgarh'], ['Jhajjar', 'Jhajjar'], ['Jharli', 'Jharli / JKL']]} />
          <Picker icon={<Truck size={14} color="var(--primary)" />} value={selectedVehicle} onChange={setSelectedVehicle}
            options={[['All', 'All own trucks'], ...trucks.map(t => [t, t])]} />
          <Picker icon={<Calendar size={14} color="var(--primary)" />} value={selectedMonth || 'All'} onChange={setSelectedMonth}
            options={[['All', 'All time'], ...months.map(m => [m, monthLabel(m)])]} />

          <button className="btn btn-g" onClick={fetchAllData} disabled={refreshing} style={{ padding: '9px 12px', borderRadius: '12px' }}>
            <RefreshCw size={14} className={refreshing ? 'ani-spin' : ''} />
          </button>
          <button className="btn btn-g" onClick={handlePDF} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 14px', borderRadius: '12px' }}>
            <Printer size={14} /> PDF
          </button>
          <button className="btn btn-p" onClick={handleExcel} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 14px', borderRadius: '12px' }}>
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      {/* ── The bottom line, first ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '22px' }}>
        <Stat label="Income" value={fmtRs(summary.income)} hint="Own-fleet freight, commission and munshi kept on hired trucks."
          icon={<ArrowUpRight size={16} />} tint={GREEN} />
        <Stat label="Expenses" value={fmtRs(summary.expense)} hint="Diesel, salary, EMI, tyres, workshop, tolls and overheads."
          icon={<ArrowDownRight size={16} />} tint={RED} />
        <Stat label="Net profit" value={fmtSigned(summary.net)} hint={summary.net >= 0 ? 'Kept after everything above.' : 'The period cost more than it earned.'}
          icon={<DollarSign size={16} />} tint={summary.net >= 0 ? GREEN : RED} big />
        <Stat label="Margin" value={`${summary.margin.toFixed(1)}%`} hint="Of every rupee earned, this much stays."
          icon={<TrendingUp size={16} />} tint="#8b5cf6" />
      </div>

      {/* ── What the sheet could not see ── */}
      {coverage.length > 0 && (
        <div style={{ ...CARD, marginBottom: '22px', borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <AlertTriangle size={15} color="#f59e0b" />
            <span style={{ ...LABEL, color: '#f59e0b' }}>Worth knowing about these numbers</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {coverage.map((note, i) => (
              <li key={i} style={{ fontSize: '12.5px', color: 'var(--text-sub)', lineHeight: 1.5 }}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Where the money went ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', marginBottom: '22px' }}>
        <Waterfall summary={summary} />
        <Trend trend={trend} />
      </div>

      {/* ── The statement ── */}
      <div style={{ ...CARD, padding: 0, overflow: 'hidden', marginBottom: '22px' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>The statement</h3>
          <p style={{ margin: '3px 0 0', fontSize: '11.5px', color: 'var(--text-muted)' }}>
            Click any line to see the entries behind it.
          </p>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {summary.groups.map(group => {
                const cats = Object.entries(group.categories).sort((a, b) => b[1] - a[1]);
                if (!cats.length) return null;
                return (
                  <React.Fragment key={group.key}>
                    <tr style={{ background: 'var(--bg-th)', borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...TD, fontWeight: 900, color: group.kind === 'income' ? GREEN : RED, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {group.label}
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 900, color: 'var(--text)' }}>
                        {fmtRs(group.total)}
                      </td>
                    </tr>
                    {cats.map(([category, total]) => {
                      const key = `${group.key}:${category}`;
                      const open = expanded.has(key);
                      const rows = open
                        ? filtered.filter(r => r.group === group.key && r.category === category)
                        : [];
                      return (
                        <React.Fragment key={key}>
                          <tr onClick={() => toggle(key)}
                            style={{ borderBottom: '1px solid var(--border-row)', cursor: 'pointer', background: open ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                            <td style={{ ...TD, paddingLeft: '30px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                                {open ? <ChevronDown size={13} color="var(--text-muted)" /> : <ChevronRight size={13} color="var(--text-muted)" />}
                                {category}
                              </span>
                            </td>
                            <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{fmtRs(total)}</td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={2} style={{ padding: 0, background: 'rgba(0,0,0,0.12)' }}>
                                <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                      <tr>
                                        <th style={TH}>Date</th>
                                        <th style={TH}>Truck</th>
                                        <th style={TH}>Detail</th>
                                        <th style={TH}>Plant</th>
                                        <th style={TH}>Ref</th>
                                        <th style={{ ...TH, textAlign: 'right' }}>Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rows.map(r => (
                                        <tr key={r.id} style={{ borderTop: '1px solid var(--border-row)' }}>
                                          <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                                          <td style={{ ...TD, fontWeight: 700, fontSize: '11.5px' }}>{r.truckNo || 'Firm'}</td>
                                          <td style={{ ...TD, whiteSpace: 'normal' }}>{r.description}</td>
                                          <td style={{ ...TD, fontSize: '11.5px' }}>{r.location}</td>
                                          <td style={{ ...TD, fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{r.ref}</td>
                                          <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: group.kind === 'income' ? GREEN : RED }}>
                                            {fmtRs(r.amount)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}

              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-th)' }}>
                <td style={{ ...TD, fontWeight: 900, color: 'var(--text)', fontSize: '14px' }}>Net profit</td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 900, fontSize: '16px', color: summary.net >= 0 ? GREEN : RED }}>
                  {fmtSigned(summary.net)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {summary.settlements > 0 && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <span>
              Pump, tyre and workshop settlements — <strong style={{ color: 'var(--text-sub)' }}>already counted above</strong> as trip and workshop costs, so they are not added again.
            </span>
            <strong style={{ color: 'var(--text-sub)' }}>{fmtRs(summary.settlements)}</strong>
          </div>
        )}
      </div>

      {/* ── Profit per truck ── */}
      {truckRows.length > 0 && (
        <div style={{ ...CARD, padding: 0, overflow: 'hidden', marginBottom: '22px' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>Profit per truck</h3>
            <p style={{ margin: '3px 0 0', fontSize: '11.5px', color: 'var(--text-muted)' }}>
              Own fleet only. Office and firm-wide costs are not split across trucks.
            </p>
          </div>
          <div className="tbl-wrap" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-th)' }}>
                  <th style={TH}>Truck</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Freight</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Diesel</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Advances</th>
                  <th style={{ ...TH, textAlign: 'right' }}>EMI</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Tyres</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Workshop</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Tolls</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Net</th>
                </tr>
              </thead>
              <tbody>
                {truckRows.map((row, i) => (
                  <tr key={row.truckNo} style={{ borderTop: '1px solid var(--border-row)', background: i % 2 ? 'transparent' : 'rgba(255,255,255,0.012)' }}>
                    <td style={{ ...TD, fontWeight: 800, color: 'var(--text)' }}>{row.truckNo}</td>
                    <td style={{ ...TD, textAlign: 'right', color: GREEN, fontWeight: 700 }}>{fmtRs(row.categories['Own-fleet freight'] || 0)}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{fmtRs(row.categories.Diesel || 0)}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{fmtRs(row.categories['Driver trip advances'] || 0)}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{fmtRs(row.categories['Vehicle loan EMI'] || 0)}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{fmtRs(row.categories.Tyres || 0)}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{fmtRs(row.categories.Maintenance || 0)}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{fmtRs(row.categories.Tolls || 0)}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 900, color: row.net >= 0 ? GREEN : RED }}>{fmtSigned(row.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── GST ── */}
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Landmark size={16} color="var(--primary)" />
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>GST ledger</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px' }}>
          <Mini label="Outward (collected)" value={fmtRs(gst.outward)} tint={GREEN} hint={`From ${gst.billed} passed bill${gst.billed === 1 ? '' : 's'}.`} />
          <Mini label="Inward (credit)" value={fmtRs(gst.inward)} tint={RED} hint="Estimated at 18% inclusive on parts, tyres and office bills." />
          <Mini label="Net payable" value={fmtSigned(gst.net)} tint={gst.net >= 0 ? '#f59e0b' : GREEN}
            hint={gst.net >= 0 ? 'Due to the department.' : 'Credit to carry forward.'} />
        </div>
        <p style={{ margin: '14px 0 0', fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Billed freight is not counted again as income here — a trip earns on the day it runs, and the
          invoice only decides when the tax on it falls due.
        </p>
      </div>
    </div>
  );
}

/* ── Small pieces ─────────────────────────────────────────────────────────── */

function Picker({ icon, value, onChange, options }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', background: 'var(--bg-card)', padding: '6px 11px', borderRadius: '12px', border: '1px solid var(--border)' }}>
      {icon}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontWeight: 800, fontSize: '13px', padding: '2px 6px', cursor: 'pointer', outline: 'none', maxWidth: '170px' }}>
        {options.map(([val, label]) => (
          <option key={val} value={val} style={{ background: '#1e293b' }}>{label}</option>
        ))}
      </select>
    </div>
  );
}

function Stat({ label, value, hint, icon, tint, big }) {
  return (
    <div style={{ ...CARD, borderRadius: '20px', padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={LABEL}>{label}</span>
        <div style={{ background: `${tint}1a`, color: tint, padding: '4px', borderRadius: '8px', display: 'flex' }}>{icon}</div>
      </div>
      <div style={{ fontSize: big ? '30px' : '26px', fontWeight: 900, color: big ? tint : 'var(--text)', marginBottom: '5px', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{hint}</div>
    </div>
  );
}

function Mini({ label, value, tint, hint }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.012)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px' }}>
      <div style={{ ...LABEL, marginBottom: '6px' }}>{label}</div>
      <div style={{ fontSize: '19px', fontWeight: 900, color: tint }}>{value}</div>
      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4 }}>{hint}</div>
    </div>
  );
}

/**
 * Income at the left, each cost group stepping it down, net at the right.
 * A donut says which cost is biggest; this says what is left afterwards, which
 * is the question an owner is actually asking.
 */
function Waterfall({ summary }) {
  const steps = useMemo(() => {
    const out = [{ label: 'Income', delta: summary.income, tint: GREEN }];
    summary.groups
      .filter(g => g.kind === 'expense' && g.total > 0)
      .forEach(g => out.push({ label: g.label, delta: -g.total, tint: RED }));
    out.push({ label: 'Net', delta: null, tint: summary.net >= 0 ? GREEN : '#f59e0b' });

    let running = 0;
    return out.map(s => {
      if (s.delta === null) return { ...s, from: 0, to: summary.net, total: true, value: summary.net };
      const from = running;
      running += s.delta;
      return { ...s, from, to: running, value: s.delta };
    });
  }, [summary]);

  const hi = Math.max(summary.income, 1);
  const lo = Math.min(0, summary.net);
  const span = hi - lo || 1;
  const H = 190;
  const y = (v) => ((hi - v) / span) * H;

  if (summary.income === 0 && summary.expense === 0) {
    return (
      <div style={{ ...CARD, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '260px', color: 'var(--text-muted)', fontSize: '12.5px' }}>
        Nothing recorded for this period.
      </div>
    );
  }

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <BarChart3 size={15} color="var(--primary)" />
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>Where the money went</h3>
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: '6px', height: `${H}px` }}>
        {steps.map((s, i) => {
          const top = Math.min(y(s.from), y(s.to));
          const height = Math.max(2, Math.abs(y(s.from) - y(s.to)));
          return (
            <div key={i} style={{ flex: 1, position: 'relative', minWidth: 0 }} title={`${s.label}: ${fmtSigned(s.value)}`}>
              <motion.div
                initial={{ opacity: 0, scaleY: 0.4 }}
                animate={{ opacity: 1, scaleY: 1 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                style={{
                  position: 'absolute', left: 0, right: 0, top: `${top}px`, height: `${height}px`,
                  background: s.tint, opacity: s.total ? 1 : 0.75, borderRadius: '4px',
                  transformOrigin: s.value >= 0 ? 'bottom' : 'top',
                }}
              />
              <div style={{ position: 'absolute', top: `${Math.max(0, top - 17)}px`, left: 0, right: 0, textAlign: 'center', fontSize: '10px', fontWeight: 800, color: s.tint, whiteSpace: 'nowrap' }}>
                {fmtSigned(s.value)}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
        {steps.map((s, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: '9.5px', fontWeight: 700, color: 'var(--text-muted)', lineHeight: 1.25 }}>
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function Trend({ trend }) {
  const max = Math.max(1, ...trend.map(t => Math.max(t.income, t.expense)));
  return (
    <div style={CARD}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={15} color="var(--primary)" />
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}>Month by month</h3>
        </div>
        <div style={{ display: 'flex', gap: '12px', fontSize: '10.5px', fontWeight: 800 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: GREEN }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: GREEN }} /> In
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: RED }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: RED }} /> Out
          </span>
        </div>
      </div>

      {trend.length === 0 ? (
        <div style={{ height: '190px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12.5px' }}>
          No monthly history yet.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '190px' }}>
            {trend.map(t => (
              <div key={t.month} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '2px', height: '100%', minWidth: 0 }}
                title={`${monthLabel(t.month)} — in ${fmtRs(t.income)}, out ${fmtRs(t.expense)}`}>
                <div style={{ flex: 1, height: `${(t.income / max) * 100}%`, background: GREEN, opacity: 0.8, borderRadius: '3px 3px 0 0', minHeight: '2px' }} />
                <div style={{ flex: 1, height: `${(t.expense / max) * 100}%`, background: RED, opacity: 0.8, borderRadius: '3px 3px 0 0', minHeight: '2px' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            {trend.map(t => (
              <div key={t.month} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: '9.5px', fontWeight: 700, color: 'var(--text-muted)' }}>
                {monthLabel(t.month).split(' ')[0].slice(0, 3)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
