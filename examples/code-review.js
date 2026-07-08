#!/usr/bin/env node
import {
  Box,
  Column,
  ConfirmPrompt,
  HelpOverlay,
  InputEditor,
  ModeManager,
  Panel,
  Row,
  Text,
  Toast,
  ChatTranscript,
  appendMessageBlock,
  createMessage,
  themes,
} from '../src/lib/index.js';
import { BLOCK_GALLERY_BLOCKS } from './blocks.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';

const REVIEW_PROMPTS = [
  'review src/lib/app.js for lifecycle bugs',
  'find performance issues in the terminal renderer',
  'write tests for command palette keyboard navigation',
];

export function createCodeReviewState() {
  return {
    input: new InputEditor(REVIEW_PROMPTS[0]),
    promptIndex: 0,
    messages: [createMessage({ role: 'system', content: 'Code review demo. Submit a prompt to receive structured blocks.' })],
    selectedBlockIndex: 0,
    modes: new ModeManager('input'),
    confirmSelected: 'confirm',
    toast: { level: 'info', message: 'Enter submits. Tab selects blocks after a review.' },
    actionLog: [],
    status: 'Ready for a mock code review.',
  };
}

export function createCodeReviewView({ state, width = 110, height = 32 } = {}) {
  const assistant = lastAssistantWithBlocks(state.messages);
  const blocks = assistant?.blocks ?? [];
  const mode = state.modes.current();
  const overlay = mode === 'confirm'
    ? ConfirmPrompt({
        title: ' Confirm block action ',
        message: state.modes.currentEntry().data?.message ?? 'Run selected action?',
        selected: state.confirmSelected,
      })
    : null;

  return Column(
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' AI Code Review Terminal ' },
      Text('Product demo: prompt editing, structured assistant blocks, block selection, mock apply/run/copy actions and confirm flow.'),
      Text(`Mode: ${mode} · selected block: ${blocks.length ? `${state.selectedBlockIndex + 1}/${blocks.length}` : 'none'}`),
    ),
    Row({ gap: 2, distribute: true },
      Panel(' Transcript ', ChatTranscript({ columns: Math.max(54, Math.floor(width * 0.62)), height: Math.max(12, height - 13), messages: state.messages, theme: themes.dark }).node),
      Column(
        Toast(state.toast),
        Panel(' Blocks ', ...(blocks.length ? blocks.map((block, index) => Text(formatReviewBlock(block, index, index === state.selectedBlockIndex))) : [Text('Submit a review prompt to generate blocks.')])) ,
        Panel(' Actions ',
          Text('Tab / Shift+Tab  select block'),
          Text('Enter            primary action'),
          Text('A                apply diff'),
          Text('R                run command'),
          Text('C                copy block'),
          Text('Esc              cancel overlay'),
        ),
      ),
    ),
    ...(overlay ? [overlay] : []),
    Row({ gap: 2, distribute: true },
      Panel(' Input ',
        Text(`› ${state.input.value || '<empty>'}`),
        Text('↑/↓ sample prompts · Ctrl+K/U/W edit · Alt+←/→ words · Enter submit'),
      ),
      Panel(' Action log ', ...(state.actionLog.length ? state.actionLog.slice(-5).map((line) => Text(line)) : [Text('No actions yet.')]))
    ),
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Status ' }, Text(state.status)),
  );
}

export function handleCodeReviewKey({ key, state }) {
  if (state.modes.current() === 'confirm') {
    handleConfirmKey(key, state);
    return;
  }

  const blocks = lastAssistantWithBlocks(state.messages)?.blocks ?? [];

  if (key.name === 'tab') {
    if (blocks.length) {
      state.selectedBlockIndex = mod(state.selectedBlockIndex + (key.shift ? -1 : 1), blocks.length);
      state.status = `Selected ${blocks[state.selectedBlockIndex].type} block.`;
    }
    return;
  }

  if (key.name === 'enter') {
    if (blocks.length && state.input.value.trim() === '') {
      requestPrimaryAction(state, blocks[state.selectedBlockIndex]);
      return;
    }
    submitReview(state);
    return;
  }

  if (key.name === 'a') return requestApply(state);
  if (key.name === 'r') return requestRun(state);
  if (key.name === 'c') return copySelected(state);

  if (key.name === 'up') {
    state.promptIndex = mod(state.promptIndex - 1, REVIEW_PROMPTS.length);
    state.input.set(REVIEW_PROMPTS[state.promptIndex]);
    state.status = 'Loaded previous review prompt.';
    return;
  }
  if (key.name === 'down') {
    state.promptIndex = mod(state.promptIndex + 1, REVIEW_PROMPTS.length);
    state.input.set(REVIEW_PROMPTS[state.promptIndex]);
    state.status = 'Loaded next review prompt.';
    return;
  }

  editInput(state.input, key, state);
}

