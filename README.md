# Terlio.js

Terlio.js is a dependency-free declarative terminal UI framework for Node.js. It combines a fixed-frame renderer, ANSI-aware layout, reusable workspace components, normalized keyboard input, overlays, command palettes, scroll state and structured assistant output in one plain-JavaScript package.

Use it for full-screen CLI applications, AI and agent consoles, internal tools, support desks, review workflows, command centers and streaming interfaces that need more structure than sequential `console.log()` output.

<img width="1280" alt="UI" src="https://github.com/user-attachments/assets/674cd5e9-f155-4a40-bbcf-fa2f3a18c84a" />


## Install

Create or open a Node.js project, then install Terlio.js:

```bash
npm install terlio.js
```

Terlio.js requires Node.js 18 or newer and uses ES modules.

## First render

```js
import { Box, Row, Text, renderToString } from 'terlio.js';

const screen = Box(
  { border: true, padding: 1, title: ' Status ' },
  Text('Terlio.js is ready.'),
  Row({ gap: 2 }, Text('tests: passed'), Text('provider: mock')),
);

console.log(renderToString(screen, { width: 48, height: 8 }));
```

## Run packaged examples

After installing `terlio.js` in the current Node.js project, use its bundled launcher:

```bash
npx terlio.js examples
npx terlio.js demo:chat
npx terlio.js demo:support-desk
npx terlio.js example:palette
npx terlio.js example:themes
npx terlio.js example:long-text
npx terlio.js example:syntax
npx terlio.js example:components
```

The `examples` command prints the complete grouped catalog, including `example:long-text` and `example:syntax`. Interactive examples require a real TTY. `example:syntax` and `example:components` are one-shot stdout examples and can be used in CI or redirected to a file.

The launcher accepts short names too:

```bash
npx terlio.js chat
npx terlio.js palette
npx terlio.js components
```

## Highlights

- Declarative primitives: `Text`, `Box`, `Row`, `Column`, `Panel`, `Grid` and `SplitPane`.
- Product-level composition: `WorkspaceShell`, `WorkspacePane`, `WorkspaceFooter`, `Docked` and `RequireViewport`.
- Efficient rendering through fixed virtual frames, viewport-only long-text formatting, input batching and row-level ANSI patches.
- Stateful interaction helpers for lists, scrolling, focus, modes, text editing and command palettes.
- Pointer input with SGR 1006 mouse reporting, wheel/touchpad events, clicks, coordinates and component hit-testing.
- Blocking modals and confirmations, non-blocking toast overlays, and bottom-anchored popups that do not consume layout rows.
- Unicode-aware measurement and clipping for emoji, CJK and styled ANSI text.
- Structured response blocks for text, code, diffs, commands, warnings and tool results.
- Opt-in zero-dependency syntax highlighting for common JavaScript, Python, C/C++, Swift, Objective-C and configuration files.
- No runtime dependencies; Node.js built-ins only.

## Secure defaults

Terlio.js treats rendered text, pointer metadata, terminal input, clipboard access and persisted sessions as separate boundaries. Untrusted text cannot emit arbitrary terminal controls, pointer regions never come from displayed text, bracketed paste remains a text transaction, and terminal state is restored when managed runtimes stop or fail. Raw ANSI, OSC 52 fallback and process-global handlers require explicit opt-in.

See [Security model](docs/security-model.md) for the complete behavior and configuration options. Projects upgrading from an older release can use the separate [1.2.0 migration guide](docs/security-migration-1.2.md).

## Repository development

```bash
npm ci
npm run check
npm test
npm run test:coverage
npm run test:package
```

`npm run test:package` creates the actual npm tarball, installs it into a clean temporary consumer project, imports `terlio.js`, lists the packaged examples and runs the one-shot component example.

`npm run test:coverage` runs the black-box suite through the public API and enforces at least 80% line, branch, and function coverage for `src/lib`.

Repository-only npm aliases are also available. Run `npm run examples` for the same grouped catalog used by the packaged launcher.

```bash
npm run examples
npm run demo:chat
npm run demo:support-desk
npm run demo:code-review
npm run example:editor
npm run example:palette
npm run example:stream
npm run example:long-text
npm run example:syntax
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
} from 'terlio.js';

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

The render context also includes a demand-driven `animationFrame`, suitable for `Spinner({ frame: animationFrame })`. The runtime starts its animation clock only when the current render reads `animationFrame` (or calls `requestAnimationFrame()`), and suspends it as soon as the render becomes static. Configure the active cadence with `animationMs`, or set it to `0` to disable animation entirely.


## Pointer input

`createWorkspaceApp()` can own mouse reporting together with raw keyboard input. In the default `pointer: 'auto'` mode, Terlio enables SGR 1006 reporting when the rendered tree contains an auto-enabling pointer region or the runtime has a global `onPointer` handler, then disables it during cleanup.

```js
import { ScrollPane, createWorkspaceApp, scrollBy } from 'terlio.js';

const state = {
  lines: Array.from({ length: 100 }, (_, index) => `row ${index + 1}`),
  scroll: 0,
};

const app = createWorkspaceApp({
  state,
  render: ({ height }) => ScrollPane({
    title: ' History ',
    lines: state.lines,
    height,
    scroll: state.scroll,
    pointerId: 'history',
    pointerAutoEnable: false,
    onWheel: (event) => {
      const max = Math.max(0, state.lines.length - height + 3);
      state.scroll = scrollBy(state.scroll, event.deltaY, max);
    },
    onClick: (event) => {
      // event.localY can be mapped to a custom scrollbar thumb or track.
    },
  }),
});

