export function createListState({ items = [], selectedIndex = 0, windowSize = 8, skipDisabled = true, getDisabled = (item) => Boolean(item?.disabled) } = {}) {
  const state = { items: Array.from(items), selectedIndex: 0, windowSize: Math.max(1, Number(windowSize) || 8), skipDisabled, getDisabled };
  state.selectedIndex = normalizeSelection(state, selectedIndex, 1);
  return state;
}

export function updateListItems(state, items = []) {
  state.items = Array.from(items);
  state.selectedIndex = normalizeSelection(state, state.selectedIndex, 1);
  return state;
}

export function handleListKey(state, key) {
  if (!state) return { handled: false };
  const size = state.items.length;
  if (!size) return { handled: false, selectedIndex: 0 };
  let next = state.selectedIndex;
  let handled = true;
  switch (key?.name) {
    case 'up': next -= 1; break;
    case 'down': next += 1; break;
    case 'page-up': next -= state.windowSize; break;
    case 'page-down': next += state.windowSize; break;
    case 'home': next = 0; break;
    case 'end': next = size - 1; break;
    default: handled = false; break;
  }
  if (!handled) return { handled: false, selectedIndex: state.selectedIndex };
  state.selectedIndex = normalizeSelection(state, next, next >= state.selectedIndex ? 1 : -1);
  return { handled: true, selectedIndex: state.selectedIndex, item: state.items[state.selectedIndex] ?? null };
}

export function getListWindow(state) {
  const size = state.items.length;
  const windowSize = Math.max(1, Number(state.windowSize) || 8);
  const selectedIndex = Math.max(0, Math.min(Number(state.selectedIndex) || 0, Math.max(0, size - 1)));
  const half = Math.floor(windowSize / 2);
  let start = Math.max(0, selectedIndex - half);
  start = Math.min(start, Math.max(0, size - windowSize));
  const end = Math.min(size, start + windowSize);
  return { items: state.items.slice(start, end), start, end, selectedIndex, moreAbove: start, moreBelow: Math.max(0, size - end), total: size };
}

function normalizeSelection(state, index, direction) {
  const size = state.items.length;
  if (!size) return 0;
  let next = Math.max(0, Math.min(Number(index) || 0, size - 1));
  if (!state.skipDisabled) return next;
  if (!state.getDisabled(state.items[next], next)) return next;
  for (let i = next; i >= 0 && i < size; i += direction >= 0 ? 1 : -1) {
    if (!state.getDisabled(state.items[i], i)) return i;
  }
  for (let i = next; i >= 0 && i < size; i += direction >= 0 ? -1 : 1) {
    if (!state.getDisabled(state.items[i], i)) return i;
  }
  return next;
}
