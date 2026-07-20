export const EXAMPLE_GROUPS = [
  {
    id: 'demos',
    title: 'Demos',
    items: [
      {
        id: 'demo:chat',
        name: 'chat',
        file: 'examples/chat.js',
        interactive: true,
        description: 'Full AI chat workspace with commands, skills, sessions, palette, themes and structured blocks.',
      },
      {
        id: 'demo:support-desk',
        name: 'support-desk',
        file: 'examples/support-desk.js',
        interactive: true,
        description: 'Product-style support queue, reply composer, SLA blocks, timeline and modals.',
      },
      {
        id: 'demo:code-review',
        name: 'code-review',
        file: 'examples/code-review.js',
        interactive: true,
        description: 'Pull-request workflow with review panes, highlighted diffs, live comments and confirmations.',
      },
    ],
  },
  {
    id: 'product',
    title: 'Product-style examples',
    items: [
      {
        id: 'example:editor',
        name: 'editor',
        file: 'examples/editor-lab.js',
        interactive: true,
        description: 'Multiline editor, saved drafts, diagnostics, adaptive help and compact fallback.',
      },
      {
        id: 'example:palette',
        name: 'palette',
        file: 'examples/command-palette.js',
        interactive: true,
        description: 'Guided release workflow with searchable actions, activity animation and next-step guidance.',
      },
      {
        id: 'example:stream',
        name: 'stream',
        file: 'examples/streaming-workbench.js',
        interactive: true,
        description: 'Streaming workbench with multiline prompts, sticky scrollback, templates and timer cleanup.',
      },
      {
        id: 'example:long-text',
        name: 'long-text',
        file: 'examples/long-text.js',
        interactive: true,
        description: '10,000-row virtualized text viewport for wheel, selection and renderer performance testing.',
      },
    ],
  },
  {
    id: 'mechanics',
    title: 'UI mechanics',
    items: [
      {
        id: 'example:kit',
        name: 'kit',
        file: 'examples/interaction-kit.js',
        interactive: true,
        description: 'Interactive catalog for layout, feedback, editors, scrolling, palettes, timelines and themes.',
      },
      {
        id: 'example:keys',
        name: 'keys',
        file: 'examples/keys.js',
        interactive: true,
        description: 'Responsive raw and normalized key diagnostics with editor and paste support.',
      },
      {
        id: 'example:themes',
        name: 'themes',
        file: 'examples/themes.js',
        interactive: true,
        description: 'Theme Studio for staging, comparing and applying semantic themes to a live workspace.',
      },
      {
        id: 'example:blocks',
        name: 'blocks',
        file: 'examples/blocks.js',
        interactive: true,
        description: 'Structured Response Explorer with block map, rendered response, inspector and safe actions.',
      },
      {
        id: 'example:components',
        name: 'components',
        file: 'examples/components-showcase.js',
        interactive: false,
        description: 'One-shot composition snapshot showing layout, state, feedback and frame-diff runtime.',
      },
    ],
  },
];

export const EXAMPLES = EXAMPLE_GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, group: group.id, groupTitle: group.title })));

export function findExample(value) {
  const query = String(value ?? '').trim().toLowerCase();
  if (!query) return null;
  return EXAMPLES.find((item) => item.id === query || item.name === query || item.file === query) ?? null;
}
