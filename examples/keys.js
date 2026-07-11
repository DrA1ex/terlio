#!/usr/bin/env node
import {
  InputEditor,
  KeyHintBar,
  KeyValueBlock,
  RequireViewport,
  Row,
  Text,
  TextEditorView,
  WorkspaceFooter,
  WorkspacePane,
  WorkspaceShell,
  fitInline,
  renderNode,
  resolveWorkspaceShellLayout,
  splitWorkspaceColumns,
  wrapText,
} from '../src/lib/index.js';
import { formatKey, isDirectRun, runInteractiveDemo } from './_demoRuntime.js';
import { EXAMPLE_THEME, visibleScrollableRows } from './_workspaceExampleUtils.js';

export function createKeyInspectorState() {
  return {
    editor: new InputEditor('press keys here'),
    inspected: [],
    recentScroll: 0,
    status: 'Press keys to compare normalized input, raw bytes and InputEditor behavior.',
  };
}

export function createKeyInspectorView({ state, width = 100, height = 28 } = {}) {
  const last = state.inspected.at(-1);
  const layout = splitWorkspaceColumns(width);
  const stats = [
    { label: 'Events', value: state.inspected.length },
    { label: 'Last', value: last ? formatKey(last.key) : '<none>' },
    { label: 'Cursor', value: `${state.editor.cursor}/${Array.from(state.editor.value).length}` },
  ];
  const activity = KeyHintBar({
    title: ' COMPATIBILITY CHECKLIST ',
    hints: [
      ['Option+←/→', 'word navigation'],
      ['Cmd+←/→', 'home/end variants'],
      ['Ctrl+A/E', 'line boundaries'],
      ['Ctrl+K/U/W', 'kill/delete word'],
      ['Tab', 'two-space editor insert'],
      ['Paste', 'bracketed paste payload'],
      ['Esc', 'clear editor'],
      ['Ctrl+C', 'exit'],
    ],
    adaptive: true,
    theme: EXAMPLE_THEME,
  });
  const footer = WorkspaceFooter({ left: [state.status], right: ['All keys are logged before editor handling'], theme: EXAMPLE_THEME });
  const { mainHeight } = resolveWorkspaceShellLayout({
    width, height, title: 'Key Inspector', subtitle: 'TTY normalization and editor compatibility lab', stats,
    focus: 'capture', activity, footer, theme: EXAMPLE_THEME, minMainHeight: 6,
  });

  const wide = width >= 150;
  const medium = width >= 90;
  const widths = wide
    ? [Math.max(36, Math.floor((width - 4) * 0.27)), Math.max(44, Math.floor((width - 4) * 0.43)), Math.max(32, width - 4 - Math.floor((width - 4) * 0.27) - Math.floor((width - 4) * 0.43))]
    : medium
      ? [Math.max(36, Math.floor((width - 2) * 0.42)), Math.max(44, width - 2 - Math.floor((width - 2) * 0.42))]
      : [width];
  const normalized = normalizedPane(last, state, widths[0], mainHeight);
  const editor = editorPane(state, wide ? widths[1] : medium ? widths[1] : width, mainHeight);
  const recent = recentPane(state, wide ? widths[2] : Math.max(34, width), mainHeight);
  let main;
  if (wide) main = Row({ gap: 2, widths }, normalized, editor, recent);
  else if (medium) main = Row({ gap: 2, widths }, normalized, editor);
  else main = editor;

  const shell = WorkspaceShell({
    title: 'Key Inspector', subtitle: 'TTY normalization and editor compatibility lab', stats,
    right: [{ label: 'TTY parity', value: 'macOS · WezTerm · VS Code' }],
    focus: 'capture', main, activity, footer, height, theme: EXAMPLE_THEME,
  });
  return RequireViewport({
    width, height, minWidth: 58, minHeight: 18,
    title: 'Key Inspector needs more room',
    message: 'Resize to see raw key data and the editor result side by side.',
    theme: EXAMPLE_THEME,
    children: shell,
  });
}

export function handleKeyInspectorKey({ key, state }) {
  const before = state.editor.value;
  const beforeCursor = state.editor.cursor;
  const action = applyEditorKey(state.editor, key);
  const inspected = { key, action, before, beforeCursor, after: state.editor.value, afterCursor: state.editor.cursor };
  state.inspected.push(inspected);
  if (state.inspected.length > 120) state.inspected = state.inspected.slice(-120);
  state.recentScroll = Math.max(0, state.inspected.length - 10);
  state.status = `${formatKey(key)} → ${action}`;
}

