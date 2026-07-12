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
  StreamCancelled,
  buildMockBlocks,
  buildMockReply,
  createActionRegistry,
  createProvider,
  createSkillState,
  findCommand,
  getSuggestions,
  handleInputEditorKey,
  listProviders,
  replyRules,
  selectRule,
  streamMockBlocks,
  streamMockReply,
  themes,
  wrapText,
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
  constructor({ columns = 100, rows = 30 } = {}) {
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

function createApp() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terlio-black-box-'));
  const exits = [];
  const app = new RichTerminalApp({
    input: new FakeInput(),
    output: new FakeOutput(),
    onExit: (code) => exits.push(code),
    sessionStore: new SessionStore({ rootDir }),
  });
  return { app, exits, rootDir };
}

function runCommand(app, name, args = []) {
  const command = findCommand(name);
  assert.ok(command, `expected public command ${name}`);
  return command.run(app, args);
}

test('InputEditor behaves like a small multiline editor through its public API', () => {
  const editor = new InputEditor('alpha beta\ngamma');
  assert.deepEqual(editor.getCursorPosition(), { line: 1, column: 5 });

  editor.home();
  assert.equal(editor.cursor, 0);
  assert.equal(editor.backspace(), false);
  editor.moveWord(1);
  assert.equal(editor.cursor, 6);
  editor.moveWord(-1);
  assert.equal(editor.cursor, 0);

  editor.end();
  assert.equal(editor.deleteForward(), false);
  editor.moveVertical(-1);
  assert.deepEqual(editor.getCursorPosition(), { line: 0, column: 5 });
  editor.lineStart();
  assert.equal(editor.cursor, 0);
  editor.lineEnd();
  assert.equal(editor.cursor, 10);
  editor.insertLineBreak();
  editor.insertPaste('one\r\ntwo\tthree\u0000');
  assert.match(editor.value, /one\ntwo  three/);

  editor.killToStart();
  assert.equal(editor.cursor, 0);
  editor.set('one two   three');
  assert.equal(editor.deleteWordBack(), true);
  assert.equal(editor.value, 'one two   ');
  assert.equal(editor.deleteWordBack(), true);
  assert.equal(editor.value, 'one ');
  editor.set('one two');
  editor.cursor = 3;
  assert.equal(editor.killToEnd(), true);
  assert.equal(editor.value, 'one');
  assert.equal(editor.killToEnd(), false);

  editor.set('🙂abc');
  editor.cursor = 1;
  assert.deepEqual(editor.getParts(), { before: '🙂', current: 'a', after: 'bc' });
  editor.clear();
  assert.equal(editor.value, '');
});

test('generic input handling covers navigation, editing and ignored keys as a user sees them', () => {
  const editor = new InputEditor('one two\nthree');
  const keys = [
    { name: 'home', ctrl: false },
    { name: 'end', ctrl: false },
    { name: 'up' },
    { name: 'down' },
    { name: 'left', word: true },
    { name: 'right', meta: true },
    { name: 'delete-word-left' },
    { name: 'kill-start' },
    { name: 'paste', text: 'A\nB' },
    { name: 'backspace' },
    { name: 'delete' },
    { name: 'kill-end' },
  ];
  for (const key of keys) assert.equal(handleInputEditorKey(editor, key, { multiline: true }).handled, true);
  assert.equal(handleInputEditorKey(editor, { name: 'enter' }).handled, false);
  assert.equal(handleInputEditorKey(editor, { name: 'enter', ctrl: true }).handled, true);
  assert.equal(handleInputEditorKey(editor, { name: 'x', printable: true, text: 'x' }).handled, true);
  assert.deepEqual(handleInputEditorKey(null, null), { handled: false, changed: false });
  assert.equal(handleInputEditorKey(editor, { name: 'unknown', printable: false }).handled, false);
});

