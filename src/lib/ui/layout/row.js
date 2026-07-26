import { visibleLength } from '../../ansi/text.js';
import { applyFixedHeightResult, asLayoutResult, createLayoutResult, translatePointerRegions } from './result.js';
import { fit, withHeight } from './utils.js';

export function renderRow(node, width, renderNode) {
  const gap = Number(node.props.gap ?? 0);
  const fixedHeight = node.props.height === undefined || node.props.height === 'fill' ? null : Math.max(0, Number(node.props.height) || 0);
  if (!node.children.length) return applyFixedHeightResult(createLayoutResult(['']), width, fixedHeight);

  const childForRow = (child) => fixedHeight === null ? child : withHeight(child, fixedHeight);
  const explicitWidths = Array.isArray(node.props.widths) ? node.props.widths.map((item) => Number(item) || 0) : null;
  if (explicitWidths?.length) {
    const childCount = node.children.length;
    const available = Math.max(1, width - gap * (childCount - 1));
    const normalized = normalizeRowWidths(explicitWidths, childCount, available);
    const rendered = node.children.map((child, index) => asLayoutResult(renderNode(childForRow(child), normalized[index])));
    return applyFixedHeightResult(stitchRows(rendered, normalized, gap, width), width, fixedHeight);
  }

  if (node.props.distribute === true) {
    const childWidth = Math.max(1, Math.floor((width - gap * (node.children.length - 1)) / node.children.length));
    const rendered = node.children.map((child) => asLayoutResult(renderNode(childForRow(child), childWidth)));
    return applyFixedHeightResult(stitchRows(rendered, Array(node.children.length).fill(childWidth), gap, width), width, fixedHeight);
  }

  const growIndexes = node.children
    .map((child, index) => child?.props?.grow === true || child?.props?.width === 'fill' ? index : -1)
    .filter((index) => index >= 0);
  if (growIndexes.length) {
    const totalAvailable = Math.max(1, width - gap * Math.max(0, node.children.length - 1));
    const rendered = new Array(node.children.length);
    const widths = new Array(node.children.length).fill(1);
    const fixedIndexes = node.children.map((_, index) => index).filter((index) => !growIndexes.includes(index));
    const naturalFixedWidths = fixedIndexes.map((index) => {
      const result = asLayoutResult(renderNode(childForRow(node.children[index]), width));
      rendered[index] = result;
      return naturalWidth(result, width);
    });
    const fixedWidths = shrinkWidths(naturalFixedWidths, Math.max(0, totalAvailable - growIndexes.length));
    fixedIndexes.forEach((index, offset) => { widths[index] = fixedWidths[offset]; });
    const growAvailable = Math.max(growIndexes.length, totalAvailable - fixedWidths.reduce((sum, item) => sum + item, 0));
    const growWidths = distributeWidths(growAvailable, growIndexes.length);
    growIndexes.forEach((index, offset) => {
      widths[index] = growWidths[offset];
      rendered[index] = asLayoutResult(renderNode(childForRow(node.children[index]), growWidths[offset]));
    });
    return applyFixedHeightResult(stitchRows(rendered, widths, gap, width), width, fixedHeight);
  }

  const rendered = node.children.map((child) => asLayoutResult(renderNode(childForRow(child), width)));
  const widths = rendered.map((result) => naturalWidth(result, width));
  return applyFixedHeightResult(stitchRows(rendered, widths, gap, width), width, fixedHeight);
}

function normalizeRowWidths(widths, childCount, available) {
  const result = Array.from({ length: childCount }, (_, index) => Math.max(1, Number(widths[index]) || 1));
  let total = result.reduce((sum, item) => sum + item, 0);
  if (total === available) return result;
  if (total < available) {
    result[result.length - 1] += available - total;
    return result;
  }
  let overflow = total - available;
  for (let index = result.length - 1; index >= 0 && overflow > 0; index -= 1) {
    const cut = Math.min(overflow, Math.max(0, result[index] - 1));
    result[index] -= cut;
    overflow -= cut;
  }
  return result;
}

function stitchRows(rendered, widths, gap, width) {
  const height = Math.max(...rendered.map((result) => result.lines.length));
  const rows = [];
  const pointerRegions = [];
  let x = 0;

  for (let index = 0; index < rendered.length; index += 1) {
    pointerRegions.push(...translatePointerRegions(rendered[index].pointerRegions, x, 0, { width, height }));
    x += widths[index] + gap;
  }

  for (let row = 0; row < height; row += 1) {
    const parts = rendered.map((result, index) => fit(String(result.lines[row] ?? '').trimEnd(), widths[index]));
    rows.push(fit(parts.join(' '.repeat(gap)), width));
  }
  return createLayoutResult(rows, pointerRegions);
}


function naturalWidth(result, maximum) {
  return Math.max(0, ...result.lines.map((line) => Math.min(maximum, visibleLength(String(line ?? '').trimEnd()))));
}

function shrinkWidths(widths, budget) {
  const output = widths.map((value) => Math.max(1, Number(value) || 1));
  let overflow = Math.max(0, output.reduce((sum, item) => sum + item, 0) - Math.max(0, budget));
  for (let index = output.length - 1; index >= 0 && overflow > 0; index -= 1) {
    const cut = Math.min(overflow, Math.max(0, output[index] - 1));
    output[index] -= cut;
    overflow -= cut;
  }
  return output;
}

function distributeWidths(total, count) {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => Math.max(1, base + (index < remainder ? 1 : 0)));
}
