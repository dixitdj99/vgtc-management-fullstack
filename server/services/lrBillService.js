const BILL_TYPE_BY_LR_COLLECTION = {
    kosli_loading_receipts: 'Kosli_Bill',
    jhajjar_loading_receipts: 'Jajjhar_Bill',
    bahadurgarh_loading_receipts: 'Bahadurgarh_Bill',
};

function billTypeForCollection(collection = '') {
    const col = String(collection).toLowerCase();
    for (const [key, type] of Object.entries(BILL_TYPE_BY_LR_COLLECTION)) {
        if (col.includes(key.toLowerCase()) || col.endsWith(key.toLowerCase())) return type;
    }
    return null;
}

function voucherCollectionForLr(collection = '') {
    const col = String(collection);
    const colLower = col.toLowerCase();
    for (const key of Object.keys(BILL_TYPE_BY_LR_COLLECTION)) {
        const idx = colLower.indexOf(key.toLowerCase());
        if (idx !== -1) {
            const prefix = col.slice(0, idx);
            return `${prefix}vouchers`;
        }
    }
    return 'vouchers';
}

function validateBillDetails(data, options = {}) {
    if (!options.required) return;
    const fail = message => { const error = new Error(message); error.status = 400; throw error; };
    if (!String(data?.billNo || '').trim()) fail('Bill number is required');
    if (!String(data?.partyCode || '').trim()) fail('Party code is required');
}

function billLrNumbers(bill) {
    const numbers = String(bill?.lrNo || '').split(',').map(value => value.trim()).filter(Boolean);
    for (const delivery of bill?.deliveries || []) {
        if (delivery?.lrNo) numbers.push(String(delivery.lrNo).trim());
    }
    return [...new Set(numbers)];
}

async function buildBillFromLr(orgId, data, { lrNo, lrNos, entryId, sourceLrId, type }) {
    const numbers = lrNos?.length ? lrNos : [lrNo];
    const bags = data.materials.reduce((sum, material) => sum + Number(material.bags || 0), 0);
    const weight = data.materials.reduce((sum, material) => sum + Number(material.weight || 0), 0);
    const deliveries = data.materials.map((material, index) => {
        const destination = material.destination || data.destination || '';
        return {
            lrNo: String(numbers[index] ?? numbers[0]),
            destination,
            partyName: material.partyName || data.partyName || '',
            material: material.type,
            bags: String(Number(material.bags || 0)),
            weight: Number(material.weight || 0).toFixed(2),
            rate: '',
        };
    });
    const uniqueDestinations = [...new Set(deliveries.map(delivery => delivery.destination).filter(Boolean))];
    return {
        orgId,
        type,
        brand: 'jksuper',
        sourceLrId,
        lrEntryId: entryId,
        entryId,
        lrNo: numbers.map(String).join(', '),
        billNo: String(data.billNo || '').trim() || String(numbers[0]),
        partyCode: String(data.partyCode || '').trim(),
        partyName: data.partyName || data.materials.find(m => m.partyName)?.partyName || '',
        truckNo: data.truckNo,
        driverName: data.driverName || '',
        driverContact: data.driverContact || '',
        ownerName: data.ownerName || '',
        ownerContact: data.ownerContact || '',
        ownershipType: data.ownershipType || '',
        source: data.source || '',
        destination: uniqueDestinations.join(', '),
        date: data.date || new Date().toISOString().slice(0, 10),
        weight: weight.toFixed(2),
        bags: String(bags),
        materials: data.materials.map(m => ({
            type: m.type,
            bags: Number(m.bags),
            weight: Number(m.weight),
            destination: m.destination || data.destination || ''
        })),
        deliveries,
        materialName: [...new Set(data.materials.map(m => m.type))].join(', '),
        rate: '',
        hasCommission: true,
        commission: Number((bags * 1.5).toFixed(2)),
        munshi: 0,
        paymentStatus: 'Balance Pending',
        createdBy: data.createdBy || '',
        createdByName: data.createdByName || '',
    };
}

module.exports = { billTypeForCollection, voucherCollectionForLr, validateBillDetails, billLrNumbers, buildBillFromLr };
