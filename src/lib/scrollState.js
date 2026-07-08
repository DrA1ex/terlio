export function clampScrollOffset(value = 0, max = 0) {
  const safeMax = Math.max(0, Number(max) || 0);
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  return Math.max(0, Math.min(safeValue, safeMax));
}

export function scrollBy(current = 0, delta = 0, max = 0) {
  return clampScrollOffset((Number(current) || 0) + (Number(delta) || 0), max);
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
