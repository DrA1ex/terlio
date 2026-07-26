import fs from 'node:fs';
import path from 'node:path';
import { runGuardedProcess } from './testing/terminalGuard.js';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_ROOT = path.join(ROOT, 'test');
const interfaceTest = path.join(TEST_ROOT, 'interface', 'interfaceSnapshots.test.js');
const coverageTests = collectTestFiles(TEST_ROOT)
  .filter((file) => file !== interfaceTest)
  .map((file) => path.relative(ROOT, file));

const exitCode = await runNode([
  '--test',
  '--experimental-test-coverage',
  '--test-coverage-include=src/lib/**/*.js',
  '--test-coverage-lines=80',
  '--test-coverage-branches=80',
  '--test-coverage-functions=80',
  ...coverageTests,
]);
process.exitCode = exitCode;


function collectTestFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectTestFiles(absolute);
      return entry.isFile() && entry.name.endsWith('.test.js') ? [absolute] : [];
    })
    .sort();
}

function runNode(args) {
  return runGuardedProcess(process.execPath, args, {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  });
}
