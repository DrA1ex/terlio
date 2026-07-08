#!/usr/bin/env node
import {
  Column,
  InputEditor,
  KeyHintBar,
  Panel,
  Row,
  SelectList,
  Text,
  Toast,
  WorkspaceCommandBar,
  WorkspacePane,
  WorkspaceShell,
  fitInline,
  renderNode,
  resolveWorkspaceShellLayout,
  splitWorkspaceColumns,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';
import { EXAMPLE_THEME, cycleTab, responsiveTabHint, responsiveTabs, scrollOffset, visibleScrollableRows } from './_workspaceExampleUtils.js';

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
  ['skill.debugger.on', 'Enable debugger skill', 'B', 'Adds structured warning and tool-result suggestions.'],
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
    acceptedSelection: 0,
    activeTab: 'palette',
    paneScroll: { details: 0, accepted: 0 },
    status: 'Type to filter actions. Enter accepts the selected action.',
  };
}

export function createCommandPaletteView({ state, width = 96, height = 30 } = {}) {
  const items = getFilteredActions(state.search.value);
  const selected = normalizeSelected(state, items.length);
  normalizeAcceptedSelection(state);
  const selectedAction = items[selected];
  const layout = splitWorkspaceColumns(width);
  const visibleTabs = responsiveTabs(TABS, state.activeTab, width, { pinned: ['palette'] });
  const tabHint = responsiveTabHint('Tab focus · Enter accept/inspect · PgUp/PgDn page active pane · Ctrl+C exit', TABS, visibleTabs);
  const stats = [
    { label: 'Matches', value: items.length },
    { label: 'Selected', value: selectedAction?.[0] ?? 'none' },
    { label: 'Accepted', value: state.accepted.length },
  ];
  const right = [
    { label: 'Query', value: state.search.value || '<empty>' },
    { label: 'Status', value: fitInline(state.status, 44).trimEnd() },
  ];
  const helpHints = contextHelpHints(state);
  const command = state.activeTab === 'palette' ? WorkspaceCommandBar({
    mode: 'PALETTE',
    prompt: 'search',
    value: `${state.search.value || '<empty>'}▌`,
    suggestions: groupCounts(items),
    hint: 'typing edits only while Palette is focused',
    theme: EXAMPLE_THEME,
  }) : null;
  const activity = KeyHintBar({
    title: ' LOCAL HELP ',
    hints: helpHints,
    theme: EXAMPLE_THEME,
    gridBorder: true,
  });
  const { mainHeight } = resolveWorkspaceShellLayout({
    width,
    height,
    title: 'Command Palette',
    subtitle: 'action launcher workspace',
    stats,
    right,
    focus: state.activeTab,
    tabs: visibleTabs,
    activeTab: state.activeTab,
    tabHint,
    command,
    activity,
    theme: EXAMPLE_THEME,
    minMainHeight: 6,
  });
  const main = layout.mode === 'wide'
    ? Row({ gap: 2, widths: layout.widths },
        palettePane(state, items, selected, Math.max(30, layout.widths[0]), mainHeight),
        detailsPane(state, selectedAction, Math.max(40, layout.widths[1]), mainHeight),
        acceptedPane(state, Math.max(28, layout.widths[2]), mainHeight),
      )
    : layout.mode === 'medium'
      ? Row({ gap: 2, widths: layout.widths },
          palettePane(state, items, selected, Math.max(30, layout.widths[0]), mainHeight),
          state.activeTab === 'accepted'
            ? acceptedPane(state, Math.max(40, layout.widths[1]), mainHeight)
            : detailsPane(state, selectedAction, Math.max(40, layout.widths[1]), mainHeight),
        )
      : narrowPane(state, items, selected, selectedAction, width, mainHeight);

  return WorkspaceShell({
    title: 'Command Palette',
    subtitle: 'action launcher workspace',
    stats,
    right,
    focus: state.activeTab,
    tabs: visibleTabs,
    activeTab: state.activeTab,
    tabHint,
    main,
    command,
    activity,
    height,
    theme: EXAMPLE_THEME,
  });
}

