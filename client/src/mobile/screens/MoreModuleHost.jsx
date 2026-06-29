import React from 'react';
import MobileScreen from '../components/MobileScreen';

// Renders an existing desktop module inside a mobile-fit wrapper. Wide data
// tables scroll horizontally; dashboard-style grids/headers reflow to fit
// the phone via scoped CSS in mobile.css (.m-fallback-fit).
export default function MoreModuleHost({ children }) {
    return (
        <MobileScreen>
            <div className="m-fallback-fit">{children}</div>
        </MobileScreen>
    );
}
