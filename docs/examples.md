# Examples

Terlio.js ships every example in the npm package. Install it in a Node.js project, then use the bundled launcher:

```bash
npx terlio.js list
```

The same ids work through a project dependency, a global installation, or `npx`:

```bash
npx terlio.js demo:chat
npx terlio.js example:palette
npx terlio.js components
```


## Demos

### Chat workspace — `demo:chat`

```bash
npx terlio.js demo:chat
```

A responsive chat workspace with slash completion, a clickable command palette, multiline and bracketed-paste input, sessions, skills, structured blocks, wheel/trackpad scroll, and `Shift+↑/↓` line scrolling. Press `Ctrl+T` to pause pointer reporting and select user or assistant transcript text with an ordinary drag gesture; press it again to restore clicks and wheel input.

### Support Triage Desk — `demo:support-desk`

```bash
npx terlio.js demo:support-desk
```

An inbox-first support workflow with clickable tabs and tickets, wheel/trackpad and keyboard pane scrolling, reply and note composers, SLA details, activity history, overlays, and slash commands that return to the previous pane unless they navigate elsewhere. Use `Esc` to return to Inbox and `Ctrl+Q` to quit.

### Code Review — `demo:code-review`

```bash
npx terlio.js demo:code-review
```

A pull-request review workflow with keyboard and pointer-driven PR selection, commits, diffs, full-width review threads, reply composition, live comments, confirmations and stable scroll positions through resize.

## Product-style examples

### Editor Lab — `example:editor`

```bash
npx terlio.js example:editor
```

A multiline editor workspace with clickable panes and history rows, wheel/trackpad scrolling, `Shift+↑/↓` line scrolling, cursor diagnostics, editable saved drafts, history navigation, local key ownership, adaptive help and compact fallback.

### Release Command Center — `example:palette`

```bash
npx terlio.js example:palette
```

A guided release workflow with clickable mission steps and palette rows. Start with a mission briefing, open the fuzzy command palette, run checks, generate notes, request approval and confirm a staging deployment. Commands close the palette, show activity progress, mutate the workspace and finish with contextual next-step guidance.

### Streaming Workbench — `example:stream`

```bash
npx terlio.js example:stream
```

A streaming workspace with clickable templates and panes, wheel/trackpad scrolling, `Shift+↑/↓` line scrolling, multiline prompt editing, templates, sticky transcript autoscroll, scrollback preservation, runtime progress, cancellation and timer cleanup.

## UI mechanics

### Component Studio — `example:kit`

```bash
npx terlio.js example:kit
```

An interactive catalog with clickable tabs, lists, panes and wheel-scrollable surfaces covering layout, workspace composition, lists, command palettes, editor mechanics, overlays, scrolling, progress, timelines, semantic themes, focus and frame diffs.

### Key Inspector — `example:keys`

```bash
npx terlio.js example:keys
```

Shows raw escape sequences with clickable event inspection and wheel/`Shift+↑/↓` history scrolling, normalized keys and actual editor mutations. Useful for checking Alt/Option behavior, Shift+Tab, bracketed paste and terminal compatibility.

### Theme Studio — `example:themes`

```bash
npx terlio.js example:themes
```

Click or scroll through themes, then stage a candidate theme, compare it with the active theme and apply it to the complete workspace. The inspector explains the semantic tokens used by components.

### Structured Response Explorer — `example:blocks`

```bash
npx terlio.js example:blocks
```

Click response blocks and use wheel/`Shift+↑/↓` scrolling to explore complete structured responses, inspect individual block payloads and simulate safe copy, diff-apply and command-run actions without touching the filesystem or starting processes.

### Component Composition Snapshot — `example:components`

```bash
npx terlio.js example:components
```

A non-interactive, redirect-safe snapshot showing how product layout, semantic state, feedback components, virtual frames and row-level patches compose. This is also used by the npm distribution smoke test.

## CLI forms

The launcher accepts full ids, short names and split category/name syntax:

```bash
npx terlio.js example:palette
npx terlio.js palette
npx terlio.js example palette
npx terlio.js run demo:chat
```

Interactive examples require a real TTY because they use raw input and alternate-screen rendering. `example:components` does not.


## Development checkout

When working from the Terlio.js source repository, install development dependencies and use the repository-only aliases:

```bash
npm ci
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
