#!/usr/bin/env node
import {
  ActionRegistry, Badge, Box, ChipLine, Column, ConfirmPrompt, FocusManager, Grid, HelpOverlay,
  InputEditor, KeyHintBar, KeyValueBlock, LiveJobBlock, MetricBlock, Modal, ModeManager,
  OverlayHost, ProgressBar, ProgressStatus, RequireViewport, Row, ScrollPane, ScrollView, SectionTabs, SelectList, SplitPane,
  SummaryList, Text, TextEditorView, Timeline, Toast, WorkspaceCommandBar, WorkspaceFooter,
  WorkspaceHeader, WorkspacePane, WorkspaceShell, color, createBlock, createCommandPaletteState,
  createFrame, createListState, createOverlayManager, createScrollState, createTimelineEvent,
  createWorkspaceApp, diffFrames, getCommandPaletteMatches, getListWindow, getPaletteQuery,
  getResponsiveMode, handleCommandPaletteKey, handleInputEditorKey, handleListKey, handleScrollKey,
  measureNodeHeight,
  renderBlocksLines, renderCommandPalette, renderNode, renderToString, responsiveColumns, stripAnsi, themes,
  truncateVisible, updateScrollState, visibleLength, visibleWindowLines, wcwidth,
} from '../src/lib/index.js';
import { packageDisplayName } from '../src/lib/packageMetadata.js';
import { isDirectRun } from './_demoRuntime.js';

const DEFAULT_THEME = 'ocean';
const THEME_NAMES = Object.keys(themes);
const MIN_WIDTH = 92;
const MIN_HEIGHT = 24;
const NAV_WIDTH = 36;

export function createInteractionKitState() {
  const state = {
    themeName: DEFAULT_THEME,
    focus: new FocusManager(['nav', 'preview']),
    modes: new ModeManager('browse'),
    selectedShowcaseIndex: 0,
    list: null,
    overlays: createOverlayManager(),
    actions: null,
    palette: null,
    status: 'Ready.',
    frame: 0,
    viewport: { width: 120, height: 35 },
    showcaseState: {},
  };
  state.list = createListState({ items: SHOWCASES, selectedIndex: 0, windowSize: 11, skipDisabled: false });
  for (const entry of SHOWCASES) state.showcaseState[entry.id] = entry.createInitialState?.() ?? {};
  state.actions = createInteractionActions(state);
  state.palette = createCommandPaletteState({ items: state.actions.toPaletteItems(ctx(state)), windowSize: 10 });
  return state;
}

export function createInteractionKitView({ state = createInteractionKitState(), width = 120, height = 35 } = {}) {
  state.viewport = { width, height };
  state.list.items = SHOWCASES;
  state.list.selectedIndex = state.selectedShowcaseIndex;
  const theme = getTheme(state);
  const shell = RequireViewport({
    width,
    height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: 'Terminal too small',
    message: `${packageDisplayName} Component Studio needs more room for the product showcase.`,
    theme,
    children: renderShell({ state, width, height, theme }),
  });
  return shell;
}

export function handleInteractionKitKey({ key, state, runtime }) {
  if (!state) return;
  const context = ctx(state, runtime);
  if (state.overlays.hasBlocking()) {
    state.overlays.handleKey(key, context);
    return;
  }

  const entry = activeEntry(state);

  if (state.focus.current() === 'preview') {
    if (entry.handleKey?.(showcaseCtx(state, entry, runtime), key)) return;
    if (key.name === 'escape') {
      state.focus.focus('nav');
      state.status = 'Focus returned to navigation.';
      return;
    }
  }

  const actionResult = state.actions.handleKey(key, context, { scopes: ['global'] });
  if (actionResult.type === 'disabled') {
    state.overlays.toast(`${actionResult.action.title} is disabled.`, 'warning', 4);
    return;
  }
  if (actionResult.type === 'executed') return;

  if (state.focus.current() === 'nav') {
    if (key.name === 'enter') {
      state.focus.focus('preview');
      state.status = `Preview focused: ${entry.title}.`;
      return;
    }
    const result = handleListKey(state.list, key);
    if (result.handled) {
      state.selectedShowcaseIndex = state.list.selectedIndex;
      state.status = `Selected ${activeEntry(state).title}.`;
    }
  }
}

export function tickInteractionKit({ state } = {}) {
  if (!state) return false;
  state.frame += 1;
  const overlaysChanged = state.overlays.tick(0.25);
  const job = state.showcaseState['progress-live-jobs'];
  const statusDemo = state.showcaseState['progress-status-controller'];
  let changed = false;
  if (job?.progress >= 100 && job.running) {
    job.running = false;
    job.status = 'completed';
    job.activeIndex = job.steps.length;
    changed = true;
  }
  if (job?.running && job.progress < 100) {
    job.ticks += 1;
    job.elapsed = Math.round(job.ticks / 4);
    job.progress = Math.min(100, job.progress + (job.progress < 70 ? 1.7 : 0.8));
    job.processed = Math.round(job.totalFiles * job.progress / 100);
    job.activeIndex = Math.min(job.steps.length - 1, Math.floor(job.progress / (100 / job.steps.length)));
    job.status = 'running';
    if (job.progress >= 100) {
      job.running = false;
      job.activeIndex = job.steps.length;
      job.status = 'completed';
      state.overlays.toast('Simulated job completed.', 'success', 3);
    }
    changed = true;
  }
  if (statusDemo?.running && activeEntry(state).id === 'progress-status-controller') {
    statusDemo.clockMs += 250;
    statusDemo.ticks += 1;
    statusDemo.download.add(2.25 * 1024 * 1024);
    if (statusDemo.ticks % 4 === 0) statusDemo.batch.add(1);
    if (statusDemo.download.value >= statusDemo.download.total) {
      statusDemo.download.complete();
      statusDemo.batch.complete();
      statusDemo.running = false;
      state.overlays.toast('Controller-driven transfer completed.', 'success', 3);
    }
    changed = true;
  }
  return changed || overlaysChanged;
}

export function createInteractionKitApp({ input = process.stdin, output = process.stdout } = {}) {
  const state = createInteractionKitState();
  const app = createWorkspaceApp({
    title: `${packageDisplayName} Component Studio`,
    state,
    input,
    output,
    render: ({ state: current, width, height }) => createInteractionKitView({ state: current, width, height }),
    onKey: ({ key, state: current, runtime }) => handleInteractionKitKey({ key, state: current, runtime }),
    tick: ({ state: current }) => tickInteractionKit({ state: current }),
    tickMs: 250,
  });
  const statusDemo = state.showcaseState['progress-status-controller'];
  for (const controller of progressStatusControllers(statusDemo)) controller.setInvalidate(() => app.invalidate());
  return app;
}

export function runInteractionKitDemo() {
  return createInteractionKitApp().start();
}

function renderShell({ state, width, height, theme }) {
  const entry = activeEntry(state);
  const header = WorkspaceHeader({
    title: `${packageDisplayName} Component Studio`,
    subtitle: 'Interactive component and capability showcase',
    stats: [
      { label: 'Theme', value: state.themeName },
      { label: 'Size', value: `${width}×${height}` },
      { label: 'Screen', value: `${state.selectedShowcaseIndex + 1}/${SHOWCASES.length}` },
    ],
    right: [{ label: 'Focus', value: state.focus.current() }, { label: 'Mode', value: state.modes.current() }],
    focus: state.focus.current(),
    theme,
  });
  const footer = WorkspaceFooter({
    left: footerHints(state),
    right: [state.status],
    theme,
  });
  const bodyHeight = Math.max(1, height - 7);
  const body = SplitPane({
    orientation: 'horizontal',
    gap: 2,
    height: bodyHeight,
    focus: state.focus.current(),
    theme,
    panes: [
      { id: 'nav', min: 31, max: NAV_WIDTH, size: Math.min(NAV_WIDTH, Math.floor(width * 0.38)), node: renderNavPane({ state, theme, height: bodyHeight }) },
      { id: 'preview', min: 48, grow: 1, node: renderPreviewPane({ state, entry, theme, width: Math.max(48, width - NAV_WIDTH - 2), height: bodyHeight }) },
    ],
  });
  const shell = Column({ height }, header, body, footer);
  return OverlayHost({ content: shell, manager: state.overlays, theme, width, height });
}

function renderNavPane({ state, theme, height }) {
  const aboutHeight = Math.min(12, Math.max(8, Math.floor(height * 0.42)));
  const listHeight = Math.max(8, height - aboutHeight);
  const entry = activeEntry(state);
  return Column({ height },
    WorkspacePane({
      title: ' SHOWCASES ',
      active: state.focus.current() === 'nav',
      height: listHeight,
      theme,
      pointerId: 'kit:navigation',
      onClick: () => state.focus.focus('nav'),
      children: [SelectList({
        title: 'Entries',
        items: SHOWCASES,
        selectedIndex: state.selectedShowcaseIndex,
        windowSize: 'auto',
        getLabel: (item) => item.title,
        getDescription: (item) => item.category,
        wrapItems: true,
        maxItemLines: 2,
        theme,
        pointerId: 'kit:showcases',
        onSelect: (_entry, index) => {
          state.selectedShowcaseIndex = index;
          state.list.selectedIndex = index;
          state.focus.focus('nav');
          state.status = `Selected ${activeEntry(state).title}.`;
        },
        onWheel: (event) => {
          const next = clamp(state.selectedShowcaseIndex + (event.deltaY < 0 ? -1 : 1), 0, SHOWCASES.length - 1);
          state.selectedShowcaseIndex = next;
          state.list.selectedIndex = next;
          state.status = `Selected ${activeEntry(state).title}.`;
          event.preventDefault();
        },
      })],
      footer: `${state.selectedShowcaseIndex + 1}/${SHOWCASES.length} · Enter preview`,
    }),
    WorkspacePane({
      title: ' ABOUT THIS SCREEN ',
      active: false,
      height: aboutHeight,
      theme,
      children: [
        Text(color(theme, 'title', entry.title), { wrap: true }),
        Text(color(theme, 'textMuted', entry.summary), { wrap: true }),
        ChipLine({ label: 'Uses', chips: entry.components.slice(0, 3).map((id) => ({ id })), theme }),
        Text(color(theme, 'textMuted', entry.controls.map((item) => `${item.key} ${item.action}`).join(' · ')), { wrap: true }),
      ],
    }),
  );
}

