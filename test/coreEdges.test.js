import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FocusManager,
  ModeManager,
  RichTerminalApp,
  SessionStore,
  StreamCancelled,
  Text,
  appendBlockContent,
  appendMessageBlock,
  appendMessageChunk,
  applySerializedSkillState,
  blockToText,
  blocksToText,
  completeMessage,
  createBlock,
  createCommandPaletteState,
  createCommandRegistry,
  createMessage,
  createSkillState,
  createWorkspaceApp,
  ensureTextBlock,
  getCommandPaletteMatches,
  getPaletteQuery,
  handleCommandPaletteKey,
  lastAssistantMessage,
  lastUserMessage,
  normalizeBlock,
  normalizeBlocks,
  normalizeCommandEntry,
  normalizeMessages,
  parseKey,
  renderCommandPalette,
  renderToString,
  serializeSkillState,
  setMessageBlocks,
  trimMessages,
  visibleConversationMessages,
} from '../src/lib/index.js';

class FakeInput extends EventEmitter {
  constructor({ tty = true } = {}) { super(); this.isTTY = tty; this.rawMode = false; this.paused = true; }
  setEncoding() {}
  setRawMode(value) { this.rawMode = Boolean(value); }
  resume() { this.paused = false; }
  pause() { this.paused = true; }
}
class FakeOutput extends EventEmitter {
  constructor({ tty = true, columns = 80, rows = 24 } = {}) { super(); this.isTTY = tty; this.columns = columns; this.rows = rows; this.buffer = ''; }
  write(value) { this.buffer += String(value ?? ''); return true; }
}

function tempStore() {
  return new SessionStore({ rootDir: fs.mkdtempSync(path.join(os.tmpdir(), 'terlio-core-edge-')) });
}

test('key parser normalizes terminal variants, modifiers, buffers and unknown input', () => {
  const cases = [
    [Buffer.from('x'), 'x'],
    ['\x1b[Z', 'tab'],
    ['\x1b[1;2A', 'up'],
    ['\x1b[1;3D', 'left'],
    ['\x1b[1;5C', 'right'],
    ['\x1b[1;9H', 'home'],
    ['\x1b[112;5u', 'command-palette'],
    ['\x1b[97;2u', 'a'],
    ['\x1b[9731;2u', '☃'],
    ['\x1b[27;6;13~', 'enter'],
    ['\x1b[200~a\nb\x1b[201~', 'paste'],
    ['\x00', 'unknown'],
  ];
  for (const [sequence, name] of cases) assert.equal(parseKey(sequence).name, name);
  assert.equal(parseKey('\x1b[1;3D').word, true);
  assert.equal(parseKey('\x1b[1;2A').shift, true);
  assert.equal(parseKey('\x1b[1;5C').ctrl, true);
  assert.equal(parseKey('\x1b[1;9H').cmd, true);
  assert.equal(parseKey('\x1b[97;2u').printable, true);
  assert.equal(parseKey('\x1b[97;5u').printable, false);
});

