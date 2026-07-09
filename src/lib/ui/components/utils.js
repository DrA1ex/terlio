export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

export function mod(value, size) {
  return ((value % size) + size) % size;
}
