#!/usr/bin/env node
import { Box, Column, HelpOverlay, Panel, Row, Text, ChatTranscript, createMessage, renderBlockLines, stripAnsi, themes } from '../src/lib/index.js';
import { isDirectRun, runInteractiveDemo } from './_demoRuntime.js';

export const BLOCK_GALLERY_BLOCKS = [
  { type: 'text', title: 'Reasoning summary', content: 'The renderer now accepts structured assistant blocks, so a transcript can mix prose, code, diffs, commands and tool output.' },
  { type: 'code', language: 'js', title: 'Reusable command handler', content: "export function applyAction(action, ctx) {\n  if (action.type === 'diff') return ctx.confirm(action);\n  return ctx.toast('No-op action');\n}" },
  { type: 'diff', title: 'src/lib/app.js', content: "--- a/src/lib/app.js\n+++ b/src/lib/app.js\n@@\n- renderLegacyScreen();\n+ renderStructuredScreen();" },
  { type: 'command', title: 'Verification command', command: 'npm test && npm run check' },
  { type: 'warning', title: 'Needs confirmation', content: 'Diff and command blocks should never be applied without an explicit confirm flow.' },
  { type: 'tool_result', name: 'test-runner', status: 'passed', content: '36 tests passed\nsyntax check passed' },
];

export function createBlocksGalleryState() {
  return {
    selectedIndex: 0,
    copied: [],
    actionLog: [],
    status: 'Blocks Gallery: ↑/↓ select block, Enter records an action, C copies mock text.',
  };
}

export function createBlocksGalleryView({ state, width = 108, height = 30 } = {}) {
  const selected = BLOCK_GALLERY_BLOCKS[state.selectedIndex] ?? BLOCK_GALLERY_BLOCKS[0];
  const message = createMessage({ role: 'assistant', status: 'complete', blocks: BLOCK_GALLERY_BLOCKS });
  const transcript = ChatTranscript({ columns: Math.max(50, Math.floor(width * 0.64)), height: Math.max(10, height - 10), messages: [message], theme: themes.dark }).node;

  return Column(
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Blocks Gallery ' },
      Text('A structured transcript showcase. Blocks are renderable units and future action targets.'),
    ),
    Row({ gap: 2, distribute: true },
      Panel(' Rendered transcript ', transcript),
      Column(
        Panel(' Block index ', ...BLOCK_GALLERY_BLOCKS.map((block, index) => Text(formatBlockRow(block, index, index === state.selectedIndex)))),
        Panel(' Selected raw text ', ...renderSelectedBlock(selected, Math.max(24, Math.floor(width * 0.34) - 6)).map((line) => Text(line))),
      ),
    ),
    Row({ gap: 2, distribute: true },
      HelpOverlay({
        title: ' Actions ',
        shortcuts: [
          ['↑/↓', 'select block'],
          ['Enter', 'record primary action'],
          ['C', 'copy block text (mock)'],
          ['A', 'apply if diff block'],
          ['R', 'run if command block'],
        ],
      }),
      Panel(' Action log ', ...(state.actionLog.length ? state.actionLog.slice(-6).map((line) => Text(line)) : [Text('No block actions yet.')]))
    ),
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Status ' }, Text(state.status)),
  );
}

export function handleBlocksGalleryKey({ key, state }) {
  if (key.name === 'up') {
    state.selectedIndex = Math.max(0, state.selectedIndex - 1);
    state.status = `Selected ${BLOCK_GALLERY_BLOCKS[state.selectedIndex].type} block.`;
    return;
  }
  if (key.name === 'down') {
    state.selectedIndex = Math.min(BLOCK_GALLERY_BLOCKS.length - 1, state.selectedIndex + 1);
    state.status = `Selected ${BLOCK_GALLERY_BLOCKS[state.selectedIndex].type} block.`;
    return;
  }
  const block = BLOCK_GALLERY_BLOCKS[state.selectedIndex];
  if (key.name === 'enter') {
    const action = primaryBlockAction(block);
    state.actionLog.push(action);
    state.status = action;
    return;
  }
  if (key.name === 'c') {
    const text = block.command || block.content || block.title || block.type;
    state.copied.push(text);
    state.actionLog.push(`Copied ${block.type} block text.`);
    state.status = `Copied ${block.type} block text.`;
    return;
  }
  if (key.name === 'a') {
    const action = block.type === 'diff' ? 'Mock apply prepared for selected diff block.' : 'Apply is only available for diff blocks.';
    state.actionLog.push(action);
    state.status = action;
    return;
  }
  if (key.name === 'r') {
    const action = block.type === 'command' ? `Mock run prepared: ${block.command}` : 'Run is only available for command blocks.';
    state.actionLog.push(action);
    state.status = action;
  }
}

export function primaryBlockAction(block) {
  if (block.type === 'diff') return 'Primary action: open apply confirmation.';
  if (block.type === 'command') return `Primary action: run command ${block.command}.`;
  if (block.type === 'code') return 'Primary action: copy code block.';
  return `Primary action: inspect ${block.type} block.`;
}

function formatBlockRow(block, index, selected) {
  const label = `${index + 1}. ${block.type}`.padEnd(15);
  const detail = block.title || block.name || block.language || block.command || '';
  return `${selected ? '›' : ' '} ${label} ${detail}`;
}

function renderSelectedBlock(block, width) {
  return renderBlockLines({ block, width, theme: themes.dark }).map((line) => stripAnsi(line));
}

if (isDirectRun(import.meta.url)) {
  runInteractiveDemo({
    title: 'Blocks Gallery',
    state: createBlocksGalleryState(),
    render: createBlocksGalleryView,
    onKey: handleBlocksGalleryKey,
  });
}
