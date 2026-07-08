import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from '../src/lib/index.js';
import {
  createSupportDeskState,
  createSupportDeskView,
  executeSupportCommand,
  getSelectedTicket,
  getVisibleTickets,
  SUPPORT_COMMANDS,
} from '../examples/support-desk.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageJson = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));

test('business demo scripts expose chat and support desk only', () => {
  assert.equal(packageJson.scripts['demo:support-desk'], 'node examples/support-desk.js');
  assert.ok(packageJson.scripts['demo:chat']);
  assert.equal(packageJson.scripts['demo:release-room'], undefined);
});

test('support desk renders ticket queue, SLA and timeline', () => {
  const state = createSupportDeskState();
  const output = renderToString(createSupportDeskView({ state, width: 200, height: 42 }), { width: 200, height: 42 });
  assert.match(output, /Support Triage Desk/);
  assert.match(output, /INBOX/);
  assert.match(output, /SLA/);
  assert.match(output, /THREAD/);
});

test('support desk commands mutate selected ticket workflow', () => {
  const state = createSupportDeskState();
  assert.ok(SUPPORT_COMMANDS.length >= 10);

  executeSupportCommand(state, '/ticket TCK-1043');
  assert.equal(getSelectedTicket(state).id, 'TCK-1043');

  executeSupportCommand(state, '/assign me');
  assert.equal(getSelectedTicket(state).assignee, 'Alex');

  executeSupportCommand(state, '/tag regression');
  assert.ok(getSelectedTicket(state).tags.includes('regression'));

  executeSupportCommand(state, '/search export');
  assert.equal(getVisibleTickets(state).length, 1);
  assert.equal(getSelectedTicket(state).id, 'TCK-1043');

  executeSupportCommand(state, '/reply template export');
  assert.equal(state.modes.current(), 'reply');
  assert.match(state.reply.value, /export job/);
});
