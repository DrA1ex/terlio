import { ansi } from '../ansi/codes.js';
import { createFrame, getFrameRowPaintPriority } from './screen.js';

export function diffFrames(previous, next, {
  bleedRows = 0,
  includeRegionChanges = false,
} = {}) {
  if (!previous) {
    return sortPaintOperations(
      next.toLines().map((line, index) => ({ row: index + 1, line })),
      next,
    );
  }

  const height = Math.max(previous.height, next.height);
  const dirty = new Set();

  for (let index = 0; index < height; index += 1) {
    const previousLine = previous.lines[index] ?? '';
    const nextLine = next.lines[index] ?? '';
    if (previousLine !== nextLine) dirty.add(index);
  }

  if (includeRegionChanges) markChangedRegionRows(previous, next, dirty, height);
  expandDirtyRows(dirty, height, bleedRows);

  return sortPaintOperations(
    [...dirty].map((index) => ({ row: index + 1, line: next.lines[index] ?? '' })),
    next,
  );
}

function sortPaintOperations(operations, frame) {
  return operations.sort((a, b) => {
    const aPriority = getFrameRowPaintPriority(frame, a.row - 1);
    const bPriority = getFrameRowPaintPriority(frame, b.row - 1);
    return aPriority - bPriority || a.row - b.row;
  });
}

export function patchFrames(previous, next, options = {}) {
  return diffFrames(previous, next, options)
    .map((operation) => `${ansi.reset}${ansi.moveTo(operation.row, 1)}${ansi.eraseLine}${operation.line}${ansi.reset}`)
    .join('');
}

export function makeFrame(lines, options) {
  return createFrame(lines, options);
}

function markChangedRegionRows(previous, next, dirty, height) {
  const previousById = regionsById(previous?.pointerRegions);
  const nextById = regionsById(next?.pointerRegions);
  const ids = new Set([...previousById.keys(), ...nextById.keys()]);

  for (const id of ids) {
    const before = previousById.get(id);
    const after = nextById.get(id);
    if (sameBounds(before?.bounds, after?.bounds)) continue;
    markBoundsRows(before?.bounds, dirty, height);
    markBoundsRows(after?.bounds, dirty, height);
  }
}

function regionsById(regions = []) {
  const result = new Map();
  for (const region of regions ?? []) {
    if (!region?.id) continue;
    result.set(String(region.id), region);
  }
  return result;
}

function sameBounds(a, b) {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function markBoundsRows(bounds, dirty, height) {
  if (!bounds) return;
  const start = clampRow(bounds.y, height);
  const end = clampRow((Number(bounds.y) || 0) + Math.max(1, Number(bounds.height) || 1) - 1, height);
  for (let row = start; row <= end; row += 1) dirty.add(row);
}

function expandDirtyRows(dirty, height, amount) {
  const margin = Math.max(0, Math.trunc(Number(amount) || 0));
  if (!margin || !dirty.size) return;
  const source = [...dirty];
  for (const row of source) {
    for (let offset = -margin; offset <= margin; offset += 1) {
      const candidate = row + offset;
      if (candidate >= 0 && candidate < height) dirty.add(candidate);
    }
  }
}

function clampRow(value, height) {
  return Math.max(0, Math.min(Math.max(0, height - 1), Math.trunc(Number(value) || 0)));
}
