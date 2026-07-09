import { Box, Text } from '../node.js';
import { clamp } from './utils.js';

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
