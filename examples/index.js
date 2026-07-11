#!/usr/bin/env node
const groups = [
  ['Demos', [
    ['npm run demo:chat', 'Full AI chat workspace with commands, skills, sessions, palette, themes and structured blocks.'],
    ['npm run demo:support-desk', 'Support Triage Desk: product-style queue, reply composer, SLA blocks, timeline and modals.'],
    ['npm run demo:code-review', 'AI Code Review Terminal: PR picker, tabbed review panes, highlighted diffs, live comments and toast jump target.'],
  ]],
  ['Product-style examples', [
    ['npm run example:editor', 'Editor Lab: multiline editor, saved-draft navigation, diagnostics, adaptive help and compact fallback.'],
    ['npm run example:palette', 'Release Command Center: start with a mission briefing, execute searchable actions through animated command activity, and follow contextual next-step guidance.'],
    ['npm run example:stream', 'Streaming Workbench: multiline prompt, sticky scrollback, runtime controls, templates and timer cleanup.'],
  ]],
  ['UI mechanics examples', [
    ['npm run example:kit', 'Interaction Kit: interactive component catalog for nodes, workspace pieces, feedback overlays, editors, scrolling, palette, timeline and theme tokens.'],
    ['npm run example:keys', 'Key Inspector: responsive raw/normalized key diagnostics with live editor result and paste support.'],
    ['npm run example:themes', 'Theme Studio: stage, compare and really apply semantic themes to a live workspace.'],
    ['npm run example:blocks', 'Structured Response Explorer: response scenarios, ordered block map, rendered output, inspector and safe mock actions.'],
    ['npm run example:components', 'Component Composition Snapshot: a one-shot release-readiness screen showing how layout, state, feedback and frame-diff runtime compose.'],
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
