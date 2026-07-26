import assert from 'node:assert/strict';
import {
  SelectableText,
  copyTextToClipboard,
  createTextSelectionState,
  dispatchPointerEvent,
  osc52ClipboardSequence,
  renderToFrame,
} from '../../../src/lib/index.js';
import { createLegacyNativeClipboardBackend } from '../../../src/lib/clipboardBackend.js';
import { MemoryOutput, securityContractTest } from '../../../scripts/security-testing/contractHelpers.js';

const SEC005 = { audit: 'TERLIO-SEC-005', outcome: 'reject', phase: 'Phase 6' };
const SEC008 = { audit: 'TERLIO-SEC-008', outcome: 'allow', phase: 'Phase 6' };


securityContractTest({ ...SEC005, outcome: 'safe-default' }, 'default clipboard behavior uses native copy without implicit OSC 52 fallback', () => {
  const output = new MemoryOutput();
  const result = copyTextToClipboard('text', {
    output,
    platform: 'linux',
    env: {},
    spawnSync() { return { status: 1 }; },
  });
  assert.deepEqual(result, { copied: false, backend: 'native', reason: 'unavailable' });
  assert.equal(output.buffer, '');
});

securityContractTest({ ...SEC005, outcome: 'disable' }, 'disabled clipboard policy never invokes native tools or OSC 52', () => {
  const output = new MemoryOutput();
  let spawned = 0;
  const result = copyTextToClipboard('secret', {
    output,
    clipboardPolicy: 'disabled',
    spawnSync() { spawned += 1; return { status: 0 }; },
  });
  assert.deepEqual(result, { copied: false, backend: 'disabled', reason: 'disabled' });
  assert.equal(spawned, 0);
  assert.equal(output.buffer, '');
});

securityContractTest({ ...SEC005, outcome: 'reject' }, 'clipboard policy accepts only disabled, native, osc52 or auto', () => {
  const output = new MemoryOutput();
  assert.throws(() => copyTextToClipboard('text', {
    output,
    clipboardPolicy: 'shell-command',
    platform: 'linux',
    spawnSync() { return { status: 1 }; },
    osc52: false,
  }), /clipboard policy/i);
  assert.equal(output.buffer, '');
});

securityContractTest(SEC005, 'OSC 52 target is a fixed allowlisted enum and cannot contain control characters', () => {
  assert.throws(() => osc52ClipboardSequence('text', { target: 'c;\u001b]0;pwn' }), /target/i);
});

securityContractTest({ ...SEC005, outcome: 'allow' }, 'safe OSC 52 construction uses target c and a fixed terminator', () => {
  const sequence = osc52ClipboardSequence('Привет', { target: 'c' });
  assert.equal(sequence.startsWith('\u001b]52;c;'), true);
  assert.equal(sequence.endsWith('\u0007'), true);
  assert.equal(sequence.slice('\u001b]52;c;'.length, -1).includes('\u001b'), false);
});

securityContractTest({ ...SEC005, outcome: 'reject' }, 'clipboard byte limits are applied before Base64 expansion', () => {
  const output = new MemoryOutput();
  const result = copyTextToClipboard('🌲'.repeat(32), {
    output,
    clipboardPolicy: 'osc52',
    securityLimits: { osc52Bytes: 16 },
  });
  assert.equal(result.copied, false);
  assert.equal(result.reason, 'limit-exceeded');
  assert.equal(result.resource, 'osc52Bytes');
  assert.equal(output.buffer, '');
});


securityContractTest({ ...SEC005, outcome: 'allow' }, 'native clipboard is not constrained by the OSC 52 terminal payload limit', () => {
  const text = 'x'.repeat(4096);
  let copied = '';
  const result = copyTextToClipboard(text, {
    clipboardPolicy: 'native',
    clipboardBackend: { copy(value) { copied = value; return { copied: true, backend: 'native' }; } },
    securityLimits: { osc52Bytes: 16 },
  });
  assert.equal(result.copied, true);
  assert.equal(copied, text);
});

securityContractTest(SEC005, 'OSC 52 query/read forms are never generated', () => {
  assert.throws(() => osc52ClipboardSequence('?', { target: 'c', operation: 'query' }), /query|read/i);
});

securityContractTest({ ...SEC005, outcome: 'structured-error' }, 'clipboard failures return a structured backend and reason', () => {
  const output = new MemoryOutput();
  const result = copyTextToClipboard('text', {
    output,
    clipboardPolicy: 'native',
    platform: 'linux',
    env: {},
    spawnSync() { return { status: 1 }; },
    osc52: false,
  });
  assert.equal(result.copied, false);
  assert.equal(result.backend, 'native');
  assert.equal(result.reason, 'unavailable');
});


securityContractTest({ ...SEC005, outcome: 'preserve-selection' }, 'failed clipboard copies leave the current selection intact', () => {
  const selection = createTextSelectionState();
  selection.anchor = { x: 0, y: 0 };
  selection.focus = { x: 3, y: 0 };
  selection.text = 'text';
  selection.dragged = true;
  selection.selecting = false;
  const frame = renderToFrame(SelectableText({
    lines: ['text'],
    selection,
    onCopy() { return { copied: false, backend: 'native', reason: 'unavailable' }; },
  }), { width: 8, height: 1 });
  const click = { type: 'pointer', action: 'click', name: 'click', button: 'left', x: 1, y: 0, pressed: true };
  const release = { ...click, action: 'release', name: 'release', pressed: false };
  dispatchPointerEvent(click, frame.pointerRegions);
  dispatchPointerEvent(release, frame.pointerRegions);
  assert.equal(selection.text, 'text');
});

securityContractTest(SEC008, 'native clipboard execution never uses a shell and preserves the configured environment', () => {
  const calls = [];
  const env = { PATH: '/bin', TERLIO_CLIPBOARD_HELPER: 'enabled' };
  const backend = createLegacyNativeClipboardBackend({
    platform: 'darwin',
    env,
    spawnSync(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0 };
    },
  });
  assert.equal(backend.copy('text').copied, true);
  assert.equal(calls.length, 1);
  assert.notEqual(calls[0].options.shell, true);
  assert.deepEqual(calls[0].args, []);
  assert.equal(calls[0].options.env, env);
});

securityContractTest({ ...SEC008, outcome: 'cache' }, 'validated native backend discovery is cached across copy operations', () => {
  let attempts = 0;
  const backend = createLegacyNativeClipboardBackend({
    platform: 'linux',
    env: {},
    spawnSync(command) {
      attempts += 1;
      return { status: command === 'xsel' ? 0 : 1 };
    },
  });
  backend.copy('one');
  const afterFirst = attempts;
  backend.copy('two');
  assert.equal(attempts, afterFirst + 1);
});

securityContractTest({ ...SEC008, outcome: 'inject' }, 'applications can inject an asynchronous clipboard backend', async () => {
  const calls = [];
  const output = new MemoryOutput();
  const result = await copyTextToClipboard('text', {
    output,
    osc52: false,
    clipboardPolicy: 'native',
    clipboardBackend: {
      async copy(text) {
        calls.push(text);
        return { copied: true, backend: 'injected' };
      },
    },
  });
  assert.deepEqual(calls, ['text']);
  assert.deepEqual(result, { copied: true, backend: 'injected' });
});
