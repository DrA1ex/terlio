# Getting started

Mock AI Terminal is a dependency-free rich terminal UI library for Node.js. It gives you a declarative UI tree, a renderer that updates only changed terminal lines, and a set of interaction primitives for building full-screen terminal applications.

## Requirements

- Node.js 18 or newer.
- ES modules.
- A real TTY for interactive apps and examples.

## Install or run locally

Inside this repository:

```bash
npm install
npm test
npm run check
```

Run the default demo:

```bash
npm start
```

Run a specific example:

```bash
npm run example:components
npm run demo:support-desk
```

## First static render

Use `renderToString()` when you want to render a UI tree to text. This is useful for tests, snapshots, demos, and non-interactive output.

```js
import { Box, Row, Text, renderToString } from 'mock-ai-terminal';

const view = Box({ border: true, padding: 1, title: ' Status ' },
  Text('Build finished.'),
  Row({ gap: 2 }, Text('tests: passed'), Text('coverage: ok')),
);

console.log(renderToString(view, { width: 50, height: 8 }));
```

`renderToString()` always produces a fixed-size frame. Lines are padded or clipped to the requested width and height, which makes output stable in tests.

## First terminal renderer

Use `TerminalRenderer` when you want to update an interactive terminal screen. It stores the previous frame and writes an ANSI patch for the difference between the old and new frame.

```js
import { Box, Text, TerminalRenderer } from 'mock-ai-terminal';

const renderer = new TerminalRenderer({ output: process.stdout });

function view(message) {
  return Box({ border: true, padding: 1, title: ' App ' }, Text(message));
}

renderer.renderNode(view('Ready'), {
  width: process.stdout.columns || 80,
  height: process.stdout.rows || 24,
});

setTimeout(() => {
  renderer.renderNode(view('Updated'), {
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24,
  });
}, 500);
```

## First interactive app

A basic interactive app usually has four pieces:

1. State.
2. A `view()` function that converts state into a UI tree.
3. A `render()` function that sends the tree to `TerminalRenderer`.
4. A key handler that calls `parseKey()` and updates state.

```js
import {
  TerminalRenderer,
  WorkspaceShell,
  WorkspacePane,
  WorkspaceFooter,
  Text,
  parseKey,
  ansi,
} from 'mock-ai-terminal';

const input = process.stdin;
const output = process.stdout;
const renderer = new TerminalRenderer({ output });

let selected = 0;
const items = ['Inbox', 'Assigned', 'Closed'];

function view() {
  return WorkspaceShell({
    title: 'Mini App',
    subtitle: 'Use arrows to move',
    main: WorkspacePane({
      title: ' Queues ',
      active: true,
      children: items.map((item, index) => Text(`${index === selected ? '›' : ' '} ${item}`)),
    }),
    footer: WorkspaceFooter({ left: ['↑/↓ move', 'Ctrl+C exit'] }),
    height: output.rows || 24,
  });
}

function render() {
  renderer.renderNode(view(), {
    width: output.columns || 80,
    height: output.rows || 24,
  });
}

function cleanup() {
  input.setRawMode(false);
  output.write(ansi.showCursor + ansi.normalScreen + ansi.reset + '\n');
}

output.write(ansi.altScreen + ansi.hideCursor + ansi.clear + ansi.home);
input.setRawMode(true);
input.setEncoding('utf8');
input.resume();
input.on('data', (chunk) => {
  const key = parseKey(chunk);
  if (key.name === 'ctrl-c') {
    cleanup();
    process.exit(0);
  }
  if (key.name === 'up') selected = Math.max(0, selected - 1);
  if (key.name === 'down') selected = Math.min(items.length - 1, selected + 1);
  render();
});
output.on('resize', render);

render();
```

For a larger application shell, inspect `examples/support-desk/` and `examples/command-center.js`.

## Choosing the right layer

Use the low-level UI runtime when you need exact control over layout and rendering:

```js
Box({ border: true }, Row({ gap: 2 }, Text('A'), Text('B')))
```

Use component helpers when you need common terminal UI patterns:

```js
SelectList({ items, selectedIndex })
CommandBar({ value, suggestions })
ScrollPane({ lines, scroll, height })
```

Use workspace primitives when you are building a product-style full-screen terminal application:

```js
WorkspaceShell({ header, tabs, main, command, footer })
```

Use `RichTerminalApp` when you want the built-in mock AI chat application instead of assembling your own runtime.
