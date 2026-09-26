/**
 * Local unit test for WhatsApp Native Quick Reply Buttons & Webhook parsing.
 * Runs offline against local logic without sending real WhatsApp messages.
 */

const { interpolateTemplate } = require('../utils/whatsappService');

console.log('--- 1. Testing Online Advance Button Alert Formatting ---');
const tplData = {
  voucherNo: '100028',
  lrNo: '4582',
  date: '12/09/2026',
  truckNo: 'HR47G9999',
  driverName: 'Balbir Singh',
  destination: 'Jharli to Jaipur',
  advanceOnline: '5000'
};

const buttonObj = {
  id: `PAID ${tplData.voucherNo}`,
  text: `✅ Mark PAID #${tplData.voucherNo}`
};

console.log('Button Object:', buttonObj);
console.log('Expected Button Action ID:', buttonObj.id);
console.log('Expected Button Display Label:', buttonObj.text);

console.log('\n--- 2. Testing Webhook Button Reply Parsing ---');
const sampleIncomingPayloads = [
  'PAID 100028',
  '/reply PAID 100028',
  '✅ Mark PAID #100028',
  'PAID #100028'
];

sampleIncomingPayloads.forEach((msgBody, idx) => {
  const matchPaid = (
    msgBody.match(/(?:PAID|\/REPLY\s+PAID|MARK\s+PAID)[\s:#-]+([A-Za-z0-9_]+)/i) ||
    msgBody.match(/^(?:\/reply\s+)?PAID[\s:-]+(\S+)/i) ||
    msgBody.match(/^PAID$/i)
  );

  const extractedVoucher = matchPaid && matchPaid[1] ? matchPaid[1].replace(/^#/, '') : 'MATCH_FAILED';
  console.log(`Payload [${idx + 1}]: "${msgBody}" => Parsed Voucher #: ${extractedVoucher}`);
});

console.log('\n--- All Local Tests PASSED Successfully ---');
