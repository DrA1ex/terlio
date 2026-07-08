#!/usr/bin/env node
import { Box, Column, HelpOverlay, InputEditor, Panel, Row, Text } from '../src/lib/index.js';
import { formatKey, isDirectRun, runInteractiveDemo } from './_demoRuntime.js';

export function createKeyInspectorState() {
  return {
    editor: new InputEditor('press keys here'),
    inspected: [],
    status: 'Key Inspector: press arrows, Option/Cmd arrows, Backspace/Delete, paste, Ctrl+A/E/K/U/W.',
  };
}

export function createKeyInspectorView({ state, width = 100 } = {}) {
  const last = state.inspected.at(-1);
  const parts = state.editor.getParts();
  const preview = `${parts.before}█${parts.current === ' ' ? '' : parts.current}${parts.after}`;

  return Column(
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Key Inspector ' },
      Text('A compatibility lab for terminal escape sequences and editor actions.'),
      Text('Use it on macOS/iTerm/Terminal/VS Code to see exactly what the TTY sends.'),
    ),
    Row({ gap: 2, distribute: true },
      Panel(' Normalized key ',
        ...(last ? keyDetails(last).map((line) => Text(line)) : [Text('Press any key to inspect it.')]),
      ),
      Panel(' Editor result ',
        Text(`value : ${state.editor.value || '<empty>'}`),
        Text(`cursor: ${state.editor.cursor}/${Array.from(state.editor.value).length}`),
        Text(`view  : ${preview}`),
        Text(''),
        Text(state.status),
      ),
    ),
    Row({ gap: 2, distribute: true },
      Panel(' Recent keys ',
        ...((state.inspected.length ? state.inspected.slice(-10).map((item) => formatInspected(item)) : ['No keys yet.']).map((line) => Text(line))),
      ),
      HelpOverlay({
        title: ' Try these ',
        shortcuts: [
          ['Option+←/→', 'word movement / meta arrows'],
          ['Cmd+←/→', 'home/end if your terminal emits CSI 1;9'],
          ['Ctrl+A/E', 'home/end'],
          ['Ctrl+K/U/W', 'kill to end/start, delete word'],
          ['Paste', 'bracketed paste if terminal supports it'],
          ['Esc', 'clear editor'],
        ],
      }),
    ),
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Raw sequence note ' },
      Text(fitText('Raw escape sequences are escaped for readability. Unknown keys are still logged, which makes this demo useful when adding terminal compatibility fixes.', width - 6)),
    ),
  );
}

export function handleKeyInspectorKey({ key, state }) {
  const before = state.editor.value;
  const beforeCursor = state.editor.cursor;
  const action = applyEditorKey(state.editor, key);
  const inspected = {
    key,
    action,
    before,
    beforeCursor,
    after: state.editor.value,
    afterCursor: state.editor.cursor,
  };
  state.inspected.push(inspected);
  if (state.inspected.length > 80) state.inspected = state.inspected.slice(-80);
  state.status = action;
}

export function applyEditorKey(editor, key) {
  if (key.name === 'escape') {
    editor.clear();
    return 'clear editor';
  }
  if (key.name === 'left') {
    key.meta || key.word ? editor.moveWord(-1) : editor.move(-1);
    return key.meta || key.word ? 'move word left' : 'move left';
  }
  if (key.name === 'right') {
    key.meta || key.word ? editor.moveWord(1) : editor.move(1);
    return key.meta || key.word ? 'move word right' : 'move right';
  }
  if (key.name === 'home' || (key.cmd && key.name === 'left')) {
    editor.home();
    return 'move home';
  }
  if (key.name === 'end' || (key.cmd && key.name === 'right')) {
    editor.end();
    return 'move end';
  }
  if (key.name === 'backspace') {
    editor.backspace();
    return 'backspace';
  }
  if (key.name === 'delete') {
    editor.deleteForward();
    return 'delete forward';
  }
  if (key.name === 'kill-end') {
    editor.killToEnd();
    return 'kill to end';
  }
  if (key.name === 'kill-start') {
    editor.killToStart();
    return 'kill to start';
  }
  if (key.name === 'delete-word-left') {
    editor.deleteWordBack();
    return 'delete word left';
  }
  if (key.name === 'paste') {
    editor.insert(key.text);
    return `paste ${Array.from(key.text).length} chars`;
  }
  if (key.name === 'tab') {
    editor.insert('  ');
    return 'insert two spaces';
  }
  if (key.printable) {
    editor.insert(key.text);
    return `insert ${JSON.stringify(key.text)}`;
  }
  return 'no editor action';
}

function keyDetails(item) {
  const key = item.key;
  return [
    `name      : ${key.name}`,
    `sequence  : ${escapeSequence(key.sequence)}`,
    `printable : ${key.printable ? 'yes' : 'no'}`,
    `text      : ${key.text ? JSON.stringify(key.text) : '<none>'}`,
    `modifiers : ${modifierList(key) || '<none>'}`,
    `action    : ${item.action}`,
    `before    : ${JSON.stringify(item.before)} @ ${item.beforeCursor}`,
    `after     : ${JSON.stringify(item.after)} @ ${item.afterCursor}`,
  ];
}

function formatInspected(item) {
  return `${formatKey(item.key).padEnd(28)} → ${item.action}`;
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

function fitText(value, width) {
  const text = String(value ?? '');
  return text.length > width ? text.slice(0, Math.max(0, width - 1)) + '…' : text;
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Key Inspector',
    state: createKeyInspectorState(),
    render: createKeyInspectorView,
    onKey: handleKeyInspectorKey,
  });
}
