import React from 'react';

export default function BottomNav({ tabs, active, onSelect }) {
    return (
        <nav className="m-bottomnav">
            {tabs.map(t => (
                <button
                    key={t.id}
                    className={`m-tab${active === t.id ? ' active' : ''}`}
                    onClick={() => onSelect(t.id)}
                    aria-label={t.label}
                >
                    <t.Icon size={21} className="m-tab-ico" />
                    <span>{t.label}</span>
                </button>
            ))}
        </nav>
    );
}
