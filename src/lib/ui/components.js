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
