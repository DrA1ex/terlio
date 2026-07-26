import { ansi } from './codes.js';
import { sanitizeSgrStyle } from '../terminal/controlParser.js';

export function color(theme, token, text) {
  const open = sanitizeSgrStyle(theme?.[token] ?? '');
  return `${open}${text}${ansi.reset}`;
}

export function stripAnsi(value) {
  return String(value).replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

export function visibleLength(value) {
  let width = 0;
  for (const char of Array.from(stripAnsi(value))) width += wcwidth(char);
  return width;
}

export function wcwidth(char) {
  if (!char) return 0;
  const code = char.codePointAt(0);
  if (code === undefined) return 0;
  if (code === 0) return 0;
  if (code < 32 || (code >= 0x7f && code < 0xa0)) return 0;
  if (isCombining(code) || isVariationSelector(code) || isZeroWidthJoiner(code)) return 0;
  if (isWide(code)) return 2;
  return 1;
}

export function padEndVisible(value, width) {
  const current = visibleLength(value);
  if (current >= width) return value;
  return value + ' '.repeat(width - current);
}

export function truncateVisible(value, width, tail = '…') {
  const text = String(value ?? '');
  const safeWidth = Math.max(0, Number(width) || 0);
  if (visibleLength(text) <= safeWidth) return text;
  if (safeWidth <= 0) return '';
  const safeTail = String(tail ?? '');
  const tailWidth = visibleLength(safeTail);
  if (safeWidth <= tailWidth) return takeVisibleAnsi(safeTail, safeWidth);
  return takeVisibleAnsi(text, safeWidth - tailWidth) + safeTail + (hasAnsi(text) ? ansi.reset : '');
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
    const charWidth = wcwidth(char);
    if (visible + charWidth > safeWidth) break;
    output += char;
    visible += charWidth;
    index += char.length;
  }
  return sawAnsi ? output + ansi.reset : output;
}

function hasAnsi(value) {
  return /\x1B\[[0-?]*[ -/]*[@-~]/.test(String(value ?? ''));
}

function isZeroWidthJoiner(code) { return code === 0x200d; }
function isVariationSelector(code) { return (code >= 0xfe00 && code <= 0xfe0f) || (code >= 0xe0100 && code <= 0xe01ef); }
function isCombining(code) {
  return (code >= 0x0300 && code <= 0x036f) ||
    (code >= 0x0483 && code <= 0x0489) ||
    (code >= 0x0591 && code <= 0x05bd) ||
    code === 0x05bf ||
    (code >= 0x05c1 && code <= 0x05c2) ||
    (code >= 0x05c4 && code <= 0x05c5) ||
    code === 0x05c7 ||
    (code >= 0x0610 && code <= 0x061a) ||
    (code >= 0x064b && code <= 0x065f) ||
    code === 0x0670 ||
    (code >= 0x06d6 && code <= 0x06dd) ||
    (code >= 0x06df && code <= 0x06e4) ||
    (code >= 0x06e7 && code <= 0x06e8) ||
    (code >= 0x06ea && code <= 0x06ed) ||
    (code >= 0x0711 && code <= 0x0711) ||
    (code >= 0x0730 && code <= 0x074a) ||
    (code >= 0x07a6 && code <= 0x07b0) ||
    (code >= 0x07eb && code <= 0x07f3) ||
    (code >= 0x0816 && code <= 0x0819) ||
    (code >= 0x081b && code <= 0x0823) ||
    (code >= 0x0825 && code <= 0x0827) ||
    (code >= 0x0829 && code <= 0x082d) ||
    (code >= 0x0859 && code <= 0x085b) ||
    (code >= 0x08d3 && code <= 0x08ff) ||
    (code >= 0x0900 && code <= 0x0903) ||
    (code >= 0x093a && code <= 0x093c) ||
    (code >= 0x0941 && code <= 0x0948) ||
    (code >= 0x094d && code <= 0x094d) ||
    (code >= 0x0951 && code <= 0x0957) ||
    (code >= 0x1ab0 && code <= 0x1aff) ||
    (code >= 0x1dc0 && code <= 0x1dff) ||
    (code >= 0x20d0 && code <= 0x20ff) ||
    (code >= 0xfe20 && code <= 0xfe2f);
}

function isWide(code) {
  return (code >= 0x1100 && (
    code <= 0x115f ||
    code === 0x2329 || code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  )) || isEmojiWide(code);
}

function isEmojiWide(code) {
  // Keep legacy symbols such as ✓, ×, → and box-adjacent dingbats at width 1.
  // Most terminals render them as single-cell text unless an emoji presentation
  // selector is present, and treating the whole 2600-27BF range as wide breaks
  // border alignment. Pictographic emoji ranges remain double-width.
  return (code >= 0x1f300 && code <= 0x1f64f) ||
    (code >= 0x1f680 && code <= 0x1f6ff) ||
    (code >= 0x1f700 && code <= 0x1f77f) ||
    (code >= 0x1f780 && code <= 0x1f7ff) ||
    (code >= 0x1f800 && code <= 0x1f8ff) ||
    (code >= 0x1f900 && code <= 0x1f9ff) ||
    (code >= 0x1fa70 && code <= 0x1faff);
}
