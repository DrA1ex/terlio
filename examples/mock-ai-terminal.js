#!/usr/bin/env node
import { RichTerminalApp } from '../src/lib/app.js';

let exiting = false;

const app = new RichTerminalApp({
  onExit: (code = 0) => shutdown(code),
});

function shutdown(code = 0) {
  if (exiting) return;
  exiting = true;
  app.stop();
  process.exitCode = code;

  // Let final TTY restoration writes flush, then terminate explicitly.
  setImmediate(() => process.exit(code));
}

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));
process.on('uncaughtException', (error) => {
  app.stop();
  console.error(error);
  shutdown(1);
});
process.on('unhandledRejection', (error) => {
  app.stop();
  console.error(error);
  shutdown(1);
});

try {
  app.start();
} catch (error) {
  console.error(error.message);
  shutdown(1);
}
