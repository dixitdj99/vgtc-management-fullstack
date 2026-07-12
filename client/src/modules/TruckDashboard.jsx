import React, { useState, useEffect, useMemo } from 'react';
import ax from '../api';
import { motion } from 'framer-motion';
import {
  Truck, TrendingDown, TrendingUp, AlertCircle, CheckCircle2, Clock,
  ChevronUp, ChevronDown, Download, Printer, Search, X
} from 'lucide-react';
import { exportToExcel } from '../utils/exportUtils';
import ColumnFilter from '../components/ColumnFilter';

const TH = {
  padding: '8px 10px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.07em', background: 'var(--bg-th)',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
};
const TD = { padding: '8px 10px', fontSize: '12.5px', color: 'var(--text-sub)', verticalAlign: 'middle', whiteSpace: 'nowrap' };
const TDF = { ...TD, fontWeight: 800, color: 'var(--text)', background: 'var(--bg-tf)', borderTop: '2px solid var(--border)' };

const fmtRs = n => 'Rs.' + Math.round(n).toLocaleString('en-IN');
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function calcNet(v) {
  const gross = v.deliveries?.length > 0
    ? v.deliveries.reduce((s, d) => s + (parseFloat(d.weight)||0) * (parseFloat(d.rate)||0), 0)
    : (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);
  const diesel = v.advanceDiesel === 'FULL' ? 4000 : (parseFloat(v.advanceDiesel) || 0);
  const cash = parseFloat(v.advanceCash) || 0;
  const online = parseFloat(v.advanceOnline) || 0;
  const weight = parseFloat(v.weight) || 0;
  const munshi = parseFloat(v.munshi) || (weight > 0 ? (weight < 18 ? 50 : 100) : 0);
  const commission = parseFloat(v.commission) || 0;
  const shortage = parseFloat(v.shortage) || 0;
  const tyrePuncture = parseFloat(v.tyrePuncture) || 0;
  const tyreGreasingAir = (parseFloat(v.tyreGreasing) || 0) + (parseFloat(v.tyreAir) || 0) + (parseFloat(v.tyreGreasingAir) || 0);
  const extraCash = parseFloat(v.extraCash) || 0;
  return gross - diesel - cash - online - munshi - commission - shortage - tyrePuncture - tyreGreasingAir - extraCash;
}

function doPrintDashboard(rows, orgName) {
  if (!rows.length) return;
  const tbody = rows.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? '#f9f9f9' : '#fff'}">
      <td>${i + 1}</td>
      <td><b>${r.truckNo}</b></td>
      <td>${r.ownerName || '—'}</td>
      <td style="text-align:right">${r.trips}</td>
      <td style="text-align:right">${r.totalWeight.toFixed(2)}</td>
      <td style="text-align:right">Rs.${Math.round(r.totalGross).toLocaleString()}</td>
      <td style="text-align:right">Rs.${Math.round(r.totalNet).toLocaleString()}</td>
      <td style="text-align:right">Rs.${Math.round(r.totalDeductions).toLocaleString()}</td>
      <td style="text-align:center;color:${r.avgMargin < 20 ? '#16a34a' : r.avgMargin < 40 ? '#b45309' : '#dc2626'}">${r.avgMargin.toFixed(1)}%</td>
      <td style="text-align:right;font-weight:800;color:${r.outstanding > 0 ? '#b45309' : '#16a34a'}">${r.outstanding > 0 ? 'Rs.' + Math.round(r.outstanding).toLocaleString() : '✓ Cleared'}</td>
      <td>${r.lastTrip || '—'}</td>
    </tr>`).join('');

  const totalGross = rows.reduce((s, r) => s + r.totalGross, 0);
  const totalNet = rows.reduce((s, r) => s + r.totalNet, 0);
  const totalOut = rows.reduce((s, r) => s + r.outstanding, 0);
  const totalTrips = rows.reduce((s, r) => s + r.trips, 0);

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Truck Performance Dashboard</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;padding:10mm}
  h1{font-size:16px;font-weight:900;text-align:center}
  .sub{text-align:center;font-size:10px;color:#666;margin:3px 0 12px}
  table{width:100%;border-collapse:collapse}th{padding:6px 8px;background:#333;color:#fff;font-size:10px;text-align:left}
  td{padding:5px 8px;border-bottom:1px solid #eee}
  .tot{background:#eee;font-weight:bold}
  @media print{body{padding:0}}</style></head><body>
  <h1>${orgName}</h1>
  <div class="sub">Truck Performance Dashboard — Printed: ${new Date().toLocaleDateString('en-IN')}</div>
  <table><thead><tr>
    <th>#</th><th>Truck No.</th><th>Owner</th><th>Trips</th><th>Weight (MT)</th>
    <th>Gross (Rs.)</th><th>Net (Rs.)</th><th>Deductions</th><th>Margin %</th><th>Outstanding</th><th>Last Trip</th>
  </tr></thead>
  <tbody>${tbody}</tbody>
  <tfoot><tr class="tot">
    <td colspan="3">TOTALS (${rows.length} trucks)</td>
    <td style="text-align:right">${totalTrips}</td>
    <td></td>
    <td style="text-align:right">Rs.${Math.round(totalGross).toLocaleString()}</td>
    <td style="text-align:right">Rs.${Math.round(totalNet).toLocaleString()}</td>
    <td></td><td></td>
    <td style="text-align:right;font-weight:800;color:${totalOut > 0 ? '#b45309' : '#16a34a'}">${totalOut > 0 ? 'Rs.' + Math.round(totalOut).toLocaleString() : '✓ All Cleared'}</td>
    <td></td>
  </tr></tfoot></table>
  <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
  </body></html>`;
  const w = window.open('', '_blank', 'width=1100,height=700');
  w.document.write(html); w.document.close();
}

