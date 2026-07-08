#!/usr/bin/env node
import {

  Modal,
  ModeManager,
  KeyHintBar,
  Panel,
  ProgressBar,
  Row,
  Spinner,
  Text,
  Toast,
  WorkspaceCommandBar,
  WorkspaceFooter,
  WorkspacePane,
  WorkspaceShell,
  splitWorkspaceColumns,
  createCommandPaletteState,
  getPaletteQuery,
  handleCommandPaletteKey,
  renderCommandPalette,
  themes,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';
import { responsiveTabHint, responsiveTabs, workspaceMainHeight } from './_workspaceExampleUtils.js';

const CENTER_ACTIONS = [
  { id: 'theme.dark', title: 'Theme: dark', description: 'Switch dashboard preview to dark theme', keywords: ['appearance'] },
  { id: 'theme.ocean', title: 'Theme: ocean', description: 'Switch dashboard preview to ocean theme', keywords: ['appearance blue'] },
  { id: 'theme.matrix', title: 'Theme: matrix', description: 'Switch dashboard preview to matrix theme', keywords: ['appearance green'] },
  { id: 'skill.code.toggle', title: 'Toggle code skill', description: 'Enable/disable code-review status item', keywords: ['skills'] },
  { id: 'skill.writer.toggle', title: 'Toggle writer skill', description: 'Enable/disable writer status item', keywords: ['skills'] },
  { id: 'session.browser', title: 'Open session browser', description: 'Open a modal that imitates a session picker', keywords: ['modal'] },
  { id: 'debug.modal', title: 'Open debug modal', description: 'Show render/key/focus diagnostics', keywords: ['debug'] },
  { id: 'toast.success', title: 'Show success toast', description: 'Render a transient notification', keywords: ['toast'] },
  { id: 'progress.tick', title: 'Advance background task', description: 'Move dashboard progress forward', keywords: ['progress'] },
  { id: 'app.exit', title: 'Exit command center', description: 'Close this example', keywords: ['quit'] },
];

export function createCommandCenterState() {
  return {
    modes: new ModeManager('palette'),
    palette: createCommandPaletteState({ items: CENTER_ACTIONS, windowSize: 8 }),
    themeName: 'ocean',
    skills: new Set(['code']),
    progress: 35,
    frame: 0,
    toast: { level: 'info', message: 'Command Center is ready. Type to filter actions.' },
    actionLog: [],
  };
}

export function createCommandCenterView({ state, width = 112, height = 32 } = {}) {
  state.frame += 1;
  const mode = state.modes.current();
  const layout = splitWorkspaceColumns(width);
  const mainHeight = workspaceMainHeight(height, { min: 6, activityRows: 2 });
  const theme = themes[state.themeName] ?? themes.ocean;
  const activeTab = mode === 'modal' ? 'runtime' : 'actions';
  const tabs = [{ id: 'actions', label: 'Actions' }, { id: 'runtime', label: 'Runtime' }, { id: 'log', label: 'Log' }];
  const visibleTabs = responsiveTabs(tabs, activeTab, width, { pinned: ['actions'] });
  const overlay = mode === 'modal'
    ? Modal({
        title: ` ${state.modes.currentEntry().data?.title ?? 'Modal'} `,
        children: state.modes.currentEntry().data?.lines ?? ['No modal content.'],
        footer: 'Esc or Enter closes this modal.',
      })
    : null;
  const palettePane = WorkspacePane({
    title: ' ACTION PALETTE ',
    active: mode === 'palette',
    height: mainHeight,
    children: [renderCommandPalette(state.palette, { title: ' Actions ', showHelp: false })],
  });
  const runtimePane = WorkspacePane({
    title: ' RUNTIME ',
    height: mainHeight,
    children: [
      Toast(state.toast),
      Panel(' Dashboard ',
        Spinner({ frame: state.frame, label: 'frame renderer' }),
        ProgressBar({ value: state.progress, total: 100, width: 22, label: 'background task' }),
        Text(`Theme tokens: ${Object.keys(themes[state.themeName] ?? {}).length}`),
        Text(`Mode stack : ${state.modes.toJSON().map((item) => item.name).join(' → ')}`),
      ),
      Panel(' Active skills ', ...Array.from(state.skills).map((skill) => Text(`✓ ${skill}`)), ...(state.skills.size ? [] : [Text('No skills enabled.')])),
    ],
  });
  const logPane = WorkspacePane({
    title: ' ACTION LOG ',
    height: mainHeight,
    children: state.actionLog.length ? state.actionLog.slice(-10).map((line) => Text(line, { wrap: false })) : [Text('No actions yet.')],
  });
  const main = layout.mode === 'wide'
    ? Row({ gap: 2, widths: layout.widths }, palettePane, runtimePane, logPane)
    : layout.mode === 'medium'
      ? Row({ gap: 2, widths: layout.widths }, palettePane, runtimePane)
      : palettePane;

  return WorkspaceShell({
    title: 'Command Center',
    subtitle: 'palette-driven operations dashboard',
    stats: [{ label: 'Mode', value: mode }, { label: 'Theme', value: state.themeName }, { label: 'Progress', value: `${state.progress}%` }],
    right: [{ label: 'Skills', value: state.skills.size }],
    focus: mode,
    tabs: visibleTabs,
    activeTab,
    tabHint: responsiveTabHint('Type filters actions · ↑/↓ select · Enter run · Esc clear/close modal', tabs, visibleTabs),
    main: overlay ? Row({ gap: 2, widths: [Math.max(40, Math.floor(width * 0.62)), Math.max(30, Math.floor(width * 0.34))] }, main, overlay) : main,
    command: WorkspaceCommandBar({ value: getPaletteQuery(state.palette), prompt: 'palette', mode: mode.toUpperCase(), suggestions: ['theme', 'skill', 'session', 'debug', 'toast', 'progress', 'exit'], theme }),
    activity: KeyHintBar({ title: ' LOCAL HELP ', hints: [['Type', 'filter actions'], ['↑/↓', 'select'], ['Enter', 'run'], ['Esc', 'clear/close'], ['Ctrl+D', 'exit']], theme }),
    footer: WorkspaceFooter({ left: [state.toast.message], right: [`theme: ${theme.name}`, 'demo: command-center'], theme }),
    height,
    theme,
  });
}

export function handleCommandCenterKey({ key, state, runtime }) {
  if (state.modes.current() === 'modal') {
    if (key.name === 'escape' || key.name === 'enter') {
      state.modes.pop();
      state.toast = { level: 'info', message: 'Modal closed.' };
    }
    return;
  }

  const result = handleCommandPaletteKey(state.palette, key);
  if (result.type !== 'accept') return;
  const action = result.item;
  state.actionLog.push(action.id);

  if (action.id === 'app.exit') return runtime.exit(0);
  if (action.id.startsWith('theme.')) {
    state.themeName = action.id.split('.')[1];
    state.toast = { level: 'success', message: `Theme switched to ${state.themeName}.` };
    return;
  }
  if (action.id.startsWith('skill.')) {
    const skill = action.id.split('.')[1];
    if (state.skills.has(skill)) state.skills.delete(skill);
    else state.skills.add(skill);
    state.toast = { level: 'success', message: `Skill ${skill} toggled.` };
    return;
  }
  if (action.id === 'session.browser') {
    state.modes.push('modal', { title: 'Session browser', lines: ['mock-session-a · 8 messages · saved today', 'mock-session-b · 3 messages · structured blocks', 'Use example:sessions for a full browser.'] });
    state.toast = { level: 'info', message: 'Session modal opened.' };
    return;
  }
  if (action.id === 'debug.modal') {
    state.modes.push('modal', { title: 'Debug overlay', lines: [`mode=${state.modes.current()}`, `query=${getPaletteQuery(state.palette)}`, `progress=${state.progress}`, `skills=${Array.from(state.skills).join(', ') || 'none'}`] });
    state.toast = { level: 'info', message: 'Debug modal opened.' };
    return;
  }
  if (action.id === 'progress.tick') {
    state.progress = state.progress >= 100 ? 0 : state.progress + 15;
    state.toast = { level: 'info', message: `Progress advanced to ${state.progress}%.` };
    return;
  }
  if (action.id === 'toast.success') {
    state.toast = { level: 'success', message: 'Reusable Toast component rendered.' };
  }
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Command Center',
    state: createCommandCenterState(),
    render: createCommandCenterView,
    onKey: handleCommandCenterKey,
  });
}
