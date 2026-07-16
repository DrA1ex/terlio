import { Modal, Toast, ConfirmPrompt } from './ui/components/index.js';
import { Box, PointerRegion, Text, createNode } from './ui/node.js';
import { fit } from './ui/layout/utils.js';
import { composeOverlayLine } from './ui/layout/overlayCompose.js';
import { stripAnsi, takeVisibleAnsi, visibleLength } from './ansi/text.js';
import { stripPointerMarkers } from './pointer.js';

export function createOverlayManager({ toasts = [] } = {}) {
  return new OverlayManager({ toasts });
}

export class OverlayManager {
  constructor({ toasts = [] } = {}) {
    this.stack = [];
    this.toasts = Array.from(toasts);
    this.nextId = 1;
  }

  push(overlay = {}) {
    const item = normalizeOverlay(overlay, this.nextId++);
    this.stack.push(item);
    return item.id;
  }

  modal(options = {}) { return this.push({ type: 'modal', ...options, blocking: true }); }
  confirm(options = {}) { return this.push({ type: 'confirm', ...options, blocking: true }); }
  help(options = {}) { return this.push({ type: 'help', ...options, blocking: true }); }

  toast(message, level = 'info', ttl = 3, detail = '') {
    const safeTtl = Math.min(3, Math.max(0.5, Number(ttl ?? 3) || 3));
    const item = normalizeOverlay({ type: 'toast', message, level, ttl: safeTtl, detail, blocking: false }, this.nextId++);
    this.toasts.push(item);
    return item.id;
  }

  pop() { return this.stack.pop() ?? null; }
  dismissToast(id) {
    const before = this.toasts.length;
    this.toasts = this.toasts.filter((toast) => toast?.id !== id);
    return this.toasts.length !== before;
  }
  clear() { this.stack = []; this.toasts = []; }
  top() { return this.stack[this.stack.length - 1] ?? null; }
  hasBlocking() { return Boolean(this.top()); }

  tick(delta = 1) {
    const beforeLength = this.toasts.length;
    this.toasts = this.toasts
      .map((toast) => ({ ...toast, ttl: Math.max(0, Number(toast.ttl ?? 0) - delta) }))
      .filter((toast) => toast.ttl > 0);
    // TTL is not rendered, so a redraw is only needed when the visible stack changes.
    return beforeLength !== this.toasts.length;
  }

  handleKey(key, ctx = {}) {
    const top = this.top();
    if (!top) return { type: 'unhandled' };
    if (key?.name === 'escape') {
      this.pop();
      top.onCancel?.(ctx);
      return { type: 'close', overlay: top };
    }
    if (typeof top.onKey === 'function') return top.onKey({ key, overlay: top, manager: this, ...ctx }) ?? { type: 'handled', overlay: top };
    if (top.type === 'confirm') return handleConfirmKey(this, top, key, ctx);
    if (key?.name === 'enter') {
      this.pop();
      top.onAccept?.(ctx);
      return { type: 'accept', overlay: top };
    }
    return { type: 'handled', overlay: top };
  }
}

export function OverlayHost({ content = null, manager = null, theme = null, width = 80, height = 24, dim = true, toastBottomMargin = 8 } = {}) {
  if (!manager) return content;
  return createNode('overlayHost', { manager, theme, width, height, dim, toastBottomMargin }, [content]);
}

export function renderOverlayHost(node, width, renderNode) {
  const manager = node.props.manager;
  const theme = node.props.theme;
  const height = Math.max(1, Number(node.props.height) || 24);
  const content = node.children?.[0] ?? null;
  let lines = fitLines(renderNode(content, width), width, height);
  const blocking = manager?.top?.();
  if (blocking) {
    lines = lines.map((line) => stripPointerMarkers(line));
    if (node.props.dim !== false) lines = dimBackgroundLines(lines, theme, width);
    const requestedWidth = Number(blocking.width);
    const defaultWidth = Math.max(20, Math.min(width - 6, 72));
    const overlayWidth = Math.max(20, Math.min(width, Number.isFinite(requestedWidth) ? requestedWidth : defaultWidth));
    lines = overlayCentered(
      lines,
      renderNode(renderBlockingOverlay(blocking, theme, overlayWidth), overlayWidth),
      width,
      height,
      { opaqueRows: blocking.opaqueRows === true },
    );
  }
  const toasts = manager?.toasts?.slice(-3) ?? [];
  if (toasts.length) lines = overlayToasts(lines, toasts, theme, width, height, Math.max(0, Number(node.props.toastBottomMargin) || 0), renderNode, manager);
  return lines;
}


function dimBackgroundLines(lines, theme, width) {
  const muted = theme?.textMuted ?? theme?.muted ?? '\x1b[2m';
  return lines.map((line) => fit(`${muted}${stripAnsi(line)}\x1b[0m`, width));
}

function overlayCentered(lines, overlayLines, width, height, { opaqueRows = false } = {}) {
  const clean = overlayLines.filter(Boolean);
  const boxWidth = Math.min(width, Math.max(...clean.map((line) => visibleLength(stripAnsi(line))), 20));
  const startRow = Math.max(1, Math.floor((height - clean.length) / 2));
  const startCol = Math.max(0, Math.floor((width - boxWidth) / 2));
  const next = [...lines];
  for (let i = 0; i < clean.length && startRow + i < height; i++) {
    const background = opaqueRows ? ' '.repeat(width) : next[startRow + i];
    next[startRow + i] = composeOverlayLine(background, fit(clean[i], boxWidth), startCol, width);
  }
  return next;
}

