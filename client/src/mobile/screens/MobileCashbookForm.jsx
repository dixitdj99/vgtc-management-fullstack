import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import ax from '../../api';
import { getSticky, rememberSticky } from '../../utils/stickyDefaults';
import { TextField, TextArea, SelectField } from '../components/Field';

export default function MobileCashbookForm({ kind, cfg, onDone }) {
    const isDeposit = kind === 'deposit';
    const isOffice = kind === 'office_spend';
    const isPersonCash = kind === 'cash_out';
    const [form, setForm] = useState({
        amount: '', date: getSticky('cashbook.date', new Date().toISOString().slice(0, 10)), remark: '', entityKey: '',
    });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const [entities, setEntities] = useState([]); // {value,label}

    useEffect(() => {
        if (isDeposit || isOffice) return;
        Promise.all([
            ax.get('/profiles').then(r => r.data || []).catch(() => []),
            ax.get('/vehicles').then(r => r.data || []).catch(() => []),
        ]).then(([profiles, vehicles]) => {
            const expenseIds = new Set(profiles.filter(p => p.type === 'Expense' || (p.name || '').toLowerCase().includes('office spend')).map(p => p.id));
            const opts = [{ value: '', label: '— Select driver or staff —' }];
            profiles.filter(p => p.type === 'Driver' || p.department === 'Driver').forEach(d => opts.push({ value: `driver::${d.id}`, label: `Driver: ${d.name}` }));
            profiles.filter(p => !expenseIds.has(p.id) && (p.type === 'Office Staff' || p.type === 'Staff' || p.type === 'Labour' || p.department === 'Office' || p.department === 'Accountant' || p.department === 'Electrician' || p.department === 'Labour')).forEach(s => opts.push({ value: `staff::${s.id}`, label: `Staff: ${s.name}` }));
            const includedIds = new Set(opts.map(o => o.value.replace(/^staff::|^driver::/, '')));
            profiles.filter(p => !expenseIds.has(p.id) && !includedIds.has(p.id)).forEach(s => opts.push({ value: `staff::${s.id}`, label: `Others: ${s.name} (${s.type || 'Other'})` }));
            setEntities(opts);
        });
    }, [isDeposit, isOffice]);

    const S = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const submit = async () => {
        setErr('');
        if (!form.amount || parseFloat(form.amount) <= 0) return setErr('Enter a valid amount');
        if (isPersonCash && !form.entityKey) return setErr('Select the driver or staff profile');
        setSaving(true);
        try {
            if (isDeposit) {
                await ax.post(cfg.cashbookApi + '/deposit', { amount: form.amount, date: form.date, remark: form.remark });
            } else if (isOffice) {
                const officeProf = (await ax.get('/profiles').then(r => r.data || []).catch(() => []))
                    .find(p => p.type === 'Expense' || (p.name || '').toLowerCase().includes('office spend'));
                await ax.post(cfg.cashbookApi + '/cash-out-linked', {
                    amount: form.amount, date: form.date, remark: form.remark,
                    entityType: 'expense',
                    entityId: officeProf?.id || 'office_spend',
                    entityName: officeProf?.name || 'Office Spend',
                });
            } else if (form.entityKey) {
                const [entityType, entityId] = form.entityKey.split('::');
                const ent = entities.find(e => e.value === form.entityKey);
                const entityName = ent ? ent.label.replace(/^(Office Spend|Driver|Vehicle|Staff|Others): /, '') : '';
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
            {isPersonCash && (
                <SelectField label="Choose profile *" value={form.entityKey} onChange={v => S('entityKey', v)} options={entities} />
            )}
            <TextArea label="Remark" value={form.remark} onChange={v => S('remark', v)} placeholder={isDeposit ? 'e.g. Opening balance' : isOffice ? 'e.g. Electricity, stationery' : 'e.g. Cash given to driver'} />

            {err && <div className="field-error" style={{ marginBottom: 12 }}>{err}</div>}
            <button className="m-btn m-btn-primary" onClick={submit} disabled={saving}>
                {saving ? <Loader2 size={18} className="spin" /> : (isDeposit ? 'Add Deposit' : isOffice ? 'Save Office Spend' : 'Save Cash Out')}
            </button>
        </div>
    );
}
