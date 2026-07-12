import React from 'react';

export function EmptyState({ icon: Icon, title, hint }) {
    return (
        <div className="m-empty">
            {Icon && <div className="m-empty-ico"><Icon size={40} /></div>}
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>{title}</div>
            {hint && <div style={{ fontSize: 12.5, marginTop: 4 }}>{hint}</div>}
        </div>
    );
}

export function SkeletonList({ count = 5 }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: count }).map((_, i) => <div key={i} className="m-skel" />)}
        </div>
    );
}

export function Card({ children, onClick, className = '' }) {
    return (
        <div className={`m-card${onClick ? ' tappable' : ''} ${className}`} onClick={onClick}>
            {children}
        </div>
    );
}
