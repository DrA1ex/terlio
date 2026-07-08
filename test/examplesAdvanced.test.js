import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseKey, renderToString, stripAnsi } from '../src/lib/index.js';
import { createKeyInspectorState, createKeyInspectorView, handleKeyInspectorKey } from '../examples/keys.js';
import { buildComposedPrompt, createPromptComposerState, createPromptComposerView, handlePromptComposerKey, inferPromptPlan } from '../examples/composer.js';
import { createBlocksGalleryState, createBlocksGalleryView, handleBlocksGalleryKey, primaryBlockAction } from '../examples/blocks.js';
import { buildReviewBlocks, createCodeReviewState, createCodeReviewView, handleCodeReviewKey, submitReview } from '../examples/code-review.js';
import { createCommandCenterState, createCommandCenterView, handleCommandCenterKey } from '../examples/command-center.js';
import { createSessionBrowserState, createSessionBrowserView, getSessionMatches, handleSessionBrowserKey } from '../examples/sessions.js';
import { cancelAgentStream, createAgentStreamState, createAgentStreamView, handleAgentStreamKey, submitAgentPrompt } from '../examples/agent-stream.js';
import { createThemeGalleryState, createThemeGalleryView, handleThemeGalleryKey } from '../examples/themes.js';

test('package exposes advanced product and diagnostic examples', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const name of ['keys', 'composer', 'blocks', 'code-review', 'command-center', 'sessions', 'agent-stream', 'themes']) {
    assert.equal(pkg.scripts[`example:${name}`], `node examples/${name}.js`);
  }
});

test('key inspector shows raw normalized key data and editor result', () => {
  const state = createKeyInspectorState();
  handleKeyInspectorKey({ key: parseKey('\x1b[1;3D'), state });
  handleKeyInspectorKey({ key: parseKey('x'), state });
  const output = stripAnsi(renderToString(createKeyInspectorView({ state, width: 100 }), { width: 100, height: 28 }));
  assert.match(output, /Key Inspector/);
  assert.match(output, /move word left|meta\+left/);
  assert.match(output, /insert "x"/);
});

test('prompt composer builds a structured prompt and infers a code plan', () => {
  const state = createPromptComposerState();
  const prompt = buildComposedPrompt(state);
  const plan = inferPromptPlan(prompt);
  assert.equal(plan.intent, 'code');
  assert.ok(plan.blocks.includes('diff'));

  handlePromptComposerKey({ key: { name: 'tab', shift: false }, state });
  handlePromptComposerKey({ key: { name: 'enter' }, state });
  assert.equal(state.submitted.length, 1);
  const output = stripAnsi(renderToString(createPromptComposerView({ state, width: 104 }), { width: 104, height: 30 }));
  assert.match(output, /Prompt Composer/);
  assert.match(output, /detected intent/);
});

test('blocks gallery renders all structured block types and records block actions', () => {
  const state = createBlocksGalleryState();
  handleBlocksGalleryKey({ key: { name: 'down' }, state });
  handleBlocksGalleryKey({ key: { name: 'enter' }, state });
  assert.match(primaryBlockAction({ type: 'command', command: 'npm test' }), /run command/);
  const output = stripAnsi(renderToString(createBlocksGalleryView({ state, width: 108, height: 32 }), { width: 108, height: 32 }));
  assert.match(output, /Blocks Gallery/);
  assert.match(output, /tool_result/);
  assert.match(output, /code/);
});

test('code review demo generates structured review blocks and enters confirm mode for diff apply', () => {
  const state = createCodeReviewState();
  submitReview(state);
  assert.ok(buildReviewBlocks('review lifecycle').some((block) => block.type === 'warning'));
  assert.ok(state.messages.at(-1).blocks.some((block) => block.type === 'diff'));

  while (state.messages.at(-1).blocks[state.selectedBlockIndex].type !== 'diff') {
    handleCodeReviewKey({ key: { name: 'tab', shift: false }, state });
  }
  handleCodeReviewKey({ key: { name: 'a' }, state });
  assert.equal(state.modes.current(), 'confirm');
  const output = stripAnsi(renderToString(createCodeReviewView({ state, width: 112, height: 34 }), { width: 112, height: 34 }));
  assert.match(output, /AI Code Review Terminal/);
  assert.match(output, /Confirm block action/);
});

test('command center runs palette actions through mode stack and dashboard widgets', () => {
  const state = createCommandCenterState();
  for (const ch of 'debug') handleCommandCenterKey({ key: { name: ch, printable: true, text: ch }, state, runtime: { exit() {} } });
  handleCommandCenterKey({ key: { name: 'enter' }, state, runtime: { exit() {} } });
  assert.equal(state.modes.current(), 'modal');
  const output = stripAnsi(renderToString(createCommandCenterView({ state, width: 112 }), { width: 112, height: 32 }));
  assert.match(output, /Command Center/);
  assert.match(output, /Debug overlay/);
});

test('session browser filters sessions and confirms deletion', () => {
  const state = createSessionBrowserState();
  for (const ch of 'blocks') handleSessionBrowserKey({ key: { name: ch, printable: true, text: ch }, state });
  assert.equal(getSessionMatches(state).length, 1);
  handleSessionBrowserKey({ key: { name: 'd' }, state });
  assert.equal(state.modes.current(), 'confirm');
  handleSessionBrowserKey({ key: { name: 'enter' }, state });
  assert.equal(state.modes.current(), 'browser');
  assert.equal(getSessionMatches(state).length, 0);
  const output = stripAnsi(renderToString(createSessionBrowserView({ state, width: 108 }), { width: 108, height: 30 }));
  assert.match(output, /Session Browser/);
  assert.match(output, /Deleted/);
});

test('agent stream demo creates a cancellable structured stream queue', () => {
  const state = createAgentStreamState();
  submitAgentPrompt(state, { invalidate() {} }, 'review renderer lifecycle');
  assert.equal(state.streaming, true);
  assert.ok(state.streamTotal > 0);
  cancelAgentStream(state, 'cancelled');
  assert.equal(state.streaming, false);
  handleAgentStreamKey({ key: { name: 'e' }, state, runtime: { invalidate() {} } });
  assert.equal(state.streaming, true);
  cancelAgentStream(state, 'cancelled');
  const output = stripAnsi(renderToString(createAgentStreamView({ state, width: 110, height: 32 }), { width: 110, height: 32 }));
  assert.match(output, /Agent Stream Playground/);
  assert.match(output, /stream cancelled/);
});

test('theme gallery switches previews across all available themes', () => {
  const state = createThemeGalleryState();
  handleThemeGalleryKey({ key: { name: 'down' }, state });
  handleThemeGalleryKey({ key: { name: 'enter' }, state });
  const output = stripAnsi(renderToString(createThemeGalleryView({ state, width: 112, height: 32 }), { width: 112, height: 32 }));
  assert.match(output, /Theme Gallery/);
  assert.match(output, /Selected theme/);
  assert.match(output, /Theme token check/);
});
