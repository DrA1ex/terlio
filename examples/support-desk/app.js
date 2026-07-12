import {
  InputEditor,
  ModeManager,
  createCommandPaletteState,
  createToastManager,
  handleCommandPaletteKey,
  isPrintable,
  scrollBy,
  normalizeScrollMap,
} from '../../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from '../_demoRuntime.js';
import { createSupportTickets, createInitialTimeline } from './data.js';
import { createSupportDeskView, getSupportScrollMax } from './views.js';
import { createSupportPaletteItems, createSupportCommandRegistry, executeSupportCommand, getSupportSlashSuggestions } from './commands.js';
import {
  applyConfirm,
  cancelComposer,
  cancelConfirm,
  getSelectedTicket,
  getVisibleTickets,
  moveActivityPage,
  openTicket,
  selectActivityByDelta,
  selectTicketByDelta,
  setFilter,
  setSort,
  startNote,
  startReply,
  submitComposer,
  submitFieldEdit,
  tickSupportDesk,
} from './reducers.js';

const SUPPORT_TABS = ['inbox', 'ticket', 'reply', 'customer', 'activity'];
const INBOX_CONTROLS = ['tickets', 'queue', 'priority', 'status', 'sort'];
const INBOX_VALUES = {
  queue: ['all', 'billing', 'product', 'auth', 'platform'],
  priority: ['all', 'urgent', 'high', 'medium', 'low'],
  status: ['all', 'open', 'pending', 'snoozed', 'solved', 'closed'],
  sort: ['updated', 'sla', 'priority', 'status', 'queue'],
};

export function createSupportDeskState() {
  const registry = createSupportCommandRegistry();
  const tickets = createSupportTickets();
  const state = {
    agent: 'Alex',
    tickets,
    selectedIndex: 0,
    selectedTicketId: tickets[0]?.id ?? '',
    activeTab: 'inbox',
    focus: 'inbox',
    inboxControl: 'tickets',
    sort: 'updated',
    filter: { text: '', queue: 'all', priority: 'all', status: 'all' },
    input: new InputEditor(''),
    commandActive: false,
    commandSuggestionIndex: 0,
    commandReturn: null,
    paletteReturn: null,
    composer: new InputEditor(''),
    reply: null,
    fieldEditor: new InputEditor(''),
    composerMode: 'reply',
    composerTemplate: '',
    editField: '',
    modes: new ModeManager('browse'),
    confirmSelected: 'confirm',
    pendingConfirm: null,
    palette: createCommandPaletteState({ items: createSupportPaletteItems() }),
    registry,
    toasts: createToastManager({
      level: 'info',
      message: 'Use ↑/↓ for tickets, [/] for tabs, / for commands, and Esc to return to Inbox.',
      ttl: 3,
    }),
    actionLog: [],
    lastWorkflowAction: '',
    globalTimeline: createInitialTimeline(),
    highlightedEventId: '',
    activityPage: 0,
    activitySelectedIndex: 0,
    liveSequence: 0,
    viewport: { width: 118, height: 34 },
    scroll: { ticketThread: 0, reply: 0, rail: 0, customer: 0 },
    themeName: 'ocean',
    frame: 0,
    pipeline: { status: 'idle', progress: 0, label: '' },
  };
  state.reply = state.composer;
  state.palette = createCommandPaletteState({ items: createSupportPaletteItems(state) });
  return state;
}

export { createSupportDeskView, executeSupportCommand, getSelectedTicket };
export { getVisibleTickets } from './reducers.js';
export { SUPPORT_COMMANDS } from './commands.js';

