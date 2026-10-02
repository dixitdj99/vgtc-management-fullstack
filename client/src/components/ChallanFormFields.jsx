import React from 'react';
import StyledAutocomplete from './StyledAutocomplete';
import { cleanTruckNo } from '../utils/vehicleUtils';
import { resolvePartyName } from '../utils/partyNameUtils';

/** Shared fields for stock challans created from Stock or Loading Receipt. */
export default function ChallanFormFields({ form, onChange, materials = [], vehicles = [], partySuggestions = [], destinationOptions = [], partyCodeByName, stockMap, ewbSource }) {
  const set = (key, value) => onChange({ ...form, [key]: value });
  const manualNumber = form.challanNumberMode === 'manual';
  const destinations = destinationOptions.map(option => typeof option === 'string'
    ? { label: option, value: option }
    : option);
  const setDestination = value => {
    const normalized = String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
    const matched = destinations.find(option => String(option.value || option.label || '').trim().replace(/\s+/g, ' ').toUpperCase() === normalized);
    const destination = matched?.value || value;
    onChange({ ...form, destination });
  };
  return (
    <div className="fg fg-2" style={{ gap: '14px', width: '100%' }}>
      <div className="field-h">
        <label>Challan Number {ewbSource && <span style={{ color: '#10b981', marginLeft: '6px', textTransform: 'none', fontWeight: 700 }}>— rest filled from EWB {ewbSource}</span>}</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select className="fi" style={{ maxWidth: '105px' }} aria-label="Challan number mode"
            value={manualNumber ? 'manual' : 'auto'}
            onChange={e => onChange({ ...form, challanNumberMode: e.target.value, challanNo: '' })}>
            <option value="auto">Auto</option>
            <option value="manual">Manual</option>
          </select>
          <input id="challan-number-input" className="fi" type="text" inputMode="numeric" maxLength={5}
            pattern={manualNumber ? '[0-9]{5}' : undefined} required={manualNumber}
            placeholder={manualNumber ? 'Enter 5-digit number' : 'Generated on save'}
            readOnly={!manualNumber} value={manualNumber ? (form.challanNo || '') : ''}
            onChange={e => set('challanNo', e.target.value.replace(/\D/g, '').slice(0, 5))} />
        </div>
      </div>
      <div className="field-h">
        <label>Truck Number *</label>
        <StyledAutocomplete id="challan-truck-input" value={form.truckNo || ''}
          onChange={value => set('truckNo', cleanTruckNo(value))}
          options={vehicles.map(v => v?.truckNo || v?.value || v?.label || '').filter(Boolean).map(truckNo => ({ label: truckNo, value: truckNo }))}
          uppercase required placeholder="ENTER OR SELECT TRUCK NUMBER" />
      </div>
      <div className="field-h">
        <label>Material *</label>
        <select className="fi" required value={form.material || ''} onChange={e => set('material', e.target.value)}>
          {materials.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="field-h">
        <label>Quantity (Bags) *</label>
        <div style={{ position: 'relative' }}>
          <input className="fi" type="number" step="1" min="1" required placeholder="Enter quantity"
            style={{ paddingRight: form.quantity ? '70px' : '12px' }}
            value={form.quantity || ''} onChange={e => set('quantity', e.target.value)} />
          {form.quantity && <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', fontWeight: 800, color: '#2563eb', pointerEvents: 'none' }}>{(Number(form.quantity) * 0.05).toFixed(2)} MT</span>}
        </div>
      </div>
      <div className="field-h">
        <label>Party Name</label>
        <StyledAutocomplete value={form.partyName || ''} onChange={value => {
          const partyName = resolvePartyName(value, partySuggestions);
          onChange({ ...form, partyName, partyCode: partyCodeByName?.(partyName) || '' });
        }}
          options={partySuggestions.map(name => ({ label: String(name).toUpperCase(), value: String(name).toUpperCase() }))}
          uppercase placeholder="ENTER CUSTOMER OR PARTY NAME" />
      </div>
      <div className="field-h">
        <label>Party Code</label>
        <input className="fi" type="text" placeholder="Party code" value={form.partyCode || ''} onChange={e => set('partyCode', e.target.value)} />
      </div>
      <div className="field-h">
        <label>Bill No</label>
        <input className="fi" type="text" placeholder="Bill number" value={form.billNo || ''} onChange={e => set('billNo', e.target.value)} />
      </div>
      <div className="field-h">
        <label>Factory Code</label>
        <input className="fi" type="text" placeholder="e.g. FC1, FC5" maxLength={16} style={{ textTransform: 'uppercase' }}
          value={form.factoryCode || ''} onChange={e => set('factoryCode', e.target.value.toUpperCase())} />
      </div>
      <div className="field-h">
        <label>Destination</label>
        <StyledAutocomplete value={form.destination || ''} onChange={setDestination}
          options={destinations} uppercase placeholder="ENTER OR SELECT DESTINATION" />
      </div>
      <div className="field-h">
        <label>Date</label>
        <input className="fi" type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} />
      </div>
      <div className="field-h" style={{ gridColumn: '1 / -1' }}>
        <label>Remark</label>
        <input className="fi" type="text" placeholder="Notes" value={form.remark || ''} onChange={e => set('remark', e.target.value)} />
      </div>
      {stockMap && form.material && <div style={{ gridColumn: '1 / -1', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, padding: '4px 12px', background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)' }}>
        📦 {form.material}: <strong style={{ color: 'var(--text)' }}>{Number(stockMap[form.material]?.available || 0).toLocaleString()}</strong> bags available
      </div>}
    </div>
  );
}
