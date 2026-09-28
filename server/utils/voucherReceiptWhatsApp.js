const {
  DEFAULT_TEMPLATES,
  getWhatsAppConfig,
  interpolateTemplate,
  lookupProfilePhone,
  lookupVehicleInfo,
  sendEventNotification,
  sendWhatsAppImage,
  logWhatsAppActivity,
} = require('./whatsappService');

const BILL_TYPES = new Set(['Kosli_Bill', 'Jajjhar_Bill', 'Bahadurgarh_Bill']);

function digits(phone) {
  let value = String(phone || '').replace(/\D/g, '');
  if (value.length === 10) value = `91${value}`;
  if (value.startsWith('0') && value.length === 11) value = `91${value.slice(1)}`;
  return value.length >= 11 && value.length <= 15 ? value : '';
}

function amount(value) {
  return parseFloat(value) || 0;
}

function sourceFor(voucher) {
  if (voucher.source) return voucher.source;
  if (voucher.type === 'Kosli_Bill') return 'Kosli';
  if (voucher.type === 'Jajjhar_Bill') return 'Jhajjar';
  if (voucher.type === 'Bahadurgarh_Bill') return 'Bahadurgarh';
  return 'Jhajjar';
}

function templateDataFor(voucher) {
  const deliveries = Array.isArray(voucher.deliveries) ? voucher.deliveries : [];
  const hasDeliveries = deliveries.length > 0;
  const totalWeight = hasDeliveries
    ? deliveries.reduce((sum, row) => sum + amount(row.weight), 0)
    : amount(voucher.weight);
  const totalBags = hasDeliveries
    ? deliveries.reduce((sum, row) => sum + (parseInt(row.bags, 10) || 0), 0)
    : (parseInt(voucher.bags, 10) || 0);
  const gross = hasDeliveries
    ? deliveries.reduce((sum, row) => sum + amount(row.weight) * amount(row.rate), 0)
    : totalWeight * amount(voucher.rate);
  const isBill = BILL_TYPES.has(voucher.type);
  const dieselPending = !!voucher.advanceDiesel && Number.isNaN(parseFloat(voucher.advanceDiesel));
  const diesel = dieselPending ? 0 : amount(voucher.advanceDiesel);
  const cash = amount(voucher.advanceCash);
  const online = amount(voucher.advanceOnline);
  const munshi = isBill ? 0 : amount(voucher.munshi);
  const commission = amount(voucher.commission);
  const tyrePuncture = amount(voucher.tyrePuncture);
  const tyreGreasingAir = amount(voucher.tyreGreasing) + amount(voucher.tyreAir) + amount(voucher.tyreGreasingAir);
  const extraCash = amount(voucher.extraCash);
  const totalDeductions = diesel + cash + online + munshi + commission + tyrePuncture + tyreGreasingAir + extraCash;
  const lrNo = hasDeliveries
    ? deliveries.map(row => row.lrNo).filter(Boolean).join(', ') || voucher.lrNo || 'AUTO'
    : voucher.lrNo || 'AUTO';

  return {
    isBill,
    voucherNo: voucher.voucherNo || voucher.entryId || voucher.id || '',
    billNo: voucher.billNo || voucher.entryId || voucher.id || '',
    lrNo,
    date: voucher.date || new Date().toLocaleDateString('en-IN'),
    truckNo: voucher.truckNo || '',
    driverName: voucher.driverName || '-',
    partyName: voucher.partyName || '-',
    source: sourceFor(voucher),
    destination: voucher.destination || '-',
    rate: amount(voucher.rate).toFixed(0),
    totalWeight: totalWeight.toFixed(2),
    totalBags,
    grossFreight: gross.toFixed(0),
    advanceDiesel: dieselPending ? 'FULL (pending)' : diesel.toFixed(0),
    advanceCash: cash.toFixed(0),
    advanceOnline: online.toFixed(0),
    munshi: munshi.toFixed(0),
    commission: commission.toFixed(0),
    netBalance: (gross - totalDeductions).toFixed(0),
    paymentStatus: voucher.paymentStatus || (dieselPending ? 'Diesel amount pending' : 'Balance Pending'),
  };
}

function errorMessage(error) {
  return error?.response?.data?.error?.message
    || error?.response?.data?.error
    || error?.message
    || 'Unknown WhatsApp error';
}

/**
 * Sends the PNG captured from the actual browser print document. There is no
 * server redraw here: the bytes sent to Meta are the bytes made from the same
 * HTML that was opened in the print window.
 */
