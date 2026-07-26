import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Badge,
  Box,
  Chip,
  ChipLine,
  CommandBar,
  ConfirmPrompt,
  Docked,
  FooterStatusBar,
  Grid,
  HelpOverlay,
  KeyHintBar,
  KeyValueBlock,
  LiveJobBlock,
  MetricBlock,
  Modal,
  ProgressBar,
  PropertyRows,
  RequireViewport,
  SectionTabs,
  SelectList,
  SplitPane,
  stripAnsi,
  Text,
  Timeline,
  Toast,
  appendScrollRows,
  createListState,
  createOverlayManager,
  createScrollState,
  createTimelineEvent,
  createToastManager,
  createFrame,
  formatTimelineTime,
  getResponsiveMode,
  getListWindow,
  handleListKey,
  handleScrollKey,
  normalizeLines,
  renderTextEditorLines,
  renderToString,
  responsiveColumns,
  resolvePaneSizes,
  ScrollPane,
  takeVisible,
  themes,
  truncateVisibleText,
  updateListItems,
  updateScrollState,
  visibleWindowLines,
} from '../src/lib/index.js';

function render(node, width = 72, height = 18) {
  return renderToString(node, { width, height });
}

test('semantic micro-components render all public variants without leaking layout details', () => {
  for (const tone of ['info', 'success', 'warning', 'danger', 'error', 'muted', 'accent', 'ok', 'custom']) {
    for (const variant of ['subtle', 'outline', 'filled']) {
      const output = render(Badge({ label: tone, tone, variant, width: 18, theme: themes.ocean }), 20, 2);
      assert.match(output, new RegExp(tone === 'custom' ? 'custom' : tone));
    }
  }
  assert.match(render(Chip({ label: 'active', active: true, tone: 'success', theme: themes.forest })), /active/);
  assert.match(render(Chip({ label: 'idle', active: false })), /idle/);

  const tabs = SectionTabs({
    tabs: [{ id: 'one', label: 'One', icon: '1' }, { value: 'two', label: 'Two' }, 'three'],
    active: 'one',
    theme: themes.synth,
  });
  assert.match(render(tabs), /One/);
  assert.match(render(SectionTabs({ tabs: ['a', 'b'], active: 'b', gap: 1 })), /b/);

  assert.match(render(ChipLine({ label: 'Modes', chips: [{ id: 'a' }, { value: 'b' }], active: 'b', tone: 'warning', theme: themes.amber })), /Modes/);
  assert.match(render(ChipLine({ chips: ['a', 'b'], active: 'none' })), /a/);
});

test('display components cover empty, populated, bordered and compact states', () => {
  assert.match(render(CommandBar({ value: 'deploy', suggestions: ['staging', 'prod'], theme: themes.ocean })), /staging/);
  assert.doesNotMatch(render(CommandBar({ value: '', suggestions: [], hint: '', prompt: '>' })), /TAB next/);
  assert.match(render(FooterStatusBar({ left: ['ready'], right: ['80x24'], theme: themes.dark })), /80x24/);
  assert.match(render(FooterStatusBar({ left: [], right: [] })), /^\s*$/m);

  assert.match(render(Grid({ items: [], emptyText: 'Nothing here', columns: 2 })), /Nothing here/);
  assert.match(render(Grid({ items: [['A', 'B'], null, 'C'], columns: 2, border: true, borderColor: themes.ocean.border })), /A B/);
  assert.match(render(PropertyRows({ rows: [['theme', 'ocean'], ['count', 2]], theme: themes.ocean })), /theme/);
});

test('feedback components render every state, tone and optional surface', () => {
  assert.match(render(ConfirmPrompt({ selected: 'confirm' })), /› Yes/);
  assert.match(render(ConfirmPrompt({ selected: 'cancel', confirmLabel: 'Apply', cancelLabel: 'Stop' })), /› Stop/);
  assert.match(render(Modal({ children: ['Body'], footer: 'Esc close' })), /Esc close/);
  assert.match(render(Modal({ children: Text('Node body') })), /Node body/);

  for (const level of ['info', 'success', 'warning', 'error', 'unknown']) {
    const output = render(Toast({ level, message: `Message ${level}`, detail: 'Longer detail', theme: themes.ocean, width: 60, inset: 99 }), 64, 8);
    assert.match(output, /Message/);
  }
  assert.match(render(Toast({ level: 'success', message: 'Saved', shadow: false, active: false, icon: 'S' })), /Saved/);
  assert.match(render(Toast({ message: 'Only headline', width: 0 })), /Only headline/);

  assert.match(render(ProgressBar({ value: -10, total: 0, width: 0, label: 'job' })), /0%/);
  assert.match(render(ProgressBar({ value: 150, total: 100, width: 8 })), /100%/);
  assert.match(render(HelpOverlay({ shortcuts: [] })), /No shortcuts/);
  assert.match(render(HelpOverlay({ shortcuts: [['?', 'help']] })), /help/);
});

