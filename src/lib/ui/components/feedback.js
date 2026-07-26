import { visibleLength, truncateVisible } from '../../ansi/text.js';
import { Box, Column, Panel, Row, Text, createNode } from '../node.js';
import { mod } from './utils.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function ConfirmPrompt({
  title = ' Confirm ',
  message = 'Continue?',
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  selected = 'confirm',
} = {}) {
  return Box({ border: true, padding: 1, title },
    Text(message),
    Row({ gap: 3 },
      Text(`${selected === 'confirm' ? '›' : ' '} ${confirmLabel}`),
      Text(`${selected === 'cancel' ? '›' : ' '} ${cancelLabel}`),
    ),
    Text('←/→ switch · Enter accept · Esc cancel'),
  );
}

export function Modal({ title = ' Modal ', children = [], footer = '' } = {}) {
  const nodes = normalizeRenderableChildren(children);
  if (footer) nodes.push(Text(''), Text(footer));
  return Box({ border: true, padding: 1, title }, ...nodes);
}

export function Toast({
  level = 'info',
  message = '',
  detail = '',
  theme = null,
  shadow = true,
  active = true,
  width = 0,
  icon = null,
  inset = 2,
} = {}) {
  const safeLevel = ['info', 'success', 'warning', 'error'].includes(level) ? level : 'info';
  const style = toastStyle(safeLevel, theme, active);
  const glyph = String(icon || { info: 'i', success: '✓', warning: '!', error: '×' }[safeLevel] || 'i');
  const headline = String(message ?? '').trim();
  const secondary = String(detail ?? '').trim();
  const contentWidth = visibleLength(headline) + visibleLength(secondary) + 12;
  const requestedWidth = Math.max(0, Number(width) || 0);
  const toastWidth = resolveToastWidth({ requestedWidth, contentWidth, hasDetail: Boolean(secondary) });
  const leftInset = requestedWidth > toastWidth
    ? Math.min(Math.max(0, Number(inset) || 0), Math.max(0, requestedWidth - toastWidth))
    : 0;
  const contentInnerWidth = Math.max(8, toastWidth - 4);
  const iconWidth = secondary ? 5 : 3;
  const textWidth = Math.max(1, contentInnerWidth - iconWidth - 1);

  const headerLine = `${style.headline}${truncateVisible(headline, textWidth)}${style.reset}`;
  const detailLine = secondary ? `${style.detail}${truncateVisible(secondary, textWidth)}${style.reset}` : '';
  const body = Box(
    { border: true, borderColor: style.border, padding: { left: 1, right: 1 } },
    secondary
      ? Row({ widths: [iconWidth, 1, textWidth] },
        Text(`${style.icon}${glyph}${style.reset}`, { wrap: false }),
        Text(' ', { wrap: false }),
        Column(
          Text(headerLine, { wrap: false }),
          Text(detailLine, { wrap: false }),
        ),
      )
      : Row({ widths: [iconWidth, 1, textWidth] },
        Text(`${style.icon}${glyph}${style.reset}`, { wrap: false }),
        Text(' ', { wrap: false }),
        Text(headerLine, { wrap: false }),
      ),
  );

  if (!shadow) return body;

  return createNode('shadowOverlay', {
    width: requestedWidth,
    childWidth: toastWidth,
    inset: leftInset,
    offsetX: 1,
    offsetY: 1,
    shadowColor: style.shadow,
  }, [body]);
}

export function ProgressBar({ value = 0, total = 100, width = 24, label = '', grow = false, variant = 'compact' } = {}) {
  return createNode('progressBar', { value, total, width, label, grow, variant }, []);
}

export function Spinner({ frame = 0, label = '' } = {}) {
  const glyph = SPINNER_FRAMES[mod(Number(frame) || 0, SPINNER_FRAMES.length)];
  return Text(`${glyph}${label ? ` ${label}` : ''}`);
}

