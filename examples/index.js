#!/usr/bin/env node
const groups = [
  ['Demos', [
    ['npm run demo:chat', 'Full AI chat workspace with commands, skills, sessions, palette, themes and structured blocks.'],
    ['npm run demo:support-desk', 'Support Triage Desk: product-style queue, reply composer, SLA blocks, timeline and modals.'],
    ['npm run example:code-review', 'AI Code Review Terminal: standard PR review workspace with live comments, Ctrl+O picker, highlighted diffs and scrollable threads.'],
  ]],
  ['Product-style examples', [
    ['npm run example:editor', 'Editor Lab: focused multiline editor, saved drafts, diagnostics/history panes and bordered help grid.'],
    ['npm run example:palette', 'Command Palette: searchable action launcher with details, accepted log and measured responsive layout.'],
    ['npm run example:stream', 'Streaming Workbench: prompt editor, transcript autoscroll/scrollback and reusable template flow.'],
  ]],
  ['Other examples', [
    ['npm run example:kit', 'Interaction Kit: palette-driven toasts, modals, confirmations, progress and mode-stack routing.'],
    ['npm run example:chat', 'Alias for the full mock AI chat workspace.'],
    ['npm run example:composer', 'Prompt Composer workspace: fields, templates, preview/history tabs and command/footer shell.'],
    ['npm run example:command-center', 'Command Center workspace: palette-driven operations dashboard, modal, toast and action log.'],
    ['npm run example:sessions', 'Session Browser workspace: filterable list, preview, actions and delete confirmation.'],
    ['npm run example:agent-stream', 'Agent Stream workspace: structured streaming, progress, cancel/retry/regenerate actions.'],
    ['npm run example:keys', 'Key Inspector: raw escape sequences, normalized keys and editor action diagnostics.'],
    ['npm run example:themes', 'Theme Gallery: compare structured transcript, blocks, toast and panels across themes.'],
    ['npm run example:blocks', 'Blocks Gallery: text/code/diff/command/warning/tool_result rendering and block actions.'],
    ['npm run example:components', 'Static UI-runtime showcase with virtual frames and frame diff output.'],
  ]],
];

console.log('Mock AI Terminal examples\n');
console.log('Demos are listed first, then product-style examples, then other examples.\n');
for (const [title, items] of groups) {
  console.log(`${title}:`);
  for (const [command, description] of items) {
    console.log(`  ${command.padEnd(32)} ${description}`);
  }
  console.log('');
}
console.log('All examples are dependency-free Node.js scripts. Interactive examples require a real TTY.');
