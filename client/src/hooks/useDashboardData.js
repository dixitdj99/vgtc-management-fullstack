import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import ax from '../api';
import { Receipt, FileText } from 'lucide-react';
import { calcOutstanding, checkExpiry } from '../utils/voucherCalc';

const todayStr = () => new Date().toISOString().split('T')[0];

/** Per-plant endpoint/config map (shared by desktop + mobile dashboards). */
export function plantConfig(plant, godown) {
    if (plant === 'jklakshmi') {
        return {
            lrApi: '/jkl/lr', cashbookApi: '/jkl/cashbook',
            voucherTypes: ['Dump', 'JK_Lakshmi', 'JK_Super'],
            ids: { lr: 'lr_jharli', voucher: 'voucher_jharli', cashbook: 'cashbook_jharli', balance: 'balance_jharli', vehicles: 'vehicles_jharli' },
        };
    }
    let voucherTypes = ['Kosli_Bill', 'Jajjhar_Bill', 'JK_Super'];
    if (godown === 'kosli') voucherTypes = ['Kosli_Bill'];
    else if (godown === 'jhajjar') voucherTypes = ['Jajjhar_Bill'];
    return {
        lrApi: '/lr', cashbookApi: '/cashbook',
        voucherTypes,
        ids: { lr: 'lr_dump', voucher: 'voucher_dump', cashbook: 'cashbook_dump', balance: 'balance_dump', vehicles: 'vehicles_dump' },
    };
}

/**
 * Fetches + computes all dashboard data. Each source is independent
 * ({loading,data,error}) so one failure never blanks the others.
 * Returns raw sources + computed KPIs + refetchers + the plant cfg.
 */