test('command catalog supports the complete public workflow and validation paths', async () => {
  const { app, exits } = createApp();

  runCommand(app, '/help');
  runCommand(app, '/skills');
  runCommand(app, '/skill', []);
  runCommand(app, '/skill', ['on']);
  runCommand(app, '/skill', ['on', 'missing']);
  runCommand(app, '/skill', ['info', 'terminal']);
  runCommand(app, '/skill', ['off', 'terminal']);
  runCommand(app, '/skill', ['on', 'terminal']);
  assert.equal(app.skillState.get('terminal'), true);

  runCommand(app, '/theme', []);
  runCommand(app, '/theme', ['missing']);
  runCommand(app, '/theme', ['forest']);
  runCommand(app, '/themes');
  assert.equal(app.themeName, 'forest');

  runCommand(app, '/provider', []);
  runCommand(app, '/provider', ['missing']);
  runCommand(app, '/provider', ['replay']);
  assert.equal(app.providerName, 'replay');

  runCommand(app, '/session', []);
  runCommand(app, '/session', ['list']);
  app.addUserMessage('A saved workflow');
  const saved = app.saveSession();
  runCommand(app, '/session', ['list']);
  runCommand(app, '/session', ['open']);
  runCommand(app, '/session', ['open', saved.id]);
  runCommand(app, '/session', ['delete']);
  runCommand(app, '/session', ['delete', saved.id]);
  runCommand(app, '/session', ['unknown']);
  runCommand(app, '/session', ['new']);

  runCommand(app, '/copy-last');
  app.addAssistantMessage('Copy this response');
  runCommand(app, '/copy-last');
  runCommand(app, '/blocks', []);
  runCommand(app, '/blocks', ['test', 'the', 'code']);
  runCommand(app, '/intents');

  runCommand(app, '/debug', ['show']);
  runCommand(app, '/debug', ['on']);
  app.logDebug('custom', 'event');
  runCommand(app, '/debug', ['show']);
  runCommand(app, '/debug', ['off']);
  runCommand(app, '/debug', ['invalid']);

  runCommand(app, '/status');
  app.messages = [];
  runCommand(app, '/history');
  for (let i = 0; i < 12; i += 1) app.addUserMessage(`message ${i} ${'x'.repeat(160)}`);
  runCommand(app, '/history', ['3']);
  runCommand(app, '/clear');
  runCommand(app, '/reset');
  runCommand(app, '/about');

  app.retryLastUserPrompt = async () => 'retry';
  app.runAssistantAction = async (action) => action;
  assert.equal(await runCommand(app, '/retry'), 'retry');
  assert.equal(await runCommand(app, '/regenerate'), 'retry');
  assert.equal(await runCommand(app, '/shorter'), 'shorter');
  assert.equal(await runCommand(app, '/longer'), 'longer');
  assert.equal(await runCommand(app, '/explain'), 'explain');
  assert.equal(await runCommand(app, '/apply'), 'apply');

  runCommand(app, '/exit');
  assert.deepEqual(exits, [0]);
  assert.ok(app.messages.some((message) => /Terlio\.js/.test(message.content)));
});

test('slash suggestions expose useful next arguments without internal knowledge', () => {
  const { app } = createApp();
  app.addUserMessage('saved session');
  app.saveSession();
  const queries = [
    '/', '/sk', '/skill ', '/skill on ', '/skill info ter',
    '/theme ', '/provider ', '/session ', '/session open ', '/debug ', '/history ',
  ];
  for (const query of queries) assert.ok(getSuggestions(query, app).length > 0, query);
  assert.deepEqual(getSuggestions('/definitely-unknown', app), []);
});

test('mock model selects every documented intent and builds matching structured output', () => {
  const promptByIntent = {
    greeting: 'hello there',
    terminal_ux: 'improve terminal keyboard cursor UX',
    implementation: 'implement a dependency-free JavaScript class',
    bug: 'bug crash undefined stack trace',
    explain: 'explain what is this?',
    planning: 'make a roadmap and next steps',
    writing: 'rewrite this message with clearer wording',
    compare: 'compare option A vs option B pros cons',
    ideas: 'brainstorm polished UX feature ideas',
    testing: 'write regression test scenarios',
    security: 'security secret injection risk',
    performance: 'optimize slow streaming render performance',
  };

  const knownIds = new Set(replyRules.map((rule) => rule.id));
  for (const [id, prompt] of Object.entries(promptByIntent)) {
    assert.ok(knownIds.has(id));
    assert.equal(selectRule(prompt).rule.id, id);
    const reply = buildMockReply(prompt, ['terminal', 'code', 'analyst', 'planner']);
    assert.match(reply, /Active skills:/);
    const blocks = buildMockBlocks(prompt, ['terminal', 'code', 'analyst']);
    assert.equal(blocks[0].type, 'text');
    assert.ok(blocks.length >= 1);
  }
  assert.equal(selectRule('unmatched qzxv').rule.id, 'fallback');
  assert.match(buildMockReply('unmatched qzxv', []), /Commands are available/);
  assert.ok(buildMockBlocks('bug crash error', []).some((block) => block.type === 'diff'));
  assert.ok(buildMockBlocks('test regression scenario', []).some((block) => block.type === 'tool_result'));
});

