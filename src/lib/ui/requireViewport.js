import { Box, Column, Text } from './node.js';
import { color } from '../ansi/text.js';

export function RequireViewport({ width = 80, height = 24, minWidth = 80, minHeight = 24, title = 'Viewport required', message = 'Resize the terminal to continue.', theme = null, children = null } = {}) {
  const ok = Number(width) >= Number(minWidth) && Number(height) >= Number(minHeight);
  if (ok) return children ?? Text('');
  return Column({ height: Math.max(1, Number(height) || 1) },
    Box({ border: true, borderColor: theme?.borderDanger ?? theme?.danger ?? theme?.error ?? theme?.border, padding: { left: 2, right: 2, top: 1, bottom: 1 }, title: ` ${title} ` },
      Text(theme ? color(theme, 'textAccent', message) : message),
      Text(theme ? color(theme, 'textMuted', `Current ${width}×${height}; minimum ${minWidth}×${minHeight}.`) : `Current ${width}×${height}; minimum ${minWidth}×${minHeight}.`),
    ),
  );
}
