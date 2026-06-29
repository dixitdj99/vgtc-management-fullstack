import React, { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import ax from '../../api';
import { getSticky, rememberSticky } from '../../utils/stickyDefaults';
import { fmtRs } from '../../utils/format';
import { TextField, SelectField } from '../components/Field';
import Autocomplete from '../components/Autocomplete';

const brandForType = (plant, type) =>
    type === 'JK_Super' ? 'jksuper' : (plant === 'jklakshmi' ? 'jklakshmi' : 'jksuper');

export default function MobileVoucherForm({ plant, cfg, defaultType, onDone }) {
    const [form, setForm] = useState({
        type: defaultType || cfg.voucherTypes[0],
        date: getSticky('voucher.date', new Date().toISOString().split('T')[0]),
        lrNo: '', truckNo: '', destination: '', partyName: '',
        weight: '', bags: '', rate: '',
        advanceDiesel: '', advanceCash: '', advanceOnline: '',
        billNo: '',
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const [trucks, setTrucks] = useState([]);
    const [parties, setParties] = useState([]);

    useEffect(() => {
        ax.get('/vehicles').then(r => setTrucks((r.data || []).map(v => v.truckNo).filter(Boolean))).catch(() => {});
        ax.get('/parties').then(r => setParties((r.data || []).map(p => p.name).filter(Boolean))).catch(() => {});
    }, []);

    const S = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const setWeight = (v) => setForm(f => ({ ...f, weight: v, bags: v ? String(Math.round(parseFloat(v) * 20)) : '' }));

    const isBill = form.type === 'Kosli_Bill' || form.type === 'Jajjhar_Bill' || form.type === 'Bahadurgarh_Bill';
    const wt = parseFloat(form.weight) || 0;
    const munshi = wt > 0 ? (wt < 18 ? 50 : 100) : 0;
    const gross = wt * (parseFloat(form.rate) || 0);
    const net = gross - (parseFloat(form.advanceDiesel) || 0) - (parseFloat(form.advanceCash) || 0) - (parseFloat(form.advanceOnline) || 0) - munshi;

    const submit = async () => {
        setErr('');
        if (!form.lrNo.trim()) return setErr('LR number is required');
        if (!form.truckNo.trim()) return setErr('Truck number is required');
        if (isBill && !form.billNo.trim()) return setErr('Bill number is required for bills');
        setSaving(true);
        try {
            await ax.post('/vouchers', {
                type: form.type,
                brand: brandForType(plant, form.type),
                date: form.date,
                lrNo: form.lrNo.trim(),
                truckNo: form.truckNo.trim().toUpperCase().replace(/\s/g, ''),
                destination: form.destination.trim(),
                partyName: form.partyName.trim(),
                weight: form.weight, bags: form.bags, rate: form.rate,
                advanceDiesel: form.advanceDiesel, advanceCash: form.advanceCash, advanceOnline: form.advanceOnline,
                munshi, billNo: form.billNo.trim(),
                pump: 'None', deliveries: [],
            });
            rememberSticky('voucher.date', form.date);
            rememberSticky('voucher.type', form.type);
            onDone();
        } catch (e) {
            setErr(e.response?.data?.error || 'Failed to create voucher');
            setSaving(false);
        }
    };

    return (
        <div>
            <SelectField label="Voucher Type" value={form.type} onChange={v => S('type', v)} options={cfg.voucherTypes.map(t => ({ value: t, label: t.replace(/_/g, ' ') }))} />
            <TextField label="Date" type="date" value={form.date} onChange={v => S('date', v)} />
            <TextField label="LR Number" value={form.lrNo} onChange={v => S('lrNo', v)} placeholder="Existing LR no." />
            <Autocomplete label="Truck No." value={form.truckNo} onChange={v => S('truckNo', v)} options={trucks} />
            <Autocomplete label="Party Name" value={form.partyName} onChange={v => S('partyName', v)} options={parties} />
            <TextField label="Destination" value={form.destination} onChange={v => S('destination', v)} />
            {isBill && <TextField label="Bill Number" value={form.billNo} onChange={v => S('billNo', v)} />}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <TextField label="Weight (MT)" type="number" value={form.weight} onChange={setWeight} />
                <TextField label="Rate (₹/MT)" type="number" value={form.rate} onChange={v => S('rate', v)} />
            </div>
            <div className="m-section-hd" style={{ marginTop: 4 }}>Advances</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <TextField label="Diesel" type="number" value={form.advanceDiesel} onChange={v => S('advanceDiesel', v)} />
                <TextField label="Cash" type="number" value={form.advanceCash} onChange={v => S('advanceCash', v)} />
                <TextField label="Online" type="number" value={form.advanceOnline} onChange={v => S('advanceOnline', v)} />
            </div>

            <div className="m-card" style={{ margin: '4px 0 14px', background: 'var(--bg-th)' }}>
                <div className="m-row" style={{ borderBottom: 'none' }}>
                    <span className="m-row-label">Net Payable</span>
                    <span className="m-row-val" style={{ fontSize: 18, fontWeight: 900, color: net >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{fmtRs(net)}</span>
                </div>
            </div>

            {err && <div className="field-error" style={{ marginBottom: 12 }}>{err}</div>}
            <button className="m-btn m-btn-primary" onClick={submit} disabled={saving}>
                {saving ? <Loader2 size={18} className="spin" /> : 'Create Voucher'}
            </button>
        </div>
    );
}
