import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderToString } from '../src/lib/index.js';
import { createEditorLabState, createEditorLabView, handleEditorLabKey } from '../examples/editor-lab.js';
import { createCommandPaletteState, createCommandPaletteView, getFilteredActions, handleCommandPaletteKey } from '../examples/command-palette.js';
import { createStreamingWorkbenchState, createStreamingWorkbenchView, handleStreamingWorkbenchKey } from '../examples/streaming-workbench.js';
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
  assert.match(output, /LOCAL HELP/);
  assert.match(output, /submit draft/);
});

test('editor lab keeps editor arrows local, supports Ctrl-J and lets history arrows select rows', () => {
  const state = createEditorLabState();
  state.editor.set('first line\nsecond line');
  state.activeTab = 'editor';
  handleEditorLabKey({ key: { name: 'up' }, state });
  assert.equal(state.editor.value, 'first line\nsecond line');
  assert.equal(state.historyIndex, null);

  state.editor.end();
  handleEditorLabKey({ key: { name: 'enter', ctrl: true }, state });
  assert.equal(state.editor.value, 'first line\nsecond line\n');

  state.activeTab = 'history';
  state.historySelection = 1;
  handleEditorLabKey({ key: { name: 'down' }, state });
  assert.equal(state.historySelection, 2);
  handleEditorLabKey({ key: { name: 'enter' }, state });
  assert.equal(state.activeTab, 'editor');
  assert.equal(state.editor.value, 'explain how frame diffing reduces flicker');

  state.activeTab = 'history';
  state.historySelection = state.history.length;
  handleEditorLabKey({ key: { name: 'enter' }, state });
  assert.equal(state.activeTab, 'editor');
  assert.equal(state.editor.value, '');

  const historyOutput = renderToString(createEditorLabView({ state: { ...state, activeTab: 'history' }, width: 90, height: 32 }), { width: 90, height: 32 });
  assert.match(historyOutput, /Add another/);
  assert.match(historyOutput, /┬|┼/);

  state.activeTab = 'diagnostics';
  const initialOutput = renderToString(createEditorLabView({ state, width: 90, height: 32 }), { width: 90, height: 32 });
  assert.match(initialOutput, /Cursor preview/);
  assert.match(initialOutput, /Editor state/);
  assert.doesNotMatch(initialOutput, /Navigation notes/);
  const beforeArrow = state.paneScroll.diagnostics;
  handleEditorLabKey({ key: { name: 'down' }, state });
  assert.equal(state.paneScroll.diagnostics, beforeArrow);
  handleEditorLabKey({ key: { name: 'page-down' }, state });
  assert.ok(state.paneScroll.diagnostics > beforeArrow);
});

