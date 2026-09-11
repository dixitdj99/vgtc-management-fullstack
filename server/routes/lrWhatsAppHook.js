/**
 * lrWhatsAppHook.js
 *
 * Shared fire-and-forget WhatsApp notification hook for all LR route files
 * (lrRoutes, jhajjarLrRoutes, kosliLrRoutes, bahadurgarhLrRoutes, jklLrRoutes).
 *
 * Call dispatchLrNotification(lrData, req) AFTER res.json() is called.
 * It never throws, so it is safe in any context.
 *
 * Logic:
 *  - Admin: receives lr_created_owner alert (default admin: 8708032492)
 *  - Driver: receives lr_created_driver alert (trip info, drive safe)
 *  - Owner: receives lr_created_owner alert ONLY FOR MARKET VEHICLES.
 *           For SELF vehicles (ownershipType === 'self'), owner notification is SKIPPED.
 */

const { sendEventNotification, lookupVehicleInfo, getWhatsAppConfig } = require('../utils/whatsappService');

/**
 * Builds template data from an LR document and dispatches WhatsApp
 * notifications to driver, owner (market trucks only), and admin.
 *
 * @param {object} lrData   Merged { ...req.body, ...result }
 * @param {object} req      Express request object (for org context)
 */
async function dispatchLrNotification(lrData, req) {
    try {
        const materials = Array.isArray(lrData.materials) && lrData.materials.length > 0
            ? lrData.materials
            : [{ type: lrData.material || 'Cement', bags: lrData.bags || 0, weight: lrData.weight || 0 }];

        const totalBags   = materials.reduce((s, m) => s + (parseInt(m.bags)       || 0), 0);
        const totalWeight = materials.reduce((s, m) => s + (parseFloat(m.weight)   || 0), 0);
        const freight     = parseFloat(lrData.freight || 0);
        const materialsText = materials.map(m => `• ${m.type}: ${m.bags} Bags (${m.weight} MT)`).join('\n');

        const templateData = {
            lrNo:         lrData.lrNo,
            date:         lrData.date || new Date().toLocaleDateString('en-IN'),
            truckNo:      lrData.truckNo,
            source:       lrData.source || 'Jhajjar',
            destination:  lrData.destination,
            partyName:    lrData.partyName,
            materialsText,
            totalWeight:  totalWeight.toFixed(2),
            totalBags,
            freight,
            totalFreight: (freight * totalWeight).toFixed(0),
            billing:      lrData.billing || '—',
            remark:       lrData.remark  || '—',
        };

        const vInfo       = await lookupVehicleInfo(lrData.truckNo, req);
        const waCfg       = await getWhatsAppConfig(req);
        const adminPhone  = waCfg.adminPhone || '8708032492';

        const isSelf = (vInfo?.ownershipType === 'self') || (lrData.ownershipType === 'self') || (lrData.isSelf === true);
        const ownerPhone  = vInfo?.ownerContact || lrData.ownerContact || '';
        const driverPhone = vInfo?.driverContact || lrData.driverContact || '';

        // 1. Driver alert — sent to driver for all vehicles
        if (driverPhone) {
            await sendEventNotification('lr_created_driver', templateData, [driverPhone], req);
        }

        // 2. Owner alert — sent ONLY for market vehicles (skipped for self vehicles)
        if (!isSelf && ownerPhone) {
            await sendEventNotification('lr_created_owner', templateData, [ownerPhone], req);
        }

        // 3. Admin alert — sent to admin number (8708032492)
        if (adminPhone) {
            await sendEventNotification('lr_created_owner', templateData, [adminPhone], req);
        }
    } catch (e) {
        console.error('[WA-Hook] LR notify FAILED:', e.message);
    }
}

module.exports = { dispatchLrNotification };
