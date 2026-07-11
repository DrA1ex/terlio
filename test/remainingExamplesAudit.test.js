import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString, stripAnsi, visibleLength } from '../src/lib/index.js';
import { createEditorLabState, createEditorLabView, handleEditorLabKey } from '../examples/editor-lab.js';
import { createCommandPaletteState, createCommandPaletteView, getFilteredActions, handleCommandPaletteKey } from '../examples/command-palette.js';
import { createStreamingWorkbenchState, createStreamingWorkbenchView, cleanupStreamingWorkbench } from '../examples/streaming-workbench.js';
import { createKeyInspectorState, createKeyInspectorView } from '../examples/keys.js';
import { createThemeGalleryState, createThemeGalleryView, handleThemeGalleryKey } from '../examples/themes.js';
import { createBlocksGalleryState, createBlocksGalleryView, handleBlocksGalleryKey } from '../examples/blocks.js';
import { createComponentsShowcaseView } from '../examples/components-showcase.js';

const renderCases = [
  ['editor', createEditorLabState, createEditorLabView],
  ['palette', createCommandPaletteState, createCommandPaletteView],
  ['stream', createStreamingWorkbenchState, createStreamingWorkbenchView],
  ['keys', createKeyInspectorState, createKeyInspectorView],
  ['themes', createThemeGalleryState, createThemeGalleryView],
  ['blocks', createBlocksGalleryState, createBlocksGalleryView],
  ['components', () => null, ({ width, height }) => createComponentsShowcaseView({ width, height })],
];

test('remaining examples render exact frames without width overflow', () => {
  for (const [name, createState, createView] of renderCases) {
    for (const [width, height] of [[60, 19], [80, 24], [100, 30], [136, 39], [160, 40]]) {
      const output = renderToString(createView({ state: createState(), width, height }), { width, height });
      const lines = output.split('\n');
      assert.equal(lines.length, height, `${name} should fill ${width}x${height}`);
      assert.ok(lines.every((line) => visibleLength(line) <= width), `${name} should not overflow ${width} columns`);
    }
  }
});

test('interactive examples use explicit compact fallbacks on undersized terminals', () => {
  const examples = [
    [createEditorLabState, createEditorLabView],
    [createCommandPaletteState, createCommandPaletteView],
    [createStreamingWorkbenchState, createStreamingWorkbenchView],
    [createKeyInspectorState, createKeyInspectorView],
    [createThemeGalleryState, createThemeGalleryView],
    [createBlocksGalleryState, createBlocksGalleryView],
  ];
  for (const [createState, createView] of examples) {
    const output = stripAnsi(renderToString(createView({ state: createState(), width: 48, height: 16 }), { width: 48, height: 16 }));
    assert.match(output, /needs more room/);
  }
});

test('editor history supports edge navigation and deleting saved drafts without editing the hidden buffer', () => {
  const state = createEditorLabState();
  state.activeTab = 'history';
  handleEditorLabKey({ key: { name: 'end' }, state });
  assert.equal(state.historySelection, state.history.length);
  const value = state.editor.value;
  handleEditorLabKey({ key: { name: 'left' }, state });
  assert.equal(state.editor.value, value);
  handleEditorLabKey({ key: { name: 'home' }, state });
  const before = state.history.length;
  handleEditorLabKey({ key: { name: 'delete' }, state });
  assert.equal(state.history.length, before - 1);
  assert.match(state.status, /Deleted saved draft/);
});

test('command palette ranks subsequence matches and keeps accepted results local', () => {
  const fuzzy = getFilteredActions('ctnw');
  assert.equal(fuzzy[0][0], 'chat.new');
  const state = createCommandPaletteState();
  for (const char of 'ocean') handleCommandPaletteKey({ key: { name: char, printable: true, text: char }, state, runtime: { exit() {} } });
  handleCommandPaletteKey({ key: { name: 'enter' }, state, runtime: { exit() {} } });
  assert.equal(state.activeTab, 'accepted');
  assert.match(state.accepted.at(-1), /theme\.ocean/);
  const output = stripAnsi(renderToString(createCommandPaletteView({ state, width: 100, height: 30 }), { width: 100, height: 30 }));
  assert.match(output, /accepted in this local demo/);
});

test('streaming workbench cleans up pending timers', () => {
  const workbench = createStreamingWorkbenchState();
  workbench.streamTimer = setTimeout(() => {}, 1000);
  workbench.streaming = true;
  cleanupStreamingWorkbench({ state: workbench });
  assert.equal(workbench.streamTimer, null);
  assert.equal(workbench.streaming, false);
});

test('theme gallery and structured response explorer expose contextual navigation', () => {
  const themeState = createThemeGalleryState();
  handleThemeGalleryKey({ key: { name: 'tab', shift: false }, state: themeState });
  assert.equal(themeState.activeTab, 'preview');
  handleThemeGalleryKey({ key: { name: 'page-down' }, state: themeState });
  assert.ok(themeState.paneScroll.preview > 0);

  const blockState = createBlocksGalleryState();
  handleBlocksGalleryKey({ key: { name: 'down' }, state: blockState });
  assert.equal(blockState.selectedIndex, 1);
  handleBlocksGalleryKey({ key: { name: 'enter' }, state: blockState });
  assert.equal(blockState.isolated, true);
  assert.equal(blockState.focus, 'response');
  handleBlocksGalleryKey({ key: { name: 'escape' }, state: blockState });
  handleBlocksGalleryKey({ key: { name: 'tab', shift: false }, state: blockState });
  assert.equal(blockState.focus, 'response');
});
