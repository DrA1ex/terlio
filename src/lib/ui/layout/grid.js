import { visibleLength } from '../../ansi/text.js';
import { distribute, fit, normalizeSpacing } from './utils.js';

export function renderGrid(node, width) {
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
