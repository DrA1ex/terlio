import assert from 'node:assert/strict';
import { TerminalInputDecoder, Text, parseInputEvents, renderToString } from '../../../src/lib/index.js';
import { TerminalSessionGuard } from '../../../src/lib/terminal/sessionGuard.js';
import { ansi } from '../../../src/lib/ansi/codes.js';
import { createSeededBytes, FakeInput, MemoryOutput, securityContractTest } from '../../../scripts/security-testing/contractHelpers.js';
import { hostileTerminalFixtures } from '../../../scripts/security-testing/contractFixtures.js';

const SEC003 = { audit: 'TERLIO-SEC-003', outcome: 'restore', phase: 'Phase 5' };
const SEC004 = { audit: 'TERLIO-SEC-004', outcome: 'reject', phase: 'Phase 5' };

securityContractTest(SEC003, 'terminal session guard exposes bracketed-paste lifecycle control', () => {
  const guard = new TerminalSessionGuard({ input: new FakeInput(), output: new MemoryOutput() });
  assert.equal(typeof guard.setBracketedPaste, 'function');
});

securityContractTest(SEC003, 'successful interactive startup enables bracketed paste and cleanup disables it', () => {
  const input = new FakeInput();
  const output = new MemoryOutput();
  const guard = new TerminalSessionGuard({ input, output });
  guard.start();
  guard.enableRawMode();
  guard.setBracketedPaste(true);
  guard.cleanup({ newline: false });
  assert.equal(output.buffer.includes('\u001b[?2004h'), true);
  assert.equal(output.buffer.includes('\u001b[?2004l'), true);
  assert.ok(output.buffer.indexOf('\u001b[?2004h') < output.buffer.indexOf('\u001b[?2004l'));
});

securityContractTest(SEC003, 'cleanup disables bracketed paste even after partial startup or callback failure', () => {
  const input = new FakeInput();
  const output = new MemoryOutput();
  const guard = new TerminalSessionGuard({ input, output });
  guard.start();
  guard.setBracketedPaste(true);
  assert.throws(() => {
    try {
      throw new Error('callback failed');
    } finally {
      guard.cleanup({ newline: false });
    }
  }, /callback failed/);
  assert.equal(output.buffer.endsWith(`${ansi.autoWrapOn}${ansi.showCursor}${ansi.normalScreen}${ansi.reset}`), true);
  assert.equal(output.buffer.includes('\u001b[?2004l'), true);
});

securityContractTest({ ...SEC003, outcome: 'atomic' }, 'line endings inside bracketed paste remain one paste event', () => {
  const decoder = new TerminalInputDecoder();
  const events = decoder.write('\u001b[200~line one\r\nline two\rline three\nline four\u001b[201~');
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'paste');
  assert.equal(events[0].text, 'line one\nline two\nline three\nline four');
});

securityContractTest({ ...SEC003, outcome: 'preserve' }, 'events after the bracketed-paste terminator remain independent application input', () => {
  const decoder = new TerminalInputDecoder();
  const events = decoder.write('\u001b[200~line one\nline two\u001b[201~\r');
  assert.deepEqual(events.map((event) => event.name), ['paste', 'enter']);
  assert.equal(events[0].text, 'line one\nline two');
});

securityContractTest({ ...SEC003, outcome: 'preserve' }, 'non-submit events after paste remain available to the application', () => {
  const decoder = new TerminalInputDecoder();
  const events = decoder.write('\u001b[200~value\u001b[201~\u001b[AX');
  assert.deepEqual(events.map((event) => event.name), ['paste', 'up', 'x']);
  assert.equal(events[2].text, 'X');
  assert.equal(events[2].shift, true);
});

securityContractTest({ ...SEC003, outcome: 'truncate' }, 'oversized paste produces explicit truncation metadata', () => {
  const decoder = new TerminalInputDecoder({ limits: { pasteBytes: 16 }, pasteOverflow: 'truncate' });
  const [event] = decoder.write(`\u001b[200~${'x'.repeat(64)}\u001b[201~`);
  assert.equal(event.name, 'paste');
  assert.equal(event.truncated, true);
  assert.equal(Buffer.byteLength(event.text, 'utf8'), 16);
});

securityContractTest({ ...SEC003, outcome: 'reject' }, 'oversized paste can be rejected as one controlled event', () => {
  const decoder = new TerminalInputDecoder({ limits: { pasteBytes: 16 }, pasteOverflow: 'reject' });
  const [event] = decoder.write(`\u001b[200~${'x'.repeat(64)}\u001b[201~`);
  assert.equal(event.name, 'rejected');
  assert.equal(event.reason, 'paste-limit');
  assert.equal(event.resource, 'pasteBytes');
});

