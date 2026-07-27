import {
  Badge,
  BottomOverlay,
  Box,
  ChatHeader,
  ChatScreen,
  ChatTranscript,
  Chip,
  ChipLine,
  Column,
  CommandBar,
  ConfirmPrompt,
  DebugPanel,
  Docked,
  FooterStatusBar,
  Grid,
  HelpOverlay,
  InputBar,
  KeyHintBar,
  KeyValueBlock,
  LiveJobBlock,
  MetricBlock,
  Modal,
  OverlayHost,
  PalettePanel,
  Panel,
  PointerRegion,
  ProgressBar,
  ProgressStatus,
  PropertyRows,
  RequireViewport,
  Row,
  ScrollPane,
  ScrollView,
  SectionTabs,
  SelectableText,
  SelectList,
  Spinner,
  SplitPane,
  StatusBar,
  SuggestionsPanel,
  SummaryList,
  SyntaxText,
  Text,
  TextEditorView,
  Timeline,
  Toast,
  WorkspaceCommandBar,
  WorkspaceFooter,
  WorkspaceHeader,
  WorkspacePane,
  WorkspaceShell,
  WorkspaceTabs,
  createCommandPaletteState,
  createMessage,
  createOverlayManager,
  createScrollState,
  createTextSelectionState,
  TerminalInputDecoder,
  themes,
} from '../../src/lib/index.js';
import { createInteractionKitState, createInteractionKitView, handleInteractionKitKey } from '../../examples/interaction-kit.js';
import { createSyntaxHighlightingView } from '../../examples/syntax-highlighting.js';

export const VISUAL_COMPONENTS = Object.freeze([
  'Text', 'Box', 'Panel', 'Row', 'Column', 'PointerRegion',
  'SplitPane', 'Docked', 'ScrollView', 'BottomOverlay', 'RequireViewport',
  'SelectList', 'ConfirmPrompt', 'Modal', 'Toast', 'ProgressBar', 'ProgressStatus', 'Spinner',
  'HelpOverlay', 'Badge', 'Chip', 'SectionTabs', 'CommandBar', 'FooterStatusBar',
  'Grid', 'PropertyRows', 'ChipLine', 'TextEditorView', 'ScrollPane',
  'SelectableText', 'SyntaxText', 'ChatScreen', 'ChatHeader', 'ChatTranscript',
  'SuggestionsPanel', 'PalettePanel', 'DebugPanel', 'StatusBar', 'InputBar',
  'Timeline', 'MetricBlock', 'KeyValueBlock', 'LiveJobBlock', 'WorkspaceHeader',
  'WorkspaceTabs', 'WorkspacePane', 'KeyHintBar', 'WorkspaceCommandBar',
  'WorkspaceFooter', 'WorkspaceShell', 'SummaryList', 'OverlayHost',
]);

const noop = () => true;
const ocean = themes.ocean;
const amber = themes.amber;
const dark = themes.dark;

const messages = [
  createMessage({ role: 'user', content: 'Can you review the retry loop and keep the output concise?' }),
  createMessage({
    role: 'assistant',
    blocks: [
      { type: 'text', content: 'The retry loop should cap attempts and preserve the original error.' },
      { type: 'code', language: 'javascript', filename: 'retry.js', syntaxHighlight: true, content: "for (let attempt = 0; attempt < 3; attempt += 1) {\n  await run();\n}" },
      { type: 'warning', title: 'Watch out', content: 'Do not retry non-idempotent operations automatically.' },
    ],
    status: 'complete',
  }),
];

const selection = createTextSelectionState({
  anchor: { x: 4, y: 1 },
  focus: { x: 16, y: 2 },
  text: 'selected text',
});

const palette = createCommandPaletteState({
  items: [
    { id: 'session.new', title: 'New session', description: 'Create a clean session', category: 'Session', keys: ['Ctrl+N'] },
    { id: 'theme.next', title: 'Next theme', description: 'Cycle through themes', category: 'Appearance' },
    { id: 'danger.disabled', title: 'Unavailable action', description: 'Disabled in this state', category: 'Actions', disabled: true },
  ],
  query: '',
  selectedIndex: 1,
  windowSize: 5,
});

