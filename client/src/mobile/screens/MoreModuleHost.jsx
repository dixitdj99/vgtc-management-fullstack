import React from 'react';
import MobileScreen from '../components/MobileScreen';

// Renders an existing desktop module inside a scrollable mobile fallback,
// guaranteeing every feature is reachable on mobile until it gets a native screen.
export default function MoreModuleHost({ children }) {
    return (
        <MobileScreen>
            <div className="m-fallback-banner">Optimized for desktop — scroll sideways for wide tables</div>
            <div className="m-fallback">{children}</div>
        </MobileScreen>
    );
}
