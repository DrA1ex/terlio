export const DEFAULT_SECURITY_LIMITS = Object.freeze({
  // Only retained, incomplete input is bounded by this value. Complete key and
  // text events are decoded before the retained-tail check is applied.
  inputBufferBytes: 64 * 1024,
  escapeSequenceBytes: 1024,
  pasteBytes: 1024 * 1024,

  // Rendering and application-owned structures are unlimited by default.
  // Applications can opt into operational caps when their workload needs them.
  renderedTextBytes: Infinity,
  renderedLines: Infinity,
  syntaxTokens: Infinity,
  pointerRegions: Infinity,

  // Native clipboard backends accept normal platform-sized clipboard content.
  // OSC 52 remains bounded because the payload is written into the terminal.
  nativeClipboardBytes: Infinity,
  osc52Bytes: 1024 * 1024,
  clipboardBytes: 1024 * 1024, // Deprecated alias for osc52Bytes.

  // Session file size remains a corruption/availability guard. Message count
  // and object depth are opt-in operational limits rather than security rules.
  sessionBytes: 16 * 1024 * 1024,
  sessionMessages: Infinity,
  sessionDepth: Infinity,
  hyperlinkBytes: 2048,
});

export class TerlioLimitError extends Error {
  constructor(resource, limit, actual) {
    super(`Terlio limit exceeded: ${resource} (${actual} > ${limit})`);
    this.name = 'TerlioLimitError';
    this.code = 'TERLIO_LIMIT_EXCEEDED';
    this.resource = String(resource ?? 'unknown');
    this.limit = Number(limit);
    this.actual = Number(actual);
  }
}

export function createLimitError(resource, limit, actual) {
  return new TerlioLimitError(resource, limit, actual);
}

export function normalizeSecurityLimits(limits = {}) {
  const source = limits && typeof limits === 'object' ? { ...limits } : {};
  if (source.osc52Bytes === undefined && source.clipboardBytes !== undefined) {
    source.osc52Bytes = source.clipboardBytes;
  }
  if (source.clipboardBytes === undefined && source.osc52Bytes !== undefined) {
    source.clipboardBytes = source.osc52Bytes;
  }

  const output = {};
  for (const [name, fallback] of Object.entries(DEFAULT_SECURITY_LIMITS)) {
    output[name] = normalizeLimit(source[name], fallback);
  }
  // Keep the legacy alias synchronized. Native clipboard limits are separate.
  output.clipboardBytes = output.osc52Bytes;

  for (const [name, value] of Object.entries(source)) {
    if (name in output) continue;
    output[name] = normalizeLimit(value, Infinity);
  }
  return Object.freeze(output);
}

export function mergeSecurityLimits(base = DEFAULT_SECURITY_LIMITS, overrides = null) {
  const merged = { ...(base ?? {}), ...(overrides ?? {}) };
  if (overrides && typeof overrides === 'object') {
    if (overrides.osc52Bytes === undefined && overrides.clipboardBytes !== undefined) {
      merged.osc52Bytes = overrides.clipboardBytes;
    }
    if (overrides.clipboardBytes === undefined && overrides.osc52Bytes !== undefined) {
      merged.clipboardBytes = overrides.osc52Bytes;
    }
  }
  return normalizeSecurityLimits(merged);
}

export function enforceLimit(resource, actual, limit) {
  const normalizedActual = Math.max(0, Number(actual) || 0);
  if (limit === Infinity || normalizedActual <= limit) return normalizedActual;
  throw createLimitError(resource, limit, normalizedActual);
}

export function utf8ByteLength(value) {
  return Buffer.byteLength(String(value ?? ''), 'utf8');
}

export function truncateUtf8(value, byteLimit) {
  const text = String(value ?? '');
  if (byteLimit === Infinity || utf8ByteLength(text) <= byteLimit) return text;
  const limit = Math.max(0, Math.floor(Number(byteLimit) || 0));
  let output = '';
  let bytes = 0;
  for (const char of text) {
    const size = utf8ByteLength(char);
    if (bytes + size > limit) break;
    output += char;
    bytes += size;
  }
  return output;
}

function normalizeLimit(value, fallback) {
  if (value === Infinity) return Infinity;
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.floor(number);
}