function overlayToasts(lines, toasts, theme, width, height, bottomMargin, renderNode, manager) {
  const toastWidth = Math.max(28, Math.min(58, width - 4));
  const rendered = [];
  for (const toast of toasts) {
    const prepared = prepareToast(toast, toastWidth);
    const toastNode = Toast({ level: prepared.level, message: prepared.message, detail: prepared.detail, theme, width: toastWidth, shadow: true });
    const dismiss = (event) => {
      dismissToast(manager, toast);
      event.preventDefault();
      event.stopPropagation();
      return true;
    };
    rendered.push(...renderNode(PointerRegion({
      pointerId: `toast:${toast.id ?? 'active'}`,
      pointerData: { kind: 'toast', id: toast.id ?? null },
      pointerWidth: 'fill',
      onClick: dismiss,
      onRelease: dismiss,
    }, toastNode), toastWidth));
  }
  const stack = rendered.slice(-Math.max(1, height - bottomMargin - 1));
  const startRow = Math.max(0, height - bottomMargin - stack.length);
  const startCol = Math.max(0, width - toastWidth - 2);
  const next = [...lines];
  for (let i = 0; i < stack.length && startRow + i < height; i++) next[startRow + i] = composeOverlayLine(next[startRow + i], fit(stack[i], toastWidth), startCol, width);
  return next;
}


function dismissToast(manager, toast) {
  if (typeof toast?.onDismiss === 'function') {
    toast.onDismiss(toast);
    return true;
  }
  if (typeof manager?.dismissToast === 'function') return manager.dismissToast(toast?.id);
  if (Array.isArray(manager?.toasts)) {
    const before = manager.toasts.length;
    for (let index = manager.toasts.length - 1; index >= 0; index -= 1) {
      const item = manager.toasts[index];
      if (item === toast || item?.id === toast?.id) manager.toasts.splice(index, 1);
    }
    return manager.toasts.length !== before;
  }
  return false;
}

function prepareToast(toast, width) {
  const raw = String(toast.message ?? '');
  if (toast.detail || visibleLength(raw) <= width - 14) return toast;
  const parts = splitToastMessage(raw, Math.max(16, width - 14));
  return { ...toast, message: parts[0], detail: parts.slice(1).join(' ') };
}

function splitToastMessage(message, width) {
  const words = String(message ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && visibleLength(candidate) > width) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function fitLines(source, width, height) {
  const lines = source.slice(0, height).map((line) => fit(line, width));
  while (lines.length < height) lines.push(' '.repeat(width));
  return lines;
}

function renderBlockingOverlay(overlay, theme, width = 80) {
  const shadowColor = theme?.borderMuted ?? theme?.border ?? '\x1b[38;5;238m';
  const wrapShadow = (node) => createNode('shadowOverlay', {
    width,
    childWidth: Math.max(20, width - 2),
    inset: 0,
    offsetX: 1,
    offsetY: 1,
    shadowColor,
  }, [node]);
  if (overlay.node) return overlay.shadow === false ? overlay.node : wrapShadow(overlay.node);
  if (overlay.type === 'confirm') {
    return wrapShadow(ConfirmPrompt({
      title: overlay.title ?? ' Confirm ',
      message: overlay.message ?? '',
      confirmLabel: overlay.confirmLabel ?? 'Confirm',
      cancelLabel: overlay.cancelLabel ?? 'Cancel',
      selected: overlay.selected ?? 'confirm',
    }));
  }
  if (overlay.type === 'help') {
    return wrapShadow(Box({ border: true, borderColor: theme?.borderActive ?? theme?.accent ?? theme?.border, padding: { left: 1, right: 1 }, title: overlay.title ?? ' Help ' }, ...(overlay.children ?? []).map((child) => typeof child === 'string' ? Text(child) : child)));
  }
  if (overlay.type === 'palette') {
    return wrapShadow(Box({ border: true, borderColor: theme?.borderActive ?? theme?.accent ?? theme?.border, padding: { left: 1, right: 1 }, title: overlay.title ?? ' Palette ' }, ...(overlay.children ?? [])));
  }
  return wrapShadow(Modal({ title: overlay.title ?? ' Modal ', children: overlay.children ?? [overlay.message ?? ''], footer: overlay.footer ?? 'Esc close · Enter accept' }));
}

function handleConfirmKey(manager, overlay, key, ctx) {
  if (key?.name === 'left' || key?.name === 'right' || key?.name === 'tab') {
    overlay.selected = overlay.selected === 'cancel' ? 'confirm' : 'cancel';
    return { type: 'toggle', overlay };
  }
  if (key?.name === 'enter') {
    manager.pop();
    if (overlay.selected === 'cancel') overlay.onCancel?.(ctx);
    else overlay.onConfirm?.(ctx);
    return { type: overlay.selected === 'cancel' ? 'cancel' : 'confirm', overlay };
  }
  return { type: 'handled', overlay };
}

function normalizeOverlay(overlay, id) {
  return {
    id: overlay.id ?? `overlay.${id}`,
    type: overlay.type ?? 'modal',
    level: overlay.level ?? 'info',
    ttl: Number(overlay.ttl ?? 3),
    blocking: overlay.blocking !== false && overlay.type !== 'toast',
    selected: overlay.selected ?? 'confirm',
    ...overlay,
  };
}
