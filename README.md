# Mock AI Terminal

Dependency-free rich terminal UI primitives for Node.js. The package provides a small declarative UI runtime, reusable terminal components, input/key handling helpers, command palette state, workspace layout primitives, structured assistant blocks, and complete example applications.

The project is intentionally plain JavaScript and uses only Node.js built-ins. It is useful for prototypes, internal tools, AI-agent consoles, support desks, command centers, structured streaming demos, and other terminal interfaces that need more than line-by-line `console.log()` output.

## What is included

- A declarative terminal UI layer: `Text`, `Box`, `Row`, `Column`, `Panel`, `renderToString()`, `TerminalRenderer`.
- Stable virtual frames and ANSI diff rendering for efficient terminal updates.
- Reusable UI components: lists, modals, toasts, progress bars, scroll panes, text editors, tabs, command bars, property rows, live blocks, and workspace shells.
- Interaction helpers: `InputEditor`, `parseKey()`, `FocusManager`, `ModeManager`, command palette state and renderer, slash command parsing, scroll state, and toast state.
- Chat and AI-console primitives: structured message blocks, transcript rendering, provider interface, session store, skills, and a mock streaming provider.
- Runnable examples that show both small components and full product-style terminal applications.

## Requirements

- Node.js 18 or newer.
- A real TTY for interactive examples.
- No runtime dependencies.

## Quick start

Install dependencies if you are working from this repository:

```bash
npm install
```

Render a small static UI:

```js
import { Box, Row, Text, renderToString } from 'mock-ai-terminal';

const screen = Box({ border: true, padding: 1, title: ' Demo ' },
  Text('Hello from a terminal UI.'),
  Row({ gap: 2 }, Text('status: ready'), Text('provider: mock')),
);

console.log(renderToString(screen, { width: 48, height: 8 }));
```

Run the main chat demo:

```bash
npm start
```

Run the support desk demo:

```bash
npm run demo:support-desk
```

Run checks and tests:

```bash
npm run check
npm test
```

## Documentation

The detailed documentation lives in [`docs/`](docs/):

- [`docs/getting-started.md`](docs/getting-started.md) — installation, import patterns, first render, and first interactive app.
- [`docs/ui-runtime.md`](docs/ui-runtime.md) — declarative nodes, layout props, virtual frames, and terminal rendering.
- [`docs/components.md`](docs/components.md) — reusable UI components and workspace primitives.
- [`docs/interactive-apps.md`](docs/interactive-apps.md) — keys, input editing, focus, modes, command palette, scrolling, toasts, and sessions.
- [`docs/structured-output.md`](docs/structured-output.md) — structured assistant blocks, chat screens, providers, and streaming.
- [`docs/api-reference.md`](docs/api-reference.md) — public exports grouped by module area.
- [`docs/examples.md`](docs/examples.md) — runnable examples and what each one demonstrates.

## Examples

List all available examples:

```bash
npm run examples
```

Demos:

```bash
npm run demo:chat
npm run demo:support-desk
npm run demo:code-review
```

Product-style examples:

```bash
npm run example:editor
npm run example:palette
npm run example:stream
```

UI mechanics examples:

```bash
npm run example:kit
npm run example:keys
npm run example:themes
npm run example:blocks
npm run example:components
```

Interactive examples require a real terminal. `example:components` renders a complete Component Composition Snapshot to normal stdout and is useful as a deterministic smoke test or CI artifact.

`demo:chat` is the primary chat reference: it includes responsive conversation/composer sizing, slash completion, a searchable command palette, multiline and bracketed-paste editing, structured blocks, streaming-aware scroll anchoring, and a compact viewport fallback below `56×18`.

`example:palette` is a guided Release Command Center: use `/` or `Ctrl+P` to search actions, complete checks → notes → approval → staging deploy, inspect disabled reasons, confirm risky actions, and watch the workspace update.

`demo:code-review` is the reviewed pull-request workflow. `example:agent-stream` was removed because its useful streaming mechanics are already covered more clearly by `example:stream`. The remaining examples have also been audited for responsive sizing, local keyboard ownership, scrolling, compact fallbacks, and clean timer/terminal teardown.

`example:themes` is a staged Theme Studio: browse a candidate without changing the shell, compare it with the active theme, then press `Enter` to apply it to the entire workspace. The token inspector shows the semantic contract behind the visual change.

## Library usage

The package entrypoint exports the public API from `src/lib/index.js`:

```js
import {
  TerminalRenderer,
  WorkspaceShell,
  WorkspacePane,
  WorkspaceCommandBar,
  WorkspaceFooter,
  Text,
  Row,
} from 'mock-ai-terminal';
```

For local development inside this repository you can import directly:

```js
import { renderToString } from './src/lib/index.js';
```

A typical application keeps its own state, converts that state into a UI tree, renders it through `TerminalRenderer`, and updates state from normalized key events:

```js
import {
  TerminalRenderer,
  WorkspaceShell,
  WorkspacePane,
  WorkspaceFooter,
  Text,
  parseKey,
} from 'mock-ai-terminal';

const renderer = new TerminalRenderer({ output: process.stdout });
let count = 0;

function view() {
  return WorkspaceShell({
    title: 'Counter',
    subtitle: 'Minimal interactive app',
    stats: [{ label: 'count', value: count }],
    main: WorkspacePane({ title: ' Main ', active: true, children: [Text(`Count: ${count}`)] }),
    footer: WorkspaceFooter({ left: ['↑/↓ change', 'Ctrl+C exit'] }),
    height: process.stdout.rows,
  });
}

function render() {
  renderer.renderNode(view(), {
    width: process.stdout.columns,
    height: process.stdout.rows,
  });
}

process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdin.resume();
process.stdin.on('data', (chunk) => {
  const key = parseKey(chunk);
  if (key.name === 'ctrl-c') process.exit(0);
  if (key.name === 'up') count += 1;
  if (key.name === 'down') count -= 1;
  render();
});

render();
```

## Project structure

```text
src/
  index.js              package re-export
  lib/
    index.js            public library entrypoint
    app.js              full mock AI terminal app
    ui/                 declarative UI runtime and components
    chat/               chat screen and transcript components
    commands/           slash command parser and registry
    *.js                input, keys, modes, focus, providers, state
examples/               runnable demos and product examples
test/                   node:test test suite
docs/                   documentation
```

## Versioning note

This is an early JavaScript library. The public entrypoint is `src/lib/index.js`, but API names may still evolve as the examples and product-level primitives mature.