function overlayManager() {
  const manager = createOverlayManager();
  manager.modal({
    title: 'Responsive details',
    render: ({ width, height }) => Modal({
      title: ' Dynamic modal ',
      children: [
        `Available ${width}×${height}`,
        'The background remains visible but blocked.',
      ],
      footer: 'Esc close · Enter accept',
    }),
  });
  manager.toast('Saved snapshot', 'success', 3, 'The golden file is ready for review.');
  return manager;
}

export const INTERFACE_SCENARIOS = Object.freeze([
  {
    id: 'primitives-layout',
    title: 'Primitive composition and pointer surface',
    width: 64,
    height: 12,
    covers: ['Text', 'Box', 'Panel', 'Row', 'Column', 'PointerRegion'],
    render: () => Column({ height: 12 },
      Panel(' Primitives ',
        Row({ gap: 2, widths: [18, 18, 18] },
          Box({ border: true, title: ' Left ', padding: 1 }, Text('alpha'), Text('beta')),
          PointerRegion({ pointerId: 'primitive-action', pointerWidth: 'fill', onClick: noop },
            Box({ border: true, title: ' Pointer ', padding: 1 }, Text('clickable')),
          ),
          Box({ border: false, padding: 1 }, Text('plain box')),
        ),
      ),
      Text('Footer text without wrapping', { wrap: false }),
    ),
  },
  {
    id: 'responsive-layouts',
    title: 'Split, docked, bottom overlay and viewport guard',
    width: 72,
    height: 18,
    covers: ['SplitPane', 'Docked', 'BottomOverlay', 'RequireViewport'],
    render: () => BottomOverlay({
      height: 18,
      bottom: 1,
      left: 18,
      right: 2,
      width: 40,
      align: 'right',
      content: Docked({
        height: 18,
        gap: 1,
        content: SplitPane({
          height: 13,
          focus: 'left',
          theme: ocean,
          panes: [
            { id: 'left', min: 22, grow: 1, node: WorkspacePane({ title: ' Left ', active: true, theme: ocean, children: [Text('Primary content'), Text('Second row')] }) },
            { id: 'right', size: 26, node: WorkspacePane({ title: ' Right ', theme: ocean, children: [RequireViewport({ width: 20, height: 6, minWidth: 30, minHeight: 8, title: 'Resize', message: 'This pane needs more room.', theme: ocean })] }) },
          ],
        }),
        footer: Text('Docked footer remains visible.'),
      }),
      overlay: Box({ border: true, title: ' Bottom overlay ', padding: { left: 1, right: 1 } }, Text('Autocomplete overlays content.')),
    }),
  },
  {
    id: 'select-list-rich',
    title: 'SelectList presentation, disabled and dynamic rows',
    width: 58,
    height: 16,
    covers: ['SelectList'],
    render: () => SelectList({
      title: 'Project summary',
      theme: ocean,
      selectedIndex: 4,
      windowSize: 7,
      maxItemLines: 3,
      getDisabledIndicator: (item) => item.reason ? 'LOCKED' : '',
      items: [
        { kind: 'heading', label: 'Overview' },
        { kind: 'stat', label: 'Files', value: '128 changed' },
        { kind: 'separator', label: 'Actions' },
        { label: 'Run quick checks', description: 'lint and unit tests' },
        { label: 'Review a deliberately long item label that wraps only when the available width is insufficient', description: 'dynamic height' },
        { label: 'Publish release', description: 'requires maintainer access', disabled: true, reason: true },
        { kind: 'separator' },
      ],
      onSelect: noop,
      onWheel: noop,
    }),
  },
  {
    id: 'feedback-components',
    title: 'Feedback and progress states',
    width: 72,
    height: 20,
    covers: ['ConfirmPrompt', 'Modal', 'Toast', 'ProgressBar', 'ProgressStatus', 'Spinner', 'HelpOverlay'],
    render: () => Column({ height: 20 },
      Row({ gap: 2, widths: [34, 36] },
        ConfirmPrompt({ message: 'Apply generated patch?', selected: 'cancel', confirmLabel: 'Apply', cancelLabel: 'Review' }),
        Modal({ title: ' Details ', children: ['Validation passed.', '3 files changed.'], footer: 'Esc close' }),
      ),
      Row({ gap: 2, widths: [34, 36] },
        Column(
          Spinner({ frame: 3, label: 'Indexing workspace' }),
          ProgressBar({ value: 63, total: 100, width: 18, label: 'Coverage' }),
          ProgressStatus({ progress: { value: 42, total: 80, state: 'running', elapsedMs: 12000, rate: 3.5, etaMs: 10857, unit: 'files' }, width: 15, label: 'Batch', showState: false, showElapsed: false, showEta: false }),
        ),
        HelpOverlay({ shortcuts: [['↑/↓', 'move'], ['Enter', 'accept'], ['Esc', 'close']] }),
      ),
      Toast({ level: 'warning', message: 'Connection is slow', detail: 'Retrying with backoff', theme: amber, width: 68 }),
    ),
  },
  {
    id: 'display-components',
    title: 'Badges, chips, tabs, command and property display',
    width: 78,
    height: 14,
    covers: ['Badge', 'Chip', 'SectionTabs', 'CommandBar', 'FooterStatusBar', 'Grid', 'PropertyRows', 'ChipLine'],
    render: () => Column({ height: 14 },
      Row({ gap: 2 },
        Badge({ label: 'READY', tone: 'success', theme: ocean }),
        Badge({ label: 'LOCAL', tone: 'info', theme: ocean }),
        Chip({ label: 'Streaming', active: true, tone: 'warning', theme: amber }),
        Chip({ label: 'Static', active: false, theme: ocean }),
      ),
      SectionTabs({ tabs: [{ id: 'overview', label: 'Overview', icon: '1' }, { id: 'logs', label: 'Logs' }, { id: 'settings', label: 'Settings' }], active: 'logs', theme: ocean, onSelect: noop }),
      ChipLine({ label: 'Mode', chips: ['safe', 'fast', 'verbose'], active: 'safe', theme: ocean, onSelect: noop }),
      CommandBar({ value: 'deploy', suggestions: ['staging', 'production'], mode: 'COMMAND', theme: ocean }),
      Row({ gap: 2, widths: [38, 38] },
        Grid({ columns: 2, border: true, items: [['Enter', 'open'], ['Esc', 'back'], ['/', 'command'], ['?', 'help']] }),
        PropertyRows({ title: ' Properties ', rows: [['theme', 'ocean'], ['provider', 'mock'], ['rows', 14]], theme: ocean }),
      ),
      FooterStatusBar({ left: ['ready', 'clean'], right: ['78×14', 'mock'], theme: ocean }),
    ),
  },
  {
    id: 'editor-scroll-selection',
    title: 'Editor, scroll pane and persistent selection',
    width: 76,
    height: 18,
    covers: ['TextEditorView', 'ScrollPane', 'SelectableText'],
    render: () => Row({ height: 18, gap: 2, widths: [37, 37] },
      TextEditorView({
        title: ' Draft ',
        value: 'First line\nSecond line with a cursor and wrapping behavior.\nThird line',
        cursor: 31,
        width: 37,
        height: 14,
        lineNumbers: true,
      }),
      ScrollPane({
        title: ' Long output ',
        lines: Array.from({ length: 24 }, (_, index) => `row ${String(index + 1).padStart(2, '0')} · deterministic output`),
        width: 37,
        height: 18,
        scroll: 7,
        footer: true,
        selection,
        onWheel: noop,
        onCopy: () => ({ copied: true }),
      }),
    ),
  },
  {
    id: 'syntax-text',
    title: 'Zero-dependency syntax highlighting',
    width: 72,
    height: 12,
    covers: ['SyntaxText'],
    render: () => Box({ border: true, padding: 1, title: ' Syntax · main.swift ' },
      SyntaxText({
        filename: 'main.swift',
        theme: dark,
        code: 'import Foundation\n\nstruct User {\n  let name: String\n}\n\nprint(User(name: "Ada"))',
      }),
    ),
  },
  {
    id: 'syntax-highlighting-window',
    title: 'Complete syntax highlighting example window',
    width: 112,
    height: 30,
    covers: ['SyntaxText', 'WorkspacePane', 'WorkspaceShell'],
    render: () => createSyntaxHighlightingView({ width: 112, height: 30 }),
  },
  {
    id: 'workspace-shell-wide',
    title: 'Complete workspace shell',
    width: 112,
    height: 26,
    covers: ['WorkspaceHeader', 'WorkspaceTabs', 'WorkspacePane', 'KeyHintBar', 'WorkspaceCommandBar', 'WorkspaceFooter', 'WorkspaceShell', 'SummaryList'],
    render: () => WorkspaceShell({
      title: 'Release Workspace',
      subtitle: 'v1.2.0 verification',
      stats: [{ label: 'Tests', value: '269' }, { label: 'Coverage', value: '97%' }],
      right: ['branch main', 'clean'],
      focus: 'changes',
      tabs: [{ id: 'changes', label: 'Changes' }, { id: 'checks', label: 'Checks' }, { id: 'release', label: 'Release' }],
      activeTab: 'changes',
      tabHint: 'Click a tab or use the keyboard.',
      theme: ocean,
      height: 26,
      main: SplitPane({
        height: 12,
        focus: 'summary',
        theme: ocean,
        panes: [
          { id: 'summary', min: 34, grow: 1, node: SummaryList({ title: ' Summary ', selectedIndex: 1, items: ['README updated', 'Security plan added', 'Package verified'] }) },
          { id: 'details', min: 48, grow: 2, node: WorkspacePane({ title: ' Details ', theme: ocean, children: [Text('Selected change details'), Text('No unexpected files detected.')] }) },
        ],
      }),
      command: WorkspaceCommandBar({ value: 'release verify', suggestions: ['verify', 'pack', 'publish'], theme: ocean }),
      activity: KeyHintBar({ title: ' Keys ', adaptive: true, hints: [['↑/↓', 'move'], ['Enter', 'open'], ['Esc', 'back'], ['?', 'help']], theme: ocean }),
      footer: WorkspaceFooter({ left: ['ready', 'safe mode'], right: ['112×26', 'local'], theme: ocean }),
    }),
  },
  {
    id: 'live-and-timeline',
    title: 'Timeline and live status blocks',
    width: 78,
    height: 17,
    covers: ['Timeline', 'MetricBlock', 'KeyValueBlock', 'LiveJobBlock'],
    render: () => Column({ height: 17 },
      Row({ gap: 2, widths: [25, 25, 26] },
        MetricBlock({ title: ' Throughput ', value: '1,284', detail: 'events/min', status: 'healthy', pulse: true }),
        KeyValueBlock({ title: ' Details ', rows: [['branch', 'main'], ['commit', 'a1b2c3d'], ['owner', 'team']] }),
        LiveJobBlock({ title: ' Publish ', status: 'running', running: true, activeIndex: 1, progress: 42, frame: 2, steps: ['Build package', 'Run checks', 'Publish'] }),
      ),
      Timeline({
        limit: 4,
        events: [
          { type: 'build_started', text: 'Build started', time: '2026-07-25T10:00:00' },
          { type: 'tests_passed', text: 'All tests passed', time: '2026-07-25T10:01:00' },
          { type: 'package_ready', text: 'Tarball created', time: '2026-07-25T10:02:00' },
        ],
      }),
    ),
  },
  {
    id: 'overlay-host',
    title: 'Blocking modal with toast stack',
    width: 80,
    height: 22,
    covers: ['OverlayHost'],
    render: () => OverlayHost({
      width: 80,
      height: 22,
      theme: ocean,
      manager: overlayManager(),
      toastBottomMargin: 2,
      content: WorkspacePane({ title: ' Background ', active: true, theme: ocean, children: [Text('Background content'), Text('Pointer regions are blocked by the modal.')] }),
    }),
  },
  {
    id: 'chat-subcomponents',
    title: 'Chat header, transcript and composer pieces',
    width: 92,
    height: 24,
    covers: ['ChatHeader', 'ChatTranscript', 'SuggestionsPanel', 'DebugPanel', 'StatusBar', 'InputBar'],
    render: () => Column({ height: 24 },
      ChatHeader({ columns: 92, theme: dark, themeName: 'dark', providerName: 'mock', sessionId: 'session_abcdef', sessionTitle: 'Interface snapshot review', activeSkills: ['code', 'terminal'], pointerActive: true }),
      Box({ border: true, title: ' Transcript helper ', height: 7 },
        ChatTranscript({ columns: 88, height: 5, messages, theme: dark, syntaxHighlight: true }).node,
      ),
      SuggestionsPanel({ columns: 92, height: 5, theme: dark, suggestions: [
        { label: '/help', detail: '/help', description: 'Show commands', insert: '/help' },
        { label: '/theme', detail: '/theme ocean', description: 'Switch theme', insert: '/theme ' },
      ], suggestionIndex: 1, onSuggestionSelect: noop, onSuggestionWheel: noop, onSuggestionDismiss: noop }),
      DebugPanel({ columns: 92, height: 4, theme: dark, debug: { enabled: true, events: [{ type: 'pointer', detail: 'wheel-down' }, { type: 'key', detail: 'enter' }] } }),
      StatusBar({ columns: 92, theme: dark, status: 'Snapshot ready.', busy: false, scrollOffset: 3, debug: { enabled: true }, providerName: 'mock' }),
      InputBar({ columns: 92, height: 5, theme: dark, inputValue: '/theme ocean', inputCursor: 7 }),
    ),
  },
  {
    id: 'chat-palette-panel',
    title: 'Standalone command palette panel',
    width: 88,
    height: 18,
    covers: ['PalettePanel'],
    render: () => PalettePanel({ columns: 88, rows: 22, palette, theme: dark, onPaletteSelect: noop, onPaletteWheel: noop, onPaletteDismiss: noop }),
  },
  {
    id: 'chat-screen-full',
    title: 'Complete chat screen with autocomplete overlay',
    width: 100,
    height: 26,
    covers: ['ChatScreen'],
    render: () => ChatScreen({
      columns: 100,
      rows: 26,
      theme: dark,
      themeName: 'dark',
      providerName: 'mock',
      sessionId: 'session_snapshot',
      sessionTitle: 'Golden interface verification',
      activeSkills: ['code', 'terminal'],
      messages,
      syntaxHighlight: true,
      inputValue: '/he',
      inputCursor: 3,
      suggestionsVisible: true,
      suggestions: [
        { label: '/help', detail: '/help', description: 'Show command help', insert: '/help' },
        { label: '/history', detail: '/history', description: 'Browse sessions', insert: '/history' },
      ],
      suggestionIndex: 0,
      status: 'Ready.',
      pointerActive: true,
      transcriptSelection: createTextSelectionState(),
      onTranscriptWheel: noop,
      onTranscriptCopy: () => ({ copied: true }),
      onSuggestionSelect: noop,
      onSuggestionWheel: noop,
      onSuggestionDismiss: noop,
    }),
  },
  {
    id: 'chat-screen-compact',
    title: 'Compact chat screen and viewport prioritization',
    width: 64,
    height: 18,
    covers: ['ChatScreen'],
    render: () => ChatScreen({
      columns: 64,
      rows: 18,
      theme: ocean,
      themeName: 'ocean',
      providerName: 'mock',
      sessionId: 'compact',
      sessionTitle: 'Compact layout',
      messages,
      inputValue: '',
      status: 'Compact.',
      pointerActive: false,
      transcriptSelection: createTextSelectionState(),
    }),
  },
  {
    id: 'adaptive-select-list',
    title: 'Adaptive one-line and wrapped list rows',
    width: 76,
    height: 18,
    covers: ['SelectList', 'WorkspacePane'],
    render: () => WorkspacePane({
      title: ' ADAPTIVE LIST ',
      height: 18,
      theme: ocean,
      children: [SelectList({
        title: 'Entries',
        height: 'fill',
        windowSize: 'auto',
        selectedIndex: 3,
        maxItemLines: 2,
        wrapItems: true,
        theme: ocean,
        pointerId: 'adaptive-list',
        onSelect: noop,
        onWheel: noop,
        items: [
          { label: 'Overview', description: 'fits on one line' },
          { label: 'Progress and Live Jobs', description: 'feedback' },
          { label: 'Scrollable Surfaces', description: 'navigation' },
          { label: 'A deliberately longer showcase entry that wraps only when the available width requires it', description: 'responsive row height' },
          { label: 'Progress Status and Batching', description: 'controller demo' },
          { label: 'Themes', description: 'appearance' },
        ],
      })],
      footer: '4/6 · Enter preview',
    }),
  },
  {
    id: 'responsive-key-hints',
    title: 'Key hints collapse and expand with available width',
    width: 160,
    height: 14,
    covers: ['KeyHintBar', 'Row'],
    render: () => Row({ gap: 2, widths: [44, 114] },
      KeyHintBar({
        title: ' NARROW CONTROLS ',
        hints: [['Space', 'pause/resume'], ['↑/↓ Pg', 'scroll'], ['b', 'complete one batch'], ['c', 'complete all'], ['f', 'finish']],
        columns: 'auto',
        maxColumns: 'auto',
        minColumnWidth: 14,
        adaptive: true,
        theme: ocean,
      }),
      KeyHintBar({
        title: ' WIDE CONTROLS ',
        hints: [['Space', 'pause/resume'], ['↑/↓ Pg', 'scroll'], ['b', 'complete one batch'], ['c', 'complete all'], ['f', 'finish']],
        columns: 'auto',
        maxColumns: 'auto',
        minColumnWidth: 14,
        adaptive: true,
        theme: ocean,
      }),
    ),
  },
  {
    id: 'progress-bar-variants',
    title: 'Progress bar variants and boundary states',
    width: 82,
    height: 21,
    covers: ['ProgressBar'],
    render: () => WorkspacePane({
      title: ' PROGRESS BAR VARIANTS ',
      height: 21,
      theme: ocean,
      children: [Column({ gap: 1 },
        ProgressBar({ value: 0, total: 100, width: 28, label: 'compact idle', variant: 'compact' }),
        ProgressBar({ value: 42, total: 100, width: 28, label: 'compact rail', variant: 'compact' }),
        ProgressBar({ value: 42, total: 100, width: 28, label: 'block fill', variant: 'block' }),
        ProgressBar({ value: 42, total: 100, width: 28, label: 'line track', variant: 'line' }),
        ProgressBar({ value: 42, total: 100, width: 28, label: 'square cells', variant: 'squares' }),
        ProgressBar({ value: 42, total: 100, width: 28, label: 'inset rail', variant: 'inset' }),
        ProgressBar({ value: 42, total: 100, width: 48, label: 'boxed', variant: 'boxed' }),
        ProgressBar({ value: 100, total: 100, width: 28, label: 'complete', variant: 'compact' }),
      )],
    }),
  },
  {
    id: 'progress-status-lifecycle',
    title: 'Progress status details and lifecycle states',
    width: 120,
    height: 22,
    covers: ['ProgressStatus', 'LiveJobBlock'],
    render: () => Column({ height: 22, gap: 1 },
      WorkspacePane({ title: ' RUNNING TRANSFER ', theme: ocean, children: [
        ProgressStatus({ progress: { value: 42 * 1024 * 1024, total: 96 * 1024 * 1024, state: 'running', elapsedMs: 4000, rate: 10.5 * 1024 * 1024, etaMs: 5143, unit: 'bytes' }, width: 34, label: 'Assets', variant: 'inset', format: 'bytes' }),
      ] }),
      Row({ gap: 2, distribute: true },
        WorkspacePane({ title: ' STATES ', theme: ocean, children: [
          ProgressStatus({ progress: { value: 48, total: 100, state: 'paused', elapsedMs: 12000, rate: 4, unit: 'items' }, width: 15, label: 'Paused', showRate: false, showEta: false }),
          ProgressStatus({ progress: { value: 24, total: 24, state: 'completed', elapsedMs: 6400, rate: 3.75, unit: 'files' }, width: 15, label: 'Done', showRate: false, showEta: false }),
          ProgressStatus({ progress: { value: 3, total: 10, state: 'failed', elapsedMs: 2200, rate: 1.36, error: new Error('checksum mismatch'), unit: 'parts' }, width: 15, label: 'Failed', showRate: false, showElapsed: false, showEta: false }),
          ProgressStatus({ progress: { value: 7, total: 20, state: 'cancelled', elapsedMs: 1800, unit: 'tasks' }, width: 15, label: 'Cancelled', showRate: false, showElapsed: false, showEta: false }),
        ] }),
        LiveJobBlock({
          title: ' Controller-backed job ',
          status: 'running',
          running: true,
          progress: { value: 42, total: 100, state: 'running', elapsedMs: 4000, rate: 10.5, etaMs: 5524, unit: 'items' },
          progressVariant: 'inset',
          showProgressDetails: true,
          steps: ['Open stream', 'Decode chunks', 'Write cache', 'Verify artifact'],
          activeIndex: 1,
          frame: 6,
        }),
      ),
    ),
  },
  {
    id: 'scroll-view-workspace-top',
    title: 'Scrollable workspace body at the top',
    width: 82,
    height: 18,
    covers: ['ScrollView', 'WorkspacePane', 'KeyHintBar'],
    render: () => scrollableWorkspaceSnapshot(0),
  },
  {
    id: 'scroll-view-workspace-scrolled',
    title: 'Scrollable workspace body with fixed footer',
    width: 82,
    height: 18,
    covers: ['ScrollView', 'WorkspacePane', 'KeyHintBar'],
    render: () => scrollableWorkspaceSnapshot(7),
  },
  {
    id: 'interaction-kit-progress-live-jobs',
    title: 'Interaction Kit progress and live jobs window',
    width: 120,
    height: 35,
    covers: ['ScrollView', 'ProgressBar', 'LiveJobBlock', 'MetricBlock', 'SelectList', 'KeyHintBar', 'WorkspaceShell'],
    render: () => interactionKitProgressWindow('progress-live-jobs', { scroll: 5 }),
  },
  {
    id: 'interaction-kit-progress-status',
    title: 'Interaction Kit progress status and batching window',
    width: 120,
    height: 35,
    covers: ['ScrollView', 'ProgressStatus', 'LiveJobBlock', 'SelectList', 'KeyHintBar', 'WorkspaceShell'],
    render: () => interactionKitProgressWindow('progress-status-controller', { scroll: 8 }),
  },
  {
    id: 'interaction-kit-reordering',
    title: 'Interaction Kit portable reordering window',
    width: 120,
    height: 35,
    covers: ['SelectList', 'KeyValueBlock', 'SummaryList', 'KeyHintBar', 'WorkspaceShell'],
    render: () => interactionKitReorderingWindow(),
  },
]);


