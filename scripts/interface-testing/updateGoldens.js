import { INTERFACE_SCENARIOS } from './scenarios.js';
import { auditSnapshot, renderScenario, writeGolden } from './snapshotUtils.js';

if (process.env.TERLIO_UPDATE_INTERFACE_GOLDENS !== '1') {
  console.error('Refusing to update interface goldens without TERLIO_UPDATE_INTERFACE_GOLDENS=1.');
  process.exit(2);
}

let failed = false;
for (const scenario of INTERFACE_SCENARIOS) {
  const snapshot = renderScenario(scenario);
  const issues = auditSnapshot(snapshot);
  if (issues.length) {
    failed = true;
    console.error(`Cannot write ${scenario.id}:`);
    for (const issue of issues) console.error(`  - ${issue}`);
    continue;
  }
  writeGolden(snapshot);
  console.log(`updated ${scenario.id}`);
}

if (failed) process.exit(1);
