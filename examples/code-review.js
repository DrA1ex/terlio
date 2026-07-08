#!/usr/bin/env node
import {
  ChatTranscript,
  Column,
  ConfirmPrompt,
  InputEditor,
  KeyHintBar,
  ModeManager,
  Panel,
  Row,
  Text,
  Toast,
  WorkspaceCommandBar,
  WorkspaceFooter,
  WorkspacePane,
  WorkspaceShell,
  appendMessageBlock,
  createMessage,
  fitInline,
  splitWorkspaceColumns,
  themes,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';
import { EXAMPLE_THEME, cycleTab, responsiveTabHint, responsiveTabs, workspaceMainHeight } from './_workspaceExampleUtils.js';

const REVIEW_PROMPTS = [
  'review src/lib/app.js for lifecycle bugs',
  'find performance issues in the terminal renderer',
  'write tests for command palette keyboard navigation',
];

const TABS = [
  { id: 'review', label: 'Review' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'actions', label: 'Actions' },
];

export function createCodeReviewState() {
  return {
    input: new InputEditor(REVIEW_PROMPTS[0]),
    promptIndex: 0,
    activeTab: 'review',
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
  const selected = blocks[state.selectedBlockIndex] ?? null;
  const layout = splitWorkspaceColumns(width);
  const mainHeight = workspaceMainHeight(height, { min: 6, activityRows: 2 });
  const visibleTabs = responsiveTabs(TABS, state.activeTab, width, { pinned: ['review'] });
  const overlay = state.modes.current() === 'confirm'
    ? ConfirmPrompt({
        title: ' Confirm block action ',
        message: state.modes.currentEntry().data?.message ?? 'Run selected action?',
        selected: state.confirmSelected,
      })
    : null;

  const transcriptPane = WorkspacePane({
    title: ' TRANSCRIPT ',
    active: state.activeTab === 'review',
    height: mainHeight,
    children: [ChatTranscript({ columns: Math.max(52, layout.mode === 'wide' ? layout.widths[1] : Math.floor(width * 0.62)), height: Math.max(8, mainHeight - 2), messages: state.messages, theme: themes.dark }).node],
  });
  const promptPane = WorkspacePane({
    title: ' REVIEW BRIEF ',
    active: state.activeTab === 'review' && !blocks.length,
    height: mainHeight,
    children: [
      Text('Prompt'),
      Text(`› ${state.input.value || '<empty>'}▌`, { wrap: false }),
      Text(''),
      Text('Sample prompts'),
      ...REVIEW_PROMPTS.map((prompt, index) => Text(`${index === state.promptIndex ? '›' : ' '} ${fitInline(prompt, Math.max(20, (layout.widths[0] ?? 40) - 4))}`, { wrap: false })),
    ],
  });
  const blocksPane = WorkspacePane({
    title: ` BLOCKS ${blocks.length ? state.selectedBlockIndex + 1 : 0}/${blocks.length} `,
    active: state.activeTab === 'blocks',
    height: mainHeight,
    children: blocks.length ? blocks.map((block, index) => Text(formatReviewBlock(block, index, index === state.selectedBlockIndex), { wrap: false })) : [Text('Submit a review prompt to generate structured blocks.')],
  });
  const actionPane = WorkspacePane({
    title: ' ACTIONS ',
    active: state.activeTab === 'actions',
    height: mainHeight,
    children: [
      Toast(state.toast),
      Panel(' Selected ', selected ? Text(`${selected.type}: ${selected.title || selected.command || selected.name || 'block'}`) : Text('No block selected.')),
      Panel(' Action log ', ...(state.actionLog.length ? state.actionLog.slice(-6).map((line) => Text(line, { wrap: false })) : [Text('No actions yet.')])),
    ],
  });

  const main = layout.mode === 'wide'
    ? Row({ gap: 2, widths: layout.widths }, promptPane, transcriptPane, actionPane)
    : layout.mode === 'medium'
      ? Row({ gap: 2, widths: layout.widths }, transcriptPane, state.activeTab === 'actions' ? actionPane : blocksPane)
      : (state.activeTab === 'actions' ? actionPane : state.activeTab === 'blocks' ? blocksPane : transcriptPane);

  return WorkspaceShell({
    title: 'AI Code Review Terminal',
    subtitle: 'structured blocks and safe actions',
    stats: [{ label: 'Blocks', value: blocks.length }, { label: 'Selected', value: selected?.type ?? 'none' }, { label: 'Mode', value: state.modes.current() }],
    right: [{ label: 'Prompt', value: state.input.value ? 'ready' : 'empty' }],
    focus: state.activeTab,
    tabs: visibleTabs,
    activeTab: state.activeTab,
    tabHint: responsiveTabHint('[/] switch tabs · Tab selects blocks · Enter submit/action · A/R/C block actions', TABS, visibleTabs),
    main: overlay ? Column({ grow: true, height: 'fill' }, main, overlay) : main,
    command: WorkspaceCommandBar({ value: state.input.value, prompt: 'review', mode: 'PROMPT', suggestions: ['Enter submit', '↑/↓ samples', 'Tab block', 'A apply', 'R run', 'C copy'], theme: EXAMPLE_THEME }),
    activity: KeyHintBar({ title: ' LOCAL HELP ', hints: [['Enter', 'submit or primary action'], ['Tab', 'select block'], ['A', 'apply diff'], ['R', 'run command'], ['C', 'copy block'], ['Esc', 'cancel modal']], theme: EXAMPLE_THEME }),
    footer: WorkspaceFooter({ left: ['Ready', state.modes.current() === 'confirm' ? 'Confirm block action' : state.status], right: [`theme: ${EXAMPLE_THEME.name}`, 'demo: code-review'], theme: EXAMPLE_THEME }),
    height,
    theme: EXAMPLE_THEME,
  });
}

export function handleCodeReviewKey({ key, state, runtime }) {
  if (state.modes.current() === 'confirm') {
    handleConfirmKey(key, state);
    return;
  }

  const blocks = lastAssistantWithBlocks(state.messages)?.blocks ?? [];

  if (key.name === '[' || (key.name === 'left' && key.ctrl)) return switchTab(state, -1);
  if (key.name === ']' || (key.name === 'right' && key.ctrl)) return switchTab(state, 1);

  if (key.name === 'tab') {
    if (blocks.length) {
      state.selectedBlockIndex = mod(state.selectedBlockIndex + (key.shift ? -1 : 1), blocks.length);
      state.activeTab = 'blocks';
      state.status = `Selected ${blocks[state.selectedBlockIndex].type} block.`;
    }
    return;
  }

  if (key.name === 'enter') {
    if (blocks.length && state.input.value.trim() === '') return requestPrimaryAction(state, blocks[state.selectedBlockIndex]);
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
  state.activeTab = 'blocks';
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
  state.activeTab = 'actions';
}

function selectedBlock(state) {
  const blocks = lastAssistantWithBlocks(state.messages)?.blocks ?? [];
  return blocks[state.selectedBlockIndex] ?? null;
}

function lastAssistantWithBlocks(messages) {
  return [...messages].reverse().find((message) => message.role === 'assistant' && message.blocks?.length);
}

function formatReviewBlock(block, index, selected) {
  const label = `${index + 1}. ${block.type}`.padEnd(14);
  const detail = block.title || block.name || block.command || block.language || '';
  return `${selected ? '›' : ' '} ${label} ${detail}`;
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
  if (key.name === 'paste') return editor.insert(key.text.replace(/\s+/g, ' '));
  if (key.printable) {
    editor.insert(key.text);
    state.activeTab = 'review';
  }
}

function switchTab(state, delta) {
  cycleTab(state, TABS, delta, { statusPrefix: 'Opened' });
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
