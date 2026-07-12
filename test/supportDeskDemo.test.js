import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString, stripAnsi, visibleLength } from '../src/lib/index.js';
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

function key(state, name, extra = {}, runtime = { output: { columns: 136, rows: 39 } }) {
  handleSupportDeskKey({ key: { name, ...extra }, state, runtime });
}

function type(state, value, runtime) {
  for (const char of value) key(state, char, { text: char, printable: true }, runtime);
}

function render(state, width = 136, height = 39) {
  return stripAnsi(renderToString(createSupportDeskView({ state, width, height }), { width, height }));
}

test('support desk opens on a clear Inbox-first workflow at common terminal sizes', () => {
  for (const [width, height] of [[80, 24], [96, 30], [120, 35], [136, 39], [160, 40], [200, 42]]) {
    const state = createSupportDeskState();
    const output = render(state, width, height);
    const lines = output.split('\n');
    assert.equal(lines.length, height);
    assert.ok(lines.every((line) => visibleLength(line) <= width));
    assert.match(output, /Support Triage Desk/);
    assert.match(output, /\[Inbox\]/);
    assert.match(output, /CONTROLS/);
    assert.match(output, /\[\/\] tabs/);
    assert.doesNotMatch(output, /TABS FOCUSED|COMMAND MODE.*focus/i);
  }
});

test('support desk keeps the main panes aligned above the docked controls', () => {
  const state = createSupportDeskState();
  const output = render(state, 136, 39);
  const lines = output.split('\n');
  const controlsRow = lines.findIndex((line) => line.includes('CONTROLS'));
  assert.ok(controlsRow > 0);
  assert.match(lines[controlsRow - 1], /^└.*┘  └.*┘\s*$/);
});

test('support desk keeps Inbox compact and moves contextual hints to the bottom control panel', () => {
  const state = createSupportDeskState();
  const output = render(state, 136, 39);
  const inboxStart = output.indexOf('INBOX');
  const controlsStart = output.indexOf('CONTROLS');
  const inboxText = output.slice(inboxStart, controlsStart);
  assert.doesNotMatch(inboxText, /Keys:|Scroll: focused panes|←\/→ choose/);
  assert.match(output.slice(controlsStart), /Inbox:/);
  assert.match(output.slice(controlsStart), /Options:/);
});

test('support desk windows Inbox controls so the selected control remains fully visible', () => {
  for (const width of [80, 96, 120, 136]) {
    const state = createSupportDeskState();
    for (let index = 0; index < 4; index += 1) key(state, 'right', {}, { output: { columns: width, rows: 30 } });
    const output = render(state, width, 30);
    const line = output.split('\n').find((item) => item.includes('Inbox:')) ?? '';
    assert.match(line, /\[Sort:updated\]/);
    assert.ok(visibleLength(line) <= width);
  }
});

test('Inbox filter and option viewports keep a centered divider as labels change length', () => {
  for (const width of [80, 96, 120, 136]) {
    const dividerColumns = [];
    for (const priority of ['high', 'medium', 'urgent', 'low']) {
      const state = createSupportDeskState();
      state.inboxControl = 'priority';
      state.filter.priority = priority;
      const line = render(state, width, 30).split('\n').find((item) => item.includes('Inbox:')) ?? '';
      const separators = Array.from(line).reduce((columns, char, index) => char === '│' ? [...columns, index] : columns, []);
      assert.equal(separators.length, 3);
      dividerColumns.push(separators[1]);
      assert.match(line, new RegExp(`\\[Priority:${priority}\\]`));
      assert.match(line, new RegExp(`\\[${priority}\\]`));
      assert.ok(visibleLength(line) <= width);
    }
    assert.equal(new Set(dividerColumns).size, 1);
  }
});

