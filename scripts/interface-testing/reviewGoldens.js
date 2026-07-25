import { INTERFACE_SCENARIOS, VISUAL_COMPONENTS } from './scenarios.js';
import { readGolden } from './snapshotUtils.js';

const covered = new Set(INTERFACE_SCENARIOS.flatMap((scenario) => scenario.covers));
console.log(`Interface coverage: ${covered.size}/${VISUAL_COMPONENTS.length} (${((covered.size / VISUAL_COMPONENTS.length) * 100).toFixed(1)}%)`);
for (const scenario of INTERFACE_SCENARIOS) {
  const golden = readGolden(scenario.id);
  console.log(`\n===== ${scenario.id} · ${scenario.title} · ${golden.width}×${golden.height} =====`);
  console.log(golden.plain.join('\n'));
  console.log(`pointer regions: ${golden.pointerRegions.length}`);
}
