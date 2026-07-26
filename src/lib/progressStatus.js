const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);
const ACTIVE_STATES = new Set(['running', 'paused']);

export function createProgressController(options = {}) {
  const now = typeof options.now === 'function' ? options.now : defaultNow;
  const setTimer = typeof options.setTimeout === 'function' ? options.setTimeout : setTimeout;
  const clearTimer = typeof options.clearTimeout === 'function' ? options.clearTimeout : clearTimeout;
  const updateIntervalMs = Math.max(0, finiteNumber(options.updateIntervalMs, 50));
  const rateWindowMs = Math.max(250, finiteNumber(options.rateWindowMs, 5000));
  let invalidate = typeof options.invalidate === 'function' ? options.invalidate : null;

  let value = nonNegativeNumber(options.value, 0);
  let total = normalizeTotal(options.total, 100);
  let state = normalizeState(options.state, value > 0 ? 'running' : 'idle');
  let error = options.error ?? null;
  let startedAt = null;
  let activeStartedAt = null;
  let elapsedBeforeActiveMs = 0;
  let samples = [];
  let timer = null;
  let lastInvalidatedAt = Number.NEGATIVE_INFINITY;
  let disposed = false;

  const createdAt = now();
  if (state === 'running') {
    startedAt = createdAt;
    activeStartedAt = createdAt;
    samples = [{ elapsedMs: 0, value }];
  } else if (state === 'paused') {
    startedAt = createdAt;
    samples = [{ elapsedMs: 0, value }];
  }

  const controller = {
    get value() { return value; },
    get total() { return total; },
    get state() { return state; },
    get error() { return error; },
    get unit() { return String(options.unit ?? ''); },
    get format() { return options.format ?? 'number'; },
    get precision() { return Math.max(0, Math.min(3, finiteNumber(options.precision, 1))); },
    get rateMode() { return normalizeRateMode(options.rateMode); },
    get perItemLabel() { return String(options.perItemLabel ?? 'item'); },

    start() {
      if (disposed) return controller;
      const at = now();
      if (state === 'idle' || TERMINAL_STATES.has(state)) {
        if (TERMINAL_STATES.has(state)) {
          error = null;
          samples = [];
          elapsedBeforeActiveMs = 0;
          startedAt = at;
        }
        if (startedAt === null) startedAt = at;
        activeStartedAt = at;
        state = 'running';
        recordSample(at);
        requestInvalidate(true);
      } else if (state === 'paused') {
        controller.resume();
      }
      return controller;
    },

    set(nextValue, nextTotal) {
      if (disposed) return controller;
      const at = now();
      if (nextTotal !== undefined) total = normalizeTotal(nextTotal, total);
      if (state === 'idle') beginRunning(at);
      value = clampToTotal(nonNegativeNumber(nextValue, value), total);
      recordSample(at);
      requestInvalidate(false);
      return controller;
    },

    add(count = 1) {
      return controller.set(value + finiteNumber(count, 0));
    },

    setTotal(nextTotal) {
      if (disposed) return controller;
      total = normalizeTotal(nextTotal, total);
      value = clampToTotal(value, total);
      recordSample(now());
      requestInvalidate(false);
      return controller;
    },

    pause() {
      if (disposed || state !== 'running') return controller;
      const at = now();
      freezeElapsed(at);
      state = 'paused';
      recordSample(at);
      requestInvalidate(true);
      return controller;
    },

    resume() {
      if (disposed || state !== 'paused') return controller;
      const at = now();
      if (startedAt === null) startedAt = at;
      activeStartedAt = at;
      state = 'running';
      recordSample(at);
      requestInvalidate(true);
      return controller;
    },

    complete(finalValue = total) {
      if (disposed) return controller;
      const at = now();
      if (state === 'idle') beginRunning(at);
      value = clampToTotal(nonNegativeNumber(finalValue, total), total);
      freezeElapsed(at);
      state = 'completed';
      error = null;
      recordSample(at);
      requestInvalidate(true);
      return controller;
    },

    fail(reason) {
      if (disposed) return controller;
      const at = now();
      if (state === 'idle') beginRunning(at);
      freezeElapsed(at);
      state = 'failed';
      error = reason instanceof Error ? reason : new Error(String(reason ?? 'Progress failed'));
      recordSample(at);
      requestInvalidate(true);
      return controller;
    },

    cancel() {
      if (disposed) return controller;
      const at = now();
      if (state === 'idle') startedAt = at;
      freezeElapsed(at);
      state = 'cancelled';
      recordSample(at);
      requestInvalidate(true);
      return controller;
    },

    reset(next = {}) {
      if (disposed) return controller;
      clearPendingTimer();
      value = nonNegativeNumber(next.value, nonNegativeNumber(options.value, 0));
      total = normalizeTotal(next.total, normalizeTotal(options.total, 100));
      value = clampToTotal(value, total);
      state = normalizeState(next.state, 'idle');
      error = null;
      startedAt = null;
      activeStartedAt = null;
      elapsedBeforeActiveMs = 0;
      samples = [];
      const at = now();
      if (state === 'running') {
        startedAt = at;
        activeStartedAt = at;
        samples.push({ elapsedMs: 0, value });
      } else if (state === 'paused') {
        startedAt = at;
        samples.push({ elapsedMs: 0, value });
      }
      requestInvalidate(true);
      return controller;
    },

    setInvalidate(nextInvalidate) {
      invalidate = typeof nextInvalidate === 'function' ? nextInvalidate : null;
      return controller;
    },

    snapshot() {
      const at = now();
      const elapsedMs = currentElapsed(at);
      const rate = calculateRate(elapsedMs);
      const remaining = Number.isFinite(total) ? Math.max(0, total - value) : null;
      const etaMs = remaining !== null && rate > 0 ? remaining / rate * 1000 : null;
      return Object.freeze({
        value,
        total,
        ratio: total > 0 && Number.isFinite(total) ? clamp(value / total, 0, 1) : 0,
        state,
        error,
        unit: controller.unit,
        startedAt,
        elapsedMs,
        rate,
        etaMs: Number.isFinite(etaMs) ? etaMs : null,
      });
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      clearPendingTimer();
      invalidate = null;
    },
  };

  function beginRunning(at) {
    state = 'running';
    startedAt = startedAt ?? at;
    activeStartedAt = at;
    if (samples.length === 0) samples.push({ elapsedMs: currentElapsed(at), value });
  }

  function currentElapsed(at) {
    const activeMs = activeStartedAt === null ? 0 : Math.max(0, at - activeStartedAt);
    return Math.max(0, elapsedBeforeActiveMs + activeMs);
  }

  function freezeElapsed(at) {
    if (activeStartedAt !== null) {
      elapsedBeforeActiveMs += Math.max(0, at - activeStartedAt);
      activeStartedAt = null;
    }
  }

  function recordSample(at) {
    const elapsedMs = currentElapsed(at);
    const sample = { elapsedMs, value };
    const last = samples.at(-1);
    if (last && last.elapsedMs === elapsedMs) samples[samples.length - 1] = sample;
    else samples.push(sample);
    const cutoff = Math.max(0, elapsedMs - rateWindowMs);
    while (samples.length > 2 && samples[1].elapsedMs < cutoff) samples.shift();
  }

  function calculateRate(elapsedMs) {
    if (samples.length < 2 || elapsedMs <= 0) return 0;
    const last = samples.at(-1);
    let first = samples[0];
    const cutoff = Math.max(0, last.elapsedMs - rateWindowMs);
    for (const sample of samples) {
      if (sample.elapsedMs >= cutoff) {
        first = sample;
        break;
      }
    }
    const deltaValue = last.value - first.value;
    const deltaMs = last.elapsedMs - first.elapsedMs;
    return deltaMs > 0 && deltaValue >= 0 ? deltaValue / (deltaMs / 1000) : 0;
  }

  function requestInvalidate(immediate) {
    if (!invalidate || disposed) return;
    const at = now();
    const dueNow = immediate || updateIntervalMs === 0 || at - lastInvalidatedAt >= updateIntervalMs;
    if (dueNow) {
      clearPendingTimer();
      lastInvalidatedAt = at;
      invalidate(controller.snapshot());
      return;
    }
    if (timer !== null) return;
    const delay = Math.max(0, updateIntervalMs - (at - lastInvalidatedAt));
    timer = setTimer(() => {
      timer = null;
      if (!invalidate || disposed) return;
      lastInvalidatedAt = now();
      invalidate(controller.snapshot());
    }, delay);
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  function clearPendingTimer() {
    if (timer === null) return;
    clearTimer(timer);
    timer = null;
  }

  return controller;
}

export function isProgressController(value) {
  return Boolean(value && typeof value === 'object' && typeof value.snapshot === 'function' && typeof value.set === 'function');
}

export function progressSnapshot(value, fallback = {}) {
  if (isProgressController(value)) return value.snapshot();
  if (value && typeof value === 'object') {
    const total = normalizeTotal(value.total, normalizeTotal(fallback.total, 100));
    const current = clampToTotal(nonNegativeNumber(value.value, nonNegativeNumber(fallback.value, 0)), total);
    return {
      value: current,
      total,
      ratio: total > 0 && Number.isFinite(total) ? clamp(current / total, 0, 1) : 0,
      state: normalizeState(value.state, fallback.state ?? (current > 0 ? 'running' : 'idle')),
      error: value.error ?? null,
      unit: String(value.unit ?? fallback.unit ?? ''),
      startedAt: value.startedAt ?? null,
      elapsedMs: nonNegativeNumber(value.elapsedMs, nonNegativeNumber(fallback.elapsedMs, 0)),
      rate: nonNegativeNumber(value.rate, nonNegativeNumber(fallback.rate, 0)),
      etaMs: value.etaMs === null ? null : nonNegativeNumber(value.etaMs, fallback.etaMs ?? null),
    };
  }
  const total = normalizeTotal(fallback.total, 100);
  const current = clampToTotal(nonNegativeNumber(value, nonNegativeNumber(fallback.value, 0)), total);
  return {
    value: current,
    total,
    ratio: total > 0 && Number.isFinite(total) ? clamp(current / total, 0, 1) : 0,
    state: normalizeState(fallback.state, current > 0 ? 'running' : 'idle'),
    error: fallback.error ?? null,
    unit: String(fallback.unit ?? ''),
    startedAt: null,
    elapsedMs: nonNegativeNumber(fallback.elapsedMs, 0),
    rate: nonNegativeNumber(fallback.rate, 0),
    etaMs: fallback.etaMs === null ? null : nonNegativeNumber(fallback.etaMs, null),
  };
}

export function formatProgressValue(value, { unit = '', format = 'number', precision = 1 } = {}) {
  if (typeof format === 'function') return String(format(value));
  const numeric = finiteNumber(value, 0);
  if (format === 'bytes') return formatBytes(numeric, precision);
  const suffix = unit ? ` ${formatUnitLabel(unit, numeric)}` : '';
  if (format === 'metric') return `${formatMetric(numeric, precision)}${suffix}`;
  return `${formatPlainNumber(numeric)}${suffix}`;
}

export function formatProgressRate(rate, options = {}) {
  if (!(Number(rate) > 0)) return 'n/a';
  if (typeof options.formatRate === 'function') return String(options.formatRate(rate));
  const rateMode = normalizeRateMode(options.rateMode);
  const effectiveMode = rateMode === 'auto' ? (rate >= 1 ? 'per-second' : 'per-item') : rateMode;
  if (effectiveMode === 'per-item') {
    const milliseconds = 1000 / rate;
    const pace = milliseconds < 1000 ? `${Math.max(1, Math.round(milliseconds))}ms` : `${trimFixed(milliseconds / 1000, 1)}s`;
    return `${pace}/${String(options.perItemLabel ?? 'item')}`;
  }
  return `${formatProgressValue(rate, options)}/s`;
}


export function formatProgressDuration(milliseconds) {
  if (!(Number(milliseconds) >= 0) || !Number.isFinite(Number(milliseconds))) return 'n/a';
  const totalSeconds = Math.max(0, Math.round(Number(milliseconds) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatBytes(value, precision) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let current = Math.max(0, value);
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  const digits = current >= 100 || index === 0 ? 0 : Math.max(0, Math.min(3, Number(precision) || 0));
  return `${trimFixed(current, digits)} ${units[index]}`;
}

function formatMetric(value, precision) {
  const units = ['', 'k', 'M', 'G', 'T'];
  let current = Math.abs(value);
  let index = 0;
  while (current >= 1000 && index < units.length - 1) {
    current /= 1000;
    index += 1;
  }
  const signed = value < 0 ? -current : current;
  const digits = current >= 100 || index === 0 ? 0 : Math.max(0, Math.min(3, Number(precision) || 0));
  return `${trimFixed(signed, digits)}${units[index]}`;
}

function formatPlainNumber(value) {
  if (Number.isInteger(value)) return String(value);
  return trimFixed(value, 2);
}

function trimFixed(value, digits) {
  return Number(value).toFixed(digits).replace(/\.0+$|(?<=\.[0-9]*?)0+$/u, '').replace(/\.$/u, '');
}

function normalizeTotal(value, fallback) {
  if (value === Infinity) return Infinity;
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return number;
  return fallback === Infinity || (Number.isFinite(Number(fallback)) && Number(fallback) > 0) ? Number(fallback) : 100;
}

function formatUnitLabel(unit, value) {
  const label = String(unit ?? '');
  if (Math.abs(Number(value)) === 1 && label.endsWith('s') && label.length > 1) return label.slice(0, -1);
  return label;
}

function normalizeRateMode(value) {
  const mode = String(value ?? 'auto').trim().toLowerCase();
  return ['per-second', 'per-item', 'auto'].includes(mode) ? mode : 'auto';
}

function normalizeState(value, fallback = 'idle') {
  const state = String(value ?? fallback).trim().toLowerCase();
  return ['idle', 'running', 'paused', 'completed', 'failed', 'cancelled'].includes(state) ? state : fallback;
}

function clampToTotal(value, total) {
  return Number.isFinite(total) ? clamp(value, 0, total) : Math.max(0, value);
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegativeNumber(value, fallback) {
  const number = Number(value);
  if (Number.isFinite(number) && number >= 0) return number;
  return fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function defaultNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
