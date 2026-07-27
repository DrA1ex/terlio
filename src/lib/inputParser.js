import { parseKey } from './keyParser.js';
import { parsePointer } from './pointer.js';
import { DEFAULT_SECURITY_LIMITS, mergeSecurityLimits, truncateUtf8, utf8ByteLength } from './securityLimits.js';

const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';
const ESC = '\x1b';
const ST = '\x1b\\';

export class TerminalInputDecoder {
  constructor({ limits = {}, pasteOverflow = 'reject', inputPolicy = 'safe' } = {}) {
    this.buffer = '';
    this.discardingPaste = false;
    this.discardPasteTail = '';
    this.limits = mergeSecurityLimits(DEFAULT_SECURITY_LIMITS, limits);
    this.pasteOverflow = pasteOverflow === 'truncate' ? 'truncate' : 'reject';
    this.inputPolicy = inputPolicy === 'trusted' ? 'trusted' : 'safe';
  }

  write(data) {
    let incoming = Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '');
    const events = [];

    if (this.discardingPaste) {
      const discarded = `${this.discardPasteTail}${incoming}`;
      const end = discarded.indexOf(PASTE_END);
      if (end < 0) {
        this.discardPasteTail = discarded.slice(-Math.max(0, PASTE_END.length - 1));
        return events;
      }
      this.discardingPaste = false;
      this.discardPasteTail = '';
      incoming = discarded.slice(end + PASTE_END.length);
    }

    this.buffer += incoming;

    while (this.buffer) {
      if (this.buffer.startsWith(PASTE_START)) {
        const paste = this.extractPaste();
        if (!paste) {
          const retainedLimit = pasteBufferByteLimit(this.limits);
          const actual = utf8ByteLength(this.buffer);
          if (retainedLimit !== Infinity && actual > retainedLimit) {
            events.push(rejectedEvent('paste-limit', 'pasteBytes', this.limits.pasteBytes, actual));
            this.discardingPaste = true;
            this.discardPasteTail = this.buffer.slice(-Math.max(0, PASTE_END.length - 1));
            this.buffer = '';
          }
          break;
        }
        this.buffer = this.buffer.slice(paste.length);
        events.push(paste.event);
        continue;
      }

      const extracted = extractSequence(this.buffer, this.limits);
      if (!extracted) break;
      this.buffer = this.buffer.slice(extracted.length);
      if (extracted.discard) continue;

      let event = null;
      try {
        event = parsePointer(extracted.sequence) ?? parseKey(extracted.sequence);
      } catch {
        event = null;
      }
      if (!event || event.name === 'unknown' && extracted.terminalReply) continue;

      events.push(event);
    }

    // inputBufferBytes applies only to the incomplete tail retained between
    // writes. Complete text/key events above are never rejected merely because
    // they arrived in one large terminal chunk.
    if (this.buffer && utf8ByteLength(this.buffer) > this.limits.inputBufferBytes) {
      const actual = utf8ByteLength(this.buffer);
      this.buffer = '';
      events.push(rejectedEvent('input-limit', 'inputBufferBytes', this.limits.inputBufferBytes, actual));
    }

    return events;
  }

  extractPaste() {
    const end = this.buffer.indexOf(PASTE_END, PASTE_START.length);
    if (end < 0) return null;

    const length = end + PASTE_END.length;
    const raw = this.buffer.slice(PASTE_START.length, end);
    const actual = utf8ByteLength(raw);
    if (actual > this.limits.pasteBytes) {
      if (this.pasteOverflow === 'reject') {
        return {
          length,
          event: rejectedEvent('paste-limit', 'pasteBytes', this.limits.pasteBytes, actual),
        };
      }
      return {
        length,
        event: pasteEvent(this.sanitizePaste(truncateUtf8(raw, this.limits.pasteBytes)), {
          truncated: true,
          actualBytes: actual,
          limit: this.limits.pasteBytes,
        }),
      };
    }

    return { length, event: pasteEvent(this.sanitizePaste(raw)) };
  }

  sanitizePaste(value) {
    // Paste is data, not terminal output. Preserve it here and rely on the
    // renderer/sink boundary to make control sequences harmless when shown.
    return String(value ?? '').replace(/\r\n?/g, '\n');
  }

  hasPendingStandaloneEscape() {
    return this.buffer === ESC;
  }

  flushPendingEscape() {
    if (!this.hasPendingStandaloneEscape()) return [];
    this.buffer = '';
    return [parseKey(ESC)];
  }

  reset() {
    this.buffer = '';
    this.discardingPaste = false;
    this.discardPasteTail = '';
  }
}

