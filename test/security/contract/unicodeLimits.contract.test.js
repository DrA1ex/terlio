import assert from 'node:assert/strict';
import { PointerRegion, SyntaxText, Text, renderToFrame, renderToString } from '../../../src/lib/index.js';
import { createTerminalPolicy } from '../../../src/lib/terminal/policy.js';
import { createTerminalSink } from '../../../src/lib/terminal/sink.js';
import { terminalText, createTerminalOutputFrame } from '../../../src/lib/terminal/outputModel.js';
import { assertControlledLimitError, MemoryOutput, securityContractTest } from '../../../scripts/security-testing/contractHelpers.js';
import { hostileTerminalFixtures } from '../../../scripts/security-testing/contractFixtures.js';

const SEC009 = { audit: 'TERLIO-SEC-009', outcome: 'visible', phase: 'Phase 9' };
const SEC010 = { audit: 'TERLIO-SEC-010', outcome: 'reject', phase: 'Phase 9' };

for (const [name, value] of Object.entries({
  bidiOverride: hostileTerminalFixtures.bidiOverride,
  bidiIsolate: hostileTerminalFixtures.bidiIsolate,
})) {
  securityContractTest(SEC009, `code-safe rendering exposes ${name} characters`, () => {
    const rendered = renderToString(SyntaxText({ code: value, language: 'text', unicodeSecurity: 'code-safe' }), {
      width: 80,
      height: 2,
    });
    assert.equal(rendered.includes(value), false);
    assert.match(rendered, /(?:U\+[0-9A-F]{4,6}|⟦|␛|\\u[0-9a-f]{4})/iu);
  });
}

for (const [name, value] of Object.entries({
  zeroWidth: hostileTerminalFixtures.zeroWidth,
  softHyphen: hostileTerminalFixtures.softHyphen,
  invisibleSeparator: hostileTerminalFixtures.invisibleSeparator,
})) {
  securityContractTest({ ...SEC009, outcome: 'visible-opt-in' }, `visible-controls rendering exposes ${name} characters`, () => {
    const rendered = renderToString(SyntaxText({ code: value, language: 'text', unicodeSecurity: 'visible-controls' }), {
      width: 80,
      height: 2,
    });
    assert.equal(rendered.includes(value), false);
    assert.match(rendered, /(?:U\+[0-9A-F]{4,6}|⟦|␛|\\u[0-9a-f]{4})/iu);
  });
}

securityContractTest({ ...SEC009, outcome: 'allow' }, 'code-safe mode preserves ZWJ emoji sequences', () => {
  const emoji = '👨‍💻';
  const rendered = renderToString(SyntaxText({ code: emoji, language: 'text', unicodeSecurity: 'code-safe' }), {
    width: 20,
    height: 1,
  });
  assert.match(rendered, /👨‍💻/u);
});

securityContractTest({ ...SEC009, outcome: 'allow' }, 'normal Unicode mode preserves ordinary printable Unicode', () => {
  const rendered = renderToString(Text('Русский 日本語 🌲', { wrap: false, unicodeSecurity: 'normal' }), {
    width: 40,
    height: 1,
  });
  assert.match(rendered, /Русский 日本語 🌲/u);
});

securityContractTest(SEC009, 'filenames and commands default to code-safe Unicode handling', () => {
  const rendered = renderToString(Text(`run ${hostileTerminalFixtures.bidiOverride}`, {
    wrap: false,
    contentKind: 'command',
  }), { width: 60, height: 1 });
  assert.equal(rendered.includes('\u202e'), false);
  assert.match(rendered, /U\+202E|\\u202e/iu);
});

securityContractTest({ ...SEC010, outcome: 'defaults' }, 'default limits bound retained/external-effect data while application-owned structures remain unlimited', () => {
  const policy = createTerminalPolicy({ mode: 'safe' });
  for (const name of ['inputBufferBytes', 'escapeSequenceBytes', 'pasteBytes', 'osc52Bytes', 'sessionBytes', 'hyperlinkBytes']) {
    assert.ok(Number.isFinite(policy.limits[name]) && policy.limits[name] > 0, name);
  }
  for (const name of ['renderedTextBytes', 'renderedLines', 'syntaxTokens', 'nativeClipboardBytes', 'sessionMessages', 'sessionDepth', 'pointerRegions']) {
    assert.equal(policy.limits[name], Infinity, name);
  }
});

securityContractTest({ ...SEC010, outcome: 'structured-error' }, 'rendered text byte limits fail with a recoverable structured error', () => {
  assert.throws(
    () => renderToString(Text('x'.repeat(64), { wrap: false }), {
      width: 80,
      height: 1,
      securityLimits: { renderedTextBytes: 16 },
    }),
    (error) => {
      assertControlledLimitError(error, 'renderedTextBytes');
      return true;
    },
  );
});

securityContractTest({ ...SEC010, outcome: 'structured-error' }, 'rendered line limits fail before building an unbounded frame', () => {
  assert.throws(
    () => renderToFrame(Text(Array.from({ length: 20 }, (_, index) => String(index)).join('\n')), {
      width: 20,
      height: 20,
      securityLimits: { renderedLines: 4 },
    }),
    (error) => {
      assertControlledLimitError(error, 'renderedLines');
      return true;
    },
  );
});

securityContractTest({ ...SEC010, outcome: 'structured-error' }, 'syntax token limits stop adversarial highlighting', () => {
  assert.throws(
    () => renderToString(SyntaxText({
      code: Array.from({ length: 100 }, (_, index) => `const value${index} = ${index};`).join('\n'),
      language: 'javascript',
      securityLimits: { syntaxTokens: 8 },
    }), { width: 80, height: 10 }),
    (error) => {
      assertControlledLimitError(error, 'syntaxTokens');
      return true;
    },
  );
});

securityContractTest({ ...SEC010, outcome: 'structured-error' }, 'pointer region limits reject excessive interactive metadata', () => {
  const regions = Array.from({ length: 20 }, (_, index) => PointerRegion({ pointerId: `p-${index}` }, Text(String(index), { wrap: false })));
  assert.throws(
    () => renderToFrame({ type: 'column', props: {}, children: regions }, {
      width: 20,
      height: 20,
      securityLimits: { pointerRegions: 4 },
    }),
    (error) => {
      assertControlledLimitError(error, 'pointerRegions');
      return true;
    },
  );
});

securityContractTest({ ...SEC010, outcome: 'explicit-opt-in' }, 'raising one limit does not disable unrelated protections', () => {
  const output = new MemoryOutput();
  const policy = createTerminalPolicy({
    mode: 'safe',
    limits: { renderedTextBytes: Infinity, osc52Bytes: 8 },
  });
  const sink = createTerminalSink({ output, policy });
  sink.writeFrame(createTerminalOutputFrame({ operations: [terminalText('x'.repeat(1024))] }));
  assert.equal(output.buffer.length, 1024);
  assert.equal(policy.mode, 'safe');
  assert.equal(policy.limits.osc52Bytes, 8);
  assert.equal(policy.limits.clipboardBytes, 8); // compatibility alias

  const legacyAlias = createTerminalPolicy({ limits: { clipboardBytes: 4 } });
  assert.equal(legacyAlias.limits.osc52Bytes, 4);
  assert.equal(legacyAlias.limits.clipboardBytes, 4);
});