test('editor lab updates selected drafts and only creates a new draft from add another', () => {
  const state = createEditorLabState();
  const initialLength = state.history.length;

  state.activeTab = 'history';
  state.historySelection = 1;
  handleEditorLabKey({ key: { name: 'enter' }, state });
  assert.equal(state.activeTab, 'editor');
  assert.equal(state.editingHistoryIndex, 1);

  state.editor.set('updated saved draft');
  handleEditorLabKey({ key: { name: 'enter' }, state });
  assert.equal(state.history.length, initialLength);
  assert.equal(state.history[1], 'updated saved draft');
  assert.equal(state.historySelection, 1);
  assert.equal(state.editingHistoryIndex, null);

  state.activeTab = 'history';
  state.historySelection = state.history.length;
  handleEditorLabKey({ key: { name: 'enter' }, state });
  assert.equal(state.activeTab, 'editor');
  assert.equal(state.editingHistoryIndex, null);

  state.editor.set('brand new draft');
  handleEditorLabKey({ key: { name: 'enter' }, state });
  assert.equal(state.history.length, initialLength + 1);
  assert.equal(state.history.at(-1), 'brand new draft');
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

test('command palette routes keys only to the active tab', () => {
  const state = createCommandPaletteState();
  const before = state.selectedIndex;
  state.activeTab = 'details';
  handleCommandPaletteKey({ key: { name: 'down' }, state, runtime: { exit() {} } });
  assert.equal(state.selectedIndex, before);
  assert.match(state.status, /read-only/);

  state.activeTab = 'palette';
  handleCommandPaletteKey({ key: { name: 'enter' }, state, runtime: { exit() {} } });
  assert.equal(state.activeTab, 'accepted');
  assert.equal(state.accepted.length, 1);
  handleCommandPaletteKey({ key: { name: 'up' }, state, runtime: { exit() {} } });
  assert.equal(state.acceptedSelection, 0);
});

test('streaming workbench view renders prompt, controls and transcript area', () => {
  const state = createStreamingWorkbenchState();
  state.messages.push({ role: 'user', content: 'hello' });
  state.messages.push({ role: 'assistant', content: 'streamed answer' });
  state.activeTab = 'transcript';
  const output = renderToString(createStreamingWorkbenchView({ state, width: 96 }), { width: 96, height: 24 });
  assert.match(output, /Streaming Workbench/);
  assert.match(output, /streamed answer/);
  assert.match(output, /Esc/);
});

test('streaming workbench keeps arrows local and uses explicit sample shortcuts', () => {
  const state = createStreamingWorkbenchState();
  state.activeTab = 'transcript';
  handleStreamingWorkbenchKey({ key: { name: 'down' }, state, runtime: { invalidate() {} } });
  assert.equal(state.replyIndex, 0);
  assert.match(state.status, /PageUp\/PageDown/);

  state.activeTab = 'prompt';
  handleStreamingWorkbenchKey({ key: { name: ']', printable: true, text: ']' }, state, runtime: { invalidate() {} } });
  assert.equal(state.replyIndex, 1);
  handleStreamingWorkbenchKey({ key: { name: 'enter', ctrl: true }, state, runtime: { invalidate() {} } });
  assert.match(state.prompt.value, /\n$/);

  const output = renderToString(createStreamingWorkbenchView({ state, width: 96, height: 34 }), { width: 96, height: 34 });
  assert.match(output, /\[ and \]/);
  assert.match(output, /Add new one/);
});

test('streaming workbench can create a new template from the current prompt', () => {
  const state = createStreamingWorkbenchState();
  const initialLength = state.templates.length;
  state.replyIndex = state.templates.length;
  state.prompt.set('summarize the latest deployment logs');

  handleStreamingWorkbenchKey({ key: { name: 'enter' }, state, runtime: { invalidate() {} } });
  assert.equal(state.pendingTemplate.prompt, 'summarize the latest deployment logs');
  assert.match(state.status, /scenario response/);

  state.pendingTemplate.response.set('Deployment logs look healthy. Two slow jobs need follow-up.');
  handleStreamingWorkbenchKey({ key: { name: 'enter' }, state, runtime: { invalidate() {} } });
  assert.equal(state.templates.length, initialLength + 1);
  assert.equal(state.replyIndex, initialLength);
  assert.equal(state.templates.at(-1).prompt, 'summarize the latest deployment logs');
  assert.equal(state.prompt.value, 'summarize the latest deployment logs');
});

test('streaming workbench keeps Prompt active after submit and autoscrolls transcript', () => {
  const state = createStreamingWorkbenchState();
  const runtime = { invalidate() {} };
  handleStreamingWorkbenchKey({ key: { name: 'enter' }, state, runtime });
  assert.equal(state.activeTab, 'prompt');
  assert.equal(state.streaming, true);
  if (state.streamTimer) clearTimeout(state.streamTimer);
  state.streaming = false;
  state.streamTimer = null;

  state.messages = [
    { role: 'user', content: 'long prompt' },
    { role: 'assistant', content: 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty' },
  ];
  state.activeTab = 'transcript';
  state.transcriptAutoscroll = true;
  renderToString(createStreamingWorkbenchView({ state, width: 72, height: 20 }), { width: 72, height: 20 });
  assert.equal(state.transcriptAutoscroll, true);
  assert.ok(state.paneScroll.transcript > 0);

  const pinnedScroll = state.paneScroll.transcript;
  state.transcriptAutoscroll = false;
  state.paneScroll.transcript = Math.max(0, pinnedScroll - 2);
  const manualScroll = state.paneScroll.transcript;
  state.messages[1].content += ' twenty-one twenty-two twenty-three twenty-four twenty-five';
  renderToString(createStreamingWorkbenchView({ state, width: 72, height: 20 }), { width: 72, height: 20 });
  assert.equal(state.paneScroll.transcript, manualScroll);
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
  const output = renderToString(createInteractionKitView({ state, width: 132 }), { width: 132, height: 30 });
  assert.match(output, /Interaction Kit/);
  assert.match(output, /renderer alive/);
  assert.match(output, /Actions/);

  for (const char of 'confirm') {
    handleInteractionKitKey({ key: { name: char, printable: true, text: char }, state, runtime: { exit() {} } });
  }
  handleInteractionKitKey({ key: { name: 'enter' }, state, runtime: { exit() {} } });
  assert.equal(state.modes.current(), 'confirm');

  const confirmView = renderToString(createInteractionKitView({ state, width: 100 }), { width: 100, height: 28 });
  assert.match(confirmView, /Confirm action/);
});

test('interaction kit keeps palette editing scoped to the palette tab', () => {
  const state = createInteractionKitState();
  state.activeTab = 'runtime';
  handleInteractionKitKey({ key: { name: 't', printable: true, text: 't' }, state, runtime: { exit() {} } });
  assert.equal(state.palette.editor.value, '');
  handleInteractionKitKey({ key: { name: 'enter' }, state, runtime: { exit() {} } });
  assert.equal(state.progress, 30);

  state.activeTab = 'palette';
  for (const char of 'toast') {
    handleInteractionKitKey({ key: { name: char, printable: true, text: char }, state, runtime: { exit() {} } });
  }
  handleInteractionKitKey({ key: { name: 'enter' }, state, runtime: { exit() {} } });
  assert.equal(state.activeTab, 'runtime');
  assert.ok(state.accepted.includes('toast.info'));
});
