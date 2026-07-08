#!/usr/bin/env node
import {
  ChipLine,
  Column,
  InputEditor,
  KeyHintBar,
  Panel,
  Row,
  Text,
  TextEditorView,
  WorkspaceCommandBar,
  WorkspaceFooter,
  WorkspacePane,
  WorkspaceShell,
  fitInline,
  splitWorkspaceColumns,
} from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';

const FIELD_TEMPLATES = [
  {
    goal: 'Refactor src/lib/renderer.js into reusable components',
    context: 'Current app has virtual frames, structured blocks and a command palette.',
    constraints: 'No dependencies. Keep public API stable. Add tests before behavior.',
    output: 'Return a concise implementation plan and risky files.',
  },
  {
    goal: 'Write a code review for src/lib/app.js',
    context: 'Focus on lifecycle, input handling, streaming cancellation and renderer state.',
    constraints: 'Be concrete. Mention exact edge cases. Avoid generic advice.',
    output: 'Return findings grouped by severity with suggested patches.',
  },
  {
    goal: 'Design a new /apply confirmation flow',
    context: 'Assistant responses may contain diff blocks and command blocks.',
    constraints: 'User must see what will change before accepting. Support cancel and undo.',
    output: 'Return UI states, keybindings and test cases.',
  },
];

const TABS = [
  { id: 'compose', label: 'Compose' },
  { id: 'preview', label: 'Preview' },
  { id: 'history', label: 'History' },
];

export function createPromptComposerState() {
  const first = FIELD_TEMPLATES[0];
  return {
    fields: [
      createField('goal', 'Goal', first.goal),
      createField('context', 'Context', first.context),
      createField('constraints', 'Constraints', first.constraints),
      createField('output', 'Expected output', first.output),
    ],
    activeIndex: 0,
    activeTab: 'compose',
    templateIndex: 0,
    submitted: [],
    status: 'Ready. Edit a field, load templates, then submit the composed prompt.',
    lastAction: 'Loaded template 1.',
  };
}

export function createPromptComposerView({ state, width = 104, height = 32 } = {}) {
  const prompt = buildComposedPrompt(state);
  const plan = inferPromptPlan(prompt);
  const active = state.fields[state.activeIndex];
  const layout = splitWorkspaceColumns(width);
  const mainHeight = Math.max(9, height - 12);
  const main = layout.mode === 'narrow'
    ? renderNarrowComposer(state, plan, prompt, mainHeight, width)
    : Row({ gap: 2, widths: layout.mode === 'wide' ? layout.widths : layout.widths },
        renderFieldsPane(state, Math.max(28, layout.widths[0]), mainHeight),
        renderComposerWorkPane(state, plan, prompt, Math.max(40, layout.widths[1]), mainHeight),
        ...(layout.mode === 'wide' ? [renderComposerRail(state, plan, Math.max(26, layout.widths[2]), mainHeight)] : []),
      );

  return WorkspaceShell({
    title: 'Prompt Composer',
    subtitle: 'multi-section terminal editor',
    stats: [
      { label: 'Field', value: active.title },
      { label: 'Template', value: `${state.templateIndex + 1}/${FIELD_TEMPLATES.length}` },
      { label: 'Intent', value: plan.intent },
    ],
    right: [{ label: 'Mode', value: layout.mode }],
    focus: state.activeTab,
    tabs: TABS,
    activeTab: state.activeTab,
    tabHint: 'Tab switches fields · [/] switches workspace tab · PgUp/PgDn template · Enter submit',
    main,
    command: WorkspaceCommandBar({ value: '', prompt: '›', mode: 'COMPOSER', suggestions: ['Enter submit', 'Tab field', 'PgUp/PgDn template', 'Ctrl+J newline'] }),
    activity: KeyHintBar({ title: ' LOCAL HELP ', hints: [['↑/↓', 'move field'], ['Ctrl+A/E', 'line edges'], ['Ctrl+K/U/W', 'delete'], ['Alt+←/→', 'word move'], ['[/]', 'tabs'], ['Enter', 'submit']] }),
    footer: WorkspaceFooter({ left: ['Connected', `chars ${prompt.length}`, state.status], right: ['demo: composer'] }),
    height,
  });
}

function renderFieldsPane(state, width, height) {
  return WorkspacePane({
    title: ' FIELDS ',
    active: state.activeTab === 'compose',
    height,
    children: [
      ChipLine({ label: 'Templates', chips: FIELD_TEMPLATES.map((_, index) => ({ id: String(index + 1), label: String(index + 1) })), active: String(state.templateIndex + 1) }),
      Text(''),
      ...state.fields.map((field, index) => Text(formatFieldLine(field, index === state.activeIndex, width - 4), { wrap: false })),
      Text(''),
      Text('Use ↑/↓ to select a field; text keys edit the selected field.', { wrap: false }),
    ],
  });
}

function renderComposerWorkPane(state, plan, prompt, width, height) {
  if (state.activeTab === 'preview') return renderPreviewPane(plan, prompt, width, height, true);
  if (state.activeTab === 'history') return renderHistoryPane(state, height, true);
  const field = state.fields[state.activeIndex];
  return WorkspacePane({
    title: ` EDIT ${field.title.toUpperCase()} `,
    active: true,
    height,
    children: [
      TextEditorView({ title: ` ${field.title} draft `, value: field.editor.value, cursor: field.editor.cursor, width: Math.max(30, width - 4), height: Math.max(5, Math.floor(height * 0.45)), lineNumbers: false }),
      Panel(' Live prompt plan ',
        Text(`intent  : ${plan.intent}`),
        Text(`blocks  : ${plan.blocks.join(' + ')}`),
        Text(`risk    : ${plan.risk}`),
      ),
      Text(fitInline(state.lastAction, Math.max(20, width - 4)), { wrap: false }),
    ],
  });
}

