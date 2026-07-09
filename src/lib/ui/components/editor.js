import { Box, Text } from '../node.js';
import { isScrollAtBottom, resolveAutoScrollOffset } from '../../scrollState.js';
import { clamp } from './utils.js';
import { fit } from '../layout/utils.js';

export function renderTextEditorLines({
  value = '',
  cursor = 0,
  width = 80,
  height = 8,
  lineNumbers = true,
  placeholder = '',
  cursorGlyph = '█',
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
} = {}) {
  const innerHeight = Math.max(1, Number(height) || 1) - (border ? 3 : 1);
  const window = visibleWindowLines(lines, { height: Math.max(1, innerHeight), scroll, autoscroll, previousTotalRows, sticky });
  const rows = window.lines.map((line) => Text(fit(line, Math.max(1, width - (border ? 4 : 0))), { wrap: false }));
  if (footer) rows.push(Text(`↑↓ scroll ${window.scroll}/${window.maxScroll}`, { wrap: false }));
  return Box({ border, padding: border ? { left: 1, right: 1 } : 0, title, height }, ...rows);
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

function wrapEditorLine(text, cursorIndex, width, cursorGlyph) {
  const chars = Array.from(String(text ?? ''));
  const chunks = [];
  const safeWidth = Math.max(1, Number(width) || 1);
  let start = 0;

  if (!chars.length) {
    return [{ text: cursorIndex === 0 ? cursorGlyph : '', hasCursor: cursorIndex === 0 }];
  }

  while (start < chars.length || (cursorIndex === chars.length && start === chars.length)) {
    const end = Math.min(chars.length, start + safeWidth);
    const hasCursor = cursorIndex >= start && cursorIndex <= end;
    const chunk = chars.slice(start, end);
    let rendered = chunk.join('');
    if (hasCursor) {
      const pos = cursorIndex - start;
      if (pos >= rendered.length) rendered += cursorGlyph;
      else rendered = rendered.slice(0, pos) + cursorGlyph + rendered.slice(pos + 1);
    }
    chunks.push({ text: rendered, hasCursor });
    if (end === chars.length) break;
    start = end;
  }

  return chunks.length ? chunks : [{ text: cursorIndex === 0 ? cursorGlyph : '', hasCursor: cursorIndex === 0 }];
}
