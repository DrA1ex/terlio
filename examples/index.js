#!/usr/bin/env node
const groups = [
  ['Business demos', [
    ['npm run demo:chat', 'AI chat workspace with commands, skills, sessions, palette and structured blocks.'],
    ['npm run demo:support-desk', 'Support Triage Desk: ticket queue, reply composer, SLA blocks and ticket timeline.'],
  ]],
  ['Product examples', [
    ['npm run example:chat', 'Full mock AI chat with commands, skills, sessions, palette and structured blocks.'],
    ['npm run example:composer', 'Prompt Composer: multi-field prompt editing, templates, preview and submit history.'],
    ['npm run example:code-review', 'AI Code Review Terminal: structured blocks, selected block actions, confirm apply/run.'],
    ['npm run example:command-center', 'Command Center: palette, mode stack, modal, toast, progress and status dashboard.'],
    ['npm run example:sessions', 'Session Browser: filter, preview, create, export and delete with confirmation.'],
    ['npm run example:agent-stream', 'Agent Stream Playground: structured streaming, cancel, retry, regenerate and rewrite actions.'],
  ]],
  ['Library diagnostics and galleries', [
    ['npm run example:keys', 'Key Inspector: raw escape sequences, normalized keys and editor action diagnostics.'],
    ['npm run example:themes', 'Theme Gallery: compare structured transcript, blocks, toast and panels across themes.'],
    ['npm run example:blocks', 'Blocks Gallery: text/code/diff/command/warning/tool_result rendering and block actions.'],
    ['npm run example:components', 'Static UI-runtime showcase with virtual frames and frame diff output.'],
  ]],
  ['Legacy focused labs', [
    ['npm run example:editor', 'InputEditor lab: cursor movement, history, deletion, paste and key diagnostics.'],
    ['npm run example:palette', 'Command palette: filterable list, selected row and scrollable suggestions.'],
    ['npm run example:stream', 'Streaming workbench: fake incremental model output and cancellation.'],
    ['npm run example:kit', 'Interaction kit: reusable SelectList, Modal, Toast, ConfirmPrompt and ModeManager.'],
  ]],
];

console.log('Mock AI Terminal examples\n');
for (const [title, items] of groups) {
  console.log(`${title}:`);
  for (const [command, description] of items) {
    console.log(`  ${command.padEnd(32)} ${description}`);
  }
  console.log('');
}
console.log('All examples are dependency-free Node.js scripts. Interactive examples require a real TTY.');