app.start();
```

Pointer events expose zero-based screen coordinates as `x` and `y`, original one-based terminal coordinates as `column` and `row`, wheel deltas, modifiers, button information, and hit-tested `target`, `currentTarget`, `localX`, and `localY` fields. Touchpad scrolling is reported by terminals through the same `wheel-up`, `wheel-down`, `wheel-left`, and `wheel-right` events.

Set `pointerAutoEnable: false` on a passive region when its handlers should remain registered without enabling global mouse reporting by themselves. Such regions become active whenever another component enables pointer reporting or the application temporarily forces it with `app.setPointerOverride(true)`.

For text that must stay selectable while wheel input remains active, use `SelectableText` or `ScrollPane({ selection })`. Dragging creates an in-app selection in content coordinates, so it remains visible and valid while the pane scrolls. Clicking inside the highlighted range invokes `onCopy`; a successful copy clears the selection, while a failed copy keeps it for retry. Clicking elsewhere clears the selection without copying. `Ctrl+C` always keeps its terminal meaning (`SIGINT`). `Ctrl+T` remains an exceptional fallback for temporarily disabling mouse reporting and using the terminal emulator's native selection.

`ScrollPane` virtualizes line preparation: only rows inside the current viewport are converted, ANSI-clipped and rendered. A 10,000-row array therefore has the same per-wheel formatting cost as a short source with the same viewport height. For generated data, `lines` may also be an array-like object or a line source created with `createTextLineSource()`. Run `npx terlio.js example:long-text` to exercise wheel scrolling and multi-viewport selection against 10,000 rows.

Any node can define `onPointer`, `onClick`, `onWheel`, `onDrag`, `onMove`, or `onRelease`. Use `PointerRegion()` to wrap a component that does not expose pointer props directly. Call `app.togglePointerOverride()` or `app.setPointerOverride(true | false | null)` to temporarily override automatic ownership without changing the configured pointer preference.

## Syntax highlighting

Terlio.js includes an opt-in zero-dependency lexical highlighter. Use `SyntaxText` for a component, `highlightSyntax()` for ANSI output, or enable highlighting in structured code blocks:

```js
import { createBlock, renderBlockLines, themes } from 'terlio.js';

const block = createBlock({
  type: 'code',
  filename: 'server.js',
  syntaxHighlight: true,
  content: 'export const port = 3000;',
});

const lines = renderBlockLines({ block, width: 72, theme: themes.ocean });
```

You can also pass `syntaxHighlight: true` to `renderBlocksLines()`, `ChatScreen`, `createChatScreen()` or `RichTerminalApp`. Explicit language names, common aliases, filenames and shebangs are supported. Run `npx terlio.js example:syntax` for a packaged snapshot, and see [Syntax highlighting](docs/syntax-highlighting.md) for the supported file types and theme tokens.

## Bottom-anchored overlays

`BottomOverlay` places a non-modal surface over the bottom portion of an existing frame without reducing the space assigned to the underlying content. Pointer regions rendered inside the overlay participate in normal hit-testing and take precedence over covered regions, while uncovered background components remain interactive.

```js
import { BottomOverlay, Box, Column, Text } from 'terlio.js';

const screen = BottomOverlay({
  content: Column(
    Text('Transcript row 1'),
    Text('Transcript row 2'),
    Text('Transcript row 3'),
  ),
  overlay: Box(
    { border: true, pointerId: 'autocomplete' },
    Text('› /help', { pointerId: 'autocomplete:help', onClick: acceptHelp }),
    Text('  /theme', { pointerId: 'autocomplete:theme', onClick: acceptTheme }),
  ),
  height: terminalRows,
  bottom: composerHeight,
});
```

Use `bottom` to reserve fixed chrome below the popup, and `left`, `right`, `width`, and `align` to position narrower surfaces. Closing the overlay returns to the normal row-diff renderer; no full-screen repaint is required. The packaged chat demo uses this component for slash-command autocomplete, so suggestions physically cover the latest transcript rows instead of shrinking the transcript viewport.

## Documentation

- [Getting started](docs/getting-started.md)
- [UI runtime and layout](docs/ui-runtime.md)
- [Components](docs/components.md)
- [Interactive applications](docs/interactive-apps.md)
- [Structured output and providers](docs/structured-output.md)
- [Syntax highlighting](docs/syntax-highlighting.md)
- [API reference](docs/api-reference.md)
- [Examples](docs/examples.md)
- [Publishing and releases](docs/publishing.md)

## Package exports

The public API is exported from the package root:

```js
import { TerminalRenderer, WorkspaceShell, parseKey } from 'terlio.js';
```

Examples can also be imported explicitly for inspection or testing:

```js
import { createComponentsShowcaseView } from 'terlio.js/examples/components-showcase';
```

Use the `terlio.js` CLI rather than importing an interactive example when the goal is to run it.

## License

[MIT](LICENSE)

## Terminal security

Terlio.js renders public text with the safe terminal policy by default. Arbitrary CSI, OSC, DCS, APC, PM, SOS and C1 controls are blocked at both layout and terminal-sink boundaries, while validated SGR styling remains available. See [Safe terminal rendering](docs/safe-terminal-rendering.md).

Pointer hit regions are stored as structured layout metadata rather than encoded in rendered text. Geometry is validated at the frame boundary, overlays retain structural z-order, and each frame has a configurable region limit. See [Pointer metadata isolation](docs/pointer-isolation.md).

The security behavior is covered by the ordinary test suite and the focused checks described in [Security contract testing](docs/security-contract-testing.md). The complete trust boundaries and configuration options are documented in [Security model](docs/security-model.md).
