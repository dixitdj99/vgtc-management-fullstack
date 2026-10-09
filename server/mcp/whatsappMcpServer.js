/**
 * whatsappMcpServer.js
 *
 * Local Model Context Protocol (MCP) Stdio Server for WhatsApp Business Tools.
 * Communicates directly with Meta WhatsApp Cloud API using Vikas Goods Transport Co
 * verified credentials, providing real-time diagnostics, template inspection, and message sending.
 */

// Redirect console.log to stderr so stdout is strictly reserved for JSON-RPC MCP messages
console.log = (...args) => console.error(...args);

const readline = require('readline');
const axios = require('axios');
const path = require('path');
const { getWhatsAppConfig } = require('../utils/whatsappService');

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false
});

function sendResponse(id, result) {
  const payload = {
    jsonrpc: '2.0',
    id,
    result
  };
  process.stdout.write(JSON.stringify(payload) + '\n');
}

function sendError(id, code, message) {
  const payload = {
    jsonrpc: '2.0',
    id,
    error: { code, message }
  };
  process.stdout.write(JSON.stringify(payload) + '\n');
}

const TOOLS = [
  {
    name: 'whatsapp_biz_businesses',
    description: 'List the businesses and WhatsApp accounts you administer.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'whatsapp_biz_phone_numbers',
    description: 'List the phone numbers on the business with live status, quality rating, and onboarding verification state.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'whatsapp_biz_list_templates',
    description: 'List and inspect all approved WhatsApp message templates on the business account.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'whatsapp_biz_send_message',
    description: 'Send an approved template message or free-form text to a recipient via Meta Cloud API.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient phone number (e.g. 918708032492)' },
        templateName: { type: 'string', description: 'Template name (e.g. hello, 3p_direct_integration_test_template)' },
        message: { type: 'string', description: 'Text message body if not using template' }
      },
      required: ['to']
    }
  },
  {
    name: 'whatsapp_biz_accounts',
    description: 'List the WhatsApp Business accounts (WABA) and messaging accounts under the business.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'whatsapp_biz_verify_business',
    description: 'Check business verification status and steps required to unlock full live messaging.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'whatsapp_biz_system_user_token',
    description: 'Inspect System User token status, permissions, and direct deep-links for Business Manager.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'whatsapp_biz_check_delivery_issue',
    description: 'Run deep diagnostic checks on why WhatsApp messages are not delivering.',
    inputSchema: {
      type: 'object',
      properties: {
        recipientPhone: { type: 'string', description: 'Phone number to test diagnostics for' }
      }
    }
  }
];

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request;
  try {
    request = JSON.parse(trimmed);
  } catch (err) {
    sendError(null, -32700, 'Parse error');
    return;
  }

  const { id, method, params } = request;

  try {
    if (method === 'initialize') {
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'whatsapp_business_tools',
          version: '1.0.0'
        }
      });
      return;
    }

    if (method === 'notifications/initialized') {
      // Notification, no response needed
      return;
    }

    if (method === 'tools/list') {
      sendResponse(id, { tools: TOOLS });
      return;
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const args = params?.arguments || {};
      const config = await getWhatsAppConfig();

      if (toolName === 'whatsapp_biz_businesses') {
        const url = `https://graph.facebook.com/v20.0/${config.wabaId}?fields=id,name,currency,timezone_id`;
        const res = await axios.get(url, { headers: { Authorization: `Bearer ${config.accessToken}` } });
        sendResponse(id, {
          content: [{
            type: 'text',
            text: JSON.stringify({
              business: 'Vikas Goods Transport Co',
              wabaId: config.wabaId,
              phoneNumberId: config.phoneNumberId,
              status: 'See live Meta fields below',
              details: res.data
            }, null, 2)
          }]
        });
        return;
      }

      if (toolName === 'whatsapp_biz_phone_numbers') {
        const url = `https://graph.facebook.com/v20.0/${config.phoneNumberId}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating,status,name_status,messaging_limit_tier`;
        const res = await axios.get(url, { headers: { Authorization: `Bearer ${config.accessToken}` } });
        sendResponse(id, {
          content: [{
            type: 'text',
            text: JSON.stringify(res.data, null, 2)
          }]
        });
        return;
      }

      if (toolName === 'whatsapp_biz_list_templates') {
        const url = `https://graph.facebook.com/v20.0/${config.wabaId}/message_templates?fields=name,status,category,language,components`;
        const res = await axios.get(url, { headers: { Authorization: `Bearer ${config.accessToken}` } });
        sendResponse(id, {
          content: [{
            type: 'text',
            text: JSON.stringify(res.data?.data || [], null, 2)
          }]
        });
        return;
      }

      if (toolName === 'whatsapp_biz_send_message') {
        const { to, templateName, message } = args;
        const cleanTo = String(to).replace(/\D/g, '');
        const recipient = cleanTo.length === 10 ? '91' + cleanTo : cleanTo;

        const url = `https://graph.facebook.com/v20.0/${config.phoneNumberId}/messages`;
        let payload;

        if (templateName) {
          const lang = templateName === 'hello' ? 'en' : 'en_US';
          let components = undefined;
          if (templateName === 'hello') {
            components = [{
              type: 'body',
              parameters: [
                { type: 'text', text: '1001' },
                { type: 'text', text: '501' },
                { type: 'text', text: new Date().toLocaleDateString('en-IN') },
                { type: 'text', text: 'HR55AA1234' },
                { type: 'text', text: 'Jharli' },
                { type: 'text', text: 'Rewari' },
                { type: 'text', text: 'Cement' },
                { type: 'text', text: '25' }
              ]
            }];
          }
          payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipient,
            type: 'template',
            template: {
              name: templateName,
              language: { code: lang },
              components
            }
          };
        } else {
          payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipient,
            type: 'text',
            text: { body: message || 'Test from VGTC WhatsApp MCP' }
          };
        }

        const res = await axios.post(url, payload, {
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        sendResponse(id, {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'Accepted by Meta',
              recipient,
              metaResponse: res.data
            }, null, 2)
          }]
        });
        return;
      }

      if (toolName === 'whatsapp_biz_accounts') {
        const url = `https://graph.facebook.com/v20.0/${config.wabaId}?fields=id,name,currency,timezone_id,message_template_namespace`;
        const res = await axios.get(url, { headers: { Authorization: `Bearer ${config.accessToken}` } });
        sendResponse(id, {
          content: [{
            type: 'text',
            text: JSON.stringify({
              wabaId: config.wabaId,
              account: res.data
            }, null, 2)
          }]
        });
        return;
      }

      if (toolName === 'whatsapp_biz_verify_business') {
        sendResponse(id, {
          content: [{
            type: 'text',
            text: JSON.stringify({
              businessName: 'Vikas Goods Transport Co',
              wabaId: config.wabaId,
              verificationStatus: 'Not checked by this tool',
              appStatus: 'Not checked by this tool',
              actionRequired: 'Inspect current status in Meta dashboard',
              dashboardUrl: 'https://developers.facebook.com/apps/1429699755807939/dashboard/'
            }, null, 2)
          }]
        });
        return;
      }

      if (toolName === 'whatsapp_biz_system_user_token') {
        sendResponse(id, {
          content: [{
            type: 'text',
            text: JSON.stringify({
              tokenType: 'Permanent System User Access Token',
              status: 'Not checked by this tool',
              tokenConfigured: Boolean(config.accessToken),
              businessSettingsUrl: 'https://business.facebook.com/settings/system-users'
            }, null, 2)
          }]
        });
        return;
      }

      if (toolName === 'whatsapp_biz_check_delivery_issue') {
        const phoneUrl = `https://graph.facebook.com/v20.0/${config.phoneNumberId}?fields=display_phone_number,verified_name,code_verification_status,status,quality_rating`;
        const phoneRes = await axios.get(phoneUrl, { headers: { Authorization: `Bearer ${config.accessToken}` } });

        const subscriptionsUrl = `https://graph.facebook.com/v20.0/${config.wabaId}/subscribed_apps`;
        const subscriptionsRes = await axios.get(subscriptionsUrl, { headers: { Authorization: `Bearer ${config.accessToken}` } });

        const diagnostic = {
          sender: phoneRes.data,
          subscribedApps: subscriptionsRes.data?.data || [],
          analysis: [
            'Phone status and subscription above are live Meta results.',
            'An HTTP 200 send response means Meta accepted the request, not that the recipient received it.',
            'Correlate the returned message ID with a messages webhook status; inspect failed errors if present.',
            'Freeform text requires an open customer service window; otherwise use an approved template.',
            'Check current app mode and any account restrictions in Meta dashboard; this tool does not infer them.'
          ]
        };

        sendResponse(id, {
          content: [{
            type: 'text',
            text: JSON.stringify(diagnostic, null, 2)
          }]
        });
        return;
      }

      sendError(id, -32601, `Unknown tool: ${toolName}`);
      return;
    }

    sendError(id, -32601, `Method not found: ${method}`);
  } catch (err) {
    sendResponse(id, {
      isError: true,
      content: [{
        type: 'text',
        text: `Error executing ${method}: ${err.response?.data?.error?.message || err.message}`
      }]
    });
  }
});
