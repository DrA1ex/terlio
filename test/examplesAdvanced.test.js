import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseKey, renderToString, stripAnsi } from '../src/lib/index.js';
import { createKeyInspectorState, createKeyInspectorView, handleKeyInspectorKey } from '../examples/keys.js';
import { buildComposedPrompt, createPromptComposerState, createPromptComposerView, handlePromptComposerKey, inferPromptPlan } from '../examples/composer.js';
import { createBlocksGalleryState, createBlocksGalleryView, handleBlocksGalleryKey, primaryBlockAction } from '../examples/blocks.js';
import { addIncomingReviewComment, buildReviewBlocks, createCodeReviewState, createCodeReviewView, handleCodeReviewKey, jumpToToastComment, submitReview, tickCodeReview } from '../examples/code-review.js';
import { createCommandCenterState, createCommandCenterView, handleCommandCenterKey } from '../examples/command-center.js';
import { createSessionBrowserState, createSessionBrowserView, getSessionMatches, handleSessionBrowserKey } from '../examples/sessions.js';
import { cancelAgentStream, createAgentStreamState, createAgentStreamView, handleAgentStreamKey, submitAgentPrompt } from '../examples/agent-stream.js';
import { createThemeGalleryState, createThemeGalleryView, handleThemeGalleryKey } from '../examples/themes.js';
import { createCommandPaletteState, createCommandPaletteView } from '../examples/command-palette.js';

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

test('code review demo opens PR picker and can switch pull requests with Ctrl+O', () => {
  const state = createCodeReviewState();
  assert.equal(state.modes.current(), 'pr-picker');

  handleCodeReviewKey({ key: { name: 'down' }, state });
  handleCodeReviewKey({ key: { name: 'enter' }, state });
  assert.equal(state.modes.current(), 'review');
  assert.equal(state.pr.number, 207);
  assert.match(state.descriptionEditor.value, /Accepted tab/);

  handleCodeReviewKey({ key: { name: 'o', ctrl: true }, state });
  assert.equal(state.modes.current(), 'pr-picker');
  const output = stripAnsi(renderToString(createCodeReviewView({ state, width: 116, height: 34 }), { width: 116, height: 34 }));
  assert.match(output, /Open Pull Request/);
  assert.match(output, /Pull Requests/);
  assert.match(output, /Ctrl\+O opens this picker again/);
});

