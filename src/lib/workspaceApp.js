import { createTerminalPolicy } from './terminal/policy.js';
import { resolveTerminalSink } from './terminal/sink.js';
import { TerminalSessionGuard } from './terminal/sessionGuard.js';
import { TerminalInputDecoder } from './inputParser.js';
import { renderToFrame, TerminalRenderer } from './ui/renderer.js';
import { createActionRegistry } from './actionRegistry.js';
import { createOverlayManager } from './overlayHost.js';
import { requestsPointerReporting } from './pointer.js';


export function createWorkspaceApp(config = {}) {
  return new WorkspaceApp(config);
}

export class WorkspaceApp {
  constructor({ title = 'Workspace App', state = {}, render, actions = [], overlays = null, onKey = null, onPointer = null, pointer = 'auto', tick = null, tickMs = 0, animationMs = 80, input = process.stdin, output = process.stdout, onExit = null, terminalPolicy = createTerminalPolicy(), terminalSink = null, processHandlers = 'none', inputPolicy = 'safe' } = {}) {
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
    this.animationMs = Math.max(0, Number(animationMs) || 0);
    this.animationFrame = 0;
    this.animationRequested = false;
    this.input = input;
    this.output = output;
    this.terminalPolicy = terminalPolicy;
    this.processHandlers = normalizeProcessHandlers(processHandlers);
    this.terminalSink = resolveTerminalSink({ sink: terminalSink, output, policy: terminalPolicy });
    this.terminalSession = new TerminalSessionGuard({ input, output, sink: this.terminalSink });
    this.onExit = typeof onExit === 'function' ? onExit : null;
    this.renderer = new TerminalRenderer({ output, sink: this.terminalSink, policy: this.terminalPolicy });
    this.inputDecoder = new TerminalInputDecoder({ limits: this.terminalPolicy.limits, inputPolicy });
    this.running = false;
    this.dirty = true;
    this.lastSnapshot = '';
    this.timer = null;
    this.animationTimer = null;
    this.inputBatchDepth = 0;
    this.boundData = (data) => this.handleData(data);
    this.boundResize = () => this.handleResize();
    this.boundFatal = (error) => this.handleFatal(error);
    this.boundSignal = (signal) => this.handleSignal(signal);
  }

  start() {
    if (this.running) return this;
    if (!this.input.isTTY || !this.output.isTTY) throw new Error(`${this.title} requires an interactive TTY.`);
    this.running = true;
    try {
      this.terminalSession.start();
      this.input.setEncoding('utf8');
      this.terminalSession.enableRawMode();
      this.terminalSession.setBracketedPaste(true);
      this.input.resume();
      this.input.on('data', this.boundData);
      this.output.on('resize', this.boundResize);
      this.installProcessHandlers();
      if (this.onTick && this.tickMs > 0) {
        this.timer = setInterval(() => this.runGuarded(() => {
          if (this.onTick(this.context()) !== false) this.invalidate();
        }), this.tickMs);
        this.timer.unref?.();
      }
      this.invalidate();
      return this;
    } catch (error) {
      try {
        this.stop();
      } catch (cleanupError) {
        attachCleanupError(error, cleanupError);
      }
      throw error;
    }
  }

