import { createNode, Column } from '../node.js';
import { updateScrollState } from '../../smartScrollState.js';
import { asLayoutResult, createLayoutResult, translatePointerRegions } from './result.js';
import { fit } from './utils.js';

/**
 * Clips and scrolls an arbitrary UI subtree without adding its own border.
 * A parent such as WorkspacePane/Docked assigns the viewport height, while
 * footer or header chrome remains outside this node and therefore stationary.
 */
export function ScrollView({
  scroll = 0,
  scrollState = null,
  height = 'fill',
  pointerId = undefined,
  pointerData = undefined,
  pointerWidth = 'fill',
  pointerEvents = undefined,
  pointerAutoEnable = true,
  onPointer = null,
  onClick = null,
  onWheel = null,
  onDrag = null,
  onMove = null,
  onRelease = null,
  onWindow = null,
} = {}, ...children) {
  return createNode('scrollView', {
    scroll,
    scrollState,
    height,
    pointerId,
    pointerData,
    pointerWidth,
    pointerEvents,
    pointerAutoEnable,
    onPointer,
    onClick,
    onWheel,
    onDrag,
    onMove,
    onRelease,
    onWindow,
  }, children);
}

export function renderScrollView(node, width, renderNode) {
  const props = node.props || {};
  const content = node.children?.length === 1
    ? node.children[0]
    : Column({}, ...(node.children || []));
  const contentResult = content
    ? asLayoutResult(renderNode(content, width))
    : createLayoutResult();
  const rawHeight = props.height;
  const fixedHeight = rawHeight === undefined || rawHeight === 'fill'
    ? contentResult.lines.length
    : Math.max(0, Number(rawHeight) || 0);
  const visibleRows = Math.max(0, fixedHeight);
  const totalRows = contentResult.lines.length;

  let requestedScroll = Number(props.scrollState?.scroll ?? props.scroll) || 0;
  if (props.scrollState && typeof props.scrollState === 'object') {
    updateScrollState(props.scrollState, { totalRows, visibleRows: Math.max(1, visibleRows) });
    requestedScroll = Number(props.scrollState.scroll) || 0;
  }

  const maxScroll = Math.max(0, totalRows - visibleRows);
  const safeScroll = Math.max(0, Math.min(maxScroll, requestedScroll));
  if (props.scrollState && typeof props.scrollState === 'object') props.scrollState.scroll = safeScroll;

  const lines = contentResult.lines.slice(safeScroll, safeScroll + visibleRows).map((line) => fit(line, width));
  while (lines.length < visibleRows) lines.push(' '.repeat(Math.max(0, width)));

  const window = {
    scroll: safeScroll,
    maxScroll,
    start: safeScroll,
    end: Math.min(totalRows, safeScroll + visibleRows),
    totalRows,
    visibleRows,
    atStart: safeScroll === 0,
    atEnd: safeScroll === maxScroll,
  };
  if (typeof props.onWindow === 'function') props.onWindow(window);

  return createLayoutResult(
    lines,
    translatePointerRegions(contentResult.pointerRegions, 0, -safeScroll, {
      width,
      height: visibleRows,
    }),
  );
}
