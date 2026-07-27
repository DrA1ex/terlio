# UI runtime

The UI runtime renders a small declarative node tree into a fixed-size terminal frame.

The core exports are:

```js
import {
  Text,
  Box,
  Row,
  Column,
  Panel,
  renderToFrame,
  renderToString,
  TerminalRenderer,
} from 'terlio.js';
```

## Nodes

A node is a plain object with this shape:

```js
{
  type: 'text' | 'box' | 'row' | 'column',
  props: {},
  children: []
}
```

You normally create nodes with helper functions:

```js
const tree = Column({ gap: 1 },
  Text('Header'),
  Row({ gap: 2 }, Text('left'), Text('right')),
  Box({ border: true, padding: 1, title: ' Details ' }, Text('Body')),
);
```

Strings and numbers passed as children are automatically converted to `Text()` nodes. `null`, `undefined`, and `false` children are ignored, which makes conditional rendering simple:

```js
Box({ border: true },
  Text('Always visible'),
  isBusy ? Text('Working...') : null,
);
```

## Text

```js
Text(value, props)
```

Common props:

- `wrap: false` disables wrapping and clips/pads the line instead.
- Any other props are preserved on the node, but only known layout props affect rendering.

```js
Text('A long line that wraps by default')
Text('A status bar that should not wrap', { wrap: false })
```

## Box and Panel

```js
Box(props, ...children)
Panel(title, ...children)
```

`Panel(title, ...)` is a shorthand for a bordered box with padding.

Common `Box` props:

- `border: true` draws a box border.
- `title: ' Title '` draws title text into the top border.
- `padding: 1` applies the same padding on every side.
- `padding: { top, right, bottom, left }` applies side-specific padding.
- `height: number` forces the rendered node to a fixed height.
- `height: 'fill'` is used by a parent fixed-height `Column` to allocate grow space.
- `grow: true` marks the node as a grow child inside a fixed-height `Column`.
- `borderColor: ansiColor` colors the border.

```js
Box({ border: true, padding: { left: 1, right: 1 }, title: ' Logs ', height: 10 },
  Text('Line 1'),
  Text('Line 2'),
);
```

## Column

```js
Column(props, ...children)
Column(...children)
```

Common props:

- `gap: number` inserts blank lines between children.
- `height: number` makes the column fixed-height.

When a fixed-height column contains children with `grow: true` or `height: 'fill'`, remaining height is distributed between those children.

```js
Column({ height: 24 },
  Text('Header'),
  Box({ border: true, grow: true, height: 'fill' }, Text('Main area')),
  Text('Footer'),
);
```

## Row

```js
Row(props, ...children)
Row(...children)
```

Common props:

- `gap: number` inserts spaces between child columns.
- `distribute: true` gives every child an equal width.
- `widths: [number, number, ...]` sets explicit child widths.

```js
Row({ gap: 2, widths: [30, 50] },
  Box({ border: true, title: ' Left ' }, Text('List')),
  Box({ border: true, title: ' Right ' }, Text('Details')),
);
```

If the explicit widths are too wide for the available space, the renderer shrinks columns from the right while keeping each column at least one character wide.

## Frames

`renderToFrame(node, { width, height })` returns a `Frame`. A frame stores a stable, fixed-size list of lines.

```js
const frame = renderToFrame(tree, { width: 80, height: 24 });
frame.toLines();
frame.toString();
```

Useful frame exports:

- `Frame` — frame class.
- `createFrame(lines, options)` — create a fixed-size frame from raw lines.
- `normalizeLines(lines, options)` — normalize line count and width.
- `truncateVisibleText(value, width)` — truncate text by visible width.
- `padEndVisible(value, width)` — pad text by visible width.

Visible width functions are ANSI-aware, so colored text can still be clipped and padded correctly.

## Renderer

`TerminalRenderer` is for interactive applications.

```js
const renderer = new TerminalRenderer({ output: process.stdout });
renderer.renderNode(tree, { width: 80, height: 24 });
```

Methods:

- `renderLines(lines, options)` renders raw lines as a column.
- `renderNode(node, options)` renders a UI tree.
- `renderFrame(frame)` writes the ANSI patch from the previous frame to the new frame.
- `reset()` forgets the previous frame and forces the next render to be a full render.

The renderer does not own raw mode, alternate screen mode, signal handling, or application state. Your app decides when to enter or leave alternate screen mode and when to call `renderNode()`.

## Diff rendering

