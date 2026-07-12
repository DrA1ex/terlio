import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  RichTerminalApp,
  SessionStore,
  StreamCancelled,
  createBlock,
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
  write(chunk) { this.buffer += String(chunk ?? ''); return true; }
}

function makeApp({ start = false } = {}) {
  const input = new FakeInput();
  const output = new FakeOutput();
  const exits = [];
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terlio-app-flow-'));
  const app = new RichTerminalApp({
    input,
    output,
    onExit: (code) => exits.push(code),
    sessionStore: new SessionStore({ rootDir }),
  });
  if (start) app.start();
  return { app, input, output, exits };
}

test('chat input routing supports editing, suggestions, history, scrolling and palette ownership', async () => {
  const { app, exits } = makeApp();

  app.onData('abc');
  assert.equal(app.inputValue, 'abc');
  app.onData('\x1b[D');
  app.onData('\x1b[C');
  app.onData('\x1bb');
  app.onData('\x1bf');
  app.onData('\x1b[H');
  app.onData('\x1b[F');
  app.onData('\x1b[1;9D');
  assert.equal(app.cursor, 0);
  app.onData('\x1b[1;9C');
  assert.equal(app.cursor, 3);
  app.onData('\x7f');
  app.onData('\x1b[3~');
  app.onData('\x01');
  app.onData('\x05');
  app.onData('\x0b');
  app.onData('\x15');
  app.onData('\x1b[200~one\ntwo\tthree\x1b[201~');
  assert.equal(app.inputValue, 'one\ntwo  three');
  app.onData('\n');
  assert.match(app.inputValue, /\n/);
  app.onData('\x17');

  app.history = ['first', 'second'];
  app.editor.clear();
  app.onData('\x1b[A');
  assert.equal(app.inputValue, 'second');
  app.onData('\x1b[A');
  assert.equal(app.inputValue, 'first');
  app.onData('\x1b[B');
  assert.equal(app.inputValue, 'second');
  app.onData('\x1b[B');
  assert.equal(app.inputValue, '');

  app.editor.set('/th');
  app.onData('\t');
  assert.match(app.inputValue, /^\/theme/);
  app.editor.set('/');
  app.onData('\x1b[A');
  app.onData('\x1b[B');
  app.onData('\x1b[Z');
  assert.equal(app.isSuggestionMode(), true);
  app.onData('\x1b');
  assert.equal(app.suggestionsDismissed, true);

  app.scrollOffset = 5;
  app.onData('\x1b');
  assert.equal(app.scrollOffset, 0);
  app.onData('\x1b[5~');
  assert.ok(app.scrollOffset > 0);
  app.onData('\x1b[6~');
  app.onData('\x0c');
  assert.equal(app.scrollOffset, 0);

  app.onData('\x10');
  assert.equal(app.modes.current(), 'palette');
  app.onData('theme');
  app.onData('\r');
  assert.equal(app.modes.current(), 'input');
  assert.match(app.inputValue, /^\/theme/);
  app.onData('\x10');
  app.onData('\x1b');
  assert.equal(app.modes.current(), 'input');

  app.busy = true;
  app.abortController = new AbortController();
  app.onData('\x1b');
  assert.equal(app.abortController.signal.aborted, true);
  app.busy = false;
  app.abortController = null;

  app.onData('\x04');
  assert.deepEqual(exits, [0]);
});

test('chat submit workflow handles commands, successful structured streams, failures and cancellation', async () => {
  const { app } = makeApp();

  app.editor.set('/missing');
  await app.submitInput();
  assert.match(app.status, /Unknown command/);
  assert.equal(app.overlays.toasts.at(-1).level, 'error');

  app.editor.set('/theme synth');
  await app.submitInput();
  assert.equal(app.themeName, 'synth');

  app.provider = {
    name: 'instant',
    title: 'Instant Provider',
    async streamResponse({ onChunk, onBlock }) {
      onChunk('hello ');
      onBlock(createBlock({ type: 'command', command: 'npm test' }));
      onChunk('world');
    },
  };
  app.providerName = 'instant';
  app.editor.set('Run a structured response');
  await app.submitInput();
  assert.equal(app.messages.at(-1).status, 'complete');
  assert.match(app.messages.at(-1).content, /npm test/);
  assert.equal(app.busy, false);

  app.provider = {
    name: 'cancel',
    title: 'Cancel Provider',
    async streamResponse() { throw new StreamCancelled(); },
  };
  await app.respond('cancel me');
  assert.equal(app.messages.at(-1).status, 'cancelled');
  assert.match(app.messages.at(-1).content, /response cancelled/);

  app.provider = {
    name: 'broken',
    title: 'Broken Provider',
    async streamResponse() { throw new Error('network down'); },
  };
  await app.respond('fail me');
  assert.equal(app.messages.at(-1).status, 'error');
  assert.match(app.messages.at(-1).content, /network down/);

  app.executeCommand = async () => { throw new Error('not used'); };
  app.busy = true;
  app.editor.set('ignored while busy');
  await app.submitInput();
  assert.equal(app.editor.value, 'ignored while busy');
});

