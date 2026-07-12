#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES, findExample } from '../examples/catalog.js';
import { formatExampleCatalog } from '../examples/index.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const args = process.argv.slice(2);

function printHelp() {
  console.log(`Terlio ${packageJson.version}\n\nUsage:\n  terlio list\n  terlio <demo:chat|example:palette|name> [-- example args]\n  terlio run <id> [-- example args]\n\nExamples:\n  npx terlio demo:chat\n  npx terlio example:palette\n  npx terlio components\n\nInteractive examples require a real TTY.\n`);
}

function resolveRequest(argv) {
  if (!argv.length) return { type: 'help' };
  const [first, second, ...rest] = argv;
  if (first === '--help' || first === '-h' || first === 'help') return { type: 'help' };
  if (first === '--version' || first === '-v' || first === 'version') return { type: 'version' };
  if (first === 'list' || first === 'examples') return { type: 'list' };
  if (first === 'run') return { type: 'run', id: second, args: rest };
  if ((first === 'demo' || first === 'example') && second) return { type: 'run', id: `${first}:${second}`, args: rest };
  return { type: 'run', id: first, args: argv.slice(1) };
}

const request = resolveRequest(args);
if (request.type === 'help') {
  printHelp();
  process.exit(0);
}
if (request.type === 'version') {
  console.log(packageJson.version);
  process.exit(0);
}
if (request.type === 'list') {
  console.log(formatExampleCatalog({ command: 'npx terlio' }));
  process.exit(0);
}

const example = findExample(request.id);
if (!example) {
  console.error(`Unknown Terlio example: ${request.id || '<missing>'}`);
  console.error(`Available ids: ${EXAMPLES.map((item) => item.id).join(', ')}`);
  process.exit(1);
}

const entry = path.join(packageRoot, example.file);
const result = spawnSync(process.execPath, [entry, ...(request.args ?? [])], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 0);