function renderPreviewPane({ state, entry, theme, width, height }) {
  const controls = (entry.controls ?? []).map((item) => [item.key, item.action]);
  const footerNode = KeyHintBar({
    title: ' LOCAL CONTROLS ',
    hints: controls.length ? controls : [['—', 'No local controls']],
    columns: 'auto',
    adaptive: true,
    minColumnWidth: 20,
    maxColumns: 'auto',
    theme,
  });
  const paneInnerWidth = Math.max(1, width - 4);
  const paneInnerHeight = Math.max(0, height - 2);
  const footerMaxHeight = Math.max(3, Math.min(9, height - 6));
  const footerHeight = Math.min(
    paneInnerHeight,
    Math.max(3, Math.min(footerMaxHeight, measureNodeHeight(footerNode, paneInnerWidth))),
  );
  const contentHeight = Math.max(1, paneInnerHeight - footerHeight);
  const renderedPreview = entry.render(showcaseCtx(state, entry, null, width, contentHeight, theme));
  const showcaseState = state.showcaseState[entry.id];
  const preview = entry.scrollable
    ? ScrollView({
        scrollState: showcaseState?.scroll,
        pointerId: `kit:${entry.id}-scroll`,
        onWheel: (event) => scrollStateByWheel(showcaseState.scroll, event),
      }, renderedPreview)
    : makeGrow(renderedPreview);
  return WorkspacePane({
    title: ` PREVIEW · ${entry.title} `,
    active: state.focus.current() === 'preview',
    height,
    theme,
    pointerId: 'kit:preview',
    onClick: () => {
      state.focus.focus('preview');
      state.status = `Preview focused: ${entry.title}.`;
    },
    children: [preview],
    footerNode,
    footerMinHeight: 3,
    footerMaxHeight,
  });
}

function makeGrow(node) {
  if (!node || typeof node !== 'object' || !node.type) return node;
  return { ...node, props: { ...(node.props || {}), grow: true, height: 'fill' } };
}

function createInteractionActions(state) {
  const registry = new ActionRegistry();
  registry.registerMany([
    { id: 'focus.next', title: 'Switch Focus', description: 'Switch between navigation and preview', keys: ['tab'], scope: 'global', category: 'Navigation', execute: ({ state }) => { state.focus.next(); state.status = `Focus moved to ${state.focus.current()}.`; } },
    { id: 'focus.prev', title: 'Switch Focus Back', description: 'Move focus backwards', keys: ['shift+tab'], scope: 'global', category: 'Navigation', execute: ({ state }) => { state.focus.previous(); state.status = `Focus moved to ${state.focus.current()}.`; } },
    { id: 'theme.next', title: 'Next Theme', description: 'Cycle the global theme', keys: ['t'], scope: 'global', category: 'Theme', execute: ({ state }) => cycleTheme(state) },
    { id: 'help.open', title: 'Open Help', description: 'Show global and local shortcuts', keys: ['?'], scope: 'global', category: 'Help', execute: ({ state }) => openHelp(state) },
    { id: 'palette.open', title: 'Open Command Palette', description: 'Search global actions and showcases', keys: ['/'], scope: 'global', category: 'Commanding', execute: ({ state }) => openPalette(state) },
    { id: 'showcase.reset', title: 'Reset Current Demo', description: 'Reset local state for selected showcase', keys: ['r'], scope: 'global', category: 'Utility', disabled: ({ state }) => activeEntry(state).id === 'text-editor-input' && state.focus.current() === 'preview', execute: ({ state }) => resetCurrentShowcase(state) },
    { id: 'app.quit', title: 'Quit', description: 'Exit and restore terminal', keys: ['ctrl+q'], scope: 'global', category: 'Application', execute: ({ exit }) => exit?.(0) },
    ...SHOWCASES.map((entry, index) => ({ id: `showcase.${entry.id}`, title: `Jump to ${entry.title}`, description: entry.summary, keys: [], scope: 'global', category: 'Showcases', aliases: [entry.category, ...entry.components], execute: ({ state }) => { selectShowcase(state, index); state.focus.focus('preview'); state.overlays.toast(`Jumped to ${entry.title}.`, 'success', 4); } })),
    ...THEME_NAMES.map((name) => ({ id: `theme.${name}`, title: `Theme: ${name}`, description: `Apply ${name}`, keys: [], scope: 'global', category: 'Theme', disabled: ({ state }) => state.themeName === name, execute: ({ state }) => setTheme(state, name) })),
  ]);
  return registry;
}

function openHelp(state) {
  const entry = activeEntry(state);
  state.overlays.push({
    type: 'help',
    title: ' Help ',
    children: [
      HelpOverlay({ title: ' Global controls ', shortcuts: state.actions.toHelpShortcuts(ctx(state), { scopes: 'global' }).slice(0, 12) }),
      HelpOverlay({ title: ` Local controls · ${entry.title} `, shortcuts: entry.controls.map((item) => [item.key, item.action]) }),
    ],
  });
  state.status = 'Help overlay open.';
}

function openPalette(state) {
  state.palette = createCommandPaletteState({ items: state.actions.toPaletteItems(ctx(state)), windowSize: 10 });
  state.overlays.push({
    type: 'palette',
    title: ' Command Palette ',
    children: [renderCommandPalette(state.palette, { title: ' Global Command Palette ', showHelp: true, theme: getTheme(state) })],
    onKey: ({ key, manager }) => {
      const result = handleCommandPaletteKey(state.palette, key);
      if (result.type === 'cancel') { manager.pop(); state.status = 'Command palette closed.'; return { type: 'close' }; }
      if (result.type === 'disabled') { state.overlays.toast(`${result.item.title} is disabled.`, 'warning', 4); return { type: 'disabled' }; }
      if (result.type === 'accept') {
        manager.pop();
        const action = result.item.value?.action;
        state.actions.execute(action, ctx(state));
        return { type: 'accept' };
      }
      manager.top().children = [renderCommandPalette(state.palette, { title: ' Global Command Palette ', showHelp: true, theme: getTheme(state) })];
      return { type: 'handled' };
    },
  });
  state.status = 'Command palette open.';
}

function setTheme(state, name) {
  if (!themes[name]) return;
  state.themeName = name;
  state.status = `Theme changed to ${name}.`;
  state.overlays.toast(`Theme changed to ${name}.`, 'success', 4);
}

function cycleTheme(state) {
  const index = THEME_NAMES.indexOf(state.themeName);
  setTheme(state, THEME_NAMES[((index + 1) % THEME_NAMES.length + THEME_NAMES.length) % THEME_NAMES.length]);
}

function resetCurrentShowcase(state) {
  const entry = activeEntry(state);
  state.showcaseState[entry.id] = entry.createInitialState?.() ?? {};
  state.overlays.toast(`Reset ${entry.title}.`, 'info', 4);
  state.status = `Reset ${entry.title}.`;
}

function selectShowcase(state, index) {
  state.selectedShowcaseIndex = clamp(index, 0, SHOWCASES.length - 1);
  state.list.selectedIndex = state.selectedShowcaseIndex;
}

function footerHints(state) {
  const base = state.actions.toFooterHints(ctx(state), { limit: 5, scopes: ['global'] });
  return state.focus.current() === 'nav' ? ['↑↓ select', 'PgUp/PgDn jump', 'Enter preview', ...base] : ['Esc nav', ...base];
}

function activeEntry(state) { return SHOWCASES[clamp(state.selectedShowcaseIndex, 0, SHOWCASES.length - 1)] ?? SHOWCASES[0]; }
function getTheme(state) { return themes[state.themeName] ?? themes[DEFAULT_THEME] ?? themes.dark; }
function ctx(state, runtime = null) { return { state, runtime, app: runtime, exit: (code) => runtime?.exit?.(code), overlays: state.overlays, actions: state.actions }; }
function showcaseCtx(state, entry, runtime = null, width = state.viewport.width, height = state.viewport.height, theme = getTheme(state)) { return { app: state, state: state.showcaseState[entry.id], entry, runtime, width, height, theme, overlays: state.overlays, setStatus: (value) => { state.status = String(value ?? ''); } }; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min)); }
function mod(value, size) { return ((value % size) + size) % size; }
function t(value, theme, token = 'text') { return Text(theme ? color(theme, token, String(value ?? '')) : String(value ?? ''), { wrap: false }); }
function p(value, theme, token = 'text') { return Text(theme ? color(theme, token, String(value ?? '')) : String(value ?? '')); }
function metricGrid(items, theme) { return Grid({ columns: 3, gap: 2, border: true, borderColor: theme.borderMuted, items, renderItem: (item) => `${item.title}: ${item.value}` }); }

