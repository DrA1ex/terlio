import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BottomOverlay,
  Column,
  PointerRegion,
  TerminalRenderer,
  Text,
  createChatScreen,
  dispatchPointerEvent,
  layout,
  renderNode,
  stripAnsi,
  themes,
} from '../src/lib/index.js';

test('BottomOverlay anchors above a bottom inset without changing content height', () => {
  const content = Column(...Array.from({ length: 8 }, (_, index) => Text(`base-${index}`)));
  const overlay = Column(Text('overlay-a'), Text('overlay-b'));
  const node = BottomOverlay({ content, overlay, height: 8, bottom: 1 });
  const lines = renderNode(node, 20).map(stripAnsi);

  assert.equal(lines.length, 8);
  assert.match(lines[0], /base-0/);
  assert.match(lines[4], /base-4/);
  assert.match(lines[5], /overlay-a/);
  assert.match(lines[6], /overlay-b/);
  assert.match(lines[7], /base-7/);
});

test('BottomOverlay supports aligned widths and clips oversized surfaces inside the viewport', () => {
  const node = BottomOverlay({
    content: Column(...Array.from({ length: 5 }, (_, index) => Text(`row-${index}`))),
    overlay: Column(Text('one'), Text('two'), Text('three'), Text('four')),
    height: 5,
    bottom: 2,
    left: 2,
    right: 2,
    width: 8,
    align: 'right',
  });
  const lines = renderNode(node, 20).map(stripAnsi);

  assert.equal(lines.length, 5);
  assert.equal(lines[0].slice(10, 18).trim(), 'one');
  assert.equal(lines[1].slice(10, 18).trim(), 'two');
  assert.equal(lines[2].slice(10, 18).trim(), 'three');
  assert.match(lines[3], /row-3/);
  assert.match(lines[4], /row-4/);
});

test('BottomOverlay pointer hit-testing prefers the overlay while background remains interactive elsewhere', () => {
  const calls = [];
  const content = PointerRegion({
    pointerId: 'background',
    pointerWidth: 'fill',
    onClick: () => calls.push('background'),
  }, Column(...Array.from({ length: 8 }, (_, index) => Text(`base-${index}`))));
  const overlay = PointerRegion({
    pointerId: 'overlay',
    pointerWidth: 'fill',
    onClick: () => calls.push('overlay'),
  }, Column(Text('choice-a'), Text('choice-b')));
  const frame = layout(BottomOverlay({ content, overlay, height: 8, bottom: 1, width: 12, align: 'right' }), {
    width: 20,
    height: 8,
  });

  const overlayRegion = frame.pointerRegions.find((region) => region.id === 'overlay');
  const backgroundRegion = frame.pointerRegions.find((region) => region.id === 'background');
  assert.deepEqual(overlayRegion.bounds, { x: 8, y: 5, width: 12, height: 2 });
  assert.deepEqual(backgroundRegion.bounds, { x: 0, y: 0, width: 20, height: 8 });

  dispatchPointerEvent({ type: 'pointer', action: 'click', x: 10, y: 5 }, frame.pointerRegions);
  dispatchPointerEvent({ type: 'pointer', action: 'click', x: 2, y: 2 }, frame.pointerRegions);
  assert.deepEqual(calls, ['overlay', 'background']);
});

test('removing a BottomOverlay restores only changed rows through the normal frame diff', () => {
  const writes = [];
  const renderer = new TerminalRenderer({ output: { write: (chunk) => writes.push(String(chunk)) } });
  const content = Column(...Array.from({ length: 8 }, (_, index) => Text(`base-${index}`)));
  renderer.renderNode(BottomOverlay({ content, overlay: Column(Text('popup-a'), Text('popup-b')), height: 8, bottom: 1 }), { width: 20, height: 8 });
  writes.length = 0;

  renderer.renderNode(BottomOverlay({ content, overlay: null, height: 8, bottom: 1 }), { width: 20, height: 8 });
  const patch = writes.join('');

  assert.match(patch, /base-5/);
  assert.match(patch, /base-6/);
  assert.doesNotMatch(patch, /base-0/);
});

test('chat autocomplete overlays the transcript instead of reserving viewport rows', () => {
  const common = {
    columns: 80,
    rows: 18,
    theme: themes.dark,
    inputValue: '/he',
    inputParts: { before: '/h', current: 'e', after: '' },
    messages: [],
    suggestions: [{ label: '/help', detail: '/help', description: 'Show help', insert: '/help' }],
  };
  const withoutSuggestions = createChatScreen({ ...common, suggestionsVisible: false });
  let selected = -1;
  const withSuggestions = createChatScreen({
    ...common,
    suggestionsVisible: true,
    onSuggestionSelect: (_suggestion, index) => { selected = index; },
  });

  assert.equal(withSuggestions.transcriptHeight, withoutSuggestions.transcriptHeight);
  const baseFrame = layout(withoutSuggestions.node, { width: 80, height: 18 });
  const frame = layout(withSuggestions.node, { width: 80, height: 18 });
  const transcript = baseFrame.pointerRegions.find((region) => region.id === 'chat-transcript');
  const popup = frame.pointerRegions.find((region) => region.id === 'chat-suggestions');
  const choice = frame.pointerRegions.find((region) => region.id === 'chat-suggestion:0');
  assert.ok(transcript.bounds.y + transcript.bounds.height > popup.bounds.y, 'autocomplete should overlap transcript rows');

  dispatchPointerEvent({ type: 'pointer', action: 'click', x: choice.bounds.x + 1, y: choice.bounds.y }, frame.pointerRegions);
  assert.equal(selected, 0);
});
