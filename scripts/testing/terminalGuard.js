import { execFileSync, spawn } from 'node:child_process';
import { closeSync, openSync, writeSync } from 'node:fs';
import { ansi, mouseReportingSequence } from '../../src/lib/ansi/codes.js';

const SIGNAL_EXIT_CODES = Object.freeze({
  SIGINT: 130,
  SIGTERM: 143,
  SIGHUP: 129,
});

const SHELL_TERMINAL_RESTORE = [
  ansi.bracketedPasteOff,
  mouseReportingSequence(false),
  ansi.autoWrapOn,
  ansi.showCursor,
  ansi.normalScreen,
  ansi.reset,
].join('');

export function captureTerminalState({
  platform = process.platform,
  stdout = process.stdout,
  open = openSync,
  close = closeSync,
  write = writeSync,
  exec = execFileSync,
} = {}) {
  let ttyFd = null;
  let sttyState = null;

  if (platform !== 'win32') {
    try {
      ttyFd = open('/dev/tty', 'r+');
      sttyState = String(exec('stty', ['-g'], {
        encoding: 'utf8',
        stdio: [ttyFd, 'pipe', 'ignore'],
      })).trim() || null;
    } catch {
      if (ttyFd !== null) {
        try { close(ttyFd); } catch {}
      }
      ttyFd = null;
      sttyState = null;
    }
  }

  let restored = false;
  return {
    restore() {
      if (restored) return false;
      restored = true;

      if (ttyFd !== null && sttyState) {
        try {
          exec('stty', [sttyState], {
            stdio: [ttyFd, 'ignore', 'ignore'],
          });
        } catch {}
      }

      if (ttyFd !== null) {
        try { write(ttyFd, SHELL_TERMINAL_RESTORE); } catch {}
        try { close(ttyFd); } catch {}
        ttyFd = null;
      } else if (stdout?.isTTY && typeof stdout.write === 'function') {
        try { stdout.write(SHELL_TERMINAL_RESTORE); } catch {}
      }
      return true;
    },
  };
}

export async function runGuardedProcess(command, args = [], {
  cwd = process.cwd(),
  env = process.env,
  stdio = 'inherit',
  spawnImpl = spawn,
  terminalState = captureTerminalState(),
  parent = process,
} = {}) {
  let child = null;
  let forwardedSignal = null;
  const signalHandlers = new Map();

  const forwardSignal = (signal) => {
    forwardedSignal ??= signal;
    if (child && child.exitCode === null && child.signalCode === null) {
      try { child.kill(signal); } catch {}
    }
  };

  for (const signal of Object.keys(SIGNAL_EXIT_CODES)) {
    const handler = () => forwardSignal(signal);
    signalHandlers.set(signal, handler);
    parent.once(signal, handler);
  }

  try {
    child = spawnImpl(command, args, { cwd, env, stdio });
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    const signal = forwardedSignal ?? result.signal;
    if (signal) return SIGNAL_EXIT_CODES[signal] ?? 1;
    return result.code ?? 1;
  } finally {
    for (const [signal, handler] of signalHandlers) {
      parent.removeListener(signal, handler);
    }
    terminalState.restore();
  }
}

export function shellTerminalRestoreSequence() {
  return SHELL_TERMINAL_RESTORE;
}
