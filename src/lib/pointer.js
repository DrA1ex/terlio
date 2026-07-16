import { wcwidth } from './ansi/text.js';

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

export function requestsPointerReporting(regions = []) {
  return Array.from(regions ?? []).some((region) => (
    region
    && !region.disabled
    && region.pointerEvents !== 'none'
    && region.autoEnable !== false
  ));
}

export function hitTestPointerRegions(regions = [], x, y, { all = false } = {}) {
  const safeX = Number(x);
  const safeY = Number(y);
  if (!Number.isFinite(safeX) || !Number.isFinite(safeY)) return all ? [] : null;
  const matches = [];

  for (let index = regions.length - 1; index >= 0; index -= 1) {
    const region = regions[index];
    if (!region || region.disabled || region.pointerEvents === 'none') continue;
    const segment = region.segments?.find((item) => (
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

  const hits = capturedToken == null
    ? hitTestPointerRegions(regions, pointer.x, pointer.y, { all: true })
    : capturedPointerHits(regions, capturedToken, pointer);
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

export function extractPointerRegions(lines = [], metadata = new Map(), { width = 80, height = 24 } = {}) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const regionsByToken = new Map();
  const cleanLines = [];

  for (let y = 0; y < Math.min(lines.length, safeHeight); y += 1) {
    const source = String(lines[y] ?? '');
    let clean = '';
    let visibleX = 0;
    let index = 0;

    while (index < source.length) {
      if (source[index] === '\x1b') {
        const marker = /^\x1b\[\?9000;(\d+);(\d+)z/.exec(source.slice(index));
        if (marker) {
          const token = Number(marker[1]);
          const requestedWidth = Math.max(1, Number(marker[2]) || 1);
          const segmentWidth = Math.max(0, Math.min(requestedWidth, safeWidth - visibleX));
          if (segmentWidth > 0 && metadata.has(token)) {
            const entry = regionsByToken.get(token) ?? { ...metadata.get(token), token, segments: [] };
            entry.segments.push({ x: visibleX, y, width: segmentWidth, height: 1 });
            regionsByToken.set(token, entry);
          }
          index += marker[0].length;
          continue;
        }

        const ansi = /^\x1b\[[0-?]*[ -/]*[@-~]/.exec(source.slice(index));
        if (ansi) {
          clean += ansi[0];
          index += ansi[0].length;
          continue;
        }
      }

      const codePoint = source.codePointAt(index);
      if (codePoint === undefined) break;
      const char = String.fromCodePoint(codePoint);
      clean += char;
      visibleX += cellWidth(char);
      index += char.length;
    }

    cleanLines.push(clean);
  }

  const regions = [...regionsByToken.values()].map((region) => ({
    ...region,
    bounds: boundsForSegments(region.segments),
  }));

  return { lines: cleanLines, regions };
}


export function stripPointerMarkers(value) {
  return String(value ?? '').replace(/\x1b\[\?9000;\d+;\d+z/g, '');
}

export function pointerMarker(token, width) {
  return `\x1b[?9000;${Math.max(1, Number(token) || 1)};${Math.max(1, Number(width) || 1)}z`;
}


function capturedPointerHits(regions, token, pointer) {
  const region = Array.from(regions ?? []).find((item) => item?.token === token);
  if (!region || region.disabled || region.pointerEvents === 'none') return [];
  const segment = nearestSegment(region.segments, pointer?.y) ?? {
    x: region.bounds?.x ?? 0,
    y: region.bounds?.y ?? 0,
    width: Math.max(1, region.bounds?.width ?? 1),
    height: 1,
  };
  const hits = [{ region, segment }];
  let parentToken = region.parentToken;
  while (parentToken != null) {
    const parent = Array.from(regions ?? []).find((item) => item?.token === parentToken);
    if (!parent) break;
    hits.push({ region: parent, segment: nearestSegment(parent.segments, pointer?.y) ?? parent.segments?.[0] ?? segment });
    parentToken = parent.parentToken;
  }
  return hits;
}

function nearestSegment(segments = [], y = 0) {
  if (!segments.length) return null;
  const exact = segments.find((item) => Number(item.y) === Number(y));
  if (exact) return exact;
  return segments.reduce((best, item) => (
    Math.abs(Number(item.y) - Number(y)) < Math.abs(Number(best.y) - Number(y)) ? item : best
  ), segments[0]);
}

function routedMatchChain(hits = []) {
  const target = hits[0];
  if (!target) return [];
  const byToken = new Map(hits.map((hit) => [hit.region.token, hit]));
  const chain = [];
  let current = target.region;
  while (current) {
    const match = byToken.get(current.token);
    if (match) chain.push(match);
    current = current.parentToken == null
      ? null
      : hits.find((hit) => hit.region.token === current.parentToken)?.region ?? null;
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

function boundsForSegments(segments = []) {
  if (!segments.length) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...segments.map((item) => item.x));
  const minY = Math.min(...segments.map((item) => item.y));
  const maxX = Math.max(...segments.map((item) => item.x + item.width));
  const maxY = Math.max(...segments.map((item) => item.y + item.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function cellWidth(char) {
  return wcwidth(char);
}
