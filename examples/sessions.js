#!/usr/bin/env node
import { Box, Column, ConfirmPrompt, HelpOverlay, InputEditor, ModeManager, Panel, Row, Text, Toast } from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';

const INITIAL_SESSIONS = [
  { id: 'sess_renderer_refactor', title: 'Renderer refactor', messages: 18, updated: 'today', preview: 'Migrated app rendering to ChatScreen and virtual frame diff.' },
  { id: 'sess_code_review_blocks', title: 'Code review blocks', messages: 9, updated: 'today', preview: 'Assistant response contains text/code/diff/command/tool_result blocks.' },
  { id: 'sess_input_editor', title: 'Input editor compatibility', messages: 24, updated: 'yesterday', preview: 'Debugged Option arrows, Backspace/Delete and Ctrl+A/E on macOS.' },
  { id: 'sess_palette_modes', title: 'Palette and modes', messages: 12, updated: '2 days ago', preview: 'Added command palette, modal, confirm prompt and mode stack.' },
  { id: 'sess_provider_api', title: 'Provider API', messages: 6, updated: 'last week', preview: 'Designed streamResponse contract for mock/replay/future AI providers.' },
  { id: 'sess_theme_gallery', title: 'Theme gallery', messages: 7, updated: 'last week', preview: 'Compared dark, ocean, matrix, amber and paper theme tokens.' },
];

export function createSessionBrowserState() {
  return {
    filter: new InputEditor(''),
    sessions: INITIAL_SESSIONS.map((item) => ({ ...item })),
    selectedIndex: 0,
    modes: new ModeManager('browser'),
    confirmSelected: 'confirm',
    toast: { level: 'info', message: 'Session Browser: filter, preview, confirm delete, mock export.' },
    actionLog: [],
  };
}

export function createSessionBrowserView({ state, width = 108 } = {}) {
  const matches = getSessionMatches(state);
  clampSelection(state, matches.length);
  const selected = matches[state.selectedIndex] ?? null;
  const overlay = state.modes.current() === 'confirm'
    ? ConfirmPrompt({ title: ' Delete session ', message: `Delete ${selected?.title ?? 'selected session'}?`, selected: state.confirmSelected })
    : null;

  return Column(
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Session Browser ' },
      Text('A realistic SelectList-style browser: filter saved sessions, preview content, delete with confirmation, export mock data.'),
      Text(`Filter: ${state.filter.value || '<empty>'}█`),
    ),
    Row({ gap: 2, distribute: true },
      Panel(` Sessions ${matches.length ? state.selectedIndex + 1 : 0}/${matches.length} `,
        ...(matches.length ? windowSessions(matches, state.selectedIndex, 10).map((item) => Text(formatSessionRow(item.session, item.index === state.selectedIndex))) : [Text('No matching sessions.')]),
      ),
      Column(
        Toast(state.toast),
        Panel(' Preview ', ...(selected ? [
          Text(`id      : ${selected.id}`),
          Text(`title   : ${selected.title}`),
          Text(`messages: ${selected.messages}`),
          Text(`updated : ${selected.updated}`),
          Text(''),
          Text(selected.preview),
        ] : [Text('Nothing selected.')])),
      ),
    ),
    ...(overlay ? [overlay] : []),
    Row({ gap: 2, distribute: true },
      HelpOverlay({
        title: ' Keys ',
        shortcuts: [
          ['Type', 'filter sessions'],
          ['↑/↓', 'move selection'],
          ['Enter', 'open preview action'],
          ['D', 'delete with confirm'],
          ['N', 'create mock session'],
          ['E', 'export selected'],
          ['Esc', 'clear filter/cancel'],
        ],
      }),
      Panel(' Action log ', ...(state.actionLog.length ? state.actionLog.slice(-6).map((line) => Text(line)) : [Text('No actions yet.')]))
    ),
  );
}

export function handleSessionBrowserKey({ key, state }) {
  if (state.modes.current() === 'confirm') return handleDeleteConfirm(key, state);
  const matches = getSessionMatches(state);
  clampSelection(state, matches.length);

  if (key.name === 'escape') {
    state.filter.clear();
    state.selectedIndex = 0;
    state.toast = { level: 'info', message: 'Filter cleared.' };
    return;
  }
  if (key.name === 'up') {
    state.selectedIndex = Math.max(0, state.selectedIndex - 1);
    return;
  }
  if (key.name === 'down') {
    state.selectedIndex = Math.min(Math.max(0, matches.length - 1), state.selectedIndex + 1);
    return;
  }
  if (key.name === 'page-up') {
    state.selectedIndex = Math.max(0, state.selectedIndex - 8);
    return;
  }
  if (key.name === 'page-down') {
    state.selectedIndex = Math.min(Math.max(0, matches.length - 1), state.selectedIndex + 8);
    return;
  }
  if (key.name === 'enter') {
    const session = matches[state.selectedIndex];
    if (!session) return;
    const action = `Opened preview for ${session.id}.`;
    state.actionLog.push(action);
    state.toast = { level: 'success', message: action };
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
    state.toast = { level: 'success', message: `Created ${id}.` };
    return;
  }
  if (key.name === 'e') {
    const session = matches[state.selectedIndex];
    if (!session) return;
    const action = `Exported ${session.id} to mock JSON.`;
    state.actionLog.push(action);
    state.toast = { level: 'success', message: action };
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
}

function windowSessions(items, selectedIndex, size) {
  const start = Math.max(0, Math.min(selectedIndex - Math.floor(size / 2), Math.max(0, items.length - size)));
  return items.slice(start, start + size).map((session, offset) => ({ session, index: start + offset }));
}

function formatSessionRow(session, selected) {
  return `${selected ? '›' : ' '} ${session.title.padEnd(24)} ${String(session.messages).padStart(2)} msg · ${session.updated}`;
}

function clampSelection(state, size) {
  state.selectedIndex = Math.max(0, Math.min(Math.max(0, size - 1), state.selectedIndex));
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Session Browser',
    state: createSessionBrowserState(),
    render: createSessionBrowserView,
    onKey: handleSessionBrowserKey,
  });
}