test('Inbox arrows navigate tickets only on Tickets and change the selected filter otherwise', () => {
  const state = createSupportDeskState();
  const first = getSelectedTicket(state).id;
  key(state, 'down');
  assert.notEqual(getSelectedTicket(state).id, first);

  key(state, 'right'); // Queue control
  assert.equal(state.inboxControl, 'queue');
  key(state, 'down');
  assert.equal(state.filter.queue, 'billing');
  assert.equal(state.inboxControl, 'queue');
  assert.equal(getSelectedTicket(state).queue, 'Billing');
  assert.notEqual(getSelectedTicket(state).id, '');

  key(state, 'up');
  assert.equal(state.filter.queue, 'all');
  assert.equal(state.inboxControl, 'queue');
  assert.ok(state.selectedTicketId);

  key(state, 'enter');
  assert.equal(state.inboxControl, 'tickets');
  assert.equal(state.activeTab, 'inbox');
  assert.equal(state.focus, 'inbox');
});

test('tabs are switched with brackets and are never part of the Tab focus cycle', () => {
  const state = createSupportDeskState();
  const runtime = { output: { columns: 200, rows: 42 } };
  key(state, ']', { text: ']', printable: true }, runtime);
  assert.equal(state.activeTab, 'ticket');
  assert.equal(state.focus, 'work');
  key(state, 'tab', {}, runtime);
  assert.equal(state.focus, 'rail');
  key(state, 'tab', {}, runtime);
  assert.equal(state.focus, 'inbox');
  assert.notEqual(state.focus, 'tabs');
  assert.notEqual(state.focus, 'command');
});

test('slash command mode preserves pane ownership and non-navigation commands return to it', () => {
  const state = createSupportDeskState();
  executeSupportCommand(state, '/ticket TCK-1045');
  assert.equal(state.activeTab, 'ticket');
  assert.equal(state.focus, 'work');

  key(state, '/', { text: '/', printable: true });
  assert.equal(state.commandActive, true);
  assert.equal(state.focus, 'work');
  type(state, 'theme paper');
  key(state, 'enter');
  assert.equal(state.commandActive, false);
  assert.equal(state.themeName, 'paper');
  assert.equal(state.activeTab, 'ticket');
  assert.equal(state.focus, 'work');
});

test('navigation commands may intentionally change tab and focus after slash execution', () => {
  const state = createSupportDeskState();
  executeSupportCommand(state, '/ticket TCK-1045');
  key(state, '/', { text: '/', printable: true });
  type(state, 'filter queue billing');
  key(state, 'enter');
  assert.equal(state.filter.queue, 'billing');
  assert.equal(state.activeTab, 'inbox');
  assert.equal(state.focus, 'inbox');
});

test('Esc cancels slash command mode and returns to Inbox', () => {
  const state = createSupportDeskState();
  executeSupportCommand(state, '/ticket TCK-1045');
  key(state, '/', { text: '/', printable: true });
  type(state, 'sta');
  key(state, 'escape');
  assert.equal(state.commandActive, false);
  assert.equal(state.input.value, '');
  assert.equal(state.activeTab, 'inbox');
  assert.equal(state.focus, 'inbox');
  assert.equal(state.inboxControl, 'tickets');
});

test('command palette executes an action directly instead of leaving a command focus behind', () => {
  const state = createSupportDeskState();
  key(state, 'command-palette');
  assert.equal(state.modes.current(), 'palette');
  // First product action is Assign to me.
  key(state, 'enter');
  assert.equal(state.modes.current(), 'browse');
  assert.equal(state.commandActive, false);
  assert.equal(getSelectedTicket(state).assignee, 'Alex');
  assert.equal(state.activeTab, 'ticket');
  assert.equal(state.focus, 'work');
});

test('Enter in a ticket no longer silently opens Reply', () => {
  const state = createSupportDeskState();
  executeSupportCommand(state, '/ticket TCK-1042');
  key(state, 'enter');
  assert.equal(state.modes.current(), 'browse');
  assert.equal(state.activeTab, 'ticket');
  assert.equal(state.focus, 'work');
});

