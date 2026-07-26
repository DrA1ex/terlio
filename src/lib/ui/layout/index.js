import { visibleLength } from '../../ansi/text.js';
import { sanitizeTerminalText } from '../../terminal/controlParser.js';
import { DEFAULT_TERMINAL_LIMITS, normalizeTerminalPolicy, withSecurityLimits } from '../../terminal/policy.js';
import { createLimitError, utf8ByteLength } from '../../securityLimits.js';
import { createFrame } from '../screen.js';
import { renderBox } from './box.js';
import { renderColumn } from './column.js';
import { renderGrid } from './grid.js';
import { renderRow } from './row.js';
import { renderShadowOverlay } from './shadowOverlay.js';
import { renderText } from './text.js';
import { renderSplitPane } from './splitPane.js';
import { renderDocked } from './docked.js';
import { renderBottomOverlay } from './bottomOverlay.js';
import { renderProgressBar } from './progressBar.js';
import { renderKeyHintBar } from '../keyHintBar.js';
import { renderOverlayHost } from '../../overlayHost.js';
import { renderSelectList } from '../components/select.js';
import { boundsForSegments, createLayoutResult, translatePointerRegions } from './result.js';
import { fit, wrapPlain } from './utils.js';

export function layout(node, { width = 80, height = 24, terminalPolicy = null, securityLimits = null } = {}) {
  const policy = withSecurityLimits(normalizeTerminalPolicy(terminalPolicy), securityLimits);
  const strictPointerLimit = Boolean(securityLimits && Object.prototype.hasOwnProperty.call(securityLimits, 'pointerRegions'));
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const pointerContext = {
    nextToken: 1,
    stack: [],
    registered: 0,
    attempted: 0,
    overflowed: false,
    maxRegions: normalizePointerRegionLimit(policy.limits.pointerRegions),
  };
  const result = renderNodeInternal(node, safeWidth, pointerContext, policy);
  const lines = result.lines.map((line) => {
    if (policy.mode === 'trusted') return String(line ?? '').replace(/\r\n?/g, '\n');
    return sanitizeTerminalText(line, {
      blockedControlRendering: policy.blockedControlRendering,
      allowSgr: true,
    });
  });
  if (result.lines.length > policy.limits.renderedLines) {
    throw createLimitError('renderedLines', policy.limits.renderedLines, result.lines.length);
  }
  const renderedBytes = utf8ByteLength(lines.join('\n'));
  if (renderedBytes > policy.limits.renderedTextBytes) {
    throw createLimitError('renderedTextBytes', policy.limits.renderedTextBytes, renderedBytes);
  }
  if (strictPointerLimit && pointerContext.overflowed) {
    throw createLimitError('pointerRegions', pointerContext.maxRegions, pointerContext.attempted);
  }
  const pointerRegions = translatePointerRegions(result.pointerRegions, 0, 0, {
    width: safeWidth,
    height: safeHeight,
    maxRegions: pointerContext.maxRegions,
  });
  return createFrame(lines, {
    width: safeWidth,
    height: safeHeight,
    pointerRegions,
    pointerRegionLimit: pointerContext.maxRegions,
  });
}

export function measureNodeHeight(node, width = 80, options = {}) {
  return renderNode(node, Math.max(1, width), options).length;
}

export function renderNode(node, width = 80, options = {}) {
  const policy = withSecurityLimits(
    normalizeTerminalPolicy(options.terminalPolicy ?? options.policy),
    options.securityLimits,
  );
  const lines = renderNodeInternal(node, Math.max(1, width), null, policy).lines;
  if (lines.length > policy.limits.renderedLines) {
    throw createLimitError('renderedLines', policy.limits.renderedLines, lines.length);
  }
  const renderedBytes = utf8ByteLength(lines.join('\n'));
  if (renderedBytes > policy.limits.renderedTextBytes) {
    throw createLimitError('renderedTextBytes', policy.limits.renderedTextBytes, renderedBytes);
  }
  return lines;
}

