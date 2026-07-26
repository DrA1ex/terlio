import { Box, Column, Row, Text } from './node.js';
import { visibleLength } from '../ansi/text.js';
import { ProgressBar, ProgressStatus, Spinner } from './components/index.js';
import { isProgressController, progressSnapshot } from '../progressStatus.js';

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

export function LiveJobBlock({
  title = ' Job ',
  status = null,
  steps = [],
  activeIndex = 0,
  progress = 0,
  frame = 0,
  running = null,
  progressVariant = 'compact',
  showProgressDetails = false,
} = {}) {
  const snapshot = progressSnapshot(progress, { total: 100, state: status ?? 'idle' });
  const effectiveStatus = status ?? snapshot.state;
  const effectiveRunning = running ?? effectiveStatus === 'running';
  const rows = steps.map((step, index) => {
    const marker = index < activeIndex ? '✓' : index === activeIndex && effectiveRunning ? '…' : '·';
    return Text(`${marker} ${step}`);
  });
  const statusIcon = effectiveRunning ? Spinner({ frame, label: effectiveStatus }) : Text(`${statusGlyph(effectiveStatus)} ${effectiveStatus}`);
  const progressNode = showProgressDetails && isProgressController(progress)
    ? ProgressStatus({
      progress,
      width: 18,
      variant: progressVariant,
      frame,
      showState: false,
      showValue: true,
      showRate: true,
      showElapsed: true,
      showEta: true,
    })
    : ProgressBar({ value: snapshot.value, total: snapshot.total, width: 18, grow: true, variant: progressVariant });
  return Box({ border: true, padding: { left: 1, right: 1 }, title },
    showProgressDetails && isProgressController(progress)
      ? Column({ gap: 0 }, statusIcon, progressNode)
      : Row({ gap: 2 }, statusIcon, progressNode),
    Column(...rows),
  );
}

function statusGlyph(status) {
  if (status === 'completed') return '✓';
  if (status === 'paused') return 'Ⅱ';
  if (status === 'failed' || status === 'error') return '×';
  return '·';
}