test('stateful list and scroll helpers skip disabled rows and preserve sticky reading behavior', () => {
  const items = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B', disabled: true },
    { id: 'c', label: 'C' },
    { id: 'd', label: 'D' },
  ];
  const list = createListState({ items, selectedIndex: 0, windowSize: 2, getDisabled: (item) => item.disabled });
  assert.equal(handleListKey(list, { name: 'down' }).handled, true);
  assert.equal(list.selectedIndex, 2);
  handleListKey(list, { name: 'up' });
  assert.equal(list.selectedIndex, 0);
  handleListKey(list, { name: 'end' });
  assert.equal(list.selectedIndex, 3);
  handleListKey(list, { name: 'home' });
  handleListKey(list, { name: 'page-down' });
  handleListKey(list, { name: 'page-up' });
  assert.equal(handleListKey(list, { name: 'unknown' }).handled, false);
  assert.ok(getListWindow(list).items.length <= 2);
  updateListItems(list, [{ id: 'x', label: 'X', disabled: true }]);
  assert.equal(list.selectedIndex, 0);

  const scroll = createScrollState({ totalRows: 3, visibleRows: 2, sticky: true });
  handleScrollKey(scroll, { name: 'end' });
  appendScrollRows(scroll, 1);
  assert.equal(scroll.scroll, 2);
  handleScrollKey(scroll, { name: 'up' });
  appendScrollRows(scroll, 1);
  assert.equal(scroll.scroll, 1);
  handleScrollKey(scroll, { name: 'page-down' });
  handleScrollKey(scroll, { name: 'page-up' });
  handleScrollKey(scroll, { name: 'home' });
  assert.equal(handleScrollKey(scroll, { name: 'unknown' }).handled, false);
  scroll.sticky = false;
  scroll.scroll = 99;
  updateScrollState(scroll, { totalRows: 1, visibleRows: 0 });
  assert.equal(scroll.scroll, 0);
});

test('select lists keep a stable public viewport across labels, descriptions and disabled rows', () => {
  const items = Array.from({ length: 8 }, (_, index) => ({
    id: String(index),
    title: `Long item title number ${index}`,
    description: index % 2 ? 'secondary detail' : '',
    disabled: index === 3,
  }));
  const output = render(SelectList({
    title: 'Entries',
    items,
    selectedIndex: 6,
    windowSize: 4,
    getLabel: (item) => item.title,
    getDescription: (item) => item.description,
    getDisabled: (item) => item.disabled,
    wrapItems: true,
    rowLines: 2,
    reserveItemLines: true,
  }), 44, 14);
  assert.match(output, /Entries/);
  assert.match(output, /number/);
  assert.match(render(SelectList({ items: [], emptyText: 'No entries' })), /No entries/);
});

test('docked and split layouts reserve footer space and resolve constrained panes', () => {
  const natural = Docked({ content: Text('content'), footer: Text('footer'), gap: 1 });
  assert.match(render(natural, 30, 6), /footer/);
  const fixed = Docked({ content: Box({ border: true }, Text('many\nlines\nhere')), footer: Box({ border: true }, Text('fixed footer')), height: 8, gap: 1, footerMinHeight: 2, footerMaxHeight: 3 });
  const fixedOutput = render(fixed, 30, 8);
  assert.match(fixedOutput, /fixed footer/);
  assert.equal(fixedOutput.split('\n').length, 8);
  assert.match(render(Docked({ content: Text('only'), height: 3 }), 20, 3), /only/);

  const panes = [
    { id: 'left', min: 8, max: 12, grow: 1, node: Box({ border: true }, Text('left')) },
    { id: 'right', size: 10, node: Box({ border: true }, Text('right')) },
  ];
  const sizes = resolvePaneSizes(panes, 30, 2);
  assert.equal(sizes.reduce((sum, value) => sum + value, 0), 28);
  assert.match(render(SplitPane({ panes, gap: 2, focus: 'left', theme: themes.ocean, height: 6 }), 30, 6), /left/);
  assert.match(render(SplitPane({ orientation: 'vertical', panes, gap: 0, height: 8 }), 30, 8), /right/);
  assert.equal(render(SplitPane({ panes: [] }), 20, 1).trim(), '');
});

