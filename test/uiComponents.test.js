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