function renderComposerRail(state, plan, width, height) {
  return WorkspacePane({
    title: ' PREVIEW / HISTORY ',
    height,
    children: [
      Text(`intent: ${plan.intent}`),
      Text(`risk  : ${plan.risk}`),
      Text(''),
      Text('Recent submissions'),
      ...(state.submitted.length ? state.submitted.slice(-6).map((item, index) => Text(`${index + 1}. ${fitInline(item.summary, width - 6)}`, { wrap: false })) : [Text('No submissions yet.')]),
    ],
  });
}

function renderPreviewPane(plan, prompt, width, height, active) {
  return WorkspacePane({
    title: ' PREVIEW ',
    active,
    height,
    children: [
      Text(`detected intent : ${plan.intent}`),
      Text(`estimated blocks: ${plan.blocks.join(' + ')}`),
      Text(`risk level      : ${plan.risk}`),
      Text(''),
      ...prompt.split('\n').slice(0, Math.max(3, height - 8)).map((line) => Text(fitInline(line, width - 4), { wrap: false })),
    ],
  });
}

function renderHistoryPane(state, height, active) {
  return WorkspacePane({
    title: ' SUBMITTED PROMPTS ',
    active,
    height,
    children: state.submitted.length
      ? state.submitted.slice(-Math.max(3, height - 4)).flatMap((item, index) => [Text(`${index + 1}. ${item.summary}`, { wrap: false }), Text(`   detected intent: ${item.plan.intent}`, { wrap: false })])
      : [Text('No submitted prompts yet.')],
  });
}

function renderNarrowComposer(state, plan, prompt, height, width) {
  if (state.activeTab === 'preview') return renderPreviewPane(plan, prompt, width, height, true);
  if (state.activeTab === 'history') return renderHistoryPane(state, height, true);
  return renderComposerWorkPane(state, plan, prompt, width, height);
}

export function handlePromptComposerKey({ key, state }) {
  const editor = state.fields[state.activeIndex].editor;

  if (key.name === '[' || (key.name === 'left' && key.ctrl)) return switchTab(state, -1);
  if (key.name === ']' || (key.name === 'right' && key.ctrl)) return switchTab(state, 1);

  if (key.name === 'enter') {
    const prompt = buildComposedPrompt(state);
    const plan = inferPromptPlan(prompt);
    state.submitted.push({ summary: `${plan.intent}: ${state.fields[0].editor.value}`, prompt, plan });
    state.status = `Submitted composer prompt as ${plan.intent} request.`;
    state.lastAction = 'Prompt submitted and stored in History.';
    state.activeTab = 'history';
    return;
  }

  if (key.name === 'tab' || key.name === 'up' || key.name === 'down') {
    moveField(state, key.name === 'up' || key.shift ? -1 : 1);
    state.activeTab = 'compose';
    return;
  }

  if (key.name === 'page-up') return loadTemplate(state, -1);
  if (key.name === 'page-down') return loadTemplate(state, 1);
  if (key.name === 'line-break') {
    editor.insertLineBreak();
    state.lastAction = `Added line break in ${state.fields[state.activeIndex].title}.`;
    return;
  }

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
    state.activeTab = 'compose';
    state.lastAction = `Edited ${state.fields[state.activeIndex].title}.`;
  }
}

export function buildComposedPrompt(state) {
  const values = Object.fromEntries(state.fields.map((field) => [field.id, field.editor.value.trim()]));
  return [
    `Goal: ${values.goal}`,
    `Context: ${values.context}`,
    `Constraints: ${values.constraints}`,
    `Expected output: ${values.output}`,
  ].join('\n');
}

export function inferPromptPlan(prompt) {
  const text = String(prompt).toLowerCase();
  const intent = /diff|patch|apply|code|src\//.test(text)
    ? 'code'
    : /write|rewrite|copy|release/.test(text)
      ? 'writing'
      : /debug|bug|error|lifecycle/.test(text)
        ? 'debugging'
        : 'planning';
  const blocks = intent === 'code'
    ? ['text', 'code', 'diff', 'command']
    : intent === 'debugging'
      ? ['text', 'warning', 'command']
      : ['text'];
  const risk = /apply|delete|run|shell|patch/.test(text) ? 'needs confirmation' : 'low';
  return { intent, blocks, risk };
}

function createField(id, title, value) {
  return { id, title, editor: new InputEditor(value) };
}

function moveField(state, delta) {
  state.activeIndex = mod(state.activeIndex + delta, state.fields.length);
  state.status = `Focused ${state.fields[state.activeIndex].title}.`;
  state.lastAction = state.status;
}

function loadTemplate(state, delta) {
  state.templateIndex = mod(state.templateIndex + delta, FIELD_TEMPLATES.length);
  const template = FIELD_TEMPLATES[state.templateIndex];
  for (const field of state.fields) field.editor.set(template[field.id] ?? '');
  state.activeIndex = 0;
  state.activeTab = 'compose';
  state.status = `Loaded template ${state.templateIndex + 1}.`;
  state.lastAction = state.status;
}

function switchTab(state, delta) {
  const index = TABS.findIndex((tab) => tab.id === state.activeTab);
  state.activeTab = TABS[mod(index + delta, TABS.length)].id;
  state.status = `Opened ${state.activeTab} tab.`;
}

function formatFieldLine(field, active, width) {
  const marker = active ? '›' : ' ';
  return `${marker} ${field.title.padEnd(15)} ${fitInline(field.editor.value, Math.max(10, width - 18))}`;
}

function mod(value, size) {
  return ((value % size) + size) % size;
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Prompt Composer',
    state: createPromptComposerState(),
    render: createPromptComposerView,
    onKey: handlePromptComposerKey,
  });
}
