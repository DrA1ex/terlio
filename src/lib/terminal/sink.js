import {
  createTerminalOutputFrame,
  legacyTerminalOutput,
  serializeTerminalOutputFrame,
  terminalControl,
} from './outputModel.js';
import { createTerminalPolicy, normalizeTerminalPolicy } from './policy.js';
import { createLimitError, utf8ByteLength } from '../securityLimits.js';
import {
  isValidatedSgr,
  parseTerminalControls,
  sanitizeTerminalText,
  sanitizeTrustedTerminalControl,
} from './controlParser.js';

const OSC = '\u001b]';
const ST = '\u001b\\';
const SGR_RESET = '\u001b[0m';
const OSC52_WRITE = /^\u001b\]52;([cps]);([A-Za-z0-9+/]*={0,2})\u0007$/u;

export class TerminalSink {
  constructor({ output = null, policy = createTerminalPolicy() } = {}) {
    this.output = output;
    this.policy = normalizeTerminalPolicy(policy);
  }

  writeFrame(frame, policy = this.policy) {
    const normalizedPolicy = normalizeTerminalPolicy(policy);
    enforceFrameSourceLimit(frame, normalizedPolicy.limits.renderedTextBytes, normalizedPolicy.mode);
    const bytes = serializeFrameForPolicy(frame, normalizedPolicy);
    const byteLength = utf8ByteLength(bytes);
    if (byteLength > normalizedPolicy.limits.renderedTextBytes) {
      throw createLimitError('renderedTextBytes', normalizedPolicy.limits.renderedTextBytes, byteLength);
    }
    if (!bytes || !this.output || typeof this.output.write !== 'function') return false;
    return this.output.write(bytes);
  }

  write(value, metadata = {}) {
    return this.writeFrame(legacyTerminalOutput(value, metadata));
  }

  writeControl(value, metadata = {}) {
    return this.writeFrame(createTerminalOutputFrame({
      operations: [terminalControl(value, { trusted: true, ...metadata })],
    }));
  }
}

export function createTerminalSink(options = {}) {
  if (options instanceof TerminalSink) return options;
  if (options?.writeFrame && typeof options.writeFrame === 'function') return options;
  if (options?.write && !('output' in options) && !('policy' in options)) return new TerminalSink({ output: options });
  return new TerminalSink(options);
}

export function resolveTerminalSink({ sink = null, output = null, policy = null } = {}) {
  if (sink?.writeFrame && typeof sink.writeFrame === 'function') return sink;
  return createTerminalSink({ output, policy: policy ?? createTerminalPolicy() });
}

function serializeFrameForPolicy(frame, policy) {
  if (policy.mode === 'trusted') return serializeTerminalOutputFrame(frame);
  if (frame == null) return '';
  if (typeof frame === 'string' || Buffer.isBuffer(frame)) return sanitizeText(frame, policy);
  if (frame.type !== 'terminal-output-frame') return sanitizeText(frame, policy);

  if (frame.operations?.length) {
    let output = '';
    for (const operation of frame.operations) output += serializeOperation(operation, policy);
    return output;
  }
  return sanitizeText(frame.legacyBytes ?? '', policy);
}

function enforceFrameSourceLimit(frame, limit, mode) {
  if (limit === Infinity || frame == null) return;
  let actual = 0;
  const add = (value) => {
    actual += utf8ByteLength(value);
    if (actual > limit) throw createLimitError('renderedTextBytes', limit, actual);
  };

  if (typeof frame === 'string' || Buffer.isBuffer(frame)) {
    add(frame);
    return;
  }
  if (frame.type !== 'terminal-output-frame') {
    add(frame);
    return;
  }
  if (mode === 'trusted' && typeof frame.legacyBytes === 'string') {
    add(frame.legacyBytes);
    return;
  }
  if (frame.operations?.length) {
    for (const operation of frame.operations) {
      if (!operation) continue;
      if (operation.type === 'hyperlink') {
        add(operation.label ?? '');
        add(operation.uri ?? '');
      } else if ('value' in operation) {
        add(operation.value ?? '');
      }
    }
    return;
  }
  add(frame.legacyBytes ?? '');
}

