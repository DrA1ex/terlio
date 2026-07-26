import { createNode } from '../node.js';
import { applyFixedHeightResult, asLayoutResult, createLayoutResult, translatePointerRegions } from './result.js';
import { withHeight } from './utils.js';

/**
 * Reserves space for a bottom-docked node before assigning the remaining
 * height to the main content. This is useful for hint bars, inspectors and
 * other footer-like panels that must never be clipped away by growing content.
 */
export function Docked({
  content = null,
  footer = null,
  height = undefined,
  gap = 0,
  footerMinHeight = 0,
  footerMaxHeight = Infinity,
} = {}) {
  return createNode('docked', {
    height,
    gap,
    footerMinHeight,
    footerMaxHeight,
  }, [content, footer]);
}

export function renderDocked(node, width, renderNode) {
  const props = node.props || {};
  const content = node.children?.[0] ?? null;
  const footer = node.children?.[1] ?? null;
  const fixedHeight = props.height === undefined || props.height === 'fill'
    ? null
    : Math.max(0, Number(props.height) || 0);
  const gap = Math.max(0, Number(props.gap) || 0);

  if (fixedHeight === null) {
    const contentResult = content ? asLayoutResult(renderNode(content, width)) : createLayoutResult();
    const footerResult = footer ? asLayoutResult(renderNode(footer, width)) : createLayoutResult();
    const effectiveGap = contentResult.lines.length && footerResult.lines.length ? gap : 0;
    return createLayoutResult(
      [...contentResult.lines, ...Array(effectiveGap).fill(''), ...footerResult.lines],
      [
        ...contentResult.pointerRegions,
        ...translatePointerRegions(footerResult.pointerRegions, 0, contentResult.lines.length + effectiveGap, { width, height: Infinity }),
      ],
    );
  }

  if (!footer) {
    return applyFixedHeightResult(content ? renderNode(withHeight(content, fixedHeight), width) : createLayoutResult(), width, fixedHeight);
  }

  const naturalFooterResult = asLayoutResult(renderNode(footer, width));
  const minFooter = Math.max(0, Number(props.footerMinHeight) || 0);
  const rawMaxFooter = Number(props.footerMaxHeight);
  const maxFooter = Number.isFinite(rawMaxFooter) ? Math.max(minFooter, rawMaxFooter) : fixedHeight;
  const footerHeight = Math.min(
    fixedHeight,
    Math.max(minFooter, Math.min(maxFooter, naturalFooterResult.lines.length)),
  );
  const effectiveGap = footerHeight > 0 && fixedHeight > footerHeight ? Math.min(gap, fixedHeight - footerHeight) : 0;
  const contentHeight = Math.max(0, fixedHeight - footerHeight - effectiveGap);

  const contentResult = contentHeight > 0 && content
    ? asLayoutResult(renderNode(withHeight(content, contentHeight), width))
    : createLayoutResult();
  const footerResult = footerHeight > 0
    ? asLayoutResult(renderNode(withHeight(footer, footerHeight), width))
    : createLayoutResult();
  const footerY = contentResult.lines.length + effectiveGap;

  return applyFixedHeightResult(createLayoutResult([
    ...contentResult.lines,
    ...Array(effectiveGap).fill(''),
    ...footerResult.lines,
  ], [
    ...contentResult.pointerRegions,
    ...translatePointerRegions(footerResult.pointerRegions, 0, footerY, { width, height: fixedHeight }),
  ]), width, fixedHeight);
}
