import { ansi } from './ansi/codes.js';
import { stripAnsi, visibleLength, wcwidth } from './ansi/text.js';
import { copyWithClipboardPolicy, createLegacyClipboard, osc52ClipboardSequence as buildOsc52ClipboardSequence, writeOsc52Clipboard } from './clipboardBackend.js';

const TEXT_LINE_SOURCE = Symbol('terlio.textLineSource');

export function createTextLineSource(lines = [], { transform = null } = {}) {
  const source = asTextLineSource(lines);
  if (typeof transform !== 'function') return source;
  return {
    [TEXT_LINE_SOURCE]: true,
    length: source.length,
    getLine(index) {
      return String(transform(source.getLine(index), index) ?? '');
    },
  };
}

export function createTextSelectionState(initial = {}) {
  return {
    anchor: normalizePoint(initial.anchor),
    focus: normalizePoint(initial.focus),
    selecting: Boolean(initial.selecting),
    dragged: Boolean(initial.dragged),
    includeFocusCell: initial.includeFocusCell !== false,
    text: String(initial.text ?? ''),
    interaction: null,
  };
}

export function clearTextSelection(state) {
  if (!state) return false;
  const changed = Boolean(state.anchor || state.focus || state.selecting || state.dragged || state.text);
  state.anchor = null;
  state.focus = null;
  state.selecting = false;
  state.dragged = false;
  state.includeFocusCell = true;
  state.text = '';
  state.interaction = null;
  return changed;
}

export function beginTextSelection(state, point, lines = []) {
  if (!state) return '';
  const next = clampSelectionPoint(point, lines);
  state.anchor = next;
  state.focus = next;
  state.selecting = true;
  state.dragged = false;
  state.includeFocusCell = true;
  state.text = '';
  return state.text;
}

export function updateTextSelection(state, point, lines = [], { includeCell = true } = {}) {
  if (!state?.anchor) return '';
  const next = clampSelectionPoint(point, lines);
  if (comparePoints(state.anchor, next) !== 0) state.dragged = true;
  state.focus = next;
  state.includeFocusCell = includeCell;
  state.text = selectedText(lines, state);
  return state.text;
}

export function completeTextSelection(state, point, lines = [], options = {}) {
  if (!state?.anchor) return '';
  updateTextSelection(state, point, lines, options);
  state.selecting = false;
  if (!state.dragged || !state.text) clearTextSelection(state);
  return state.text;
}

export function selectedText(lines = [], state = null) {
  const source = asTextLineSource(lines);
  const range = normalizeSelectionRange(state, source);
  if (!range) return '';
  const output = [];
  for (let row = range.start.y; row <= range.end.y; row += 1) {
    const line = stripAnsi(source.getLine(row));
    const start = row === range.start.y ? range.start.x : 0;
    const end = row === range.end.y ? range.end.x : visibleLength(line);
    output.push(sliceVisiblePlain(line, start, end));
  }
  return output.join('\n');
}

export function renderTextSelectionLines(lines = [], state = null, {
  open = ansi.inverse,
  close = '\x1b[27m',
  sourceLines = lines,
  rowOffset = 0,
  rowMap = null,
} = {}) {
  const visible = Array.from(lines ?? [], (line) => String(line ?? ''));
  const source = asTextLineSource(sourceLines);
  const range = normalizeSelectionRange(state, source);
  if (!range) return visible;
  const offset = Math.trunc(Number(rowOffset) || 0);
  return visible.map((line, row) => {
    const mapped = Array.isArray(rowMap) ? rowMap[row] : offset + row;
    if (!Number.isInteger(mapped)) return line;
    const sourceRow = mapped;
    if (sourceRow < range.start.y || sourceRow > range.end.y) return line;
    const start = sourceRow === range.start.y ? range.start.x : 0;
    const end = sourceRow === range.end.y ? range.end.x : visibleLength(line);
    return styleVisibleRange(line, start, end, { open, close });
  });
}

export function selectionContainsPoint(state, point, lines = []) {
  const source = asTextLineSource(lines);
  const range = normalizeSelectionRange(state, source);
  if (!range || !point) return false;
  const y = Math.trunc(Number(point.y));
  const x = Math.trunc(Number(point.x));
  if (!Number.isFinite(x) || !Number.isFinite(y) || y < 0 || y >= source.length) return false;
  const width = visibleLength(source.getLine(y));
  if (x < 0 || x >= width) return false;
  const candidate = { x, y };
  return comparePoints(candidate, range.start) >= 0 && comparePoints(candidate, range.end) < 0;
}

export function normalizeSelectionRange(state, lines = []) {
  const source = asTextLineSource(lines);
  if (!state?.anchor || !state?.focus || source.length === 0) return null;
  const anchor = clampSelectionPoint(state.anchor, source);
  const focus = clampSelectionPoint(state.focus, source);
  if (anchor.x === focus.x && anchor.y === focus.y) return null;
  const forward = comparePoints(anchor, focus) <= 0;
  const start = forward ? anchor : focus;
  const last = forward ? focus : anchor;
  const end = state.includeFocusCell === false ? last : advanceSelectionPoint(last, source);
  return { start, end };
}

