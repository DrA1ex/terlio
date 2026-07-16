import { parseKey } from './keyParser.js';
import { parsePointer } from './pointer.js';

export class TerminalInputDecoder {
  constructor() {
    this.buffer = '';
  }

  write(data) {
    this.buffer += Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '');
    const events = [];

    while (this.buffer) {
      const extracted = extractSequence(this.buffer);
      if (!extracted) break;
      this.buffer = this.buffer.slice(extracted.length);
      const pointer = parsePointer(extracted.sequence);
      events.push(pointer ?? parseKey(extracted.sequence));
    }

    return events;
  }

  reset() {
    this.buffer = '';
  }
}

export function parseInputEvents(data) {
  const decoder = new TerminalInputDecoder();
  const events = decoder.write(data);
  if (decoder.buffer) {
    events.push(parseKey(decoder.buffer));
    decoder.reset();
  }
  return events;
}

export function parseInputEvent(data) {
  return parseInputEvents(data)[0] ?? parseKey('');
}

function extractSequence(buffer) {
  if (!buffer) return null;

  if (buffer.startsWith('\x1b[200~')) {
    const end = buffer.indexOf('\x1b[201~', 6);
    if (end < 0) return null;
    const length = end + 6;
    return { sequence: buffer.slice(0, length), length };
  }

  if (buffer.startsWith('\x1b[<')) {
    const match = /^\x1b\[<\d+;\d+;\d+[Mm]/.exec(buffer);
    if (!match) return null;
    return { sequence: match[0], length: match[0].length };
  }

  if (buffer.startsWith('\x1b[')) {
    const match = /^\x1b\[[0-?]*[ -/]*[@-~]/.exec(buffer);
    if (!match) return null;
    return { sequence: match[0], length: match[0].length };
  }

  if (buffer.startsWith('\x1bO')) {
    if (buffer.length < 3) return null;
    return { sequence: buffer.slice(0, 3), length: 3 };
  }

  if (buffer[0] === '\x1b') {
    if (buffer.length === 1) return { sequence: buffer, length: 1 };
    return { sequence: buffer.slice(0, 2), length: 2 };
  }

  const first = buffer.codePointAt(0);
  if (first === undefined) return null;
  const firstChar = String.fromCodePoint(first);
  if (first < 32 || first === 127) return { sequence: firstChar, length: firstChar.length };

  let index = 0;
  while (index < buffer.length) {
    const code = buffer.codePointAt(index);
    if (code === undefined || code < 32 || code === 127) break;
    const char = String.fromCodePoint(code);
    index += char.length;
  }
  return { sequence: buffer.slice(0, index), length: index };
}
