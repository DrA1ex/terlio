import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BottomOverlay,
  Box,
  Column,
  OverlayHost,
  PointerRegion,
  Text,
  createFrame,
  createOverlayManager,
  dispatchPointerEvent,
  hitTestPointerRegions,
  parsePointer,
  renderToFrame,
  requestsPointerReporting,
} from '../../src/lib/index.js';
import * as pointerModule from '../../src/lib/pointer.js';

test('phase 4 removes legacy pointer marker encoders and parsers from production code', () => {
  assert.equal('pointerMarker' in pointerModule, false);
  assert.equal('stripPointerMarkers' in pointerModule, false);
  assert.equal('extractPointerRegions' in pointerModule, false);
});

test('pointer regions remain structured through wrapping, clipping and nested borders', () => {
  const frame = renderToFrame(Box({ border: true, width: 14, height: 4 },
    PointerRegion({ pointerId: 'wrapped', pointerWidth: 'fill' },
      Text('one two three four five', { wrap: true }))), {
    width: 14,
    height: 4,
  });

  const region = frame.pointerRegions.find((item) => item.id === 'wrapped');
  assert.ok(region);
  assert.deepEqual(region.segments, [
    { x: 1, y: 1, width: 12, height: 1 },
    { x: 1, y: 2, width: 12, height: 1 },
  ]);
  assert.deepEqual(region.bounds, { x: 1, y: 1, width: 12, height: 2 });
  assert.doesNotMatch(frame.toString(), /\x1b\[\?9000/u);
});

test('bottom overlays keep structural z-order without replacing background regions outside coverage', () => {
  const frame = renderToFrame(BottomOverlay({
    content: PointerRegion({ pointerId: 'background', pointerWidth: 'fill' },
      Column(Text('background'), Text('background'), Text('background'))),
    overlay: PointerRegion({ pointerId: 'overlay', pointerWidth: 'fill' }, Text('overlay')),
    height: 3,
    width: 8,
    align: 'right',
  }), { width: 20, height: 3 });

  assert.equal(hitTestPointerRegions(frame.pointerRegions, 13, 2)?.region.id, 'overlay');
  assert.equal(hitTestPointerRegions(frame.pointerRegions, 2, 2)?.region.id, 'background');
});

test('blocking overlays discard background pointer regions structurally', () => {
  const manager = createOverlayManager();
  manager.modal({
    node: PointerRegion({ pointerId: 'modal', pointerWidth: 'fill' },
      Box({ border: true, width: 20 }, Text('modal'))),
    shadow: false,
  });

  const frame = renderToFrame(OverlayHost({
    content: PointerRegion({ pointerId: 'background', pointerWidth: 'fill' }, Text('background')),
    manager,
    width: 40,
    height: 8,
  }), { width: 40, height: 8 });

  assert.deepEqual(frame.pointerRegions.map((region) => region.id), ['modal']);
  assert.equal(hitTestPointerRegions(frame.pointerRegions, 0, 0), null);
});

test('pointer region limit caps a frame without throwing or changing rendered text', () => {
  const children = Array.from({ length: 6 }, (_, index) => PointerRegion({
    pointerId: `region-${index}`,
    pointerWidth: 'fill',
  }, Text(`line-${index}`, { wrap: false })));

  const frame = renderToFrame(Column(...children), {
    width: 20,
    height: 6,
    terminalPolicy: { limits: { pointerRegions: 3 } },
  });

  assert.deepEqual(frame.pointerRegions.map((region) => region.id), ['region-0', 'region-1', 'region-2']);
  assert.match(frame.toString(), /line-5/u);
});

test('direct frames enforce the pointer region cap outside the layout pipeline', () => {
  const regions = Array.from({ length: 6 }, (_, index) => ({
    token: index + 1,
    id: `direct-${index}`,
    segments: [{ x: index, y: 0, width: 1, height: 1 }],
  }));
  const frame = createFrame(['      '], {
    width: 6,
    height: 1,
    pointerRegions: regions,
    pointerRegionLimit: 2,
  });

  assert.deepEqual(frame.pointerRegions.map((region) => region.id), ['direct-0', 'direct-1']);

  const defaultUnlimited = createFrame(['x'], {
    width: 1,
    height: 1,
    pointerRegions: Array.from({ length: 4097 }, (_, index) => ({
      token: index + 1,
      id: `default-${index}`,
      segments: [{ x: 0, y: 0, width: 1, height: 1 }],
    })),
  });
  assert.equal(defaultUnlimited.pointerRegions.length, 4097);
});

test('invalid pointer tokens and geometry are rejected without crashing hit-testing or dispatch', () => {
  const malformed = [
    null,
    { token: 'invalid', id: 'string-token', segments: [{ x: 0, y: 0, width: 4, height: 1 }] },
    { token: '4', id: 'numeric-string-token', segments: [{ x: 0, y: 0, width: 4, height: 1 }] },
    { token: 1, id: 'nan-x', segments: [{ x: Number.NaN, y: 0, width: 4, height: 1 }] },
    { token: 2, id: 'negative-width', segments: [{ x: 0, y: 0, width: -1, height: 1 }] },
    { token: 3, parentToken: 3, id: 'valid', segments: [{ x: 1, y: 1, width: 4, height: 1 }] },
    { token: 3, id: 'duplicate', segments: [{ x: 1, y: 1, width: 4, height: 1 }] },
  ];

  const frame = createFrame(['      ', '      '], { width: 6, height: 2, pointerRegions: malformed });
  assert.deepEqual(frame.pointerRegions.map((region) => region.id), ['valid']);
  assert.equal(frame.pointerRegions[0].parentToken, null);
  assert.equal(requestsPointerReporting(frame.pointerRegions), true);
  assert.equal(hitTestPointerRegions(frame.pointerRegions, 2, 1)?.region.id, 'valid');

  const click = parsePointer('\x1b[<0;3;2M');
  assert.doesNotThrow(() => dispatchPointerEvent(click, malformed));
});

test('cyclic parent tokens cannot trap pointer routing', () => {
  const calls = [];
  const regions = [
    {
      token: 1,
      parentToken: 2,
      id: 'first',
      segments: [{ x: 0, y: 0, width: 4, height: 1 }],
      onClick: () => calls.push('first'),
    },
    {
      token: 2,
      parentToken: 1,
      id: 'second',
      segments: [{ x: 0, y: 0, width: 4, height: 1 }],
      onClick: () => calls.push('second'),
    },
  ];

  const result = dispatchPointerEvent(parsePointer('\x1b[<0;2;1M'), regions);
  assert.equal(result.handled, true);
  assert.deepEqual(calls, ['second', 'first']);
});
