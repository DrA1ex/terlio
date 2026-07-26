import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  captureTerminalState,
  runGuardedProcess,
  shellTerminalRestoreSequence,
} from '../scripts/testing/terminalGuard.js';

class FakeParent extends EventEmitter {}

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.exitCode = null;
    this.signalCode = null;
    this.killedWith = [];
  }

  kill(signal) {
    this.killedWith.push(signal);
    this.signalCode = signal;
    queueMicrotask(() => this.emit('close', null, signal));
    return true;
  }
}

test('test terminal snapshot restores the exact stty state and shell-safe modes once', () => {
  const calls = [];
  const writes = [];
  const closes = [];
  const snapshot = captureTerminalState({
    platform: 'linux',
    stdout: { isTTY: false },
    open(path, mode) {
      calls.push(['open', path, mode]);
      return 9;
    },
    close(fd) { closes.push(fd); },
    write(fd, value) { writes.push([fd, value]); },
    exec(command, args, options) {
      calls.push(['exec', command, args, options.stdio]);
      return args[0] === '-g' ? 'saved-terminal-state\n' : '';
    },
  });

  assert.equal(snapshot.restore(), true);
  assert.equal(snapshot.restore(), false);
  assert.deepEqual(calls[0], ['open', '/dev/tty', 'r+']);
  assert.deepEqual(calls[1].slice(0, 3), ['exec', 'stty', ['-g']]);
  assert.deepEqual(calls[2].slice(0, 3), ['exec', 'stty', ['saved-terminal-state']]);
  assert.deepEqual(writes, [[9, shellTerminalRestoreSequence()]]);
  assert.deepEqual(closes, [9]);
});

test('test terminal snapshot falls back to the current TTY output when /dev/tty is unavailable', () => {
  const writes = [];
  const snapshot = captureTerminalState({
    platform: 'win32',
    stdout: {
      isTTY: true,
      write(value) { writes.push(value); },
    },
  });

  assert.equal(snapshot.restore(), true);
  assert.deepEqual(writes, [shellTerminalRestoreSequence()]);
});

test('guarded test process restores terminal state after success and spawn failure', async () => {
  for (const mode of ['success', 'failure']) {
    const parent = new FakeParent();
    const child = new FakeChild();
    let restores = 0;
    const promise = runGuardedProcess('node', ['--test'], {
      parent,
      terminalState: { restore() { restores += 1; } },
      spawnImpl() {
        queueMicrotask(() => {
          if (mode === 'success') child.emit('close', 0, null);
          else child.emit('error', new Error('spawn failed'));
        });
        return child;
      },
    });

    if (mode === 'success') assert.equal(await promise, 0);
    else await assert.rejects(promise, /spawn failed/);
    assert.equal(restores, 1);
    assert.equal(parent.listenerCount('SIGINT'), 0);
    assert.equal(parent.listenerCount('SIGTERM'), 0);
    assert.equal(parent.listenerCount('SIGHUP'), 0);
  }
});

test('guarded test process forwards termination signals and restores before returning', async () => {
  const parent = new FakeParent();
  const child = new FakeChild();
  let restores = 0;
  const promise = runGuardedProcess('node', ['--test'], {
    parent,
    terminalState: { restore() { restores += 1; } },
    spawnImpl() {
      queueMicrotask(() => parent.emit('SIGINT'));
      return child;
    },
  });

  assert.equal(await promise, 130);
  assert.deepEqual(child.killedWith, ['SIGINT']);
  assert.equal(restores, 1);
});