export function parseInputEvents(data, options = {}) {
  const decoder = new TerminalInputDecoder(options);
  const events = decoder.write(data);
  events.push(...decoder.flushPendingEscape());
  if (decoder.buffer) {
    const residual = decoder.buffer;
    decoder.reset();
    if (!residual.startsWith(ESC)) {
      try { events.push(parseKey(residual)); } catch { /* discard malformed residual input */ }
    }
  }
  return events;
}

export function parseInputEvent(data, options = {}) {
  return parseInputEvents(data, options)[0] ?? parseKey('');
}

function extractSequence(buffer, limits) {
  if (!buffer) return null;

  if (buffer.startsWith('\x1b[<')) return extractCsi(buffer, limits, { pointer: true });
  if (buffer.startsWith('\x1b[')) return extractCsi(buffer, limits);
  if (buffer.startsWith('\x1bO')) return extractSs3(buffer, limits);
  if (buffer.startsWith('\x1b]')) return extractStringControl(buffer, limits, '\x07');
  if (buffer.startsWith('\x1bP') || buffer.startsWith('\x1b_') || buffer.startsWith('\x1b^') || buffer.startsWith('\x1bX')) {
    return extractStringControl(buffer, limits, null);
  }

  const firstCode = buffer.codePointAt(0);
  if (firstCode >= 0x80 && firstCode <= 0x9f) {
    if ([0x90, 0x98, 0x9d, 0x9e, 0x9f].includes(firstCode)) return extractC1StringControl(buffer, limits, firstCode === 0x9d);
    return { sequence: buffer[0], length: 1, discard: true, terminalReply: true };
  }

  if (buffer[0] === ESC) {
    // A lone Esc is ambiguous with the first byte of every legacy function
    // key sequence. Keep it until another chunk arrives or the runtime's
    // short escape timeout explicitly flushes it as a standalone key.
    if (buffer.length === 1) return null;
    return boundedSequence(buffer.slice(0, 2), 2, limits);
  }

  if (firstCode === undefined) return null;
  const firstChar = String.fromCodePoint(firstCode);
  if (firstCode < 32 || firstCode === 127) return { sequence: firstChar, length: firstChar.length };

  let index = 0;
  while (index < buffer.length) {
    const code = buffer.codePointAt(index);
    if (code === undefined || code < 32 || code === 127 || code === 0x1b || (code >= 0x80 && code <= 0x9f)) break;
    index += String.fromCodePoint(code).length;
  }
  return { sequence: buffer.slice(0, index), length: index };
}


function extractSs3(buffer, limits) {
  let finalIndex = -1;
  for (let index = 2; index < buffer.length; index += 1) {
    const code = buffer.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) {
      finalIndex = index;
      break;
    }
  }
  if (finalIndex < 0) {
    if (utf8ByteLength(buffer) > limits.escapeSequenceBytes) {
      return { sequence: '', length: buffer.length, discard: true, terminalReply: true };
    }
    return null;
  }

  const length = finalIndex + 1;
  const sequence = buffer.slice(0, length);
  if (utf8ByteLength(sequence) > limits.escapeSequenceBytes) {
    return { sequence, length, discard: true, terminalReply: true };
  }

  const modified = /^\x1bO(?:1;)?(\d+)[A-DHF]$/u.exec(sequence);
  if (modified && !isSupportedModifier(Number(modified[1]))) {
    return { sequence, length, discard: true, terminalReply: true };
  }
  return { sequence, length };
}

