import { PointerRegion, Text, createNode } from '../node.js';
import { color, truncateVisible, visibleLength } from '../../ansi/text.js';
import { clamp } from './utils.js';
import { Box } from '../node.js';
import { renderBox } from '../layout/box.js';
import { fit, wrapPlain } from '../layout/utils.js';

export function SelectList({
  title = 'Select',
  items = [],
  selectedIndex = 0,
  windowSize = 8,
  emptyText = 'No items.',
  getLabel = defaultLabel,
  getDescription = defaultDescription,
  getDisabled = defaultDisabled,
  theme = null,
  wrapItems = true,
  maxItemLines = 3,
  rowLines = undefined,
  reserveItemLines = false,
  windowStart = null,
  onSelect = null,
  onActivate = null,
  onWheel = null,
  pointerId = 'select-list',
  pointerAutoEnable = true,
} = {}) {
  return createNode('selectList', {
    title,
    items: Array.from(items ?? []),
    selectedIndex,
    windowSize,
    emptyText,
    getLabel,
    getDescription,
    getDisabled,
    theme,
    wrapItems,
    maxItemLines,
    rowLines,
    reserveItemLines,
    windowStart,
    onSelect,
    onActivate,
    onWheel,
    pointerId,
    pointerAutoEnable,
  }, []);
}

export function renderSelectList(node, width, renderNode) {
  const props = node.props || {};
  const theme = props.theme ?? null;
  const normalized = Array.from(props.items ?? []).map((item, index) => normalizeItem(item, index, props));
  const selected = clamp(props.selectedIndex, 0, Math.max(0, normalized.length - 1));
  const itemCount = Math.max(1, Number(props.windowSize) || 1);
  const maxItemLines = Math.max(1, Number(props.rowLines ?? props.maxItemLines) || 3);
  const wrapItems = props.wrapItems !== false;
  const reserveItemLines = Boolean(props.reserveItemLines);
  const innerWidth = Math.max(1, Number(width) - 4);
  const rows = [];

  if (!normalized.length) {
    rows.push(Text(theme ? color(theme, 'textMuted', props.emptyText ?? 'No items.') : props.emptyText ?? 'No items.', { wrap: false }));
    while (rows.length < itemCount) rows.push(Text('', { wrap: false }));
    return renderBox(Box({ border: true, borderColor: theme?.border ?? undefined, padding: { left: 1, right: 1 }, title: ` ${props.title ?? 'Select'} 0/0 ` }, ...rows.slice(0, itemCount)), width, renderNode);
  }

  const window = resolveListWindow({ total: normalized.length, selected, rows: itemCount, start: props.windowStart });
  for (let absolute = window.start; absolute < window.end; absolute += 1) {
    const item = normalized[absolute];
    const selectedItem = absolute === selected;
    const token = item.disabled ? 'textMuted' : selectedItem ? 'selected' : 'text';
    const itemRows = formatItemRows({ item, selected: selectedItem, theme, token, width: innerWidth, wrapItems, maxItemLines, reserveItemLines });
    const rowNodes = itemRows.map((line) => Text(line, { wrap: false }));
    rows.push(PointerRegion({
      pointerId: `${props.pointerId ?? 'select-list'}:${absolute}`,
      pointerData: { kind: 'select-item', index: absolute, item: item.raw, disabled: item.disabled },
      pointerWidth: 'fill',
      pointerAutoEnable: props.pointerAutoEnable !== false,
      disabled: item.disabled,
      onClick: typeof props.onSelect === 'function' || typeof props.onActivate === 'function'
        ? (event) => {
            props.onSelect?.(item.raw, absolute, event);
            props.onActivate?.(item.raw, absolute, event);
          }
        : null,
      onWheel: typeof props.onWheel === 'function' ? props.onWheel : null,
    }, ...rowNodes));
  }
  const minRows = itemCount * (reserveItemLines ? maxItemLines : 1);
  while (rows.length < minRows) rows.push(Text('', { wrap: false }));

  const more = [window.above > 0 ? `↑${window.above}` : '', window.below > 0 ? `↓${window.below}` : ''].filter(Boolean).join(' ');
  const suffix = `${selected + 1}/${normalized.length}${more ? ` · ${more}` : ''}`;
  return renderBox(Box({
    border: true,
    borderColor: theme?.border ?? undefined,
    padding: { left: 1, right: 1 },
    title: ` ${props.title ?? 'Select'} ${suffix} `,
    pointerId: `${props.pointerId ?? 'select-list'}:surface`,
    pointerWidth: 'fill',
    pointerAutoEnable: props.pointerAutoEnable !== false,
    onWheel: typeof props.onWheel === 'function' ? props.onWheel : null,
  }, ...rows), width, renderNode);
}

function formatItemRows({ item, selected, theme, token, width, wrapItems, maxItemLines, reserveItemLines }) {
  const marker = selected ? '›' : ' ';
  const disabled = item.disabled ? ' ×' : '';
  const description = item.description ? ` — ${item.description}` : '';
  const content = `${item.label}${description}${disabled}`;
  const prefix = `${marker} `;
  const continuationPrefix = '  ';
  const contentWidth = Math.max(1, width - visibleLength(prefix));
  const allRows = wrapItems ? wrapPlain(content, contentWidth) : [fit(content, contentWidth)];
  const truncated = allRows.length > maxItemLines;
  const rows = (allRows.length ? allRows : ['']).slice(0, maxItemLines);
  if (truncated && rows.length) rows[rows.length - 1] = ellipsizeRow(rows.at(-1), contentWidth);
  while (reserveItemLines && rows.length < maxItemLines) rows.push('');
  return rows.map((part, index) => {
    const raw = `${index === 0 ? prefix : continuationPrefix}${fit(part, contentWidth)}`;
    return theme ? color(theme, token, raw) : raw;
  });
}

function resolveListWindow({ total, selected, rows, start = null }) {
  const safeRows = Math.max(1, Number(rows) || 1);
  if (total <= safeRows) return { start: 0, end: total, above: 0, below: 0 };
  const maxStart = Math.max(0, total - safeRows);
  const resolvedStart = start === null || start === undefined
    ? clamp(selected - Math.floor(safeRows / 2), 0, maxStart)
    : clamp(Number(start) || 0, 0, maxStart);
  const end = Math.min(total, resolvedStart + safeRows);
  return { start: resolvedStart, end, above: resolvedStart, below: Math.max(0, total - end) };
}

function ellipsizeRow(value, width) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const text = String(value ?? '');
  if (safeWidth === 1) return '…';
  return truncateVisible(text, safeWidth - 1, '') + '…';
}

function normalizeItem(item, index, { getLabel, getDescription, getDisabled }) {
  return {
    raw: item,
    index,
    label: String((typeof getLabel === 'function' ? getLabel(item, index) : defaultLabel(item)) ?? ''),
    description: String((typeof getDescription === 'function' ? getDescription(item, index) : defaultDescription(item)) ?? ''),
    disabled: Boolean(typeof getDisabled === 'function' ? getDisabled(item, index) : defaultDisabled(item)),
  };
}

function defaultLabel(item) {
  if (typeof item === 'string') return item;
  return item?.label ?? item?.title ?? item?.id ?? String(item ?? '');
}

function defaultDescription(item) {
  if (typeof item === 'string') return '';
  return item?.description ?? item?.detail ?? '';
}

function defaultDisabled(item) {
  return Boolean(item?.disabled);
}
