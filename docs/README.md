# Terlio.js documentation

Terlio.js is a dependency-free declarative terminal UI framework for Node.js.

Start here:

- [Getting started](getting-started.md) — installation, package examples, first render and first managed workspace.
- [UI runtime](ui-runtime.md) — node tree, layout rules, frames, diff rendering and sizing.
- [Components](components.md) — lists, overlays, editors, scroll panes, live blocks and workspace layouts.
- [Interactive apps](interactive-apps.md) — input, focus, modes, actions, command palette, scrolling, toasts and sessions.
- [Structured output](structured-output.md) — assistant blocks, chat rendering, providers, streaming and message state.
- [Syntax highlighting](syntax-highlighting.md) — opt-in zero-dependency highlighting, detection and theme tokens.
- [API reference](api-reference.md) — public exports grouped by area.
- [Examples](examples.md) — runnable examples and their user paths.
- [Publishing](publishing.md) — npm package verification, GitHub releases and trusted publishing.

All package examples use imports from `terlio.js`:

```js
import { Box, Text, renderToString } from 'terlio.js';
```

Inside this repository the same public API is re-exported from `src/index.js` and defined in `src/lib/index.js`.
