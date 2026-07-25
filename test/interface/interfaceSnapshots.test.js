import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { INTERFACE_SCENARIOS, VISUAL_COMPONENTS } from '../../scripts/interface-testing/scenarios.js';
import { auditSnapshot, goldenPath, readGolden, renderScenario } from '../../scripts/interface-testing/snapshotUtils.js';

const REQUIRED_COVERAGE = 0.90;

test('interface snapshot catalog covers at least 90% of the public visual component surface', () => {
  const covered = new Set(INTERFACE_SCENARIOS.flatMap((scenario) => scenario.covers));
  const unknown = [...covered].filter((name) => !VISUAL_COMPONENTS.includes(name));
  const missing = VISUAL_COMPONENTS.filter((name) => !covered.has(name));
  const ratio = covered.size / VISUAL_COMPONENTS.length;

  assert.deepEqual(unknown, [], `unknown visual components in scenario coverage: ${unknown.join(', ')}`);
  assert.ok(ratio >= REQUIRED_COVERAGE, `interface coverage ${(ratio * 100).toFixed(1)}% is below 90%; missing: ${missing.join(', ')}`);
});



test('interface scenarios are deterministic across host time zones', () => {
  const utc = renderCatalogInTimezone('UTC');
  const yekaterinburg = renderCatalogInTimezone('Asia/Yekaterinburg');
  assert.deepEqual(yekaterinburg, utc);
});

test('interface scenario ids and golden files are complete, unique and free of stale files', () => {
  const ids = INTERFACE_SCENARIOS.map((scenario) => scenario.id);
  assert.equal(new Set(ids).size, ids.length, 'interface scenario ids must be unique');
  for (const id of ids) assert.equal(fs.existsSync(goldenPath(id)), true, `missing golden file for ${id}`);
  const expected = new Set(ids.map((id) => `${id}.json`));
  const actual = fs.readdirSync(new URL('./goldens/', import.meta.url)).filter((name) => name.endsWith('.json'));
  assert.deepEqual(actual.filter((name) => !expected.has(name)), [], 'stale interface golden files must be removed');
});

for (const scenario of INTERFACE_SCENARIOS) {
  test(`interface golden: ${scenario.id}`, () => {
    const actual = renderScenario(scenario);
    const expected = readGolden(scenario.id);
    assert.deepEqual(actual, expected);
  });

  test(`interface golden audit: ${scenario.id}`, () => {
    const golden = readGolden(scenario.id);
    assert.deepEqual(auditSnapshot(golden), []);
  });
}


function renderCatalogInTimezone(timeZone) {
  const scenariosUrl = new URL('../../scripts/interface-testing/scenarios.js', import.meta.url).href;
  const utilsUrl = new URL('../../scripts/interface-testing/snapshotUtils.js', import.meta.url).href;
  const source = `
    import { INTERFACE_SCENARIOS } from ${JSON.stringify(scenariosUrl)};
    import { renderScenario } from ${JSON.stringify(utilsUrl)};
    process.stdout.write(JSON.stringify(INTERFACE_SCENARIOS.map(renderScenario)));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    encoding: 'utf8',
    env: { ...process.env, TZ: timeZone },
  });
  assert.equal(result.status, 0, result.stderr || `interface render failed in ${timeZone}`);
  return JSON.parse(result.stdout);
}
