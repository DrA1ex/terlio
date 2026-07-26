import { highlightSyntaxLines } from '../../syntaxHighlight.js';
import { applyUnicodeSecurity } from '../../unicodeSecurity.js';
import { Column, Text } from '../node.js';

export function SyntaxText({
  code = '',
  language = '',
  filename = '',
  theme = {},
  enabled = true,
  wrap = false,
  unicodeSecurity = 'code-safe',
  securityLimits = null,
} = {}) {
  const safeCode = applyUnicodeSecurity(code, { mode: unicodeSecurity, contentKind: 'code' });
  const lines = highlightSyntaxLines(safeCode, {
    language,
    filename,
    theme,
    enabled,
    securityLimits,
  });
  return Column({}, ...lines.map((line) => Text(line, { wrap, unicodeSecurity: 'normal' })));
}
