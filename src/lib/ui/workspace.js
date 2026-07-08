import { Box, Column, Row, Text } from './node.js';
import { CommandBar, FooterStatusBar, SectionTabs, fitInline } from './components.js';

export function WorkspaceHeader({
  title = 'Workspace',
  subtitle = '',
  stats = [],
  right = [],
  focus = '',
} = {}) {
  const left = [title, subtitle].filter(Boolean).join('  ·  ');
  const statLine = stats.length ? stats.map((item) => formatHeaderItem(item)).join('   ') : '';
  const rightLine = right.length ? right.map((item) => formatHeaderItem(item)).join('   ') : '';
  return Box({ border: true, padding: { left: 1, right: 1 }, title: ` ${title} ` },
    Text(left, { wrap: false }),
    Text([statLine, rightLine, focus ? `Focus ${focus}` : ''].filter(Boolean).join('   │   '), { wrap: false }),
  );
}

export function WorkspaceTabs({ tabs = [], active = '', title = ' NAV ', hint = '[/] command · Ctrl+P palette · ? help' } = {}) {
  return Box({ border: true, padding: { left: 1, right: 1 }, title },
    SectionTabs({ tabs, active, gap: 3 }),
    hint ? Text(hint, { wrap: false }) : null,
  );
}

export function WorkspacePane({
  title = ' Pane ',
  active = false,
  height = undefined,
  children = [],
  footer = '',
  borderColor = '',
} = {}) {
  const nodes = normalizeChildren(children);
  if (footer) nodes.push(Text(footer, { wrap: false }));
  return Box({
    border: true,
    borderColor: active ? (borderColor || '\x1b[36m') : borderColor,
    padding: { left: 1, right: 1 },
    title,
    ...(height !== undefined ? { height } : {}),
  }, ...nodes);
}

export function KeyHintBar({ title = ' Keys ', hints = [] } = {}) {
  const rows = chunk(hints, 3).map((items) => items.map(([key, label]) => `${key} ${label}`).join('   │   '));
  return Box({ border: true, padding: { left: 1, right: 1 }, title },
    ...(rows.length ? rows.map((line) => Text(line, { wrap: false })) : [Text('No shortcuts registered.', { wrap: false })]),
  );
}

export function WorkspaceCommandBar({ value = '', suggestions = [], mode = 'COMMAND', hint = 'TAB next', prompt = '›' } = {}) {
  return CommandBar({ value, suggestions, mode, hint, prompt });
}

export function WorkspaceFooter({ left = [], right = [] } = {}) {
  return Box({ border: true, padding: { left: 1, right: 1 }, title: ' STATUS ' },
    FooterStatusBar({ left, right }),
  );
}

export function WorkspaceShell({
  title = 'Workspace',
  subtitle = '',
  stats = [],
  right = [],
  focus = '',
  tabs = [],
  activeTab = '',
  tabHint = '',
  main = null,
  command = null,
  activity = null,
  footer = null,
  height = undefined,
} = {}) {
  const children = [
    WorkspaceHeader({ title, subtitle, stats, right, focus }),
    tabs.length ? WorkspaceTabs({ tabs, active: activeTab, hint: tabHint }) : null,
    main ? withGrow(main) : WorkspacePane({ title: ' Main ', active: true, children: [Text('No main content.')] }),
    command,
    activity,
    footer,
  ].filter(Boolean);
  return Column({ ...(height !== undefined ? { height } : {}) }, ...children);
}

export function splitWorkspaceColumns(width, mode = 'auto') {
  const safeWidth = Math.max(40, Number(width) || 80);
  const resolved = mode === 'auto'
    ? safeWidth >= 160 ? 'wide' : safeWidth >= 112 ? 'medium' : 'narrow'
    : mode;
  if (resolved === 'wide') {
    const available = safeWidth - 4;
    const left = Math.max(30, Math.floor(available * 0.27));
    const right = Math.max(28, Math.floor(available * 0.24));
    return { mode: resolved, widths: [left, Math.max(40, available - left - right), right] };
  }
  if (resolved === 'medium') {
    const available = safeWidth - 2;
    const left = Math.max(30, Math.floor(available * 0.34));
    return { mode: resolved, widths: [left, Math.max(40, available - left)] };
  }
  return { mode: resolved, widths: [safeWidth] };
}

export function SummaryList({ title = ' Summary ', items = [], selectedIndex = -1, emptyText = 'No items.' } = {}) {
  const rows = items.length ? items.map((item, index) => Text(`${index === selectedIndex ? '›' : ' '} ${fitInline(formatSummaryItem(item), 90)}`, { wrap: false })) : [Text(emptyText)];
  return WorkspacePane({ title, children: rows });
}

function withGrow(node) {
  if (!node || typeof node !== 'object' || !node.type) return node;
  return { ...node, props: { ...node.props, grow: true, height: 'fill' } };
}

function formatHeaderItem(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return String(item ?? '');
  const label = item.label ?? item.key ?? '';
  const value = item.value ?? item.text ?? '';
  return label ? `${label}: ${value}` : String(value);
}

function formatSummaryItem(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return String(item ?? '');
  return [item.title ?? item.label ?? item.id, item.description ?? item.detail].filter(Boolean).join(' — ');
}

function normalizeChildren(children) {
  const list = Array.isArray(children) ? children : [children];
  return list.flat(Infinity)
    .filter((item) => item !== null && item !== undefined && item !== false)
    .map((item) => typeof item === 'string' || typeof item === 'number' ? Text(String(item)) : item);
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}
