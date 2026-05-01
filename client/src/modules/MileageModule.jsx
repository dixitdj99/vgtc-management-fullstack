import React, { useState, useEffect, useMemo } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Gauge, Truck, ArrowLeft, TrendingUp, Fuel, MapPin, Calendar,
    ChevronRight, AlertCircle, Loader2, Navigation, BarChart3
} from 'lucide-react';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 20;

const DIESEL_PRICE_PER_LITRE = 90; // estimated ₹ per litre for mileage calculation

function getMileageColor(kmPerL) {
    if (!kmPerL || kmPerL <= 0) return 'var(--text-muted)';
    if (kmPerL >= 4) return '#10b981'; // green — good
    if (kmPerL >= 2.5) return '#f59e0b'; // yellow — average
    return '#f43f5e'; // red — poor
}

function StatCard({ icon: Icon, label, value, sub, color }) {
    return (
        <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px',
            padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <div style={{ background: `${color}18`, padding: '6px', borderRadius: '8px' }}>
                    <Icon size={15} color={color} />
                </div>
                <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text)' }}>{value}</div>
            {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{sub}</div>}
        </div>
    );
}

/* ── Per-Vehicle Detail View ── */
function VehicleDetail({ truckNo, onBack }) {
    const [trips, setTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        ax.get(`/mileage/vehicle/${encodeURIComponent(truckNo)}`)
            .then(r => setTrips(r.data))
            .catch(() => setTrips([]))
            .finally(() => setLoading(false));
    }, [truckNo]);

    const mileageTrips = useMemo(() => trips.filter(t => t.startKm && t.endKm), [trips]);

    const stats = useMemo(() => {
        const totalKm = mileageTrips.reduce((s, t) => s + (parseFloat(t.endKm) - parseFloat(t.startKm)), 0);
        const totalDieselRs = mileageTrips.reduce((s, t) => {
            const d = parseFloat(t.advanceDiesel);
            return s + (isNaN(d) ? 0 : d);
        }, 0);
        const totalLitres = totalDieselRs / DIESEL_PRICE_PER_LITRE;
        const avgKmPerL = totalLitres > 0 ? (totalKm / totalLitres) : 0;
        return { totalKm: totalKm.toFixed(0), totalDieselRs, avgKmPerL: avgKmPerL.toFixed(2), mileageTripCount: mileageTrips.length };
    }, [mileageTrips]);

    const paginatedTrips = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return trips.slice(start, start + PAGE_SIZE);
    }, [trips, currentPage]);

    if (loading) return (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Loader2 size={24} className="spin" style={{ opacity: 0.5 }} />
            <div style={{ marginTop: '10px', fontSize: '12px', fontWeight: 700 }}>Loading trip data...</div>
        </div>
    );

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            {/* Back + Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <button className="btn btn-g btn-sm" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ArrowLeft size={14} /> All Vehicles
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1', padding: '8px', borderRadius: '10px' }}>
                        <Truck size={18} />
                    </div>
                    <div>
                        <div style={{ fontSize: '18px', fontWeight: 900, fontFamily: 'monospace', color: 'var(--text)' }}>{truckNo}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>{trips.length} total trips · {stats.mileageTripCount} with KM data</div>
                    </div>
                </div>
            </div>

            {/* Stats */}
            {mileageTrips.length > 0 ? (
                <>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                        <StatCard icon={Navigation} label="Total Distance" value={`${Number(stats.totalKm).toLocaleString()} km`} sub={`Across ${stats.mileageTripCount} tracked trips`} color="#6366f1" />
                        <StatCard icon={Fuel} label="Total Diesel Advance" value={`₹${stats.totalDieselRs.toLocaleString()}`} sub={`≈ ${(stats.totalDieselRs / DIESEL_PRICE_PER_LITRE).toFixed(0)} litres @ ₹${DIESEL_PRICE_PER_LITRE}/L`} color="#3b82f6" />
                        <StatCard
                            icon={Gauge}
                            label="Avg Mileage"
                            value={`${stats.avgKmPerL} km/L`}
                            sub={parseFloat(stats.avgKmPerL) >= 4 ? '✅ Good mileage' : parseFloat(stats.avgKmPerL) >= 2.5 ? '⚠️ Average mileage' : '🔴 Poor mileage'}
                            color={getMileageColor(parseFloat(stats.avgKmPerL))}
                        />
                    </div>
                </>
            ) : (
                <div style={{ padding: '24px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '12px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <AlertCircle size={16} color="#f59e0b" />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b' }}>No KM data yet. Add Start KM & End KM while creating Dump vouchers to enable mileage tracking.</span>
                </div>
            )}

            {/* Trip Table */}
            <div className="card">
                <div className="card-header">
                    <div className="card-title-block">
                        <div className="card-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}><BarChart3 size={17} /></div>
                        <div className="card-title-text">
                            <h3>Trip History</h3>
                            <p>{trips.length} trips total</p>
                        </div>
                    </div>
                </div>
                <div className="tbl-wrap">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-th)' }}>
                                {['LR #', 'Date', 'Destination', 'Start KM', 'End KM', 'Distance', 'Diesel Adv (₹)', 'Pump', 'Mileage'].map(h => (
                                    <th key={h} style={{ padding: '9px 13px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {trips.length === 0 ? (
                                <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>No trips found</td></tr>
                            ) : paginatedTrips.map((t, i) => {
                                const dist = (t.startKm && t.endKm) ? parseFloat(t.endKm) - parseFloat(t.startKm) : null;
                                const dieselRs = parseFloat(t.advanceDiesel) || 0;
                                const litres = dieselRs / DIESEL_PRICE_PER_LITRE;
                                const kmPerL = (dist && litres > 0) ? dist / litres : null;
                                const mColor = getMileageColor(kmPerL);
                                return (
                                    <tr key={t.id}
                                        style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-row-hover)'}
                                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)'}
                                    >
                                        <td style={{ padding: '9px 13px', borderBottom: '1px solid var(--border-row)', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>#{t.lrNo}</td>
                                        <td style={{ padding: '9px 13px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-sub)', whiteSpace: 'nowrap' }}>{t.date}</td>
                                        <td style={{ padding: '9px 13px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-sub)' }}>{t.destination || '—'}</td>
                                        <td style={{ padding: '9px 13px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-sub)', fontFamily: 'monospace' }}>{t.startKm || '—'}</td>
                                        <td style={{ padding: '9px 13px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-sub)', fontFamily: 'monospace' }}>{t.endKm || '—'}</td>
                                        <td style={{ padding: '9px 13px', borderBottom: '1px solid var(--border-row)', fontWeight: 800, color: dist ? '#6366f1' : 'var(--text-muted)' }}>
                                            {dist != null ? `${dist.toFixed(0)} km` : '—'}
                                        </td>
                                        <td style={{ padding: '9px 13px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-sub)' }}>
                                            {dieselRs > 0 ? `₹${dieselRs.toLocaleString()}` : t.isFullTank ? 'FULL TANK' : '—'}
                                        </td>
                                        <td style={{ padding: '9px 13px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-sub)', fontSize: '11px' }}>{t.pump || '—'}</td>
                                        <td style={{ padding: '9px 13px', borderBottom: '1px solid var(--border-row)' }}>
                                            {kmPerL != null ? (
                                                <span style={{ fontWeight: 800, color: mColor, background: `${mColor}15`, padding: '2px 8px', borderRadius: '6px', fontSize: '11px' }}>
                                                    {kmPerL.toFixed(2)} km/L
                                                </span>
                                            ) : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <Pagination 
                    currentPage={currentPage}
                    totalItems={trips.length}
                    pageSize={PAGE_SIZE}
                    onPageChange={setCurrentPage}
                />
            </div>
        </motion.div>
    );
}

/* ── Vehicle Selector Grid ── */
export default function MileageModule() {
    const [vehicles, setVehicles] = useState([]);
    const [summaries, setSummaries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [search, setSearch] = useState('');

    useEffect(() => {
        Promise.all([
            ax.get('/vehicles'),
            ax.get('/mileage/all-vehicles'),
        ]).then(([vRes, mRes]) => {
            // Only track VGTC (Vikas Goods Transport) vehicles
            const vgtcVehicles = vRes.data.filter(v =>
                (v.ownerName || '').toLowerCase().includes('vikas')
            );
            setVehicles(vgtcVehicles);
            setSummaries(mRes.data);
        }).catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const summaryMap = useMemo(() => {
        const m = {};
        summaries.forEach(s => { m[s.truckNo] = s; });
        return m;
    }, [summaries]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return vehicles.filter(v =>
            `${v.truckNo} ${v.ownerName} ${v.driverName}`.toLowerCase().includes(q)
        );
    }, [vehicles, search]);

    if (selected) {
        return (
            <div className="page-container">
                <VehicleDetail truckNo={selected} onBack={() => setSelected(null)} />
            </div>
        );
    }

    return (
        <div className="page-container">
            {/* Header */}
            <div className="page-hd">
                <div>
                    <h1><Gauge size={20} color="#f59e0b" /> Diesel Mileage Tracker</h1>
                    <p>Per-vehicle km/litre analytics — Vikas Goods Transport (VGTC)</p>
                </div>
            </div>

            {/* Info banner */}
            <div style={{ marginBottom: '18px', padding: '12px 16px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: 'var(--text-sub)', fontWeight: 600 }}>
                <AlertCircle size={14} color="#6366f1" style={{ flexShrink: 0 }} />
                Mileage is tracked from <strong>Dump Vouchers</strong>. Fill Start KM &amp; End KM when creating a voucher to build this history. Mileage estimates use ₹{DIESEL_PRICE_PER_LITRE}/litre as the diesel price.
            </div>

            {/* Vehicle Grid */}
            <div className="card">
                <div className="card-header" style={{ flexWrap: 'wrap', gap: '10px' }}>
                    <div className="card-title-block">
                        <div className="card-icon" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}><Truck size={17} /></div>
                        <div className="card-title-text">
                            <h3>Vehicle Fleet</h3>
                            <p>{vehicles.length} vehicles registered</p>
                        </div>
                    </div>
                    <div style={{ position: 'relative', minWidth: '220px' }}>
                        <input
                            className="fi"
                            type="text"
                            placeholder="Search truck, owner..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Loader2 size={24} className="spin" style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: '10px', fontSize: '12px', fontWeight: 700 }}>Loading vehicles...</div>
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 700 }}>No vehicles found</div>
                ) : (
                    <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                        {filtered.map(v => {
                            const s = summaryMap[v.truckNo];
                            const kmPerL = s && parseFloat(s.totalKm) > 0 && s.totalDieselRs > 0
                                ? (parseFloat(s.totalKm) / (s.totalDieselRs / DIESEL_PRICE_PER_LITRE))
                                : null;
                            const mColor = getMileageColor(kmPerL);
                            return (
                                <motion.div
                                    key={v.id}
                                    whileHover={{ scale: 1.02, y: -2 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setSelected(v.truckNo)}
                                    style={{
                                        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px',
                                        padding: '16px', cursor: 'pointer', transition: 'border-color 0.2s',
                                        position: 'relative'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
                                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                                >
                                    {/* Truck number */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                        <div style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '7px', borderRadius: '9px' }}>
                                            <Truck size={14} />
                                        </div>
                                        <div style={{ fontSize: '16px', fontWeight: 900, fontFamily: 'monospace', color: 'var(--text)', flex: 1 }}>{v.truckNo}</div>
                                        <ChevronRight size={14} color="var(--text-muted)" />
                                    </div>

                                    {/* Owner */}
                                    {v.ownerName && (
                                        <div style={{ fontSize: '11px', color: 'var(--text-sub)', fontWeight: 700, marginBottom: '10px' }}>
                                            {v.ownerName}
                                        </div>
                                    )}

                                    {/* Mileage summary */}
                                    {s ? (
                                        <div style={{ paddingTop: '10px', borderTop: '1px dashed var(--border)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                <Navigation size={10} />
                                                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{Number(s.totalKm).toLocaleString()} km</span>
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                <Calendar size={10} />
                                                {s.mileageTripCount} trips tracked
                                            </div>
                                            {kmPerL != null && (
                                                <span style={{ fontSize: '11px', fontWeight: 800, color: mColor, background: `${mColor}15`, padding: '1px 7px', borderRadius: '5px' }}>
                                                    {kmPerL.toFixed(1)} km/L avg
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ paddingTop: '10px', borderTop: '1px dashed var(--border)', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                            No trips recorded yet
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
