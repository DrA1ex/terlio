import { Box, Column, Row, Text } from './node.js';
import { visibleLength } from '../ansi/text.js';
import { ProgressBar, Spinner } from './components/index.js';

export function MetricBlock({ title = ' Metric ', value = '', detail = '', status = '', pulse = false } = {}) {
  const prefix = pulse ? '● ' : '';
  return Box({ border: true, padding: { left: 1, right: 1 }, title },
    Text(`${prefix}${value}`),
    detail ? Text(detail) : null,
    status ? Text(status) : null,
  );
}

export function KeyValueBlock({ title = ' Details ', rows = [] } = {}) {
  const rendered = rows.map(([key, value]) => {
    const label = String(key);
    const width = 13;
    const padding = ' '.repeat(Math.max(1, width - visibleLength(label)));
    return Text(`${label}${padding}${value ?? ''}`);
  });
  return Box({ border: true, padding: { left: 1, right: 1 }, title }, ...(rendered.length ? rendered : [Text('No details.')]));
}

export function LiveJobBlock({ title = ' Job ', status = 'idle', steps = [], activeIndex = 0, progress = 0, frame = 0, running = status === 'running' } = {}) {
  const rows = steps.map((step, index) => {
    const marker = index < activeIndex ? '✓' : index === activeIndex && running ? '…' : '·';
    return Text(`${marker} ${step}`);
  });
  const statusIcon = running ? Spinner({ frame, label: status }) : Text(`${statusGlyph(status)} ${status}`);
  return Box({ border: true, padding: { left: 1, right: 1 }, title },
    Row({ gap: 2 }, statusIcon, ProgressBar({ value: progress, total: 100, width: 18 })),
    Column(...rows),
  );
}

function statusGlyph(status) {
  if (status === 'completed') return '✓';
  if (status === 'paused') return 'Ⅱ';
  if (status === 'failed' || status === 'error') return '×';
  return '·';
}