test('Ctrl+R opens Reply, sending keeps the same ticket anchored, and a second Enter is inert', () => {
  const state = createSupportDeskState();
  executeSupportCommand(state, '/ticket TCK-1042');
  const ticketId = getSelectedTicket(state).id;
  key(state, 'r', { text: 'r', printable: true, ctrl: true });
  assert.equal(state.modes.current(), 'reply');
  assert.equal(state.focus, 'composer');
  assert.equal(getSelectedTicket(state).id, ticketId);

  key(state, 'enter');
  assert.equal(state.modes.current(), 'browse');
  assert.equal(state.activeTab, 'ticket');
  assert.equal(state.focus, 'work');
  assert.equal(getSelectedTicket(state).id, ticketId);

  key(state, 'enter');
  assert.equal(state.modes.current(), 'browse');
  assert.equal(getSelectedTicket(state).id, ticketId);
});

test('ticket identity remains stable when workflow actions change updated order or visibility', () => {
  const state = createSupportDeskState();
  executeSupportCommand(state, '/ticket TCK-1045');
  const id = getSelectedTicket(state).id;
  executeSupportCommand(state, '/assign me');
  executeSupportCommand(state, '/status pending');
  executeSupportCommand(state, '/priority urgent');
  assert.equal(getSelectedTicket(state).id, id);
  assert.equal(getSelectedTicket(state).assignee, 'Alex');
  assert.equal(getSelectedTicket(state).status, 'pending');
  assert.equal(getSelectedTicket(state).priority, 'Urgent');
});

test('opening a ticket does not reset active filters or add an update event that reorders the queue', () => {
  const state = createSupportDeskState();
  executeSupportCommand(state, '/filter queue billing');
  const before = getVisibleTickets(state).map((ticket) => ticket.id);
  const target = before[0];
  executeSupportCommand(state, `/ticket ${target}`);
  assert.equal(state.filter.queue, 'billing');
  assert.equal(getSelectedTicket(state).id, target);
  assert.deepEqual(getVisibleTickets(state).map((ticket) => ticket.id), before);
});

test('activity selection keeps the Activity pane focused and follows the selected page', () => {
  const state = createSupportDeskState();
  executeSupportCommand(state, '/ticket TCK-1042');
  for (const status of ['pending', 'open', 'pending', 'open', 'pending', 'open', 'pending', 'open']) {
    executeSupportCommand(state, `/status ${status}`);
  }
  executeSupportCommand(state, '/activity');
  assert.equal(state.activeTab, 'activity');
  assert.equal(state.focus, 'work');
  for (let index = 0; index < 8; index += 1) key(state, 'down', {}, { output: { columns: 136, rows: 39 } });
  assert.equal(state.focus, 'work');
  assert.ok(state.activitySelectedIndex > 0);
  assert.ok(state.activityPage >= 1);
  const output = render(state, 136, 39);
  assert.match(output, /▶ ACTIVITY TIMELINE/);
  assert.match(output, /›/);
});

test('Customer tab owns a scrollable work pane', () => {
  const state = createSupportDeskState();
  state.tickets[0].summary = Array.from({ length: 30 }, (_, index) => `Long customer context segment ${index + 1}`).join(' ');
  executeSupportCommand(state, '/customer');
  state.viewport = { width: 80, height: 22 };
  key(state, 'page-down', {}, { output: { columns: 80, rows: 22 } });
  assert.equal(state.activeTab, 'customer');
  assert.equal(state.focus, 'work');
  assert.ok(state.scroll.customer > 0);
  const output = render(state, 80, 22);
  assert.match(output, /CUSTOMER PROFILE/);
  assert.match(output, /PgUp\/PgDn/);
});

test('support desk reply composer supports multiline editing and Esc returns to Inbox', () => {
  const state = createSupportDeskState();
  executeSupportCommand(state, '/reply');
  type(state, 'Hi');
  key(state, 'enter', { ctrl: true });
  type(state, 'there');
  assert.equal(state.composer.value, 'Hi\nthere');
  key(state, 'escape');
  assert.equal(state.modes.current(), 'browse');
  assert.equal(state.activeTab, 'inbox');
  assert.equal(state.focus, 'inbox');
});

