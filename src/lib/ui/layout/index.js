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
    case 'splitPane':
      return renderSplitPane(node, width, renderNode);
    case 'docked':
      return renderDocked(node, width, renderNode);
    case 'keyHintBar':
      return renderKeyHintBar(node, width, renderNode);
    case 'overlayHost':
      return renderOverlayHost(node, width, renderNode);
    case 'selectList':
      return renderSelectList(node, width, renderNode);
    default:
      return renderColumn(node, width, renderNode);
  }
}

export { fit };

export { SplitPane, resolvePaneSizes } from './splitPane.js';
export { Docked } from './docked.js';
