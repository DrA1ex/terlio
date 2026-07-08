import { stripAnsi, visibleLength } from '../ansi.js';

export class Frame {
  constructor(lines, { width, height }) {
    this.width = Math.max(1, Number(width) || 1);
    this.height = Math.max(1, Number(height) || 1);
    this.lines = normalizeLines(lines, this.width, this.height);
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