export function handleSupportDeskKey({ key, state, runtime }) {
  updateViewport(state, runtime);
  if (key.name === 'redraw') return;

  if (state.commandActive) return handleSlashCommandKey(key, state);

  const mode = state.modes.current();
  if (mode === 'confirm') return handleConfirmKey(key, state);
  if (mode === 'palette') return handlePaletteKey(key, state);
  if (mode === 'help') return handleHelpKey(key, state);
  if (mode === 'reply' || mode === 'note') return handleComposerKey(key, state);
  if (mode === 'edit') return handleEditKey(key, state);

  if (key.name === 'command-palette') return openPalette(state);
  if (key.printable && key.text === '/') return activateSlashCommand(state);
  if (key.name === 'escape') return returnToInbox(state, 'Returned to Inbox.');
  if (key.name === '?' || (key.printable && key.text === '?')) return state.modes.push('help');
  if (key.ctrl && (key.name === 'q' || key.text === 'q')) return runtime?.exit?.(0);

  if (key.printable && (key.text === ']' || key.text === '[')) return switchTab(state, key.text === ']' ? 1 : -1);
  if (key.ctrl && (key.name === 'r' || key.text === 'r')) return startReply(state, suggestedTemplate(getSelectedTicket(state)));
  if (key.ctrl && (key.name === 'n' || key.text === 'n')) return startNote(state);
  if (key.name === 'tab') return cycleFocus(state, key.shift ? -1 : 1, runtime);

  if (state.focus === 'rail') return handleRailFocusKey(key, state);
  if (state.focus === 'inbox') return handleInboxFocusKey(key, state);
  if (state.focus === 'work') return handleWorkFocusKey(key, state);

  // Printable keys are intentionally ignored in browse mode. Slash opens the
  // command surface without stealing the current pane selection.
}

export function runSupportDeskDemo() {
  return runInteractiveDemo({
    title: 'Support Desk',
    state: createSupportDeskState(),
    render: createSupportDeskView,
    onKey: handleSupportDeskKey,
    onTick: ({ state, runtime }) => {
      updateViewport(state, runtime);
      tickSupportDesk(state);
      clampAllScrolls(state);
    },
    tickMs: 250,
  });
}

function updateViewport(state, runtime) {
  if (!runtime?.output) return;
  state.viewport = {
    width: Number(runtime.output.columns) || state.viewport?.width || 118,
    height: Number(runtime.output.rows) || state.viewport?.height || 34,
  };
}

function openPalette(state) {
  state.paletteReturn = captureLocation(state);
  state.palette = createCommandPaletteState({ items: createSupportPaletteItems(state) });
  state.modes.push('palette');
}

function handlePaletteKey(key, state) {
  const result = handleCommandPaletteKey(state.palette, key);
  if (key.name === 'escape' || result?.type === 'cancel') {
    if (state.modes.current() === 'palette') state.modes.pop();
    state.paletteReturn = null;
    return returnToInbox(state, 'Palette closed. Returned to Inbox.');
  }
  if (result?.type !== 'accept' || !result.item) return;

  const selected = result.item.value ?? result.item;
  const command = selected.command ?? selected.value ?? '';
  const origin = state.paletteReturn ?? captureLocation(state);
  if (state.modes.current() === 'palette') state.modes.pop();
  state.paletteReturn = null;
  executeCommandWithReturn(state, command, origin);
}

function handleHelpKey(key, state) {
  if (key.name === 'escape' || key.name === 'enter' || key.name === '?' || key.text === '?') state.modes.pop();
}

function handleConfirmKey(key, state) {
  if (key.name === 'escape') {
    cancelConfirm(state);
    return returnToInbox(state, 'Action cancelled. Returned to Inbox.');
  }
  if (key.name === 'left' || key.name === 'right' || key.name === 'tab') {
    state.confirmSelected = state.confirmSelected === 'confirm' ? 'cancel' : 'confirm';
    return;
  }
  if (key.name === 'enter') {
    if (state.confirmSelected === 'confirm') applyConfirm(state);
    else cancelConfirm(state);
  }
}

function handleComposerKey(key, state) {
  if (key.name === 'escape') {
    cancelComposer(state);
    return returnToInbox(state, 'Composer cancelled. Returned to Inbox.');
  }
  if (isPanelScrollKey(key)) return scrollState(state, 'reply', panelScrollDelta(key));
  if (key.name === 'enter' && (key.shift || key.ctrl)) {
    state.composer.insertLineBreak();
    state.scroll.reply = clampScroll(state, 'reply', Number(state.scroll?.reply) || 0);
    return;
  }
  if (key.name === 'enter') return submitComposer(state);
  editInput(state.composer, key, { multiline: true });
}

function handleEditKey(key, state) {
  if (key.name === 'escape') {
    state.fieldEditor.clear();
    state.editField = '';
    if (state.modes.current() === 'edit') state.modes.pop();
    return returnToInbox(state, 'Edit cancelled. Returned to Inbox.');
  }
  if (key.name === 'enter') return submitFieldEdit(state);
  editInput(state.fieldEditor, key);
}

