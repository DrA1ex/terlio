import test from 'node:test';
import assert from 'node:assert/strict';
import { ModeManager } from '../src/lib/index.js';

test('ModeManager keeps a stack of interactive modes', () => {
  const modes = new ModeManager('input');
  assert.equal(modes.current(), 'input');

  modes.push('palette', { query: '' });
  assert.equal(modes.current(), 'palette');
  assert.deepEqual(modes.currentEntry().data, { query: '' });

  modes.push('confirm');
  assert.equal(modes.is('confirm'), true);
  assert.equal(modes.pop(), 'confirm');
  assert.equal(modes.current(), 'palette');

  modes.replace('modal');
  assert.equal(modes.current(), 'modal');
  modes.reset();
  assert.equal(modes.current(), 'input');
});

test('ModeManager does not pop the root mode', () => {
  const modes = new ModeManager('input');
  assert.equal(modes.pop(), 'input');
  assert.equal(modes.current(), 'input');
});
