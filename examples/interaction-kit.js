#!/usr/bin/env node
import {
  ConfirmPrompt,
  HelpOverlay,
  KeyHintBar,
  Modal,
  ModeManager,
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
  createCommandPaletteState,
  fitInline,
  getPaletteQuery,
  handleCommandPaletteKey,
  renderCommandPalette,
  splitWorkspaceColumns,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';

const KIT_ACTIONS = [
  { id: 'toast.info', title: 'Info toast', description: 'Show a neutral toast notification', keywords: ['notification message'], group: 'Toast' },
  { id: 'toast.success', title: 'Success toast', description: 'Show a success toast notification', keywords: ['done ok'], group: 'Toast' },
  { id: 'toast.warning', title: 'Warning toast', description: 'Show a warning toast notification', keywords: ['careful danger'], group: 'Toast' },
  { id: 'modal.help', title: 'Open help modal', description: 'Push modal mode and render an overlay', keywords: ['dialog overlay'], group: 'Overlay' },
  { id: 'confirm.apply', title: 'Confirm apply', description: 'Open a confirm prompt for an apply action', keywords: ['yes no prompt'], group: 'Overlay' },
  { id: 'progress.tick', title: 'Advance progress', description: 'Move the progress bar forward', keywords: ['bar loading'], group: 'Runtime' },
  { id: 'mode.reset', title: 'Reset mode stack', description: 'Return to palette mode and clear transient UI', keywords: ['focus stack'], group: 'Runtime' },
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
    accepted: [],
    activeTab: 'palette',
  };
}

export function createInteractionKitView({ state, width = 100, height = 30 } = {}) {
  state.frame += 1;
  const currentMode = state.modes.current();
  const layout = splitWorkspaceColumns(width);
  const mainHeight = Math.max(10, height - 12);
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
          runtimePane(state, Math.max(40, layout.widths[1]), mainHeight),
        )
      : narrowPane(state, width, mainHeight);

  return WorkspaceShell({
    title: 'Interaction Kit',
    subtitle: 'palette, overlay and mode-stack playground',
    stats: [
      { label: 'Mode', value: currentMode },
      { label: 'Progress', value: `${state.progress}%` },
    ],
    right: [
      { label: 'Accepted', value: state.accepted.length },
      { label: 'Query', value: getPaletteQuery(state.palette) || '<empty>' },
    ],
    focus: state.activeTab,
    tabs: [
      { id: 'palette', label: 'Palette' },
      { id: 'runtime', label: 'Runtime' },
      { id: 'activity', label: 'Activity' },
    ],
    activeTab: state.activeTab,
    tabHint: 'Type action · Enter accept · Esc close overlay · ←/→ confirm choice · Tab focus',
    main,
    command: WorkspaceCommandBar({
      mode: String(currentMode).toUpperCase(),
      prompt: 'palette',
      value: getPaletteQuery(state.palette) || '<empty>',
      suggestions: ['toast', 'modal', 'confirm', 'progress', 'reset', 'exit'],
      hint: 'mode stack routes keys',
    }),
    activity: overlay ?? KeyHintBar({
      title: ' LOCAL HELP ',
      hints: [
        ['Type', 'filter palette'],
        ['↑/↓', 'move selection'],
        ['Enter', 'accept / confirm'],
        ['Esc', 'clear / close'],
        ['←/→', 'switch confirm'],
        ['Tab', 'switch pane'],
      ],
    }),
    footer: WorkspaceFooter({
      left: [currentMode, state.palette.status],
      right: ['demo: kit'],
    }),
    height,
  });
}

