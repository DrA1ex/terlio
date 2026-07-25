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

This catches regressions in layout, wrapping, borders, truncation, styling, overlay composition, hit-testing geometry, editor cursors, list windows, and responsive chat/workspace output.

## Coverage

The catalog has an explicit inventory of public visual components and fails below 90% component coverage. The current suite covers 100% of that inventory.

Component coverage is not the same as JavaScript line or branch coverage. Existing unit tests remain responsible for behavioral branches, event handling, state transitions, and parser logic.

## Golden review

See [`interface-golden-audit.md`](./interface-golden-audit.md) for the review method and the list of known pre-existing visual issues captured by the baseline.
