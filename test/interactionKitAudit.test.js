import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KeyHintBar,
  OverlayHost,
  Text,
  WorkspacePane,
  createOverlayManager,
  renderNode,
  renderToString,
  stripAnsi,
  themes,
  visibleLength,
} from '../src/lib/index.js';
import {
  createInteractionKitState,
  createInteractionKitView,
  handleInteractionKitKey,
  tickInteractionKit,
} from '../examples/interaction-kit.js';

const runtime = { exit() {}, invalidate() {} };

function select(state, index) {
  state.selectedShowcaseIndex = index;
  state.list.selectedIndex = index;
  state.focus.focus('preview');
}

function render(state, width = 136, height = 39) {
  return stripAnsi(renderToString(createInteractionKitView({ state, width, height }), { width, height }));
}

test('WorkspacePane reserves an adaptive footer panel and clips content before it', () => {
  const pane = WorkspacePane({
    title: ' Demo ',
    height: 12,
    children: Array.from({ length: 20 }, (_, index) => Text(`content ${index + 1}`)),
    footerNode: KeyHintBar({
      title: ' LOCAL CONTROLS ',
      adaptive: true,
      columns: 'auto',
      hints: [['Enter', 'accept current item'], ['Esc', 'return to navigation'], ['PgUp/PgDn', 'scroll content']],
      theme: themes.ocean,
    }),
  });
  const output = stripAnsi(renderToString(pane, { width: 64, height: 12 }));
  const lines = output.split('\n');
  assert.equal(lines.length, 12);
  assert.match(output, /┌  LOCAL CONTROLS/);
  assert.match(output, /Enter accept current item/);
  assert.equal(lines.at(-1).startsWith('└'), true);
  assert.doesNotMatch(output, /content 20/);
});

test('OverlayHost dims background content behind blocking overlays', () => {
  const manager = createOverlayManager();
  manager.modal({ title: ' Blocking modal ', children: ['Modal body'] });
  const output = renderToString(OverlayHost({
    content: WorkspacePane({ title: ' Background ', children: [Text('background content')] }),
    manager,
    theme: themes.ocean,
    width: 64,
    height: 14,
  }), { width: 64, height: 14 });

  assert.match(output, /Modal body/);
  assert.match(output, /background content/);
  assert.ok(output.includes(themes.ocean.textMuted));
});

test('all example:kit screens keep the local controls panel visible at 136x39', () => {
  const state = createInteractionKitState();
  for (let index = 0; index < 15; index += 1) {
    select(state, index);
    const output = render(state, 136, 39);
    const lines = output.split('\n');
    assert.match(output, /┌  LOCAL CONTROLS/, `screen ${index + 1}`);
    assert.ok(lines.every((line) => visibleLength(line) <= 136), `screen ${index + 1} overflowed`);
    const controlsRow = lines.findIndex((line) => line.includes('LOCAL CONTROLS'));
    const statusRow = lines.findLastIndex((line) => line.includes(' STATUS '));
    assert.ok(controlsRow > 0 && controlsRow < statusRow, `screen ${index + 1} footer placement`);
  }
});

test('showcase navigation wraps long entries into reserved second rows', () => {
  const state = createInteractionKitState();
  select(state, 12);
  state.focus.focus('nav');
  const output = render(state, 136, 39);
  assert.match(output, /Structured Assistant\s+│/);
  assert.match(output, /Blocks — AI blocks/);
  assert.match(output, /Runtime, Frames, and Diff/);
  assert.match(output, /Rendering — Runtime/);
});

test('showcase navigation keeps its selection footer docked across wrapped entries', () => {
  const rows = [];
  for (const index of [0, 4, 10, 15]) {
    const state = createInteractionKitState();
    select(state, index);
    state.focus.focus('nav');
    const lines = render(state, 136, 39).split('\n');
    const footerRow = lines.findIndex((line) => line.includes('Enter preview'));
    assert.ok(footerRow > 0, `screen ${index + 1} should show the navigation footer`);
    rows.push(footerRow);
  }
  assert.equal(new Set(rows).size, 1);
});

test('the last toast expires and invalidates the rendered frame', () => {
  const state = createInteractionKitState();
  state.overlays.toast('One final toast', 'success', 3);
  assert.match(render(state), /One final toast/);
  let changedOnRemoval = false;
  for (let index = 0; index < 12; index += 1) changedOnRemoval = tickInteractionKit({ state }) || changedOnRemoval;
  assert.equal(state.overlays.toasts.length, 0);
  assert.equal(changedOnRemoval, true);
  assert.doesNotMatch(render(state), /One final toast/);
});

