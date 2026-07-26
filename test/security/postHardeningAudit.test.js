import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  DEFAULT_SECURITY_LIMITS,
  RichTerminalApp,
  SessionStore,
  TerminalInputDecoder,
  Text,
  WorkspaceApp,
  ansi,
  createTerminalPolicy,
  parseKey,
  renderBlockLines,
  renderNode,
  renderToString,
  stripAnsi,
  tokenizeSyntax,
  unsafeRawAnsi,
} from '../../src/lib/index.js';
import { copyWithClipboardPolicy } from '../../src/lib/clipboardBackend.js';
import { parseTerminalControls, isValidatedSgr, sanitizeTerminalText } from '../../src/lib/terminal/controlParser.js';
import {
  createTerminalOutputFrame,
  terminalHyperlink,
  terminalText,
  terminalUnsafeRaw,
} from '../../src/lib/terminal/outputModel.js';
import { normalizeTerminalPolicy } from '../../src/lib/terminal/policy.js';
import { TerminalSessionGuard } from '../../src/lib/terminal/sessionGuard.js';
import { createTerminalSink } from '../../src/lib/terminal/sink.js';

class MemoryOutput {
  constructor() { this.buffer = ''; }
  write(value) { this.buffer += String(value ?? ''); return true; }
}

test('safe mode blocks every control from explicit unsafeRawAnsi, including otherwise valid SGR', () => {
  const raw = `${ansi.red}styled${ansi.reset}`;
  const node = Text(unsafeRawAnsi(raw), { wrap: false });
  const safe = renderToString(node, { width: 40, height: 1 });
  const trusted = renderToString(node, { width: 40, height: 1, terminalPolicy: 'trusted' });

  assert.equal(safe.includes('\u001b'), false);
  assert.match(safe, /␛\[/u);
  assert.equal(trusted.startsWith(raw), true);
});

test('unsafe output cannot impersonate an internal clipboard operation through metadata', () => {
  const output = new MemoryOutput();
  const sink = createTerminalSink({
    output,
    policy: createTerminalPolicy({ clipboard: 'osc52', blockedControlRendering: 'remove' }),
  });
  sink.writeFrame(createTerminalOutputFrame({
    operations: [terminalUnsafeRaw('\u001b[2Jowned', { kind: 'clipboard' })],
  }));

  assert.equal(output.buffer, 'owned');
});

test('complete paste uses pasteBytes rather than the smaller decoder buffer limit', () => {
  const decoder = new TerminalInputDecoder();
  const content = 'x'.repeat(100 * 1024);
  const [event] = decoder.write(`\u001b[200~${content}\u001b[201~`);

  assert.equal(event.name, 'paste');
  assert.equal(event.text.length, content.length);
  assert.equal(event.truncated, undefined);
});

test('rejected chunked paste is discarded through its terminator instead of becoming key input', () => {
  const decoder = new TerminalInputDecoder({ limits: { pasteBytes: 16 } });
  const rejected = decoder.write(`\u001b[200~${'x'.repeat(32)}`);
  assert.equal(rejected[0]?.name, 'rejected');

  assert.deepEqual(decoder.write('rm -rf /'), []);
  const afterTerminator = decoder.write('\u001b[201~\r');
  assert.deepEqual(afterTerminator.map((event) => event.name), ['enter']);
  assert.deepEqual(decoder.write('X').map((event) => event.text).filter(Boolean), ['X']);
});

test('unsupported keyboard modifier values are discarded and parsing recovers', () => {
  for (const sequence of ['\u001b[65;999u', '\u001b[1;999A', '\u001b[27;999;13~']) {
    const decoder = new TerminalInputDecoder();
    const events = decoder.write(`${sequence}X`);
    assert.deepEqual(events.map((event) => event.text).filter(Boolean), ['X']);
    assert.equal(parseKey(sequence).name, 'unknown');
  }
});

test('completed non-paste input is decoded regardless of chunk size while retained tails stay bounded', () => {
  const decoder = new TerminalInputDecoder({ limits: { inputBufferBytes: 16 } });
  const events = decoder.write(`safe-command\r${'x'.repeat(32)}`);

  assert.equal(events.some((event) => event.name === 'enter'), true);
  assert.equal(events.filter((event) => event.text).map((event) => event.text).join('').endsWith('x'.repeat(32)), true);

  const incomplete = decoder.write(`\u001b]0;${'x'.repeat(32)}`);
  assert.equal(incomplete[0]?.name, 'rejected');
  assert.equal(incomplete[0]?.resource, 'inputBufferBytes');
  assert.deepEqual(decoder.write('X').map((event) => event.text).filter(Boolean), ['X']);
});

test('hand-constructed policy objects receive defaults while explicit operational limits remain enforceable', () => {
  const forged = {
    mode: 'safe',
    hyperlinks: 'disabled',
    clipboard: 'native',
    unicodeControls: 'normal',
    blockedControlRendering: 'remove',
    limits: {},
  };
  const normalized = normalizeTerminalPolicy(forged);
  assert.equal(normalized.limits.renderedTextBytes, Infinity);
  assert.equal(normalized.limits.pointerRegions, Infinity);

  const sink = createTerminalSink({
    output: new MemoryOutput(),
    policy: { ...forged, limits: { renderedTextBytes: 8 } },
  });
  assert.throws(
    () => sink.writeFrame(createTerminalOutputFrame({ operations: [terminalText('x'.repeat(9))] })),
    (error) => error?.code === 'TERLIO_LIMIT_EXCEEDED' && error.resource === 'renderedTextBytes',
  );
});

test('deep sessions fail with a structured depth limit instead of RangeError', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terlio-post-audit-'));
  try {
    const store = new SessionStore({ rootDir: root, limits: { sessionDepth: 8 } });
    store.ensure();
    const raw = { version: 1, id: 'deep', messages: [] };
    let cursor = raw;
    for (let index = 0; index < 32; index += 1) {
      cursor.child = {};
      cursor = cursor.child;
    }
    fs.writeFileSync(store.pathFor('deep'), JSON.stringify(raw));

    assert.throws(
      () => store.load('deep'),
      (error) => error?.code === 'TERLIO_LIMIT_EXCEEDED' && error.resource === 'sessionDepth',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cyclic session snapshots fail with a controlled schema error', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terlio-post-audit-cycle-'));
  try {
    const store = new SessionStore({ rootDir: root });
    const skillState = {};
    skillState.self = skillState;
    assert.throws(
      () => store.save({ id: 'cycle', messages: [], skillState }),
      (error) => error?.code === 'TERLIO_INVALID_SESSION' && /not serializable/u.test(error.message),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('session validation treats __proto__, constructor and prototype shapes as ordinary JSON data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terlio-post-audit-keys-'));
  try {
    const store = new SessionStore({ rootDir: root });
    store.save({
      id: 'ordinary-keys',
      messages: [{
        role: 'assistant',
        content: 'metadata',
        meta: { constructor: 'Acme', prototype: 'v2' },
      }],
    });
    const loaded = store.load('ordinary-keys');
    assert.equal(loaded.messages[0].meta.constructor, 'Acme');
    assert.equal(loaded.messages[0].meta.prototype, 'v2');

    fs.writeFileSync(store.pathFor('pollution-shape'), JSON.stringify({
      version: 1,
      id: 'pollution-shape',
      messages: [{
        role: 'assistant',
        meta: JSON.parse('{"__proto__":{"marker":true},"constructor":{"prototype":{"polluted":true}},"prototype":{"version":2}}'),
      }],
    }));
    const shape = store.load('pollution-shape');
    assert.equal(Object.prototype.hasOwnProperty.call(shape.messages[0].meta, '__proto__'), true);
    assert.equal(shape.messages[0].meta.__proto__.marker, true);
    assert.equal(shape.messages[0].meta.constructor.prototype.polluted, true);
    assert.equal(shape.messages[0].meta.prototype.version, 2);
    assert.equal({}.polluted, undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('structured code, diff, command and explicitly security-sensitive tool blocks expose bidi controls visibly', () => {
  const hidden = '\u202e';
  const rendered = [
    ...renderBlockLines({ block: { type: 'code', filename: `safe${hidden}evil.js`, content: `const ${hidden}x = 1;` }, width: 60 }),
    ...renderBlockLines({ block: { type: 'diff', title: `patch${hidden}`, content: `+line${hidden}` }, width: 60 }),
    ...renderBlockLines({ block: { type: 'command', command: `echo ${hidden}hidden`, title: `run${hidden}` }, width: 60 }),
    ...renderBlockLines({ block: { type: 'tool_result', contentKind: 'log', name: `tool${hidden}`, content: `result${hidden}` }, width: 60 }),
  ].map(stripAnsi).join('\n');

  assert.equal(rendered.includes(hidden), false);
  assert.match(rendered, /⟦U\+202E⟧/u);
});

test('tool results default to normal Unicode while security-sensitive kinds still expose bidi controls', () => {
  const emoji = '👨‍💻';
  const normal = stripAnsi(renderBlockLines({
    block: { type: 'tool_result', name: 'tool', content: emoji },
    width: 40,
  }).join('\n'));
  const hidden = '\u202e';
  const secure = stripAnsi(renderBlockLines({
    block: { type: 'tool_result', contentKind: 'security-log', name: 'tool', content: `result${hidden}` },
    width: 40,
  }).join('\n'));

  assert.equal(normal.includes(emoji), true);
  assert.equal(normal.includes('U+200D'), false);
  assert.equal(secure.includes(hidden), false);
  assert.match(secure, /⟦U\+202E⟧/u);
});

test('partial terminal startup can still be restored after the first write throws', () => {
  const writes = [];
  let calls = 0;
  const sink = {
    writeFrame(frame) {
      const value = frame.operations?.map((operation) => operation.value ?? '').join('') ?? '';
      writes.push(value);
      calls += 1;
      if (calls === 1) throw new Error('transient output failure');
      return true;
    },
  };
  const guard = new TerminalSessionGuard({ input: { isTTY: false }, output: null, sink });

  assert.throws(() => guard.start(), /transient output failure/);
  assert.equal(guard.cleanup({ newline: false }), true);
  assert.equal(writes[1], `${ansi.autoWrapOn}${ansi.showCursor}${ansi.normalScreen}${ansi.reset}`);
});

test('cleanup continues restoring terminal modes after one cleanup write fails', () => {
  const writes = [];
  let calls = 0;
  const sink = {
    writeFrame(frame) {
      const value = frame.operations?.map((operation) => operation.value ?? '').join('') ?? '';
      writes.push(value);
      calls += 1;
      if (calls === 3) throw new Error('paste disable failed');
      return true;
    },
  };
  const guard = new TerminalSessionGuard({ input: { isTTY: false }, output: null, sink });
  guard.start();
  guard.setBracketedPaste(true);

  assert.throws(() => guard.cleanup({ newline: false }), /paste disable failed/);
  assert.equal(writes.at(-1), `${ansi.bracketedPasteOff}${ansi.autoWrapOn}${ansi.showCursor}${ansi.normalScreen}${ansi.reset}`);
  assert.equal(guard.cleanup({ newline: false }), false);
});

test('cleanup retries raw-mode restoration after a transient input failure', () => {
  const transitions = [];
  let disableCalls = 0;
  const input = {
    isTTY: true,
    setRawMode(value) {
      transitions.push(Boolean(value));
      if (value === false && disableCalls++ === 0) throw new Error('raw disable failed');
    },
  };
  const guard = new TerminalSessionGuard({ input, output: new MemoryOutput() });
  guard.enableRawMode();

  assert.throws(() => guard.cleanup({ newline: false }), /raw disable failed/);
  assert.deepEqual(transitions, [true, false, false]);
  assert.equal(guard.rawMode, false);
});

test('public runtimes preserve the startup error when cleanup also fails', () => {
  for (const createApp of [
    ({ input, output, sink }) => new WorkspaceApp({ input, output, terminalSink: sink, render: () => Text('ready') }),
    ({ input, output, sink }) => new RichTerminalApp({ input, output, terminalSink: sink }),
  ]) {
    let writes = 0;
    const sink = {
      writeFrame() {
        writes += 1;
        throw new Error(`terminal-write-${writes}`);
      },
    };
    const input = {
      isTTY: true,
      setEncoding() {},
      setRawMode() {},
      resume() {},
      pause() {},
      on() {},
      off() {},
    };
    const output = {
      isTTY: true,
      columns: 80,
      rows: 24,
      on() {},
      off() {},
    };
    const app = createApp({ input, output, sink });
    assert.throws(
      () => app.start(),
      (error) => error?.message === 'terminal-write-1' && error.cleanupError?.message === 'terminal-write-2',
    );
  }
});

test('public runtime stop paths still restore terminal state after an earlier teardown step fails', () => {
  for (const createApp of [
    ({ input, output }) => new WorkspaceApp({ input, output, render: () => Text('ready') }),
    ({ input, output }) => new RichTerminalApp({ input, output }),
  ]) {
    const output = new MemoryOutput();
    Object.assign(output, {
      isTTY: true,
      columns: 80,
      rows: 24,
      on() {},
      off() {},
    });
    const input = {
      isTTY: true,
      setEncoding() {},
      setRawMode() {},
      resume() {},
      pause() {},
      on() {},
      off() { throw new Error('detach failed'); },
    };
    const app = createApp({ input, output });
    app.running = true;
    app.terminalSession.active = true;
    app.terminalSession.alternateScreen = true;
    app.terminalSession.cursorHidden = true;
    app.terminalSession.autowrapDisabled = true;

    assert.throws(() => app.stop(), /detach failed/);
    assert.equal(output.buffer.includes(ansi.normalScreen), true);
    assert.equal(app.running, false);
    assert.equal(app.terminalSession.active, false);
  }
});

test('guarded runtime callbacks preserve frozen original errors when cleanup fails', () => {
  for (const app of [
    new WorkspaceApp({ render: () => Text('ready') }),
    new RichTerminalApp(),
  ]) {
    const original = Object.freeze(new Error('callback failed'));
    app.stop = () => { throw new Error('cleanup failed'); };
    let caught = null;
    try {
      app.runGuarded(() => { throw original; });
    } catch (error) {
      caught = error;
    }
    assert.equal(caught, original);
  }
});

test('rejected asynchronous clipboard backends return structured failures or explicit auto fallback', async () => {
  const backend = { copy: async () => { throw new Error('clipboard unavailable'); } };
  assert.deepEqual(
    await copyWithClipboardPolicy('value', { clipboardPolicy: 'native', clipboardBackend: backend }),
    { copied: false, backend: 'native', reason: 'unavailable' },
  );

  const output = new MemoryOutput();
  const auto = await copyWithClipboardPolicy('value', {
    clipboardPolicy: 'auto',
    clipboardBackend: backend,
    output,
  });
  assert.deepEqual(auto, { copied: true, backend: 'osc52' });
  assert.match(output.buffer, /^\u001b\]52;c;/u);
});

test('OSC 52 output failures return a structured clipboard result', () => {
  const result = copyWithClipboardPolicy('value', {
    clipboardPolicy: 'osc52',
    sink: {
      output: { write() {} },
      writeFrame() { throw new Error('terminal unavailable'); },
    },
  });
  assert.deepEqual(result, { copied: false, backend: 'osc52', reason: 'write-failed' });
});

test('hyperlink label byte limits never split SGR sequences', () => {
  const output = new MemoryOutput();
  const sink = createTerminalSink({
    output,
    policy: createTerminalPolicy({ hyperlinks: 'disabled', limits: { hyperlinkBytes: 10 } }),
  });
  sink.writeFrame(createTerminalOutputFrame({
    operations: [terminalHyperlink('\u001b[38;5;196mhello\u001b[0m', 'https://example.test')],
  }));

  assert.ok(Buffer.byteLength(output.buffer, 'utf8') <= 10);
  for (const token of parseTerminalControls(output.buffer)) {
    if (token.type !== 'control') continue;
    assert.notEqual(token.incomplete, true);
    assert.equal(isValidatedSgr(token.value), true);
  }
});

test('syntax token limits are enforced while tokenization is still in progress', () => {
  assert.throws(
    () => tokenizeSyntax('const a = 1; const b = 2;', {
      language: 'javascript',
      securityLimits: { syntaxTokens: 3 },
    }),
    (error) => error?.code === 'TERLIO_LIMIT_EXCEEDED' && error.resource === 'syntaxTokens' && error.actual === 4,
  );
});

test('large hostile rendering is processed without materializing a control-token array', () => {
  const hostile = '\u001b[2J'.repeat(100000);
  const rendered = sanitizeTerminalText(hostile, { blockedControlRendering: 'remove', allowSgr: false });
  assert.equal(rendered, '');
});

test('sink byte limits apply to hostile source before removed controls can hide its cost', () => {
  const sink = createTerminalSink({
    output: new MemoryOutput(),
    policy: createTerminalPolicy({
      blockedControlRendering: 'remove',
      limits: { renderedTextBytes: 128 },
    }),
  });
  const hostile = '\u001b[2J'.repeat(64);
  assert.throws(
    () => sink.writeFrame(createTerminalOutputFrame({ operations: [terminalText(hostile)] })),
    (error) => error?.code === 'TERLIO_LIMIT_EXCEEDED' && error.resource === 'renderedTextBytes',
  );
});

test('trusted legacy frames cannot bypass source preflight with small compatibility operations', () => {
  const sink = createTerminalSink({
    output: new MemoryOutput(),
    policy: createTerminalPolicy({ mode: 'trusted', limits: { renderedTextBytes: 32 } }),
  });
  const frame = createTerminalOutputFrame({
    operations: [terminalText('small')],
    legacyBytes: 'x'.repeat(64),
  });
  assert.throws(
    () => sink.writeFrame(frame),
    (error) => error?.code === 'TERLIO_LIMIT_EXCEEDED' && error.resource === 'renderedTextBytes',
  );
});

test('render and chat source limits apply before expensive wrapping or highlighting', () => {
  const oversized = 'x'.repeat(1024);
  assert.throws(
    () => renderNode(Text(oversized), 40, { securityLimits: { renderedTextBytes: 128 } }),
    (error) => error?.code === 'TERLIO_LIMIT_EXCEEDED' && error.resource === 'renderedTextBytes',
  );
  assert.throws(
    () => renderBlockLines({
      block: { type: 'code', language: 'javascript', content: oversized },
      width: 40,
      syntaxHighlight: true,
      securityLimits: { renderedTextBytes: 128 },
    }),
    (error) => error?.code === 'TERLIO_LIMIT_EXCEEDED' && error.resource === 'renderedTextBytes',
  );
});

test('fatal handlers preserve the original failure and still report exit when cleanup fails', () => {
  const originalConsoleError = console.error;
  const originalExitCode = process.exitCode;
  const logged = [];
  console.error = (error) => logged.push(error);
  try {
    for (const app of [
      new WorkspaceApp({ render: () => Text('ready') }),
      new RichTerminalApp(),
    ]) {
      const exits = [];
      app.onExit = (code, error) => exits.push([code, error]);
      app.stop = () => { throw new Error('cleanup failed'); };
      const fatal = new Error('fatal failure');

      assert.doesNotThrow(() => app.handleFatal(fatal));
      assert.equal(exits.length, 1);
      assert.equal(exits[0][0], 1);
      assert.equal(exits[0][1], fatal);
      assert.equal(fatal.cleanupError?.message, 'cleanup failed');
    }
  } finally {
    console.error = originalConsoleError;
    process.exitCode = originalExitCode;
  }
  assert.equal(logged.filter((error) => error?.message === 'fatal failure').length, 2);
});
