import { ansi } from './codes.js';

export function color(theme, token, text) {
  const open = theme[token] ?? '';
  return `${open}${text}${ansi.reset}`;
}

export function stripAnsi(value) {
  return String(value).replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

export function visibleLength(value) {
  return Array.from(stripAnsi(value)).length;
}

export function padEndVisible(value, width) {
  const current = visibleLength(value);
  if (current >= width) return value;
  return value + ' '.repeat(width - current);
}

export function truncateVisible(value, width, tail = '…') {
  const text = String(value ?? '');
  const safeWidth = Math.max(0, Number(width) || 0);
  const plainLength = visibleLength(text);
  if (plainLength <= safeWidth) return text;
  if (safeWidth <= 0) return '';
  const safeTail = String(tail ?? '');
  if (safeWidth <= visibleLength(safeTail)) return Array.from(stripAnsi(safeTail)).slice(0, safeWidth).join('');
  return takeVisibleAnsi(text, safeWidth - visibleLength(safeTail)) + safeTail + (hasAnsi(text) ? ansi.reset : '');
}

export function takeVisibleAnsi(value, width) {
  const text = String(value ?? '');
  const safeWidth = Math.max(0, Number(width) || 0);
  if (safeWidth <= 0) return '';

  let output = '';
  let visible = 0;
  let index = 0;
  let sawAnsi = false;

  while (index < text.length && visible < safeWidth) {
    if (text[index] === '\x1b') {
      const match = /^\x1b\[[0-?]*[ -/]*[@-~]/.exec(text.slice(index));
      if (match) {
        output += match[0];
        index += match[0].length;
        sawAnsi = true;
        continue;
      }
    }

    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) break;
    const char = String.fromCodePoint(codePoint);
    output += char;
    visible += 1;
    index += char.length;
  }

  return sawAnsi ? output + ansi.reset : output;
}

function hasAnsi(value) {
  return /\x1B\[[0-?]*[ -/]*[@-~]/.test(String(value ?? ''));
}