export default function TruckDashboard({ role, permissions }) {
  const [vouchers, setVouchers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('outstanding');
  const [sortDir, setSortDir] = useState('desc');
  const [filters, setFilters] = useState({});
  const handleFilterChange = (key, val) => setFilters(f => ({ ...f, [key]: val }));

  useEffect(() => {
    Promise.all([
      ax.get('/vouchers').catch(() => ({ data: [] })),
      ax.get('/vehicles').catch(() => ({ data: [] })),
    ]).then(([vRes, vehRes]) => {
      setVouchers(vRes.data || []);
      setVehicles(vehRes.data || []);
    }).finally(() => setLoading(false));
  }, []);

  const truckStats = useMemo(() => {
    const map = {};
    vouchers.forEach(v => {
      const t = v.truckNo || 'Unknown';
      if (!map[t]) map[t] = { truckNo: t, vouchers: [] };
      map[t].vouchers.push(v);
    });

    return Object.values(map).map(({ truckNo, vouchers: vList }) => {
      const veh = (vehicles || []).find(vh => vh.truckNo === truckNo);
      const trips = vList.length;
      const totalWeight = vList.reduce((s, v) => {
        if (v.deliveries?.length > 0) return s + v.deliveries.reduce((ds, d) => ds + (parseFloat(d.weight)||0), 0);
        return s + (parseFloat(v.weight) || 0);
      }, 0);
      const totalGross = vList.reduce((s, v) => {
        if (v.deliveries?.length > 0) return s + v.deliveries.reduce((ds, d) => ds + (parseFloat(d.weight)||0)*(parseFloat(d.rate)||0), 0);
        return s + (parseFloat(v.weight) || 0) * (parseFloat(v.rate) || 0);
      }, 0);
      const totalNet = vList.reduce((s, v) => s + calcNet(v), 0);
      const totalDeductions = totalGross - totalNet;
      const avgMargin = totalGross > 0 ? (totalDeductions / totalGross) * 100 : 0;
      const totalPaid = vList.reduce((s, v) => s + (parseFloat(v.paidBalance) || 0), 0);
      const outstanding = Math.max(0, totalNet - totalPaid);
      const lastTrip = vList.reduce((latest, v) => (!latest || (v.date || '') > latest ? (v.date || '') : latest), '');
      const daysSinceLast = lastTrip ? Math.floor((Date.now() - new Date(lastTrip)) / 86400000) : 999;

      // Oldest overdue trip
      const maxOverdueDays = vList.reduce((m, v) => {
        const n = calcNet(v), p = parseFloat(v.paidBalance) || 0;
        return Math.max(0, n - p) > 0 ? Math.max(m, Math.floor((Date.now() - new Date(v.date || 0)) / 86400000)) : m;
      }, 0);

      return {
        truckNo,
        ownerName: veh?.ownerName || '—',
        gpsType: veh?.gpsType || 'none',
        trips,
        totalWeight,
        totalGross,
        totalNet,
        totalDeductions,
        avgMargin,
        totalPaid,
        outstanding,
        lastTrip,
        daysSinceLast,
        maxOverdueDays,
        status: outstanding <= 0 ? 'Cleared' : maxOverdueDays > 30 ? 'Overdue' : 'Pending',
      };
    });
  }, [vouchers, vehicles]);

  const sorted = useMemo(() => {
    let list = [...truckStats];

    // search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r => r.truckNo.toLowerCase().includes(q) || r.ownerName.toLowerCase().includes(q));
    }

    // column filters
    Object.keys(filters).forEach(key => {
      const vals = filters[key];
      if (vals && vals.length > 0) list = list.filter(r => vals.includes(String(r[key] ?? '')));
    });

    list.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [truckStats, search, filters, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ k }) => sortKey !== k ? null : sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />;

  const totals = useMemo(() => ({
    trips: sorted.reduce((s, r) => s + r.trips, 0),
    weight: sorted.reduce((s, r) => s + r.totalWeight, 0),
    gross: sorted.reduce((s, r) => s + r.totalGross, 0),
    net: sorted.reduce((s, r) => s + r.totalNet, 0),
    outstanding: sorted.reduce((s, r) => s + r.outstanding, 0),
  }), [sorted]);

  const overdueCount = sorted.filter(r => r.maxOverdueDays > 30).length;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px', color: 'var(--text-muted)' }}>
      Loading truck performance data...
    </div>
  );

  return (
    <div>
      <div className="page-hd">
        <div>
          <h1><Truck size={20} color="#14b8a6" /> Truck Performance Dashboard</h1>
          <p>All-time stats per truck across all voucher types</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="fi" placeholder="Search truck / owner…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '28px', width: '200px', height: '32px', fontSize: '12px' }} />
            {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={12} /></button>}
          </div>
          <button className="btn btn-g btn-sm" onClick={() => doPrintDashboard(sorted, 'VIKAS GOODS TRANSPORT CO.')}><Printer size={13} /> Print</button>
          <button className="btn btn-g btn-sm" onClick={() => exportToExcel(sorted.map(r => ({
            'Truck No.': r.truckNo, 'Owner': r.ownerName, 'Trips': r.trips,
            'Total Weight (MT)': r.totalWeight.toFixed(2), 'Total Gross (Rs.)': Math.round(r.totalGross),
            'Total Net (Rs.)': Math.round(r.totalNet), 'Total Deductions': Math.round(r.totalDeductions),
            'Avg Margin %': r.avgMargin.toFixed(1), 'Outstanding (Rs.)': Math.round(r.outstanding),
            'Status': r.status, 'Last Trip': r.lastTrip
          })), 'Truck_Dashboard')}><Download size={13} /> Excel</button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {[
          { label: 'Total Trucks', val: sorted.length, color: 'var(--primary)' },
          { label: 'Total Trips', val: totals.trips, color: 'var(--text)' },
          { label: 'Total Gross', val: fmtRs(totals.gross), color: 'var(--accent)' },
          { label: 'Total Outstanding', val: fmtRs(totals.outstanding), color: totals.outstanding > 0 ? 'var(--warn)' : 'var(--accent)' },
          ...(overdueCount > 0 ? [{ label: 'Overdue (30d+)', val: overdueCount + ' trucks', color: '#f43f5e' }] : []),
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '11px 18px', display: 'inline-flex', flexDirection: 'column', gap: '4px', minWidth: '130px' }}>
            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
            <span style={{ fontSize: '17px', fontWeight: 900, color, lineHeight: 1 }}>{val}</span>
          </div>
        ))}
      </div>

      {overdueCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: 'rgba(244,63,94,0.07)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '10px', marginBottom: '14px' }}>
          <AlertCircle size={15} color="#f43f5e" />
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#f43f5e' }}>
            {overdueCount} truck{overdueCount > 1 ? 's have' : ' has'} outstanding dues older than 30 days
          </span>
        </div>
      )}

      <div className="card">
        <div className="tbl-wrap">
          <table style={{ minWidth: '1200px', width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr>
                <th style={TH}>#</th>
                <th style={TH}><ColumnFilter label="Truck No." colKey="truckNo" data={sorted} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                <th style={TH}><ColumnFilter label="Owner" colKey="ownerName" data={sorted} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                <th style={{ ...TH, cursor: 'pointer' }} onClick={() => toggleSort('trips')}>Trips <SortIcon k="trips" /></th>
                <th style={{ ...TH, cursor: 'pointer' }} onClick={() => toggleSort('totalWeight')}>Weight (MT) <SortIcon k="totalWeight" /></th>
                <th style={{ ...TH, cursor: 'pointer' }} onClick={() => toggleSort('totalGross')}>Total Gross <SortIcon k="totalGross" /></th>
                <th style={{ ...TH, cursor: 'pointer' }} onClick={() => toggleSort('totalNet')}>Total Net <SortIcon k="totalNet" /></th>
                <th style={{ ...TH, cursor: 'pointer' }} onClick={() => toggleSort('avgMargin')}>Avg Margin % <SortIcon k="avgMargin" /></th>
                <th style={{ ...TH, cursor: 'pointer' }} onClick={() => toggleSort('outstanding')}>Outstanding <SortIcon k="outstanding" /></th>
                <th style={TH}><ColumnFilter label="Status" colKey="status" data={sorted} activeFilters={filters} onFilterChange={handleFilterChange} /></th>
                <th style={{ ...TH, cursor: 'pointer' }} onClick={() => toggleSort('daysSinceLast')}>Last Trip <SortIcon k="daysSinceLast" /></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={11} style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>No data found</td></tr>
              )}
              {sorted.map((r, i) => {
                const overdueBorder = r.maxOverdueDays > 30 ? '3px solid #f43f5e' : r.maxOverdueDays > 15 ? '3px solid #f59e0b' : '';
                return (
                  <motion.tr key={r.truckNo} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }}
                    style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)', borderLeft: overdueBorder, cursor: 'pointer', transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-row-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)'}
                    onClick={() => window.dispatchEvent(new CustomEvent('nav-module', { detail: { module: 'balance_dump', search: r.truckNo } }))}>
                    <td style={{ ...TD, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                    <td style={TD}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(20,184,166,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Truck size={13} color="#14b8a6" />
                        </div>
                        <span style={{ fontWeight: 800, color: 'var(--text)', fontSize: '13px' }}>{r.truckNo}</span>
                      </div>
                    </td>
                    <td style={{ ...TD, color: 'var(--text)' }}>{r.ownerName}</td>
                    <td style={{ ...TD, textAlign: 'center', fontWeight: 700 }}>{r.trips}</td>
                    <td style={{ ...TD, textAlign: 'right' }}>{r.totalWeight.toFixed(2)}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>{fmtRs(r.totalGross)}</td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{fmtRs(r.totalNet)}</td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 800,
                        background: r.avgMargin < 20 ? 'rgba(16,185,129,0.1)' : r.avgMargin < 40 ? 'rgba(245,158,11,0.1)' : 'rgba(244,63,94,0.1)',
                        color: r.avgMargin < 20 ? '#10b981' : r.avgMargin < 40 ? '#f59e0b' : '#f43f5e'
                      }}>{r.avgMargin.toFixed(1)}%</span>
                    </td>
                    <td style={{ ...TD, textAlign: 'right', fontWeight: 800, fontSize: '13px', color: r.outstanding > 0 ? 'var(--warn)' : 'var(--accent)' }}>
                      {r.outstanding > 0 ? fmtRs(r.outstanding) : '—'}
                    </td>
                    <td style={{ ...TD, textAlign: 'center' }}>
                      {r.outstanding <= 0
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontSize: '11px', fontWeight: 700 }}><CheckCircle2 size={10} /> Cleared</span>
                        : r.maxOverdueDays > 30
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(244,63,94,0.1)', color: '#f43f5e', fontSize: '11px', fontWeight: 700 }}><AlertCircle size={10} /> Overdue</span>
                          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)', color: 'var(--warn)', fontSize: '11px', fontWeight: 700 }}>Pending</span>}
                    </td>
                    <td style={TD}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span>{fmtDate(r.lastTrip)}</span>
                        {r.daysSinceLast < 999 && <span style={{ fontSize: '10px', color: r.daysSinceLast > 30 ? '#f43f5e' : 'var(--text-muted)', fontWeight: 600 }}>{r.daysSinceLast}d ago</span>}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ ...TDF, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>Totals ({sorted.length} trucks)</td>
                <td style={{ ...TDF, textAlign: 'center' }}>{totals.trips}</td>
                <td style={{ ...TDF, textAlign: 'right' }}>{totals.weight.toFixed(2)}</td>
                <td style={{ ...TDF, textAlign: 'right' }}>{fmtRs(totals.gross)}</td>
                <td style={{ ...TDF, textAlign: 'right', color: 'var(--accent)' }}>{fmtRs(totals.net)}</td>
                <td style={TDF}></td>
                <td style={{ ...TDF, textAlign: 'right', color: totals.outstanding > 0 ? 'var(--warn)' : 'var(--accent)', fontSize: '13px' }}>{fmtRs(totals.outstanding)}</td>
                <td colSpan={2} style={TDF}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
