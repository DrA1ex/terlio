#!/usr/bin/env node
import { runGuardedProcess } from './testing/terminalGuard.js';

const exitCode = await runGuardedProcess(process.execPath, ['--test', ...process.argv.slice(2)]);
process.exitCode = exitCode;
