import test from 'node:test';
import assert from 'node:assert/strict';
import { Box, Column, Row, Text, TerminalRenderer, renderToFrame, renderToString, createFrame, diffFrames, patchFrames } from '../src/lib/index.js';

test('renderToFrame renders bordered boxes into a fixed-size virtual frame', () => {
  const frame = renderToFrame(Box({ border: true, padding: 1 }, Text('Hello')), { width: 12, height: 5 });
  assert.deepEqual(frame.toLines(), [
    '┌──────────┐',
    '│          │',
    '│ Hello    │',
    '│          │',
    '└──────────┘',
  ]);
});

test('Row and Column compose simple terminal layouts', () => {
  const view = Column(
    Text('Header'),
    Row(Text('A'), Text('B')),
    Text('Footer'),
  );
  assert.equal(renderToString(view, { width: 12, height: 4 }), 'Header      \nAB          \nFooter      \n            ');
});

test('createFrame normalizes width and height', () => {
  assert.deepEqual(createFrame(['abcdef', 'x'], { width: 3, height: 3 }).toLines(), ['abc', 'x  ', '   ']);
});

test('diffFrames returns only changed rows and patchFrames emits cursor moves', () => {
  const previous = createFrame(['one', 'two'], { width: 5, height: 2 });
  const next = createFrame(['one', 'TWO'], { width: 5, height: 2 });
  assert.deepEqual(diffFrames(previous, next), [{ row: 2, line: 'TWO  ' }]);
  assert.equal(patchFrames(previous, next), '\x1b[0m\x1b[2;1H\x1b[2KTWO  \x1b[0m');
});

test('Box height reserves vertical space for fixed footer layouts', () => {
  const view = Column(
    Text('top'),
    Box({ border: false, height: 3 }, Text('main')),
    Text('bottom'),
  );
  assert.deepEqual(renderToFrame(view, { width: 8, height: 5 }).toLines(), [
    'top     ',
    'main    ',
    '        ',
    '        ',
    'bottom  ',
  ]);
});


test('Column grow child pins following footer to the bottom', () => {
  const view = Column({ height: 6 },
    Text('top'),
    Box({ border: false, grow: true }, Text('main')),
    Text('bottom'),
  );
  assert.deepEqual(renderToFrame(view, { width: 8, height: 6 }).toLines(), [
    'top     ',
    'main    ',
    '        ',
    '        ',
    '        ',
    'bottom  ',
  ]);
});


test('fixed-height bordered boxes keep the closing border when content overflows', () => {
  const frame = renderToFrame(Box({ border: true, height: 3 }, Text('one'), Text('two')), { width: 8, height: 3 });
  assert.deepEqual(frame.toLines(), [
    '┌──────┐',
    '│one   │',
    '└──────┘',
  ]);
});

test('fixed-height rows pass the assigned height to child boxes', () => {
  const frame = renderToFrame(Row({ height: 4, widths: [8, 8], gap: 1 },
    Box({ border: true }, Text('left'), Text('overflow')),
    Box({ border: true }, Text('right')),
  ), { width: 17, height: 4 });
  const lines = frame.toLines();
  assert.match(lines[0], /┌──────┐ ┌──────┐/);
  assert.match(lines[3], /└──────┘ └──────┘/);
});


test('patchFrames paints block-glyph rows after ordinary neighboring rows', () => {
  const frame = createFrame([
    'above ',
    '████  ',
    'below ',
  ], { width: 6, height: 3 });

  const patch = patchFrames(null, frame);
  const above = patch.indexOf('\x1b[1;1H');
  const below = patch.indexOf('\x1b[3;1H');
  const progress = patch.indexOf('\x1b[2;1H');

  assert.ok(above >= 0 && below >= 0 && progress >= 0);
  assert.ok(progress > above);
  assert.ok(progress > below);
});

test('patchFrames repaints an unchanged block row after a changed neighbor', () => {
  const previous = createFrame([
    'above ',
    '████  ',
    'before',
  ], { width: 6, height: 3 });
  const next = createFrame([
    'above ',
    '████  ',
    'after ',
  ], { width: 6, height: 3 });

  const patch = patchFrames(previous, next, { bleedRows: 1 });
  const neighbor = patch.indexOf('\x1b[3;1H');
  const progress = patch.indexOf('\x1b[2;1H');

  assert.ok(neighbor >= 0 && progress >= 0);
  assert.ok(progress > neighbor);
});


test('TerminalRenderer emits block rows last when a neighboring row changes', () => {
  const writes = [];
  const renderer = new TerminalRenderer({ output: { write: (chunk) => writes.push(String(chunk)) } });
  renderer.renderFrame(createFrame([
    'above ',
    '████  ',
    'before',
  ], { width: 6, height: 3 }));
  writes.length = 0;

  renderer.renderFrame(createFrame([
    'above ',
    '████  ',
    'after ',
  ], { width: 6, height: 3 }));

  const patch = writes.join('');
  assert.ok(patch.indexOf('\x1b[2;1H') > patch.indexOf('\x1b[3;1H'));
});