test('support desk supports workflow confirmations and preserves the selected ticket', () => {
  const state = createSupportDeskState();
  executeSupportCommand(state, '/ticket TCK-1045');
  const id = getSelectedTicket(state).id;
  executeSupportCommand(state, '/escalate platform');
  assert.equal(state.modes.current(), 'confirm');
  key(state, 'enter');
  assert.equal(getSelectedTicket(state).id, id);
  assert.equal(getSelectedTicket(state).escalatedTo, 'platform');
});

test('support desk exposes argument completion for commands and incomplete arguments', () => {
  const state = createSupportDeskState();
  state.input.set('/status ');
  assert.ok(getSlashSuggestions(state).some((item) => item.insert === '/status pending'));
  state.input.set('/sort ');
  assert.ok(getSlashSuggestions(state).some((item) => item.insert === '/sort priority'));
  state.input.set('/filter status ');
  assert.ok(getSlashSuggestions(state).some((item) => item.insert === '/filter status solved'));

  key(state, '/', { text: '/', printable: true });
  type(state, 'status ');
  key(state, 'down');
  key(state, 'enter');
  assert.match(state.input.value, /^\/status /);
  assert.equal(state.commandActive, true);
});

test('ticket and context panes clamp scrolling at their boundaries', () => {
  const state = createSupportDeskState();
  const runtime = { output: { columns: 180, rows: 42 } };
  executeSupportCommand(state, '/ticket TCK-1042');
  for (let index = 0; index < 30; index += 1) key(state, 'down', {}, runtime);
  const maxed = state.scroll.ticketThread;
  key(state, 'down', {}, runtime);
  assert.equal(state.scroll.ticketThread, maxed);

  key(state, 'tab', {}, runtime);
  assert.equal(state.focus, 'rail');
  key(state, 'page-down', {}, runtime);
  assert.ok(state.scroll.rail >= 0);
});

test('live ticket injection preserves the selected ticket by id', () => {
  const state = createSupportDeskState();
  key(state, 'down');
  const selectedId = getSelectedTicket(state).id;
  const beforeTickets = state.tickets.length;
  for (let index = 0; index < 32; index += 1) tickSupportDesk(state);
  assert.equal(state.tickets.length, beforeTickets + 1);
  assert.equal(getSelectedTicket(state).id, selectedId);
});

test('bare q is harmless while Ctrl+Q exits', () => {
  const state = createSupportDeskState();
  const runtime = { output: { columns: 136, rows: 39 }, exitCode: null, exit(code) { this.exitCode = code; } };
  key(state, 'q', { text: 'q', printable: true }, runtime);
  assert.equal(runtime.exitCode, null);
  key(state, 'q', { text: 'q', printable: true, ctrl: true }, runtime);
  assert.equal(runtime.exitCode, 0);
});

test('normal printable keys remain inert in browse mode', () => {
  const state = createSupportDeskState();
  const before = { tab: state.activeTab, focus: state.focus, id: getSelectedTicket(state).id };
  key(state, 'x', { text: 'x', printable: true });
  assert.deepEqual({ tab: state.activeTab, focus: state.focus, id: getSelectedTicket(state).id }, before);
});

test('help reflects bracket tabs, pane focus, command return and Ctrl+Q', () => {
  const state = createSupportDeskState();
  executeSupportCommand(state, '/help');
  const output = render(state, 120, 32);
  assert.match(output, /Support Desk Help/);
  assert.match(output, /never tabs or commands/);
  assert.match(output, /return to Inbox/);
  assert.doesNotMatch(output, /q Quit/);
});


