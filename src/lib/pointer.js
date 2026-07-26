const SGR_MOUSE_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/;

const BUTTONS = ['left', 'middle', 'right', 'none'];
const WHEEL_NAMES = ['wheel-up', 'wheel-down', 'wheel-left', 'wheel-right'];

export function parsePointer(data) {
  const sequence = Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '');
  const match = SGR_MOUSE_RE.exec(sequence);
  if (!match) return null;

  const code = Number(match[1]);
  const column = Number(match[2]);
  const row = Number(match[3]);
  const final = match[4];
  const buttonCode = code & 3;
  const wheel = (code & 64) !== 0;
  const motion = (code & 32) !== 0;
  const shift = (code & 4) !== 0;
  const meta = (code & 8) !== 0;
  const ctrl = (code & 16) !== 0;

  const base = {
    type: 'pointer',
    sequence,
    code,
    x: Math.max(0, column - 1),
    y: Math.max(0, row - 1),
    column,
    row,
    shift,
    meta,
    ctrl,
    button: BUTTONS[buttonCode] ?? 'unknown',
    buttonCode,
    action: 'unknown',
    name: 'unknown',
    deltaX: 0,
    deltaY: 0,
    pressed: final === 'M',
  };

  if (wheel) {
    const direction = WHEEL_NAMES[buttonCode] ?? 'wheel-unknown';
    return {
      ...base,
      action: 'wheel',
      name: direction,
      button: 'none',
      pressed: false,
      deltaX: direction === 'wheel-left' ? -1 : direction === 'wheel-right' ? 1 : 0,
      deltaY: direction === 'wheel-up' ? -1 : direction === 'wheel-down' ? 1 : 0,
    };
  }

  if (motion) {
    const dragging = buttonCode !== 3;
    return {
      ...base,
      action: dragging ? 'drag' : 'move',
      name: dragging ? 'drag' : 'move',
    };
  }

  if (final === 'm' || buttonCode === 3) {
    return {
      ...base,
      action: 'release',
      name: 'release',
      pressed: false,
    };
  }

  return {
    ...base,
    action: 'click',
    name: 'click',
    pressed: true,
  };
}

export function isPointerEvent(value) {
  return Boolean(value && value.type === 'pointer' && Number.isFinite(value.x) && Number.isFinite(value.y));
}

export function normalizePointerRegions(regions = [], {
  width = Infinity,
  height = Infinity,
  maxRegions = Infinity,
  preserveUnknownParents = true,
} = {}) {
  const safeWidth = normalizeDimension(width);
  const safeHeight = normalizeDimension(height);
  const safeMaxRegions = normalizeRegionLimit(maxRegions);
  const output = [];
  const seenTokens = new Set();

  for (const source of Array.from(regions ?? [])) {
    if (output.length >= safeMaxRegions) break;
    const token = normalizeToken(source?.token);
    if (token === null || seenTokens.has(token)) continue;
    const segments = normalizeSegments(source?.segments, safeWidth, safeHeight);
    if (!segments.length) continue;

    seenTokens.add(token);
    output.push({
      ...source,
      token,
      parentToken: normalizeToken(source?.parentToken),
      segments,
      bounds: boundsForSegments(segments),
    });
  }

  const validTokens = new Set(output.map((region) => region.token));
  return output.map((region) => ({
    ...region,
    parentToken: region.parentToken !== region.token && (
      preserveUnknownParents || validTokens.has(region.parentToken)
    ) ? region.parentToken : null,
  }));
}

export function requestsPointerReporting(regions = []) {
  return normalizePointerRegions(regions).some((region) => (
    !region.disabled
    && region.pointerEvents !== 'none'
    && region.autoEnable !== false
  ));
}

export function hitTestPointerRegions(regions = [], x, y, { all = false } = {}) {
  const safeX = Number(x);
  const safeY = Number(y);
  if (!Number.isFinite(safeX) || !Number.isFinite(safeY)) return all ? [] : null;
  const matches = [];
  const normalized = normalizePointerRegions(regions, { preserveUnknownParents: false });

  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const region = normalized[index];
    if (region.disabled || region.pointerEvents === 'none') continue;
    const segment = region.segments.find((item) => (
      safeY === item.y && safeX >= item.x && safeX < item.x + item.width
    ));
    if (!segment) continue;
    matches.push({ region, segment });
    if (!all) return { region, segment };
  }

  return all ? matches : null;
}

