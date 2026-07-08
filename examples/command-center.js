#!/usr/bin/env node
import {
  Box,
  Column,
  HelpOverlay,
  Modal,
  ModeManager,
  Panel,
  ProgressBar,
  Row,
  Spinner,
  Text,
  Toast,
  createCommandPaletteState,
  getPaletteQuery,
  handleCommandPaletteKey,
  renderCommandPalette,
  themes,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';

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

export function createCommandCenterView({ state, width = 112 } = {}) {
  state.frame += 1;
  const mode = state.modes.current();
  const overlay = mode === 'modal'
    ? Modal({
        title: ` ${state.modes.currentEntry().data?.title ?? 'Modal'} `,
        children: state.modes.currentEntry().data?.lines ?? ['No modal content.'],
        footer: 'Esc or Enter closes this modal.',
      })
    : null;

  return Column(
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Command Center ' },
      Text('A product-style dashboard built from palette, mode stack, modal, toast, progress and status widgets.'),
      Text(`Mode: ${mode} · Theme: ${state.themeName} · Query: ${getPaletteQuery(state.palette) || '<empty>'}`),
    ),
    Row({ gap: 2, distribute: true },
      renderCommandPalette(state.palette, { title: ' Actions ', showHelp: false }),
      Column(
        Toast(state.toast),
        Panel(' Runtime ',
          Spinner({ frame: state.frame, label: 'frame renderer' }),
          ProgressBar({ value: state.progress, total: 100, width: 22, label: 'background task' }),
          Text(`Theme tokens: ${Object.keys(themes[state.themeName] ?? {}).length}`),
          Text(`Mode stack : ${state.modes.toJSON().map((item) => item.name).join(' → ')}`),
        ),
        Panel(' Active skills ', ...Array.from(state.skills).map((skill) => Text(`✓ ${skill}`)), ...(state.skills.size ? [] : [Text('No skills enabled.')])),
      ),
    ),
    ...(overlay ? [overlay] : []),
    Row({ gap: 2, distribute: true },
      HelpOverlay({
        title: ' Keys ',
        shortcuts: [
          ['Type', 'filter action list'],
          ['↑/↓', 'move selection'],
          ['Enter', 'run action'],
          ['Esc', 'clear filter / close modal'],
          ['Ctrl+D', 'exit'],
        ],
      }),
      Panel(' Action log ', ...(state.actionLog.length ? state.actionLog.slice(-6).map((line) => Text(line)) : [Text('No actions yet.')]))
    ),
  );
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