  stop() {
    if (!this.running && !this.terminalSession.active && !this.terminalSession.rawMode) return false;
    this.running = false;
    let failure = null;
    const attempt = (callback) => {
      try { callback(); } catch (error) { failure ??= error; }
    };
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.animationTimer) clearTimeout(this.animationTimer);
    this.animationTimer = null;
    attempt(() => this.input.off('data', this.boundData));
    attempt(() => this.output.off('resize', this.boundResize));
    attempt(() => this.setPointerActive(false));
    attempt(() => this.input.pause());
    attempt(() => this.inputDecoder.reset());
    attempt(() => this.renderer.reset());
    attempt(() => this.terminalSession.cleanup({ newline: true }));
    if (failure) throw failure;
    return true;
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
    if (this.inputBatchDepth > 0) return false;
    return this.render();
  }

  render() {
    return this.runGuarded(() => this.renderUnsafe());
  }

  renderUnsafe() {
    if (!this.running || !this.dirty) return false;
    const width = Math.max(1, Number(this.output.columns) || 90);
    const height = Math.max(1, Number(this.output.rows) || 28);
    this.animationRequested = false;
    const view = this.renderView(this.context({ width, height }, { trackAnimation: true }));
    const frame = renderToFrame(view, { width, height, terminalPolicy: this.terminalPolicy });
    const snapshot = frame.toString();
    if (snapshot === this.lastSnapshot) {
      this.renderer.pointerRegions = frame.pointerRegions;
      this.syncPointerMode();
      this.dirty = false;
      this.syncAnimationTimer();
      return false;
    }
    this.lastSnapshot = snapshot;
    this.renderer.renderFrame(frame);
    this.terminalSession.resetStyles();
    this.syncPointerMode();
    this.dirty = false;
    this.syncAnimationTimer();
    return true;
  }

  handleResize() {
    return this.runGuarded(() => {
      if (!this.running) return;
      this.renderer.reset();
      this.terminalSession.clear();
      this.lastSnapshot = '';
      this.invalidate();
    });
  }

  handleData(data) {
    return this.runGuarded(() => {
      this.inputBatchDepth += 1;
      try {
        for (const event of this.inputDecoder.write(data)) this.handleInputEvent(event);
      } finally {
        this.inputBatchDepth = Math.max(0, this.inputBatchDepth - 1);
        if (this.inputBatchDepth === 0 && this.dirty) this.render();
      }
    });
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
    return this.runGuarded(() => {
      const baseContext = this.context({ pointer });
      const routed = this.renderer.dispatchPointer(pointer, baseContext);
      const event = routed.event;
      if (!event.propagationStopped && this.onPointer) {
        const result = this.onPointer({ pointer: event, ...this.context({ pointer: event }) });
        if (result !== false) event.handled = true;
      }
      return event;
    });
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
    this.terminalSession.setPointerReporting(next, this.pointerOptions);
    return true;
  }

  context(extra = {}, { trackAnimation = false } = {}) {
    const context = {
      app: this,
      state: this.state,
      actions: this.actions,
      overlays: this.overlays,
      runtime: this,
      exit: (code) => this.exit(code),
      invalidate: () => this.invalidate(),
      requestAnimationFrame: () => {
        if (trackAnimation) this.animationRequested = true;
        return this.animationFrame;
      },
      ...extra,
    };
    Object.defineProperty(context, 'animationFrame', {
      enumerable: true,
      get: () => {
        if (trackAnimation) this.animationRequested = true;
        return this.animationFrame;
      },
    });
    return context;
  }

  syncAnimationTimer() {
    const shouldRun = this.running && this.animationMs > 0 && this.animationRequested;
    if (!shouldRun) {
      if (this.animationTimer) clearTimeout(this.animationTimer);
      this.animationTimer = null;
      return false;
    }
    if (this.animationTimer) return true;
    this.animationTimer = setTimeout(() => this.runGuarded(() => {
      this.animationTimer = null;
      if (!this.running) return;
      this.animationFrame = (this.animationFrame + 1) % Number.MAX_SAFE_INTEGER;
      this.invalidate();
    }), this.animationMs);
    this.animationTimer.unref?.();
    return true;
  }

  runGuarded(callback) {
    try {
      return callback();
    } catch (error) {
      try {
        this.stop();
      } catch (cleanupError) {
        attachCleanupError(error, cleanupError);
      }
      throw error;
    }
  }

  installProcessHandlers() {
    if (this.processHandlers === 'signals' || this.processHandlers === 'full') {
      this.terminalSession.trackSignalHandler(process, 'SIGINT', this.boundSignal, { removeOnCleanup: true });
      this.terminalSession.trackSignalHandler(process, 'SIGTERM', this.boundSignal, { removeOnCleanup: true });
    }
    if (this.processHandlers === 'full') {
      this.terminalSession.trackSignalHandler(process, 'uncaughtException', this.boundFatal, { once: true, removeOnCleanup: true });
      this.terminalSession.trackSignalHandler(process, 'unhandledRejection', this.boundFatal, { once: true, removeOnCleanup: true });
    }
  }

  handleSignal(signal) {
    this.exit(signal === 'SIGINT' ? 130 : 143);
  }

  handleFatal(error) {
    let cleanupError = null;
    try {
      this.stop();
    } catch (failure) {
      cleanupError = failure;
      attachCleanupError(error, failure);
    }
    console.error(error);
    if (cleanupError && error?.cleanupError !== cleanupError) console.error(cleanupError);
    process.exitCode = 1;
    this.onExit?.(1, error);
  }
}

function attachCleanupError(error, cleanupError) {
  if (!error || !['object', 'function'].includes(typeof error)) return;
  try {
    Object.defineProperty(error, 'cleanupError', {
      value: cleanupError,
      configurable: true,
    });
  } catch { /* preserve the original thrown value */ }
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

function normalizeProcessHandlers(value) {
  return ['none', 'signals', 'full'].includes(value) ? value : 'none';
}