export default function useDashboardData() {
    const { plant, godown } = useAuth();
    const cfg = useMemo(() => plantConfig(plant, godown), [plant, godown]);

    const [lrs, setLrs] = useState({ loading: true, data: null, error: false });
    const [vouchers, setVouchers] = useState({ loading: true, data: null, error: false });
    const [cashbook, setCashbook] = useState({ loading: true, data: null, error: false });
    const [maintAlerts, setMaintAlerts] = useState({ loading: true, data: null, error: false });
    const [vehicles, setVehicles] = useState({ loading: true, data: null, error: false });

    const fetchLrs = () => {
        setLrs(s => ({ ...s, loading: true, error: false }));
        ax.get(cfg.lrApi)
            .then(r => setLrs({ loading: false, data: r.data || [], error: false }))
            .catch(() => setLrs({ loading: false, data: null, error: true }));
    };
    const fetchVouchers = () => {
        setVouchers(s => ({ ...s, loading: true, error: false }));
        Promise.all(cfg.voucherTypes.map(t => ax.get(`/vouchers/${t}`).then(r => r.data || []).catch(() => [])))
            .then(lists => setVouchers({ loading: false, data: lists.flat(), error: false }))
            .catch(() => setVouchers({ loading: false, data: null, error: true }));
    };
    const fetchCashbook = () => {
        setCashbook(s => ({ ...s, loading: true, error: false }));
        ax.get(cfg.cashbookApi)
            .then(r => setCashbook({ loading: false, data: r.data || [], error: false }))
            .catch(() => setCashbook({ loading: false, data: null, error: true }));
    };
    const fetchAlerts = () => {
        setMaintAlerts(s => ({ ...s, loading: true, error: false }));
        ax.get('/maintenance/alerts')
            .then(r => setMaintAlerts({ loading: false, data: r.data || [], error: false }))
            .catch(() => setMaintAlerts({ loading: false, data: null, error: true }));
    };
    const fetchVehicles = () => {
        setVehicles(s => ({ ...s, loading: true, error: false }));
        ax.get('/vehicles')
            .then(r => setVehicles({ loading: false, data: r.data || [], error: false }))
            .catch(() => setVehicles({ loading: false, data: null, error: true }));
    };

    useEffect(() => {
        fetchLrs(); fetchVouchers(); fetchCashbook(); fetchAlerts(); fetchVehicles();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cfg]);

    const todayLrCount = useMemo(() => {
        if (!lrs.data) return null;
        const t = todayStr();
        return lrs.data.filter(lr => String(lr.date || '').slice(0, 10) === t).length;
    }, [lrs.data]);

    const vehicleMap = useMemo(() => {
        const m = {};
        (vehicles.data || []).forEach(v => { m[(v.truckNo || '').replace(/\s/g, '').toUpperCase()] = v; });
        return m;
    }, [vehicles.data]);

    const outstanding = useMemo(() => {
        if (!vouchers.data) return null;
        return vouchers.data.reduce((s, v) => {
            const veh = vehicleMap[(v.truckNo || '').replace(/\s/g, '').toUpperCase()];
            return s + calcOutstanding(v, veh);
        }, 0);
    }, [vouchers.data, vehicleMap]);

    const cashInHand = useMemo(() => {
        if (!cashbook.data || !vouchers.data) return null;
        const deposits = cashbook.data.filter(e => e.type === 'deposit').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        const cashOuts = cashbook.data.filter(e => e.type === 'cash_out').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        const voucherAdv = vouchers.data.reduce((s, v) => s + Math.abs(parseFloat(v.advanceCash) || 0), 0);
        return deposits - cashOuts - voucherAdv;
    }, [cashbook.data, vouchers.data]);

    const fleetAlerts = useMemo(() => {
        if (!maintAlerts.data && !vehicles.data) return null;
        const list = [];
        (maintAlerts.data || []).forEach(a => {
            if (a.status === 'OVERDUE' || a.status === 'DUE_SOON') {
                list.push({
                    key: `m-${a.truckNo}-${a.partName}`,
                    truckNo: a.truckNo,
                    text: `${a.partName} service ${a.status === 'OVERDUE' ? 'overdue' : `due in ${a.daysRemaining}d`}`,
                    severity: a.status === 'OVERDUE' ? 2 : 1,
                });
            }
        });
        (vehicles.data || []).forEach(v => {
            let docs = {};
            try { docs = JSON.parse(v.docs || '{}'); } catch { }
            Object.entries(docs).forEach(([type, date]) => {
                const r = checkExpiry(date);
                if (r && r.status !== 'ok') {
                    list.push({
                        key: `d-${v.truckNo}-${type}`,
                        truckNo: v.truckNo,
                        text: `${type.toUpperCase()} ${r.status === 'expired' ? `expired ${r.days}d ago` : `expires in ${r.days}d`}`,
                        severity: r.status === 'expired' ? 2 : 1,
                    });
                }
            });
        });
        return list.sort((a, b) => b.severity - a.severity);
    }, [maintAlerts.data, vehicles.data]);

    const recentActivity = useMemo(() => {
        const getTime = (x) => {
            const c = x.createdAt;
            if (c?.seconds) return c.seconds * 1000;
            const t = new Date(c || x.date || 0).getTime();
            return isNaN(t) ? 0 : t;
        };
        const items = [
            ...(vouchers.data || []).map(v => ({ kind: 'Voucher', icon: FileText, label: `LR #${v.lrNo} · ${v.truckNo || ''} · ${v.destination || v.type || ''}`, date: v.date, ts: getTime(v) })),
            ...(lrs.data || []).map(lr => ({ kind: 'LR', icon: Receipt, label: `LR #${lr.lrNo} · ${lr.truckNo || ''} · ${lr.material || ''}`, date: lr.date, ts: getTime(lr) })),
        ];
        return items.sort((a, b) => b.ts - a.ts).slice(0, 8);
    }, [vouchers.data, lrs.data]);

    return {
        cfg,
        lrs, vouchers, cashbook, maintAlerts, vehicles,
        kpis: { todayLrCount, outstanding, cashInHand, fleetAlerts },
        recentActivity,
        refetch: { fetchLrs, fetchVouchers, fetchCashbook, fetchAlerts, fetchVehicles },
    };
}
