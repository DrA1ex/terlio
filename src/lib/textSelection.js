import { spawnSync as nodeSpawnSync } from 'node:child_process';
import { ansi } from './ansi/codes.js';
import { stripAnsi, visibleLength, wcwidth } from './ansi/text.js';

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
  const range = normalizeSelectionRange(state, lines);
  if (!range) return '';
  const plain = Array.from(lines ?? [], (line) => stripAnsi(String(line ?? '')));
  const output = [];
  for (let row = range.start.y; row <= range.end.y; row += 1) {
    const line = plain[row] ?? '';
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
} = {}) {
  const visible = Array.from(lines ?? [], (line) => String(line ?? ''));
  const source = Array.from(sourceLines ?? [], (line) => String(line ?? ''));
  const range = normalizeSelectionRange(state, source);
  if (!range) return visible;
  const offset = Math.trunc(Number(rowOffset) || 0);
  return visible.map((line, row) => {
    const sourceRow = offset + row;
    if (sourceRow < range.start.y || sourceRow > range.end.y) return line;
    const start = sourceRow === range.start.y ? range.start.x : 0;
    const end = sourceRow === range.end.y ? range.end.x : visibleLength(line);
    return styleVisibleRange(line, start, end, { open, close });
  });
}

export function selectionContainsPoint(state, point, lines = []) {
  const source = Array.from(lines ?? [], (line) => String(line ?? ''));
  const range = normalizeSelectionRange(state, source);
  if (!range || !point) return false;
  const y = Math.trunc(Number(point.y));
  const x = Math.trunc(Number(point.x));
  if (!Number.isFinite(x) || !Number.isFinite(y) || y < 0 || y >= source.length) return false;
  const width = visibleLength(source[y]);
  if (x < 0 || x >= width) return false;
  const candidate = { x, y };
  return comparePoints(candidate, range.start) >= 0 && comparePoints(candidate, range.end) < 0;
}

export function normalizeSelectionRange(state, lines = []) {
  if (!state?.anchor || !state?.focus || !Array.isArray(lines) || lines.length === 0) return null;
  const anchor = clampSelectionPoint(state.anchor, lines);
  const focus = clampSelectionPoint(state.focus, lines);
  if (anchor.x === focus.x && anchor.y === focus.y) return null;
  const forward = comparePoints(anchor, focus) <= 0;
  const start = forward ? anchor : focus;
  const last = forward ? focus : anchor;
  const end = state.includeFocusCell === false ? last : advanceSelectionPoint(last, lines);
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

export function osc52ClipboardSequence(text, { target = 'c' } = {}) {
  const value = String(text ?? '');
  return `\x1b]52;${target};${Buffer.from(value, 'utf8').toString('base64')}\x07`;
}

export function copyTextToClipboard(text, {
  output = process.stdout,
  platform = process.platform,
  env = process.env,
  spawnSync = nodeSpawnSync,
  osc52 = true,
  target = 'c',
  timeout = 1200,
} = {}) {
  const value = String(text ?? '');
  if (!value) return { copied: false, method: null };

  for (const candidate of clipboardCommands(platform, env)) {
    const result = runClipboardCommand(candidate, value, { spawnSync, timeout });
    if (result) return { copied: true, method: candidate.method };
  }

  if (osc52 && output && typeof output.write === 'function') {
    output.write(osc52ClipboardSequence(value, { target }));
    return { copied: true, method: 'osc52' };
  }

  return { copied: false, method: null };
}

export function writeClipboardText(text, output = process.stdout, { target = 'c' } = {}) {
  const value = String(text ?? '');
  if (!value || !output || typeof output.write !== 'function') return false;
  output.write(osc52ClipboardSequence(value, { target }));
  return true;
}

function clipboardCommands(platform, env = {}) {
  if (platform === 'darwin') return [
    { method: 'pbcopy', command: 'pbcopy', args: [] },
  ];

  if (platform === 'win32') return [
    {
      method: 'powershell',
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command', '[Console]::In.ReadToEnd() | Set-Clipboard'],
    },
    { method: 'clip.exe', command: 'clip.exe', args: [] },
  ];

  const commands = [];
  if (env?.WSL_DISTRO_NAME || env?.WSL_INTEROP) commands.push({ method: 'clip.exe', command: 'clip.exe', args: [] });
  if (env?.WAYLAND_DISPLAY) commands.push({ method: 'wl-copy', command: 'wl-copy', args: ['--type', 'text/plain;charset=utf-8'] });
  commands.push(
    { method: 'xclip', command: 'xclip', args: ['-selection', 'clipboard', '-in'] },
    { method: 'xsel', command: 'xsel', args: ['--clipboard', '--input'] },
  );
  return commands;
}

function runClipboardCommand(candidate, value, { spawnSync, timeout }) {
  if (typeof spawnSync !== 'function') return false;
  try {
    const result = spawnSync(candidate.command, candidate.args, {
      input: value,
      encoding: 'utf8',
      stdio: ['pipe', 'ignore', 'ignore'],
      windowsHide: true,
      timeout: Math.max(100, Number(timeout) || 1200),
    });
    return !result?.error && Number(result?.status) === 0;
  } catch {
    return false;
  }
}

function clampSelectionPoint(point, lines) {
  const source = Array.from(lines ?? [], (line) => String(line ?? ''));
  if (!source.length) return { x: 0, y: 0 };
  const y = Math.max(0, Math.min(Math.trunc(Number(point?.y) || 0), source.length - 1));
  const width = visibleLength(source[y]);
  const x = Math.max(0, Math.min(Math.trunc(Number(point?.x) || 0), width));
  return { x, y };
}

function advanceSelectionPoint(point, lines) {
  const source = Array.from(lines ?? [], (line) => String(line ?? ''));
  if (!source.length) return { x: 0, y: 0 };
  const next = clampSelectionPoint(point, source);
  const width = visibleLength(source[next.y]);
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
