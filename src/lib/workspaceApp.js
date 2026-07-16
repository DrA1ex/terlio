import { ansi, mouseReportingSequence } from './ansi/codes.js';
import { TerminalInputDecoder } from './inputParser.js';
import { renderToFrame, TerminalRenderer } from './ui/renderer.js';
import { createActionRegistry } from './actionRegistry.js';
import { createOverlayManager } from './overlayHost.js';
import { requestsPointerReporting } from './pointer.js';


export function createWorkspaceApp(config = {}) {
  return new WorkspaceApp(config);
}

export class WorkspaceApp {
  constructor({ title = 'Workspace App', state = {}, render, actions = [], overlays = null, onKey = null, onPointer = null, pointer = 'auto', tick = null, tickMs = 0, input = process.stdin, output = process.stdout, onExit = null } = {}) {
    if (typeof render !== 'function') throw new Error('createWorkspaceApp requires a render function.');
    this.title = title;
    this.state = state;
    this.renderView = render;
    this.actions = actions?.handleKey ? actions : createActionRegistry(actions);
    this.overlays = overlays ?? createOverlayManager();
    this.onKey = typeof onKey === 'function' ? onKey : null;
    this.onPointer = typeof onPointer === 'function' ? onPointer : null;
    this.pointerOptions = normalizePointerOptions(pointer);
    this.pointerOverride = null;
    this.pointerActive = false;
    this.onTick = tick;
    this.tickMs = Number(tickMs) || 0;
    this.input = input;
    this.output = output;
    this.onExit = typeof onExit === 'function' ? onExit : null;
    this.renderer = new TerminalRenderer({ output });
    this.inputDecoder = new TerminalInputDecoder();
    this.running = false;
    this.dirty = true;
    this.lastSnapshot = '';
    this.timer = null;
    this.boundData = (data) => this.handleData(data);
    this.boundResize = () => this.handleResize();
    this.boundFatal = (error) => this.handleFatal(error);
  }

  start() {
    if (this.running) return this;
    if (!this.input.isTTY || !this.output.isTTY) throw new Error(`${this.title} requires an interactive TTY.`);
    this.running = true;
    this.output.write(ansi.altScreen + ansi.hideCursor + ansi.autoWrapOff + ansi.clear + ansi.home);
    this.input.setEncoding('utf8');
    this.input.setRawMode(true);
    this.input.resume();
    this.input.on('data', this.boundData);
    this.output.on('resize', this.boundResize);
    process.once('uncaughtException', this.boundFatal);
    process.once('unhandledRejection', this.boundFatal);
    if (this.onTick && this.tickMs > 0) {
      this.timer = setInterval(() => { if (this.onTick(this.context()) !== false) this.invalidate(); }, this.tickMs);
      this.timer.unref?.();
    }
    this.invalidate();
    return this;
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.input.off('data', this.boundData);
    this.output.off('resize', this.boundResize);
    process.off('uncaughtException', this.boundFatal);
    process.off('unhandledRejection', this.boundFatal);
    this.setPointerActive(false);
    if (this.input.isTTY) this.input.setRawMode(false);
    this.input.pause();
    this.inputDecoder.reset();
    this.renderer.reset();
    this.output.write(ansi.autoWrapOn + ansi.showCursor + ansi.normalScreen + ansi.reset + '\n');
  }

  exit(code = 0) {
    this.stop();
    if (this.onExit) {
      this.onExit(code);
      return;
    }
    process.exitCode = code;
    setImmediate(() => process.exit(code));
  }

  invalidate() {
    this.dirty = true;
    return this.render();
  }