async function dispatchVoucherReceiptImage(voucher, imageBuffer, req) {
  const data = templateDataFor(voucher);
  const config = await getWhatsAppConfig(req);
  const vehicle = await lookupVehicleInfo(voucher.truckNo, req);
  const isSelf = vehicle?.ownershipType === 'self'
    || voucher.ownershipType === 'self'
    || voucher.isSelf === true;
  const driverPhone = vehicle?.driverContact
    || voucher.driverContact
    || await lookupProfilePhone(voucher.driverId || voucher.driverName || vehicle?.driverName, req)
    || '';
  const ownerPhone = vehicle?.ownerContact
    || voucher.ownerContact
    || await lookupProfilePhone(voucher.ownerId || voucher.ownerName || vehicle?.ownerName, req)
    || '';

  const customerRecipients = new Map();
  if (digits(driverPhone)) customerRecipients.set(digits(driverPhone), { phone: driverPhone, role: 'driver' });
  if (!isSelf && digits(ownerPhone)) customerRecipients.set(digits(ownerPhone), { phone: ownerPhone, role: 'owner' });

  if (!customerRecipients.size) {
    return {
      status: 'mobile_not_found',
      sentCount: 0,
      failedCount: 0,
      message: 'WhatsApp message not sent: mobile number not found for the driver or vehicle owner.',
    };
  }
  if (!config.enabled) {
    return {
      status: 'disabled',
      sentCount: 0,
      failedCount: 0,
      message: 'WhatsApp message not sent: WhatsApp is disabled in settings.',
    };
  }
  if (!config.phoneNumberId || !config.accessToken) {
    return {
      status: 'failed',
      sentCount: 0,
      failedCount: customerRecipients.size,
      error: 'Meta Cloud API credentials are not configured.',
    };
  }

  const recipients = new Map(customerRecipients);
  const adminPhone = config.adminPhone || '';
  if (digits(adminPhone) && !recipients.has(digits(adminPhone))) {
    recipients.set(digits(adminPhone), { phone: adminPhone, role: 'owner', admin: true });
  }

  const sent = [];
  const failed = [];
  const skipped = [];
  for (const recipient of recipients.values()) {
    const eventKey = data.isBill
      ? (recipient.role === 'driver' ? 'bill_created_driver' : 'bill_created_owner')
      : (recipient.role === 'driver' ? 'voucher_created_driver' : 'voucher_created_owner');
    const eventConfig = config.events?.[eventKey] || DEFAULT_TEMPLATES[eventKey];
    if (!eventConfig || eventConfig.enabled === false) {
      skipped.push({ role: recipient.role, reason: `${eventKey} template is disabled` });
      continue;
    }

    try {
      const caption = interpolateTemplate(eventConfig.template, data);
      await sendWhatsAppImage(recipient.phone, imageBuffer, caption, req, {
        fallbackToText: false,
        filename: data.isBill ? 'transport_bill.png' : 'freight_voucher.png',
      });
      sent.push({ role: recipient.admin ? 'admin' : recipient.role });
    } catch (error) {
      failed.push({ role: recipient.admin ? 'admin' : recipient.role, error: errorMessage(error) });
    }
  }

  logWhatsAppActivity({
    type: 'outbound',
    category: data.isBill ? 'bill_created' : 'voucher_created',
    phone: voucher.truckNo || '',
    status: failed.length ? 'failed' : 'sent',
    title: `${data.isBill ? 'Bill' : 'Voucher'} image #${data.billNo || data.voucherNo}`,
    details: `${sent.length} sent, ${failed.length} failed, ${skipped.length} skipped`,
    error: failed.map(item => item.error).join('; ') || null,
  });

  // This action alert is intentionally separate from the printed receipt copy.
  // Its result does not turn a successfully delivered receipt into a failure.
  if (sent.length && amount(voucher.advanceOnline) > 0) {
    const clerk = config.clerkPhone || config.adminPhone;
    if (clerk) await sendEventNotification('online_advance_clerk', data, [clerk], req);
  }

  if (sent.length && failed.length) {
    return {
      status: 'partial',
      sentCount: sent.length,
      failedCount: failed.length,
      error: failed.map(item => item.error).join('; '),
      message: `WhatsApp receipt sent to ${sent.length} recipient(s), but ${failed.length} delivery failed.`,
    };
  }
  if (sent.length) {
    return {
      status: 'sent',
      sentCount: sent.length,
      failedCount: 0,
      message: `WhatsApp ${data.isBill ? 'bill' : 'voucher'} image sent successfully.`,
    };
  }
  if (failed.length) {
    return {
      status: 'failed',
      sentCount: 0,
      failedCount: failed.length,
      error: failed.map(item => item.error).join('; '),
      message: 'WhatsApp receipt image failed to send.',
    };
  }
  return {
    status: 'disabled',
    sentCount: 0,
    failedCount: 0,
    message: skipped[0]?.reason || 'WhatsApp receipt template is disabled.',
  };
}

module.exports = { BILL_TYPES, dispatchVoucherReceiptImage, templateDataFor };
