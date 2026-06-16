import React from 'react';
import MobileScreen from '../components/MobileScreen';
import { EmptyState } from '../components/common';
import { Receipt } from 'lucide-react';

// Phase 1 placeholder — replaced in Phase 3.
export default function MobileLRList() {
    return (
        <MobileScreen>
            <EmptyState icon={Receipt} title="Loading Receipts" hint="Coming up next." />
        </MobileScreen>
    );
}
