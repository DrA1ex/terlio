import { stripAnsi, visibleLength } from '../ansi/text.js';
import { normalizePointerRegions } from '../pointer.js';
import { DEFAULT_TERMINAL_LIMITS } from '../terminal/policy.js';

const OVERDRAW_GLYPH_RE = /[\u2580-\u259f■]/u;
const frameRowPaintPriorities = new WeakMap();

export class Frame {
  constructor(lines, {
    width,
    height,
    pointerRegions = [],
    pointerRegionLimit = DEFAULT_TERMINAL_LIMITS.pointerRegions,
  }) {
    this.width = Math.max(1, Number(width) || 1);
    this.height = Math.max(1, Number(height) || 1);
    this.lines = normalizeLines(lines, this.width, this.height);
    frameRowPaintPriorities.set(this, this.lines.map(inferRowPaintPriority));
    this.pointerRegions = normalizePointerRegions(pointerRegions, {
      width: this.width,
      height: this.height,
      maxRegions: pointerRegionLimit,
      preserveUnknownParents: false,
    });
  }

  toLines() {
    return [...this.lines];
  }

  toString() {
    return this.lines.join('\n');
  }

  equals(other) {
    if (!other || this.width !== other.width || this.height !== other.height) return false;
    return this.lines.every((line, index) => line === other.lines[index]);
  }
}

export function createFrame(lines = [], options = {}) {
  return new Frame(lines, options);
}

export function getFrameRowPaintPriority(frame, rowIndex) {
  return Number(frameRowPaintPriorities.get(frame)?.[rowIndex]) || 0;
}

function inferRowPaintPriority(line) {
  return OVERDRAW_GLYPH_RE.test(stripAnsi(String(line ?? ''))) ? 1 : 0;
}

export function normalizeLines(lines, width, height) {
  const source = Array.isArray(lines) ? lines : String(lines ?? '').split('\n');
  const result = source.slice(0, height).map((line) => padEndVisible(truncateVisibleText(String(line ?? ''), width), width));
  while (result.length < height) result.push(' '.repeat(width));
  return result;
}

export function truncateVisibleText(value, width) {
  const text = String(value ?? '');
  if (visibleLength(text) <= width) return text;
  // ANSI-aware truncation is intentionally conservative: when a styled line must
  // be hard-truncated, remove styling first so the virtual frame stays stable.
  return Array.from(stripAnsi(text)).slice(0, width).join('');
}

export function padEndVisible(value, width) {
  const current = visibleLength(value);
  return current >= width ? value : value + ' '.repeat(width - current);
}
