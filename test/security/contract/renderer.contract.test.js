import assert from 'node:assert/strict';
import * as publicApi from '../../../src/lib/index.js';
import { Text, SyntaxText, ansi, renderToString } from '../../../src/lib/index.js';
import {
  createTerminalOutputFrame,
  terminalHyperlink,
  terminalStyle,
  terminalText,
  terminalUnsafeRaw,
} from '../../../src/lib/terminal/outputModel.js';
import { createTerminalPolicy } from '../../../src/lib/terminal/policy.js';
import { createTerminalSink } from '../../../src/lib/terminal/sink.js';
import { assertNoDangerousTerminalControl, MemoryOutput, securityContractTest } from '../../../scripts/security-testing/contractHelpers.js';
import { hostileTerminalFixtures, terminalControlFixtures } from '../../../scripts/security-testing/contractFixtures.js';

const SEC001 = { audit: 'TERLIO-SEC-001', outcome: 'escape', phase: 'Phase 3' };

securityContractTest({ ...SEC001, outcome: 'allow' }, 'safe rendering preserves printable Unicode and normalized line breaks', () => {
  const output = renderToString(Text('Привет 🌲\r\nsecond\rthird', { wrap: false }), {
    width: 24,
    height: 3,
    terminalPolicy: 'safe',
  });
  assert.match(output, /Привет 🌲/u);
  assert.match(output, /second/u);
  assert.equal(output.includes('\r'), false);
});

securityContractTest(SEC001, 'plain Text blocks CSI, OSC, DCS, APC, PM, SOS and C1 controls by default', () => {
  for (const fixture of terminalControlFixtures) {
    const rendered = renderToString(Text(`before${fixture}after`, { wrap: false }), { width: 40, height: 1 });
    assertNoDangerousTerminalControl(rendered);
  }
});

securityContractTest({ ...SEC001, outcome: 'reject' }, 'safe sink blocks legacy or component output that bypasses earlier sanitization', () => {
  const output = new MemoryOutput();
  const sink = createTerminalSink({ output, policy: createTerminalPolicy({ mode: 'safe' }) });
  sink.write(`before${hostileTerminalFixtures.osc52Write}after`);
  assertNoDangerousTerminalControl(output.buffer);
});

securityContractTest({ ...SEC001, outcome: 'allow' }, 'validated library SGR styles remain available as structured operations', () => {
  const output = new MemoryOutput();
  const sink = createTerminalSink({ output, policy: createTerminalPolicy({ mode: 'safe' }) });
  sink.writeFrame(createTerminalOutputFrame({
    operations: [
      terminalStyle(ansi.bold, { trusted: true }),
      terminalText('Error'),
      terminalStyle(ansi.reset, { trusted: true }),
    ],
  }));
  assert.equal(output.buffer, `${ansi.bold}Error${ansi.reset}`);
});

securityContractTest({ ...SEC001, outcome: 'visible' }, 'visible blocked-control mode preserves evidence without executing it', () => {
  const output = new MemoryOutput();
  const sink = createTerminalSink({
    output,
    policy: createTerminalPolicy({ mode: 'safe', blockedControlRendering: 'visible' }),
  });
  sink.write(`log:${hostileTerminalFixtures.csiErase}:done`);
  assertNoDangerousTerminalControl(output.buffer);
  assert.match(output.buffer, /(?:␛|\\x1b|ESC).*2J/u);
});

securityContractTest({ ...SEC001, outcome: 'remove' }, 'remove blocked-control mode strips terminal effects without removing surrounding text', () => {
  const output = new MemoryOutput();
  const sink = createTerminalSink({
    output,
    policy: createTerminalPolicy({ mode: 'safe', blockedControlRendering: 'remove' }),
  });
  sink.write(`before${hostileTerminalFixtures.privateMode}after`);
  assert.equal(output.buffer, 'beforeafter');
});

securityContractTest({ ...SEC001, outcome: 'explicit-opt-in' }, 'unsafe raw output requires a deliberately named public API', () => {
  assert.equal(typeof publicApi.unsafeRawAnsi, 'function');
  const value = publicApi.unsafeRawAnsi(hostileTerminalFixtures.csiErase);
  assert.equal(value?.type, 'unsafe-raw');
});