export function handleCommandPaletteKey({ key, state, runtime }) {
  const items = getFilteredActions(state.search.value);
  normalizeSelected(state, items.length);
  normalizeAcceptedSelection(state);

  if (key.name === 'q' && key.ctrl) {
    runtime.exit(0);
    return;
  }

  if (key.name === 'q' && state.activeTab !== 'palette') {
    runtime.exit(0);
    return;
  }

  if (key.name === 'tab') {
    cycleTab(state, TABS, key.shift ? -1 : 1, { statusPrefix: 'Focus moved to' });
    return;
  }

  if (key.name === 'page-up' || key.name === 'page-down') {
    pageActivePane(state, key.name === 'page-up' ? -1 : 1);
    return;
  }

  if (state.activeTab === 'accepted') {
    handleAcceptedKey({ key, state, runtime });
    return;
  }

  if (state.activeTab === 'details') {
    handleDetailsKey({ key, state, items, runtime });
    return;
  }

  handlePaletteKey({ key, state, items, runtime });
}

export function getFilteredActions(query) {
  const terms = String(query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return ACTIONS;
  return ACTIONS.filter(([action, description, group, shortcut, detail]) => {
    const haystack = `${action} ${description} ${group} ${shortcut} ${detail}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

function handlePaletteKey({ key, state, items, runtime }) {
  if (key.name === 'escape') {
    if (state.search.value) {
      state.search.clear();
      state.selectedIndex = 0;
      state.status = 'Filter cleared.';
    } else {
      state.status = 'Palette is already empty.';
    }
    return;
  }

  if (key.name === 'q') {
    runtime.exit(0);
    return;
  }

  if (key.name === 'enter') {
    acceptSelectedAction(state, items);
    return;
  }

  if (key.name === 'up') return moveSelection(state, -1, items.length);
  if (key.name === 'down') return moveSelection(state, 1, items.length);
  if (key.name === 'home') return setSelection(state, 0, items.length, 'Moved to first action.');
  if (key.name === 'end') return setSelection(state, items.length - 1, items.length, 'Moved to last action.');

  if (key.name === 'backspace') return editSearch(state, () => state.search.backspace());
  if (key.name === 'delete') return editSearch(state, () => state.search.deleteForward());
  if (key.name === 'kill-start') return editSearch(state, () => state.search.killToStart());
  if (key.name === 'kill-end') return editSearch(state, () => state.search.killToEnd());
  if (key.name === 'delete-word-left') return editSearch(state, () => state.search.deleteWordBack());
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
  if (key.name === 'paste') return editSearch(state, () => state.search.insert(key.text));
  if (key.printable) return editSearch(state, () => state.search.insert(key.text));
}

function handleDetailsKey({ key, state, items, runtime }) {
  if (key.name === 'escape') {
    state.activeTab = 'palette';
    state.status = 'Returned to Palette.';
    return;
  }
  if (key.name === 'q') {
    runtime.exit(0);
    return;
  }
  if (key.name === 'enter') {
    acceptSelectedAction(state, items);
    return;
  }
  if (key.name === 'up' || key.name === 'down') {
    state.status = 'Details is read-only. Use PgUp/PgDn if content overflows.';
  }
}

function handleAcceptedKey({ key, state, runtime }) {
  if (key.name === 'escape') {
    state.activeTab = 'palette';
    state.status = 'Returned to Palette.';
    return;
  }
  if (key.name === 'q') {
    runtime.exit(0);
    return;
  }
  if (key.name === 'up') {
    moveAcceptedSelection(state, -1);
    return;
  }
  if (key.name === 'down') {
    moveAcceptedSelection(state, 1);
    return;
  }
  if (key.name === 'enter') {
    const item = state.accepted[state.acceptedSelection];
    if (!item) {
      state.activeTab = 'palette';
      state.status = 'No accepted action to inspect.';
      return;
    }
    const id = item.split(' — ')[0];
    const index = getFilteredActions('').findIndex(([action]) => action === id);
    if (index >= 0) {
      state.search.set(id);
      state.selectedIndex = 0;
      state.activeTab = 'details';
      state.status = `Inspecting accepted action ${id}.`;
    }
    return;
  }
}

function acceptSelectedAction(state, items) {
  if (!items.length) {
    state.status = 'Nothing to accept.';
    return;
  }
  const [action, description, group] = items[state.selectedIndex];
  if (action === 'app.exit') {
    state.status = 'Use Q to exit this example.';
    return;
  }
  state.accepted.push(`${action} — ${description}`);
  state.acceptedSelection = state.accepted.length - 1;
  state.activeTab = 'accepted';
  state.status = `Accepted ${action} from ${group}.`;
  state.paneScroll.accepted = Math.max(0, state.accepted.length - 4);
}

function editSearch(state, fn) {
  fn();
  state.selectedIndex = 0;
  state.activeTab = 'palette';
  state.status = 'Filter updated.';
}

function moveSelection(state, delta, size) {
  if (!size) {
    state.selectedIndex = 0;
    state.status = 'No matching actions.';
    return;
  }
  state.selectedIndex = Math.max(0, Math.min(size - 1, state.selectedIndex + delta));
  state.status = 'Moved palette selection.';
}

function setSelection(state, index, size, status) {
  if (!size) return;
  state.selectedIndex = Math.max(0, Math.min(size - 1, index));
  state.status = status;
}

function moveAcceptedSelection(state, delta) {
  if (!state.accepted.length) {
    state.acceptedSelection = 0;
    state.status = 'No accepted actions yet.';
    return;
  }
  state.acceptedSelection = Math.max(0, Math.min(state.accepted.length - 1, state.acceptedSelection + delta));
  state.paneScroll.accepted = Math.max(0, state.acceptedSelection - 4);
  state.status = 'Moved accepted-action selection.';
}

function pageActivePane(state, direction) {
  const page = WINDOW_SIZE;
  if (state.activeTab === 'palette') {
    const size = getFilteredActions(state.search.value).length;
    moveSelection(state, direction * page, size);
    state.status = direction < 0 ? 'Moved palette one page up.' : 'Moved palette one page down.';
    return;
  }
  if (state.activeTab === 'accepted') {
    state.paneScroll.accepted = scrollOffset(state.paneScroll.accepted, direction * page, Math.max(1, state.accepted.length), WINDOW_SIZE);
    state.acceptedSelection = Math.max(0, Math.min(Math.max(0, state.accepted.length - 1), state.paneScroll.accepted));
    state.status = direction < 0 ? 'Accepted log page up.' : 'Accepted log page down.';
    return;
  }
  state.paneScroll.details = scrollOffset(state.paneScroll.details, direction * page, 18, WINDOW_SIZE);
  state.status = direction < 0 ? 'Details page up.' : 'Details page down.';
}

function palettePane(state, items, selected, width, height) {
  return WorkspacePane({
    title: ` ${state.activeTab === 'palette' ? '▶' : ' '} ACTIONS ${items.length ? selected + 1 : 0}/${items.length} `,
    active: state.activeTab === 'palette',
    height,
    children: [
      Text(`Search: ${state.search.value || '<empty>'}▌`, { wrap: false }),
      SelectList({
        title: 'Matches',
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

function detailsPane(state, action, width, height) {
  if (!action) {
    return WorkspacePane({
      title: ` ${state.activeTab === 'details' ? '▶' : ' '} DETAILS `,
      active: state.activeTab === 'details',
      height,
      children: [Toast({ level: 'warning', message: 'No command matches the current query.' })],
    });
  }
  const [id, description, group, shortcut, detail] = action;
  const lines = renderNode(Column(
    Panel(' Selected action ',
      Text(`id       ${id}`, { wrap: false }),
      Text(`group    ${group}`, { wrap: false }),
      Text(`shortcut ${shortcut}`, { wrap: false }),
    ),
    Panel(' Runtime effect ',
      Text(fitInline(description, Math.max(20, width - 10)), { wrap: false }),
      Text(fitInline(detail, Math.max(20, width - 10)), { wrap: false }),
    ),
    Panel(' Payload ',
      Text(`{ id: '${id}', group: '${group}', shortcut: '${shortcut}' }`, { wrap: false }),
      Text('Enter accepts this action. Esc returns to the palette.', { wrap: false }),
    ),
  ), Math.max(20, width - 4));
  const window = visibleScrollableRows(lines, {
    scroll: state.paneScroll.details,
    height: Math.max(3, height - 2),
    width: Math.max(20, width - 4),
    footer: lines.length > Math.max(3, height - 3),
  });
  state.paneScroll.details = window.scroll;
  return WorkspacePane({
    title: ` ${state.activeTab === 'details' ? '▶' : ' '} DETAILS `,
    height,
    active: state.activeTab === 'details',
    children: window.rows.map((line) => Text(line, { wrap: false })),
  });
}

function acceptedPane(state, width, height) {
  normalizeAcceptedSelection(state);
  const contentRows = state.accepted.length
    ? state.accepted.map((line, index) => `${index === state.acceptedSelection ? '›' : ' '} ${fitInline(line, Math.max(16, width - 8))}`)
    : ['No accepted actions yet.', 'Go to Palette, select an action and press Enter.'];
  const window = visibleScrollableRows(contentRows, {
    scroll: state.paneScroll.accepted,
    height: Math.max(3, height - 5),
    width: Math.max(20, width - 4),
    footer: contentRows.length > Math.max(3, height - 6),
  });
  state.paneScroll.accepted = window.scroll;
  return WorkspacePane({
    title: ` ${state.activeTab === 'accepted' ? '▶' : ' '} ACCEPTED `,
    active: state.activeTab === 'accepted',
    height,
    children: [
      Toast({ level: state.accepted.length ? 'success' : 'info', message: state.accepted.length ? `${state.accepted.length} action(s) accepted.` : 'No accepted actions yet.' }),
      ...window.rows.map((line) => Text(line, { wrap: false })),
    ],
  });
}

function narrowPane(state, items, selected, action, width, height) {
  if (state.activeTab === 'accepted') return acceptedPane(state, width, height);
  if (state.activeTab === 'details') return detailsPane(state, action, width, height);
  return palettePane(state, items, selected, width, height);
}

function contextHelpHints(state) {
  if (state.activeTab === 'accepted') {
    return [
      ['↑/↓', 'select log row'],
      ['Enter', 'inspect selected'],
      ['PgUp/PgDn', 'scroll log'],
      ['Esc', 'back to palette'],
      ['Tab', 'switch pane'],
      ['Q', 'exit'],
    ];
  }
  if (state.activeTab === 'details') {
    return [
      ['Enter', 'accept selected'],
      ['PgUp/PgDn', 'scroll details'],
      ['Esc', 'back to palette'],
      ['Tab', 'switch pane'],
      ['Q', 'exit'],
    ];
  }
  return [
    ['Type', 'filter actions'],
    ['↑/↓', 'select action'],
    ['PgUp/PgDn', 'page list'],
    ['Enter', 'accept action'],
    ['Esc', 'clear filter'],
    ['Tab', 'switch pane'],
  ];
}

function normalizeSelected(state, size) {
  if (!size) {
    state.selectedIndex = 0;
    return 0;
  }
  state.selectedIndex = Math.max(0, Math.min(size - 1, state.selectedIndex));
  return state.selectedIndex;
}

function normalizeAcceptedSelection(state) {
  if (!state.accepted.length) {
    state.acceptedSelection = 0;
    return;
  }
  state.acceptedSelection = Math.max(0, Math.min(state.accepted.length - 1, state.acceptedSelection));
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
