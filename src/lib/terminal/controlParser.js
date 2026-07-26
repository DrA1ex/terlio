const ESC = '\u001b';
const BEL = '\u0007';
const C1_CSI = '\u009b';
const C1_ST = '\u009c';

const CONTROL_PICTURES = Object.freeze({
  '\u0000': '␀', '\u0001': '␁', '\u0002': '␂', '\u0003': '␃',
  '\u0004': '␄', '\u0005': '␅', '\u0006': '␆', '\u0007': '␇',
  '\u0008': '␈', '\u0009': '␉', '\u000a': '␊', '\u000b': '␋',
  '\u000c': '␌', '\u000d': '␍', '\u000e': '␎', '\u000f': '␏',
  '\u0010': '␐', '\u0011': '␑', '\u0012': '␒', '\u0013': '␓',
  '\u0014': '␔', '\u0015': '␕', '\u0016': '␖', '\u0017': '␗',
  '\u0018': '␘', '\u0019': '␙', '\u001a': '␚', '\u001b': '␛',
  '\u001c': '␜', '\u001d': '␝', '\u001e': '␞', '\u001f': '␟',
  '\u007f': '␡',
});

export function parseTerminalControls(value) {
  return Array.from(iterateTerminalControls(value));
}

function* iterateTerminalControls(value) {
  const text = normalizeTerminalNewlines(value);
  let plainStart = 0;
  let index = 0;

  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (!isControlStart(code)) {
      index += isSurrogatePair(text, index) ? 2 : 1;
      continue;
    }

    if (index > plainStart) yield { type: 'text', value: text.slice(plainStart, index) };
    const token = readControlToken(text, index);
    yield token;
    index = token.end;
    plainStart = index;
  }

  if (plainStart < text.length) yield { type: 'text', value: text.slice(plainStart) };
}

export function sanitizeTerminalText(value, {
  blockedControlRendering = 'visible',
  allowSgr = true,
} = {}) {
  let output = '';
  for (const token of iterateTerminalControls(value)) {
    if (token.type === 'text') {
      output += token.value;
      continue;
    }
    if (token.type === 'line-break') {
      output += '\n';
      continue;
    }
    if (token.type === 'tab') {
      output += '\t';
      continue;
    }
    if (allowSgr && token.kind === 'csi' && isValidatedSgr(token.value)) {
      output += normalizeC1Sequence(token.value);
      continue;
    }
    output += renderBlockedControl(token.value, blockedControlRendering);
  }
  return output;
}

export function sanitizeTrustedTerminalControl(value, {
  blockedControlRendering = 'remove',
} = {}) {
  let output = '';
  for (const token of iterateTerminalControls(value)) {
    if (token.type === 'text' || token.type === 'line-break' || token.type === 'tab') {
      output += token.value;
      continue;
    }
    if (isAllowedLibraryControl(token)) {
      output += normalizeC1Sequence(token.value);
      continue;
    }
    output += renderBlockedControl(token.value, blockedControlRendering);
  }
  return output;
}


export function sanitizeSgrStyle(value) {
  let output = '';
  let sawToken = false;
  for (const token of iterateTerminalControls(value)) {
    sawToken = true;
    if (token.type === 'text') {
      if (token.value !== '') return '';
      continue;
    }
    if (token.type !== 'control' || token.kind !== 'csi' || !isValidatedSgr(token.value)) return '';
    output += normalizeC1Sequence(token.value);
  }
  return sawToken ? output : '';
}

