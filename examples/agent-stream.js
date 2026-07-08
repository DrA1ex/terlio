#!/usr/bin/env node
import { Box, ChatTranscript, Column, HelpOverlay, InputEditor, Panel, ProgressBar, Row, Text, Toast, appendMessageBlock, appendMessageChunk, completeMessage, createMessage, themes } from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';

const STREAM_SCENARIOS = [
  {
    prompt: 'review renderer lifecycle and suggest tests',
    blocks: [
      { type: 'text', content: 'I will review the lifecycle path first, then propose targeted tests.' },
      { type: 'warning', title: 'Cancellation path', content: 'Streaming must abort timers before restoring terminal state.' },
      { type: 'command', title: 'Verification', command: 'npm test -- --test-name-pattern lifecycle' },
    ],
  },
  {
    prompt: 'make the answer shorter',
    blocks: [
      { type: 'text', content: 'Shorter version: separate input, rendering, streaming and shutdown into isolated layers.' },
      { type: 'tool_result', name: 'rewrite', status: 'complete', content: 'Reduced response to one sentence.' },
    ],
  },
  {
    prompt: 'explain structured blocks',
    blocks: [
      { type: 'text', content: 'Structured blocks turn an assistant answer into actionable UI units.' },
      { type: 'code', language: 'js', title: 'Block shape', content: "{ type: 'diff', title: 'src/file.js', content: patch }" },
    ],
  },
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
    toast: { level: 'info', message: 'Enter starts structured streaming. Esc cancels.' },
    status: 'Ready.',
  };
}

export function createAgentStreamView({ state, width = 110, height = 32 } = {}) {
  return Column(
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Agent Stream Playground ' },
      Text('Demonstrates structured streaming, cancellation, retry/regenerate/shorter/longer/explain actions and live transcript rendering.'),
      Text(`Prompt: ${state.prompt.value || '<empty>'}█`),
    ),
    Row({ gap: 2, distribute: true },
      Panel(' Transcript ', ChatTranscript({ columns: Math.max(56, Math.floor(width * 0.66)), height: Math.max(12, height - 12), messages: state.messages, theme: themes.dark }).node),
      Column(
        Toast(state.toast),
        Panel(' Stream state ',
          Text(`streaming : ${state.streaming ? 'yes' : 'no'}`),
          Text(`progress  : ${state.streamDone}/${state.streamTotal}`),
          ProgressBar({ value: state.streamDone, total: Math.max(1, state.streamTotal), width: 20 }),
          Text(`last prompt: ${state.lastPrompt || '<none>'}`),
        ),
        HelpOverlay({
          title: ' Actions ',
          shortcuts: [
            ['Enter', 'submit prompt'],
            ['Esc', 'cancel stream'],
            ['R', 'retry last prompt'],
            ['G', 'regenerate'],
            ['S/L', 'shorter / longer'],
            ['E', 'explain'],
            ['↑/↓', 'sample prompts'],
          ],
        }),
      ),
    ),
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Status ' }, Text(state.status)),
  );
}

export function handleAgentStreamKey({ key, state, runtime }) {
  if (key.name === 'escape') {
    if (state.streaming) cancelAgentStream(state, 'cancelled');
    else state.toast = { level: 'info', message: 'No active stream to cancel.' };
    return;
  }
  if (key.name === 'enter') return submitAgentPrompt(state, runtime, state.prompt.value.trim());
  if (key.name === 'r') return submitAgentPrompt(state, runtime, state.lastPrompt || state.prompt.value.trim(), { label: 'retry' });
  if (key.name === 'g') return submitAgentPrompt(state, runtime, `${state.lastPrompt || 'previous request'} (regenerate)`, { label: 'regenerate' });
  if (key.name === 's') return submitAgentPrompt(state, runtime, 'make the previous answer shorter', { scenarioIndex: 1, label: 'shorter' });
  if (key.name === 'l') return submitAgentPrompt(state, runtime, 'expand the previous answer with more detail', { label: 'longer' });
  if (key.name === 'e') return submitAgentPrompt(state, runtime, 'explain structured blocks', { scenarioIndex: 2, label: 'explain' });
  if (key.name === 'up') {
    state.scenarioIndex = mod(state.scenarioIndex - 1, STREAM_SCENARIOS.length);
    state.prompt.set(STREAM_SCENARIOS[state.scenarioIndex].prompt);
    return;
  }
  if (key.name === 'down') {
    state.scenarioIndex = mod(state.scenarioIndex + 1, STREAM_SCENARIOS.length);
    state.prompt.set(STREAM_SCENARIOS[state.scenarioIndex].prompt);
    return;
  }
  editPrompt(state.prompt, key);
}

export function submitAgentPrompt(state, runtime, prompt, options = {}) {
  if (state.streaming) {
    state.toast = { level: 'warning', message: 'Cancel active stream before submitting another prompt.' };
    return;
  }
  if (!prompt) {
    state.toast = { level: 'warning', message: 'Prompt is empty.' };
    return;
  }
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
  state.toast = { level: 'info', message: `Streaming ${options.label ?? 'response'}...` };
  state.status = 'Streaming. Press Esc to cancel.';
  scheduleNextStreamEvent(state, runtime, assistant);
}

export function cancelAgentStream(state, status = 'cancelled') {
  if (state.streamTimer) clearTimeout(state.streamTimer);
  state.streamTimer = null;
  state.streaming = false;
  const assistant = state.messages.at(-1);
  if (assistant?.role === 'assistant') completeMessage(assistant, status);
  state.messages.push(createMessage({ role: 'system', content: `[stream ${status}]` }));
  state.toast = { level: 'warning', message: `Stream ${status}.` };
  state.status = `Stream ${status}.`;
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
    runtime?.invalidate?.();
    scheduleNextStreamEvent(state, runtime, assistant);
  }, event.type === 'chunk' ? 25 : 140);
}

function createStreamEvents(blocks, label) {
  const events = [];
  events.push(...chunkText(`Preparing ${label} response. `).map((value) => ({ type: 'chunk', value })));
  for (const block of blocks) {
    if (block.type === 'text') {
      events.push(...chunkText(`${block.content}\n`).map((value) => ({ type: 'chunk', value })));
    } else {
      events.push({ type: 'block', block });
    }
  }
  return events;
}

function editPrompt(editor, key) {
  if (key.name === 'left') return key.meta ? editor.moveWord(-1) : editor.move(-1);
  if (key.name === 'right') return key.meta ? editor.moveWord(1) : editor.move(1);
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

function chunkText(text) {
  return String(text).split(/(\s+)/).filter(Boolean);
}

function mod(value, size) {
  return ((value % size) + size) % size;
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Agent Stream Playground',
    state: createAgentStreamState(),
    render: createAgentStreamView,
    onKey: handleAgentStreamKey,
  });
}
