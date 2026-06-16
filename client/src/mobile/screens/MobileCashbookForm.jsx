import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import ax from '../../api';
import { getSticky, rememberSticky } from '../../utils/stickyDefaults';
import { TextField, TextArea, SelectField } from '../components/Field';

export default function MobileCashbookForm({ kind, cfg, onDone }) {
    const isDeposit = kind === 'deposit';
    const [form, setForm] = useState({
        amount: '', date: getSticky('cashbook.date', new Date().toISOString().slice(0, 10)), remark: '', entityKey: '',
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const [entities, setEntities] = useState([]); // {value,label}

    useEffect(() => {
        if (isDeposit) return;
        Promise.all([
            ax.get('/profiles').then(r => r.data || []).catch(() => []),
            ax.get('/vehicles').then(r => r.data || []).catch(() => []),
        ]).then(([profiles, vehicles]) => {
            const opts = [{ value: '', label: '— None (General Expense) —' }];
            profiles.filter(p => p.type === 'Driver').forEach(d => opts.push({ value: `driver::${d.id}`, label: `Driver: ${d.name}` }));
            vehicles.forEach(v => opts.push({ value: `vehicle::${v.truckNo}`, label: `Vehicle: ${v.truckNo}` }));
            profiles.filter(p => p.type === 'Office Staff' || p.type === 'Labour').forEach(s => opts.push({ value: `staff::${s.id}`, label: `Staff: ${s.name}` }));
            setEntities(opts);
        });
    }, [isDeposit]);

    const S = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const submit = async () => {
        setErr('');
        if (!form.amount || parseFloat(form.amount) <= 0) return setErr('Enter a valid amount');
        setSaving(true);
        try {
            if (isDeposit) {
                await ax.post(cfg.cashbookApi + '/deposit', { amount: form.amount, date: form.date, remark: form.remark });
            } else if (form.entityKey) {
                const [entityType, entityId] = form.entityKey.split('::');
                const ent = entities.find(e => e.value === form.entityKey);
                const entityName = ent ? ent.label.replace(/^(Driver|Vehicle|Staff): /, '') : '';
                await ax.post(cfg.cashbookApi + '/cash-out-linked', { amount: form.amount, date: form.date, remark: form.remark, entityType, entityId, entityName });
            } else {
                await ax.post(cfg.cashbookApi + '/cash-out', { amount: form.amount, date: form.date, remark: form.remark });
            }
            rememberSticky('cashbook.date', form.date);
            onDone();
        } catch (e) {
            setErr(e.response?.data?.error || 'Failed to save');
            setSaving(false);
        }
    };

    return (
        <div>
            <TextField label="Amount (₹)" type="number" value={form.amount} onChange={v => S('amount', v)} placeholder="0" />
            <TextField label="Date" type="date" value={form.date} onChange={v => S('date', v)} />
            {!isDeposit && entities.length > 0 && (
                <SelectField label="Give Cash To (optional)" value={form.entityKey} onChange={v => S('entityKey', v)} options={entities} />
            )}
            <TextArea label="Remark" value={form.remark} onChange={v => S('remark', v)} placeholder={isDeposit ? 'e.g. Opening balance' : 'e.g. Office expense'} />

            {err && <div className="field-error" style={{ marginBottom: 12 }}>{err}</div>}
            <button className="m-btn m-btn-primary" onClick={submit} disabled={saving}>
                {saving ? <Loader2 size={18} className="spin" /> : (isDeposit ? 'Add Deposit' : 'Save Cash Out')}
            </button>
        </div>
    );
}
