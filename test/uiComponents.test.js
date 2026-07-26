import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ansi,
  SelectList,
  ScrollPane,
  ConfirmPrompt,
  Column,
  Modal,
  Toast,
  ProgressBar,
  Row,
  Spinner,
  HelpOverlay,
  renderToString,
  renderTextEditorLines,
  visibleWindowLines,
  visibleLength,
  wcwidth,
  themes,
  InputEditor,
  parseKey,
  Grid,
  stripAnsi,
  Text,
  WorkspaceShell,
  WorkspacePane,
  WorkspaceCommandBar,
  WorkspaceFooter,
  KeyHintBar,
  resolveWorkspaceShellLayout,
  measureNodeHeight,
  splitWorkspaceColumns,
  resolveAutoScrollOffset,
  resolveScrollKeyOffset,
  isScrollAtBottom,
} from '../src/lib/index.js';

test('ProgressBar variants expose one-row and three-row layout heights', () => {
  assert.equal(measureNodeHeight(ProgressBar({ value: 42, width: 16, variant: 'compact' }), 40), 1);
  assert.equal(measureNodeHeight(ProgressBar({ value: 42, width: 16, variant: 'line' }), 40), 1);
  assert.equal(measureNodeHeight(ProgressBar({ value: 42, width: 16, variant: 'inset' }), 40), 1);
  const boxed = ProgressBar({ value: 42, width: 16, variant: 'boxed' });
  assert.equal(measureNodeHeight(boxed, 40), 3);
  assert.equal(measureNodeHeight(Row({ gap: 1 }, Text('status'), boxed), 40), 3);
  assert.equal(measureNodeHeight(Column(Text('status'), boxed), 40), 4);
  assert.equal(measureNodeHeight(boxed, 2), 1);
});

test('SelectList renders a scrollable selected window', () => {
  const items = Array.from({ length: 12 }, (_, index) => ({
    label: `item-${index + 1}`,
    description: `description ${index + 1}`,
  }));
  const output = renderToString(SelectList({ title: 'Pick', items, selectedIndex: 8, windowSize: 5 }), { width: 48, height: 9 });

  assert.match(output, /Pick 9\/12/);
  assert.match(output, /item-9/);
  assert.match(output, /↑6/);
  assert.match(output, /↓1/);
  assert.doesNotMatch(output, /more/);
  assert.match(output, /item-7/);
  assert.match(output, /item-11/);
  assert.doesNotMatch(output, /item-1 —/);
});



test('SelectList can wrap long item labels into reserved item rows', () => {
  const output = stripAnsi(renderToString(SelectList({
    title: 'Entries',
    items: [{ title: 'Structured Assistant Blocks', category: 'AI blocks' }, { title: 'Runtime, Frames, and Diff Rendering', category: 'Runtime' }],
    getLabel: (item) => item.title,
    getDescription: (item) => item.category,
    selectedIndex: 0,
    windowSize: 2,
    wrapItems: true,
    rowLines: 2,
    reserveItemLines: true,
  }), { width: 32, height: 8 }));

  assert.match(output, /Structured Assistant/);
  assert.match(output, /Blocks/);
  assert.match(output, /Runtime, Frames/);
});

test('single-cell symbols used by toast icons do not collapse borders', () => {
  assert.equal(wcwidth('✓'), 1);
  const output = stripAnsi(renderToString(Toast({ level: 'success', message: 'Saved', theme: themes.ocean, width: 40 }), { width: 40, height: 4 }));
  const body = output.split('\n').find((line) => line.includes('Saved')) ?? '';
  assert.match(body, /✓/);
  assert.match(body, /│┐\s*$/);
});

test('ConfirmPrompt renders two choices with selected marker', () => {
  const output = renderToString(ConfirmPrompt({ message: 'Apply patch?', selected: 'cancel' }), { width: 44, height: 7 });

  assert.match(output, /Apply patch\?/);
  assert.match(output, /Yes/);
  assert.match(output, /› No/);
});

