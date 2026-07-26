import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Box,
  SyntaxText,
  Text,
  ansi,
  createTerminalPolicy,
  renderToString,
  unsafeRawAnsi,
} from '../../src/lib/index.js';
import {
  isAllowedLibraryControl,
  isValidatedSgr,
  parseTerminalControls,
  sanitizeTerminalText,
  sanitizeTrustedTerminalControl,
} from '../../src/lib/terminal/controlParser.js';
import { createTerminalOutputFrame, terminalControl, terminalText } from '../../src/lib/terminal/outputModel.js';
import { createTerminalSink } from '../../src/lib/terminal/sink.js';
import { MemoryOutput, assertNoDangerousTerminalControl } from '../../scripts/security-testing/contractHelpers.js';
import { hostileTerminalFixtures, terminalControlFixtures } from '../../scripts/security-testing/contractFixtures.js';

test('terminal control parser classifies complete and incomplete control families without executing them', () => {
  const source = `a${hostileTerminalFixtures.csiErase}b${hostileTerminalFixtures.oscTitleBel}c\u001bPunterminated`;
  const tokens = parseTerminalControls(source);
  assert.deepEqual(tokens.map((token) => token.type), ['text', 'control', 'text', 'control', 'text', 'control']);
  assert.deepEqual(tokens.filter((token) => token.type === 'control').map((token) => token.kind), ['csi', 'osc', 'dcs']);
  assert.equal(tokens.at(-1).incomplete, true);
});

test('safe text normalization preserves newlines, tabs, Unicode and only validated SGR', () => {
  const source = `one\r\ntwo\rthree\t${ansi.bold}bold${ansi.reset}${hostileTerminalFixtures.csiErase}`;
  const visible = sanitizeTerminalText(source, { blockedControlRendering: 'visible' });
  assert.equal(visible.includes('\r'), false);
  assert.equal(visible.includes('\n'), true);
  assert.equal(visible.includes('\t'), true);
  assert.equal(visible.includes(ansi.bold), true);
  assert.match(visible, /␛\[2J/u);
  assertNoDangerousTerminalControl(visible.replaceAll(ansi.bold, '').replaceAll(ansi.reset, ''));
});

test('SGR validation accepts supported colors and rejects non-style CSI', () => {
  for (const value of [ansi.reset, ansi.bold, '\u001b[38;5;238m', '\u001b[48;2;1;2;3m', '\u001b[39m']) {
    assert.equal(isValidatedSgr(value), true, JSON.stringify(value));
  }
  for (const value of [hostileTerminalFixtures.csiErase, hostileTerminalFixtures.csiCursor, '\u001b[8m', '\u001b[999m', '\u001b[38;5;999m', '\u001b[999;38:2::1:2:3m']) {
    assert.equal(isValidatedSgr(value), false, JSON.stringify(value));
  }
});

test('trusted terminal controls are restricted to renderer and lifecycle operations', () => {
  for (const value of [ansi.clear, ansi.home, ansi.moveTo(4, 2), ansi.eraseLine, ansi.altScreen, ansi.normalScreen, ansi.mouseSgrOn]) {
    assert.equal(isAllowedLibraryControl(value), true, JSON.stringify(value));
    assert.equal(sanitizeTrustedTerminalControl(value), value);
  }
  for (const value of [hostileTerminalFixtures.deviceQuery, hostileTerminalFixtures.osc52Write, hostileTerminalFixtures.dcs]) {
    assert.equal(isAllowedLibraryControl(value), false, JSON.stringify(value));
    assert.equal(sanitizeTrustedTerminalControl(value), '');
  }
});

test('safe rendering blocks hostile content in text, titles and custom theme tokens', () => {
  for (const control of terminalControlFixtures) {
    const rendered = renderToString(Box({
      border: true,
      title: `title${control}`,
      borderColor: control,
    }, Text(`body${control}`, { wrap: false })), { width: 48, height: 3 });
    assertNoDangerousTerminalControl(rendered);
  }
});

test('safe sink validates mixed trusted control and untrusted text at the final boundary', () => {
  const output = new MemoryOutput();
  const sink = createTerminalSink({ output });
  sink.writeFrame(createTerminalOutputFrame({ operations: [
    terminalControl(`${ansi.autoWrapOff}${ansi.moveTo(1, 1)}`, { trusted: true }),
    terminalText(`safe${hostileTerminalFixtures.osc52Write}`),
    terminalControl(ansi.autoWrapOn, { trusted: true }),
  ] }));
  assert.equal(output.buffer.startsWith(`${ansi.autoWrapOff}${ansi.moveTo(1, 1)}safe`), true);
  assert.equal(output.buffer.endsWith(ansi.autoWrapOn), true);
  assert.equal(output.buffer.includes(hostileTerminalFixtures.osc52Write), false);
});

test('unsafeRawAnsi only emits raw bytes under an explicit trusted policy', () => {
  const node = Text(unsafeRawAnsi(hostileTerminalFixtures.csiErase), { wrap: false });
  const safe = renderToString(node, { width: 12, height: 1 });
  const trusted = renderToString(node, { width: 12, height: 1, terminalPolicy: 'trusted' });
  assertNoDangerousTerminalControl(safe);
  assert.equal(trusted.startsWith(hostileTerminalFixtures.csiErase), true);
  assert.equal(createTerminalPolicy({ sanitize: false, trusted: true }).mode, 'safe');
});

test('syntax rendering visibly preserves hostile evidence without terminal effects', () => {
  const rendered = renderToString(SyntaxText({
    code: `const value = "x";${hostileTerminalFixtures.osc52Write}`,
    language: 'javascript',
    theme: { syntaxText: hostileTerminalFixtures.csiErase, syntaxKeyword: '' },
  }), { width: 80, height: 2 });
  assertNoDangerousTerminalControl(rendered.replace(/\u001b\[[0-9;:]*m/gu, ''));
  assert.match(rendered, /␛/u);
});

test('safe parser does not skip ESC after an unpaired high surrogate', () => {
  const rendered = sanitizeTerminalText('before\ud800\u001b[2Jafter', {
    blockedControlRendering: 'visible',
  });

  assert.equal(rendered.includes('\u001b[2J'), false);
  assert.match(rendered, /␛\[2J/u);
});
