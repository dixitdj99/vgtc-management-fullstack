import React, { useState, useEffect, useMemo } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Gauge, Truck, ArrowLeft, TrendingUp, Fuel, MapPin, Calendar, Globe,
    ChevronRight, AlertCircle, Loader2, Navigation, BarChart3, Plus, Droplets, Trash2
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
function VehicleDetail({ truckNo, vehicleType, onBack }) {
    const [trips, setTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [showFuelModal, setShowFuelModal] = useState(false);
    const [fuelForm, setFuelForm] = useState({ date: new Date().toISOString().split('T')[0], endKm: '', amount: '', pump: '' });
    const [submitting, setSubmitting] = useState(false);

    const loadData = () => {
        setLoading(true);
        ax.get(`/mileage/vehicle/${encodeURIComponent(truckNo)}`)
        .then(r1 => {
            setTrips(r1.data);
        })
        .catch(() => { setTrips([]); })
        .finally(() => setLoading(false));
    };

    const handleFuelSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const litres = (parseFloat(fuelForm.amount) || 0) / DIESEL_PRICE_PER_LITRE;
            await ax.post('/mileage/fuel', {
                truckNo,
                date: fuelForm.date,
                endKm: fuelForm.endKm,
                advanceDiesel: fuelForm.amount,
                amount: fuelForm.amount,
                litres,
                pump: fuelForm.pump
            });
            setShowFuelModal(false);
            setFuelForm({ date: new Date().toISOString().split('T')[0], endKm: '', amount: '', pump: '' });
            loadData();
        } catch (err) {
            console.error(err);
            alert('Failed to add fuel entry');
        } finally {
            setSubmitting(false);
        }
    };

    useEffect(() => { loadData(); }, [truckNo]);

    const processedTrips = useMemo(() => {
        const ASSUMED_MILEAGE = vehicleType === 'Canter' ? 4.7 : 3.0;
        
        let sortedTrips = [...trips].sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return aTime - bTime;
        });

        let lastEndKm = null;
        let currentBalance = 0;
        const tripBalances = {};
        
        sortedTrips.forEach(t => {
            let dist = null;
            if (t.endKm) {
                const currKm = parseFloat(t.endKm);
                if (lastEndKm !== null && currKm >= lastEndKm) {
                    dist = currKm - lastEndKm;
                }
                lastEndKm = currKm;
            }
            t.calculatedDistance = dist;

            const dieselRs = parseFloat(t.advanceDiesel) || parseFloat(t.amount) || 0;
            const addedLitres = dieselRs / DIESEL_PRICE_PER_LITRE;
            const consumed = (dist || 0) / ASSUMED_MILEAGE;
            currentBalance = currentBalance + addedLitres - consumed;
            tripBalances[t.id] = currentBalance;
        });

        return trips.map(t => {
            const st = sortedTrips.find(x => x.id === t.id);
            return {
                ...t,
                calculatedDistance: st?.calculatedDistance,
                tankBalance: tripBalances[t.id]
            };
        });
    }, [trips, vehicleType]);

    const stats = useMemo(() => {
        const ASSUMED_MILEAGE = vehicleType === 'Canter' ? 4.7 : 3.0;
        let totalKm = 0;
        let validTripsCount = 0;
        processedTrips.forEach(t => {
            if (t.endKm && String(t.endKm).trim() !== '') {
                validTripsCount++;
            }
            if (t.calculatedDistance != null) {
                totalKm += t.calculatedDistance;
            }
        });

        const totalDieselRs = processedTrips.reduce((s, t) => {
            const d = parseFloat(t.advanceDiesel) || parseFloat(t.amount);
            return s + (isNaN(d) ? 0 : d);
        }, 0);
        
        const totalVoucherLitres = totalDieselRs / DIESEL_PRICE_PER_LITRE;
        const fuelConsumed = totalKm / ASSUMED_MILEAGE;
        const fuelBalance = totalVoucherLitres - fuelConsumed;
        const avgKmPerL = totalVoucherLitres > 0 ? (totalKm / totalVoucherLitres) : 0;
        
        return { 
            totalKm: totalKm.toFixed(0), 
            totalDieselRs, 
            avgKmPerL: avgKmPerL.toFixed(2), 
            mileageTripCount: validTripsCount,
            totalVoucherLitres: totalVoucherLitres.toFixed(1),
            fuelConsumed: fuelConsumed.toFixed(1),
            fuelBalance: fuelBalance.toFixed(1),
            assumedMileage: ASSUMED_MILEAGE
        };
    }, [processedTrips, vehicleType]);

    const paginatedTrips = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return processedTrips.slice(start, start + PAGE_SIZE);
    }, [processedTrips, currentPage]);

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
                <div style={{ marginLeft: 'auto' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowFuelModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Fuel size={14} /> Quick Diesel Entry
                    </button>
                </div>
            </div>

            {/* Stats */}
            {stats.mileageTripCount > 0 ? (
                <>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                        <StatCard icon={Navigation} label="Total Distance" value={`${Number(stats.totalKm).toLocaleString()} km`} sub={`Across ${stats.mileageTripCount} tracked trips`} color="#6366f1" />
                        <StatCard 
                            icon={Droplets} 
                            label="Fuel Tank Balance" 
                            value={`${stats.fuelBalance} L`} 
                            sub={`Added: ${stats.totalVoucherLitres}L (Vou.) | Consumed (@${stats.assumedMileage}km/L): ${stats.fuelConsumed}L`} 
                            color={parseFloat(stats.fuelBalance) < 0 ? '#f43f5e' : '#10b981'} 
                        />
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
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b' }}>No KM data yet. Add Current Odometer while creating vouchers to enable mileage tracking.</span>
                </div>
            )}

            {/* Live Tracking Integration Placeholder */}
            <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '10px', borderRadius: '10px' }}>
                        <Globe size={20} />
                    </div>
                    <div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>Live Diesel & GPS Telematics</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-sub)', marginTop: '2px' }}>Connect OBD-II API to sync exact real-time engine diesel consumption.</div>
                    </div>
                </div>
                <button className="btn btn-g btn-sm" onClick={() => alert('Live API Integration Module coming soon!')} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    Configure API
                </button>
            </div>

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
                                {['LR #', 'Date', 'Destination', 'Odometer', 'Distance', 'Diesel Adv (₹)', 'Pump', 'Mileage', 'Tank Bal.'].map(h => (
                                    <th key={h} style={{ padding: '9px 13px', textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {trips.length === 0 ? (
                                <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>No trips found</td></tr>
                            ) : paginatedTrips.map((t, i) => {
                                const dist = t.calculatedDistance;
                                const dieselRs = parseFloat(t.advanceDiesel) || parseFloat(t.amount) || 0;
                                const litres = dieselRs / DIESEL_PRICE_PER_LITRE;
                                const kmPerL = (dist != null && dist > 0 && litres > 0) ? dist / litres : null;
                                const mColor = getMileageColor(kmPerL);
                                const tBal = t.tankBalance != null ? t.tankBalance.toFixed(1) : '—';
                                const tBalColor = t.tankBalance < 0 ? '#f43f5e' : '#10b981';
                                return (
                                    <tr key={t.id}
                                        style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-row-hover)'}
                                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)'}
                                    >
                                        <td style={{ padding: '9px 13px', borderBottom: '1px solid var(--border-row)', fontFamily: 'monospace', fontWeight: 800, color: t._type === 'fuel_log' ? '#10b981' : 'var(--primary)' }}>
                                            {t._type === 'fuel_log' ? 'FUEL ONLY' : `#${t.lrNo}`}
                                        </td>
                                        <td style={{ padding: '9px 13px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-sub)', whiteSpace: 'nowrap' }}>{t.date}</td>
                                        <td style={{ padding: '9px 13px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-sub)' }}>{t.destination || '—'}</td>
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
                                        <td style={{ padding: '9px 13px', borderBottom: '1px solid var(--border-row)', fontWeight: 800, color: tBalColor }}>
                                            {tBal} L
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

            {/* Quick Diesel Entry Modal */}
            <AnimatePresence>
                {showFuelModal && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            style={{ background: 'var(--bg)', borderRadius: '12px', width: '400px', maxWidth: '90%', border: '1px solid var(--border)', overflow: 'hidden' }}
                        >
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontWeight: 800 }}>Quick Diesel Entry</div>
                                <button className="btn" onClick={() => setShowFuelModal(false)} style={{ padding: '4px', background: 'transparent' }}>X</button>
                            </div>
                            <form onSubmit={handleFuelSubmit} style={{ padding: '20px' }}>
                                <div style={{ marginBottom: '15px' }}>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>DATE</label>
                                    <input type="date" className="fi" value={fuelForm.date} onChange={e => setFuelForm({ ...fuelForm, date: e.target.value })} required />
                                </div>
                                <div style={{ marginBottom: '15px' }}>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>CURRENT ODOMETER (KM)</label>
                                    <input type="number" className="fi" placeholder="e.g. 45020" value={fuelForm.endKm} onChange={e => setFuelForm({ ...fuelForm, endKm: e.target.value })} />
                                </div>
                                <div style={{ marginBottom: '15px' }}>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>DIESEL AMOUNT (₹)</label>
                                    <input type="number" className="fi" placeholder="e.g. 5000" value={fuelForm.amount} onChange={e => setFuelForm({ ...fuelForm, amount: e.target.value })} required />
                                </div>
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>PUMP NAME</label>
                                    <input type="text" className="fi" placeholder="e.g. Reliance Jaipur" value={fuelForm.pump} onChange={e => setFuelForm({ ...fuelForm, pump: e.target.value })} />
                                </div>
                                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
                                    {submitting ? 'Saving...' : 'Add Fuel Entry'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

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

    const loadData = () => {
        Promise.all([
            ax.get('/vehicles'),
            ax.get('/mileage/all-vehicles'),
        ]).then(([vRes, mRes]) => {
            // Track Self Vehicles + VGTC (Vikas Goods Transport) owned vehicles
            const vgtcVehicles = vRes.data.filter(v =>
                v.ownershipType === 'self' ||
                (v.ownerName || '').toLowerCase().includes('vikas')
            );
            setVehicles(vgtcVehicles);
            setSummaries(mRes.data);
        }).catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { loadData(); }, []);

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
        const selectedVehicle = vehicles.find(v => v.truckNo === selected);
        return (
            <div className="page-container">
                <VehicleDetail truckNo={selected} vehicleType={selectedVehicle?.vehicleType} onBack={() => setSelected(null)} />
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
