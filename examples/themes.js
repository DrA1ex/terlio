#!/usr/bin/env node
import {
  Badge,
  Box,
  Column,
  Grid,
  KeyHintBar,
  OverlayHost,
  RequireViewport,
  Row,
  SelectList,
  Text,
  WorkspaceFooter,
  WorkspacePane,
  WorkspaceShell,
  color,
  createOverlayManager,
  fitInline,
  renderNode,
  resolveWorkspaceShellLayout,
  splitWorkspaceColumns,
  themes,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';
import {
  cycleTab,
  isShiftLineScroll,
  responsiveTabHint,
  responsiveTabs,
  scrollOffset,
  shiftLineScrollDelta,
  visibleScrollableRows,
  wheelScrollDelta,
} from './_workspaceExampleUtils.js';

const THEME_PROFILES = [
  { id: 'dark', label: 'Dark', character: 'Neutral dark', bestFor: 'general-purpose terminal apps', note: 'Balanced contrast without a strong color cast.' },
  { id: 'mono', label: 'Mono', character: 'No-color fallback', bestFor: 'restricted terminals and accessibility checks', note: 'Uses emphasis, underline and reverse video instead of color.' },
  { id: 'amber', label: 'Amber', character: 'Warm retro', bestFor: 'monitoring and operations tools', note: 'A restrained warm palette with strong status separation.' },
  { id: 'ocean', label: 'Ocean', character: 'Cool high contrast', bestFor: 'product workspaces and chat interfaces', note: 'Clear cyan accents with readable muted text.' },
  { id: 'forest', label: 'Forest', character: 'Calm green', bestFor: 'long-running dashboards', note: 'Low-fatigue greens with warm supporting tones.' },
  { id: 'synth', label: 'Synth', character: 'Vibrant neon', bestFor: 'showcases and high-energy tools', note: 'Strong magenta and cyan accents for maximum distinction.' },
  { id: 'slate', label: 'Slate', character: 'Quiet professional', bestFor: 'code review and administrative apps', note: 'A cool neutral palette that keeps content dominant.' },
  { id: 'paper', label: 'Paper', character: 'Light-terminal aware', bestFor: 'light backgrounds and printed-looking tools', note: 'Dark text-oriented tokens designed for pale terminals.' },
  { id: 'matrix', label: 'Matrix', character: 'High-saturation green', bestFor: 'diagnostics and playful utilities', note: 'A deliberately opinionated green-on-dark theme.' },
].filter((profile) => themes[profile.id]);

const THEME_NAMES = THEME_PROFILES.map((profile) => profile.id);
const TABS = [
  { id: 'library', label: 'Theme library' },
  { id: 'preview', label: 'Live preview' },
  { id: 'tokens', label: 'Token contract' },
];
const TOKEN_SPECS = [
  ['title', 'Primary headings'],
  ['text', 'Body content'],
  ['textMuted', 'Secondary explanation'],
  ['textAccent', 'Interactive emphasis'],
  ['borderMuted', 'Inactive borders'],
  ['borderActive', 'Focused borders'],
  ['success', 'Successful state'],
  ['warning', 'Warning state'],
  ['danger', 'Destructive or failed state'],
  ['info', 'Informational state'],
  ['user', 'User message role'],
  ['assistant', 'Assistant message role'],
  ['selected', 'Selected row treatment'],
];

export function createThemeGalleryState() {
  const initialName = themes.ocean ? 'ocean' : THEME_NAMES[0];
  return {
    selectedIndex: Math.max(0, THEME_NAMES.indexOf(initialName)),
    appliedTheme: initialName,
    activeTab: 'library',
    previewMode: 'candidate',
    paneScroll: { preview: 0, tokens: 0 },
    viewport: { width: 112, height: 32 },
    overlays: createOverlayManager(),
    status: 'Select a candidate theme, inspect it, then press Enter to apply it to the whole workspace.',
  };
}

export function createThemeGalleryView({ state, width = 112, height = 32 } = {}) {
  normalizeThemeState(state);
  state.viewport = { width, height };

  const selectedProfile = getSelectedProfile(state);
  const appliedProfile = getAppliedProfile(state);
  const candidateTheme = themes[selectedProfile.id];
  const appTheme = themes[appliedProfile.id];
  const staged = selectedProfile.id !== appliedProfile.id;
  const layout = splitWorkspaceColumns(width);
  const visibleTabs = responsiveTabs(TABS, state.activeTab, width, { pinned: ['library'] });
  const stats = [
    { label: 'Candidate', value: selectedProfile.label },
    { label: 'Applied', value: appliedProfile.label },
    { label: 'State', value: staged ? 'staged change' : 'active' },
  ];
  const right = [
    { label: 'Preview', value: state.previewMode },
    { label: 'Size', value: `${width}×${height}` },
  ];
  const tabHint = responsiveTabHint(
    'Tab focus · Enter apply · R discard staged change · C compare',
    TABS,
    visibleTabs,
  );
  const activity = KeyHintBar({
    title: ' LOCAL CONTROLS ',
    hints: contextHelp(state),
    adaptive: true,
    maxColumns: 4,
    minColumnWidth: 18,
    theme: appTheme,
  });
  const footerStatus = width < 100
    ? (staged ? `Previewing ${selectedProfile.label}; Enter applies it.` : `${appliedProfile.label} is active; choose another theme to preview.`)
    : state.status;
  const footer = WorkspaceFooter({
    left: [footerStatus],
    right: [
      staged ? `${selectedProfile.label} is not applied` : `${appliedProfile.label} is active`,
      `focus: ${state.activeTab}`,
    ],
    theme: appTheme,
  });
  const { mainHeight } = resolveWorkspaceShellLayout({
    width,
    height,
    title: 'Theme Studio',
    subtitle: 'preview, compare and apply semantic themes',
    stats,
    right,
    focus: state.activeTab,
    tabs: visibleTabs,
    activeTab: state.activeTab,
    onTabSelect: (id) => {
      state.activeTab = id;
      state.status = `Focus moved to ${id}.`;
    },
    tabHint,
    activity,
    footer,
    theme: appTheme,
    minMainHeight: 6,
  });

  const libraryWidth = layout.mode === 'wide' ? layout.widths[0] : layout.mode === 'medium' ? layout.widths[0] : width;
  const previewWidth = layout.mode === 'wide' ? layout.widths[1] : layout.mode === 'medium' ? layout.widths[1] : width;
  const tokensWidth = layout.mode === 'wide' ? layout.widths[2] : previewWidth;
  const library = themeLibraryPane(state, appTheme, libraryWidth, mainHeight);
  const preview = livePreviewPane(state, selectedProfile, appliedProfile, candidateTheme, appTheme, previewWidth, mainHeight);
  const tokens = tokenContractPane(state, selectedProfile, candidateTheme, tokensWidth, mainHeight);

  let main;
  if (layout.mode === 'wide') {
    main = Row({ gap: 2, widths: layout.widths, height: mainHeight }, library, preview, tokens);
  } else if (layout.mode === 'medium') {
    main = Row(
      { gap: 2, widths: layout.widths, height: mainHeight },
      library,
      state.activeTab === 'tokens' ? tokens : preview,
    );
  } else {
    main = state.activeTab === 'preview' ? preview : state.activeTab === 'tokens' ? tokens : library;
  }

  const shell = WorkspaceShell({
    title: 'Theme Studio',
    subtitle: 'preview, compare and apply semantic themes',
    stats,
    right,
    focus: state.activeTab,
    tabs: visibleTabs,
    activeTab: state.activeTab,
    onTabSelect: (id) => {
      state.activeTab = id;
      state.status = `Focus moved to ${id}.`;
    },
    tabHint,
    main,
    activity,
    footer,
    height,
    theme: appTheme,
  });
  const content = RequireViewport({
    width,
    height,
    minWidth: 64,
    minHeight: 20,
    title: 'Theme Studio needs more room',
    message: 'Resize to at least 64×20 to keep the library, preview and controls readable.',
    theme: appTheme,
    children: shell,
  });

  return OverlayHost({
    content,
    manager: state.overlays,
    theme: appTheme,
    width,
    height,
    toastBottomMargin: 7,
  });
}

export function handleThemeGalleryKey({ key, state }) {
  normalizeThemeState(state);
  if (state.overlays.hasBlocking()) {
    state.overlays.handleKey(key, { state });
    return;
  }

  if (key.name === 'tab') {
    cycleTab(state, TABS, key.shift ? -1 : 1, { statusPrefix: 'Focus moved to' });
    return;
  }
  if (key.name === 'escape' && state.activeTab !== 'library') {
    state.activeTab = 'library';
    state.status = 'Returned to the theme library.';
    return;
  }
  if (key.printable && key.text?.toLowerCase() === 'r') {
    discardCandidate(state);
    return;
  }
  if (key.printable && key.text?.toLowerCase() === 'c') {
    state.previewMode = state.previewMode === 'compare' ? 'candidate' : 'compare';
    state.paneScroll.preview = 0;
    state.status = state.previewMode === 'compare'
      ? 'Comparing the applied theme with the selected candidate.'
      : 'Showing the selected candidate as a full live preview.';
    return;
  }
  if (key.name === 'enter') {
    applySelectedTheme(state);
    return;
  }

  if (isShiftLineScroll(key) && state.activeTab !== 'library') {
    scrollThemePane(state, state.activeTab, key.name);
    return;
  }

  if (state.activeTab === 'library') {
    if (key.name === 'up') return selectTheme(state, state.selectedIndex - 1);
    if (key.name === 'down') return selectTheme(state, state.selectedIndex + 1);
    if (key.name === 'page-up') return selectTheme(state, state.selectedIndex - 4);
    if (key.name === 'page-down') return selectTheme(state, state.selectedIndex + 4);
    if (key.name === 'home') return selectTheme(state, 0);
    if (key.name === 'end') return selectTheme(state, THEME_NAMES.length - 1);
    return;
  }

  if (['up', 'down', 'page-up', 'page-down', 'home', 'end'].includes(key.name)) {
    scrollThemePane(state, state.activeTab, key.name);
  }
}

export function tickThemeGallery({ state, delta = 0.25 } = {}) {
  return Boolean(state?.overlays?.tick?.(delta));
}

function themeLibraryPane(state, appTheme, width, height) {
  const selected = getSelectedProfile(state);
  const showSummary = height >= 11;
  const summary = showSummary
    ? Box(
        { border: true, borderColor: appTheme.borderMuted ?? appTheme.border, padding: { left: 1, right: 1 }, title: ' CANDIDATE ' },
        Text(color(appTheme, 'title', selected.label), { wrap: false }),
        Text(color(appTheme, 'textAccent', selected.character), { wrap: false }),
        Text(color(appTheme, 'textMuted', `Best for ${selected.bestFor}.`), { wrap: true }),
      )
    : null;
  const summaryRows = showSummary ? 5 : 0;
  const windowSize = Math.max(2, Math.min(THEME_PROFILES.length, height - summaryRows - 4));

  return WorkspacePane({
    title: ` ${state.activeTab === 'library' ? '▶' : ' '} THEME LIBRARY `,
    active: state.activeTab === 'library',
    height,
    theme: appTheme,
    pointerId: 'themes:library',
    onClick: () => { state.activeTab = 'library'; },
    children: [SelectList({
      title: 'Themes',
      items: THEME_PROFILES.map((profile) => ({
        ...profile,
        description: profile.id === state.appliedTheme
          ? 'applied'
          : profile.id === selected.id
            ? 'candidate'
            : profile.character.toLowerCase(),
      })),
      selectedIndex: state.selectedIndex,
      windowSize,
      getLabel: (profile) => profile.label,
      getDescription: (profile) => profile.description,
      theme: appTheme,
      wrapItems: width < 34,
      rowLines: width < 34 ? 2 : 1,
      reserveItemLines: width < 34,
      pointerId: 'themes:list',
      onSelect: (_profile, index) => {
        state.activeTab = 'library';
        selectTheme(state, index);
      },
      onWheel: (event) => {
        selectTheme(state, state.selectedIndex + (event.deltaY < 0 ? -1 : 1));
        event.preventDefault();
      },
    })],
    footerNode: summary,
    footerGap: showSummary ? 1 : 0,
    footerMinHeight: showSummary ? 5 : 0,
    footerMaxHeight: showSummary ? 5 : 0,
  });
}

function livePreviewPane(state, selectedProfile, appliedProfile, candidateTheme, appTheme, width, height) {
  const innerWidth = Math.max(20, width - 4);
  const scene = state.previewMode === 'compare'
    ? comparisonScene({ selectedProfile, appliedProfile, candidateTheme, appTheme, width: innerWidth })
    : productScene({ profile: selectedProfile, theme: candidateTheme, label: 'Candidate preview', width: innerWidth });
  const rows = renderNode(scene, innerWidth);
  const window = visibleScrollableRows(rows, {
    scroll: state.paneScroll.preview,
    height: Math.max(3, height - 2),
    width: innerWidth,
    footer: rows.length > Math.max(3, height - 3),
    footerLabel: '↑/↓ line · PgUp/PgDn page',
  });
  state.paneScroll.preview = window.scroll;

  return WorkspacePane({
    title: ` ${state.activeTab === 'preview' ? '▶' : ' '} LIVE PREVIEW · ${selectedProfile.label.toUpperCase()} `,
    active: state.activeTab === 'preview',
    height,
    theme: candidateTheme,
    pointerId: 'themes:preview',
    onClick: () => { state.activeTab = 'preview'; },
    onWheel: (event) => {
      scrollThemePaneByDelta(state, 'preview', wheelScrollDelta(event));
      event.preventDefault();
    },
    children: window.rows.map((row) => Text(row, { wrap: false })),
  });
}

function tokenContractPane(state, profile, theme, width, height) {
  const innerWidth = Math.max(18, width - 4);
  const rows = [
    color(theme, 'title', `${profile.label} semantic contract`),
    color(theme, 'textMuted', 'Components request intent; the theme decides the terminal color.'),
    '',
    ...TOKEN_SPECS.map(([token, purpose]) => tokenLine(theme, token, purpose, innerWidth)),
    '',
    color(theme, 'textMuted', profile.note),
  ];
  const window = visibleScrollableRows(rows, {
    scroll: state.paneScroll.tokens,
    height: Math.max(3, height - 2),
    width: innerWidth,
    footer: rows.length > Math.max(3, height - 3),
    footerLabel: '↑/↓ line · PgUp/PgDn page',
  });
  state.paneScroll.tokens = window.scroll;

  return WorkspacePane({
    title: ` ${state.activeTab === 'tokens' ? '▶' : ' '} TOKEN CONTRACT `,
    active: state.activeTab === 'tokens',
    height,
    theme,
    pointerId: 'themes:tokens',
    onClick: () => { state.activeTab = 'tokens'; },
    onWheel: (event) => {
      scrollThemePaneByDelta(state, 'tokens', wheelScrollDelta(event));
      event.preventDefault();
    },
    children: window.rows.map((row) => Text(row, { wrap: false })),
  });
}

function productScene({ profile, theme, label, width }) {
  const safeWidth = Math.max(28, width);
  const metricColumns = safeWidth >= 56 ? 3 : 1;
  return Column({ gap: 1 },
    Box(
      { border: true, borderColor: theme.borderActive ?? theme.accent, padding: { left: 1, right: 1 }, title: ` ${label} ` },
      Text(color(theme, 'title', 'Incident workspace'), { wrap: false }),
      Text(color(theme, 'textMuted', `${profile.character} · ${profile.bestFor}`), { wrap: true }),
      Row({ gap: 1 },
        Badge({ label: 'info', tone: 'info', variant: 'subtle', theme }),
        Badge({ label: 'healthy', tone: 'success', variant: 'filled', theme }),
        Badge({ label: 'warning', tone: 'warning', variant: 'outline', theme }),
        Badge({ label: 'failed', tone: 'danger', variant: 'subtle', theme }),
      ),
    ),
    Grid({
      items: [
        ['Queue', '12'],
        ['SLA', '94%'],
        ['Owner', 'mira'],
      ],
      columns: metricColumns,
      gap: 1,
      border: true,
      borderColor: theme.borderMuted ?? theme.border,
      renderItem: ([key, value]) => `${color(theme, 'textMuted', key)} ${color(theme, 'textAccent', value)}`,
    }),
    Box(
      { border: true, borderColor: theme.borderMuted ?? theme.border, padding: { left: 1, right: 1 }, title: ' ACTIVITY ' },
      Text(`${color(theme, 'success', '✓')} ${color(theme, 'text', 'Health checks passed')}`, { wrap: false }),
      Text(`${color(theme, 'warning', '!')} ${color(theme, 'text', 'One review needs attention')}`, { wrap: false }),
      Text(`${color(theme, 'danger', '×')} ${color(theme, 'text', 'Deploy step blocked')}`, { wrap: false }),
      Text(color(theme, 'textMuted', 'Semantic tokens keep status meaning stable across palettes.'), { wrap: true }),
    ),
    Box(
      { border: true, borderColor: theme.borderActive ?? theme.accent, padding: { left: 1, right: 1 }, title: ' COMMAND ' },
      Text(color(theme, 'textAccent', '› inspect incident-184'), { wrap: false }),
      Text(color(theme, 'textMuted', 'Enter run · Tab complete'), { wrap: false }),
    ),
  );
}

function comparisonScene({ selectedProfile, appliedProfile, candidateTheme, appTheme, width }) {
  const safeWidth = Math.max(28, width);
  if (safeWidth < 70) {
    return Column({ gap: 1 },
      productScene({ profile: appliedProfile, theme: appTheme, label: 'Applied', width: safeWidth }),
      productScene({ profile: selectedProfile, theme: candidateTheme, label: 'Candidate', width: safeWidth }),
    );
  }
  const left = Math.floor((safeWidth - 2) / 2);
  const right = safeWidth - left - 2;
  return Row(
    { gap: 2, widths: [left, right] },
    productScene({ profile: appliedProfile, theme: appTheme, label: 'Applied', width: left }),
    productScene({ profile: selectedProfile, theme: candidateTheme, label: 'Candidate', width: right }),
  );
}

function tokenLine(theme, token, purpose, width) {
  const labelWidth = Math.min(15, Math.max(10, Math.floor(width * 0.34)));
  const sampleWidth = Math.max(8, width - labelWidth - 3);
  const sample = color(theme, token, fitInline(purpose, sampleWidth));
  return `${fitInline(token, labelWidth)} │ ${sample}`;
}

function selectTheme(state, index) {
  const next = Math.max(0, Math.min(THEME_NAMES.length - 1, Number(index) || 0));
  if (next === state.selectedIndex) return;
  state.selectedIndex = next;
  state.paneScroll.preview = 0;
  state.paneScroll.tokens = 0;
  const profile = getSelectedProfile(state);
  state.status = profile.id === state.appliedTheme
    ? `${profile.label} is already applied.`
    : `Previewing ${profile.label}. Press Enter to apply it to the whole workspace.`;
}

function applySelectedTheme(state) {
  const profile = getSelectedProfile(state);
  if (state.appliedTheme === profile.id) {
    state.status = `${profile.label} is already the active workspace theme.`;
    state.overlays.toast(`${profile.label} is already active.`, 'info', 2.5);
    return;
  }
  state.appliedTheme = profile.id;
  state.status = `Applied ${profile.label} to the entire Theme Studio workspace.`;
  state.overlays.toast(`Applied ${profile.label} to the whole workspace.`, 'success', 3);
}

function discardCandidate(state) {
  const appliedIndex = Math.max(0, THEME_NAMES.indexOf(state.appliedTheme));
  state.selectedIndex = appliedIndex;
  state.paneScroll.preview = 0;
  state.paneScroll.tokens = 0;
  state.status = `Discarded staged selection. ${getAppliedProfile(state).label} remains active.`;
}

function scrollThemePane(state, pane, keyName) {
  const visible = pane === 'tokens' ? 10 : 8;
  const total = pane === 'tokens' ? TOKEN_SPECS.length + 5 : state.previewMode === 'compare' ? 34 : 18;
  if (keyName === 'home') state.paneScroll[pane] = 0;
  else if (keyName === 'end') state.paneScroll[pane] = Math.max(0, total - visible);
  else {
    const delta = keyName === 'up' ? -1 : keyName === 'down' ? 1 : keyName === 'page-up' ? -visible : visible;
    state.paneScroll[pane] = scrollOffset(state.paneScroll[pane], delta, total, visible);
  }
  state.status = `${pane === 'tokens' ? 'Token contract' : 'Live preview'} scrolled.`;
}

function scrollThemePaneByDelta(state, pane, delta) {
  const visible = pane === 'tokens' ? 10 : 8;
  const total = pane === 'tokens' ? TOKEN_SPECS.length + 5 : state.previewMode === 'compare' ? 34 : 18;
  state.paneScroll[pane] = scrollOffset(state.paneScroll[pane], delta, total, visible);
  state.status = `${pane === 'tokens' ? 'Token contract' : 'Live preview'} scrolled.`;
}

function contextHelp(state) {
  if (state.activeTab === 'library') {
    return [
      ['↑/↓', 'select candidate'],
      ['PgUp/PgDn', 'jump through themes'],
      ['Enter', 'apply to workspace'],
      ['R', 'discard candidate'],
      ['C', 'compare'],
      ['Tab', 'switch pane'],
    ];
  }
  return [
    ['Shift+↑/↓', 'scroll line'],
    ['PgUp/PgDn', 'scroll page'],
    ['Enter', 'apply candidate'],
    ['C', 'candidate / compare'],
    ['R', 'discard candidate'],
    ['Esc', 'back to library'],
    ['Tab', 'switch pane'],
  ];
}

function getSelectedProfile(state) {
  return THEME_PROFILES[Math.max(0, Math.min(THEME_PROFILES.length - 1, state.selectedIndex))] ?? THEME_PROFILES[0];
}

function getAppliedProfile(state) {
  return THEME_PROFILES.find((profile) => profile.id === state.appliedTheme) ?? THEME_PROFILES[0];
}

function normalizeThemeState(state) {
  if (!state || typeof state !== 'object') return;
  if (!state.overlays) state.overlays = createOverlayManager();
  if (!state.paneScroll) state.paneScroll = { preview: 0, tokens: 0 };
  state.paneScroll.preview = Math.max(0, Number(state.paneScroll.preview) || 0);
  state.paneScroll.tokens = Math.max(0, Number(state.paneScroll.tokens) || 0);
  if (!TABS.some((tab) => tab.id === state.activeTab)) state.activeTab = 'library';
  if (!THEME_NAMES.includes(state.appliedTheme)) state.appliedTheme = themes.ocean ? 'ocean' : THEME_NAMES[0];
  state.selectedIndex = Math.max(0, Math.min(THEME_NAMES.length - 1, Number(state.selectedIndex) || 0));
  if (!['candidate', 'compare'].includes(state.previewMode)) state.previewMode = 'candidate';
  if (!state.status) state.status = 'Select a candidate theme and press Enter to apply it.';
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Theme Studio',
    state: createThemeGalleryState(),
    render: createThemeGalleryView,
    onKey: handleThemeGalleryKey,
    onTick: tickThemeGallery,
    tickMs: 250,
  });
}