test('viewport, timeline and live job components explain edge states', () => {
  assert.match(render(RequireViewport({ width: 40, height: 10, minWidth: 80, minHeight: 24, theme: themes.ocean })), /minimum 80×24/);
  assert.match(render(RequireViewport({ width: 1, height: 6, minWidth: 2, minHeight: 7, title: 'Need room', message: 'Grow terminal' }), 24, 6), /Grow terminal/);
  assert.match(render(RequireViewport({ width: 100, height: 30, children: Text('ready') })), /ready/);
  assert.equal(render(RequireViewport({ width: 100, height: 30 }), 20, 1).trim(), '');

  assert.equal(formatTimelineTime('invalid'), '--:--');
  const event = createTimelineEvent({ type: 'build_complete', text: 'Done', actor: 'ci', time: new Date('2025-01-01T12:34:00Z'), id: 'evt', meta: { ok: true } });
  assert.equal(event.id, 'evt');
  assert.match(render(Timeline({ events: [event], limit: 0 })), /build complete/);
  assert.match(render(Timeline({ events: [] })), /No timeline events/);

  assert.match(render(MetricBlock({ value: '42', detail: 'items', status: 'healthy', pulse: true })), /● 42/);
  assert.match(render(KeyValueBlock({ rows: [] })), /No details/);
  assert.match(render(KeyValueBlock({ rows: [['long-unicode-🙂', null]] })), /long-unicode/);
  for (const status of ['idle', 'running', 'paused', 'completed', 'failed', 'error']) {
    assert.match(render(LiveJobBlock({ status, running: status === 'running', activeIndex: 1, progress: 50, frame: 3, steps: ['one', 'two', 'three'] })), new RegExp(status));
  }
});


