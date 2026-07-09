import { color, visibleLength, truncateVisible } from '../../ansi.js';
import { Box, Text, createNode } from '../node.js';

export function fitInline(value, width) {
  const text = String(value ?? '');
  if (visibleLength(text) <= width) return text + ' '.repeat(Math.max(0, width - visibleLength(text)));
  return truncateVisible(text, Math.max(0, width - 1)) + '…';
}

export function Badge({ label = '', tone = '', width = 0 } = {}) {
  const text = tone ? `[${String(label)}]` : String(label);
  return Text(width ? fitInline(text, width) : text);
}

export function SectionTabs({ tabs = [], active = '', getLabel = (tab) => tab.label ?? tab.id ?? String(tab), gap = 2, theme = null } = {}) {
  const parts = tabs.map((tab) => {
    const id = tab.id ?? tab.value ?? String(tab);
    const label = getLabel(tab);
    const icon = tab.icon ? `${tab.icon} ` : '';
    const text = id === active ? `▣ ${icon}${label}` : `□ ${icon}${label}`;
    if (!theme) return text;
    return id === active ? color(theme, 'selected', text) : color(theme, 'muted', text);
  });
  return Text(parts.join(' '.repeat(gap)), { wrap: false });
}

export function CommandBar({ value = '', suggestions = [], mode = 'COMMAND', hint = 'TAB next', prompt = '/', theme = null } = {}) {
  const suggestionLine = suggestions.length ? suggestions.join('   ') : '';
  const head = theme ? color(theme, 'accent', `${prompt} ${value ?? ''}`) : `${prompt} ${value ?? ''}`;
  const details = `${suggestionLine}${hint ? `     ${hint}` : ''}`;
  return Box({ border: true, borderColor: theme?.border, padding: { left: 1, right: 1 }, title: ` ${mode} ` },
    Text(head, { wrap: false }),
    suggestionLine ? Text(theme ? color(theme, 'muted', details) : details, { wrap: false }) : null,
  );
}

export function FooterStatusBar({ left = [], right = [], theme = null } = {}) {
  const lhs = left.filter(Boolean).join('  │  ');
  const rhs = right.filter(Boolean).join('  │  ');
  const line = `${lhs}${rhs ? `  │  ${rhs}` : ''}`;
  return Text(theme ? color(theme, 'muted', line) : line, { wrap: false });
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

function defaultGridItem(item) {
  if (Array.isArray(item)) return item.filter(Boolean).join(' ');
  return String(item ?? '');
}