export function handleInteractionKitKey({ key, state, runtime }) {
  const mode = state.modes.current();

  if (mode === 'confirm') {
    if (key.name === 'escape') {
      state.modes.pop();
      state.toast = { level: 'info', message: 'Confirm prompt cancelled.' };
      return;
    }
    if (key.name === 'left' || key.name === 'right') {
      state.confirmSelected = state.confirmSelected === 'confirm' ? 'cancel' : 'confirm';
      return;
    }
    if (key.name === 'enter') {
      const action = state.modes.currentEntry().data?.action;
      state.modes.pop();
      if (state.confirmSelected === 'confirm') {
        state.accepted.push(`${action?.id ?? 'action'} confirmed`);
        state.toast = { level: 'success', message: `${action?.title ?? 'Action'} confirmed.` };
        state.activeTab = 'activity';
      } else {
        state.toast = { level: 'info', message: 'Action cancelled.' };
      }
      state.confirmSelected = 'confirm';
    }
    return;
  }

  if (mode === 'modal') {
    if (key.name === 'escape' || key.name === 'enter') {
      state.modes.pop();
      state.toast = { level: 'info', message: 'Modal closed.' };
    }
    return;
  }

  if (key.name === 'tab') {
    const tabs = ['palette', 'runtime', 'activity'];
    const index = tabs.indexOf(state.activeTab);
    state.activeTab = tabs[((index + (key.shift ? -1 : 1)) % tabs.length + tabs.length) % tabs.length];
    return;
  }

  const result = handleCommandPaletteKey(state.palette, key);
  if (result.type !== 'accept') return;

  const action = result.item;
  state.accepted.push(action.id);

  if (action.id === 'app.exit') {
    runtime.exit(0);
    return;
  }
  if (action.id === 'modal.help') {
    state.modes.push('modal');
    state.toast = { level: 'info', message: 'Modal opened.' };
    state.activeTab = 'runtime';
    return;
  }
  if (action.id === 'confirm.apply') {
    state.modes.push('confirm', { action });
    state.confirmSelected = 'confirm';
    state.toast = { level: 'warning', message: 'Confirm prompt is active.' };
    state.activeTab = 'runtime';
    return;
  }
  if (action.id === 'progress.tick') {
    state.progress = state.progress >= 100 ? 0 : state.progress + 10;
    state.toast = { level: 'info', message: `Progress is now ${state.progress}%.` };
    state.activeTab = 'runtime';
    return;
  }
  if (action.id === 'mode.reset') {
    state.modes.reset();
    state.toast = { level: 'info', message: 'Mode stack reset.' };
    state.activeTab = 'palette';
    return;
  }
  if (action.id.startsWith('toast.')) {
    const level = action.id.split('.')[1];
    state.toast = { level, message: `${action.title} rendered.` };
    state.activeTab = 'runtime';
  }
}

function palettePane(state, width, height) {
  return WorkspacePane({
    title: ` ${state.activeTab === 'palette' ? '▶' : ' '} Command Palette `,
    active: state.activeTab === 'palette',
    height,
    children: [
      Spinner({ frame: state.frame, label: 'renderer alive' }),
      renderCommandPalette(state.palette, { showHelp: false }),
      Panel(' Palette contract ',
        Text('Items are plain objects with id, title, description and keywords.'),
        Text('The handler converts accepted items into toasts, modals, confirmations or runtime updates.'),
      ),
    ],
  });
}

function runtimePane(state, width, height) {
  return WorkspacePane({
    title: ` ${state.activeTab === 'runtime' ? '▶' : ' '} RUNTIME `,
    active: state.activeTab === 'runtime',
    height,
    children: [
      Toast(state.toast),
      Panel(' Live widgets ',
        Spinner({ frame: state.frame, label: 'renderer alive' }),
        ProgressBar({ value: state.progress, total: 100, width: Math.min(26, Math.max(10, width - 20)), label: 'Progress' }),
        Text(`Mode stack: ${state.modes.toJSON().map((entry) => entry.name).join(' → ')}`),
        Text(`Query     : ${getPaletteQuery(state.palette) || '<empty>'}`),
      ),
      Panel(' Active overlay ',
        Text(state.modes.current() === 'palette' ? 'No overlay. Accept modal.help or confirm.apply.' : `Overlay mode: ${state.modes.current()}`),
      ),
    ],
  });
}

function activityPane(state, width, height) {
  return WorkspacePane({
    title: ` ${state.activeTab === 'activity' ? '▶' : ' '} ACTIVITY `,
    active: state.activeTab === 'activity',
    height,
    children: [
      Panel(' Accepted actions ',
        ...(state.accepted.length ? state.accepted.slice(-Math.max(5, height - 9)).map((item, index) => Text(`${index + 1}. ${fitInline(item, Math.max(16, width - 10))}`, { wrap: false })) : [Text('No actions accepted yet.')]),
      ),
      HelpOverlay({
        title: ' Keys ',
        shortcuts: [
          ['Type', 'filter palette'],
          ['Enter', 'accept selected item'],
          ['Esc', 'close modal or clear query'],
          ['←/→', 'switch confirm choice'],
        ],
      }),
    ],
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
    return Modal({
      title: ' Help Modal ',
      children: [
        'This modal is a normal UI node. The mode stack decides where keys go.',
        'Esc or Enter closes it and returns to the palette.',
      ],
      footer: 'Modal → Palette is handled by ModeManager.pop().',
    });
  }
  return null;
}

function narrowPane(state, width, height) {
  if (state.activeTab === 'runtime') return runtimePane(state, width, height);
  if (state.activeTab === 'activity') return activityPane(state, width, height);
  return palettePane(state, width, height);
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Interaction Kit',
    state: createInteractionKitState(),
    render: createInteractionKitView,
    onKey: handleInteractionKitKey,
  });
}
