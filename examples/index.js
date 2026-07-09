#!/usr/bin/env node
const groups = [
  ['Demos', [
    ['npm run demo:chat', 'Full AI chat workspace with commands, skills, sessions, palette, themes and structured blocks.'],
    ['npm run demo:support-desk', 'Support Triage Desk: product-style queue, reply composer, SLA blocks, timeline and modals.'],
    ['npm run example:code-review', 'AI Code Review Terminal: PR picker, tabbed review panes, highlighted diffs, live comments and toast jump target.'],
  ]],
  ['Product-style examples', [
    ['npm run example:editor', 'Editor Lab: multiline InputEditor, saved drafts, diagnostics/history panes and bordered help grid.'],
    ['npm run example:palette', 'Command Palette: searchable action launcher, details pane, accepted log and measured responsive layout.'],
    ['npm run example:stream', 'Streaming Workbench: prompt editor, transcript autoscroll/scrollback and reusable template flow.'],
  ]],
  ['UI mechanics examples', [
    ['npm run example:kit', 'Interaction Kit: interactive component catalog for nodes, workspace pieces, feedback overlays, editors, scrolling, palette, timeline and theme tokens.'],
    ['npm run example:agent-stream', 'Stream Mechanics: low-level structured stream queue, chunk/block events, cancellation, retry and progress.'],
    ['npm run example:keys', 'Key Inspector: raw escape sequences, normalized keys and editor action diagnostics.'],
    ['npm run example:themes', 'Theme Gallery: compare panels, blocks, diffs, status colors and toast shadows across themes.'],
    ['npm run example:blocks', 'Blocks Gallery: structured block rendering, selected block state and mock block actions.'],
    ['npm run example:components', 'Static UI-runtime showcase with virtual frames, layout primitives and frame diff output.'],
  ]],
];

console.log('Mock AI Terminal examples\n');
console.log('Demos are listed first, then product-style examples, then focused UI mechanics references.\n');
for (const [title, items] of groups) {
  console.log(`${title}:`);
  for (const [command, description] of items) {
    console.log(`  ${command.padEnd(32)} ${description}`);
  }
  console.log('');
}
console.log('All examples are dependency-free Node.js scripts. Interactive examples require a real TTY.');
