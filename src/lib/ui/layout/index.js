import { createFrame } from '../screen.js';
import { renderBox } from './box.js';
import { renderColumn } from './column.js';
import { renderGrid } from './grid.js';
import { renderRow } from './row.js';
import { renderShadowOverlay } from './shadowOverlay.js';
import { renderText } from './text.js';
import { fit, wrapPlain } from './utils.js';

export function layout(node, { width = 80, height = 24 } = {}) {
  const lines = renderNode(node, Math.max(1, width));
  return createFrame(lines, { width, height });
}

export function measureNodeHeight(node, width = 80) {
  return renderNode(node, Math.max(1, width)).length;
}

export function renderNode(node, width = 80) {
  if (!node) return [];
  if (typeof node === 'string' || typeof node === 'number') return wrapPlain(String(node), width);

  switch (node.type) {
    case 'text':
      return renderText(node, width);
    case 'box':
      return renderBox(node, width, renderNode);
    case 'row':
      return renderRow(node, width, renderNode);
    case 'column':
      return renderColumn(node, width, renderNode);
    case 'shadowOverlay':
      return renderShadowOverlay(node, width, renderNode);
    case 'grid':
      return renderGrid(node, width);
    default:
      return renderColumn(node, width, renderNode);
  }
}

export { fit };
