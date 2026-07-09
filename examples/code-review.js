#!/usr/bin/env node
import {
  Column,
  ConfirmPrompt,
  InputEditor,
  KeyHintBar,
  Modal,
  ModeManager,
  ScrollPane,
  SelectList,
  Text,
  Toast,
  WorkspacePane,
  WorkspaceShell,
  appendMessageBlock,
  color,
  createMessage,
  createToastManager,
  fitInline,
  renderTextEditorLines,
  resolveAutoScrollOffset,
  resolveScrollKeyOffset,
  resolveWorkspaceShellLayout,
  scrollMax,
  themes,
  wrapText,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';
import { EXAMPLE_THEME, cycleTab, responsiveTabHint, responsiveTabs } from './_workspaceExampleUtils.js';

const PULL_REQUESTS = [
  {
    id: 'pr-184',
    number: 184,
    title: 'Stabilize terminal resize and scroll panes',
    author: 'mira',
    branch: 'fix/terminal-resize-scroll',
    base: 'main',
    status: 'Review required',
    checks: '5/6 passing',
    risk: 'medium',
    description: 'This PR replaces several hand-tuned workspace heights with a measured shell layout. It fixes a resize regression where the main pane kept using stale visible rows after the footer or local help grid changed size. The review should verify narrow terminals, tall terminals, scrollback behavior after append, and the interaction between sticky autoscroll and manual page scrolling. The intended UX is close to a normal pull-request review: General explains why the change exists, Commits shows the changed files, Diff exposes the patch for the selected commit, and Comments behaves like a live review thread.',
    commits: [
      {
        sha: '8f12c7e',
        title: 'Measure workspace chrome before rendering main panes',
        author: 'mira',
        files: ['src/lib/ui/workspace.js', 'src/lib/ui/layout/index.js', 'test/uiComponents.test.js'],
        diff: [
          'diff --git a/src/lib/ui/workspace.js b/src/lib/ui/workspace.js',
          '@@ -68,16 +68,32 @@ export function WorkspaceShell({ title, subtitle, stats, tabs, main, activity, height }) {',
          '- const mainHeight = height - 14;',
          '- const header = WorkspaceHeader({ title, subtitle, stats });',
          '- const tabBar = WorkspaceTabs({ tabs, activeTab });',
          '- return Column(header, tabBar, Box({ height: mainHeight }, main), activity);',
          '+ const layout = resolveWorkspaceShellLayout({',
          '+   width, height, title, subtitle, stats, right, tabs, activeTab,',
          '+   tabHint, command, footer, activity, theme, minMainHeight,',
          '+ });',
          '+ const header = WorkspaceHeader({ title, subtitle, stats, right, theme });',
          '+ const tabBar = WorkspaceTabs({ tabs, activeTab, hint: tabHint, theme });',
          '+ return Column(',
          '+   header,',
          '+   tabBar,',
          '+   Box({ height: layout.mainHeight }, main),',
          '+   activity,',
          '+ );',
          '+}',
          '+',
          '+export function resolveWorkspaceShellLayout({ height, stats = [], tabs = [], activity = null, command = null, footer = null, minMainHeight = 6 }) {',
          '+  const chrome = measureWorkspaceChrome({ stats, tabs, activity, command, footer });',
          '+  return { mainHeight: Math.max(minMainHeight, Number(height) - chrome) };',
          '+}',
          '',
          'diff --git a/src/lib/ui/layout/index.js b/src/lib/ui/layout/index.js',
          '@@ -120,11 +120,23 @@ export function measureNodeHeight(node, width) {',
          '- if (!node) return 0;',
          '- const frame = layout(node, { width });',
          '- return frame.lines.length;',
          '+ if (!node) return 0;',
          '+ const frame = layout(node, { width, height: Number.POSITIVE_INFINITY });',
          '+ return frame.lines.length;',
          '+}',
          '+',
          '+export function measureStackHeight(nodes, width) {',
          '+  return nodes.reduce((total, node) => {',
          '+    if (!node) return total;',
          '+    return total + measureNodeHeight(node, width);',
          '+  }, 0);',
          ' ',
          ' export function clampFrameHeight(frame, height) {',
          '+  if (!Number.isFinite(height)) return frame;',
          '   return { ...frame, lines: frame.lines.slice(0, height) };',
          ' }',
          '',
          'diff --git a/test/uiComponents.test.js b/test/uiComponents.test.js',
          '@@ -42,6 +42,20 @@ test(\'workspace tabs render active item\', () => {',
          '+test(\'workspace layout measures bordered help grids\', () => {',
          '+  const activity = KeyHintBar({ title: \' LOCAL HELP \', hints: [[\'Tab\', \'focus\'], [\'Ctrl+O\', \'open\']], gridBorder: true });',
          '+  const result = resolveWorkspaceShellLayout({',
          '+    width: 100,',
          '+    height: 24,',
          '+    tabs: [{ id: \'general\', label: \'General\' }],',
          '+    activity,',
          '+    minMainHeight: 8,',
          '+  });',
          '+  assert.equal(result.mainHeight, 10);',
          '+});',
          '+',
          ' test(\'workspace pane keeps title visible\', () => {',
        ],
      },
      {
        sha: 'c02fd91',
        title: 'Keep read-only transcript scroll anchored at bottom',
        author: 'mira',
        files: ['src/lib/scrollState.js', 'examples/streaming-workbench.js', 'test/examples.test.js'],
        diff: [
          'diff --git a/src/lib/scrollState.js b/src/lib/scrollState.js',
          '@@ -1,11 +1,30 @@',
          '+export function resolveAutoScrollOffset({ scroll, totalRows, previousTotalRows, visibleRows, sticky }) {',
          '+  const previousMax = scrollMax(previousTotalRows, visibleRows);',
          '+  const nextMax = scrollMax(totalRows, visibleRows);',
          '+  if (sticky === true) return nextMax;',
          '+  if (sticky === false) return clampScrollOffset(scroll, nextMax);',
          '+  return scroll >= previousMax ? nextMax : clampScrollOffset(scroll, nextMax);',
          '+}',
          '+',
          ' export function scrollMax(totalRows, visibleRows) {',
          '-  return Math.max(0, totalRows - visibleRows);',
          '+  return Math.max(0, Number(totalRows) - Math.max(1, Number(visibleRows)));',
          ' }',
          '',
          'diff --git a/examples/streaming-workbench.js b/examples/streaming-workbench.js',
          '@@ -188,12 +188,26 @@ function transcriptPane(state, width, height) {',
          '- state.transcriptScroll = scrollMax(lines.length, visibleRows);',
          '+ state.transcriptScroll = resolveAutoScrollOffset({',
          '+   scroll: state.transcriptScroll,',
          '+   totalRows: lines.length,',
          '+   previousTotalRows: state.transcriptMetrics.totalRows,',
          '+   visibleRows,',
          '+   sticky: state.transcriptSticky,',
          '+ });',
          '+ state.transcriptMetrics = { totalRows: lines.length, visibleRows };',
          '+ state.transcriptSticky = state.transcriptScroll >= scrollMax(lines.length, visibleRows);',
          '  return ScrollPane({ lines, height, scroll: state.transcriptScroll });',
          '}',
          '',
          'diff --git a/test/examples.test.js b/test/examples.test.js',
          '@@ -88,6 +88,18 @@ test(\'streaming workbench appends chunks\', () => {',
          '+test(\'streaming workbench preserves manual scrollback\', () => {',
          '+  const state = createStreamingWorkbenchState();',
          '+  state.transcriptScroll = 0;',
          '+  state.transcriptSticky = false;',
          '+  appendStreamingChunk(state, \'late chunk\');',
          '+  createStreamingWorkbenchView({ state, width: 110, height: 24 });',
          '+  assert.equal(state.transcriptScroll, 0);',
          '+});',
        ],
      },
      {
        sha: 'f91aa73',
        title: 'Route scroll keys through pane-specific metrics',
        author: 'mira',
        files: ['examples/code-review.js', 'examples/_workspaceExampleUtils.js', 'test/examplesAdvanced.test.js'],
        diff: [
          'diff --git a/examples/code-review.js b/examples/code-review.js',
          '@@ -420,14 +420,31 @@ function scrollablePane({ title, pane, state, lines, width, height }) {',
          '- const visibleRows = height - 4;',
          '- state.paneScroll[pane] = Math.min(state.paneScroll[pane], scrollMax(lines.length, visibleRows));',
          '+ const visibleRows = Math.max(1, Number(height) - 4);',
          '+ const metrics = state.scrollMetrics[pane] ?? { totalRows: 0, visibleRows };',
          '+ const result = resolveScrollKeyOffset({',
          '+   keyName: \'noop\',',
          '+   scroll: state.paneScroll[pane] ?? 0,',
          '+   totalRows: lines.length,',
          '+   visibleRows,',
          '+   previousTotalRows: metrics.totalRows,',
          '+ });',
          '+ state.paneScroll[pane] = result.scroll;',
          '+ state.scrollMetrics[pane] = { totalRows: lines.length, visibleRows };',
          '  return WorkspacePane({ title, height, children: [',
          '    ScrollPane({ lines, height: height - 2, scroll: state.paneScroll[pane] }),',
          '  ]});',
          '}',
          '',
          'diff --git a/examples/_workspaceExampleUtils.js b/examples/_workspaceExampleUtils.js',
          '@@ -10,6 +10,16 @@ export function responsiveTabHint(prefix, tabs, visibleTabs) {',
          '+export function routeScrollKey(state, pane, keyName) {',
          '+  const metrics = state.scrollMetrics[pane] ?? { totalRows: 0, visibleRows: 1 };',
          '+  return resolveScrollKeyOffset({',
          '+    keyName,',
          '+    scroll: state.paneScroll[pane] ?? 0,',
          '+    totalRows: metrics.totalRows,',
          '+    visibleRows: metrics.visibleRows,',
          '+  });',
          '+}',
          '+',
          ' export function cycleTab(state, tabs, direction) {',
          '',
          'diff --git a/test/examplesAdvanced.test.js b/test/examplesAdvanced.test.js',
          '@@ -92,6 +92,19 @@ test(\'code review workspace uses read-only PR details\', () => {',
          '+test(\'code review scroll keys use current pane metrics\', () => {',
          '+  const state = createCodeReviewState();',
          '+  handleCodeReviewKey({ key: { name: \'enter\' }, state });',
          '+  state.activeTab = \'general\';',
          '+  createCodeReviewView({ state, width: 90, height: 18 });',
          '+  handleCodeReviewKey({ key: { name: \'page-down\' }, state });',
          '+  assert.ok(state.paneScroll.general > 0);',
          '+});',
        ],
      },
    ],
    comments: [
      { author: 'alex', location: 'src/lib/ui/workspace.js:76', body: 'Good direction. Please add a regression for very small terminal height so the pane border is still visible. I would also like the review to cover the case where the footer is absent but the help grid is still present, because that is where fixed subtraction usually drifts first.', status: 'open' },
      { author: 'review-bot', location: 'src/lib/scrollState.js:41', body: 'The sticky expression is much clearer now, but the helper still mixes absolute row counts and previous totals. Please add a test where the previous transcript has fewer rows than the visible window, then receives enough chunks to overflow.', status: 'open' },
      { author: 'mira', location: 'examples/streaming-workbench.js:192', body: 'Added a transcript test that scrolls up, appends a chunk, then returns to bottom. I also verified that the footer and local help grid no longer change the maximum scroll value after resize.', status: 'resolved' },
      { author: 'sam', location: 'src/lib/ui/layout/index.js:129', body: 'One concern: measuring with an unbounded height should not mask components that intentionally clamp themselves. It may be worth documenting which components are safe to measure this way, otherwise future widgets could report a misleading height.', status: 'open' },
      { author: 'alex', location: 'test/uiComponents.test.js:51', body: 'The assertion is helpful, but please include the rendered frame in the failure message or split expected chrome calculation into named values. When this fails during a resize regression, a single expected number will be difficult to diagnose.', status: 'open' },
      { author: 'mira', location: 'examples/code-review.js:430', body: 'I updated the code-review fixture to keep one diff section per listed file. This should make the Commits tab and Diff tab feel consistent during manual review.', status: 'resolved' },
    ],
  },
  {
    id: 'pr-207',
    number: 207,
    title: 'Add command palette accepted-action history',
    author: 'denis',
    branch: 'feat/palette-accepted-log',
    base: 'main',
    status: 'Changes requested',
    checks: '4/4 passing',
    risk: 'low',
    description: 'Adds an Accepted tab to the command palette example and records the last accepted actions. The goal is to make palette demos feel more like a real product surface: users can search, inspect details, accept an action, then review what happened. The implementation should keep Details read-only and avoid hidden state changes while another tab is active. Please pay attention to keyboard routing, scroll metrics in the accepted log, and whether the rendered empty state remains stable on small terminals.',
    commits: [
      {
        sha: '3e9cbe4',
        title: 'Record accepted palette actions',
        author: 'denis',
        files: ['examples/command-palette.js', 'test/examples.test.js', 'docs/examples.md'],
        diff: [
          'diff --git a/examples/command-palette.js b/examples/command-palette.js',
          '@@ -210,11 +210,30 @@ function acceptSelectedAction(state) {',
          '+ state.accepted.unshift({',
          '+   id: selected.id,',
          '+   title: selected.title,',
          '+   group: selected.group,',
          '+   at: new Date().toISOString(),',
          '+ });',
          '+ if (state.accepted.length > 20) state.accepted = state.accepted.slice(0, 20);',
          '- state.activeTab = \'details\';',
          '+ state.activeTab = \'accepted\';',
          '+ state.acceptedSelectedIndex = 0;',
          '+ state.status = `Accepted ${selected.title}.`;',
          '+ state.toast = { level: \'success\', message: `Accepted ${selected.title}.` };',
          '}',
          '',
          'diff --git a/test/examples.test.js b/test/examples.test.js',
          '@@ -132,6 +132,19 @@ test(\'command palette accepts selected action\', () => {',
          '+test(\'command palette records accepted action history\', () => {',
          '+  const state = createCommandPaletteState();',
          '+  handleCommandPaletteKey({ key: { name: \'enter\' }, state });',
          '+  assert.equal(state.accepted.length, 1);',
          '+  assert.equal(state.activeTab, \'accepted\');',
          '+  assert.match(state.accepted[0].title, /Open|Create|Toggle/);',
          '+});',
          '',
          'diff --git a/docs/examples.md b/docs/examples.md',
          '@@ -40,7 +40,9 @@ npm run example:palette',
          '-A searchable command launcher with selected-action details.',
          '+A searchable command launcher with selected-action details, accepted-action history,',
          '+tab-scoped keyboard handling, and a stable empty state for narrow terminals.',
        ],
      },
      {
        sha: '55d72aa',
        title: 'Bound accepted log selection to active tab',
        author: 'denis',
        files: ['examples/command-palette.js', 'src/lib/focusManager.js', 'test/examplesAdvanced.test.js'],
        diff: [
          'diff --git a/examples/command-palette.js b/examples/command-palette.js',
          '@@ -318,11 +318,24 @@ function handlePaletteNavigation(key, state) {',
          '- if (key.name === \'down\') moveAcceptedSelection(state, 1);',
          '+ if (state.activeTab === \'accepted\' && key.name === \'down\') {',
          '+   moveAcceptedSelection(state, 1);',
          '+   return;',
          '+ }',
          '+ if (state.activeTab === \'accepted\' && key.name === \'up\') {',
          '+   moveAcceptedSelection(state, -1);',
          '+   return;',
          '+ }',
          '+ if (state.activeTab !== \'accepted\' && (key.name === \'up\' || key.name === \'down\')) {',
          '+   moveActionSelection(state, key.name === \'down\' ? 1 : -1);',
          '+   return;',
          '+ }',
          '',
          'diff --git a/src/lib/focusManager.js b/src/lib/focusManager.js',
          '@@ -52,7 +52,14 @@ export class FocusManager {',
          '+  has(id) {',
          '+    return this.order.includes(id);',
          '+  }',
          '+',
          '+  currentOr(defaultId) {',
          '+    return this.has(this.current()) ? this.current() : defaultId;',
          '+  }',
          '',
          'diff --git a/test/examplesAdvanced.test.js b/test/examplesAdvanced.test.js',
          '@@ -146,6 +146,17 @@ test(\'command palette renders accepted log\', () => {',
          '+test(\'accepted history navigation is tab scoped\', () => {',
          '+  const state = createCommandPaletteState();',
          '+  state.activeTab = \'details\';',
          '+  handleCommandPaletteKey({ key: { name: \'down\' }, state });',
          '+  assert.equal(state.acceptedSelectedIndex, 0);',
          '+});',
        ],
      },
      {
        sha: '729ab5d',
        title: 'Render empty accepted state without layout jump',
        author: 'denis',
        files: ['examples/command-palette.js', 'examples/_workspaceExampleUtils.js', 'test/uiComponents.test.js'],
        diff: [
          'diff --git a/examples/command-palette.js b/examples/command-palette.js',
          '@@ -384,9 +384,24 @@ function acceptedPane(state, width, height) {',
          '- if (!state.accepted.length) return Text(\'No accepted actions yet.\');',
          '+ const rows = state.accepted.length',
          '+   ? acceptedRows(state, width)',
          '+   : emptyAcceptedRows(width);',
          '+ return WorkspacePane({',
          '+   title: \' ACCEPTED ACTIONS \',',
          '+   active: state.activeTab === \'accepted\',',
          '+   height,',
          '+   children: [ScrollPane({ lines: rows, width, height: height - 2, scroll: state.acceptedScroll })],',
          '+ });',
          '+}',
          '',
          'diff --git a/examples/_workspaceExampleUtils.js b/examples/_workspaceExampleUtils.js',
          '@@ -30,6 +30,13 @@ export function responsiveTabs(tabs, active, width, options = {}) {',
          '+export function emptyStateRows(title, body) {',
          '+  return [',
          '+    `No ${title} yet.`,',
          '+    body,',
          '+    \'Use Enter on an action to create the first entry.\',',
          '+  ];',
          '+}',
          '',
          'diff --git a/test/uiComponents.test.js b/test/uiComponents.test.js',
          '@@ -73,6 +73,14 @@ test(\'scroll pane clamps offsets\', () => {',
          '+test(\'empty accepted state keeps pane height stable\', () => {',
          '+  const state = createCommandPaletteState();',
          '+  const output = renderToString(createCommandPaletteView({ state, width: 80, height: 22 }), { width: 80, height: 22 });',
          '+  assert.match(stripAnsi(output), /No accepted actions yet/);',
          '+});',
        ],
      },
    ],
    comments: [
      { author: 'alex', location: 'examples/command-palette.js:246', body: 'This should use the same tab-scoped keyboard model as editor and stream. Right now the selection behavior is close, but the review should explicitly cover what happens when Details is active and the accepted log already contains several actions.', status: 'open' },
      { author: 'denis', location: 'test/examples.test.js:118', body: 'Added a test for accepted action navigation. I also included an empty-state check because the previous implementation changed height as soon as the first action was accepted.', status: 'resolved' },
      { author: 'review-bot', location: 'examples/command-palette.js:390', body: 'The toast message is useful, but please make sure it does not steal vertical space from the main pane without recalculating the pane height. We have seen this class of issue in workspace examples before.', status: 'open' },
      { author: 'nora', location: 'docs/examples.md:44', body: 'The docs update is okay, but avoid introducing another hierarchy that competes with the examples index. The output of npm run examples should be the canonical grouped list.', status: 'open' },
      { author: 'alex', location: 'src/lib/focusManager.js:54', body: 'This helper might be useful, but it is not used outside this example. Either use it in another focus-managed example or keep the change local to avoid expanding the public surface too early.', status: 'open' },
    ],
  },
  {
    id: 'pr-231',
    number: 231,
    title: 'Refactor input editor newline handling',
    author: 'kai',
    branch: 'refactor/input-editor-newline',
    base: 'main',
    status: 'Draft',
    checks: '2/3 passing',
    risk: 'high',
    description: 'Unifies Ctrl+J, Ctrl+Enter and paste handling for multiline editors. The refactor touches key parsing, editor mutation and several interactive examples, so the review should focus on regressions around macOS escape sequences, Backspace versus Delete, cursor movement at wrapped lines, and multiline comment composition. This is intentionally a larger PR for the example: there is enough text, enough commits, and enough comments to exercise scrolling in every central pane.',
    commits: [
      {
        sha: 'a91b0c2',
        title: 'Normalize newline shortcuts in key parser',
        author: 'kai',
        files: ['src/lib/keyParser.js', 'test/keyParser.test.js', 'docs/interactive-apps.md'],
        diff: [
          'diff --git a/src/lib/keyParser.js b/src/lib/keyParser.js',
          '@@ -92,12 +92,34 @@ export function parseKey(input) {',
          '+ if (input === \'\\n\') return { name: \'ctrl-j\', ctrl: true, sequence: input };',
          '+ if (sequence === \'\\x1b[13;5u\') return { name: \'enter\', ctrl: true, sequence };',
          '+ if (sequence === \'\\x1b[111;5u\') return { name: \'o\', ctrl: true, sequence };',
          '- if (input === \'\\r\') return { name: \'enter\' };',
          '+ if (input === \'\\r\') return { name: \'enter\', sequence: input };',
          '+ const csi = parseCsiU(sequence);',
          '+ if (csi) return csi;',
          '',
          'diff --git a/test/keyParser.test.js b/test/keyParser.test.js',
          '@@ -35,6 +35,20 @@ test(\'parseKey normalizes arrows\', () => {',
          '+test(\'parseKey normalizes ctrl enter and ctrl o CSI-u sequences\', () => {',
          '+  assert.deepEqual(parseKey(\'\\x1b[13;5u\'), { name: \'enter\', ctrl: true, sequence: \'\\x1b[13;5u\' });',
          '+  assert.equal(parseKey(\'\\x1b[111;5u\').name, \'o\');',
          '+  assert.equal(parseKey(\'\\x1b[111;5u\').ctrl, true);',
          '+});',
          '+',
          '+test(\'parseKey keeps macOS backspace distinct from delete\', () => {',
          '+  assert.equal(parseKey(\'\\x7f\').name, \'backspace\');',
          '+  assert.equal(parseKey(\'\\x1b[3~\').name, \'delete\');',
          '+});',
          '',
          'diff --git a/docs/interactive-apps.md b/docs/interactive-apps.md',
          '@@ -64,6 +64,12 @@ Multiline editors usually handle Ctrl+J manually.',
          '+When a terminal emits CSI-u sequences, parseKey normalizes Ctrl+Enter and Ctrl+O',
          '+to the same key objects as classic control bytes. This keeps examples portable',
          '+between default Terminal.app, iTerm2, and modern terminal emulators.',
        ],
      },
      {
        sha: '4f5ac20',
        title: 'Use multiline editor helpers in examples',
        author: 'kai',
        files: ['examples/editor-lab.js', 'examples/streaming-workbench.js', 'examples/code-review.js'],
        diff: [
          'diff --git a/examples/editor-lab.js b/examples/editor-lab.js',
          '@@ -242,10 +242,24 @@ function handleDraftEditorKey(key, state) {',
          '- if (key.name === \'enter\' && key.ctrl) editor.insertLineBreak();',
          '+ if (isEditorNewlineKey(key)) {',
          '+   editor.insertLineBreak();',
          '+   state.status = \'Inserted newline in draft.\';',
          '+   return;',
          '+ }',
          '',
          'diff --git a/examples/streaming-workbench.js b/examples/streaming-workbench.js',
          '@@ -352,8 +352,22 @@ function handlePromptKey(key, state) {',
          '- if (key.name === \'ctrl-j\') state.promptEditor.insertLineBreak();',
          '+ if (isEditorNewlineKey(key)) {',
          '+   state.promptEditor.insertLineBreak();',
          '+   state.status = \'Inserted multiline prompt break.\';',
          '+   return;',
          '+ }',
          '+ editInput(state.promptEditor, key, state, \'prompt\');',
          '',
          'diff --git a/examples/code-review.js b/examples/code-review.js',
          '@@ -736,9 +736,21 @@ function handleCommentEditorKey(key, state) {',
          '- if (key.name === \'ctrl-j\') state.commentEditor.insertLineBreak();',
          '+ if (isEditorNewlineKey(key)) {',
          '+   state.commentEditor.insertLineBreak();',
          '+   state.commentsSticky = true;',
          '+   state.status = \'Inserted a new line in the comment.\';',
          '+   return;',
          '+ }',
        ],
      },
      {
        sha: '6bdbd32',
        title: 'Add regression coverage for comment composer navigation',
        author: 'kai',
        files: ['test/examplesAdvanced.test.js', 'examples/code-review.js', 'src/lib/inputEditor.js'],
        diff: [
          'diff --git a/test/examplesAdvanced.test.js b/test/examplesAdvanced.test.js',
          '@@ -112,6 +112,22 @@ test(\'code review workspace uses read-only PR details\', () => {',
          '+test(\'code review composer accepts multiline comments\', () => {',
          '+  const state = createCodeReviewState();',
          '+  handleCodeReviewKey({ key: { name: \'enter\' }, state });',
          '+  state.activeTab = \'comments\';',
          '+  handleCodeReviewKey({ key: { name: \'n\' }, state });',
          '+  for (const ch of \'line one\') handleCodeReviewKey({ key: { name: ch, printable: true, text: ch }, state });',
          '+  handleCodeReviewKey({ key: { name: \'ctrl-j\', ctrl: true }, state });',
          '+  for (const ch of \'line two\') handleCodeReviewKey({ key: { name: ch, printable: true, text: ch }, state });',
          '+  assert.match(state.commentEditor.value, /line one\\nline two/);',
          '+});',
          '',
          'diff --git a/examples/code-review.js b/examples/code-review.js',
          '@@ -480,7 +480,17 @@ function commentThreadLayout(state, width) {',
          '+lines.push(\'┌─ New review comment\');',
          '+for (const line of editorLines) lines.push(`│ ${line}`);',
          '+lines.push(\'└──────────────────────\');',
          '+state.commentsSticky = true;',
          '',
          'diff --git a/src/lib/inputEditor.js b/src/lib/inputEditor.js',
          '@@ -180,8 +180,19 @@ export class InputEditor {',
          '+moveVertical(delta) {',
          '+  const current = this.positionToLineColumn(this.cursor);',
          '+  const targetLine = clamp(current.line + delta, 0, this.lineCount() - 1);',
          '+  this.cursor = this.lineColumnToPosition(targetLine, current.column);',
          '+}',
        ],
      },
    ],
    comments: [
      { author: 'alex', location: 'src/lib/keyParser.js:52', body: 'Please verify Backspace on macOS. We broke it once while normalizing escape sequences, and it was especially confusing because Backspace started behaving like Delete in the middle of editing a comment.', status: 'open' },
      { author: 'review-bot', location: 'examples/code-review.js:311', body: 'The refactor changes code-review behavior. Please keep an example-level regression test that opens the comment composer, inserts multiline text, confirms posting, and verifies that the comments pane autoscrolls to the new block.', status: 'open' },
      { author: 'kai', location: 'examples/editor-lab.js:244', body: 'I reused the same helper in editor, stream and code-review. The intent is that terminal-specific newline sequences are normalized once and all examples consume the same semantic key.', status: 'open' },
      { author: 'alex', location: 'test/keyParser.test.js:39', body: 'The Ctrl+O regression coverage matters for the code-review picker. Please keep the test close to the parser, but also verify the example-level shortcut because users usually notice the broken modal before they inspect normalized key objects.', status: 'open' },
      { author: 'mira', location: 'docs/interactive-apps.md:69', body: 'This docs note is useful, but avoid implying that every terminal emits CSI-u by default. The wording should say the parser handles it when it appears, not that users should configure it.', status: 'resolved' },
      { author: 'review-bot', location: 'src/lib/inputEditor.js:184', body: 'Vertical movement should preserve the preferred column when moving across shorter wrapped lines. This implementation is acceptable for logical lines, but the review should call out that visual wrapping is handled at render time.', status: 'open' },
    ],
  },
];

const LIVE_COMMENT_TEMPLATES = [
  {
    author: 'review-bot',
    status: 'open',
    body: 'New automated review note: this hunk changed after the first pass. Please re-check the surrounding tests and confirm the behavior still matches the PR description before approving.',
  },
  {
    author: 'sam',
    status: 'open',
    body: 'I just reproduced this path locally. The behavior looks correct, but the comment thread should keep enough context around the changed file so later reviewers do not have to reopen the whole diff.',
  },
  {
    author: 'mira',
    status: 'resolved',
    body: 'Pushed a follow-up that addresses the previous concern. Leaving this note in the thread so the review example can show a resolved live update next to open comments.',
  },
  {
    author: 'alex',
    status: 'open',
    body: 'One more edge case appeared while testing scrollback: when a comment arrives while the reviewer is reading older comments, the pane should not steal focus. A toast with a jump action is the right model here.',
  },
  {
    author: 'nora',
    status: 'open',
    body: 'This is a small copy note, but the wording in the changed area should stay consistent with the rest of the workspace examples. Please avoid adding another naming scheme in the README.',
  },
];

function createInitialLiveDelay() {
  return 6 + Math.floor(Math.random() * 5);
}

function createNextLiveDelay(state) {
  const emitted = Math.max(0, Number(state?.liveCommentCursor ?? 0));
  const base = 12 + emitted * 3;
  return Math.min(36, base + Math.floor(Math.random() * 8));
}


const TABS = [
  { id: 'general', label: 'General' },
  { id: 'commits', label: 'Commits' },
  { id: 'diff', label: 'Diff' },
  { id: 'comments', label: 'Comments' },
];

export function createCodeReviewState() {
  const pr = clonePullRequest(PULL_REQUESTS[0]);
  const modes = new ModeManager('review');
  modes.push('pr-picker');
  return {
    pullRequests: clonePullRequests(),
    selectedPrIndex: 0,
    pr,
    descriptionEditor: new InputEditor(pr.description),
    commentEditor: new InputEditor(''),
    commentMode: 'list',
    activeTab: 'general',
    selectedCommitIndex: 0,
    selectedCommentIndex: 0,
    commentLineAnchors: [],
    commentDetailScroll: 0,
    commentDetailMetrics: { totalRows: 0, visibleRows: 1 },
    modes,
    confirmSelected: 'confirm',
    messages: [],
    reviewBlocks: buildReviewBlocks(pr.title),
    paneScroll: { general: 0, commits: 0, diff: 0, comments: 0 },
    scrollMetrics: {
      general: { totalRows: 0, visibleRows: 1 },
      commits: { totalRows: 0, visibleRows: 1 },
      diff: { totalRows: 0, visibleRows: 1 },
      comments: { totalRows: 0, visibleRows: 1 },
    },
    commentsSticky: true,
    toasts: createToastManager({ level: 'info', message: 'Choose a pull request. Live review comments will appear while you work.', ttl: 6 }),
    toastTarget: null,
    liveCommentCursor: 0,
    liveCommentCountdown: createInitialLiveDelay(),
    status: 'Choose a pull request. Ctrl+O opens this picker again.',
  };
}

export function createCodeReviewView({ state, width = 110, height = 32 } = {}) {
  ensurePullRequest(state);
  const visibleTabs = responsiveTabs(TABS, state.activeTab, width, { pinned: ['general'] });
  const help = KeyHintBar({ title: ' LOCAL HELP ', hints: contextHelpHints(state), theme: EXAMPLE_THEME, gridBorder: true });
  const toast = reviewToast(state, width);
  const activity = toast ? Column(toast, help) : help;
  const stats = [
    { label: 'PR', value: `#${state.pr.number}` },
    { label: 'Checks', value: state.pr.checks },
    { label: 'Comments', value: state.pr.comments.length },
    { label: 'Mode', value: state.modes.current() },
  ];
  const right = [
    { label: 'Risk', value: state.pr.risk },
    { label: 'Status', value: fitInline(state.status, 52).trimEnd() },
  ];
  const tabHint = responsiveTabHint('Tab focus · Ctrl+O open PR picker · Enter primary action · J jump live comment · ↑/↓ scoped navigation · PgUp/PgDn scroll', TABS, visibleTabs);
  const { mainHeight } = resolveWorkspaceShellLayout({
    width,
    height,
    title: 'AI Code Review Terminal',
    subtitle: 'pull request review workspace',
    stats,
    right,
    focus: state.activeTab,
    tabs: visibleTabs,
    activeTab: state.activeTab,
    tabHint,
    activity,
    theme: EXAMPLE_THEME,
    minMainHeight: 8,
  });

  const main = mainPaneBody(state, width, mainHeight);

  return WorkspaceShell({
    title: 'AI Code Review Terminal',
    subtitle: 'pull request review workspace',
    stats,
    right,
    focus: state.activeTab,
    tabs: visibleTabs,
    activeTab: state.activeTab,
    tabHint,
    main,
    activity,
    height,
    theme: EXAMPLE_THEME,
  });
}

export function handleCodeReviewKey({ key, state, runtime = { exit() {} } }) {
  ensurePullRequest(state);

  if (key.name === 'c' && key.ctrl || key.name === 'ctrl-c') {
    runtime.exit(0);
    return;
  }

  if ((key.name === 'o' && key.ctrl) || key.name === 'ctrl-o' || key.name === 'open') {
    openPullRequestPicker(state);
    return;
  }

  if (state.modes.current() === 'pr-picker') return handlePullRequestPickerKey(key, state);
  if (state.modes.current() === 'confirm') return handleConfirmKey(key, state);
  if (state.modes.current() === 'comment-detail') return handleCommentDetailKey(key, state);

  const keyName = String(key.name ?? '').toLowerCase();
  if (state.commentMode !== 'editor' && state.toastTarget && (keyName === 'j' || keyName === 'g')) {
    jumpToToastComment(state);
    return;
  }

  if (key.name === 'tab') {
    cycleTab(state, TABS, key.shift ? -1 : 1, { statusPrefix: 'Focus moved to' });
    return;
  }

  if (state.activeTab === 'general') return handleGeneralKey({ key, state });
  if (state.activeTab === 'commits') return handleCommitsKey({ key, state });
  if (state.activeTab === 'diff') return handleDiffKey({ key, state });
  if (state.activeTab === 'comments') return handleCommentsKey({ key, state });
}

export function submitReview(state) {
  ensurePullRequest(state);
  const assistant = createMessage({ role: 'assistant', content: '', blocks: [] });
  for (const block of buildReviewBlocks(`${state.pr.title} ${state.pr.description}`)) appendMessageBlock(assistant, block);
  state.messages.push(assistant);
  state.reviewBlocks = assistant.blocks;
  state.status = 'Mock review summary generated for the current pull request.';
  return assistant.blocks;
}

export function tickCodeReview({ state }) {
  ensurePullRequest(state);
  state.toasts?.tick(1);
  if (state.modes.current() === 'pr-picker') return null;
  state.liveCommentCountdown = Math.max(0, Number(state.liveCommentCountdown ?? createInitialLiveDelay()) - 1);
  if (state.liveCommentCountdown > 0) return null;
  const comment = addIncomingReviewComment(state);
  state.liveCommentCountdown = createNextLiveDelay(state);
  return comment;
}

export function addIncomingReviewComment(state) {
  ensurePullRequest(state);
  const template = LIVE_COMMENT_TEMPLATES[mod(state.liveCommentCursor ?? 0, LIVE_COMMENT_TEMPLATES.length)];
  const commit = state.pr.commits[mod((state.liveCommentCursor ?? 0) + state.selectedCommitIndex, state.pr.commits.length)];
  const file = commit.files[mod(state.liveCommentCursor ?? 0, commit.files.length)] ?? 'general';
  const comment = {
    author: template.author,
    location: `${file}:${72 + state.pr.comments.length * 3}`,
    body: template.body,
    status: template.status,
    live: true,
  };
  const shouldFollow = state.activeTab === 'comments' && state.commentMode === 'list' && state.commentsSticky;
  state.pr.comments.push(comment);
  state.liveCommentCursor = (state.liveCommentCursor ?? 0) + 1;
  state.toastTarget = { prId: state.pr.id, commentIndex: state.pr.comments.length - 1 };
  if (shouldFollow) {
    state.selectedCommentIndex = state.pr.comments.length - 1;
    state.commentsSticky = true;
  }
  syncCurrentPullRequest(state);
  state.toasts?.show(`New review comment from ${comment.author} at ${comment.location}.`, 'info', 8);
  state.status = `New review comment added at ${comment.location}. Press J to jump.`;
  return comment;
}

export function jumpToToastComment(state) {
  ensurePullRequest(state);
  const target = state.toastTarget;
  if (!target) {
    state.status = 'No live comment target to jump to.';
    return null;
  }

  if (target.prId !== state.pr.id) {
    const index = state.pullRequests.findIndex((pr) => pr.id === target.prId);
    if (index < 0) {
      state.status = 'Live comment target is no longer available.';
      state.toastTarget = null;
      return null;
    }
    openPullRequestByIndex(state, index, { preserveToast: true });
  }

  const commentIndex = Math.min(target.commentIndex, Math.max(0, state.pr.comments.length - 1));
  state.modes.reset();
  state.activeTab = 'comments';
  state.commentMode = 'list';
  state.selectedCommentIndex = commentIndex;
  state.commentsSticky = false;
  state.paneScroll.comments = Math.max(0, state.commentLineAnchors?.[commentIndex] ?? state.paneScroll.comments ?? 0);
  const comment = state.pr.comments[commentIndex] ?? null;
  if (comment) {
    state.toasts?.clear();
    state.toastTarget = null;
    state.status = `Jumped to comment from ${comment.author} at ${comment.location}.`;
  }
  return comment;
}


export function buildReviewBlocks(prompt) {
  const topic = String(prompt || 'selected pull request');
  const lower = topic.toLowerCase();
  const layoutRisk = /layout|resize|scroll|terminal|pane/.test(lower);
  const inputRisk = /key|input|editor|newline|backspace|ctrl/.test(lower);
  const warning = layoutRisk
    ? 'Check measured layout against the actual rendered height, especially when bordered help grids are visible.'
    : inputRisk
      ? 'Keep keyboard handling scoped to the active pane and cover macOS escape-sequence regressions.'
      : 'Review the changed files, comments and tests before approving.';
  return [
    { type: 'text', title: 'Review summary', content: `Review target: ${topic}\nVerdict: needs focused PR-level review before merge.` },
    { type: 'warning', title: 'Primary risk', content: warning },
    { type: 'diff', title: 'Suggested review note', content: '--- a/review.md\n+++ b/review.md\n@@\n+ Add a regression test that reproduces the behavior described in the PR comments.' },
    { type: 'command', title: 'Verification', command: 'npm test && npm run check' },
  ];
}

function mainPaneBody(state, width, height) {
  const mode = state.modes.current();
  if (mode === 'pr-picker') return pullRequestPicker(state, width, height);
  if (mode === 'confirm') return confirmCommentModal(state, height);
  if (mode === 'comment-detail') return commentDetailModal(state, width, height);
  if (state.activeTab === 'commits') return commitsPane(state, width, height);
  if (state.activeTab === 'diff') return diffPane(state, width, height);
  if (state.activeTab === 'comments') return commentsPane(state, width, height);
  return generalPane(state, width, height);
}

function reviewToast(state, width) {
  const current = state.toasts?.toast ? state.toasts.current() : null;
  if (!current) return null;

  const target = state.toastTarget?.prId === state.pr.id
    ? state.pr.comments[state.toastTarget.commentIndex] ?? null
    : null;

  if (target) {
    const location = String(target.location ?? 'general');
    const file = location.includes(':') ? location.split(':')[0] : location;
    const message = fitInline(`New comment on ${file} — Press J to jump`, Math.max(24, width - 16)).trimEnd();
    const detail = fitInline(`${target.author} added a comment • just now`, Math.max(24, width - 18)).trimEnd();
    return Toast({ level: current.level, message, detail, icon: '🔔', theme: EXAMPLE_THEME, width });
  }

  const message = fitInline(current.message, Math.max(20, width - 10)).trimEnd();
  return Toast({ level: current.level, message, theme: EXAMPLE_THEME, width });
}

function pullRequestPicker(state, width, height = undefined) {
  const selected = state.pullRequests[state.selectedPrIndex] ?? state.pullRequests[0];
  const children = [
    Text('Select a pull request to review. Ctrl+O opens this picker again from any pane.', { wrap: false }),
    SelectList({
      title: 'Pull Requests',
      items: state.pullRequests,
      selectedIndex: state.selectedPrIndex,
      windowSize: Math.max(3, Math.min(6, state.pullRequests.length)),
      getLabel: (pr) => `#${pr.number} ${fitInline(pr.title, Math.max(24, Math.min(48, width - 54))).trimEnd()}`,
      getDescription: (pr) => `${pr.status} · ${pr.checks} · ${pr.author}`,
    }),
  ];
  if (selected) {
    children.push(
      Text(''),
      Text(`Selected: #${selected.number} ${selected.title}`, { wrap: false }),
      Text(`Branch: ${selected.branch} → ${selected.base} · Checks: ${selected.checks} · Comments: ${selected.comments.length}`, { wrap: false }),
      ...wrapText(selected.description, Math.max(20, width - 10), '  ').slice(0, 4).map((line) => Text(line, { wrap: false })),
    );
  }
  children.push(Text(fitInline('↑/↓ select · Enter open · Esc close', Math.max(24, width - 8)), { wrap: false }));
  return Modal({ title: ' Open Pull Request ', children, ...(height !== undefined ? { height } : {}) });
}

function confirmCommentModal(state, height = undefined) {
  return ConfirmPrompt({
    title: ' Post comment ',
    message: 'Post this review comment?',
    confirmLabel: 'Post',
    cancelLabel: 'Cancel',
    selected: state.confirmSelected,
    ...(height !== undefined ? { height } : {}),
  });
}

function generalPane(state, width, height) {
  const bodyWidth = Math.max(18, width - 6);
  const lines = [
    `#${state.pr.number} ${state.pr.title}`,
    '',
    `Author: ${state.pr.author}`,
    `Branch: ${state.pr.branch} → ${state.pr.base}`,
    `Status: ${state.pr.status}`,
    `Checks: ${state.pr.checks}`,
    `Risk: ${state.pr.risk}`,
    '',
    'Description (read-only)',
    ...wrapText(state.pr.description, bodyWidth, '  ').map((line) => `  ${line}`),
    '',
    `Commits (${state.pr.commits.length})`,
    ...state.pr.commits.map((commit, index) => `  ${index + 1}. ${commit.sha} ${fitInline(commit.title, Math.max(12, bodyWidth - 14)).trimEnd()} · ${commit.files.length} files`),
    '',
    `Comments (${state.pr.comments.length})`,
    ...state.pr.comments.slice(0, 5).flatMap((comment, index) => [
      `  ${index + 1}. ${comment.author} @ ${comment.location} [${comment.status}]`,
      ...wrapText(comment.body, Math.max(12, bodyWidth - 4), '    ').slice(0, 2).map((line) => `    ${line}`),
    ]),
    state.pr.comments.length > 5 ? `  … ${state.pr.comments.length - 5} more` : '',
    '',
    'Review flow',
    '  Tab switches the central pane. Commits chooses a commit, Diff reads patch changes, Comments opens discussion blocks.',
  ].filter((line) => line !== '');
  return scrollablePane({
    title: ` GENERAL #${state.pr.number} `,
    pane: 'general',
    state,
    lines,
    width,
    height,
    active: state.activeTab === 'general',
    footerLabel: '↑/↓ line · PgUp/PgDn page · read-only',
  });
}

function commitsPane(state, width, height) {
  const bodyWidth = Math.max(18, width - 6);
  const lines = [];
  state.pr.commits.forEach((commit, index) => {
    const selected = index === state.selectedCommitIndex;
    lines.push(`${selected ? '›' : ' '} ${commit.sha} ${commit.title}`);
    lines.push(`    by ${commit.author}`);
    for (const file of commit.files) lines.push(`    • ${fitInline(file, bodyWidth - 6).trimEnd()}`);
    if (index < state.pr.commits.length - 1) lines.push('');
  });
  return scrollablePane({
    title: ` COMMITS ${state.selectedCommitIndex + 1}/${state.pr.commits.length} `,
    pane: 'commits',
    state,
    lines,
    width,
    height,
    active: state.activeTab === 'commits',
    footerLabel: '↑/↓ select commit · Enter open diff',
  });
}

function diffPane(state, width, height) {
  const commit = selectedCommit(state);
  const lines = [
    `${commit.sha} ${commit.title}`,
    `Files: ${commit.files.join(', ')}`,
    '',
    ...commit.diff.map((line) => highlightPatchLine(line)),
  ];
  return scrollablePane({
    title: ` DIFF ${commit.sha} `,
    pane: 'diff',
    state,
    lines,
    width,
    height,
    active: state.activeTab === 'diff',
    footerLabel: '↑/↓ line · PgUp/PgDn page · [ and ] switch commit',
  });
}

function commentsPane(state, width, height) {
  const bodyWidth = Math.max(18, width - 8);
  clampSelectedComment(state);
  const { lines, starts } = commentThreadLayout(state, bodyWidth);
  state.commentLineAnchors = starts;
  const visibleRows = Math.max(1, Number(height) - 4);
  const max = scrollMax(lines.length, visibleRows);
  let scroll = state.paneScroll.comments ?? 0;

  if (state.commentMode === 'editor' || state.commentsSticky) {
    const previousTotalRows = state.scrollMetrics.comments?.totalRows ?? lines.length;
    scroll = resolveAutoScrollOffset({
      scroll,
      totalRows: lines.length,
      previousTotalRows,
      visibleRows,
      sticky: true,
    });
  } else {
    scroll = Math.max(0, Math.min(scroll, max));
    scroll = ensureSelectedCommentVisible({
      scroll,
      visibleRows,
      starts,
      selectedIndex: state.selectedCommentIndex,
      totalRows: lines.length,
    });
  }

  state.paneScroll.comments = scroll;
  state.scrollMetrics.comments = { totalRows: lines.length, visibleRows };
  state.commentsSticky = scroll >= max;

  const modeHelp = state.commentMode === 'editor'
    ? 'Enter post · Ctrl+J newline · Esc cancel'
    : '↑/↓ select · Enter read · N new comment · PgUp/PgDn scroll';

  return WorkspacePane({
    title: ` COMMENTS ${state.pr.comments.length}${state.commentMode === 'editor' ? ' · writing' : ''} `,
    active: state.activeTab === 'comments',
    height,
    children: [
      ScrollPane({
        title: '',
        lines,
        width: Math.max(10, width - 2),
        height: Math.max(3, height - 2),
        scroll: state.paneScroll.comments,
        footer: false,
        border: false,
      }),
      Text(`${modeHelp} · ${state.paneScroll.comments}/${scrollMax(lines.length, visibleRows)}`, { wrap: false }),
    ],
  });
}

function commentThreadLayout(state, width) {
  const lines = [];
  const starts = [];
  if (!state.pr.comments.length) {
    lines.push('No comments yet. Press N to write the first review comment.');
  }
  state.pr.comments.forEach((comment, index) => {
    starts[index] = lines.length;
    const selected = index === state.selectedCommentIndex;
    const title = `${selected ? '› ' : '  '}${comment.author} @ ${comment.location} [${comment.status}]`;
    lines.push(`┌─ ${title}`);
    const body = wrapText(comment.body, Math.max(8, width - 4), '  ');
    for (const row of body) lines.push(`│ ${row}`);
    lines.push(`└${'─'.repeat(Math.max(8, Math.min(width - 1, title.length + 4)))}${selected ? ' Enter read' : ''}`);
    if (index < state.pr.comments.length - 1) lines.push('');
  });
  if (state.commentMode === 'editor') {
    if (lines.length) lines.push('');
    lines.push('┌─ New review comment');
    const editorLines = renderTextEditorLines({
      value: state.commentEditor.value,
      cursor: state.commentEditor.cursor,
      width: Math.max(8, width - 4),
      height: Math.max(3, Math.min(6, 3 + state.commentEditor.value.split('\n').length)),
      placeholder: 'Write a comment. Enter posts, Ctrl+J adds a new line.',
      lineNumbers: false,
    });
    for (const line of editorLines) lines.push(`│ ${line}`);
    lines.push('└' + '─'.repeat(Math.max(8, Math.min(width - 1, 22))));
  }
  return { lines, starts };
}

function ensureSelectedCommentVisible({ scroll, visibleRows, starts, selectedIndex, totalRows }) {
  if (!starts.length) return scroll;
  const selectedTop = starts[selectedIndex] ?? 0;
  const nextStart = starts[selectedIndex + 1] ?? totalRows;
  const selectedBottom = Math.max(selectedTop, nextStart - 2);
  if (selectedTop < scroll) return selectedTop;
  if (selectedBottom >= scroll + visibleRows) return Math.max(0, selectedBottom - visibleRows + 1);
  return scroll;
}

function commentDetailModal(state, width, height) {
  const comment = selectedComment(state);
  if (!comment) {
    return Modal({
      title: ' Comment ',
      children: [Text('No comments to read. Press Esc to return to the Comments pane.')],
    });
  }

  const bodyWidth = Math.max(20, width - 10);
  const lines = [
    `Author: ${comment.author}`,
    `Location: ${comment.location}`,
    `Status: ${comment.status}`,
    '',
    'Body',
    ...wrapText(comment.body, bodyWidth, '  '),
    '',
    `PR: #${state.pr.number} ${state.pr.title}`,
  ];
  const visibleRows = Math.max(1, Number(height) - 7);
  const max = scrollMax(lines.length, visibleRows);
  state.commentDetailScroll = Math.max(0, Math.min(state.commentDetailScroll ?? 0, max));
  state.commentDetailMetrics = { totalRows: lines.length, visibleRows };

  return Modal({
    title: ' Read Comment ',
    children: [
      ScrollPane({
        title: '',
        lines,
        width: Math.max(10, width - 6),
        height: Math.max(4, visibleRows + 1),
        scroll: state.commentDetailScroll,
        border: false,
        footer: false,
      }),
      Text(`↑/↓ scroll · Esc back to Comments · ${state.commentDetailScroll}/${max}`, { wrap: false }),
    ],
  });
}

function scrollablePane({ title, pane, state, lines, width, height, active, footerLabel }) {
  const visibleRows = Math.max(1, Number(height) - 4);
  const metrics = state.scrollMetrics[pane] ?? { totalRows: 0, visibleRows };
  const result = resolveScrollKeyOffset({
    keyName: 'noop',
    scroll: state.paneScroll[pane] ?? 0,
    totalRows: lines.length,
    visibleRows,
    previousTotalRows: metrics.totalRows,
  });
  state.paneScroll[pane] = result.scroll;
  state.scrollMetrics[pane] = { totalRows: lines.length, visibleRows };
  return WorkspacePane({
    title,
    active,
    height,
    children: [
      ScrollPane({
        title: '',
        lines,
        width: Math.max(10, width - 2),
        height: Math.max(3, height - 2),
        scroll: state.paneScroll[pane] ?? 0,
        footer: false,
        border: false,
      }),
      Text(`${footerLabel} · ${state.paneScroll[pane] ?? 0}/${result.maxScroll}`, { wrap: false }),
    ],
  });
}

function handlePullRequestPickerKey(key, state) {
  if (key.name === 'up') {
    state.selectedPrIndex = mod(state.selectedPrIndex - 1, state.pullRequests.length);
    state.status = `Selected PR #${state.pullRequests[state.selectedPrIndex].number}.`;
    return;
  }
  if (key.name === 'down') {
    state.selectedPrIndex = mod(state.selectedPrIndex + 1, state.pullRequests.length);
    state.status = `Selected PR #${state.pullRequests[state.selectedPrIndex].number}.`;
    return;
  }
  if (key.name === 'enter') {
    openSelectedPullRequest(state);
    return;
  }
  if (key.name === 'escape') {
    state.modes.pop();
    state.status = `Reviewing PR #${state.pr.number}.`;
  }
}

function handleConfirmKey(key, state) {
  if (key.name === 'escape') {
    state.modes.pop();
    state.confirmSelected = 'confirm';
    state.status = 'Comment cancelled.';
    return;
  }
  if (key.name === 'left' || key.name === 'right') {
    state.confirmSelected = state.confirmSelected === 'confirm' ? 'cancel' : 'confirm';
    state.status = `Confirm choice: ${state.confirmSelected}.`;
    return;
  }
  if (key.name !== 'enter') return;
  state.modes.pop();
  if (state.confirmSelected === 'cancel') {
    state.confirmSelected = 'confirm';
    state.status = 'Comment cancelled.';
    return;
  }
  postComment(state);
  state.confirmSelected = 'confirm';
}

function handleGeneralKey({ key, state }) {
  if (isScrollKey(key.name)) return scrollPaneByKey(state, 'general', key.name);
  if (key.name === 'enter') state.status = 'Description is read-only in this PR review view.';
}

function handleCommitsKey({ key, state }) {
  if (key.name === 'up') return moveCommitSelection(state, -1);
  if (key.name === 'down') return moveCommitSelection(state, 1);
  if (key.name === 'page-up' || key.name === 'page-down') return scrollPaneByKey(state, 'commits', key.name);
  if (key.name === 'home') return setCommitSelection(state, 0);
  if (key.name === 'end') return setCommitSelection(state, state.pr.commits.length - 1);
  if (key.name === 'enter') {
    state.activeTab = 'diff';
    state.paneScroll.diff = 0;
    state.status = `Opened diff for ${selectedCommit(state).sha}.`;
    return;
  }
  if (key.name === 'escape') {
    state.activeTab = 'general';
    state.status = 'Returned to General.';
  }
}

function handleDiffKey({ key, state }) {
  if (key.name === '[') {
    setCommitSelection(state, state.selectedCommitIndex - 1);
    state.activeTab = 'diff';
    return;
  }
  if (key.name === ']') {
    setCommitSelection(state, state.selectedCommitIndex + 1);
    state.activeTab = 'diff';
    return;
  }
  if (key.name === 'escape') {
    state.activeTab = 'commits';
    state.status = 'Returned to Commits.';
    return;
  }
  if (isScrollKey(key.name)) scrollPaneByKey(state, 'diff', key.name);
}

function handleCommentsKey({ key, state }) {
  if (state.commentMode === 'editor') return handleCommentEditorKey(key, state);
  if (key.name === 'up') return moveCommentSelection(state, -1);
  if (key.name === 'down') return moveCommentSelection(state, 1);
  if (key.name === 'page-up' || key.name === 'page-down') return scrollPaneByKey(state, 'comments', key.name);
  if (key.name === 'home') return setCommentSelection(state, 0);
  if (key.name === 'end') return setCommentSelection(state, state.pr.comments.length - 1);
  if (key.name === 'enter') return openSelectedComment(state);
  if (key.name === 'n' || key.name === 'r') {
    state.commentMode = 'editor';
    state.commentEditor.clear();
    state.commentsSticky = true;
    state.status = 'Writing a review comment.';
    return;
  }
  if (key.name === 'escape') {
    state.activeTab = 'general';
    state.status = 'Returned to General.';
  }
}

function handleCommentDetailKey(key, state) {
  if (key.name === 'escape' || key.name === 'enter') {
    state.modes.pop();
    state.activeTab = 'comments';
    state.status = 'Returned to Comments.';
    return;
  }
  if (!isScrollKey(key.name)) return;
  const metrics = state.commentDetailMetrics ?? { totalRows: 0, visibleRows: 1 };
  const result = resolveScrollKeyOffset({
    keyName: key.name,
    scroll: state.commentDetailScroll ?? 0,
    totalRows: metrics.totalRows,
    visibleRows: metrics.visibleRows,
    pageStep: metrics.visibleRows,
  });
  if (!result.handled) return;
  state.commentDetailScroll = result.scroll;
  state.status = result.maxScroll ? `comment scroll ${result.scroll}/${result.maxScroll}.` : 'Comment fits without scrolling.';
}

function handleCommentEditorKey(key, state) {
  if (key.name === 'escape') {
    state.commentMode = 'list';
    state.status = 'Comment draft cancelled.';
    return;
  }
  if (key.name === 'page-up' || key.name === 'page-down') return scrollPaneByKey(state, 'comments', key.name);
  if (key.name === 'enter' && !key.ctrl) {
    if (!state.commentEditor.value.trim()) {
      state.status = 'Empty comment ignored.';
      return;
    }
    state.modes.push('confirm');
    state.status = 'Confirm posting the comment.';
    return;
  }
  if ((key.name === 'enter' && key.ctrl) || key.name === 'ctrl-j') {
    state.commentEditor.insertLineBreak();
    state.commentsSticky = true;
    state.status = 'Inserted a new line in the comment.';
    return;
  }
  editInput(state.commentEditor, key, state, 'comment');
  state.commentsSticky = true;
}

function scrollPaneByKey(state, pane, keyName) {
  const metrics = state.scrollMetrics[pane] ?? { totalRows: 0, visibleRows: 1 };
  const result = resolveScrollKeyOffset({
    keyName,
    scroll: state.paneScroll[pane] ?? 0,
    totalRows: metrics.totalRows,
    visibleRows: metrics.visibleRows,
    pageStep: metrics.visibleRows,
  });
  if (!result.handled) return;
  state.paneScroll[pane] = result.scroll;
  if (pane === 'comments') state.commentsSticky = result.atBottom;
  state.status = result.maxScroll ? `${pane} scroll ${result.scroll}/${result.maxScroll}.` : `${pane} fits without scrolling.`;
}

function openPullRequestPicker(state) {
  if (state.modes.current() !== 'pr-picker') state.modes.push('pr-picker');
  state.status = 'Choose a pull request.';
}

function openSelectedPullRequest(state) {
  return openPullRequestByIndex(state, state.selectedPrIndex);
}

function openPullRequestByIndex(state, index, options = {}) {
  const next = state.pullRequests[index];
  if (!next) return null;
  state.selectedPrIndex = index;
  state.pr = clonePullRequest(next);
  state.descriptionEditor = new InputEditor(state.pr.description);
  state.commentEditor.clear();
  state.commentMode = 'list';
  state.selectedCommitIndex = 0;
  state.selectedCommentIndex = 0;
  state.paneScroll = { general: 0, commits: 0, diff: 0, comments: 0 };
  state.scrollMetrics = {
    general: { totalRows: 0, visibleRows: 1 },
    commits: { totalRows: 0, visibleRows: 1 },
    diff: { totalRows: 0, visibleRows: 1 },
    comments: { totalRows: 0, visibleRows: 1 },
  };
  state.commentsSticky = true;
  state.reviewBlocks = buildReviewBlocks(`${state.pr.title} ${state.pr.description}`);
  state.activeTab = 'general';
  state.modes.reset();
  if (!options.preserveToast) {
    state.toastTarget = null;
    state.toasts?.show(`Opened PR #${state.pr.number}. Live comments will appear as review activity changes.`, 'success', 6);
  }
  state.status = `Opened PR #${state.pr.number}.`;
  return state.pr;
}

function postComment(state) {
  const body = state.commentEditor.value.trim();
  if (!body) {
    state.status = 'Empty comment ignored.';
    return;
  }
  const target = selectedCommit(state);
  const comment = {
    author: 'you',
    location: `${target.files[0] ?? 'general'}:${Math.max(1, 40 + state.pr.comments.length)}`,
    body,
    status: 'open',
  };
  state.pr.comments.push(comment);
  state.selectedCommentIndex = state.pr.comments.length - 1;
  state.commentEditor.clear();
  state.commentMode = 'list';
  state.commentsSticky = true;
  syncCurrentPullRequest(state);
  state.toasts?.show(`Posted comment on ${comment.location}.`, 'success', 5);
  state.status = `Posted comment on ${comment.location}.`;
}

function syncCurrentPullRequest(state) {
  const index = state.pullRequests.findIndex((pr) => pr.id === state.pr.id);
  if (index >= 0) state.pullRequests[index] = clonePullRequest(state.pr);
}


function selectedComment(state) {
  clampSelectedComment(state);
  return state.pr.comments[state.selectedCommentIndex] ?? null;
}

function moveCommentSelection(state, delta) {
  setCommentSelection(state, state.selectedCommentIndex + delta);
}

function setCommentSelection(state, index) {
  if (!state.pr.comments.length) {
    state.selectedCommentIndex = 0;
    state.status = 'No comments to select.';
    return;
  }
  state.selectedCommentIndex = mod(index, state.pr.comments.length);
  state.commentsSticky = false;
  const selected = selectedComment(state);
  state.status = `Selected comment from ${selected.author} at ${selected.location}.`;
}

function openSelectedComment(state) {
  const comment = selectedComment(state);
  if (!comment) {
    state.status = 'No comments to read.';
    return;
  }
  if (state.modes.current() !== 'comment-detail') state.modes.push('comment-detail');
  state.commentDetailScroll = 0;
  state.status = `Reading comment from ${comment.author}.`;
}

function clampSelectedComment(state) {
  const count = state.pr?.comments?.length ?? 0;
  if (!count) {
    state.selectedCommentIndex = 0;
    return;
  }
  state.selectedCommentIndex = mod(state.selectedCommentIndex ?? 0, count);
}

function selectedCommit(state) {
  return state.pr.commits[mod(state.selectedCommitIndex, state.pr.commits.length)] ?? state.pr.commits[0];
}

function moveCommitSelection(state, delta) {
  setCommitSelection(state, state.selectedCommitIndex + delta);
}

function setCommitSelection(state, index) {
  state.selectedCommitIndex = mod(index, state.pr.commits.length);
  state.paneScroll.diff = 0;
  state.status = `Selected commit ${selectedCommit(state).sha}.`;
}

function contextHelpHints(state) {
  if (state.modes.current() === 'pr-picker') {
    return [['↑/↓', 'select pull request'], ['Enter', 'open PR'], ['Esc', 'close picker'], ['Ctrl+C', 'exit']];
  }
  if (state.modes.current() === 'confirm') {
    return [['←/→', 'choose post/cancel'], ['Enter', 'accept'], ['Esc', 'cancel'], ['Ctrl+O', 'open PR picker'], ['Ctrl+C', 'exit']];
  }
  if (state.modes.current() === 'comment-detail') {
    return [['↑/↓', 'scroll comment'], ['Enter/Esc', 'back to comments'], ['Ctrl+O', 'open PR picker'], ['Ctrl+C', 'exit']];
  }
  if (state.activeTab === 'general') {
    return [['↑/↓', 'scroll line'], ['PgUp/PgDn', 'scroll page'], ['Enter', 'read-only note'], ['Ctrl+O', 'open PR picker'], ['Tab', 'switch pane'], ['Ctrl+C', 'exit']];
  }
  if (state.activeTab === 'commits') {
    return [['↑/↓', 'select commit'], ['Enter', 'open diff'], ['Home/End', 'first/last'], ['Ctrl+O', 'open PR picker'], ['Tab', 'switch pane'], ['Ctrl+C', 'exit']];
  }
  if (state.activeTab === 'diff') {
    return [['↑/↓', 'scroll line'], ['PgUp/PgDn', 'scroll page'], ['[ and ]', 'switch commit'], ['Esc', 'back to commits'], ['Ctrl+O', 'open PR picker'], ['Ctrl+C', 'exit']];
  }
  if (state.commentMode === 'editor') {
    return [['Enter', 'post comment'], ['Ctrl+J', 'new line'], ['PgUp/PgDn', 'scroll thread'], ['Esc', 'cancel draft'], ['Ctrl+O', 'open PR picker'], ['Ctrl+C', 'exit']];
  }
  return [['↑/↓', 'select comment'], ['PgUp/PgDn', 'scroll page'], ['Enter', 'read selected'], ['N/R', 'new comment'], ['Ctrl+O', 'open PR picker'], ['Ctrl+C', 'exit']];
}

function editInput(editor, key, state, label) {
  if (key.name === 'up') {
    editor.moveVertical(-1);
    state.status = `Moved inside ${label}.`;
    return;
  }
  if (key.name === 'down') {
    editor.moveVertical(1);
    state.status = `Moved inside ${label}.`;
    return;
  }
  if (key.name === 'left') {
    key.meta ? editor.moveWord(-1) : editor.move(-1);
    state.status = `Moved ${label} cursor.`;
    return;
  }
  if (key.name === 'right') {
    key.meta ? editor.moveWord(1) : editor.move(1);
    state.status = `Moved ${label} cursor.`;
    return;
  }
  if (key.name === 'home' || (key.cmd && key.name === 'left')) {
    editor.lineStart();
    state.status = `Moved to ${label} line start.`;
    return;
  }
  if (key.name === 'end' || (key.cmd && key.name === 'right')) {
    editor.lineEnd();
    state.status = `Moved to ${label} line end.`;
    return;
  }
  if (key.name === 'backspace') {
    editor.backspace();
    state.status = `Edited ${label}.`;
    return;
  }
  if (key.name === 'delete') {
    editor.deleteForward();
    state.status = `Edited ${label}.`;
    return;
  }
  if (key.name === 'kill-end') {
    editor.killToEnd();
    state.status = `Edited ${label}.`;
    return;
  }
  if (key.name === 'kill-start') {
    editor.killToStart();
    state.status = `Edited ${label}.`;
    return;
  }
  if (key.name === 'delete-word-left') {
    editor.deleteWordBack();
    state.status = `Edited ${label}.`;
    return;
  }
  if (key.name === 'paste') {
    editor.insert(key.text);
    state.status = `Pasted into ${label}.`;
    return;
  }
  if (key.printable) {
    editor.insert(key.text);
    state.status = `Editing ${label}.`;
  }
}

function highlightPatchLine(line) {
  const value = String(line ?? '');
  if (value.startsWith('+') && !value.startsWith('+++')) return color(themes.dark, 'ok', value);
  if (value.startsWith('-') && !value.startsWith('---')) return color(themes.dark, 'error', value);
  if (value.startsWith('@@')) return color(themes.dark, 'accent', value);
  if (value.startsWith('diff --git')) return color(themes.dark, 'muted', value);
  return value;
}

function isScrollKey(name) {
  return name === 'up' || name === 'down' || name === 'page-up' || name === 'page-down';
}

function ensurePullRequest(state) {
  state.pullRequests = state.pullRequests?.length ? state.pullRequests : clonePullRequests();
  if (!state.pr) state.pr = clonePullRequest(state.pullRequests[state.selectedPrIndex || 0] ?? PULL_REQUESTS[0]);
  state.descriptionEditor = state.descriptionEditor ?? new InputEditor(state.pr.description);
  state.commentEditor = state.commentEditor ?? new InputEditor('');
  state.selectedCommentIndex = state.selectedCommentIndex ?? 0;
  state.commentLineAnchors = state.commentLineAnchors ?? [];
  state.commentDetailScroll = state.commentDetailScroll ?? 0;
  state.commentDetailMetrics = state.commentDetailMetrics ?? { totalRows: 0, visibleRows: 1 };
  state.commentMode = state.commentMode ?? 'list';
  state.toasts = state.toasts ?? createToastManager();
  state.toastTarget = state.toastTarget ?? null;
  state.liveCommentCursor = state.liveCommentCursor ?? 0;
  state.liveCommentCountdown = state.liveCommentCountdown ?? createInitialLiveDelay();
  state.paneScroll = state.paneScroll ?? { general: 0, commits: 0, diff: 0, comments: 0 };
  state.scrollMetrics = state.scrollMetrics ?? {
    general: { totalRows: 0, visibleRows: 1 },
    commits: { totalRows: 0, visibleRows: 1 },
    diff: { totalRows: 0, visibleRows: 1 },
    comments: { totalRows: 0, visibleRows: 1 },
  };
}

function clonePullRequests() {
  return PULL_REQUESTS.map(clonePullRequest);
}

function clonePullRequest(pr) {
  return {
    ...pr,
    commits: pr.commits.map((commit) => ({ ...commit, files: [...commit.files], diff: [...commit.diff] })),
    comments: pr.comments.map((comment) => ({ ...comment })),
  };
}

function mod(value, size) {
  const safeSize = Math.max(1, Number(size) || 1);
  return ((value % safeSize) + safeSize) % safeSize;
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'AI Code Review Terminal',
    state: createCodeReviewState(),
    render: createCodeReviewView,
    onKey: handleCodeReviewKey,
    onTick: tickCodeReview,
    tickMs: 1000,
  });
}
