#!/usr/bin/env node
import {
  InputEditor,
  KeyHintBar,
  Panel,
  ProgressBar,
  Row,
  Text,
  Toast,
  WorkspaceCommandBar,
  WorkspaceFooter,
  WorkspacePane,
  WorkspaceShell,
  fitInline,
  splitWorkspaceColumns,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';

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
    activeTab: 'transcript',
    lastStartedAt: null,
    status: 'Streaming Workbench: Enter starts a fake stream, Esc cancels it.',
  };
}

export function createStreamingWorkbenchView({ state, width = 100, height = 30 } = {}) {
  const layout = splitWorkspaceColumns(width);
  const mainHeight = Math.max(10, height - 12);
  const main = layout.mode === 'wide'
    ? Row({ gap: 2, widths: layout.widths },
        promptPane(state, Math.max(30, layout.widths[0]), mainHeight),
        transcriptPane(state, Math.max(44, layout.widths[1]), mainHeight),
        controlPane(state, Math.max(28, layout.widths[2]), mainHeight),
      )
    : layout.mode === 'medium'
      ? Row({ gap: 2, widths: layout.widths },
          transcriptPane(state, Math.max(44, layout.widths[1]), mainHeight),
          controlPane(state, Math.max(30, layout.widths[0]), mainHeight),
        )
      : narrowPane(state, width, mainHeight);

  return WorkspaceShell({
    title: 'Streaming Workbench',
    subtitle: 'incremental model output lab',
    stats: [
      { label: 'Streaming', value: state.streaming ? 'yes' : 'no' },
      { label: 'Chunks', value: `${state.streamIndex}/${state.streamTotal}` },
    ],
    right: [
      { label: 'Scenario', value: SAMPLE_REPLIES[state.replyIndex]?.title ?? 'custom' },
      { label: 'Messages', value: state.messages.length },
    ],
    focus: state.activeTab,
    tabs: [
      { id: 'prompt', label: 'Prompt' },
      { id: 'transcript', label: 'Transcript' },
      { id: 'control', label: 'Control' },
    ],
    activeTab: state.activeTab,
    tabHint: 'Enter stream · Esc cancel · ↑/↓ sample prompts · Tab focus',
    main,
    command: WorkspaceCommandBar({
      mode: state.streaming ? 'STREAMING' : 'PROMPT',
      prompt: 'prompt',
      value: `${state.prompt.value || '<empty>'}▌`,
      suggestions: ['Enter submit', 'Esc cancel', '↑/↓ sample', 'Alt+←/→ word'],
      hint: 'fake provider stream',
    }),
    activity: KeyHintBar({
      title: ' LOCAL HELP ',
      hints: [
        ['Enter', 'submit prompt'],
        ['Esc', 'cancel stream'],
        ['↑/↓', 'cycle samples'],
        ['Ctrl+K/U/W', 'edit prompt'],
        ['Alt+←/→', 'word move'],
        ['Tab', 'switch pane'],
      ],
    }),
    footer: WorkspaceFooter({
      left: [state.streaming ? 'Streaming' : 'Ready', state.status],
      right: ['demo: stream'],
    }),
    height,
  });
}

