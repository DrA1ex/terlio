import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseKey, renderToString, stripAnsi, visibleLength } from '../src/lib/index.js';
import { createKeyInspectorState, createKeyInspectorView, handleKeyInspectorKey } from '../examples/keys.js';
import { createBlocksGalleryState, createBlocksGalleryView, handleBlocksGalleryKey, primaryBlockAction } from '../examples/blocks.js';
import { addIncomingReviewComment, buildReviewBlocks, createCodeReviewState, createCodeReviewView, handleCodeReviewKey, jumpToToastComment, submitReview, tickCodeReview } from '../examples/code-review.js';
import { createThemeGalleryState, createThemeGalleryView, handleThemeGalleryKey } from '../examples/themes.js';
import { createCommandPaletteState, createCommandPaletteView } from '../examples/command-palette.js';

test('package exposes focused UI mechanics examples without duplicate legacy scripts', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['example:kit'], 'node examples/interaction-kit.js');
  assert.equal(pkg.scripts['example:components'], 'node examples/components-showcase.js');
  for (const name of ['keys', 'blocks', 'themes']) {
    assert.equal(pkg.scripts[`example:${name}`], `node examples/${name}.js`);
  }
  assert.equal(pkg.scripts['example:agent-stream'], undefined);
  assert.equal(pkg.scripts['demo:code-review'], 'node examples/code-review.js');
  assert.equal(pkg.scripts['example:code-review'], undefined);
  for (const removed of ['example:chat', 'example:composer', 'example:command-center', 'example:sessions']) {
    assert.equal(pkg.scripts[removed], undefined);
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

test('structured response explorer navigates scenarios, isolates blocks and records safe actions', () => {
  const state = createBlocksGalleryState();
  handleBlocksGalleryKey({ key: { name: 'down' }, state });
  assert.equal(state.selectedIndex, 1);
  handleBlocksGalleryKey({ key: { name: 'enter' }, state });
  assert.equal(state.isolated, true);
  assert.equal(state.focus, 'response');
  handleBlocksGalleryKey({ key: { name: 'escape' }, state });
  assert.equal(state.isolated, false);
  handleBlocksGalleryKey({ key: { name: ']', printable: true, text: ']' }, state });
  assert.equal(state.scenarioIndex, 1);
  assert.match(primaryBlockAction({ type: 'command', command: 'npm test' }), /mock run/);
  const output = stripAnsi(renderToString(createBlocksGalleryView({ state, width: 108, height: 32 }), { width: 108, height: 32 }));
  assert.match(output, /Structured Response Explorer/);
  assert.match(output, /RESPONSE MAP/);
  assert.match(output, /BLOCK INSPECTOR/);
  assert.match(output, /tool_result|command/);
});

test('structured response explorer keeps diff and command actions explicit and simulated', () => {
  const state = createBlocksGalleryState();
  state.selectedIndex = 2;
  handleBlocksGalleryKey({ key: { name: 'a', printable: true, text: 'a' }, state });
  assert.equal(state.overlays.hasBlocking(), true);
  handleBlocksGalleryKey({ key: { name: 'enter' }, state });
  assert.equal(state.overlays.hasBlocking(), false);
  assert.match(state.actionLog.at(-1), /mock apply/);

  state.selectedIndex = 4;
  handleBlocksGalleryKey({ key: { name: 'r', printable: true, text: 'r' }, state });
  assert.equal(state.overlays.hasBlocking(), true);
  handleBlocksGalleryKey({ key: { name: 'enter' }, state });
  assert.match(state.actionLog.at(-1), /mock run/);
  assert.ok(state.overlays.toasts.length >= 1);
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
  assert.equal(state.selectedCommentIndex, state.pr.comments.length - 1);
  handleCodeReviewKey({ key: { name: 'home' }, state });
  handleCodeReviewKey({ key: { name: 'down' }, state });
  assert.equal(state.selectedCommentIndex, 1);
  handleCodeReviewKey({ key: { name: 'enter' }, state });
  assert.equal(state.modes.current(), 'comment-detail');
  let commentOutput = stripAnsi(renderToString(createCodeReviewView({ state, width: 128, height: 36 }), { width: 128, height: 36 }));
  assert.match(commentOutput, /READ COMMENT/i);
  assert.match(commentOutput, /review-bot|mira|alex/);
  handleCodeReviewKey({ key: { name: 'escape' }, state });
  assert.equal(state.modes.current(), 'review');

  createCodeReviewView({ state, width: 128, height: 18 });
  const beforePageUp = state.selectedCommentIndex;
  handleCodeReviewKey({ key: { name: 'page-up' }, state });
  assert.ok(state.selectedCommentIndex < beforePageUp);
  assert.equal(state.commentsSticky, false);
  handleCodeReviewKey({ key: { name: 'end' }, state });
  createCodeReviewView({ state, width: 128, height: 18 });
  assert.equal(state.selectedCommentIndex, state.pr.comments.length - 1);
  assert.equal(state.commentsSticky, true);

  handleCodeReviewKey({ key: { name: 'n' }, state });
  for (const ch of 'Looks good after test coverage.') {
    handleCodeReviewKey({ key: { name: ch, printable: true, text: ch }, state });
  }
  handleCodeReviewKey({ key: { name: 'enter' }, state });
  assert.equal(state.modes.current(), 'confirm');
  const confirmOutput = stripAnsi(renderToString(createCodeReviewView({ state, width: 128, height: 36 }), { width: 128, height: 36 }));
  assert.match(confirmOutput, /Post this review comment/);
  assert.doesNotMatch(confirmOutput, /COMMENTS \d+ · writing/);
  handleCodeReviewKey({ key: { name: 'o', ctrl: true }, state });
  assert.equal(state.modes.current(), 'confirm');
  handleCodeReviewKey({ key: { name: 'tab' }, state });
  assert.equal(state.confirmSelected, 'cancel');
  handleCodeReviewKey({ key: { name: 'tab' }, state });
  assert.equal(state.confirmSelected, 'confirm');
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





test('code review comment composer owns Tab, supports replies and pauses live updates while editing', () => {
  const state = createCodeReviewState();
  handleCodeReviewKey({ key: { name: 'enter' }, state });
  state.toasts.clear();
  state.activeTab = 'comments';
  handleCodeReviewKey({ key: { name: 'home' }, state });
  handleCodeReviewKey({ key: { name: 'r' }, state });
  assert.equal(state.commentMode, 'editor');
  assert.equal(state.commentEditor.value, '@alex ');

  handleCodeReviewKey({ key: { name: 'tab', shift: false }, state });
  assert.equal(state.activeTab, 'comments');
  assert.equal(state.commentEditor.value, '@alex   ');

  const before = state.pr.comments.length;
  state.liveCommentCountdown = 1;
  const ticked = tickCodeReview({ state });
  assert.equal(ticked, false);
  assert.equal(state.pr.comments.length, before);
  assert.equal(state.liveCommentCountdown, 1);

  createCodeReviewView({ state, width: 128, height: 18 });
  handleCodeReviewKey({ key: { name: 'page-up' }, state });
  assert.equal(state.commentsSticky, false);
  handleCodeReviewKey({ key: { name: 'escape' }, state });
  assert.equal(state.commentMode, 'list');
});

test('code review stays within fixed frames across narrow and wide review modes', () => {
  for (const [width, height] of [[80, 24], [100, 30], [136, 39], [160, 40]]) {
    const state = createCodeReviewState();
    let output = stripAnsi(renderToString(createCodeReviewView({ state, width, height }), { width, height }));
    let lines = output.split('\n');
    assert.equal(lines.length, height, `picker height at ${width}x${height}`);
    assert.ok(Math.max(...lines.map(visibleLength)) <= width, `picker width at ${width}x${height}`);

    handleCodeReviewKey({ key: { name: 'enter' }, state });
    state.toasts.clear();
    for (const tab of ['general', 'commits', 'diff', 'comments']) {
      state.activeTab = tab;
      output = stripAnsi(renderToString(createCodeReviewView({ state, width, height }), { width, height }));
      lines = output.split('\n');
      assert.equal(lines.length, height, `${tab} height at ${width}x${height}`);
      assert.ok(Math.max(...lines.map(visibleLength)) <= width, `${tab} width at ${width}x${height}`);
      assert.match(output, /LOCAL HELP/);
    }
  }
});



test('code review edge navigation clamps without losing sticky latest-comment behavior', () => {
  const state = createCodeReviewState();
  handleCodeReviewKey({ key: { name: 'end' }, state });
  handleCodeReviewKey({ key: { name: 'down' }, state });
  assert.equal(state.selectedPrIndex, state.pullRequests.length - 1);
  handleCodeReviewKey({ key: { name: 'home' }, state });
  handleCodeReviewKey({ key: { name: 'up' }, state });
  assert.equal(state.selectedPrIndex, 0);

  handleCodeReviewKey({ key: { name: 'enter' }, state });
  state.toasts.clear();
  state.activeTab = 'comments';
  createCodeReviewView({ state, width: 100, height: 24 });
  assert.equal(state.selectedCommentIndex, state.pr.comments.length - 1);
  assert.equal(state.commentsSticky, true);
  handleCodeReviewKey({ key: { name: 'down' }, state });
  assert.equal(state.selectedCommentIndex, state.pr.comments.length - 1);
  assert.equal(state.commentsSticky, true);
  handleCodeReviewKey({ key: { name: 'page-down' }, state });
  assert.equal(state.commentsSticky, true);
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

  const coloredOutput = renderToString(createCodeReviewView({ state, width: 128, height: 34 }), { width: 128, height: 34 });
  const output = stripAnsi(coloredOutput);
  assert.match(output, /New review comment/);
  assert.match(output, /Press J to jump/);
  assert.match(output, /LOCAL HELP/);
  assert.match(coloredOutput, /\x1b\[38;2;/);

  state.toasts.clear();
  state.toastTarget = null;
  const clearedOutput = stripAnsi(renderToString(createCodeReviewView({ state, width: 128, height: 34 }), { width: 128, height: 34 }));
  assert.doesNotMatch(clearedOutput, /Press J to jump/);
  assert.doesNotMatch(clearedOutput, /New comment on/);
  assert.match(clearedOutput, /LOCAL HELP/);

  state.toastTarget = { prId: state.pr.id, commentIndex: before };
  state.toasts.show('New review comment restored for jump test.', 'info', 8);
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

test('theme studio stages, applies and previews semantic themes', () => {
  const state = createThemeGalleryState();
  const initial = state.appliedTheme;
  handleThemeGalleryKey({ key: { name: 'down' }, state });
  assert.equal(state.appliedTheme, initial);
  handleThemeGalleryKey({ key: { name: 'enter' }, state });
  assert.notEqual(state.appliedTheme, initial);
  const output = stripAnsi(renderToString(createThemeGalleryView({ state, width: 112, height: 32 }), { width: 112, height: 32 }));
  assert.match(output, /Theme Studio/);
  assert.match(output, /THEME LIBRARY/);
  assert.match(output, /LIVE PREVIEW/);
  assert.match(output, /Applied .* whole workspace/);
});


test('release command palette overlay stays inside the frame on a small supported terminal', () => {
  const state = createCommandPaletteState();
  const output = stripAnsi(renderToString(createCommandPaletteView({ state, width: 80, height: 24 }), { width: 80, height: 24 }));
  const lines = output.split('\n');

  assert.equal(lines.length, 24);
  assert.ok(lines.every((line) => visibleLength(line) <= 80));
  assert.match(output, /RELEASE COMMAND PALETTE/);
  assert.match(output, /SEARCH ACTIONS/);
  assert.match(output, /COMMANDS/);
  assert.match(output, /STATUS/);
});
