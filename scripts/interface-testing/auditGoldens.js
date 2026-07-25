import fs from 'node:fs';
import path from 'node:path';
import { INTERFACE_SCENARIOS, VISUAL_COMPONENTS } from './scenarios.js';
import { GOLDEN_DIRECTORY, auditSnapshot, readGolden } from './snapshotUtils.js';

const covered = new Set(INTERFACE_SCENARIOS.flatMap((scenario) => scenario.covers));
const missing = VISUAL_COMPONENTS.filter((name) => !covered.has(name));
const ratio = covered.size / VISUAL_COMPONENTS.length;
const failures = [];

for (const scenario of INTERFACE_SCENARIOS) {
  const golden = readGolden(scenario.id);
  const issues = auditSnapshot(golden);
  if (issues.length) failures.push({ id: scenario.id, issues });
}

const knownFiles = new Set(INTERFACE_SCENARIOS.map((scenario) => `${scenario.id}.json`));
const stale = fs.readdirSync(GOLDEN_DIRECTORY).filter((name) => name.endsWith('.json') && !knownFiles.has(name));

console.log(`Visual component coverage: ${covered.size}/${VISUAL_COMPONENTS.length} (${(ratio * 100).toFixed(1)}%)`);
if (missing.length) console.log(`Not covered: ${missing.join(', ')}`);
if (stale.length) failures.push({ id: 'catalog', issues: stale.map((name) => `stale golden file ${name}`) });

if (failures.length) {
  for (const failure of failures) {
    console.error(`\n${failure.id}`);
    for (const issue of failure.issues) console.error(`  - ${issue}`);
  }
  process.exit(1);
}

console.log(`Verified ${INTERFACE_SCENARIOS.length} golden frames in ${path.relative(process.cwd(), GOLDEN_DIRECTORY)}.`);
