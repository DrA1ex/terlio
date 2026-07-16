#!/usr/bin/env node
import {
  InputEditor,
  KeyHintBar,
  RequireViewport,
  Panel,
  Row,
  Text,
  TextEditorView,
  renderNode,
  color,
  WorkspaceFooter,
  WorkspacePane,
  WorkspaceShell,
  fitInline,
  splitWorkspaceColumns,
  resolveWorkspaceShellLayout,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';
import {
  EXAMPLE_THEME,
  cycleTab,
  isShiftLineScroll,
  responsiveTabHint,
  responsiveTabs,
  scrollOffset,
  scrollToVisible,
  shiftLineScrollDelta,
  visibleScrollableRows,
  wheelScrollDelta,
} from './_workspaceExampleUtils.js';

const TABS = [
  { id: 'editor', label: 'Editor' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'history', label: 'History' },
];

const SAMPLE_HISTORY = [
  'write a release note for terminal renderer',
  '/theme ocean',
  'explain how frame diffing reduces flicker',
  'draft an answer with code, warning and command blocks',
];

export function createEditorLabState() {
  return {
    editor: new InputEditor('try Alt+←, Ctrl+W, paste text, then Enter'),
    history: [...SAMPLE_HISTORY],
    historyIndex: null,
    editingHistoryIndex: null,
    historySelection: 0,
    submitted: [],
    activeTab: 'editor',
    paneScroll: { diagnostics: 0, history: 0 },
    paneRows: { diagnostics: 6, history: 6 },
    ensureHistoryVisible: false,
    status: 'Type and edit the draft, then press Enter to submit. Use PgUp/PgDn for long panes.',
  };
}

export function createEditorLabView({ state, width = 92, height = 28 } = {}) {
  const layout = splitWorkspaceColumns(width);
  const helpHints = contextHelpHints(state, height);
  const visibleTabs = responsiveTabs(TABS, state.activeTab, width, { pinned: ['editor'] });
  const editor = state.editor;
  const stats = [
    { label: 'Chars', value: Array.from(editor.value).length },
    { label: 'Words', value: wordCount(editor.value) },
    { label: 'Cursor', value: `${editor.getCursorPosition().line + 1}:${editor.getCursorPosition().column + 1}` },
  ];
  const right = [
    { label: 'Submitted', value: state.submitted.length },
    { label: 'Saved drafts', value: state.history.length },
  ];
  const tabHint = responsiveTabHint('Tab focus · Ctrl+J newline · Enter submit/load · PgUp/PgDn scroll · Ctrl+C exit', TABS, visibleTabs);
  const activity = helpHints.length ? KeyHintBar({
    title: ' LOCAL HELP ',
    hints: helpHints,
    theme: EXAMPLE_THEME,
    adaptive: true,
  }) : null;
  const footer = WorkspaceFooter({ left: [state.status], right: [`focus: ${state.activeTab}`], theme: EXAMPLE_THEME });
  const { mainHeight } = resolveWorkspaceShellLayout({
    width, height, title: 'Editor Lab', subtitle: 'InputEditor compatibility desk', stats, right,
    focus: state.activeTab, tabs: visibleTabs, activeTab: state.activeTab, tabHint,
    activity, footer, theme: EXAMPLE_THEME, minMainHeight: 5,
  });
  const main = layout.mode === 'wide'
    ? Row({ gap: 2, widths: layout.widths },
        editorPane(state, Math.max(30, layout.widths[0]), mainHeight),
        diagnosticsPane(state, Math.max(40, layout.widths[1]), mainHeight),
        historyPane(state, Math.max(28, layout.widths[2]), mainHeight),
      )
    : layout.mode === 'medium'
      ? Row({ gap: 2, widths: layout.widths },
          editorPane(state, Math.max(32, layout.widths[0]), mainHeight),
          auxPane(state, Math.max(28, layout.widths[1]), mainHeight),
        )
      : narrowPane(state, width, mainHeight);

  const shell = WorkspaceShell({
    title: 'Editor Lab',
    subtitle: 'InputEditor compatibility desk',
    stats,
    right,
    focus: state.activeTab,
    tabs: visibleTabs,
    activeTab: state.activeTab,
    onTabSelect: (id) => {
      state.activeTab = id;
      state.status = `Focus moved to ${id}.`;
    },
    tabHint,
    main,
    activity,
    footer,
    height,
    theme: EXAMPLE_THEME,
  });
  return RequireViewport({
    width, height, minWidth: 58, minHeight: 18,
    title: 'Editor Lab needs more room',
    message: 'Resize to keep the draft, diagnostics and saved-history controls readable.',
    theme: EXAMPLE_THEME,
    children: shell,
  });
}

export function handleEditorLabKey({ key, state }) {
  const editor = state.editor;

  if (key.name === 'tab') {
    cycleTab(state, TABS, key.shift ? -1 : 1, { statusPrefix: 'Focus moved to' });
    return;
  }

  if (key.name === 'enter' && key.ctrl) {
    editor.insertLineBreak();
    state.historyIndex = null;
    state.activeTab = 'editor';
    state.status = 'Inserted newline.';
    return;
  }

  if (key.name === 'enter') {
    if (state.activeTab === 'history') {
      activateHistorySelection(state);
      return;
    }

    const line = editor.value.trim();
    if (line) {
      const editIndex = Number.isInteger(state.editingHistoryIndex) ? state.editingHistoryIndex : null;
      const isEditingSavedDraft = editIndex !== null && editIndex >= 0 && editIndex < state.history.length;
      state.submitted.push(line);
      if (isEditingSavedDraft) {
        state.history[editIndex] = line;
        state.historySelection = editIndex;
        state.status = `Updated saved draft ${editIndex + 1}/${state.history.length}.`;
      } else {
        state.history.push(line);
        if (state.history.length > 40) state.history = state.history.slice(-40);
        state.historySelection = Math.max(0, state.history.length - 1);
        state.status = `Saved new draft: ${line}`;
      }
      state.activeTab = 'history';
      state.paneScroll.history = Math.max(0, state.history.length - 5);
      state.ensureHistoryVisible = true;
    } else {
      state.status = 'Ignored empty submit.';
    }
    state.historyIndex = null;
    state.editingHistoryIndex = null;
    editor.clear();
    return;
  }

  if (key.name === 'page-up' || key.name === 'page-down') {
    scrollActivePane(state, key.name === 'page-up' ? -1 : 1);
    return;
  }

  if (isShiftLineScroll(key)) {
    scrollActivePaneByLines(state, shiftLineScrollDelta(key));
    return;
  }

  if (key.name === 'up' || key.name === 'down') {
    if (state.activeTab === 'editor') {
      editor.moveVertical(key.name === 'up' ? -1 : 1);
      state.status = 'Moved inside the editor pane.';
      return;
    }
    if (state.activeTab === 'history') {
      moveHistorySelection(state, key.name === 'up' ? -1 : 1);
      return;
    }
    state.status = 'Diagnostics is read-only; use PageUp/PageDown.';
    return;
  }

  if (state.activeTab === 'history' && (key.name === 'home' || key.name === 'end')) {
    state.historySelection = key.name === 'home' ? 0 : state.history.length;
    state.ensureHistoryVisible = true;
    state.status = key.name === 'home' ? 'Selected first saved draft.' : 'Selected + Add another.';
    return;
  }

  if (state.activeTab === 'history' && key.name === 'delete') {
    const index = clampIndex(state.historySelection ?? 0, state.history.length + 1);
    if (index >= state.history.length) {
      state.status = 'The + Add another row cannot be deleted.';
      return;
    }
    const [removed] = state.history.splice(index, 1);
    state.historySelection = Math.min(index, state.history.length);
    state.ensureHistoryVisible = true;
    state.status = `Deleted saved draft: ${removed}`;
    return;
  }

  if (state.activeTab !== 'editor' && ['left', 'right', 'home', 'end', 'backspace', 'kill-end', 'kill-start', 'delete-word-left'].includes(key.name)) {
    state.status = `${state.activeTab === 'history' ? 'History' : 'Diagnostics'} is read-only for editor navigation; press Tab to focus Editor.`;
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
    state.activeTab = 'editor';
    state.status = `Pasted ${Array.from(key.text).length} characters.`;
    return;
  }

  if (key.printable) {
    editor.insert(key.text);
    state.historyIndex = null;
    state.activeTab = 'editor';
    state.status = `Inserted ${JSON.stringify(key.text)}.`;
  }
}

function editorPane(state, width, height) {
  const position = state.editor.getCursorPosition();
  return WorkspacePane({
    title: ` ${state.activeTab === 'editor' ? '▶' : ' '} LIVE EDITOR `,
    active: state.activeTab === 'editor',
    height,
    pointerId: 'editor-lab:editor',
    onClick: () => {
      state.activeTab = 'editor';
      state.status = 'Editor focused.';
    },
    children: [
      TextEditorView({
        title: ' Draft buffer ',
        value: state.editor.value,
        cursor: state.editor.cursor,
        width: Math.max(24, width - 4),
        height: Math.max(3, height - 5),
        placeholder: 'type a message, then press Enter to submit...',
        lineNumbers: true,
      }),
      Text(`chars ${Array.from(state.editor.value).length} · words ${wordCount(state.editor.value)} · cursor ${position.line + 1}:${position.column + 1}`, { wrap: false }),
    ],
  });
}

function diagnosticsPane(state, width, height) {
  const innerWidth = Math.max(16, width - 4);
  const bodyHeight = Math.max(1, height - 3);
  const rows = diagnosticsRows(state, innerWidth);
  const visibleRows = Math.max(1, bodyHeight - 1);
  if (!state.paneRows) state.paneRows = { diagnostics: 6, history: 6 };
  state.paneRows.diagnostics = visibleRows;
  if (!state.paneTotals) state.paneTotals = {};
  state.paneTotals.diagnostics = rows.length;
  const window = visibleScrollableRows(rows, {
    scroll: state.paneScroll?.diagnostics ?? 0,
    height: bodyHeight,
    width: innerWidth,
  });
  state.paneScroll.diagnostics = window.scroll;
  return WorkspacePane({
    title: ` ${state.activeTab === 'diagnostics' ? '▶' : ' '} DIAGNOSTICS `,
    active: state.activeTab === 'diagnostics',
    height,
    pointerId: 'editor-lab:diagnostics',
    onClick: () => {
      state.activeTab = 'diagnostics';
      state.status = 'Diagnostics focused.';
    },
    onWheel: (event) => {
      scrollPaneByLines(state, 'diagnostics', wheelScrollDelta(event));
      event.preventDefault();
    },
    children: window.rows.map((line) => Text(line, { wrap: false })),
  });
}

function historyPane(state, width, height) {
  const innerWidth = Math.max(16, width - 4);
  const bodyHeight = Math.max(1, height - 3);
  const rows = historyDetailLines(state, innerWidth);
  const visibleRows = Math.max(1, bodyHeight - 1);
  if (!state.paneRows) state.paneRows = { diagnostics: 6, history: 6 };
  state.paneRows.history = visibleRows;
  if (!state.paneTotals) state.paneTotals = {};
  state.paneTotals.history = rows.length;
  const selectedRow = historySelectedRowIndex(state);
  if ((state.activeTab === 'history' || state.ensureHistoryVisible) && selectedRow !== null) {
    state.paneScroll.history = scrollToVisible(state.paneScroll?.history ?? 0, selectedRow, visibleRows, rows.length);
    state.ensureHistoryVisible = false;
  }
  const window = visibleScrollableRows(rows, {
    scroll: state.paneScroll?.history ?? 0,
    height: bodyHeight,
    width: innerWidth,
  });
  state.paneScroll.history = window.scroll;
  const firstVisible = window.scroll;
  return WorkspacePane({
    title: ` ${state.activeTab === 'history' ? '▶' : ' '} HISTORY `,
    active: state.activeTab === 'history',
    height,
    pointerId: 'editor-lab:history',
    onClick: () => {
      state.activeTab = 'history';
      state.status = 'History focused.';
    },
    onWheel: (event) => {
      scrollPaneByLines(state, 'history', wheelScrollDelta(event));
      event.preventDefault();
    },
    children: window.rows.map((line, visibleIndex) => {
      const absoluteRow = firstVisible + visibleIndex;
      const itemIndex = absoluteRow - 1;
      const selectable = itemIndex >= 0 && itemIndex <= state.history.length;
      return Text(line, {
        wrap: false,
        pointerId: selectable ? `editor-lab:history:${itemIndex}` : undefined,
        pointerWidth: 'fill',
        onClick: selectable
          ? () => {
              state.activeTab = 'history';
              state.historySelection = itemIndex;
              state.ensureHistoryVisible = true;
              state.status = itemIndex === state.history.length
                ? 'Selected new draft slot.'
                : `Selected saved draft ${itemIndex + 1}/${state.history.length}.`;
            }
          : null,
      });
    }),
  });
}

function auxPane(state, width, height) {
  return state.activeTab === 'history' ? historyPane(state, width, height) : diagnosticsPane(state, width, height);
}

function narrowPane(state, width, height) {
  if (state.activeTab === 'history') return historyPane(state, width, height);
  if (state.activeTab === 'diagnostics') return diagnosticsPane(state, width, height);
  return editorPane(state, width, height);
}

function diagnosticsRows(state, width) {
  const parts = state.editor.getParts();
  const cursorPreview = `${parts.before}█${parts.current === ' ' ? '' : parts.current}${parts.after}`;
  const submitted = state.submitted.length
    ? state.submitted.slice(-8).map((line, index) => `${index + 1}. ${fitInline(line, Math.max(8, width - 6)).trimEnd()}`)
    : ['No submitted lines yet. Press Enter to submit the current draft.'];

  const blocks = [
    Text('Inspect cursor state, submitted lines and recent raw keys. PageUp/PageDown scrolls this pane.'),
    Panel(' Cursor preview ',
      Text(fitInline(cursorPreview, Math.max(8, width - 4)).trimEnd(), { wrap: false }),
    ),
    Panel(' Editor state ',
      Text(`value   ${state.editor.value || '<empty>'}`, { wrap: false }),
      Text(`cursor  ${state.editor.cursor}/${Array.from(state.editor.value).length}`, { wrap: false }),
      Text(`line    ${state.editor.getCursorPosition().line + 1}:${state.editor.getCursorPosition().column + 1}`, { wrap: false }),
      Text(`words   ${wordCount(state.editor.value)}`, { wrap: false }),
    ),
    Panel(' Last keys ',
      ...((state.keyLog?.length ? state.keyLog.slice(-10) : ['No keys yet.']).map((line) => Text(`• ${fitInline(line, Math.max(8, width - 8)).trimEnd()}`, { wrap: false }))),
    ),
    Panel(' Submitted lines ',
      ...submitted.map((line) => Text(line, { wrap: false })),
    ),
  ];

  const rows = [];
  blocks.forEach((block, index) => {
    if (index > 0) rows.push('');
    rows.push(...renderNode(block, width));
  });
  return rows;
}

function historyDetailLines(state, width) {
  return [
    'Submitted drafts',
    ...historyLines(state, width),
  ];
}

function historyLines(state, width) {
  const items = [
    ...state.history.map((line, index) => ({ type: 'saved', line, index })),
    { type: 'new', line: '+ Add another', index: state.history.length },
  ];
  const selected = clampIndex(state.historySelection ?? Math.max(0, state.history.length - 1), items.length);
  state.historySelection = selected;
  return items.map((item) => {
    const marker = state.activeTab === 'history' && item.index === selected ? '›' : ' ';
    if (item.type === 'new') {
      return `${marker}  + ${fitInline('Add another', Math.max(8, width - 6)).trimEnd()}`;
    }
    const number = String(item.index + 1).padStart(2, ' ');
    return `${marker} ${number}. ${fitInline(item.line, Math.max(8, width - 7)).trimEnd()}`;
  });
}

function historySelectedRowIndex(state) {
  return 1 + clampIndex(state.historySelection ?? Math.max(0, state.history.length - 1), state.history.length + 1);
}



function moveHistorySelection(state, delta) {
  const total = state.history.length + 1;
  state.historySelection = clampIndex((state.historySelection ?? Math.max(0, state.history.length - 1)) + delta, total);
  state.ensureHistoryVisible = true;
  state.status = state.historySelection === state.history.length
    ? 'Selected new draft slot.'
    : `Selected saved draft ${state.historySelection + 1}/${state.history.length}.`;
}

function activateHistorySelection(state) {
  const selected = clampIndex(state.historySelection ?? Math.max(0, state.history.length - 1), state.history.length + 1);
  state.historySelection = selected;
  state.historyIndex = null;
  if (selected >= state.history.length) {
    state.editor.clear();
    state.editingHistoryIndex = null;
    state.activeTab = 'editor';
    state.status = 'Opened a blank draft.';
    return;
  }
  const draft = state.history[selected] ?? '';
  state.editor.set(draft);
  state.editingHistoryIndex = selected;
  state.activeTab = 'editor';
  state.status = `Loaded saved draft ${selected + 1}/${state.history.length}.`;
}

function clampIndex(index, length) {
  const safeLength = Math.max(1, Number(length) || 1);
  return Math.max(0, Math.min(safeLength - 1, Number(index) || 0));
}

function scrollActivePane(state, direction) {
  const id = state.activeTab === 'diagnostics' ? 'diagnostics' : state.activeTab === 'history' ? 'history' : null;
  if (!id) {
    state.status = 'PageUp/PageDown scroll History or Diagnostics; the editor uses ↑/↓ for cursor movement.';
    return;
  }
  if (!state.paneScroll) state.paneScroll = { diagnostics: 0, history: 0 };
  const total = state.paneTotals?.[id] ?? (id === 'history' ? historyDetailLines(state, 80).length : diagnosticsRows(state, 80).length);
  const visibleRows = Math.max(1, state.paneRows?.[id] ?? 6);
  const page = Math.max(1, visibleRows - 1);
  state.paneScroll[id] = scrollOffset(state.paneScroll[id] ?? 0, direction * page, total, visibleRows);
  state.status = `${id === 'history' ? 'History' : 'Diagnostics'} scrolled ${direction < 0 ? 'up' : 'down'}.`;
}

function scrollActivePaneByLines(state, delta) {
  const id = state.activeTab === 'diagnostics' ? 'diagnostics' : state.activeTab === 'history' ? 'history' : null;
  if (!id) {
    state.status = 'Shift+↑/↓ scrolls History or Diagnostics; the editor keeps normal cursor movement.';
    return;
  }
  scrollPaneByLines(state, id, delta);
}

function scrollPaneByLines(state, id, delta) {
  if (!state.paneScroll) state.paneScroll = { diagnostics: 0, history: 0 };
  const total = state.paneTotals?.[id] ?? (id === 'history' ? historyDetailLines(state, 80).length : diagnosticsRows(state, 80).length);
  const visibleRows = Math.max(1, state.paneRows?.[id] ?? 6);
  state.paneScroll[id] = scrollOffset(state.paneScroll[id] ?? 0, delta, total, visibleRows);
  state.status = `${id === 'history' ? 'History' : 'Diagnostics'} scrolled one line ${delta < 0 ? 'up' : 'down'}.`;
}

function contextHelpHints(state, height = 28) {
  if (height < 19) return [];
  if (state.activeTab === 'editor') {
    return [
      ['Enter', 'submit draft'],
      ['Ctrl+J', 'new line'],
      ['↑/↓', 'move cursor'],
      ['Alt+←/→', 'word move'],
      ['Tab', 'switch pane'],
      ['Ctrl+C', 'exit'],
    ];
  }
  if (state.activeTab === 'history') {
    return [
      ['↑/↓', 'select history item'],
      ['Shift+↑/↓', 'scroll one line'],
      ['PgUp/PgDn', 'scroll history'],
      ['Home/End', 'first / add another'],
      ['Enter', 'load draft / add another'],
      ['Delete', 'remove saved draft'],
      ['Tab', 'switch tab'],
      ['Ctrl+C', 'exit'],
    ];
  }
  if (state.activeTab === 'diagnostics') {
    return [
      ['Shift+↑/↓', 'scroll one line'],
      ['PgUp/PgDn', 'scroll diagnostics'],
      ['Tab', 'switch tab'],
      ['↑/↓', 'disabled here'],
      ['Ctrl+J', 'newline in editor'],
      ['Ctrl+C', 'exit'],
    ];
  }
  return [];
}

function wordCount(value) {
  return String(value ?? '').trim().split(/\s+/).filter(Boolean).length;
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Editor Lab',
    state: createEditorLabState(),
    render: createEditorLabView,
    onKey: handleEditorLabKey,
  });
}
