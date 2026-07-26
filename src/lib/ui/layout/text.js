import { sanitizeTerminalText } from '../../terminal/controlParser.js';
import { applyUnicodeSecurity, normalizeUnicodeSecurity } from '../../unicodeSecurity.js';
import { enforceLimit, utf8ByteLength } from '../../securityLimits.js';
import { createLayoutResult } from './result.js';
import { fit, wrapPlain } from './utils.js';

export function renderText(node, width, policy) {
  const unsafeRaw = node.props.value?.type === 'unsafe-raw';
  const source = unsafeRaw ? node.props.value.value : node.props.value;
  enforceLimit('renderedTextBytes', utf8ByteLength(source), policy.limits.renderedTextBytes);
  const policyUnicode = ['normal', 'legacy'].includes(policy.unicodeControls)
    ? undefined
    : policy.unicodeControls;
  const unicodeMode = normalizeUnicodeSecurity(
    node.props.unicodeSecurity ?? policyUnicode,
    node.props.contentKind,
  );
  const unicodeSafe = unsafeRaw
    ? String(source ?? '')
    : applyUnicodeSecurity(source, { mode: unicodeMode, contentKind: node.props.contentKind });
  const value = policy.mode === 'trusted'
    ? unicodeSafe.replace(/\r\n?/g, '\n')
    : sanitizeTerminalText(unicodeSafe, {
      blockedControlRendering: policy.blockedControlRendering,
      allowSgr: !unsafeRaw,
    });
  const wrap = node.props.wrap !== false;
  if (!wrap) return createLayoutResult(value.split('\n').map((line) => fit(line, width)));
  return createLayoutResult(wrapPlain(value, width).map((line) => fit(line, width)));
}
