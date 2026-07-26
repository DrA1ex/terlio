import { sanitizeSgrStyle } from '../../terminal/controlParser.js';
import { renderColumn } from './column.js';
import { applyFixedHeightResult, asLayoutResult, createLayoutResult, translatePointerRegions } from './result.js';
import { fit, fitTitle, normalizeSpacing } from './utils.js';

export function renderBox(node, width, renderNode) {
  const fixedHeight = node.props.height === undefined || node.props.height === 'fill' ? null : Math.max(0, Number(node.props.height) || 0);
  const border = Boolean(node.props.border);
  const padding = normalizeSpacing(node.props.padding ?? 0);
  const borderSize = border ? 2 : 0;
  const innerWidth = Math.max(1, width - borderSize - padding.left - padding.right);
  const contentWidth = Math.max(0, width - borderSize);
  const availableContentRows = fixedHeight === null ? null : Math.max(0, fixedHeight - borderSize);
  const availableChildRows = availableContentRows === null
    ? null
    : Math.max(0, availableContentRows - padding.top - padding.bottom);
  const columnProps = { gap: node.props.gap ?? 0 };
  if (availableChildRows !== null) columnProps.height = availableChildRows;
  const childResult = asLayoutResult(renderColumn({ type: 'column', props: columnProps, children: node.children }, innerWidth, renderNode));
  const topPadding = availableContentRows === null ? padding.top : Math.min(padding.top, availableContentRows);
  const rowsAfterTopPadding = availableContentRows === null ? null : Math.max(0, availableContentRows - topPadding);
  const bottomPadding = rowsAfterTopPadding === null ? padding.bottom : Math.min(padding.bottom, rowsAfterTopPadding);
  const padded = [
    ...Array(topPadding).fill(''),
    ...childResult.lines,
    ...Array(bottomPadding).fill(''),
  ].map((line) => ' '.repeat(padding.left) + fit(line, innerWidth) + ' '.repeat(padding.right));

  const contentRegions = translatePointerRegions(
    childResult.pointerRegions,
    padding.left + (border ? 1 : 0),
    topPadding + (border ? 1 : 0),
    { width, height: fixedHeight ?? Infinity },
  );

  if (!border) return applyFixedHeightResult(createLayoutResult(padded.map((line) => fit(line, width)), contentRegions), width, fixedHeight);

  const title = node.props.title ? ` ${String(node.props.title)} ` : '';
  const borderColor = sanitizeSgrStyle(node.props.borderColor ?? '');
  const reset = borderColor ? '\x1b[0m' : '';
  const top = borderColor + '┌' + fitTitle(title, contentWidth) + '┐' + reset;
  const bottom = borderColor + '└' + '─'.repeat(contentWidth) + '┘' + reset;
  return applyFixedHeightResult(createLayoutResult([top, ...padded.map((line) => `${borderColor}│${reset}${fit(line, contentWidth)}${borderColor}│${reset}`), bottom], contentRegions), width, fixedHeight);
}