const SHOWCASES = [
  { id: 'welcome-tour-map', title: 'Welcome / Tour Map', category: 'Start', summary: 'Introduces the shell, navigation model, action-driven hints, overlays, and default theme.', components: ['WorkspaceApp', 'ActionRegistry', 'OverlayHost', 'WorkspaceHeader', 'Badge'], controls: [{ key: 'Enter', action: 'show tour toast' }], createInitialState: () => ({ visits: 0 }), render: ({ state, theme }) => Column({ gap: 1 }, p('This is a product-grade showcase for the terminal UI library. The app shell, global shortcuts, palette, overlays, and footer hints are driven by high-level primitives.', theme), Row({ gap: 1 }, ...['Layout', 'Input', 'Navigation', 'Feedback', 'AI blocks', 'Runtime'].map((label) => Badge({ label, tone: 'info', variant: 'outline', theme }))), WorkspacePane({ title: ' WHAT THIS DEMO COVERS ', theme, children: ['Declarative app runtime with safe cleanup and resize invalidation.', 'ActionRegistry as one source for shortcuts, footer, help, and palette.', 'OverlayHost with focus trapping for help, palette, modals, and confirmations.', 'Smart list, scroll, editor, Unicode width, and responsive layout helpers.'].map(Text) }), metricGrid([{ title: 'Layout', value: 'Shell + SplitPane' }, { title: 'Input', value: 'Editor + keys' }, { title: 'Navigation', value: 'List state' }, { title: 'Feedback', value: 'OverlayHost' }, { title: 'AI blocks', value: 'Structured render' }, { title: 'Runtime', value: 'Frame diff' }], theme), t(`Tour interactions: ${state.visits}`, theme, 'textMuted')), handleKey: ({ state, overlays }, key) => { if (key.name !== 'enter') return false; state.visits += 1; overlays.toast('The tour is interactive.', 'info', 3, 'Select entries on the left, then press Enter.'); return true; } },

  { id: 'layout-primitives', title: 'Layout Primitives', category: 'Layout', summary: 'Shows how boxes, rows, columns, grids, grow regions, and spacing compose stable terminal dashboards.', components: ['Box', 'Row', 'Column', 'Grid', 'SplitPane'], controls: [{ key: '1/2/3', action: 'compact / comfortable / spacious' }, { key: 'b', action: 'toggle borders' }, { key: 'g', action: 'grid vs stack' }], createInitialState: () => ({ densityIndex: 1, borders: true, gridMode: true }), render: ({ state, theme, width }) => {
    const modes = layoutDensityModes();
    const mode = modes[state.densityIndex] ?? modes[1];
    const panel = { border: state.borders, borderColor: theme.borderMuted, padding: { left: mode.padding, right: mode.padding } };
    const cards = layoutCards(mode);
    return Column({ gap: mode.gap },
      Row({ gap: mode.gap, distribute: true },
        Box({ ...panel, title: ` ${mode.label} card A ` }, t('Box + Row', theme, 'title'), Text(mode.cardText), Text(`gap:${mode.gap} padding:${mode.padding}`)),
        Box({ ...panel, title: ' grow card B ' }, t('Column region', theme, 'title'), Text('This card absorbs width next to the first card.'), Text(`columns:${state.gridMode ? mode.columns : 1}`)),
      ),
      Box({ ...panel, title: ` ${state.gridMode ? 'Grid' : 'Stacked cards'} · density ${state.densityIndex + 1} ` },
        Grid({
          items: cards,
          columns: state.gridMode ? mode.columns : 1,
          gap: mode.gap,
          border: state.borders,
          borderColor: theme.borderMuted,
          renderItem: (item) => `${item.icon} ${item.title}: ${item.detail}`,
        }),
      ),
      Box({ ...panel, title: ' fill-height detail region ' },
        Text('Density now changes column count, padding, gap, and copy length, so the layout shift is visible but controlled.'),
        Text(`Mode: ${mode.label} · borders ${state.borders ? 'on' : 'off'} · ${state.gridMode ? 'grid' : 'stack'} · terminal width ${width}`),
      ),
    );
  }, handleKey: ({ state, overlays }, key) => {
    if (key.printable && ['1', '2', '3'].includes(key.text)) { state.densityIndex = Number(key.text) - 1; return true; }
    if (key.printable && key.text === 'b') { state.borders = !state.borders; overlays.toast(`Borders ${state.borders ? 'enabled' : 'disabled'}.`); return true; }
    if (key.printable && key.text === 'g') { state.gridMode = !state.gridMode; overlays.toast(state.gridMode ? 'Grid mode enabled.' : 'Stacked mode enabled.'); return true; }
    return false;
  } },

  { id: 'themes-text-tokens', title: 'Themes and Text Tokens', category: 'Layout', summary: 'Demonstrates semantic theme tokens and built-in themes without hardcoding raw colors.', components: ['themes', 'color()', 'Badge', 'semantic tokens'], controls: [{ key: '←/→', action: 'select theme' }, { key: 'Enter', action: 'apply' }], createInitialState: () => ({ selectedTheme: THEME_NAMES.indexOf(DEFAULT_THEME) }), render: ({ state, app, theme }) => { const name = THEME_NAMES[state.selectedTheme] ?? DEFAULT_THEME; const preview = themes[name] ?? theme; const tokens = ['surface', 'surfaceActive', 'borderMuted', 'textAccent', 'textMuted', 'success', 'warning', 'danger', 'info', 'selected']; return Column({ gap: 1 }, WorkspacePane({ title: ` TOKEN GALLERY · ${name} `, theme: preview, children: tokens.map((token) => t(`${token.padEnd(14)} ${color(preview, token, `sample ${token}`)}`, preview)) }), Row({ gap: 2, distribute: true }, SummaryList({ title: ' Themes ', selectedIndex: state.selectedTheme, items: THEME_NAMES.map((item) => ({ title: item, description: item === app.themeName ? 'active' : 'available' })) }), WorkspacePane({ title: ' Micro components ', theme: preview, children: [Row({ gap: 1 }, Badge({ label: 'info', tone: 'info', theme: preview }), Badge({ label: 'ok', tone: 'success', variant: 'filled', theme: preview }), Badge({ label: 'warn', tone: 'warning', variant: 'outline', theme: preview })), Text(color(preview, 'textMuted', 'Semantic tokens keep contrast consistent across themes.'))] }))); }, handleKey: ({ state, app, overlays }, key) => { if (key.name === 'left') { state.selectedTheme = mod(state.selectedTheme - 1, THEME_NAMES.length); return true; } if (key.name === 'right') { state.selectedTheme = mod(state.selectedTheme + 1, THEME_NAMES.length); return true; } if (key.name === 'enter') { app.themeName = THEME_NAMES[state.selectedTheme]; overlays.toast(`Applied ${app.themeName}.`, 'success'); return true; } return false; } },

  { id: 'workspace-shell-anatomy', title: 'Workspace Shell Anatomy', category: 'Layout', summary: 'Shows a recommended app shell with local pane focus, scrollable regions, command entry, history, and autocomplete.', components: ['WorkspaceShell', 'InputEditor', 'WorkspaceCommandBar', 'ScrollPane'], controls: [{ key: 'Tab', action: 'focus/complete' }, { key: '[/] or click', action: 'switch tab' }, { key: 'text', action: 'type command' }, { key: 'Enter', action: 'submit command' }, { key: 'wheel / ↑/↓', action: 'scroll' }], createInitialState: () => ({ focusIndex: 0, tabIndex: 0, command: new InputEditor(''), history: ['test ui --watch', 'explain renderer diff', 'reset workspace'], historyIndex: null, activity: ['workspace opened', 'main pane focused', 'press Tab twice to reach the command bar', 'try typing “de”, “te”, “ex”, or “re” and press Tab'], mainScroll: createScrollState({ totalRows: 18, visibleRows: 8, sticky: false }), activityScroll: createScrollState({ totalRows: 4, visibleRows: 8, sticky: true }) }), render: ({ state, theme, width }) => {
    const foci = ['main', 'activity', 'command'];
    const tabs = [{ id: 'overview', label: 'Overview' }, { id: 'tasks', label: 'Tasks' }, { id: 'logs', label: 'Logs' }];
    const focus = foci[state.focusIndex];
    const activeTab = tabs[state.tabIndex].id;
    const mainLines = workspaceMainLines(activeTab);
    const activityLines = state.activity.map((line, index) => `${String(index + 1).padStart(2, '0')}  ${line}`);
    updateScrollState(state.mainScroll, { totalRows: mainLines.length, visibleRows: 8 });
    updateScrollState(state.activityScroll, { totalRows: activityLines.length, visibleRows: 8 });
    const suggestions = workspaceCommandSuggestions(state.command.value);
    return WorkspaceShell({
      title: 'Mini workspace',
      subtitle: 'local command shell preview',
      stats: [{ label: 'local focus', value: focus }, { label: 'commands', value: state.history.length }, { label: 'suggestions', value: suggestions.length }],
      focus,
      tabs,
      activeTab,
      tabHint: '[/] or click tab · wheel/↑/↓ scroll · Tab local focus',
      onTabSelect: (_id, _tab, index) => {
        state.tabIndex = index;
        state.mainScroll.scroll = 0;
      },
      main: Row({ gap: 2, widths: [Math.max(34, Math.floor(width * 0.42)), Math.max(34, Math.floor(width * 0.34))] },
        WorkspacePane({ title: ' MAIN ', active: focus === 'main', theme, pointerId: 'kit:workspace-main', onClick: () => { state.focusIndex = 0; }, children: [ScrollPane({ title: `${tabs[state.tabIndex].label} content`, lines: mainLines, width: Math.max(30, Math.floor(width * 0.42)), height: 10, scroll: state.mainScroll.scroll, footer: true, pointerId: 'kit:workspace-main-scroll', onWheel: (event) => scrollStateByWheel(state.mainScroll, event) })] }),
        WorkspacePane({ title: ' ACTIVITY ', active: focus === 'activity', theme, pointerId: 'kit:workspace-activity', onClick: () => { state.focusIndex = 1; }, children: [ScrollPane({ title: 'Command activity', lines: activityLines, width: Math.max(30, Math.floor(width * 0.34)), height: 10, scroll: state.activityScroll.scroll, footer: true, pointerId: 'kit:workspace-activity-scroll', onWheel: (event) => scrollStateByWheel(state.activityScroll, event) })] }),
      ),
      command: WorkspaceCommandBar({ value: state.command.value, suggestions, mode: focus === 'command' ? 'COMMAND*' : 'COMMAND', theme }),
      footer: WorkspaceFooter({ left: ['Main/activity scroll when focused', 'Command focus supports autocomplete'], right: [`cursor ${state.command.cursor}`], theme }),
      theme,
    });
  }, handleKey: ({ state, overlays }, key) => {
    const foci = ['main', 'activity', 'command'];
    const focus = foci[state.focusIndex];
    if (focus === 'main') { const result = handleScrollKey(state.mainScroll, key, { includeHomeEnd: true }); if (result.handled) return true; }
    if (focus === 'activity') { const result = handleScrollKey(state.activityScroll, key, { includeHomeEnd: true }); if (result.handled) return true; }
    if (focus === 'command' && key.name === 'tab' && !key.shift) {
      const suggestion = workspaceCommandSuggestions(state.command.value)[0];
      if (suggestion && suggestion !== state.command.value) { state.command.set(suggestion); state.command.end(); overlays.toast(`Completed: ${suggestion}`, 'info'); return true; }
    }
    if (key.name === 'tab') { state.focusIndex = mod(state.focusIndex + (key.shift ? -1 : 1), foci.length); return true; }
    if (key.printable && key.text === '[') { state.tabIndex = mod(state.tabIndex - 1, 3); state.mainScroll.scroll = 0; return true; }
    if (key.printable && key.text === ']') { state.tabIndex = mod(state.tabIndex + 1, 3); state.mainScroll.scroll = 0; return true; }
    if (focus === 'command' && key.name === 'up') { state.historyIndex = clamp(state.historyIndex === null ? state.history.length - 1 : state.historyIndex - 1, 0, Math.max(0, state.history.length - 1)); state.command.set(state.history[state.historyIndex] ?? ''); state.command.end(); return true; }
    if (focus === 'command' && key.name === 'down') { state.historyIndex = state.historyIndex === null ? null : state.historyIndex + 1; if (state.historyIndex === null || state.historyIndex >= state.history.length) { state.historyIndex = null; state.command.set(''); } else state.command.set(state.history[state.historyIndex]); state.command.end(); return true; }
    if (focus === 'command' && key.name === 'enter') { const command = state.command.value.trim(); if (!command) { overlays.toast('Command is empty.', 'warning'); return true; } state.history.push(command); state.activity.push(`ran: ${command}`); state.command.set(''); state.historyIndex = null; updateScrollState(state.activityScroll, { totalRows: state.activity.length, visibleRows: 8 }); overlays.toast(`Command accepted: ${command}`, 'success'); return true; }
    if (focus === 'command') { const edited = handleInputEditorKey(state.command, key, { multiline: false }); if (edited.handled) { state.historyIndex = null; return true; } }
    return false;
  } },

  { id: 'selection-lists-windowing', title: 'Selection, Lists, and Windowing', category: 'Navigation', summary: 'Demonstrates stateful list navigation with disabled-row skipping and windowing.', components: ['createListState', 'SelectList', 'SummaryList', 'getListWindow'], controls: [{ key: '↑/↓', action: 'move' }, { key: 'PgUp/PgDn', action: 'page' }, { key: 'Home/End', action: 'jump' }, { key: 'Enter', action: 'open' }], createInitialState: () => { const items = ticketItems(); return { list: createListState({ items, windowSize: 10, getDisabled: (item) => item.disabled }), opened: [] }; }, render: ({ state, theme }) => { const selected = state.list.items[state.list.selectedIndex]; return Row({ gap: 2, widths: [44, 48] }, SelectList({ title: 'Tickets', items: state.list.items, selectedIndex: state.list.selectedIndex, windowSize: state.list.windowSize, getLabel: (item) => item.title, getDescription: (item) => item.disabled ? 'disabled' : item.priority, theme, pointerId: 'kit:tickets', onSelect: (_item, index) => { state.list.selectedIndex = index; }, onWheel: (event) => moveListByWheel(state.list, event) }), Column({ gap: 1 }, KeyValueBlock({ title: ' Selected ', rows: selected ? [['id', selected.title], ['priority', selected.priority], ['disabled', selected.disabled ? 'yes' : 'no'], ['window start', getListWindow(state.list).start + 1]] : [['selected', 'none']] }), SummaryList({ title: ' Opened ', selectedIndex: -1, items: state.opened.slice(-5).map((title) => ({ title, description: 'accepted' })), emptyText: 'Press Enter on an enabled row.' })) ); }, handleKey: ({ state, overlays }, key) => { const result = handleListKey(state.list, key); if (result.handled) return true; if (key.name === 'enter') { const item = state.list.items[state.list.selectedIndex]; if (item.disabled) overlays.toast('Disabled rows are skipped and cannot be accepted.', 'warning'); else { state.opened.push(item.title); overlays.toast(`Opened ${item.title}.`, 'success'); } return true; } return false; } },

  { id: 'command-palette-demo', title: 'Command Palette', category: 'Input', summary: 'Shows fuzzy command search with categories, shortcuts, disabled rows, and visible accepted results without leaving the screen.', components: ['CommandPalette v2', 'fuzzy scoring', 'ActionRegistry'], controls: [{ key: 'type', action: 'filter' }, { key: '↑/↓', action: 'move' }, { key: 'Enter', action: 'accept/log' }, { key: 'Esc', action: 'clear' }], createInitialState: () => ({ palette: createCommandPaletteState({ items: localPaletteItems(), windowSize: 8 }), accepted: [] }), render: ({ state, theme }) => {
    const matches = getCommandPaletteMatches(state.palette);
    const selected = matches[state.palette.selectedIndex];
    const acceptedRows = state.accepted.length
      ? state.accepted.slice(-5).map((item) => Text(`${item.status.padEnd(8)} ${item.title}`))
      : [Text('No accepted action yet.'), Text('Press Enter on a command to log the result.')];
    return Column({ gap: 1 },
      renderCommandPalette(state.palette, { title: ' Embedded Command Palette ', showHelp: false, theme }),
      Row({ gap: 2, widths: [44, 44] },
        WorkspacePane({ title: ' Selected ', theme, height: 9, children: selected ? [
          Text(`id           ${selected.id}`),
          Text(`category     ${selected.category ?? 'General'}`),
          Text(`disabled     ${selected.disabled ? 'yes' : 'no'}`),
          Text(`query        ${getPaletteQuery(state.palette) || '<empty>'}`),
          Text(`shortcut     ${(selected.keys ?? []).join(', ') || 'none'}`),
        ] : [Text('No selected command.')] }),
        WorkspacePane({ title: ' Accepted ', theme, height: 9, children: acceptedRows }),
      ),
    );
  }, handleKey: ({ state, overlays }, key) => {
    const result = handleCommandPaletteKey(state.palette, key);
    if (result.type === 'disabled') { overlays.toast(`${result.item.title} is disabled.`, 'warning'); return true; }
    if (result.type === 'accept') {
      state.accepted.push({ title: result.item.title, status: result.item.disabled ? 'blocked' : 'accepted' });
      overlays.toast(`Logged: ${result.item.title}`, 'success');
      return true;
    }
    return result.type !== 'noop';
  } },

  { id: 'text-editor-input', title: 'Text Editor and Input Mechanics', category: 'Input', summary: 'Demonstrates modern multiline editing, cursor diagnostics, word movement, kill operations, and bracketed paste.', components: ['InputEditor', 'handleInputEditorKey', 'TextEditorView'], controls: [{ key: 'text', action: 'edit' }, { key: 'Ctrl+A/E', action: 'line bounds' }, { key: 'Ctrl+U/K', action: 'kill' }, { key: 's/r', action: 'save/reset' }], createInitialState: () => ({ editor: new InputEditor('Write a concise terminal UI note.\nUse multiple lines and move the cursor around.'), snapshots: [] }), render: ({ state, theme, width }) => { const pos = state.editor.getCursorPosition(); return Row({ gap: 2, widths: [Math.max(44, Math.floor(width * 0.58)), Math.max(30, Math.floor(width * 0.32))] }, TextEditorView({ title: ' Draft editor ', value: state.editor.value, cursor: state.editor.cursor, width: Math.max(42, Math.floor(width * 0.58)), height: 12, placeholder: 'Start typing…', lineNumbers: true }), Column({ gap: 1 }, KeyValueBlock({ title: ' Cursor ', rows: [['cursor', state.editor.cursor], ['row/column', `${pos.line + 1}/${pos.column + 1}`], ['lines', state.editor.value.split('\n').length], ['chars', Array.from(state.editor.value).length]] }), WorkspacePane({ title: ' Snapshots ', theme, children: (state.snapshots.length ? state.snapshots.slice(-5) : ['Press s to save a snapshot.']).map((item) => Text(truncateVisible(String(item).replaceAll('\n', ' / '), 42))) }))); }, handleKey: ({ state, overlays }, key) => { if (key.printable && key.text === 's') { state.snapshots.push(state.editor.value || '<empty>'); overlays.toast('Draft snapshot saved.', 'success'); return true; } if (key.printable && key.text === 'r') { state.editor.set(''); return true; } return handleInputEditorKey(state.editor, key, { multiline: true }).handled; } },

  { id: 'scrollable-surfaces', title: 'Scrollable Surfaces', category: 'Navigation', summary: 'Shows stateful scroll panes with sticky-bottom behavior for logs and transcripts.', components: ['createScrollState', 'handleScrollKey', 'ScrollPane', 'visibleWindowLines'], controls: [{ key: 'wheel / ↑/↓', action: 'line' }, { key: 'PgUp/PgDn', action: 'page' }, { key: 'Home/End', action: 'jump' }, { key: 'a/s', action: 'append/sticky' }], createInitialState: () => ({ lines: logLines(38), scroll: createScrollState({ totalRows: 38, visibleRows: 13, sticky: true }), appended: 0 }), render: ({ state, theme, width }) => { updateScrollState(state.scroll, { totalRows: state.lines.length, visibleRows: 13 }); const win = visibleWindowLines(state.lines, { height: 13, scroll: state.scroll.scroll }); return Row({ gap: 2, widths: [Math.max(52, width - 36), 32] }, ScrollPane({ title: ' Transcript log ', lines: state.lines, width: Math.max(52, width - 36), height: 17, scroll: state.scroll.scroll, footer: true, pointerId: 'kit:scrollable-log', onWheel: (event) => scrollStateByWheel(state.scroll, event) }), KeyValueBlock({ title: ' Scroll state ', rows: [['scroll', `${win.scroll}/${win.maxScroll}`], ['start row', win.start + 1], ['at bottom', win.atBottom ? 'yes' : 'no'], ['sticky', state.scroll.sticky ? 'on' : 'off'], ['total rows', state.lines.length]] })); }, handleKey: ({ state, overlays }, key) => { const result = handleScrollKey(state.scroll, key, { includeHomeEnd: true }); if (result.handled) return true; if (key.printable && key.text === 's') { state.scroll.sticky = !state.scroll.sticky; overlays.toast(`Sticky autoscroll ${state.scroll.sticky ? 'enabled' : 'disabled'}.`); return true; } if (key.printable && key.text === 'a') { state.appended += 1; state.lines.push(`${String(state.lines.length + 1).padStart(3, '0')}  appended live event ${state.appended}`); updateScrollState(state.scroll, { totalRows: state.lines.length, visibleRows: 13 }); return true; } return false; } },

  { id: 'feedback-overlays', title: 'Feedback: Toasts, Modals, Confirmations', category: 'Feedback', summary: 'Shows root-level OverlayHost behavior: non-blocking toasts and blocking modal/confirm focus traps.', components: ['OverlayHost', 'Toast', 'Modal', 'ConfirmPrompt'], controls: [{ key: '↑/↓', action: 'choose' }, { key: 'Enter', action: 'trigger' }, { key: 'Esc', action: 'close overlay/nav' }, { key: '←/→', action: 'confirm choice' }], createInitialState: () => ({ list: createListState({ items: ['Show info toast', 'Show success toast', 'Show warning toast', 'Show error toast', 'Open modal', 'Open confirmation'], windowSize: 6 }), events: [] }), render: ({ state, theme }) => Row({ gap: 2, distribute: true }, SelectList({ title: 'Actions', items: state.list.items, selectedIndex: state.list.selectedIndex, windowSize: 6, theme, pointerId: 'kit:feedback-actions', onSelect: (_item, index) => { state.list.selectedIndex = index; }, onWheel: (event) => moveListByWheel(state.list, event) }), WorkspacePane({ title: ' Event log ', theme, children: (state.events.length ? state.events.slice(-8) : ['No feedback events yet.']).map(Text) }), WorkspacePane({ title: ' Overlay rules ', theme, children: [Text('Toast: non-blocking, root-level, auto-expiring.'), Text('Modal/Confirm: blocking, Esc closes top overlay.'), Text('Opening a modal does not create a toast.')] })), handleKey: ({ state, overlays }, key) => {
    const result = handleListKey(state.list, key); if (result.handled) return true;
    if (key.name === 'enter') {
      const index = state.list.selectedIndex;
      if (index === 0) { overlays.toast('Information toast from OverlayHost.', 'info'); state.events.push('info toast shown'); }
      else if (index === 1) { overlays.toast('Success toast from OverlayHost.', 'success'); state.events.push('success toast shown'); }
      else if (index === 2) { overlays.toast('Warning toast uses a warning border.', 'warning'); state.events.push('warning toast shown'); }
      else if (index === 3) { overlays.toast('Error toast uses a danger border.', 'error'); state.events.push('error toast shown'); }
      else if (index === 4) { overlays.toasts = []; overlays.modal({ title: ' Modal ', children: ['Background input is trapped while this modal is open.', 'Esc closes. Enter accepts.'], onAccept: () => state.events.push('modal accepted'), onCancel: () => state.events.push('modal closed') }); state.events.push('modal opened'); }
      else { overlays.toasts = []; overlays.confirm({ title: ' Confirm action ', message: 'Apply the simulated destructive action?', onConfirm: () => state.events.push('confirmation accepted'), onCancel: () => state.events.push('confirmation cancelled') }); state.events.push('confirmation opened'); }
      return true;
    }
    return false;
  } },

  { id: 'progress-live-jobs', title: 'Progress and Live Jobs', scrollable: true, category: 'Feedback', summary: 'Shows deterministic long-running task visualization with live metrics and explicit running/completed states.', components: ['ProgressBar', 'Spinner', 'LiveJobBlock', 'MetricBlock'], controls: [{ key: 'Space', action: 'start/pause' }, { key: '↑/↓ Pg', action: 'scroll' }, { key: 'r', action: 'reset' }, { key: 'f', action: 'finish' }], createInitialState: () => progressState(), render: ({ state, app, theme, width, height }) => {
    const content = Column({ gap: 1 },
      LiveJobBlock({
        title: ' Simulated deployment ',
        status: state.progress >= 100 ? 'completed' : state.status,
        running: state.progress < 100 && state.running,
        steps: state.steps,
        activeIndex: state.activeIndex,
        progress: state.progress,
        frame: app.frame,
      }),
      Row({ gap: 2, distribute: true },
        MetricBlock({ title: ' Elapsed ', value: `${state.elapsed}s`, detail: 'fake clock', pulse: state.running }),
        MetricBlock({ title: ' Lifecycle ', value: state.running ? 'running' : state.status, detail: state.progress >= 100 ? 'spinner stopped' : 'local timer' }),
        MetricBlock({ title: ' Throughput ', value: `${state.processed}/${state.totalFiles}`, detail: 'files' }),
      ),
      WorkspacePane({ title: ' PROGRESS BAR VARIANTS ', theme, children: [
        Column({ gap: 1 },
          ProgressBar({ value: state.progress, total: 100, width: 26, label: 'compact rail', variant: 'compact' }),
          ProgressBar({ value: state.progress, total: 100, width: 26, label: 'block fill', variant: 'block' }),
          ProgressBar({ value: state.progress, total: 100, width: 26, label: 'line track', variant: 'line' }),
          ProgressBar({ value: state.progress, total: 100, width: 26, label: 'square cells', variant: 'squares' }),
          ProgressBar({ value: state.progress, total: 100, width: 26, label: 'inset rail', variant: 'inset' }),
          ProgressBar({ value: state.progress, total: 100, width: 42, label: 'boxed', variant: 'boxed' }),
        ),
      ] }),
      p('Compact, block, line, squares, and inset variants occupy one row. Boxed progress is a real three-row component and participates in layout height normally.', theme, 'textMuted'),
    );
    return content;
  }, handleKey: ({ state, overlays }, key) => {
    const scrollResult = handleScrollKey(state.scroll, key, { includeHomeEnd: true });
    if (scrollResult.handled) return true;
    if (key.name === 'space' || (key.printable && key.text === ' ')) {
      if (state.progress >= 100) Object.assign(state, progressState());
      state.running = !state.running;
      state.status = state.running ? 'running' : 'paused';
      overlays.toast(state.running ? 'Job started.' : 'Job paused.');
      return true;
    }
    if (key.printable && key.text === 'r') { Object.assign(state, progressState()); return true; }
    if (key.printable && key.text === 'f') {
      state.progress = 100;
      state.running = false;
      state.status = 'completed';
      state.activeIndex = state.steps.length;
      state.processed = state.totalFiles;
      overlays.toast('Job finished immediately.', 'success');
      return true;
    }
    return false;
  } },

  { id: 'progress-status-controller', title: 'Progress Status and Batching', scrollable: true, category: 'Feedback', summary: 'Demonstrates controller-owned progress state, throttled invalidation, rate and ETA calculation, batching, lifecycle states, and LiveJobBlock integration.', components: ['ProgressStatus', 'ProgressStatus.create', 'LiveJobBlock', 'ProgressBar'], controls: [{ key: 'Space', action: 'pause/resume' }, { key: '↑/↓ Pg', action: 'scroll' }, { key: 'b', action: 'complete one batch' }, { key: 'c', action: 'complete all' }, { key: 'f', action: 'fail' }, { key: 'r', action: 'reset' }], createInitialState: () => progressStatusState(), render: ({ state, app, theme, width, height }) => {
    const download = state.download.snapshot();
    const batch = state.batch.snapshot();
    const content = Column({ gap: 1 },
      WorkspacePane({ title: ' CONTROLLER-DRIVEN DOWNLOAD ', theme, children: [
        ProgressStatus({ progress: state.download, label: 'Assets', width: 30, variant: 'inset', format: 'bytes', frame: app.frame }),
        Text('set()/add() update exact state; invalidate() is throttled independently from the task callback.'),
      ] }),
      Row({ gap: 2, distribute: true },
        WorkspacePane({ title: ' BATCHES ', theme, children: [
          ProgressStatus({ progress: state.batch, label: 'Compile', width: 14, variant: 'line', frame: app.frame, showElapsed: false, showEta: false }),
          Text(color(theme, 'textMuted', 'b marks one additional batch as complete.'), { wrap: true }),
          Text(color(theme, 'textAccent', state.batchNotice), { wrap: true }),
        ] }),
        WorkspacePane({ title: ' LIFECYCLE STATES ', theme, children: [
          ProgressStatus({ progress: state.paused, label: 'Paused', width: 12, variant: 'compact', showRate: false, showElapsed: false, showEta: false }),
          ProgressStatus({ progress: state.completed, label: 'Done', width: 12, variant: 'compact', showRate: false, showElapsed: false, showEta: false }),
          ProgressStatus({ progress: state.failed, label: 'Failed', width: 12, variant: 'compact', showRate: false, showElapsed: false, showEta: false, showValue: false }),
        ] }),
      ),
      LiveJobBlock({
        title: ' Controller-backed job ',
        progress: state.download,
        progressVariant: 'inset',
        showProgressDetails: true,
        frame: app.frame,
        activeIndex: Math.min(3, Math.floor(download.ratio * 4)),
        steps: ['Open stream', 'Decode chunks', 'Write cache', 'Verify artifact'],
      }),
      KeyValueBlock({ title: ' Controller snapshot ', rows: [
        ['state', download.state],
        ['value', `${Math.round(download.value / 1024 / 1024)} / ${Math.round(download.total / 1024 / 1024)} MiB`],
        ['rate', download.rate > 0 ? `${(download.rate / 1024 / 1024).toFixed(1)} MiB/s` : 'n/a'],
        ['eta', download.etaMs === null ? 'n/a' : `${Math.ceil(download.etaMs / 1000)}s`],
        ['batch', `${batch.value}/${batch.total}`],
        ['manual batch actions', String(state.manualBatchAdds)],
      ] }),
    );
    return content;
  }, handleKey: ({ state, overlays }, key) => {
    const scrollResult = handleScrollKey(state.scroll, key, { includeHomeEnd: true });
    if (scrollResult.handled) return true;
    if (key.name === 'space' || (key.printable && key.text === ' ')) {
      if (state.download.state === 'completed' || state.download.state === 'failed') resetProgressStatusState(state);
      state.running = !state.running;
      state.running ? state.download.resume() : state.download.pause();
      overlays.toast(state.running ? 'Controller resumed.' : 'Controller paused.');
      return true;
    }
    if (key.printable && key.text === 'b') {
      const before = state.batch.snapshot();
      state.batch.add(1);
      const after = state.batch.snapshot();
      if (after.value > before.value) {
        state.manualBatchAdds += 1;
        state.batchNotice = `Manual batch completed: ${after.value}/${after.total}.`;
        overlays.toast(state.batchNotice, 'info');
      } else {
        state.batchNotice = `All ${after.total} batches are already complete.`;
        overlays.toast(state.batchNotice, 'warning');
      }
      return true;
    }
    if (key.printable && key.text === 'c') {
      state.download.complete();
      state.batch.complete();
      state.batchNotice = 'All batches completed together with the download.';
      state.running = false;
      overlays.toast('Controllers completed.', 'success');
      return true;
    }
    if (key.printable && key.text === 'f') {
      state.download.fail(new Error('simulated network failure'));
      state.running = false;
      overlays.toast('Controller failed.', 'error');
      return true;
    }
    if (key.printable && key.text === 'r') { resetProgressStatusState(state); return true; }
    return false;
  } },

  { id: 'timeline-activity-feeds', title: 'Timeline and Activity Feeds', category: 'Feedback', summary: 'Demonstrates event streams, metrics, and structured detail panes.', components: ['Timeline', 'createTimelineEvent', 'MetricBlock', 'KeyValueBlock'], controls: [{ key: 'a', action: 'event' }, { key: 'e', action: 'error' }, { key: 'c', action: 'clear' }, { key: '↑/↓ Pg', action: 'select' }], createInitialState: () => ({ events: timelineSeed(), selected: 0, sequence: 3 }), render: ({ state }) => { const selected = state.events[state.selected]; return Column({ gap: 1 }, Row({ gap: 2, distribute: true }, MetricBlock({ title: ' Events ', value: state.events.length, detail: 'total' }), MetricBlock({ title: ' Errors ', value: state.events.filter((e) => e.type === 'error').length, detail: 'marked' }), MetricBlock({ title: ' Selected ', value: selected ? String(state.selected + 1) : 'none', detail: selected?.type ?? '' })), Row({ gap: 2, widths: [54, 42] }, Timeline({ title: ' Activity timeline ', events: state.events, limit: 11, getLine: (e) => `${state.events[state.selected]?.id === e.id ? '›' : ' '} ${e.time.slice(11, 16)} ${e.type.padEnd(10)} ${e.text}` }), KeyValueBlock({ title: ' Event detail ', rows: selected ? [['id', selected.id.slice(0, 16)], ['type', selected.type], ['actor', selected.actor], ['time', selected.time.slice(11, 19)], ['text', truncateVisible(selected.text, 28)]] : [['selected', 'none']] }))); }, handleKey: ({ state }, key) => { if (key.name === 'up') { state.selected = clamp(state.selected - 1, 0, Math.max(0, state.events.length - 1)); return true; } if (key.name === 'down') { state.selected = clamp(state.selected + 1, 0, Math.max(0, state.events.length - 1)); return true; } if (key.name === 'page-up') { state.selected = clamp(state.selected - 8, 0, Math.max(0, state.events.length - 1)); return true; } if (key.name === 'page-down') { state.selected = clamp(state.selected + 8, 0, Math.max(0, state.events.length - 1)); return true; } if (key.printable && key.text === 'a') { state.sequence += 1; state.events.unshift(createTimelineEvent({ type: 'activity', actor: 'demo', text: `processed component sample ${state.sequence}` })); state.selected = 0; return true; } if (key.printable && key.text === 'e') { state.sequence += 1; state.events.unshift(createTimelineEvent({ type: 'error', actor: 'runtime', text: `recoverable render warning ${state.sequence}` })); state.selected = 0; return true; } if (key.printable && key.text === 'c') { state.events = []; state.selected = 0; return true; } return false; } },

  { id: 'structured-assistant-blocks', title: 'Structured Assistant Blocks', category: 'AI blocks', summary: 'Shows scrollable chat-oriented structured rendering with text, code, diff, command, warning, and tool result blocks.', components: ['createBlock', 'renderBlocksLines', 'ScrollPane', 'transcript roles'], controls: [{ key: '[/] or click', action: 'scenario' }, { key: 'wheel / ↑/↓', action: 'scroll' }, { key: 'c', action: 'copy toast' }], createInitialState: () => ({ scenario: 0, generation: 1, scroll: createScrollState({ totalRows: 0, visibleRows: 13, sticky: false }) }), render: ({ state, theme, width }) => {
    const scenario = blockScenarios()[state.scenario];
    const blocks = scenario.blocks(state.generation);
    const sideWidth = width >= 92 ? 40 : 0;
    const transcriptWidth = sideWidth ? Math.max(54, width - sideWidth - 2) : Math.max(54, width);
    const blockWidth = Math.max(24, transcriptWidth - 6);
    const blockLines = renderBlocksLines({ blocks, width: blockWidth, theme });
    const transcriptLines = [color(theme, 'user', 'user     ● Show me the current recommendation.'), color(theme, 'assistant', 'assistant ●'), ...blockLines];
    updateScrollState(state.scroll, { totalRows: transcriptLines.length, visibleRows: 13 });
    const counts = blockTypeCounts(blocks);
    const anatomy = KeyValueBlock({ title: ' Block anatomy ', rows: [['scroll', `${state.scroll.scroll}/${Math.max(0, transcriptLines.length - state.scroll.visibleRows)}`], ['text/code', `${counts.text ?? 0}/${counts.code ?? 0}`], ['diff/tool', `${counts.diff ?? 0}/${counts.tool_result ?? 0}`], ['warning', counts.warning ?? 0]] });
    const transcript = ScrollPane({ title: ` Assistant response · ${scenario.title} `, lines: transcriptLines, width: transcriptWidth, height: 17, scroll: state.scroll.scroll, footer: true, pointerId: 'kit:assistant-transcript', onWheel: (event) => scrollStateByWheel(state.scroll, event) });
    return Column({ gap: 1 },
      SectionTabs({ tabs: blockScenarios().map((item, index) => ({ id: String(index), label: item.title })), active: String(state.scenario), theme, pointerId: 'kit:assistant-scenarios', onSelect: (_id, _tab, index) => { state.scenario = index; state.scroll.scroll = 0; } }),
      sideWidth ? Row({ gap: 2, widths: [transcriptWidth, sideWidth] }, transcript, anatomy) : Column({ gap: 1 }, transcript, anatomy),
      p('Scroll keys inspect longer assistant messages without leaving preview focus.', theme, 'textMuted'),
    );
  }, handleKey: ({ state, overlays }, key) => {
    const count = blockScenarios().length;
    if (key.printable && key.text === '[') { state.scenario = mod(state.scenario - 1, count); state.scroll.scroll = 0; return true; }
    if (key.printable && key.text === ']') { state.scenario = mod(state.scenario + 1, count); state.scroll.scroll = 0; return true; }
    const scrollResult = handleScrollKey(state.scroll, key, { includeHomeEnd: true }); if (scrollResult.handled) return true;
    if (key.printable && key.text === 'c') { overlays.toast('Copied structured block summary.', 'info'); return true; }
    return false;
  } },

  { id: 'responsive-layout', title: 'Responsive Layout', category: 'Layout', summary: 'Shows responsive helpers, breakpoints, RequireViewport fallback, and declarative SplitPane constraints.', components: ['RequireViewport', 'getResponsiveMode', 'responsiveColumns', 'SplitPane'], controls: [{ key: '←/→', action: 'simulate' }, { key: '0', action: 'use actual width' }], createInitialState: () => ({ simulated: -1 }), render: ({ state, app, theme, width }) => { const widths = [96, 128, 172]; const actual = state.simulated < 0; const terminalWidth = Math.max(1, Number(app.viewport.width) || width || 1); const previewWidth = Math.max(1, Number(width) || terminalWidth); const effective = actual ? previewWidth : widths[state.simulated]; const mode = getResponsiveMode(effective); const columns = responsiveColumns(effective, mode); return Column({ gap: 1 }, metricGrid([{ title: 'Terminal', value: `${terminalWidth} cols` }, { title: 'Preview', value: `${previewWidth} cols` }, { title: 'Mode', value: mode }], theme), KeyValueBlock({ title: ' Computed mode ', rows: [['source', actual ? 'actual preview width' : 'simulated'], ['terminal width', terminalWidth], ['preview width', previewWidth], ['effective width', effective], ['mode', mode], ['columns', Object.entries(columns).map(([k, v]) => `${k}:${v}`).join(' ')]] }), mode === 'narrow' ? WorkspacePane({ title: ' SINGLE COLUMN ', theme, children: [Text('Navigation, content, and details stack vertically.')] }) : mode === 'medium' ? Row({ gap: 2, distribute: true }, WorkspacePane({ title: ' LEFT ', theme, children: [Text('List or nav')] }), WorkspacePane({ title: ' MAIN ', theme, children: [Text('Primary content')] })) : Row({ gap: 2, distribute: true }, WorkspacePane({ title: ' LEFT ', theme, children: [Text('Nav')] }), WorkspacePane({ title: ' CENTER ', theme, children: [Text('Work area')] }), WorkspacePane({ title: ' RIGHT ', theme, children: [Text('Details')] }))); }, handleKey: ({ state }, key) => { if (key.name === 'left') { state.simulated = state.simulated < 0 ? 0 : mod(state.simulated - 1, 3); return true; } if (key.name === 'right') { state.simulated = state.simulated < 0 ? 0 : mod(state.simulated + 1, 3); return true; } if (key.printable && key.text === '0') { state.simulated = -1; return true; } return false; } },

  { id: 'focus-and-modes', title: 'Focus and Modes', category: 'Navigation', summary: 'Shows local focus ownership, selectable focus targets, disabled targets, and a mode stack that restores focus on pop.', components: ['FocusManager', 'ModeManager', 'SelectList', 'ActionRegistry'], controls: [{ key: '↑/↓', action: 'select target' }, { key: 'Enter', action: 'focus selected' }, { key: 'Tab', action: 'local next' }, { key: 'Shift+Tab', action: 'local previous' }, { key: 'm/h/p', action: 'push modal/help/pop' }, { key: 'd', action: 'toggle selected' }], createInitialState: () => ({ focus: new FocusManager(['nav', 'preview', 'command', 'modal', 'help']), modes: new ModeManager('root'), list: createListState({ items: ['nav', 'preview', 'command', 'modal', 'help'], windowSize: 6, skipDisabled: false }), owner: 'local preview' }), render: ({ state, theme }) => {
    const selectedId = state.list.items[state.list.selectedIndex];
    const stackRows = state.modes.stack.map((entry, index) => {
      const marker = index === state.modes.stack.length - 1 ? '›' : ' ';
      const focus = entry.data?.focus ? ` → ${entry.data.focus}` : '';
      return Text(`${marker} ${entry.name}${focus}`);
    });
    return Column({ gap: 1 },
      Row({ gap: 2, distribute: true },
        SelectList({ title: 'Focus targets', items: state.list.items, selectedIndex: state.list.selectedIndex, windowSize: 6, getLabel: (id) => `${state.focus.current() === id ? '●' : ' '} ${id}`, getDescription: (id) => `${state.focus.isEnabled(id) ? 'enabled' : 'disabled'}${id === selectedId ? ' · selected' : ''}`, theme, pointerId: 'kit:focus-targets', onSelect: (_id, index) => { state.list.selectedIndex = index; }, onWheel: (event) => moveListByWheel(state.list, event) }),
        KeyValueBlock({ title: ' Local state ', rows: [['active focus', state.focus.current()], ['selected', selectedId], ['selected enabled', state.focus.isEnabled(selectedId) ? 'yes' : 'no'], ['current mode', state.modes.current()], ['key owner', state.owner]] }),
      ),
      WorkspacePane({ title: ' Mode stack ', theme, children: [...stackRows, Text(''), Text('m pushes modal-demo and focuses modal'), Text('h pushes help-demo and focuses help'), Text('p pops and restores previous focus')] }),
    );
  }, handleKey: ({ state }, key) => {
    const result = handleListKey(state.list, key); if (result.handled) { state.owner = 'target list'; return true; }
    const selectedId = state.list.items[state.list.selectedIndex];
    if (key.name === 'enter') { state.focus.focus(selectedId); state.modes.currentEntry().data.focus = selectedId; state.owner = `focused ${selectedId}`; return true; }
    if (key.name === 'tab') { key.shift ? state.focus.previous() : state.focus.next(); state.modes.currentEntry().data.focus = state.focus.current(); state.owner = key.shift ? 'local Shift+Tab' : 'local Tab'; return true; }
    if (key.printable && key.text === 'd') { if (state.focus.isEnabled(selectedId)) { state.focus.disable(selectedId); if (state.focus.current() === selectedId) state.focus.next(); } else state.focus.enable(selectedId); state.modes.currentEntry().data.focus = state.focus.current(); state.owner = `toggled ${selectedId}`; return true; }
    if (key.printable && key.text === 'm') { state.modes.currentEntry().data.focus = state.focus.current(); state.modes.push('modal-demo', { focus: 'modal' }); state.focus.focus('modal'); state.owner = 'mode push modal'; return true; }
    if (key.printable && key.text === 'h') { state.modes.currentEntry().data.focus = state.focus.current(); state.modes.push('help-demo', { focus: 'help' }); state.focus.focus('help'); state.owner = 'mode push help'; return true; }
    if (key.printable && key.text === 'p') { state.modes.pop(); const restore = state.modes.currentEntry().data.focus ?? 'preview'; state.focus.focus(restore); state.owner = `mode pop → ${restore}`; return true; }
    return false;
  } },

  { id: 'runtime-frames-diff', title: 'Runtime, Frames, and Diff Rendering', category: 'Runtime', summary: 'Explains how virtual frames become small terminal patches that reduce flicker and ghost artifacts.', components: ['createFrame', 'diffFrames', 'wcwidth', 'ANSI clipping'], controls: [{ key: 'n', action: 'commit next' }, { key: 'w', action: 'toggle next unicode line' }, { key: 'd', action: 'diff/full mode' }, { key: 'r', action: 'reset' }], createInitialState: () => ({ previous: 0, next: 1, previousLong: false, nextLong: false, patchMode: 'diff' }), render: ({ state, theme }) => {
    const before = demoFrame(state.previous, state.previousLong, theme);
    const after = demoFrame(state.next, state.nextLong, theme);
    const ops = diffFrames(before, after);
    const afterLines = after.toLines();
    const changedBytes = ops.reduce((sum, op) => sum + visibleLength(stripAnsi(op.line)), 0);
    const fullBytes = afterLines.reduce((sum, line) => sum + visibleLength(stripAnsi(line)), 0);
    const useDiff = state.patchMode === 'diff';
    return Column({ gap: 1 },
      Row({ gap: 2, distribute: true }, framePane(`Previous · frame ${state.previous}`, before, theme), framePane(`Next · frame ${state.next}`, after, theme)),
      Row({ gap: 2, widths: [54, 42] },
        WorkspacePane({ title: ` Patch plan · ${state.patchMode} `, theme, children: [
          Text(`changed rows: ${ops.length}/${afterLines.length}`),
          Text(`skipped rows: ${Math.max(0, afterLines.length - ops.length)}`),
          Text(`estimated write: ${useDiff ? changedBytes : fullBytes} cells`),
          Text(`effect: ${useDiff ? 'less flicker, fewer writes' : 'simple but rewrites unchanged rows'}`),
          Text(''),
          ...(ops.length ? ops.map((op) => Text(`row ${String(op.row).padStart(2)}  ${truncateVisible(stripAnsi(op.line), 44)}`)) : [Text('No changed rows.')]),
        ] }),
        WorkspacePane({ title: ' Why it matters ', theme, children: [
          KeyValueBlock({ title: ' Frame state ', rows: [
            ['previous', String(state.previous)],
            ['next', String(state.next)],
            ['mode', state.patchMode],
            ['next long line', state.nextLong ? 'on' : 'off'],
            ['表 width', String(wcwidth('表'))],
            ['A表🚴', String(visibleLength('A表🚴'))],
          ] }),
          Text('w changes only the next frame.'),
          Text('n commits next into previous and creates another next frame.'),
        ] }),
      ),
      p('Frame diffing keeps a fullscreen TUI stable during rapid resize and animation by patching only changed rows.', theme, 'textMuted'),
    );
  }, handleKey: ({ state }, key) => {
    if (key.printable && key.text === 'n') { state.previous = state.next; state.previousLong = state.nextLong; state.next += 1; return true; }
    if (key.printable && key.text === 'w') { state.nextLong = !state.nextLong; return true; }
    if (key.printable && key.text === 'd') { state.patchMode = state.patchMode === 'diff' ? 'full repaint' : 'diff'; return true; }
    if (key.printable && key.text === 'r') { state.previous = 0; state.next = 1; state.previousLong = false; state.nextLong = false; state.patchMode = 'diff'; return true; }
    return false;
  } },

  {
    id: 'reordering-items',
    title: 'Reordering Items',
    category: 'Navigation',
    summary: 'Verifies modified-arrow routing by separating ordinary selection from Shift+Arrow item movement.',
    components: ['ActionRegistry', 'SelectList', 'KeyValueBlock', 'createListState'],
    controls: [
      { key: '↑/↓', action: 'select item' },
      { key: 'Shift+↑/↓', action: 'move selected item' },
      { key: 'Home/End', action: 'select boundary' },
      { key: 'r', action: 'reset order' },
    ],
    createInitialState: createReorderingState,
    render: ({ state, theme, width }) => {
      const selected = state.list.items[state.list.selectedIndex] ?? null;
      const listWidth = Math.max(40, Math.min(58, Math.floor(width * 0.56)));
      return Row({ gap: 2, widths: [listWidth, Math.max(28, width - listWidth - 2)] },
        SelectList({
          title: 'Build order',
          items: state.list.items,
          selectedIndex: state.list.selectedIndex,
          windowSize: 'auto',
          getLabel: (item, index) => `${String(index + 1).padStart(2, '0')}. ${item.title}`,
          getDescription: (item) => item.detail,
          wrapItems: true,
          maxItemLines: 2,
          theme,
          pointerId: 'kit:reordering-items',
          onSelect: (_item, index) => {
            state.list.selectedIndex = index;
            state.lastAction = `Pointer selected position ${index + 1}.`;
          },
          onWheel: (event) => moveListByWheel(state.list, event),
        }),
        Column({ gap: 1 },
          KeyValueBlock({ title: ' Last input event ', rows: [
            ['key', state.lastKey],
            ['shift flag', state.lastShift ? 'true' : 'false'],
            ['raw sequence', state.lastSequence],
            ['selected', selected?.title ?? 'none'],
            ['moves', String(state.moves)],
          ] }),
          WorkspacePane({
            title: ' Routing result ',
            theme,
            children: [
              Text(state.lastAction),
              Text(''),
              Text(color(theme, 'textMuted', 'Ordinary arrows only change selection. Shift+Arrow moves the selected object and keeps it selected.')),
              Text(color(theme, 'textMuted', 'The raw sequence panel makes terminal-specific modifier loss visible immediately.')),
            ],
          }),
          SummaryList({
            title: ' Recent moves ',
            selectedIndex: -1,
            items: state.history.length
              ? state.history.slice(-5).map((title) => ({ title, description: 'reordered' }))
              : [{ title: 'No moves yet', description: 'press Shift+↑ or Shift+↓' }],
          }),
        ),
      );
    },
    handleKey: ({ state, setStatus }, key) => {
      rememberReorderingKey(state, key);
      const actionResult = state.actions.handleKey(key, { state, setStatus });
      if (actionResult.type === 'executed') return true;

      if (!key.shift) {
        const before = state.list.selectedIndex;
        const result = handleListKey(state.list, key);
        if (result.handled) {
          const item = state.list.items[state.list.selectedIndex];
          state.lastAction = before === state.list.selectedIndex
            ? `Selection remains at position ${state.list.selectedIndex + 1}.`
            : `Selected ${item?.title ?? 'item'} at position ${state.list.selectedIndex + 1}; order unchanged.`;
          setStatus(state.lastAction);
          return true;
        }
      }
      return false;
    },
  },
];




