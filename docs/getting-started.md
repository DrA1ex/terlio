# Getting started

Terlio.js is a dependency-free declarative terminal UI framework for Node.js. It provides a fixed-frame renderer, layout primitives and interaction helpers for full-screen terminal applications.

## Requirements

- Node.js 18 or newer.
- ES modules.
- A real TTY for interactive applications and examples.

## Install from npm

```bash
npm install terlio.js
```

After installing the package in the current Node.js project, list its bundled examples:

```bash
npx terlio.js list
```

Run a product demo or focused example:

```bash
npx terlio.js demo:chat
npx terlio.js demo:support-desk
npx terlio.js example:palette
npx terlio.js example:components
```

Interactive examples require a real terminal. `example:components` writes a deterministic Component Composition Snapshot to stdout and does not require raw input.

## First static render

Use `renderToString()` for tests, snapshots and non-interactive output:

```js
import { Box, Row, Text, renderToString } from 'terlio.js';

const view = Box(
  { border: true, padding: 1, title: ' Status ' },
  Text('Build finished.'),
  Row({ gap: 2 }, Text('tests: passed'), Text('package: ready')),
);

console.log(renderToString(view, { width: 50, height: 8 }));
```

The result is a fixed-size frame. Lines are padded or clipped to the requested width and height, which keeps snapshots stable.

## First terminal renderer

`TerminalRenderer` retains the previous frame and writes only changed rows:

```js
import { Box, Text, TerminalRenderer } from 'terlio.js';

const renderer = new TerminalRenderer({ output: process.stdout });

function view(message) {
  return Box({ border: true, padding: 1, title: ' App ' }, Text(message));
}

renderer.renderNode(view('Ready'), {
  width: process.stdout.columns || 80,
  height: process.stdout.rows || 24,
});
```

## First managed workspace

Prefer `createWorkspaceApp()` over wiring raw mode and cleanup by hand:

```js
import {
  Text,
  WorkspaceFooter,
  WorkspacePane,
  WorkspaceShell,
  createWorkspaceApp,
} from 'terlio.js';

const state = { selected: 0 };
const items = ['Inbox', 'Assigned', 'Closed'];

const app = createWorkspaceApp({
  title: 'Mini App',
  state,
  render: ({ height }) => WorkspaceShell({
    title: 'Mini App',
    subtitle: 'Use arrows to move',
    main: WorkspacePane({
      title: ' Queues ',
      active: true,
      children: items.map((item, index) => Text(`${index === state.selected ? '›' : ' '} ${item}`)),
    }),
    footer: WorkspaceFooter({ left: ['↑/↓ move', 'Ctrl+C exit'] }),
    height,
  }),
  onKey: ({ key, invalidate }) => {
    if (key.name === 'up') state.selected = Math.max(0, state.selected - 1);
    if (key.name === 'down') state.selected = Math.min(items.length - 1, state.selected + 1);
    invalidate();
  },
});

app.start();
```

The runtime restores the terminal on `Ctrl+C`, `Ctrl+D`, normal stop and unexpected errors, and recalculates layout after resize.

## Work from the repository

```bash
npm ci
npm run check
npm test
npm run test:package
```

The repository keeps `npm run demo:*` and `npm run example:*` aliases for development. End users should prefer `npx terlio.js <id>` because npm does not expose dependency scripts to consuming projects.

## Choose the right layer

Use low-level primitives when you need exact composition:

```js
Box({ border: true }, Row({ gap: 2 }, Text('A'), Text('B')))
```

Use stateful helpers and components for common interaction patterns:

```js
SelectList({ items, selectedIndex })
ScrollPane({ lines, scroll, height })
CommandBar({ value, suggestions })
```

Use workspace primitives for full-screen product interfaces:

```js
WorkspaceShell({ header, tabs, main, command, footer })
```

Use `RichTerminalApp` when you want the included reference chat application with mock and replay providers, sessions, skills, structured blocks and slash commands.

## Local data

The built-in session store uses `~/.terlio.js` by default. Set `TERLIO_JS_HOME` to place session data elsewhere:

```bash
TERLIO_JS_HOME=/tmp/terlio.js npx terlio.js demo:chat
```