export function styleVisibleRange(value, start, end, { open = ansi.inverse, close = '\x1b[27m' } = {}) {
  const text = String(value ?? '');
  const safeStart = Math.max(0, Number(start) || 0);
  const safeEnd = Math.max(safeStart, Number(end) || 0);
  if (safeEnd <= safeStart) return text;

  let output = '';
  let visible = 0;
  let index = 0;
  let active = false;

  while (index < text.length) {
    if (text[index] === '\x1b') {
      const match = /^\x1b\[[0-?]*[ -/]*[@-~]/.exec(text.slice(index));
      if (match) {
        output += match[0];
        if (active && match[0] === ansi.reset) output += open;
        index += match[0].length;
        continue;
      }
    }

    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) break;
    const char = String.fromCodePoint(codePoint);
    const width = wcwidth(char);
    const charStart = visible;
    const charEnd = visible + width;
    const selected = width === 0
      ? active
      : charEnd > safeStart && charStart < safeEnd;

    if (selected && !active) {
      output += open;
      active = true;
    } else if (!selected && active) {
      output += close;
      active = false;
    }

    output += char;
    visible = charEnd;
    index += char.length;
  }

  if (active) output += close;
  return output;
}

export function osc52ClipboardSequence(text, options = {}) {
  return buildOsc52ClipboardSequence(text, options);
}

export function copyTextToClipboard(text, {
  output = process.stdout,
  platform = process.platform,
  env = process.env,
  spawnSync,
  osc52 = true,
  target = 'c',
  timeout = 1200,
  clipboard = null,
  clipboardBackend = null,
  clipboardPolicy = undefined,
  securityLimits = null,
  sink = null,
} = {}) {
  const value = String(text ?? '');
  if (clipboard?.copy) return clipboard.copy(value, { osc52, target });
  if (clipboardPolicy === 'legacy') {
    const adapter = createLegacyClipboard({ output, sink, platform, env, spawnSync, osc52, target, timeout, securityLimits });
    return adapter.copy(value, { osc52, target });
  }
  return copyWithClipboardPolicy(value, {
    output,
    sink,
    platform,
    env,
    spawnSync,
    target,
    timeout,
    clipboardBackend,
    clipboardPolicy: clipboardPolicy ?? 'native',
    securityLimits,
  });
}

export function writeClipboardText(text, output = process.stdout, { target = 'c', sink = null } = {}) {
  return writeOsc52Clipboard(text, { output, sink, target });
}

function asTextLineSource(lines) {
  if (lines?.[TEXT_LINE_SOURCE] && typeof lines.getLine === 'function') return lines;

  if (lines && typeof lines.getLine === 'function' && Number.isFinite(Number(lines.length))) {
    return {
      [TEXT_LINE_SOURCE]: true,
      length: normalizeLength(lines.length),
      getLine(index) { return String(lines.getLine(index) ?? ''); },
    };
  }

  if (Array.isArray(lines) || (lines != null && Number.isFinite(Number(lines.length)))) {
    return {
      [TEXT_LINE_SOURCE]: true,
      length: normalizeLength(lines?.length),
      getLine(index) { return String(lines?.[index] ?? ''); },
    };
  }

  const materialized = Array.from(lines ?? []);
  return {
    [TEXT_LINE_SOURCE]: true,
    length: materialized.length,
    getLine(index) { return String(materialized[index] ?? ''); },
  };
}

function normalizeLength(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function clampSelectionPoint(point, lines) {
  const source = asTextLineSource(lines);
  if (!source.length) return { x: 0, y: 0 };
  const y = Math.max(0, Math.min(Math.trunc(Number(point?.y) || 0), source.length - 1));
  const width = visibleLength(source.getLine(y));
  const x = Math.max(0, Math.min(Math.trunc(Number(point?.x) || 0), width));
  return { x, y };
}

function advanceSelectionPoint(point, lines) {
  const source = asTextLineSource(lines);
  if (!source.length) return { x: 0, y: 0 };
  const next = clampSelectionPoint(point, source);
  const width = visibleLength(source.getLine(next.y));
  return { ...next, x: Math.min(width, next.x + 1) };
}

function normalizePoint(point) {
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;
  return { x: Math.max(0, Math.trunc(Number(point.x))), y: Math.max(0, Math.trunc(Number(point.y))) };
}

function comparePoints(a, b) {
  if (a.y !== b.y) return a.y - b.y;
  return a.x - b.x;
}

function sliceVisiblePlain(value, start, end) {
  const text = String(value ?? '');
  const safeStart = Math.max(0, Number(start) || 0);
  const safeEnd = Math.max(safeStart, Number(end) || 0);
  let output = '';
  let visible = 0;
  for (const char of Array.from(text)) {
    const width = wcwidth(char);
    const charStart = visible;
    const charEnd = visible + width;
    if (width === 0) {
      if (output) output += char;
    } else if (charEnd > safeStart && charStart < safeEnd) output += char;
    visible = charEnd;
    if (visible >= safeEnd) break;
  }
  return output;
}
