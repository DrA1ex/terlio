import { Panel, Text } from './node.js';

export function Timeline({ title = ' Timeline ', events = [], limit = 8, getLine = defaultTimelineLine } = {}) {
  const rows = events.slice(0, Math.max(1, Number(limit) || 1)).map((event) => Text(getLine(event)));
  return Panel(title, ...(rows.length ? rows : [Text('No timeline events yet.')]));
}

export function createTimelineEvent({ type = 'system_event', text = '', actor = 'system', time = null, id = null, meta = {} } = {}) {
  const date = time instanceof Date ? time : new Date(time ?? Date.now());
  return {
    id: id ?? `evt_${date.getTime()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    actor,
    text: String(text ?? ''),
    time: date.toISOString(),
    meta,
  };
}

export function formatTimelineTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toTimeString().slice(0, 5);
}

function defaultTimelineLine(event) {
  const type = String(event.type ?? 'event').replaceAll('_', ' ');
  return `${formatTimelineTime(event.time)}  ${type.padEnd(14)} ${event.text ?? ''}`;
}
