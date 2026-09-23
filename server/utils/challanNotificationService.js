/**
 * challanNotificationService.js
 *
 * Handles WhatsApp alerts for Challan creation, Challan transfer (when another vehicle loads a challan),
 * delayed Challan linking to an LR, and vehicle-level Challan balance computations.
 */

const waService = require('./whatsappService');
const sendEventNotification = waService.sendEventNotification;
const lookupVehicleInfo = waService.lookupVehicleInfo;
const logWhatsAppActivity = waService.logWhatsAppActivity || (() => {});
const { db, isAvailable } = require('../firebase');
const localStore = require('./localStore');
const { getEnvPrefix } = require('./envConfig');

function getChallanCollections() {
    const prefix = getEnvPrefix();
    const base = ['challans', 'jkl_challans', 'kosli_challans', 'jhajjar_challans', 'bahadurgarh_challans'];
    if (!prefix) return base;
    return Array.from(new Set([...base.map(c => `${prefix}${c}`), ...base]));
}

const CHAL_COLS = getChallanCollections();

function cleanDigits(phone) {
    if (!phone) return '';
    let c = String(phone).replace(/\D/g, '');
    if (c.length === 10) c = '91' + c;
    return c;
}

function normalizeChallanMaterials(challan) {
    let mats = [];
    if (Array.isArray(challan.materials) && challan.materials.length > 0) {
        mats = challan.materials.map(m => ({
            type: m.type || 'Cement',
            totalBags: parseInt(m.totalBags || m.quantity || 0),
            loadedBags: parseInt(m.loadedBags || 0),
            remainingBags: Math.max(0, parseInt(m.totalBags || m.quantity || 0) - parseInt(m.loadedBags || 0))
        }));
    } else if (challan.material || challan.quantity) {
        const qty = parseInt(challan.quantity || 0);
        const loaded = parseInt(challan.loadedBags || 0);
        mats = [{
            type: challan.material || 'Cement',
            totalBags: qty,
            loadedBags: loaded,
            remainingBags: Math.max(0, qty - loaded)
        }];
    }

    const totalBags = mats.reduce((s, m) => s + m.totalBags, 0);
    const remainingBags = mats.reduce((s, m) => s + m.remainingBags, 0);
    const totalWeight = parseFloat((totalBags * 0.05).toFixed(2));
    const remainingWeight = parseFloat((remainingBags * 0.05).toFixed(2));

    const materialsText = mats.map(m => {
        const wt = (m.totalBags * 0.05).toFixed(2);
        return `${m.type}: ${m.totalBags} Bags (${wt} MT)`;
    }).join(', ') || 'Cement';

    const remainingMaterialsText = mats.map(m => {
        const wt = (m.remainingBags * 0.05).toFixed(2);
        return `${m.type}: ${m.remainingBags} Bags (${wt} MT)`;
    }).join(', ') || 'Cement';

    return { mats, totalBags, remainingBags, totalWeight, remainingWeight, materialsText, remainingMaterialsText };
}

/**
 * Dispatches a WhatsApp notification when a new Challan is created.
 */
async function dispatchChallanCreatedNotification(challanData, req) {
    try {
        if (!challanData || !challanData.truckNo) return;

        const { totalBags, totalWeight, materialsText } = normalizeChallanMaterials(challanData);
        const vInfo = await lookupVehicleInfo(challanData.truckNo, req);
        const ownerPhone = vInfo?.ownerContact || challanData.ownerContact || '';
        const driverPhone = vInfo?.driverContact || challanData.driverContact || '';

        const templateData = {
            challanNo: challanData.challanNo || '—',
            date: challanData.date || new Date().toISOString().slice(0, 10),
            truckNo: String(challanData.truckNo).toUpperCase(),
            partyName: challanData.partyName || '—',
            destination: challanData.destination || '—',
            materialsText,
            totalBags,
            totalWeight: totalWeight.toFixed(2)
        };

        const targetPhone = ownerPhone || driverPhone;
        if (!targetPhone) {
            console.log(`[WA-Challan] No phone for truck ${challanData.truckNo}, skipped WhatsApp alert.`);
            return;
        }

        await sendEventNotification('challan_created_owner', templateData, [targetPhone], req);
        console.log(`[WA-Challan] Challan #${challanData.challanNo} alert sent to ${targetPhone} for ${challanData.truckNo}`);

        logWhatsAppActivity({
            type: 'outbound',
            category: 'challan_created',
            phone: targetPhone,
            status: 'sent',
            title: `Challan #${challanData.challanNo} Issued`,
            details: `Challan #${challanData.challanNo} (${challanData.truckNo}) | ${totalWeight} MT (${totalBags} Bags)`
        });
    } catch (err) {
        console.error('[WA-Challan] Failed to dispatch challan creation alert:', err.message);
    }
}

