import { stripAnsi, visibleLength } from './ansi.js';

export function wrapText(text, width, indent = '') {
  const safeWidth = Math.max(8, width);
  const rawLines = String(text ?? '').split('\n');
  const lines = [];

  for (const rawLine of rawLines) {
    if (rawLine.trim() === '') {
      lines.push('');
      continue;
    }

    const words = rawLine.split(/(\s+)/).filter((part) => part.length > 0);
    let line = '';

    for (const word of words) {
      if (/^\s+$/.test(word)) {
        if (line !== '' && !line.endsWith(' ')) line += ' ';
        continue;
      }

      const candidate = line ? line + word : word;
      if (visibleLength(candidate) <= safeWidth) {
        line = candidate;
        continue;
      }

      if (line) {
        lines.push(line.trimEnd());
        line = indent;
      }

      if (visibleLength(word) > safeWidth) {
        const chunks = hardWrap(stripAnsi(word), safeWidth, indent);
        lines.push(...chunks.slice(0, -1));
        line = chunks.at(-1) ?? '';
      } else {
        line += word;
      }
    }

    lines.push(line.trimEnd());
  }

  return lines;
}

function hardWrap(text, width, indent) {
  const chars = Array.from(text);
  const result = [];
  let current = '';

  for (const char of chars) {
    if (visibleLength(current + char) > width) {
      result.push(current);
      current = indent + char;
    } else {
      current += char;
    }
  }

  if (current) result.push(current);
  return result;
}
