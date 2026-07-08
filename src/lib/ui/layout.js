import { takeVisibleAnsi, visibleLength } from '../ansi.js';
import { createFrame } from './screen.js';

export function layout(node, { width = 80, height = 24 } = {}) {
  const lines = renderNode(node, Math.max(1, width));
  return createFrame(lines, { width, height });
}

export function renderNode(node, width = 80) {
  if (!node) return [];
  if (typeof node === 'string' || typeof node === 'number') return wrapPlain(String(node), width);

  switch (node.type) {
    case 'text':
      return renderText(node, width);
    case 'box':
      return renderBox(node, width);
    case 'row':
      return renderRow(node, width);
    case 'column':
      return renderColumn(node, width);
    case 'grid':
      return renderGrid(node, width);
    default:
      return renderColumn(node, width);
  }
}

function renderText(node, width) {
  const value = String(node.props.value ?? '');
  const wrap = node.props.wrap !== false;
  if (!wrap) return value.split('\n').map((line) => fit(line, width));
  return wrapPlain(value, width).map((line) => fit(line, width));
}

function renderColumn(node, width) {
  const gap = Number(node.props.gap ?? 0);
  const fixedHeight = node.props.height === undefined ? null : Math.max(0, Number(node.props.height) || 0);

  if (fixedHeight !== null) return renderFixedHeightColumn(node, width, fixedHeight, gap);

  const lines = [];
  node.children.forEach((child, index) => {
    if (index > 0) for (let i = 0; i < gap; i += 1) lines.push('');
    lines.push(...renderNode(child, width));
  });
  return lines.length ? lines : [''];
}

function renderFixedHeightColumn(node, width, height, gap) {
  const children = node.children || [];
  if (!children.length) return applyFixedHeight([''], width, height);

  const growIndexes = children
    .map((child, index) => child?.props?.grow === true || child?.props?.height === 'fill' ? index : -1)
    .filter((index) => index >= 0);

  if (!growIndexes.length) {
    const lines = [];
    children.forEach((child, index) => {
      if (index > 0) for (let i = 0; i < gap; i += 1) lines.push('');
      lines.push(...renderNode(child, width));
    });
    return applyFixedHeight(lines.length ? lines : [''], width, height);
  }

  const rendered = new Array(children.length);
  let used = Math.max(0, gap * Math.max(0, children.length - 1));

  children.forEach((child, index) => {
    if (growIndexes.includes(index)) return;
    const lines = renderNode(child, width);
    rendered[index] = lines;
    used += lines.length;
  });

  const availableForGrow = Math.max(0, height - used);
  const allocations = distribute(availableForGrow, growIndexes.length);

  growIndexes.forEach((childIndex, allocationIndex) => {
    const child = children[childIndex];
    const assignedHeight = allocations[allocationIndex];
    rendered[childIndex] = renderNode(withHeight(child, assignedHeight), width);
  });

  const lines = [];
  children.forEach((_, index) => {
    if (index > 0) for (let i = 0; i < gap; i += 1) lines.push('');
    lines.push(...(rendered[index] || ['']));
  });

  return applyFixedHeight(lines.length ? lines : [''], width, height);
}

function withHeight(node, height) {
  if (!node || typeof node !== 'object' || !node.type) return node;
  return {
    ...node,
    props: { ...node.props, height },
  };
}