function activateSlashCommand(state) {
  state.commandReturn = captureLocation(state);
  state.commandActive = true;
  state.input.set('/');
  state.commandSuggestionIndex = 0;
}

function deactivateSlashCommand(state, { clear = true } = {}) {
  state.commandActive = false;
  if (clear) state.input.clear();
  state.commandSuggestionIndex = 0;
}

function handleSlashCommandKey(key, state) {
  if (key.name === 'escape') {
    deactivateSlashCommand(state);
    state.commandReturn = null;
    return returnToInbox(state, 'Command cancelled. Returned to Inbox.');
  }

  const suggestions = getSlashSuggestions(state);
  if (key.name === 'up') return moveCommandSelection(state, -1);
  if (key.name === 'down') return moveCommandSelection(state, 1);
  if (key.name === 'tab') return key.shift ? moveCommandSelection(state, -1) : applySelectedCommandSuggestion(state);

  if (key.name === 'enter') {
    const rawInput = state.input.value;
    const raw = rawInput.trim();
    if (!raw || raw === '/') return applySelectedCommandSuggestion(state);
    if (/\s$/.test(rawInput) && suggestions[state.commandSuggestionIndex]?.kind === 'argument') return applySelectedCommandSuggestion(state);
    if (shouldApplySuggestionInsteadOfExecuting(state, raw, suggestions)) return applySelectedCommandSuggestion(state);

    const origin = state.commandReturn ?? captureLocation(state);
    deactivateSlashCommand(state);
    state.commandReturn = null;
    executeCommandWithReturn(state, raw, origin);
    return;
  }

  editInput(state.input, key);
  if (!state.input.value.startsWith('/')) state.input.set(`/${state.input.value.replace(/^\/+/, '')}`);
  state.commandSuggestionIndex = 0;
}

function executeCommandWithReturn(state, raw, origin) {
  if (!raw) return;
  const before = captureLocation(state);
  const result = executeSupportCommand(state, raw);
  const after = captureLocation(state);
  const commandNavigated = locationChanged(before, after) || state.modes.current() !== 'browse';
  if (!commandNavigated && origin) restoreLocation(state, origin);
  return result;
}

