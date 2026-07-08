import { visibleLength, truncateVisible } from '../ansi.js';
import { Box, Column, Panel, Row, Text } from './node.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function SelectList({
  title = 'Select',
  items = [],
  selectedIndex = 0,
  windowSize = 8,
  emptyText = 'No items.',
  getLabel = defaultLabel,
  getDescription = defaultDescription,
  getDisabled = defaultDisabled,
} = {}) {
  const normalized = items.map((item, index) => normalizeItem(item, index, { getLabel, getDescription, getDisabled }));
  const selected = clamp(selectedIndex, 0, Math.max(0, normalized.length - 1));
  const size = Math.max(1, Number(windowSize) || 1);
  const start = Math.max(0, Math.min(selected - Math.floor(size / 2), Math.max(0, normalized.length - size)));
  const visible = normalized.slice(start, start + size);
  const titleSuffix = normalized.length ? `${selected + 1}/${normalized.length}` : '0/0';
  const rows = [];

  if (start > 0) rows.push(Text(`  ↑ ${start} more`));

  if (!visible.length) {
    rows.push(Text(`  ${emptyText}`));
  } else {
    rows.push(...visible.map((item) => Text(formatSelectRow(item, item.index === selected))));
  }

  const remaining = normalized.length - (start + visible.length);
  if (remaining > 0) rows.push(Text(`  ↓ ${remaining} more`));

  return Box({ border: true, padding: { left: 1, right: 1 }, title: ` ${title} ${titleSuffix} ` }, ...rows);
}

export function ConfirmPrompt({
  title = ' Confirm ',
  message = 'Continue?',
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  selected = 'confirm',
} = {}) {
  return Box({ border: true, padding: 1, title },
    Text(message),
    Row({ gap: 3 },
      Text(`${selected === 'confirm' ? '›' : ' '} ${confirmLabel}`),
      Text(`${selected === 'cancel' ? '›' : ' '} ${cancelLabel}`),
    ),
    Text('←/→ switch · Enter accept · Esc cancel'),
  );
}

export function Modal({ title = ' Modal ', children = [], footer = '' } = {}) {
  const nodes = normalizeRenderableChildren(children);
  if (footer) nodes.push(Text(''), Text(footer));
  return Box({ border: true, padding: 1, title }, ...nodes);
}

export function Toast({ level = 'info', message = '' } = {}) {
  const safeLevel = ['info', 'success', 'warning', 'error'].includes(level) ? level : 'info';
  const icon = { info: 'i', success: '✓', warning: '!', error: '×' }[safeLevel];
  return Box({ border: true, padding: { left: 1, right: 1 }, title: ` ${safeLevel} ` }, Text(`${icon} ${message}`));
}

export function ProgressBar({ value = 0, total = 100, width = 24, label = '' } = {}) {
  const safeTotal = Number(total) > 0 ? Number(total) : 100;
  const ratio = clamp(Number(value) / safeTotal, 0, 1);
  const barWidth = Math.max(1, Number(width) || 1);
  const filled = Math.round(ratio * barWidth);
  const bar = '#'.repeat(filled) + '-'.repeat(Math.max(0, barWidth - filled));
  const pct = `${Math.round(ratio * 100)}%`;
  const prefix = label ? `${label} ` : '';
  return Text(`${prefix}[${bar}] ${pct}`);
}

export function Spinner({ frame = 0, label = '' } = {}) {
  const glyph = SPINNER_FRAMES[mod(Number(frame) || 0, SPINNER_FRAMES.length)];
  return Text(`${glyph}${label ? ` ${label}` : ''}`);
}

export function HelpOverlay({ title = ' Help ', shortcuts = [] } = {}) {
  const rows = shortcuts.map(([key, description]) => Text(`${String(key).padEnd(14)} ${description}`));
  return Panel(title, ...(rows.length ? rows : [Text('No shortcuts registered.')]));
}

function normalizeRenderableChildren(children) {
  const list = Array.isArray(children) ? children : [children];
  return list.flat(Infinity)
    .filter((item) => item !== null && item !== undefined && item !== false)
    .map((item) => typeof item === 'string' || typeof item === 'number' ? Text(String(item)) : item);
}

function normalizeItem(item, index, accessors) {
  return {
    item,
    index,
    label: String(accessors.getLabel(item, index) ?? ''),
    description: String(accessors.getDescription(item, index) ?? ''),
    disabled: Boolean(accessors.getDisabled(item, index)),
  };
}

