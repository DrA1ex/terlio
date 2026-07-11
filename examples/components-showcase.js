#!/usr/bin/env node
import {
  Badge,
  Column,
  KeyValueBlock,
  MetricBlock,
  Panel,
  ProgressBar,
  RequireViewport,
  Row,
  SectionTabs,
  Text,
  Timeline,
  WorkspaceFooter,
  WorkspacePane,
  WorkspaceShell,
  color,
  createFrame,
  diffFrames,
  renderToString,
  themes,
} from '../src/lib/index.js';
import { isDirectRun } from './_demoRuntime.js';

const DEFAULT_WIDTH = 88;
const DEFAULT_HEIGHT = 22;
const MIN_WIDTH = 80;
const MIN_HEIGHT = 22;
const THEME = themes.ocean;

const LAYERS = [
  { id: 'layout', label: 'Layout' },
  { id: 'state', label: 'State' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'runtime', label: 'Runtime' },
];

const COMPOSITION_STAGES = [
  ['✓', 'Compose', 'shell + panes'],
  ['✓', 'Model', 'semantic model'],
  ['✓', 'Present', 'status + UI'],
  ['●', 'Render', 'fixed frame'],
  ['·', 'Patch', 'changed rows'],
];

const ACTIVITY = [
  { id: 'evt_layout', time: '2026-07-11T09:31:00.000Z', type: 'layout', text: 'responsive columns resolved' },
  { id: 'evt_view', time: '2026-07-11T09:31:01.000Z', type: 'view', text: 'component tree rendered' },
  { id: 'evt_patch', time: '2026-07-11T09:31:02.000Z', type: 'runtime', text: 'three terminal rows patched' },
];

