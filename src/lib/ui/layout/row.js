import { visibleLength } from '../../ansi.js';
import { applyFixedHeight, fit, withHeight } from './utils.js';

export function renderRow(node, width, renderNode) {
  const gap = Number(node.props.gap ?? 0);
  const fixedHeight = node.props.height === undefined || node.props.height === 'fill' ? null : Math.max(0, Number(node.props.height) || 0);
  if (!node.children.length) return applyFixedHeight([''], width, fixedHeight);

  const childForRow = (child) => fixedHeight === null ? child : withHeight(child, fixedHeight);
  const explicitWidths = Array.isArray(node.props.widths) ? node.props.widths.map((item) => Number(item) || 0) : null;
  if (explicitWidths?.length) {
    const childCount = node.children.length;
    const available = Math.max(1, width - gap * (childCount - 1));
    const normalized = normalizeRowWidths(explicitWidths, childCount, available);
    const rendered = node.children.map((child, index) => renderNode(childForRow(child), normalized[index]));
    return applyFixedHeight(stitchRows(rendered, normalized, gap, width), width, fixedHeight);
  }

  if (node.props.distribute === true) {
    const childWidth = Math.max(1, Math.floor((width - gap * (node.children.length - 1)) / node.children.length));
    const rendered = node.children.map((child) => renderNode(childForRow(child), childWidth));
    return applyFixedHeight(stitchRows(rendered, Array(node.children.length).fill(childWidth), gap, width), width, fixedHeight);
  }

  const rendered = node.children.map((child) => renderNode(childForRow(child), width));
  const widths = rendered.map((lines) => Math.max(0, ...lines.map((line) => Math.min(width, visibleLength(String(line ?? '').trimEnd())))));
  return applyFixedHeight(stitchRows(rendered, widths, gap, width), width, fixedHeight);
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
  const height = Math.max(...rendered.map((lines) => lines.length));
  const rows = [];

  for (let row = 0; row < height; row += 1) {
    const parts = rendered.map((lines, index) => fit(String(lines[row] ?? '').trimEnd(), widths[index]));
    rows.push(fit(parts.join(' '.repeat(gap)), width));
  }
  return rows;
}
