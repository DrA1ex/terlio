export function clampScrollOffset(value = 0, max = 0) {
  const safeMax = Math.max(0, Number(max) || 0);
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return Math.max(0, Math.min(safeValue, safeMax));
}

export function scrollBy(current = 0, delta = 0, max = 0) {
  return clampScrollOffset((Number(current) || 0) + (Number(delta) || 0), max);
}

export function scrollLine(current = 0, direction = 1, max = 0, step = 1) {
  const sign = Number(direction) < 0 ? -1 : 1;
  const safeStep = Math.max(1, Number(step) || 1);
  return scrollBy(current, sign * safeStep, max);
}

export function scrollPage(current = 0, direction = 1, pageSize = 5, max = 0) {
  const size = Math.max(1, Number(pageSize) || 1);
  const sign = Number(direction) < 0 ? -1 : 1;
  return scrollBy(current, sign * size, max);
}

export function normalizeScrollMap(scroll = {}, maxByKey = {}) {
  const next = { ...(scroll || {}) };
  for (const [key, max] of Object.entries(maxByKey || {})) {
    next[key] = clampScrollOffset(next[key] || 0, max);
  }
  return next;
}

export function scrollMax(totalRows = 0, visibleRows = 1) {
  return Math.max(0, Math.max(0, Number(totalRows) || 0) - Math.max(1, Number(visibleRows) || 1));
}

export function isScrollAtBottom(scroll = 0, totalRows = 0, visibleRows = 1) {
  const max = scrollMax(totalRows, visibleRows);
  return clampScrollOffset(scroll, max) >= max;
}

export function resolveAutoScrollOffset({
  scroll = 0,
  totalRows = 0,
  visibleRows = 1,
  previousTotalRows = totalRows,
  sticky = undefined,
} = {}) {
  const safeVisible = Math.max(1, Number(visibleRows) || 1);
  const previousMax = scrollMax(previousTotalRows, safeVisible);
  const nextMax = scrollMax(totalRows, safeVisible);
  const safeScroll = clampScrollOffset(scroll, nextMax);
  const shouldStick = sticky === undefined
    ? clampScrollOffset(scroll, previousMax) >= previousMax
    : Boolean(sticky);
  return shouldStick ? nextMax : safeScroll;
}

export function resolveScrollKeyOffset({
  keyName = '',
  scroll = 0,
  totalRows = 0,
  visibleRows = 1,
  previousTotalRows = totalRows,
  sticky = false,
  lineStep = 1,
  pageStep = undefined,
  includeHomeEnd = false,
} = {}) {
  const safeVisible = Math.max(1, Number(visibleRows) || 1);
  const safeTotal = Math.max(0, Number(totalRows) || 0);
  const max = scrollMax(safeTotal, safeVisible);
  const current = resolveAutoScrollOffset({
    scroll,
    totalRows: safeTotal,
    previousTotalRows,
    visibleRows: safeVisible,
    sticky,
  });
  const page = Math.max(1, Number(pageStep) || safeVisible);
  let next = current;
  let handled = true;

  switch (keyName) {
    case 'up':
      next = scrollLine(current, -1, max, lineStep);
      break;
    case 'down':
      next = scrollLine(current, 1, max, lineStep);
      break;
    case 'page-up':
      next = scrollPage(current, -1, page, max);
      break;
    case 'page-down':
      next = scrollPage(current, 1, page, max);
      break;
    case 'home':
      handled = Boolean(includeHomeEnd);
      next = handled ? 0 : current;
      break;
    case 'end':
      handled = Boolean(includeHomeEnd);
      next = handled ? max : current;
      break;
    default:
      handled = false;
      next = current;
      break;
  }

  const safeNext = clampScrollOffset(next, max);
  return {
    handled,
    scroll: safeNext,
    maxScroll: max,
    atBottom: isScrollAtBottom(safeNext, safeTotal, safeVisible),
  };
}
