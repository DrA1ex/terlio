import { readdirSync } from 'node:fs';
import path from 'node:path';
import { runGuardedProcess } from '../testing/terminalGuard.js';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const contractDir = path.join(root, 'test/security/contract');
const strict = process.argv.includes('--strict');
const files = readdirSync(contractDir)
  .filter((name) => name.endsWith('.contract.test.js'))
  .sort()
  .map((name) => path.join(contractDir, name));

process.exitCode = await runGuardedProcess(process.execPath, ['--test', ...files], {
  cwd: root,
  env: {
    ...process.env,
    TERLIO_SECURITY_CONTRACT_STRICT: strict ? '1' : '0',
  },
  stdio: 'inherit',
});
