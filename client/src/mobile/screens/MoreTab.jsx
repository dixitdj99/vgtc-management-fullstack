import React from 'react';
import MobileScreen from '../components/MobileScreen';
import MoreModuleHost from './MoreModuleHost';
import MobileVehiclesList from './MobileVehiclesList';
import MobileLoadingStatus from './MobileLoadingStatus';
import { ChevronRight } from 'lucide-react';

/**
 * Launcher for every module not on a core tab. Modules with a native mobile
 * screen route there; the rest render the existing desktop module in a
 * scrollable fallback host so every feature stays reachable.
 */
const CORE_PREFIXES = /^(dashboard$|lr_|voucher_|cashbook_)/;

// id-prefix → native mobile screen component (props: { nav, ...appProps })
const NATIVE = [
    { test: /^vehicles_/, Screen: MobileVehiclesList },
    { test: /^admin_loading_status_/, Screen: MobileLoadingStatus },
];

export default function MoreTab({ FILTERED_NAV = [], renderModule, nav, ...appProps }) {
    const modules = FILTERED_NAV.filter(n => !CORE_PREFIXES.test(n.id));

    const open = (item) => {
        const native = NATIVE.find(n => n.test.test(item.id));
        if (native) {
            const Screen = native.Screen;
            nav.push({ key: item.id, title: item.label, render: () => <Screen nav={nav} {...appProps} /> });
            return;
        }
        const subActive = item.sub?.[0]?.id || '';
        nav.push({
            key: item.id,
            title: item.label,
            render: () => <MoreModuleHost>{renderModule(item.id, subActive)}</MoreModuleHost>,
        });
    };

    return (
        <MobileScreen>
            <div className="m-section-hd">All Modules</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {modules.map(item => (
                    <div key={item.id} className="m-card tappable" onClick={() => open(item)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px' }}>
                        <div style={{ background: `${item.color || '#6366f1'}18`, color: item.color || 'var(--primary)', width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {item.Icon && <item.Icon size={19} />}
                        </div>
                        <span style={{ flex: 1, fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{item.label}</span>
                        <ChevronRight size={18} color="var(--text-muted)" />
                    </div>
                ))}
            </div>
        </MobileScreen>
    );
}