export function handleStreamingWorkbenchKey({ key, state, runtime }) {
  const editor = state.prompt;

  if (key.name === 'tab') {
    const tabs = ['prompt', 'transcript', 'control'];
    const index = tabs.indexOf(state.activeTab);
    state.activeTab = tabs[((index + (key.shift ? -1 : 1)) % tabs.length + tabs.length) % tabs.length];
    state.status = `Focus moved to ${state.activeTab}.`;
    return;
  }

  if (key.name === 'escape') {
    if (state.streaming) {
      cancelStream(state);
      state.messages.push({ role: 'system', content: '[stream cancelled]' });
      state.status = 'Stream cancelled.';
    } else {
      state.status = 'Nothing to cancel.';
    }
    return;
  }

  if (key.name === 'enter') {
    if (state.streaming) {
      state.status = 'Already streaming. Press Esc to cancel first.';
      return;
    }
    const prompt = editor.value.trim();
    if (!prompt) {
      state.status = 'Enter ignored because prompt is empty.';
      return;
    }
    state.messages.push({ role: 'user', content: prompt });
    state.messages.push({ role: 'assistant', content: '' });
    state.activeTab = 'transcript';
    editor.clear();
    startStream(state, runtime);
    return;
  }

  if (key.name === 'up') {
    state.replyIndex = (state.replyIndex + SAMPLE_REPLIES.length - 1) % SAMPLE_REPLIES.length;
    editor.set(samplePrompt(state.replyIndex));
    state.activeTab = 'prompt';
    state.status = 'Loaded previous sample prompt.';
    return;
  }

  if (key.name === 'down') {
    state.replyIndex = (state.replyIndex + 1) % SAMPLE_REPLIES.length;
    editor.set(samplePrompt(state.replyIndex));
    state.activeTab = 'prompt';
    state.status = 'Loaded next sample prompt.';
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

  if (key.name === 'home' || (key.cmd && key.name === 'left')) return editor.home();
  if (key.name === 'end' || (key.cmd && key.name === 'right')) return editor.end();
  if (key.name === 'backspace') return editor.backspace();
  if (key.name === 'delete') return editor.deleteForward();
  if (key.name === 'kill-end') return editor.killToEnd();
  if (key.name === 'kill-start') return editor.killToStart();
  if (key.name === 'delete-word-left') return editor.deleteWordBack();
  if (key.name === 'paste') return editor.insert(key.text);
  if (key.printable) editor.insert(key.text);
}

function promptPane(state, width, height) {
  const scenario = SAMPLE_REPLIES[state.replyIndex % SAMPLE_REPLIES.length];
  return WorkspacePane({
    title: ` ${state.activeTab === 'prompt' ? '▶' : ' '} PROMPT QUEUE `,
    active: state.activeTab === 'prompt',
    height,
    children: [
      Toast({ level: state.streaming ? 'info' : 'success', message: state.streaming ? 'Provider is emitting chunks.' : 'Ready to submit a prompt.' }),
      Panel(' Current draft ',
        Text(fitInline(`${state.prompt.value || '<empty>'}▌`, Math.max(20, width - 8)), { wrap: false }),
      ),
      Panel(' Sample prompts ',
        ...SAMPLE_REPLIES.map((item, index) => Text(`${index === state.replyIndex ? '›' : ' '} ${fitInline(item.prompt, Math.max(18, width - 8))}`, { wrap: false })),
      ),
      Panel(' Active scenario ',
        Text(scenario.title, { wrap: false }),
        Text(fitInline(scenario.text, Math.max(20, width - 8)), { wrap: false }),
      ),
    ],
  });
}

function transcriptPane(state, width, height) {
  const lines = transcriptLines(state, Math.max(24, width - 6));
  return WorkspacePane({
    title: ` ${state.activeTab === 'transcript' ? '▶' : ' '} TRANSCRIPT `,
    active: state.activeTab === 'transcript',
    height,
    children: lines.length
      ? lines.slice(-Math.max(6, height - 4)).map((line) => Text(line, { wrap: false }))
      : [Panel(' Empty transcript ', Text('No messages yet. Press Enter to start a stream.'))],
  });
}

function controlPane(state, width, height) {
  const ratioTotal = Math.max(1, state.streamTotal);
  return WorkspacePane({
    title: ` ${state.activeTab === 'control' ? '▶' : ' '} CONTROLS `,
    active: state.activeTab === 'control',
    height,
    children: [
      Panel(' Runtime ',
        Text(`streaming : ${state.streaming ? 'yes' : 'no'}`),
        Text(`chunks    : ${state.streamIndex}/${state.streamTotal}`),
        ProgressBar({ value: state.streamIndex, total: ratioTotal, width: Math.min(24, Math.max(10, width - 18)) }),
        Text(`last start: ${state.lastStartedAt ?? '<none>'}`),
      ),
      Panel(' Stream contract ',
        Text('1. append user message'),
        Text('2. create empty assistant turn'),
        Text('3. append chunks per tick'),
        Text('4. cancel timer before redraw'),
      ),
      Panel(' Last keys ',
        ...((state.keyLog?.length ? state.keyLog.slice(-5) : ['No keys yet.']).map((line) => Text(fitInline(line, Math.max(16, width - 8)), { wrap: false }))),
      ),
    ],
  });
}

function narrowPane(state, width, height) {
  if (state.activeTab === 'prompt') return promptPane(state, width, height);
  if (state.activeTab === 'control') return controlPane(state, width, height);
  return transcriptPane(state, width, height);
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
  return state.messages.map((message) => {
    const role = message.role === 'assistant' ? 'ai' : message.role;
    const content = message.content || '…';
    return fitInline(`${role.padEnd(8)} ${content}`, width);
  });
}

function samplePrompt(index) {
  return SAMPLE_REPLIES[index % SAMPLE_REPLIES.length].prompt;
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Streaming Workbench',
    state: createStreamingWorkbenchState(),
    render: createStreamingWorkbenchView,
    onKey: handleStreamingWorkbenchKey,
  });
}
