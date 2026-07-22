#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES } from '../examples/catalog.js';
import { packageBinName, packageBinPath, packageDisplayName } from '../src/lib/packageMetadata.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const packageName = packageJson.name;
const packageSlug = packageName.replace(/^@/, '').replace(/[^a-z0-9._-]+/gi, '-');
const temp = mkdtempSync(path.join(os.tmpdir(), `${packageSlug}-package-`));

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
      // `npm publish --dry-run` exports npm_config_dry_run=true to lifecycle
      // scripts. Nested `npm pack` and `npm install` must still create and
      // install the temporary tarball used by this verification.
      npm_config_dry_run: 'false',
      ...options.env,
    },
  });
}

try {
  const packOutput = run('npm', [
    'pack',
    '--json',
    '--ignore-scripts',
    '--dry-run=false',
    '--pack-destination',
    temp,
  ]);
  const [pack] = JSON.parse(packOutput);
  assert.equal(pack.name, packageName);
  assert.equal(pack.version, packageJson.version);

  const included = new Set(pack.files.map((file) => file.path));
  const required = [
    'package.json',
    'README.md',
    'LICENSE',
    packageBinPath,
    'src/lib/index.js',
    'examples/catalog.js',
    'examples/chat.js',
    'examples/command-palette.js',
    'examples/components-showcase.js',
    'examples/long-text.js',
    'examples/syntax-highlighting.js',
    'docs/getting-started.md',
    'docs/syntax-highlighting.md',
    'docs/publishing.md',
  ];
  for (const file of required) assert.ok(included.has(file), `packed package is missing ${file}`);
  for (const example of EXAMPLES) assert.ok(included.has(example.file), `packed package is missing example ${example.id}: ${example.file}`);

  const forbidden = ['.git/', 'node_modules/', 'test/', '.github/', 'coverage/', 'dist/', 'build/', '.env', 'CHANGELOG.md'];
  for (const file of included) {
    assert.ok(!forbidden.some((prefix) => file === prefix || file.startsWith(prefix)), `forbidden packed file: ${file}`);
  }

  const consumer = path.join(temp, 'consumer');
  mkdirSync(consumer);
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }, null, 2));
  const tarballCandidates = [
    path.isAbsolute(pack.filename) ? pack.filename : null,
    path.join(temp, pack.filename),
    path.join(root, pack.filename),
    ...readdirSync(temp)
      .filter((name) => name.endsWith('.tgz'))
      .map((name) => path.join(temp, name)),
    ...readdirSync(root)
      .filter((name) => name.endsWith('.tgz'))
      .map((name) => path.join(root, name)),
  ].filter(Boolean);

  const tarball = tarballCandidates.find((candidate) => existsSync(candidate));
  assert.ok(
    tarball,
    `npm pack reported ${pack.filename}, but no tarball was found. Checked: ${tarballCandidates.join(', ')}`,
  );

  run('npm', [
    'install',
    '--ignore-scripts',
    '--no-package-lock',
    '--dry-run=false',
    tarball,
  ], { cwd: consumer });

  const packageSpecifier = JSON.stringify(packageName);
  const exampleSpecifier = JSON.stringify(`${packageName}/examples/components-showcase`);
  const importSmoke = run(process.execPath, ['--input-type=module', '-e', [
    `const { BottomOverlay, Box, Modal, OverlayHost, SelectList, SyntaxText, Text, SelectableText, createOverlayManager, createTextLineSource, createTextSelectionState, highlightSyntax, renderToString, stripAnsi, themes } = await import(${packageSpecifier});`,
    `const { createComponentsShowcaseView } = await import(${exampleSpecifier});`,
    "const output = renderToString(Box({ border: true }, Text('published import works')), { width: 32, height: 3 });",
    "if (!output.includes('published import works')) throw new Error('package import smoke failed');",
    "if (typeof BottomOverlay !== 'function') throw new Error('bottom overlay export smoke failed');",
    "if (typeof SelectableText !== 'function' || typeof createTextSelectionState !== 'function' || typeof createTextLineSource !== 'function') throw new Error('selection export smoke failed');",
    "const listOutput = renderToString(SelectList({ items: [{ kind: 'heading', label: 'Group' }, { label: 'Ready' }], selectedIndex: 0 }), { width: 32, height: 6 });",
    "if (!listOutput.includes('Group') || !listOutput.includes('Ready')) throw new Error('presentation list smoke failed');",
    "const overlays = createOverlayManager();",
    "overlays.modal({ render: ({ width, height }) => Modal({ title: 'Dynamic', children: [String(width) + 'x' + String(height)] }) });",
    "const modalOutput = renderToString(OverlayHost({ content: Text('base'), manager: overlays, width: 40, height: 10 }), { width: 40, height: 10 });",
    "if (!modalOutput.includes('Dynamic')) throw new Error('dynamic modal smoke failed');",
    "const syntaxOutput = highlightSyntax('const answer = 42;', { language: 'javascript', theme: themes.ocean });",
    "if (stripAnsi(syntaxOutput) !== 'const answer = 42;' || !syntaxOutput.includes('\\x1b[')) throw new Error('syntax highlighting export smoke failed');",
    "const syntaxNode = renderToString(SyntaxText({ code: 'let value: Int = 1', filename: 'Example.swift', theme: themes.ocean }), { width: 32, height: 2 });",
    "if (!stripAnsi(syntaxNode).includes('let value')) throw new Error('SyntaxText smoke failed');",
    "if (typeof createComponentsShowcaseView !== 'function') throw new Error('example export smoke failed');",
  ].join('\n')], { cwd: consumer });
  assert.equal(importSmoke, '');

  const binEntries = typeof packageJson.bin === 'string'
    ? { [packageBinName]: packageJson.bin }
    : packageJson.bin;
  const cliRelativePath = binEntries?.[packageBinName] ?? Object.values(binEntries ?? {})[0];
  assert.ok(cliRelativePath, 'package.json must declare at least one bin entry');

  const cli = path.join(consumer, 'node_modules', ...packageName.split('/'), cliRelativePath);
  const examplesOutput = run(process.execPath, [cli, 'examples'], { cwd: consumer });
  assert.match(examplesOutput, new RegExp(`${packageDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} examples`));
  assert.match(examplesOutput, /demo:chat/);
  assert.match(examplesOutput, /example:components/);
  assert.match(examplesOutput, /example:long-text/);
  assert.match(examplesOutput, /example:syntax/);

  const listAliasOutput = run(process.execPath, [cli, 'list'], { cwd: consumer });
  assert.equal(listAliasOutput, examplesOutput);

  const oneShot = run(process.execPath, [cli, 'example:components'], { cwd: consumer });
  assert.match(oneShot, /Component Composition Snapshot/);

  const syntaxExample = run(process.execPath, [cli, 'example:syntax'], { cwd: consumer });
  assert.match(syntaxExample, /Zero-dependency Syntax Highlighting/);

  console.log(`Verified ${packageName} package ${pack.version}: ${pack.entryCount} files, ${pack.size} bytes.`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
