# Terlio.js documentation

Terlio.js is a dependency-free declarative terminal UI framework for Node.js.

## Use Terlio.js

- [Getting started](getting-started.md) — installation, package examples, first render and first managed workspace.
- [UI runtime](ui-runtime.md) — node tree, layout rules, frames, diff rendering and sizing.
- [Components](components.md) — lists, overlays, editors, scroll panes, live blocks and workspace layouts.
- [Progress status and controllers](progress-status.md) — controller-owned progress, throughput, ETA, batching and throttled invalidation.
- [Interactive apps](interactive-apps.md) — input, focus, modes, actions, command palette, scrolling, toasts and sessions.
- [Structured output](structured-output.md) — assistant blocks, chat rendering, providers, streaming and message state.
- [Syntax highlighting](syntax-highlighting.md) — opt-in zero-dependency highlighting, detection and theme tokens.
- [API reference](api-reference.md) — public exports grouped by area.
- [Examples](examples.md) — runnable examples and their user paths.

## Security

- [Security model](security-model.md) — output, input, clipboard, sessions, Unicode, cleanup, limits and trust boundaries.
- [Safe terminal rendering](safe-terminal-rendering.md) — safe defaults, trusted mode, validated SGR and the final sink boundary.
- [Pointer metadata isolation](pointer-isolation.md) — structured hit regions, overlay ordering, geometry validation and optional frame limits.

## Maintainer guides

- [Publishing](publishing.md) — npm package verification, GitHub releases and trusted publishing.
- [Interface snapshot testing](interface-testing.md) — component trees, golden frames, review workflow and coverage.
- [Interface golden audit](interface-golden-audit.md) — verified baseline and visual regression coverage.
- [Security contract testing](security-contract-testing.md) — focused security regression suites and hostile fixtures.

## Migration guides

- [Security migration for 1.2.0](security-migration-1.2.md) — changes required when upgrading applications that used raw ANSI, implicit OSC 52 fallback or earlier persistence defaults.

All package examples use imports from `terlio.js`:

```js
import { Box, Text, renderToString } from 'terlio.js';
```

Inside this repository the same public API is re-exported from `src/index.js` and defined in `src/lib/index.js`.
