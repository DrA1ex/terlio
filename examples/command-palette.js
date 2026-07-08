#!/usr/bin/env node
import { Box, Column, InputEditor, Panel, Row, Text } from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';

const ACTIONS = [
  ['chat.new', 'Start a new chat transcript'],
  ['chat.retry', 'Retry the last user request'],
  ['chat.regenerate', 'Regenerate the last assistant answer'],
  ['message.copy-last', 'Copy the last assistant answer'],
  ['message.shorter', 'Ask the model to shorten the last answer'],
  ['message.longer', 'Ask the model to expand the last answer'],
  ['session.save', 'Save the current session'],
  ['session.open', 'Open the session picker'],
  ['session.delete', 'Delete a saved session'],
  ['provider.mock', 'Switch to the regex mock provider'],
  ['provider.replay', 'Switch to the deterministic replay provider'],
  ['theme.dark', 'Switch to the dark theme'],
  ['theme.ocean', 'Switch to the ocean theme'],
  ['theme.matrix', 'Switch to the matrix theme'],
  ['skill.code.on', 'Enable code assistant skill'],
  ['skill.writer.on', 'Enable writer skill'],
  ['skill.debugger.on', 'Enable debugger skill'],
  ['debug.keys', 'Open the key diagnostics screen'],
  ['debug.render', 'Show renderer frame timings'],
  ['terminal.suspend', 'Suspend rich UI and run a shell command'],
  ['terminal.redraw', 'Reset renderer and redraw the frame'],
  ['help.shortcuts', 'Show keyboard shortcuts'],
  ['help.commands', 'Show slash command reference'],
  ['app.exit', 'Exit the example'],
];

const WINDOW_SIZE = 9;

export function createCommandPaletteState() {
  return {
    search: new InputEditor(''),
    selectedIndex: 0,
    accepted: [],
    status: 'Command Palette: type to filter, use ↑/↓ and PageUp/PageDown, Enter accepts.',
  };
}

export function createCommandPaletteView({ state, width = 96 }) {
  const items = getFilteredActions(state.search.value);
  const selected = normalizeSelected(state, items.length);
  const windowed = getWindow(items, selected, WINDOW_SIZE);

  return Column(
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Command Palette ' },
      Text('A palette-style editor example: fuzzy filtering, selected row, scrolling list, and accepted actions.'),
      Text(`Search: ${state.search.value || '<empty>'}█`),
    ),
    Row({ gap: 2, distribute: true },
      Box({ border: true, padding: 1, title: ` Actions ${items.length ? selected + 1 : 0}/${items.length} ` },
        ...windowed.map(({ action, description, index }) => Text(formatActionRow(action, description, index === selected, width - 8))),
        ...(items.length ? [] : [Text('No matching actions.')]),
      ),
      Panel(' Accepted ',
        ...(state.accepted.length ? state.accepted.slice(-10).map((line) => Text(line)) : [Text('Press Enter on an action to record it here.')]),
      ),
    ),
    Row({ gap: 2, distribute: true },
      Panel(' Keys ',
        Text('↑ / ↓       move selection'),
        Text('PageUp/Down jump by a page'),
        Text('Backspace   edit filter'),
        Text('Ctrl+U      clear filter'),
        Text('Enter       accept action'),
        Text('Esc         clear filter'),
      ),
      Panel(' Last keys ',
        ...((state.keyLog?.length ? state.keyLog : ['No keys yet.']).map((line) => Text(line))),
      ),
    ),
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Status ' }, Text(state.status)),
  );
}

export function handleCommandPaletteKey({ key, state, runtime }) {
  const items = getFilteredActions(state.search.value);
  normalizeSelected(state, items.length);

  if (key.name === 'escape') {
    state.search.clear();
    state.selectedIndex = 0;
    state.status = 'Filter cleared.';
    return;
  }

  if (key.name === 'enter') {
    if (!items.length) {
      state.status = 'Nothing to accept.';
      return;
    }
    const [action, description] = items[state.selectedIndex];
    if (action === 'app.exit') {
      runtime.exit(0);
      return;
    }
    state.accepted.push(`${action} — ${description}`);
    state.status = `Accepted ${action}.`;
    return;
  }

  if (key.name === 'up') {
    state.selectedIndex = Math.max(0, state.selectedIndex - 1);
    state.status = 'Moved selection up.';
    return;
  }

  if (key.name === 'down') {
    state.selectedIndex = Math.min(Math.max(0, items.length - 1), state.selectedIndex + 1);
    state.status = 'Moved selection down.';
    return;
  }

  if (key.name === 'page-up') {
    state.selectedIndex = Math.max(0, state.selectedIndex - WINDOW_SIZE);
    state.status = 'Moved one page up.';
    return;
  }

  if (key.name === 'page-down') {
    state.selectedIndex = Math.min(Math.max(0, items.length - 1), state.selectedIndex + WINDOW_SIZE);
    state.status = 'Moved one page down.';
    return;
  }

  if (key.name === 'home') {
    state.selectedIndex = 0;
    state.status = 'Moved to first action.';
    return;
  }

  if (key.name === 'end') {
    state.selectedIndex = Math.max(0, items.length - 1);
    state.status = 'Moved to last action.';
    return;
  }

  if (key.name === 'backspace') {
    state.search.backspace();
    state.selectedIndex = 0;
    state.status = 'Edited filter.';
    return;
  }

  if (key.name === 'delete') {
    state.search.deleteForward();
    state.selectedIndex = 0;
    state.status = 'Deleted forward in filter.';
    return;
  }

  if (key.name === 'kill-start') {
    state.search.killToStart();
    state.selectedIndex = 0;
    state.status = 'Cleared filter prefix.';
    return;
  }

  if (key.name === 'kill-end') {
    state.search.killToEnd();
    state.selectedIndex = 0;
    state.status = 'Cleared filter suffix.';
    return;
  }

  if (key.name === 'left') {
    key.meta ? state.search.moveWord(-1) : state.search.move(-1);
    state.status = 'Moved filter cursor.';
    return;
  }

  if (key.name === 'right') {
    key.meta ? state.search.moveWord(1) : state.search.move(1);
    state.status = 'Moved filter cursor.';
    return;
  }

  if (key.name === 'paste') {
    state.search.insert(key.text);
    state.selectedIndex = 0;
    state.status = 'Pasted into filter.';
    return;
  }

  if (key.printable) {
    state.search.insert(key.text);
    state.selectedIndex = 0;
    state.status = 'Filtered actions.';
  }
}

export function getFilteredActions(query) {
  const terms = String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return ACTIONS;
  return ACTIONS.filter(([action, description]) => {
    const haystack = `${action} ${description}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

function normalizeSelected(state, size) {
  if (!size) {
    state.selectedIndex = 0;
    return 0;
  }
  state.selectedIndex = Math.max(0, Math.min(size - 1, state.selectedIndex));
  return state.selectedIndex;
}

function getWindow(items, selectedIndex, size) {
  const start = Math.max(0, Math.min(selectedIndex - Math.floor(size / 2), items.length - size));
  return items.slice(start, start + size).map(([action, description], offset) => ({
    action,
    description,
    index: start + offset,
  }));
}

function formatActionRow(action, description, selected, width) {
  const marker = selected ? '›' : ' ';
  const body = `${marker} ${action.padEnd(20)} ${description}`;
  return body.length > width ? body.slice(0, Math.max(0, width - 1)) + '…' : body;
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Command Palette',
    state: createCommandPaletteState(),
    render: createCommandPaletteView,
    onKey: handleCommandPaletteKey,
  });
}
