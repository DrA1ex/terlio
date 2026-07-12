#!/usr/bin/env node
export * from './support-desk/index.js';

import { isDirectRun } from './_demoRuntime.js';
import { runSupportDeskDemo } from './support-desk/app.js';

if (isDirectRun(import.meta.url)) runSupportDeskDemo();
