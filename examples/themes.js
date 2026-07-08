#!/usr/bin/env node
import { Box, ChatTranscript, Column, HelpOverlay, Panel, Row, Text, Toast, createMessage, themes } from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';

const THEME_NAMES = Object.keys(themes);
const THEME_BLOCKS = [
  { type: 'text', content: 'This is the same structured answer rendered through each theme.' },
  { type: 'warning', title: 'Theme token check', content: 'Warning/error/accent colors must remain readable.' },
  { type: 'code', language: 'js', title: 'Theme token', content: "theme.messageRoles.assistant ?? theme.accent" },
  { type: 'diff', title: 'theme.js', content: "- border: gray\n+ border: cyan" },
  { type: 'command', title: 'Try this theme', command: '/theme ocean' },
];

export function createThemeGalleryState() {
  return {
    selectedIndex: Math.max(0, THEME_NAMES.indexOf('ocean')),
    status: 'Theme Gallery: ↑/↓ switches theme preview.',
  };
}

export function createThemeGalleryView({ state, width = 112, height = 32 } = {}) {
  const themeName = THEME_NAMES[state.selectedIndex] ?? THEME_NAMES[0];
  const theme = themes[themeName];
  const messages = [
    createMessage({ role: 'user', content: `show theme ${themeName}` }),
    createMessage({ role: 'assistant', blocks: THEME_BLOCKS }),
  ];

  return Column(
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Theme Gallery ' },
      Text('Compare the same UI scene across all themes: transcript roles, warning, code, diff, command, toast and panels.'),
      Text(`Selected theme: ${themeName} (${state.selectedIndex + 1}/${THEME_NAMES.length})`),
    ),
    Row({ gap: 2, distribute: true },
      Panel(' Themes ', ...THEME_NAMES.map((name, index) => Text(`${index === state.selectedIndex ? '›' : ' '} ${name}`))),
      Column(
        Toast({ level: 'success', message: `Toast rendered in ${themeName}.` }),
        Panel(' Preview ', ChatTranscript({ columns: Math.max(56, Math.floor(width * 0.66)), height: Math.max(12, height - 12), messages, theme }).node),
      ),
    ),
    Row({ gap: 2, distribute: true },
      HelpOverlay({ title: ' Keys ', shortcuts: [['↑/↓', 'switch theme'], ['Home/End', 'first/last'], ['Enter', 'record selected theme']] }),
      Panel(' Token count ', Text(`${Object.keys(theme).length} top-level tokens`), Text(state.status)),
    ),
  );
}

export function handleThemeGalleryKey({ key, state }) {
  if (key.name === 'up') state.selectedIndex = Math.max(0, state.selectedIndex - 1);
  else if (key.name === 'down') state.selectedIndex = Math.min(THEME_NAMES.length - 1, state.selectedIndex + 1);
  else if (key.name === 'home') state.selectedIndex = 0;
  else if (key.name === 'end') state.selectedIndex = THEME_NAMES.length - 1;
  else if (key.name === 'enter') state.status = `Selected theme ${THEME_NAMES[state.selectedIndex]}.`;
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Theme Gallery',
    state: createThemeGalleryState(),
    render: createThemeGalleryView,
    onKey: handleThemeGalleryKey,
  });
}
