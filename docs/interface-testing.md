# Interface snapshot testing

Terlio's interface suite builds deterministic component trees, renders them into virtual terminal frames, and compares the result with committed golden files.

Run the complete interface suite:

```bash
npm run test:interface
```

Review all ANSI-stripped golden frames:

```bash
npm run test:interface:review
```

Run the independent structural audit:

```bash
npm run test:interface:audit
```

Update goldens only after reviewing the current output:

```bash
npm run test:interface:update
```

The update command is explicitly gated and then validates every candidate frame before writing it.

## What is compared

Each golden contains:

- the exact ANSI-preserving frame;
- a plain review representation;
- width and height;
- pointer-region geometry and handler metadata.

This catches regressions in layout, wrapping, borders, truncation, styling, overlay composition, hit-testing geometry, editor cursors, adaptive list windows, responsive shortcut grids, scrollable workspace bodies, progress lifecycle states, the complete syntax-highlighting example, and responsive chat/workspace output. The suite also renders the complete catalog in both `UTC` and `Asia/Yekaterinburg` and requires byte-equivalent snapshots, preventing host-time-zone drift in committed goldens.

## Coverage

The catalog has an explicit inventory of public visual components and fails below 90% component coverage. The current suite covers 100% of that inventory.

Component coverage is not the same as JavaScript line or branch coverage. Existing unit tests remain responsible for behavioral branches, event handling, state transitions, and parser logic.

The repository's `test:coverage` command measures the regular library suite and excludes the interface golden file from Node's experimental coverage collector. The interface suite still runs as part of `npm test` and `npm run verify`, as well as through `test:interface`. Keeping its child timezone renderers outside the experimental collector avoids nondeterministic Node worker hangs without changing the library coverage thresholds.

## Golden review

See [`interface-golden-audit.md`](./interface-golden-audit.md) for the review method and the reviewed baseline and the visual regressions that are explicitly protected by the current goldens.
