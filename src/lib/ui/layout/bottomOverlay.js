import { createNode } from '../node.js';
import { composeOverlayLine } from './overlayCompose.js';
import { fit } from './utils.js';

export function BottomOverlay({
  content = null,
  overlay = null,
  height = 24,
  bottom = 0,
  left = 0,
  right = 0,
  width = null,
  align = 'stretch',
  opaque = true,
} = {}) {
  return createNode('bottomOverlay', {
    height,
    bottom,
    left,
    right,
    overlayWidth: width,
    align,
    opaque,
  }, [content, overlay]);
}

export function renderBottomOverlay(node, assignedWidth, renderNode) {
  const viewportWidth = Math.max(1, Number(assignedWidth) || 1);
  const viewportHeight = Math.max(1, Number(node.props.height) || 24);
  const content = node.children?.[0] ?? null;
  const overlay = node.children?.[1] ?? null;
  const lines = fitLines(renderNode(content, viewportWidth), viewportWidth, viewportHeight);
  if (!overlay) return lines;

  const bottom = clampInteger(node.props.bottom, 0, viewportHeight);
  const left = clampInteger(node.props.left, 0, viewportWidth);
  const right = clampInteger(node.props.right, 0, Math.max(0, viewportWidth - left));
  const availableWidth = Math.max(1, viewportWidth - left - right);
  const hasRequestedWidth = node.props.overlayWidth !== null && node.props.overlayWidth !== undefined;
  const requestedWidth = Number(node.props.overlayWidth);
  const overlayWidth = hasRequestedWidth && Number.isFinite(requestedWidth)
    ? clampInteger(requestedWidth, 1, availableWidth)
    : availableWidth;
  const availableHeight = Math.max(0, viewportHeight - bottom);
  if (availableHeight <= 0) return lines;

  const rendered = renderNode(overlay, overlayWidth);
  const overlayLines = rendered.slice(0, availableHeight);
  if (!overlayLines.length) return lines;

  const startRow = Math.max(0, viewportHeight - bottom - overlayLines.length);
  const startCol = resolveStartColumn({
    align: node.props.align,
    left,
    availableWidth,
    overlayWidth,
  });
  const next = [...lines];

  for (let index = 0; index < overlayLines.length; index += 1) {
    const row = startRow + index;
    if (row < 0 || row >= viewportHeight) continue;
    const source = String(overlayLines[index] ?? '');
    const segment = node.props.opaque === false ? source.replace(/\s+$/u, '') : fit(source, overlayWidth);
    next[row] = composeOverlayLine(next[row], segment, startCol, viewportWidth);
  }

  return next;
}

function resolveStartColumn({ align, left, availableWidth, overlayWidth }) {
  if (align === 'center') return left + Math.max(0, Math.floor((availableWidth - overlayWidth) / 2));
  if (align === 'right') return left + Math.max(0, availableWidth - overlayWidth);
  return left;
}

function fitLines(source, width, height) {
  const lines = source.slice(0, height).map((line) => fit(line, width));
  while (lines.length < height) lines.push(' '.repeat(width));
  return lines;
}

function clampInteger(value, min, max) {
  const number = Math.trunc(Number(value) || 0);
  return Math.max(min, Math.min(max, number));
}
