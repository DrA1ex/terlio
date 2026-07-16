import { visibleLength } from '../../ansi/text.js';
import { extractPointerRegions, pointerMarker } from '../../pointer.js';
import { createFrame } from '../screen.js';
import { renderBox } from './box.js';
import { renderColumn } from './column.js';
import { renderGrid } from './grid.js';
import { renderRow } from './row.js';
import { renderShadowOverlay } from './shadowOverlay.js';
import { renderText } from './text.js';
import { renderSplitPane } from './splitPane.js';
import { renderDocked } from './docked.js';
import { renderKeyHintBar } from '../keyHintBar.js';
import { renderOverlayHost } from '../../overlayHost.js';
import { renderSelectList } from '../components/select.js';
import { fit, wrapPlain } from './utils.js';

export function layout(node, { width = 80, height = 24 } = {}) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const pointerContext = { nextToken: 1, metadata: new Map(), stack: [] };
  const markedLines = renderNodeInternal(node, safeWidth, pointerContext);
  const extracted = extractPointerRegions(markedLines, pointerContext.metadata, { width: safeWidth, height: safeHeight });
  return createFrame(extracted.lines, { width: safeWidth, height: safeHeight, pointerRegions: extracted.regions });
}

export function measureNodeHeight(node, width = 80) {
  return renderNode(node, Math.max(1, width)).length;
}

export function renderNode(node, width = 80) {
  return renderNodeInternal(node, Math.max(1, width), null);
}

function renderNodeInternal(node, width, pointerContext) {
  if (!node) return [];
  if (typeof node === 'string' || typeof node === 'number') return wrapPlain(String(node), width);

  const pointerToken = pointerContext && isPointerInteractive(node.props)
    ? registerPointerNode(node.props, pointerContext)
    : null;
  if (pointerToken !== null) pointerContext.stack.push(pointerToken);

  const childRenderer = (child, childWidth) => renderNodeInternal(child, childWidth, pointerContext);
  let lines;

  switch (node.type) {
    case 'text':
      lines = renderText(node, width);
      break;
    case 'box':
      lines = renderBox(node, width, childRenderer);
      break;
    case 'row':
      lines = renderRow(node, width, childRenderer);
      break;
    case 'column':
      lines = renderColumn(node, width, childRenderer);
      break;
    case 'pointerRegion':
      lines = renderColumn({ type: 'column', props: node.props || {}, children: node.children || [] }, width, childRenderer);
      break;
    case 'shadowOverlay':
      lines = renderShadowOverlay(node, width, childRenderer);
      break;
    case 'grid':
      lines = renderGrid(node, width);
      break;
    case 'splitPane':
      lines = renderSplitPane(node, width, childRenderer);
      break;
    case 'docked':
      lines = renderDocked(node, width, childRenderer);
      break;
    case 'keyHintBar':
      lines = renderKeyHintBar(node, width, childRenderer);
      break;
    case 'overlayHost':
      lines = renderOverlayHost(node, width, childRenderer);
      break;
    case 'selectList':
      lines = renderSelectList(node, width, childRenderer);
      break;
    default:
      lines = renderColumn(node, width, childRenderer);
      break;
  }

  if (pointerToken !== null) pointerContext.stack.pop();
  return pointerToken !== null
    ? markPointerLines(lines, node.props, width, pointerToken)
    : lines;
}

function isPointerInteractive(props = {}) {
  if (!props || props.pointerEvents === 'none' || props.pointer === false) return false;
  return props.pointer === true || props.pointerId !== undefined ||
    ['onPointer', 'onClick', 'onWheel', 'onDrag', 'onMove', 'onRelease'].some((name) => typeof props[name] === 'function');
}

function registerPointerNode(props, context) {
  const token = context.nextToken++;
  context.metadata.set(token, {
    id: props.pointerId ?? props.id ?? `pointer-${token}`,
    data: props.pointerData ?? props.data,
    disabled: Boolean(props.disabled),
    pointerEvents: props.pointerEvents ?? 'auto',
    parentToken: context.stack.at(-1) ?? null,
    onPointer: props.onPointer,
    onClick: props.onClick,
    onWheel: props.onWheel,
    onDrag: props.onDrag,
    onMove: props.onMove,
    onRelease: props.onRelease,
  });
  return token;
}

function markPointerLines(lines, props, assignedWidth, token) {
  return lines.map((line) => {
    const span = resolvePointerWidth(props.pointerWidth, line, assignedWidth);
    return pointerMarker(token, span) + line;
  });
}

function resolvePointerWidth(pointerWidth, line, assignedWidth) {
  if (pointerWidth === 'fill') return Math.max(1, Number(assignedWidth) || 1);
  if (Number.isFinite(Number(pointerWidth)) && Number(pointerWidth) > 0) return Number(pointerWidth);
  return Math.max(1, visibleLength(String(line ?? '').trimEnd()));
}

export { fit };

export { SplitPane, resolvePaneSizes } from './splitPane.js';
export { Docked } from './docked.js';