export function applyEditorKey(editor, key) {
  if (key.name === 'escape') { editor.clear(); return 'clear editor'; }
  if (key.name === 'left') { key.meta || key.word ? editor.moveWord(-1) : editor.move(-1); return key.meta || key.word ? 'move word left' : 'move left'; }
  if (key.name === 'right') { key.meta || key.word ? editor.moveWord(1) : editor.move(1); return key.meta || key.word ? 'move word right' : 'move right'; }
  if (key.name === 'up') { editor.moveVertical(-1); return 'move line up'; }
  if (key.name === 'down') { editor.moveVertical(1); return 'move line down'; }
  if (key.name === 'home' || (key.cmd && key.name === 'left')) { editor.home(); return 'move home'; }
  if (key.name === 'end' || (key.cmd && key.name === 'right')) { editor.end(); return 'move end'; }
  if (key.name === 'backspace') { editor.backspace(); return 'backspace'; }
  if (key.name === 'delete') { editor.deleteForward(); return 'delete forward'; }
  if (key.name === 'kill-end') { editor.killToEnd(); return 'kill to end'; }
  if (key.name === 'kill-start') { editor.killToStart(); return 'kill to start'; }
  if (key.name === 'delete-word-left') { editor.deleteWordBack(); return 'delete word left'; }
  if (key.name === 'paste') { editor.insertPaste ? editor.insertPaste(key.text) : editor.insert(key.text); return `paste ${Array.from(key.text).length} chars`; }
  if (key.name === 'tab') { editor.insert('  '); return 'insert two spaces'; }
  if (key.name === 'enter' && key.ctrl) { editor.insertLineBreak(); return 'insert newline'; }
  if (key.printable) { editor.insert(key.text); return `insert ${JSON.stringify(key.text)}`; }
  return 'no editor action';
}

function normalizedPane(last, state, width, height) {
  const rows = last ? [
    ['name', last.key.name],
    ['sequence', escapeSequence(last.key.sequence)],
    ['printable', last.key.printable ? 'yes' : 'no'],
    ['text', last.key.text ? JSON.stringify(last.key.text) : '<none>'],
    ['modifiers', modifierList(last.key) || '<none>'],
    ['action', last.action],
    ['before', `${JSON.stringify(last.before)} @ ${last.beforeCursor}`],
    ['after', `${JSON.stringify(last.after)} @ ${last.afterCursor}`],
  ] : [['state', 'Press any key to inspect it.']];
  const recent = state.inspected.slice(-4).map((item) => formatInspected(item));
  const lines = [
    ...renderNode(KeyValueBlock({ title: ' Normalized event ', rows }), Math.max(20, width - 4)),
    '',
    'Recent actions',
    ...(recent.length ? recent : ['No key events yet.']),
  ];
  return WorkspacePane({
    title: ' NORMALIZED KEY ',
    height,
    theme: EXAMPLE_THEME,
    children: lines.slice(0, Math.max(1, height - 2)).map((line) => Text(line, { wrap: false })),
  });
}

function editorPane(state, width, height) {
  const position = state.editor.getCursorPosition();
  return WorkspacePane({
    title: ' EDITOR RESULT ',
    active: true,
    height,
    theme: EXAMPLE_THEME,
    children: [
      TextEditorView({
        title: ' InputEditor buffer ',
        value: state.editor.value,
        cursor: state.editor.cursor,
        width: Math.max(24, width - 4),
        height: Math.max(4, Math.min(10, height - 8)),
        placeholder: 'press printable keys or paste text...',
        lineNumbers: true,
      }),
      Text(`cursor ${state.editor.cursor}/${Array.from(state.editor.value).length} · line ${position.line + 1}:${position.column + 1}`, { wrap: false }),
      Text('Unknown sequences remain visible in the event log even when they have no editor action.'),
    ],
  });
}

function recentPane(state, width, height) {
  const rows = state.inspected.length
    ? state.inspected.map((item, index) => `${String(index + 1).padStart(3)}  ${formatInspected(item)}`)
    : ['No key events yet.'];
  const window = visibleScrollableRows(rows, {
    scroll: Math.max(0, rows.length - Math.max(1, height - 3)),
    height: Math.max(3, height - 2),
    width: Math.max(20, width - 4),
    footer: rows.length > Math.max(3, height - 3),
    footerLabel: 'latest normalized events',
  });
  return WorkspacePane({
    title: ' RECENT EVENTS ',
    height,
    theme: EXAMPLE_THEME,
    children: window.rows.map((line) => Text(line, { wrap: false })),
  });
}

function formatInspected(item) {
  return fitInline(`${formatKey(item.key)} → ${item.action}`, 70).trimEnd();
}

function modifierList(key) {
  return ['ctrl', 'meta', 'shift', 'cmd', 'word'].filter((name) => key[name]).join(', ');
}

function escapeSequence(value) {
  if (!value) return '<empty>';
  return String(value)
    .replace(/\x1b/g, '\\x1b')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/[\x00-\x1f\x7f]/g, (char) => `\\x${char.codePointAt(0).toString(16).padStart(2, '0')}`);
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({ title: 'Key Inspector', state: createKeyInspectorState(), render: createKeyInspectorView, onKey: handleKeyInspectorKey });
}
