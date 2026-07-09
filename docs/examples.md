# Examples

The repository includes runnable examples that exercise different layers of the library. Use them as implementation references and smoke tests.

List all examples:

```bash
npm run examples
```

`npm run examples` prints the examples in grouped blocks so demos, product-style examples, and focused UI mechanics references are easier to scan.

## Demos

These examples share the current UI/UX standard: a stable workspace shell, header stats, navigation tabs, responsive main panes, contextual local help, visible mode state, explicit keyboard routing, scroll helpers, and testable pure render functions.

### AI chat workspace

```bash
npm run demo:chat
```

The main mock AI terminal. Demonstrates commands, themes, providers, skills, sessions, command palette, suggestions, structured assistant blocks, and streaming.

### Support Triage Desk

```bash
npm run demo:support-desk
```

A product-style support desk application. Demonstrates a responsive workspace shell, queue/list navigation, ticket details, reply editor, templates, SLA/live blocks, timeline, focus zones, modal overlays, command bar, slash commands, toasts, and theme switching.

Implementation entrypoints:

```text
examples/support-desk.js
examples/support-desk/
  app.js
  commands.js
  data.js
  index.js
  reducers.js
  templates.js
  themes.js
  views.js
```

### AI Code Review Terminal

```bash
npm run example:code-review
```

A standard pull-request review workspace. It opens with a PR picker modal, can reopen it with Ctrl+O, shows General PR details as read-only, and uses one central tabbed pane for commits, highlighted diffs, scrollable comment threads and confirmed new comments.

## Product-style examples

### Editor Lab

```bash
npm run example:editor
```

A polished InputEditor workspace with a live draft buffer, visible cursor state, editable saved drafts, an explicit `+ Add another` draft slot for creating new drafts, PgUp/PgDn-scrollable diagnostics/history panes, and bordered-grid local help.

### Command Palette

```bash
npm run example:palette
```

A product-style command launcher with grouped actions, searchable metadata, selected-action details, accepted-action log, responsive layout, tab-scoped keyboard handling, PgUp/PgDn scrolling for long panes, bordered-grid local help, and measured workspace sizing so the Actions pane stays bounded above the command bar on small terminals.

### Streaming Workbench

```bash
npm run example:stream
```

A streaming workspace with an explicit prompt editor, Ctrl+J newline support, transcript autoscroll, read-only transcript line scrolling with ↑/↓, page scrolling with PgUp/PgDn, runtime control rail, chunk progress, cancellation path, clear `[ and ]` template switching, and a `+ Add new one` flow for saving the current prompt plus a scenario response as a reusable template.

## UI mechanics examples

These examples are intentionally narrower than product demos. Each one focuses on a specific library mechanism or visual regression surface.

### Interaction Kit

```bash
npm run example:kit
```

A focused playground for feedback and mode mechanics: theme-aware toasts, modal overlays, confirmation prompts, progress, mode-stack routing, tab-scoped keyboard handling, filterable sample lists, scrollable runtime/activity panes, and action history in one cohesive flow.

### Stream Mechanics

```bash
npm run example:agent-stream
```

A low-level structured streaming reference. It shows queueing chunk and block events, cancellation, retry/regenerate actions, progress, pending timers, and transcript updates without adding a larger product shell.

### Key Inspector

```bash
npm run example:keys
```

Shows raw escape sequences, normalized key objects, and editor actions. Use this when debugging terminal compatibility.

### Theme Gallery

```bash
npm run example:themes
```

Renders the same structured scene across built-in themes, including panels, blocks, diffs, status colors and toast shadows.

### Blocks Gallery

```bash
npm run example:blocks
```

Shows `text`, `code`, `diff`, `command`, `warning`, and `tool_result` blocks with selection state and mock block actions.

### Components Showcase

```bash
npm run example:components
```

Non-interactive UI runtime showcase. It can run in regular stdout, so it is useful for quick smoke checks and CI-style output inspection.

## Removed duplicate examples

The previous `example:chat`, `example:composer`, `example:command-center`, and `example:sessions` scripts were removed from the examples list. Their useful mechanics are covered by `demo:chat`, `example:editor`, `example:palette`, and `example:kit`.

## Running examples directly

Most examples are executable Node.js scripts:

```bash
node examples/components-showcase.js
node examples/interaction-kit.js
node examples/support-desk.js
```

Interactive examples require a real TTY because they use raw mode and terminal escape sequences.
