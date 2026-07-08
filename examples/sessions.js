#!/usr/bin/env node
import {
  ConfirmPrompt,
  InputEditor,
  KeyHintBar,
  ModeManager,
  Panel,
  Row,
  Text,
  Toast,
  WorkspaceCommandBar,
  WorkspaceFooter,
  WorkspacePane,
  WorkspaceShell,
  fitInline,
  splitWorkspaceColumns,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';
import { EXAMPLE_THEME, cycleTab, responsiveTabHint, responsiveTabs, workspaceMainHeight } from './_workspaceExampleUtils.js';

const INITIAL_SESSIONS = [
  { id: 'sess_renderer_refactor', title: 'Renderer refactor', messages: 18, updated: 'today', preview: 'Migrated app rendering to ChatScreen and virtual frame diff.' },
  { id: 'sess_code_review_blocks', title: 'Code review blocks', messages: 9, updated: 'today', preview: 'Assistant response contains text/code/diff/command/tool_result blocks.' },
  { id: 'sess_input_editor', title: 'Input editor compatibility', messages: 24, updated: 'yesterday', preview: 'Debugged Option arrows, Backspace/Delete and Ctrl+A/E on macOS.' },
  { id: 'sess_palette_modes', title: 'Palette and modes', messages: 12, updated: '2 days ago', preview: 'Added command palette, modal, confirm prompt and mode stack.' },
  { id: 'sess_provider_api', title: 'Provider API', messages: 6, updated: 'last week', preview: 'Designed streamResponse contract for mock/replay/future AI providers.' },
  { id: 'sess_theme_gallery', title: 'Theme gallery', messages: 7, updated: 'last week', preview: 'Compared dark, ocean, matrix, amber and paper theme tokens.' },
];

const TABS = [
  { id: 'browser', label: 'Browser' },
  { id: 'preview', label: 'Preview' },
  { id: 'actions', label: 'Actions' },
];

export function createSessionBrowserState() {
  return {
    filter: new InputEditor(''),
    sessions: INITIAL_SESSIONS.map((item) => ({ ...item })),
    selectedIndex: 0,
    activeTab: 'browser',
    modes: new ModeManager('browser'),
    confirmSelected: 'confirm',
    toast: { level: 'info', message: 'Type to filter. Enter opens preview. D deletes with confirmation.' },
    actionLog: [],
  };
}

export function createSessionBrowserView({ state, width = 108, height = 32 } = {}) {
  const matches = getSessionMatches(state);
  clampSelection(state, matches.length);
  const selected = matches[state.selectedIndex] ?? null;
  const layout = splitWorkspaceColumns(width);
  const mainHeight = workspaceMainHeight(height, { min: 6, activityRows: 2 });
  const visibleTabs = responsiveTabs(TABS, state.activeTab, width, { pinned: ['browser'] });
  const overlay = state.modes.current() === 'confirm'
    ? ConfirmPrompt({ title: ' Delete session ', message: `Delete ${selected?.title ?? 'selected session'}?`, selected: state.confirmSelected })
    : null;

  const browserPane = WorkspacePane({
    title: ` SESSIONS ${matches.length ? state.selectedIndex + 1 : 0}/${matches.length} `,
    active: state.activeTab === 'browser',
    height: mainHeight,
    children: [
      Text(`Filter: ${state.filter.value || '<empty>'}▌`, { wrap: false }),
      Text(''),
      ...(matches.length ? windowSessions(matches, state.selectedIndex, Math.max(5, mainHeight - 6)).map((item) => Text(formatSessionRow(item.session, item.index === state.selectedIndex, Math.max(28, (layout.widths[0] ?? width) - 4)), { wrap: false })) : [Text('No matching sessions.')]),
    ],
  });
  const previewPane = WorkspacePane({
    title: ' PREVIEW ',
    active: state.activeTab === 'preview',
    height: mainHeight,
    children: selected ? [
      Text(`id      : ${selected.id}`),
      Text(`title   : ${selected.title}`),
      Text(`messages: ${selected.messages}`),
      Text(`updated : ${selected.updated}`),
      Text(''),
      Text(selected.preview),
      Text(''),
      Text('Enter opens this mock session. E exports it. D deletes it.'),
    ] : [Text('Nothing selected.')],
  });
  const actionsPane = WorkspacePane({
    title: ' ACTIONS ',
    active: state.activeTab === 'actions',
    height: mainHeight,
    children: [
      Toast(state.toast),
      Panel(' Available actions ',
        Text('Enter  open preview'),
        Text('N      create mock session'),
        Text('E      export selected'),
        Text('D      delete selected'),
        Text('Esc    clear filter'),
      ),
      Panel(' Action log ', ...(state.actionLog.length ? state.actionLog.slice(-6).map((line) => Text(line, { wrap: false })) : [Text('No actions yet.')])),
    ],
  });

  const main = layout.mode === 'wide'
    ? Row({ gap: 2, widths: layout.widths }, browserPane, previewPane, actionsPane)
    : layout.mode === 'medium'
      ? Row({ gap: 2, widths: layout.widths }, browserPane, state.activeTab === 'actions' ? actionsPane : previewPane)
      : state.activeTab === 'browser' ? browserPane : state.activeTab === 'actions' ? actionsPane : previewPane;

  return WorkspaceShell({
    title: 'Session Browser',
    subtitle: 'saved conversations and exports',
    stats: [{ label: 'Sessions', value: state.sessions.length }, { label: 'Matches', value: matches.length }, { label: 'Selected', value: selected?.id ?? 'none' }],
    right: [{ label: 'Mode', value: layout.mode }],
    focus: state.activeTab,
    tabs: visibleTabs,
    activeTab: state.activeTab,
    tabHint: responsiveTabHint('[/] switch tabs · Type filters · Enter open · D delete · N new · E export', TABS, visibleTabs),
    main,
    command: WorkspaceCommandBar({ value: state.filter.value, prompt: 'filter', mode: 'SEARCH', suggestions: ['Type filter text', '↑/↓ select', 'Enter open', 'D delete', 'N new', 'E export'], theme: EXAMPLE_THEME }),
    activity: KeyHintBar({ title: ' LOCAL HELP ', hints: [['Type', 'filter sessions'], ['↑/↓', 'move selection'], ['PgUp/PgDn', 'page selection'], ['Enter', 'open'], ['D', 'delete'], ['Esc', 'clear']], theme: EXAMPLE_THEME }),
    footer: WorkspaceFooter({ left: ['Ready', state.toast.message], right: [`theme: ${EXAMPLE_THEME.name}`, 'demo: sessions'], theme: EXAMPLE_THEME }),
    height,
    theme: EXAMPLE_THEME,
  });
}

export function handleSessionBrowserKey({ key, state }) {
  if (state.modes.current() === 'confirm') return handleDeleteConfirm(key, state);
  const matches = getSessionMatches(state);
  clampSelection(state, matches.length);

  if (key.name === '[' || (key.name === 'left' && key.ctrl)) return switchTab(state, -1);
  if (key.name === ']' || (key.name === 'right' && key.ctrl)) return switchTab(state, 1);

  if (key.name === 'escape') {
    state.filter.clear();
    state.selectedIndex = 0;
    state.toast = { level: 'info', message: 'Filter cleared.' };
    state.activeTab = 'browser';
    return;
  }
  if (key.name === 'up') {
    state.selectedIndex = Math.max(0, state.selectedIndex - 1);
    state.activeTab = 'browser';
    return;
  }
  if (key.name === 'down') {
    state.selectedIndex = Math.min(Math.max(0, matches.length - 1), state.selectedIndex + 1);
    state.activeTab = 'browser';
    return;
  }
  if (key.name === 'page-up') {
    state.selectedIndex = Math.max(0, state.selectedIndex - 8);
    state.activeTab = 'browser';
    return;
  }
  if (key.name === 'page-down') {
    state.selectedIndex = Math.min(Math.max(0, matches.length - 1), state.selectedIndex + 8);
    state.activeTab = 'browser';
    return;
  }
  if (key.name === 'enter') {
    const session = matches[state.selectedIndex];
    if (!session) return;
    const action = `Opened preview for ${session.id}.`;
    state.actionLog.push(action);
    state.toast = { level: 'success', message: action };
    state.activeTab = 'preview';
    return;
  }
  if (key.name === 'd') {
    if (!matches.length) return;
    state.modes.push('confirm');
    state.confirmSelected = 'confirm';
    state.toast = { level: 'warning', message: 'Confirm deletion.' };
    return;
  }
  if (key.name === 'n') {
    const id = `sess_new_${String(state.sessions.length + 1).padStart(2, '0')}`;
    state.sessions.unshift({ id, title: 'New mock session', messages: 0, updated: 'just now', preview: 'Created from the session browser example.' });
    state.selectedIndex = 0;
    state.activeTab = 'browser';
    state.toast = { level: 'success', message: `Created ${id}.` };
    return;
  }
  if (key.name === 'e') {
    const session = matches[state.selectedIndex];
    if (!session) return;
    const action = `Exported ${session.id} to mock JSON.`;
    state.actionLog.push(action);
    state.toast = { level: 'success', message: action };
    state.activeTab = 'actions';
    return;
  }
  if (key.name === 'backspace') {
    state.filter.backspace();
    state.selectedIndex = 0;
    return;
  }
  if (key.name === 'kill-start') {
    state.filter.killToStart();
    state.selectedIndex = 0;
    return;
  }
  if (key.name === 'kill-end') {
    state.filter.killToEnd();
    state.selectedIndex = 0;
    return;
  }
  if (key.name === 'paste') {
    state.filter.insert(key.text);
    state.selectedIndex = 0;
    return;
  }
  if (key.printable) {
    state.filter.insert(key.text);
    state.selectedIndex = 0;
    state.activeTab = 'browser';
  }
}

export function getSessionMatches(state) {
  const query = state.filter.value.trim().toLowerCase();
  if (!query) return state.sessions;
  const terms = query.split(/\s+/).filter(Boolean);
  return state.sessions.filter((session) => {
    const haystack = `${session.id} ${session.title} ${session.preview} ${session.updated}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

function handleDeleteConfirm(key, state) {
  if (key.name === 'escape') {
    state.modes.pop();
    state.toast = { level: 'info', message: 'Delete cancelled.' };
    return;
  }
  if (key.name === 'left' || key.name === 'right') {
    state.confirmSelected = state.confirmSelected === 'confirm' ? 'cancel' : 'confirm';
    return;
  }
  if (key.name !== 'enter') return;
  const matches = getSessionMatches(state);
  const selected = matches[state.selectedIndex];
  state.modes.pop();
  if (state.confirmSelected !== 'confirm' || !selected) {
    state.toast = { level: 'info', message: 'Delete cancelled.' };
    state.confirmSelected = 'confirm';
    return;
  }
  state.sessions = state.sessions.filter((session) => session.id !== selected.id);
  state.selectedIndex = Math.max(0, Math.min(state.selectedIndex, getSessionMatches(state).length - 1));
  const action = `Deleted ${selected.id}.`;
  state.actionLog.push(action);
  state.toast = { level: 'success', message: action };
  state.confirmSelected = 'confirm';
  state.activeTab = 'actions';
}

function windowSessions(items, selectedIndex, size) {
  const start = Math.max(0, Math.min(selectedIndex - Math.floor(size / 2), Math.max(0, items.length - size)));
  return items.slice(start, start + size).map((session, offset) => ({ session, index: start + offset }));
}

function formatSessionRow(session, selected, width) {
  const meta = `${String(session.messages).padStart(2)} msg · ${session.updated}`;
  return `${selected ? '›' : ' '} ${fitInline(session.title, Math.max(10, width - meta.length - 4))} ${meta}`;
}

function clampSelection(state, size) {
  state.selectedIndex = Math.max(0, Math.min(Math.max(0, size - 1), state.selectedIndex));
}

function switchTab(state, delta) {
  cycleTab(state, TABS, delta, { statusPrefix: 'Opened' });
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Session Browser',
    state: createSessionBrowserState(),
    render: createSessionBrowserView,
    onKey: handleSessionBrowserKey,
  });
}
