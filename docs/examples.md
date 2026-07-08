# Examples

The repository includes runnable examples that exercise different layers of the library. Use them as implementation references and smoke tests.

List all examples:

```bash
npm run examples
```

## Business demos

### AI chat workspace

```bash
npm run demo:chat
```

Alias for the main mock AI terminal. Demonstrates commands, themes, providers, skills, sessions, command palette, suggestions, structured assistant blocks, and streaming.

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
  reducers.js
  templates.js
  themes.js
  views.js
```

## Product examples

### Chat

```bash
npm run example:chat
```

The full mock AI terminal app.

### Prompt Composer

```bash
npm run example:composer
```

A multi-section prompt workspace with compose, preview, history tabs, templates, live plan, and full-height shell.

### AI Code Review Terminal

```bash
npm run example:code-review
```

Structured code review flow with prompt brief, transcript, block index, action rail, mock copy/apply/run actions, and confirmation flow.

### Command Center

```bash
npm run example:command-center
```

Operations dashboard with command palette, mode stack, modal overlay, toast, progress, active skills, and action log.

### Sessions

```bash
npm run example:sessions
```

Session browser with filtering, preview, create/export/delete actions, and confirmation prompts.

### Agent Stream

```bash
npm run example:agent-stream
```

Structured streaming playground with cancel, retry, regenerate, shorter/longer/explain actions, progress, and pinned command/footer layout.

## Diagnostics and galleries

### Key Inspector

```bash
npm run example:keys
```

Shows raw escape sequences, normalized key objects, and editor actions. Use this when debugging terminal compatibility.

### Theme Gallery

```bash
npm run example:themes
```

Renders the same structured scene across built-in themes.

### Blocks Gallery

```bash
npm run example:blocks
```

Shows `text`, `code`, `diff`, `command`, `warning`, and `tool_result` blocks with selection and mock actions.

### Components Showcase

```bash
npm run example:components
```

Non-interactive UI runtime showcase. It can run in regular stdout, so it is useful for quick smoke checks and CI-style output inspection.

## Focused labs

### Editor Lab

```bash
npm run example:editor
```

Tests `InputEditor` behavior: cursor movement, history, deletion, paste, and key diagnostics.

### Command Palette Lab

```bash
npm run example:palette
```

Shows filterable command palette state, selected rows, and scrollable suggestions.

### Streaming Workbench

```bash
npm run example:stream
```

Shows fake incremental model output and cancellation behavior.

### Interaction Kit

```bash
npm run example:kit
```

Shows reusable interaction primitives together: select list, modal, confirm prompt, toast, progress, and mode stack.

## Running examples directly

Most examples are executable Node.js scripts:

```bash
node examples/components-showcase.js
node examples/command-center.js
node examples/support-desk.js
```

Interactive examples require a real TTY because they use raw mode and terminal escape sequences.
