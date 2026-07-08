#!/usr/bin/env node
import {
  Box,
  Column,
  ConfirmPrompt,
  HelpOverlay,
  Modal,
  ModeManager,
  ProgressBar,
  Row,
  Spinner,
  Text,
  Toast,
  createCommandPaletteState,
  getPaletteQuery,
  handleCommandPaletteKey,
  renderCommandPalette,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';

const KIT_ACTIONS = [
  { id: 'toast.info', title: 'Info toast', description: 'Show a neutral toast notification', keywords: ['notification message'] },
  { id: 'toast.success', title: 'Success toast', description: 'Show a success toast notification', keywords: ['done ok'] },
  { id: 'toast.warning', title: 'Warning toast', description: 'Show a warning toast notification', keywords: ['careful danger'] },
  { id: 'modal.help', title: 'Open help modal', description: 'Push modal mode and render an overlay', keywords: ['dialog overlay'] },
  { id: 'confirm.apply', title: 'Confirm apply', description: 'Open a confirm prompt for an apply action', keywords: ['yes no prompt'] },
  { id: 'progress.tick', title: 'Advance progress', description: 'Move the progress bar forward', keywords: ['bar loading'] },
  { id: 'mode.reset', title: 'Reset mode stack', description: 'Return to palette mode and clear transient UI', keywords: ['focus stack'] },
  { id: 'app.exit', title: 'Exit demo', description: 'Close the interaction kit example', keywords: ['quit'] },
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
  };
}

export function createInteractionKitView({ state, width = 100 } = {}) {
  state.frame += 1;
  const currentMode = state.modes.current();
  const overlay = currentMode === 'confirm'
    ? ConfirmPrompt({
        title: ' Confirm action ',
        message: `Run ${state.modes.currentEntry().data?.action?.id ?? 'selected action'}?`,
        selected: state.confirmSelected,
      })
    : currentMode === 'modal'
      ? Modal({
          title: ' Help Modal ',
          children: [
            'This modal is a normal UI node. The mode stack decides where keys go.',
            'Esc or Enter closes it and returns to the palette.',
          ],
          footer: 'Modal → Palette is handled by ModeManager.pop().',
        })
      : null;

  return Column(
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Interaction Kit ' },
      Text('Library widgets + command palette + mode stack. This is the next UI layer after the editor examples.'),
      Text(`Mode: ${currentMode} · Query: ${getPaletteQuery(state.palette) || '<empty>'}`),
    ),
    Row({ gap: 2, distribute: true },
      renderCommandPalette(state.palette, { showHelp: false }),
      Column(
        Toast(state.toast),
        Box({ border: true, padding: 1, title: ' Runtime ' },
          Spinner({ frame: state.frame, label: 'renderer alive' }),
          ProgressBar({ value: state.progress, total: 100, width: 18, label: 'Progress' }),
          Text(`Mode stack: ${state.modes.toJSON().map((entry) => entry.name).join(' → ')}`),
          Text(`Accepted: ${state.accepted.at(-1) ?? '<none>'}`),
        ),
        HelpOverlay({
          title: ' Keys ',
          shortcuts: [
            ['Type', 'filter palette'],
            ['↑/↓', 'move selection'],
            ['Enter', 'accept / confirm'],
            ['Esc', 'clear / close'],
            ['←/→', 'switch confirm choice'],
          ],
        }),
      ),
    ),
    ...(overlay ? [overlay] : []),
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Status ' }, Text(state.palette.status)),
  );
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
    return;
  }
  if (action.id === 'confirm.apply') {
    state.modes.push('confirm', { action });
    state.confirmSelected = 'confirm';
    state.toast = { level: 'warning', message: 'Confirm prompt is active.' };
    return;
  }
  if (action.id === 'progress.tick') {
    state.progress = state.progress >= 100 ? 0 : state.progress + 10;
    state.toast = { level: 'info', message: `Progress is now ${state.progress}%.` };
    return;
  }
  if (action.id === 'mode.reset') {
    state.modes.reset();
    state.toast = { level: 'info', message: 'Mode stack reset.' };
    return;
  }
  if (action.id.startsWith('toast.')) {
    const level = action.id.split('.')[1];
    state.toast = { level, message: `${action.title} rendered.` };
  }
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Interaction Kit',
    state: createInteractionKitState(),
    render: createInteractionKitView,
    onKey: handleInteractionKitKey,
  });
}
