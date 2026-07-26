import assert from 'node:assert/strict';
import { Box, BottomOverlay, PointerRegion, Text, hitTestPointerRegions, renderToFrame } from '../../../src/lib/index.js';
import { hostileTerminalFixtures } from '../../../scripts/security-testing/contractFixtures.js';
import { securityContractTest } from '../../../scripts/security-testing/contractHelpers.js';

const SEC002 = { audit: 'TERLIO-SEC-002', outcome: 'reject', phase: 'Phase 4' };

securityContractTest(SEC002, 'legacy private marker text cannot create a pointer region', () => {
  const frame = renderToFrame(Text(`${legacyPointerMarker(42, 20)}visible`, { wrap: false }), { width: 20, height: 1 });
  assert.equal(frame.pointerRegions.length, 0);
});

securityContractTest(SEC002, 'guessed pointer marker tokens are inert user-visible content', () => {
  const frame = renderToFrame(Text(`before${hostileTerminalFixtures.pointerMarkerGuess}after`, { wrap: false }), {
    width: 40,
    height: 1,
  });
  assert.equal(frame.pointerRegions.length, 0);
});

securityContractTest(SEC002, 'untrusted text cannot extend or overlap another component pointer region', () => {
  const frame = renderToFrame(PointerRegion({ pointerId: 'real', pointerWidth: 5 },
    Text(`go${legacyPointerMarker(999, 30)}now`, { wrap: false })), { width: 30, height: 1 });
  assert.equal(frame.pointerRegions.length, 1);
  assert.equal(frame.pointerRegions[0].id, 'real');
  assert.equal(frame.pointerRegions[0].bounds.width, 5);
});

securityContractTest({ ...SEC002, outcome: 'allow' }, 'pointer geometry remains correct under wrapping and clipping', () => {
  const frame = renderToFrame(Box({ width: 12, height: 3, border: true },
    PointerRegion({ pointerId: 'wrapped', pointerWidth: 'fill' }, Text('one two three four', { wrap: true }))), {
    width: 12,
    height: 3,
  });
  const region = frame.pointerRegions.find((item) => item.id === 'wrapped');
  assert.ok(region);
  assert.ok(region.segments.every((segment) => segment.x >= 1 && segment.x + segment.width <= 11));
  assert.ok(region.segments.every((segment) => segment.y >= 1 && segment.y < 2));
});

securityContractTest({ ...SEC002, outcome: 'allow' }, 'overlay z-order and modal blocking stay structural rather than text-driven', () => {
  const frame = renderToFrame(BottomOverlay({
    content: PointerRegion({ pointerId: 'background', pointerWidth: 'fill' }, Text('background', { wrap: false })),
    overlay: PointerRegion({ pointerId: 'overlay', pointerWidth: 'fill' }, Text('overlay', { wrap: false })),
    height: 1,
  }), { width: 20, height: 3 });
  const ids = frame.pointerRegions.map((region) => region.id);
  assert.deepEqual(ids, ['background', 'overlay']);
  const hit = hitTestPointerRegions(frame.pointerRegions, 0, 0);
  assert.equal(hit?.region?.id, 'overlay');
});

function legacyPointerMarker(token, width) {
  return `\x1b[?9000;${token};${width}z`;
}
