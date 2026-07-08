export function getResponsiveMode(width = 80) {
  const columns = Number(width) || 80;
  if (columns >= 180) return 'wide';
  if (columns >= 120) return 'medium';
  return 'narrow';
}

export function responsiveColumns(width = 80, mode = getResponsiveMode(width)) {
  const columns = Math.max(40, Number(width) || 80);
  if (mode === 'wide') {
    const left = clamp(Math.floor(columns * 0.29), 50, 58);
    const right = clamp(Math.floor(columns * 0.25), 44, 54);
    const middle = Math.max(72, columns - left - right - 4);
    return { mode, left, middle, right };
  }
  if (mode === 'medium') {
    const left = clamp(Math.floor(columns * 0.34), 42, 56);
    const middle = Math.max(64, columns - left - 2);
    return { mode, left, middle, right: 0 };
  }
  return { mode, left: columns, middle: columns, right: 0 };
}

export function takeVisible(items = [], selectedIndex = 0, windowSize = 8) {
  const total = items.length;
  const selected = clamp(selectedIndex, 0, Math.max(0, total - 1));
  const size = Math.max(1, Math.min(total || 1, Number(windowSize) || 1));
  const start = Math.max(0, Math.min(selected - Math.floor(size / 2), Math.max(0, total - size)));
  return { items: items.slice(start, start + size), start, selected, total, remaining: Math.max(0, total - start - size) };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
