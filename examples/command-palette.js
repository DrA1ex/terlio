#!/usr/bin/env node
import {
  Box,
  Column,
  InputEditor,
  KeyHintBar,
  Panel,
  Row,
  SelectList,
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

const ACTIONS = [
  ['chat.new', 'Start a new chat transcript', 'Chat', '⌘N', 'Safe reset that preserves the current session in history.'],
  ['chat.retry', 'Retry the last user request', 'Chat', 'R', 'Replays the last prompt against the active provider.'],
  ['chat.regenerate', 'Regenerate the last assistant answer', 'Chat', 'G', 'Keeps the prompt and replaces only the final assistant turn.'],
  ['message.copy-last', 'Copy the last assistant answer', 'Message', 'Y', 'Copies text and structured block summaries.'],
  ['message.shorter', 'Ask the model to shorten the last answer', 'Message', 'S', 'Queues a rewrite instruction against the current answer.'],
  ['message.longer', 'Ask the model to expand the last answer', 'Message', 'L', 'Requests a more detailed answer while keeping context.'],
  ['session.save', 'Save the current session', 'Session', '⌘S', 'Persists messages, provider, theme and enabled skills.'],
  ['session.open', 'Open the session picker', 'Session', 'O', 'Shows recent sessions with preview and delete confirmation.'],
  ['session.delete', 'Delete a saved session', 'Session', 'D', 'Requires confirmation before removing local data.'],
  ['provider.mock', 'Switch to the regex mock provider', 'Provider', 'M', 'Fast deterministic replies for demos and tests.'],
  ['provider.replay', 'Switch to the deterministic replay provider', 'Provider', 'P', 'Replays scripted chunks to validate streaming UI.'],
  ['theme.dark', 'Switch to the dark theme', 'Theme', '1', 'Default high-contrast theme for long terminal sessions.'],
  ['theme.ocean', 'Switch to the ocean theme', 'Theme', '2', 'Cool accent theme for product demos.'],
  ['theme.matrix', 'Switch to the matrix theme', 'Theme', '3', 'Dense green terminal theme for diagnostics.'],
  ['skill.code.on', 'Enable code assistant skill', 'Skill', 'C', 'Enables code-oriented mock planning and block output.'],
  ['skill.writer.on', 'Enable writer skill', 'Skill', 'W', 'Enables rewrite and tone-oriented examples.'],
  ['skill.debugger.on', 'Enable debugger skill', 'Skill', 'B', 'Adds structured warning and tool-result suggestions.'],
  ['debug.keys', 'Open the key diagnostics screen', 'Diagnostics', 'K', 'Useful when terminal modifiers emit unexpected sequences.'],
  ['debug.render', 'Show renderer frame timings', 'Diagnostics', 'F', 'Displays frame diff and redraw diagnostics.'],
  ['terminal.suspend', 'Suspend rich UI and run a shell command', 'Terminal', '!', 'Leaves alternate screen before running a process.'],
  ['terminal.redraw', 'Reset renderer and redraw the frame', 'Terminal', 'Ctrl+L', 'Clears stale artifacts and forces a full frame render.'],
  ['help.shortcuts', 'Show keyboard shortcuts', 'Help', '?', 'Opens contextual key help.'],
  ['help.commands', 'Show slash command reference', 'Help', '/', 'Lists command usage and argument hints.'],
  ['app.exit', 'Exit the example', 'App', 'Q', 'Restores the terminal and exits cleanly.'],
];

const WINDOW_SIZE = 9;
const TABS = [
  { id: 'palette', label: 'Palette' },
  { id: 'details', label: 'Details' },
  { id: 'accepted', label: 'Accepted' },
];

export function createCommandPaletteState() {
  return {
    search: new InputEditor(''),
    selectedIndex: 0,
    accepted: [],
    activeTab: 'palette',
    status: 'Command Palette: type to filter, use ↑/↓ and PageUp/PageDown, Enter accepts.',
  };
}

export function createCommandPaletteView({ state, width = 96, height = 30 } = {}) {
  const items = getFilteredActions(state.search.value);
  const selected = normalizeSelected(state, items.length);
  const selectedAction = items[selected];
  const layout = splitWorkspaceColumns(width);
  const mainHeight = workspaceMainHeight(height, { min: 6, activityRows: 2 });
  const visibleTabs = responsiveTabs(TABS, state.activeTab, width, { pinned: ['palette'] });
  const main = layout.mode === 'wide'
    ? Row({ gap: 2, widths: layout.widths },
        palettePane(state, items, selected, Math.max(30, layout.widths[0]), mainHeight),
        detailsPane(selectedAction, Math.max(40, layout.widths[1]), mainHeight),
        acceptedPane(state, Math.max(28, layout.widths[2]), mainHeight),
      )
    : layout.mode === 'medium'
      ? Row({ gap: 2, widths: layout.widths },
          palettePane(state, items, selected, Math.max(30, layout.widths[0]), mainHeight),
          state.activeTab === 'accepted'
            ? acceptedPane(state, Math.max(40, layout.widths[1]), mainHeight)
            : detailsPane(selectedAction, Math.max(40, layout.widths[1]), mainHeight),
        )
      : narrowPane(state, items, selected, selectedAction, width, mainHeight);

  return WorkspaceShell({
    title: 'Command Palette',
    subtitle: 'searchable action launcher',
    stats: [
      { label: 'Matches', value: items.length },
      { label: 'Selected', value: selectedAction?.[0] ?? 'none' },
    ],
    right: [
      { label: 'Accepted', value: state.accepted.length },
      { label: 'Query', value: state.search.value || '<empty>' },
    ],
    focus: state.activeTab,
    tabs: visibleTabs,
    activeTab: state.activeTab,
    tabHint: responsiveTabHint('Type to filter · ↑/↓ select · Enter accept · Esc clear · Q exit', TABS, visibleTabs),
    main,
    command: WorkspaceCommandBar({
      mode: 'PALETTE',
      prompt: 'search',
      value: `${state.search.value || '<empty>'}▌`,
      suggestions: groupCounts(items),
      hint: 'filters by id, title and group',
      theme: EXAMPLE_THEME,
    }),
    activity: KeyHintBar({
      title: ' LOCAL HELP ',
      hints: [
        ['↑/↓', 'move selection'],
        ['PgUp/PgDn', 'page list'],
        ['Home/End', 'jump'],
        ['Enter', 'accept action'],
        ['Esc', 'clear query'],
        ['Ctrl+U', 'clear prefix'],
      ],
      theme: EXAMPLE_THEME,
    }),
    footer: WorkspaceFooter({
      left: ['Ready', state.status],
      right: [`theme: ${EXAMPLE_THEME.name}`, 'demo: command-palette'],
      theme: EXAMPLE_THEME,
    }),
    height,
    theme: EXAMPLE_THEME,
  });
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

  if (key.name === 'q') {
    runtime.exit(0);
    return;
  }

  if (key.name === 'tab') {
    cycleTab(state, TABS, key.shift ? -1 : 1, { statusPrefix: 'Focus moved to' });
    return;
  }

  if (key.name === 'enter') {
    if (!items.length) {
      state.status = 'Nothing to accept.';
      return;
    }
    const [action, description, group] = items[state.selectedIndex];
    if (action === 'app.exit') {
      runtime.exit(0);
      return;
    }
    state.accepted.push(`${action} — ${description}`);
    state.activeTab = 'accepted';
    state.status = `Accepted ${action} from ${group}.`;
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
    state.activeTab = 'palette';
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
    state.activeTab = 'palette';
    state.status = 'Pasted into filter.';
    return;
  }

  if (key.printable) {
    state.search.insert(key.text);
    state.selectedIndex = 0;
    state.activeTab = 'palette';
    state.status = 'Filtered actions.';
  }
}

export function getFilteredActions(query) {
  const terms = String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return ACTIONS;
  return ACTIONS.filter(([action, description, group, shortcut, detail]) => {
    const haystack = `${action} ${description} ${group} ${shortcut} ${detail}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

function palettePane(state, items, selected, width, height) {
  return WorkspacePane({
    title: ` ${state.activeTab === 'palette' ? '▶' : ' '} ACTIONS ${items.length ? selected + 1 : 0}/${items.length} `,
    active: state.activeTab === 'palette',
    height,
    children: [
      Text(`Search: ${state.search.value || '<empty>'}▌`, { wrap: false }),
      SelectList({
        title: 'Command Palette',
        items,
        selectedIndex: selected,
        windowSize: Math.min(WINDOW_SIZE, Math.max(4, height - 8)),
        emptyText: 'No matching actions.',
        getLabel: (item) => item[0],
        getDescription: (item) => `${item[2]} · ${item[1]}`,
      }),
    ],
  });
}

function detailsPane(action, width, height) {
  if (!action) {
    return WorkspacePane({
      title: ' DETAILS ',
      height,
      children: [Toast({ level: 'warning', message: 'No command matches the current query.' })],
    });
  }
  const [id, description, group, shortcut, detail] = action;
  return WorkspacePane({
    title: ' DETAILS ',
    height,
    active: false,
    children: [
      Panel(' Selected action ',
        Text(`id       ${id}`, { wrap: false }),
        Text(`group    ${group}`, { wrap: false }),
        Text(`shortcut ${shortcut}`, { wrap: false }),
      ),
      Panel(' Behavior ',
        Text(fitInline(description, Math.max(20, width - 6)), { wrap: false }),
        Text(fitInline(detail, Math.max(20, width - 6)), { wrap: false }),
      ),
      Panel(' Integration notes ',
        Text('Palette actions are data records, not hard-coded UI rows.'),
        Text('The app decides whether an accepted item inserts text, opens a modal, runs a command or exits.'),
      ),
    ],
  });
}

function acceptedPane(state, width, height) {
  const rows = state.accepted.length
    ? state.accepted.slice(-Math.max(4, height - 8)).map((line, index) => Text(`${index + 1}. ${fitInline(line, Math.max(16, width - 8))}`, { wrap: false }))
    : [Text('Accept actions to build a visible audit trail.')];
  return WorkspacePane({
    title: ` ${state.activeTab === 'accepted' ? '▶' : ' '} ACCEPTED `,
    active: state.activeTab === 'accepted',
    height,
    children: [
      Toast({ level: state.accepted.length ? 'success' : 'info', message: state.accepted.length ? `${state.accepted.length} action(s) accepted.` : 'No accepted actions yet.' }),
      ...rows,
    ],
  });
}

function narrowPane(state, items, selected, action, width, height) {
  if (state.activeTab === 'accepted') return acceptedPane(state, width, height);
  if (state.activeTab === 'details') return detailsPane(action, width, height);
  return palettePane(state, items, selected, width, height);
}

function normalizeSelected(state, size) {
  if (!size) {
    state.selectedIndex = 0;
    return 0;
  }
  state.selectedIndex = Math.max(0, Math.min(size - 1, state.selectedIndex));
  return state.selectedIndex;
}

function groupCounts(items) {
  const counts = new Map();
  for (const item of items) counts.set(item[2], (counts.get(item[2]) ?? 0) + 1);
  return [...counts.entries()].slice(0, 6).map(([group, count]) => `${group.toLowerCase()} ${count}`);
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Command Palette',
    state: createCommandPaletteState(),
    render: createCommandPaletteView,
    onKey: handleCommandPaletteKey,
  });
}
