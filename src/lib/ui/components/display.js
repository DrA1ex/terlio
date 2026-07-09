import { color, visibleLength, truncateVisible } from '../../ansi/text.js';
import { Box, Text, createNode } from '../node.js';

export function fitInline(value, width) {
  const safeWidth = Math.max(0, Number(width) || 0);
  const text = String(value ?? '');
  if (visibleLength(text) <= safeWidth) return text + ' '.repeat(Math.max(0, safeWidth - visibleLength(text)));
  return truncateVisible(text, safeWidth, '…');
}

export function Badge({ label = '', tone = 'muted', variant = 'subtle', width = 0, theme = null } = {}) {
  const text = variant === 'outline' ? `‹${String(label)}›` : variant === 'filled' ? `[${String(label)}]` : ` ${String(label)} `;
  const token = toneToken(tone);
  const rendered = theme ? color(theme, token, text) : text;
  return Text(width ? fitInline(rendered, width) : rendered, { wrap: false });
}

export function Chip({ label = '', active = false, tone = 'muted', variant = active ? 'filled' : 'subtle', theme = null } = {}) {
  return Badge({ label, tone: active ? tone : 'muted', variant, theme });
}

export function SectionTabs({ tabs = [], active = '', getLabel = (tab) => tab.label ?? tab.id ?? String(tab), gap = 2, theme = null } = {}) {
  const parts = tabs.map((tab) => {
    const id = tab.id ?? tab.value ?? String(tab);
    const label = getLabel(tab);
    const icon = tab.icon ? `${tab.icon} ` : '';
    const text = id === active ? `▣ ${icon}${label}` : `□ ${icon}${label}`;
    if (!theme) return text;
    return id === active ? color(theme, 'selected', text) : color(theme, 'textMuted', text);
  });
  return Text(parts.join(' '.repeat(gap)), { wrap: false });
}

export function CommandBar({ value = '', suggestions = [], mode = 'COMMAND', hint = 'TAB next', prompt = '/', theme = null } = {}) {
  const suggestionLine = suggestions.length ? suggestions.join('   ') : '';
  const head = theme ? color(theme, 'textAccent', `${prompt} ${value ?? ''}`) : `${prompt} ${value ?? ''}`;
  const details = `${suggestionLine}${hint ? `     ${hint}` : ''}`;
  return Box({ border: true, borderColor: theme?.borderMuted ?? theme?.border, padding: { left: 1, right: 1 }, title: ` ${mode} ` },
    Text(head, { wrap: false }),
    suggestionLine ? Text(theme ? color(theme, 'textMuted', details) : details, { wrap: false }) : null,
  );
}

export function FooterStatusBar({ left = [], right = [], theme = null } = {}) {
  const lhs = left.filter(Boolean).join('  │  ');
  const rhs = right.filter(Boolean).join('  │  ');
  const line = `${lhs}${rhs ? `  │  ${rhs}` : ''}`;
  return Text(theme ? color(theme, 'textMuted', line) : line, { wrap: false });
}

export function Grid({
  items = [],
  columns = 3,
  gap = 2,
  renderItem = defaultGridItem,
  emptyText = '',
  border = false,
  borderColor = '',
  padding = border ? { left: 1, right: 1 } : 0,
} = {}) {
  return createNode('grid', {
    items: Array.from(items ?? []),
    columns,
    gap,
    renderItem,
    emptyText,
    border,
    borderColor,
    padding,
  }, []);
}

export function PropertyRows({ title = ' Properties ', rows = [], theme = null } = {}) {
  return Box({ border: true, borderColor: theme?.borderMuted ?? theme?.border, padding: { left: 1, right: 1 }, title },
    ...rows.map(([key, value]) => Text(`${String(key).padEnd(12)} ${value}`, { wrap: false })),
  );
}

export function ChipLine({ label = '', chips = [], active = '', getLabel = (chip) => chip.label ?? chip.id ?? String(chip), theme = null, tone = 'info', variant = 'subtle' } = {}) {
  const parts = chips.map((chip) => {
    const id = chip.id ?? chip.value ?? String(chip);
    const name = getLabel(chip);
    const selected = id === active;
    const raw = selected ? `[${name}]` : ` ${name} `;
    return theme ? color(theme, selected ? toneToken(tone) : 'textMuted', raw) : raw;
  });
  return Text(`${label}${label ? ' ' : ''}${parts.join('  ')}`, { wrap: false });
}

function toneToken(tone) {
  return {
    info: 'info',
    success: 'success',
    warning: 'warning',
    danger: 'danger',
    error: 'danger',
    muted: 'textMuted',
    accent: 'textAccent',
    ok: 'success',
  }[tone] ?? 'textAccent';
}

function defaultGridItem(item) {
  if (Array.isArray(item)) return item.filter(Boolean).join(' ');
  return String(item ?? '');
}
