import { spawnSync as nodeSpawnSync } from 'node:child_process';
import { createTerminalOutputFrame, terminalClipboardWrite } from './terminal/outputModel.js';
import { createTerminalPolicy } from './terminal/policy.js';
import { resolveTerminalSink } from './terminal/sink.js';
import { DEFAULT_SECURITY_LIMITS, mergeSecurityLimits, utf8ByteLength } from './securityLimits.js';

const OSC52_TARGETS = new Set(['c', 'p', 's']);
const CLIPBOARD_POLICIES = new Set(['disabled', 'native', 'osc52', 'auto', 'legacy']);

export function osc52ClipboardSequence(text, {
  target = 'c',
  operation = 'write',
  maxBytes = Infinity,
} = {}) {
  if (operation !== 'write') throw new Error('OSC 52 query/read operations are not supported.');
  const safeTarget = normalizeOsc52Target(target);
  const value = String(text ?? '');
  const bytes = utf8ByteLength(value);
  if (maxBytes !== Infinity && bytes > maxBytes) {
    const error = new Error(`OSC 52 payload exceeds osc52Bytes (${bytes} > ${maxBytes}).`);
    error.code = 'TERLIO_LIMIT_EXCEEDED';
    error.resource = 'osc52Bytes';
    error.limit = maxBytes;
    error.actual = bytes;
    throw error;
  }
  return `\x1b]52;${safeTarget};${Buffer.from(value, 'utf8').toString('base64')}\x07`;
}

export function normalizeClipboardPolicy(value, { fallback = 'native' } = {}) {
  const policy = value ?? fallback;
  if (!CLIPBOARD_POLICIES.has(policy)) throw new Error(`Invalid clipboard policy: ${String(policy)}`);
  return policy;
}

export function createLegacyClipboard({
  output = process.stdout,
  sink = null,
  platform = process.platform,
  env = process.env,
  spawnSync = nodeSpawnSync,
  osc52 = true,
  target = 'c',
  timeout = 1200,
  securityLimits = null,
} = {}) {
  const terminalSink = resolveTerminalSink({ sink, output });
  const nativeBackend = createLegacyNativeClipboardBackend({ platform, env, spawnSync, timeout });
  const limits = mergeSecurityLimits(DEFAULT_SECURITY_LIMITS, securityLimits);
  return {
    copy(text, options = {}) {
      const value = String(text ?? '');
      if (!value) return { copied: false, method: null };
      if (utf8ByteLength(value) <= limits.nativeClipboardBytes) {
        const nativeResult = nativeBackend.copy(value, options);
        if (nativeResult.copied) return nativeResult;
      }
      const allowOsc52 = options.osc52 ?? osc52;
      if (!allowOsc52 || utf8ByteLength(value) > limits.osc52Bytes) return { copied: false, method: null };
      const sequence = osc52ClipboardSequence(value, {
        target: options.target ?? target,
        maxBytes: limits.osc52Bytes,
      });
      if (!terminalSink.output || typeof terminalSink.output.write !== 'function') return { copied: false, method: null };
      terminalSink.writeFrame(
        createTerminalOutputFrame({ operations: [terminalClipboardWrite(sequence)] }),
        createTerminalPolicy({ clipboard: 'legacy', limits }),
      );
      return { copied: true, method: 'osc52' };
    },
  };
}

export function createLegacyNativeClipboardBackend({
  platform = process.platform,
  env = process.env,
  spawnSync = nodeSpawnSync,
  timeout = 1200,
} = {}) {
  let cachedCandidate = null;
  return {
    copy(text) {
      const value = String(text ?? '');
      if (!value) return { copied: false, method: null };
      if (cachedCandidate) {
        if (runClipboardCommand(cachedCandidate, value, { spawnSync, timeout, env })) {
          return { copied: true, method: cachedCandidate.method };
        }
        cachedCandidate = null;
      }
      for (const candidate of clipboardCommands(platform, env)) {
        if (runClipboardCommand(candidate, value, { spawnSync, timeout, env })) {
          cachedCandidate = candidate;
          return { copied: true, method: candidate.method };
        }
      }
      return { copied: false, method: null };
    },
  };
}

export function writeOsc52Clipboard(text, {
  output = process.stdout,
  sink = null,
  target = 'c',
  securityLimits = null,
} = {}) {
  const value = String(text ?? '');
  if (!value) return false;
  const terminalSink = resolveTerminalSink({ sink, output });
  if (!terminalSink.output || typeof terminalSink.output.write !== 'function') return false;
  const limits = mergeSecurityLimits(DEFAULT_SECURITY_LIMITS, securityLimits);
  const sequence = osc52ClipboardSequence(value, { target, maxBytes: limits.osc52Bytes });
  terminalSink.writeFrame(
    createTerminalOutputFrame({ operations: [terminalClipboardWrite(sequence)] }),
    createTerminalPolicy({ clipboard: 'osc52', limits }),
  );
  return true;
}

