import { takeVisibleAnsi, visibleLength } from '../../ansi/text.js';

export function applyFixedHeight(lines, width, height) {
  if (height === null) return lines;
  const safeHeight = Math.max(0, Number(height) || 0);
  const fitted = lines.slice(0, safeHeight);
  while (fitted.length < safeHeight) fitted.push(' '.repeat(width));
  return fitted;
}

export function distribute(total, count) {
  const safeCount = Math.max(1, count);
  const base = Math.floor(total / safeCount);
  const remainder = total % safeCount;
  return Array.from({ length: safeCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function fit(value, width) {
  const safeWidth = Math.max(0, Number(width) || 0);
  const text = String(value ?? '');
  const fitted = visibleLength(text) > safeWidth ? takeVisibleAnsi(text, safeWidth) : text;
  const size = visibleLength(fitted);
  return size < safeWidth ? fitted + ' '.repeat(safeWidth - size) : fitted;
}

export function fitTitle(title, width) {
  if (!title) return '─'.repeat(width);
  const clean = fit(title, width);
  return clean + '─'.repeat(Math.max(0, width - visibleLength(clean)));
}

export function normalizeSpacing(value) {
  if (typeof value === 'number') return { top: value, right: value, bottom: value, left: value };
  return {
    top: Number(value.top ?? 0),
    right: Number(value.right ?? 0),
    bottom: Number(value.bottom ?? 0),
    left: Number(value.left ?? 0),
  };
}

export function withHeight(node, height) {
  if (!node || typeof node !== 'object' || !node.type) return node;
  return {
    ...node,
    props: { ...node.props, height },
  };
}

export function wrapPlain(value, width) {
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
