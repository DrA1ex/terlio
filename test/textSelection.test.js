import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  OverlayHost,
  PointerRegion,
  RichTerminalApp,
  ScrollPane,
  SelectList,
  SelectableText,
  TerminalRenderer,
  Text,
  ansi,
  beginTextSelection,
  completeTextSelection,
  copyTextToClipboard,
  createTerminalPolicy,
  createMessage,
  createOverlayManager,
  createTextSelectionState,
  dispatchPointerEvent,
  osc52ClipboardSequence,
  parsePointer,
  patchFrames,
  renderTextSelectionLines,
  renderToFrame,
  selectedText,
  selectionContainsPoint,
  stripAnsi,
  updateTextSelection,
  writeClipboardText,
} from '../src/lib/index.js';

class FakeInput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
  }
  setEncoding() {}
  setRawMode() {}
  resume() {}
  pause() {}
}

class FakeOutput extends EventEmitter {
  constructor(columns = 80, rows = 24) {
    super();
    this.isTTY = true;
    this.columns = columns;
    this.rows = rows;
    this.buffer = '';
  }
  write(chunk) {
    this.buffer += String(chunk ?? '');
    return true;
  }
}

function pointer(action, x, y, overrides = {}) {
  return {
    type: 'pointer',
    name: action === 'wheel' ? 'wheel-down' : action,
    action,
    button: action === 'wheel' ? 'none' : 'left',
    x,
    y,
    deltaX: 0,
    deltaY: action === 'wheel' ? 1 : 0,
    pressed: action !== 'release' && action !== 'wheel',
    ...overrides,
  };
}

test('text selection extracts ANSI-styled multiline text and renders an inverse highlight', () => {
  const lines = [`\x1b[31malpha${ansi.reset}`, 'βeta'];
  const state = createTextSelectionState();

  beginTextSelection(state, { x: 1, y: 0 }, lines);
  assert.equal(updateTextSelection(state, { x: 2, y: 1 }, lines), 'lpha\nβet');
  assert.equal(selectedText(lines, state), 'lpha\nβet');
  assert.equal(selectionContainsPoint(state, { x: 2, y: 0 }, lines), true);
  assert.equal(selectionContainsPoint(state, { x: 5, y: 0 }, lines), false, 'padding beyond the line is not selected');

  const rendered = renderTextSelectionLines(lines, state);
  assert.match(rendered[0], new RegExp(escapeRegExp(ansi.inverse)));
  assert.match(rendered[1], new RegExp(escapeRegExp('\x1b[27m')));

  assert.equal(completeTextSelection(state, { x: 2, y: 1 }, lines), 'lpha\nβet');
  assert.equal(state.selecting, false);
  assert.equal(state.dragged, true);

  const reverse = createTextSelectionState();
  beginTextSelection(reverse, { x: 2, y: 1 }, lines);
  updateTextSelection(reverse, { x: 1, y: 0 }, lines);
  assert.equal(selectedText(lines, reverse), 'lpha\nβet');
});


test('selection highlighting follows non-contiguous transcript row maps', () => {
  const source = ['header', 'hidden body', 'tail'];
  const state = createTextSelectionState();
  beginTextSelection(state, { x: 0, y: 0 }, source);
  updateTextSelection(state, { x: 2, y: 0 }, source);

  const rendered = renderTextSelectionLines(['header', 'tail'], state, {
    sourceLines: source,
    rowMap: [0, 2],
  });

  assert.equal(rendered[0].includes(ansi.inverse), true);
  assert.equal(rendered[1].includes(ansi.inverse), false);
});

test('a plain click does not create or copy a one-character selection', () => {
  const state = createTextSelectionState();
  beginTextSelection(state, { x: 2, y: 0 }, ['hello']);
  assert.equal(completeTextSelection(state, { x: 2, y: 0 }, ['hello']), '');
  assert.equal(state.anchor, null);
  assert.equal(state.focus, null);
  assert.equal(state.dragged, false);
});