test('public providers support fallback selection, completion, streaming and cancellation', async () => {
  assert.deepEqual(listProviders().map((provider) => provider.name), ['mock', 'replay']);
  assert.equal(createProvider('missing').name, 'mock');

  const mock = createProvider('mock');
  const plain = mock.complete({ messages: [{ role: 'user', content: 'hello' }], enabledSkills: [] });
  const structured = mock.complete({ prompt: 'implement code', enabledSkills: ['code'], structured: true });
  assert.match(plain, /mock AI terminal/i);
  assert.ok(Array.isArray(structured));

  const chunks = [];
  await streamMockReply({ prompt: 'hello', enabledSkills: [], delayScale: 0, onChunk: (chunk) => chunks.push(chunk) });
  assert.ok(chunks.length > 3);

  const streamedBlocks = [];
  const streamedText = [];
  await streamMockBlocks({
    prompt: 'implement code and test it',
    enabledSkills: ['code'],
    delayScale: 0,
    onChunk: (chunk) => streamedText.push(chunk),
    onBlock: (block) => streamedBlocks.push(block),
  });
  assert.ok(streamedText.length > 0);
  assert.ok(streamedBlocks.some((block) => block.type === 'code'));

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    streamMockReply({ prompt: 'hello', enabledSkills: [], delayScale: 0, signal: controller.signal, onChunk() {} }),
    StreamCancelled,
  );

  const replay = createProvider('replay');
  assert.match(replay.complete({ messages: [], enabledSkills: [] }), /Prompt: \(empty\)/);
  assert.match(replay.complete({ messages: [{ role: 'user', content: 'from history' }], enabledSkills: ['terminal'] }), /from history/);
  const replayChunks = [];
  await replay.streamResponse({ prompt: 'ok', enabledSkills: [], onChunk: (chunk) => replayChunks.push(chunk) });
  assert.match(replayChunks.join(''), /Replay provider response/);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(replay.streamResponse({ prompt: 'cancel', enabledSkills: [], signal: aborted.signal, onChunk() {} }), /cancelled/);
});

test('word wrapping preserves paragraphs, indentation, ANSI text and wide characters', () => {
  assert.deepEqual(wrapText('', 20), ['']);
  assert.deepEqual(wrapText('short text', 20), ['short text']);
  const wrapped = wrapText('alpha beta gamma delta', 10, '  ');
  assert.ok(wrapped.length > 1);
  assert.ok(wrapped.slice(1).every((line) => line.startsWith('  ') || line === ''));
  const hard = wrapText('\u001b[31m超長い🙂tokenwithoutspaces\u001b[0m', 8, '> ');
  assert.ok(hard.length > 1);
  assert.ok(hard.every((line) => !line.includes('\u001b[')));
});

test('action registry resolves precedence, scope, disabled actions and execution results', () => {
  const calls = [];
  const registry = createActionRegistry([
    { id: 'global.enter', title: 'Global enter', key: 'enter', scope: 'global', execute: () => calls.push('global') },
    { id: 'local.enter', title: 'Local enter', key: 'enter', scope: 'editor', execute: () => calls.push('local') },
    { id: 'disabled', title: 'Disabled', key: 'd', disabled: true, execute: () => calls.push('disabled') },
  ]);

  assert.equal(registry.findByKey({ name: 'enter' }, {}, { scopes: ['editor', 'global'], localScope: 'editor' })?.id, 'local.enter');
  assert.equal(registry.findByKey({ name: 'enter' }, {}, { scopes: ['global'] })?.id, 'global.enter');
  assert.equal(registry.handleKey({ name: 'd', printable: true, text: 'd' }, {}).type, 'disabled');
  assert.equal(registry.handleKey({ name: 'enter' }, {}, { scopes: ['editor', 'global'], localScope: 'editor' }).type, 'executed');
  assert.deepEqual(calls, ['local']);
  assert.equal(registry.findByKey({ name: 'unknown' }, {}), null);
});
