import { createNode } from '../node.js';
import { applyFixedHeight, withHeight } from './utils.js';

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
    const contentLines = content ? renderNode(content, width) : [];
    const footerLines = footer ? renderNode(footer, width) : [];
    return [...contentLines, ...Array(contentLines.length && footerLines.length ? gap : 0).fill(''), ...footerLines];
  }

  if (!footer) {
    return applyFixedHeight(content ? renderNode(withHeight(content, fixedHeight), width) : [], width, fixedHeight);
  }

  const naturalFooterLines = renderNode(footer, width);
  const minFooter = Math.max(0, Number(props.footerMinHeight) || 0);
  const rawMaxFooter = Number(props.footerMaxHeight);
  const maxFooter = Number.isFinite(rawMaxFooter) ? Math.max(minFooter, rawMaxFooter) : fixedHeight;
  const footerHeight = Math.min(
    fixedHeight,
    Math.max(minFooter, Math.min(maxFooter, naturalFooterLines.length)),
  );
  const effectiveGap = footerHeight > 0 && fixedHeight > footerHeight ? Math.min(gap, fixedHeight - footerHeight) : 0;
  const contentHeight = Math.max(0, fixedHeight - footerHeight - effectiveGap);

  const contentLines = contentHeight > 0 && content
    ? renderNode(withHeight(content, contentHeight), width)
    : [];
  const footerLines = footerHeight > 0
    ? renderNode(withHeight(footer, footerHeight), width)
    : [];

  return applyFixedHeight([
    ...contentLines,
    ...Array(effectiveGap).fill(''),
    ...footerLines,
  ], width, fixedHeight);
}
