import React from 'react';
import { LayoutDashboard, Receipt, FileText, BookOpen, Grid3x3, Sun, Moon, Coffee } from 'lucide-react';
import './mobile.css';
import useMobileNav from './useMobileNav';
import AppBar from './components/AppBar';
import BottomNav from './components/BottomNav';
import BottomSheet from './components/BottomSheet';

import MobileDashboard from './screens/MobileDashboard';
import MobileLRList from './screens/MobileLRList';
import MobileVoucherList from './screens/MobileVoucherList';
import MobileCashbookList from './screens/MobileCashbookList';
import MoreTab from './screens/MoreTab';

const THEME_ICON = { dark: Moon, light: Sun, sepia: Coffee };

export default function MobileApp(props) {
    const { plant, godown, theme, cycleTheme, filteredNavIds, cols } = props;
    const nav = useMobileNav('dashboard');

    const lrId = plant === 'jklakshmi' ? 'lr_jharli' : 'lr_dump';
    const voucherId = plant === 'jklakshmi' ? 'voucher_jharli' : 'voucher_dump';
    const cashId = plant === 'jklakshmi' ? 'cashbook_jharli' : 'cashbook_dump';

    const allTabs = [
        { id: 'dashboard', label: 'Home', Icon: LayoutDashboard, always: true },
        { id: 'lr', label: 'LR', Icon: Receipt, perm: lrId },
        { id: 'voucher', label: 'Voucher', Icon: FileText, perm: voucherId },
        { id: 'cash', label: 'Cash', Icon: BookOpen, perm: cashId },
        { id: 'more', label: 'More', Icon: Grid3x3, always: true },
    ];
    const tabs = allTabs.filter(t => t.always || filteredNavIds.has(t.perm));

    // Tab root screens
    const roots = {
        dashboard: { title: 'Dashboard', render: () => <MobileDashboard {...props} nav={nav} /> },
        lr: { title: 'Loading Receipts', render: () => <MobileLRList {...props} nav={nav} /> },
        voucher: { title: 'Vouchers', render: () => <MobileVoucherList {...props} nav={nav} /> },
        cash: { title: 'Cashbook', render: () => <MobileCashbookList {...props} nav={nav} /> },
        more: { title: 'All Modules', render: () => <MoreTab {...props} nav={nav} /> },
    };

    const current = nav.top || roots[nav.tab] || roots.dashboard;
    const ThemeIcon = THEME_ICON[theme] || Sun;

    return (
        <div className="m-app" data-cols={cols}>
            <AppBar
                title={current.title}
                canBack={nav.stack.length > 0}
                onBack={() => window.history.back()}
                right={
                    <button className="m-appbar-btn" onClick={cycleTheme} aria-label="Theme">
                        <ThemeIcon size={18} />
                    </button>
                }
            />

            {current.render(nav)}

            <BottomNav tabs={tabs} active={nav.tab} onSelect={nav.setTab} />

            <BottomSheet
                open={!!nav.sheet}
                title={nav.sheet?.title}
                onClose={() => window.history.back()}
                footer={nav.sheet?.footer}
            >
                {nav.sheet?.render?.(nav)}
            </BottomSheet>
        </div>
    );
}