function serializeOperation(operation, policy) {
  if (!operation) return '';
  switch (operation.type) {
    case 'text':
      return sanitizeText(operation.value, policy);
    case 'style':
      return sanitizeTrustedTerminalControl(operation.value, { blockedControlRendering: 'remove' });
    case 'line-break':
      return '\n';
    case 'tab':
      return '\t';
    case 'control':
      return operation.metadata?.trusted === true
        ? sanitizeTrustedTerminalControl(operation.value, { blockedControlRendering: 'remove' })
        : sanitizeText(operation.value, policy, { allowSgr: false });
    case 'hyperlink':
      return serializeHyperlink(operation, policy);
    case 'clipboard-write':
      return ['legacy', 'osc52', 'auto'].includes(policy.clipboard)
        ? validateOsc52Write(operation.value, policy.limits.osc52Bytes)
        : '';
    case 'unsafe-raw':
      return sanitizeText(operation.value, policy, { allowSgr: false });
    default:
      return '';
  }
}

function sanitizeText(value, policy, { allowSgr = true } = {}) {
  return sanitizeTerminalText(value, {
    blockedControlRendering: policy.blockedControlRendering,
    allowSgr,
  });
}

function serializeHyperlink(operation, policy) {
  const label = sanitizeText(operation.label ?? '', policy);
  const config = policy.hyperlinks;
  const limit = policy.limits.hyperlinkBytes;
  const safeLabel = truncateTerminalLabel(label, limit);
  if (!config || config === 'disabled' || config === 'legacy') return safeLabel;
  const uri = sanitizeHyperlinkUri(operation.uri, config.schemes, limit);
  if (!uri) return safeLabel;
  return `${OSC}8;;${uri}${ST}${safeLabel}${OSC}8;;${ST}`;
}

function sanitizeHyperlinkUri(value, schemes, byteLimit) {
  const raw = String(value ?? '');
  if (/[^\u0020-\u007e]/u.test(raw) || /[\u001b\u0090-\u009f]/u.test(raw)) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  const scheme = url.protocol.slice(0, -1).toLowerCase();
  if (!schemes.includes(scheme)) return '';
  const normalized = url.toString();
  const limit = normalizeByteLimit(byteLimit);
  if (limit !== Infinity && Buffer.byteLength(normalized, 'utf8') > limit) return '';
  return normalized;
}

function truncateTerminalLabel(value, byteLimit) {
  const limit = normalizeByteLimit(byteLimit);
  const text = String(value ?? '');
  let output = '';
  let bytes = 0;
  let styleActive = false;

  for (const token of parseTerminalControls(text)) {
    if (token.type === 'control') {
      if (token.kind !== 'csi' || !isValidatedSgr(token.value)) continue;
      const reset = /^\u001b\[(?:0)?m$/u.test(token.value);
      if (reset && !styleActive) continue;
      const size = utf8ByteLength(token.value);
      if (limit !== Infinity && bytes + size > limit) continue;
      output += token.value;
      bytes += size;
      styleActive = !reset;
      continue;
    }

    for (const char of token.value ?? '') {
      const size = utf8ByteLength(char);
      if (limit !== Infinity && bytes + size > limit) break;
      output += char;
      bytes += size;
    }
    if (limit !== Infinity && bytes >= limit) break;
  }

  if (!styleActive) return output;
  if (limit === Infinity || bytes + utf8ByteLength(SGR_RESET) <= limit) return `${output}${SGR_RESET}`;
  return truncatePlainLabel(output, limit);
}

function truncatePlainLabel(value, limit) {
  const plain = sanitizeTerminalText(value, { blockedControlRendering: 'remove', allowSgr: false });
  let output = '';
  let bytes = 0;
  for (const char of plain) {
    const size = utf8ByteLength(char);
    if (limit !== Infinity && bytes + size > limit) break;
    output += char;
    bytes += size;
  }
  return output;
}

function validateOsc52Write(value, byteLimit) {
  const sequence = String(value ?? '');
  const match = OSC52_WRITE.exec(sequence);
  if (!match) return '';
  const payload = match[2];
  if (payload.length % 4 !== 0) return '';
  const decoded = Buffer.from(payload, 'base64');
  if (decoded.toString('base64') !== payload) return '';
  const limit = normalizeByteLimit(byteLimit);
  if (limit !== Infinity && decoded.length > limit) return '';
  return sequence;
}

function normalizeByteLimit(value) {
  if (value === Infinity) return Infinity;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 2048;
}
