import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ansi, parseKey, renderToFrame, TerminalRenderer } from '../src/lib/index.js';

export class InteractiveRuntime {
  constructor({ title, state = {}, render, onKey, onTick = null, tickMs = 0 }) {
    this.title = title;
    this.state = {
      keyLog: [],
      status: 'Ready.',
      ...state,
    };
    this.renderView = render;
    this.onKey = onKey;
    this.onTick = onTick;
    this.tickMs = Number(tickMs) || 0;
    this.tickTimer = null;
    this.input = process.stdin;
    this.output = process.stdout;
    this.renderer = new TerminalRenderer({ output: this.output });
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
    this.output.write(ansi.altScreen + ansi.hideCursor + ansi.clear + ansi.home);
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
    if (this.input.isTTY) this.input.setRawMode(false);
    this.input.pause();
    this.renderer.reset();
    this.output.write(ansi.showCursor + ansi.normalScreen + ansi.reset + '\n');
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
    const width = Math.max(50, this.output.columns || 90);
    const height = Math.max(16, this.output.rows || 28);
    const view = this.renderView({ state: this.state, runtime: this, width, height });
    const frame = renderToFrame(view, { width, height });
    this.renderer.renderFrame(frame);
    this.output.write(ansi.reset);
  }

  invalidate() {
    this.render();
  }

  logKey(key) {
    this.state.keyLog.push(formatKey(key));
    if (this.state.keyLog.length > 8) this.state.keyLog = this.state.keyLog.slice(-8);
  }

  handleData(data) {
    const key = parseKey(data);
    this.logKey(key);

    if (key.name === 'ctrl-c') {
      this.exit(130);
      return;
    }

    if (key.name === 'ctrl-d') {
      this.exit(0);
      return;
    }

    this.onKey?.({ key, state: this.state, runtime: this });
    this.render();
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