export function dispatchPointerEvent(pointer, regions = [], context = {}, { capturedToken = null } = {}) {
  if (!isPointerEvent(pointer)) return { handled: false, event: pointer, targets: [] };

  const normalized = normalizePointerRegions(regions, { preserveUnknownParents: false });
  const hits = capturedToken == null
    ? hitTestPointerRegions(normalized, pointer.x, pointer.y, { all: true })
    : capturedPointerHits(normalized, capturedToken, pointer);
  const matches = routedMatchChain(hits);
  const target = matches[0]?.region ?? null;
  const event = createRoutedPointerEvent(pointer, target);
  let handled = false;

  for (const match of matches) {
    if (event.propagationStopped) break;
    const currentTarget = publicRegion(match.region);
    event.currentTarget = currentTarget;
    event.localX = pointer.x - match.segment.x;
    event.localY = pointer.y - match.region.bounds.y;

    const specific = specificHandler(match.region, pointer.action);
    if (typeof specific === 'function') {
      const result = specific(event, context);
      if (result !== false) handled = true;
    }
    if (!event.immediatePropagationStopped && typeof match.region.onPointer === 'function') {
      const result = match.region.onPointer(event, context);
      if (result !== false) handled = true;
    }
  }

  event.currentTarget = null;
  event.handled = handled;
  return { handled, event, targets: matches.map((item) => publicRegion(item.region)) };
}

function capturedPointerHits(regions, token, pointer) {
  const safeToken = normalizeToken(token);
  if (safeToken === null) return [];
  const region = regions.find((item) => item.token === safeToken);
  if (!region || region.disabled || region.pointerEvents === 'none') return [];
  const segment = nearestSegment(region.segments, pointer?.y) ?? region.segments[0];
  const hits = [{ region, segment }];
  const visited = new Set([region.token]);
  let parentToken = region.parentToken;
  while (parentToken != null && !visited.has(parentToken)) {
    visited.add(parentToken);
    const parent = regions.find((item) => item.token === parentToken);
    if (!parent) break;
    hits.push({ region: parent, segment: nearestSegment(parent.segments, pointer?.y) ?? parent.segments[0] ?? segment });
    parentToken = parent.parentToken;
  }
  return hits;
}

function nearestSegment(segments = [], y = 0) {
  if (!segments.length) return null;
  const exact = segments.find((item) => item.y === Number(y));
  if (exact) return exact;
  return segments.reduce((best, item) => (
    Math.abs(item.y - Number(y)) < Math.abs(best.y - Number(y)) ? item : best
  ), segments[0]);
}

function routedMatchChain(hits = []) {
  const target = hits[0];
  if (!target) return [];
  const byToken = new Map(hits.map((hit) => [hit.region.token, hit]));
  const chain = [];
  const visited = new Set();
  let current = target.region;
  while (current && !visited.has(current.token)) {
    visited.add(current.token);
    const match = byToken.get(current.token);
    if (match) chain.push(match);
    current = current.parentToken == null
      ? null
      : byToken.get(current.parentToken)?.region ?? null;
  }
  return chain;
}

function createRoutedPointerEvent(pointer, target) {
  return {
    ...pointer,
    target: target ? publicRegion(target) : null,
    currentTarget: null,
    localX: null,
    localY: null,
    handled: false,
    defaultPrevented: false,
    propagationStopped: false,
    immediatePropagationStopped: false,
    pointerCaptureRequested: false,
    pointerCaptureReleaseRequested: false,
    targetToken: target?.token ?? null,
    capturePointer() { this.pointerCaptureRequested = true; },
    releasePointerCapture() { this.pointerCaptureReleaseRequested = true; },
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
    stopImmediatePropagation() {
      this.immediatePropagationStopped = true;
      this.propagationStopped = true;
    },
  };
}

function specificHandler(region, action) {
  if (action === 'click') return region.onClick;
  if (action === 'wheel') return region.onWheel;
  if (action === 'drag') return region.onDrag;
  if (action === 'move') return region.onMove;
  if (action === 'release') return region.onRelease;
  return null;
}

function publicRegion(region) {
  if (!region) return null;
  return {
    id: region.id,
    data: region.data,
    autoEnable: region.autoEnable !== false,
    bounds: { ...region.bounds },
    segments: region.segments.map((segment) => ({ ...segment })),
  };
}

function normalizeSegments(segments, width, height) {
  const output = [];
  for (const source of Array.from(segments ?? [])) {
    const x = Number(source?.x);
    const y = Number(source?.y);
    const segmentWidth = Number(source?.width);
    const segmentHeight = source?.height === undefined ? 1 : Number(source.height);
    if (!Number.isInteger(x) || !Number.isInteger(y) ||
        !Number.isInteger(segmentWidth) || segmentWidth <= 0 || segmentHeight !== 1) continue;
    if (y < 0 || y >= height) continue;
    const start = Math.max(0, x);
    const end = Math.min(width, x + segmentWidth);
    if (end <= start) continue;
    output.push({ x: start, y, width: end - start, height: 1 });
  }
  return output;
}

function normalizeToken(value) {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function normalizeDimension(value) {
  if (value === Infinity) return Infinity;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : Infinity;
}

function normalizeRegionLimit(value) {
  if (value === Infinity) return Infinity;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : Infinity;
}

function boundsForSegments(segments = []) {
  if (!segments.length) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...segments.map((item) => item.x));
  const minY = Math.min(...segments.map((item) => item.y));
  const maxX = Math.max(...segments.map((item) => item.x + item.width));
  const maxY = Math.max(...segments.map((item) => item.y + item.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