test('feedback levels and blocking overlays use distinct presentation paths', () => {
  const manager = createOverlayManager();
  manager.toast('warning', 'warning');
  manager.toast('error', 'error');
  assert.notEqual(manager.toasts[0].level, manager.toasts[1].level);

  const state = createInteractionKitState();
  select(state, 8);
  const feedback = state.showcaseState['feedback-overlays'];
  feedback.list.selectedIndex = 4;
  handleInteractionKitKey({ key: { name: 'enter' }, state, runtime });
  const modalOutput = render(state);
  assert.match(modalOutput, /Background input is trapped/);
  assert.match(modalOutput, /└/);
  handleInteractionKitKey({ key: { name: 'escape' }, state, runtime });
  feedback.list.selectedIndex = 5;
  handleInteractionKitKey({ key: { name: 'enter' }, state, runtime });
  assert.match(render(state), /Apply the simulated destructive action/);
});

test('workspace local focus, scrolling and command autocomplete remain reachable', () => {
  const state = createInteractionKitState();
  select(state, 3);
  const workspace = state.showcaseState['workspace-shell-anatomy'];
  assert.equal(workspace.focusIndex, 0);
  handleInteractionKitKey({ key: { name: 'page-down' }, state, runtime });
  assert.ok(workspace.mainScroll.scroll > 0);
  handleInteractionKitKey({ key: { name: 'tab' }, state, runtime });
  assert.equal(workspace.focusIndex, 1);
  handleInteractionKitKey({ key: { name: 'page-down' }, state, runtime });
  handleInteractionKitKey({ key: { name: 'tab' }, state, runtime });
  assert.equal(workspace.focusIndex, 2);
  workspace.command.set('de');
  handleInteractionKitKey({ key: { name: 'tab' }, state, runtime });
  assert.match(workspace.command.value, /^deploy/);
});

test('selection window stays fixed and uses freed indicator rows for items', () => {
  const state = createInteractionKitState();
  select(state, 4);
  const list = state.showcaseState['selection-lists-windowing'].list;
  list.selectedIndex = 0;
  const first = render(state);
  list.selectedIndex = list.items.length - 1;
  const last = render(state);
  assert.equal(first.split('\n').length, last.split('\n').length);
  assert.match(first, /↓14/);
  assert.match(last, /↑14/);
  assert.match(first, /TKT-010/);
  assert.match(last, /TKT-024/);
});

test('embedded palette logs commands without applying navigation or theme side effects', () => {
  const state = createInteractionKitState();
  select(state, 5);
  const originalTheme = state.themeName;
  const originalScreen = state.selectedShowcaseIndex;
  const palette = state.showcaseState['command-palette-demo'];
  palette.palette.editor.set('theme');
  handleInteractionKitKey({ key: { name: 'enter' }, state, runtime });
  assert.equal(state.themeName, originalTheme);
  assert.equal(state.selectedShowcaseIndex, originalScreen);
  assert.equal(palette.accepted.length, 1);
});

test('previously reported screen-specific behaviors remain functional', () => {
  const state = createInteractionKitState();
  state.focus.focus('preview');

  select(state, 9);
  handleInteractionKitKey({ key: { name: 'f', printable: true, text: 'f' }, state, runtime });
  const progress = state.showcaseState['progress-live-jobs'];
  assert.equal(progress.running, false);
  assert.match(render(state), /✓ completed/);

  select(state, 11);
  const timeline = state.showcaseState['timeline-activity-feeds'];
  for (let index = 0; index < 20; index += 1) {
    handleInteractionKitKey({ key: { name: 'a', printable: true, text: 'a' }, state, runtime });
  }
  handleInteractionKitKey({ key: { name: 'page-down' }, state, runtime });
  assert.ok(timeline.selected >= 8);

  select(state, 12);
  assert.doesNotMatch(render(state), /regenerate/i);
  assert.doesNotMatch(render(state), /─…|…─/);

  select(state, 13);
  const responsiveOutput = render(state);
  assert.match(responsiveOutput, /terminal width\s+136/);
  assert.doesNotMatch(responsiveOutput, /terminal width\s+0/);

  select(state, 14);
  const focus = state.showcaseState['focus-and-modes'];
  assert.deepEqual(focus.modes.stack.map((entry) => entry.name), ['root']);
  handleInteractionKitKey({ key: { name: 'm', printable: true, text: 'm' }, state, runtime });
  handleInteractionKitKey({ key: { name: 'p', printable: true, text: 'p' }, state, runtime });
  assert.equal(focus.modes.current(), 'root');
  assert.equal(focus.focus.current(), 'nav');

  select(state, 15);
  const frames = state.showcaseState['runtime-frames-diff'];
  const previous = frames.previous;
  handleInteractionKitKey({ key: { name: 'w', printable: true, text: 'w' }, state, runtime });
  assert.equal(frames.previous, previous);
  assert.equal(frames.nextLong, true);
  handleInteractionKitKey({ key: { name: 'n', printable: true, text: 'n' }, state, runtime });
  assert.equal(frames.previousLong, true);
});

