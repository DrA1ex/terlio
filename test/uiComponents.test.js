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
