import React, { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import ax from '../../api';
import { getSticky, rememberSticky } from '../../utils/stickyDefaults';
import { TextField, SelectField, TextArea } from '../components/Field';
import Autocomplete from '../components/Autocomplete';

const MATERIALS = {
    jkl: ['PPC', 'OPC43', 'Pro+'],
    default: ['PPC', 'OPC43', 'Adstar', 'Opc FS', 'Opc 53 FS', 'Weather'],
};

export default function MobileLRForm({ brand, cfg, onDone }) {
    const mats = MATERIALS[brand] || MATERIALS.default;
    const [form, setForm] = useState({
        date: getSticky('lr.date', new Date().toISOString().split('T')[0]),
        truckNo: '', partyName: '', destination: '',
        material: mats[0], loadingType: 'From Godown', bags: '', weight: '', note: '',
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const [trucks, setTrucks] = useState([]);
    const [parties, setParties] = useState([]);

    useEffect(() => {
        ax.get('/vehicles').then(r => setTrucks((r.data || []).map(v => v.truckNo).filter(Boolean))).catch(() => {});
        ax.get('/parties').then(r => setParties((r.data || []).filter(p => p.type === 'customer' || p.type === 'broker').map(p => p.name))).catch(() => {});
    }, []);

    const S = (k, v) => setForm(f => ({ ...f, [k]: v }));

    // bags ↔ weight auto-calc (1 bag = 0.05 MT)
    const setBags = (v) => setForm(f => ({ ...f, bags: v, weight: v ? (parseFloat(v) * 0.05).toFixed(2) : '' }));

    const submit = async () => {
        setErr('');
        if (!form.truckNo.trim()) return setErr('Truck number is required');
        if (!form.partyName.trim()) return setErr('Party name is required');
        if (!form.bags && !form.weight) return setErr('Enter bags or weight');
        setSaving(true);
        try {
            await ax.post(cfg.lrApi, {
                date: form.date,
                truckNo: form.truckNo.trim().toUpperCase().replace(/\s/g, ''),
                partyName: form.partyName.trim(),
                destination: form.destination.trim(),
                note: form.note.trim(),
                voiceMessageBase64: '',
                materials: [{
                    type: form.material,
                    loadingType: form.loadingType,
                    weight: form.weight,
                    bags: form.bags,
                    billing: 'No',
                    partyName: form.partyName.trim(),
                }],
            });
            rememberSticky('lr.date', form.date);
            onDone();
        } catch (e) {
            setErr(e.response?.data?.error || 'Failed to create LR');
            setSaving(false);
        }
    };

    return (
        <div>
            <TextField label="Date" type="date" value={form.date} onChange={v => S('date', v)} />
            <Autocomplete label="Truck No." value={form.truckNo} onChange={v => S('truckNo', v)} options={trucks} placeholder="e.g. HR47G1234" />
            <Autocomplete label="Party Name" value={form.partyName} onChange={v => S('partyName', v)} options={parties} placeholder="Customer / broker" />
            <TextField label="Destination" value={form.destination} onChange={v => S('destination', v)} placeholder="e.g. Surat" />
            <SelectField label="Material" value={form.material} onChange={v => S('material', v)} options={mats} />
            <SelectField label="Loading Type" value={form.loadingType} onChange={v => S('loadingType', v)} options={['From Godown', 'Crossing']} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <TextField label="Bags" type="number" value={form.bags} onChange={setBags} placeholder="0" />
                <TextField label="Weight (MT)" type="number" value={form.weight} onChange={v => S('weight', v)} placeholder="0.00" />
            </div>
            <TextArea label="Note (optional)" value={form.note} onChange={v => S('note', v)} placeholder="Instructions for labour…" />

            {err && <div className="field-error" style={{ marginBottom: 12 }}>{err}</div>}

            <button className="m-btn m-btn-primary" onClick={submit} disabled={saving}>
                {saving ? <Loader2 size={18} className="spin" /> : 'Create Loading Receipt'}
            </button>
        </div>
    );
}
