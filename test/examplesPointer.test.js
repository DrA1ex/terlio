import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  RichTerminalApp,
  dispatchPointerEvent,
  parsePointer,
  renderToFrame,
} from '../src/lib/index.js';
import { createEditorLabState, createEditorLabView } from '../examples/editor-lab.js';
import {
  createCommandPaletteState,
  createCommandPaletteView,
  handleCommandPaletteKey,
} from '../examples/command-palette.js';
import {
  createStreamingWorkbenchState,
  createStreamingWorkbenchView,
} from '../examples/streaming-workbench.js';
import {
  createKeyInspectorState,
  createKeyInspectorView,
  handleKeyInspectorKey,
} from '../examples/keys.js';
import { createThemeGalleryState, createThemeGalleryView } from '../examples/themes.js';
import { createBlocksGalleryState, createBlocksGalleryView } from '../examples/blocks.js';
import { createCodeReviewState, createCodeReviewView } from '../examples/code-review.js';
import { createInteractionKitState, createInteractionKitView } from '../examples/interaction-kit.js';
import { createSupportDeskState, createSupportDeskView } from '../examples/support-desk.js';
import { InteractiveRuntime } from '../examples/_demoRuntime.js';

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
  constructor(columns = 120, rows = 34) {
    super();
    this.isTTY = true;
    this.columns = columns;
    this.rows = rows;
    this.buffer = '';
  }
  write(value) {
    this.buffer += String(value ?? '');
    return true;
  }
}

function pointerAt(region, code) {
  const column = region.bounds.x + 1;
  const row = region.bounds.y + 1;
  return parsePointer(`\x1b[<${code};${column};${row}M`);
}

function assertPointerSurface(name, frame) {
  const clickable = frame.pointerRegions.find((region) => typeof region.onClick === 'function');
  const scrollable = frame.pointerRegions.find((region) => typeof region.onWheel === 'function');

  assert.ok(clickable, `${name} should expose at least one clickable component`);
  assert.ok(scrollable, `${name} should expose at least one wheel/trackpad surface`);
  assert.equal(dispatchPointerEvent(pointerAt(clickable, 0), frame.pointerRegions).handled, true, `${name} click should route`);
  assert.equal(dispatchPointerEvent(pointerAt(scrollable, 65), frame.pointerRegions).handled, true, `${name} wheel should route`);
}

test('every interactive packaged example exposes working click and wheel regions', () => {
  const editor = createEditorLabState();
  const release = createCommandPaletteState();
  handleCommandPaletteKey({ key: { name: 'enter' }, state: release, runtime: { exit() {} } });
  const stream = createStreamingWorkbenchState();
  const keys = createKeyInspectorState();
  for (let index = 0; index < 18; index += 1) {
    const text = String(index % 10);
    handleKeyInspectorKey({ key: { name: text, text, sequence: text, printable: true }, state: keys });
  }

  const examples = [
    ['Editor Lab', createEditorLabView({ state: editor, width: 120, height: 34 }), 120, 34],
    ['Release Command Center', createCommandPaletteView({ state: release, width: 120, height: 34 }), 120, 34],
    ['Streaming Workbench', createStreamingWorkbenchView({ state: stream, width: 120, height: 34 }), 120, 34],
    ['Key Inspector', createKeyInspectorView({ state: keys, width: 160, height: 36 }), 160, 36],
    ['Theme Studio', createThemeGalleryView({ state: createThemeGalleryState(), width: 120, height: 34 }), 120, 34],
    ['Structured Response Explorer', createBlocksGalleryView({ state: createBlocksGalleryState(), width: 120, height: 34 }), 120, 34],
    ['Code Review', createCodeReviewView({ state: createCodeReviewState(), width: 150, height: 38 }), 150, 38],
    ['Component Studio', createInteractionKitView({ state: createInteractionKitState(), width: 150, height: 38 }), 150, 38],
    ['Support Triage Desk', createSupportDeskView({ state: createSupportDeskState(), width: 150, height: 38 }), 150, 38],
  ];

  for (const [name, view, width, height] of examples) {
    assertPointerSurface(name, renderToFrame(view, { width, height }));
  }
});

test('chat example enables wheel, clicks, and component text selection by default', () => {
  const app = new RichTerminalApp({ input: new FakeInput(), output: new FakeOutput() });
  app.running = true;
  app.render();
  assert.equal(app.pointerActive, true);
  const transcript = app.renderer.pointerRegions.find((region) => region.id === 'chat-transcript');
  assert.ok(transcript && typeof transcript.onWheel === 'function');
  assert.equal(transcript.autoEnable, true);
  assert.equal(typeof transcript.onDrag, 'function');

  app.onData('/');
  assertPointerSurface('Chat workspace', app.renderer.previousFrame);
  assert.equal(app.pointerActive, true);

  app.toggleSelectionMode(true);
  assert.equal(app.selectionMode, true);
  assert.equal(app.pointerActive, false);
  app.toggleSelectionMode(false);
  assert.equal(app.selectionMode, false);
  assert.equal(app.pointerActive, true);

  app.onData('\x1b');
  assert.equal(app.editor.value, '');
  assert.equal(app.pointerActive, true);
});

test('packaged interactive examples can temporarily invert smart pointer mode with Ctrl+T', () => {
  const output = new FakeOutput();
  const runtime = new InteractiveRuntime({
    title: 'Pointer override example',
    state: {},
    render: () => ({
      type: 'box',
      props: { pointerId: 'clickable', onClick() {} },
      children: [{ type: 'text', props: { value: 'copyable text', wrap: false }, children: [] }],
    }),
    input: new FakeInput(),
    output,
  });
  runtime.running = true;
  runtime.render();
  assert.match(output.buffer, /copyable text/);
  assert.equal(runtime.pointerActive, true);

  runtime.handleData('\x14');
  assert.equal(runtime.pointerOverride, false);
  assert.equal(runtime.pointerActive, false);
  assert.match(runtime.state.status, /Native text selection forced/);

  runtime.handleData('\x14');
  assert.equal(runtime.pointerOverride, null);
  assert.equal(runtime.pointerActive, true);
});
