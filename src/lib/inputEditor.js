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

  insertPaste(text) {
    const chars = Array.from(this.value);
    const normalized = String(text ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '  ');
    const inserted = Array.from(normalized).filter((char) => char === '\n' || isPrintable(char)).join('');
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

  moveVertical(delta) {
    const position = this.getCursorPosition();
    const lines = splitLinesWithOffsets(this.value);
    const targetLine = clamp(position.line + delta, 0, Math.max(0, lines.length - 1));
    const targetColumn = Math.min(position.column, lines[targetLine].length);
    this.cursor = lines[targetLine].offset + targetColumn;
  }

  lineStart() {
    const position = this.getCursorPosition();
    const lines = splitLinesWithOffsets(this.value);
    this.cursor = lines[position.line]?.offset ?? 0;
  }

  lineEnd() {
    const position = this.getCursorPosition();
    const lines = splitLinesWithOffsets(this.value);
    const line = lines[position.line] ?? lines[0];
    this.cursor = line.offset + line.length;
  }

  getCursorPosition() {
    const lines = splitLinesWithOffsets(this.value);
    const safeCursor = clamp(this.cursor, 0, charLength(this.value));
    let selected = lines[0];
    let selectedIndex = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const end = line.offset + line.length;
      if (safeCursor <= end || index === lines.length - 1) {
        selected = line;
        selectedIndex = index;
        break;
      }
    }
    return { line: selectedIndex, column: Math.max(0, safeCursor - selected.offset) };
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

function splitLinesWithOffsets(value) {
  const chars = Array.from(String(value ?? ''));
  const lines = [];
  let offset = 0;
  let current = [];

  chars.forEach((char, index) => {
    if (char === '\n') {
      lines.push({ text: current.join(''), length: current.length, offset });
      current = [];
      offset = index + 1;
      return;
    }
    current.push(char);
  });

  lines.push({ text: current.join(''), length: current.length, offset });
  return lines;
}

function charLength(value) {
  return Array.from(String(value ?? '')).length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function handleInputEditorKey(editor, key, { multiline = false } = {}) {
  if (!editor || !key) return { handled: false, changed: false };
  const before = editor.value;
  const beforeCursor = editor.cursor;
  let handled = true;
  switch (key.name) {
    case 'left':
      key.meta || key.word ? editor.moveWord(-1) : editor.move(-1);
      break;
    case 'right':
      key.meta || key.word ? editor.moveWord(1) : editor.move(1);
      break;
    case 'up':
      editor.moveVertical(-1);
      break;
    case 'down':
      editor.moveVertical(1);
      break;
    case 'home':
      key.ctrl ? editor.home() : editor.lineStart();
      break;
    case 'end':
      key.ctrl ? editor.end() : editor.lineEnd();
      break;
    case 'backspace':
      editor.backspace();
      break;
    case 'delete':
      editor.deleteForward();
      break;
    case 'kill-start':
      editor.killToStart();
      break;
    case 'kill-end':
      editor.killToEnd();
      break;
    case 'delete-word-left':
      editor.deleteWordBack();
      break;
    case 'paste':
      editor.insertPaste(key.text ?? '');
      break;
    case 'enter':
      if (multiline || key.ctrl) editor.insertLineBreak();
      else handled = false;
      break;
    default:
      if (key.printable) editor.insert(key.text ?? '');
      else handled = false;
      break;
  }
  return { handled, changed: before !== editor.value || beforeCursor !== editor.cursor, value: editor.value, cursor: editor.cursor };
}
