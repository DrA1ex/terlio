#!/usr/bin/env node
import {
  Column,
  ConfirmPrompt,
  KeyHintBar,
  Modal,
  ModeManager,
  Panel,
  ProgressBar,
  Row,
  Spinner,
  Text,
  Toast,
  WorkspacePane,
  WorkspaceShell,
  createCommandPaletteState,
  fitInline,
  getCommandPaletteMatches,
  getPaletteQuery,
  handleCommandPaletteKey,
  renderCommandPalette,
  renderNode,
  splitWorkspaceColumns,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';
import { EXAMPLE_THEME, cycleTab, responsiveTabHint, responsiveTabs, scrollOffset, visibleScrollableRows, workspaceMainHeight } from './_workspaceExampleUtils.js';

const TABS = [
  { id: 'palette', label: 'Feedback' },
  { id: 'runtime', label: 'Modes' },
  { id: 'activity', label: 'Activity' },
];

const KIT_ACTIONS = [
  { id: 'toast.info', title: 'Info toast', description: 'Show a neutral toast notification', keywords: ['notification message'], group: 'Toast' },
  { id: 'toast.success', title: 'Success toast', description: 'Show a success toast notification', keywords: ['done ok'], group: 'Toast' },
  { id: 'toast.warning', title: 'Warning toast', description: 'Show a warning toast notification', keywords: ['careful danger'], group: 'Toast' },
  { id: 'modal.help', title: 'Open help modal', description: 'Push modal mode and render an overlay', keywords: ['dialog overlay'], group: 'Overlay' },
  { id: 'modal.inspector', title: 'Open inspector modal', description: 'Show debug-like state details inside the modal stack', keywords: ['debug overlay inspect'], group: 'Overlay' },
  { id: 'confirm.apply', title: 'Confirm apply', description: 'Open a confirm prompt for an apply action', keywords: ['yes no prompt'], group: 'Overlay' },
  { id: 'confirm.delete', title: 'Confirm delete row', description: 'Use confirm flow before mutating a filterable list', keywords: ['delete session confirm list'], group: 'Overlay' },
  { id: 'progress.tick', title: 'Advance progress', description: 'Move the progress bar forward', keywords: ['bar loading'], group: 'Runtime' },
  { id: 'list.filter', title: 'Filter sample list', description: 'Apply a mock filter to demonstrate scoped list state', keywords: ['sessions filter list'], group: 'Runtime' },
  { id: 'list.clear', title: 'Clear sample filter', description: 'Restore the full sample list', keywords: ['sessions filter list reset'], group: 'Runtime' },
  { id: 'mode.reset', title: 'Reset mode stack', description: 'Return to feedback mode and clear transient UI', keywords: ['focus stack'], group: 'Runtime' },
  { id: 'app.exit', title: 'Exit demo', description: 'Close the interaction kit example', keywords: ['quit'], group: 'App' },
];

export function createInteractionKitState() {
  return {
    modes: new ModeManager('palette'),
    palette: createCommandPaletteState({ items: KIT_ACTIONS, windowSize: 7 }),
    confirmSelected: 'confirm',
    toast: { level: 'info', message: 'Interaction kit is ready.' },
    progress: 20,
    frame: 0,
    sampleFilter: '',
    sampleItems: ['session: structured blocks', 'session: theme pass', 'ticket: resize regression', 'trace: toast shadow'],
    accepted: [],
    activitySelection: 0,
    activeTab: 'palette',
    paneScroll: { runtime: 0, activity: 0 },
    status: 'Type in Feedback and press Enter to run an interaction action.',
  };
}

export function createInteractionKitView({ state, width = 100, height = 30 } = {}) {
  state.frame += 1;
  normalizeActivitySelection(state);
  const currentMode = state.modes.current();
  const layout = splitWorkspaceColumns(width);
  const helpHints = contextHelpHints(state, currentMode);
  const helpGridRows = Math.ceil(helpHints.length / 3);
  const mainHeight = workspaceMainHeight(height, {
    min: 6,
    activityRows: helpGridRows ? helpGridRows * 2 + 1 : 0,
    commandRows: 0,
    footerRows: 0,
  });
  const visibleTabs = responsiveTabs(TABS, state.activeTab, width, { pinned: ['palette'] });
  const overlay = overlayNode(state, currentMode);
  const main = layout.mode === 'wide'
    ? Row({ gap: 2, widths: layout.widths },
        palettePane(state, Math.max(30, layout.widths[0]), mainHeight),
        runtimePane(state, Math.max(40, layout.widths[1]), mainHeight),
        activityPane(state, Math.max(28, layout.widths[2]), mainHeight),
      )
    : layout.mode === 'medium'
      ? Row({ gap: 2, widths: layout.widths },
          palettePane(state, Math.max(30, layout.widths[0]), mainHeight),
          state.activeTab === 'activity'
            ? activityPane(state, Math.max(40, layout.widths[1]), mainHeight)
            : runtimePane(state, Math.max(40, layout.widths[1]), mainHeight),
        )
      : narrowPane(state, width, mainHeight);

  return WorkspaceShell({
    title: 'Interaction Kit',
    subtitle: 'UI mechanics playground: feedback, overlays, modes and scoped lists',
    stats: [
      { label: 'Mode', value: currentMode },
      { label: 'Progress', value: `${state.progress}%` },
      { label: 'Accepted', value: state.accepted.length },
    ],
    right: [
      { label: 'Query', value: getPaletteQuery(state.palette) || '<empty>' },
      { label: 'Status', value: fitInline(state.status, 46).trimEnd() },
    ],
    focus: state.activeTab,
    tabs: visibleTabs,
    activeTab: state.activeTab,
    tabHint: responsiveTabHint('Tab focus · Feedback receives typing · Enter runs focused action · Esc closes overlays', TABS, visibleTabs),
    main,
    activity: overlay ?? KeyHintBar({
      title: ' LOCAL HELP ',
      hints: helpHints,
      theme: EXAMPLE_THEME,
      gridBorder: true,
    }),
    height,
    theme: EXAMPLE_THEME,
  });
}

export function handleInteractionKitKey({ key, state, runtime }) {
  const mode = state.modes.current();

  if (mode === 'confirm') {
    handleConfirmModeKey({ key, state });
    return;
  }

  if (mode === 'modal') {
    handleModalModeKey({ key, state });
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

  if (state.activeTab === 'runtime') {
    handleRuntimeKey({ key, state });
    return;
  }

  if (state.activeTab === 'activity') {
    handleActivityKey({ key, state, runtime });
    return;
  }

  handlePaletteTabKey({ key, state, runtime });
}

function handleConfirmModeKey({ key, state }) {
  if (key.name === 'escape') {
    state.modes.pop();
    state.toast = { level: 'info', message: 'Confirm prompt cancelled.' };
    state.status = 'Confirm prompt cancelled.';
    return;
  }
  if (key.name === 'left' || key.name === 'right') {
    state.confirmSelected = state.confirmSelected === 'confirm' ? 'cancel' : 'confirm';
    state.status = `Confirm choice: ${state.confirmSelected}.`;
    return;
  }
  if (key.name === 'enter') {
    const action = state.modes.currentEntry().data?.action;
    state.modes.pop();
    if (state.confirmSelected === 'confirm') {
      const result = applyConfirmedAction(state, action);
      recordAccepted(state, result.log);
      state.toast = { level: 'success', message: result.toast };
      state.activeTab = result.activeTab;
      state.status = result.status;
    } else {
      state.toast = { level: 'info', message: 'Action cancelled.' };
      state.status = 'Action cancelled.';
    }
    state.confirmSelected = 'confirm';
  }
}

function handleModalModeKey({ key, state }) {
  if (key.name === 'escape' || key.name === 'enter') {
    state.modes.pop();
    state.toast = { level: 'info', message: 'Modal closed.' };
    state.status = 'Modal closed.';
  }
}

function handleRuntimeKey({ key, state }) {
  if (key.name === 'enter') {
    state.progress = state.progress >= 100 ? 0 : state.progress + 10;
    state.toast = { level: 'info', message: `Progress is now ${state.progress}%.` };
    state.status = 'Runtime progress advanced.';
    return;
  }
  if (key.name === 'escape') {
    state.activeTab = 'palette';
    state.status = 'Returned to Feedback.';
    return;
  }
  if (key.name === 'up' || key.name === 'down') {
    state.status = 'Runtime is read-only. Use Enter for progress or PgUp/PgDn for overflow.';
  }
}

function handleActivityKey({ key, state, runtime }) {
  if (key.name === 'escape') {
    state.activeTab = 'palette';
    state.status = 'Returned to Feedback.';
    return;
  }
  if (key.name === 'q') {
    runtime.exit(0);
    return;
  }
  if (key.name === 'up') {
    moveActivitySelection(state, -1);
    return;
  }
  if (key.name === 'down') {
    moveActivitySelection(state, 1);
    return;
  }
  if (key.name === 'enter') {
    const item = state.accepted[state.activitySelection];
    state.toast = { level: item ? 'info' : 'warning', message: item ? `Selected ${item}.` : 'No activity row selected.' };
    state.status = item ? `Selected activity row: ${item}.` : 'No activity row selected.';
  }
}

function handlePaletteTabKey({ key, state, runtime }) {
  const result = handleCommandPaletteKey(state.palette, key);
  if (result.type !== 'accept') {
    if (result.type === 'edit' || result.type === 'move' || result.type === 'clear') state.status = state.palette.status;
    return;
  }

  const action = result.item;
  recordAccepted(state, action.id);

  if (action.id === 'app.exit') {
    runtime.exit(0);
    return;
  }
  if (action.id === 'modal.help' || action.id === 'modal.inspector') {
    state.modes.push('modal', { panel: action.id === 'modal.inspector' ? 'inspector' : 'help' });
    state.toast = { level: 'info', message: action.id === 'modal.inspector' ? 'Inspector modal opened.' : 'Modal opened.' };
    state.activeTab = 'runtime';
    state.status = `${action.id} pushed modal mode.`;
    return;
  }
  if (action.id === 'confirm.apply' || action.id === 'confirm.delete') {
    state.modes.push('confirm', { action });
    state.confirmSelected = 'confirm';
    state.toast = { level: 'warning', message: 'Confirm prompt is active.' };
    state.activeTab = 'runtime';
    state.status = 'Confirm mode pushed.';
    return;
  }
  if (action.id === 'progress.tick') {
    state.progress = state.progress >= 100 ? 0 : state.progress + 10;
    state.toast = { level: 'info', message: `Progress is now ${state.progress}%.` };
    state.activeTab = 'runtime';
    state.status = 'Progress advanced from Feedback.';
    return;
  }
  if (action.id === 'list.filter') {
    state.sampleFilter = 'session';
    state.toast = { level: 'info', message: 'Sample list filtered.' };
    state.activeTab = 'runtime';
    state.status = 'Applied sample list filter.';
    return;
  }
  if (action.id === 'list.clear') {
    state.sampleFilter = '';
    state.toast = { level: 'success', message: 'Sample filter cleared.' };
    state.activeTab = 'runtime';
    state.status = 'Restored full sample list.';
    return;
  }
  if (action.id === 'mode.reset') {
    state.modes.reset();
    state.toast = { level: 'info', message: 'Mode stack reset.' };
    state.activeTab = 'palette';
    state.status = 'Mode stack reset.';
    return;
  }
  if (action.id.startsWith('toast.')) {
    const level = action.id.split('.')[1];
    state.toast = { level, message: `${action.title} rendered.` };
    state.activeTab = 'runtime';
    state.status = `${action.id} rendered.`;
  }
}

function pageActivePane(state, direction) {
  const page = 7;
  if (state.activeTab === 'palette') {
    const result = handleCommandPaletteKey(state.palette, { name: direction < 0 ? 'page-up' : 'page-down' });
    state.status = result.type === 'move' ? state.palette.status : 'Feedback page navigation.';
    return;
  }
  if (state.activeTab === 'runtime') {
    state.paneScroll.runtime = scrollOffset(state.paneScroll.runtime, direction * page, runtimeLineCount(), page);
    state.status = direction < 0 ? 'Runtime page up.' : 'Runtime page down.';
    return;
  }
  state.paneScroll.activity = scrollOffset(state.paneScroll.activity, direction * page, Math.max(1, state.accepted.length), page);
  state.activitySelection = Math.max(0, Math.min(Math.max(0, state.accepted.length - 1), state.paneScroll.activity));
  state.status = direction < 0 ? 'Activity page up.' : 'Activity page down.';
}

function palettePane(state, width, height) {
  const matches = getCommandPaletteMatches(state.palette);
  const selected = matches[state.palette.selectedIndex];
  return WorkspacePane({
    title: ` ${state.activeTab === 'palette' ? '▶' : ' '} FEEDBACK ACTIONS `,
    active: state.activeTab === 'palette',
    height,
    children: [
      renderCommandPalette(state.palette, { title: 'Actions', showHelp: false }),
      Panel(' Selected ',
        selected
          ? Text(fitInline(`${selected.id} — ${selected.description}`, Math.max(16, width - 10)), { wrap: false })
          : Text('No matching action.'),
      ),
    ],
  });
}

function runtimePane(state, width, height) {
  const lines = renderNode(Column(
    Toast(state.toast),
    Panel(' Live widgets ',
      Spinner({ frame: state.frame, label: 'renderer alive' }),
      ProgressBar({ value: state.progress, total: 100, width: Math.min(26, Math.max(10, width - 20)), label: 'Progress' }),
      Text(`Mode stack: ${state.modes.toJSON().map((entry) => entry.name).join(' → ')}`),
      Text(`Query     : ${getPaletteQuery(state.palette) || '<empty>'}`),
    ),
    Panel(' Filterable list ',
      Text(`filter: ${state.sampleFilter || '<none>'}`),
      ...filteredSampleItems(state).map((item) => Text(`- ${item}`)),
    ),
    Panel(' Overlay ',
      Text(state.modes.current() === 'palette' ? 'No overlay is active.' : `Overlay mode: ${state.modes.current()}`),
      Text('Open modal.help, modal.inspector or confirm.delete from Feedback to test modal routing.'),
    ),
  ), Math.max(20, width - 4));
  const window = visibleScrollableRows(lines, {
    scroll: state.paneScroll.runtime,
    height: Math.max(3, height - 2),
    width: Math.max(20, width - 4),
    footer: lines.length > Math.max(3, height - 3),
  });
  state.paneScroll.runtime = window.scroll;
  return WorkspacePane({
    title: ` ${state.activeTab === 'runtime' ? '▶' : ' '} RUNTIME `,
    active: state.activeTab === 'runtime',
    height,
    children: window.rows.map((line) => Text(line, { wrap: false })),
  });
}

function activityPane(state, width, height) {
  normalizeActivitySelection(state);
  const rows = state.accepted.length
    ? state.accepted.map((item, index) => `${index === state.activitySelection ? '›' : ' '} ${fitInline(item, Math.max(16, width - 8))}`)
    : ['No accepted actions yet.', 'Switch to Feedback and run toast.info, modal.help or confirm.apply.'];
  const window = visibleScrollableRows(rows, {
    scroll: state.paneScroll.activity,
    height: Math.max(3, height - 2),
    width: Math.max(20, width - 4),
    footer: rows.length > Math.max(3, height - 3),
  });
  state.paneScroll.activity = window.scroll;
  return WorkspacePane({
    title: ` ${state.activeTab === 'activity' ? '▶' : ' '} ACTIVITY `,
    active: state.activeTab === 'activity',
    height,
    children: window.rows.map((line) => Text(line, { wrap: false })),
  });
}

function overlayNode(state, currentMode) {
  if (currentMode === 'confirm') {
    return ConfirmPrompt({
      title: ' Confirm action ',
      message: `Run ${state.modes.currentEntry().data?.action?.id ?? 'selected action'}?`,
      selected: state.confirmSelected,
    });
  }
  if (currentMode === 'modal') {
    const panel = state.modes.currentEntry().data?.panel ?? 'help';
    return Modal({
      title: panel === 'inspector' ? ' Inspector Modal ' : ' Help Modal ',
      children: panel === 'inspector'
        ? [
            `mode stack: ${state.modes.toJSON().map((entry) => entry.name).join(' → ')}`,
            `filter: ${state.sampleFilter || '<none>'}`,
            `visible rows: ${filteredSampleItems(state).length}/${state.sampleItems.length}`,
            `accepted actions: ${state.accepted.length}`,
          ]
        : [
            'This modal is rendered as a normal UI node.',
            'Esc or Enter closes it and returns to Feedback mode.',
          ],
      footer: 'ModeManager.pop() restores the previous mode.',
    });
  }
  return null;
}

function narrowPane(state, width, height) {
  if (state.activeTab === 'runtime') return runtimePane(state, width, height);
  if (state.activeTab === 'activity') return activityPane(state, width, height);
  return palettePane(state, width, height);
}

function applyConfirmedAction(state, action) {
  if (action?.id === 'confirm.delete') {
    const [first] = filteredSampleItems(state);
    if (!first) {
      return {
        log: 'confirm.delete found no row to delete',
        toast: 'No filtered row to delete.',
        status: 'No filtered row to delete.',
        activeTab: 'runtime',
      };
    }
    state.sampleItems = state.sampleItems.filter((item) => item !== first);
    return {
      log: `confirm.delete removed ${first}`,
      toast: `Deleted ${first}.`,
      status: `Deleted sample row ${first}.`,
      activeTab: 'runtime',
    };
  }
  return {
    log: `${action?.id ?? 'action'} confirmed`,
    toast: `${action?.title ?? 'Action'} confirmed.`,
    status: `${action?.id ?? 'action'} confirmed.`,
    activeTab: 'activity',
  };
}

function filteredSampleItems(state) {
  const query = String(state.sampleFilter ?? '').trim().toLowerCase();
  if (!query) return state.sampleItems;
  return state.sampleItems.filter((item) => item.toLowerCase().includes(query));
}

function recordAccepted(state, item) {
  state.accepted.push(item);
  state.activitySelection = state.accepted.length - 1;
  state.paneScroll.activity = Math.max(0, state.accepted.length - 4);
}

function moveActivitySelection(state, delta) {
  if (!state.accepted.length) {
    state.activitySelection = 0;
    state.status = 'No activity rows yet.';
    return;
  }
  state.activitySelection = Math.max(0, Math.min(state.accepted.length - 1, state.activitySelection + delta));
  state.paneScroll.activity = Math.max(0, state.activitySelection - 4);
  state.status = 'Moved activity selection.';
}

function normalizeActivitySelection(state) {
  if (!state.accepted.length) {
    state.activitySelection = 0;
    return;
  }
  state.activitySelection = Math.max(0, Math.min(state.accepted.length - 1, state.activitySelection));
}

function runtimeLineCount() {
  return 24;
}

function contextHelpHints(state, mode) {
  if (mode === 'confirm') {
    return [
      ['←/→', 'choose option'],
      ['Enter', 'accept choice'],
      ['Esc', 'cancel confirm'],
    ];
  }
  if (mode === 'modal') {
    return [
      ['Enter', 'close modal'],
      ['Esc', 'close modal'],
    ];
  }
  if (state.activeTab === 'runtime') {
    return [
      ['Enter', 'advance progress'],
      ['PgUp/PgDn', 'scroll runtime'],
      ['Esc', 'back to feedback'],
      ['Tab', 'switch pane'],
      ['↑/↓', 'not used here'],
    ];
  }
  if (state.activeTab === 'activity') {
    return [
      ['↑/↓', 'select row'],
      ['Enter', 'show toast'],
      ['PgUp/PgDn', 'scroll activity'],
      ['Esc', 'back to feedback'],
      ['Tab', 'switch pane'],
    ];
  }
  return [
    ['Type', 'filter actions'],
    ['↑/↓', 'move selection'],
    ['PgUp/PgDn', 'page list'],
    ['Enter', 'run action'],
    ['Esc', 'clear query'],
    ['Tab', 'switch pane'],
  ];
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Interaction Kit',
    state: createInteractionKitState(),
    render: createInteractionKitView,
    onKey: handleInteractionKitKey,
  });
}
