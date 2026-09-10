const { ensureEntryIdsAll } = require('../utils/entryIdService');

async function run() {
    console.log('[Backfill] Starting 6-digit ID backfill for existing vouchers and cashbook entries...');
    try {
        const voucherCount = await ensureEntryIdsAll('vouchers');
        console.log(`[Backfill] Vouchers updated: ${voucherCount}`);

        const cashbookCount = await ensureEntryIdsAll('cashbook');
        console.log(`[Backfill] Cashbook entries updated: ${cashbookCount}`);

        console.log('[Backfill] Migration complete! All existing entries have assigned 6-digit IDs starting at 100001.');
    } catch (err) {
        console.error('[Backfill] Error during migration:', err);
    }
}

run();
