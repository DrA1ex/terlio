import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  Box,
  Column,
  PointerRegion,
  RichTerminalApp,
  ScrollView,
  TerminalInputDecoder,
  Text,
  createWorkspaceApp,
  dispatchPointerEvent,
  hitTestPointerRegions,
  isPointerEvent,
  mouseReportingSequence,
  parseInputEvent,
  parseInputEvents,
  parsePointer,
  requestsPointerReporting,
  renderToFrame,
} from '../src/lib/index.js';

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
  constructor({ columns = 30, rows = 10 } = {}) {
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

test('parsePointer normalizes SGR 1006 clicks, releases, wheels and coordinates', () => {
  assert.deepEqual(pick(parsePointer('\x1b[<0;5;3M')), {
    type: 'pointer',
    name: 'click',
    action: 'click',
    button: 'left',
    x: 4,
    y: 2,
    column: 5,
    row: 3,
    deltaX: 0,
    deltaY: 0,
    ctrl: false,
    meta: false,
    shift: false,
    pressed: true,
  });

  assert.deepEqual(pick(parsePointer('\x1b[<16;2;4m')), {
    type: 'pointer',
    name: 'release',
    action: 'release',
    button: 'left',
    x: 1,
    y: 3,
    column: 2,
    row: 4,
    deltaX: 0,
    deltaY: 0,
    ctrl: true,
    meta: false,
    shift: false,
    pressed: false,
  });

  assert.equal(parsePointer('\x1b[<64;8;6M').name, 'wheel-up');
  assert.equal(parsePointer('\x1b[<64;8;6M').deltaY, -1);
  assert.equal(parsePointer('\x1b[<65;8;6M').name, 'wheel-down');
  assert.equal(parsePointer('\x1b[<65;8;6M').deltaY, 1);
  assert.equal(parsePointer('\x1b[<66;8;6M').deltaX, -1);
  assert.equal(parsePointer('\x1b[<67;8;6M').deltaX, 1);
  assert.equal(parsePointer('not a mouse sequence'), null);
});

test('TerminalInputDecoder separates wheel bursts, keys and split SGR sequences', () => {
  const events = parseInputEvents('\x1b[<64;4;2M\x1b[<65;4;2M\x1b[A');
  assert.deepEqual(events.map((event) => event.name), ['wheel-up', 'wheel-down', 'up']);

  const decoder = new TerminalInputDecoder();
  assert.deepEqual(decoder.write('\x1b[<64;10;'), []);
  assert.equal(decoder.write('7M')[0].name, 'wheel-up');
  assert.deepEqual(decoder.write('x\r').map((event) => event.name), ['x', 'enter']);
});

test('rendered pointer regions expose component hit-testing and local coordinates', () => {
  const calls = [];
  const frame = renderToFrame(Column(
    Text('header', { wrap: false }),
    Box({
      border: true,
      height: 3,
      pointerId: 'history',
      pointerData: { kind: 'scroll-pane' },
      pointerWidth: 'fill',
      onWheel: (event) => calls.push(['wheel', event.localX, event.localY, event.currentTarget.id]),
      onPointer: (event) => calls.push(['pointer', event.name]),
    }, Text('body', { wrap: false })),
  ), { width: 20, height: 8 });

  assert.equal(frame.pointerRegions.length, 1);
  assert.deepEqual(frame.pointerRegions[0].bounds, { x: 0, y: 1, width: 20, height: 3 });
  assert.equal(frame.pointerRegions[0].data.kind, 'scroll-pane');
  assert.doesNotMatch(frame.toString(), /9000/);

  const result = dispatchPointerEvent(parsePointer('\x1b[<65;5;3M'), frame.pointerRegions, {});
  assert.equal(result.handled, true);
  assert.equal(result.event.target.id, 'history');
  assert.deepEqual(calls, [
    ['wheel', 4, 1, 'history'],
    ['pointer', 'wheel-down'],
  ]);
});


test('ScrollView translates and clips pointer regions with the visible content window', () => {
  const frame = renderToFrame(ScrollView({ height: 2, scroll: 1 },
    Text('row 1'),
    PointerRegion({ pointerId: 'visible-action', onClick() {} }, Text('row 2')),
    PointerRegion({ pointerId: 'below-window', onClick() {} }, Text('row 3')),
    Text('row 4')),
  { width: 20, height: 2 });

  const visible = frame.pointerRegions.find((region) => region.id === 'visible-action');
  const clipped = frame.pointerRegions.find((region) => region.id === 'below-window');
  assert.deepEqual(visible?.bounds, { x: 0, y: 0, width: 5, height: 1 });
  assert.deepEqual(clipped?.bounds, { x: 0, y: 1, width: 5, height: 1 });
  assert.doesNotMatch(frame.toString(), /row 1|row 4/);
});

test('nested PointerRegion handlers bubble from the innermost component', () => {
  const calls = [];
  const frame = renderToFrame(PointerRegion({
    pointerId: 'outer',
    pointerWidth: 'fill',
    onClick: () => calls.push('outer'),
  }, Box({
    border: true,
    height: 3,
    pointerId: 'inner',
    pointerWidth: 'fill',
    onClick: (event) => {
      calls.push('inner');
      event.stopPropagation();
    },
  }, Text('click', { wrap: false }))), { width: 18, height: 5 });

  const result = dispatchPointerEvent(parsePointer('\x1b[<0;2;2M'), frame.pointerRegions, {});
  assert.equal(result.event.target.id, 'inner');
  assert.deepEqual(calls, ['inner']);
});


test('pointer parser covers drag, move, modifiers and one-shot input helpers', () => {
  const drag = parsePointer(Buffer.from('\x1b[<44;3;4M'));
  assert.equal(drag.name, 'drag');
  assert.equal(drag.button, 'left');
  assert.equal(drag.shift, true);
  assert.equal(drag.meta, true);

  const move = parsePointer('\x1b[<35;3;4M');
  assert.equal(move.name, 'move');
  assert.equal(move.button, 'none');
  assert.equal(isPointerEvent(move), true);
  assert.equal(isPointerEvent({ type: 'pointer', x: NaN, y: 0 }), false);
  assert.equal(parseInputEvent('\x1b[<65;2;2M').name, 'wheel-down');
  assert.equal(parseInputEvent('').name, 'unknown');
});

test('low-level hit testing skips disabled regions and handles empty dispatches', () => {
  const regions = [
    { token: 1, id: 'active', bounds: { x: 0, y: 0, width: 3, height: 1 }, segments: [{ x: 0, y: 0, width: 3, height: 1 }] },
    { token: 2, id: 'disabled', disabled: true, bounds: { x: 0, y: 0, width: 3, height: 1 }, segments: [{ x: 0, y: 0, width: 3, height: 1 }] },
    { token: 3, id: 'none', pointerEvents: 'none', bounds: { x: 0, y: 0, width: 3, height: 1 }, segments: [{ x: 0, y: 0, width: 3, height: 1 }] },
  ];

  assert.equal(hitTestPointerRegions(regions, 1, 0).region.id, 'active');
  assert.deepEqual(hitTestPointerRegions(regions, Number.NaN, 0, { all: true }), []);
  assert.equal(hitTestPointerRegions(regions, Number.NaN, 0), null);
  assert.equal(hitTestPointerRegions(regions, 9, 9), null);
  assert.deepEqual(dispatchPointerEvent({ type: 'key' }, regions), { handled: false, event: { type: 'key' }, targets: [] });

  const outside = dispatchPointerEvent(parsePointer('\x1b[<0;10;10M'), regions);
  assert.equal(outside.handled, false);
  assert.equal(outside.event.target, null);
});

test('pointer dispatch covers drag, move, release and immediate propagation control', () => {
  const calls = [];
  const frame = renderToFrame(PointerRegion({
    pointerId: 'surface',
    pointerWidth: 5,
    onDrag: () => calls.push('drag'),
    onMove: () => calls.push('move'),
    onRelease: () => calls.push('release'),
    onPointer: (event) => {
      calls.push(event.action);
      if (event.action === 'move') event.stopImmediatePropagation();
      return event.action !== 'release';
    },
  }, Text('hello', { wrap: false })), { width: 10, height: 2 });

  dispatchPointerEvent(parsePointer('\x1b[<32;2;1M'), frame.pointerRegions);
  dispatchPointerEvent(parsePointer('\x1b[<35;2;1M'), frame.pointerRegions);
  const released = dispatchPointerEvent(parsePointer('\x1b[<0;2;1m'), frame.pointerRegions);

  assert.deepEqual(calls, ['drag', 'drag', 'move', 'move', 'release', 'release']);
  assert.equal(released.handled, true, 'the action-specific release handler handled the event');
});

test('mouse reporting sequences cover basic, drag, motion and cleanup modes', () => {
  assert.equal(mouseReportingSequence(true, { drag: false, motion: false }), '\x1b[?1006h\x1b[?1000h');
  assert.equal(mouseReportingSequence(true, { drag: true, motion: false }), '\x1b[?1006h\x1b[?1000h\x1b[?1002h');
  assert.equal(mouseReportingSequence(true, { drag: false, motion: true }), '\x1b[?1006h\x1b[?1000h\x1b[?1003h');
  assert.equal(mouseReportingSequence(false), '\x1b[?1003l\x1b[?1002l\x1b[?1000l\x1b[?1006l');
});

test('WorkspaceApp automatically owns mouse mode and routes wheel and click events', () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const state = { wheel: 0, clicks: 0 };
  const app = createWorkspaceApp({
    title: 'pointer app',
    input,
    output,
    state,
    render: () => Box({
      border: true,
      height: 4,
      pointerId: 'viewport',
      pointerWidth: 'fill',
      onWheel: (event) => { state.wheel += event.deltaY; },
      onClick: () => { state.clicks += 1; },
    }, Text(`wheel:${state.wheel} clicks:${state.clicks}`, { wrap: false })),
  });

  app.start();
  assert.match(output.buffer, /\x1b\[\?1006h/);
  assert.match(output.buffer, /\x1b\[\?1002h/);

  input.emit('data', '\x1b[<65;2;2M\x1b[<0;2;2M');
  assert.deepEqual(state, { wheel: 1, clicks: 1 });

  app.stop();
  assert.match(output.buffer, /\x1b\[\?1002l/);
  assert.match(output.buffer, /\x1b\[\?1006l/);
  assert.equal(input.rawMode, false);
});

test('WorkspaceApp can explicitly disable mouse reporting while keeping pointer metadata', () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const app = createWorkspaceApp({
    input,
    output,
    pointer: false,
    render: () => Box({ onClick() {}, pointerId: 'disabled-runtime' }, Text('x')),
  });

  app.start();
  assert.doesNotMatch(output.buffer, /\x1b\[\?1006h/);
  assert.equal(app.renderer.pointerRegions[0].id, 'disabled-runtime');
  app.stop();
});

test('WorkspaceApp exposes a temporary pointer override without losing its auto preference', () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const app = createWorkspaceApp({
    input,
    output,
    render: () => Box({ onClick() {}, pointerId: 'automatic-pointer' }, Text('x')),
  });

  app.start();
  assert.equal(app.pointerActive, true);
  assert.equal(app.togglePointerOverride(), false);
  assert.equal(app.pointerActive, false);
  assert.equal(app.togglePointerOverride(), null);
  assert.equal(app.pointerActive, true);
  assert.equal(app.setPointerOverride(true), true);
  assert.equal(app.pointerActive, true);
  assert.equal(app.setPointerOverride(null), null);
  assert.equal(app.pointerActive, true);
  app.stop();
});

test('passive pointer regions remain routable without automatically enabling mouse reporting', () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  let wheels = 0;
  const app = createWorkspaceApp({
    input,
    output,
    render: () => Box({
      pointerId: 'passive-scroll',
      pointerAutoEnable: false,
      onWheel: () => { wheels += 1; },
    }, Text('copyable output')),
  });

  app.start();
  const region = app.renderer.pointerRegions[0];
  assert.equal(region.autoEnable, false);
  assert.equal(requestsPointerReporting(app.renderer.pointerRegions), false);
  assert.equal(app.pointerActive, false);
  assert.doesNotMatch(output.buffer, /\x1b\[\?1006h/);

  const pointer = parsePointer(`\x1b[<65;${region.bounds.x + 1};${region.bounds.y + 1}M`);
  assert.equal(app.renderer.dispatchPointer(pointer).handled, true);
  assert.equal(wheels, 1);
  app.stop();
});


test('RichTerminalApp keeps wheel and custom transcript selection active by default', () => {
  const input = new FakeInput();
  const output = new FakeOutput({ columns: 80, rows: 24 });
  const app = new RichTerminalApp({ input, output, pointer: { enabled: 'auto', drag: true } });
  app.messages = Array.from({ length: 20 }, (_, index) => ({
    id: `m${index}`,
    role: 'assistant',
    content: `message ${index} `.repeat(8),
    blocks: [],
    status: 'complete',
    meta: {},
  }));

  app.start();
  const transcript = app.renderer.pointerRegions.find((region) => region.id === 'chat-transcript');
  assert.ok(transcript);
  assert.equal(transcript.autoEnable, true);
  assert.equal(app.pointerActive, true);
  assert.match(output.buffer, /\x1b\[\?1000h/);
  assert.match(output.buffer, /\x1b\[\?1002h/);

  const x = transcript.bounds.x + 1;
  const y = transcript.bounds.y + 1;
  input.emit('data', `\x1b[<64;${x + 1};${y + 1}M`);
  assert.equal(app.scrollOffset, 1);

  app.togglePointerOverride();
  assert.equal(app.pointerOverride, false);
  assert.equal(app.pointerActive, false);
  app.togglePointerOverride();
  assert.equal(app.pointerOverride, null);
  assert.equal(app.pointerActive, true);
  app.stop();
});

test('RichTerminalApp smart mode toggles pointer overrides and line-scrolls with Shift+arrows', () => {
  const input = new FakeInput();
  const output = new FakeOutput({ columns: 80, rows: 24 });
  const app = new RichTerminalApp({ input, output });
  app.messages = Array.from({ length: 20 }, (_, index) => ({
    id: `selection-${index}`,
    role: index % 2 ? 'assistant' : 'user',
    content: `selectable transcript message ${index} `.repeat(8),
    blocks: [],
    status: 'complete',
    meta: {},
  }));

  app.start();
  assert.equal(app.pointerActive, true);
  assert.equal(app.pointerOverride, null);

  input.emit('data', '');
  assert.equal(app.pointerOverride, false);
  assert.equal(app.pointerActive, false);
  assert.match(output.buffer, /\[\?1006h/);

  const initial = app.scrollOffset;
  input.emit('data', '[1;2A');
  assert.equal(app.scrollOffset, initial + 1);
  input.emit('data', '[1;2B');
  assert.equal(app.scrollOffset, initial);

  input.emit('data', '');
  assert.equal(app.pointerOverride, null);
  assert.equal(app.pointerActive, true);

  input.emit('data', '/');
  assert.equal(app.pointerOverride, null);
  assert.equal(app.pointerActive, true);
  input.emit('data', '');
  assert.equal(app.pointerOverride, false);
  assert.equal(app.selectionMode, true);
  assert.equal(app.pointerActive, false);
  input.emit('data', '');
  assert.equal(app.pointerOverride, null);
  assert.equal(app.pointerActive, true);
  input.emit('data', '\x1b');
  assert.equal(app.editor.value, '');
  assert.equal(app.pointerActive, true);
  app.stop();
});

function pick(pointer) {
  return {
    type: pointer.type,
    name: pointer.name,
    action: pointer.action,
    button: pointer.button,
    x: pointer.x,
    y: pointer.y,
    column: pointer.column,
    row: pointer.row,
    deltaX: pointer.deltaX,
    deltaY: pointer.deltaY,
    ctrl: pointer.ctrl,
    meta: pointer.meta,
    shift: pointer.shift,
    pressed: pointer.pressed,
  };
}
