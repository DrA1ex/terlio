import { ansi, mouseReportingSequence } from '../ansi/codes.js';
import { createTerminalOutputFrame, terminalControl } from './outputModel.js';
import { resolveTerminalSink } from './sink.js';

export class TerminalSessionGuard {
  constructor({ input = process.stdin, output = process.stdout, sink = null } = {}) {
    this.input = input;
    this.output = output;
    this.sink = resolveTerminalSink({ sink, output });
    this.active = false;
    this.rawMode = false;
    this.alternateScreen = false;
    this.cursorHidden = false;
    this.autowrapDisabled = false;
    this.mouseReporting = false;
    this.bracketedPaste = false;
    this.signalHandlers = [];
  }

  writeControl(value, metadata = {}) {
    if (typeof this.sink?.writeControl === 'function') return this.sink.writeControl(value, metadata);
    return this.sink?.writeFrame?.(createTerminalOutputFrame({
      operations: [terminalControl(value, { trusted: true, ...metadata })],
    })) ?? false;
  }

  start() {
    if (this.active) return false;
    this.active = true;
    this.alternateScreen = true;
    this.cursorHidden = true;
    this.autowrapDisabled = true;
    this.writeControl(ansi.altScreen + ansi.hideCursor + ansi.autoWrapOff + ansi.clear + ansi.home, { kind: 'session-start' });
    return true;
  }

  enableRawMode() {
    if (this.rawMode || !this.input?.isTTY || typeof this.input.setRawMode !== 'function') return false;
    this.input.setRawMode(true);
    this.rawMode = true;
    this.active = true;
    return true;
  }

  setBracketedPaste(enabled) {
    const next = Boolean(enabled);
    if (next === this.bracketedPaste) return false;
    this.bracketedPaste = next;
    this.active = this.active || next;
    this.writeControl(next ? ansi.bracketedPasteOn : ansi.bracketedPasteOff, { kind: 'bracketed-paste', enabled: next });
    return true;
  }

  setPointerReporting(enabled, options = {}) {
    const next = Boolean(enabled);
    if (next === this.mouseReporting) return false;
    this.mouseReporting = next;
    this.active = this.active || next;
    this.writeControl(mouseReportingSequence(next, options), { kind: 'pointer-reporting', enabled: next });
    return true;
  }

  trackSignalHandler(emitter, event, handler, { once = false, removeOnCleanup = true } = {}) {
    if (!emitter || typeof handler !== 'function') return false;
    const method = once ? 'once' : 'on';
    if (typeof emitter[method] !== 'function') return false;
    emitter[method](event, handler);
    this.signalHandlers.push({ emitter, event, handler, removeOnCleanup });
    return true;
  }

  removeSignalHandlers({ cleanupOnly = false } = {}) {
    const retained = [];
    for (const entry of this.signalHandlers) {
      if (cleanupOnly && !entry.removeOnCleanup) {
        retained.push(entry);
        continue;
      }
      entry.emitter?.off?.(entry.event, entry.handler);
    }
    this.signalHandlers = retained;
  }

  resetStyles() {
    return this.writeControl(ansi.reset, { kind: 'style-reset' });
  }

  clear() {
    return this.writeControl(ansi.clear + ansi.home, { kind: 'screen-clear' });
  }

  cleanup({ newline = true } = {}) {
    if (!this.active && !this.rawMode && !this.mouseReporting && !this.signalHandlers.some((entry) => entry.removeOnCleanup)) return false;
    let failure = null;
    const attempt = (callback) => {
      try {
        callback();
        return true;
      } catch (error) {
        failure ??= error;
        return false;
      }
    };
    const hadBracketedPaste = this.bracketedPaste;
    const hadMouseReporting = this.mouseReporting;
    const hadRawMode = this.rawMode;
    const bracketedPasteRestored = !hadBracketedPaste || attempt(() => this.setBracketedPaste(false));
    const mouseReportingRestored = !hadMouseReporting || attempt(() => this.setPointerReporting(false));
    let rawModeRestored = !hadRawMode;
    if (hadRawMode && this.input?.isTTY && typeof this.input.setRawMode === 'function') {
      this.rawMode = false;
      rawModeRestored = attempt(() => this.input.setRawMode(false));
    }
    attempt(() => this.removeSignalHandlers({ cleanupOnly: true }));
    const restore = `${!bracketedPasteRestored && hadBracketedPaste ? ansi.bracketedPasteOff : ''}${!mouseReportingRestored && hadMouseReporting ? mouseReportingSequence(false) : ''}${this.autowrapDisabled ? ansi.autoWrapOn : ''}${this.cursorHidden ? ansi.showCursor : ''}${this.alternateScreen ? ansi.normalScreen : ''}${ansi.reset}${newline ? '\n' : ''}`;
    this.active = false;
    this.autowrapDisabled = false;
    this.cursorHidden = false;
    this.alternateScreen = false;
    this.bracketedPaste = false;
    if (restore) attempt(() => this.writeControl(restore, { kind: 'session-cleanup' }));
    if (!rawModeRestored && hadRawMode && this.input?.isTTY && typeof this.input.setRawMode === 'function') {
      attempt(() => this.input.setRawMode(false));
    }
    if (failure) throw failure;
    return true;
  }
}
