import { stripAnsi } from '../../ansi/text.js';
import { createNode } from '../node.js';
import { asLayoutResult, createLayoutResult, translatePointerRegions } from './result.js';
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
  isolate = false,
} = {}) {
  return createNode('bottomOverlay', {
    height,
    bottom,
    left,
    right,
    overlayWidth: width,
    align,
    opaque,
    isolate,
  }, [content, overlay]);
}

export function renderBottomOverlay(node, assignedWidth, renderNode) {
  const viewportWidth = Math.max(1, Number(assignedWidth) || 1);
  const viewportHeight = Math.max(1, Number(node.props.height) || 24);
  const content = node.children?.[0] ?? null;
  const overlay = node.children?.[1] ?? null;
  const contentResult = fitResult(renderNode(content, viewportWidth), viewportWidth, viewportHeight);
  const lines = [...contentResult.lines];
  if (!overlay) return contentResult;

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
  if (availableHeight <= 0) return contentResult;

  const rendered = asLayoutResult(renderNode(overlay, overlayWidth));
  const overlayLines = rendered.lines.slice(0, availableHeight);
  if (!overlayLines.length) return contentResult;

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
    let base = next[row];
    if (node.props.isolate === true && node.props.opaque !== false) {
      if (isHorizontalBorderRule(base)) {
        base = ' '.repeat(viewportWidth);
      } else {
        if (startCol > 0) base = composeOverlayLine(base, ' ', startCol - 1, viewportWidth);
        const endCol = startCol + overlayWidth;
        if (endCol < viewportWidth) base = composeOverlayLine(base, ' ', endCol, viewportWidth);
      }
    }
    next[row] = composeOverlayLine(base, segment, startCol, viewportWidth);
  }

  return createLayoutResult(next, [
    ...contentResult.pointerRegions,
    ...translatePointerRegions(rendered.pointerRegions, startCol, startRow, { width: viewportWidth, height: viewportHeight }),
  ]);
}

function resolveStartColumn({ align, left, availableWidth, overlayWidth }) {
  if (align === 'center') return left + Math.max(0, Math.floor((availableWidth - overlayWidth) / 2));
  if (align === 'right') return left + Math.max(0, availableWidth - overlayWidth);
  return left;
}

function fitResult(source, width, height) {
  const result = asLayoutResult(source);
  const lines = result.lines.slice(0, height).map((line) => fit(line, width));
  while (lines.length < height) lines.push(' '.repeat(width));
  return createLayoutResult(lines, translatePointerRegions(result.pointerRegions, 0, 0, { width, height }));
}

function clampInteger(value, min, max) {
  const number = Math.trunc(Number(value) || 0);
  return Math.max(min, Math.min(max, number));
}


function isHorizontalBorderRule(value) {
  const plain = stripAnsi(value).trimEnd();
  if (!plain || !/^[┌└].*[┐┘]$/.test(plain)) return false;
  const ruleCells = Array.from(plain).filter((char) => char === '─').length;
  return ruleCells >= Math.max(1, plain.length - 4);
}