function distribute(total, count) {
  const safeCount = Math.max(1, count);
  const base = Math.floor(total / safeCount);
  const remainder = total % safeCount;
  return Array.from({ length: safeCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

function renderRow(node, width) {
  const gap = Number(node.props.gap ?? 0);
  if (!node.children.length) return [''];

  const explicitWidths = Array.isArray(node.props.widths) ? node.props.widths.map((item) => Number(item) || 0) : null;
  if (explicitWidths?.length) {
    const childCount = node.children.length;
    const available = Math.max(1, width - gap * (childCount - 1));
    const normalized = normalizeRowWidths(explicitWidths, childCount, available);
    const rendered = node.children.map((child, index) => renderNode(child, normalized[index]));
    return stitchRows(rendered, normalized, gap, width);
  }

  if (node.props.distribute === true) {
    const childWidth = Math.max(1, Math.floor((width - gap * (node.children.length - 1)) / node.children.length));
    const rendered = node.children.map((child) => renderNode(child, childWidth));
    return stitchRows(rendered, Array(node.children.length).fill(childWidth), gap, width);
  }

  const rendered = node.children.map((child) => renderNode(child, width));
  const widths = rendered.map((lines) => Math.max(0, ...lines.map((line) => Math.min(width, visibleLength(String(line ?? '').trimEnd())))));
  return stitchRows(rendered, widths, gap, width);
}

function normalizeRowWidths(widths, childCount, available) {
  const result = Array.from({ length: childCount }, (_, index) => Math.max(1, Number(widths[index]) || 1));
  let total = result.reduce((sum, item) => sum + item, 0);
  if (total === available) return result;
  if (total < available) {
    result[result.length - 1] += available - total;
    return result;
  }
  let overflow = total - available;
  for (let index = result.length - 1; index >= 0 && overflow > 0; index -= 1) {
    const cut = Math.min(overflow, Math.max(0, result[index] - 1));
    result[index] -= cut;
    overflow -= cut;
  }
  return result;
}

function stitchRows(rendered, widths, gap, width) {
  const height = Math.max(...rendered.map((lines) => lines.length));
  const rows = [];

  for (let row = 0; row < height; row += 1) {
    const parts = rendered.map((lines, index) => fit(String(lines[row] ?? '').trimEnd(), widths[index]));
    rows.push(fit(parts.join(' '.repeat(gap)), width));
  }
  return rows;
}



function renderGrid(node, width) {
  const props = node.props || {};
  const safeColumns = Math.max(1, Number(props.columns) || 1);
  const items = Array.from(props.items ?? []);
  const emptyText = String(props.emptyText ?? '');
  if (!items.length) return emptyText ? [fit(emptyText, width)] : [''];

  const renderItem = typeof props.renderItem === 'function' ? props.renderItem : (item) => String(item ?? '');
  const rows = [];
  for (let index = 0; index < items.length; index += safeColumns) {
    const rowItems = items.slice(index, index + safeColumns);
    while (rowItems.length < safeColumns) rowItems.push(null);
    rows.push(rowItems.map((item, offset) => item === null ? '' : String(renderItem(item, index + offset) ?? '')));
  }

  if (props.border) return renderBorderedGrid(rows, props, width, safeColumns);

  const gap = Math.max(0, Number(props.gap) || 0);
  const available = Math.max(1, width - gap * (safeColumns - 1));
  const columnWidths = distribute(available, safeColumns);
  return rows.map((row) => fit(row.map((cell, index) => fit(cell, columnWidths[index])).join(' '.repeat(gap)), width));
}

function renderBorderedGrid(rows, props, width, columns) {
  const safeWidth = Math.max(1, Number(width) || 1);
  if (safeWidth < columns * 2 + 1) {
    return rows.map((row) => fit(row.join(' '), safeWidth));
  }

  const padding = normalizeSpacing(props.padding ?? { left: 1, right: 1 });
  const borderColor = String(props.borderColor ?? '');
  const reset = borderColor ? '\x1b[0m' : '';
  const cellWidths = distribute(Math.max(1, safeWidth - columns - 1), columns);
  const line = (left, middle, right) => borderColor + left + cellWidths.map((cellWidth) => '─'.repeat(cellWidth)).join(middle) + right + reset;
  const borderChar = (char) => borderColor ? borderColor + char + reset : char;
  const output = [line('┌', '┬', '┐')];

  rows.forEach((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      const cellWidth = cellWidths[columnIndex];
      const horizontalPadding = Math.min(cellWidth, Math.max(0, padding.left + padding.right));
      const contentWidth = Math.max(0, cellWidth - horizontalPadding);
      const leftPad = ' '.repeat(Math.min(padding.left, Math.max(0, cellWidth)));
      const rightPad = ' '.repeat(Math.min(padding.right, Math.max(0, cellWidth - visibleLength(leftPad) - contentWidth)));
      return fit(leftPad + fit(cell, contentWidth) + rightPad, cellWidth);
    });
    output.push(borderChar('│') + cells.join(borderChar('│')) + borderChar('│'));
    if (rowIndex < rows.length - 1) output.push(line('├', '┼', '┤'));
  });

  output.push(line('└', '┴', '┘'));
  return output.map((row) => fit(row, safeWidth));
}

function renderBox(node, width) {
  const fixedHeight = node.props.height === undefined ? null : Math.max(0, Number(node.props.height) || 0);
  const border = Boolean(node.props.border);
  const padding = normalizeSpacing(node.props.padding ?? 0);
  const borderSize = border ? 2 : 0;
  const innerWidth = Math.max(1, width - borderSize - padding.left - padding.right);
  const childLines = renderColumn({ type: 'column', props: { gap: node.props.gap ?? 0 }, children: node.children }, innerWidth);
  const padded = [
    ...Array(padding.top).fill(''),
    ...childLines,
    ...Array(padding.bottom).fill(''),
  ].map((line) => ' '.repeat(padding.left) + fit(line, innerWidth) + ' '.repeat(padding.right));

  if (!border) return applyFixedHeight(padded.map((line) => fit(line, width)), width, fixedHeight);

  const contentWidth = Math.max(0, width - 2);
  const title = node.props.title ? ` ${String(node.props.title)} ` : '';
  const borderColor = String(node.props.borderColor ?? '');
  const reset = borderColor ? '\x1b[0m' : '';
  const top = borderColor + '┌' + fitTitle(title, contentWidth) + '┐' + reset;
  const bottom = borderColor + '└' + '─'.repeat(contentWidth) + '┘' + reset;
  return applyFixedHeight([top, ...padded.map((line) => `${borderColor}│${reset}${fit(line, contentWidth)}${borderColor}│${reset}`), bottom], width, fixedHeight);
}

function applyFixedHeight(lines, width, height) {
  if (height === null) return lines;
  const safeHeight = Math.max(0, Number(height) || 0);
  const fitted = lines.slice(0, safeHeight);
  while (fitted.length < safeHeight) fitted.push(' '.repeat(width));
  return fitted;
}

function normalizeSpacing(value) {
  if (typeof value === 'number') return { top: value, right: value, bottom: value, left: value };
  return {
    top: Number(value.top ?? 0),
    right: Number(value.right ?? 0),
    bottom: Number(value.bottom ?? 0),
    left: Number(value.left ?? 0),
  };
}

function fitTitle(title, width) {
  if (!title) return '─'.repeat(width);
  const clean = fit(title, width);
  return clean + '─'.repeat(Math.max(0, width - visibleLength(clean)));
}

export function fit(value, width) {
  const safeWidth = Math.max(0, Number(width) || 0);
  const text = String(value ?? '');
  const fitted = visibleLength(text) > safeWidth ? takeVisibleAnsi(text, safeWidth) : text;
  const size = visibleLength(fitted);
  return size < safeWidth ? fitted + ' '.repeat(safeWidth - size) : fitted;
}

function wrapPlain(value, width) {
  const lines = [];
  for (const raw of String(value ?? '').split('\n')) {
    if (raw === '') {
      lines.push('');
      continue;
    }
    const chars = Array.from(raw);
    let line = '';
    for (const char of chars) {
      if (visibleLength(line + char) > width) {
        lines.push(line);
        line = char;
      } else {
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}