export function createComponentsShowcaseView({ width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = {}) {
  const safeWidth = Math.max(1, Number(width) || DEFAULT_WIDTH);
  const safeHeight = Math.max(1, Number(height) || DEFAULT_HEIGHT);
  const mode = resolveMode(safeWidth);
  const { previous, next, operations } = createRuntimeFrames();

  const shell = WorkspaceShell({
    title: 'Component Composition Snapshot',
    subtitle: 'Static release-readiness report',
    stats: headerStats({ width: safeWidth, height: safeHeight, mode }),
    right: headerRight({ width: safeWidth, operations }),
    focus: safeWidth >= 112 ? 'static report' : '',
    main: compositionMain({ width: safeWidth, mode, previous, next, operations }),
    footer: WorkspaceFooter({
      left: ['one-shot', 'no TTY', 'redirect-safe'],
      right: safeWidth >= 112 ? [`${operations.length} changed rows`, 'fixed frame'] : [`${operations.length} row patches`],
      theme: THEME,
    }),
    height: safeHeight,
    theme: THEME,
  });

  return RequireViewport({
    width: safeWidth,
    height: safeHeight,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: 'Component snapshot needs more room',
    message: 'Resize the terminal or render with a larger width and height.',
    theme: THEME,
    children: shell,
  });
}

export function renderComponentsShowcase({ width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT } = {}) {
  return renderToString(createComponentsShowcaseView({ width, height }), { width, height });
}

export function createDiffShowcase() {
  const previous = createFrame(['status: idle', 'assistant: Hel', 'footer: frame 1'], { width: 24, height: 3 });
  const next = createFrame(['status: streaming', 'assistant: Hello', 'footer: frame 2'], { width: 24, height: 3 });
  return diffFrames(previous, next);
}

function compositionMain({ width, mode, previous, next, operations }) {
  const metrics = Row({ gap: 1, distribute: true },
    MetricBlock({ title: ' Build ', value: 'passed', detail: 'view tree' }),
    MetricBlock({ title: ' Contract ', value: 'stable', detail: 'fixed frame' }),
    MetricBlock({ title: ' Writes ', value: `${operations.length} rows`, detail: 'diff patch' }),
    MetricBlock({ title: ' Runtime ', value: '0 deps', detail: 'Node only' }),
  );

  const body = mode === 'wide'
    ? wideComposition({ width, previous, next, operations })
    : compactComposition({ width, previous, next, operations });

  return Column({ height: 'fill' }, metrics, withGrow(body));
}

function wideComposition({ width, previous, next, operations }) {
  const available = Math.max(1, width - 4);
  const mapWidth = Math.max(28, Math.floor(available * 0.25));
  const runtimeWidth = Math.max(34, Math.floor(available * 0.30));
  const surfaceWidth = Math.max(36, available - mapWidth - runtimeWidth);

  return Row({ gap: 2, widths: [mapWidth, surfaceWidth, runtimeWidth], height: 'fill' },
    compositionMapPane({ wide: true }),
    productSurfacePane({ detailed: true }),
    runtimeContractPane({ previous, next, operations, detailed: true }),
  );
}

function compactComposition({ width, previous, next, operations }) {
  const mapWidth = Math.max(27, Math.min(34, Math.floor(width * 0.36)));
  const detailWidth = Math.max(1, width - mapWidth - 2);
  return Row({ gap: 2, widths: [mapWidth, detailWidth], height: 'fill' },
    compositionMapPane({ wide: false }),
    combinedSurfacePane({ previous, next, operations }),
  );
}

function compositionMapPane({ wide = false } = {}) {
  return WorkspacePane({
    title: ' COMPOSITION MAP ',
    active: true,
    height: 'fill',
    theme: THEME,
    children: [
      wide
        ? SectionTabs({ tabs: LAYERS, active: 'runtime', gap: 1, theme: THEME })
        : Text(color(THEME, 'textMuted', 'Layout → State → Feedback → Runtime')),
      Text(color(THEME, 'textMuted', 'One coherent flow from intent to terminal patch.')),
      ...COMPOSITION_STAGES.map(([marker, title, detail]) => Text(
        `${color(THEME, marker === '●' ? 'textAccent' : marker === '✓' ? 'success' : 'textMuted', marker)} `
        + `${color(THEME, 'title', title.padEnd(8))} ${color(THEME, 'textMuted', detail)}`,
        { wrap: false },
      )),
      Text(''),
      Text(color(THEME, 'textMuted', 'The example is static, but every region is rendered by the same components used in interactive apps.')),
    ],
  });
}

function productSurfacePane({ detailed = false } = {}) {
  return WorkspacePane({
    title: ' PRODUCT SURFACE ',
    height: 'fill',
    theme: THEME,
    children: [
      Text(color(THEME, 'title', 'Release candidate · terminal-ui 0.1.0')),
      Row({ gap: 1 },
        Badge({ label: 'ready', tone: 'success', variant: 'filled', theme: THEME }),
        Badge({ label: 'ANSI-aware', tone: 'info', variant: 'subtle', theme: THEME }),
        Badge({ label: 'zero-dependency', tone: 'muted', variant: 'outline', theme: THEME }),
      ),
      ProgressBar({ value: 92, total: 100, width: detailed ? 28 : 18, label: 'readiness' }),
      KeyValueBlock({
        title: ' Semantic contract ',
        rows: [
          ['surface', 'WorkspacePane'],
          ['state', 'semantic status'],
          ['layout', 'responsive'],
          ['output', 'fixed frame'],
        ],
      }),
      detailed ? Timeline({ title: ' Render activity ', events: ACTIVITY, limit: 3 }) : null,
    ],
  });
}

function runtimeContractPane({ previous, next, operations, detailed = false }) {
  const changedRows = operations.map((item) => item.row).join(', ');
  return WorkspacePane({
    title: ' RUNTIME CONTRACT ',
    height: 'fill',
    theme: THEME,
    children: [
      detailed
        ? Column(
          framePanel('Previous', previous),
          framePanel('Next', next),
        )
        : Row({ gap: 1, distribute: true },
          framePanel('Previous', previous),
          framePanel('Next', next),
        ),
      KeyValueBlock({
        title: ' Patch plan ',
        rows: [
          ['changed rows', changedRows],
          ['row writes', operations.length],
          ['full repaint', 'avoided'],
          ['benefit', detailed ? 'less flicker + stable cursor' : 'stable cursor'],
        ],
      }),
    ],
  });
}

function combinedSurfacePane({ previous, next, operations }) {
  return WorkspacePane({
    title: ' COMPOSED SURFACE + RUNTIME ',
    height: 'fill',
    theme: THEME,
    children: [
      Row({ gap: 1 },
        Badge({ label: 'ready', tone: 'success', variant: 'filled', theme: THEME }),
        Badge({ label: 'static', tone: 'info', variant: 'subtle', theme: THEME }),
        Badge({ label: '0 deps', tone: 'muted', variant: 'outline', theme: THEME }),
      ),
      ProgressBar({ value: 92, total: 100, width: 20, label: 'readiness' }),
      Row({ gap: 1, distribute: true },
        framePanel('Previous', previous),
        framePanel('Next', next),
      ),
      Text(color(THEME, 'textMuted', `${operations.length} changed rows · full repaint avoided · output remains deterministic`)),
    ],
  });
}

function headerStats({ width, height, mode }) {
  if (width < 96) return [
    { label: 'Theme', value: THEME.name },
    { label: 'Viewport', value: `${width}×${height}` },
  ];
  return [
    { label: 'Theme', value: THEME.name },
    { label: 'Mode', value: mode },
    { label: 'Viewport', value: `${width}×${height}` },
  ];
}

function headerRight({ width, operations }) {
  if (width < 112) return [{ label: 'Patch', value: operations.length }];
  return [
    { label: 'Patches', value: operations.length },
    { label: 'Dependencies', value: 0 },
  ];
}

function createRuntimeFrames() {
  const previous = createFrame([
    'state  idle',
    'text   Hel',
    'frame  1',
  ], { width: 20, height: 3 });
  const next = createFrame([
    'state  stream',
    'text   Hello',
    'frame  2',
  ], { width: 20, height: 3 });
  return { previous, next, operations: diffFrames(previous, next) };
}

function framePanel(title, frame) {
  return Panel(` ${title} `, ...frame.toLines().map((line) => Text(line, { wrap: false })));
}

function withGrow(node) {
  return node && typeof node === 'object'
    ? { ...node, props: { ...(node.props || {}), grow: true, height: 'fill' } }
    : node;
}

function resolveMode(width) {
  if (width >= 132) return 'wide';
  if (width >= 88) return 'medium';
  return 'compact';
}

if (isDirectRun(import.meta.url)) {
  const width = Math.max(MIN_WIDTH, Number(process.stdout.columns) || 112);
  const height = Math.max(MIN_HEIGHT, Math.min(34, Number(process.stdout.rows) || 30));
  console.log(renderComponentsShowcase({ width, height }));
}
