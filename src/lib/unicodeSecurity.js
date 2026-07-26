const MODES = new Set(['normal', 'visible-controls', 'code-safe']);
const CODE_SAFE_KINDS = new Set(['code', 'diff', 'filename', 'command', 'security-log', 'security', 'log']);

// These characters can change the visual order or direction of source-like
// text. Exposing them in code-safe views addresses the spoofing risk without
// breaking legitimate ZWJ/ZWNJ use in emoji and natural-language scripts.
const BIDI_CODE_POINTS = new Set([
  0x061c,
  0x200e,
  0x200f,
  0x202a,
  0x202b,
  0x202c,
  0x202d,
  0x202e,
  0x2066,
  0x2067,
  0x2068,
  0x2069,
]);

const INVISIBLE_FORMAT_CODE_POINTS = new Set([
  0x00ad,
  0x180e,
  0x200b,
  0x200c,
  0x200d,
  0x2060,
  0x2061,
  0x2062,
  0x2063,
  0x2064,
  0xfeff,
]);

export function normalizeUnicodeSecurity(value, contentKind = '') {
  if (MODES.has(value)) return value;
  return CODE_SAFE_KINDS.has(String(contentKind ?? '').toLowerCase()) ? 'code-safe' : 'normal';
}

export function applyUnicodeSecurity(value, {
  mode = 'normal',
  contentKind = '',
} = {}) {
  const normalizedMode = normalizeUnicodeSecurity(mode, contentKind);
  const text = String(value ?? '');
  if (normalizedMode === 'normal') return text;

  let output = '';
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;
    if (shouldExpose(codePoint, normalizedMode)) output += visibleCodePoint(codePoint);
    else output += char;
  }
  return output;
}

export function visibleCodePoint(codePoint) {
  return `⟦U+${Number(codePoint).toString(16).toUpperCase().padStart(4, '0')}⟧`;
}

function shouldExpose(codePoint, mode) {
  if (BIDI_CODE_POINTS.has(codePoint)) return true;
  if (mode !== 'visible-controls') return false;
  if (INVISIBLE_FORMAT_CODE_POINTS.has(codePoint)) return true;
  return codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f);
}