test('OSC 52 clipboard helpers encode and write selected text independently of native clipboard availability', () => {
  const output = new FakeOutput();
  const expected = `\x1b]52;c;${Buffer.from('copy me').toString('base64')}\x07`;
  assert.equal(osc52ClipboardSequence('copy me'), expected);
  assert.equal(writeClipboardText('copy me', output), true);
  assert.equal(output.buffer, expected);

  const primary = new FakeOutput();
  assert.equal(writeClipboardText('primary', primary, { target: 'p' }), true);
  assert.equal(primary.buffer, `\x1b]52;p;${Buffer.from('primary').toString('base64')}\x07`);

  assert.equal(writeClipboardText('', output), false);
  assert.equal(writeClipboardText('copy me', null), false);
});



test('clipboard copy prefers the native platform backend and falls back to OSC 52', () => {
  const output = new FakeOutput();
  const calls = [];
  const native = copyTextToClipboard('native copy', {
    platform: 'darwin',
    output,
    spawnSync(command, args, options) {
      calls.push({ command, args, input: options.input });
      return { status: 0 };
    },
  });
  assert.deepEqual(native, { copied: true, backend: 'pbcopy' });
  assert.deepEqual(calls, [{ command: 'pbcopy', args: [], input: 'native copy' }]);
  assert.equal(output.buffer, '');

  const fallback = copyTextToClipboard('remote copy', {
    platform: 'linux',
    env: {},
    output,
    clipboardPolicy: 'auto',
    spawnSync() { return { status: 1 }; },
  });
  assert.deepEqual(fallback, { copied: true, backend: 'osc52' });
  assert.match(output.buffer, new RegExp(escapeRegExp(osc52ClipboardSequence('remote copy'))));
});

test('SelectableText captures drag events outside its bounds without copying on release', () => {
  const output = new FakeOutput(20, 3);
  const renderer = new TerminalRenderer({ output });
  const selection = createTextSelectionState();
  let copied = '';
  renderer.renderNode(SelectableText({
    lines: ['hello world'],
    selection,
    pointerId: 'copyable',
    onCopy: (text) => { copied = text; },
  }), { width: 20, height: 3 });

  const region = renderer.pointerRegions.find((item) => item.id === 'copyable');
  assert.ok(region);
  renderer.dispatchPointer(pointer('click', region.bounds.x, region.bounds.y));
  assert.equal(renderer.pointerCaptureToken, region.token);

  renderer.dispatchPointer(pointer('drag', region.bounds.x + region.bounds.width + 10, region.bounds.y));
  renderer.dispatchPointer(pointer('release', region.bounds.x + region.bounds.width + 10, region.bounds.y));

  assert.equal(copied, '');
  assert.equal(selection.text, 'hello world');
  assert.equal(renderer.pointerCaptureToken, null);
});


