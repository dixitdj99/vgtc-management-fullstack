import React from 'react';
import MobileScreen from '../components/MobileScreen';
import { EmptyState } from '../components/common';
import { LayoutDashboard } from 'lucide-react';

// Phase 1 placeholder — replaced in Phase 2 with live KPIs.
export default function MobileDashboard() {
    return (
        <MobileScreen>
            <EmptyState icon={LayoutDashboard} title="Dashboard" hint="Coming up next." />
        </MobileScreen>
    );
}
