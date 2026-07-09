import { resolveScrollKeyOffset, resolveAutoScrollOffset, scrollMax, isScrollAtBottom } from './scrollState.js';

export function createScrollState({ scroll = 0, sticky = true, visibleRows = 8, totalRows = 0 } = {}) {
  return { scroll: Number(scroll) || 0, sticky: Boolean(sticky), visibleRows: Math.max(1, Number(visibleRows) || 8), totalRows: Math.max(0, Number(totalRows) || 0), previousTotalRows: Math.max(0, Number(totalRows) || 0) };
}

export function updateScrollState(state, { totalRows = state.totalRows, visibleRows = state.visibleRows } = {}) {
  state.previousTotalRows = state.totalRows;
  state.totalRows = Math.max(0, Number(totalRows) || 0);
  state.visibleRows = Math.max(1, Number(visibleRows) || 1);
  state.scroll = resolveAutoScrollOffset({ scroll: state.scroll, totalRows: state.totalRows, previousTotalRows: state.previousTotalRows, visibleRows: state.visibleRows, sticky: state.sticky && isScrollAtBottom(state.scroll, state.previousTotalRows, state.visibleRows) });
  return state;
}

export function handleScrollKey(state, key, options = {}) {
  const result = resolveScrollKeyOffset({ keyName: key?.name, scroll: state.scroll, totalRows: state.totalRows, visibleRows: state.visibleRows, includeHomeEnd: true, sticky: false, ...options });
  if (result.handled) {
    state.scroll = result.scroll;
    state.sticky = result.atBottom;
  }
  return result;
}

export function appendScrollRows(state, count = 1) {
  updateScrollState(state, { totalRows: state.totalRows + Math.max(0, Number(count) || 0), visibleRows: state.visibleRows });
  return state;
}

export { scrollMax, isScrollAtBottom };
