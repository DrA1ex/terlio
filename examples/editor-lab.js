#!/usr/bin/env node
import { Box, Column, InputEditor, Panel, Row, Text } from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';

export function createEditorLabState() {
  return {
    editor: new InputEditor('try Alt+←, Ctrl+W, paste text, then Enter'),
    history: [
      'write a release note for terminal renderer',
      '/theme ocean',
      'explain how frame diffing reduces flicker',
    ],
    historyIndex: null,
    submitted: [],
    status: 'Editor Lab: type, move cursor, edit words, paste text, submit lines.',
  };
}

export function createEditorLabView({ state, width = 92 }) {
  const editor = state.editor;
  const parts = editor.getParts();
  const cursorPreview = `${parts.before}█${parts.current === ' ' ? '' : parts.current}${parts.after}`;
  const leftWidth = Math.max(28, Math.floor(width * 0.56));
  const rightWidth = Math.max(24, width - leftWidth - 3);

  return Column(
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Editor Lab ' },
      Text('A focused playground for the dependency-free InputEditor. Ctrl+C exits, Ctrl+D exits cleanly.'),
    ),
    Row({ gap: 2, distribute: true },
      Box({ border: true, padding: 1, title: ' Live input ' },
        Text(`value : ${editor.value || '<empty>'}`),
        Text(`cursor: ${editor.cursor}/${Array.from(editor.value).length}`),
        Text(`view  : ${cursorPreview}`),
        Text(''),
        Text('Try: letters, ←/→, Home/End, Ctrl+A/E, Ctrl+K/U/W, Alt+←/→, paste, Enter.'),
      ),
      Box({ border: true, padding: 1, title: ' History ' },
        ...historyLines(state, rightWidth - 4).map((line) => Text(line)),
      ),
    ),
    Row({ gap: 2, distribute: true },
      Panel(' Submitted lines ',
        ...(state.submitted.length ? state.submitted.slice(-6).map((line, index) => Text(`${index + 1}. ${line}`)) : [Text('No submitted lines yet. Press Enter to submit the current input.')]),
      ),
      Panel(' Last keys ',
        ...((state.keyLog?.length ? state.keyLog : ['No keys yet.']).map((line) => Text(line))),
      ),
    ),
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Status ' },
      Text(state.status),
    ),
  );
}

export function handleEditorLabKey({ key, state }) {
  const editor = state.editor;

  if (key.name === 'enter') {
    const line = editor.value.trim();
    if (line) {
      state.submitted.push(line);
      state.history.push(line);
      if (state.history.length > 40) state.history = state.history.slice(-40);
      state.status = `Submitted: ${line}`;
    } else {
      state.status = 'Ignored empty submit.';
    }
    state.historyIndex = null;
    editor.clear();
    return;
  }

  if (key.name === 'up') {
    if (!state.history.length) return;
    if (state.historyIndex === null) state.historyIndex = state.history.length - 1;
    else state.historyIndex = Math.max(0, state.historyIndex - 1);
    editor.set(state.history[state.historyIndex]);
    state.status = 'History: older entry.';
    return;
  }

  if (key.name === 'down') {
    if (state.historyIndex === null) return;
    if (state.historyIndex >= state.history.length - 1) {
      state.historyIndex = null;
      editor.clear();
      state.status = 'History cleared back to draft input.';
      return;
    }
    state.historyIndex += 1;
    editor.set(state.history[state.historyIndex]);
    state.status = 'History: newer entry.';
    return;
  }

  if (key.name === 'left') {
    key.meta ? editor.moveWord(-1) : editor.move(-1);
    state.status = key.meta ? 'Moved one word left.' : 'Moved one char left.';
    return;
  }

  if (key.name === 'right') {
    key.meta ? editor.moveWord(1) : editor.move(1);
    state.status = key.meta ? 'Moved one word right.' : 'Moved one char right.';
    return;
  }

  if (key.name === 'home' || (key.cmd && key.name === 'left')) {
    editor.home();
    state.status = 'Moved to start.';
    return;
  }

  if (key.name === 'end' || (key.cmd && key.name === 'right')) {
    editor.end();
    state.status = 'Moved to end.';
    return;
  }

  if (key.name === 'backspace') {
    editor.backspace();
    state.historyIndex = null;
    state.status = 'Backspace.';
    return;
  }

  if (key.name === 'delete') {
    editor.deleteForward();
    state.historyIndex = null;
    state.status = 'Delete forward.';
    return;
  }

  if (key.name === 'kill-end') {
    editor.killToEnd();
    state.historyIndex = null;
    state.status = 'Killed text to end of line.';
    return;
  }

  if (key.name === 'kill-start') {
    editor.killToStart();
    state.historyIndex = null;
    state.status = 'Killed text to start of line.';
    return;
  }

  if (key.name === 'delete-word-left') {
    editor.deleteWordBack();
    state.historyIndex = null;
    state.status = 'Deleted word on the left.';
    return;
  }

  if (key.name === 'paste') {
    editor.insert(key.text);
    state.historyIndex = null;
    state.status = `Pasted ${Array.from(key.text).length} characters.`;
    return;
  }

  if (key.name === 'tab') {
    editor.insert('  ');
    state.historyIndex = null;
    state.status = 'Inserted two spaces for Tab.';
    return;
  }

  if (key.printable) {
    editor.insert(key.text);
    state.historyIndex = null;
    state.status = `Inserted ${JSON.stringify(key.text)}.`;
  }
}

function historyLines(state, width) {
  return state.history.slice(-9).map((line, index, list) => {
    const absoluteIndex = state.history.length - list.length + index;
    const marker = absoluteIndex === state.historyIndex ? '›' : ' ';
    const text = line.length > width - 4 ? line.slice(0, Math.max(0, width - 5)) + '…' : line;
    return `${marker} ${text}`;
  });
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Editor Lab',
    state: createEditorLabState(),
    render: createEditorLabView,
    onKey: handleEditorLabKey,
  });
}