export function submitReview(state) {
  const prompt = state.input.value.trim();
  if (!prompt) {
    state.status = 'Empty prompt ignored.';
    return;
  }
  state.messages.push(createMessage({ role: 'user', content: prompt }));
  const assistant = createMessage({ role: 'assistant', content: '', blocks: [] });
  for (const block of buildReviewBlocks(prompt)) appendMessageBlock(assistant, block);
  state.messages.push(assistant);
  state.input.clear();
  state.selectedBlockIndex = 0;
  state.toast = { level: 'success', message: 'Structured review generated.' };
  state.status = 'Review complete. Select blocks and run actions.';
}

export function buildReviewBlocks(prompt) {
  const extraWarning = /lifecycle|exit|ctrl\+c|stream/i.test(prompt)
    ? [{ type: 'warning', title: 'Lifecycle risk', content: 'Make shutdown idempotent and abort active stream timers before restoring normal screen.' }]
    : [];
  return [
    { type: 'text', content: `Review for: ${prompt}\nFound one lifecycle risk, one renderer improvement and one test gap.` },
    ...extraWarning,
    { type: 'code', language: 'js', title: 'Suggested unit test', content: "test('Ctrl+C exits while streaming', async () => {\n  const app = createHarness();\n  await app.startStream();\n  app.press('ctrl-c');\n  assert.equal(app.exitCode, 130);\n});" },
    { type: 'diff', title: 'src/lib/app.js', content: "--- a/src/lib/app.js\n+++ b/src/lib/app.js\n@@\n- this.stop();\n+ this.abortActiveStream();\n+ this.stop();" },
    { type: 'command', title: 'Run verification', command: 'npm test && npm run check' },
    { type: 'tool_result', name: 'review-sim', status: 'ok', content: 'Generated 5 structured review blocks.' },
  ];
}

function requestPrimaryAction(state, block) {
  if (!block) return;
  if (block.type === 'diff') return requestApply(state);
  if (block.type === 'command') return requestRun(state);
  return copySelected(state);
}

function requestApply(state) {
  const block = selectedBlock(state);
  if (!block || block.type !== 'diff') {
    state.toast = { level: 'warning', message: 'Select a diff block before apply.' };
    state.status = 'Apply requires a diff block.';
    return;
  }
  state.modes.push('confirm', { action: 'apply', block, message: `Apply mock patch ${block.title || 'diff'}?` });
  state.toast = { level: 'warning', message: 'Confirm apply is active.' };
}

function requestRun(state) {
  const block = selectedBlock(state);
  if (!block || block.type !== 'command') {
    state.toast = { level: 'warning', message: 'Select a command block before run.' };
    state.status = 'Run requires a command block.';
    return;
  }
  state.modes.push('confirm', { action: 'run', block, message: `Run mock command: ${block.command}?` });
  state.toast = { level: 'warning', message: 'Confirm run is active.' };
}

function copySelected(state) {
  const block = selectedBlock(state);
  if (!block) return;
  const action = `Copied ${block.type} block.`;
  state.actionLog.push(action);
  state.toast = { level: 'success', message: action };
  state.status = action;
}

function handleConfirmKey(key, state) {
  if (key.name === 'escape') {
    state.modes.pop();
    state.toast = { level: 'info', message: 'Action cancelled.' };
    return;
  }
  if (key.name === 'left' || key.name === 'right') {
    state.confirmSelected = state.confirmSelected === 'confirm' ? 'cancel' : 'confirm';
    return;
  }
  if (key.name !== 'enter') return;
  const entry = state.modes.currentEntry();
  const data = entry.data ?? {};
  state.modes.pop();
  if (state.confirmSelected !== 'confirm') {
    state.toast = { level: 'info', message: 'Action cancelled.' };
    state.confirmSelected = 'confirm';
    return;
  }
  const action = data.action === 'run'
    ? `Mock command executed: ${data.block?.command}`
    : `Mock patch applied: ${data.block?.title ?? 'diff'}`;
  state.actionLog.push(action);
  state.toast = { level: 'success', message: action };
  state.status = action;
  state.confirmSelected = 'confirm';
}

function selectedBlock(state) {
  const blocks = lastAssistantWithBlocks(state.messages)?.blocks ?? [];
  return blocks[state.selectedBlockIndex] ?? null;
}

function lastAssistantWithBlocks(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant' && messages[index].blocks?.length) return messages[index];
  }
  return null;
}

function formatReviewBlock(block, index, selected) {
  const source = block.title || block.command || block.name || block.language || block.content.split('\n')[0];
  return `${selected ? '›' : ' '} ${String(index + 1).padStart(2, '0')} ${block.type.padEnd(11)} ${source}`;
}

function editInput(editor, key, state) {
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
  if (key.printable) {
    editor.insert(key.text);
    state.status = 'Editing review prompt.';
  }
}

function mod(value, size) {
  return ((value % size) + size) % size;
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'AI Code Review Terminal',
    state: createCodeReviewState(),
    render: createCodeReviewView,
    onKey: handleCodeReviewKey,
  });
}
