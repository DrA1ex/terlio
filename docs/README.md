# Documentation

This directory contains the user-facing documentation for Mock AI Terminal.

Start with these pages:

- [Getting started](getting-started.md) — how to install, import, render a first view, and wire a minimal interactive loop.
- [UI runtime](ui-runtime.md) — declarative node tree, layout rules, frames, diff rendering, and sizing behavior.
- [Components](components.md) — reusable components for lists, modals, command bars, editors, scroll panes, live blocks, and workspace layouts.
- [Interactive apps](interactive-apps.md) — input editor, key parser, focus manager, mode manager, command palette, scrolling, toasts, and sessions.
- [Structured output](structured-output.md) — structured assistant blocks, chat rendering, providers, streaming, and message state.
- [API reference](api-reference.md) — public exports grouped by area.
- [Examples](examples.md) — runnable examples and what each one demonstrates.

The library is dependency-free and uses ES modules. All imports shown in these docs use the package name:

```js
import { Box, Text, renderToString } from 'mock-ai-terminal';
```

When working directly inside this repository, the same API is available from:

```js
import { Box, Text, renderToString } from '../src/lib/index.js';
```
