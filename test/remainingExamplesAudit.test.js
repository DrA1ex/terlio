import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString, stripAnsi, visibleLength } from '../src/lib/index.js';
import { createEditorLabState, createEditorLabView, handleEditorLabKey } from '../examples/editor-lab.js';
import { createCommandPaletteState, createCommandPaletteView, getFilteredActions, handleCommandPaletteKey, tickCommandPalette } from '../examples/command-palette.js';
import { createStreamingWorkbenchState, createStreamingWorkbenchView, cleanupStreamingWorkbench } from '../examples/streaming-workbench.js';
import { createKeyInspectorState, createKeyInspectorView } from '../examples/keys.js';
import { createThemeGalleryState, createThemeGalleryView, handleThemeGalleryKey, tickThemeGallery } from '../examples/themes.js';
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

test('release command center ranks fuzzy aliases and keeps disabled actions safe', () => {
  const fuzzy = getFilteredActions('rlschk');
  assert.equal(fuzzy[0].id, 'release.checks.run');

  const runtime = { exit() {} };
  const state = createCommandPaletteState();
  handleCommandPaletteKey({ key: { name: 'enter' }, state, runtime });
  for (const char of 'approval') {
    handleCommandPaletteKey({ key: { name: char, printable: true, text: char }, state, runtime });
  }
  handleCommandPaletteKey({ key: { name: 'enter' }, state, runtime });
  assert.equal(state.release.approved, false);
  assert.match(state.status, /checks|notes/i);
  assert.ok(state.overlays.toasts.some((toast) => toast.level === 'warning'));

  state.overlays.pop();
  handleCommandPaletteKey({ key: { name: 'a', printable: true, text: 'a' }, state, runtime });
  assert.equal(state.release.approved, false);
  assert.match(state.status, /checks|notes/i);

  const output = stripAnsi(renderToString(createCommandPaletteView({ state, width: 100, height: 30 }), { width: 100, height: 30 }));
  assert.match(output, /disabled|blocked/i);
});

test('release command activity and follow-up popup stay within responsive frames', () => {
  const runtime = { exit() {} };
  const state = createCommandPaletteState();
  handleCommandPaletteKey({ key: { name: 'enter' }, state, runtime });
  for (const char of 'checks') handleCommandPaletteKey({ key: { name: char, printable: true, text: char }, state, runtime });
  handleCommandPaletteKey({ key: { name: 'enter' }, state, runtime });
  assert.equal(state.overlays.top()?.type, 'operation');

  for (const [width, height] of [[72, 22], [80, 24], [100, 30], [136, 39]]) {
    const output = renderToString(createCommandPaletteView({ state, width, height }), { width, height });
    const lines = output.split('\n');
    assert.equal(lines.length, height);
    assert.ok(lines.every((line) => visibleLength(line) <= width));
  }

  tickCommandPalette({ state, runtime, delta: 3 });
  assert.equal(state.overlays.top()?.type, 'modal');
  for (const [width, height] of [[72, 22], [80, 24], [100, 30], [136, 39]]) {
    const output = renderToString(createCommandPaletteView({ state, width, height }), { width, height });
    const lines = output.split('\n');
    assert.equal(lines.length, height);
    assert.ok(lines.every((line) => visibleLength(line) <= width));
  }
});

test('streaming workbench cleans up pending timers', () => {
  const workbench = createStreamingWorkbenchState();
  workbench.streamTimer = setTimeout(() => {}, 1000);
  workbench.streaming = true;
  cleanupStreamingWorkbench({ state: workbench });
  assert.equal(workbench.streamTimer, null);
  assert.equal(workbench.streaming, false);
});



test('theme studio stages candidates, applies them to the root shell and supports comparison', () => {
  const state = createThemeGalleryState();
  const initialApplied = state.appliedTheme;
  const initialSelected = state.selectedIndex;
  const initialFrame = renderToString(createThemeGalleryView({ state, width: 100, height: 30 }), { width: 100, height: 30 });

  handleThemeGalleryKey({ key: { name: 'down' }, state });
  assert.notEqual(state.selectedIndex, initialSelected);
  assert.equal(state.appliedTheme, initialApplied, 'selection should only stage a candidate');
  const stagedFrame = renderToString(createThemeGalleryView({ state, width: 100, height: 30 }), { width: 100, height: 30 });
  assert.equal(initialFrame.split('\n')[0], stagedFrame.split('\n')[0], 'root shell should keep the applied theme before Enter');

  handleThemeGalleryKey({ key: { name: 'c', printable: true, text: 'c' }, state });
  assert.equal(state.previewMode, 'compare');
  handleThemeGalleryKey({ key: { name: 'enter' }, state });
  assert.notEqual(state.appliedTheme, initialApplied);
  const appliedSelectedIndex = state.selectedIndex;
  assert.equal(state.overlays.toasts.length, 1);
  const appliedFrame = renderToString(createThemeGalleryView({ state, width: 100, height: 30 }), { width: 100, height: 30 });
  assert.notEqual(appliedFrame.split('\n')[0], initialFrame.split('\n')[0], 'applying should recolor the root shell');

  tickThemeGallery({ state, delta: 3 });
  assert.equal(state.overlays.toasts.length, 0);

  handleThemeGalleryKey({ key: { name: 'up' }, state });
  handleThemeGalleryKey({ key: { name: 'r', printable: true, text: 'r' }, state });
  assert.equal(state.selectedIndex, appliedSelectedIndex);
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