/**
 * Dispatches an alert to the ORIGINAL vehicle owner when their challan is transferred to another vehicle.
 */
async function dispatchChallanTransferNotification({ challanNo, originalTruck, loadingTruck, lrNo, date, materialsText, totalBags, totalWeight }, req) {
    try {
        if (!originalTruck) return;
        const vInfo = await lookupVehicleInfo(originalTruck, req);
        const ownerPhone = vInfo?.ownerContact || '';

        if (!ownerPhone) {
            console.log(`[WA-Challan] No owner phone for original truck ${originalTruck}, transfer alert skipped.`);
            return;
        }

        const templateData = {
            challanNo: challanNo || '—',
            originalTruck: String(originalTruck).toUpperCase(),
            loadingTruck: String(loadingTruck).toUpperCase(),
            lrNo: lrNo || '—',
            date: date || new Date().toISOString().slice(0, 10),
            materialsText: materialsText || `${totalBags || 0} Bags (${totalWeight || 0} MT)`
        };

        await sendEventNotification('challan_transferred_original_owner', templateData, [ownerPhone], req);
        console.log(`[WA-Challan] Transfer alert for Challan #${challanNo} sent to ${originalTruck} owner (${ownerPhone})`);

        logWhatsAppActivity({
            type: 'outbound',
            category: 'challan_transferred',
            phone: ownerPhone,
            status: 'sent',
            title: `Challan #${challanNo} Transferred`,
            details: `Transferred from ${originalTruck} to ${loadingTruck} (LR #${lrNo})`
        });
    } catch (err) {
        console.error('[WA-Challan] Failed to dispatch transfer alert:', err.message);
    }
}

/**
 * Dispatches an alert when a challan is linked later to an existing LR.
 */
async function dispatchChallanLinkedNotification({ challanNo, truckNo, lrNo, date, materialsText }, req) {
    try {
        if (!truckNo) return;
        const vInfo = await lookupVehicleInfo(truckNo, req);
        const ownerPhone = vInfo?.ownerContact || '';

        if (!ownerPhone) return;

        const templateData = {
            challanNo: challanNo || '—',
            truckNo: String(truckNo).toUpperCase(),
            lrNo: lrNo || '—',
            date: date || new Date().toISOString().slice(0, 10),
            materialsText: materialsText || 'Cement'
        };

        await sendEventNotification('challan_linked_owner', templateData, [ownerPhone], req);
        console.log(`[WA-Challan] Link alert for Challan #${challanNo} sent to ${truckNo} owner (${ownerPhone})`);
    } catch (err) {
        console.error('[WA-Challan] Failed to dispatch challan link alert:', err.message);
    }
}

/**
 * Searches across all challan collections and updates the challan document
 * with loading vehicle attribution (`loadedByVehicle`, `transferredTo`, `lrNo`).
 */
