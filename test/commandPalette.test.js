import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCommandPaletteState,
  getCommandPaletteMatches,
  handleCommandPaletteKey,
  renderCommandPalette,
  renderToString,
} from '../src/lib/index.js';

const ITEMS = [
  { id: 'session.save', title: 'Save session', description: 'Persist the current transcript' },
  { id: 'session.open', title: 'Open session', description: 'Open a saved transcript' },
  { id: 'theme.ocean', title: 'Ocean theme', description: 'Switch colors' },
  { id: 'theme.matrix', title: 'Matrix theme', description: 'Switch colors' },
];

test('command palette filters by id title and description', () => {
  const state = createCommandPaletteState({ items: ITEMS, query: 'session persist' });
  const matches = getCommandPaletteMatches(state);

  assert.deepEqual(matches.map((item) => item.id), ['session.save']);
});

test('command palette handles typing, navigation and accept', () => {
  const state = createCommandPaletteState({ items: ITEMS });
  for (const char of 'theme') {
    handleCommandPaletteKey(state, { name: char, printable: true, text: char });
  }
  handleCommandPaletteKey(state, { name: 'down' });

  assert.equal(state.query, 'theme');
  assert.equal(state.selectedIndex, 1);

  const accepted = handleCommandPaletteKey(state, { name: 'enter' });
  assert.equal(accepted.type, 'accept');
  assert.equal(accepted.item.id, 'theme.matrix');
});

test('command palette renders using SelectList primitives', () => {
  const state = createCommandPaletteState({ items: ITEMS, query: 'theme' });
  const output = renderToString(renderCommandPalette(state), { width: 72, height: 14 });

  assert.match(output, /Command Palette/);
  assert.match(output, /theme\.ocean/);
  assert.match(output, /2 matches/);
});
