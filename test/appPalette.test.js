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
  assert.match(theme.description, /visual|theme/i);
});


test('app command palette groups product actions and uses real skill names', () => {
  const items = createAppPaletteItems();
  const session = items.find((item) => item.id === '/session');
  const terminalSkill = items.find((item) => item.id === 'skill.terminal.toggle');

  assert.equal(session?.category, 'Sessions');
  assert.ok(terminalSkill);
  assert.equal(terminalSkill.value.insert, '/skill on terminal');
  assert.equal(items.some((item) => item.id.includes('undefined')), false);
});
