import { color } from '../ansi/text.js';
import { Box, Text } from './node.js';
import { renderBox } from './layout/box.js';
import { distribute, fit, wrapPlain } from './layout/utils.js';

export function renderKeyHintBar(node, width, renderNode) {
  const props = node.props || {};
  const hints = Array.from(props.hints ?? []);
  const theme = props.theme ?? null;
  const gap = Math.max(0, Number(props.gap ?? 2) || 0);
  const innerWidth = Math.max(1, Number(width) - 4);
  const columns = resolveColumns({
    requested: props.columns,
    count: hints.length,
    width: innerWidth,
    gap,
    minColumnWidth: props.minColumnWidth,
    maxColumns: props.maxColumns,
    hints,
  });
  const available = Math.max(1, innerWidth - gap * Math.max(0, columns - 1));
  const columnWidths = distribute(available, columns);
  const lines = [];

  if (!hints.length) {
    lines.push(theme ? color(theme, 'textMuted', 'No shortcuts registered.') : 'No shortcuts registered.');
  } else {
    for (let index = 0; index < hints.length; index += columns) {
      const rowHints = hints.slice(index, index + columns);
      while (rowHints.length < columns) rowHints.push(null);
      const cells = rowHints.map((hint, columnIndex) => hint
        ? renderHintCell(hint, columnWidths[columnIndex], theme)
        : ['']);
      const rowHeight = Math.max(1, ...cells.map((cell) => cell.length));
      for (let row = 0; row < rowHeight; row += 1) {
        const parts = cells.map((cell, columnIndex) => fit(cell[row] ?? '', columnWidths[columnIndex]));
        lines.push(fit(parts.join(' '.repeat(gap)), innerWidth));
      }
    }
  }

  const height = props.height === undefined || props.height === 'fill'
    ? undefined
    : Math.max(0, Number(props.height) || 0);
  const box = Box({
    border: true,
    borderColor: props.borderColor || theme?.borderMuted || theme?.border,
    padding: { left: 1, right: 1 },
    title: props.title ?? ' Keys ',
    ...(height !== undefined ? { height } : {}),
  }, ...lines.map((line) => Text(line, { wrap: false })));
  return renderBox(box, width, renderNode);
}

function resolveColumns({ requested, count, width, gap, minColumnWidth, maxColumns, hints = [] }) {
  if (!count) return 1;
  if (requested !== 'auto' && requested !== undefined) {
    return Math.max(1, Math.min(count, Number(requested) || 1));
  }
  const safeMin = Math.max(12, Number(minColumnWidth) || 22);
  const configuredMax = maxColumns === 'auto' ? count : Math.max(1, Number(maxColumns) || 3);
  const safeMax = Math.max(1, Math.min(count, configuredMax));
  let best = { columns: 1, height: Infinity, wrapped: Infinity, narrow: Infinity };

  for (let columns = 1; columns <= safeMax; columns += 1) {
    const available = Math.max(1, width - gap * Math.max(0, columns - 1));
    const columnWidths = distribute(available, columns);
    let height = 0;
    let wrapped = 0;
    const narrow = columnWidths.filter((columnWidth) => columnWidth < safeMin).length;
    for (let index = 0; index < hints.length; index += columns) {
      let rowHeight = 1;
      for (let column = 0; column < columns; column += 1) {
        const hint = hints[index + column];
        if (!hint) continue;
        const raw = `${String(hint?.[0] ?? '')}${hint?.[0] && hint?.[1] ? ' ' : ''}${String(hint?.[1] ?? '')}`;
        const lineCount = wrapPlain(raw, Math.max(1, columnWidths[column])).length;
        rowHeight = Math.max(rowHeight, lineCount);
        if (lineCount > 1) wrapped += 1;
      }
      height += rowHeight;
    }
    if (height < best.height
      || (height === best.height && wrapped < best.wrapped)
      || (height === best.height && wrapped === best.wrapped && narrow < best.narrow)
      || (height === best.height && wrapped === best.wrapped && narrow === best.narrow && columns > best.columns)) {
      best = { columns, height, wrapped, narrow };
    }
  }
  return best.columns;
}

function renderHintCell(hint, width, theme) {
  const key = String(hint?.[0] ?? '');
  const label = String(hint?.[1] ?? '');
  const plain = `${key}${key && label ? ' ' : ''}${label}`;
  const wrapped = wrapPlain(plain, Math.max(1, width));
  return wrapped.map((line, index) => {
    if (!theme) return line;
    if (index === 0 && key && line.startsWith(key)) {
      return color(theme, 'textAccent', key) + color(theme, 'textMuted', line.slice(key.length));
    }
    return color(theme, 'textMuted', line);
  });
}
