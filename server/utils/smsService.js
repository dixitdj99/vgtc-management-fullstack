/**
 * smsService.js — Legacy alias wrapper mapping SMS Service calls to WhatsApp Service.
 */

const whatsappService = require('./whatsappService');

module.exports = {
    getSmsConfig: whatsappService.getWhatsAppConfig,
    saveSmsConfig: whatsappService.saveWhatsAppConfig,
    sendSms: whatsappService.sendWhatsAppMessage,
    checkGatewayStatus: whatsappService.checkWhatsAppGatewayStatus,
    formatPhoneNumber: whatsappService.formatPhoneNumber,
    triggerEventSms: whatsappService.triggerEventWhatsApp,
    DEFAULT_TEMPLATES: whatsappService.DEFAULT_TEMPLATES
};
