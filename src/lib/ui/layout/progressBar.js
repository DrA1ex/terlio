import { visibleLength } from '../../ansi/text.js';
import { createLayoutResult } from './result.js';
import { fit } from './utils.js';

const PARTIAL_BLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
const FULL_BLOCK = '█';
const EMPTY_TRACK = ' ';
const LINE_TRACK = '─';
const INSET_TRACK = '▁';
const INSET_LEFT = '▏';
const INSET_RIGHT = '▕';
const COMPACT_FILL = '▬';
const COMPACT_TRACK = '═';
const SQUARE_FILL = '■';
const SQUARE_TRACK = '□';
const BOX_HORIZONTAL = '─';
const UNITS_PER_CELL = 8;
const PROGRESS_VARIANTS = new Set(['compact', 'block', 'line', 'inset', 'squares', 'boxed']);

export function renderProgressBar(node, assignedWidth) {
  const available = Math.max(1, Number(assignedWidth) || 1);
  const safeTotal = Number(node.props.total) > 0 ? Number(node.props.total) : 100;
  const ratio = clamp(Number(node.props.value) / safeTotal, 0, 1);
  const requestedBarWidth = Math.max(1, Number(node.props.width) || 1);
  const pct = `${Math.round(ratio * 100)}%`;
  const label = String(node.props.label ?? '');
  const variant = normalizeVariant(node.props.variant);

  if (variant === 'boxed') {
    return createLayoutResult(renderBoxedProgress({
      ratio,
      requestedBarWidth,
      pct,
      label,
      available,
    }));
  }

  if (variant === 'compact') {
    const labeled = renderDiscreteProgressLine({
      ratio,
      requestedBarWidth,
      pct,
      label,
      available,
      filledGlyph: COMPACT_FILL,
      trackGlyph: COMPACT_TRACK,
      open: '',
      close: '',
    });
    const line = labeled ?? renderDiscreteProgressLine({
      ratio,
      requestedBarWidth,
      pct,
      label: '',
      available,
      filledGlyph: COMPACT_FILL,
      trackGlyph: COMPACT_TRACK,
      open: '',
      close: '',
    }) ?? pct;
    return createLayoutResult([fit(line, available)]);
  }

  if (variant === 'squares') {
    const labeled = renderDiscreteProgressLine({
      ratio,
      requestedBarWidth,
      pct,
      label,
      available,
      filledGlyph: SQUARE_FILL,
      trackGlyph: SQUARE_TRACK,
      open: '[',
      close: ']',
    });
    const line = labeled ?? renderDiscreteProgressLine({
      ratio,
      requestedBarWidth,
      pct,
      label: '',
      available,
      filledGlyph: SQUARE_FILL,
      trackGlyph: SQUARE_TRACK,
      open: '[',
      close: ']',
    }) ?? pct;
    return createLayoutResult([fit(line, available)]);
  }

  const style = variant === 'line'
    ? { trackGlyph: LINE_TRACK, open: '[', close: ']' }
    : variant === 'inset'
      ? { trackGlyph: INSET_TRACK, open: INSET_LEFT, close: INSET_RIGHT }
      : { trackGlyph: EMPTY_TRACK, open: '[', close: ']' };
  const labeled = renderProgressLine({ ratio, requestedBarWidth, pct, label, available, ...style });
  const line = labeled ?? renderProgressLine({ ratio, requestedBarWidth, pct, label: '', available, ...style }) ?? pct;
  return createLayoutResult([fit(line, available)]);
}


function renderDiscreteProgressLine({ ratio, requestedBarWidth, pct, label, available, filledGlyph, trackGlyph, open, close }) {
  const prefix = label ? `${label} ` : '';
  const overhead = visibleLength(prefix) + visibleLength(open) + visibleLength(close) + 1 + visibleLength(pct);
  const barWidth = Math.min(requestedBarWidth, available - overhead);
  if (barWidth < 1) return null;
  const bar = renderDiscreteBar(ratio, barWidth, filledGlyph, trackGlyph);
  return `${prefix}${open}${bar}${close} ${pct}`;
}

function renderProgressLine({ ratio, requestedBarWidth, pct, label, available, trackGlyph, open, close }) {
  const prefix = label ? `${label} ` : '';
  const overhead = visibleLength(prefix) + visibleLength(open) + visibleLength(close) + 1 + visibleLength(pct);
  const barWidth = Math.min(requestedBarWidth, available - overhead);
  if (barWidth < 1) return null;
  const bar = renderSmoothBar(ratio, barWidth, trackGlyph);
  return `${prefix}${open}${bar}${close} ${pct}`;
}

function renderBoxedProgress({ ratio, requestedBarWidth, pct, label, available }) {
  if (available < 3) return [fit(pct, available)];

  const innerWidth = Math.max(1, Math.min(requestedBarWidth, available - 2));
  const top = `┌${renderBoxTitle({ label, pct, width: innerWidth })}┐`;
  const body = `│${renderSmoothBar(ratio, innerWidth, ' ')}│`;
  const bottom = `└${BOX_HORIZONTAL.repeat(innerWidth)}┘`;

  return [fit(top, available), fit(body, available), fit(bottom, available)];
}

function renderBoxTitle({ label, pct, width }) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const labelToken = label ? ` ${label} ` : '';
  const pctToken = ` ${pct} `;
  const required = visibleLength(labelToken) + visibleLength(pctToken);

  if (required <= safeWidth) {
    return `${labelToken}${BOX_HORIZONTAL.repeat(safeWidth - required)}${pctToken}`;
  }
  if (visibleLength(pctToken) <= safeWidth) {
    return `${BOX_HORIZONTAL.repeat(safeWidth - visibleLength(pctToken))}${pctToken}`;
  }
  return BOX_HORIZONTAL.repeat(safeWidth);
}


function renderDiscreteBar(ratio, width, filledGlyph, trackGlyph) {
  const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
  const filledCells = ratio >= 1
    ? safeWidth
    : Math.max(0, Math.min(safeWidth, Math.round(clamp(ratio, 0, 1) * safeWidth)));
  return String(filledGlyph).repeat(filledCells) + String(trackGlyph).repeat(safeWidth - filledCells);
}

function renderSmoothBar(ratio, width, emptyGlyph) {
  const totalUnits = Math.round(clamp(ratio, 0, 1) * width * UNITS_PER_CELL);
  const fullCells = Math.floor(totalUnits / UNITS_PER_CELL);
  const remainder = totalUnits % UNITS_PER_CELL;
  const partial = remainder > 0 && fullCells < width ? PARTIAL_BLOCKS[remainder] : '';
  const emptyCells = Math.max(0, width - fullCells - (partial ? 1 : 0));

  return FULL_BLOCK.repeat(Math.min(fullCells, width)) + partial + String(emptyGlyph).repeat(emptyCells);
}

function normalizeVariant(value) {
  const variant = String(value ?? 'compact').trim().toLowerCase();
  return PROGRESS_VARIANTS.has(variant) ? variant : 'compact';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
