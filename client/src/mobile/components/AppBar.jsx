import React from 'react';
import { ArrowLeft } from 'lucide-react';

export default function AppBar({ title, canBack, onBack, right }) {
    return (
        <header className="m-appbar">
            {canBack && (
                <button className="m-appbar-btn" onClick={onBack} aria-label="Back">
                    <ArrowLeft size={20} />
                </button>
            )}
            <div className="m-appbar-title">{title}</div>
            {right}
        </header>
    );
}
