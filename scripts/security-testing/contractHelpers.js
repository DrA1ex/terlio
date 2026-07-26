import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

export const SECURITY_CONTRACT_STRICT = process.env.TERLIO_SECURITY_CONTRACT_STRICT === '1';
export const IMPLEMENTED_SECURITY_PHASE = 10;

export function securityContractTest({ audit, outcome, phase }, name, fn) {
  const label = `[${audit}][${outcome}] ${name}`;
  const phaseNumber = Number(/\d+/.exec(String(phase ?? ''))?.[0] ?? Infinity);
  const options = SECURITY_CONTRACT_STRICT || phaseNumber <= IMPLEMENTED_SECURITY_PHASE
    ? {}
    : { todo: `Security contract; expected to remain unmet until ${phase}` };
  return test(label, options, fn);
}

export function platformSecurityContractTest(metadata, name, supported, fn) {
  if (!supported) return test.skip(`[${metadata.audit}][${metadata.outcome}] ${name}`, fn);
  return securityContractTest(metadata, name, fn);
}

export class MemoryOutput extends EventEmitter {
  constructor({ columns = 80, rows = 24, isTTY = true, onWrite = null } = {}) {
    super();
    this.columns = columns;
    this.rows = rows;
    this.isTTY = isTTY;
    this.buffer = '';
    this.writes = [];
    this.onWrite = onWrite;
  }

  write(value) {
    const chunk = String(value ?? '');
    this.writes.push(chunk);
    this.buffer += chunk;
    this.onWrite?.(chunk, this.writes.length);
    return true;
  }
}

export class FakeInput extends EventEmitter {
  constructor({ isTTY = true } = {}) {
    super();
    this.isTTY = isTTY;
    this.rawTransitions = [];
    this.encoding = null;
    this.resumed = false;
  }

  setEncoding(value) { this.encoding = value; }
  setRawMode(value) { this.rawTransitions.push(Boolean(value)); }
  resume() { this.resumed = true; }
  pause() { this.resumed = false; }
}

export function containsTerminalControl(value) {
  const text = String(value ?? '');
  return /[\u001b\u009b\u009d\u0090\u009f\u009e\u0098]/u.test(text);
}

export function containsDangerousTerminalControl(value) {
  const text = String(value ?? '');
  return /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][\s\S]*?(?:\u0007|\u001b\\)|P|_|\^|X)|[\u0090-\u009f]/u.test(text);
}

export function assertNoDangerousTerminalControl(value, message = 'dangerous terminal control sequence escaped the security boundary') {
  assert.equal(containsDangerousTerminalControl(value), false, message);
}

export function assertControlledLimitError(error, resource) {
  assert.ok(error && typeof error === 'object', 'a structured error is required');
  assert.equal(error.code, 'TERLIO_LIMIT_EXCEEDED');
  assert.equal(error.resource, resource);
  assert.ok(Number.isFinite(error.limit));
  assert.ok(Number.isFinite(error.actual));
}

export function createSeededBytes(seed, length) {
  let state = seed >>> 0;
  const bytes = Buffer.alloc(length);
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bytes[index] = state & 0xff;
  }
  return bytes;
}
