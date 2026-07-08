#!/usr/bin/env node
import { Box, Column, InputEditor, Panel, Row, Text } from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';

const SAMPLE_REPLIES = [
  'The renderer builds a virtual frame first, then writes only changed rows. That keeps the terminal stable while the answer is streaming.',
  'A rich terminal should treat input, focus, layout and rendering as separate layers. That makes commands, palettes and modals easier to add later.',
  'This demo intentionally keeps the model fake. The useful part is the streaming contract, cancellation path and live editor state around it.',
];

export function createStreamingWorkbenchState() {
  return {
    prompt: new InputEditor('show me how streaming works'),
    messages: [],
    streaming: false,
    streamTimer: null,
    streamIndex: 0,
    replyIndex: 0,
    status: 'Streaming Workbench: Enter starts a fake stream, Esc cancels it.',
  };
}

export function createStreamingWorkbenchView({ state }) {
  return Column(
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Streaming Workbench ' },
      Text('Demonstrates input editing around an active stream, cancellation, incremental chunks and transcript rendering.'),
      Text(`Prompt: ${state.prompt.value || '<empty>'}█`),
    ),
    Row({ gap: 2, distribute: true },
      Panel(' Transcript ',
        ...transcriptLines(state).map((line) => Text(line)),
      ),
      Panel(' Controls ',
        Text('Enter       submit prompt'),
        Text('Esc         cancel stream'),
        Text('Ctrl+K/U/W  edit prompt'),
        Text('Alt+←/→     move by word'),
        Text('↑ / ↓       cycle sample prompts'),
        Text('Ctrl+C      exit'),
        Text(''),
        Text(`streaming: ${state.streaming ? 'yes' : 'no'}`),
        Text(`chunks   : ${state.streamIndex}`),
      ),
    ),
    Row({ gap: 2, distribute: true },
      Panel(' Status ', Text(state.status)),
      Panel(' Last keys ', ...((state.keyLog?.length ? state.keyLog : ['No keys yet.']).map((line) => Text(line)))),
    ),
  );
}

export function handleStreamingWorkbenchKey({ key, state, runtime }) {
  const editor = state.prompt;

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
    editor.clear();
    startStream(state, runtime);
    return;
  }

  if (key.name === 'up') {
    state.replyIndex = (state.replyIndex + SAMPLE_REPLIES.length - 1) % SAMPLE_REPLIES.length;
    editor.set(samplePrompt(state.replyIndex));
    state.status = 'Loaded previous sample prompt.';
    return;
  }

  if (key.name === 'down') {
    state.replyIndex = (state.replyIndex + 1) % SAMPLE_REPLIES.length;
    editor.set(samplePrompt(state.replyIndex));
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

  if (key.name === 'home' || (key.cmd && key.name === 'left')) {
    editor.home();
    return;
  }

  if (key.name === 'end' || (key.cmd && key.name === 'right')) {
    editor.end();
    return;
  }

  if (key.name === 'backspace') {
    editor.backspace();
    return;
  }

  if (key.name === 'delete') {
    editor.deleteForward();
    return;
  }

  if (key.name === 'kill-end') {
    editor.killToEnd();
    return;
  }

  if (key.name === 'kill-start') {
    editor.killToStart();
    return;
  }

  if (key.name === 'delete-word-left') {
    editor.deleteWordBack();
    return;
  }

  if (key.name === 'paste') {
    editor.insert(key.text);
    return;
  }

  if (key.printable) {
    editor.insert(key.text);
  }
}

function startStream(state, runtime) {
  const assistant = state.messages.at(-1);
  const text = SAMPLE_REPLIES[state.replyIndex % SAMPLE_REPLIES.length];
  const chunks = chunkText(text);
  state.streaming = true;
  state.streamIndex = 0;
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

function transcriptLines(state) {
  if (!state.messages.length) return ['No messages yet. Press Enter to start a stream.'];
  return state.messages.slice(-12).map((message) => `${message.role.padEnd(9)} ${message.content || '…'}`);
}

function samplePrompt(index) {
  return [
    'show me how streaming works',
    'explain why virtual frames matter',
    'what should a terminal AI editor separate into layers',
  ][index % 3];
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Streaming Workbench',
    state: createStreamingWorkbenchState(),
    render: createStreamingWorkbenchView,
    onKey: handleStreamingWorkbenchKey,
  });
}
