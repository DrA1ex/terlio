import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodeReviewState, createCodeReviewView } from '../examples/code-review.js';
import { dispatchPointerEvent, renderToFrame } from '../src/lib/index.js';

function renderCommits(state, width = 110, height = 26) {
  const frame = renderToFrame(createCodeReviewView({ state, width, height }), { width, height });
  const region = frame.pointerRegions.find((item) => item.id === 'code-review:commits');
  assert.ok(region, 'commits pane should expose a wheel region');
  return { frame, region };
}

function wheel(region, deltaY) {
  return {
    type: 'pointer',
    name: deltaY < 0 ? 'wheel-up' : 'wheel-down',
    action: 'wheel',
    button: 'none',
    x: region.bounds.x + 1,
    y: region.bounds.y + 1,
    deltaX: 0,
    deltaY,
    pressed: false,
  };
}

test('code review wheel scrolls commit rows without changing selection until it leaves the viewport', () => {
  const state = createCodeReviewState();
  state.modes.pop();
  state.activeTab = 'commits';
  state.selectedCommitIndex = 0;

  let view = renderCommits(state);
  dispatchPointerEvent(wheel(view.region, 1), view.frame.pointerRegions);
  assert.equal(state.paneScroll.commits, 3);
  assert.equal(state.selectedCommitIndex, 0, 'partially visible selection should stay selected');

  view = renderCommits(state);
  dispatchPointerEvent(wheel(view.region, 1), view.frame.pointerRegions);
  assert.equal(state.paneScroll.commits, 6);
  assert.equal(state.selectedCommitIndex, 1, 'scrolling down should anchor selection to the first visible item only after the old selection disappears');

  state.selectedCommitIndex = 2;
  state.commitSelectionNeedsReveal = false;
  state.paneScroll.commits = 8;

  view = renderCommits(state);
  dispatchPointerEvent(wheel(view.region, -1), view.frame.pointerRegions);
  assert.equal(state.paneScroll.commits, 5);
  assert.equal(state.selectedCommitIndex, 2, 'partially visible lower selection should stay selected');

  view = renderCommits(state);
  dispatchPointerEvent(wheel(view.region, -1), view.frame.pointerRegions);
  assert.equal(state.paneScroll.commits, 2);
  assert.equal(state.selectedCommitIndex, 1, 'scrolling up should anchor selection to the last visible item after the old selection disappears');
});
