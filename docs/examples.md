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

The main mock AI terminal. It now opens as a responsive, ocean-themed chat workspace with a top-aligned onboarding state, a bounded conversation viewport, stable slash-command completion, a full-width searchable command palette, multiline/bracketed-paste input, session-derived titles, three-second toast feedback, and scroll anchoring that preserves the reader’s position while a response streams. Use `Ctrl+J` for a newline, `Tab` to accept a command suggestion, `Shift+Tab` to move backward, `PgUp/PgDn` to read the transcript, `Ctrl+P` for the palette, and `Esc` to dismiss the current interaction level. Terminals below `56×18` receive a clean resize fallback instead of a broken frame.

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
npm run demo:code-review
```

A responsive pull-request review workspace. It opens with a keyboard-driven PR picker, keeps General details read-only, pages through commits and diffs, and presents full-width review-thread cards with a sticky latest-comment position. Use `N` for a new comment, `R` to reply to the selected author, `Ctrl+J` for a newline, and `J` to jump to a live-comment toast. Confirmation is focus-trapped, transient feedback is rendered as an overlay, and all panes preserve their scroll position through terminal resizes.

## Product-style examples

### Editor Lab

```bash
npm run example:editor
```

A responsive InputEditor workspace with a live multiline draft, visible cursor metrics, editable saved drafts, an explicit `+ Add another` slot, Home/End/Delete history controls, PgUp/PgDn-scrollable diagnostics, adaptive local help, and a compact viewport fallback.

### Command Palette

```bash
npm run example:palette
```

A product-style command launcher with grouped actions, fuzzy scoring across titles, descriptions and aliases, selected-action details, a stable accepted-action log, tab-scoped keyboard handling, PgUp/PgDn scrolling, adaptive local help, and a compact viewport fallback.

### Streaming Workbench

```bash
npm run example:stream
```

A responsive streaming workspace with a multiline prompt editor, compact template controls, sticky transcript autoscroll that preserves scrollback, line/page navigation, runtime progress and cancellation, reusable-template creation, compact viewport fallback, and explicit timer cleanup on exit.

## UI mechanics examples

These examples are intentionally narrower than product demos. Each one focuses on a specific library mechanism or visual regression surface.

### Interaction Kit

```bash
npm run example:kit
```

An interactive component catalog for the library. It provides a searchable catalog, live preview pane, inspector pane, local help, and samples for core render nodes, workspace shell pieces, selection lists, display helpers, feedback overlays, progress blocks, editors, scroll panes, command palette, timeline blocks, responsive columns, and theme tokens.

### Key Inspector

```bash
npm run example:keys
```

A responsive terminal compatibility desk showing raw escape sequences, normalized key objects, recent actions, and the actual editor result. It includes multiline editing, bracketed paste, vertical/word movement diagnostics, and a compact fallback.

### Theme Gallery

```bash
npm run example:themes
```

A responsive Themes/Preview/Tokens workspace. It applies the selected theme to the whole shell, exposes semantic token output, supports scrollable galleries, and degrades to a clear compact fallback.

### Structured Response Explorer

```bash
npm run example:blocks
```

A scenario-driven explorer for structured assistant output. The left response map shows the ordered blocks that make up one answer, the main pane renders the complete response, and a docked inspector explains the selected block's payload, purpose, and safe actions. Use `Enter` to isolate a block, `[` / `]` to switch scenarios, and `C`, `A`, or `R` to simulate copy, diff-apply, and command-run workflows without touching files or starting processes.

### Components Showcase

```bash
npm run example:components
```

A non-interactive, CI-friendly UI runtime showcase with a capability grid, previous/next virtual frames, and an explicit frame patch plan showing changed rows and rendering benefit.

## Removed duplicate examples

The previous `example:chat`, `example:composer`, `example:command-center`, `example:sessions`, and duplicate `example:agent-stream` scripts were removed from the examples list. Their useful mechanics are covered by `demo:chat`, `example:editor`, `example:palette`, `example:stream`, and `example:kit`.

## Running examples directly

Most examples are executable Node.js scripts:

```bash
node examples/components-showcase.js
node examples/interaction-kit.js
node examples/support-desk.js
```

Interactive examples require a real TTY because they use raw mode and terminal escape sequences.
