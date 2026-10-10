const crypto = require('crypto');
const { db, isAvailable } = require('../firebase');
const { getEnvCol } = require('./collectionUtils');
const localStore = require('./localStore');

const MESSAGES = 'whatsapp_inbox_messages';
const CONVERSATIONS = 'whatsapp_inbox_conversations';
const normalizePhone = phone => String(phone || '').replace(/\D/g, '');
const idFor = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const messageDocId = metaId => idFor(metaId);
const conversationDocId = phone => idFor(normalizePhone(phone));
const collection = name => getEnvCol(name);
const canReply = (conversation, now = Date.now()) => {
  const lastInbound = Date.parse(conversation?.lastInboundAt || '');
  return Number.isFinite(lastInbound) && lastInbound <= now && now - lastInbound < 24 * 60 * 60 * 1000;
};

function extractInbound(metaMessage, contact) {
  const type = String(metaMessage?.type || 'unknown');
  const interactive = metaMessage?.interactive || {};
  const text = type === 'text' ? metaMessage.text?.body
    : type === 'button' ? (metaMessage.button?.text || metaMessage.button?.payload)
    : type === 'interactive' ? (interactive.button_reply?.title || interactive.button_reply?.id || interactive.list_reply?.title || interactive.list_reply?.id)
    : ['image', 'video', 'audio', 'document', 'sticker'].includes(type)
      ? (metaMessage[type]?.caption || `[${type === 'document' ? metaMessage.document?.filename || 'Document' : type}]`)
      : `[${type} message]`;
  const phone = normalizePhone(metaMessage?.from);
  const timestamp = /^\d+$/.test(String(metaMessage?.timestamp || ''))
    ? new Date(Number(metaMessage.timestamp) * 1000).toISOString()
    : new Date().toISOString();
  return {
    id: messageDocId(metaMessage.id), metaId: metaMessage.id, phone,
    name: String(contact?.profile?.name || '').trim(), direction: 'inbound', type,
    text: String(text || '').trim(), timestamp, status: 'received',
    mediaId: metaMessage?.[type]?.id || null,
    mimeType: metaMessage?.[type]?.mime_type || null,
  };
}

function summaryFor(previous, message, inbound) {
  const recent = !previous?.lastTimestamp || message.timestamp >= previous.lastTimestamp;
  return {
    ...previous,
    id: conversationDocId(message.phone), phone: message.phone,
    name: message.name || previous?.name || message.phone,
    lastMessage: recent ? message.text : previous.lastMessage,
    lastTimestamp: recent ? message.timestamp : previous.lastTimestamp,
    lastInboundAt: inbound && (!previous?.lastInboundAt || message.timestamp > previous.lastInboundAt)
      ? message.timestamp : (previous?.lastInboundAt || null),
    unreadCount: (previous?.unreadCount || 0) + (inbound && (!previous?.readAt || message.timestamp > previous.readAt) ? 1 : 0),
  };
}

async function saveMessage(message) {
  if (!message?.metaId || !message?.phone) return { inserted: false };
  const msg = { ...message, phone: normalizePhone(message.phone), id: messageDocId(message.metaId) };
  const conversationId = conversationDocId(msg.phone);
  if (!isAvailable()) {
    if (localStore.getById(MESSAGES, msg.id)) return { inserted: false };
    localStore.upsert(MESSAGES, msg.id, msg);
    const previous = localStore.getById(CONVERSATIONS, conversationId);
    localStore.upsert(CONVERSATIONS, conversationId, summaryFor(previous, msg, msg.direction === 'inbound'));
    return { inserted: true, message: msg };
  }
  const messageRef = db.collection(collection(MESSAGES)).doc(msg.id);
  const conversationRef = db.collection(collection(CONVERSATIONS)).doc(conversationId);
  return db.runTransaction(async transaction => {
    const [existing, conversation] = await Promise.all([transaction.get(messageRef), transaction.get(conversationRef)]);
    if (existing.exists) return { inserted: false };
    transaction.set(messageRef, msg);
    transaction.set(conversationRef, summaryFor(conversation.exists ? conversation.data() : null, msg, msg.direction === 'inbound'));
    return { inserted: true, message: msg };
  });
}

async function saveInbound(metaMessage, contact) {
  if (!metaMessage?.id || !normalizePhone(metaMessage.from)) return { inserted: false };
  return saveMessage(extractInbound(metaMessage, contact));
}

async function saveOutbound(result, phone, { text = '', type = 'text', name = '', mediaId = null } = {}) {
  const metaId = result?.messages?.[0]?.id;
  if (!metaId) return { inserted: false };
  return saveMessage({ metaId, phone: normalizePhone(phone), name, direction: 'outbound', type,
    text: String(text || ''), timestamp: new Date().toISOString(), status: 'accepted', mediaId });
}

async function updateStatus(delivery) {
  if (!delivery?.id) return;
  const id = messageDocId(delivery.id);
  const patch = { status: delivery.status || 'unknown', statusUpdatedAt: new Date().toISOString(),
    error: delivery.errors?.[0]?.error_data?.details || delivery.errors?.[0]?.message || null };
  if (!isAvailable()) {
    if (localStore.getById(MESSAGES, id)) localStore.update(MESSAGES, id, patch);
    return;
  }
  const ref = db.collection(collection(MESSAGES)).doc(id);
  const snapshot = await ref.get();
  if (snapshot.exists) await ref.update(patch);
}

async function listConversations() {
  const items = !isAvailable() ? localStore.getAll(CONVERSATIONS)
    : (await db.collection(collection(CONVERSATIONS)).get()).docs.map(doc => doc.data());
  return items.sort((a, b) => String(b.lastTimestamp || '').localeCompare(String(a.lastTimestamp || '')));
}

async function getMessages(phone) {
  const normalized = normalizePhone(phone);
  const items = !isAvailable() ? localStore.getAll(MESSAGES).filter(item => item.phone === normalized)
    : (await db.collection(collection(MESSAGES)).where('phone', '==', normalized).get()).docs.map(doc => doc.data());
  return items.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
}

async function getConversation(phone) {
  const id = conversationDocId(phone);
  if (!isAvailable()) return localStore.getById(CONVERSATIONS, id);
  const snapshot = await db.collection(collection(CONVERSATIONS)).doc(id).get();
  return snapshot.exists ? snapshot.data() : null;
}

async function markRead(phone) {
  const id = conversationDocId(phone);
  const readAt = new Date().toISOString();
  if (!isAvailable()) {
    const existing = localStore.getById(CONVERSATIONS, id);
    if (!existing) return null;
    return localStore.upsert(CONVERSATIONS, id, { unreadCount: 0, readAt });
  }
  const ref = db.collection(collection(CONVERSATIONS)).doc(id);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    transaction.update(ref, { unreadCount: 0, readAt });
    return { ...snapshot.data(), unreadCount: 0, readAt };
  });
}

module.exports = { normalizePhone, canReply, extractInbound, saveInbound, saveOutbound, updateStatus, listConversations, getMessages, getConversation, markRead };
