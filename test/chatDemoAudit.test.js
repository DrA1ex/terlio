import test from 'node:test';
import assert from 'node:assert/strict';
import { appendMessageChunk, createMessage, InputEditor, stripAnsi } from '../src/lib/index.js';
import { RichTerminalApp } from '../src/lib/app.js';
import { packageDisplayName } from '../src/lib/packageMetadata.js';

function fakeOutput(columns = 100, rows = 30) {
  return {
    columns,
    rows,
    isTTY: true,
    writes: [],
    write(chunk) { this.writes.push(String(chunk)); },
    on() {},
    off() {},
  };
}

function fakeInput() {
  return {
    isTTY: true,
    on() {},
    off() {},
    setEncoding() {},
    setRawMode() {},
    resume() {},
    pause() {},
  };
}

test('chat composer supports Ctrl+J multiline input and bracketed paste without executing shortcuts', () => {
  const app = new RichTerminalApp({ input: fakeInput(), output: fakeOutput() });
  app.onData('first');
  app.onData('\n');
  app.onData('second');
  assert.equal(app.editor.value, 'first\nsecond');

  app.editor.clear();
  app.onData('\x1b[200~alpha\nbeta /help\x1b[201~');
  assert.equal(app.editor.value, 'alpha\nbeta /help');
  assert.equal(app.messages.length, 0);
});

test('chat slash completion accepts with Tab and Esc clears only command input', () => {
  const app = new RichTerminalApp({ input: fakeInput(), output: fakeOutput() });
  app.onData('/');
  assert.equal(app.isSuggestionMode(), true);
  assert.ok(app.getCurrentSuggestions().length > 1);

  app.onData('\t');
  assert.equal(app.editor.value, '/help');

  app.onData('\x1b');
  assert.equal(app.editor.value, '');
  assert.equal(app.isSuggestionMode(), false);

  app.onData('ordinary text');
  app.onData('\x1b');
  assert.equal(app.editor.value, 'ordinary text');
});

test('chat renders an exact compact fallback instead of drawing beyond a small terminal', () => {
  const output = fakeOutput(40, 12);
  const app = new RichTerminalApp({ input: fakeInput(), output });
  app.running = true;
  app.render();
  const frame = stripAnsi(app.renderer.previousFrame.toString());
  assert.equal(app.renderer.previousFrame.width, 40);
  assert.equal(app.renderer.previousFrame.height, 12);
  assert.match(frame, /needs a/);
  assert.match(frame, /slightly larger terminal/i);
});

test('chat preserves transcript reading position while streamed content grows', () => {
  const output = fakeOutput(80, 24);
  const app = new RichTerminalApp({ input: fakeInput(), output });
  app.running = true;
  app.messages = Array.from({ length: 12 }, (_, index) => createMessage({ role: 'assistant', content: `message ${index}\nline two` }));
  app.render();
  app.scrollOffset = 4;
  const before = app.scrollOffset;
  const last = app.messages.at(-1);
  appendMessageChunk(last, '\nnew streamed line');
  app.render();
  assert.ok(app.scrollOffset > before);
});

test('chat derives the session title from the first user message', () => {
  const app = new RichTerminalApp({ input: fakeInput(), output: fakeOutput() });
  app.addUserMessage('  Review the parser implementation and edge cases  ');
  assert.equal(app.sessionTitle, 'Review the parser implementation and edge cases');
});

test('InputEditor insertPaste preserves line breaks and normalizes tabs', () => {
  const editor = new InputEditor();
  editor.insertPaste('one\r\ntwo\tthree');
  assert.equal(editor.value, 'one\ntwo  three');
});

test('compact chat header preserves the session title and empty state starts at the top', () => {
  const output = fakeOutput(64, 20);
  const app = new RichTerminalApp({ input: fakeInput(), output });
  app.running = true;
  app.sessionTitle = 'Renderer resize review';
  app.render();
  const frame = stripAnsi(app.renderer.previousFrame.toString());
  assert.match(frame, /Renderer resize review/);
  assert.match(frame, new RegExp(`Welcome to ${packageDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(frame, /Type a message and press Enter/);
});

test('chat uses a clean fallback before structured content becomes unreadable', () => {
  const output = fakeOutput(48, 16);
  const app = new RichTerminalApp({ input: fakeInput(), output });
  app.running = true;
  app.render();
  const frame = stripAnsi(app.renderer.previousFrame.toString());
  assert.match(frame, /minimum 56×18/);
  assert.doesNotMatch(frame, /COMPOSER/);
});

test('chat command feedback uses transient overlays instead of polluting the transcript', async () => {
  const app = new RichTerminalApp({ input: fakeInput(), output: fakeOutput() });
  await app.executeCommand('/debug on');
  assert.equal(app.debug.enabled, true);
  assert.equal(app.messages.length, 0);
  assert.match(app.overlays.toasts.at(-1)?.message ?? '', /Debug overlay enabled/);

  await app.executeCommand('/does-not-exist');
  assert.equal(app.messages.length, 0);
  assert.equal(app.overlays.toasts.at(-1)?.level, 'error');
});

test('chat frames stay exact across supported responsive sizes', () => {
  for (const [columns, rows] of [[56, 18], [64, 20], [80, 24], [100, 30], [136, 39], [160, 40]]) {
    const app = new RichTerminalApp({ input: fakeInput(), output: fakeOutput(columns, rows) });
    app.running = true;
    app.render();
    assert.equal(app.renderer.previousFrame.width, columns);
    assert.equal(app.renderer.previousFrame.height, rows);
    assert.equal(app.renderer.previousFrame.toLines().length, rows);
  }
});