function renderNodeInternal(node, width, pointerContext, policy) {
  if (!node) return createLayoutResult();
  if (typeof node === 'string' || typeof node === 'number') {
    const source = String(node);
    if (utf8ByteLength(source) > policy.limits.renderedTextBytes) {
      throw createLimitError('renderedTextBytes', policy.limits.renderedTextBytes, utf8ByteLength(source));
    }
    const value = sanitizeTerminalText(source, {
      blockedControlRendering: policy.blockedControlRendering,
      allowSgr: policy.mode === 'safe',
    });
    return createLayoutResult(wrapPlain(value, width));
  }

  const pointerMetadata = pointerContext && isPointerInteractive(node.props)
    ? registerPointerNode(node.props, pointerContext)
    : null;
  if (pointerMetadata) pointerContext.stack.push(pointerMetadata.token);

  const childRenderer = (child, childWidth) => renderNodeInternal(child, childWidth, pointerContext, policy);
  let result;

  switch (node.type) {
    case 'text':
      result = renderText(node, width, policy);
      break;
    case 'box':
      result = renderBox(node, width, childRenderer);
      break;
    case 'row':
      result = renderRow(node, width, childRenderer);
      break;
    case 'column':
      result = renderColumn(node, width, childRenderer);
      break;
    case 'pointerRegion':
      result = renderColumn({ type: 'column', props: node.props || {}, children: node.children || [] }, width, childRenderer);
      break;
    case 'shadowOverlay':
      result = renderShadowOverlay(node, width, childRenderer);
      break;
    case 'grid':
      result = renderGrid(node, width);
      break;
    case 'splitPane':
      result = renderSplitPane(node, width, childRenderer);
      break;
    case 'docked':
      result = renderDocked(node, width, childRenderer);
      break;
    case 'bottomOverlay':
      result = renderBottomOverlay(node, width, childRenderer);
      break;
    case 'progressBar':
      result = renderProgressBar(node, width);
      break;
    case 'keyHintBar':
      result = renderKeyHintBar(node, width, childRenderer);
      break;
    case 'overlayHost':
      result = renderOverlayHost(node, width, childRenderer);
      break;
    case 'selectList':
      result = renderSelectList(node, width, childRenderer);
      break;
    default:
      result = renderColumn(node, width, childRenderer);
      break;
  }

  if (pointerMetadata) pointerContext.stack.pop();
  if (!pointerMetadata) return result;

  const segments = result.lines.map((line, y) => ({
    x: 0,
    y,
    width: Math.min(width, resolvePointerWidth(node.props.pointerWidth, line, width)),
    height: 1,
  })).filter((segment) => segment.width > 0);
  const region = {
    ...pointerMetadata,
    segments,
    bounds: boundsForSegments(segments),
  };
  return createLayoutResult(result.lines, [region, ...result.pointerRegions]);
}

function isPointerInteractive(props = {}) {
  if (!props || props.pointerEvents === 'none' || props.pointer === false) return false;
  return props.pointer === true || props.pointerId !== undefined ||
    ['onPointer', 'onClick', 'onWheel', 'onDrag', 'onMove', 'onRelease'].some((name) => typeof props[name] === 'function');
}

function registerPointerNode(props, context) {
  context.attempted += 1;
  if (context.registered >= context.maxRegions) {
    context.overflowed = true;
    return null;
  }
  const token = context.nextToken++;
  context.registered += 1;
  return {
    token,
    id: props.pointerId ?? props.id ?? `pointer-${token}`,
    data: props.pointerData ?? props.data,
    disabled: Boolean(props.disabled),
    pointerEvents: props.pointerEvents ?? 'auto',
    autoEnable: props.pointerAutoEnable !== false,
    parentToken: context.stack.at(-1) ?? null,
    onPointer: props.onPointer,
    onClick: props.onClick,
    onWheel: props.onWheel,
    onDrag: props.onDrag,
    onMove: props.onMove,
    onRelease: props.onRelease,
  };
}

function normalizePointerRegionLimit(value) {
  if (value === Infinity) return Infinity;
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.floor(number))
    : DEFAULT_TERMINAL_LIMITS.pointerRegions;
}

function resolvePointerWidth(pointerWidth, line, assignedWidth) {
  if (pointerWidth === 'fill') return Math.max(1, Number(assignedWidth) || 1);
  if (Number.isFinite(Number(pointerWidth)) && Number(pointerWidth) > 0) return Number(pointerWidth);
  return Math.max(1, visibleLength(String(line ?? '').trimEnd()));
}

export { fit };

export { SplitPane, resolvePaneSizes } from './splitPane.js';
export { Docked } from './docked.js';
