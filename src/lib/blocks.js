let nextBlockId = 1;

export const BLOCK_TYPES = new Set(['text', 'code', 'diff', 'command', 'warning', 'tool_result']);

export function createBlock({ id = null, type = 'text', content = '', language = '', filename = '', syntaxHighlight = undefined, title = '', command = '', name = '', status = '', meta = {} } = {}) {
  const safeType = BLOCK_TYPES.has(type) ? type : 'text';
  return {
    id: id ?? `b_${String(nextBlockId++).padStart(5, '0')}`,
    type: safeType,
    content: String(content ?? ''),
    language: String(language ?? ''),
    filename: String(filename ?? ''),
    syntaxHighlight: typeof syntaxHighlight === 'boolean' ? syntaxHighlight : undefined,
    title: String(title ?? ''),
    command: String(command ?? ''),
    name: String(name ?? ''),
    status: String(status ?? ''),
    meta: meta && typeof meta === 'object' ? meta : {},
  };
}

export function normalizeBlock(raw) {
  if (typeof raw === 'string') return createBlock({ type: 'text', content: raw });
  if (!raw || typeof raw !== 'object') return createBlock({ type: 'text', content: '' });
  return createBlock(raw);
}

export function normalizeBlocks(rawBlocks) {
  if (!Array.isArray(rawBlocks)) return [];
  return rawBlocks.map(normalizeBlock);
}

export function appendBlockContent(block, chunk) {
  block.content = `${block.content ?? ''}${String(chunk ?? '')}`;
  return block;
}

export function blockToText(block) {
  const item = normalizeBlock(block);
  if (item.type === 'code') {
    const fence = item.language ? `\`\`\`${item.language}` : '```';
    return `${fence}\n${item.content}\n\`\`\``;
  }
  if (item.type === 'diff') return item.content;
  if (item.type === 'command') {
    const title = item.title ? `${item.title}\n` : '';
    return `${title}$ ${item.command || item.content}`.trim();
  }
  if (item.type === 'warning') return `Warning: ${item.content}`;
  if (item.type === 'tool_result') {
    const head = [item.name || 'tool', item.status].filter(Boolean).join(' · ');
    return `${head}\n${item.content}`.trim();
  }
  return item.content;
}

export function blocksToText(blocks = []) {
  if (!Array.isArray(blocks)) return '';
  return blocks.map(blockToText).filter(Boolean).join('\n\n');
}

export function ensureTextBlock(message) {
  if (!Array.isArray(message.blocks)) message.blocks = [];
  const last = message.blocks.at(-1);
  if (last?.type === 'text') return last;
  const block = createBlock({ type: 'text', content: '' });
  message.blocks.push(block);
  return block;
}


function blockView(block) {
  if (typeof block === 'string') return { type: 'text', content: block, language: '', filename: '', syntaxHighlight: undefined, title: '', command: '', name: '', status: '' };
  const raw = block && typeof block === 'object' ? block : {};
  const type = BLOCK_TYPES.has(raw.type) ? raw.type : 'text';
  return {
    type,
    content: String(raw.content ?? ''),
    language: String(raw.language ?? ''),
    filename: String(raw.filename ?? ''),
    syntaxHighlight: typeof raw.syntaxHighlight === 'boolean' ? raw.syntaxHighlight : undefined,
    title: String(raw.title ?? ''),
    command: String(raw.command ?? ''),
    name: String(raw.name ?? ''),
    status: String(raw.status ?? ''),
  };
}