  render() {
    if (!this.running || !this.dirty) return false;
    const width = Math.max(1, Number(this.output.columns) || 90);
    const height = Math.max(1, Number(this.output.rows) || 28);
    const view = this.renderView({ ...this.context(), width, height });
    const frame = renderToFrame(view, { width, height });
    const snapshot = frame.toString();
    if (snapshot === this.lastSnapshot) {
      this.renderer.pointerRegions = frame.pointerRegions;
      this.syncPointerMode();
      this.dirty = false;
      return false;
    }
    this.lastSnapshot = snapshot;
    this.renderer.renderFrame(frame);
    this.output.write(ansi.reset);
    this.syncPointerMode();
    this.dirty = false;
    return true;
  }

  handleResize() {
    if (!this.running) return;
    this.renderer.reset();
    this.output.write(ansi.clear + ansi.home);
    this.lastSnapshot = '';
    this.invalidate();
  }

  handleData(data) {
    for (const event of this.inputDecoder.write(data)) this.handleInputEvent(event);
  }

  handleInputEvent(event) {
    if (event?.type === 'pointer') {
      this.handlePointer(event);
      this.invalidate();
      return;
    }

    const key = event;
    if (key.name === 'ctrl-c') return this.exit(130);
    if (key.name === 'ctrl-d') return this.exit(0);
    const ctx = this.context({ key });
    if (this.overlays?.hasBlocking?.()) this.overlays.handleKey(key, ctx);
    else {
      const actionResult = this.actions?.handleKey?.(key, ctx, { scopes: ['local', 'global'], localScope: 'local' });
      if (!actionResult || actionResult.type === 'unhandled') this.onKey?.({ key, ...ctx });
    }
    this.invalidate();
  }

  handlePointer(pointer) {
    const baseContext = this.context({ pointer });
    const routed = this.renderer.dispatchPointer(pointer, baseContext);
    const event = routed.event;
    if (!event.propagationStopped && this.onPointer) {
      const result = this.onPointer({ pointer: event, ...this.context({ pointer: event }) });
      if (result !== false) event.handled = true;
    }
    return event;
  }

  setPointerEnabled(value) {
    this.pointerOptions.enabled = value === 'auto' ? 'auto' : Boolean(value);
    this.syncPointerMode();
    return this.pointerOptions.enabled;
  }

  setPointerOverride(value = null) {
    this.pointerOverride = value === null || value === undefined ? null : Boolean(value);
    this.syncPointerMode();
    return this.pointerOverride;
  }

  togglePointerOverride() {
    const automatic = this.resolveAutomaticPointerEnabled();
    return this.setPointerOverride(this.pointerOverride === null ? !automatic : null);
  }

  resolveAutomaticPointerEnabled() {
    return this.pointerOptions.enabled === true || (
      this.pointerOptions.enabled === 'auto' && (Boolean(this.onPointer) || requestsPointerReporting(this.renderer.pointerRegions))
    );
  }

  syncPointerMode() {
    if (!this.running) return false;
    const automatic = this.resolveAutomaticPointerEnabled();
    const enabled = this.pointerOverride === null ? automatic : this.pointerOverride;
    this.setPointerActive(enabled);
    return enabled;
  }

  setPointerActive(enabled) {
    const next = Boolean(enabled);
    if (next === this.pointerActive) return false;
    this.pointerActive = next;
    this.output.write(mouseReportingSequence(next, this.pointerOptions));
    return true;
  }

  context(extra = {}) {
    return { app: this, state: this.state, actions: this.actions, overlays: this.overlays, runtime: this, exit: (code) => this.exit(code), invalidate: () => this.invalidate(), ...extra };
  }

  handleFatal(error) {
    this.stop();
    console.error(error);
    process.exitCode = 1;
    this.onExit?.(1, error);
  }
}

function normalizePointerOptions(pointer) {
  if (pointer && typeof pointer === 'object') {
    const requested = pointer.enabled ?? 'auto';
    return {
      enabled: requested === 'auto' ? 'auto' : Boolean(requested),
      drag: pointer.drag !== false,
      motion: Boolean(pointer.motion),
    };
  }
  return {
    enabled: pointer === undefined || pointer === 'auto' ? 'auto' : Boolean(pointer),
    drag: true,
    motion: false,
  };
}
