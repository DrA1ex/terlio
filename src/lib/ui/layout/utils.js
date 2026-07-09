import { stripAnsi, takeVisibleAnsi, visibleLength } from '../../ansi/text.js';

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
  const safeWidth = Math.max(1, Number(width) || 1);
  const text = stripAnsi(String(value ?? ''));
  const lines = [];
  for (const raw of text.split('\n')) {
    if (raw === '') {
      lines.push('');
      continue;
    }
    let line = '';
    const tokens = raw.match(/\S+\s*/g) ?? [''];
    for (const token of tokens) {
      const cleanToken = token.replace(/\s+$/g, '');
      const space = token.endsWith(' ') ? ' ' : '';
      const candidate = line + cleanToken + space;
      if (line && visibleLength(candidate) > safeWidth) {
        lines.push(line.trimEnd());
        line = '';
      }
      if (visibleLength(cleanToken) > safeWidth) {
        if (line) {
          lines.push(line.trimEnd());
          line = '';
        }
        let rest = cleanToken;
        while (visibleLength(rest) > safeWidth) {
          const chunk = takeVisibleAnsi(rest, safeWidth);
          if (!chunk || visibleLength(chunk) === 0) {
            const chars = Array.from(stripAnsi(rest));
            if (!chars.length) {
              rest = '';
              break;
            }
            const fallback = chars.shift();
            lines.push(fallback);
            rest = chars.join('');
            continue;
          }
          lines.push(chunk);
          rest = dropVisiblePrefixAnsi(rest, visibleLength(chunk));
        }
        line = rest + space;
      } else {
        line += cleanToken + space;
      }
    }
    if (line || !lines.length) lines.push(line.trimEnd());
  }
  return lines;
}

function dropVisiblePrefixAnsi(value, cells) {
  const text = String(value ?? '');
  const target = Math.max(0, Number(cells) || 0);
  if (target <= 0) return text;
  let visible = 0;
  let index = 0;
  while (index < text.length && visible < target) {
    if (text[index] === '\x1b') {
      const match = /^\x1b\[[0-?]*[ -/]*[@-~]/.exec(text.slice(index));
      if (match) {
        index += match[0].length;
        continue;
      }
    }
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) break;
    const char = String.fromCodePoint(codePoint);
    visible += visibleLength(char);
    index += char.length;
  }
  return text.slice(index).replace(/^(?:\x1b\[[0-?]*[ -/]*[@-~])+/, '');
}
