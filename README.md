# Terlio

Terlio is a dependency-free declarative terminal UI framework for Node.js. It combines a fixed-frame renderer, ANSI-aware layout, reusable workspace components, normalized keyboard input, overlays, command palettes, scroll state and structured assistant output in one plain-JavaScript package.

Use it for full-screen CLI applications, AI and agent consoles, internal tools, support desks, review workflows, command centers and streaming interfaces that need more structure than sequential `console.log()` output.

## Highlights

- Declarative primitives: `Text`, `Box`, `Row`, `Column`, `Panel`, `Grid` and `SplitPane`.
- Product-level composition: `WorkspaceShell`, `WorkspacePane`, `WorkspaceFooter`, `Docked` and `RequireViewport`.
- Efficient rendering through fixed virtual frames and row-level ANSI patches.
- Stateful interaction helpers for lists, scrolling, focus, modes, text editing and command palettes.
- Blocking modals and confirmations plus non-blocking toast overlays.
- Unicode-aware measurement and clipping for emoji, CJK and styled ANSI text.
- Structured response blocks for text, code, diffs, commands, warnings and tool results.
- No runtime dependencies; Node.js built-ins only.

## Install

```bash
npm install terlio
```

Terlio requires Node.js 18 or newer and uses ES modules.

## First render

```js
import { Box, Row, Text, renderToString } from 'terlio';

const screen = Box(
  { border: true, padding: 1, title: ' Status ' },
  Text('Terlio is ready.'),
  Row({ gap: 2 }, Text('tests: passed'), Text('provider: mock')),
);

console.log(renderToString(screen, { width: 48, height: 8 }));
```

## Run packaged examples

The npm package includes all examples and a small launcher. They remain available after installation from the registry:

```bash
npx terlio list
npx terlio demo:chat
npx terlio demo:support-desk
npx terlio example:palette
npx terlio example:themes
npx terlio example:components
```

Interactive examples require a real TTY. `example:components` is a one-shot stdout example and can be used in CI or redirected to a file.

The launcher accepts short names too:

```bash
npx terlio chat
npx terlio palette
npx terlio components
```

## Repository development

```bash
npm ci
npm run check
npm test
npm run test:package
```

`npm run test:package` creates the actual npm tarball, installs it into a clean temporary consumer project, imports `terlio`, lists the packaged examples and runs the one-shot component example.

Repository-only npm aliases are also available:

```bash
npm run demo:chat
npm run demo:support-desk
npm run demo:code-review
npm run example:editor
npm run example:palette
npm run example:stream
npm run example:kit
npm run example:keys
npm run example:themes
npm run example:blocks
npm run example:components
```

## Interactive app runtime

For product-style applications, `createWorkspaceApp()` owns terminal lifecycle, raw input, resize handling, cleanup and invalidation:

```js
import {
  Text,
  WorkspacePane,
  WorkspaceShell,
  createWorkspaceApp,
} from 'terlio';

const state = { count: 0 };

const app = createWorkspaceApp({
  title: 'Counter',
  state,
  render: ({ width, height }) => WorkspaceShell({
    title: 'Counter',
    subtitle: 'Press ↑ or ↓',
    main: WorkspacePane({
      title: ' Value ',
      active: true,
      children: [Text(`Count: ${state.count}`)],
    }),
    height,
  }),
  onKey: ({ key, invalidate }) => {
    if (key.name === 'up') state.count += 1;
    if (key.name === 'down') state.count -= 1;
    invalidate();
  },
});

app.start();
```

## Documentation

- [Getting started](docs/getting-started.md)
- [UI runtime and layout](docs/ui-runtime.md)
- [Components](docs/components.md)
- [Interactive applications](docs/interactive-apps.md)
- [Structured output and providers](docs/structured-output.md)
- [API reference](docs/api-reference.md)
- [Examples](docs/examples.md)
- [Publishing and releases](docs/publishing.md)

## Package exports

The public API is exported from the package root:

```js
import { TerminalRenderer, WorkspaceShell, parseKey } from 'terlio';
```

Examples can also be imported explicitly for inspection or testing:

```js
import { createComponentsShowcaseView } from 'terlio/examples/components-showcase';
```

Use the `terlio` CLI rather than importing an interactive example when the goal is to run it.


## License

[MIT](LICENSE)
