import { InputEditor } from './inputEditor.js';
import { Box, Column, Row, Text } from './ui/node.js';
import { SelectList, HelpOverlay } from './ui/components/index.js';

export function createCommandPaletteState({ items = [], query = '', selectedIndex = 0, windowSize = 9 } = {}) {
  return {
    items: normalizePaletteItems(items),
    editor: new InputEditor(query),
    selectedIndex: Number(selectedIndex) || 0,
    windowSize: Math.max(1, Number(windowSize) || 9),
    status: 'Type to filter. Use arrows to move, Enter to accept, Esc to cancel.',
  };
}

export function getCommandPaletteMatches(state) {
  const terms = getPaletteQuery(state).trim().toLowerCase().split(/\s+/).filter(Boolean);
  const items = normalizePaletteItems(state.items ?? []);
  if (!terms.length) return items;

  return items.filter((item) => {
    const haystack = `${item.id} ${item.title} ${item.description} ${item.keywords.join(' ')}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function getPaletteQuery(state) {
  if (state?.editor instanceof InputEditor) return state.editor.value;
  return String(state?.query ?? '');
}

export function handleCommandPaletteKey(state, key) {
  ensureEditor(state);
  const matchesBefore = getCommandPaletteMatches(state);
  clampSelection(state, matchesBefore.length);

  if (key.name === 'escape') {
    if (state.editor.value) {
      state.editor.clear();
      state.selectedIndex = 0;
      state.status = 'Filter cleared.';
      return { type: 'clear' };
    }
    return { type: 'cancel' };
  }

  if (key.name === 'enter') {
    const matches = getCommandPaletteMatches(state);
    clampSelection(state, matches.length);
    const item = matches[state.selectedIndex] ?? null;
    state.status = item ? `Accepted ${item.id}.` : 'Nothing to accept.';
    return item ? { type: 'accept', item } : { type: 'noop' };
  }

  if (key.name === 'up') return moveSelection(state, -1);
  if (key.name === 'down') return moveSelection(state, 1);
  if (key.name === 'page-up') return moveSelection(state, -state.windowSize);
  if (key.name === 'page-down') return moveSelection(state, state.windowSize);
  if (key.name === 'home') return setSelection(state, 0);
  if (key.name === 'end') return setSelection(state, Number.POSITIVE_INFINITY);

  if (key.name === 'left') {
    key.meta ? state.editor.moveWord(-1) : state.editor.move(-1);
    return { type: 'edit' };
  }
  if (key.name === 'right') {
    key.meta ? state.editor.moveWord(1) : state.editor.move(1);
    return { type: 'edit' };
  }
  if (key.name === 'backspace') return edit(state, () => state.editor.backspace());
  if (key.name === 'delete') return edit(state, () => state.editor.deleteForward());
  if (key.name === 'kill-start') return edit(state, () => state.editor.killToStart());
  if (key.name === 'kill-end') return edit(state, () => state.editor.killToEnd());
  if (key.name === 'delete-word-left') return edit(state, () => state.editor.deleteWordBack());
  if (key.name === 'paste') return edit(state, () => state.editor.insert(key.text));

  if (key.printable) return edit(state, () => state.editor.insert(key.text));

  return { type: 'noop' };
}

export function renderCommandPalette(state, { title = ' Command Palette ', showHelp = true } = {}) {
  ensureEditor(state);
  const matches = getCommandPaletteMatches(state);
  clampSelection(state, matches.length);
  const query = state.editor.value;

  const list = SelectList({
    title: `${matches.length} matches`,
    items: matches,
    selectedIndex: state.selectedIndex,
    windowSize: state.windowSize,
    emptyText: 'No matching commands.',
    getLabel: (item) => item.id,
    getDescription: (item) => item.description || item.title,
  });

  const body = [
    Box({ border: true, padding: { left: 1, right: 1 }, title },
      Text('Search commands, actions, sessions, providers or skills.'),
      Text(`Query: ${query || '<empty>'}█`),
      Text(state.status ?? ''),
    ),
    list,
  ];

  if (showHelp) {
    body.push(Row({ gap: 2, distribute: true },
      HelpOverlay({
        title: ' Keys ',
        shortcuts: [
          ['↑/↓', 'move selection'],
          ['PgUp/PgDn', 'jump by page'],
          ['Enter', 'accept'],
          ['Esc', 'clear/cancel'],
        ],
      }),
      Box({ border: true, padding: 1, title: ' Selected ' },
        matches[state.selectedIndex]
          ? Text(`${matches[state.selectedIndex].title}\n${matches[state.selectedIndex].description}`)
          : Text('Nothing selected.'),
      ),
    ));
  }

  return Column(...body);
}

export function normalizePaletteItems(items) {
  return Array.from(items ?? []).map((item) => {
    if (typeof item === 'string') {
      return { id: item, title: item, description: '', keywords: [] };
    }
    return {
      id: String(item.id ?? item.name ?? item.title ?? ''),
      title: String(item.title ?? item.name ?? item.id ?? ''),
      description: String(item.description ?? item.detail ?? ''),
      keywords: Array.isArray(item.keywords) ? item.keywords.map(String) : [],
      value: item.value ?? item,
      disabled: Boolean(item.disabled),
    };
  }).filter((item) => item.id);
}

function ensureEditor(state) {
  if (!state.editor || !(state.editor instanceof InputEditor)) {
    state.editor = new InputEditor(String(state.query ?? ''));
  }
  state.query = state.editor.value;
  state.items = normalizePaletteItems(state.items ?? []);
  state.windowSize = Math.max(1, Number(state.windowSize) || 9);
}

function edit(state, fn) {
  fn();
  state.query = state.editor.value;
  state.selectedIndex = 0;
  state.status = 'Filter updated.';
  return { type: 'edit' };
}

function moveSelection(state, delta) {
  const matches = getCommandPaletteMatches(state);
  if (!matches.length) {
    state.selectedIndex = 0;
    return { type: 'noop' };
  }
  state.selectedIndex = clamp(state.selectedIndex + delta, 0, matches.length - 1);
  state.status = 'Selection moved.';
  return { type: 'move', item: matches[state.selectedIndex] };
}

function setSelection(state, index) {
  const matches = getCommandPaletteMatches(state);
  if (!matches.length) return { type: 'noop' };
  state.selectedIndex = clamp(index, 0, matches.length - 1);
  return { type: 'move', item: matches[state.selectedIndex] };
}

function clampSelection(state, size) {
  state.selectedIndex = clamp(state.selectedIndex, 0, Math.max(0, size - 1));
  return state.selectedIndex;
}

function clamp(value, min, max) {
  if (value === Number.POSITIVE_INFINITY) return max;
  return Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
}
