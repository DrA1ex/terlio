import { visibleLength } from '../../ansi/text.js';
import { createLayoutResult } from './result.js';
import { fit } from './utils.js';

export function renderProgressBar(node, assignedWidth) {
  const available = Math.max(1, Number(assignedWidth) || 1);
  const safeTotal = Number(node.props.total) > 0 ? Number(node.props.total) : 100;
  const ratio = clamp(Number(node.props.value) / safeTotal, 0, 1);
  const requestedBarWidth = Math.max(1, Number(node.props.width) || 1);
  const pct = `${Math.round(ratio * 100)}%`;
  const label = String(node.props.label ?? '');

  const labeled = renderProgressLine({ ratio, requestedBarWidth, pct, label, available });
  const line = labeled ?? renderProgressLine({ ratio, requestedBarWidth, pct, label: '', available }) ?? pct;
  return createLayoutResult([fit(line, available)]);
}

function renderProgressLine({ ratio, requestedBarWidth, pct, label, available }) {
  const prefix = label ? `${label} ` : '';
  const overhead = visibleLength(prefix) + 2 + 1 + visibleLength(pct);
  const barWidth = Math.min(requestedBarWidth, available - overhead);
  if (barWidth < 1) return null;
  const filled = Math.round(ratio * barWidth);
  const bar = '#'.repeat(filled) + '-'.repeat(Math.max(0, barWidth - filled));
  return `${prefix}[${bar}] ${pct}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
