import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import * as publicApi from '../../src/lib/index.js';
import {
  Box,
  PointerRegion,
  SessionStore,
  TerminalRenderer,
  Text,
  ansi,
  copyTextToClipboard,
  mouseReportingSequence,
  patchFrames,
  renderToFrame,
  renderToString,
} from '../../src/lib/index.js';
import {
  createLegacyClipboard,
  createLegacyNativeClipboardBackend,
  writeOsc52Clipboard,
} from '../../src/lib/clipboardBackend.js';
import {
  createTerminalOutputFrame,
  legacyTerminalOutput,
  serializeTerminalOutputFrame,
  terminalHyperlink,
  terminalLineBreak,
  terminalPointerRegion,
  terminalStyle,
  terminalTab,
  terminalText,
  terminalUnsafeRaw,
} from '../../src/lib/terminal/outputModel.js';
import { createTerminalPolicy, normalizeTerminalPolicy } from '../../src/lib/terminal/policy.js';
import { createTerminalSink, resolveTerminalSink, TerminalSink } from '../../src/lib/terminal/sink.js';
import { TerminalSessionGuard } from '../../src/lib/terminal/sessionGuard.js';

class FakeInput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = true;
    this.rawTransitions = [];
  }
  setRawMode(value) { this.rawTransitions.push(Boolean(value)); }
}

