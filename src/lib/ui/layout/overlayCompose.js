import { takeVisibleAnsi, visibleLength } from '../../ansi/text.js';
import { fit } from './utils.js';

export function composeOverlayLine(base, segment, startCol, width) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeStart = Math.max(0, Math.min(safeWidth, Number(startCol) || 0));
  const prefix = takeVisibleAnsi(base, safeStart);
  const segmentWidth = visibleLength(segment);
  const suffixStart = Math.max(0, safeStart + segmentWidth);
  const suffixWidth = Math.max(0, safeWidth - suffixStart);
  const suffix = suffixWidth ? takeVisibleRangeAnsi(base, suffixStart, suffixWidth) : '';
  return fit(prefix + segment + suffix, safeWidth);
}

export function takeVisibleRangeAnsi(value, start, width) {
  const text = String(value ?? '');
  const safeStart = Math.max(0, Number(start) || 0);
  const safeWidth = Math.max(0, Number(width) || 0);
  if (safeWidth <= 0) return '';
  let output = '';
  let visible = 0;
  let taken = 0;
  let index = 0;
  let openAnsi = '';
  while (index < text.length && taken < safeWidth) {
    if (text[index] === '\x1b') {
      const match = /^\x1b\[[0-?]*[ -/]*[@-~]/.exec(text.slice(index));
      if (match) {
        const code = match[0];
        openAnsi = code === '\x1b[0m' ? '' : code;
        if (visible >= safeStart) output += code;
        index += code.length;
        continue;
      }
    }
    const codePoint = text.codePointAt(index);
    if (codePoint === undefined) break;
    const char = String.fromCodePoint(codePoint);
    const charWidth = visibleLength(char);
    if (visible + charWidth > safeStart && taken + charWidth <= safeWidth) {
      if (!output && openAnsi) output += openAnsi;
      output += char;
      taken += charWidth;
    }
    visible += charWidth;
    index += char.length;
  }
  return output && openAnsi ? output + '\x1b[0m' : output;
}
