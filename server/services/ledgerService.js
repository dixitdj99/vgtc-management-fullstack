const localStore = require('../utils/localStore');
const { db, admin, isAvailable } = require('../firebase');
const firebaseAvailable = () => isAvailable();

const COLLECTION_LEDGER = 'ledgers';
const COLLECTION_JOURNAL = 'journal_entries';

// A Ledger represents an account balance (e.g., Party X's account, Cash Account, Bank Account)
// A Journal Entry represents a transaction hitting one or more ledgers.

const firestoreCreateJournal = async (entry) => {
    const ref = db.collection(COLLECTION_JOURNAL).doc();
    const payload = {
        ...entry,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(payload);
    return { id: ref.id, ...payload };
};

const localCreateJournal = (entry) => {
    const payload = {
        ...entry,
        createdAt: new Date().toISOString()
    };
    return localStore.insert(COLLECTION_JOURNAL, payload);
};

/**
 * Creates a double-entry journal record.
 * @param {Object} data - { date, narration, referenceId, referenceType, lines: [{ accountId, accountType, debit, credit }] }
 */
const postJournalEntry = async (data) => {
    if (!data.lines || data.lines.length < 2) {
        throw new Error('A journal entry must have at least two lines for double-entry accounting.');
    }

    const totalDebit = data.lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
    const totalCredit = data.lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);

    // In a strict ERP, Debit must equal Credit. We'll enforce a loose check or strict check based on config later.
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
        // Warning or Error. For Phase 1, we might just log it to allow flexibility while migrating.
        console.warn(`[Ledger] Journal Entry imbalance: Dr ${totalDebit} != Cr ${totalCredit} for ref ${data.referenceId}`);
    }

    if (firebaseAvailable()) {
        return await firestoreCreateJournal(data);
    }
    return localCreateJournal(data);
};

const getJournalEntries = async (accountId) => {
    if (firebaseAvailable()) {
        // This requires a Firestore index on lines.accountId which might be tricky with arrays of objects.
        // For phase 1, we might just fetch all and filter, or redesign schema if scale is huge.
        // A better approach for scale: A separate collection for "Ledger Entries" tied to Journal IDs.
        const snapshot = await db.collection(COLLECTION_JOURNAL)
            .orderBy('createdAt', 'desc')
            .limit(1000)
            .get();
        const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (!accountId) return all;
        return all.filter(entry => entry.lines.some(l => l.accountId === accountId));
    }

    const all = localStore.getAll(COLLECTION_JOURNAL).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!accountId) return all;
    return all.filter(entry => entry.lines.some(l => l.accountId === accountId));
};

module.exports = {
    postJournalEntry,
    getJournalEntries
};
