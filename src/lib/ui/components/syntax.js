import { highlightSyntaxLines } from '../../syntaxHighlight.js';
import { Column, Text } from '../node.js';

export function SyntaxText({
  code = '',
  language = '',
  filename = '',
  theme = {},
  enabled = true,
  wrap = false,
} = {}) {
  const lines = highlightSyntaxLines(code, { language, filename, theme, enabled });
  return Column({}, ...lines.map((line) => Text(line, { wrap })));
}
