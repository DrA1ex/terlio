import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  Box,
  PointerRegion,
  RichTerminalApp,
  SelectList,
  SelectableText,
  TerminalRenderer,
  Text,
  ansi,
  createTextSelectionState,
  renderCursorCell,
  renderToFrame,
  stripAnsi,
} from '../src/lib/index.js';
import { InteractiveRuntime } from '../examples/_demoRuntime.js';

class FakeInput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this.rawMode = true;
  }
  setEncoding() {}
  setRawMode(value) { this.rawMode = Boolean(value); }
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
    action,
    name: action,
    button: 'left',
    x,
    y,
    pressed: action !== 'release',
    deltaX: 0,
    deltaY: 0,
    shift: false,
    meta: false,
    ctrl: false,
    ...overrides,
  };
}

test('SelectableText can explicitly reserve Shift-modified drag for native terminal selection', () => {
  const output = new FakeOutput(30, 4);
  const renderer = new TerminalRenderer({ output });
  const selection = createTextSelectionState();
  let parentClicks = 0;
  renderer.renderNode(PointerRegion({
    pointerId: 'parent',
    onClick: () => { parentClicks += 1; },
  }, SelectableText({
    lines: ['native terminal copy path'],
    selection,
    pointerId: 'selectable',
    nativeSelectionModifier: 'shift',
  })), { width: 30, height: 4 });

  const region = renderer.pointerRegions.find((item) => item.id === 'selectable');
  assert.ok(region);

  const press = renderer.dispatchPointer(pointer('click', region.bounds.x, region.bounds.y, { shift: true }));
  const drag = renderer.dispatchPointer(pointer('drag', region.bounds.x + 6, region.bounds.y, { shift: true }));
  const release = renderer.dispatchPointer(pointer('release', region.bounds.x + 6, region.bounds.y, { shift: true }));

  assert.equal(press.handled, false);
  assert.equal(drag.handled, false);
  assert.equal(release.handled, false);
  assert.equal(renderer.pointerCaptureToken, null);
  assert.equal(selection.text, '');
  assert.equal(selection.anchor, null);
  assert.equal(parentClicks, 0);
});

test('SelectableText keeps Shift-modified drag as application selection by default', () => {
  const output = new FakeOutput(30, 4);
  const renderer = new TerminalRenderer({ output });
  const selection = createTextSelectionState();
  renderer.renderNode(SelectableText({
    lines: ['shift may be application input'],
    selection,
    pointerId: 'selectable',
  }), { width: 30, height: 4 });

  const region = renderer.pointerRegions.find((item) => item.id === 'selectable');
  renderer.dispatchPointer(pointer('click', region.bounds.x, region.bounds.y, { shift: true }));
  renderer.dispatchPointer(pointer('drag', region.bounds.x + 4, region.bounds.y, { shift: true }));
  renderer.dispatchPointer(pointer('release', region.bounds.x + 4, region.bounds.y, { shift: true }));

  assert.equal(selection.text, 'shift');
});

test('RichTerminalApp keeps Ctrl+C as interrupt even when an in-app selection exists', () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const exits = [];
  const app = new RichTerminalApp({ input, output, onExit: (code) => exits.push(code) });
  app.running = true;
  app.transcriptSelection.text = 'selected text';
  let copyCalls = 0;
  app.copyTranscriptSelection = () => {
    copyCalls += 1;
    return true;
  };

  // Some enhanced keyboard protocols can forward Command+C. It must not be
  // treated as an application clipboard shortcut either.
  app.onData('\x1b[99;9u');
  assert.deepEqual(exits, []);
  assert.equal(copyCalls, 0);
  assert.equal(app.running, true);

  app.onData('\x03');
  assert.deepEqual(exits, [130]);
  assert.equal(copyCalls, 0);
  assert.equal(app.running, false);
});

test('packaged example runtime never shadows Ctrl+C with a copy callback', () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const seenKeys = [];
  const exits = [];
  const runtime = new InteractiveRuntime({
    title: 'Shortcut regression',
    state: {},
    render: () => Text('demo'),
    onKey: ({ key }) => seenKeys.push(key),
  });
  runtime.input = input;
  runtime.output = output;
  runtime.renderer.output = output;
  runtime.running = true;
  runtime.exit = (code) => exits.push(code);

  runtime.handleData('\x1b[99;9u');
  assert.equal(seenKeys.at(-1)?.name, 'c');
  assert.equal(seenKeys.at(-1)?.cmd, true);
  assert.deepEqual(exits, []);

  runtime.handleData('\x03');
  assert.deepEqual(exits, [130]);
});

test('dirty patches clear the former height of a disappearing styled surface without a full repaint', () => {
  const output = new FakeOutput(36, 10);
  const renderer = new TerminalRenderer({ output });
  const tall = PointerRegion({
    pointerId: 'temporary-surface',
    pointerWidth: 'fill',
  }, Box({ border: true, height: 6 },
    Text(`${ansi.inverse}temporary background${ansi.reset}`),
    Text(`${ansi.inverse}row two${ansi.reset}`),
    Text(`${ansi.inverse}row three${ansi.reset}`)));

  renderer.renderNode(tall, { width: 36, height: 10 });
  const old = renderer.pointerRegions.find((item) => item.id === 'temporary-surface');
  assert.ok(old);

  output.buffer = '';
  renderer.renderNode(Text('base content'), { width: 36, height: 10 });

  assert.doesNotMatch(output.buffer, new RegExp(escapeRegExp(ansi.clear)));
  for (let row = old.bounds.y; row < old.bounds.y + old.bounds.height; row += 1) {
    assert.match(output.buffer, new RegExp(escapeRegExp(ansi.moveTo(row + 1, 1))));
  }
});

test('software cursor uses cell inversion rather than a block glyph', () => {
  const cursor = renderCursorCell('x');
  assert.match(cursor, new RegExp(escapeRegExp(ansi.inverse)));
  assert.match(cursor, /x/);
  assert.doesNotMatch(cursor, /█/);
});

test('SelectList keeps short rows compact and honors a custom wrapped-row cap', () => {
  const frame = renderToFrame(SelectList({
    items: ['Short', 'A long row that wraps but must stop after the configured number of lines in the list'],
    selectedIndex: 0,
    windowSize: 2,
    maxItemLines: 2,
  }), { width: 22, height: 9 });
  const lines = frame.toLines().map(stripAnsi);
  const shortRow = lines.findIndex((line) => line.includes('› Short'));
  assert.ok(shortRow >= 0);
  assert.match(lines[shortRow + 1], /A long row/);
  assert.match(lines[shortRow + 2], /…/);
  assert.doesNotMatch(lines[shortRow + 3], /configured|number|lines/);
});

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
