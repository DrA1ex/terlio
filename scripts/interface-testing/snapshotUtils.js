import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToFrame, stripAnsi, visibleLength } from '../../src/lib/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const GOLDEN_DIRECTORY = path.resolve(HERE, '../../test/interface/goldens');

export function renderScenario(scenario) {
  const frame = renderToFrame(scenario.render(), { width: scenario.width, height: scenario.height });
  const lines = frame.toLines();
  return {
    id: scenario.id,
    title: scenario.title,
    width: scenario.width,
    height: scenario.height,
    lines,
    plain: lines.map((line) => stripAnsi(line)),
    pointerRegions: normalizePointerRegions(frame.pointerRegions),
  };
}

export function goldenPath(id) {
  return path.join(GOLDEN_DIRECTORY, `${id}.json`);
}

export function readGolden(id) {
  return JSON.parse(fs.readFileSync(goldenPath(id), 'utf8'));
}

export function writeGolden(snapshot) {
  fs.mkdirSync(GOLDEN_DIRECTORY, { recursive: true });
  fs.writeFileSync(goldenPath(snapshot.id), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

export function auditSnapshot(snapshot) {
  const issues = [];
  if (snapshot.lines.length !== snapshot.height) issues.push(`expected ${snapshot.height} lines, got ${snapshot.lines.length}`);
  if (snapshot.plain.length !== snapshot.height) issues.push(`plain frame has ${snapshot.plain.length} lines`);

  snapshot.lines.forEach((line, index) => {
    const width = visibleLength(line);
    if (width !== snapshot.width) issues.push(`line ${index + 1} has visible width ${width}, expected ${snapshot.width}`);
    if (/\x1b\[\?9000;\d+;\d+z/u.test(line)) issues.push(`line ${index + 1} contains an internal pointer marker`);
    if (/undefined|\[object Object\]|\bNaN\b/u.test(stripAnsi(line))) issues.push(`line ${index + 1} contains a suspicious placeholder`);
    const invalidControls = Array.from(line).filter((char) => {
      const code = char.codePointAt(0);
      return code !== 0x1b && code !== 0x09 && (code < 0x20 || (code >= 0x7f && code <= 0x9f));
    });
    if (invalidControls.length) issues.push(`line ${index + 1} contains non-ANSI control characters`);
    if (!hasOnlyKnownAnsi(line)) issues.push(`line ${index + 1} contains an incomplete or unsupported ANSI fragment`);
  });

  for (const region of snapshot.pointerRegions) {
    const bounds = region.bounds ?? {};
    if (bounds.x < 0 || bounds.y < 0 || bounds.width < 1 || bounds.height < 1) issues.push(`pointer region ${region.id} has invalid bounds`);
    if ((bounds.x + bounds.width) > snapshot.width || (bounds.y + bounds.height) > snapshot.height) issues.push(`pointer region ${region.id} exceeds the frame`);
    for (const segment of region.segments ?? []) {
      if (segment.x < 0 || segment.y < 0 || segment.width < 1 || segment.height < 1) issues.push(`pointer region ${region.id} has an invalid segment`);
      if ((segment.x + segment.width) > snapshot.width || (segment.y + segment.height) > snapshot.height) issues.push(`pointer region ${region.id} segment exceeds the frame`);
    }
  }

  return [...new Set(issues)];
}

export function normalizePointerRegions(regions = []) {
  return Array.from(regions, (region) => ({
    token: region.token,
    id: region.id,
    data: normalizeData(region.data),
    disabled: Boolean(region.disabled),
    pointerEvents: region.pointerEvents ?? 'auto',
    autoEnable: region.autoEnable !== false,
    parentToken: region.parentToken ?? null,
    bounds: region.bounds ? { ...region.bounds } : null,
    segments: Array.from(region.segments ?? [], (segment) => ({ ...segment })),
    handlers: ['onPointer', 'onClick', 'onWheel', 'onDrag', 'onMove', 'onRelease'].filter((name) => typeof region[name] === 'function'),
  }));
}

function normalizeData(value) {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'function' ? '[function]' : item));
  } catch {
    return '[unserializable]';
  }
}

function hasOnlyKnownAnsi(value) {
  let rest = String(value ?? '');
  while (rest.includes('\x1b')) {
    const index = rest.indexOf('\x1b');
    rest = rest.slice(index);
    const match = /^\x1b\[[0-?]*[ -/]*[@-~]/u.exec(rest);
    if (!match) return false;
    rest = rest.slice(match[0].length);
  }
  return true;
}