export function copyWithClipboardPolicy(text, {
  output = process.stdout,
  sink = null,
  clipboardPolicy = 'native',
  clipboardBackend = null,
  platform = process.platform,
  env = process.env,
  spawnSync = nodeSpawnSync,
  target = 'c',
  timeout = 1200,
  securityLimits = null,
} = {}) {
  const value = String(text ?? '');
  const policy = normalizeClipboardPolicy(clipboardPolicy);
  if (!value) return policy === 'legacy'
    ? { copied: false, method: null }
    : { copied: false, backend: policy, reason: 'empty' };
  if (policy === 'disabled') return { copied: false, backend: 'disabled', reason: 'disabled' };

  const limits = mergeSecurityLimits(DEFAULT_SECURITY_LIMITS, securityLimits);
  const actual = utf8ByteLength(value);

  if (policy === 'legacy') {
    return createLegacyClipboard({ output, sink, platform, env, spawnSync, target, timeout, securityLimits: limits }).copy(value);
  }

  const nativeBackend = clipboardBackend ?? createLegacyNativeClipboardBackend({ platform, env, spawnSync, timeout });
  if (policy === 'native' || policy === 'auto') {
    if (actual > limits.nativeClipboardBytes) {
      if (policy === 'native') return limitResult('native', 'nativeClipboardBytes', limits.nativeClipboardBytes, actual);
    } else {
      const nativeResult = invokeClipboardBackend(nativeBackend, value);
      if (isPromise(nativeResult)) {
        return nativeResult
          .then((result) => finishNativeResult(result, value, {
            policy, output, sink, target, limits,
          }))
          .catch(() => finishNativeResult({ copied: false, reason: 'unavailable' }, value, {
            policy, output, sink, target, limits,
          }));
      }
      const finished = finishNativeResult(nativeResult, value, { policy, output, sink, target, limits });
      if (finished) return finished;
    }
  }

  if (policy === 'osc52' || policy === 'auto') return copyViaOsc52(value, { output, sink, target, limits });
  return { copied: false, backend: 'native', reason: 'unavailable' };
}

function finishNativeResult(result, value, options) {
  if (result?.copied) {
    if (result.backend) return result;
    return { copied: true, backend: result.method ?? 'native' };
  }
  if (options.policy === 'auto') return copyViaOsc52(value, options);
  return { copied: false, backend: 'native', reason: result?.reason ?? 'unavailable' };
}

function copyViaOsc52(value, { output, sink, target, limits }) {
  const actual = utf8ByteLength(value);
  if (actual > limits.osc52Bytes) return limitResult('osc52', 'osc52Bytes', limits.osc52Bytes, actual);
  const terminalSink = resolveTerminalSink({ sink, output });
  if (!terminalSink.output || typeof terminalSink.output.write !== 'function') {
    return { copied: false, backend: 'osc52', reason: 'unavailable' };
  }
  const sequence = osc52ClipboardSequence(value, { target, maxBytes: limits.osc52Bytes });
  try {
    terminalSink.writeFrame(
      createTerminalOutputFrame({ operations: [terminalClipboardWrite(sequence)] }),
      createTerminalPolicy({ clipboard: 'osc52', limits }),
    );
    return { copied: true, backend: 'osc52' };
  } catch {
    return { copied: false, backend: 'osc52', reason: 'write-failed' };
  }
}

function invokeClipboardBackend(backend, value) {
  if (!backend || typeof backend.copy !== 'function') return { copied: false, reason: 'unavailable' };
  try {
    return backend.copy(value);
  } catch {
    return { copied: false, reason: 'unavailable' };
  }
}

function normalizeOsc52Target(value) {
  const target = String(value ?? '');
  if (!OSC52_TARGETS.has(target)) throw new Error(`Invalid OSC 52 target: ${JSON.stringify(target)}`);
  return target;
}

function clipboardCommands(platform, env = {}) {
  if (platform === 'darwin') return [
    { method: 'pbcopy', command: 'pbcopy', args: [] },
  ];

  if (platform === 'win32') return [
    {
      method: 'powershell',
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command', '[Console]::In.ReadToEnd() | Set-Clipboard'],
    },
    { method: 'clip.exe', command: 'clip.exe', args: [] },
  ];

  const commands = [];
  if (env?.WSL_DISTRO_NAME || env?.WSL_INTEROP) commands.push({ method: 'clip.exe', command: 'clip.exe', args: [] });
  if (env?.WAYLAND_DISPLAY) commands.push({ method: 'wl-copy', command: 'wl-copy', args: ['--type', 'text/plain;charset=utf-8'] });
  commands.push(
    { method: 'xclip', command: 'xclip', args: ['-selection', 'clipboard', '-in'] },
    { method: 'xsel', command: 'xsel', args: ['--clipboard', '--input'] },
  );
  return commands;
}

function runClipboardCommand(candidate, value, { spawnSync, timeout, env }) {
  if (typeof spawnSync !== 'function') return false;
  try {
    const result = spawnSync(candidate.command, candidate.args, {
      input: value,
      encoding: 'utf8',
      stdio: ['pipe', 'ignore', 'ignore'],
      timeout: Math.max(100, Number(timeout) || 1200),
      windowsHide: true,
      shell: false,
      env,
    });
    return !result?.error && Number(result?.status) === 0;
  } catch {
    return false;
  }
}


function limitResult(backend, resource, limit, actual) {
  return {
    copied: false,
    backend,
    reason: 'limit-exceeded',
    resource,
    limit,
    actual,
  };
}

function isPromise(value) {
  return Boolean(value && typeof value.then === 'function');
}