class FakeOutput extends EventEmitter {
  constructor({ columns = 40, rows = 10 } = {}) {
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

test('phase 1 terminal output model represents structured channels while the legacy adapter preserves bytes', () => {
  const operations = [
    terminalText('hello'),
    terminalStyle('\x1b[1m', { trusted: true }),
    terminalTab(),
    terminalLineBreak(),
    terminalPointerRegion({ id: 'row' }),
    terminalHyperlink('docs', 'https://example.test'),
    terminalUnsafeRaw('\x1b[2J'),
  ];
  const frame = createTerminalOutputFrame({
    operations,
    cells: ['hello'],
    styles: [operations[1]],
    regions: [{ id: 'row' }],
    links: [operations[5]],
    unsafeSequences: [operations[6]],
    legacyBytes: 'legacy-bytes',
  });

  assert.equal(frame.type, 'terminal-output-frame');
  assert.equal(frame.cells[0], 'hello');
  assert.equal(frame.regions[0].id, 'row');
  assert.equal(serializeTerminalOutputFrame(frame), 'legacy-bytes');
  assert.equal(serializeTerminalOutputFrame(legacyTerminalOutput('\x1b[31mred\x1b[0m')), '\x1b[31mred\x1b[0m');
});

test('terminal output serialization keeps compatibility fallbacks deterministic', () => {
  const operations = [
    null,
    terminalText('text'),
    terminalStyle('\x1b[1m'),
    terminalTab(),
    terminalLineBreak(),
    terminalHyperlink('label', 'https://example.test'),
    terminalPointerRegion({ id: 'ignored' }),
  ];
  const frame = createTerminalOutputFrame({ operations });

  assert.equal(serializeTerminalOutputFrame(null), '');
  assert.equal(serializeTerminalOutputFrame('raw'), 'raw');
  assert.equal(serializeTerminalOutputFrame(Buffer.from('bytes')), 'bytes');
  assert.equal(serializeTerminalOutputFrame(frame), 'text\x1b[1m\t\nlabel');
  assert.equal(serializeTerminalOutputFrame({ value: 42 }), '[object Object]');
});

test('phase 3 policy objects default to safe rendering and expose only intentional public opt-ins', () => {
  const policy = createTerminalPolicy({ limits: { renderedLines: 500 } });
  assert.equal(policy.mode, 'safe');
  assert.equal(policy.hyperlinks, 'disabled');
  assert.equal(policy.clipboard, 'native');
  assert.equal(policy.unicodeControls, 'normal');
  assert.equal(policy.blockedControlRendering, 'visible');
  assert.equal(policy.limits.hyperlinkBytes, 2048);
  assert.equal(policy.limits.pointerRegions, Infinity);
  assert.equal(policy.limits.renderedLines, 500);
  for (const [name, value] of Object.entries(policy.limits)) {
    assert.ok(value === Infinity || (Number.isFinite(value) && value >= 0), name);
  }
  assert.equal(typeof publicApi.createTerminalPolicy, 'function');
  assert.equal(typeof publicApi.unsafeRawAnsi, 'function');
  for (const internalName of ['TerminalSink', 'TerminalSessionGuard', 'terminalUnsafeRaw']) {
    assert.equal(internalName in publicApi, false, `${internalName} remains internal`);
  }
});

test('terminal policy normalization preserves complete safe policies and rejects legacy mode fallbacks', () => {
  const complete = createTerminalPolicy({ mode: 'trusted', hyperlinks: 'disabled', clipboard: 'legacy', unicodeControls: 'normal' });
  assert.equal(normalizeTerminalPolicy(complete), complete);
  assert.deepEqual(normalizeTerminalPolicy({ mode: 'legacy' }), createTerminalPolicy());
  assert.deepEqual(normalizeTerminalPolicy(null), createTerminalPolicy());
});

test('terminal sink adapters accept output streams, existing sinks, empty output and direct frames', () => {
  const output = new FakeOutput();
  const fromOutput = createTerminalSink(output);
  const existing = { writeFrame() { return 'existing'; } };

  assert.ok(fromOutput instanceof TerminalSink);
  assert.equal(fromOutput.write('stream'), true);
  assert.equal(output.buffer, 'stream');
  assert.equal(createTerminalSink(existing), existing);
  assert.equal(resolveTerminalSink({ sink: existing, output }), existing);
  assert.equal(createTerminalSink().write('discarded'), false);
  assert.equal(createTerminalSink({ output }).writeFrame('frame'), true);
  assert.equal(output.buffer, 'streamframe');
});

test('renderer sends the unchanged legacy patch through the single terminal sink', () => {
  const output = new FakeOutput({ columns: 12, rows: 2 });
  const sink = createTerminalSink({ output });
  const renderer = new TerminalRenderer({ output, sink });
  const frame = renderToFrame(Text('ready', { wrap: false }), { width: 12, height: 2 });
  const patch = patchFrames(null, frame, { includeRegionChanges: true, bleedRows: 1 });

  renderer.renderFrame(frame);

  assert.equal(output.buffer, `${ansi.autoWrapOff}${patch}${ansi.autoWrapOn}`);
  assert.equal(renderer.previousFrame, frame);
});

test('trusted layout bytes remain stable after pointer metadata moves out of the text stream', () => {
  const node = Box({ border: true, padding: { left: 1, right: 1 }, title: ' Demo ' }, Text('\x1b[1mOK\x1b[0m', { wrap: false }));
  assert.equal(
    renderToString(node, { width: 12, height: 3 }),
    '┌  Demo    ┐\n│ \x1b[1mOK\x1b[0m       │\n└──────────┘',
  );
});

test('pointer metadata is structured and cannot be created by legacy marker text', () => {
  const fake = '\x1b[?9000;777;20z';
  const injected = renderToFrame(Text(`${fake}visible`, { wrap: false }), { width: 40, height: 1 });
  assert.equal(injected.pointerRegions.length, 0);
  assert.equal(injected.lines[0].includes('visible'), true);
  assert.equal(injected.lines[0].includes('\x1b'), false);
  assert.equal(injected.lines[0].startsWith('␛[?9000;777;20zvisible'), true);

  const nested = renderToFrame(PointerRegion({ pointerId: 'parent', pointerWidth: 'fill' },
    PointerRegion({ pointerId: 'child', pointerWidth: 5 }, Text('child', { wrap: false }))), { width: 20, height: 1 });
  const parent = nested.pointerRegions.find((region) => region.id === 'parent');
  const child = nested.pointerRegions.find((region) => region.id === 'child');
  assert.ok(parent);
  assert.ok(child);
  assert.equal(child.parentToken, parent.token);
  assert.deepEqual(parent.bounds, { x: 0, y: 0, width: 20, height: 1 });
  assert.deepEqual(child.bounds, { x: 0, y: 0, width: 5, height: 1 });
});

test('terminal session guard preserves lifecycle bytes and cleanup is idempotent', () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const guard = new TerminalSessionGuard({ input, output });
  const pointerOptions = { drag: true, motion: false };

  assert.equal(guard.start(), true);
  assert.equal(guard.enableRawMode(), true);
  assert.equal(guard.setPointerReporting(true, pointerOptions), true);
  assert.equal(guard.cleanup({ newline: true }), true);
  const once = output.buffer;
  assert.equal(guard.cleanup({ newline: true }), false);

  assert.deepEqual(input.rawTransitions, [true, false]);
  assert.equal(output.buffer, once);
  assert.equal(output.buffer,
    ansi.altScreen + ansi.hideCursor + ansi.autoWrapOff + ansi.clear + ansi.home
    + mouseReportingSequence(true, pointerOptions)
    + mouseReportingSequence(false, pointerOptions)
    + ansi.autoWrapOn + ansi.showCursor + ansi.normalScreen + ansi.reset + '\n');
});

test('terminal session guard tracks repeated operations and owned signal handlers without changing bytes', () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const emitter = new EventEmitter();
  const guard = new TerminalSessionGuard({ input, output });
  const handler = () => {};

  assert.equal(guard.trackSignalHandler(null, 'event', handler), false);
  assert.equal(guard.trackSignalHandler(emitter, 'event', null), false);
  assert.equal(guard.trackSignalHandler(emitter, 'event', handler, { once: true }), true);
  assert.equal(guard.trackSignalHandler(emitter, 'retained', handler, { removeOnCleanup: false }), true);
  assert.equal(guard.start(), true);
  assert.equal(guard.start(), false);
  assert.equal(guard.enableRawMode(), true);
  assert.equal(guard.enableRawMode(), false);
  assert.equal(guard.setPointerReporting(false), false);
  assert.equal(guard.cleanup({ newline: false }), true);
  assert.equal(emitter.listenerCount('event'), 0);
  assert.equal(emitter.listenerCount('retained'), 1);
  guard.removeSignalHandlers();
  assert.equal(emitter.listenerCount('retained'), 0);
});