test('assistant retry and response actions provide user-facing empty, success, cancel and error states', async () => {
  const { app } = makeApp();

  await app.retryLastUserPrompt();
  assert.equal(app.status, 'Nothing to retry.');
  await app.runAssistantAction('shorter');
  assert.equal(app.status, 'No assistant response is available.');

  app.addUserMessage('retry this');
  const prompts = [];
  app.respond = async (prompt) => prompts.push(prompt);
  await app.retryLastUserPrompt();
  assert.deepEqual(prompts, ['retry this']);

  app.addAssistantMessage('A long assistant response with details.');
  app.streamPlainText = async (text, message) => { message.content += text; };
  await app.runAssistantAction('shorter');
  assert.equal(app.messages.at(-1).status, 'complete');

  app.addAssistantMessage('Cancel target');
  app.streamPlainText = async () => { throw new StreamCancelled(); };
  await app.runAssistantAction('longer');
  assert.equal(app.messages.at(-1).status, 'cancelled');
  assert.match(app.messages.at(-1).content, /action cancelled/);

  app.addAssistantMessage('Error target');
  app.streamPlainText = async () => { throw 'bad transform'; };
  await app.runAssistantAction('explain');
  assert.equal(app.messages.at(-1).status, 'error');
  assert.match(app.messages.at(-1).content, /bad transform/);
});

test('chat public state helpers keep history, suggestions, debug log and snapshots bounded', () => {
  const { app } = makeApp();

  app.setTheme('missing');
  assert.equal(app.themeName, 'ocean');
  app.setProvider('missing');
  assert.equal(app.providerName, 'mock');

  app.pushHistory('same');
  app.pushHistory('same');
  for (let i = 0; i < 260; i += 1) app.pushHistory(`item-${i}`);
  assert.equal(app.history.length, 250);

  app.historyIndex = null;
  app.historyUp();
  assert.match(app.inputValue, /item-259/);
  app.historyDown();
  assert.equal(app.inputValue, '');

  app.editor.clear();
  app.handleSuggestionTab(1);
  assert.equal(app.inputValue, '/');
  app.editor.set('/theme oce');
  assert.equal(app.shouldAcceptSuggestionBeforeSubmit(), true);
  assert.equal(app.acceptCurrentSuggestion(), true);
  assert.equal(app.inputValue, '/theme ocean');
  app.suggestionsDismissed = true;
  assert.equal(app.getCurrentSuggestions().length, 0);
  app.suggestionsDismissed = false;
  app.busy = true;
  assert.equal(app.moveSuggestion(1), false);
  app.busy = false;

  app.toggleDebug(true);
  for (let i = 0; i < 90; i += 1) app.logDebug('event', i);
  assert.equal(app.debug.events.length, 80);
  app.toggleDebug(false);
  const count = app.debug.events.length;
  app.logDebug('key', 'hidden');
  assert.equal(app.debug.events.length, count);

  app.addUserMessage('Snapshot title');
  const snapshot = app.snapshot();
  assert.equal(snapshot.title, 'Snapshot title');
  assert.equal(snapshot.providerName, app.providerName);
});

test('real TTY lifecycle renders, reacts to resize and preserves reading position while content grows', () => {
  const { app, output } = makeApp({ start: true });
  try {
    app.addUserMessage('first');
    app.addAssistantMessage('line\n'.repeat(20));
    app.scrollOffset = 2;
    app.render();
    const before = app.scrollOffset;
    app.messages.at(-1).content += '\nmore\nmore';
    app.render();
    assert.ok(app.scrollOffset >= before);
    output.columns = 72;
    output.rows = 22;
    output.emit('resize');
    assert.ok(output.buffer.length > 0);
  } finally {
    app.stop();
  }
});
