import { themes, visibleLength, fitInline } from '../src/lib/index.js';

export const EXAMPLE_THEME = themes.ocean;

export function workspaceMainHeight(height = 28, {
  min = 6,
  activityRows = 2,
  headerRows = 4,
  tabsRows = 4,
  commandRows = 4,
  footerRows = 3,
} = {}) {
  const activity = activityRows > 0 ? activityRows + 2 : 0;
  return Math.max(min, Math.max(0, Number(height) || 0) - headerRows - tabsRows - commandRows - activity - footerRows);
}

export function responsiveTabs(tabs = [], activeTab = '', width = 80, { pinned = [] } = {}) {
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  if (!active) return [];
  const available = Math.max(8, (Number(width) || 80) - 6);
  if (tabsLineWidth(tabs) <= available) return tabs;

  const selected = [];
  for (const id of pinned) {
    const tab = tabs.find((item) => item.id === id);
    if (tab && !selected.some((item) => item.id === tab.id)) selected.push(tab);
  }
  if (!selected.some((item) => item.id === active.id)) selected.push(active);

  while (selected.length > 1 && tabsLineWidth(selected) > available) {
    const removable = selected.findIndex((tab) => tab.id !== active.id && !pinned.includes(tab.id));
    if (removable < 0) return [active];
    selected.splice(removable, 1);
  }
  if (tabsLineWidth(selected) > available) return [active];

  const activeIndex = tabs.findIndex((tab) => tab.id === active.id);
  const candidates = [];
  for (let offset = 1; offset < tabs.length; offset += 1) {
    const right = tabs[activeIndex + offset];
    const left = tabs[activeIndex - offset];
    if (right) candidates.push(right);
    if (left) candidates.push(left);
  }
  for (const tab of candidates) {
    if (selected.some((item) => item.id === tab.id)) continue;
    const next = sortTabsByOriginalOrder([...selected, tab], tabs);
    if (tabsLineWidth(next) <= available) selected.splice(0, selected.length, ...next);
  }

  return sortTabsByOriginalOrder(selected, tabs);
}

export function responsiveTabHint(base, tabs = [], visibleTabs = []) {
  const hidden = Math.max(0, tabs.length - visibleTabs.length);
  if (!hidden) return base;
  return `${base} · ${hidden} tab${hidden === 1 ? '' : 's'} hidden at this width`;
}

export function cycleTab(state, tabs = [], delta = 1, { statusPrefix = 'Opened' } = {}) {
  if (!tabs.length) return;
  const ids = tabs.map((tab) => tab.id);
  const index = Math.max(0, ids.indexOf(state.activeTab));
  state.activeTab = ids[((index + delta) % ids.length + ids.length) % ids.length];
  if ('status' in state) state.status = `${statusPrefix} ${state.activeTab}.`;
}

function tabsLineWidth(tabs) {
  if (!tabs.length) return 0;
  return tabs.reduce((sum, tab, index) => sum + visibleLength(`▣ ${tab.icon ? `${tab.icon} ` : ''}${tab.label ?? tab.id}`) + (index ? 3 : 0), 0);
}

function sortTabsByOriginalOrder(items, tabs) {
  const order = new Map(tabs.map((tab, index) => [tab.id, index]));
  return [...items].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export function scrollOffset(current = 0, delta = 0, totalRows = 0, visibleRows = 1) {
  const max = Math.max(0, Number(totalRows) - Math.max(1, Number(visibleRows) || 1));
  return Math.max(0, Math.min(max, (Number(current) || 0) + (Number(delta) || 0)));
}

export function wheelScrollDelta(event, step = 1) {
  const delta = Number(event?.deltaY) || 0;
  if (!delta) return 0;
  return (delta < 0 ? -1 : 1) * Math.max(1, Number(step) || 1);
}

export function isShiftLineScroll(key) {
  return Boolean(key?.shift && (key.name === 'up' || key.name === 'down'));
}

export function shiftLineScrollDelta(key) {
  if (!isShiftLineScroll(key)) return 0;
  return key.name === 'up' ? -1 : 1;
}

export function scrollToVisible(current = 0, index = 0, visibleRows = 1, totalRows = 0) {
  const safeVisible = Math.max(1, Number(visibleRows) || 1);
  const safeIndex = Math.max(0, Number(index) || 0);
  const max = Math.max(0, Number(totalRows) - safeVisible);
  if (safeIndex < current) return Math.max(0, Math.min(max, safeIndex));
  if (safeIndex >= current + safeVisible) return Math.max(0, Math.min(max, safeIndex - safeVisible + 1));
  return Math.max(0, Math.min(max, Number(current) || 0));
}

export function visibleScrollableRows(lines = [], { scroll = 0, height = 8, width = 80, footer = true, footerLabel = 'PgUp/PgDn scroll' } = {}) {
  const safeLines = Array.from(lines, (line) => String(line ?? ''));
  const footerRows = footer ? 1 : 0;
  const visibleHeight = Math.max(1, (Number(height) || 1) - footerRows);
  const maxScroll = Math.max(0, safeLines.length - visibleHeight);
  const safeScroll = Math.max(0, Math.min(maxScroll, Number(scroll) || 0));
  const rows = safeLines.slice(safeScroll, safeScroll + visibleHeight);
  while (rows.length < visibleHeight) rows.push('');
  const fitted = rows.map((line) => fitInline(line, Math.max(1, width)));
  if (footer) {
    const end = safeLines.length ? Math.min(safeLines.length, safeScroll + visibleHeight) : 0;
    const range = safeLines.length ? `${safeScroll + 1}-${end}/${safeLines.length}` : '0/0';
    fitted.push(fitInline(`${footerLabel} · ${range}`, Math.max(1, width)));
  }
  return { rows: fitted, scroll: safeScroll, maxScroll };
}