test('terminal session guard supports custom frame-only sinks for trusted lifecycle controls', () => {
  const frames = [];
  const sink = { writeFrame(frame) { frames.push(frame); return true; } };
  const guard = new TerminalSessionGuard({ input: new FakeInput(), output: new FakeOutput(), sink });

  assert.equal(guard.start(), true);
  assert.equal(guard.cleanup({ newline: false }), true);
  assert.equal(frames.length, 2);
  assert.equal(frames.every((frame) => frame.operations[0].type === 'control'), true);
  assert.equal(frames.every((frame) => frame.operations[0].metadata.trusted === true), true);
});

test('terminal session guard leaves non-TTY raw mode untouched', () => {
  const input = new FakeInput();
  input.isTTY = false;
  const guard = new TerminalSessionGuard({ input, output: new FakeOutput() });
  assert.equal(guard.enableRawMode(), false);
  assert.equal(guard.cleanup(), false);
});

test('clipboard compatibility adapter supports injection while retaining legacy selection behavior', () => {
  const calls = [];
  const result = copyTextToClipboard('copy me', {
    clipboard: {
      copy(text, options) {
        calls.push({ text, options });
        return { copied: true, method: 'injected' };
      },
    },
  });

  assert.deepEqual(result, { copied: true, method: 'injected' });
  assert.deepEqual(calls, [{ text: 'copy me', options: { osc52: true, target: 'c' } }]);
});