function defaultLabel(item) {
  if (typeof item === 'string' || typeof item === 'number') return String(item);
  return item?.label ?? item?.title ?? item?.id ?? item?.name ?? '';
}

function defaultDescription(item) {
  if (!item || typeof item !== 'object') return '';
  return item.description ?? item.detail ?? '';
}

function defaultDisabled(item) {
  return Boolean(item && typeof item === 'object' && item.disabled);
}

function formatSelectRow(item, selected) {
  const marker = selected ? '›' : ' ';
  const disabled = item.disabled ? '·' : ' ';
  const base = `${marker}${disabled} ${item.label}`;
  if (!item.description) return base;
  return `${base} — ${item.description}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function mod(value, size) {
  return ((value % size) + size) % size;
}

export function fitInline(value, width) {
  const text = String(value ?? '');
  if (visibleLength(text) <= width) return text + ' '.repeat(Math.max(0, width - visibleLength(text)));
  return truncateVisible(text, Math.max(0, width - 1)) + '…';
}

export function Badge({ label = '', tone = '', width = 0 } = {}) {
  const text = tone ? `[${String(label)}]` : String(label);
  return Text(width ? fitInline(text, width) : text);
}

export function SectionTabs({ tabs = [], active = '', getLabel = (tab) => tab.label ?? tab.id ?? String(tab), gap = 2 } = {}) {
  const parts = tabs.map((tab) => {
    const id = tab.id ?? tab.value ?? String(tab);
    const label = tab.label ?? id;
    const icon = tab.icon ? `${tab.icon} ` : '';
    return id === active ? `▣ ${icon}${label}` : `□ ${icon}${label}`;
  });
  return Text(parts.join(' '.repeat(gap)), { wrap: false });
}

export function CommandBar({ value = '', suggestions = [], mode = 'COMMAND', hint = 'TAB next', prompt = '/' } = {}) {
  const suggestionLine = suggestions.length ? suggestions.join('   ') : '';
  return Box({ border: true, padding: { left: 1, right: 1 }, title: ` ${mode} ` },
    Text(`${prompt} ${value ?? ''}`, { wrap: false }),
    suggestionLine ? Text(`${suggestionLine}${hint ? `     ${hint}` : ''}`, { wrap: false }) : null,
  );
}

export function FooterStatusBar({ left = [], right = [] } = {}) {
  const lhs = left.filter(Boolean).join('  │  ');
  const rhs = right.filter(Boolean).join('  │  ');
  return Text(`${lhs}${rhs ? `  │  ${rhs}` : ''}`, { wrap: false });
}

export function PropertyRows({ title = ' Properties ', rows = [] } = {}) {
  return Box({ border: true, padding: { left: 1, right: 1 }, title },
    ...rows.map(([key, value]) => Text(`${String(key).padEnd(12)} ${value}`, { wrap: false })),
  );
}

export function ChipLine({ label = '', chips = [], active = '', getLabel = (chip) => chip.label ?? chip.id ?? String(chip) } = {}) {
  const parts = chips.map((chip) => {
    const id = chip.id ?? chip.value ?? String(chip);
    const name = getLabel(chip);
    return id === active ? `[${name}]` : ` ${name} `;
  });
  return Text(`${label}${label ? ' ' : ''}${parts.join('  ')}`, { wrap: false });
}

export function renderTextEditorLines({
  value = '',
  cursor = 0,
  width = 80,
  height = 8,
  lineNumbers = true,
  placeholder = '',
  cursorGlyph = '█',
} = {}) {
  const safeWidth = Math.max(8, Number(width) || 80);
  const safeHeight = Math.max(1, Number(height) || 1);
  const text = String(value ?? '');
  const chars = Array.from(text || '');
  const safeCursor = clamp(Number(cursor) || 0, 0, chars.length);
  const display = text || placeholder;
  const displayChars = Array.from(display || '');
  const logicalLines = splitLogicalLines(displayChars, text ? safeCursor : 0);
  const lineNoWidth = lineNumbers ? String(Math.max(1, logicalLines.length)).length : 0;
  const prefixWidth = lineNumbers ? lineNoWidth + 3 : 0;
  const contentWidth = Math.max(4, safeWidth - prefixWidth);
  const rendered = [];
  let cursorVisualIndex = 0;

  logicalLines.forEach((logical, lineIndex) => {
    const chunks = wrapEditorLine(logical.text, logical.cursorIndex, contentWidth);
    chunks.forEach((chunk, chunkIndex) => {
      if (chunk.hasCursor) cursorVisualIndex = rendered.length;
      const prefix = lineNumbers
        ? `${chunkIndex === 0 ? String(lineIndex + 1).padStart(lineNoWidth) : ' '.repeat(lineNoWidth)} │ `
        : '';
      rendered.push(prefix + chunk.text);
    });
  });

  const start = Math.max(0, Math.min(cursorVisualIndex - Math.floor(safeHeight / 2), Math.max(0, rendered.length - safeHeight)));
  const visible = rendered.slice(start, start + safeHeight);
  while (visible.length < safeHeight) visible.push('');
  return visible;
}

export function TextEditorView({
  title = ' Editor ',
  value = '',
  cursor = 0,
  width = 80,
  height = 8,
  placeholder = '',
  lineNumbers = true,
} = {}) {
  const lines = renderTextEditorLines({ value, cursor, width: Math.max(8, width - 4), height, placeholder, lineNumbers });
  return Box({ border: true, padding: { left: 1, right: 1 }, title }, ...lines.map((line) => Text(line, { wrap: false })));
}

export function visibleWindowLines(lines = [], { height = 8, scroll = 0, tail = false } = {}) {
  const safeLines = Array.from(lines, (line) => String(line ?? ''));
  const safeHeight = Math.max(1, Number(height) || 1);
  const maxScroll = Math.max(0, safeLines.length - safeHeight);
  const safeScroll = clamp(Number(scroll) || 0, 0, maxScroll);
  const start = tail ? Math.max(0, safeLines.length - safeHeight - safeScroll) : safeScroll;
  const visible = safeLines.slice(start, start + safeHeight);
  while (visible.length < safeHeight) visible.push('');
  return { lines: visible, scroll: safeScroll, maxScroll, start };
}

export function ScrollPane({
  title = ' Scroll ',
  lines = [],
  width = 80,
  height = 8,
  scroll = 0,
  border = true,
  footer = true,
} = {}) {
  const innerHeight = Math.max(1, Number(height) || 1) - (border ? 3 : 1);
  const window = visibleWindowLines(lines, { height: Math.max(1, innerHeight), scroll });
  const rows = window.lines.map((line) => Text(fitInline(line, Math.max(1, width - (border ? 4 : 0))), { wrap: false }));
  if (footer) rows.push(Text(`↑↓ scroll ${window.scroll}/${window.maxScroll}`, { wrap: false }));
  return Box({ border, padding: border ? { left: 1, right: 1 } : 0, title, height }, ...rows);
}

function splitLogicalLines(chars, cursor) {
  const lines = [];
  let current = [];
  let logicalCursor = -1;
  let consumed = 0;

  for (const char of chars) {
    if (consumed === cursor) logicalCursor = current.length;
    if (char === '\n') {
      lines.push({ text: current.join(''), cursorIndex: logicalCursor });
      current = [];
      logicalCursor = -1;
      consumed += 1;
      continue;
    }
    current.push(char);
    consumed += 1;
  }

  if (consumed === cursor) logicalCursor = current.length;
  lines.push({ text: current.join(''), cursorIndex: logicalCursor });
  return lines.length ? lines : [{ text: '', cursorIndex: 0 }];
}

function wrapEditorLine(text, cursorIndex, width) {
  const chars = Array.from(String(text ?? ''));
  const chunks = [];
  const safeWidth = Math.max(1, Number(width) || 1);
  let start = 0;

  if (!chars.length) {
    return [{ text: cursorIndex === 0 ? '█' : '', hasCursor: cursorIndex === 0 }];
  }

  while (start < chars.length || (cursorIndex === chars.length && start === chars.length)) {
    const end = Math.min(chars.length, start + safeWidth);
    const hasCursor = cursorIndex >= start && cursorIndex <= end;
    const chunk = chars.slice(start, end);
    let rendered = chunk.join('');
    if (hasCursor) {
      const pos = cursorIndex - start;
      if (pos >= rendered.length) rendered += '█';
      else rendered = rendered.slice(0, pos) + '█' + rendered.slice(pos + 1);
    }
    chunks.push({ text: rendered, hasCursor });
    if (end === chars.length) break;
    start = end;
  }

  return chunks.length ? chunks : [{ text: cursorIndex === 0 ? '█' : '', hasCursor: cursorIndex === 0 }];
}