test('real Ctrl+R, Ctrl+N and Ctrl+Q parser output drives Support Desk shortcuts', async () => {
  const { parseKey } = await import('../src/lib/index.js');
  const runtime = { output: { columns: 136, rows: 39 }, exitCode: null, exit(code) { this.exitCode = code; } };

  const replyState = createSupportDeskState();
  executeSupportCommand(replyState, '/ticket TCK-1042');
  handleSupportDeskKey({ key: parseKey('\x12'), state: replyState, runtime });
  assert.equal(replyState.modes.current(), 'reply');

  const noteState = createSupportDeskState();
  executeSupportCommand(noteState, '/ticket TCK-1042');
  handleSupportDeskKey({ key: parseKey('\x0e'), state: noteState, runtime });
  assert.equal(noteState.modes.current(), 'note');

  const quitState = createSupportDeskState();
  handleSupportDeskKey({ key: parseKey('\x11'), state: quitState, runtime });
  assert.equal(runtime.exitCode, 0);
});

test('live events preserve the current workspace values and show a toast', () => {
  const state = createSupportDeskState();
  executeSupportCommand(state, '/ticket TCK-1042');
  executeSupportCommand(state, '/activity');
  state.activitySelectedIndex = 2;
  state.activityPage = 0;
  state.scroll.ticketThread = 1;
  const selectedTicketId = state.selectedTicketId;
  const selectedEventId = state.globalTimeline[0]?.id;
  state.highlightedEventId = selectedEventId;
  const before = {
    tab: state.activeTab,
    focus: state.focus,
    control: state.inboxControl,
    filter: { ...state.filter },
    sort: state.sort,
    scroll: { ...state.scroll },
    highlighted: state.highlightedEventId,
  };

  for (let index = 0; index < 32; index += 1) tickSupportDesk(state);

  assert.equal(state.selectedTicketId, selectedTicketId);
  assert.equal(state.activeTab, before.tab);
  assert.equal(state.focus, before.focus);
  assert.equal(state.inboxControl, before.control);
  assert.deepEqual(state.filter, before.filter);
  assert.equal(state.sort, before.sort);
  assert.deepEqual(state.scroll, before.scroll);
  assert.equal(state.highlightedEventId, before.highlighted);
  assert.match(state.toasts.toast?.message ?? '', /New .* ticket TCK-/);
});

test('Support Desk inherits the standard theme catalog without support prefixes', async () => {
  const { themes } = await import('../src/lib/index.js');
  const { SUPPORT_THEME_NAMES } = await import('../examples/support-desk/themes.js');
  assert.deepEqual(SUPPORT_THEME_NAMES, Object.keys(themes));
  assert.ok(SUPPORT_THEME_NAMES.includes('ocean'));
  assert.ok(SUPPORT_THEME_NAMES.includes('paper'));
  assert.ok(SUPPORT_THEME_NAMES.every((name) => !name.startsWith('support-')));
});

test('Ticket scrolling moves only the THREAD viewport and keeps actions visible', () => {
  const state = createSupportDeskState();
  const ticket = state.tickets.find((item) => item.id === 'TCK-1042') ?? state.tickets[0];
  ticket.messages = Array.from({ length: 18 }, (_, index) => ({
    id: `scroll-${index}`,
    role: index % 2 ? 'agent' : 'customer',
    author: index % 2 ? 'Alex' : ticket.customer.contact,
    body: `Thread message ${index + 1} with enough content to occupy the conversation viewport.`,
    time: new Date(Date.now() + index * 1000).toISOString(),
  }));
  executeSupportCommand(state, `/ticket ${ticket.id}`);
  const before = render(state, 136, 39);
  assert.match(before, /Actions: Ctrl\+R Reply · Ctrl\+N Note/);
  key(state, 'page-up');
  assert.ok(state.scroll.ticketThread > 0);
  const after = render(state, 136, 39);
  assert.match(after, /Actions: Ctrl\+R Reply · Ctrl\+N Note/);
  assert.match(after, /THREAD/);
  assert.notEqual(after, before);
  key(state, 'end');
  assert.equal(state.scroll.ticketThread, 0);
});