async function updateChallanTransferRecord(challanNo, loadingTruck, lrNo, date, req) {
    if (!challanNo) return null;
    const cleanNo = String(challanNo).trim();
    const cleanLoadingTruck = String(loadingTruck).toUpperCase().replace(/\s+/g, '');

    try {
        if (isAvailable()) {
            for (const col of CHAL_COLS) {
                const snap = await db.collection(col)
                    .where('challanNo', '==', cleanNo)
                    .limit(1)
                    .get();

                if (!snap.empty) {
                    const doc = snap.docs[0];
                    const data = doc.data();
                    const origTruck = String(data.truckNo || '').toUpperCase().replace(/\s+/g, '');
                    const isTransfer = origTruck && origTruck !== cleanLoadingTruck;

                    const updates = {
                        loadedByVehicle: cleanLoadingTruck,
                        lrNo: String(lrNo || ''),
                        loadedDate: date || new Date().toISOString().slice(0, 10),
                        isTransferred: isTransfer
                    };
                    if (isTransfer) {
                        updates.transferredTo = cleanLoadingTruck;
                        updates.originalTruckNo = origTruck;
                    }

                    await doc.ref.update(updates);
                    return { ...data, id: doc.id, ...updates, originalTruck: data.truckNo, isTransfer };
                }
            }
        } else {
            for (const col of CHAL_COLS) {
                const all = localStore.getAll(col);
                const found = all.find(c => String(c.challanNo).trim() === cleanNo);
                if (found) {
                    const origTruck = String(found.truckNo || '').toUpperCase().replace(/\s+/g, '');
                    const isTransfer = origTruck && origTruck !== cleanLoadingTruck;

                    const updates = {
                        loadedByVehicle: cleanLoadingTruck,
                        lrNo: String(lrNo || ''),
                        loadedDate: date || new Date().toISOString().slice(0, 10),
                        isTransferred: isTransfer
                    };
                    if (isTransfer) {
                        updates.transferredTo = cleanLoadingTruck;
                        updates.originalTruckNo = origTruck;
                    }

                    localStore.update(col, found.id, updates);
                    return { ...found, ...updates, originalTruck: found.truckNo, isTransfer };
                }
            }
        }
    } catch (err) {
        console.error(`[WA-Challan] Error updating challan #${cleanNo} transfer record:`, err.message);
    }
    return null;
}

/**
 * Computes Challan Balances for all vehicles (or a specific truck).
 * Sums pending bags and MT for every open / partially_loaded challan.
 */
async function getVehicleChallanBalances(orgId, filterTruck = null) {
    const cleanFilter = filterTruck ? String(filterTruck).toUpperCase().replace(/\s+/g, '') : null;
    let allChallans = [];

    if (isAvailable()) {
        for (const col of CHAL_COLS) {
            try {
                let q = db.collection(col);
                if (orgId) q = q.where('orgId', '==', orgId);
                const snap = await q.get();
                snap.forEach(d => allChallans.push({ id: d.id, ...d.data(), _col: col }));
            } catch (_) {}
        }
    } else {
        for (const col of CHAL_COLS) {
            try {
                const items = localStore.getAll(col);
                allChallans = [...allChallans, ...(orgId ? items.filter(c => c.orgId === orgId) : items)];
            } catch (_) {}
        }
    }

    // Filter only active/pending challans (open or partially_loaded)
    const activeChallans = allChallans.filter(c => {
        const s = (c.status || 'open').toLowerCase();
        return s === 'open' || s === 'partially_loaded';
    });

    const vehicleMap = new Map();

    for (const chal of activeChallans) {
        const truck = String(chal.truckNo || 'UNASSIGNED').toUpperCase().replace(/\s+/g, '');
        if (cleanFilter && truck !== cleanFilter) continue;

        const { mats, remainingBags, remainingWeight } = normalizeChallanMaterials(chal);
        if (remainingBags <= 0) continue; // fully consumed

        if (!vehicleMap.has(truck)) {
            vehicleMap.set(truck, {
                truckNo: truck,
                openCount: 0,
                pendingBags: 0,
                pendingMT: 0,
                challans: []
            });
        }

        const vData = vehicleMap.get(truck);
        vData.openCount += 1;
        vData.pendingBags += remainingBags;
        vData.pendingMT = parseFloat((vData.pendingMT + remainingWeight).toFixed(2));
        vData.challans.push({
            id: chal.id,
            challanNo: chal.challanNo,
            date: chal.date,
            partyName: chal.partyName || '—',
            destination: chal.destination || '—',
            materials: mats,
            remainingBags,
            remainingMT: remainingWeight,
            status: chal.status || 'open'
        });
    }

    const balances = Array.from(vehicleMap.values()).sort((a, b) => b.pendingBags - a.pendingBags);
    const totalOpenChallans = balances.reduce((s, v) => s + v.openCount, 0);
    const totalPendingBags = balances.reduce((s, v) => s + v.pendingBags, 0);
    const totalPendingMT = parseFloat(balances.reduce((s, v) => s + v.pendingMT, 0).toFixed(2));

    return {
        balances,
        totalVehicles: balances.length,
        totalOpenChallans,
        totalPendingBags,
        totalPendingMT
    };
}

module.exports = {
    normalizeChallanMaterials,
    dispatchChallanCreatedNotification,
    dispatchChallanTransferNotification,
    dispatchChallanLinkedNotification,
    updateChallanTransferRecord,
    getVehicleChallanBalances
};
