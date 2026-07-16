import { ansi } from '../../ansi/codes.js';
import { takeVisibleAnsi } from '../../ansi/text.js';
import { Box, Text } from '../node.js';
import { isScrollAtBottom, resolveAutoScrollOffset } from '../../scrollState.js';
import { clamp } from './utils.js';
import { fit } from '../layout/utils.js';
import { SelectableText } from './selectableText.js';

export function renderTextEditorLines({
  value = '',
  cursor = 0,
  width = 80,
  height = 8,
  lineNumbers = true,
  placeholder = '',
  cursorGlyph = null,
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
    const chunks = wrapEditorLine(logical.text, logical.cursorIndex, contentWidth, cursorGlyph);
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

export function visibleWindowLines(lines = [], {
  height = 8,
  scroll = 0,
  tail = false,
  autoscroll = false,
  previousTotalRows = undefined,
  sticky = undefined,
} = {}) {
  const safeLines = Array.from(lines, (line) => String(line ?? ''));
  const safeHeight = Math.max(1, Number(height) || 1);
  const maxScroll = Math.max(0, safeLines.length - safeHeight);
  const resolvedScroll = autoscroll
    ? resolveAutoScrollOffset({
        scroll,
        totalRows: safeLines.length,
        previousTotalRows: previousTotalRows ?? safeLines.length,
        visibleRows: safeHeight,
        sticky,
      })
    : scroll;
  const safeScroll = clamp(Number(resolvedScroll) || 0, 0, maxScroll);
  const start = tail ? Math.max(0, safeLines.length - safeHeight - safeScroll) : safeScroll;
  const visible = safeLines.slice(start, start + safeHeight);
  while (visible.length < safeHeight) visible.push('');
  return { lines: visible, scroll: safeScroll, maxScroll, start, atBottom: isScrollAtBottom(safeScroll, safeLines.length, safeHeight) };
}

export function ScrollPane({
  title = ' Scroll ',
  lines = [],
  width = 80,
  height = 8,
  scroll = 0,
  border = true,
  footer = true,
  autoscroll = false,
  previousTotalRows = undefined,
  sticky = undefined,
  pointerId = undefined,
  pointerData = undefined,
  pointerWidth = 'fill',
  pointerEvents = undefined,
  pointerAutoEnable = true,
  onPointer = null,
  onClick = null,
  onWheel = null,
  onDrag = null,
  onMove = null,
  onRelease = null,
  selection = null,
  onSelectionChange = null,
  onCopy = null,
  copyOnRelease = false,
  copyOnSelectionClick = true,
  clearSelectionOnWheel = false,
  nativeSelectionModifier = false,
} = {}) {
  const chromeRows = (border ? 2 : 0) + (footer ? 1 : 0);
  const innerHeight = Math.max(1, (Number(height) || 1) - chromeRows);
  const contentWidth = Math.max(1, width - (border ? 4 : 0));
  const sourceLines = Array.from(lines ?? [], (line) => takeVisibleAnsi(String(line ?? ''), contentWidth));
  const window = visibleWindowLines(sourceLines, { height: Math.max(1, innerHeight), scroll, autoscroll, previousTotalRows, sticky });
  const bodyLines = window.lines.map((line) => fit(line, contentWidth));
  const rows = selection
    ? [SelectableText({
        lines: bodyLines,
        selectionLines: sourceLines,
        selectionOffsetY: window.start,
        selection,
        pointerId: pointerId ? `${pointerId}:selection` : 'scroll-pane:selection',
        pointerData,
        pointerWidth: 'fill',
        pointerAutoEnable,
        onWheel,
        onSelectionChange,
        onCopy,
        copyOnRelease,
        copyOnSelectionClick,
        clearOnWheel: clearSelectionOnWheel,
        nativeSelectionModifier,
      })]
    : bodyLines.map((line) => Text(line, { wrap: false }));
  if (footer) rows.push(Text(`wheel · ↑/↓ · PgUp/PgDn ${window.scroll}/${window.maxScroll}`, { wrap: false }));
  return Box({
    border,
    padding: border ? { left: 1, right: 1 } : 0,
    title,
    height,
    pointerId,
    pointerData,
    pointerWidth,
    pointerEvents,
    pointerAutoEnable,
    onPointer,
    onClick,
    onWheel,
    onDrag,
    onMove,
    onRelease,
  }, ...rows);
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

export function renderCursorCell(value = ' ') {
  const cell = Array.from(String(value ?? ' '))[0] ?? ' ';
  return `${ansi.inverse}${cell}${ansi.inverseOff}`;
}

function wrapEditorLine(text, cursorIndex, width, cursorGlyph) {
  const chars = Array.from(String(text ?? ''));
  const chunks = [];
  const safeWidth = Math.max(1, Number(width) || 1);
  const customGlyph = cursorGlyph === null || cursorGlyph === undefined || cursorGlyph === ''
    ? null
    : String(cursorGlyph);

  if (!chars.length) {
    return [{ text: cursorIndex === 0 ? renderCursorCell(' ') : '', hasCursor: cursorIndex === 0 }];
  }

  let start = 0;
  while (start < chars.length) {
    const end = Math.min(chars.length, start + safeWidth);
    const cursorInside = cursorIndex >= start && cursorIndex < end;
    const cursorAtPartialEnd = cursorIndex === chars.length
      && end === chars.length
      && end - start < safeWidth;
    const hasCursor = cursorInside || cursorAtPartialEnd;
    const chunk = chars.slice(start, end);
    let rendered = chunk.join('');

    if (hasCursor) {
      const pos = cursorIndex - start;
      if (pos >= chunk.length) {
        rendered += customGlyph ?? renderCursorCell(' ');
      } else if (customGlyph) {
        rendered = chunk.slice(0, pos).join('') + customGlyph + chunk.slice(pos + 1).join('');
      } else {
        rendered = chunk.slice(0, pos).join('') + renderCursorCell(chunk[pos]) + chunk.slice(pos + 1).join('');
      }
    }

    chunks.push({ text: rendered, hasCursor });
    start = end;
  }

  if (cursorIndex === chars.length && chars.length % safeWidth === 0) {
    chunks.push({ text: customGlyph ?? renderCursorCell(' '), hasCursor: true });
  }

  return chunks;
}
