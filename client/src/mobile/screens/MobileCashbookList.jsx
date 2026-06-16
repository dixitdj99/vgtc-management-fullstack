import React from 'react';
import MobileScreen from '../components/MobileScreen';
import { EmptyState } from '../components/common';
import { BookOpen } from 'lucide-react';

// Phase 1 placeholder — replaced in Phase 5.
export default function MobileCashbookList() {
    return (
        <MobileScreen>
            <EmptyState icon={BookOpen} title="Cashbook" hint="Coming up next." />
        </MobileScreen>
    );
}
