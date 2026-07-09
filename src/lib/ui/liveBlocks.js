import { Box, Column, Row, Text } from './node.js';
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
  const rendered = rows.map(([key, value]) => Text(`${String(key).padEnd(13)} ${value ?? ''}`));
  return Box({ border: true, padding: { left: 1, right: 1 }, title }, ...(rendered.length ? rendered : [Text('No details.')]));
}

export function LiveJobBlock({ title = ' Job ', status = 'idle', steps = [], activeIndex = 0, progress = 0, frame = 0 } = {}) {
  const rows = steps.map((step, index) => {
    const marker = index < activeIndex ? '✓' : index === activeIndex && status === 'running' ? '…' : '·';
    return Text(`${marker} ${step}`);
  });
  return Box({ border: true, padding: { left: 1, right: 1 }, title },
    Row({ gap: 2 }, Spinner({ frame, label: status }), ProgressBar({ value: progress, total: 100, width: 18 })),
    Column(...rows),
  );
}