function shouldApplySuggestionInsteadOfExecuting(state, raw, suggestions) {
  const body = raw.replace(/^\//, '').trim();
  if (!body) return true;
  if (body.includes(' ')) return false;
  const exact = state.registry.find(body);
  return !exact && suggestions.length > 0;
}

function moveCommandSelection(state, delta) {
  const suggestions = getSlashSuggestions(state);
  if (!suggestions.length) {
    state.commandSuggestionIndex = 0;
    return;
  }
  state.commandSuggestionIndex = mod(state.commandSuggestionIndex + delta, suggestions.length);
}

function applySelectedCommandSuggestion(state) {
  const suggestions = getSlashSuggestions(state);
  const item = suggestions[state.commandSuggestionIndex] ?? suggestions[0];
  if (!item) return;
  state.input.set(item.insert);
}

export function getSlashSuggestions(state) {
  return getSupportSlashSuggestions(state, state.input.value || '/');
}

function handleInboxFocusKey(key, state) {
  if (key.name === 'left') return cycleInboxControl(state, -1);
  if (key.name === 'right') return cycleInboxControl(state, 1);

  // Arrow ownership is contextual: when Tickets is selected they navigate the
  // queue; when a filter/sort control is selected they change that control's
  // value. Page and boundary keys always remain queue navigation shortcuts.
  if (key.name === 'up') {
    return state.inboxControl === 'tickets'
      ? selectTicketByDelta(state, -1)
      : cycleInboxControlValue(state, -1);
  }
  if (key.name === 'down') {
    return state.inboxControl === 'tickets'
      ? selectTicketByDelta(state, 1)
      : cycleInboxControlValue(state, 1);
  }
  if (key.name === 'page-up') return selectTicketByDelta(state, -5);
  if (key.name === 'page-down') return selectTicketByDelta(state, 5);
  if (key.name === 'home') return selectTicketBoundary(state, 'first');
  if (key.name === 'end') return selectTicketBoundary(state, 'last');
  if (key.name === 'enter') {
    if (state.inboxControl === 'tickets') return openTicket(state, getSelectedTicket(state).id);
    state.inboxControl = 'tickets';
    state.toasts.show('Filter selection complete. Ticket navigation restored.', 'info', 2);
  }
}

function handleActivityFocusKey(key, state) {
  if (key.name === 'up') return selectActivityByDelta(state, -1);
  if (key.name === 'down') return selectActivityByDelta(state, 1);
  if (key.name === 'page-up' || key.name === 'left') return moveActivityPage(state, -1);
  if (key.name === 'page-down' || key.name === 'right') return moveActivityPage(state, 1);
}

function handleWorkFocusKey(key, state) {
  if (state.activeTab === 'activity') return handleActivityFocusKey(key, state);
  if (state.activeTab === 'ticket') {
    // Thread scroll is tail-relative: 0 is the newest message, so moving up
    // increases the offset and moving down returns toward the latest message.
    if (key.name === 'up') return scrollState(state, 'ticketThread', 1);
    if (key.name === 'down') return scrollState(state, 'ticketThread', -1);
    if (key.name === 'page-up') return scrollState(state, 'ticketThread', 5);
    if (key.name === 'page-down') return scrollState(state, 'ticketThread', -5);
    if (key.name === 'home') return scrollState(state, 'ticketThread', getScrollMax(state, 'ticketThread'));
    if (key.name === 'end') return scrollState(state, 'ticketThread', -getScrollMax(state, 'ticketThread'));
    return;
  }
  if (state.activeTab === 'reply') {
    if (key.name === 'up') return scrollState(state, 'reply', -1);
    if (key.name === 'down') return scrollState(state, 'reply', 1);
    if (key.name === 'page-up') return scrollState(state, 'reply', -5);
    if (key.name === 'page-down') return scrollState(state, 'reply', 5);
    return;
  }
  if (state.activeTab === 'customer') {
    if (key.name === 'up') return scrollState(state, 'customer', -1);
    if (key.name === 'down') return scrollState(state, 'customer', 1);
    if (key.name === 'page-up') return scrollState(state, 'customer', -5);
    if (key.name === 'page-down') return scrollState(state, 'customer', 5);
  }
}

function handleRailFocusKey(key, state) {
  if (key.name === 'up') return scrollState(state, 'rail', -1);
  if (key.name === 'down') return scrollState(state, 'rail', 1);
  if (key.name === 'page-up') return scrollState(state, 'rail', -5);
  if (key.name === 'page-down') return scrollState(state, 'rail', 5);
}

function scrollState(state, key, delta) {
  state.scroll = state.scroll || {};
  const max = getScrollMax(state, key);
  state.scroll[key] = scrollBy(state.scroll[key] || 0, delta, max);
}

function clampAllScrolls(state) {
  state.scroll = normalizeScrollMap(state.scroll || {}, {
    ticketThread: getScrollMax(state, 'ticketThread'),
    reply: getScrollMax(state, 'reply'),
    rail: getScrollMax(state, 'rail'),
    customer: getScrollMax(state, 'customer'),
  });
}

function getScrollMax(state, key) {
  const width = Number(state.viewport?.width) || 118;
  const height = Number(state.viewport?.height) || 34;
  return getSupportScrollMax({ state, key, width, height });
}

function clampScroll(state, key, value) {
  return scrollBy(0, value, getScrollMax(state, key));
}

function isPanelScrollKey(key) {
  if (!key) return false;
  if ((key.name === 'up' || key.name === 'down') && (key.shift || key.ctrl || key.meta)) return true;
  if (key.name === 'page-up' || key.name === 'page-down') return true;
  return false;
}

function panelScrollDelta(key) {
  if (key.name === 'up' || key.name === 'page-up') return key.name === 'page-up' ? -5 : -1;
  if (key.name === 'down' || key.name === 'page-down') return key.name === 'page-down' ? 5 : 1;
  return 0;
}

function cycleFocus(state, delta, runtime) {
  const mode = runtime?.output?.columns ? currentViewportMode(runtime.output.columns) : currentViewportMode(state.viewport?.width || 118);
  const zones = state.activeTab === 'inbox'
    ? mode === 'wide' ? ['inbox', 'rail'] : ['inbox']
    : mode === 'wide'
      ? ['inbox', 'work', 'rail']
      : mode === 'medium'
        ? ['inbox', 'work']
        : ['work'];
  const current = Math.max(0, zones.indexOf(state.focus));
  state.focus = zones[mod(current + delta, zones.length)];
}

function currentViewportMode(width) {
  if (width >= 160) return 'wide';
  if (width >= 120) return 'medium';
  return 'narrow';
}

function switchTab(state, delta) {
  const current = Math.max(0, SUPPORT_TABS.indexOf(state.activeTab));
  state.activeTab = SUPPORT_TABS[mod(current + delta, SUPPORT_TABS.length)];
  state.focus = state.activeTab === 'inbox' ? 'inbox' : 'work';
  if (state.activeTab === 'customer') state.scroll.customer = 0;
  if (state.activeTab === 'activity') {
    state.activitySelectedIndex = 0;
    state.activityPage = 0;
  }
  state.toasts.show(`Tab: ${state.activeTab}.`, 'info', 2);
}

function suggestedTemplate(ticket) {
  if (ticket.tags.includes('billing')) return 'refund';
  if (ticket.tags.includes('export')) return 'export';
  if (ticket.tags.includes('safari')) return 'safari';
  if (ticket.tags.includes('webhook')) return 'webhook';
  return '';
}

function cycleInboxControl(state, delta) {
  const current = Math.max(0, INBOX_CONTROLS.indexOf(state.inboxControl || 'tickets'));
  state.inboxControl = INBOX_CONTROLS[mod(current + delta, INBOX_CONTROLS.length)];
}

function cycleInboxControlValue(state, delta) {
  const control = state.inboxControl || 'tickets';
  const values = INBOX_VALUES[control];
  if (!values) return;
  const currentValue = control === 'sort' ? state.sort : state.filter[control];
  const index = Math.max(0, values.indexOf(String(currentValue || values[0]).toLowerCase()));
  const next = values[mod(index + delta, values.length)];
  if (control === 'sort') setSort(state, next);
  else setFilter(state, { [control]: next });
  state.focus = 'inbox';
}

function selectTicketBoundary(state, edge) {
  const visible = getVisibleTickets(state);
  if (!visible.length) return;
  const index = edge === 'last' ? visible.length - 1 : 0;
  state.selectedIndex = index;
  state.selectedTicketId = visible[index].id;
}

function returnToInbox(state, message = '') {
  state.activeTab = 'inbox';
  state.focus = 'inbox';
  state.inboxControl = 'tickets';
  state.commandReturn = null;
  state.paletteReturn = null;
  if (message) state.toasts.show(message, 'info', 2);
}

function captureLocation(state) {
  return {
    activeTab: state.activeTab,
    focus: state.focus,
    selectedTicketId: state.selectedTicketId,
    selectedIndex: state.selectedIndex,
  };
}

function restoreLocation(state, location) {
  if (!location) return;
  state.activeTab = location.activeTab;
  state.focus = location.focus;
  state.selectedTicketId = location.selectedTicketId;
  state.selectedIndex = location.selectedIndex;
}

function locationChanged(before, after) {
  return before.activeTab !== after.activeTab
    || before.focus !== after.focus
    || before.selectedTicketId !== after.selectedTicketId;
}

function mod(value, size) {
  if (!size) return 0;
  return ((value % size) + size) % size;
}

function editInput(editor, key, { allowNewline = false, multiline = false } = {}) {
  if (key.name === 'left') return key.meta ? editor.moveWord(-1) : editor.move(-1);
  if (key.name === 'right') return key.meta ? editor.moveWord(1) : editor.move(1);
  if (multiline && key.name === 'up') return editor.moveVertical(-1);
  if (multiline && key.name === 'down') return editor.moveVertical(1);
  if (key.name === 'home' || (key.cmd && key.name === 'left')) return multiline ? editor.lineStart() : editor.home();
  if (key.name === 'end' || (key.cmd && key.name === 'right')) return multiline ? editor.lineEnd() : editor.end();
  if (key.name === 'backspace') return editor.backspace();
  if (key.name === 'delete') return editor.deleteForward();
  if (key.name === 'kill-end') return editor.killToEnd();
  if (key.name === 'kill-start') return editor.killToStart();
  if (key.name === 'delete-word-left') return editor.deleteWordBack();
  if (key.name === 'paste') return editor.insert(key.text);
  if (allowNewline && key.name === 'enter') return editor.insertLineBreak();
  if (key.printable || isPrintable(key.text)) return editor.insert(key.text);
}

if (isDirectRun(import.meta.url)) runSupportDeskDemo();
