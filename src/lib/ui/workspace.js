import { color } from '../ansi/text.js';
import { Box, Column, Row, Text, createNode } from './node.js';
import { CommandBar, FooterStatusBar, Grid, SectionTabs, fitInline } from './components/index.js';
import { measureNodeHeight } from './layout/index.js';
import { Docked } from './layout/docked.js';

export function WorkspaceHeader({
  title = 'Workspace',
  subtitle = '',
  stats = [],
  right = [],
  focus = '',
  theme = null,
} = {}) {
  const left = [title, subtitle].filter(Boolean).join('  ·  ');
  const statLine = stats.length ? stats.map((item) => formatHeaderItem(item)).join('   ') : '';
  const rightLine = right.length ? right.map((item) => formatHeaderItem(item)).join('   ') : '';
  const meta = [statLine, rightLine, focus ? `Focus ${focus}` : ''].filter(Boolean).join('   │   ');
  return Box({ border: true, borderColor: theme?.border, padding: { left: 1, right: 1 }, title: ` ${title} ` },
    Text(theme ? color(theme, 'title', left) : left, { wrap: false }),
    Text(theme ? color(theme, 'muted', meta) : meta, { wrap: false }),
  );
}

export function WorkspaceTabs({ tabs = [], active = '', title = ' NAV ', hint = '[/] command · Ctrl+P palette · ? help', theme = null } = {}) {
  return Box({ border: true, borderColor: theme?.border, padding: { left: 1, right: 1 }, title },
    SectionTabs({ tabs, active, gap: 3, theme }),
    hint ? Text(theme ? color(theme, 'muted', hint) : hint, { wrap: false }) : null,
  );
}

export function WorkspacePane({
  title = ' Pane ',
  active = false,
  height = undefined,
  children = [],
  footer = '',
  footerNode = null,
  footerGap = 0,
  footerMinHeight = undefined,
  footerMaxHeight = Infinity,
  borderColor = '',
  theme = null,
} = {}) {
  const nodes = normalizeChildren(children);
  const inactiveBorder = borderColor || theme?.border || '';
  const activeBorder = borderColor || theme?.accent || '\x1b[36m';
  const renderedFooter = footerNode ?? (footer ? Text(theme ? color(theme, 'muted', footer) : footer, { wrap: false }) : null);
  let bodyNodes = nodes;

  if (renderedFooter) {
    if (height !== undefined) {
      const innerHeight = Math.max(0, Number(height) - 2);
      const contentNode = nodes.length === 1 ? nodes[0] : Column({}, ...nodes);
      const defaultFooterMinHeight = footerNode?.type === 'keyHintBar' ? 3 : 1;
      bodyNodes = [Docked({
        height: innerHeight,
        content: contentNode,
        footer: renderedFooter,
        gap: footerGap,
        footerMinHeight: footerMinHeight ?? defaultFooterMinHeight,
        footerMaxHeight,
      })];
    } else {
      bodyNodes = [...nodes, renderedFooter];
    }
  }

  return Box({
    border: true,
    borderColor: active ? activeBorder : inactiveBorder,
    padding: { left: 1, right: 1 },
    title,
    ...(height !== undefined ? { height } : {}),
  }, ...bodyNodes);
}

export function KeyHintBar({
  title = ' Keys ',
  hints = [],
  columns = 3,
  minColumnWidth = 22,
  maxColumns = 3,
  gap = 2,
  theme = null,
  borderColor = '',
  height = undefined,
  gridBorder = false,
  adaptive = false,
} = {}) {
  const items = Array.from(hints ?? []);
  if (!adaptive) {
    return Box({
      border: true,
      borderColor: borderColor || theme?.border,
      padding: { left: 1, right: 1 },
      title,
      ...(height !== undefined ? { height } : {}),
    },
    items.length
      ? Grid({
          items,
          columns,
          gap,
          border: gridBorder,
          borderColor: theme?.border,
          renderItem: ([key, label]) => {
            const keyText = theme ? color(theme, 'accent', key) : key;
            const labelText = theme ? color(theme, 'muted', label) : label;
            return `${keyText} ${labelText}`;
          },
        })
      : Text(theme ? color(theme, 'muted', 'No shortcuts registered.') : 'No shortcuts registered.', { wrap: false }));
  }
  return createNode('keyHintBar', {
    title,
    hints: items,
    columns,
    minColumnWidth,
    maxColumns,
    gap,
    theme,
    borderColor,
    height,
  }, []);
}

export function WorkspaceCommandBar({ value = '', suggestions = [], mode = 'COMMAND', hint = 'TAB next', prompt = '›', theme = null } = {}) {
  return CommandBar({ value, suggestions, mode, hint, prompt, theme });
}

export function WorkspaceFooter({ left = [], right = [], theme = null } = {}) {
  return Box({ border: true, borderColor: theme?.border, padding: { left: 1, right: 1 }, title: ' STATUS ' },
    FooterStatusBar({ left, right, theme }),
  );
}


export function resolveWorkspaceShellLayout({
  width = 80,
  height = 24,
  title = 'Workspace',
  subtitle = '',
  stats = [],
  right = [],
  focus = '',
  tabs = [],
  activeTab = '',
  tabHint = '',
  command = null,
  activity = null,
  footer = null,
  theme = null,
  minMainHeight = 1,
} = {}) {
  const safeWidth = Math.max(1, Number(width) || 80);
  const safeHeight = Math.max(0, Number(height) || 0);
  const fixedNodes = [
    WorkspaceHeader({ title, subtitle, stats, right, focus, theme }),
    tabs.length ? WorkspaceTabs({ tabs, active: activeTab, hint: tabHint, theme }) : null,
    command,
    activity,
    footer,
  ].filter(Boolean);
  const fixedRows = fixedNodes.reduce((sum, node) => sum + measureNodeHeight(node, safeWidth), 0);
  const remainingRows = Math.max(0, safeHeight - fixedRows);
  const mainHeight = Math.max(1, remainingRows || Math.min(Math.max(1, Number(minMainHeight) || 1), safeHeight || 1));
  return {
    mainHeight,
    fixedRows,
    remainingRows,
    constrained: remainingRows < Math.max(1, Number(minMainHeight) || 1),
  };
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
  theme = null,
} = {}) {
  const themedMain = theme ? applyThemeToBorders(main, theme) : main;
  const themedCommand = theme ? applyThemeToBorders(command, theme) : command;
  const themedActivity = theme ? applyThemeToBorders(activity, theme) : activity;
  const themedFooter = theme ? applyThemeToBorders(footer, theme) : footer;
  const children = [
    WorkspaceHeader({ title, subtitle, stats, right, focus, theme }),
    tabs.length ? WorkspaceTabs({ tabs, active: activeTab, hint: tabHint, theme }) : null,
    themedMain ? withGrow(themedMain) : WorkspacePane({ title: ' Main ', active: true, theme, children: [Text('No main content.')] }),
    themedCommand,
    themedActivity,
    themedFooter,
  ].filter(Boolean);
  return Column({ ...(height !== undefined ? { height } : {}) }, ...children);
}


function applyThemeToBorders(node, theme) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((item) => applyThemeToBorders(item, theme));
  if (!node.type) return node;
  const children = Array.isArray(node.children) ? node.children.map((child) => applyThemeToBorders(child, theme)) : node.children;
  const props = { ...(node.props || {}) };
  if (node.type === 'box' && props.border) {
    if (!props.borderColor) props.borderColor = theme.border;
    else if (props.borderColor === '\x1b[36m') props.borderColor = theme.accent;
  }
  return { ...node, props, children };
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