function scrollableWorkspaceSnapshot(scroll) {
  const scrollState = createScrollState({ scroll, totalRows: 0, visibleRows: 1, sticky: false });
  return WorkspacePane({
    title: ' SCROLLABLE WORKSPACE BODY ',
    height: 18,
    theme: ocean,
    children: [ScrollView({
      scrollState,
      pointerId: 'workspace-scroll',
      onWheel: noop,
    }, Column({ gap: 1 },
      ...Array.from({ length: 12 }, (_, index) => PointerRegion({
        pointerId: `workspace-row:${index}`,
        pointerData: { row: index },
        onClick: noop,
      }, Text(`Row ${String(index + 1).padStart(2, '0')} · ${['prepare input', 'render frame', 'patch terminal', 'verify output'][index % 4]}`))),
    ))],
    footerNode: KeyHintBar({
      title: ' LOCAL CONTROLS ',
      hints: [['↑/↓', 'scroll'], ['PgUp/PgDn', 'page'], ['Home/End', 'jump'], ['Enter', 'open']],
      columns: 'auto',
      maxColumns: 'auto',
      minColumnWidth: 14,
      theme: ocean,
    }),
    footerMinHeight: 3,
    footerMaxHeight: 5,
  });
}

function interactionKitReorderingWindow() {
  const state = createInteractionKitState();
  const index = state.list.items.findIndex((item) => item.id === 'reordering-items');
  state.selectedShowcaseIndex = index;
  state.list.selectedIndex = index;
  state.focus.focus('preview');
  const decoder = new TerminalInputDecoder();
  const runtime = { exit() {}, invalidate() {} };
  for (const sequence of ['\x1b[A', 'K', 'J']) {
    const [key] = decoder.write(sequence);
    handleInteractionKitKey({ key, state, runtime });
  }
  return createInteractionKitView({ state, width: 120, height: 35 });
}

function interactionKitProgressWindow(id, { scroll = 0 } = {}) {
  const state = createInteractionKitState();
  const index = state.list.items.findIndex((item) => item.id === id);
  state.selectedShowcaseIndex = index;
  state.list.selectedIndex = index;
  state.focus.focus('preview');
  state.frame = 8;
  const showcase = state.showcaseState[id];
  if (showcase?.scroll) showcase.scroll.scroll = scroll;

  if (id === 'progress-live-jobs') {
    Object.assign(showcase, {
      progress: 58,
      running: true,
      status: 'running',
      activeIndex: 2,
      elapsed: 37,
      ticks: 148,
      processed: 244,
    });
  } else if (id === 'progress-status-controller') {
    showcase.clockMs = 1000;
    showcase.download.add(18 * 1024 * 1024);
    showcase.batch.add(3);
    showcase.clockMs = 4000;
    showcase.download.add(24 * 1024 * 1024);
    showcase.batch.add(2);
    showcase.batchNotice = 'Manual batch completed: 5/12.';
    showcase.manualBatchAdds = 1;
  }

  return createInteractionKitView({ state, width: 120, height: 35 });
}
