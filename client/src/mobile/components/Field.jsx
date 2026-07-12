import React from 'react';

export function Field({ label, children }) {
    return (
        <div className="m-field">
            {label && <label className="m-field-label">{label}</label>}
            {children}
        </div>
    );
}

export function TextField({ label, value, onChange, type = 'text', placeholder, invalid, ...rest }) {
    return (
        <Field label={label}>
            <input
                className={`m-input${invalid ? ' invalid' : ''}`}
                type={type}
                value={value}
                placeholder={placeholder}
                onChange={e => onChange(e.target.value)}
                {...rest}
            />
        </Field>
    );
}

export function SelectField({ label, value, onChange, options, invalid }) {
    return (
        <Field label={label}>
            <select className={`m-select${invalid ? ' invalid' : ''}`} value={value} onChange={e => onChange(e.target.value)}>
                {options.map(o => {
                    const val = typeof o === 'string' ? o : o.value;
                    const lbl = typeof o === 'string' ? o : o.label;
                    return <option key={val} value={val}>{lbl}</option>;
                })}
            </select>
        </Field>
    );
}

export function TextArea({ label, value, onChange, placeholder, rows = 3 }) {
    return (
        <Field label={label}>
            <textarea className="m-input" rows={rows} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
        </Field>
    );
}
