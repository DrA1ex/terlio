import { PointerRegion, Text, createNode, Box } from '../node.js';
import { color, truncateVisible, visibleLength } from '../../ansi/text.js';
import { getListItemKind, isPresentationListItem } from '../../listItems.js';
import { clamp } from './utils.js';
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
  getKind = defaultKind,
  disabledIndicator = '×',
  getDisabledIndicator = null,
  theme = null,
  wrapItems = true,
  maxItemLines = 3,
  rowLines = undefined,
  reserveItemLines = false,
  height = undefined,
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
    getKind,
    disabledIndicator,
    getDisabledIndicator,
    theme,
    wrapItems,
    maxItemLines,
    rowLines,
    reserveItemLines,
    height,
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
  const fixedHeight = props.height === undefined || props.height === 'fill'
    ? undefined
    : Math.max(0, Number(props.height) || 0);
  const theme = props.theme ?? null;
  const normalized = Array.from(props.items ?? []).map((item, index) => normalizeItem(item, index, props));
  const selected = resolveSelectedIndex(normalized, props.selectedIndex);
  const autoWindow = props.windowSize === 'auto';
  const itemCount = autoWindow ? normalized.length : Math.max(1, Number(props.windowSize) || 1);
  const maxItemLines = Math.max(1, Number(props.rowLines ?? props.maxItemLines) || 3);
  const wrapItems = props.wrapItems !== false;
  const reserveItemLines = Boolean(props.reserveItemLines);
  const innerWidth = Math.max(1, Number(width) - 4);
  const rows = [];

  if (!normalized.length) {
    rows.push(Text(theme ? color(theme, 'textMuted', props.emptyText ?? 'No items.') : props.emptyText ?? 'No items.', { wrap: false }));
    while (rows.length < itemCount) rows.push(Text('', { wrap: false }));
    return renderBox(Box({
      border: true,
      borderColor: theme?.border ?? undefined,
      padding: { left: 1, right: 1 },
      title: ` ${props.title ?? 'Select'} 0/0 `,
      ...(fixedHeight !== undefined ? { height: fixedHeight } : {}),
    }, ...rows.slice(0, itemCount)), width, renderNode);
  }

  const rowHeights = autoWindow && fixedHeight !== undefined
    ? normalized.map((item, absolute) => measureItemRows({
        item,
        selected: absolute === selected,
        theme,
        width: innerWidth,
        wrapItems,
        maxItemLines,
        reserveItemLines,
      }))
    : null;
  const window = resolveListWindow({
    total: normalized.length,
    selected,
    rows: itemCount,
    start: props.windowStart,
    rowHeights,
    maxRows: autoWindow && fixedHeight !== undefined ? Math.max(1, fixedHeight - 2) : null,
  });
  for (let absolute = window.start; absolute < window.end; absolute += 1) {
    const item = normalized[absolute];
    if (item.presentation) {
      const presentationRows = formatPresentationRows({ item, theme, width: innerWidth, wrapItems, maxItemLines, reserveItemLines });
      rows.push(...presentationRows.map((line) => Text(line, { wrap: false })));
      continue;
    }

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
  const minRows = autoWindow && fixedHeight !== undefined
    ? Math.max(0, fixedHeight - 2)
    : itemCount * (reserveItemLines ? maxItemLines : 1);
  while (rows.length < minRows) rows.push(Text('', { wrap: false }));

  const more = [window.above > 0 ? `↑${window.above}` : '', window.below > 0 ? `↓${window.below}` : ''].filter(Boolean).join(' ');
  const selectable = normalized.filter((item) => !item.presentation);
  const selectedOrdinal = selected < 0 ? 0 : normalized.slice(0, selected + 1).filter((item) => !item.presentation).length;
  const suffix = `${selectedOrdinal}/${selectable.length}${more ? ` · ${more}` : ''}`;
  return renderBox(Box({
    border: true,
    borderColor: theme?.border ?? undefined,
    padding: { left: 1, right: 1 },
    title: ` ${props.title ?? 'Select'} ${suffix} `,
    ...(fixedHeight !== undefined ? { height: fixedHeight } : {}),
    pointerId: `${props.pointerId ?? 'select-list'}:surface`,
    pointerWidth: 'fill',
    pointerAutoEnable: props.pointerAutoEnable !== false,
    onWheel: typeof props.onWheel === 'function' ? props.onWheel : null,
  }, ...rows), width, renderNode);
}


function measureItemRows({ item, selected, theme, width, wrapItems, maxItemLines, reserveItemLines }) {
  if (item.presentation) {
    return formatPresentationRows({ item, theme, width, wrapItems, maxItemLines, reserveItemLines }).length;
  }
  const token = item.disabled ? 'textMuted' : selected ? 'selected' : 'text';
  return formatItemRows({ item, selected, theme, token, width, wrapItems, maxItemLines, reserveItemLines }).length;
}

function formatItemRows({ item, selected, theme, token, width, wrapItems, maxItemLines, reserveItemLines }) {
  const marker = selected ? '›' : ' ';
  const indicator = item.disabled ? item.disabledIndicator : '';
  const disabled = indicator ? ` ${indicator}` : '';
  const description = item.description ? ` — ${item.description}` : '';
  const content = `${item.label}${description}${disabled}`;
  return formatWrappedRows({ content, prefix: `${marker} `, continuationPrefix: '  ', theme, token, width, wrapItems, maxItemLines, reserveItemLines });
}