test('progress status showcase demonstrates controller lifecycle, batching and rate details', () => {
  const state = createInteractionKitState();
  const index = state.list.items.findIndex((item) => item.id === 'progress-status-controller');
  assert.ok(index >= 0);
  select(state, index);
  state.focus.focus('preview');

  const demo = state.showcaseState['progress-status-controller'];
  const initialValue = demo.download.value;
  for (let tick = 0; tick < 4; tick += 1) tickInteractionKit({ state });
  assert.ok(demo.download.value > initialValue);
  assert.equal(demo.batch.value, 1);

  let output = render(state);
  assert.match(output, /Progress Status and Batching/);
  assert.match(output, /MiB\/s/);
  assert.match(output, /left/);
  assert.match(output, /Controller-backed job/);

  handleInteractionKitKey({ key: { name: 'space', printable: true, text: ' ' }, state, runtime });
  assert.equal(demo.download.state, 'paused');
  const pausedValue = demo.download.value;
  tickInteractionKit({ state });
  assert.equal(demo.download.value, pausedValue);

  handleInteractionKitKey({ key: { name: 'b', printable: true, text: 'b' }, state, runtime });
  assert.equal(demo.batch.value, 2);
  handleInteractionKitKey({ key: { name: 'f', printable: true, text: 'f' }, state, runtime });
  assert.equal(demo.download.state, 'failed');
  output = render(state);
  assert.match(output, /failed: simulated network failure/);

  handleInteractionKitKey({ key: { name: 'r', printable: true, text: 'r' }, state, runtime });
  assert.equal(demo.download.state, 'running');
  assert.equal(demo.download.value, 0);
});

test('progress showcase pages scroll and keep progress variants visually separated', () => {
  const state = createInteractionKitState();
  const jobsIndex = state.list.items.findIndex((item) => item.id === 'progress-live-jobs');
  select(state, jobsIndex);
  state.focus.focus('preview');

  let output = render(state, 136, 39);
  const jobs = state.showcaseState['progress-live-jobs'];
  assert.ok(jobs.scroll.totalRows > jobs.scroll.visibleRows);
  const lines = output.split('\n');
  const compactRow = lines.findIndex((line) => line.includes('compact ['));
  const lineRow = lines.findIndex((line) => line.includes('line track ['));
  assert.equal(lineRow - compactRow, 2);
  assert.equal(lines[compactRow + 1].includes('line track'), false);

  handleInteractionKitKey({ key: { name: 'page-down' }, state, runtime });
  assert.ok(jobs.scroll.scroll > 0);
  output = render(state, 136, 39);
  assert.match(output, /boxed/);

  const statusIndex = state.list.items.findIndex((item) => item.id === 'progress-status-controller');
  select(state, statusIndex);
  const status = state.showcaseState['progress-status-controller'];
  render(state, 136, 39);
  assert.ok(status.scroll.totalRows > status.scroll.visibleRows);
  handleInteractionKitKey({ key: { name: 'page-down' }, state, runtime });
  assert.ok(status.scroll.scroll > 0);

  status.scroll.scroll = 0;
  handleInteractionKitKey({ key: { name: 'b', printable: true, text: 'b' }, state, runtime });
  assert.equal(status.manualBatchAdds, 1);
  assert.equal(status.batchNotice, 'Manual batch completed: 1/12.');
  assert.match(render(state, 136, 39), /Manual batch completed: 1\/12\./);
});
