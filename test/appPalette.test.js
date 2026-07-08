import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppPaletteItems } from '../src/lib/app.js';

test('app command palette exposes slash commands as insertable actions', () => {
  const items = createAppPaletteItems();
  const help = items.find((item) => item.id === '/help');
  const theme = items.find((item) => item.id === '/theme');

  assert.ok(help);
  assert.equal(help.value.insert, '/help');
  assert.ok(theme);
  assert.equal(theme.value.insert, '/theme ');
  assert.match(theme.description, /Оформление|тему|theme/i);
});