function formatPresentationRows({ item, theme, width, wrapItems, maxItemLines, reserveItemLines }) {
  if (item.kind === 'separator') {
    const label = item.label.trim();
    const raw = label ? `── ${label} ` : '';
    const fill = '─'.repeat(Math.max(0, width - visibleLength(raw)));
    const line = fit(`${raw}${fill}`, width);
    return [theme ? color(theme, 'borderMuted', line) : line];
  }

  const token = item.kind === 'heading' ? 'textAccent' : 'textMuted';
  const description = item.description ? `${item.kind === 'stat' ? ': ' : ' — '}${item.description}` : '';
  const content = `${item.label}${description}`;
  return formatWrappedRows({ content, prefix: '  ', continuationPrefix: '  ', theme, token, width, wrapItems, maxItemLines, reserveItemLines });
}

function formatWrappedRows({ content, prefix, continuationPrefix, theme, token, width, wrapItems, maxItemLines, reserveItemLines }) {
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

function resolveListWindow({ total, selected, rows, start = null, rowHeights = null, maxRows = null }) {
  if (Array.isArray(rowHeights) && Number.isFinite(maxRows)) {
    return resolveListWindowByRows({ total, selected, start, rowHeights, maxRows });
  }

  const safeRows = Math.max(1, Number(rows) || 1);
  if (total <= safeRows) return { start: 0, end: total, above: 0, below: 0 };
  const maxStart = Math.max(0, total - safeRows);
  const anchor = selected >= 0 ? selected : 0;
  const resolvedStart = start === null || start === undefined
    ? clamp(anchor - Math.floor(safeRows / 2), 0, maxStart)
    : clamp(Number(start) || 0, 0, maxStart);
  const end = Math.min(total, resolvedStart + safeRows);
  return { start: resolvedStart, end, above: resolvedStart, below: Math.max(0, total - end) };
}

function resolveListWindowByRows({ total, selected, start = null, rowHeights, maxRows }) {
  if (!total) return { start: 0, end: 0, above: 0, below: 0 };
  const safeMaxRows = Math.max(1, Number(maxRows) || 1);
  const heightAt = (index) => Math.max(1, Number(rowHeights[index]) || 1);

  if (start !== null && start !== undefined) {
    const resolvedStart = clamp(Number(start) || 0, 0, Math.max(0, total - 1));
    let end = resolvedStart;
    let used = 0;
    while (end < total) {
      const next = heightAt(end);
      if (end > resolvedStart && used + next > safeMaxRows) break;
      used += next;
      end += 1;
      if (used >= safeMaxRows) break;
    }
    return { start: resolvedStart, end, above: resolvedStart, below: Math.max(0, total - end) };
  }

  const anchor = clamp(selected >= 0 ? selected : 0, 0, total - 1);
  let resolvedStart = anchor;
  let end = anchor + 1;
  let used = heightAt(anchor);
  let takeBefore = true;

  while (resolvedStart > 0 || end < total) {
    const beforeHeight = resolvedStart > 0 ? heightAt(resolvedStart - 1) : Infinity;
    const afterHeight = end < total ? heightAt(end) : Infinity;
    let added = false;

    if (takeBefore && used + beforeHeight <= safeMaxRows) {
      resolvedStart -= 1;
      used += beforeHeight;
      added = true;
    } else if (used + afterHeight <= safeMaxRows) {
      used += afterHeight;
      end += 1;
      added = true;
    } else if (used + beforeHeight <= safeMaxRows) {
      resolvedStart -= 1;
      used += beforeHeight;
      added = true;
    }

    if (!added) break;
    takeBefore = !takeBefore;
  }

  return { start: resolvedStart, end, above: resolvedStart, below: Math.max(0, total - end) };
}

function resolveSelectedIndex(items, selectedIndex) {
  if (!items.length) return -1;
  const requested = clamp(selectedIndex, 0, items.length - 1);
  if (!items[requested].presentation) return requested;
  for (let index = requested + 1; index < items.length; index += 1) if (!items[index].presentation) return index;
  for (let index = requested - 1; index >= 0; index -= 1) if (!items[index].presentation) return index;
  return -1;
}

function ellipsizeRow(value, width) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const text = String(value ?? '');
  if (safeWidth === 1) return '…';
  return truncateVisible(text, safeWidth - 1, '') + '…';
}

function normalizeItem(item, index, { getLabel, getDescription, getDisabled, getKind, disabledIndicator, getDisabledIndicator }) {
  const kind = getListItemKind(item, index, getKind);
  const presentation = isPresentationListItem(item, index, getKind);
  const disabled = presentation ? false : Boolean(typeof getDisabled === 'function' ? getDisabled(item, index) : defaultDisabled(item));
  const indicator = disabled
    ? String((typeof getDisabledIndicator === 'function' ? getDisabledIndicator(item, index) : disabledIndicator) ?? '')
    : '';
  return {
    raw: item,
    index,
    kind,
    presentation,
    label: String((typeof getLabel === 'function' ? getLabel(item, index) : defaultLabel(item)) ?? ''),
    description: String((typeof getDescription === 'function' ? getDescription(item, index) : defaultDescription(item)) ?? ''),
    disabled,
    disabledIndicator: indicator,
  };
}

function defaultKind(item) {
  return item?.kind ?? 'item';
}

function defaultLabel(item) {
  if (typeof item === 'string') return item;
  return item?.label ?? item?.title ?? item?.id ?? (item?.kind ? '' : String(item ?? ''));
}

function defaultDescription(item) {
  if (typeof item === 'string') return '';
  return item?.description ?? item?.detail ?? item?.value ?? '';
}

function defaultDisabled(item) {
  return Boolean(item?.disabled);
}
