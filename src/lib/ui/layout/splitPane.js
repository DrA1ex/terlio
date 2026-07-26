import { createNode } from '../node.js';
import { renderRow } from './row.js';
import { renderColumn } from './column.js';
import { createLayoutResult } from './result.js';

export function SplitPane({ orientation = 'horizontal', panes = [], gap = 1, height = undefined, focus = '', theme = null } = {}) {
  return createNode('splitPane', { orientation, panes, gap, height, focus, theme }, panes.map((pane) => pane.node ?? pane.children ?? pane));
}

export function renderSplitPane(node, width, renderNode) {
  const props = node.props || {};
  const panes = Array.from(props.panes ?? []).filter(Boolean);
  if (!panes.length) return createLayoutResult(['']);
  const sizes = resolvePaneSizes(panes, width, Number(props.gap ?? 1));
  const children = panes.map((pane, index) => {
    const child = pane.node ?? pane.children ?? node.children[index];
    const active = props.focus && pane.id === props.focus;
    return applyPaneFocus(child, active, props.theme);
  });
  const rowNode = { type: props.orientation === 'vertical' ? 'column' : 'row', props: { gap: props.gap ?? 1, widths: props.orientation === 'vertical' ? undefined : sizes, height: props.height }, children };
  return props.orientation === 'vertical' ? renderColumn(rowNode, width, renderNode) : renderRow(rowNode, width, renderNode);
}

export function resolvePaneSizes(panes = [], total = 80, gap = 1) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeGap = Math.max(0, Number(gap) || 0);
  const available = Math.max(1, safeTotal - safeGap * Math.max(0, panes.length - 1));
  const sizes = panes.map((pane) => ({ min: Math.max(1, Number(pane.min) || 1), max: Number.isFinite(Number(pane.max)) ? Number(pane.max) : Infinity, grow: Math.max(0, Number(pane.grow ?? 0)), size: Number(pane.size ?? pane.width ?? 0) || 0 }));
  let fixed = 0;
  let growTotal = 0;
  for (const pane of sizes) {
    if (pane.size > 0) fixed += Math.min(pane.max, Math.max(pane.min, pane.size));
    else { fixed += pane.min; growTotal += pane.grow || 1; }
  }
  let remaining = Math.max(0, available - fixed);
  const result = sizes.map((pane) => {
    const base = pane.size > 0 ? Math.min(pane.max, Math.max(pane.min, pane.size)) : pane.min;
    if (pane.size > 0) return base;
    const extra = growTotal > 0 ? Math.floor(remaining * ((pane.grow || 1) / growTotal)) : 0;
    return Math.min(pane.max, base + extra);
  });
  let used = result.reduce((sum, item) => sum + item, 0);
  let index = result.length - 1;
  while (used < available && index >= 0) {
    if (result[index] < sizes[index].max) { result[index] += 1; used += 1; }
    index = index <= 0 ? result.length - 1 : index - 1;
  }
  while (used > available) {
    const i = result.findLastIndex((value, idx) => value > sizes[idx].min);
    if (i < 0) break;
    result[i] -= 1; used -= 1;
  }
  return result;
}

function applyPaneFocus(node, active, theme) {
  if (!active || !node || typeof node !== 'object' || node.type !== 'box') return node;
  return { ...node, props: { ...node.props, borderColor: theme?.borderActive ?? theme?.accent ?? node.props?.borderColor } };
}
