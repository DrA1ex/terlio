import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderToString } from '../src/lib/index.js';
import { createEditorLabState, createEditorLabView, handleEditorLabKey } from '../examples/editor-lab.js';
import { createCommandPaletteState, createCommandPaletteView, getFilteredActions, handleCommandPaletteKey } from '../examples/command-palette.js';
import { createStreamingWorkbenchState, createStreamingWorkbenchView } from '../examples/streaming-workbench.js';
import { createComponentsShowcaseView, createDiffShowcase, renderComponentsShowcase } from '../examples/components-showcase.js';
import { createInteractionKitState, createInteractionKitView, handleInteractionKitKey } from '../examples/interaction-kit.js';

test('package exposes runnable example scripts', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.start, 'node examples/mock-ai-terminal.js');
  assert.equal(pkg.scripts.examples, 'node examples/index.js');
  assert.equal(pkg.scripts['example:editor'], 'node examples/editor-lab.js');
  assert.equal(pkg.scripts['example:palette'], 'node examples/command-palette.js');
  assert.equal(pkg.scripts['example:stream'], 'node examples/streaming-workbench.js');
  assert.equal(pkg.scripts['example:components'], 'node examples/components-showcase.js');
  assert.equal(pkg.scripts['example:kit'], 'node examples/interaction-kit.js');
});

test('editor lab view renders live editor state and reacts to editing keys', () => {
  const state = createEditorLabState();
  handleEditorLabKey({ key: { name: 'kill-start' }, state });
  handleEditorLabKey({ key: { name: 'x', printable: true, text: 'x' }, state });
  const output = renderToString(createEditorLabView({ state, width: 90 }), { width: 90, height: 24 });
  assert.match(output, /Editor Lab/);
  assert.match(output, /value : x/);
  assert.match(output, /Last keys|History/);
});

test('command palette filters actions and renders a selected scrollable list', () => {
  const state = createCommandPaletteState();
  state.search.set('theme');
  handleCommandPaletteKey({ key: { name: 'down' }, state, runtime: { exit() {} } });
  const matches = getFilteredActions(state.search.value);
  const output = renderToString(createCommandPaletteView({ state, width: 96 }), { width: 96, height: 24 });
  assert.ok(matches.length >= 3);
  assert.match(output, /Command Palette/);
  assert.match(output, /theme\.ocean|theme\.matrix|theme\.dark/);
});

test('streaming workbench view renders prompt, controls and transcript area', () => {
  const state = createStreamingWorkbenchState();
  state.messages.push({ role: 'user', content: 'hello' });
  state.messages.push({ role: 'assistant', content: 'streamed answer' });
  const output = renderToString(createStreamingWorkbenchView({ state, width: 96 }), { width: 96, height: 24 });
  assert.match(output, /Streaming Workbench/);
  assert.match(output, /streamed answer/);
  assert.match(output, /Esc/);
});

test('components showcase can render without a TTY and exposes frame diff operations', () => {
  const output = renderComponentsShowcase({ width: 88, height: 22 });
  const directOutput = renderToString(createComponentsShowcaseView(), { width: 88, height: 22 });
  const diff = createDiffShowcase();
  assert.equal(output, directOutput);
  assert.match(output, /Components Showcase/);
  assert.deepEqual(diff.map((item) => item.row), [1, 2, 3]);
});


test('interaction kit renders reusable widgets and mode overlays', () => {
  const state = createInteractionKitState();
  const output = renderToString(createInteractionKitView({ state, width: 100 }), { width: 100, height: 28 });
  assert.match(output, /Interaction Kit/);
  assert.match(output, /renderer alive/);
  assert.match(output, /Command Palette/);

  for (const char of 'confirm') {
    handleInteractionKitKey({ key: { name: char, printable: true, text: char }, state, runtime: { exit() {} } });
  }
  handleInteractionKitKey({ key: { name: 'enter' }, state, runtime: { exit() {} } });
  assert.equal(state.modes.current(), 'confirm');

  const confirmView = renderToString(createInteractionKitView({ state, width: 100 }), { width: 100, height: 28 });
  assert.match(confirmView, /Confirm action/);
});
