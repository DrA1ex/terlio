import assert from 'node:assert/strict';
import { RichTerminalApp, Text, WorkspaceApp } from '../../../src/lib/index.js';
import { ansi } from '../../../src/lib/ansi/codes.js';
import { FakeInput, MemoryOutput, securityContractTest } from '../../../scripts/security-testing/contractHelpers.js';

const SEC007 = { audit: 'TERLIO-SEC-007', outcome: 'restore', phase: 'Phase 8' };

function assertRestored({ input, output }) {
  assert.equal(input.rawTransitions.at(-1), false);
  assert.equal(output.buffer.includes(ansi.showCursor), true);
  assert.equal(output.buffer.includes(ansi.autoWrapOn), true);
  assert.equal(output.buffer.includes(ansi.normalScreen), true);
  assert.equal(output.buffer.includes(ansi.reset), true);
}


securityContractTest(SEC007, 'RichTerminalApp restores bracketed paste and terminal state after startup render failure', () => {
  const input = new FakeInput();
  const output = new MemoryOutput();
  const app = new RichTerminalApp({ input, output });
  app.renderer.renderNode = () => { throw new Error('chat render failed'); };
  assert.throws(() => app.start(), /chat render failed/);
  assertRestored({ input, output });
  assert.equal(output.buffer.includes(ansi.bracketedPasteOn), true);
  assert.equal(output.buffer.includes(ansi.bracketedPasteOff), true);
  assert.equal(app.running, false);
});

securityContractTest(SEC007, 'render callback failure restores terminal state before rethrowing', () => {
  const input = new FakeInput();
  const output = new MemoryOutput();
  const app = new WorkspaceApp({ input, output, render() { throw new Error('render failed'); } });
  let thrown = null;
  let restoredBeforeManualCleanup = false;
  try {
    app.start();
  } catch (error) {
    thrown = error;
    restoredBeforeManualCleanup = input.rawTransitions.at(-1) === false
      && output.buffer.includes(ansi.showCursor)
      && output.buffer.includes(ansi.normalScreen);
  } finally {
    app.stop();
  }
  assert.match(thrown?.message ?? '', /render failed/);
  assert.equal(restoredBeforeManualCleanup, true);
  assert.equal(app.running, false);
});

securityContractTest(SEC007, 'key callback failure restores terminal state before rethrowing', () => {
  const input = new FakeInput();
  const output = new MemoryOutput();
  const app = new WorkspaceApp({
    input,
    output,
    render: () => Text('ready', { wrap: false }),
    onKey() { throw new Error('key failed'); },
  });
  app.start();
  let thrown = null;
  let restoredBeforeManualCleanup = false;
  try {
    app.handleData('x');
  } catch (error) {
    thrown = error;
    restoredBeforeManualCleanup = input.rawTransitions.at(-1) === false
      && output.buffer.includes(ansi.showCursor)
      && output.buffer.includes(ansi.normalScreen);
  } finally {
    app.stop();
  }
  assert.match(thrown?.message ?? '', /key failed/);
  assert.equal(restoredBeforeManualCleanup, true);
  assert.equal(app.running, false);
});

securityContractTest(SEC007, 'pointer callback failure restores mouse and terminal modes', () => {
  const input = new FakeInput();
  const output = new MemoryOutput();
  const app = new WorkspaceApp({
    input,
    output,
    pointer: true,
    render: () => Text('ready', { wrap: false }),
    onPointer() { throw new Error('pointer failed'); },
  });
  app.start();
  let thrown = null;
  let restoredBeforeManualCleanup = false;
  try {
    app.handleData('\u001b[<0;1;1M');
  } catch (error) {
    thrown = error;
    restoredBeforeManualCleanup = input.rawTransitions.at(-1) === false
      && output.buffer.includes(ansi.mouseSgrOff)
      && output.buffer.includes(ansi.normalScreen);
  } finally {
    app.stop();
  }
  assert.match(thrown?.message ?? '', /pointer failed/);
  assert.equal(restoredBeforeManualCleanup, true);
});

securityContractTest(SEC007, 'tick callback failure is routed through cleanup instead of escaping an interval', () => {
  const input = new FakeInput();
  const output = new MemoryOutput();
  const app = new WorkspaceApp({
    input,
    output,
    tickMs: 100000,
    render: () => Text('ready', { wrap: false }),
    tick() { throw new Error('tick failed'); },
  });
  app.start();
  let thrown = null;
  let restoredBeforeManualCleanup = false;
  try {
    app.timer?._onTimeout?.();
  } catch (error) {
    thrown = error;
    restoredBeforeManualCleanup = input.rawTransitions.at(-1) === false
      && output.buffer.includes(ansi.showCursor)
      && output.buffer.includes(ansi.normalScreen);
  } finally {
    app.stop();
  }
  assert.match(thrown?.message ?? '', /tick failed/);
  assert.equal(restoredBeforeManualCleanup, true);
});

securityContractTest(SEC007, 'cleanup remains idempotent after a failure path', () => {
  const input = new FakeInput();
  const output = new MemoryOutput();
  const app = new WorkspaceApp({ input, output, render: () => Text('ready', { wrap: false }) });
  app.start();
  app.stop();
  const once = output.buffer;
  app.stop();
  assert.equal(output.buffer, once);
});

securityContractTest({ ...SEC007, outcome: 'explicit' }, 'embedded runtimes do not install process-global handlers unless configured', () => {
  const input = new FakeInput();
  const output = new MemoryOutput();
  const beforeUncaught = process.listenerCount('uncaughtException');
  const beforeRejection = process.listenerCount('unhandledRejection');
  const app = new WorkspaceApp({
    input,
    output,
    processHandlers: 'none',
    render: () => Text('ready', { wrap: false }),
  });
  app.start();
  try {
    assert.equal(process.listenerCount('uncaughtException'), beforeUncaught);
    assert.equal(process.listenerCount('unhandledRejection'), beforeRejection);
  } finally {
    app.stop();
  }
});

securityContractTest({ ...SEC007, outcome: 'configured' }, 'signal-only process handler mode avoids global exception interception', () => {
  const input = new FakeInput();
  const output = new MemoryOutput();
  const beforeUncaught = process.listenerCount('uncaughtException');
  const beforeRejection = process.listenerCount('unhandledRejection');
  const app = new WorkspaceApp({
    input,
    output,
    processHandlers: 'signals',
    render: () => Text('ready', { wrap: false }),
  });
  app.start();
  try {
    assert.equal(process.listenerCount('uncaughtException'), beforeUncaught);
    assert.equal(process.listenerCount('unhandledRejection'), beforeRejection);
  } finally {
    app.stop();
  }
});