test('scrollable selections keep content coordinates, span viewports, copy on highlight click, and clear outside', () => {
  const output = new FakeOutput(28, 6);
  const renderer = new TerminalRenderer({ output });
  const selection = createTextSelectionState();
  const lines = Array.from({ length: 14 }, (_, index) => `line ${String(index).padStart(2, '0')} alpha`);
  const copied = [];
  let scroll = 0;

  const render = () => renderer.renderNode(ScrollPane({
    lines,
    width: 28,
    height: 4,
    scroll,
    border: false,
    footer: false,
    pointerId: 'scrolling-text',
    selection,
    onWheel(event) {
      scroll = Math.max(0, Math.min(lines.length - 4, scroll + event.deltaY));
      event.preventDefault();
    },
    onCopy(text) { copied.push(text); return true; },
  }), { width: 28, height: 6 });

  render();
  let region = renderer.pointerRegions.find((item) => item.id === 'scrolling-text:selection');
  assert.ok(region);
  const x = region.bounds.x;
  const top = region.bounds.y;

  renderer.dispatchPointer(pointer('click', x, top));
  renderer.dispatchPointer(pointer('drag', x + 6, top + 3));
  renderer.dispatchPointer(pointer('wheel', x + 6, top + 3, { deltaY: 3, name: 'wheel-down' }));
  render();

  region = renderer.pointerRegions.find((item) => item.id === 'scrolling-text:selection');
  renderer.dispatchPointer(pointer('drag', region.bounds.x + 6, region.bounds.y + 3));
  renderer.dispatchPointer(pointer('release', region.bounds.x + 6, region.bounds.y + 3));

  assert.equal(selection.selecting, false);
  assert.match(selection.text, /^line 00 alpha\n/);
  assert.match(selection.text, /line 06/);
  assert.ok(selection.text.split('\n').length > 4, 'selection spans more rows than one viewport');

  render();
  const highlighted = renderer.previousFrame.toLines().find((line) => stripAnsi(line).includes('line 04'));
  assert.match(highlighted, new RegExp(escapeRegExp(ansi.inverse)));

  region = renderer.pointerRegions.find((item) => item.id === 'scrolling-text:selection');
  const selectedBeforeCopy = selection.text;
  renderer.dispatchPointer(pointer('click', region.bounds.x + 1, region.bounds.y + 1));
  assert.deepEqual(copied, []);
  renderer.dispatchPointer(pointer('release', region.bounds.x + 1, region.bounds.y + 1));
  assert.deepEqual(copied, [selectedBeforeCopy]);
  assert.equal(selection.text, '', 'a successful copy clears the highlight');

  render();
  region = renderer.pointerRegions.find((item) => item.id === 'scrolling-text:selection');
  renderer.dispatchPointer(pointer('click', region.bounds.x, region.bounds.y));
  renderer.dispatchPointer(pointer('drag', region.bounds.x + 4, region.bounds.y));
  renderer.dispatchPointer(pointer('release', region.bounds.x + 4, region.bounds.y));
  assert.notEqual(selection.text, '');

  scroll = 9;
  render();
  region = renderer.pointerRegions.find((item) => item.id === 'scrolling-text:selection');
  renderer.dispatchPointer(pointer('click', region.bounds.x + 1, region.bounds.y));
  renderer.dispatchPointer(pointer('release', region.bounds.x + 1, region.bounds.y));
  assert.equal(selection.text, '');
  assert.deepEqual(copied.length, 1);
});


test('selection click keeps the highlight when clipboard copy fails', () => {
  const output = new FakeOutput(24, 4);
  const renderer = new TerminalRenderer({ output });
  const selection = createTextSelectionState();
  let copySucceeds = false;
  let copyAttempts = 0;
  let changes = [];

  const render = () => renderer.renderNode(SelectableText({
    lines: ['copy failure keeps this'],
    selection,
    pointerId: 'copy-result',
    onCopy() {
      copyAttempts += 1;
      return copySucceeds;
    },
    onSelectionChange(text) {
      changes.push(text);
    },
  }), { width: 24, height: 4 });

  render();
  let region = renderer.pointerRegions.find((item) => item.id === 'copy-result');
  renderer.dispatchPointer(pointer('click', region.bounds.x, region.bounds.y));
  renderer.dispatchPointer(pointer('drag', region.bounds.x + 3, region.bounds.y));
  renderer.dispatchPointer(pointer('release', region.bounds.x + 3, region.bounds.y));
  assert.equal(selection.text, 'copy');

  renderer.dispatchPointer(pointer('click', region.bounds.x + 1, region.bounds.y));
  renderer.dispatchPointer(pointer('release', region.bounds.x + 1, region.bounds.y));
  assert.equal(copyAttempts, 1);
  assert.equal(selection.text, 'copy', 'failed clipboard transfer must keep the selection');

  copySucceeds = true;
  render();
  region = renderer.pointerRegions.find((item) => item.id === 'copy-result');
  renderer.dispatchPointer(pointer('click', region.bounds.x + 1, region.bounds.y));
  renderer.dispatchPointer(pointer('release', region.bounds.x + 1, region.bounds.y));
  assert.equal(copyAttempts, 2);
  assert.equal(selection.text, '');
  assert.equal(changes.at(-1), '');
});

