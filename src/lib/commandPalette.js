import { InputEditor, handleInputEditorKey } from './inputEditor.js';
import { Box, Column, Row, Text } from './ui/node.js';
import { HelpOverlay, renderCursorCell } from './ui/components/index.js';
import { color, truncateVisible } from './ansi/text.js';
import { createListState, getListWindow, handleListKey, updateListItems } from './listState.js';

export function createCommandPaletteState({ items = [], query = '', selectedIndex = 0, windowSize = 9, groupByCategory = true } = {}) {
  const normalized = normalizePaletteItems(items);
  return {
    items: normalized,
    editor: new InputEditor(query),
    selectedIndex: Number(selectedIndex) || 0,
    windowSize: Math.max(1, Number(windowSize) || 9),
    groupByCategory,
    status: 'Type to filter. Use arrows to move, Enter to accept, Esc to cancel.',
    list: createListState({ items: normalized, selectedIndex, windowSize, skipDisabled: false }),
  };
}

export function getCommandPaletteMatches(state) {
  const query = getPaletteQuery(state).trim();
  const items = normalizePaletteItems(state.items ?? []);
  if (!query) return items;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items
    .map((item, index) => ({ item, index, score: scorePaletteItem(item, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

export function getPaletteQuery(state) {
  if (state?.editor instanceof InputEditor) return state.editor.value;
  return String(state?.query ?? '');
}

export function handleCommandPaletteKey(state, key) {
  ensureEditor(state);
  const matchesBefore = getCommandPaletteMatches(state);
  syncPaletteList(state, matchesBefore);

  if (key.name === 'escape') {
    if (state.editor.value) {
      state.editor.clear();
      state.selectedIndex = 0;
      state.status = 'Filter cleared.';
      syncPaletteList(state, getCommandPaletteMatches(state));
      return { type: 'clear' };
    }
    return { type: 'cancel' };
  }

  if (key.name === 'enter') {
    const matches = getCommandPaletteMatches(state);
    syncPaletteList(state, matches);
    const item = matches[state.selectedIndex] ?? null;
    if (!item) {
      state.status = 'Nothing to accept.';
      return { type: 'noop' };
    }
    if (item.disabled) {
      state.status = `${item.id} is disabled.`;
      return { type: 'disabled', item };
    }
    state.status = `Accepted ${item.id}.`;
    return { type: 'accept', item };
  }

  if (['up', 'down', 'page-up', 'page-down', 'home', 'end'].includes(key.name)) {
    const result = handleListKey(state.list, key);
    state.selectedIndex = state.list.selectedIndex;
    state.status = result.handled ? 'Selection moved.' : state.status;
    return result.handled ? { type: 'move', item: state.list.items[state.selectedIndex] } : { type: 'noop' };
  }

  if (['left', 'right', 'backspace', 'delete', 'kill-start', 'kill-end', 'delete-word-left', 'paste'].includes(key.name) || key.printable) {
    const result = handleInputEditorKey(state.editor, key, { multiline: false });
    if (result.handled) {
      state.query = state.editor.value;
      state.selectedIndex = 0;
      syncPaletteList(state, getCommandPaletteMatches(state));
      state.status = 'Filter updated.';
      return { type: 'edit' };
    }
  }

  return { type: 'noop' };
}

export function renderCommandPalette(state, { title = ' Command Palette ', showHelp = true, theme = null, inline = true } = {}) {
  ensureEditor(state);
  const matches = getCommandPaletteMatches(state);
  syncPaletteList(state, matches);
  const query = state.editor.value;
  const list = renderPaletteList(state, matches, theme);
  const body = [
    Box({ border: true, borderColor: theme?.borderActive ?? theme?.border, padding: { left: 1, right: 1 }, title },
      Text(theme ? color(theme, 'textMuted', 'Search commands, actions, sessions, providers or skills.') : 'Search commands, actions, sessions, providers or skills.'),
      Text(`${theme ? color(theme, 'textAccent', 'Query') : 'Query'}: ${query || '<empty>'}${renderCursorCell(' ')}`, { wrap: false }),
      Text(theme ? color(theme, 'textMuted', state.status ?? '') : state.status ?? '', { wrap: false }),
    ),
    list,
  ];
  if (showHelp) {
    const selected = matches[state.selectedIndex];
    body.push(Row({ gap: 2, distribute: true },
      HelpOverlay({ title: ' Keys ', shortcuts: [['↑/↓', 'move selection'], ['PgUp/PgDn', 'jump by page'], ['Enter', 'accept'], ['Esc', 'clear/cancel']] }),
      Box({ border: true, borderColor: theme?.borderMuted ?? theme?.border, padding: 1, title: ' Selected ' },
        selected ? Text(`${selected.title}\n${selected.description}`) : Text('Nothing selected.'),
      ),
    ));
  }
  return Column(...body);
}

export function renderPaletteList(state, matches = getCommandPaletteMatches(state), theme = null) {
  const window = getListWindow(state.list);
  const rows = [];
  let lastCategory = '';
  if (window.moreAbove) rows.push(Text(theme ? color(theme, 'textMuted', `↑ ${window.moreAbove} more`) : `↑ ${window.moreAbove} more`, { wrap: false }));
  window.items.forEach((item, offset) => {
    const absolute = window.start + offset;
    const selected = absolute === state.selectedIndex;
    const category = item.category || 'General';
    if (state.groupByCategory && category !== lastCategory) {
      rows.push(Text(theme ? color(theme, 'textMuted', `─ ${category}`) : `─ ${category}`, { wrap: false }));
      lastCategory = category;
    }
    const marker = selected ? '›' : ' ';
    const disabled = item.disabled ? ' disabled' : '';
    const keys = item.keys?.length ? ` ${item.keys.join('/')}` : '';
    const label = `${marker} ${item.id.padEnd(18)} ${truncateVisible(item.title, 32).padEnd(32)}${keys}${disabled}`;
    rows.push(Text(theme ? color(theme, item.disabled ? 'textMuted' : selected ? 'selected' : 'text', label) : label, { wrap: false }));
  });
  if (window.moreBelow) rows.push(Text(theme ? color(theme, 'textMuted', `↓ ${window.moreBelow} more`) : `↓ ${window.moreBelow} more`, { wrap: false }));
  return Box({ border: true, borderColor: theme?.border ?? undefined, padding: { left: 1, right: 1 }, title: ` ${matches.length} matches ` }, rows.length ? rows : Text('No matching commands.'));
}

export function normalizePaletteItems(items) {
  return Array.from(items ?? []).map((item) => {
    if (typeof item === 'string') return { id: item, title: item, description: '', category: 'General', keywords: [], aliases: [], keys: [] };
    return {
      id: String(item.id ?? item.name ?? item.title ?? ''),
      title: String(item.title ?? item.name ?? item.id ?? ''),
      description: String(item.description ?? item.detail ?? ''),
      category: String(item.category ?? item.group ?? item.scope ?? 'General'),
      keywords: Array.isArray(item.keywords) ? item.keywords.map(String) : [],
      aliases: Array.isArray(item.aliases) ? item.aliases.map(String) : [],
      keys: Array.isArray(item.keys) ? item.keys.map(String) : item.key ? [String(item.key)] : [],
      value: item.value ?? item,
      disabled: Boolean(item.disabled),
    };
  }).filter((item) => item.id);
}

function ensureEditor(state) {
  if (!state.editor || !(state.editor instanceof InputEditor)) state.editor = new InputEditor(String(state.query ?? ''));
  state.query = state.editor.value;
  state.items = normalizePaletteItems(state.items ?? []);
  state.windowSize = Math.max(1, Number(state.windowSize) || 9);
  if (!state.list) state.list = createListState({ items: state.items, selectedIndex: state.selectedIndex, windowSize: state.windowSize, skipDisabled: false });
}

function syncPaletteList(state, matches) {
  state.selectedIndex = clamp(state.selectedIndex, 0, Math.max(0, matches.length - 1));
  updateListItems(state.list, matches);
  state.list.windowSize = state.windowSize;
  state.list.selectedIndex = state.selectedIndex;
}

function scorePaletteItem(item, terms) {
  const fields = [item.id, item.title, item.description, item.category, ...(item.keywords ?? []), ...(item.aliases ?? [])].join(' ').toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (fields.includes(term)) score += 100 + term.length;
    else {
      const fuzzy = fuzzyScore(fields, term);
      if (!fuzzy) return 0;
      score += fuzzy;
    }
  }
  if (String(item.title).toLowerCase().startsWith(terms[0] ?? '')) score += 20;
  if (String(item.id).toLowerCase().startsWith(terms[0] ?? '')) score += 10;
  return score;
}

function fuzzyScore(haystack, needle) {
  let h = 0;
  let score = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, h);
    if (found < 0) return 0;
    score += found === h ? 8 : 2;
    h = found + 1;
  }
  return score;
}

function clamp(value, min, max) {
  if (value === Number.POSITIVE_INFINITY) return max;
  return Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
}