function scrollStateByWheel(scrollState, event, step = 1) {
  const max = Math.max(0, Number(scrollState.totalRows || 0) - Number(scrollState.visibleRows || 0));
  const delta = event.deltaY < 0 ? -step : step;
  scrollState.scroll = clamp(Number(scrollState.scroll || 0) + delta, 0, max);
  scrollState.sticky = scrollState.scroll >= max;
  event.preventDefault();
}

function moveListByWheel(list, event) {
  handleListKey(list, { name: event.deltaY < 0 ? 'up' : 'down' });
  event.preventDefault();
}

function workspaceMainLines(tab) {
  const common = [
    'Local focus owns this area while the preview is active.',
    'Use PageUp/PageDown, Home/End, and arrows to inspect long content.',
    'Printable text is routed only to the command bar focus region.',
    'This makes a workspace feel like a small product, not a static diagram.',
  ];
  if (tab === 'tasks') return [
    'Task queue',
    '1. Review renderer patch plan',
    '2. Check footer stability',
    '3. Verify overlay focus trap',
    '4. Run smoke tests',
    '5. Package artifact',
    '6. Inspect command autocomplete',
    '7. Reopen preview after resize',
    '8. Confirm keyboard ownership',
    ...common,
  ];
  if (tab === 'logs') return Array.from({ length: 22 }, (_, index) => `${String(index + 1).padStart(2, '0')}  workspace log row ${index + 1}: ${['rendered', 'scrolled', 'completed', 'accepted'][index % 4]}`);
  return [
    'Overview',
    'The shell combines header, tabs, scrollable panes, command bar, and footer.',
    'Main and activity panes now have enough content to demonstrate scrolling.',
    'The command bar supports history and prefix autocomplete for ordinary commands.',
    ...common,
    'Try: deploy, test, explain, reset, inspect, package.',
    'Switch to Tasks or Logs to see a different main surface.',
  ];
}

