# Examples

Terlio ships every example in the npm package. Use the bundled launcher after installing from the registry:

```bash
npx terlio list
```

The same ids work with local, global and `npx` installations:

```bash
npx terlio demo:chat
npx terlio example:palette
npx terlio components
```

Inside the source repository, equivalent `npm run demo:*` and `npm run example:*` aliases are available for development.

## Demos

### Chat workspace — `demo:chat`

```bash
npx terlio demo:chat
```

A responsive chat workspace with slash completion, command palette, multiline and bracketed-paste input, sessions, skills, semantic themes, structured blocks, streaming-aware scroll anchoring and a compact viewport fallback.

### Support Triage Desk — `demo:support-desk`

```bash
npx terlio demo:support-desk
```

A product-style support application with queue navigation, ticket details, reply editor, templates, SLA blocks, timeline, focus zones, modals, commands, toasts and theme switching.

### Code Review — `demo:code-review`

```bash
npx terlio demo:code-review
```

A pull-request review workflow with keyboard-driven PR selection, commits, diffs, full-width review threads, reply composition, live comments, confirmations and stable scroll positions through resize.

## Product-style examples

### Editor Lab — `example:editor`

```bash
npx terlio example:editor
```

A multiline editor workspace with cursor diagnostics, editable saved drafts, history navigation, local key ownership, adaptive help and compact fallback.

### Release Command Center — `example:palette`

```bash
npx terlio example:palette
```

A guided release workflow. Start with a mission briefing, open the fuzzy command palette, run checks, generate notes, request approval and confirm a staging deployment. Commands close the palette, show activity progress, mutate the workspace and finish with contextual next-step guidance.

### Streaming Workbench — `example:stream`

```bash
npx terlio example:stream
```

A streaming workspace with multiline prompt editing, templates, sticky transcript autoscroll, scrollback preservation, runtime progress, cancellation and timer cleanup.

## UI mechanics

### Component Studio — `example:kit`

```bash
npx terlio example:kit
```

An interactive catalog covering layout, workspace composition, lists, command palettes, editor mechanics, overlays, scrolling, progress, timelines, semantic themes, focus and frame diffs.

### Key Inspector — `example:keys`

```bash
npx terlio example:keys
```

Shows raw escape sequences, normalized keys and actual editor mutations. Useful for checking Alt/Option behavior, Shift+Tab, bracketed paste and terminal compatibility.

### Theme Studio — `example:themes`

```bash
npx terlio example:themes
```

Stage a candidate theme, compare it with the active theme and apply it to the complete workspace. The inspector explains the semantic tokens used by components.

### Structured Response Explorer — `example:blocks`

```bash
npx terlio example:blocks
```

Explore complete structured responses, inspect individual block payloads and simulate safe copy, diff-apply and command-run actions without touching the filesystem or starting processes.

### Component Composition Snapshot — `example:components`

```bash
npx terlio example:components
```

A non-interactive, redirect-safe snapshot showing how product layout, semantic state, feedback components, virtual frames and row-level patches compose. This is also used by the npm distribution smoke test.

## CLI forms

The launcher accepts full ids, short names and split category/name syntax:

```bash
npx terlio example:palette
npx terlio palette
npx terlio example palette
npx terlio run demo:chat
```

Interactive examples require a real TTY because they use raw input and alternate-screen rendering. `example:components` does not.
