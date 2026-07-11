#!/usr/bin/env node
import {
  ChatTranscript,
  KeyHintBar,
  KeyValueBlock,
  RequireViewport,
  Row,
  SelectList,
  Text,
  Toast,
  WorkspaceFooter,
  WorkspacePane,
  WorkspaceShell,
  createMessage,
  renderNode,
  resolveWorkspaceShellLayout,
  splitWorkspaceColumns,
  themes,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';
import { cycleTab, responsiveTabHint, responsiveTabs, scrollOffset, visibleScrollableRows } from './_workspaceExampleUtils.js';

const THEME_NAMES = Object.keys(themes);
const TABS = [
  { id: 'themes', label: 'Themes' },
  { id: 'preview', label: 'Preview' },
  { id: 'tokens', label: 'Tokens' },
];
const THEME_BLOCKS = [
  { type: 'text', content: 'This is the same structured answer rendered through each theme.' },
  { type: 'warning', title: 'Theme token check', content: 'Warning, danger, accent and muted colors must remain readable.' },
  { type: 'code', language: 'js', title: 'Theme token', content: "theme.messageRoles.assistant ?? theme.textAccent" },
  { type: 'diff', title: 'theme.js', content: "- border: gray\n+ border: semantic accent" },
  { type: 'command', title: 'Try this theme', command: '/theme ocean' },
];

export function createThemeGalleryState() {
  return {
    selectedIndex: Math.max(0, THEME_NAMES.indexOf('ocean')),
    activeTab: 'themes',
    paneScroll: { preview: 0, tokens: 0 },
    status: 'Choose a theme, then inspect the same scene and semantic token map.',
    appliedTheme: 'ocean',
  };
}

export function createThemeGalleryView({ state, width = 112, height = 32 } = {}) {
  const themeName = THEME_NAMES[state.selectedIndex] ?? THEME_NAMES[0];
  const theme = themes[themeName];
  const layout = splitWorkspaceColumns(width);
  const visibleTabs = responsiveTabs(TABS, state.activeTab, width, { pinned: ['themes'] });
  const stats = [
    { label: 'Selected theme', value: themeName },
    { label: 'Applied', value: state.appliedTheme },
    { label: 'Theme', value: `${state.selectedIndex + 1}/${THEME_NAMES.length}` },
  ];
  const right = [{ label: 'Tokens', value: Object.keys(theme).length }];
  const tabHint = responsiveTabHint('Tab focus · ↑/↓ select or scroll · PgUp/PgDn page · Enter apply · Home/End jump', TABS, visibleTabs);
  const activity = KeyHintBar({
    title: ' LOCAL HELP ',
    hints: contextHelp(state),
    adaptive: true,
    theme,
  });
  const footer = WorkspaceFooter({ left: [state.status], right: [`preview: ${themeName}`], theme });
  const { mainHeight } = resolveWorkspaceShellLayout({
    width, height, title: 'Theme Gallery', subtitle: 'semantic theme comparison', stats, right,
    focus: state.activeTab, tabs: visibleTabs, activeTab: state.activeTab, tabHint, activity, footer, theme,
    minMainHeight: 5,
  });

  const themeList = themeListPane(state, theme, mainHeight);
  const preview = previewPane(state, themeName, theme, layout.mode === 'wide' ? layout.widths[1] : Math.max(40, width), mainHeight);
  const tokens = tokenPane(state, theme, layout.mode === 'wide' ? layout.widths[2] : Math.max(34, width), mainHeight);

  let main;
  if (layout.mode === 'wide') main = Row({ gap: 2, widths: layout.widths }, themeList, preview, tokens);
  else if (layout.mode === 'medium') {
    main = Row({ gap: 2, widths: layout.widths }, themeList, state.activeTab === 'tokens' ? tokens : preview);
  } else {
    main = state.activeTab === 'preview' ? preview : state.activeTab === 'tokens' ? tokens : themeList;
  }

  const shell = WorkspaceShell({
    title: 'Theme Gallery', subtitle: 'semantic theme comparison', stats, right,
    focus: state.activeTab, tabs: visibleTabs, activeTab: state.activeTab, tabHint,
    main, activity, footer, height, theme,
  });
  return RequireViewport({
    width, height, minWidth: 58, minHeight: 18,
    title: 'Theme Gallery needs more room',
    message: 'Resize to compare theme tokens without clipped borders.',
    theme,
    children: shell,
  });
}

export function handleThemeGalleryKey({ key, state }) {
  if (key.name === 'tab') {
    cycleTab(state, TABS, key.shift ? -1 : 1, { statusPrefix: 'Focus moved to' });
    return;
  }
  if (key.name === 'escape' && state.activeTab !== 'themes') {
    state.activeTab = 'themes';
    state.status = 'Returned to theme selection.';
    return;
  }
  if (state.activeTab === 'themes') {
    if (key.name === 'up') return selectTheme(state, state.selectedIndex - 1);
    if (key.name === 'down') return selectTheme(state, state.selectedIndex + 1);
    if (key.name === 'home') return selectTheme(state, 0);
    if (key.name === 'end') return selectTheme(state, THEME_NAMES.length - 1);
    if (key.name === 'enter') {
      state.appliedTheme = THEME_NAMES[state.selectedIndex];
      state.status = `Applied ${state.appliedTheme} to the complete workspace preview.`;
    }
    return;
  }
  if (['up', 'down', 'page-up', 'page-down', 'home', 'end'].includes(key.name)) {
    scrollThemePane(state, state.activeTab, key.name);
  }
}

function themeListPane(state, theme, height) {
  return WorkspacePane({
    title: ` ${state.activeTab === 'themes' ? '▶' : ' '} THEMES `,
    active: state.activeTab === 'themes',
    height,
    theme,
    children: [SelectList({
      title: 'Available',
      items: THEME_NAMES.map((name) => ({
        title: name,
        description: name === state.appliedTheme ? 'applied' : name === THEME_NAMES[state.selectedIndex] ? 'previewing' : '',
      })),
      selectedIndex: state.selectedIndex,
      windowSize: Math.max(4, Math.min(THEME_NAMES.length, height - 5)),
      theme,
    })],
  });
}

function previewPane(state, themeName, theme, width, height) {
  const messages = [
    createMessage({ role: 'user', content: `show theme ${themeName}` }),
    createMessage({ role: 'assistant', blocks: THEME_BLOCKS }),
  ];
  const transcript = ChatTranscript({
    columns: Math.max(30, width - 6),
    height: Math.max(8, height + 8),
    messages,
    theme,
  }).node;
  const rows = [
    `Theme token check · warning, danger, accent and muted text in ${themeName}`,
    ...renderNode(Toast({ level: 'success', message: `Success toast rendered in ${themeName}.`, theme, shadow: true }), Math.max(24, width - 4)),
    '',
    ...renderNode(transcript, Math.max(24, width - 4)),
  ];
  const window = visibleScrollableRows(rows, {
    scroll: state.paneScroll.preview,
    height: Math.max(3, height - 2),
    width: Math.max(20, width - 4),
    footer: rows.length > Math.max(3, height - 3),
    footerLabel: '↑/↓ line · PgUp/PgDn page',
  });
  state.paneScroll.preview = window.scroll;
  return WorkspacePane({
    title: ` ${state.activeTab === 'preview' ? '▶' : ' '} PREVIEW `,
    active: state.activeTab === 'preview',
    height,
    theme,
    children: window.rows.map((line) => Text(line, { wrap: false })),
  });
}

function tokenPane(state, theme, width, height) {
  const semanticRows = [
    ['surface', theme.surface ?? '<fallback>'],
    ['surfaceActive', theme.surfaceActive ?? '<fallback>'],
    ['textAccent', theme.textAccent ?? theme.accent ?? '<fallback>'],
    ['textMuted', theme.textMuted ?? theme.muted ?? '<fallback>'],
    ['borderMuted', theme.borderMuted ?? theme.border ?? '<fallback>'],
    ['success', theme.success ?? theme.ok ?? '<fallback>'],
    ['warning', theme.warning ?? '<fallback>'],
    ['danger', theme.danger ?? theme.error ?? '<fallback>'],
    ['info', theme.info ?? theme.accent ?? '<fallback>'],
  ];
  const rows = renderNode(KeyValueBlock({ title: ' Semantic tokens ', rows: semanticRows }), Math.max(20, width - 4));
  const window = visibleScrollableRows(rows, {
    scroll: state.paneScroll.tokens,
    height: Math.max(3, height - 2),
    width: Math.max(20, width - 4),
    footer: rows.length > Math.max(3, height - 3),
    footerLabel: '↑/↓ line · PgUp/PgDn page',
  });
  state.paneScroll.tokens = window.scroll;
  return WorkspacePane({
    title: ` ${state.activeTab === 'tokens' ? '▶' : ' '} TOKENS `,
    active: state.activeTab === 'tokens',
    height,
    theme,
    children: window.rows.map((line) => Text(line, { wrap: false })),
  });
}

function selectTheme(state, index) {
  state.selectedIndex = Math.max(0, Math.min(THEME_NAMES.length - 1, index));
  state.paneScroll.preview = 0;
  state.paneScroll.tokens = 0;
  state.status = `Previewing ${THEME_NAMES[state.selectedIndex]}; press Enter to apply.`;
}

function scrollThemePane(state, pane, keyName) {
  const total = pane === 'tokens' ? 15 : 40;
  const visible = 8;
  if (keyName === 'home') state.paneScroll[pane] = 0;
  else if (keyName === 'end') state.paneScroll[pane] = Math.max(0, total - visible);
  else state.paneScroll[pane] = scrollOffset(state.paneScroll[pane], keyName === 'up' ? -1 : keyName === 'down' ? 1 : keyName === 'page-up' ? -visible : visible, total, visible);
  state.status = `${pane === 'tokens' ? 'Token map' : 'Preview'} scrolled.`;
}

function contextHelp(state) {
  if (state.activeTab === 'themes') return [['↑/↓', 'select theme'], ['Home/End', 'first/last'], ['Enter', 'apply theme'], ['Tab', 'switch pane']];
  return [['↑/↓', 'scroll line'], ['PgUp/PgDn', 'scroll page'], ['Home/End', 'top/bottom'], ['Esc', 'back to themes'], ['Tab', 'switch pane']];
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({ title: 'Theme Gallery', state: createThemeGalleryState(), render: createThemeGalleryView, onKey: handleThemeGalleryKey });
}
