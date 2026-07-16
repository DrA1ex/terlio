import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TerminalInputDecoder,
  TerminalRenderer,
  ansi,
  mouseReportingSequence,
  requestsPointerReporting,
  renderToFrame,
} from '../src/lib/index.js';

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
    onStop = null,
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
    this.onStop = typeof onStop === 'function' ? onStop : null;
    this.stopNotified = false;
    this.tickTimer = null;
    this.input = process.stdin;
    this.output = process.stdout;
    this.renderer = new TerminalRenderer({ output: this.output });
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
    this.output.write(ansi.altScreen + ansi.hideCursor + ansi.autoWrapOff + ansi.clear + ansi.home);
    this.input.setEncoding('utf8');
    this.input.setRawMode(true);
    this.input.resume();
    this.input.on('data', this.boundOnData);
    this.output.on('resize', this.boundOnResize);
    if (this.onTick && this.tickMs > 0) {
      this.tickTimer = setInterval(() => {
        if (!this.running) return;
        this.onTick({ state: this.state, runtime: this });
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
    this.input.off('data', this.boundOnData);
    this.output.off('resize', this.boundOnResize);
    this.setPointerActive(false);
    if (this.input.isTTY) this.input.setRawMode(false);
    this.input.pause();
    this.inputDecoder.reset();
    if (!this.stopNotified) {
      this.stopNotified = true;
      try { this.onStop?.({ state: this.state, runtime: this }); } catch {}
    }
    this.renderer.reset();
    this.output.write(ansi.autoWrapOn + ansi.showCursor + ansi.normalScreen + ansi.reset + '\n');
  }

  exit(code = 0) {
    this.stop();
    process.exitCode = code;
    setImmediate(() => process.exit(code));
  }

  handleResize() {
    if (!this.running) return;
    this.renderer.reset();
    this.output.write(ansi.clear + ansi.home);
    this.render();
  }

  render() {
    if (!this.running) return;
    const width = Math.max(1, this.output.columns || 90);
    const height = Math.max(1, this.output.rows || 28);
    const view = this.renderView({ state: this.state, runtime: this, width, height });
    const frame = renderToFrame(view, { width, height });
    this.renderer.renderFrame(frame);
    this.output.write(ansi.reset);
    this.syncPointerMode();
  }

  invalidate() {
    this.render();
  }

  logKey(key) {
    this.state.keyLog.push(formatKey(key));
    if (this.state.keyLog.length > 8) this.state.keyLog = this.state.keyLog.slice(-8);
  }

  handleData(data) {
    for (const event of this.inputDecoder.write(data)) {
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

      this.onKey?.({ key, state: this.state, runtime: this });
      this.render();
    }
  }

  handlePointer(pointer) {
    const routed = this.renderer.dispatchPointer(pointer, {
      pointer,
      state: this.state,
      runtime: this,
    });
    const event = routed.event;
    if (!event.propagationStopped && this.onPointer) {
      const result = this.onPointer({ pointer: event, state: this.state, runtime: this });
      if (result !== false) event.handled = true;
    }
    if (event.handled) this.render();
    return event;
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
    this.output.write(mouseReportingSequence(next, this.pointerOptions));
    return true;
  }
}

export function isDirectRun(metaUrl) {
  if (!process.argv[1]) return false;
  return path.resolve(fileURLToPath(metaUrl)) === path.resolve(process.argv[1]);
}

export function runInteractiveDemo(config) {
  const runtime = new InteractiveRuntime(config);

  process.on('SIGINT', () => runtime.exit(130));
  process.on('SIGTERM', () => runtime.exit(143));
  process.on('uncaughtException', (error) => {
    runtime.stop();
    console.error(error);
    process.exit(1);
  });
  process.on('unhandledRejection', (error) => {
    runtime.stop();
    console.error(error);
    process.exit(1);
  });

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
