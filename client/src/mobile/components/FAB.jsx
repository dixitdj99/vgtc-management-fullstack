import React from 'react';
import { Plus } from 'lucide-react';

export default function FAB({ onClick, icon: Icon = Plus, label = 'Add' }) {
    return (
        <button className="m-fab" onClick={onClick} aria-label={label}>
            <Icon size={24} />
        </button>
    );
}