test('chat keeps pointer scrolling active while drag-selecting transcript text', () => {
  const output = new FakeOutput();
  const app = new RichTerminalApp({
    input: new FakeInput(),
    output,
    terminalPolicy: createTerminalPolicy({ clipboard: 'auto' }),
  });
  app.running = true;
  app.messages = [createMessage({ role: 'assistant', content: 'selectable words here' })];
  app.render();

  assert.equal(app.pointerActive, true);
  const lines = app.renderer.previousFrame.toLines().map(stripAnsi);
  const row = lines.findIndex((line) => line.includes('selectable words here'));
  const column = lines[row].indexOf('selectable');
  assert.ok(row >= 0 && column >= 0);

  output.buffer = '';
  app.handlePointer(pointer('click', column, row));
  app.handlePointer(pointer('drag', column + 5, row));
  app.handlePointer(pointer('release', column + 5, row));

  assert.equal(app.transcriptSelection.text, 'select');
  assert.doesNotMatch(output.buffer, /\x1b\]52;/);
  assert.equal(app.pointerActive, true);

  let copied = '';
  const originalCopy = app.copyTranscriptSelection.bind(app);
  app.copyTranscriptSelection = (text = app.transcriptSelection.text) => {
    copied = String(text ?? '');
    return true;
  };
  app.handlePointer(pointer('click', column + 2, row));
  assert.equal(copied, '', 'copy waits for a complete click');
  app.handlePointer(pointer('release', column + 2, row));
  assert.equal(copied, 'select');
  assert.equal(app.transcriptSelection.text, '', 'successful click-copy clears the transcript highlight');

  app.copyTranscriptSelection = originalCopy;
  app.handlePointer(pointer('click', column, row));
  app.handlePointer(pointer('drag', column + 5, row));
  app.handlePointer(pointer('release', column + 5, row));
  assert.equal(app.transcriptSelection.text, 'select');

  app.openCommandPalette();
  const copyItemIndex = app.palette.items.findIndex((item) => item.id === 'selection.copy');
  assert.ok(copyItemIndex >= 0);
  assert.equal(app.palette.items[copyItemIndex].disabled, false);
  app.palette.selectedIndex = copyItemIndex;
  app.palette.list.selectedIndex = copyItemIndex;
  app.handleCommandPaletteKey({ name: 'enter' });
  assert.equal(app.transcriptSelection.text, '', 'explicit palette copy also clears the selection');

  const transcript = app.renderer.pointerRegions.find((region) => region.id === 'chat-transcript');
  const before = app.scrollOffset;
  app.handlePointer(pointer('wheel', transcript.bounds.x + 1, transcript.bounds.y + 1, { deltaY: -1, name: 'wheel-up' }));
  assert.ok(app.scrollOffset >= before);
  assert.equal(app.transcriptSelection.text, '');
});

test('clicking a command suggestion accepts it and closes the popup immediately', () => {
  const app = new RichTerminalApp({ input: new FakeInput(), output: new FakeOutput() });
  app.running = true;
  app.editor.set('/th');
  app.render();

  const suggestion = app.renderer.pointerRegions.find((region) => region.id === 'chat-suggestion:0');
  assert.ok(suggestion);
  app.handlePointer(pointer('click', suggestion.bounds.x + 1, suggestion.bounds.y));

  assert.match(app.editor.value, /^\/theme/);
  assert.equal(app.suggestionsDismissed, true);
  assert.equal(app.isSuggestionMode(), false);
  assert.equal(app.renderer.pointerRegions.some((region) => region.id.startsWith('chat-suggestion:')), false);
});