function workspaceCommandSuggestions(value) {
  const commands = ['deploy --dry-run', 'deploy production --confirm', 'test ui --watch', 'test keyboard-routing', 'explain renderer diff', 'explain overlay stack', 'reset workspace', 'inspect focus owner', 'package artifact'];
  const query = String(value ?? '').trim().toLowerCase();
  if (!query) return commands.slice(0, 4);
  return commands.filter((command) => command.toLowerCase().startsWith(query) || command.toLowerCase().includes(query)).slice(0, 4);
}

function layoutDensityModes() {
  return [
    { label: 'compact', columns: 4, gap: 1, padding: 0, cardText: 'Dense cards with short labels.' },
    { label: 'comfortable', columns: 3, gap: 2, padding: 1, cardText: 'Balanced spacing for a dashboard.' },
    { label: 'spacious', columns: 2, gap: 3, padding: 2, cardText: 'More breathing room and longer descriptions.' },
  ];
}

function layoutCards(mode) {
  const verbose = mode.label === 'spacious';
  return [
    { icon: '▣', title: 'Box', detail: verbose ? 'bordered container with title and padding' : 'container' },
    { icon: '↔', title: 'Row', detail: verbose ? 'horizontal composition with controlled gap' : 'horizontal' },
    { icon: '↕', title: 'Column', detail: verbose ? 'vertical rhythm with stable child order' : 'vertical' },
    { icon: '▦', title: 'Grid', detail: verbose ? 'responsive columns with unicode-safe cells 表🚴' : 'columns 表🚴' },
    { icon: '◆', title: 'Grow', detail: verbose ? 'remaining space is absorbed by flexible panes' : 'flex space' },
    { icon: '▤', title: 'Fill', detail: verbose ? 'detail region keeps the lower area stable' : 'stable footer' },
    { icon: '◇', title: 'Theme', detail: verbose ? 'semantic borders and muted text tokens' : 'tokens' },
    { icon: '◈', title: 'Resize', detail: verbose ? 'composition survives terminal width changes' : 'safe resize' },
  ];
}

