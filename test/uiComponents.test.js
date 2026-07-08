import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SelectList,
  ConfirmPrompt,
  Modal,
  Toast,
  ProgressBar,
  Spinner,
  HelpOverlay,
  renderToString,
  renderTextEditorLines,
  visibleWindowLines,
  InputEditor,
  parseKey,
  stripAnsi,
  Text,
  WorkspaceShell,
  WorkspacePane,
  WorkspaceCommandBar,
  WorkspaceFooter,
  splitWorkspaceColumns,
} from '../src/lib/index.js';

test('SelectList renders a scrollable selected window', () => {
  const items = Array.from({ length: 12 }, (_, index) => ({
    label: `item-${index + 1}`,
    description: `description ${index + 1}`,
  }));
  const output = renderToString(SelectList({ title: 'Pick', items, selectedIndex: 8, windowSize: 5 }), { width: 48, height: 9 });

  assert.match(output, /Pick 9\/12/);
  assert.match(output, /item-9/);
  assert.match(output, /↑ 6 more/);
  assert.match(output, /↓ 1 more/);
  assert.doesNotMatch(output, /item-1 —/);
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
  assert.match(toast, /warning/);
  assert.match(progress, /Loading \[###/);
  assert.match(progress, /25%/);
  assert.match(spinner, /Thinking/);
  assert.match(help, /Esc/);
  assert.match(help, /accept/);
});


test('Text editor view wraps long draft text and keeps cursor visible', () => {
  const editor = new InputEditor('Hello customer, this line is intentionally long so it wraps.');
  editor.move(-12);
  const lines = renderTextEditorLines({ value: editor.value, cursor: editor.cursor, width: 24, height: 4 });
  assert.equal(lines.length, 4);
  assert.ok(lines.some((line) => line.includes('█')));
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

test('visibleWindowLines returns a clamped scrollable window', () => {
  const window = visibleWindowLines(['a', 'b', 'c', 'd'], { height: 2, scroll: 10 });
  assert.deepEqual(window.lines, ['c', 'd']);
  assert.equal(window.scroll, 2);
  assert.equal(window.maxScroll, 2);
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
