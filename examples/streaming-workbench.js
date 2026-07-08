#!/usr/bin/env node
import {
  Column,
  InputEditor,
  KeyHintBar,
  Panel,
  ProgressBar,
  Row,
  Text,
  TextEditorView,
  Toast,
  WorkspacePane,
  WorkspaceShell,
  fitInline,
  renderNode,
  splitWorkspaceColumns,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';
import { EXAMPLE_THEME, cycleTab, responsiveTabHint, responsiveTabs, scrollOffset, visibleScrollableRows, workspaceMainHeight } from './_workspaceExampleUtils.js';

const TABS = [
  { id: 'prompt', label: 'Prompt' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'control', label: 'Control' },
];

const SAMPLE_REPLIES = [
  {
    prompt: 'show me how streaming works',
    title: 'Frame streaming',
    text: 'The renderer builds a virtual frame first, then writes only changed rows. That keeps the terminal stable while the answer is streaming and avoids input flicker.',
  },
  {
    prompt: 'explain why virtual frames matter',
    title: 'Virtual frames',
    text: 'A virtual frame gives the app one deterministic screen snapshot per tick. The diff layer can patch rows, tests can render without a TTY, and resize handling remains predictable.',
  },
  {
    prompt: 'what should a terminal AI editor separate into layers',
    title: 'Layering',
    text: 'A rich terminal should treat input, focus, layout, model streaming and rendering as separate layers. That makes commands, palettes, modals and cancellation easier to reason about later.',
  },
];

export function createStreamingWorkbenchState() {
  return {
    prompt: new InputEditor(SAMPLE_REPLIES[0].prompt),
    messages: [],
    streaming: false,
    streamTimer: null,
    streamIndex: 0,
    streamTotal: 0,
    replyIndex: 0,
    activeTab: 'prompt',
    lastStartedAt: null,
    paneScroll: { transcript: 0, control: 0 },
    followTranscript: true,
    keyLog: [],
    status: 'Edit the prompt, then press Enter to start a fake stream.',
  };
}

export function createStreamingWorkbenchView({ state, width = 100, height = 30 } = {}) {
  const layout = splitWorkspaceColumns(width);
  const helpHints = contextHelpHints(state);
  const helpGridRows = Math.ceil(helpHints.length / 3);
  const mainHeight = workspaceMainHeight(height, {
    min: 6,
    activityRows: helpGridRows ? helpGridRows * 2 + 1 : 0,
    commandRows: 0,
    footerRows: 0,
  });
  const visibleTabs = responsiveTabs(TABS, state.activeTab, width, { pinned: ['prompt'] });
  const main = layout.mode === 'wide'
    ? Row({ gap: 2, widths: layout.widths },
        promptPane(state, Math.max(30, layout.widths[0]), mainHeight),
        transcriptPane(state, Math.max(44, layout.widths[1]), mainHeight),
        controlPane(state, Math.max(28, layout.widths[2]), mainHeight),
      )
    : layout.mode === 'medium'
      ? Row({ gap: 2, widths: layout.widths },
          promptPane(state, Math.max(30, layout.widths[0]), mainHeight),
          state.activeTab === 'control'
            ? controlPane(state, Math.max(44, layout.widths[1]), mainHeight)
            : transcriptPane(state, Math.max(44, layout.widths[1]), mainHeight),
        )
      : narrowPane(state, width, mainHeight);

  return WorkspaceShell({
    title: 'Streaming Workbench',
    subtitle: 'incremental output lab',
    stats: [
      { label: 'Streaming', value: state.streaming ? 'yes' : 'no' },
      { label: 'Chunks', value: `${state.streamIndex}/${state.streamTotal}` },
      { label: 'Messages', value: state.messages.length },
    ],
    right: [
      { label: 'Scenario', value: SAMPLE_REPLIES[state.replyIndex]?.title ?? 'custom' },
      { label: 'Status', value: fitInline(state.status, 46).trimEnd() },
    ],
    focus: state.activeTab,
    tabs: visibleTabs,
    activeTab: state.activeTab,
    tabHint: responsiveTabHint('Tab focus · Enter submit from Prompt · Esc cancel stream · PgUp/PgDn scroll active pane', TABS, visibleTabs),
    main,
    activity: KeyHintBar({
      title: ' LOCAL HELP ',
      hints: helpHints,
      theme: EXAMPLE_THEME,
      gridBorder: true,
    }),
    height,
    theme: EXAMPLE_THEME,
  });
}

export function handleStreamingWorkbenchKey({ key, state, runtime }) {
  rememberKey(state, key);
  const editor = state.prompt;

  if (key.name === 'tab') {
    cycleTab(state, TABS, key.shift ? -1 : 1, { statusPrefix: 'Focus moved to' });
    return;
  }

  if (key.name === 'escape') {
    if (state.streaming) {
      cancelStream(state);
      state.messages.push({ role: 'system', content: '[stream cancelled]' });
      state.followTranscript = true;
      state.activeTab = 'transcript';
      state.status = 'Stream cancelled.';
    } else {
      state.status = 'Nothing to cancel.';
    }
    return;
  }

  if (key.name === 'page-up' || key.name === 'page-down') {
    pageActivePane(state, key.name === 'page-up' ? -1 : 1);
    return;
  }

  if (state.activeTab === 'transcript') {
    if (key.name === 'enter') {
      state.followTranscript = true;
      state.paneScroll.transcript = Number.POSITIVE_INFINITY;
      state.status = 'Transcript pinned to newest output.';
      return;
    }
    if (key.name === 'up' || key.name === 'down') {
      state.status = 'Transcript uses PageUp/PageDown only.';
    }
    return;
  }

  if (state.activeTab === 'control') {
    if (key.name === 'enter') {
      if (state.streaming) {
        cancelStream(state);
        state.messages.push({ role: 'system', content: '[stream cancelled from control]' });
        state.followTranscript = true;
        state.status = 'Stream cancelled from Control.';
      } else {
        state.status = 'Control has no running stream. Switch to Prompt to submit.';
      }
      return;
    }
    if (key.name === 'up' || key.name === 'down') {
      state.status = 'Control is read-only. Use PgUp/PgDn if it overflows.';
    }
    return;
  }

  if (key.name === 'enter' && key.ctrl) {
    editor.insertLineBreak();
    state.status = 'Inserted newline in prompt.';
    return;
  }

  if (key.name === 'enter') {
    submitPrompt(state, runtime);
    return;
  }

  if (key.name === 'up' || key.name === 'down') {
    editor.moveVertical(key.name === 'up' ? -1 : 1);
    state.status = 'Moved inside the prompt editor.';
    return;
  }

  if (key.printable && (key.text === '[' || key.text === ']')) {
    loadSamplePrompt(state, key.text === '[' ? -1 : 1);
    return;
  }

  if (key.name === 'left') {
    key.meta ? editor.moveWord(-1) : editor.move(-1);
    state.status = 'Moved prompt cursor.';
    return;
  }

  if (key.name === 'right') {
    key.meta ? editor.moveWord(1) : editor.move(1);
    state.status = 'Moved prompt cursor.';
    return;
  }

  if (key.name === 'home' || (key.cmd && key.name === 'left')) {
    editor.home();
    state.status = 'Moved to prompt start.';
    return;
  }
  if (key.name === 'end' || (key.cmd && key.name === 'right')) {
    editor.end();
    state.status = 'Moved to prompt end.';
    return;
  }
  if (key.name === 'backspace') {
    editor.backspace();
    state.status = 'Backspace in prompt.';
    return;
  }
  if (key.name === 'delete') {
    editor.deleteForward();
    state.status = 'Delete forward in prompt.';
    return;
  }
  if (key.name === 'kill-end') {
    editor.killToEnd();
    state.status = 'Killed prompt suffix.';
    return;
  }
  if (key.name === 'kill-start') {
    editor.killToStart();
    state.status = 'Killed prompt prefix.';
    return;
  }
  if (key.name === 'delete-word-left') {
    editor.deleteWordBack();
    state.status = 'Deleted word on the left.';
    return;
  }
  if (key.name === 'paste') {
    editor.insert(key.text);
    state.status = `Pasted ${Array.from(key.text).length} characters.`;
    return;
  }
  if (key.printable) {
    editor.insert(key.text);
    state.status = 'Edited prompt.';
  }
}

function submitPrompt(state, runtime) {
  if (state.streaming) {
    state.status = 'Already streaming. Press Esc to cancel first.';
    return;
  }
  const prompt = state.prompt.value.trim();
  if (!prompt) {
    state.status = 'Enter ignored because prompt is empty.';
    return;
  }
  state.messages.push({ role: 'user', content: prompt });
  state.messages.push({ role: 'assistant', content: '' });
  state.activeTab = 'transcript';
  state.followTranscript = true;
  state.prompt.clear();
  startStream(state, runtime);
}

function loadSamplePrompt(state, delta) {
  state.replyIndex = (state.replyIndex + SAMPLE_REPLIES.length + delta) % SAMPLE_REPLIES.length;
  state.prompt.set(samplePrompt(state.replyIndex));
  state.status = delta < 0 ? 'Loaded previous sample prompt.' : 'Loaded next sample prompt.';
}

function pageActivePane(state, direction) {
  const page = 7;
  if (state.activeTab === 'transcript') {
    const total = transcriptLines(state, 1000).length || 1;
    state.followTranscript = false;
    const current = Number.isFinite(state.paneScroll.transcript) ? state.paneScroll.transcript : Math.max(0, total - page);
    state.paneScroll.transcript = scrollOffset(current, direction * page, total, page);
    state.status = direction < 0 ? 'Transcript page up.' : 'Transcript page down.';
    return;
  }
  if (state.activeTab === 'control') {
    state.paneScroll.control = scrollOffset(state.paneScroll.control, direction * page, controlLineCount(), page);
    state.status = direction < 0 ? 'Control page up.' : 'Control page down.';
    return;
  }
  state.status = 'Prompt editor does not need page scrolling.';
}

function promptPane(state, width, height) {
  const scenario = SAMPLE_REPLIES[state.replyIndex % SAMPLE_REPLIES.length];
  return WorkspacePane({
    title: ` ${state.activeTab === 'prompt' ? '▶' : ' '} PROMPT `,
    active: state.activeTab === 'prompt',
    height,
    children: [
      Toast({ level: state.streaming ? 'info' : 'success', message: state.streaming ? 'Provider is emitting chunks.' : 'Ready to submit a prompt.' }),
      TextEditorView({
        title: ' Draft ',
        value: state.prompt.value,
        cursor: state.prompt.cursor,
        width: Math.max(24, width - 4),
        height: Math.max(3, Math.min(6, height - 13)),
        placeholder: 'type a prompt, then press Enter...',
        lineNumbers: false,
      }),
      Panel(' Samples ',
        ...SAMPLE_REPLIES.map((item, index) => Text(`${index === state.replyIndex ? '›' : ' '} ${fitInline(item.prompt, Math.max(18, width - 8))}`, { wrap: false })),
      ),
      Panel(' Scenario ',
        Text(scenario.title, { wrap: false }),
        Text(fitInline(scenario.text, Math.max(20, width - 8)), { wrap: false }),
      ),
    ],
  });
}

function transcriptPane(state, width, height) {
  const lines = transcriptLines(state, Math.max(24, width - 6));
  if (!lines.length) {
    return WorkspacePane({
      title: ` ${state.activeTab === 'transcript' ? '▶' : ' '} TRANSCRIPT `,
      active: state.activeTab === 'transcript',
      height,
      children: [Panel(' Empty transcript ', Text('No messages yet. Switch to Prompt and press Enter to start a stream.'))],
    });
  }
  const visibleHeight = Math.max(3, height - 2);
  const total = lines.length;
  const maxScroll = Math.max(0, total - Math.max(1, visibleHeight - 1));
  const scroll = state.followTranscript ? maxScroll : state.paneScroll.transcript;
  const window = visibleScrollableRows(lines, {
    scroll,
    height: visibleHeight,
    width: Math.max(20, width - 4),
    footer: total > visibleHeight - 1,
  });
  state.paneScroll.transcript = window.scroll;
  return WorkspacePane({
    title: ` ${state.activeTab === 'transcript' ? '▶' : ' '} TRANSCRIPT `,
    active: state.activeTab === 'transcript',
    height,
    children: window.rows.map((line) => Text(line, { wrap: false })),
  });
}

function controlPane(state, width, height) {
  const ratioTotal = Math.max(1, state.streamTotal);
  const lines = renderNode(Column(
    Panel(' Runtime ',
      Text(`streaming : ${state.streaming ? 'yes' : 'no'}`),
      Text(`chunks    : ${state.streamIndex}/${state.streamTotal}`),
      ProgressBar({ value: state.streamIndex, total: ratioTotal, width: Math.min(24, Math.max(10, width - 18)) }),
      Text(`last start: ${state.lastStartedAt ?? '<none>'}`),
    ),
    Panel(' Active scenario ',
      Text(SAMPLE_REPLIES[state.replyIndex]?.title ?? 'custom', { wrap: false }),
      Text(fitInline(SAMPLE_REPLIES[state.replyIndex]?.prompt ?? '<custom>', Math.max(16, width - 10)), { wrap: false }),
    ),
    Panel(' Last keys ',
      ...((state.keyLog.length ? state.keyLog.slice(-6) : ['No keys yet.']).map((line) => Text(fitInline(line, Math.max(16, width - 10)), { wrap: false }))),
    ),
  ), Math.max(20, width - 4));
  const window = visibleScrollableRows(lines, {
    scroll: state.paneScroll.control,
    height: Math.max(3, height - 2),
    width: Math.max(20, width - 4),
    footer: lines.length > Math.max(3, height - 3),
  });
  state.paneScroll.control = window.scroll;
  return WorkspacePane({
    title: ` ${state.activeTab === 'control' ? '▶' : ' '} CONTROL `,
    active: state.activeTab === 'control',
    height,
    children: window.rows.map((line) => Text(line, { wrap: false })),
  });
}

function narrowPane(state, width, height) {
  if (state.activeTab === 'transcript') return transcriptPane(state, width, height);
  if (state.activeTab === 'control') return controlPane(state, width, height);
  return promptPane(state, width, height);
}

function startStream(state, runtime) {
  const assistant = state.messages.at(-1);
  const text = SAMPLE_REPLIES[state.replyIndex % SAMPLE_REPLIES.length].text;
  const chunks = chunkText(text);
  state.streaming = true;
  state.streamIndex = 0;
  state.streamTotal = chunks.length;
  state.lastStartedAt = new Date().toLocaleTimeString('en-US', { hour12: false });
  state.status = 'Streaming. Press Esc to cancel.';

  const tick = () => {
    if (!state.streaming) return;
    const chunk = chunks[state.streamIndex];
    if (chunk === undefined) {
      state.streaming = false;
      state.streamTimer = null;
      state.replyIndex = (state.replyIndex + 1) % SAMPLE_REPLIES.length;
      state.status = 'Stream complete.';
      runtime.invalidate();
      return;
    }
    assistant.content += chunk;
    state.streamIndex += 1;
    state.followTranscript = true;
    runtime.invalidate();
    state.streamTimer = setTimeout(tick, chunk.trim() ? 35 : 10);
  };

  state.streamTimer = setTimeout(tick, 80);
}

function cancelStream(state) {
  state.streaming = false;
  if (state.streamTimer) clearTimeout(state.streamTimer);
  state.streamTimer = null;
}

function chunkText(text) {
  return String(text).split(/(\s+)/).filter((chunk) => chunk.length > 0);
}

function transcriptLines(state, width) {
  if (!state.messages.length) return [];
  return state.messages.map((message, index) => {
    const role = message.role === 'assistant' ? 'ai' : message.role;
    const content = message.content || '…';
    return fitInline(`${String(index + 1).padStart(2)} ${role.padEnd(8)} ${content}`, width);
  });
}

function samplePrompt(index) {
  return SAMPLE_REPLIES[index % SAMPLE_REPLIES.length].prompt;
}

function rememberKey(state, key) {
  const label = key.printable ? `text ${JSON.stringify(key.text)}` : key.name;
  state.keyLog.push(label);
  if (state.keyLog.length > 24) state.keyLog = state.keyLog.slice(-24);
}

function controlLineCount() {
  return 18;
}

function contextHelpHints(state) {
  if (state.activeTab === 'transcript') {
    return [
      ['PgUp/PgDn', 'scroll transcript'],
      ['Enter', 'jump to newest'],
      ['Esc', 'cancel stream'],
      ['Tab', 'switch pane'],
      ['↑/↓', 'not used here'],
    ];
  }
  if (state.activeTab === 'control') {
    return [
      ['Enter', 'cancel if streaming'],
      ['PgUp/PgDn', 'scroll control'],
      ['Esc', 'cancel stream'],
      ['Tab', 'switch pane'],
      ['↑/↓', 'not used here'],
    ];
  }
  return [
    ['Enter', 'submit prompt'],
    ['Ctrl+J', 'new line'],
    ['↑/↓', 'move cursor'],
    ['[/]', 'load sample'],
    ['Alt+←/→', 'word move'],
    ['Esc', 'cancel stream'],
  ];
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Streaming Workbench',
    state: createStreamingWorkbenchState(),
    render: createStreamingWorkbenchView,
    onKey: handleStreamingWorkbenchKey,
  });
}