function extractCsi(buffer, limits, { pointer = false } = {}) {
  let finalIndex = -1;
  for (let index = 2; index < buffer.length; index += 1) {
    const code = buffer.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) {
      finalIndex = index;
      break;
    }
  }
  if (finalIndex < 0) {
    if (utf8ByteLength(buffer) > limits.escapeSequenceBytes) {
      return { sequence: '', length: buffer.length, discard: true, terminalReply: true };
    }
    return null;
  }

  const length = finalIndex + 1;
  const sequence = buffer.slice(0, length);
  if (utf8ByteLength(sequence) > limits.escapeSequenceBytes) {
    return { sequence, length, discard: true, terminalReply: true };
  }

  if (pointer) {
    const match = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/u.exec(sequence);
    if (!match) return { sequence, length, discard: true, terminalReply: true };
    const coordinates = [match[2], match[3]].map(Number);
    if (coordinates.some((value) => !Number.isSafeInteger(value) || value < 1)) {
      return { sequence, length, discard: true, terminalReply: true };
    }
  }

  if (/^\x1b\[\?[0-9;:<>]*[cnR]$/u.test(sequence)) {
    return { sequence, length, discard: true, terminalReply: true };
  }

  const csiU = /^\x1b\[(\d+);(\d+)u$/u.exec(sequence);
  if (csiU) {
    const codePoint = Number(csiU[1]);
    const modifier = Number(csiU[2]);
    if (!isValidCodePoint(codePoint) || !isSupportedModifier(modifier)) {
      return { sequence, length, discard: true, terminalReply: true };
    }
  }

  const modifiedArrow = /^\x1b\[1;(\d+)[A-DHF]$/u.exec(sequence);
  if (modifiedArrow && !isSupportedModifier(Number(modifiedArrow[1]))) {
    return { sequence, length, discard: true, terminalReply: true };
  }

  const modifiedEnter = /^\x1b\[27;(\d+);13~$/u.exec(sequence);
  if (modifiedEnter && !isSupportedModifier(Number(modifiedEnter[1]))) {
    return { sequence, length, discard: true, terminalReply: true };
  }

  return { sequence, length };
}

function extractStringControl(buffer, limits, belTerminated) {
  const bel = belTerminated ? buffer.indexOf(belTerminated, 2) : -1;
  const st = buffer.indexOf(ST, 2);
  const end = bel >= 0 && (st < 0 || bel < st) ? bel + 1 : st >= 0 ? st + ST.length : -1;
  if (end < 0) {
    if (utf8ByteLength(buffer) > limits.escapeSequenceBytes) return { sequence: '', length: buffer.length, discard: true, terminalReply: true };
    return null;
  }
  return { sequence: buffer.slice(0, end), length: end, discard: true, terminalReply: true };
}

function extractC1StringControl(buffer, limits, allowBel) {
  const bel = allowBel ? buffer.indexOf('\x07', 1) : -1;
  const st = buffer.indexOf('\x9c', 1);
  const end = bel >= 0 && (st < 0 || bel < st) ? bel + 1 : st >= 0 ? st + 1 : -1;
  if (end < 0) {
    if (utf8ByteLength(buffer) > limits.escapeSequenceBytes) return { sequence: '', length: buffer.length, discard: true, terminalReply: true };
    return null;
  }
  return { sequence: buffer.slice(0, end), length: end, discard: true, terminalReply: true };
}

function boundedSequence(sequence, length, limits) {
  return utf8ByteLength(sequence) > limits.escapeSequenceBytes
    ? { sequence, length, discard: true, terminalReply: true }
    : { sequence, length };
}

function isValidCodePoint(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff);
}

function isSupportedModifier(value) {
  return Number.isInteger(value) && value >= 1 && value <= 9;
}

function pasteBufferByteLimit(limits) {
  if (limits.pasteBytes === Infinity) return Infinity;
  return limits.pasteBytes + utf8ByteLength(PASTE_START) + utf8ByteLength(PASTE_END);
}

function pasteEvent(text, metadata = {}) {
  return {
    name: 'paste',
    sequence: '',
    text: String(text ?? ''),
    printable: false,
    ctrl: false,
    meta: false,
    shift: false,
    cmd: false,
    atomic: true,
    ...metadata,
  };
}

function rejectedEvent(reason, resource, limit, actual = limit + 1) {
  return {
    type: 'input-rejected',
    name: 'rejected',
    sequence: '',
    text: '',
    printable: false,
    ctrl: false,
    meta: false,
    shift: false,
    cmd: false,
    reason,
    resource,
    limit,
    actual,
  };
}