function blockTypeCounts(blocks) {
  return blocks.reduce((acc, block) => {
    const key = block.type ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function createReorderingState() {
  const items = reorderingSeedItems();
  const state = {
    list: createListState({ items, selectedIndex: 2, windowSize: 7, skipDisabled: false }),
    lastKey: 'none',
    lastShift: false,
    lastSequence: '—',
    lastAction: 'Use ordinary arrows to select, then Shift+Arrow to reorder.',
    moves: 0,
    history: [],
    actions: null,
  };
  state.actions = new ActionRegistry([
    { id: 'reorder.up', title: 'Move selected item up', keys: ['shift+up'], scope: 'local', execute: (ctx) => runReorderingMove(ctx, -1) },
    { id: 'reorder.down', title: 'Move selected item down', keys: ['shift+down'], scope: 'local', execute: (ctx) => runReorderingMove(ctx, 1) },
  ]);
  return state;
}

function reorderingSeedItems() {
  return [
    { id: 'resolve', title: 'Resolve dependencies', detail: 'prepare package graph' },
    { id: 'compile', title: 'Compile sources', detail: 'build runtime modules' },
    { id: 'unit', title: 'Run unit tests', detail: 'fast behavioral checks' },
    { id: 'interface', title: 'Run interface goldens', detail: 'verify complete terminal frames' },
    { id: 'security', title: 'Run security contracts', detail: 'validate terminal boundaries' },
    { id: 'package', title: 'Verify package', detail: 'inspect published artifact' },
    { id: 'publish', title: 'Publish release', detail: 'final delivery step' },
  ];
}

function rememberReorderingKey(state, key = {}) {
  state.lastKey = formatKeyChord(key);
  state.lastShift = Boolean(key.shift);
  state.lastSequence = formatKeySequence(key.sequence);
}

function formatKeyChord(key = {}) {
  const modifiers = [key.cmd && 'Cmd', key.ctrl && 'Ctrl', key.meta && 'Alt', key.shift && 'Shift'].filter(Boolean);
  const name = key.name === 'up' ? '↑' : key.name === 'down' ? '↓' : key.name === 'home' ? 'Home' : key.name === 'end' ? 'End' : String(key.name ?? 'unknown');
  return [...modifiers, name].join('+');
}

function formatKeySequence(sequence) {
  if (!sequence) return 'synthetic event';
  return JSON.stringify(String(sequence)).slice(1, -1);
}

function runReorderingMove({ state, setStatus }, direction) {
  const moved = moveSelectedReorderingItem(state, direction);
  state.lastAction = moved
    ? `Moved ${moved.item.title} from ${moved.from + 1} to ${moved.to + 1}.`
    : `Cannot move farther ${direction < 0 ? 'up' : 'down'} from this position.`;
  setStatus?.(state.lastAction);
  return moved;
}

function moveSelectedReorderingItem(state, direction) {
  const from = clamp(state.list.selectedIndex, 0, state.list.items.length - 1);
  const to = clamp(from + direction, 0, state.list.items.length - 1);
  if (from === to) return null;
  const [item] = state.list.items.splice(from, 1);
  state.list.items.splice(to, 0, item);
  state.list.selectedIndex = to;
  state.moves += 1;
  state.history.push(`${item.title}: ${from + 1} → ${to + 1}`);
  return { item, from, to };
}

function ticketItems() { return Array.from({ length: 24 }, (_, index) => ({ title: `TKT-${String(index + 1).padStart(3, '0')} ${['Login issue', 'Renderer edge case', 'Palette request', 'Theme polish', 'Scroll report', 'Editor question'][index % 6]}`, priority: ['low', 'medium', 'high'][index % 3], disabled: index % 7 === 4 })); }
function localPaletteItems() { return [{ id: 'jump.editor', title: 'Jump to editor', description: 'Navigate to input mechanics', category: 'Navigation', keywords: ['input', 'editor'], keys: ['j e'], value: { jump: 'text-editor-input' } }, { id: 'jump.jobs', title: 'Jump to live jobs', description: 'Navigate to progress visualization', category: 'Navigation', keywords: ['progress', 'jobs'], keys: ['j p'], value: { jump: 'progress-live-jobs' } }, { id: 'theme.preview', title: 'Preview theme command', description: 'Example command without side effects', category: 'Theme', keywords: ['theme'] }, { id: 'disabled.remote', title: 'Remote network command', description: 'Disabled because examples do not call services', category: 'Disabled', keywords: ['network'], disabled: true }]; }
function logLines(count) { return Array.from({ length: count }, (_, index) => `${String(index + 1).padStart(3, '0')}  transcript event ${index + 1}: ${['queued', 'streamed token', 'rendered frame', 'patched row'][index % 4]}`); }
function progressState() {
  return {
    running: false,
    progress: 0,
    status: 'idle',
    activeIndex: 0,
    elapsed: 0,
    ticks: 0,
    processed: 0,
    totalFiles: 420,
    steps: ['Resolve config', 'Compile views', 'Render frames', 'Run smoke checks', 'Publish artifact'],
    scroll: createScrollState({ totalRows: 0, visibleRows: 12, sticky: false }),
  };
}
function progressStatusState() {
  const state = {
    clockMs: 0,
    ticks: 0,
    running: true,
    manualBatchAdds: 0,
    batchNotice: 'Press b to mark one batch complete.',
    scroll: createScrollState({ totalRows: 0, visibleRows: 12, sticky: false }),
  };
  const now = () => state.clockMs;
  state.download = ProgressStatus.create({ total: 96 * 1024 * 1024, now, updateIntervalMs: 50, format: 'bytes' });
  state.batch = ProgressStatus.create({ total: 12, now, updateIntervalMs: 50, unit: 'batches' });
  state.paused = ProgressStatus.create({ total: 100, value: 48, state: 'paused', now, unit: 'items' });
  state.completed = ProgressStatus.create({ total: 24, value: 24, state: 'completed', now, unit: 'files' });
  state.failed = ProgressStatus.create({ total: 10, value: 3, state: 'failed', error: new Error('checksum mismatch'), now, unit: 'parts' });
  state.download.start();
  state.batch.start();
  return state;
}
function resetProgressStatusState(state) {
  state.clockMs = 0;
  state.ticks = 0;
  state.running = true;
  state.manualBatchAdds = 0;
  state.batchNotice = 'Press b to mark one batch complete.';
  state.scroll.scroll = 0;
  state.scroll.sticky = false;
  state.download.reset({ total: 96 * 1024 * 1024, state: 'running' });
  state.batch.reset({ total: 12, state: 'running' });
}
function progressStatusControllers(state) { return state ? [state.download, state.batch, state.paused, state.completed, state.failed].filter(Boolean) : []; }
function timelineSeed() { return [createTimelineEvent({ type: 'activity', actor: 'system', text: 'showcase opened' }), createTimelineEvent({ type: 'activity', actor: 'demo', text: 'theme initialized' }), createTimelineEvent({ type: 'system', actor: 'runtime', text: 'frame renderer ready' })]; }
function blockScenarios() {
  return [
    { title: 'Code review', blocks: (generation) => [
      createBlock({ type: 'text', content: `Review pass ${generation}: the component split is mostly clear, but pass ${generation % 3 + 1} found a different edge case.` }),
      createBlock({ type: 'code', language: 'js', title: `guard example ${generation}`, content: `if (!state.palette) {\n  state.palette = createCommandPaletteState({ items, generation: ${generation} });\n}` }),
      createBlock({ type: 'diff', title: 'suggested patch', content: `- renderAllWidgets();\n+ renderFocusedShowcase(${generation});\n+ reserveFooterHeight();` }),
      createBlock({ type: 'warning', title: 'focus', content: generation % 2 ? 'Do not let preview-local arrows leak into navigation.' : 'Keep overlay-owned keys above both local and global actions.' }),
      createBlock({ type: 'command', title: 'smoke check', command: `npm run example:kit -- --case=${generation}` }),
      createBlock({ type: 'tool_result', name: 'node --check', status: 'ok', content: `examples/interaction-kit.js parsed successfully\ngeneration: ${generation}` }),
    ] },
    { title: 'Terminal help', blocks: (generation) => [
      createBlock({ type: 'text', content: `Help snapshot ${generation}: use global actions for app-wide commands and local controls for previews.` }),
      createBlock({ type: 'command', command: `/ theme ${THEME_NAMES[generation % THEME_NAMES.length]}`, title: 'theme command' }),
      createBlock({ type: 'tool_result', name: 'help', status: 'summary', content: 'Global: Ctrl+C, Tab, ?, /, t\nPreview: Esc returns to navigation\nLocal actions may override Tab.' }),
      createBlock({ type: 'warning', content: 'Shortcut hints should come from the same action source as execution.' }),
    ] },
    { title: 'Planning response', blocks: (generation) => [
      createBlock({ type: 'text', content: `Plan revision ${generation}: keep architecture changes small, then polish the visible demo screens.` }),
      createBlock({ type: 'code', language: 'md', title: 'plan', content: `- Separate metadata from rendering\n- Keep footer height stable\n- Add regression checks (${generation})\n- Verify interactive keys` }),
      createBlock({ type: 'warning', content: 'This is mock output; no provider is called.' }),
      createBlock({ type: 'tool_result', name: 'test', status: 'passed', content: `${95 + generation} behavioral checks simulated` }),
    ] },
    { title: 'Tool result', blocks: (generation) => [
      createBlock({ type: 'tool_result', name: 'renderer', status: 'changed', content: `rows changed: ${2 + generation % 4}\nbytes written: ${320 + generation * 17}\nstrategy: frame patch` }),
      createBlock({ type: 'diff', content: `@@ frame ${generation} @@\n- Focus nav\n+ Focus preview\n+ Toast stack stable` }),
      createBlock({ type: 'command', command: 'node --test test/workspaceApp.test.js' }),
      createBlock({ type: 'text', content: 'Tool-result blocks keep diagnostics distinct from regular assistant prose.' }),
    ] },
  ];
}
function demoFrame(frame, longLine, theme) { return createFrame(['┌ frame sample ┐', `tick ${String(frame).padStart(2)} ${['-', '\\', '|', '/'][mod(frame, 4)]}`, `status ${frame % 2 ? 'running' : 'idle'}`, longLine ? color(theme, 'textAccent', 'ANSI + Unicode 表🚴 content that clips cleanly without breaking borders') : 'bounded content', '└──────────────┘'], { width: 44, height: 5 }); }
function framePane(title, frame, theme) { return WorkspacePane({ title: ` ${title} `, theme, children: frame.toLines().map((line) => Text(line, { wrap: false })) }); }

if (isDirectRun(import.meta.url)) runInteractionKitDemo();
