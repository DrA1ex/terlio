const BASE_KEY = Object.freeze({
  text: '',
  printable: false,
  ctrl: false,
  meta: false,
  shift: false,
  cmd: false,
});

const NAMED = new Map([
  ['\x03', { name: 'ctrl-c', ctrl: true }],
  ['\x04', { name: 'ctrl-d', ctrl: true }],
  ['\x0f', { name: 'o', ctrl: true }],
  ['\x10', { name: 'command-palette', ctrl: true }],
  ['\x1b', { name: 'escape' }],
  ['\r', { name: 'enter' }],
  ['\n', { name: 'enter', ctrl: true }],
  ['\t', { name: 'tab' }],
  ['\x1b[Z', { name: 'tab', shift: true }],
  ['\x7f', { name: 'backspace' }],
  ['\b', { name: 'backspace' }],
  ['\x1b[3~', { name: 'delete' }],
  ['\x01', { name: 'home', ctrl: true }],
  ['\x05', { name: 'end', ctrl: true }],
  ['\x0b', { name: 'kill-end', ctrl: true }],
  ['\x15', { name: 'kill-start', ctrl: true }],
  ['\x17', { name: 'delete-word-left', ctrl: true }],
  ['\x0c', { name: 'redraw', ctrl: true }],
  ['\x1bb', { name: 'left', meta: true, word: true }],
  ['\x1bf', { name: 'right', meta: true, word: true }],
  ['\x1b[A', { name: 'up' }],
  ['\x1b[B', { name: 'down' }],
  ['\x1b[C', { name: 'right' }],
  ['\x1b[D', { name: 'left' }],
  ['\x1b[H', { name: 'home' }],
  ['\x1b[1~', { name: 'home' }],
  ['\x1bOH', { name: 'home' }],
  ['\x1b[F', { name: 'end' }],
  ['\x1b[4~', { name: 'end' }],
  ['\x1bOF', { name: 'end' }],
  ['\x1b[5~', { name: 'page-up' }],
  ['\x1b[6~', { name: 'page-down' }],
]);

const ARROW_BY_FINAL = {
  A: 'up',
  B: 'down',
  C: 'right',
  D: 'left',
  H: 'home',
  F: 'end',
};

export function parseKey(data) {
  const sequence = Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '');

  const paste = /^\x1b\[200~([\s\S]*)\x1b\[201~$/.exec(sequence);
  if (paste) return key({ name: 'paste', sequence, text: paste[1] });

  if (NAMED.has(sequence)) return key({ sequence, ...NAMED.get(sequence) });

  const csi = /^\x1b\[1;(\d+)([A-DHF])$/.exec(sequence);
  if (csi) {
    const modifier = Number(csi[1]);
    return key({ sequence, name: ARROW_BY_FINAL[csi[2]], ...modifierFlags(modifier), word: modifier === 3 });
  }


  const csiU = /^\x1b\[(\d+);(\d+)u$/.exec(sequence);
  if (csiU) {
    const code = Number(csiU[1]);
    const modifier = Number(csiU[2]);
    if (code === 13 || code === 10) return key({ sequence, name: 'enter', ...modifierFlags(modifier) });
    const normalized = keyFromCsiU({ code, modifier, sequence });
    if (normalized) return key(normalized);
  }

  const modifiedEnter = /^\x1b\[27;(\d+);13~$/.exec(sequence);
  if (modifiedEnter) return key({ sequence, name: 'enter', ...modifierFlags(Number(modifiedEnter[1])) });

  if (isPrintable(sequence)) {
    return key({ name: sequence, sequence, text: sequence, printable: true });
  }

  return key({ name: 'unknown', sequence });
}

export function isPrintable(value) {
  if (!value) return false;
  if (value.startsWith('\x1b')) return false;
  for (const char of Array.from(value)) {
    const code = char.codePointAt(0);
    if (code === undefined || code < 32 || code === 127) return false;
  }
  return true;
}


function keyFromCsiU({ code, modifier, sequence }) {
  if (!Number.isFinite(code)) return null;
  const flags = modifierFlags(modifier);
  const text = String.fromCodePoint(code);
  const lower = text.toLowerCase();
  if (flags.ctrl && lower === 'p') return { sequence, name: 'command-palette', ...flags };
  if (/^[a-z]$/i.test(text)) {
    const printable = !flags.ctrl && !flags.meta && !flags.cmd;
    return { sequence, name: lower, text: printable ? text : '', printable, ...flags };
  }
  if (isPrintable(text) && !flags.ctrl && !flags.meta && !flags.cmd) {
    return { sequence, name: text, text, printable: true, ...flags };
  }
  return null;
}

function key(overrides) {
  return {
    ...BASE_KEY,
    name: 'unknown',
    sequence: overrides.sequence ?? '',
    ...overrides,
  };
}

function modifierFlags(modifier) {
  // xterm CSI modifier encoding: 2 shift, 3 alt/meta, 4 shift+alt,
  // 5 ctrl, 6 shift+ctrl, 7 alt+ctrl, 8 shift+alt+ctrl.
  // Some macOS terminals emit 9 for Command+Arrow.
  if (modifier === 9) return { cmd: true };
  return {
    shift: [2, 4, 6, 8].includes(modifier),
    meta: [3, 4, 7, 8].includes(modifier),
    ctrl: [5, 6, 7, 8].includes(modifier),
  };
}
