import {
  InputEditor,
  ModeManager,
  createCommandPaletteState,
  createToastManager,
  handleCommandPaletteKey,
  isPrintable,
} from '../../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from '../_demoRuntime.js';
import { createSupportTickets, createInitialTimeline } from './data.js';
import { createSupportDeskView } from './views.js';
import { createSupportPaletteItems, createSupportCommandRegistry, executeSupportCommand } from './commands.js';
import {
  addTag,
  applyConfirm,
  assignTicket,
  cancelComposer,
  cancelConfirm,
  getSelectedTicket,
  getVisibleTickets,
  moveActivityPage,
  openTicket,
  selectActivityByDelta,
  selectTicketByDelta,
  setTicketPriority,
  setTicketStatus,
  startEditField,
  startNote,
  startReply,
  submitComposer,
  submitFieldEdit,
  tickSupportDesk,
} from './reducers.js';

export function createSupportDeskState() {
  const registry = createSupportCommandRegistry();
  const state = {
    agent: 'Alex',
    tickets: createSupportTickets(),
    selectedIndex: 0,
    activeTab: 'ticket',
    focus: 'inbox',
    sort: 'updated',
    filter: { text: '', queue: 'all', priority: 'all', status: 'all' },
    input: new InputEditor(''),
    commandActive: false,
    commandSuggestionIndex: 0,
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
    toasts: createToastManager({ level: 'info', message: 'Support desk ready. Press / for commands, Ctrl+P for palette, Tab to switch focus zones.', ttl: 7 }),
    actionLog: [],
    globalTimeline: createInitialTimeline(),
    highlightedEventId: '',
    activityPage: 0,
    activitySelectedIndex: 0,
    themeName: 'support-ocean',
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
  if (key.name === 'redraw') return;

  if (state.commandActive) return handleSlashCommandKey(key, state);

  const mode = state.modes.current();
  if (mode === 'confirm') return handleConfirmKey(key, state);
  if (mode === 'palette') return handlePaletteKey(key, state);
  if (mode === 'help') return handleHelpKey(key, state);
  if (mode === 'reply' || mode === 'note') return handleComposerKey(key, state);
  if (mode === 'edit') return handleEditKey(key, state);

  if (key.name === 'command-palette') {
    openPalette(state);
    return;
  }
  if (key.printable && key.text === '/') {
    activateSlashCommand(state);
    return;
  }
  if (key.name === 'escape') {
    state.toasts.show('Nothing to cancel. Press / for commands or Ctrl+P for palette.', 'info');
    return;
  }
  if (key.name === '?') {
    state.modes.push('help');
    return;
  }
  if (key.printable && key.text === 'q') return runtime?.exit?.(0);

  if (key.name === 'tab') return cycleFocus(state, key.shift ? -1 : 1, runtime);
  if (key.printable && (key.text === ']' || key.text === '[')) return switchTab(state, key.text === ']' ? 1 : -1);

  if (state.focus === 'tabs') return handleTabsFocusKey(key, state);
  if (state.focus === 'activity' || (state.activeTab === 'activity' && andFocusWork(state))) return handleActivityFocusKey(key, state);
  if (state.focus === 'inbox') return handleInboxFocusKey(key, state);
  if (state.focus === 'work') return handleWorkFocusKey(key, state);

  // Printable keys are intentionally ignored in browse mode. This avoids
  // accidental workflow jumps while the user is just trying to type. Press /
  // to explicitly enter slash-command mode.
}

export function runSupportDeskDemo() {
  return runInteractiveDemo({
    title: 'Support Desk',
    state: createSupportDeskState(),
    render: createSupportDeskView,
    onKey: handleSupportDeskKey,
    onTick: ({ state }) => tickSupportDesk(state),
    tickMs: 250,
  });
}

function openPalette(state) {
  state.reply = state.composer;
  state.palette = createCommandPaletteState({ items: createSupportPaletteItems(state) });
  state.modes.push('palette');
  state.toasts.show('Command palette opened.', 'info');
}

function handlePaletteKey(key, state) {
  const result = handleCommandPaletteKey(state.palette, key);
  if (key.name === 'escape') {
    state.modes.pop();
    state.toasts.show('Command palette closed.', 'info');
    return;
  }
  if (result?.type === 'accept' && result.item) {
    const selected = result.item.value ?? result.item;
    state.input.set(selected.command ?? selected.value ?? '');
    state.commandActive = true;
    state.focus = 'command';
    state.modes.pop();
    state.toasts.show(`Inserted ${state.input.value}. Press Enter to execute.`, 'success');
  }
}

function handleHelpKey(key, state) {
  if (key.name === 'escape' || key.name === 'enter' || key.name === '?') state.modes.pop();
}

function handleConfirmKey(key, state) {
  if (key.name === 'escape') return cancelConfirm(state);
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
  if (key.name === 'escape') return cancelComposer(state);
  if (key.name === 'enter') return submitComposer(state);
  editInput(state.composer, key, { allowNewline: key.shift || key.ctrl });
}

function handleEditKey(key, state) {
  if (key.name === 'escape') {
    state.fieldEditor.clear();
    state.editField = '';
    state.modes.pop();
    state.toasts.show('Edit cancelled.', 'info');
    return;
  }
  if (key.name === 'enter') return submitFieldEdit(state);
  editInput(state.fieldEditor, key);
}

function activateSlashCommand(state) {
  state.commandActive = true;
  state.focus = 'command';
  state.input.set('/');
  state.commandSuggestionIndex = 0;
}

function deactivateSlashCommand(state, { clear = true } = {}) {
  state.commandActive = false;
  if (clear) state.input.clear();
  state.commandSuggestionIndex = 0;
  if (state.focus === 'command') state.focus = 'work';
}

function handleSlashCommandKey(key, state) {
  if (key.name === 'escape') {
    deactivateSlashCommand(state);
    state.toasts.show('Command cancelled.', 'info');
    return;
  }

  const suggestions = getSlashSuggestions(state);
  if (key.name === 'up') return moveCommandSelection(state, -1);
  if (key.name === 'down') return moveCommandSelection(state, 1);
  if (key.name === 'tab') return key.shift ? moveCommandSelection(state, -1) : applySelectedCommandSuggestion(state);

  if (key.name === 'enter') {
    const raw = state.input.value.trim();
    if (!raw || raw === '/') return applySelectedCommandSuggestion(state);
    if (shouldApplySuggestionInsteadOfExecuting(state, raw, suggestions)) return applySelectedCommandSuggestion(state);
    executeSupportCommand(state, raw);
    deactivateSlashCommand(state);
    return;
  }

  editInput(state.input, key);
  if (!state.input.value.startsWith('/')) state.input.set(`/${state.input.value.replace(/^\/+/, '')}`);
  state.commandSuggestionIndex = 0;
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
  state.toasts.show(`Inserted ${item.insert}. Add arguments or press Enter.`, 'info');
}

export function getSlashSuggestions(state) {
  const query = state.input.value || '/';
  const suggestions = state.registry.suggestions(query).slice(0, 10);
  return suggestions.map((item) => {
    const example = item.entry?.examples?.[0];
    return {
      ...item,
      insert: example || `/${item.entry?.name ?? item.label.replace(/^\//, '')}`,
    };
  });
}

function handleInboxFocusKey(key, state) {
  if (key.name === 'up') return selectTicketByDelta(state, -1);
  if (key.name === 'down') return selectTicketByDelta(state, 1);
  if (key.name === 'page-up') return selectTicketByDelta(state, -5);
  if (key.name === 'page-down') return selectTicketByDelta(state, 5);
  if (key.name === 'enter') return openTicket(state, getSelectedTicket(state).id);
}

function handleTabsFocusKey(key, state) {
  if (key.name === 'left' || key.name === 'up') return switchTab(state, -1);
  if (key.name === 'right' || key.name === 'down') return switchTab(state, 1);
  if (key.name === 'enter') state.focus = 'work';
}

function handleActivityFocusKey(key, state) {
  if (key.name === 'up') return selectActivityByDelta(state, -1);
  if (key.name === 'down') return selectActivityByDelta(state, 1);
  if (key.name === 'page-up' || key.name === 'left') return moveActivityPage(state, -1);
  if (key.name === 'page-down' || key.name === 'right') return moveActivityPage(state, 1);
}

function handleWorkFocusKey(key, state) {
  if (state.activeTab === 'activity') return handleActivityFocusKey(key, state);
  if (state.activeTab === 'ticket' && key.name === 'enter') return startReply(state, suggestedTemplate(getSelectedTicket(state)));
}

function andFocusWork(state) {
  return state.focus === 'work';
}

function cycleFocus(state, delta, runtime) {
  const mode = runtime?.output?.columns ? currentViewportMode(runtime.output.columns) : 'medium';
  const zones = mode === 'wide'
    ? ['tabs', 'inbox', 'work', 'rail', 'activity']
    : mode === 'medium'
      ? ['tabs', 'inbox', 'work', 'activity']
      : ['tabs', 'work', 'activity'];
  const current = Math.max(0, zones.indexOf(state.focus));
  state.focus = zones[((current + delta) % zones.length + zones.length) % zones.length];
}

function currentViewportMode(width) {
  if (width >= 180) return 'wide';
  if (width >= 120) return 'medium';
  return 'narrow';
}

function switchTab(state, delta) {
  const tabs = ['inbox', 'ticket', 'reply', 'customer', 'activity'];
  const current = Math.max(0, tabs.indexOf(state.activeTab));
  state.activeTab = tabs[((current + delta) % tabs.length + tabs.length) % tabs.length];
  state.focus = state.focus === 'inbox' ? 'inbox' : 'work';
}

function suggestedTemplate(ticket) {
  if (ticket.tags.includes('billing')) return 'refund';
  if (ticket.tags.includes('export')) return 'export';
  if (ticket.tags.includes('safari')) return 'safari';
  if (ticket.tags.includes('webhook')) return 'webhook';
  return '';
}

function mod(value, size) {
  return ((value % size) + size) % size;
}

function editInput(editor, key, { allowNewline = false } = {}) {
  if (key.name === 'left') return key.meta ? editor.moveWord(-1) : editor.move(-1);
  if (key.name === 'right') return key.meta ? editor.moveWord(1) : editor.move(1);
  if (key.name === 'home' || (key.cmd && key.name === 'left')) return editor.home();
  if (key.name === 'end' || (key.cmd && key.name === 'right')) return editor.end();
  if (key.name === 'backspace') return editor.backspace();
  if (key.name === 'delete') return editor.deleteForward();
  if (key.name === 'kill-end') return editor.killToEnd();
  if (key.name === 'kill-start') return editor.killToStart();
  if (key.name === 'delete-word-left') return editor.deleteWordBack();
  if (key.name === 'paste') return editor.insert(key.text);
  if (allowNewline && key.name === 'enter') return editor.insert('\n');
  if (key.printable || isPrintable(key.text)) return editor.insert(key.text);
}

if (isDirectRun(import.meta.url)) runSupportDeskDemo();
