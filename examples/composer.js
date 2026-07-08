#!/usr/bin/env node
import { Box, Column, HelpOverlay, InputEditor, Panel, Row, Text } from '../src/lib/index.js';
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
    templateIndex: 0,
    submitted: [],
    status: 'Prompt Composer: Tab switches fields, Enter submits the composed prompt.',
  };
}

export function createPromptComposerView({ state, width = 104 } = {}) {
  const prompt = buildComposedPrompt(state);
  const plan = inferPromptPlan(prompt);
  const active = state.fields[state.activeIndex];

  return Column(
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Prompt Composer ' },
      Text('A product-style editor demo: multiple editable prompt sections, cursor movement, templates, preview and submit history.'),
      Text(`Active field: ${active.title} · Template ${state.templateIndex + 1}/${FIELD_TEMPLATES.length}`),
    ),
    Row({ gap: 2, distribute: true },
      Panel(' Editable fields ', ...state.fields.map((field, index) => Text(formatFieldLine(field, index === state.activeIndex, width - 12)))),
      Panel(' Preview ',
        Text(`detected intent : ${plan.intent}`),
        Text(`estimated blocks: ${plan.blocks.join(' + ')}`),
        Text(`risk level      : ${plan.risk}`),
        Text(`chars           : ${prompt.length}`),
        Text(''),
        ...prompt.split('\n').slice(0, 8).map((line) => Text(line)),
      ),
    ),
    Row({ gap: 2, distribute: true },
      HelpOverlay({
        title: ' Editor keys ',
        shortcuts: [
          ['Tab / Shift+Tab', 'switch field'],
          ['↑ / ↓', 'switch field'],
          ['PgUp/PgDn', 'load template'],
          ['Ctrl+A/E', 'start/end'],
          ['Ctrl+K/U/W', 'delete text ranges'],
          ['Alt+←/→', 'move by word'],
          ['Enter', 'submit composed prompt'],
        ],
      }),
      Panel(' Submitted prompts ',
        ...(state.submitted.length ? state.submitted.slice(-5).map((item, index) => Text(`${index + 1}. ${item.summary}`)) : [Text('No submitted prompts yet.')]),
      ),
    ),
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Status ' }, Text(state.status)),
  );
}

export function handlePromptComposerKey({ key, state }) {
  const editor = state.fields[state.activeIndex].editor;

  if (key.name === 'enter') {
    const prompt = buildComposedPrompt(state);
    const plan = inferPromptPlan(prompt);
    state.submitted.push({ summary: `${plan.intent}: ${state.fields[0].editor.value}`, prompt, plan });
    state.status = `Submitted composer prompt as ${plan.intent} request.`;
    return;
  }

  if (key.name === 'tab') {
    moveField(state, key.shift ? -1 : 1);
    return;
  }

  if (key.name === 'up') {
    moveField(state, -1);
    return;
  }

  if (key.name === 'down') {
    moveField(state, 1);
    return;
  }

  if (key.name === 'page-up') {
    loadTemplate(state, -1);
    return;
  }

  if (key.name === 'page-down') {
    loadTemplate(state, 1);
    return;
  }

  if (key.name === 'left') {
    key.meta ? editor.moveWord(-1) : editor.move(-1);
    state.status = 'Moved cursor in active field.';
    return;
  }
  if (key.name === 'right') {
    key.meta ? editor.moveWord(1) : editor.move(1);
    state.status = 'Moved cursor in active field.';
    return;
  }
  if (key.name === 'home' || (key.cmd && key.name === 'left')) {
    editor.home();
    state.status = 'Moved to field start.';
    return;
  }
  if (key.name === 'end' || (key.cmd && key.name === 'right')) {
    editor.end();
    state.status = 'Moved to field end.';
    return;
  }
  if (key.name === 'backspace') {
    editor.backspace();
    state.status = 'Backspace in active field.';
    return;
  }
  if (key.name === 'delete') {
    editor.deleteForward();
    state.status = 'Delete forward in active field.';
    return;
  }
  if (key.name === 'kill-end') {
    editor.killToEnd();
    state.status = 'Killed to field end.';
    return;
  }
  if (key.name === 'kill-start') {
    editor.killToStart();
    state.status = 'Killed to field start.';
    return;
  }
  if (key.name === 'delete-word-left') {
    editor.deleteWordBack();
    state.status = 'Deleted word left in active field.';
    return;
  }
  if (key.name === 'paste') {
    editor.insert(key.text.replace(/\s+/g, ' '));
    state.status = 'Pasted text into active field.';
    return;
  }
  if (key.printable) {
    editor.insert(key.text);
    state.status = `Edited ${state.fields[state.activeIndex].title}.`;
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
}

function loadTemplate(state, delta) {
  state.templateIndex = mod(state.templateIndex + delta, FIELD_TEMPLATES.length);
  const template = FIELD_TEMPLATES[state.templateIndex];
  for (const field of state.fields) field.editor.set(template[field.id] ?? '');
  state.activeIndex = 0;
  state.status = `Loaded template ${state.templateIndex + 1}.`;
}

function formatFieldLine(field, active, width) {
  const parts = field.editor.getParts();
  const cursor = active ? `${parts.before}█${parts.current === ' ' ? '' : parts.current}${parts.after}` : field.editor.value;
  const line = `${active ? '›' : ' '} ${field.title.padEnd(15)} ${cursor || '<empty>'}`;
  return line.length > width ? line.slice(0, Math.max(0, width - 1)) + '…' : line;
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