export function isValidatedSgr(value) {
  const normalized = normalizeC1Sequence(String(value ?? ''));
  const match = /^\u001b\[([0-9:;]*)m$/u.exec(normalized);
  if (!match) return false;
  const raw = match[1];
  if (raw === '') return true;
  if (raw.includes(':')) return validateColonSgr(raw);
  const values = raw.split(';').map((part) => part === '' ? 0 : Number(part));
  if (values.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return false;

  for (let index = 0; index < values.length; index += 1) {
    const code = values[index];
    if (isSimpleSgrCode(code)) continue;
    if (code === 38 || code === 48 || code === 58) {
      const mode = values[index + 1];
      if (mode === 5 && isByte(values[index + 2])) {
        index += 2;
        continue;
      }
      if (mode === 2 && isByte(values[index + 2]) && isByte(values[index + 3]) && isByte(values[index + 4])) {
        index += 4;
        continue;
      }
      return false;
    }
    return false;
  }
  return true;
}

export function isAllowedLibraryControl(tokenOrValue) {
  const token = typeof tokenOrValue === 'string'
    ? firstControlToken(tokenOrValue)
    : tokenOrValue;
  if (!token || token.type !== 'control') return false;
  const value = normalizeC1Sequence(token.value);
  if (isValidatedSgr(value)) return true;
  if (/^\u001b\[(?:[1-9]\d*;[1-9]\d*)?H$/u.test(value)) return true;
  if (/^\u001b\[(?:0|1|2)?J$/u.test(value)) return true;
  if (/^\u001b\[(?:0|1|2)?K$/u.test(value)) return true;
  if (/^\u001b\?$/u.test(value)) return false;
  return /^\u001b\[\?(?:7|25|1000|1002|1003|1006|1049|2004)[hl]$/u.test(value);
}

export function normalizeTerminalNewlines(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n');
}

export function renderBlockedControl(value, mode = 'visible') {
  if (mode === 'remove') return '';
  return visibleControlNotation(value);
}

export function visibleControlNotation(value) {
  const text = String(value ?? '');
  let output = '';
  for (let index = 0; index < text.length;) {
    const code = text.charCodeAt(index);
    const char = text[index];
    if (char === ESC) {
      output += CONTROL_PICTURES[ESC];
      index += 1;
      continue;
    }
    if (code >= 0x80 && code <= 0x9f) {
      output += `\\u${code.toString(16).padStart(4, '0')}`;
      index += 1;
      continue;
    }
    if (code < 0x20 || code === 0x7f) {
      output += CONTROL_PICTURES[char] ?? `\\x${code.toString(16).padStart(2, '0')}`;
      index += 1;
      continue;
    }
    const point = text.codePointAt(index);
    const next = String.fromCodePoint(point);
    output += next;
    index += next.length;
  }
  return output;
}

function readControlToken(text, start) {
  const code = text.charCodeAt(start);
  if (text[start] === '\n') return { type: 'line-break', kind: 'line-break', value: '\n', start, end: start + 1 };
  if (text[start] === '\t') return { type: 'tab', kind: 'tab', value: '\t', start, end: start + 1 };
  if (text[start] === ESC) return readEscControl(text, start);
  if (code === 0x9b) return readCsi(text, start, 1);
  if (code === 0x9d) return readStringControl(text, start, 1, 'osc', true);
  if (code === 0x90) return readStringControl(text, start, 1, 'dcs', false);
  if (code === 0x9f) return readStringControl(text, start, 1, 'apc', false);
  if (code === 0x9e) return readStringControl(text, start, 1, 'pm', false);
  if (code === 0x98) return readStringControl(text, start, 1, 'sos', false);
  return { type: 'control', kind: code >= 0x80 ? 'c1' : 'c0', value: text[start], start, end: start + 1 };
}

function readEscControl(text, start) {
  if (start + 1 >= text.length) return { type: 'control', kind: 'esc-incomplete', value: ESC, start, end: start + 1, incomplete: true };
  const next = text[start + 1];
  if (next === '[') return readCsi(text, start, 2);
  if (next === ']') return readStringControl(text, start, 2, 'osc', true);
  if (next === 'P') return readStringControl(text, start, 2, 'dcs', false);
  if (next === '_') return readStringControl(text, start, 2, 'apc', false);
  if (next === '^') return readStringControl(text, start, 2, 'pm', false);
  if (next === 'X') return readStringControl(text, start, 2, 'sos', false);
  if (next === '\\') return { type: 'control', kind: 'st', value: text.slice(start, start + 2), start, end: start + 2 };

  let end = start + 1;
  while (end < text.length && text.charCodeAt(end) >= 0x20 && text.charCodeAt(end) <= 0x2f) end += 1;
  if (end < text.length) end += 1;
  return { type: 'control', kind: 'esc', value: text.slice(start, end), start, end, incomplete: end > text.length };
}

function readCsi(text, start, prefixLength) {
  let end = start + prefixLength;
  while (end < text.length) {
    const code = text.charCodeAt(end);
    end += 1;
    if (code >= 0x40 && code <= 0x7e) {
      return { type: 'control', kind: 'csi', value: text.slice(start, end), start, end };
    }
    if (code < 0x20 || code > 0x3f) break;
  }
  return { type: 'control', kind: 'csi', value: text.slice(start, end), start, end, incomplete: true };
}

function readStringControl(text, start, prefixLength, kind, allowBel) {
  let end = start + prefixLength;
  while (end < text.length) {
    if (allowBel && text[end] === BEL) {
      end += 1;
      return { type: 'control', kind, value: text.slice(start, end), start, end };
    }
    if (text[end] === C1_ST) {
      end += 1;
      return { type: 'control', kind, value: text.slice(start, end), start, end };
    }
    if (text[end] === ESC && text[end + 1] === '\\') {
      end += 2;
      return { type: 'control', kind, value: text.slice(start, end), start, end };
    }
    end += 1;
  }
  return { type: 'control', kind, value: text.slice(start), start, end: text.length, incomplete: true };
}

function isSurrogatePair(text, index) {
  const high = text.charCodeAt(index);
  const low = text.charCodeAt(index + 1);
  return high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff;
}

function isControlStart(code) {
  return code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
}

function firstControlToken(value) {
  for (const token of iterateTerminalControls(value)) {
    if (token.type === 'control') return token;
  }
  return null;
}

function normalizeC1Sequence(value) {
  const text = String(value ?? '');
  if (text.startsWith(C1_CSI)) return `${ESC}[${text.slice(1)}`;
  return text;
}

function isSimpleSgrCode(code) {
  return code === 0 || [1, 2, 3, 4, 7, 9, 21, 22, 23, 24, 27, 29, 39, 49, 53, 55, 59].includes(code) ||
    (code >= 30 && code <= 37) || (code >= 40 && code <= 47) ||
    (code >= 90 && code <= 97) || (code >= 100 && code <= 107);
}

function validateColonSgr(raw) {
  const fields = raw.split(';');
  return fields.every((field) => {
    if (!field.includes(':')) return isSimpleSgrCode(field === '' ? 0 : Number(field));
    const values = field.split(':');
    if (![38, 48, 58].includes(Number(values[0]))) return false;
    if (Number(values[1]) === 5) return values.length === 3 && isByte(Number(values[2]));
    if (Number(values[1]) === 2) {
      const rgb = values.filter((_, index) => index !== 0 && index !== 1 && values[index] !== '').map(Number);
      return rgb.length >= 3 && rgb.slice(-3).every(isByte);
    }
    return false;
  });
}

function isByte(value) {
  return Number.isInteger(value) && value >= 0 && value <= 255;
}
