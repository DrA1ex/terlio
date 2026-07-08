# Components

Components are functions that return UI nodes. They are intentionally simple: pass state in, get a renderable node out. They do not subscribe to input, own timers, or mutate global state.

```js
import { SelectList, Modal, WorkspaceShell, WorkspacePane } from 'mock-ai-terminal';
```

## Selection and confirmation

### SelectList

```js
SelectList({
  title: 'Tickets',
  items,
  selectedIndex,
  windowSize: 8,
  emptyText: 'No tickets.',
  getLabel: (item) => item.title,
  getDescription: (item) => item.status,
  getDisabled: (item) => item.disabled,
})
```

`SelectList` renders a scrollable list window with a selected row marker. It only renders the list; your app is responsible for updating `selectedIndex` from key events.

### ConfirmPrompt

```js
ConfirmPrompt({
  title: ' Delete ',
  message: 'Delete this session?',
  confirmLabel: 'Delete',
  cancelLabel: 'Cancel',
  selected: 'cancel',
})
```

Use it together with `ModeManager` when an action needs confirmation.

## Overlays and notifications

### Modal

```js
Modal({
  title: ' Help ',
  children: [Text('Use / to enter commands.')],
  footer: 'Esc close',
})
```

`Modal` renders a bordered block. Overlay placement is application-specific; many examples render the modal as part of the main tree while a modal mode is active.

### Toast

```js
Toast({ level: 'success', message: 'Saved.' })
```

Supported levels are `info`, `success`, `warning`, and `error`.

For stateful toast queues, use `createToastManager()` from the interaction layer.

## Progress and activity

### ProgressBar

```js
ProgressBar({ value: 42, total: 100, width: 24, label: 'Indexing' })
```

### Spinner

```js
Spinner({ frame, label: 'Streaming' })
```

Increment `frame` from your app state or timer to animate the spinner.

### Live blocks

```js
MetricBlock({ title: ' SLA ', value: '12m', detail: 'high priority', pulse: true })
KeyValueBlock({ title: ' Customer ', rows: [['Plan', 'Pro'], ['Region', 'EU']] })
LiveJobBlock({ title: ' Deploy ', status: 'running', steps, activeIndex, progress, frame })
```

Live blocks are useful for dashboards, support desks, background jobs, and streaming agent steps.

## Help, status, and controls

### HelpOverlay

```js
HelpOverlay({
  title: ' Keys ',
  shortcuts: [
    ['↑/↓', 'move'],
    ['Enter', 'accept'],
    ['Esc', 'close'],
  ],
})
```

### Badge

```js
Badge({ label: 'OPEN' })
```

### SectionTabs

```js
SectionTabs({
  tabs: [{ id: 'inbox', label: 'Inbox' }, { id: 'ticket', label: 'Ticket' }],
  active: 'inbox',
})
```

### CommandBar

```js
CommandBar({
  value: 'status open',
  suggestions: ['/status open', '/status pending'],
  mode: 'COMMAND',
  hint: 'Tab next · Enter run',
  prompt: '/',
})
```

### FooterStatusBar

```js
FooterStatusBar({ left: ['Ready'], right: ['theme dark', 'mock provider'] })
```

### PropertyRows

```js
PropertyRows({
  title: ' Ticket ',
  rows: [['Priority', 'High'], ['Owner', 'Alex']],
})
```

### ChipLine

```js
ChipLine({
  label: 'Filter',
  chips: ['all', 'open', 'pending'],
  active: 'open',
})
```

## Editor and scrolling components

### TextEditorView

```js
TextEditorView({
  title: ' Reply ',
  value: editor.value,
  cursor: editor.cursor,
  width: 80,
  height: 8,
  placeholder: 'Type a reply...',
  lineNumbers: true,
})
```

This component renders a multi-line text editor view with a visible cursor. It pairs with `InputEditor`, which owns the text value and cursor operations.

### renderTextEditorLines

```js
const lines = renderTextEditorLines({ value, cursor, width: 80, height: 8 });
```

Use this if you need the editor lines but want to wrap them in a custom container.

### ScrollPane

```js
ScrollPane({
  title: ' Logs ',
  lines,
  width: 100,
  height: 12,
  scroll,
  footer: true,
})
```

### visibleWindowLines

```js
const { lines: visible, scroll, maxScroll, start } = visibleWindowLines(lines, {
  height: 10,
  scroll: 3,
  tail: false,
});
```

Use this helper when you want to render the scroll window yourself.

## Workspace primitives

Workspace primitives are for full-screen product-style terminal apps. They provide a consistent layout with header, tabs, main content, command bar, activity area, and footer.

### WorkspaceShell

```js
WorkspaceShell({
  title: 'Support Desk',
  subtitle: 'Triage queue',
  stats: [{ label: 'open', value: 12 }],
  right: [{ label: 'theme', value: 'dark' }],
  focus: 'inbox',
  tabs: [{ id: 'inbox', label: 'Inbox' }, { id: 'reply', label: 'Reply' }],
  activeTab: 'inbox',
  tabHint: '/ command · Ctrl+P palette',
  main,
  command,
  activity,
  footer,
  height: process.stdout.rows,
})
```

`WorkspaceShell` automatically makes `main` fill remaining vertical space when a shell height is provided.

### WorkspacePane

```js
WorkspacePane({
  title: ' Thread ',
  active: focus === 'thread',
  height: 16,
  children: [Text('Message body')],
  footer: '↑/↓ scroll',
})
```

### WorkspaceHeader, WorkspaceTabs, KeyHintBar, WorkspaceCommandBar, WorkspaceFooter

These are smaller building blocks used by `WorkspaceShell`. Use them directly when you need a custom shell.

### splitWorkspaceColumns

```js
const { mode, widths } = splitWorkspaceColumns(process.stdout.columns || 120);
```

Breakpoints:

- `wide`: 160 columns or more, returns three column widths.
- `medium`: 112–159 columns, returns two column widths.
- `narrow`: below 112 columns, returns one width.

Use the returned `mode` to decide which panes should be visible.

### SummaryList

```js
SummaryList({
  title: ' Sessions ',
  items: sessions,
  selectedIndex,
  emptyText: 'No sessions yet.',
})
```

`SummaryList` is a compact list component built on top of `WorkspacePane`.
