import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createWorkspaceApp, Text } from '../src/lib/index.js';
import { createInteractionKitApp } from '../examples/interaction-kit.js';

class FakeInput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this.rawMode = false;
    this.paused = true;
  }
  setEncoding() {}
  setRawMode(value) { this.rawMode = Boolean(value); }
  resume() { this.paused = false; }
  pause() { this.paused = true; }
}

class FakeOutput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this.columns = 90;
    this.rows = 28;
    this.buffer = '';
  }
  write(chunk) {
    this.buffer += String(chunk ?? '');
    return true;
  }
}

test('WorkspaceApp forwards unhandled raw input to the configured onKey handler', () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const seen = [];
  const app = createWorkspaceApp({
    title: 'test app',
    state: { selected: 0 },
    input,
    output,
    render: ({ state }) => Text(`selected:${state.selected}`),
    onKey: ({ key, state }) => {
      seen.push(key.name);
      if (key.name === 'down') state.selected += 1;
    },
  });

  app.start();
  input.emit('data', '\x1b[B');
  app.stop();

  assert.deepEqual(seen, ['down']);
  assert.equal(app.state.selected, 1);
  assert.equal(input.rawMode, false);
});



test('example:kit wires WorkspaceApp input into the showcase key handler', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.columns = 120;
  output.rows = 35;
  const app = createInteractionKitApp({ input, output });
  app.escapeTimeoutMs = 5;

  app.start();
  assert.equal(app.state.selectedShowcaseIndex, 0);
  input.emit('data', '\x1b[B');
  assert.equal(app.state.selectedShowcaseIndex, 1);
  input.emit('data', '\r');
  assert.equal(app.state.focus.current(), 'preview');
  input.emit('data', '\x1b');
  await delay(15);
  assert.equal(app.state.focus.current(), 'nav');
  app.stop();
});

test('WorkspaceApp preserves Shift+Arrow when Escape arrives in its own terminal chunk', () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const seen = [];
  const app = createWorkspaceApp({
    title: 'split input',
    state: {},
    input,
    output,
    render: () => Text('ready'),
    onKey: ({ key }) => seen.push(key),
  });

  app.start();
  input.emit('data', '\x1b');
  input.emit('data', '[1;2A');
  app.stop();

  assert.equal(seen.length, 1);
  assert.equal(seen[0].name, 'up');
  assert.equal(seen[0].shift, true);
  assert.equal(seen[0].sequence, '\x1b[1;2A');
});

test('example:kit reorders from navigation focus with split macOS-style Shift+Arrow input', () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.columns = 120;
  output.rows = 35;
  const app = createInteractionKitApp({ input, output });
  const index = app.state.list.items.findIndex((item) => item.id === 'reordering-items');
  const demo = app.state.showcaseState['reordering-items'];

  app.state.selectedShowcaseIndex = index;
  app.state.list.selectedIndex = index;
  app.state.focus.focus('nav');
  const initial = demo.list.items.map((item) => item.id);

  app.start();
  input.emit('data', '\x1b');
  input.emit('data', '[1;2A');
  app.stop();

  assert.equal(app.state.focus.current(), 'preview');
  assert.equal(demo.lastShift, true);
  assert.equal(demo.lastKey, 'Shift+↑');
  assert.deepEqual(demo.list.items.map((item) => item.id).slice(0, 3), ['resolve', 'unit', 'compile']);
  assert.notDeepEqual(demo.list.items.map((item) => item.id), initial);
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