The lower-level diff exports are:

- `diffFrames(previous, next)` — returns changed row indexes and line values.
- `patchFrames(previous, next)` — returns an ANSI patch string.

Most apps do not need to call these directly; use `TerminalRenderer` instead.

## ANSI helpers

The library includes small ANSI helpers:

```js
import { ansi, themes, color, stripAnsi, visibleLength, truncateVisible, padEndVisible } from 'terlio.js';
```

Typical usage:

```js
process.stdout.write(ansi.altScreen + ansi.hideCursor + ansi.clear + ansi.home);
process.stdout.write(color('green', 'ready'));
```

`themes` currently contains the built-in theme definitions used by the examples.

## Workspace application lifecycle

For full-screen interactive applications, prefer `createWorkspaceApp()` over wiring raw mode, resize listeners and cleanup manually.

```js
import { createWorkspaceApp, Text } from 'terlio.js';

const app = createWorkspaceApp({
  title: 'Example',
  state: { count: 0 },
  render: ({ state, width, height, animationFrame }) => Text(`${state.count} at ${width}x${height} · frame ${animationFrame}`),
  onKey: ({ key, state, invalidate }) => {
    if (key.name === 'up') {
      state.count += 1;
      invalidate();
    }
  },
  onExit: (code) => {
    // Optional: useful for embedders and tests. When omitted, the runtime exits
    // the Node.js process after restoring the terminal.
  },
});

app.start();
```

The runtime:

- enters and restores the alternate screen and raw input mode;
- forwards the real terminal viewport size, including very small viewports, so `RequireViewport` can render a correct fallback;
- traps input in the top blocking overlay;
- ignores duplicate `start()` calls;
- redraws on resize and skips identical frames;
- provides a demand-driven `ctx.animationFrame` clock (`animationMs: 80` by default) that runs only while the current render reads it or calls `requestAnimationFrame()`;
- retains an ambiguous standalone `Esc` for `escapeTimeoutMs` (`40` ms by default) so modified arrows and other legacy escape sequences survive input chunk boundaries;
- removes timers and listeners during `stop()` or fatal cleanup.

Pointer regions normally activate automatic SGR mouse reporting. For text that must remain selectable while wheel input stays active, use `SelectableText` or pass a `createTextSelectionState()` value to `ScrollPane({ selection })`; the component renders its own in-app selection in content coordinates. Wheel and keyboard scrolling preserve the range. A click inside the highlight can invoke `onCopy`; a successful copy clears the selection, while a failed copy keeps it for retry. A click outside clears it without copying. `Ctrl+C` is never reassigned and remains `SIGINT`. `copyTextToClipboard()` is available for explicit actions and uses the native platform clipboard by default. Set `clipboardPolicy: 'auto'` to opt into OSC 52 fallback for remote terminals, or `clipboardPolicy: 'osc52'` to request it directly. Set `pointerAutoEnable: false` only for unusual passive regions. `setPointerOverride(true | false | null)` remains a manual escape hatch for forced pointer input, native terminal selection, or automatic behavior.

`ScrollPane` keeps wheel cost tied to viewport height rather than source length. It reads and clips only the visible line window, and the interactive runtimes batch multiple decoded pointer events from the same input chunk before rendering. The packaged `example:long-text` demo uses 10,000 rows to make regressions visible.

## Declarative actions and overlays

`createActionRegistry()` keeps key bindings, help text, footer hints and command-palette items derived from the same action definitions. A callback-valued `disabled` property is evaluated against the current context everywhere, including generated help and footer output.

`createOverlayManager()` owns blocking overlays and transient toasts. A blocking surface can be responsive without application-side resize bookkeeping:

```js
overlays.modal({
  render: ({ width, height }) => Modal({
    title: ' Details ',
    children: [`Available modal body: ${width}×${height}`],
  }),
});
```

The callback runs for every overlay render and receives the current inner dimensions. The manager's `tick(delta)` method returns `true` only when the visible toast stack changes, so applications do not repaint merely because an invisible TTL value changed. Toasts rendered by `OverlayHost` dismiss immediately on click.

For layout-local popups such as autocomplete, use `BottomOverlay` instead of a blocking overlay. It composes the popup after the underlying frame has been laid out, anchors it above a configurable bottom inset, and preserves structured pointer regions from both trees. The popup wins hit-testing only in covered cells; the rest of the application remains interactive. Removing or resizing it is handled by ordinary frame diffs over the affected rows.
