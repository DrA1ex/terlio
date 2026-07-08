#!/usr/bin/env node
export * from './app.js';
export * from './commands.js';
export * from './data.js';
export * from './reducers.js';
export * from './templates.js';
export * from './themes.js';
export * from './views.js';

import { isDirectRun } from '../_demoRuntime.js';
import { runSupportDeskDemo } from './app.js';

if (isDirectRun(import.meta.url)) runSupportDeskDemo();
