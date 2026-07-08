export class InputEditor {
  constructor(value = '') {
    this.value = String(value ?? '');
    this.cursor = charLength(this.value);
  }

  set(value) {
    this.value = String(value ?? '');
    this.cursor = charLength(this.value);
  }

  clear() {
    this.value = '';
    this.cursor = 0;
  }

  insert(text) {
    const chars = Array.from(this.value);
    const inserted = Array.from(String(text ?? '')).filter((char) => isPrintable(char)).join('');
    chars.splice(this.cursor, 0, ...Array.from(inserted));
    this.value = chars.join('');
    this.cursor += charLength(inserted);
  }

  insertLineBreak() {
    const chars = Array.from(this.value);
    chars.splice(this.cursor, 0, '\n');
    this.value = chars.join('');
    this.cursor += 1;
  }

  backspace() {
    const chars = Array.from(this.value);
    if (this.cursor <= 0) return false;
    chars.splice(this.cursor - 1, 1);
    this.cursor -= 1;
    this.value = chars.join('');
    return true;
  }

  deleteForward() {
    const chars = Array.from(this.value);
    if (this.cursor >= chars.length) return false;
    chars.splice(this.cursor, 1);
    this.value = chars.join('');
    return true;
  }

  move(delta) {
    this.cursor = clamp(this.cursor + delta, 0, charLength(this.value));
  }

  home() {
    this.cursor = 0;
  }

  end() {
    this.cursor = charLength(this.value);
  }

  killToStart() {
    const chars = Array.from(this.value);
    if (this.cursor <= 0) return false;
    this.value = chars.slice(this.cursor).join('');
    this.cursor = 0;
    return true;
  }

  killToEnd() {
    const chars = Array.from(this.value);
    if (this.cursor >= chars.length) return false;
    this.value = chars.slice(0, this.cursor).join('');
    return true;
  }

  deleteWordBack() {
    const chars = Array.from(this.value);
    if (this.cursor <= 0) return false;

    let start = this.cursor;
    while (start > 0 && /\s/.test(chars[start - 1])) start -= 1;
    while (start > 0 && !/\s/.test(chars[start - 1])) start -= 1;

    chars.splice(start, this.cursor - start);
    this.value = chars.join('');
    this.cursor = start;
    return true;
  }

  moveWord(delta) {
    const chars = Array.from(this.value);
    if (delta < 0) {
      let next = this.cursor;
      while (next > 0 && /\s/.test(chars[next - 1])) next -= 1;
      while (next > 0 && !/\s/.test(chars[next - 1])) next -= 1;
      this.cursor = next;
      return;
    }

    let next = this.cursor;
    while (next < chars.length && !/\s/.test(chars[next])) next += 1;
    while (next < chars.length && /\s/.test(chars[next])) next += 1;
    this.cursor = next;
  }

  getParts() {
    const chars = Array.from(this.value);
    return {
      before: chars.slice(0, this.cursor).join(''),
      current: chars[this.cursor] ?? ' ',
      after: chars.slice(this.cursor + 1).join(''),
    };
  }
}

export function isPrintable(value) {
  if (!value) return false;
  if (value.startsWith('\x1b')) return false;
  for (const char of Array.from(value)) {
    const code = char.codePointAt(0);
    if (code === undefined) return false;
    if (code < 32) return false;
    if (code === 127) return false;
  }
  return true;
}

function charLength(value) {
  return Array.from(String(value ?? '')).length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
