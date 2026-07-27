import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKey } from '../src/lib/keyParser.js';
import { TerminalInputDecoder } from '../src/lib/inputParser.js';

test('parseKey normalizes printable text', () => {
  assert.deepEqual(parseKey('a'), {
    name: 'a',
    sequence: 'a',
    text: 'a',
    printable: true,
    ctrl: false,
    meta: false,
    shift: false,
    cmd: false,
  });
});

test('parseKey normalizes control keys', () => {
  assert.equal(parseKey('\x03').name, 'ctrl-c');
  assert.equal(parseKey('\x04').name, 'ctrl-d');
  assert.deepEqual(pick(parseKey('\x0f')), { name: 'o', meta: false, cmd: false, shift: false });
  assert.equal(parseKey('\x0f').ctrl, true);
  assert.deepEqual(pick(parseKey('\x1b[111;5u')), { name: 'o', meta: false, cmd: false, shift: false });
  assert.equal(parseKey('\x1b[111;5u').ctrl, true);
  assert.equal(parseKey('\x10').name, 'command-palette');
  assert.deepEqual(pick(parseKey('\x14')), { name: 't', meta: false, cmd: false, shift: false });
  assert.equal(parseKey('\x14').ctrl, true);
  assert.equal(parseKey('\x1b[112;5u').name, 'command-palette');
  assert.equal(parseKey('\x7f').name, 'backspace');
  assert.equal(parseKey('\x1b[3~').name, 'delete');
});

test('parseKey normalizes arrows and modifier arrows', () => {
  assert.deepEqual(pick(parseKey('\x1b[A')), { name: 'up', meta: false, cmd: false, shift: false });
  assert.deepEqual(pick(parseKey('\x1b[1;2A')), { name: 'up', meta: false, cmd: false, shift: true });
  assert.deepEqual(pick(parseKey('\x1b[1;2B')), { name: 'down', meta: false, cmd: false, shift: true });
  assert.deepEqual(pick(parseKey('\x1b[1;3D')), { name: 'left', meta: true, cmd: false, shift: false });
  assert.deepEqual(pick(parseKey('\x1b[1;9C')), { name: 'right', meta: false, cmd: true, shift: false });
});

test('TerminalInputDecoder preserves Shift+Arrow modifiers across split input chunks', () => {
  const decoder = new TerminalInputDecoder();
  assert.deepEqual(decoder.write('\x1b[1;2'), []);
  const [up] = decoder.write('A');
  const [down] = decoder.write('\x1b[1;2B');
  assert.deepEqual(pick(up), { name: 'up', meta: false, cmd: false, shift: true });
  assert.deepEqual(pick(down), { name: 'down', meta: false, cmd: false, shift: true });
});

test('parseKey supports bracketed paste as a single semantic event', () => {
  assert.deepEqual(parseKey('\x1b[200~hello\nworld\x1b[201~'), {
    name: 'paste',
    sequence: '\x1b[200~hello\nworld\x1b[201~',
    text: 'hello\nworld',
    printable: false,
    ctrl: false,
    meta: false,
    shift: false,
    cmd: false,
  });
});

function pick(key) {
  return { name: key.name, meta: key.meta, cmd: key.cmd, shift: key.shift };
}
