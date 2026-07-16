#!/usr/bin/env node
import {
  Docked,
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
  renderBlockLines,
  resolveWorkspaceShellLayout,
  themes,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';
import {
  EXAMPLE_THEME,
  isShiftLineScroll,
  scrollOffset,
  scrollToVisible,
  visibleScrollableRows,
  wheelScrollDelta,
} from './_workspaceExampleUtils.js';

export const BLOCK_SCENARIOS = [
  {
    id: 'code-review',
    title: 'Code review response',
    summary: 'A realistic review that combines explanation, source code, a patch, a safety warning, a verification command and its result.',
    blocks: [
      {
        type: 'text',
        title: 'Review summary',
        purpose: 'Explain the conclusion before showing implementation details.',
        content: 'The renderer lifecycle is sound, but the cleanup path should be explicit and the verification step should remain visible in the response.',
      },
      {
        type: 'code',
        language: 'js',
        title: 'Cleanup helper',
        purpose: 'Present reusable source code without flattening it into prose.',
        content: "export function stopRuntime(runtime) {\n  runtime.cancelPendingWork();\n  runtime.restoreTerminal();\n}",
      },
      {
        type: 'diff',
        title: 'src/lib/runtime.js',
        purpose: 'Show a proposed change with additions and removals carrying semantic color.',
        content: "--- a/src/lib/runtime.js\n+++ b/src/lib/runtime.js\n@@\n- process.on('exit', restore);\n+ process.once('exit', restore);\n+ process.once('SIGTERM', shutdown);",
      },
      {
        type: 'warning',
        title: 'Review boundary',
        purpose: 'Keep an important constraint visually distinct from ordinary prose.',
        content: 'Applying the patch and executing commands must remain explicit user actions.',
      },
      {
        type: 'command',
        title: 'Verification',
        purpose: 'Expose a command as an actionable block rather than copying it into a paragraph.',
        command: 'npm test && npm run check',
      },
      {
        type: 'tool_result',
        name: 'test-runner',
        status: 'passed',
        title: 'Verification result',
        purpose: 'Attach structured execution output to the response that requested it.',
        content: '133 tests passed\nsyntax check passed\n0 leaked timers',
      },
    ],
  },
  {
    id: 'deployment-recovery',
    title: 'Deployment recovery',
    summary: 'A short operational answer where warning, command and tool output need to stay easy to scan under pressure.',
    blocks: [
      {
        type: 'text',
        title: 'Recovery plan',
        purpose: 'State the intended sequence before presenting commands.',
        content: 'Keep the current process online, verify the previous release, then roll traffic back before changing any persistent state.',
      },
      {
        type: 'warning',
        title: 'Do not migrate yet',
        purpose: 'Promote the highest-risk constraint above routine steps.',
        content: 'The failed release contains a schema migration. Do not run it during rollback.',
      },
      {
        type: 'command',
        title: 'Inspect previous release',
        purpose: 'Represent the exact safe command as a distinct action.',
        command: 'node scripts/release-status.js --previous',
      },
      {
        type: 'tool_result',
        name: 'release-status',
        status: 'healthy',
        title: 'Previous release status',
        purpose: 'Show machine output with a tool identity and explicit status.',
        content: 'release: 2026.07.10-2\nhealth: healthy\ntraffic: 0%',
      },
      {
        type: 'command',
        title: 'Rollback traffic',
        purpose: 'Keep the final operator action visible after the evidence that justifies it.',
        command: 'node scripts/traffic.js --release 2026.07.10-2 --percent 100',
      },
    ],
  },
  {
    id: 'terminal-guidance',
    title: 'Terminal integration help',
    summary: 'A documentation-style response that mixes concise explanation with code and a smoke-test command.',
    blocks: [
      {
        type: 'text',
        title: 'Integration note',
        purpose: 'Give the reader a compact mental model before source code.',
        content: 'Render a node tree from state, normalize every key once, and keep terminal cleanup in the runtime rather than in each screen.',
      },
      {
        type: 'code',
        language: 'js',
        title: 'Minimal app',
        purpose: 'Provide a complete copyable API example.',
        content: "const app = createWorkspaceApp({\n  title: 'Demo',\n  state: { count: 0 },\n  render: ({ state }) => Text(`Count: ${state.count}`),\n});\n\napp.start();",
      },
      {
        type: 'warning',
        title: 'TTY requirement',
        purpose: 'Explain an environment constraint without burying it in the code sample.',
        content: 'Interactive examples require a real terminal because raw mode is unavailable when stdout is redirected.',
      },
      {
        type: 'command',
        title: 'Smoke test',
        purpose: 'Close the guidance with an immediately verifiable step.',
        command: 'npm run example:blocks',
      },
    ],
  },
];

// Kept as a compatibility export for users that imported the old gallery data.
export const BLOCK_GALLERY_BLOCKS = BLOCK_SCENARIOS[0].blocks;

export function createBlocksGalleryState() {
  return {
    scenarioIndex: 0,
    selectedIndex: 0,
    focus: 'map',
    isolated: false,
    responseScroll: 0,
    responseMetrics: { total: 0, visible: 1, ranges: [] },
    revealSelection: true,
    actionLog: [],
    copied: [],
    overlays: createOverlayManager(),
    status: 'Explore the response map, then open a block to inspect it in context.',
  };
}

export function createBlocksGalleryView({ state, width = 108, height = 30 } = {}) {
  normalizeState(state);
  const scenario = currentScenario(state);
  const block = currentBlock(state);
  const compact = width < 100;
  const stats = [
    { label: 'Scenario', value: `${state.scenarioIndex + 1}/${BLOCK_SCENARIOS.length}` },
    { label: 'Blocks', value: scenario.blocks.length },
    { label: 'Selected', value: `${state.selectedIndex + 1}/${scenario.blocks.length}` },
  ];
  const right = [
    { label: 'View', value: state.isolated ? 'isolated' : 'full response' },
  ];
  const activity = KeyHintBar({
    title: ' LOCAL HELP ',
    hints: contextHelp(state, block),
    adaptive: true,
    maxColumns: 4,
    minColumnWidth: 18,
    theme: EXAMPLE_THEME,
  });
  const footer = WorkspaceFooter({
    left: [state.status],
    right: [`scenario: ${scenario.id}`, `actions: ${state.actionLog.length}`],
    theme: EXAMPLE_THEME,
  });
  const { mainHeight } = resolveWorkspaceShellLayout({
    width,
    height,
    title: 'Structured Response Explorer',
    subtitle: 'understand how typed assistant blocks compose one useful answer',
    stats,
    right,
    focus: state.focus,
    activity,
    footer,
    theme: EXAMPLE_THEME,
    minMainHeight: 8,
  });

  const mapWidth = Math.min(38, Math.max(30, Math.floor(width * 0.31)));
  const responseWidth = Math.max(36, width - mapWidth - 2);
  const map = responseMapPane(state, scenario, mapWidth, mainHeight);
  const response = responseWorkspace(state, scenario, block, compact ? width : responseWidth, mainHeight);
  const main = compact
    ? (state.focus === 'map' ? map : response)
    : Row({ gap: 2, widths: [mapWidth, responseWidth], height: mainHeight }, map, response);

  const shell = WorkspaceShell({
    title: 'Structured Response Explorer',
    subtitle: 'understand how typed assistant blocks compose one useful answer',
    stats,
    right,
    focus: state.focus,
    main,
    activity,
    footer,
    height,
    theme: EXAMPLE_THEME,
  });
  const content = RequireViewport({
    width,
    height,
    minWidth: 64,
    minHeight: 20,
    title: 'Structured Response Explorer needs more room',
    message: 'Resize to at least 64×20 to keep block borders and the inspector readable.',
    theme: EXAMPLE_THEME,
    children: shell,
  });
  return OverlayHost({
    content,
    manager: state.overlays,
    theme: EXAMPLE_THEME,
    width,
    height,
    toastBottomMargin: 7,
  });
}

export function handleBlocksGalleryKey({ key, state }) {
  normalizeState(state);
  if (state.overlays.hasBlocking()) {
    state.overlays.handleKey(key, { state });
    return;
  }

  if (key.name === 'tab') {
    state.focus = state.focus === 'map' ? 'response' : 'map';
    state.status = `Focus moved to ${state.focus}.`;
    return;
  }
  if (key.name === 'escape') {
    if (state.isolated) {
      state.isolated = false;
      state.responseScroll = 0;
      state.revealSelection = true;
      state.focus = 'map';
      state.status = 'Returned to the full structured response.';
    } else if (state.focus === 'response') {
      state.focus = 'map';
      state.status = 'Returned to the response map.';
    }
    return;
  }
  if (key.name === '[' || (key.printable && key.text === '[')) return changeScenario(state, -1);
  if (key.name === ']' || (key.printable && key.text === ']')) return changeScenario(state, 1);
  if (key.printable && key.text === '?') return openHelp(state);

  if (isShiftLineScroll(key) && state.focus === 'response') {
    scrollResponse(state, key.name);
    return;
  }

  if (state.focus === 'map') {
    if (key.name === 'up') return selectBlock(state, state.selectedIndex - 1);
    if (key.name === 'down') return selectBlock(state, state.selectedIndex + 1);
    if (key.name === 'page-up') return selectBlock(state, state.selectedIndex - 3);
    if (key.name === 'page-down') return selectBlock(state, state.selectedIndex + 3);
    if (key.name === 'home') return selectBlock(state, 0);
    if (key.name === 'end') return selectBlock(state, currentScenario(state).blocks.length - 1);
    if (key.name === 'enter') return isolateSelectedBlock(state);
  } else if (isScrollKey(key.name)) {
    scrollResponse(state, key.name);
    return;
  }

  if (key.printable && key.text?.toLowerCase() === 'c') return copySelectedBlock(state);
  if (key.printable && key.text?.toLowerCase() === 'a') return requestApplyDiff(state);
  if (key.printable && key.text?.toLowerCase() === 'r') return requestRunCommand(state);
}

export function tickBlocksGallery({ state } = {}) {
  return Boolean(state?.overlays?.tick?.(0.25));
}

export function primaryBlockAction(block) {
  if (block?.type === 'diff') return 'Confirm a mock apply action';
  if (block?.type === 'command') return `Confirm a mock run of ${block.command}`;
  if (block?.type === 'code') return 'Copy the code payload (mock)';
  return `Inspect the ${block?.type ?? 'unknown'} payload in context`;
}

function responseMapPane(state, scenario, width, height) {
  const summaryRows = Math.max(2, Math.min(4, height - 9));
  const windowSize = Math.max(2, Math.floor((height - summaryRows - 4) / 2));
  return WorkspacePane({
    title: ` ${state.focus === 'map' ? '▶' : ' '} RESPONSE MAP · ${state.scenarioIndex + 1}/${BLOCK_SCENARIOS.length} `,
    active: state.focus === 'map',
    height,
    theme: EXAMPLE_THEME,
    pointerId: 'blocks:map',
    onClick: () => { state.focus = 'map'; },
    onWheel: (event) => {
      selectBlock(state, state.selectedIndex + (event.deltaY < 0 ? -1 : 1));
      event.preventDefault();
    },
    children: [
      Text(color(EXAMPLE_THEME, 'title', scenario.title), { wrap: false }),
      Text(color(EXAMPLE_THEME, 'textMuted', scenario.summary), { wrap: true }),
      SelectList({
        title: 'Ordered blocks',
        items: scenario.blocks,
        selectedIndex: state.selectedIndex,
        windowSize,
        getLabel: (block, index) => `${String(index + 1).padStart(2, '0')} ${block.type}`,
        getDescription: (block) => block.title || block.name || block.language || '',
        wrapItems: true,
        rowLines: 2,
        reserveItemLines: true,
        theme: EXAMPLE_THEME,
        pointerId: 'blocks:list',
        onSelect: (_block, index) => {
          state.focus = 'map';
          selectBlock(state, index);
        },
        onWheel: (event) => {
          selectBlock(state, state.selectedIndex + (event.deltaY < 0 ? -1 : 1));
          event.preventDefault();
        },
      }),
    ],
  });
}

function responseWorkspace(state, scenario, block, width, height) {
  const inspectorHeight = height >= 20 ? 9 : height >= 15 ? 7 : 6;
  const response = renderedResponsePane(state, scenario, width, Math.max(3, height - inspectorHeight));
  const inspector = blockInspectorPane(state, block, width, inspectorHeight);
  return Docked({
    height,
    content: response,
    footer: inspector,
    footerMinHeight: inspectorHeight,
    footerMaxHeight: inspectorHeight,
  });
}

function renderedResponsePane(state, scenario, width, height) {
  const innerWidth = Math.max(20, width - 4);
  const built = buildResponseRows(state, scenario, innerWidth);
  const visibleHeight = Math.max(2, height - 3);
  if (state.revealSelection && !state.isolated) {
    const range = built.ranges[state.selectedIndex];
    if (range) state.responseScroll = scrollToVisible(state.responseScroll, range.start, visibleHeight, built.rows.length);
    state.revealSelection = false;
  }
  const window = visibleScrollableRows(built.rows, {
    scroll: state.responseScroll,
    height: Math.max(2, height - 2),
    width: innerWidth,
    footer: true,
    footerLabel: state.isolated ? 'Esc full response · ↑/↓ scroll' : '↑/↓ line · PgUp/PgDn page',
  });
  state.responseScroll = window.scroll;
  state.responseMetrics = { total: built.rows.length, visible: Math.max(1, visibleHeight), ranges: built.ranges };
  return WorkspacePane({
    title: ` ${state.focus === 'response' ? '▶' : ' '} ${state.isolated ? 'ISOLATED BLOCK' : 'RENDERED RESPONSE'} `,
    active: state.focus === 'response',
    height,
    theme: EXAMPLE_THEME,
    pointerId: 'blocks:response',
    onClick: () => { state.focus = 'response'; },
    onWheel: (event) => {
      state.responseScroll = scrollOffset(
        state.responseScroll,
        wheelScrollDelta(event),
        state.responseMetrics.total,
        state.responseMetrics.visible,
      );
      state.revealSelection = false;
      state.focus = 'response';
      event.preventDefault();
    },
    children: window.rows.map((line) => Text(line, { wrap: false })),
  });
}

function buildResponseRows(state, scenario, width) {
  const rows = [
    color(EXAMPLE_THEME, 'assistant', `assistant ● ${scenario.title}`),
    color(EXAMPLE_THEME, 'textMuted', 'Typed blocks stay ordered inside one assistant message.'),
    '',
  ];
  const ranges = [];
  const entries = state.isolated
    ? [{ block: currentBlock(state), index: state.selectedIndex }]
    : scenario.blocks.map((block, index) => ({ block, index }));

  for (const { block, index } of entries) {
    const selected = index === state.selectedIndex;
    const title = `${selected ? '▶' : ' '} ${String(index + 1).padStart(2, '0')} ${block.type.toUpperCase()} · ${block.title || block.name || 'Untitled block'}`;
    const start = rows.length;
    rows.push(color(EXAMPLE_THEME, selected ? 'selected' : 'textMuted', fitInline(title, width)));
    const bodyWidth = Math.max(8, width - 2);
    for (const line of renderBlockLines({ block, width: bodyWidth, theme: themes.ocean })) {
      rows.push(fitInline(`  ${line}`, width));
    }
    rows.push('');
    ranges[index] = { start, end: rows.length - 1 };
  }
  return { rows, ranges };
}

function blockInspectorPane(state, block, width, height) {
  const payloadKeys = Object.keys(block ?? {}).filter((key) => !['purpose'].includes(key)).join(', ');
  const lastAction = state.actionLog.at(-1) ?? 'No simulated action yet.';
  const lines = [
    `Type        : ${block.type}`,
    `Payload     : ${payloadKeys}`,
    `Primary     : ${primaryBlockAction(block)}`,
    `Purpose     : ${block.purpose || 'Demonstrate a typed response block.'}`,
    `Last action : ${lastAction}`,
  ];
  return WorkspacePane({
    title: ' BLOCK INSPECTOR ',
    active: false,
    height,
    theme: EXAMPLE_THEME,
    children: lines.map((line, index) => Text(index < 2 ? fitInline(line, Math.max(20, width - 4)) : line, { wrap: index >= 2 })),
  });
}

function selectBlock(state, index) {
  const blocks = currentScenario(state).blocks;
  state.selectedIndex = Math.max(0, Math.min(blocks.length - 1, index));
  state.isolated = false;
  state.revealSelection = true;
  state.status = `Selected ${blocks[state.selectedIndex].type} block ${state.selectedIndex + 1}/${blocks.length}.`;
}

function isolateSelectedBlock(state) {
  state.isolated = true;
  state.focus = 'response';
  state.responseScroll = 0;
  state.revealSelection = false;
  state.status = `Opened ${currentBlock(state).type} block in isolation. Esc returns to the full response.`;
}

function changeScenario(state, delta) {
  state.scenarioIndex = mod(state.scenarioIndex + delta, BLOCK_SCENARIOS.length);
  state.selectedIndex = 0;
  state.focus = 'map';
  state.isolated = false;
  state.responseScroll = 0;
  state.revealSelection = true;
  state.status = `Loaded scenario: ${currentScenario(state).title}.`;
}

function scrollResponse(state, keyName) {
  const { total, visible } = state.responseMetrics;
  if (keyName === 'home') state.responseScroll = 0;
  else if (keyName === 'end') state.responseScroll = Math.max(0, total - visible);
  else {
    const delta = keyName === 'up' ? -1 : keyName === 'down' ? 1 : keyName === 'page-up' ? -visible : visible;
    state.responseScroll = scrollOffset(state.responseScroll, delta, total, visible);
  }
  state.revealSelection = false;
  state.status = `Response scroll ${state.responseScroll + 1}/${Math.max(1, total)}.`;
}

function copySelectedBlock(state) {
  const block = currentBlock(state);
  const value = block.command || block.content || block.title || block.type;
  state.copied.push(value);
  recordAction(state, `Copied ${block.type} payload (mock).`);
  state.overlays.toast(`Copied ${block.type} block payload.`, 'success', 3);
}

function requestApplyDiff(state) {
  const block = currentBlock(state);
  if (block.type !== 'diff') {
    state.overlays.toast('Apply is available only for diff blocks.', 'warning', 3);
    state.status = 'Select a diff block before using A.';
    return;
  }
  state.overlays.confirm({
    title: ' Apply diff? ',
    message: 'This demo will only record the action. No project files will be changed.',
    confirmLabel: 'Record apply',
    cancelLabel: 'Cancel',
    onConfirm: () => {
      recordAction(state, `Recorded mock apply for ${block.title}.`);
      state.overlays.toast('Mock diff apply recorded.', 'success', 3);
    },
    onCancel: () => { state.status = 'Diff apply cancelled.'; },
  });
}

function requestRunCommand(state) {
  const block = currentBlock(state);
  if (block.type !== 'command') {
    state.overlays.toast('Run is available only for command blocks.', 'warning', 3);
    state.status = 'Select a command block before using R.';
    return;
  }
  state.overlays.confirm({
    title: ' Run command? ',
    message: `${block.command}\n\nThis demo records the choice but does not execute external processes.`,
    confirmLabel: 'Record run',
    cancelLabel: 'Cancel',
    onConfirm: () => {
      recordAction(state, `Recorded mock run: ${block.command}`);
      state.overlays.toast('Mock command run recorded.', 'success', 3);
    },
    onCancel: () => { state.status = 'Command run cancelled.'; },
  });
}

function openHelp(state) {
  state.overlays.help({
    title: ' Structured Response Explorer Help ',
    children: [
      'Tab switches between the response map and the rendered response.',
      'Up/Down selects blocks in the map or scrolls the response.',
      'Enter isolates the selected block. Esc returns one level.',
      '[ and ] switch complete response scenarios.',
      'C copies a payload; A applies diffs; R runs commands. All actions are simulated.',
    ],
  });
}

function contextHelp(state, block) {
  if (state.focus === 'map') {
    return [
      ['↑/↓', 'select block'],
      ['PgUp/PgDn', 'jump three'],
      ['Enter', 'open isolated'],
      ['[/]', 'change scenario'],
      ['Tab', 'focus response'],
      ['?', 'help'],
    ];
  }
  const hints = [
    ['↑/↓', 'scroll line'],
    ['PgUp/PgDn', 'scroll page'],
    ['Home/End', 'top/bottom'],
    ['Esc', state.isolated ? 'full response' : 'response map'],
    ['Tab', 'focus map'],
    ['C', 'copy mock'],
  ];
  if (block.type === 'diff') hints.push(['A', 'apply mock']);
  if (block.type === 'command') hints.push(['R', 'run mock']);
  return hints;
}

function recordAction(state, action) {
  state.actionLog.push(action);
  if (state.actionLog.length > 20) state.actionLog = state.actionLog.slice(-20);
  state.status = action;
}

function normalizeState(state) {
  if (!state.overlays) state.overlays = createOverlayManager();
  state.scenarioIndex = Math.max(0, Math.min(BLOCK_SCENARIOS.length - 1, Number(state.scenarioIndex) || 0));
  const blocks = currentScenario(state).blocks;
  state.selectedIndex = Math.max(0, Math.min(blocks.length - 1, Number(state.selectedIndex) || 0));
  if (!['map', 'response'].includes(state.focus)) state.focus = 'map';
  if (!state.responseMetrics) state.responseMetrics = { total: 0, visible: 1, ranges: [] };
  if (!Array.isArray(state.actionLog)) state.actionLog = [];
  if (!Array.isArray(state.copied)) state.copied = [];
}

function currentScenario(state) {
  return BLOCK_SCENARIOS[state.scenarioIndex] ?? BLOCK_SCENARIOS[0];
}

function currentBlock(state) {
  const scenario = currentScenario(state);
  return scenario.blocks[state.selectedIndex] ?? scenario.blocks[0];
}

function isScrollKey(name) {
  return ['up', 'down', 'page-up', 'page-down', 'home', 'end'].includes(name);
}

function mod(value, size) {
  return ((value % size) + size) % size;
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Structured Response Explorer',
    state: createBlocksGalleryState(),
    render: createBlocksGalleryView,
    onKey: handleBlocksGalleryKey,
    onTick: tickBlocksGallery,
    tickMs: 250,
  });
}