securityContractTest({ ...SEC001, outcome: 'reject' }, 'ordinary option merging cannot turn trusted output into the default', () => {
  const policy = createTerminalPolicy({ mode: undefined, trusted: true, sanitize: false });
  assert.equal(policy.mode, 'safe');
});

securityContractTest({ ...SEC001, outcome: 'reject' }, 'safe policy rejects unsafe raw operations unless the caller explicitly opts into unsafe output', () => {
  const output = new MemoryOutput();
  const sink = createTerminalSink({ output, policy: createTerminalPolicy({ mode: 'safe' }) });
  sink.writeFrame(createTerminalOutputFrame({ operations: [terminalUnsafeRaw(hostileTerminalFixtures.csiErase)] }));
  assertNoDangerousTerminalControl(output.buffer);
});

securityContractTest({ ...SEC001, outcome: 'allow' }, 'explicit unsafe output remains available under an explicit unsafe policy', () => {
  const output = new MemoryOutput();
  const sink = createTerminalSink({ output, policy: createTerminalPolicy({ mode: 'trusted' }) });
  sink.writeFrame(createTerminalOutputFrame({ operations: [terminalUnsafeRaw(hostileTerminalFixtures.csiErase)] }));
  assert.equal(output.buffer, hostileTerminalFixtures.csiErase);
});

securityContractTest({ ...SEC001, outcome: 'disable' }, 'hyperlinks are harmless labels when hyperlink support is not explicitly enabled', () => {
  const output = new MemoryOutput();
  const sink = createTerminalSink({ output, policy: createTerminalPolicy({ mode: 'safe', hyperlinks: 'disabled' }) });
  sink.writeFrame(createTerminalOutputFrame({ operations: [terminalHyperlink('docs', 'https://example.test')] }));
  assert.equal(output.buffer, 'docs');
  assertNoDangerousTerminalControl(output.buffer);
});

securityContractTest({ ...SEC001, outcome: 'allow' }, 'enabled hyperlinks allow only configured URI schemes and use safe OSC terminators', () => {
  const output = new MemoryOutput();
  const sink = createTerminalSink({
    output,
    policy: createTerminalPolicy({ mode: 'safe', hyperlinks: { enabled: true, schemes: ['https'] } }),
  });
  sink.writeFrame(createTerminalOutputFrame({ operations: [terminalHyperlink('docs', 'https://example.test/path')] }));
  assert.equal(output.buffer.includes('\u001b]8;;https://example.test/path\u001b\\'), true);
  assert.equal(output.buffer.endsWith('\u001b]8;;\u001b\\'), true);
});

securityContractTest({ ...SEC001, outcome: 'reject' }, 'hyperlink targets cannot use dangerous schemes or break out through controls', () => {
  const output = new MemoryOutput();
  const sink = createTerminalSink({
    output,
    policy: createTerminalPolicy({ mode: 'safe', hyperlinks: { enabled: true, schemes: ['https'] } }),
  });
  sink.writeFrame(createTerminalOutputFrame({ operations: [
    terminalHyperlink('click', `javascript:alert(1)${hostileTerminalFixtures.osc52Write}`),
  ] }));
  assert.equal(output.buffer, 'click');
  assertNoDangerousTerminalControl(output.buffer);
});

securityContractTest({ ...SEC001, outcome: 'truncate' }, 'hyperlink labels and URIs obey explicit byte limits', () => {
  const output = new MemoryOutput();
  const sink = createTerminalSink({
    output,
    policy: createTerminalPolicy({
      mode: 'safe',
      hyperlinks: { enabled: true, schemes: ['https'] },
      limits: { hyperlinkBytes: 32 },
    }),
  });
  sink.writeFrame(createTerminalOutputFrame({ operations: [terminalHyperlink('label', `https://example.test/${'x'.repeat(200)}`)] }));
  assert.ok(Buffer.byteLength(output.buffer, 'utf8') <= 96);
});

securityContractTest({ ...SEC001, outcome: 'visible' }, 'syntax-highlighted source exposes terminal controls rather than interpreting them', () => {
  const rendered = renderToString(SyntaxText({
    code: `const x = 1;${hostileTerminalFixtures.osc52Write}`,
    language: 'javascript',
    unicodeSecurity: 'code-safe',
  }), { width: 60, height: 2 });
  assertNoDangerousTerminalControl(rendered);
  assert.match(rendered, /(?:␛|\\x1b|ESC)/u);
});
