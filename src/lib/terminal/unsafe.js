import { terminalUnsafeRaw } from './outputModel.js';

export function unsafeRawAnsi(value, metadata = {}) {
  return terminalUnsafeRaw(value, { explicitUnsafe: true, ...metadata });
}