securityContractTest({ ...SEC003, outcome: 'preserve' }, 'paste preserves terminal-looking data while rendering still makes it harmless', () => {
  const decoder = new TerminalInputDecoder({ inputPolicy: 'safe' });
  const [event] = decoder.write(`\u001b[200~before${hostileTerminalFixtures.osc52Write}after\u001b[201~`);
  assert.equal(event.name, 'paste');
  assert.equal(event.text.includes('\u001b'), true);

  const rendered = renderToString(Text(event.text), { width: 120, height: 1 });
  assert.equal(rendered.includes('\u001b]52;'), false);
  assert.match(rendered, /before.*after/u);
});

securityContractTest({ ...SEC004, outcome: 'recover' }, 'invalid CSI-u code points never throw and parsing continues', () => {
  const decoder = new TerminalInputDecoder();
  assert.doesNotThrow(() => decoder.write(`${hostileTerminalFixtures.malformedCsiU}A`));
  const events = decoder.write('B');
  assert.ok(events.some((event) => event.text === 'B'));
});

securityContractTest(SEC004, 'numeric fields are bounded by escapeSequenceBytes and validated as safe integers', () => {
  const decoder = new TerminalInputDecoder({ limits: { escapeSequenceBytes: 128 } });
  const hugeNumericCsi = `\u001b[${'9'.repeat(100)};1u`;
  assert.doesNotThrow(() => decoder.write(hugeNumericCsi));
  assert.equal(decoder.buffer, '');
  assert.equal(decoder.write('A')[0]?.text, 'A');
});

securityContractTest({ ...SEC004, outcome: 'bounded' }, 'incomplete escape and paste sequences cannot grow the retained buffer beyond its limit', () => {
  const decoder = new TerminalInputDecoder({ limits: { inputBufferBytes: 64, escapeSequenceBytes: 32, pasteBytes: 64 } });
  decoder.write(hostileTerminalFixtures.incompletePaste.repeat(128));
  assert.ok(Buffer.byteLength(decoder.buffer, 'utf8') <= 64 + Buffer.byteLength('\u001b[200~\u001b[201~', 'utf8'));
});

securityContractTest({ ...SEC004, outcome: 'recover' }, 'malformed SGR mouse input is discarded atomically and later text is parsed', () => {
  const decoder = new TerminalInputDecoder({ limits: { escapeSequenceBytes: 64 } });
  const events = decoder.write(`${hostileTerminalFixtures.malformedMouse}ok`);
  assert.equal(events.some((event) => event.type === 'pointer'), false);
  assert.ok(events.some((event) => event.text === 'ok'));
  assert.ok(Buffer.byteLength(decoder.buffer, 'utf8') <= 64);
});

securityContractTest({ ...SEC004, outcome: 'discard' }, 'unsupported terminal replies are consumed atomically without becoming application keys', () => {
  const events = parseInputEvents('\u001b[?1;2cA');
  assert.equal(events.length, 1);
  assert.equal(events[0].text, 'A');
});

securityContractTest({ ...SEC004, outcome: 'bounded' }, 'seeded arbitrary byte chunks never throw or retain unbounded state', () => {
  for (const seed of [1, 7, 42, 0xdeadbeef]) {
    const decoder = new TerminalInputDecoder({ limits: { inputBufferBytes: 1024, escapeSequenceBytes: 128 } });
    const bytes = Buffer.concat([
      createSeededBytes(seed, 2048),
      Buffer.from(hostileTerminalFixtures.malformedCsiU),
      Buffer.from('valid'),
    ]);
    assert.doesNotThrow(() => {
      for (let index = 0; index < bytes.length; index += 17) decoder.write(bytes.subarray(index, index + 17));
    });
    assert.ok(Buffer.byteLength(decoder.buffer, 'utf8') <= 1024);
  }
});

securityContractTest({ ...SEC004, outcome: 'deterministic' }, 'seeded chunking produces deterministic events for identical input', () => {
  const source = createSeededBytes(12345, 512);
  const decode = () => {
    const decoder = new TerminalInputDecoder({ limits: { inputBufferBytes: 1024, escapeSequenceBytes: 128 } });
    const events = [];
    for (let index = 0; index < source.length; index += 11) events.push(...decoder.write(source.subarray(index, index + 11)));
    return events.map((event) => ({ name: event.name, text: event.text, type: event.type, reason: event.reason }));
  };
  assert.deepEqual(decode(), decode());
});
