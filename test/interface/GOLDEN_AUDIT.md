# Interface Golden Audit

## Scope

The interface snapshot suite renders deterministic component trees into fixed-size virtual terminal frames and compares the complete output with committed golden files.

The catalog currently covers **50 of 50 public visual components (100%)**. Coverage here means that every public visual component is represented in at least one rendered interface tree. It is intentionally separate from source-line coverage.

Each golden stores:

- raw ANSI-preserving frame lines;
- ANSI-stripped review lines;
- frame width and height;
- normalized pointer-region geometry and handler presence.

## Verification performed

Every golden was reviewed from its ANSI-stripped frame and passed automated checks for:

- exact frame height;
- exact visible width on every row;
- valid and complete CSI/SGR fragments;
- absence of internal pointer-marker sequences in final output;
- absence of `undefined`, `[object Object]`, and `NaN` placeholders;
- absence of unexpected C0/C1 controls;
- pointer bounds and segments remaining inside the viewport;
- deterministic rendering across repeated runs.

The goldens capture the current 1.1.3 output. They are regression baselines, not an assertion that every captured layout is visually ideal.

## Existing issues found during visual review

The following issues were present before the snapshot suite was added. They were intentionally **not fixed** in this change.

### UI-AUDIT-001 — Structured chat blocks can be clipped into orphaned borders

Affected goldens:

- `chat-subcomponents`
- `chat-screen-compact`

When the transcript viewport begins or ends inside a bordered code/diff block, only the visible physical rows are retained. This can leave a closing border or side borders visible without the corresponding opening border and title.

This is most noticeable in compact chat layouts and when reading the newest rows of a long structured assistant response.

### UI-AUDIT-002 — Bottom overlays can visually collide with underlying pane borders

Affected goldens:

- `responsive-layouts`
- `chat-screen-full`

A bottom overlay correctly replaces cells inside its rectangle, but the still-visible base cells immediately outside that rectangle may contain box-drawing borders. At the overlay edges this can produce joined or colliding border fragments that look like one malformed surface.

The hit-testing and frame dimensions remain valid; this is a compositing/visual-boundary issue.

### UI-AUDIT-003 — `LiveJobBlock` does not adapt its progress row to narrow panes

Affected golden:

- `live-and-timeline`

In a narrow pane, the spinner/status and fixed-width progress bar do not fit on one row. The progress bar is hard-clipped and its percentage appears on the following row without the complete bar delimiters.

### UI-AUDIT-004 — Compact chat status text truncates semantic labels mid-phrase

Affected golden:

- `chat-screen-compact`

The transcript footer combines history state and selection help in one line. Under the compact width, `earlier` is shortened to an ambiguous fragment (`e…`). The layout remains bounded, but the resulting status is difficult to understand.

### UI-AUDIT-005 — Header help can truncate a command name mid-word

Affected golden:

- `chat-subcomponents`

The compact header help line truncates `palette` to `palet…` to preserve the skills summary. This is a minor UX issue rather than a structural rendering failure.

## Golden update policy

Golden updates must be deliberate:

```bash
npm run test:interface:review
npm run test:interface:update
npm run test:interface
npm run test:interface:audit
```

`test:interface:update` requires the explicit environment gate embedded in the npm script and refuses direct accidental updates.

Before committing updated goldens:

1. Review every changed plain frame.
2. Review raw ANSI changes when styling changed.
3. Confirm pointer-region changes are intentional.
4. Update this audit when a known issue is fixed, changes shape, or a new issue is found.
5. Do not delete an issue from this document merely because its current broken output was accepted as a regression baseline.
