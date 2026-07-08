import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString, stripAnsi } from '../src/lib/index.js';
import {
  createSupportDeskState,
  createSupportDeskView,
  executeSupportCommand,
  getSelectedTicket,
  getVisibleTickets,
  handleSupportDeskKey,
  getSlashSuggestions,
  tickSupportDesk,
} from '../examples/support-desk.js';

test('support desk renders responsive wide, medium and narrow business layouts', () => {
  const state = createSupportDeskState();
  const wide = stripAnsi(renderToString(createSupportDeskView({ state, width: 200, height: 42 }), { width: 200, height: 42 }));
  assert.match(wide, /Support Triage Desk/);
  assert.match(wide, /TICKET PROPERTIES/);
  assert.match(wide, /ACTIONS/);
  assert.match(wide, /CUSTOMER/);

  const medium = stripAnsi(renderToString(createSupportDeskView({ state, width: 150, height: 38 }), { width: 150, height: 38 }));
  assert.match(medium, /INBOX/);
  assert.match(medium, /TICKET TCK/);
  assert.doesNotMatch(medium, /TICKET PROPERTIES/);

  const narrow = stripAnsi(renderToString(createSupportDeskView({ state, width: 96, height: 34 }), { width: 96, height: 34 }));
  assert.match(narrow, /Support Triage Desk/);
  assert.match(narrow, /COMMAND/);
  assert.doesNotMatch(narrow, /TICKET PROPERTIES/);
});

test('support desk supports realistic ticket workflow commands and confirmation', () => {
  const state = createSupportDeskState();
  executeSupportCommand(state, '/ticket TCK-1045');
  assert.equal(getSelectedTicket(state).id, 'TCK-1045');

  executeSupportCommand(state, '/assign me');
  executeSupportCommand(state, '/priority urgent');
  executeSupportCommand(state, '/status pending');
  executeSupportCommand(state, '/tag escalation-candidate');
  assert.equal(getSelectedTicket(state).assignee, 'Alex');
  assert.equal(getSelectedTicket(state).priority, 'Urgent');
  assert.equal(getSelectedTicket(state).status, 'pending');
  assert.ok(getSelectedTicket(state).tags.includes('escalation-candidate'));

  executeSupportCommand(state, '/escalate platform');
  assert.equal(state.modes.current(), 'confirm');
  handleSupportDeskKey({ key: { name: 'enter' }, state });
  assert.equal(getSelectedTicket(state).escalatedTo, 'platform');
  assert.ok(getSelectedTicket(state).timeline.some((event) => event.type === 'escalation'));
});

test('support desk reply composer sends customer replies and updates timeline', () => {
  const state = createSupportDeskState();
  executeSupportCommand(state, '/reply template refund');
  assert.equal(state.modes.current(), 'reply');
  assert.match(state.composer.value, /duplicate charge/);
  handleSupportDeskKey({ key: { name: 'enter' }, state });
  const ticket = getSelectedTicket(state);
  assert.equal(state.modes.current(), 'browse');
  assert.equal(ticket.status, 'pending');
  assert.equal(ticket.messages.at(-1).role, 'agent');
  assert.ok(ticket.timeline.some((event) => event.type === 'agent_reply'));
});

test('support desk filters, theme switching and live tick state are pure-testable', () => {
  const state = createSupportDeskState();
  executeSupportCommand(state, '/filter queue platform');
  assert.ok(getVisibleTickets(state).every((ticket) => ticket.queue === 'Platform'));

  executeSupportCommand(state, '/theme support-paper');
  assert.equal(state.themeName, 'support-paper');

  state.pipeline = { status: 'running', progress: 96, label: 'escalating' };
  tickSupportDesk(state);
  assert.equal(state.pipeline.status, 'complete');
});


test('support desk only renders the third context column in truly wide terminals', () => {
  const state = createSupportDeskState();
  for (const width of [119, 140, 179]) {
    const output = stripAnsi(renderToString(createSupportDeskView({ state, width, height: 38 }), { width, height: 38 }));
    assert.doesNotMatch(output, /TICKET PROPERTIES/);
  }

  const wide = stripAnsi(renderToString(createSupportDeskView({ state, width: 180, height: 42 }), { width: 180, height: 42 }));
  assert.match(wide, /TICKET PROPERTIES/);
  assert.match(wide, /ACTIONS/);
});

test('support desk keeps bottom panels pinned to the viewport bottom when content is short', () => {
  const state = createSupportDeskState();
  state.toasts.clear?.();
  const output = stripAnsi(renderToString(createSupportDeskView({ state, width: 180, height: 54 }), { width: 180, height: 54 }));
  const lines = output.split('\n');
  assert.match(lines.at(-1), /Connected/);
  assert.match(lines.slice(-8).join('\n'), /COMMAND/);
  assert.match(lines.slice(-8).join('\n'), /ACTIVITY FEED/);
  assert.notEqual(lines.at(-1)?.trim(), '');
});


test('support desk starts without a prefilled command and opens slash suggestions explicitly', () => {
  const state = createSupportDeskState();
  assert.equal(state.input.value, '');
  assert.equal(state.commandActive, false);

  handleSupportDeskKey({ key: { name: '/', printable: true, text: '/' }, state });
  assert.equal(state.commandActive, true);
  assert.equal(state.input.value, '/');
  assert.ok(getSlashSuggestions(state).some((item) => item.insert.startsWith('/reply')));

  handleSupportDeskKey({ key: { name: 'down' }, state });
  assert.equal(state.commandSuggestionIndex, 1);

  handleSupportDeskKey({ key: { name: 'tab' }, state });
  assert.match(state.input.value, /^\//);
});

test('support desk ignores normal printable keys in browse mode to avoid accidental jumps', () => {
  const state = createSupportDeskState();
  const beforeMode = state.modes.current();
  const beforeTab = state.activeTab;
  handleSupportDeskKey({ key: { name: 'r', printable: true, text: 'r' }, state });
  assert.equal(state.modes.current(), beforeMode);
  assert.equal(state.activeTab, beforeTab);
  assert.equal(state.commandActive, false);
});

test('support desk focus zones and activity pagination are keyboard reachable', () => {
  const state = createSupportDeskState();
  const runtime = { output: { columns: 200 } };
  handleSupportDeskKey({ key: { name: 'tab' }, state, runtime });
  assert.equal(state.focus, 'work');
  handleSupportDeskKey({ key: { name: 'tab' }, state, runtime });
  assert.equal(state.focus, 'rail');
  handleSupportDeskKey({ key: { name: 'tab', shift: true }, state, runtime });
  assert.equal(state.focus, 'work');
  handleSupportDeskKey({ key: { name: ']', printable: true, text: ']' }, state, runtime });
  assert.equal(state.activeTab, 'reply');

  executeSupportCommand(state, '/activity');
  assert.equal(state.activeTab, 'activity');
  assert.equal(state.focus, 'activity');
  handleSupportDeskKey({ key: { name: 'down' }, state, runtime });
  assert.equal(state.activitySelectedIndex, 1);
  handleSupportDeskKey({ key: { name: 'page-down' }, state, runtime });
  assert.ok(state.activityPage >= 0);
});
