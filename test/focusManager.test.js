import test from 'node:test';
import assert from 'node:assert/strict';
import { FocusManager } from '../src/lib/focusManager.js';

test('FocusManager tracks focus and cycles enabled targets', () => {
  const focus = new FocusManager(['input', 'suggestions', 'debug']);
  assert.equal(focus.current(), 'input');
  assert.equal(focus.next(), 'suggestions');
  focus.disable('suggestions');
  assert.equal(focus.next(), 'debug');
  assert.equal(focus.previous(), 'input');
});

test('FocusManager refuses unknown targets', () => {
  const focus = new FocusManager(['input']);
  assert.throws(() => focus.focus('modal'), /Unknown focus target/);
});
