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
- deterministic rendering in both `UTC` and `Asia/Yekaterinburg`.

The goldens capture the current interface output. They are regression baselines and must be reviewed rather than updated automatically when rendering changes.

## Behaviors covered by the baseline

The current goldens protect the following interface requirements.

### UI-AUDIT-001 — Structured chat blocks retain their opening context

Affected goldens:

- `chat-subcomponents`;
- `chat-screen-compact`.

When a transcript viewport begins inside a structured code or diff block, the visible fragment retains the opening border and title. Compact layouts do not show an orphaned side or closing border without identifying the block.

### UI-AUDIT-002 — Bottom overlays remain visually isolated

Affected goldens:

- `responsive-layouts`;
- `chat-screen-full`.

Bottom overlays and chat autocomplete surfaces remain visually separate from adjacent bordered panes. The frames preserve a clean boundary while keeping overlay hit-testing and clipping inside the viewport.

### UI-AUDIT-003 — `LiveJobBlock` adapts to narrow panes

Affected golden:

- `live-and-timeline`.

The progress bar contracts to the available width and keeps its percentage on the same row. The status and step list remain visible without a clipped bar or a detached percentage line.

### UI-AUDIT-004 — Compact history labels remain semantic

Affected golden:

- `chat-screen-compact`.

The compact transcript footer uses a complete `earlier` label rather than an ambiguous fragment such as `e…`.

### UI-AUDIT-005 — Compact header commands are not cut mid-word

Affected golden:

- `chat-subcomponents`.

The header selects a complete compact help variant. `palette` is either shown in full or omitted with its shortcut group rather than shortened to `palet…`.

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
4. Update this audit when a protected behavior changes or a new issue is found.
5. Never accept a failing golden solely to make the suite green.
