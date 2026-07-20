import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  PointerRegion,
  RichTerminalApp,
  ScrollPane,
  Text,
  createTextSelectionState,
  createWorkspaceApp,
  renderToFrame,
} from '../src/lib/index.js';
import {
  createLongTextState,
  createLongTextView,
  handleLongTextKey,
} from '../examples/long-text.js';

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
  constructor() {
    super();
    this.isTTY = true;
    this.columns = 100;
    this.rows = 30;
    this.buffer = '';
  }
  write(chunk) {
    this.buffer += String(chunk ?? '');
    return true;
  }
}

test('ScrollPane formats only the visible window of a 10,000-row source', () => {
  let conversions = 0;
  const lines = Array.from({ length: 10_000 }, (_, index) => ({
    toString() {
      conversions += 1;
      return `row ${index + 1}`;
    },
  }));

  const frame = renderToFrame(ScrollPane({
    lines,
    width: 100,
    height: 30,
    scroll: 5_000,
    selection: createTextSelectionState(),
    pointerId: 'performance-scroll',
    onWheel() {},
  }), { width: 100, height: 30 });

  assert.match(frame.toString(), /row 5001/);
  assert.ok(conversions <= 40, `expected viewport-only conversion, got ${conversions} rows`);
});

test('10,000-row wheel renders stay independent of total source length', () => {
  const shortLines = Array.from({ length: 100 }, (_, index) => `row ${index + 1} with representative terminal log content`);
  const longLines = Array.from({ length: 10_000 }, (_, index) => `row ${index + 1} with representative terminal log content`);

  const measure = (lines) => {
    const selection = createTextSelectionState();
    const started = performance.now();
    for (let scroll = 0; scroll < 60; scroll += 1) {
      renderToFrame(ScrollPane({
        lines,
        width: 110,
        height: 32,
        scroll,
        selection,
        pointerId: 'benchmark-scroll',
        onWheel() {},
      }), { width: 110, height: 32 });
    }
    return performance.now() - started;
  };

  const shortElapsed = measure(shortLines);
  const longElapsed = measure(longLines);
  assert.ok(
    longElapsed <= shortElapsed * 4 + 250,
    `long source scaled with total rows: short=${shortElapsed.toFixed(1)} ms long=${longElapsed.toFixed(1)} ms`,
  );
});

test('WorkspaceApp batches a wheel burst into one render pass', () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const state = { scroll: 0 };
  let renders = 0;
  const app = createWorkspaceApp({
    title: 'wheel batching',
    input,
    output,
    state,
    render: ({ state: current }) => {
      renders += 1;
      return PointerRegion({
        pointerId: 'viewport',
        pointerWidth: 'fill',
        onWheel: (event) => {
          current.scroll += event.deltaY;
          event.preventDefault();
        },
      }, Text(`scroll:${current.scroll}`, { wrap: false }));
    },
  });

  app.start();
  input.emit('data', '\x1b[<65;2;1M'.repeat(25));
  app.stop();

  assert.equal(state.scroll, 25);
  assert.equal(renders, 2, 'initial frame plus one batched wheel frame');
});


test('RichTerminalApp keeps its animation clock asleep until a streaming row needs it', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const app = new RichTerminalApp({ input, output, animationMs: 5, onExit() {} });

  app.start();
  await delay(30);
  assert.equal(app.animationFrame, 0);
  assert.equal(app.animationTimer, null);

  const message = app.addAssistantMessage('', true);
  await waitFor(() => app.animationFrame >= 1, 1000);
  message.status = 'complete';
  app.render();
  const stoppedAt = app.animationFrame;
  await delay(30);
  assert.equal(app.animationFrame, stoppedAt);
  assert.equal(app.animationTimer, null);
  app.stop();
});

test('long-text example exposes a 10,000-row selectable stress viewport', () => {
  const state = createLongTextState();
  const frame = renderToFrame(createLongTextView({ state, width: 100, height: 30 }), { width: 100, height: 30 });
  assert.equal(state.lines.length, 10_000);
  assert.match(frame.toString(), /Long Text Performance Lab/);
  assert.match(frame.toString(), /10,000 ROWS/);

  const before = state.scroll;
  handleLongTextKey({ key: { name: 'page-down' }, state });
  assert.ok(state.scroll > before);
});


function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitFor(predicate, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) return resolve();
      if (Date.now() - started >= timeoutMs) return reject(new Error('Timed out waiting for animation frame.'));
      setTimeout(poll, 5);
    };
    poll();
  });
}