test('status components render modal, toast, progress and spinner', () => {
  const modal = renderToString(Modal({ title: 'Details', children: ['Body'] }), { width: 30, height: 5 });
  const toast = renderToString(Toast({ level: 'warning', message: 'Careful' }), { width: 30, height: 3 });
  const progress = renderToString(ProgressBar({ value: 25, total: 100, width: 10, label: 'Loading' }), { width: 40, height: 1 });
  const spinner = renderToString(Spinner({ frame: 2, label: 'Thinking' }), { width: 20, height: 1 });
  const help = renderToString(HelpOverlay({ shortcuts: [['Esc', 'close'], ['Enter', 'accept']] }), { width: 34, height: 8 });

  assert.match(modal, /Details/);
  assert.match(toast, /Careful/);
  assert.match(stripAnsi(renderToString(Toast({ level: 'warning', message: 'Careful' }), { width: 30, height: 4 })), /│┐/);
  assert.match(toast, /\x1b\[38;5;214m/);

  const accentToast = renderToString(Toast({ level: 'info', message: 'Visible shadow', detail: 'theme aware', theme: themes.ocean, width: 60 }), { width: 60, height: 5 });
  const shadowLine = accentToast.split('\n').find((line) => stripAnsi(line).includes('│┐')) ?? '';
  assert.match(accentToast, /\x1b\[38;2;/);
  assert.match(accentToast, /theme aware/);
  assert.ok(visibleLength(shadowLine) >= 54);
  assert.match(progress, /Loading \[██▌       /);
  assert.match(progress, /25%/);
  assert.match(spinner, /Thinking/);
  assert.match(help, /Esc/);
  assert.match(help, /accept/);
});



test('Grid renders equal-width aligned columns', () => {
  const output = stripAnsi(renderToString(Grid({
    columns: 3,
    items: [['A', 'alpha'], ['LongKey', 'beta'], ['C', 'gamma'], ['D', 'delta']],
    renderItem: ([key, label]) => `${key} ${label}`,
  }), { width: 60, height: 2 }));

  const [first, second] = output.split('\n');
  assert.match(first, /A alpha/);
  assert.match(first, /LongKey beta/);
  assert.match(first, /C gamma/);
  assert.match(second, /D delta/);
  assert.ok(first.indexOf('LongKey beta') >= 20);
  assert.ok(first.indexOf('C gamma') >= 40);
});

test('Grid can render compact table borders', () => {
  const output = stripAnsi(renderToString(Grid({
    columns: 2,
    border: true,
    items: [['Enter', 'open'], ['Tab', 'switch'], ['Esc', 'close']],
    renderItem: ([key, label]) => `${key} ${label}`,
  }), { width: 40, height: 5 }));

  assert.match(output, /┌/);
  assert.match(output, /┬/);
  assert.match(output, /┼/);
  assert.match(output, /Enter open/);
  assert.match(output, /Esc close/);
});

test('Text editor view wraps long draft text and keeps cursor visible', () => {
  const editor = new InputEditor('Hello customer, this line is intentionally long so it wraps.');
  editor.move(-12);
  const lines = renderTextEditorLines({ value: editor.value, cursor: editor.cursor, width: 24, height: 4 });
  assert.equal(lines.length, 4);
  assert.ok(lines.some((line) => line.includes(ansi.inverse)));
  assert.equal(lines.some((line) => line.includes('█')), false);
  assert.ok(lines.some((line) => /│/.test(line)));
});

test('InputEditor supports explicit line breaks and key parser recognizes Ctrl+J', () => {
  const editor = new InputEditor('hello');
  editor.insertLineBreak();
  editor.insert('world');
  assert.equal(editor.value, 'hello\nworld');
  const key = parseKey('\n');
  assert.equal(key.name, 'enter');
  assert.equal(key.ctrl, true);
});

test('ScrollPane uses every assigned row when border and footer are disabled', () => {
  const output = stripAnsi(renderToString(ScrollPane({
    lines: ['one', 'two', 'three'],
    width: 20,
    height: 3,
    border: false,
    footer: false,
  }), { width: 20, height: 3 }));

  assert.deepEqual(output.split('\n').map((line) => line.trim()), ['one', 'two', 'three']);
});

test('visibleWindowLines returns a clamped scrollable window', () => {
  const window = visibleWindowLines(['a', 'b', 'c', 'd'], { height: 2, scroll: 10 });
  assert.deepEqual(window.lines, ['c', 'd']);
  assert.equal(window.scroll, 2);
  assert.equal(window.maxScroll, 2);
});



test('auto-scroll helper sticks to bottom only while already pinned', () => {
  assert.equal(resolveAutoScrollOffset({ scroll: 0, previousTotalRows: 2, totalRows: 8, visibleRows: 3 }), 5);
  assert.equal(resolveAutoScrollOffset({ scroll: 1, previousTotalRows: 8, totalRows: 10, visibleRows: 3 }), 1);
  assert.equal(resolveAutoScrollOffset({ scroll: 5, previousTotalRows: 8, totalRows: 10, visibleRows: 3 }), 7);
  assert.equal(isScrollAtBottom(7, 10, 3), true);
  assert.equal(isScrollAtBottom(6, 10, 3), false);

  const pinnedWindow = visibleWindowLines(['a', 'b', 'c', 'd', 'e'], {
    height: 2,
    scroll: 1,
    previousTotalRows: 3,
    autoscroll: true,
  });
  assert.deepEqual(pinnedWindow.lines, ['d', 'e']);
  assert.equal(pinnedWindow.atBottom, true);

  const manualWindow = visibleWindowLines(['a', 'b', 'c', 'd', 'e'], {
    height: 2,
    scroll: 1,
    previousTotalRows: 5,
    sticky: false,
    autoscroll: true,
  });
  assert.deepEqual(manualWindow.lines, ['b', 'c']);
  assert.equal(manualWindow.atBottom, false);
});


test('resolveScrollKeyOffset handles line and page scroll for read-only panes', () => {
  const lineUp = resolveScrollKeyOffset({ keyName: 'up', scroll: 8, totalRows: 20, visibleRows: 5 });
  assert.equal(lineUp.handled, true);
  assert.equal(lineUp.scroll, 7);
  assert.equal(lineUp.atBottom, false);

  const lineDownFromStickyBottom = resolveScrollKeyOffset({ keyName: 'down', scroll: 0, totalRows: 20, visibleRows: 5, sticky: true });
  assert.equal(lineDownFromStickyBottom.scroll, 15);
  assert.equal(lineDownFromStickyBottom.atBottom, true);

  const pageUp = resolveScrollKeyOffset({ keyName: 'page-up', scroll: 15, totalRows: 20, visibleRows: 5 });
  assert.equal(pageUp.scroll, 10);

  const ignored = resolveScrollKeyOffset({ keyName: 'left', scroll: 3, totalRows: 20, visibleRows: 5 });
  assert.equal(ignored.handled, false);
  assert.equal(ignored.scroll, 3);
});

test('ANSI truncation and layout fitting preserve color sequences', async () => {
  const { color, themes, truncateVisible, renderToString, Text } = await import('../src/lib/index.js');
  const colored = color(themes.ocean, 'accent', 'abcdef');
  assert.match(truncateVisible(colored, 4), /\x1b\[/);
  const rendered = renderToString(Text(colored, { wrap: false }), { width: 4, height: 1 });
  assert.match(rendered, /\x1b\[/);
});

test('InputEditor can move vertically across multiline text', () => {
  const editor = new InputEditor('alpha\nbravo\ncharlie');
  editor.end();
  editor.moveVertical(-1);
  assert.equal(editor.getCursorPosition().line, 1);
  editor.moveVertical(-1);
  assert.equal(editor.getCursorPosition().line, 0);
  editor.moveVertical(1);
  assert.equal(editor.getCursorPosition().line, 1);
});

test('scroll state helpers clamp offsets without accumulating hidden overflow', async () => {
  const { scrollBy, scrollPage, normalizeScrollMap } = await import('../src/lib/index.js');
  assert.equal(scrollBy(0, 10, 2), 2);
  assert.equal(scrollBy(2, -1, 2), 1);
  assert.equal(scrollPage(0, 1, 5, 3), 3);
  assert.deepEqual(normalizeScrollMap({ rail: 99, reply: -5 }, { rail: 4, reply: 2 }), { rail: 4, reply: 0 });
});

test('WorkspaceShell pins command and footer while main content grows', () => {
  const view = WorkspaceShell({
    title: 'Demo Workspace',
    tabs: [{ id: 'one', label: 'One' }],
    activeTab: 'one',
    main: WorkspacePane({ title: ' Main ', children: [Text('content')] }),
    command: WorkspaceCommandBar({ value: 'run', mode: 'COMMAND' }),
    footer: WorkspaceFooter({ left: ['Connected'], right: ['demo'] }),
    height: 18,
  });
  const output = stripAnsi(renderToString(view, { width: 90, height: 18 }));
  assert.match(output, /Demo Workspace/);
  assert.match(output, /COMMAND/);
  assert.match(output, /Connected/);
  assert.equal(output.split('\n').length, 18);
});

test('splitWorkspaceColumns switches from one to two to three pane layouts', () => {
  assert.equal(splitWorkspaceColumns(90).mode, 'narrow');
  assert.equal(splitWorkspaceColumns(130).mode, 'medium');
  assert.equal(splitWorkspaceColumns(180).mode, 'wide');
  assert.equal(splitWorkspaceColumns(180).widths.length, 3);
});


test('resolveWorkspaceShellLayout measures real shell chrome instead of relying on hard-coded rows', () => {
  const command = WorkspaceCommandBar({ value: 'search <empty>▌', mode: 'PALETTE', suggestions: ['chat 3'] });
  const activity = KeyHintBar({
    title: ' LOCAL HELP ',
    gridBorder: true,
    hints: [
      ['Type', 'filter actions'],
      ['↑/↓', 'select action'],
      ['PgUp/PgDn', 'page list'],
      ['Enter', 'accept action'],
      ['Esc', 'clear filter'],
      ['Tab', 'switch pane'],
    ],
  });
  const layout = resolveWorkspaceShellLayout({
    width: 80,
    height: 24,
    title: 'Command Palette',
    subtitle: 'action launcher workspace',
    stats: [{ label: 'Matches', value: 24 }],
    right: [{ label: 'Status', value: 'ready' }],
    tabs: [{ id: 'palette', label: 'Palette' }],
    activeTab: 'palette',
    tabHint: 'Tab focus',
    command,
    activity,
    minMainHeight: 6,
  });

  assert.equal(layout.fixedRows + layout.mainHeight, 24);
  assert.equal(layout.constrained, true);
  assert.equal(measureNodeHeight(activity, 80), 7);
});