test('runtime toast and popup surfaces dismiss on press or release and patch their former dirty area', () => {
  const output = new FakeOutput(80, 24);
  const app = new RichTerminalApp({ input: new FakeInput(), output });
  app.running = true;
  app.notify('Dismiss me', 'info');

  const toast = app.renderer.pointerRegions.find((region) => region.id.startsWith('toast:'));
  assert.ok(toast);
  output.buffer = '';
  app.handlePointer(pointer('release', toast.bounds.x + 1, toast.bounds.y + 1));
  assert.equal(app.overlays.toasts.length, 0);
  assert.equal(app.renderer.pointerRegions.some((region) => region.id.startsWith('toast:')), false);
  assert.doesNotMatch(output.buffer, new RegExp(escapeRegExp(ansi.clear)));
  assert.match(output.buffer, new RegExp(escapeRegExp(ansi.moveTo(toast.bounds.y + 1, 1))));

  app.editor.set('/th');
  app.suggestionsDismissed = false;
  app.render();
  const popup = app.renderer.pointerRegions.find((region) => region.id === 'chat-suggestions');
  assert.ok(popup);
  output.buffer = '';
  app.handlePointer(pointer('click', popup.bounds.x + 1, popup.bounds.y));
  assert.equal(app.suggestionsDismissed, true);
  assert.equal(app.renderer.pointerRegions.some((region) => region.id === 'chat-suggestions'), false);
  assert.doesNotMatch(output.buffer, new RegExp(escapeRegExp(ansi.clear)));
  assert.match(output.buffer, new RegExp(escapeRegExp(ansi.moveTo(popup.bounds.y + 1, 1))));
});

test('SelectList uses one row when content fits and caps wrapped rows with an ellipsis', () => {
  const frame = renderToFrame(SelectList({
    title: 'Items',
    items: ['Short', 'This is a very long item that must wrap across several rows and eventually be cut off'],
    selectedIndex: 0,
    windowSize: 2,
  }), { width: 24, height: 10 });
  const lines = frame.toLines().map(stripAnsi);

  const shortRow = lines.findIndex((line) => line.includes('› Short'));
  assert.ok(shortRow >= 0);
  assert.match(lines[shortRow + 1], /This is a very/);
  assert.match(lines[shortRow + 3], /…/);
  assert.doesNotMatch(lines[shortRow + 4], /eventually|cut off/);
});

test('SelectList windowStart scrolls independently from the selected item', () => {
  const frame = renderToFrame(SelectList({
    items: ['zero', 'one', 'two', 'three', 'four'],
    selectedIndex: 0,
    windowSize: 2,
    windowStart: 2,
  }), { width: 20, height: 8 });
  const text = frame.toLines().map(stripAnsi).join('\n');
  assert.match(text, /two/);
  assert.match(text, /three/);
  assert.doesNotMatch(text, /zero/);
  assert.doesNotMatch(text, /one/);
});

test('toast overlays dismiss immediately when clicked', () => {
  const manager = createOverlayManager();
  manager.toast('Saved', 'success');
  const frame = renderToFrame(OverlayHost({
    content: PointerRegion({ pointerId: 'background', onClick() {} }, Text('background')),
    manager,
    width: 60,
    height: 12,
    toastBottomMargin: 0,
  }), { width: 60, height: 12 });
  const toast = frame.pointerRegions.find((region) => region.id.startsWith('toast:'));
  assert.ok(toast);

  const result = dispatchPointerEvent(pointer('click', toast.bounds.x + 1, toast.bounds.y), frame.pointerRegions);
  assert.equal(result.handled, true);
  assert.equal(manager.toasts.length, 0);
});

test('frame patches reset styles and erase every changed row when a block disappears', () => {
  const before = renderToFrame(Text(`${ansi.inverse}Command suggestions${ansi.reset}\n${ansi.cyan}COMPOSER${ansi.reset}`), { width: 32, height: 4 });
  const after = renderToFrame(Text('COMPOSER'), { width: 32, height: 4 });
  const patch = patchFrames(before, after);
  const changedRows = patch.match(/\x1b\[2K/g) ?? [];

  assert.ok(changedRows.length >= 2);
  assert.match(patch, /^\x1b\[0m/);
  assert.equal((patch.match(/\x1b\[0m/g) ?? []).length >= changedRows.length * 2, true);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
