#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES } from '../examples/catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(path.join(os.tmpdir(), 'terlio-package-'));

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      npm_config_registry: 'https://registry.npmjs.org/',
      npm_config_fund: 'false',
      npm_config_audit: 'false',
      ...options.env,
    },
  });
}

try {
  const packOutput = run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temp]);
  const [pack] = JSON.parse(packOutput);
  assert.equal(pack.name, 'terlio');
  assert.equal(pack.version, JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version);

  const included = new Set(pack.files.map((file) => file.path));
  const required = [
    'package.json',
    'README.md',
    'LICENSE',
    'CHANGELOG.md',
    'bin/terlio.js',
    'src/lib/index.js',
    'examples/catalog.js',
    'examples/chat.js',
    'examples/command-palette.js',
    'examples/components-showcase.js',
    'docs/getting-started.md',
    'docs/publishing.md',
  ];
  for (const file of required) assert.ok(included.has(file), `packed package is missing ${file}`);
  for (const example of EXAMPLES) assert.ok(included.has(example.file), `packed package is missing example ${example.id}: ${example.file}`);

  const forbidden = ['.git/', 'node_modules/', 'test/', '.github/', 'coverage/', 'dist/', 'build/', '.env'];
  for (const file of included) {
    assert.ok(!forbidden.some((prefix) => file === prefix || file.startsWith(prefix)), `forbidden packed file: ${file}`);
  }

  const consumer = path.join(temp, 'consumer');
  mkdirSync(consumer);
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }, null, 2));
  const tarball = path.join(temp, pack.filename);
  run('npm', ['install', '--ignore-scripts', '--no-package-lock', tarball], { cwd: consumer });

  const importSmoke = run(process.execPath, ['--input-type=module', '-e', [
    "import { Box, Text, renderToString } from 'terlio';",
    "import { createComponentsShowcaseView } from 'terlio/examples/components-showcase';",
    "const output = renderToString(Box({ border: true }, Text('published import works')), { width: 32, height: 3 });",
    "if (!output.includes('published import works')) throw new Error('package import smoke failed');",
    "if (typeof createComponentsShowcaseView !== 'function') throw new Error('example export smoke failed');",
  ].join('\n')], { cwd: consumer });
  assert.equal(importSmoke, '');

  const cli = path.join(consumer, 'node_modules', 'terlio', 'bin', 'terlio.js');
  const listOutput = run(process.execPath, [cli, 'list'], { cwd: consumer });
  assert.match(listOutput, /Terlio examples/);
  assert.match(listOutput, /demo:chat/);
  assert.match(listOutput, /example:components/);

  const oneShot = run(process.execPath, [cli, 'example:components'], { cwd: consumer });
  assert.match(oneShot, /Component Composition Snapshot/);

  console.log(`Verified terlio package ${pack.version}: ${pack.entryCount} files, ${pack.size} bytes.`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
