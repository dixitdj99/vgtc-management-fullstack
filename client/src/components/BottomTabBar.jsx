import React from 'react';
import { LayoutDashboard, Receipt, FileText, BookOpen, Menu } from 'lucide-react';

/**
 * Mobile bottom tab bar (≤768px only — hidden by CSS on larger screens).
 * Navigates through the existing `nav-module` window event so it reuses the
 * single nav code path in App.jsx. Tabs respect plant + permissions via
 * `filteredNavIds` (the already-filtered set built in App.jsx).
 */
export default function BottomTabBar({ active, plant, filteredNavIds, onMore }) {
    const lrId = plant === 'jklakshmi' ? 'lr_jharli' : 'lr_dump';
    const voucherId = plant === 'jklakshmi' ? 'voucher_jharli' : 'voucher_dump';
    const cashId = plant === 'jklakshmi' ? 'cashbook_jharli' : 'cashbook_dump';

    const go = (id) =>
        window.dispatchEvent(new CustomEvent('nav-module', { detail: { active: id, subActive: '' } }));

    const tabs = [
        { id: 'dashboard', label: 'Home', Icon: LayoutDashboard, always: true, onClick: () => go('dashboard') },
        { id: lrId, label: 'LR', Icon: Receipt, onClick: () => go(lrId) },
        { id: voucherId, label: 'Voucher', Icon: FileText, onClick: () => go(voucherId) },
        { id: cashId, label: 'Cash', Icon: BookOpen, onClick: () => go(cashId) },
        { id: '__more', label: 'More', Icon: Menu, always: true, onClick: onMore },
    ].filter(t => t.always || filteredNavIds.has(t.id));

    return (
        <nav className="bottom-tab-bar">
            {tabs.map(t => {
                const isActive = t.id === active;
                return (
                    <button
                        key={t.id}
                        className={`bottom-tab-item${isActive ? ' active' : ''}`}
                        onClick={t.onClick}
                        aria-label={t.label}
                    >
                        <t.Icon size={20} className="bt-ico" />
                        <span>{t.label}</span>
                    </button>
                );
            })}
        </nav>
    );
}