test('legacy clipboard adapters preserve native command order and OSC 52 fallback behavior', () => {
  const attempts = [];
  const output = new FakeOutput();
  const clipboard = createLegacyClipboard({
    output,
    platform: 'win32',
    spawnSync(command, args, options) {
      attempts.push({ command, args, options });
      return { status: command === 'clip.exe' ? 0 : 1 };
    },
  });

  assert.deepEqual(clipboard.copy('native'), { copied: true, method: 'clip.exe' });
  assert.deepEqual(attempts.map(({ command }) => command), ['powershell.exe', 'clip.exe']);
  assert.equal(output.buffer, '');

  const fallback = createLegacyClipboard({ output, platform: 'linux', env: {}, spawnSync: () => ({ status: 1 }) });
  assert.deepEqual(fallback.copy('remote', { target: 'p' }), { copied: true, method: 'osc52' });
  assert.equal(output.buffer, `\x1b]52;p;${Buffer.from('remote').toString('base64')}\x07`);
  assert.deepEqual(fallback.copy('', {}), { copied: false, method: null });
  assert.deepEqual(fallback.copy('disabled', { osc52: false }), { copied: false, method: null });
  assert.deepEqual(
    createLegacyClipboard({ output, platform: 'linux', spawnSync: () => ({ status: 1 }), securityLimits: { clipboardBytes: 4 } }).copy('oversized'),
    { copied: false, method: null },
  );
  assert.deepEqual(createLegacyClipboard({ output: null, platform: 'linux', spawnSync: null }).copy('no-output'), { copied: false, method: null });
});

test('native clipboard backend tolerates unavailable and throwing commands across platforms', () => {
  const seen = [];
  const backend = createLegacyNativeClipboardBackend({
    platform: 'linux',
    env: { WSL_DISTRO_NAME: 'Ubuntu', WAYLAND_DISPLAY: 'wayland-0' },
    timeout: 0,
    spawnSync(command, args, options) {
      seen.push({ command, args, timeout: options.timeout });
      if (command === 'clip.exe') throw new Error('missing');
      return { status: 1, error: command === 'xclip' ? new Error('failed') : null };
    },
  });

  assert.deepEqual(backend.copy('value'), { copied: false, method: null });
  assert.deepEqual(seen.map(({ command }) => command), ['clip.exe', 'wl-copy', 'xclip', 'xsel']);
  assert.ok(seen.every(({ timeout }) => timeout === 1200));
  assert.deepEqual(createLegacyNativeClipboardBackend({ platform: 'darwin', spawnSync: null }).copy('value'), { copied: false, method: null });
});

test('direct OSC 52 writer preserves legacy success and rejection results', () => {
  const output = new FakeOutput();
  assert.equal(writeOsc52Clipboard('', { output }), false);
  assert.equal(writeOsc52Clipboard('value', { output: null }), false);
  assert.equal(writeOsc52Clipboard('value', { output, target: 'c' }), true);
  assert.equal(output.buffer, `\x1b]52;c;${Buffer.from('value').toString('base64')}\x07`);
});

test('session store delegates persistence without changing the serialized file format', () => {
  const files = new Map();
  const directories = [];
  const backend = {
    ensureDirectory(directory) { directories.push(directory); },
    list(directory) {
      const prefix = `${directory}${path.sep}`;
      return [...files.keys()].filter((file) => file.startsWith(prefix)).map((file) => path.basename(file));
    },
    exists(file) { return files.has(file); },
    read(file) { return files.get(file); },
    write(file, data) { files.set(file, data); },
    remove(file) { files.delete(file); },
  };
  const rootDir = path.join(path.sep, 'virtual', 'terlio');
  const store = new SessionStore({ rootDir, backend });
  const saved = store.save({
    id: 'phase-1',
    title: 'Architecture',
    createdAt: '2026-07-25T08:00:00.000Z',
    themeName: 'ocean',
    providerName: 'mock',
    skillState: { review: true },
    inputHistory: ['hello'],
    messages: [{ role: 'user', content: 'hello' }],
  });
  const file = path.join(rootDir, 'sessions', 'phase-1.json');

  assert.deepEqual(directories, [path.join(rootDir, 'sessions')]);
  assert.equal(files.get(file), `${JSON.stringify(saved, null, 2)}\n`);
  assert.equal(store.load('phase-1').title, 'Architecture');
  assert.equal(store.list()[0].id, 'phase-1');
  store.remove('phase-1');
  assert.equal(files.has(file), false);
});
