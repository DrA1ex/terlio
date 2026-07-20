import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { EXAMPLES, findExample } from '../examples/catalog.js';
import { formatExampleCatalog } from '../examples/index.js';
import {
  packageBinName,
  packageBinPath,
  packageDisplayName,
  packageName,
  packageUnscopedName,
} from '../src/lib/packageMetadata.js';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
const examplesDocumentation = await readFile(new URL('../docs/examples.md', import.meta.url), 'utf8');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('package metadata is ready for public distribution', async () => {
  assert.equal(packageJson.name, packageName);
  assert.equal(packageBinName, packageUnscopedName, 'the primary CLI name should follow the package name');
  assert.match(packageJson.name, /^(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/);
  assert.equal(typeof packageBinPath, 'string');
  assert.ok(packageBinPath.length > 0);
  assert.notEqual(packageJson.private, true);
  assert.equal(packageJson.publishConfig.access, 'public');
  assert.equal(packageJson.publishConfig.registry, 'https://registry.npmjs.org/');
  assert.ok(packageJson.files.includes('bin'));
  assert.ok(packageJson.files.includes('examples'));
  assert.ok(packageJson.files.includes('docs'));
  assert.ok(!packageJson.files.includes('CHANGELOG.md'));
  assert.equal(packageJson.exports['./examples/*'], './examples/*.js');

  const keywords = new Set(packageJson.keywords ?? []);
  for (const keyword of ['terminal', 'tui', 'cli', 'terminal-ui', 'command-palette']) {
    assert.ok(keywords.has(keyword), `package.json keywords should include ${keyword}`);
  }
  assert.ok(keywords.size >= 10, 'package.json should provide a useful npm search keyword set');

  await access(new URL(`../${packageBinPath}`, import.meta.url));
  await access(new URL('../LICENSE', import.meta.url));
});


test('README keeps usage documentation separate from release history', () => {
  assert.match(readme, /npx terlio\.js examples/);
  assert.match(readme, /npx terlio\.js example:long-text/);
  assert.match(readme, /npm run examples/);
  assert.doesNotMatch(readme, /^## Project status$/m);
  assert.doesNotMatch(readme, /Terlio\.js 1\.1 adds/);
});

test('long-text uses the shared packaged example catalog and documentation', () => {
  const entry = findExample('example:long-text');
  assert.equal(entry?.id, 'example:long-text');
  assert.equal(entry?.file, 'examples/long-text.js');
  assert.equal(entry?.interactive, true);
  assert.match(formatExampleCatalog(), /example:long-text/);
  assert.match(examplesDocumentation, /### Long Text Performance Lab — `example:long-text`/);
  assert.match(examplesDocumentation, /npx terlio\.js example:long-text --lines=50000/);
});

test('packaged example catalog resolves full ids and short names', () => {
  assert.ok(EXAMPLES.length >= 10);
  assert.equal(findExample('demo:chat')?.file, 'examples/chat.js');
  assert.equal(findExample('chat')?.id, 'demo:chat');
  assert.equal(findExample('palette')?.id, 'example:palette');
  assert.equal(findExample('long-text')?.id, 'example:long-text');
  assert.equal(findExample('components')?.interactive, false);
  assert.equal(findExample('does-not-exist'), null);

  const output = formatExampleCatalog();
  assert.match(output, new RegExp(`${escapeRegExp(packageDisplayName)} examples`));
  assert.match(output, new RegExp(`npx ${escapeRegExp(packageBinName)} demo:chat`));
  assert.match(output, new RegExp(`npx ${escapeRegExp(packageBinName)} example:components`));
  assert.match(output, new RegExp(`npx ${escapeRegExp(packageBinName)} example:long-text`));
});
