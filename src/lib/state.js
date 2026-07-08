import { appendBlockContent, blockToText, blocksToText, createBlock, ensureTextBlock, normalizeBlocks } from './blocks.js';

const MESSAGE_LIMIT = 500;

let nextMessageId = 1;

export function createMessage({ role, content = '', blocks = null, status = 'complete', meta = {}, createdAt = new Date().toISOString(), id = null } = {}) {
  const normalizedBlocks = normalizeBlocks(blocks);
  const message = {
    id: id ?? `m_${String(nextMessageId++).padStart(5, '0')}`,
    role,
    content: normalizedBlocks.length ? blocksToText(normalizedBlocks) : String(content ?? ''),
    blocks: normalizedBlocks,
    status,
    createdAt,
    updatedAt: createdAt,
    meta,
  };

  syncMessageCounter(message.id);
  return message;
}

export function appendMessageChunk(message, chunk) {
  const text = String(chunk ?? '');
  message.content += text;
  if (Array.isArray(message.blocks)) {
    appendBlockContent(ensureTextBlock(message), text);
  }
  message.updatedAt = new Date().toISOString();
  return message;
}

export function appendMessageBlock(message, block) {
  const normalized = createBlock(block);
  if (!Array.isArray(message.blocks)) message.blocks = [];
  message.blocks.push(normalized);
  const text = blockToText(normalized);
  if (text) {
    message.content += message.content ? `\n\n${text}` : text;
  }
  message.updatedAt = new Date().toISOString();
  return normalized;
}

export function setMessageBlocks(message, blocks = []) {
  message.blocks = normalizeBlocks(blocks);
  message.content = blocksToText(message.blocks);
  message.updatedAt = new Date().toISOString();
  return message;
}

export function completeMessage(message, status = 'complete') {
  message.status = status;
  message.updatedAt = new Date().toISOString();
  return message;
}

export function trimMessages(messages, limit = MESSAGE_LIMIT) {
  if (messages.length <= limit) return messages;
  return messages.slice(-limit);
}

export function normalizeMessages(rawMessages = []) {
  if (!Array.isArray(rawMessages)) return [];
  return rawMessages
    .filter((item) => item && typeof item === 'object')
    .map((item) => createMessage({
      id: typeof item.id === 'string' ? item.id : null,
      role: typeof item.role === 'string' ? item.role : 'system',
      content: typeof item.content === 'string' ? item.content : String(item.content ?? ''),
      blocks: Array.isArray(item.blocks) ? item.blocks : null,
      status: typeof item.status === 'string' ? item.status : 'complete',
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      meta: item.meta && typeof item.meta === 'object' ? item.meta : {},
    }));
}

export function visibleConversationMessages(messages) {
  return messages.filter((message) => message.role === 'user' || message.role === 'assistant');
}

export function lastUserMessage(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return messages[index];
  }
  return null;
}

export function lastAssistantMessage(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') return messages[index];
  }
  return null;
}

function syncMessageCounter(id) {
  const match = /^m_(\d+)$/.exec(id ?? '');
  if (!match) return;
  nextMessageId = Math.max(nextMessageId, Number(match[1]) + 1);
}
