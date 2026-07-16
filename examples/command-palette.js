#!/usr/bin/env node
import {
  Badge,
  Box,
  KeyHintBar,
  KeyValueBlock,
  MetricBlock,
  OverlayHost,
  ProgressBar,
  RequireViewport,
  Row,
  Spinner,
  SelectList,
  Text,
  Timeline,
  WorkspaceCommandBar,
  WorkspaceFooter,
  WorkspacePane,
  WorkspaceShell,
  color,
  createActionRegistry,
  createCommandPaletteState as createPaletteState,
  createOverlayManager,
  createTimelineEvent,
  getCommandPaletteMatches,
  getPaletteQuery,
  handleCommandPaletteKey as handlePaletteStateKey,
  resolveWorkspaceShellLayout,
  themes,
  truncateVisible,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';

const RELEASE_VERSION = '2.8.0';
const THEME_ORDER = ['ocean', 'forest', 'synth', 'dark'];
const MIN_WIDTH = 72;
const MIN_HEIGHT = 22;

const MISSION_STEPS = [
  { id: 'release.checks.run', label: 'Run release checks', query: 'checks' },
  { id: 'release.notes.generate', label: 'Generate release notes', query: 'notes' },
  { id: 'release.approval.request', label: 'Request approval', query: 'approval' },
  { id: 'release.deploy.staging', label: 'Deploy to staging', query: 'deploy staging' },
];

const ACTION_CATALOG = [
  ['release.checks.run', 'Run release checks', 'Release', 'C', 'Verify tests, syntax and package metadata.', ['checks', 'verify', 'tests', 'quality']],
  ['release.notes.generate', 'Generate release notes', 'Release', 'N', 'Create a concise changelog from the staged changes.', ['notes', 'changelog', 'summary']],
  ['release.approval.request', 'Request release approval', 'Release', 'A', 'Ask for approval after checks and notes are ready.', ['approval', 'review', 'signoff']],
  ['release.deploy.staging', 'Deploy release to staging', 'Deploy', 'D', 'Open a confirmation before simulating a staging deploy.', ['deploy', 'ship', 'staging']],
  ['release.deploy.production', 'Deploy release to production', 'Deploy', '', 'Permanently disabled in this safe example.', ['production', 'prod', 'live']],
  ['release.rollback', 'Roll back staging release', 'Deploy', 'B', 'Available only after the staging deployment completes.', ['rollback', 'undo', 'revert']],
  ['release.summary.copy', 'Copy release summary', 'Utility', 'Y', 'Simulate copying the current release summary.', ['copy', 'summary', 'clipboard']],
  ['activity.toggle', 'Toggle expanded activity', 'View', 'L', 'Show or hide the longer activity feed.', ['activity', 'log', 'history']],
  ['theme.next', 'Cycle workspace theme', 'Appearance', 'T', 'Apply the next semantic theme to the whole workspace.', ['theme', 'color', 'appearance']],
  ['scenario.reset', 'Reset release scenario', 'Scenario', 'R', 'Return the mission to its initial blocked state.', ['reset', 'restart', 'clear']],
  ['help.shortcuts', 'Show command-center help', 'Help', '?', 'Open contextual help for the palette and workspace.', ['help', 'keys', 'shortcuts']],
  ['app.exit', 'Exit the example', 'App', 'Ctrl+Q', 'Restore the terminal and exit cleanly.', ['quit', 'exit', 'close']],
];

const COMMAND_OPERATION_META = {
  'release.checks.run': { label: 'Running release checks', detail: 'Executing syntax, test and package verification.', duration: 1.5 },
  'release.notes.generate': { label: 'Generating release notes', detail: 'Summarizing the staged changes into a concise changelog.', duration: 1.25 },
  'release.approval.request': { label: 'Requesting release approval', detail: 'Preparing the release evidence and recording sign-off.', duration: 1.25 },
  'release.deploy.staging': { label: 'Preparing staging deployment', detail: 'Building the deployment plan before confirmation.', duration: 1.5 },
  'release.rollback': { label: 'Preparing staging rollback', detail: 'Resolving the last deployment and rollback target.', duration: 1.25 },
  'release.summary.copy': { label: 'Preparing release summary', detail: 'Formatting the current release state for sharing.', duration: 0.9 },
  'activity.toggle': { label: 'Updating activity view', detail: 'Recalculating the visible activity window.', duration: 0.7 },
  'theme.next': { label: 'Applying workspace theme', detail: 'Repainting semantic surfaces and borders.', duration: 0.8 },
  'scenario.reset': { label: 'Resetting release scenario', detail: 'Restoring the initial blocked release state.', duration: 1.0 },
};

export function createCommandPaletteState() {
  const state = {
    themeName: 'ocean',
    release: createReleaseState(),
    registry: null,
    palette: createPaletteState({ items: [], windowSize: 7, groupByCategory: true }),
    overlays: createOverlayManager(),
    activity: [
      createTimelineEvent({ type: 'system_event', actor: 'workspace', text: `Release ${RELEASE_VERSION} loaded in a blocked state.` }),
    ],
    activityExpanded: false,
    lastActionId: null,
    operation: null,
    pendingAdviceActionId: null,
    status: 'Read the introduction, then press Enter to start the release mission.',
  };
  state.registry = createReleaseRegistry();
  syncPaletteItems(state);
  openIntroHelp(state);
  return state;
}

export function createCommandPaletteView({ state, width = 104, height = 30 } = {}) {
  normalizeState(state);
  const theme = themes[state.themeName] ?? themes.ocean;
  syncPaletteItems(state);
  refreshPaletteOverlay(state, width, height, theme);
  refreshOperationOverlay(state, width, height, theme);

  const progress = missionProgress(state);
  const next = nextMissionStep(state);
  const stats = [
    { label: 'Release', value: RELEASE_VERSION },
    { label: 'Readiness', value: `${progress.completed}/${MISSION_STEPS.length}` },
    { label: 'State', value: releaseStage(state) },
  ];
  const right = [
    { label: 'Theme', value: state.themeName },
    { label: 'Palette', value: state.overlays.top()?.type === 'palette' ? 'open' : 'closed' },
    { label: 'Activity', value: state.operation ? `${Math.round(state.operation.progress)}%` : 'idle' },
  ];
  const activity = KeyHintBar({
    title: ' COMMAND CENTER KEYS ',
    adaptive: true,
    maxColumns: 5,
    minColumnWidth: 16,
    theme,
    hints: [
      ['/', 'open palette'],
      ['Ctrl+P', 'open palette'],
      ['?', 'show help'],
      ['T', 'cycle theme'],
      ['R', 'reset mission'],
      ['Q', 'exit'],
    ],
  });
  const footer = WorkspaceFooter({
    left: [state.status],
    right: [next ? `next: ${next.id}` : 'mission complete'],
    theme,
  });
  const { mainHeight } = resolveWorkspaceShellLayout({
    width,
    height,
    title: 'Release Command Center',
    subtitle: 'move one release from blocked to deployed through a searchable action palette',
    stats,
    right,
    focus: state.overlays.top()?.type ?? 'workspace',
    activity,
    footer,
    theme,
    minMainHeight: 7,
  });

  const main = releaseWorkspace(state, theme, width, mainHeight);
  const shell = WorkspaceShell({
    title: 'Release Command Center',
    subtitle: 'move one release from blocked to deployed through a searchable action palette',
    stats,
    right,
    focus: state.overlays.top()?.type ?? 'workspace',
    main,
    activity,
    footer,
    height,
    theme,
  });
  const hosted = OverlayHost({
    content: shell,
    manager: state.overlays,
    theme,
    width,
    height,
    toastBottomMargin: 7,
  });

  return RequireViewport({
    width,
    height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: 'Release Command Center needs more room',
    message: 'Resize to keep the mission, release state and command palette readable.',
    theme,
    children: hosted,
  });
}

export function handleCommandPaletteKey({ key, state, runtime = { exit() {} } }) {
  normalizeState(state);
  syncPaletteItems(state);
  const top = state.overlays.top();

  if (top?.type === 'palette') {
    handlePaletteOverlayKey({ key, state, runtime });
    return;
  }

  if (top?.type === 'operation') {
    state.status = `${state.operation?.label ?? 'The command'} is still running. Ctrl+C still exits safely.`;
    return;
  }

  if (top) {
    state.overlays.handleKey(key, { state, runtime });
    return;
  }

  if ((key.printable && key.text === '/') || key.name === 'command-palette' || (key.ctrl && key.name === 'p')) {
    openPalette(state);
    return;
  }

  const ctx = actionContext(state, runtime);
  const action = state.registry.findByKey(key, ctx, { scopes: ['global'] });
  if (action) {
    if (state.registry.isDisabled(action, ctx)) {
      const reason = disabledReason(action.id, state) || `${action.title} is currently disabled.`;
      state.overlays.toast(reason, 'warning');
      state.status = reason;
      return;
    }
    if (['palette.open', 'help.shortcuts', 'app.exit'].includes(action.id)) {
      state.registry.execute(action, ctx);
      return;
    }
    startCommandOperation(state, action.id, runtime);
    return;
  }

  if (key.name === 'escape') {
    state.status = 'Nothing to close. Press / to open the command palette.';
  }
}

export function tickCommandPalette({ state, runtime = { exit() {} }, delta = 0.25 } = {}) {
  if (!state) return false;
  let changed = Boolean(state.overlays?.tick?.(delta));
  if (!state.operation) return changed;

  state.operation.elapsed += delta;
  state.operation.frame += 1;
  state.operation.progress = Math.min(100, state.operation.elapsed / state.operation.duration * 100);
  changed = true;

  if (state.operation.progress >= 100) finishCommandOperation(state, runtime);
  return changed;
}

export function getFilteredActions(query, state = null) {
  const working = state ?? createCommandPaletteState();
  syncPaletteItems(working);
  working.palette.editor.set(String(query ?? ''));
  working.palette.selectedIndex = 0;
  return getCommandPaletteMatches(working.palette);
}

function createReleaseRegistry() {
  return createActionRegistry([
    {
      id: 'palette.open',
      title: 'Open release command palette',
      description: 'Search and execute release actions.',
      category: 'Navigation',
      aliases: ['palette', 'commands', 'search'],
      keys: ['/', 'ctrl+p'],
      scope: 'global',
      hidden: true,
      execute: ({ state }) => openPalette(state),
    },
    {
      id: 'release.checks.run',
      title: 'Run release checks',
      description: 'Verify tests, syntax and package metadata.',
      category: 'Release',
      aliases: ['checks', 'verify', 'tests', 'quality'],
      keys: ['c'],
      scope: 'global',
      execute: ({ state }) => {
        if (state.release.checks) {
          state.overlays.toast('Release checks already passed.', 'info');
          state.status = 'Checks are already complete. Continue with release notes.';
          return;
        }
        state.release.checks = true;
        recordActivity(state, 'success', 'checks', 'All release checks passed.');
        state.overlays.toast('Release checks passed.', 'success');
        state.status = 'Step 2: open the palette and search “notes”.';
      },
    },
    {
      id: 'release.notes.generate',
      title: 'Generate release notes',
      description: 'Create a concise changelog from the staged changes.',
      category: 'Release',
      aliases: ['notes', 'changelog', 'summary'],
      keys: ['n'],
      scope: 'global',
      execute: ({ state }) => {
        if (state.release.notes) {
          state.overlays.toast('Release notes already exist.', 'info');
          state.status = 'Release notes are ready. Continue with approval.';
          return;
        }
        state.release.notes = true;
        recordActivity(state, 'activity', 'notes', 'Generated release notes for 14 staged changes.');
        state.overlays.toast('Release notes generated.', 'success');
        state.status = state.release.checks
          ? 'Step 3: search “approval” and request sign-off.'
          : 'Release notes are ready. Run checks before approval can be requested.';
      },
    },
    {
      id: 'release.approval.request',
      title: 'Request release approval',
      description: 'Ask for approval after checks and notes are ready.',
      category: 'Release',
      aliases: ['approval', 'review', 'signoff'],
      keys: ['a'],
      scope: 'global',
      disabled: ({ state }) => !state.release.checks || !state.release.notes || state.release.approved,
      execute: ({ state }) => {
        state.release.approved = true;
        recordActivity(state, 'activity', 'approval', 'Release approved for staging deployment.');
        state.overlays.toast('Release approved for staging.', 'success');
        state.status = 'Step 4: search “deploy staging”, then confirm the deployment.';
      },
    },
    {
      id: 'release.deploy.staging',
      title: 'Deploy release to staging',
      description: 'Open a confirmation before simulating a staging deploy.',
      category: 'Deploy',
      aliases: ['deploy', 'ship', 'staging'],
      keys: ['d'],
      scope: 'global',
      disabled: ({ state }) => !state.release.approved || state.release.deployed,
      execute: ({ state }) => {
        state.overlays.confirm({
          title: ' Deploy to staging? ',
          message: `Release ${RELEASE_VERSION} is approved. This example will simulate the deployment locally.`,
          confirmLabel: 'Deploy',
          cancelLabel: 'Cancel',
          selected: 'cancel',
          onConfirm: () => {
            state.release.deployed = true;
            recordActivity(state, 'success', 'deploy', `Release ${RELEASE_VERSION} deployed to staging.`);
            state.overlays.toast('Staging deployment completed.', 'success');
            state.status = 'Mission complete. Explore theme, activity, rollback and reset commands.';
            showPendingAdvice(state, { outcome: 'success', summary: `Release ${RELEASE_VERSION} reached staging.` });
          },
          onCancel: () => {
            state.status = 'Deployment cancelled. Reopen the palette when you are ready.';
            showPendingAdvice(state, { outcome: 'cancelled', summary: 'The staging deployment was cancelled.' });
          },
        });
        state.status = 'Confirm or cancel the staging deployment.';
      },
    },
    {
      id: 'release.deploy.production',
      title: 'Deploy release to production',
      description: 'Permanently disabled in this safe example.',
      category: 'Deploy',
      aliases: ['production', 'prod', 'live'],
      keys: [],
      scope: 'global',
      disabled: true,
      execute: () => undefined,
    },
    {
      id: 'release.rollback',
      title: 'Roll back staging release',
      description: 'Available only after the staging deployment completes.',
      category: 'Deploy',
      aliases: ['rollback', 'undo', 'revert'],
      keys: ['b'],
      scope: 'global',
      disabled: ({ state }) => !state.release.deployed,
      execute: ({ state }) => {
        state.overlays.confirm({
          title: ' Roll back staging? ',
          message: `Return release ${RELEASE_VERSION} to the approved, not-deployed state?`,
          confirmLabel: 'Roll back',
          cancelLabel: 'Keep deployed',
          selected: 'cancel',
          onConfirm: () => {
            state.release.deployed = false;
            recordActivity(state, 'warning', 'rollback', 'Staging deployment rolled back.');
            state.overlays.toast('Staging release rolled back.', 'warning');
            state.status = 'Rollback complete. The release remains approved and can be deployed again.';
            showPendingAdvice(state, { outcome: 'success', summary: 'The staging release was rolled back safely.' });
          },
          onCancel: () => {
            state.status = 'Rollback cancelled. The staging release remains deployed.';
            showPendingAdvice(state, { outcome: 'cancelled', summary: 'The rollback was cancelled.' });
          },
        });
      },
    },
    {
      id: 'release.summary.copy',
      title: 'Copy release summary',
      description: 'Simulate copying the current release summary.',
      category: 'Utility',
      aliases: ['copy', 'summary', 'clipboard'],
      keys: ['y'],
      scope: 'global',
      execute: ({ state }) => {
        state.overlays.toast(`Copied release ${RELEASE_VERSION} summary.`, 'info');
        state.status = 'Copy action simulated; no clipboard access was used.';
        recordActivity(state, 'activity', 'copy', 'Copied the release summary locally.');
      },
    },
    {
      id: 'activity.toggle',
      title: 'Toggle expanded activity',
      description: 'Show or hide the longer activity feed.',
      category: 'View',
      aliases: ['activity', 'log', 'history'],
      keys: ['l'],
      scope: 'global',
      execute: ({ state }) => {
        state.activityExpanded = !state.activityExpanded;
        state.status = `${state.activityExpanded ? 'Expanded' : 'Collapsed'} the activity feed.`;
      },
    },
    {
      id: 'theme.next',
      title: 'Cycle workspace theme',
      description: 'Apply the next semantic theme to the whole workspace.',
      category: 'Appearance',
      aliases: ['theme', 'color', 'appearance'],
      keys: ['t'],
      scope: 'global',
      execute: ({ state }) => {
        const index = THEME_ORDER.indexOf(state.themeName);
        state.themeName = THEME_ORDER[(index + 1) % THEME_ORDER.length];
        state.overlays.toast(`Theme changed to ${state.themeName}.`, 'info');
        state.status = `Applied the ${state.themeName} theme to the whole command center.`;
        recordActivity(state, 'activity', 'theme', `Applied theme ${state.themeName}.`);
      },
    },
    {
      id: 'scenario.reset',
      title: 'Reset release scenario',
      description: 'Return the mission to its initial blocked state.',
      category: 'Scenario',
      aliases: ['reset', 'restart', 'clear'],
      keys: ['r'],
      scope: 'global',
      execute: ({ state }) => resetReleaseScenario(state),
    },
    {
      id: 'help.shortcuts',
      title: 'Show command-center help',
      description: 'Open contextual help for the palette and workspace.',
      category: 'Help',
      aliases: ['help', 'keys', 'shortcuts'],
      keys: ['?'],
      scope: 'global',
      execute: ({ state }) => openHelp(state),
    },
    {
      id: 'app.exit',
      title: 'Exit the example',
      description: 'Restore the terminal and exit cleanly.',
      category: 'App',
      aliases: ['quit', 'exit', 'close'],
      keys: ['ctrl+q'],
      scope: 'global',
      execute: ({ runtime }) => runtime.exit(0),
    },
  ]);
}

function releaseWorkspace(state, theme, width, height) {
  if (width >= 132) {
    const available = width - 4;
    const missionWidth = Math.max(36, Math.floor(available * 0.30));
    const stateWidth = Math.max(34, Math.floor(available * 0.28));
    const activityWidth = Math.max(38, available - missionWidth - stateWidth);
    return Row({ gap: 2, widths: [missionWidth, stateWidth, activityWidth], height },
      missionPane(state, theme, height),
      releaseStatePane(state, theme, height),
      activityPane(state, theme, height),
    );
  }

  if (width >= 92) {
    const left = Math.max(38, Math.floor((width - 2) * 0.43));
    const right = Math.max(42, width - 2 - left);
    return Row({ gap: 2, widths: [left, right], height },
      missionPane(state, theme, height),
      combinedStatePane(state, theme, height),
    );
  }

  return compactMissionPane(state, theme, height);
}

function missionPane(state, theme, height) {
  const progress = missionProgress(state);
  const next = nextMissionStep(state);
  return WorkspacePane({
    title: ' MISSION · SHIP TO STAGING ',
    height,
    theme,
    children: [
      Text(color(theme, 'textAccent', 'Use the palette as the primary interface. Complete the four release steps in order.')),
      ProgressBar({ value: progress.percent, total: 100, width: 25, label: `${progress.completed}/${MISSION_STEPS.length}` }),
      ...MISSION_STEPS.map((step, index) => missionStepLine(state, step, index, theme)),
      Box({ border: true, borderColor: theme.borderMuted, padding: { left: 1, right: 1 }, title: ' NEXT ACTION ' },
        next
          ? Text(color(theme, 'title', `Search “${next.query}” and press Enter.`))
          : Text(color(theme, 'success', 'Mission complete. The release is on staging.')),
        Text(color(theme, 'textMuted', 'Press / or Ctrl+P whenever the palette is closed.')),
      ),
    ],
  });
}

function releaseStatePane(state, theme, height) {
  const progress = missionProgress(state);
  return WorkspacePane({
    title: ' RELEASE STATE ',
    height,
    theme,
    children: [
      Row({ gap: 1 },
        Badge({ label: releaseStage(state), tone: stageTone(state), variant: 'filled', theme }),
        Badge({ label: `v${RELEASE_VERSION}`, tone: 'info', variant: 'outline', theme }),
      ),
      KeyValueBlock({
        title: ' Readiness ',
        rows: [
          ['checks', state.release.checks ? 'passed' : 'pending'],
          ['notes', state.release.notes ? 'ready' : 'missing'],
          ['approval', state.release.approved ? 'approved' : 'waiting'],
          ['staging', state.release.deployed ? 'deployed' : 'not deployed'],
        ],
      }),
      MetricBlock({
        title: ' Completion ',
        value: `${progress.percent}%`,
        detail: progress.completed === MISSION_STEPS.length ? 'all required actions complete' : `${MISSION_STEPS.length - progress.completed} required action(s) remain`,
        status: state.lastActionId ? `last: ${state.lastActionId}` : 'no action executed yet',
      }),
    ],
  });
}

function activityPane(state, theme, height) {
  const limit = state.activityExpanded ? Math.max(4, height - 4) : Math.min(6, Math.max(3, height - 4));
  return WorkspacePane({
    title: ` ACTIVITY ${state.activityExpanded ? '· EXPANDED' : ''} `,
    height,
    theme,
    children: [
      Timeline({
        title: ' Recent actions ',
        events: state.activity,
        limit,
        getLine: (event) => `${event.type === 'success' ? '✓' : event.type === 'warning' ? '!' : '·'} ${truncateVisible(event.text, 62)}`,
      }),
      Text(color(theme, 'textMuted', 'Palette commands update this feed instead of writing fake “accepted” rows.')),
    ],
  });
}

function combinedStatePane(state, theme, height) {
  const progress = missionProgress(state);
  const event = state.activity[0];
  return WorkspacePane({
    title: ' RELEASE + ACTIVITY ',
    height,
    theme,
    children: [
      Row({ gap: 1 },
        Badge({ label: releaseStage(state), tone: stageTone(state), variant: 'filled', theme }),
        Badge({ label: `${progress.percent}% ready`, tone: progress.percent === 100 ? 'success' : 'warning', variant: 'subtle', theme }),
      ),
      KeyValueBlock({
        title: ' Current state ',
        rows: [
          ['checks', state.release.checks ? 'passed' : 'pending'],
          ['notes', state.release.notes ? 'ready' : 'missing'],
          ['approval', state.release.approved ? 'approved' : 'waiting'],
          ['staging', state.release.deployed ? 'deployed' : 'not deployed'],
        ],
      }),
      Box({ border: true, borderColor: theme.borderMuted, padding: { left: 1, right: 1 }, title: ' LATEST ACTIVITY ' },
        Text(event ? event.text : 'No activity yet.'),
        Text(color(theme, 'textMuted', `${state.activity.length} event(s) in the local activity feed.`)),
      ),
    ],
  });
}

function compactMissionPane(state, theme, height) {
  const next = nextMissionStep(state);
  const progress = missionProgress(state);
  return WorkspacePane({
    title: ' RELEASE MISSION ',
    height,
    theme,
    children: [
      Row({ gap: 1 },
        Badge({ label: releaseStage(state), tone: stageTone(state), variant: 'filled', theme }),
        Badge({ label: `${progress.completed}/${MISSION_STEPS.length}`, tone: 'info', variant: 'outline', theme }),
      ),
      ProgressBar({ value: progress.percent, total: 100, width: 24, label: 'readiness' }),
      ...MISSION_STEPS.map((step, index) => missionStepLine(state, step, index, theme)),
      Text(next ? `Next: / → search “${next.query}” → Enter` : 'Mission complete. Try rollback, theme and reset commands.'),
      Text(color(theme, 'textMuted', state.activity[0]?.text ?? 'No activity yet.')),
    ],
  });
}

function paletteOverlayNode(state, width, height, theme) {
  const matches = getCommandPaletteMatches(state.palette);
  const selected = matches[state.palette.selectedIndex] ?? null;
  const compact = width < 86 || height < 27;
  const listHeight = compact ? 5 : 7;
  state.palette.windowSize = listHeight;
  if (state.palette.list) state.palette.list.windowSize = listHeight;
  const categories = categoryCounts(matches).slice(0, compact ? 4 : 6);
  const query = getPaletteQuery(state.palette);
  const next = nextMissionStep(state);
  const listWidth = compact ? Math.max(30, Math.floor((width - 2) * 0.58)) : Math.max(38, Math.floor((width - 2) * 0.57));
  const detailWidth = Math.max(24, width - 2 - listWidth);

  const search = WorkspaceCommandBar({
    mode: 'SEARCH ACTIONS',
    prompt: '›',
    value: `${query || '<type a command>'}█`,
    suggestions: categories.map(([category, count]) => `${category.toLowerCase()} ${count}`),
    hint: 'fuzzy title · description · aliases',
    theme,
  });
  const list = SelectList({
    title: 'COMMANDS',
    items: matches,
    selectedIndex: state.palette.selectedIndex,
    windowSize: listHeight,
    emptyText: 'No matching commands.',
    theme,
    wrapItems: !compact,
    rowLines: compact ? 1 : 2,
    reserveItemLines: !compact,
    getLabel: (item) => item.title,
    getDescription: (item) => {
      const keys = item.keys?.length ? item.keys.join('/') : 'no shortcut';
      return `${item.category} · ${keys}`;
    },
    getDisabled: (item) => item.disabled,
    pointerId: 'release:palette-list',
    onSelect: (_item, index) => {
      state.palette.selectedIndex = index;
      state.status = `Selected command ${index + 1}/${matches.length}. Press Enter to execute.`;
    },
    onWheel: (event) => {
      const delta = event.deltaY < 0 ? -1 : 1;
      state.palette.selectedIndex = Math.max(0, Math.min(matches.length - 1, state.palette.selectedIndex + delta));
      event.preventDefault();
    },
  });
  const detail = selectedCommandPane(state, selected, theme, detailWidth, listHeight * (compact ? 1 : 2) + 2);

  return Box({
    border: true,
    borderColor: theme.borderActive,
    padding: { left: 1, right: 1 },
    title: ` RELEASE COMMAND PALETTE · ${missionProgress(state).completed}/${MISSION_STEPS.length} COMPLETE `,
  },
    Text(next
      ? color(theme, 'textAccent', `Current goal: ${next.label}. Search “${next.query}”.`)
      : color(theme, 'success', 'Mission complete. Explore rollback, appearance and scenario commands.')),
    search,
    Row({ gap: 2, widths: [listWidth, detailWidth] }, list, detail),
    Text(color(theme, 'textMuted', 'Type to filter · wheel or Shift+↑/↓ move · PgUp/PgDn page · Enter execute · Esc clear/close')),
  );
}

function selectedCommandPane(state, item, theme, width, height) {
  if (!item) {
    return WorkspacePane({
      title: ' COMMAND DETAILS ',
      height,
      theme,
      children: [Text('No command matches the current query.'), Text(color(theme, 'textMuted', 'Press Esc to clear the filter.'))],
    });
  }
  const recommended = nextMissionStep(state)?.id === item.id;
  const reason = disabledReason(item.id, state);
  return WorkspacePane({
    title: ' COMMAND DETAILS ',
    height,
    theme,
    children: [
      Row({ gap: 1 },
        Badge({ label: item.category, tone: 'info', variant: 'outline', theme }),
        recommended ? Badge({ label: 'recommended next', tone: 'success', variant: 'filled', theme }) : null,
        item.disabled ? Badge({ label: 'disabled', tone: 'warning', variant: 'filled', theme }) : null,
      ),
      Text(color(theme, 'title', item.title)),
      Text(item.description),
      KeyValueBlock({
        title: ' Action contract ',
        rows: [
          ['id', item.id],
          ['shortcut', item.keys?.join(' / ') || 'palette only'],
          ['availability', item.disabled ? 'blocked' : 'ready'],
        ],
      }),
      reason ? Text(color(theme, 'warning', reason)) : Text(color(theme, 'textMuted', 'Enter executes this action against the local release state.')),
    ],
  });
}

function handlePaletteOverlayKey({ key, state, runtime }) {
  syncPaletteItems(state);
  const result = handlePaletteStateKey(state.palette, key);

  if (result.type === 'cancel') {
    state.overlays.pop();
    state.status = 'Palette closed. Press / or Ctrl+P to reopen it.';
    return;
  }
  if (result.type === 'clear') {
    state.status = 'Palette filter cleared.';
    return;
  }
  if (result.type === 'disabled') {
    const reason = disabledReason(result.item?.id, state) || `${result.item?.title ?? 'This action'} is currently disabled.`;
    state.overlays.toast(reason, 'warning');
    state.status = reason;
    return;
  }
  if (result.type !== 'accept' || !result.item) return;

  state.overlays.pop();
  startCommandOperation(state, result.item.id, runtime);
}

function startCommandOperation(state, actionId, runtime = { exit() {} }) {
  if (state.operation) return;
  const action = state.registry.find(actionId);
  if (!action) {
    state.overlays.toast('The selected command is no longer registered.', 'error');
    state.status = 'Command registry mismatch.';
    return;
  }
  const ctx = actionContext(state, runtime);
  if (state.registry.isDisabled(action, ctx)) {
    const reason = disabledReason(action.id, state) || `${action.title} is currently disabled.`;
    state.overlays.toast(reason, 'warning');
    state.status = reason;
    return;
  }

  const meta = COMMAND_OPERATION_META[action.id] ?? {
    label: action.title,
    detail: action.description || 'Applying the selected workspace action.',
    duration: 0.9,
  };
  state.operation = {
    actionId: action.id,
    label: meta.label,
    detail: meta.detail,
    duration: Math.max(0.5, Number(meta.duration) || 0.9),
    elapsed: 0,
    progress: 0,
    frame: 0,
  };
  recordActivity(state, 'activity', 'command', `Started: ${action.title}.`);
  state.status = `${meta.label}…`;
  state.overlays.push({ type: 'operation', title: ` ${meta.label} `, blocking: true, opaqueRows: false, shadow: true });
}

function finishCommandOperation(state, runtime = { exit() {} }) {
  const operation = state.operation;
  if (!operation) return;
  if (state.overlays.top()?.type === 'operation') state.overlays.pop();
  state.operation = null;

  const execution = state.registry.execute(operation.actionId, actionContext(state, runtime));
  if (execution.type === 'disabled') {
    const reason = disabledReason(operation.actionId, state) || `${execution.action?.title ?? 'This action'} is disabled.`;
    state.overlays.toast(reason, 'warning');
    state.status = reason;
    showNextStepPopup(state, operation.actionId, { outcome: 'blocked', summary: reason });
    return;
  }
  if (execution.type === 'missing') {
    state.overlays.toast('The selected command is no longer registered.', 'error');
    state.status = 'Command registry mismatch.';
    return;
  }

  state.lastActionId = operation.actionId;
  if (state.overlays.top()?.type === 'confirm') {
    state.pendingAdviceActionId = operation.actionId;
    return;
  }
  showNextStepPopup(state, operation.actionId, { outcome: 'success' });
}

function operationOverlayNode(state, theme, width) {
  const operation = state.operation;
  const safeWidth = Math.max(38, Math.min(width, 68));
  const barWidth = Math.max(16, Math.min(36, safeWidth - 24));
  return Box({
    border: true,
    borderColor: theme.borderActive,
    padding: { left: 2, right: 2, top: 1, bottom: 1 },
    title: ' COMMAND ACTIVITY ',
  },
    Spinner({ frame: operation?.frame ?? 0, label: color(theme, 'textAccent', operation?.label ?? 'Working') }),
    Text(operation?.detail ?? 'Applying the selected command.'),
    ProgressBar({ value: operation?.progress ?? 0, total: 100, width: barWidth, label: 'progress' }),
    Text(color(theme, 'textMuted', 'The palette is closed while this action runs. Input is temporarily locked.')),
  );
}

function refreshOperationOverlay(state, width, height, theme) {
  const top = state.overlays.top();
  if (top?.type !== 'operation' || !state.operation) return;
  const overlayWidth = Math.max(42, Math.min(width - 8, 72));
  top.width = overlayWidth;
  top.opaqueRows = false;
  top.shadow = true;
  top.node = operationOverlayNode(state, theme, overlayWidth - 2);
}

function showPendingAdvice(state, { outcome = 'success', summary = '' } = {}) {
  const actionId = state.pendingAdviceActionId;
  state.pendingAdviceActionId = null;
  if (actionId) showNextStepPopup(state, actionId, { outcome, summary });
}

function showNextStepPopup(state, actionId, { outcome = 'success', summary = '' } = {}) {
  const action = state.registry.find(actionId);
  const next = nextMissionStep(state);
  const completed = missionProgress(state).completed === MISSION_STEPS.length;
  const outcomeText = summary || (outcome === 'cancelled'
    ? `${action?.title ?? 'The command'} was cancelled.`
    : `${action?.title ?? 'The command'} completed.`);
  const recommendation = next
    ? `Recommended next: ${next.label}. Search “${next.query}” in the palette.`
    : completed
      ? 'The staging mission is complete. Try release summary, rollback, theme or reset commands.'
      : 'Reopen the palette to choose another available command.';
  const theme = themes[state.themeName] ?? themes.ocean;

  state.overlays.modal({
    title: ' WHAT TO DO NEXT ',
    children: [
      Text(color(theme, outcome === 'cancelled' ? 'warning' : 'success', outcomeText)),
      Text(recommendation),
      Text(''),
      Text('Enter opens the command palette for the next action.'),
      Text('Esc returns to the workspace without opening it.'),
    ],
    footer: 'Enter open palette · Esc continue',
    onAccept: () => openPalette(state),
    onCancel: () => {
      state.status = next
        ? `Next recommended action: ${next.label}. Press / when ready.`
        : 'Advice closed. Press / to explore more commands.';
    },
  });
}

function refreshPaletteOverlay(state, width, height, theme) {
  const top = state.overlays.top();
  if (top?.type !== 'palette') return;
  const overlayWidth = Math.max(58, Math.min(width - 4, 106));
  top.width = overlayWidth;
  top.opaqueRows = true;
  top.shadow = true;
  top.node = paletteOverlayNode(state, overlayWidth - 2, height, theme);
}

function openPalette(state) {
  if (state.overlays.top()?.type === 'palette') return;
  if (state.overlays.hasBlocking()) return;
  syncPaletteItems(state);
  state.palette.editor.clear();
  state.palette.selectedIndex = 0;
  state.overlays.push({ type: 'palette', title: ' Release Command Palette ', blocking: true, opaqueRows: true });
  const next = nextMissionStep(state);
  state.status = next
    ? `Palette open. Search “${next.query}” for the recommended next action.`
    : 'Palette open. Explore rollback, theme, activity and reset actions.';
}

function openIntroHelp(state) {
  state.overlays.help({
    title: ' RELEASE COMMAND CENTER · START HERE ',
    width: 82,
    opaqueRows: true,
    shadow: true,
    children: [
      Text('Goal'),
      Text(`Move release ${RELEASE_VERSION} from blocked to deployed on staging.`),
      Text(''),
      Text('What to know'),
      Text('• The command palette is the primary interface. Open it with / or Ctrl+P.'),
      Text('• Search by intent: checks, notes, approval, deploy staging.'),
      Text('• Disabled commands explain which prerequisite is missing.'),
      Text('• Every accepted command closes the palette and runs a short activity animation.'),
      Text('• After completion, a popup recommends the next useful action.'),
      Text(''),
      Text('Mission path: checks → release notes → approval → staging deploy.'),
      Text(''),
      Text(color(themes[state.themeName] ?? themes.ocean, 'selected', '› Click here or press Enter to open the palette and begin.'), {
        wrap: false,
        pointerId: 'release:intro:start',
        pointerWidth: 'fill',
        onClick: () => {
          state.overlays.pop();
          openPalette(state);
        },
      }),
      Text(color(themes[state.themeName] ?? themes.ocean, 'textMuted', '  Click here or press Esc to close this introduction.'), {
        wrap: false,
        pointerId: 'release:intro:close',
        pointerWidth: 'fill',
        onClick: () => {
          state.overlays.pop();
          state.status = 'Introduction closed. Press / or Ctrl+P to start the mission.';
        },
      }),
    ],
    onAccept: () => openPalette(state),
    onCancel: () => {
      state.status = 'Introduction closed. Press / or Ctrl+P to start the mission.';
    },
  });
}

function openHelp(state) {
  const next = nextMissionStep(state);
  state.overlays.help({
    title: ' Release Command Center Help ',
    width: 80,
    opaqueRows: true,
    shadow: true,
    children: [
      Text('User path'),
      Text('1. Press / or Ctrl+P to open the command palette.'),
      Text('2. Type a goal such as checks, notes, approval or deploy staging.'),
      Text('3. Review disabled state and command details, then press Enter.'),
      Text('4. The palette closes and a short activity animation runs.'),
      Text('5. Use the follow-up popup to open the next recommended action.'),
      Text(''),
      Text(next ? `Recommended now: ${next.id}` : 'The required staging mission is complete.'),
      Text('Esc always returns one interaction level.'),
    ],
  });
  state.status = 'Help open. Press Esc to return.';
}

function syncPaletteItems(state) {
  const ctx = actionContext(state, { exit() {} });
  state.palette.items = state.registry.list(ctx).filter((action) => !action.hidden).map((action) => ({
    id: action.id,
    title: action.title,
    description: action.description,
    category: action.category,
    aliases: action.aliases,
    keywords: [...action.aliases, action.category, action.scope].filter(Boolean),
    keys: action.keys,
    disabled: state.registry.isDisabled(action, ctx),
    value: { action },
  }));
}

function actionContext(state, runtime) {
  return { state, runtime, overlays: state.overlays, registry: state.registry };
}

function createReleaseState() {
  return { checks: false, notes: false, approved: false, deployed: false };
}

function resetReleaseScenario(state) {
  state.release = createReleaseState();
  state.activity = [createTimelineEvent({ type: 'system_event', actor: 'workspace', text: `Release ${RELEASE_VERSION} reset to its initial blocked state.` })];
  state.lastActionId = 'scenario.reset';
  state.activityExpanded = false;
  state.overlays.toast('Release scenario reset.', 'info');
  state.status = 'Step 1: open the palette, search “checks”, then press Enter.';
}

function recordActivity(state, type, actor, text) {
  state.activity.unshift(createTimelineEvent({ type, actor, text }));
  state.activity = state.activity.slice(0, 20);
}

function missionProgress(state) {
  const completed = [state.release.checks, state.release.notes, state.release.approved, state.release.deployed].filter(Boolean).length;
  return { completed, percent: Math.round(completed / MISSION_STEPS.length * 100) };
}

function nextMissionStep(state) {
  if (!state.release.checks) return MISSION_STEPS[0];
  if (!state.release.notes) return MISSION_STEPS[1];
  if (!state.release.approved) return MISSION_STEPS[2];
  if (!state.release.deployed) return MISSION_STEPS[3];
  return null;
}

function releaseStage(state) {
  if (state.release.deployed) return 'deployed';
  if (state.release.approved) return 'approved';
  if (state.release.checks && state.release.notes) return 'ready for approval';
  return 'blocked';
}

function stageTone(state) {
  if (state.release.deployed) return 'success';
  if (state.release.approved) return 'info';
  return 'warning';
}

function missionStepLine(state, step, index, theme) {
  const complete = [state.release.checks, state.release.notes, state.release.approved, state.release.deployed][index];
  const current = nextMissionStep(state)?.id === step.id;
  const marker = complete ? '✓' : current ? '›' : '·';
  const token = complete ? 'success' : current ? 'textAccent' : 'textMuted';
  return Text(color(theme, token, `${marker} ${index + 1}. ${step.label}`), {
    wrap: false,
    pointerId: `release:mission:${step.id}`,
    pointerWidth: 'fill',
    onClick: () => {
      openPalette(state);
      state.palette.editor.set(step.query);
      state.palette.selectedIndex = 0;
      state.status = `Palette opened for ${step.label}.`;
    },
  });
}

function disabledReason(id, state) {
  if (id === 'release.approval.request') {
    if (state.release.approved) return 'Approval is already recorded.';
    if (!state.release.checks && !state.release.notes) return 'Run release checks and generate notes first.';
    if (!state.release.checks) return 'Run release checks first.';
    if (!state.release.notes) return 'Generate release notes first.';
  }
  if (id === 'release.deploy.staging') {
    if (state.release.deployed) return 'The release is already deployed to staging.';
    if (!state.release.approved) return 'Request release approval first.';
  }
  if (id === 'release.deploy.production') return 'Production actions are intentionally disabled in this safe local example.';
  if (id === 'release.rollback' && !state.release.deployed) return 'A staging deployment must exist before rollback is available.';
  return '';
}

function categoryCounts(items) {
  const counts = new Map();
  for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  return [...counts.entries()];
}

function normalizeState(state) {
  state.themeName = themes[state.themeName] ? state.themeName : 'ocean';
  state.release ??= createReleaseState();
  state.registry ??= createReleaseRegistry();
  state.palette ??= createPaletteState({ items: [], windowSize: 7, groupByCategory: true });
  state.overlays ??= createOverlayManager();
  state.activity ??= [];
  state.activityExpanded = Boolean(state.activityExpanded);
  state.operation ??= null;
  state.pendingAdviceActionId ??= null;
  state.status ??= 'Press / to open the release command palette.';
}

// Compatibility catalog for users that imported the old example data indirectly.
export const ACTIONS = ACTION_CATALOG;

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Release Command Center',
    state: createCommandPaletteState(),
    render: createCommandPaletteView,
    onKey: handleCommandPaletteKey,
    onTick: tickCommandPalette,
    tickMs: 250,
  });
}