test('code review workspace uses read-only PR details, opens diffs and posts comments', () => {
  const state = createCodeReviewState();
  handleCodeReviewKey({ key: { name: 'enter' }, state });
  assert.equal(state.activeTab, 'general');

  const description = state.pr.description;
  handleCodeReviewKey({ key: { name: 'x', printable: true, text: 'x' }, state });
  handleCodeReviewKey({ key: { name: 'enter' }, state });
  assert.equal(state.pr.description, description);
  assert.match(state.status, /read-only/);

  handleCodeReviewKey({ key: { name: 'tab', shift: false }, state });
  assert.equal(state.activeTab, 'commits');
  handleCodeReviewKey({ key: { name: 'down' }, state });
  assert.equal(state.selectedCommitIndex, 1);
  handleCodeReviewKey({ key: { name: 'enter' }, state });
  assert.equal(state.activeTab, 'diff');

  const diffOutput = renderToString(createCodeReviewView({ state, width: 128, height: 34 }), { width: 128, height: 34 });
  assert.match(diffOutput, /\x1b\[[0-?]*[ -/]*[@-~].*export function resolveAutoScrollOffset/s);

  state.activeTab = 'comments';
  createCodeReviewView({ state, width: 128, height: 18 });
  handleCodeReviewKey({ key: { name: 'down' }, state });
  assert.equal(state.selectedCommentIndex, 1);
  handleCodeReviewKey({ key: { name: 'enter' }, state });
  assert.equal(state.modes.current(), 'comment-detail');
  let commentOutput = stripAnsi(renderToString(createCodeReviewView({ state, width: 128, height: 36 }), { width: 128, height: 36 }));
  assert.match(commentOutput, /Read Comment/);
  assert.match(commentOutput, /review-bot|mira|alex/);
  handleCodeReviewKey({ key: { name: 'escape' }, state });
  assert.equal(state.modes.current(), 'review');

  createCodeReviewView({ state, width: 128, height: 18 });
  handleCodeReviewKey({ key: { name: 'page-up' }, state });
  assert.equal(state.commentsSticky, false);
  for (let i = 0; i < 80 && !state.commentsSticky; i += 1) {
    handleCodeReviewKey({ key: { name: 'page-down' }, state });
  }
  assert.equal(state.commentsSticky, true);

  handleCodeReviewKey({ key: { name: 'n' }, state });
  for (const ch of 'Looks good after test coverage.') {
    handleCodeReviewKey({ key: { name: ch, printable: true, text: ch }, state });
  }
  handleCodeReviewKey({ key: { name: 'enter' }, state });
  assert.equal(state.modes.current(), 'confirm');
  handleCodeReviewKey({ key: { name: 'enter' }, state });
  assert.equal(state.pr.comments.at(-1).author, 'you');
  assert.equal(state.selectedCommentIndex, state.pr.comments.length - 1);
  assert.equal(state.commentsSticky, true);

  assert.ok(buildReviewBlocks('review lifecycle').some((block) => block.type === 'warning'));
  assert.ok(submitReview(state).some((block) => block.type === 'diff'));

  const output = stripAnsi(renderToString(createCodeReviewView({ state, width: 128, height: 36 }), { width: 128, height: 36 }));
  assert.match(output, /pull request review workspace/);
  assert.match(output, /COMMENTS/);
  assert.match(output, /Looks good after test coverage/);
  assert.match(output, /LOCAL HELP/);
});



test('code review live comments show a toast and can jump to the target thread block', () => {
  const state = createCodeReviewState();
  handleCodeReviewKey({ key: { name: 'enter' }, state });
  const before = state.pr.comments.length;
  state.activeTab = 'comments';
  createCodeReviewView({ state, width: 128, height: 20 });

  const comment = addIncomingReviewComment(state);
  assert.equal(state.pr.comments.length, before + 1);
  assert.equal(state.toastTarget.commentIndex, before);
  assert.match(state.toasts.current().message, /New review comment/);
  assert.equal(comment.live, true);

  const output = stripAnsi(renderToString(createCodeReviewView({ state, width: 128, height: 34 }), { width: 128, height: 34 }));
  assert.match(output, /New review comment/);
  assert.match(output, /J jump to comment/);
  assert.match(output, /LOCAL HELP/);

  handleCodeReviewKey({ key: { name: 'J' }, state });
  assert.equal(state.activeTab, 'comments');
  assert.equal(state.selectedCommentIndex, before);
  assert.equal(state.toastTarget, null);
  assert.match(state.status, /Jumped to comment/);

  state.liveCommentCountdown = 1;
  const ticked = tickCodeReview({ state });
  assert.ok(ticked);
  assert.equal(state.pr.comments.length, before + 2);
  assert.ok(state.liveCommentCountdown >= 18);
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


test('command palette keeps Actions bounded above the Palette command bar on small terminals', () => {
  const state = createCommandPaletteState();
  const output = stripAnsi(renderToString(createCommandPaletteView({ state, width: 80, height: 24 }), { width: 80, height: 24 }));
  const lines = output.split('\n');
  const actionsTop = lines.findIndex((line) => line.includes('ACTIONS'));
  const paletteTop = lines.findIndex((line, index) => index > actionsTop && line.includes(' PALETTE'));
  const actionsBottom = lines.findIndex((line, index) => index > actionsTop && index < paletteTop && line.startsWith('└'));

  assert.equal(lines.length, 24);
  assert.ok(actionsTop >= 0, 'Actions pane should render');
  assert.ok(paletteTop > actionsTop, 'Palette command bar should render after Actions');
  assert.ok(actionsBottom > actionsTop && actionsBottom < paletteTop, 'Actions pane should close before Palette command bar starts');
});
