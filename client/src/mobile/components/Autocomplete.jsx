import React from 'react';
import { Field } from './Field';

/**
 * Native datalist-backed autocomplete — keeps it dependency-free and gives the
 * OS keyboard suggestions. `options` = array of strings.
 */
export default function Autocomplete({ label, value, onChange, options = [], placeholder, invalid, id }) {
    const listId = id || `m-ac-${label?.replace(/\s/g, '')}`;
    return (
        <Field label={label}>
            <input
                className={`m-input${invalid ? ' invalid' : ''}`}
                value={value}
                placeholder={placeholder}
                onChange={e => onChange(e.target.value)}
                list={listId}
                autoComplete="off"
            />
            <datalist id={listId}>
                {options.map(o => <option key={o} value={o} />)}
            </datalist>
        </Field>
    );
}