export function HelpOverlay({ title = ' Help ', shortcuts = [] } = {}) {
  const rows = shortcuts.map(([key, description]) => Text(`${String(key).padEnd(14)} ${description}`));
  return Panel(title, ...(rows.length ? rows : [Text('No shortcuts registered.')]));
}

function toastStyle(level, theme, active) {
  const reset = '\x1b[0m';
  const palette = {
    info: { border: '\x1b[38;5;45m', headline: '\x1b[38;5;51m', detail: '\x1b[38;5;195m', shadow: '\x1b[38;5;24m' },
    success: { border: '\x1b[38;5;114m', headline: '\x1b[38;5;120m', detail: '\x1b[38;5;194m', shadow: '\x1b[38;5;22m' },
    warning: { border: '\x1b[38;5;214m', headline: '\x1b[38;5;221m', detail: '\x1b[38;5;230m', shadow: '\x1b[38;5;94m' },
    error: { border: '\x1b[38;5;203m', headline: '\x1b[38;5;210m', detail: '\x1b[38;5;224m', shadow: '\x1b[38;5;52m' },
  };
  const fallback = palette[level] ?? palette.info;
  const semantic = {
    info: theme?.info,
    success: theme?.success ?? theme?.ok,
    warning: theme?.warning,
    error: theme?.danger ?? theme?.error,
  }[level] || fallback.border;
  const subdued = theme?.borderMuted || theme?.border || fallback.shadow;
  if (!active) {
    return {
      ...fallback,
      border: subdued,
      icon: subdued,
      headline: theme?.subtle || fallback.detail,
      detail: theme?.muted || theme?.text || fallback.detail,
      shadow: darkerAnsiColor(subdued, fallback.shadow),
      reset,
    };
  }
  return {
    border: semantic,
    icon: semantic,
    headline: semantic || fallback.headline,
    detail: theme?.text || fallback.detail,
    shadow: darkerAnsiColor(semantic, fallback.shadow),
    reset,
  };
}

function resolveToastWidth({ requestedWidth, contentWidth, hasDetail }) {
  const minWidth = hasDetail ? 36 : 20;
  if (requestedWidth > 0) return Math.max(minWidth, requestedWidth - 6);
  return Math.max(minWidth, contentWidth + (hasDetail ? 8 : 4));
}

function darkerAnsiColor(value, fallback) {
  const rgb = ansiToRgb(value);
  if (!rgb) return fallback;
  const darker = rgb.map((component) => Math.max(0, Math.round(component * 0.38)));
  return `\x1b[38;2;${darker[0]};${darker[1]};${darker[2]}m`;
}

function ansiToRgb(value) {
  const text = String(value ?? '');
  const trueColor = text.match(/\x1b\[38;2;(\d+);(\d+);(\d+)m/);
  if (trueColor) return trueColor.slice(1).map((part) => Number(part));
  const indexed = text.match(/\x1b\[38;5;(\d+)m/);
  if (indexed) {
    const index = Number(indexed[1]);
    if (Number.isInteger(index) && index >= 0 && index <= 255) return ansi256ToRgb(index);
  }
  return null;
}

function ansi256ToRgb(index) {
  if (index < 16) return BASIC_ANSI_RGB[index] ?? [0, 0, 0];
  if (index >= 232) {
    const value = 8 + (index - 232) * 10;
    return [value, value, value];
  }
  const offset = index - 16;
  const r = Math.floor(offset / 36);
  const g = Math.floor((offset % 36) / 6);
  const b = offset % 6;
  return [ANSI_CUBE_VALUES[r], ANSI_CUBE_VALUES[g], ANSI_CUBE_VALUES[b]];
}

const ANSI_CUBE_VALUES = [0, 95, 135, 175, 215, 255];
const BASIC_ANSI_RGB = [
  [0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0],
  [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
  [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0],
  [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255],
];

function normalizeRenderableChildren(children) {
  const list = Array.isArray(children) ? children : [children];
  return list.flat(Infinity)
    .filter((item) => item !== null && item !== undefined && item !== false)
    .map((item) => typeof item === 'string' || typeof item === 'number' ? Text(String(item)) : item);
}

