import React from 'react';
import MobileScreen from '../components/MobileScreen';
import { EmptyState } from '../components/common';
import { FileText } from 'lucide-react';

// Phase 1 placeholder — replaced in Phase 4.
export default function MobileVoucherList() {
    return (
        <MobileScreen>
            <EmptyState icon={FileText} title="Vouchers" hint="Coming up next." />
        </MobileScreen>
    );
}
