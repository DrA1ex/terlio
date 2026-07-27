import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TerminalInputDecoder,
  TerminalRenderer,
  requestsPointerReporting,
  renderToFrame,
} from '../src/lib/index.js';
import { createTerminalPolicy } from '../src/lib/terminal/policy.js';
import { resolveTerminalSink } from '../src/lib/terminal/sink.js';
import { TerminalSessionGuard } from '../src/lib/terminal/sessionGuard.js';

export class InteractiveRuntime {
  constructor({
    title,
    state = {},
    render,
    onKey,
    onPointer = null,
    pointer = 'auto',
    onTick = null,
    tickMs = 0,
    animationMs = 80,
    escapeTimeoutMs = 40,
    onStop = null,
    input = process.stdin,
    output = process.stdout,
    terminalPolicy = createTerminalPolicy(),
    terminalSink = null,
  }) {
    this.title = title;
    this.state = {
      keyLog: [],
      status: 'Ready.',
      ...state,
    };
    this.renderView = render;
    this.onKey = onKey;
    this.onPointer = typeof onPointer === 'function' ? onPointer : null;
    this.pointerOptions = normalizePointerOptions(pointer);
    this.pointerOverride = null;
    this.pointerActive = false;
    this.onTick = onTick;
    this.tickMs = Number(tickMs) || 0;
    this.animationMs = Math.max(0, Number(animationMs) || 0);
    this.escapeTimeoutMs = Math.max(0, Number(escapeTimeoutMs) || 0);
    this.animationFrame = 0;
    this.animationRequested = false;
    this.onStop = typeof onStop === 'function' ? onStop : null;
    this.stopNotified = false;
    this.tickTimer = null;
    this.animationTimer = null;
    this.escapeTimer = null;
    this.renderBatchDepth = 0;
    this.renderPending = false;
    this.input = input;
    this.output = output;
    this.terminalPolicy = terminalPolicy;
    this.terminalSink = resolveTerminalSink({ sink: terminalSink, output: this.output, policy: this.terminalPolicy });
    this.terminalSession = new TerminalSessionGuard({ input: this.input, output: this.output, sink: this.terminalSink });
    this.renderer = new TerminalRenderer({ output: this.output, sink: this.terminalSink, policy: this.terminalPolicy });
    this.inputDecoder = new TerminalInputDecoder();
    this.running = false;
    this.boundOnData = this.handleData.bind(this);
    this.boundOnResize = this.handleResize.bind(this);
  }

  start() {
    if (!this.input.isTTY || !this.output.isTTY) {
      throw new Error(`${this.title} requires an interactive TTY. Run it directly in a terminal.`);
    }

    this.running = true;
    this.renderer.reset();
    this.terminalSession.start();
    this.input.setEncoding('utf8');
    this.terminalSession.enableRawMode();
    this.input.resume();
    this.input.on('data', this.boundOnData);
    this.output.on('resize', this.boundOnResize);
    if (this.onTick && this.tickMs > 0) {
      this.tickTimer = setInterval(() => {
        if (!this.running) return;
        this.onTick({ state: this.state, runtime: this, animationFrame: this.animationFrame });
        this.render();
      }, this.tickMs);
    }
    this.render();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
    if (this.escapeTimer) {
      clearTimeout(this.escapeTimer);
      this.escapeTimer = null;
    }
    this.input.off('data', this.boundOnData);
    this.output.off('resize', this.boundOnResize);
    this.setPointerActive(false);
    this.input.pause();
    this.inputDecoder.reset();
    if (!this.stopNotified) {
      this.stopNotified = true;
      try { this.onStop?.({ state: this.state, runtime: this }); } catch {}
    }
    this.renderer.reset();
    this.terminalSession.cleanup({ newline: true });
  }

  exit(code = 0) {
    this.stop();
    process.exitCode = code;
    setImmediate(() => process.exit(code));
  }

  handleResize() {
    if (!this.running) return;
    this.renderer.reset();
    this.terminalSession.clear();
    this.render();
  }

  render() {
    if (!this.running) return;
    if (this.renderBatchDepth > 0) {
      this.renderPending = true;
      return;
    }
    this.renderPending = false;
    const width = Math.max(1, this.output.columns || 90);
    const height = Math.max(1, this.output.rows || 28);
    this.animationRequested = false;
    const context = {
      state: this.state,
      runtime: this,
      width,
      height,
      requestAnimationFrame: () => {
        this.animationRequested = true;
        return this.animationFrame;
      },
    };
    Object.defineProperty(context, 'animationFrame', {
      enumerable: true,
      get: () => {
        this.animationRequested = true;
        return this.animationFrame;
      },
    });
    const view = this.renderView(context);
    const frame = renderToFrame(view, { width, height });
    this.renderer.renderFrame(frame);
    this.terminalSession.resetStyles();
    this.syncPointerMode();
    this.syncAnimationTimer();
  }

  invalidate() {
    this.render();
  }

  logKey(key) {
    this.state.keyLog.push(formatKey(key));
    if (this.state.keyLog.length > 8) this.state.keyLog = this.state.keyLog.slice(-8);
  }

