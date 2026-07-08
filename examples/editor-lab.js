#!/usr/bin/env node
import {
  InputEditor,
  KeyHintBar,
  Panel,
  Row,
  Text,
  TextEditorView,
  Toast,
  color,
  WorkspaceCommandBar,
  WorkspaceFooter,
  WorkspacePane,
  WorkspaceShell,
  fitInline,
  splitWorkspaceColumns,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';
import { EXAMPLE_THEME, cycleTab, responsiveTabHint, responsiveTabs, workspaceMainHeight } from './_workspaceExampleUtils.js';

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
    submitted: [],
    activeTab: 'editor',
    status: 'Editor Lab: type, edit, recall previous drafts with ↑/↓, then press Enter to submit.',
  };
}

export function createEditorLabView({ state, width = 92, height = 28 } = {}) {
  const layout = splitWorkspaceColumns(width);
  const mainHeight = workspaceMainHeight(height, { min: 6, activityRows: 3 });
  const visibleTabs = responsiveTabs(TABS, state.activeTab, width, { pinned: ['editor'] });
  const editor = state.editor;
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

  return WorkspaceShell({
    title: 'Editor Lab',
    subtitle: 'InputEditor compatibility desk',
    stats: [
      { label: 'value', value: editor.value || '<empty>' },
      { label: 'cursor', value: `${editor.cursor}/${Array.from(editor.value).length}` },
    ],
    right: [
      { label: 'Submitted', value: state.submitted.length },
      { label: 'History', value: state.history.length },
    ],
    focus: state.activeTab,
    tabs: visibleTabs,
    activeTab: state.activeTab,
    tabHint: responsiveTabHint('Type text · Enter submit · ↑/↓ recall stack · Tab focus · Ctrl+C exit', TABS, visibleTabs),
    main,
    command: WorkspaceCommandBar({
      mode: 'EDITOR',
      prompt: 'draft',
      value: `${editor.value || '<empty>'}▌`,
      suggestions: ['Alt+←/→ word', 'Ctrl+K kill end', 'Ctrl+U kill start', 'Ctrl+W delete word'],
      hint: state.historyIndex === null ? 'editing the new draft slot' : `recalling history #${state.historyIndex + 1}`,
      theme: EXAMPLE_THEME,
    }),
    activity: KeyHintBar({
      title: ' LOCAL HELP ',
      hints: [
        ['←/→', 'move char'],
        ['Alt+←/→', 'move word'],
        ['Ctrl+A/E', 'home/end'],
        ['Ctrl+K/U', 'kill line'],
        ['Ctrl+W', 'delete word'],
        ['Enter', 'submit draft'],
        ['↑/↓', 'recall history'],
        ['Tab', 'switch visible tab'],
        ['History + new', 'clears to blank draft'],
        ['Diagnostics', 'shows raw keys'],
        ['Resize', 'layout recomputes'],
      ],
      theme: EXAMPLE_THEME,
    }),
    footer: WorkspaceFooter({
      left: ['Ready', state.status],
      right: [`theme: ${EXAMPLE_THEME.name}`, 'demo: editor'],
      theme: EXAMPLE_THEME,
    }),
    height,
    theme: EXAMPLE_THEME,
  });
}

export function handleEditorLabKey({ key, state }) {
  const editor = state.editor;

  if (key.name === 'tab') {
    cycleTab(state, TABS, key.shift ? -1 : 1, { statusPrefix: 'Focus moved to' });
    return;
  }

  if (key.name === 'enter') {
    const line = editor.value.trim();
    if (line) {
      state.submitted.push(line);
      state.history.push(line);
      if (state.history.length > 40) state.history = state.history.slice(-40);
      state.status = `Submitted: ${line}`;
      state.activeTab = 'history';
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
    state.activeTab = 'history';
    state.status = 'History: older entry.';
    return;
  }

  if (key.name === 'down') {
    if (state.historyIndex === null) return;
    if (state.historyIndex >= state.history.length - 1) {
      state.historyIndex = null;
      editor.clear();
      state.activeTab = 'history';
      state.status = 'History: selected + New draft, editor cleared for a fresh line.';
      return;
    }
    state.historyIndex += 1;
    editor.set(state.history[state.historyIndex]);
    state.activeTab = 'history';
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
  return WorkspacePane({
    title: ` ${state.activeTab === 'editor' ? '▶' : ' '} LIVE EDITOR `,
    active: state.activeTab === 'editor',
    height,
    children: [
      Panel(' State ',
        Text(color(EXAMPLE_THEME, 'accent', `value : ${state.editor.value || '<empty>'}`)),
        Text(`cursor: ${state.editor.cursor}/${Array.from(state.editor.value).length}`),
        Text(`words : ${wordCount(state.editor.value)}`),
        Text(`recall: ${state.historyIndex === null ? '+ new draft' : `history #${state.historyIndex + 1}`}`),
      ),
      TextEditorView({
        title: ' Draft buffer ',
        value: state.editor.value,
        cursor: state.editor.cursor,
        width: Math.max(24, width - 4),
        height: Math.max(3, Math.min(5, height - 9)),
        placeholder: 'type a message, or press ↑ to recall history...',
        lineNumbers: false,
      }),
    ],
  });
}

function diagnosticsPane(state, width, height) {
  const parts = state.editor.getParts();
  const cursorPreview = `${parts.before}█${parts.current === ' ' ? '' : parts.current}${parts.after}`;
  return WorkspacePane({
    title: ` ${state.activeTab === 'diagnostics' ? '▶' : ' '} DIAGNOSTICS `,
    active: state.activeTab === 'diagnostics',
    height,
    children: [
      Toast({ level: 'info', message: 'Inspect cursor state, submitted lines and recent raw keys.' }),
      Panel(' Cursor preview ',
        Text(fitInline(cursorPreview, Math.max(20, width - 8)), { wrap: false }),
      ),
      Panel(' Last keys ',
        ...((state.keyLog?.length ? state.keyLog.slice(-7) : ['No keys yet.']).map((line) => Text(fitInline(line, Math.max(16, width - 8)), { wrap: false }))),
      ),
      Panel(' Submitted lines ',
        ...(state.submitted.length ? state.submitted.slice(-5).map((line, index) => Text(`${index + 1}. ${fitInline(line, Math.max(16, width - 10))}`, { wrap: false })) : [Text('No submitted lines yet. Press Enter to submit the current input.')]),
      ),
    ],
  });
}

function historyPane(state, width, height) {
  return WorkspacePane({
    title: ` ${state.activeTab === 'history' ? '▶' : ' '} History `,
    active: state.activeTab === 'history',
    height,
    children: [
      Panel(' Recall stack ',
        ...historyLines(state, Math.max(16, width - 8)).slice(-Math.max(4, height - 10)).map((line) => Text(line, { wrap: false })),
      ),
      Panel(' Behavior ',
        Text('↑ loads an older item into the live editor.'),
        Text('↓ moves toward + New draft.'),
        Text('The + New draft row clears the editor for a fresh line.'),
        Text('Enter submits the current editor value and appends it here.'),
      ),
    ],
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

function historyLines(state, width) {
  const recent = state.history.slice(-9).map((line, index, list) => {
    const absoluteIndex = state.history.length - list.length + index;
    const marker = absoluteIndex === state.historyIndex ? '›' : ' ';
    return `${marker} ${fitInline(line, Math.max(8, width - 2))}`;
  });
  const draftMarker = state.historyIndex === null ? '›' : ' ';
  recent.push(`${draftMarker} ${fitInline('+ New draft — blank editor slot', Math.max(8, width - 2))}`);
  return recent;
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
