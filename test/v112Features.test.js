import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  Modal,
  OverlayHost,
  SelectList,
  Text,
  createListState,
  createOverlayManager,
  createWorkspaceApp,
  handleListKey,
  renderToFrame,
  renderToString,
  stripAnsi,
} from '../src/lib/index.js';

class FakeInput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this.rawMode = false;
  }
  setEncoding() {}
  setRawMode(value) { this.rawMode = Boolean(value); }
  resume() {}
  pause() {}
}

class FakeOutput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this.columns = 60;
    this.rows = 12;
    this.buffer = '';
  }
  write(chunk) {
    this.buffer += String(chunk ?? '');
    return true;
  }
}

test('SelectList presentation rows render without focus, disabled state, or pointer regions', () => {
  const items = [
    { kind: 'heading', label: 'Overview', disabled: true },
    { id: 'alpha', label: 'Alpha' },
    { kind: 'stat', label: 'Latency', value: '42 ms', disabled: true },
    { id: 'blocked', label: 'Blocked', disabled: true },
    { kind: 'separator' },
    { id: 'omega', label: 'Omega' },
  ];
  const node = SelectList({ title: 'Rows', items, selectedIndex: 0, windowSize: 6, pointerId: 'rows' });
  const frame = renderToFrame(node, { width: 42, height: 12 });
  const output = stripAnsi(frame.toString());

  assert.match(output, /Rows 1\/3/);
  assert.match(output, /Overview/);
  assert.match(output, /Latency: 42 ms/);
  assert.match(output, /› Alpha/);
  assert.match(output, /Blocked ×/);
  assert.doesNotMatch(output, /Overview ×|Latency.*×/);
  assert.ok(frame.pointerRegions.some((region) => region.id === 'rows:1'));
  assert.ok(frame.pointerRegions.some((region) => region.id === 'rows:3'));
  assert.ok(frame.pointerRegions.some((region) => region.id === 'rows:5'));
  assert.equal(frame.pointerRegions.some((region) => ['rows:0', 'rows:2', 'rows:4'].includes(region.id)), false);
});

test('SelectList supports empty and callback-based disabled indicators', () => {
  const items = [{ label: 'One', disabled: true }, { label: 'Two', disabled: true }];
  const hidden = stripAnsi(renderToString(SelectList({ items, disabledIndicator: '' }), { width: 30, height: 6 }));
  assert.doesNotMatch(hidden, /×/);

  const custom = stripAnsi(renderToString(SelectList({
    items,
    getDisabledIndicator: (_item, index) => index === 0 ? 'LOCKED' : '',
  }), { width: 36, height: 6 }));
  assert.match(custom, /One LOCKED/);
  assert.doesNotMatch(custom, /Two ×|Two LOCKED/);
});

test('list state skips presentation rows without classifying them as disabled', () => {
  const items = [
    { kind: 'heading', label: 'Group' },
    { label: 'A' },
    { kind: 'stat', label: 'Count', value: 2 },
    { label: 'B', disabled: true },
    { kind: 'separator' },
    { label: 'C' },
  ];
  const disabledChecks = [];
  const list = createListState({
    items,
    selectedIndex: 0,
    getDisabled: (item, index) => {
      disabledChecks.push(index);
      return Boolean(item?.disabled);
    },
  });
  assert.equal(list.selectedIndex, 1);
  handleListKey(list, { name: 'down' });
  assert.equal(list.selectedIndex, 5);
  assert.equal(disabledChecks.includes(0), false);
  assert.equal(disabledChecks.includes(2), false);
  assert.equal(disabledChecks.includes(4), false);
});

test('WorkspaceApp provides an automatically advancing animationFrame context', async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const seen = [];
  const app = createWorkspaceApp({
    title: 'animation',
    input,
    output,
    animationMs: 5,
    render: ({ animationFrame }) => {
      seen.push(animationFrame);
      return Text(`frame:${animationFrame}`);
    },
  });

  app.start();
  await waitFor(() => app.animationFrame >= 2, 1000);
  app.stop();

  assert.equal(seen[0], 0);
  assert.ok(seen.some((frame) => frame >= 2));
  assert.equal(app.animationTimer, null);
});

test('dynamic blocking modals rerender from current available dimensions', () => {
  const manager = createOverlayManager();
  const calls = [];
  manager.modal({
    width: 50,
    render: ({ width, height }) => {
      calls.push({ width, height });
      return Modal({ title: ' Dynamic ', children: [`available ${width}x${height}`] });
    },
  });

  const first = stripAnsi(renderToString(OverlayHost({ content: Text('background'), manager, width: 80, height: 20 }), { width: 80, height: 20 }));
  const second = stripAnsi(renderToString(OverlayHost({ content: Text('background'), manager, width: 40, height: 10 }), { width: 40, height: 10 }));

  assert.equal(calls.length, 2);
  assert.ok(calls[0].width > calls[1].width);
  assert.ok(calls[0].height > calls[1].height);
  assert.match(first, new RegExp(`available ${calls[0].width}x${calls[0].height}`));
  assert.match(second, /Dynamic/);
  assert.equal(manager.hasBlocking(), true);
});

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
