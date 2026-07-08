import { themes, visibleLength } from '../src/lib/index.js';

export const EXAMPLE_THEME = themes.ocean;

export function workspaceMainHeight(height = 28, { min = 6, activityRows = 2 } = {}) {
  const header = 4;
  const tabs = 4;
  const command = 4;
  const footer = 3;
  const activity = activityRows > 0 ? activityRows + 2 : 0;
  return Math.max(min, Math.max(0, Number(height) || 0) - header - tabs - command - activity - footer);
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
