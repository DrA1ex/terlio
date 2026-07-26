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
  assert.equal(state.paneScroll.commits, 1);
  assert.equal(state.selectedCommitIndex, 0, 'one wheel step should move one row without changing a still-visible selection');

  for (let step = 0; step < 4; step += 1) {
    view = renderCommits(state);
    dispatchPointerEvent(wheel(view.region, 1), view.frame.pointerRegions);
  }
  assert.equal(state.paneScroll.commits, 5);
  assert.equal(state.selectedCommitIndex, 1, 'selection should move only after the old row leaves the viewport');

  state.selectedCommitIndex = 2;
  state.commitSelectionNeedsReveal = false;
  state.paneScroll.commits = 8;

  view = renderCommits(state);
  dispatchPointerEvent(wheel(view.region, -1), view.frame.pointerRegions);
  assert.equal(state.paneScroll.commits, 7);
  assert.equal(state.selectedCommitIndex, 2, 'one upward wheel step should keep a partially visible selection');

  for (let step = 0; step < 4; step += 1) {
    view = renderCommits(state);
    dispatchPointerEvent(wheel(view.region, -1), view.frame.pointerRegions);
  }
  assert.equal(state.paneScroll.commits, 3);
  assert.equal(state.selectedCommitIndex, 1, 'selection should anchor to the last visible item after the old row disappears');
});
