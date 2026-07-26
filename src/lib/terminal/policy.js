import { DEFAULT_SECURITY_LIMITS, mergeSecurityLimits, normalizeSecurityLimits } from '../securityLimits.js';

export const DEFAULT_TERMINAL_LIMITS = DEFAULT_SECURITY_LIMITS;

const MODES = new Set(['safe', 'trusted']);
const BLOCKED_CONTROL_RENDERING = new Set(['remove', 'visible']);
const CLIPBOARD_POLICIES = new Set(['disabled', 'native', 'osc52', 'auto', 'legacy']);
const UNICODE_POLICIES = new Set(['normal', 'visible-controls', 'code-safe', 'legacy']);
const CREATED_POLICIES = new WeakSet();

export function createTerminalPolicy(options = {}) {
  const source = normalizePolicySource(options);
  const mode = MODES.has(source.mode) ? source.mode : 'safe';
  const policy = Object.freeze({
    mode,
    hyperlinks: normalizeHyperlinkPolicy(source.hyperlinks),
    clipboard: normalizeClipboardPolicy(source.clipboard),
    unicodeControls: normalizeUnicodePolicy(source.unicodeControls),
    blockedControlRendering: BLOCKED_CONTROL_RENDERING.has(source.blockedControlRendering)
      ? source.blockedControlRendering
      : 'visible',
    limits: normalizeSecurityLimits(source.limits),
  });
  CREATED_POLICIES.add(policy);
  return policy;
}

export function normalizeTerminalPolicy(policy) {
  if (policy && typeof policy === 'object' && CREATED_POLICIES.has(policy)) return policy;
  return createTerminalPolicy(policy);
}

export function withSecurityLimits(policy, overrides = null) {
  const normalized = normalizeTerminalPolicy(policy);
  if (!overrides || typeof overrides !== 'object') return normalized;
  return Object.freeze({
    ...normalized,
    limits: mergeSecurityLimits(normalized.limits, overrides),
  });
}

function normalizePolicySource(options) {
  if (typeof options === 'string') return { mode: options };
  return options && typeof options === 'object' ? options : {};
}

function normalizeHyperlinkPolicy(value) {
  if (value === 'legacy') return 'legacy';
  if (value === 'disabled' || value == null) return 'disabled';
  if (!value || typeof value !== 'object' || value.enabled !== true) return 'disabled';
  const schemes = Array.from(value.schemes ?? ['https'])
    .map((scheme) => String(scheme ?? '').toLowerCase())
    .filter((scheme) => /^[a-z][a-z0-9+.-]*$/u.test(scheme));
  return Object.freeze({ enabled: true, schemes: Object.freeze(schemes.length ? schemes : ['https']) });
}

function normalizeClipboardPolicy(value) {
  return CLIPBOARD_POLICIES.has(value) ? value : 'native';
}

function normalizeUnicodePolicy(value) {
  return UNICODE_POLICIES.has(value) ? value : 'normal';
}
