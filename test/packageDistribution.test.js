import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { EXAMPLES, findExample } from '../examples/catalog.js';
import { formatExampleCatalog } from '../examples/index.js';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('package metadata is ready for public terlio distribution', async () => {
  assert.equal(packageJson.name, 'terlio');
  assert.equal(packageJson.bin.terlio, 'bin/terlio.js');
  assert.equal(packageJson.publishConfig.access, 'public');
  assert.equal(packageJson.publishConfig.registry, 'https://registry.npmjs.org/');
  assert.ok(packageJson.files.includes('bin'));
  assert.ok(packageJson.files.includes('examples'));
  assert.ok(packageJson.files.includes('docs'));
  assert.equal(packageJson.exports['./examples/*'], './examples/*.js');
  await access(new URL('../bin/terlio.js', import.meta.url));
  await access(new URL('../LICENSE', import.meta.url));
});

test('packaged example catalog resolves full ids and short names', () => {
  assert.ok(EXAMPLES.length >= 10);
  assert.equal(findExample('demo:chat')?.file, 'examples/chat.js');
  assert.equal(findExample('chat')?.id, 'demo:chat');
  assert.equal(findExample('palette')?.id, 'example:palette');
  assert.equal(findExample('components')?.interactive, false);
  assert.equal(findExample('does-not-exist'), null);

  const output = formatExampleCatalog();
  assert.match(output, /Terlio examples/);
  assert.match(output, /npx terlio demo:chat/);
  assert.match(output, /npx terlio example:components/);
});