test('structured block and message APIs preserve every public block type and malformed input fallback', () => {
  const raw = [
    'plain',
    null,
    { type: 'unknown', content: 42, meta: null },
    { type: 'code', language: 'js', content: 'const x = 1;' },
    { type: 'diff', content: '- old\n+ new' },
    { type: 'command', title: 'Run', command: 'npm test' },
    { type: 'warning', content: 'Careful' },
    { type: 'tool_result', name: 'tests', status: 'ok', content: 'passed' },
  ];
  const blocks = normalizeBlocks(raw);
  assert.equal(blocks.length, raw.length);
  assert.equal(normalizeBlocks('bad').length, 0);
  assert.equal(normalizeBlock(null).type, 'text');
  assert.match(blockToText(blocks[3]), /```js/);
  assert.match(blockToText(blocks[4]), /\+ new/);
  assert.match(blockToText(blocks[5]), /\$ npm test/);
  assert.match(blockToText(blocks[6]), /Warning:/);
  assert.match(blockToText(blocks[7]), /tests · ok/);
  assert.equal(blocksToText(null), '');

  const message = createMessage({ role: 'assistant', blocks });
  appendBlockContent(blocks[0], ' more');
  appendMessageChunk(message, ' streamed');
  appendMessageBlock(message, createBlock({ type: 'warning', content: 'new warning' }));
  setMessageBlocks(message, [createBlock({ type: 'text', content: 'reset' })]);
  completeMessage(message, 'cancelled');
  assert.equal(message.status, 'cancelled');
  assert.equal(ensureTextBlock(message).type, 'text');

  const plain = createMessage({ id: 'm_00999', role: 'user', content: 'hello' });
  appendMessageChunk(plain, ' world');
  assert.equal(plain.content, 'hello world');
  assert.equal(trimMessages([plain], 1).length, 1);
  assert.equal(trimMessages([plain, message], 1)[0], message);
  assert.deepEqual(normalizeMessages('invalid'), []);
  const normalized = normalizeMessages([null, { content: 7 }, { role: 'user', content: 'ok', meta: null }]);
  assert.equal(normalized.length, 2);
  assert.equal(visibleConversationMessages([...normalized, createMessage({ role: 'system' })]).length, 1);
  assert.equal(lastUserMessage(normalized)?.content, 'ok');
  assert.equal(lastAssistantMessage(normalized), null);
});

test('command palette exposes empty, disabled, grouped and query-driven behavior', () => {
  const state = createCommandPaletteState({
    items: [
      'plain',
      { name: 'deploy', title: 'Deploy staging', detail: 'Ship build', group: 'Release', aliases: ['ship'], key: 'd' },
      { id: 'prod', title: 'Deploy production', description: 'Blocked', category: 'Release', disabled: true, keys: ['p'] },
    ],
    query: '',
    selectedIndex: 99,
    windowSize: 0,
  });
  assert.equal(getPaletteQuery(state), '');
  assert.equal(getCommandPaletteMatches(state).length, 3);
  handleCommandPaletteKey(state, { printable: true, name: 's', text: 'ship' });
  assert.equal(getCommandPaletteMatches(state)[0].id, 'deploy');
  assert.equal(handleCommandPaletteKey(state, { name: 'home' }).type, 'move');
  assert.equal(handleCommandPaletteKey(state, { name: 'end' }).type, 'move');
  assert.equal(handleCommandPaletteKey(state, { name: 'enter' }).type, 'accept');
  state.editor.set('prod');
  state.selectedIndex = 0;
  assert.equal(handleCommandPaletteKey(state, { name: 'enter' }).type, 'disabled');
  state.editor.set('none');
  assert.equal(handleCommandPaletteKey(state, { name: 'enter' }).type, 'noop');
  assert.equal(handleCommandPaletteKey(state, { name: 'escape' }).type, 'clear');
  assert.equal(handleCommandPaletteKey(state, { name: 'escape' }).type, 'cancel');
  assert.equal(handleCommandPaletteKey(state, { name: 'unknown' }).type, 'noop');
  const output = renderToString(renderCommandPalette(state, { showHelp: false, inline: false }), { width: 72, height: 16 });
  assert.match(output, /Command Palette/);
  assert.equal(getPaletteQuery({ query: 123 }), '123');
});

test('command registry normalizes user commands and handles aliases, suggestions and execution results', async () => {
  const registry = createCommandRegistry([
    { name: 'one', run: () => 1 },
    { name: 'two', title: 'Two', run: async () => 2, aliases: ['second'], category: 'Tools', examples: ['/two now'] },
  ]);
  assert.equal(registry.find('one').name, 'one');
  assert.equal(registry.find('second').name, 'two');
  assert.equal(registry.find('missing'), null);
  assert.equal(await registry.execute('/two', {}), 2);
  const notCommand = registry.execute('plain text', {});
  assert.equal(notCommand.ok, false);
  assert.equal(notCommand.reason, 'not-command');
  assert.equal(notCommand.parsed.text, 'plain text');
  assert.equal(registry.execute('/missing', {}).reason, 'unknown');
  assert.equal(registry.suggestions('').length, 2);
  assert.equal(registry.suggestions('tool')[0].entry.name, 'two');
  const normalized = normalizeCommandEntry({ name: '/simple command', aliases: ['/s'], meta: null });
  assert.equal(normalized.name, 'simple');
  assert.deepEqual(normalized.aliases, ['s']);
  assert.deepEqual(normalized.run(), { ok: true, action: 'simple' });
});

test('focus and mode managers handle disabled targets, wrapping, replacement and validation', () => {
  const focus = new FocusManager(['a', 'b', 'c']);
  focus.disable('b');
  assert.equal(focus.current(), 'a');
  assert.equal(focus.focus('b'), 'a');
  assert.equal(focus.next(), 'c');
  assert.equal(focus.next(), 'a');
  assert.equal(focus.previous(), 'c');
  focus.disable('a').disable('c');
  assert.equal(focus.next(), 'c');
  focus.enable('b');
  assert.equal(focus.focus('b'), 'b');
  assert.throws(() => focus.focus('missing'), /Unknown focus target/);
  assert.throws(() => focus.enable('missing'), /Unknown focus target/);

  const modes = new ModeManager('root');
  assert.equal(modes.pop(), 'root');
  assert.equal(modes.push('modal', null), 'modal');
  assert.equal(modes.replace('help', { source: 'keyboard' }), 'help');
  assert.deepEqual(modes.currentEntry().data, { source: 'keyboard' });
  assert.equal(modes.pop(), 'help');
  assert.equal(modes.reset(), 'root');
  assert.deepEqual(modes.toJSON(), [{ name: 'root', data: {} }]);
  assert.throws(() => modes.push('  '), /cannot be empty/);
});

test('session store handles inferred titles, missing files, sanitization and serialized skill state', () => {
  const store = tempStore();
  const saved = store.save({ messages: [{ role: 'user', content: '  A   useful title  ' }] });
  assert.equal(saved.title, 'A useful title');
  assert.throws(() => store.load('missing'), /Session not found/);
  store.remove('missing');

  const file = store.pathFor('fallbacks');
  store.ensure();
  fs.writeFileSync(file, JSON.stringify({ id: '', title: '', messages: 'bad', inputHistory: [1, 'ok'], skillState: null }), 'utf8');
  const loaded = store.load('fallbacks');
  assert.equal(loaded.title, 'Untitled session');
  assert.deepEqual(loaded.inputHistory, ['ok']);
  assert.deepEqual(loaded.messages, []);

  const state = createSkillState();
  applySerializedSkillState(state, { terminal: 0, missing: true });
  assert.equal(state.get('terminal'), false);
  assert.equal(Object.hasOwn(serializeSkillState(state), 'terminal'), true);
});

test('WorkspaceApp covers public validation, unchanged frames, actions, overlays, resize and tick lifecycle', async () => {
  const nonTtyInput = new FakeInput({ tty: false });
  const output = new FakeOutput();
  assert.throws(() => createWorkspaceApp({ input: nonTtyInput, output, render: () => Text('x') }).start(), /interactive TTY/);
  assert.throws(() => createWorkspaceApp({}), /render function/);

  const input = new FakeInput();
  const exits = [];
  const state = { count: 0 };
  const app = createWorkspaceApp({
    input,
    output,
    state,
    actions: [{ id: 'inc', key: 'i', scope: 'global', execute: ({ state: current }) => { current.count += 1; } }],
    tick: ({ state: current }) => { current.count += 1; return current.count < 2; },
    tickMs: 5,
    onKey: ({ key }) => { if (key.printable) state.last = key.text; },
    onExit: (code, error) => exits.push([code, error?.message]),
    render: ({ state: current }) => Text(`count:${current.count}`),
  });
  app.start();
  assert.equal(app.render(), false);
  input.emit('data', 'i');
  assert.ok(state.count >= 1);
  input.emit('data', 'x');
  assert.equal(state.last, 'x');
  app.overlays.modal({ children: ['blocking'] });
  input.emit('data', 'z');
  assert.notEqual(state.last, 'z');
  input.emit('data', '\x1b');
  output.columns = 90;
  output.rows = 28;
  output.emit('resize');
  await new Promise((resolve) => setTimeout(resolve, 15));
  const originalError = console.error;
  console.error = () => {};
  try {
    app.handleFatal(new Error('boom'));
    assert.deepEqual(exits.at(-1), [1, 'boom']);
  } finally {
    console.error = originalError;
    process.exitCode = undefined;
  }
});

test('assistant public actions stream actual text and recognize apply, unknown, abort and generic errors', async () => {
  const app = new RichTerminalApp({ input: new FakeInput(), output: new FakeOutput(), sessionStore: tempStore() });
  app.addAssistantMessage('This is a complete sentence. Extra detail follows.');
  await app.runAssistantAction('apply');
  assert.match(app.messages.at(-1).content, /Automatic artifact application/);
  app.addAssistantMessage('Unchanged source');
  await app.runAssistantAction('unknown');
  assert.match(app.messages.at(-1).content, /Unchanged source/);

  const message = app.addAssistantMessage('', true);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(app.streamPlainText('text', message, controller.signal), StreamCancelled);

  app.provider = { title: 'String error', async streamResponse() { throw null; } };
  await app.respond('error');
  assert.match(app.messages.at(-1).content, /Unknown error/);
});
