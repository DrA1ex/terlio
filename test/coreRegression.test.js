import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  InputEditor,
  RichTerminalApp,
  SessionStore,
  Text,
  createActionRegistry,
  createOverlayManager,
  createWorkspaceApp,
  handleInputEditorKey,
  keyMatches,
  parseCommand,
  tokenizeCommand,
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
  constructor({ columns = 80, rows = 24 } = {}) {
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

test('generic editor key handling preserves multiline bracketed paste', () => {
  const editor = new InputEditor('before:');
  const result = handleInputEditorKey(editor, {
    name: 'paste',
    text: 'first\nsecond\tvalue',
    printable: false,
  });

  assert.equal(result.handled, true);
  assert.equal(editor.value, 'before:first\nsecond  value');
  assert.equal(editor.getCursorPosition().line, 1);
});

test('action registry resolves callback disabled state in help and footer output', () => {
  const registry = createActionRegistry([{
    id: 'release.deploy',
    title: 'Deploy',
    key: 'd',
    disabled: ({ state }) => !state.ready,
  }]);

  assert.deepEqual(registry.toHelpShortcuts({ state: { ready: true } }), [['d', 'Deploy']]);
  assert.deepEqual(registry.toFooterHints({ state: { ready: true } }), ['d Deploy']);
  assert.deepEqual(registry.toHelpShortcuts({ state: { ready: false } }), [['d', 'Deploy (disabled)']]);
  assert.deepEqual(registry.toFooterHints({ state: { ready: false } }), ['d Deploy disabled']);
});


test('plain action key specs do not consume Shift-modified shortcuts', () => {
  const shiftedTab = { name: 'tab', shift: true, ctrl: false, meta: false, cmd: false };
  assert.equal(keyMatches('tab', shiftedTab), false);
  assert.equal(keyMatches('shift+tab', shiftedTab), true);
});

test('legacy parseCommand facade supports quoted and escaped arguments', () => {
  assert.deepEqual(parseCommand('/blocks "release notes" final'), {
    name: '/blocks',
    args: ['release notes', 'final'],
  });
  assert.deepEqual(tokenizeCommand('path\\'), ['path\\']);
  assert.deepEqual(parseCommand('plain \"two words\"'), { name: 'plain', args: ['two words'] });
});

test('WorkspaceApp renders with the real viewport and start is idempotent', () => {
  const input = new FakeInput();
  const output = new FakeOutput({ columns: 22, rows: 8 });
  const seen = [];
  const app = createWorkspaceApp({
    input,
    output,
    render: ({ width, height }) => {
      seen.push([width, height]);
      return Text(`${width}x${height}`);
    },
  });

  app.start();
  app.start();
  assert.deepEqual(seen.at(-1), [22, 8]);
  assert.equal(input.listenerCount('data'), 1);
  assert.equal(output.listenerCount('resize'), 1);
  app.stop();
});

test('WorkspaceApp can exit through an injected callback without terminating the process', () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const exits = [];
  const app = createWorkspaceApp({
    input,
    output,
    onExit: (code) => exits.push(code),
    render: () => Text('ready'),
  });

  app.start();
  input.emit('data', '\x03');
  assert.deepEqual(exits, [130]);
  assert.equal(app.running, false);
  assert.equal(input.rawMode, false);
});


test('WorkspaceApp traps input in the top blocking overlay', () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const overlays = createOverlayManager();
  const backgroundKeys = [];
  let cancelled = false;
  overlays.confirm({ title: 'Confirm', message: 'Continue?', onCancel: () => { cancelled = true; } });
  const app = createWorkspaceApp({
    input,
    output,
    overlays,
    render: () => Text('background'),
    onKey: ({ key }) => backgroundKeys.push(key.name),
  });

  app.start();
  input.emit('data', 'x');
  assert.deepEqual(backgroundKeys, []);
  assert.equal(overlays.hasBlocking(), true);
  input.emit('data', '\x1b');
  assert.equal(cancelled, true);
  assert.equal(overlays.hasBlocking(), false);
  app.stop();
});

test('overlay tick invalidates only when the visible toast stack changes', () => {
  const overlays = createOverlayManager();
  overlays.toast('Saved', 'success', 1);
  assert.equal(overlays.tick(0.25), false);
  assert.equal(overlays.toasts.length, 1);
  assert.equal(overlays.tick(0.75), true);
  assert.equal(overlays.toasts.length, 0);
});


test('RichTerminalApp start is idempotent and cleans up one listener set', () => {
  const input = new FakeInput();
  const output = new FakeOutput({ columns: 80, rows: 24 });
  const app = new RichTerminalApp({ input, output });

  app.start();
  app.start();
  assert.equal(input.listenerCount('data'), 1);
  assert.equal(output.listenerCount('resize'), 1);
  app.stop();
  assert.equal(input.listenerCount('data'), 0);
  assert.equal(output.listenerCount('resize'), 0);
});

test('RichTerminalApp marks provider failures as errors and surfaces one toast', async () => {
  const app = new RichTerminalApp({
    input: new FakeInput(),
    output: new FakeOutput(),
    sessionStore: new SessionStore({ rootDir: fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-app-')) }),
  });
  app.provider = {
    title: 'Broken provider',
    async streamResponse() { throw 'provider unavailable'; },
  };

  await app.respond('test prompt');
  const assistant = app.messages.at(-1);
  assert.equal(assistant.status, 'error');
  assert.match(assistant.content, /provider unavailable/);
  assert.equal(app.overlays.toasts.length, 1);
  assert.equal(app.overlays.toasts[0].level, 'error');
});

test('RichTerminalApp distinguishes failed assistant actions from cancellation', async () => {
  const app = new RichTerminalApp({ input: new FakeInput(), output: new FakeOutput() });
  app.addAssistantMessage('A response that can be transformed.');
  app.streamPlainText = async () => { throw new Error('transform failed'); };

  await app.runAssistantAction('shorter');
  const result = app.messages.at(-1);
  assert.equal(result.status, 'error');
  assert.match(result.content, /action failed: transform failed/);
  assert.equal(app.status, 'Action failed.');
});

test('SessionStore skips corrupt summaries and round-trips normalized snapshots', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-sessions-'));
  const store = new SessionStore({ rootDir });
  const saved = store.save({
    id: '../unsafe session',
    title: 'Review session',
    inputHistory: ['one'],
    messages: [{ role: 'user', content: 'hello' }],
  });
  fs.writeFileSync(path.join(rootDir, 'sessions', 'broken.json'), '{bad json', 'utf8');

  assert.equal(saved.id.includes('/'), false);
  assert.equal(store.list().length, 1);
  const loaded = store.load(saved.id);
  assert.equal(loaded.title, 'Review session');
  assert.equal(loaded.messages[0].content, 'hello');
  assert.deepEqual(loaded.inputHistory, ['one']);
});
