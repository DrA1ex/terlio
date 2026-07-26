import { normalizePointerRegions } from '../../pointer.js';

export function createLayoutResult(lines = [], pointerRegions = []) {
  return {
    lines: Array.from(lines ?? [], (line) => String(line ?? '')),
    pointerRegions: Array.from(pointerRegions ?? []),
  };
}

export function asLayoutResult(value) {
  if (value && Array.isArray(value.lines) && Array.isArray(value.pointerRegions)) return value;
  if (Array.isArray(value)) return createLayoutResult(value);
  return createLayoutResult(value == null ? [] : [value]);
}

export function translatePointerRegions(regions = [], dx = 0, dy = 0, {
  width = Infinity,
  height = Infinity,
  maxRegions = Infinity,
} = {}) {
  const safeDx = Number(dx) || 0;
  const safeDy = Number(dy) || 0;
  const safeWidth = Number.isFinite(Number(width)) ? Math.max(0, Number(width)) : Infinity;
  const safeHeight = Number.isFinite(Number(height)) ? Math.max(0, Number(height)) : Infinity;
  const output = [];

  for (const region of regions ?? []) {
    const segments = [];
    for (const segment of region?.segments ?? []) {
      const sourceX = Number(segment?.x);
      const sourceY = Number(segment?.y);
      const sourceWidth = Number(segment?.width);
      const sourceHeight = segment?.height === undefined ? 1 : Number(segment.height);
      if (!Number.isInteger(sourceX) || !Number.isInteger(sourceY) ||
          !Number.isInteger(sourceWidth) || sourceWidth <= 0 || sourceHeight !== 1) continue;
      const y = sourceY + safeDy;
      if (y < 0 || y >= safeHeight) continue;
      const start = sourceX + safeDx;
      const end = start + sourceWidth;
      const clippedStart = Math.max(0, start);
      const clippedEnd = Math.min(safeWidth, end);
      if (clippedEnd <= clippedStart) continue;
      segments.push({ x: clippedStart, y, width: clippedEnd - clippedStart, height: 1 });
    }
    if (!segments.length) continue;
    output.push({ ...region, segments, bounds: boundsForSegments(segments) });
  }

  return normalizePointerRegions(output, { width: safeWidth, height: safeHeight, maxRegions });
}

export function clipLayoutResult(value, width = Infinity, height = Infinity) {
  const result = asLayoutResult(value);
  const safeHeight = Number.isFinite(Number(height)) ? Math.max(0, Number(height)) : result.lines.length;
  return createLayoutResult(
    result.lines.slice(0, safeHeight),
    translatePointerRegions(result.pointerRegions, 0, 0, { width, height: safeHeight }),
  );
}

export function boundsForSegments(segments = []) {
  if (!segments.length) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...segments.map((item) => item.x));
  const minY = Math.min(...segments.map((item) => item.y));
  const maxX = Math.max(...segments.map((item) => item.x + item.width));
  const maxY = Math.max(...segments.map((item) => item.y + (item.height ?? 1)));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function applyFixedHeightResult(value, width, height) {
  const result = asLayoutResult(value);
  if (height === null || height === undefined) return result;
  const safeHeight = Math.max(0, Number(height) || 0);
  const lines = result.lines.slice(0, safeHeight);
  while (lines.length < safeHeight) lines.push(' '.repeat(Math.max(0, Number(width) || 0)));
  return createLayoutResult(lines, translatePointerRegions(result.pointerRegions, 0, 0, { width, height: safeHeight }));
}
