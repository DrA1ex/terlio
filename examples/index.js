#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageDisplayName, packageNpxCommand } from '../src/lib/packageMetadata.js';
import { EXAMPLE_GROUPS } from './catalog.js';

export function formatExampleCatalog({ command = packageNpxCommand } = {}) {
  const lines = [
    `${packageDisplayName} examples`,
    '',
    `Run an installed example with \`${command} <id>\`.`,
    '',
  ];

  for (const group of EXAMPLE_GROUPS) {
    lines.push(`${group.title}:`);
    for (const item of group.items) {
      const suffix = item.interactive ? 'interactive TTY' : 'one-shot stdout';
      lines.push(`  ${`${command} ${item.id}`.padEnd(40)} ${item.description} (${suffix})`);
    }
    lines.push('');
  }

  lines.push('Repository checkout aliases remain available through `npm run example:*` and `npm run demo:*`.');
  return lines.join('\n');
}

function isDirectRun(metaUrl) {
  return Boolean(process.argv[1]) && path.resolve(fileURLToPath(metaUrl)) === path.resolve(process.argv[1]);
}

if (isDirectRun(import.meta.url)) console.log(formatExampleCatalog());
