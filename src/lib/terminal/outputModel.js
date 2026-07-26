export const TERMINAL_OUTPUT_TYPES = Object.freeze({
  TEXT: 'text',
  STYLE: 'style',
  LINE_BREAK: 'line-break',
  TAB: 'tab',
  POINTER_REGION: 'pointer-region',
  HYPERLINK: 'hyperlink',
  CONTROL: 'control',
  UNSAFE_RAW: 'unsafe-raw',
  CLIPBOARD_WRITE: 'clipboard-write',
});

export function terminalText(value) {
  return Object.freeze({ type: TERMINAL_OUTPUT_TYPES.TEXT, value: String(value ?? '') });
}

export function terminalStyle(value, metadata = {}) {
  return Object.freeze({ type: TERMINAL_OUTPUT_TYPES.STYLE, value: String(value ?? ''), metadata: { ...metadata } });
}

export function terminalLineBreak() {
  return Object.freeze({ type: TERMINAL_OUTPUT_TYPES.LINE_BREAK, value: '\n' });
}

export function terminalTab() {
  return Object.freeze({ type: TERMINAL_OUTPUT_TYPES.TAB, value: '\t' });
}

export function terminalPointerRegion(region) {
  return Object.freeze({ type: TERMINAL_OUTPUT_TYPES.POINTER_REGION, region });
}

export function terminalHyperlink(label, uri, metadata = {}) {
  return Object.freeze({ type: TERMINAL_OUTPUT_TYPES.HYPERLINK, label: String(label ?? ''), uri: String(uri ?? ''), metadata: { ...metadata } });
}

export function terminalControl(value, metadata = {}) {
  return Object.freeze({ type: TERMINAL_OUTPUT_TYPES.CONTROL, value: String(value ?? ''), metadata: { ...metadata } });
}

export function terminalUnsafeRaw(value, metadata = {}) {
  return Object.freeze({ type: TERMINAL_OUTPUT_TYPES.UNSAFE_RAW, value: String(value ?? ''), metadata: { ...metadata } });
}


export function terminalClipboardWrite(value, metadata = {}) {
  return Object.freeze({
    type: TERMINAL_OUTPUT_TYPES.CLIPBOARD_WRITE,
    value: String(value ?? ''),
    metadata: { ...metadata },
  });
}

export function createTerminalOutputFrame({
  operations = [],
  cells = [],
  styles = [],
  regions = [],
  links = [],
  unsafeSequences = [],
  legacyBytes = null,
} = {}) {
  return Object.freeze({
    type: 'terminal-output-frame',
    operations: Object.freeze(Array.from(operations)),
    cells: Object.freeze(Array.from(cells)),
    styles: Object.freeze(Array.from(styles)),
    regions: Object.freeze(Array.from(regions)),
    links: Object.freeze(Array.from(links)),
    unsafeSequences: Object.freeze(Array.from(unsafeSequences)),
    legacyBytes: legacyBytes == null ? null : String(legacyBytes),
  });
}

export function legacyTerminalOutput(value, metadata = {}) {
  const bytes = String(value ?? '');
  const operation = terminalUnsafeRaw(bytes, { source: 'legacy-adapter', ...metadata });
  return createTerminalOutputFrame({
    operations: bytes ? [operation] : [],
    unsafeSequences: bytes ? [operation] : [],
    legacyBytes: bytes,
    regions: metadata.regions ?? [],
  });
}

export function serializeTerminalOutputFrame(frame) {
  if (frame == null) return '';
  if (typeof frame === 'string' || Buffer.isBuffer(frame)) return String(frame);
  if (frame.type === 'terminal-output-frame') {
    if (typeof frame.legacyBytes === 'string') return frame.legacyBytes;
    return Array.from(frame.operations ?? []).map(serializeOperation).join('');
  }
  return String(frame);
}

function serializeOperation(operation) {
  if (!operation) return '';
  if (operation.type === TERMINAL_OUTPUT_TYPES.LINE_BREAK) return '\n';
  if (operation.type === TERMINAL_OUTPUT_TYPES.TAB) return '\t';
  if ('value' in operation) return String(operation.value ?? '');
  if (operation.type === TERMINAL_OUTPUT_TYPES.HYPERLINK) return String(operation.label ?? '');
  return '';
}