test('LiveJobBlock keeps its progress bar and percentage on one line in a narrow panel', () => {
  const output = stripAnsi(renderToString(LiveJobBlock({
    status: 'running',
    running: true,
    activeIndex: 0,
    progress: 75,
    frame: 0,
    steps: ['one', 'two'],
  }), { width: 24, height: 6 }));
  const lines = output.split('\n');
  const statusLine = lines.find((line) => line.includes('running')) ?? '';

  assert.match(statusLine, /75%/);
  assert.match(statusLine, /\[[#-]+\]/);
  assert.equal(lines.some((line) => line.trim() === '75%'), false);
});

test('overlay manager exposes non-blocking toasts and traps the top blocking surface', () => {
  const manager = createOverlayManager();
  manager.toast('one', 'info', 1);
  manager.toast('two', 'success', 2);
  assert.equal(manager.toasts.length, 2);
  manager.toasts[0].ttl = 0.1;
  assert.equal(manager.tick(0.2), true);
  assert.equal(manager.toasts.length, 1);

  let result = null;
  manager.modal({ title: 'Modal', children: ['Body'], onCancel: () => { result = 'closed'; } });
  assert.equal(manager.hasBlocking(), true);
  assert.equal(manager.handleKey({ name: 'x', printable: true, text: 'x' }).type, 'handled');
  manager.handleKey({ name: 'escape' });
  assert.equal(result, 'closed');

  manager.confirm({ title: 'Confirm', message: 'Continue?', onConfirm: () => { result = 'yes'; }, onCancel: () => { result = 'no'; } });
  manager.handleKey({ name: 'right' });
  manager.handleKey({ name: 'enter' });
  assert.equal(result, 'no');

  manager.confirm({ onConfirm: () => { result = 'yes'; } });
  manager.handleKey({ name: 'enter' });
  assert.equal(result, 'yes');
  assert.equal(manager.handleKey({ name: 'unknown' }).type, 'unhandled');
  manager.clear();
  assert.equal(manager.toasts.length, 0);
});

test('adaptive key hints stay within their panel at narrow and wide widths', () => {
  const hints = [['↑/↓', 'move selection'], ['Enter', 'open selected item'], ['Esc', 'go back'], ['PageUp/PageDown', 'move by page']];
  for (const width of [24, 48, 80]) {
    const output = render(KeyHintBar({ title: ' Controls ', hints, columns: 'auto', minCellWidth: 16, maxColumns: 4, theme: themes.ocean }), width, 8);
    assert.match(output, /Controls/);
    assert.ok(output.split('\n').every((line) => line.length < width * 4));
  }
});


test('toast lifecycle reports visible changes, expiry and fallback state through its public manager', () => {
  const manager = createToastManager();
  assert.deepEqual(manager.current(), { level: 'info', message: '' });
  assert.equal(manager.current('idle'), 'idle');
  assert.equal(manager.tick(1), null);

  const shown = manager.show(null);
  assert.equal(shown.message, '');
  assert.equal(manager.current().level, 'info');
  assert.equal(manager.tick(-1).ttl, 5);
  assert.equal(manager.tick(99), null);
  assert.deepEqual(manager.current(), { level: 'info', message: '' });

  manager.show('Saved', 'success', 2);
  assert.equal(manager.current().message, 'Saved');
  manager.clear();
  assert.equal(manager.toast, null);
  assert.deepEqual(manager.current(), { level: 'info', message: '' });
});

test('editor and scroll surfaces handle placeholders, wrapping, tails and autoscroll as public UI behavior', () => {
  const placeholder = renderTextEditorLines({ value: '', cursor: 0, width: 18, height: 3, placeholder: 'Write here', lineNumbers: false });
  assert.match(placeholder.join('\n'), /rite here/);

  const wrapped = renderTextEditorLines({
    value: 'alpha beta gamma delta\nsecond line',
    cursor: 8,
    width: 12,
    height: 4,
    lineNumbers: true,
    scrollRow: 1,
  });
  assert.equal(wrapped.length, 4);
  assert.match(wrapped.join('\n'), /alpha|beta|second/);

  const rows = ['one', 'two', 'three', 'four', 'five'];
  const tail = visibleWindowLines(rows, { height: 2, tail: true });
  assert.deepEqual(tail.lines, ['four', 'five']);
  const sticky = visibleWindowLines(rows, { height: 2, scroll: 0, sticky: true, autoscroll: true, previousTotalRows: 4 });
  assert.equal(sticky.atBottom, true);
  const reading = visibleWindowLines(rows, { height: 2, scroll: 1, sticky: false, autoscroll: true, previousTotalRows: 4 });
  assert.equal(reading.scroll, 1);

  const pane = render(ScrollPane({ lines: rows, height: 4, width: 20, border: false, footer: false, scroll: 1 }), 20, 4);
  assert.match(pane, /five/);
  assert.equal(pane.split('\n').length, 4);
});

test('responsive helpers expose stable narrow, medium and wide contracts including empty windows', () => {
  assert.equal(getResponsiveMode(60), 'narrow');
  assert.equal(getResponsiveMode(120), 'medium');
  assert.equal(getResponsiveMode(180), 'wide');
  assert.equal(getResponsiveMode('bad'), 'narrow');

  assert.deepEqual(responsiveColumns(80, 'narrow'), { mode: 'narrow', left: 80, middle: 80, right: 0 });
  assert.ok(responsiveColumns(130, 'medium').middle > 0);
  assert.ok(responsiveColumns(180, 'wide').right > 0);
  assert.deepEqual(responsiveColumns(-5, 'unknown'), { mode: 'unknown', left: 40, middle: 40, right: 0 });

  assert.deepEqual(takeVisible([], 10, 4), { items: [], start: 0, selected: 0, total: 0, remaining: 0 });
  const view = takeVisible(['a', 'b', 'c', 'd', 'e'], 99, 2);
  assert.deepEqual(view.items, ['d', 'e']);
  assert.equal(view.selected, 4);
  assert.equal(view.remaining, 0);
});

test('frames normalize, clip and pad Unicode content through the public rendering contract', () => {
  assert.deepEqual(normalizeLines('a\nb', 4, 3), ['a   ', 'b   ', '    ']);
  assert.equal(truncateVisibleText('abc🙂def', 5), 'abc🙂d');
  assert.equal(truncateVisibleText('abc', 10), 'abc');

  const frame = createFrame(['🙂 wide', 'short'], { width: 8, height: 3 });
  assert.equal(frame.width, 8);
  assert.equal(frame.height, 3);
  assert.equal(frame.toLines().length, 3);
  assert.match(frame.toString(), /wide/);
  assert.equal(frame.equals(createFrame(frame.toLines(), { width: 8, height: 3 })), true);
  assert.equal(frame.equals(createFrame(frame.toLines(), { width: 9, height: 3 })), false);
  assert.equal(frame.equals(null), false);
});

test('list, grid, hint and split defaults remain usable without custom adapters', () => {
  const simpleList = render(SelectList({ items: ['One', 'Two', 'Three'], selectedIndex: 0, windowSize: 8 }), 28, 8);
  assert.match(simpleList, /One/);
  assert.match(simpleList, /Two/);

  const objectList = render(SelectList({ items: [{ label: 'Named' }, { title: 'Titled' }, { id: 'identified' }], selectedIndex: 2 }), 28, 8);
  assert.match(objectList, /Named/);
  assert.match(objectList, /Titled/);

  assert.match(render(Grid({ items: ['A', 'B'], columns: 0, renderItem: (item, index) => `${index}:${item}` }), 30, 4), /0:A/);
  assert.match(render(KeyHintBar({ hints: [], columns: 2 }), 30, 4), /No shortcuts registered/);
  assert.match(render(KeyHintBar({ hints: [['Enter', 'accept']], columns: 1, border: false }), 30, 3), /accept/);

  const cramped = resolvePaneSizes([{ min: 8, grow: 1 }, { min: 8, grow: 1 }, { size: 8 }], 12, 1);
  assert.deepEqual(cramped, [8, 8, 1]);
  assert.ok(cramped.every((size) => size >= 0));
});