  handleData(data) {
    this.clearEscapeTimer();
    this.renderBatchDepth += 1;
    try {
      this.dispatchInputEvents(this.inputDecoder.write(data));
    } finally {
      this.renderBatchDepth = Math.max(0, this.renderBatchDepth - 1);
      if (this.renderBatchDepth === 0 && this.renderPending) this.render();
    }
    this.scheduleEscapeFlush();
  }

  dispatchInputEvents(events) {
    for (const event of events) {
      if (event?.type === 'pointer') {
        this.handlePointer(event);
        continue;
      }

      const key = event;
      this.logKey(key);

      if (key.name === 'ctrl-c') {
        this.exit(130);
        return;
      }

      if (key.name === 'ctrl-d') {
        this.exit(0);
        return;
      }

      if (key.ctrl && key.name === 't') {
        this.togglePointerOverride();
        continue;
      }

      this.onKey?.({ key, state: this.state, runtime: this, animationFrame: this.animationFrame });
      this.render();
    }
  }

  clearEscapeTimer() {
    if (!this.escapeTimer) return false;
    clearTimeout(this.escapeTimer);
    this.escapeTimer = null;
    return true;
  }

  scheduleEscapeFlush() {
    if (!this.inputDecoder.hasPendingStandaloneEscape()) return false;
    if (!this.running || this.escapeTimeoutMs <= 0) {
      this.dispatchInputEvents(this.inputDecoder.flushPendingEscape());
      return true;
    }
    this.escapeTimer = setTimeout(() => {
      this.escapeTimer = null;
      if (!this.running) return;
      this.dispatchInputEvents(this.inputDecoder.flushPendingEscape());
    }, this.escapeTimeoutMs);
    this.escapeTimer.unref?.();
    return true;
  }

  handlePointer(pointer) {
    const routed = this.renderer.dispatchPointer(pointer, {
      pointer,
      state: this.state,
      runtime: this,
      animationFrame: this.animationFrame,
    });
    const event = routed.event;
    if (!event.propagationStopped && this.onPointer) {
      const result = this.onPointer({ pointer: event, state: this.state, runtime: this, animationFrame: this.animationFrame });
      if (result !== false) event.handled = true;
    }
    if (event.handled) this.render();
    return event;
  }

  syncAnimationTimer() {
    const shouldRun = this.running && this.animationMs > 0 && this.animationRequested;
    if (!shouldRun) {
      if (this.animationTimer) clearTimeout(this.animationTimer);
      this.animationTimer = null;
      return false;
    }
    if (this.animationTimer) return true;
    this.animationTimer = setTimeout(() => {
      this.animationTimer = null;
      if (!this.running) return;
      this.animationFrame = (this.animationFrame + 1) % Number.MAX_SAFE_INTEGER;
      this.render();
    }, this.animationMs);
    this.animationTimer.unref?.();
    return true;
  }

  setPointerEnabled(value) {
    this.pointerOptions.enabled = value === 'auto' ? 'auto' : Boolean(value);
    this.syncPointerMode();
    return this.pointerOptions.enabled;
  }

  resolveAutomaticPointerEnabled() {
    return this.pointerOptions.enabled === true || (
      this.pointerOptions.enabled === 'auto'
      && (Boolean(this.onPointer) || requestsPointerReporting(this.renderer.pointerRegions))
    );
  }

  togglePointerOverride() {
    const automatic = this.resolveAutomaticPointerEnabled();
    this.pointerOverride = this.pointerOverride === null ? !automatic : null;
    this.syncPointerMode();
    this.state.status = this.pointerOverride === null
      ? 'Smart pointer mode restored.'
      : this.pointerOverride
        ? 'Pointer mode forced. Press Ctrl+T to restore smart mode.'
        : 'Native text selection forced. Press Ctrl+T to restore smart mode.';
    this.render();
    return this.pointerOverride;
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
}

export function isDirectRun(metaUrl) {
  if (!process.argv[1]) return false;
  return path.resolve(fileURLToPath(metaUrl)) === path.resolve(process.argv[1]);
}

export function runInteractiveDemo(config) {
  const runtime = new InteractiveRuntime(config);

  runtime.terminalSession.trackSignalHandler(process, 'SIGINT', () => runtime.exit(130), { removeOnCleanup: false });
  runtime.terminalSession.trackSignalHandler(process, 'SIGTERM', () => runtime.exit(143), { removeOnCleanup: false });
  runtime.terminalSession.trackSignalHandler(process, 'uncaughtException', (error) => {
    runtime.stop();
    console.error(error);
    process.exit(1);
  }, { removeOnCleanup: false });
  runtime.terminalSession.trackSignalHandler(process, 'unhandledRejection', (error) => {
    runtime.stop();
    console.error(error);
    process.exit(1);
  }, { removeOnCleanup: false });

  runtime.start();
  return runtime;
}

export function formatKey(key) {
  const modifiers = [
    key.ctrl ? 'ctrl' : '',
    key.meta ? 'meta' : '',
    key.shift ? 'shift' : '',
    key.cmd ? 'cmd' : '',
  ].filter(Boolean);
  const prefix = modifiers.length ? `${modifiers.join('+')}+` : '';
  const printable = key.printable ? ` text=${JSON.stringify(key.text)}` : '';
  return `${prefix}${key.name}${printable}`;
}

export function fit(value, width) {
  const text = String(value ?? '');
  if (text.length > width) return text.slice(0, Math.max(0, width - 1)) + '…';
  return text.padEnd(width, ' ');
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
