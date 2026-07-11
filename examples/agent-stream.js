#!/usr/bin/env node
import {
  ChatTranscript,
  InputEditor,
  KeyHintBar,
  ProgressBar,
  RequireViewport,
  Row,
  Text,
  TextEditorView,
  Toast,
  WorkspaceFooter,
  WorkspacePane,
  WorkspaceShell,
  appendMessageBlock,
  appendMessageChunk,
  completeMessage,
  createMessage,
  renderNode,
  resolveWorkspaceShellLayout,
  splitWorkspaceColumns,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';
import { EXAMPLE_THEME, cycleTab, responsiveTabHint, responsiveTabs, scrollOffset, visibleScrollableRows } from './_workspaceExampleUtils.js';

const TABS = [{ id: 'prompt', label: 'Prompt' }, { id: 'stream', label: 'Stream' }, { id: 'actions', label: 'Actions' }];
const STREAM_SCENARIOS = [
  { prompt: 'review renderer lifecycle and suggest tests', blocks: [
    { type: 'text', content: 'I will review the lifecycle path first, then propose targeted tests.' },
    { type: 'warning', title: 'Cancellation path', content: 'Streaming must abort timers before restoring terminal state.' },
    { type: 'command', title: 'Verification', command: 'npm test -- --test-name-pattern lifecycle' },
  ] },
  { prompt: 'make the answer shorter', blocks: [
    { type: 'text', content: 'Shorter version: separate input, rendering, streaming and shutdown into isolated layers.' },
    { type: 'tool_result', name: 'rewrite', status: 'complete', content: 'Reduced response to one sentence.' },
  ] },
  { prompt: 'explain structured blocks', blocks: [
    { type: 'text', content: 'Structured blocks turn an assistant answer into actionable UI units.' },
    { type: 'code', language: 'js', title: 'Block shape', content: "{ type: 'diff', title: 'src/file.js', content: patch }" },
  ] },
];

export function createAgentStreamState() {
  return {
    prompt: new InputEditor(STREAM_SCENARIOS[0].prompt),
    scenarioIndex: 0,
    messages: [],
    streaming: false,
    streamTimer: null,
    streamQueue: [],
    streamTotal: 0,
    streamDone: 0,
    lastPrompt: '',
    activeTab: 'prompt',
    paneScroll: { stream: 0, actions: 0 },
    toast: { level: 'info', message: 'Enter starts the event queue. Esc cancels pending timers.' },
    status: 'Ready. Select a prompt scenario or edit the draft.',
  };
}

export function createAgentStreamView({ state, width = 110, height = 32 } = {}) {
  const layout = splitWorkspaceColumns(width);
  const visibleTabs = responsiveTabs(TABS, state.activeTab, width, { pinned: ['stream'] });
  const stats = [
    { label: 'Streaming', value: state.streaming ? 'yes' : 'no' },
    { label: 'Progress', value: `${state.streamDone}/${state.streamTotal}` },
    { label: 'Queued', value: state.streamQueue.length },
  ];
  const right = [{ label: 'Scenario', value: `${state.scenarioIndex + 1}/${STREAM_SCENARIOS.length}` }];
  const tabHint = responsiveTabHint('Tab focus · Enter submit/pin · Esc cancel · PgUp/PgDn scroll · R/G retry/regenerate · S/L rewrite · E explain', TABS, visibleTabs);
  const activity = KeyHintBar({ title: ' LOCAL HELP ', hints: contextHelp(state), adaptive: true, theme: EXAMPLE_THEME });
  const footer = WorkspaceFooter({ left: [state.status], right: ['mechanics: chunks + blocks + cancellation'], theme: EXAMPLE_THEME });
  const { mainHeight } = resolveWorkspaceShellLayout({
    width, height, title: 'Stream Mechanics', subtitle: 'low-level structured event queue', stats, right,
    focus: state.activeTab, tabs: visibleTabs, activeTab: state.activeTab, tabHint, activity, footer,
    theme: EXAMPLE_THEME, minMainHeight: 5,
  });

  const prompt = promptPane(state, layout.mode === 'wide' ? layout.widths[0] : Math.max(34, width), mainHeight);
  const stream = streamPane(state, layout.mode === 'wide' ? layout.widths[1] : Math.max(44, width), mainHeight);
  const actions = actionsPane(state, layout.mode === 'wide' ? layout.widths[2] : Math.max(34, width), mainHeight);
  let main;
  if (layout.mode === 'wide') main = Row({ gap: 2, widths: layout.widths }, prompt, stream, actions);
  else if (layout.mode === 'medium') main = Row({ gap: 2, widths: layout.widths }, stream, state.activeTab === 'prompt' ? prompt : actions);
  else main = state.activeTab === 'prompt' ? prompt : state.activeTab === 'actions' ? actions : stream;

  const shell = WorkspaceShell({
    title: 'Stream Mechanics', subtitle: 'low-level structured event queue', stats, right,
    focus: state.activeTab, tabs: visibleTabs, activeTab: state.activeTab, tabHint,
    main, activity, footer, height, theme: EXAMPLE_THEME,
  });
  return RequireViewport({
    width, height, minWidth: 60, minHeight: 19,
    title: 'Stream Mechanics needs more room',
    message: 'Resize to inspect the event queue and structured transcript safely.',
    theme: EXAMPLE_THEME,
    children: shell,
  });
}

export function handleAgentStreamKey({ key, state, runtime }) {
  if (key.name === 'tab') {
    cycleTab(state, TABS, key.shift ? -1 : 1, { statusPrefix: 'Focus moved to' });
    return;
  }
  if (key.name === 'escape') {
    if (state.streaming) cancelAgentStream(state, 'cancelled');
    else if (state.activeTab !== 'prompt') { state.activeTab = 'prompt'; state.status = 'Returned to Prompt.'; }
    else state.toast = { level: 'info', message: 'No active stream to cancel.' };
    return;
  }

  if (state.activeTab === 'stream' && ['up', 'down', 'page-up', 'page-down', 'home', 'end'].includes(key.name)) {
    scrollAgentPane(state, 'stream', key.name);
    return;
  }
  if (state.activeTab === 'actions' && ['up', 'down', 'page-up', 'page-down', 'home', 'end'].includes(key.name)) {
    scrollAgentPane(state, 'actions', key.name);
    return;
  }
  if (state.activeTab === 'stream' && key.name === 'enter') {
    state.paneScroll.stream = 9999;
    state.status = 'Stream view pinned to newest output.';
    return;
  }

  if (key.name === 'r') return submitAgentPrompt(state, runtime, state.lastPrompt || state.prompt.value.trim(), { label: 'retry' });
  if (key.name === 'g') return submitAgentPrompt(state, runtime, `${state.lastPrompt || 'previous request'} (regenerate)`, { label: 'regenerate' });
  if (key.name === 's') return submitAgentPrompt(state, runtime, 'make the previous answer shorter', { scenarioIndex: 1, label: 'shorter' });
  if (key.name === 'l') return submitAgentPrompt(state, runtime, 'expand the previous answer with more detail', { label: 'longer' });
  if (key.name === 'e') return submitAgentPrompt(state, runtime, 'explain structured blocks', { scenarioIndex: 2, label: 'explain' });

  if (state.activeTab !== 'prompt') return;
  if (key.name === 'enter' && key.ctrl) { state.prompt.insertLineBreak(); state.status = 'Inserted newline in prompt.'; return; }
  if (key.name === 'enter') return submitAgentPrompt(state, runtime, state.prompt.value.trim());
  if (key.name === 'up') { state.scenarioIndex = mod(state.scenarioIndex - 1, STREAM_SCENARIOS.length); state.prompt.set(STREAM_SCENARIOS[state.scenarioIndex].prompt); state.status = 'Loaded previous scenario.'; return; }
  if (key.name === 'down') { state.scenarioIndex = mod(state.scenarioIndex + 1, STREAM_SCENARIOS.length); state.prompt.set(STREAM_SCENARIOS[state.scenarioIndex].prompt); state.status = 'Loaded next scenario.'; return; }
  editPrompt(state.prompt, key);
}

export function submitAgentPrompt(state, runtime, prompt, options = {}) {
  if (state.streaming) { state.toast = { level: 'warning', message: 'Cancel the active stream before submitting another prompt.' }; return; }
  if (!prompt) { state.toast = { level: 'warning', message: 'Prompt is empty.' }; return; }
  const scenario = STREAM_SCENARIOS[options.scenarioIndex ?? state.scenarioIndex % STREAM_SCENARIOS.length];
  const user = createMessage({ role: 'user', content: prompt });
  const assistant = createMessage({ role: 'assistant', content: '', blocks: [], status: 'streaming' });
  state.messages.push(user, assistant);
  state.lastPrompt = prompt;
  state.prompt.clear();
  state.streamQueue = createStreamEvents(scenario.blocks, options.label ?? 'submit');
  state.streamTotal = state.streamQueue.length;
  state.streamDone = 0;
  state.streaming = true;
  state.activeTab = 'stream';
  state.paneScroll.stream = 9999;
  state.toast = { level: 'info', message: `Streaming ${options.label ?? 'response'}...` };
  state.status = 'Streaming. Press Esc to cancel.';
  scheduleNextStreamEvent(state, runtime, assistant);
}

export function cancelAgentStream(state, status = 'cancelled') {
  if (state.streamTimer) clearTimeout(state.streamTimer);
  state.streamTimer = null;
  state.streaming = false;
  state.streamQueue = [];
  const assistant = state.messages.at(-1);
  if (assistant?.role === 'assistant') completeMessage(assistant, status);
  state.messages.push(createMessage({ role: 'system', content: `[stream ${status}]` }));
  state.toast = { level: 'warning', message: `Stream ${status}.` };
  state.status = `Stream ${status}.`;
}

export function cleanupAgentStream({ state }) {
  if (state?.streamTimer) clearTimeout(state.streamTimer);
  if (state) { state.streamTimer = null; state.streaming = false; state.streamQueue = []; }
}

function scheduleNextStreamEvent(state, runtime, assistant) {
  const event = state.streamQueue.shift();
  if (!event) {
    state.streaming = false;
    state.streamTimer = null;
    completeMessage(assistant, 'complete');
    state.toast = { level: 'success', message: 'Structured stream complete.' };
    state.status = 'Stream complete.';
    runtime?.invalidate?.();
    return;
  }
  state.streamTimer = setTimeout(() => {
    if (!state.streaming) return;
    if (event.type === 'chunk') appendMessageChunk(assistant, event.value);
    if (event.type === 'block') appendMessageBlock(assistant, event.block);
    state.streamDone += 1;
    state.paneScroll.stream = 9999;
    runtime?.invalidate?.();
    scheduleNextStreamEvent(state, runtime, assistant);
  }, event.type === 'chunk' ? 25 : 140);
}

function promptPane(state, width, height) {
  return WorkspacePane({
    title: ` ${state.activeTab === 'prompt' ? '▶' : ' '} PROMPT `,
    active: state.activeTab === 'prompt',
    height,
    theme: EXAMPLE_THEME,
    children: [
      TextEditorView({ title: ' Draft ', value: state.prompt.value, cursor: state.prompt.cursor, width: Math.max(24, width - 4), height: Math.max(4, Math.min(7, height - 10)), placeholder: 'type a stream prompt...', lineNumbers: true }),
      Text('Scenarios'),
      ...STREAM_SCENARIOS.map((scenario, index) => Text(`${index === state.scenarioIndex ? '›' : ' '} ${scenario.prompt}`, { wrap: false })),
    ],
  });
}

function streamPane(state, width, height) {
  if (!state.messages.length) {
    return WorkspacePane({
      title: ` ${state.activeTab === 'stream' ? '▶' : ' '} LIVE TRANSCRIPT `,
      active: state.activeTab === 'stream', height, theme: EXAMPLE_THEME,
      children: [Text('No stream yet.'), Text('Focus Prompt and press Enter to enqueue text chunks and structured blocks.')],
    });
  }
  const transcript = ChatTranscript({ columns: Math.max(30, width - 6), height: Math.max(18, height + 18), messages: state.messages, theme: EXAMPLE_THEME }).node;
  const rows = renderNode(transcript, Math.max(24, width - 4));
  const window = visibleScrollableRows(rows, {
    scroll: Math.min(state.paneScroll.stream, Math.max(0, rows.length - Math.max(1, height - 3))),
    height: Math.max(3, height - 2), width: Math.max(20, width - 4),
    footer: rows.length > Math.max(3, height - 3), footerLabel: '↑/↓ line · PgUp/PgDn page · Enter newest',
  });
  state.paneScroll.stream = window.scroll;
  return WorkspacePane({
    title: ` ${state.activeTab === 'stream' ? '▶' : ' '} LIVE TRANSCRIPT `,
    active: state.activeTab === 'stream', height, theme: EXAMPLE_THEME,
    children: window.rows.map((line) => Text(line, { wrap: false })),
  });
}

function actionsPane(state, width, height) {
  const queuePreview = state.streamQueue.slice(0, 12).map((event, index) => `${String(index + 1).padStart(2)} ${event.type}${event.type === 'block' ? `:${event.block.type}` : ` ${JSON.stringify(event.value)}`}`);
  const rows = [
    ...renderNode(Toast({ ...state.toast, theme: EXAMPLE_THEME, shadow: false }), Math.max(24, width - 4)),
    '',
    `streaming  ${state.streaming ? 'yes' : 'no'}`,
    `progress   ${state.streamDone}/${state.streamTotal}`,
    `last       ${state.lastPrompt || '<none>'}`,
    '',
    ...renderNode(ProgressBar({ value: state.streamDone, total: Math.max(1, state.streamTotal), width: Math.max(12, Math.min(30, width - 12)), label: 'events' }), Math.max(20, width - 4)),
    '',
    'Pending queue',
    ...(queuePreview.length ? queuePreview : ['<empty>']),
  ];
  const window = visibleScrollableRows(rows, {
    scroll: state.paneScroll.actions, height: Math.max(3, height - 2), width: Math.max(20, width - 4),
    footer: rows.length > Math.max(3, height - 3), footerLabel: '↑/↓ line · PgUp/PgDn page',
  });
  state.paneScroll.actions = window.scroll;
  return WorkspacePane({
    title: ` ${state.activeTab === 'actions' ? '▶' : ' '} QUEUE & ACTIONS `,
    active: state.activeTab === 'actions', height, theme: EXAMPLE_THEME,
    children: window.rows.map((line) => Text(line, { wrap: false })),
  });
}

function scrollAgentPane(state, pane, keyName) {
  const total = pane === 'stream' ? 80 : Math.max(12, state.streamQueue.length + 12);
  const visible = 8;
  if (keyName === 'home') state.paneScroll[pane] = 0;
  else if (keyName === 'end') state.paneScroll[pane] = Math.max(0, total - visible);
  else state.paneScroll[pane] = scrollOffset(state.paneScroll[pane], keyName === 'up' ? -1 : keyName === 'down' ? 1 : keyName === 'page-up' ? -visible : visible, total, visible);
  state.status = `${pane === 'stream' ? 'Transcript' : 'Queue'} scrolled.`;
}

function contextHelp(state) {
  if (state.activeTab === 'prompt') return [['Enter', 'start stream'], ['Ctrl+J', 'newline'], ['↑/↓', 'scenario'], ['Alt+←/→', 'word move'], ['Tab', 'switch pane'], ['Esc', 'cancel']];
  if (state.activeTab === 'stream') return [['↑/↓', 'scroll line'], ['PgUp/PgDn', 'scroll page'], ['Enter', 'jump newest'], ['Esc', 'cancel/back'], ['Tab', 'switch pane']];
  return [['↑/↓', 'scroll queue'], ['PgUp/PgDn', 'scroll page'], ['R/G', 'retry/regenerate'], ['S/L', 'shorter/longer'], ['E', 'explain blocks'], ['Tab', 'switch pane']];
}

function createStreamEvents(blocks, label) {
  const events = [...chunkText(`Preparing ${label} response. `).map((value) => ({ type: 'chunk', value }))];
  for (const block of blocks) {
    if (block.type === 'text') events.push(...chunkText(`${block.content}\n`).map((value) => ({ type: 'chunk', value })));
    else events.push({ type: 'block', block });
  }
  return events;
}

function editPrompt(editor, key) {
  if (key.name === 'left') return key.meta || key.word ? editor.moveWord(-1) : editor.move(-1);
  if (key.name === 'right') return key.meta || key.word ? editor.moveWord(1) : editor.move(1);
  if (key.name === 'home' || (key.cmd && key.name === 'left')) return editor.home();
  if (key.name === 'end' || (key.cmd && key.name === 'right')) return editor.end();
  if (key.name === 'backspace') return editor.backspace();
  if (key.name === 'delete') return editor.deleteForward();
  if (key.name === 'kill-end') return editor.killToEnd();
  if (key.name === 'kill-start') return editor.killToStart();
  if (key.name === 'delete-word-left') return editor.deleteWordBack();
  if (key.name === 'paste') return editor.insertPaste ? editor.insertPaste(key.text) : editor.insert(key.text);
  if (key.printable) editor.insert(key.text);
}
function chunkText(text) { return String(text).split(/(\s+)/).filter(Boolean); }
function mod(value, size) { return ((value % size) + size) % size; }

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Stream Mechanics',
    state: createAgentStreamState(),
    render: createAgentStreamView,
    onKey: handleAgentStreamKey,
    onStop: cleanupAgentStream,
  });
}
