# API reference

All public exports are re-exported from the package entrypoint:

```js
import * as terminal from 'terlio.js';
```

When developing inside this repository, import from `src/lib/index.js`.

## Full app

### RichTerminalApp

```js
new RichTerminalApp({ input, output, onExit, sessionStore, terminalPolicy, processHandlers })
```

A complete reference AI chat terminal app. It owns terminal raw mode, alternate screen rendering, command execution, mock provider streaming, sessions, skills, suggestions, debug state, and command palette integration.

Important methods:

- `start()` — enter interactive TTY mode and render the app.
- `stop()` — remove listeners, leave raw mode, reset renderer.
- `requestExit(code)` — stop and call `onExit` if provided.
- `setTheme(name)` and `setProvider(name)`.
- `addSystemMessage(content)`, `addUserMessage(content)`, `addAssistantMessage(content, streaming, options)`.
- `clearMessages()`.
- `submitInput()`, `executeCommand(line)`, `respond(prompt)`.
- `retryLastUserPrompt()`.
- `newSession()`, `saveSession()`, `loadSession(id)`, `snapshot()`.
- `toggleDebug(enabled)`.
- `openCommandPalette()`.
- `render()`.

### createAppPaletteItems

```js
createAppPaletteItems()
```

Returns palette item descriptors for built-in commands, themes, providers, and skills.

## UI node runtime

### createNode

```js
createNode(type, props, children)
```

Creates a raw UI node.

### Text

```js
Text(value, props = {})
```

Creates a text node. Terminal controls in string values are filtered by the safe terminal policy. Validated SGR styling is preserved for compatibility. Pass an `unsafeRawAnsi()` value only together with an explicit trusted renderer policy.

### Box

```js
Box(props = {}, ...children)
```

Creates a box node. Supports border, padding, title, fixed height, grow behavior, and border color.

### Row

```js
Row(props, ...children)
Row(...children)
```

Creates a horizontal layout. Supports `gap`, `distribute`, and `widths`.

### Column

```js
Column(props, ...children)
Column(...children)
```

Creates a vertical layout. Supports `gap`, fixed `height`, and grow child allocation.

### Panel

```js
Panel(title, ...children)
```

Shorthand for a bordered padded box.

### normalizeChildren

```js
normalizeChildren(children)
```

Flattens children, removes empty values, and converts strings/numbers into text nodes.

## Layout, frames, and rendering

### layout / renderNode / measureNodeHeight

```js
layout(node, { width, height, terminalPolicy })
renderNode(node, width, { terminalPolicy })
measureNodeHeight(node, width, { terminalPolicy })
```

`layout()` returns a fixed-size frame. `renderNode()` returns rendered lines for a node at a given width. `measureNodeHeight()` renders the node at the same width and returns the number of rows it would occupy; use it when calculating available space for adaptive terminal layouts.

### BottomOverlay

```js
BottomOverlay({ content, overlay, height, bottom, left, right, width, align, opaque })
```

Places `overlay` over the bottom portion of `content` without reserving rows in the underlying layout. The component clips to `height`, positions above `bottom` rows, and supports horizontal insets plus left/center/right alignment for narrower surfaces. Pointer regions inside the overlay participate in normal hit-testing and take precedence over covered background regions.

### Frame

```js
new Frame(lines, options)
```

Represents a fixed-size terminal frame.

Methods:

- `toLines()`
- `toString()`
- `equals(other)`

### createFrame / normalizeLines

```js
createFrame(lines, { width, height })
normalizeLines(lines, { width, height })
```

Creates or normalizes fixed-size frame lines.

### renderToFrame / renderToString

```js
renderToFrame(node, options)
renderToString(node, options)
```

Render a UI tree to a `Frame` or string. `options.terminalPolicy` accepts `'safe'`, `'trusted'`, or a policy from `createTerminalPolicy()`. Safe mode is the default.

### TerminalRenderer

```js
new TerminalRenderer({ output, policy })
```

Methods:

- `renderLines(lines, options)`
- `renderNode(node, options)`
- `renderFrame(frame)`
- `reset()`

### createTerminalPolicy

```js
createTerminalPolicy({
  mode: 'safe' | 'trusted',
  blockedControlRendering: 'visible' | 'remove',
  hyperlinks,
  clipboard: 'disabled' | 'native' | 'osc52' | 'auto' | 'legacy',
  unicodeControls: 'normal' | 'visible-controls' | 'code-safe',
  limits,
})
```

Creates an immutable terminal policy. Invalid or omitted modes fall back to `safe`; unrelated options such as `sanitize: false` cannot implicitly enable trusted output. Clipboard defaults to `native`; OSC 52 requires `osc52` or `auto`. Stream-retention and terminal-payload limits have finite defaults, while application-owned render, syntax, native clipboard, session-shape and pointer caps are opt-in.

### unsafeRawAnsi

```js
unsafeRawAnsi(value)
```

Marks intentionally raw terminal output. The marker remains harmless under safe mode and emits raw bytes only under an explicit trusted terminal policy.

### diffFrames / patchFrames

```js
diffFrames(previous, next)
patchFrames(previous, next)
```

Compute frame differences or an ANSI patch string.

## Security and limits

Public security helpers include `DEFAULT_SECURITY_LIMITS`, `normalizeSecurityLimits()`, `mergeSecurityLimits()`, `TerlioLimitError`, `applyUnicodeSecurity()` and `normalizeUnicodeSecurity()`. A limit error has `code: 'TERLIO_LIMIT_EXCEEDED'` plus `resource`, `limit` and `actual`.

`Text` accepts `unicodeSecurity` and `contentKind`; `SyntaxText` defaults to `code-safe`. Code, diff, filename and command blocks use `code-safe`; ordinary tool results use normal Unicode unless their `contentKind` marks them as code, log or security-sensitive output. `SessionStore({ limits, durability })` and `TerminalInputDecoder({ limits, pasteOverflow })` consume the relevant limit names. The legacy `inputPolicy` option is accepted for compatibility but paste data is no longer altered by it. Bracketed paste emits one `paste` event whose embedded newlines remain text; input after the closing paste marker is decoded normally.

## ANSI and text width

Exports:

- `ansi`
- `themes`
- `color(name, value)`
- `stripAnsi(value)`
- `visibleLength(value)`
- `padEndVisible(value, width)`
- `truncateVisible(value, width)`
- `wrapText(value, width)`

These helpers handle ANSI escape sequences when computing visible terminal width.

## Components

### SelectList

```js
SelectList({
  title,
  items,
  selectedIndex,
  windowSize, // number or 'auto'
  windowStart,
  emptyText,
  getLabel,
  getDescription,
  getDisabled,
  getKind,
  disabledIndicator = '×',
  getDisabledIndicator,
  wrapItems = true,
  maxItemLines = 3,
  reserveItemLines = false,
  onSelect,
  onActivate,
  onWheel,
  theme,
})
```

Renders a scroll-windowed selectable list. Items use one terminal row when their label and description fit, then grow only as needed up to `maxItemLines`. Content that still does not fit is clipped with an ellipsis on the final row. Set `windowSize: 'auto'` when the list receives a fixed height: it fills the available row budget with as many variable-height items as fit while keeping the selected item visible. `windowStart` lets scrolling move the visible item window independently from `selectedIndex`; this is useful when wheel scrolling should not change selection until the selected item leaves the viewport. `rowLines` remains a compatibility alias for `maxItemLines`, while `reserveItemLines: true` opts into fixed-height rows.

Rows with `kind: 'heading'`, `kind: 'stat'`, or `kind: 'separator'` are presentation-only. Keyboard navigation and pointer focus skip them, they never inherit disabled styling, and they do not render the disabled marker. A stat row uses `label` with `value`, `description`, or `detail`. Set `disabledIndicator: ''` to hide the marker globally, or provide `getDisabledIndicator(item, index)` for per-item text.

### ConfirmPrompt

```js
ConfirmPrompt({ title, message, confirmLabel, cancelLabel, selected })
```

Renders a two-choice confirmation panel.

### Modal

```js
Modal({ title, children, footer })
```

Renders a bordered modal body.

### Toast

```js
Toast({ level, message })
```

Renders an info/success/warning/error toast. Toasts managed by `OverlayManager` are wrapped in a pointer region and dismiss immediately when clicked.

### ProgressBar

```js
ProgressBar({ value, total, width, label, variant })
```

Renders a Unicode progress bar. `variant` supports:

- `compact` (default): a narrow `▬`/`═` rail without brackets, intended for dense status rows;
- `block`: the previous bracketed block-fill style with an unpainted remainder;
- `line`: block fill with a continuous `─` remainder;
- `squares`: discrete filled and empty cells using `■` and `□`;
- `inset`: a one-row UI-style bar with subtle side caps and a lower `▁` rail behind the unfilled portion;
- `boxed`: a bordered three-row bar with the label and percentage in its top border.

`block`, `line`, `inset`, and `boxed` retain eighth-cell fill precision. `compact` and `squares` use whole cells to keep their glyphs visually consistent. Every variant except `boxed` occupies one layout row. `boxed` occupies three real layout rows, so columns, rows, panels, clipping, and height measurement account for it normally.


### ProgressStatus

```js
const progress = ProgressStatus.create({ total, unit, invalidate, updateIntervalMs });
ProgressStatus({ progress, label, width, variant, frame, format, rateMode });
```

Renders lifecycle state, value, rolling throughput, active elapsed time and ETA above the existing `ProgressBar` variants. The controller exposes `start`, `set`, `add`, `setTotal`, `pause`, `resume`, `complete`, `fail`, `cancel`, `reset`, `setInvalidate`, `snapshot` and `dispose`.

Intermediate invalidation requests are throttled by `updateIntervalMs`; the first update and lifecycle transitions render immediately. See [Progress status and controllers](progress-status.md) for task integration, batching and deterministic testing.

### Spinner

```js
Spinner({ frame, label })
```

Renders a spinner frame. Workspace render callbacks receive `ctx.animationFrame`, so `Spinner({ frame: animationFrame })` animates without an application-owned timer. The clock is demand-driven: it runs only while the current render reads `animationFrame` or calls `requestAnimationFrame()`, then suspends when the rendered view becomes static. Set `animationMs` to control the active cadence or to `0` to disable it.

### HelpOverlay

```js
HelpOverlay({ title, shortcuts })
```

Renders shortcut rows.

### Badge, Chip, SectionTabs, CommandBar, FooterStatusBar, Grid, PropertyRows, ChipLine

Small components for semantic status labels, individual chips, tab rows, command input display, footer status, aligned grids, key/value details, and chip controls. `Badge` and `Chip` support semantic tones such as `info`, `success`, `warning`, `danger`, and `muted`.

```js
Grid({ items, columns = 3, gap = 2, renderItem, emptyText, border = false, borderColor, padding })
```

`Grid` renders equal-width rows and columns. It is intended for shortcut bars and footer-like blocks where each row should keep the same column starts. Set `border: true` to render a compact table grid with horizontal and vertical separators.

### TextEditorView / renderTextEditorLines

```js
TextEditorView({ title, value, cursor, width, height, placeholder, lineNumbers })
renderTextEditorLines({ value, cursor, width, height, lineNumbers, placeholder, cursorGlyph })
```

Render a multi-line editor view or its raw lines.

### visibleWindowLines / ScrollPane / autoscroll helpers

```js
visibleWindowLines(lines, { height, scroll, tail, autoscroll, previousTotalRows, sticky })
ScrollPane({ title, lines, width, height, scroll, border, footer, autoscroll, previousTotalRows, sticky, pointerId, pointerData, pointerWidth, pointerEvents, pointerAutoEnable, onPointer, onClick, onWheel, onDrag, onMove, onRelease, selection, onSelectionChange, onCopy, copyOnRelease, copyOnSelectionClick, clearSelectionOnWheel, nativeSelectionModifier })
SelectableText({ lines, selectionLines, selectionOffsetX, selectionOffsetY, selection, pointerId, pointerData, pointerWidth, pointerAutoEnable, onWheel, onSelectionChange, onCopy, copyOnRelease, copyOnSelectionClick, clearOnWheel, nativeSelectionModifier })
createTextLineSource(lines, { transform })
createTextSelectionState(initial)
clearTextSelection(state)
beginTextSelection(state, point, lines)
updateTextSelection(state, point, lines)
completeTextSelection(state, point, lines)
selectedText(lines, state)
renderTextSelectionLines(lines, state)
copyTextToClipboard(text, options)
writeClipboardText(text, output, options)
resolveAutoScrollOffset({ scroll, previousTotalRows, totalRows, visibleRows, sticky })
resolveScrollKeyOffset({ keyName, scroll, totalRows, visibleRows, sticky })
scrollLine(scroll, direction, max, step)
isScrollAtBottom(scroll, totalRows, visibleRows)
scrollMax(totalRows, visibleRows)
```

Render or calculate a scroll window. Long sources are viewport-virtualized: `ScrollPane` converts and ANSI-clips only the visible rows instead of remapping the entire source on every wheel event. Arrays, array-like values, and `createTextLineSource()` objects are accepted. Pass a state from `createTextSelectionState()` as `selection` to make text drag-selectable without disabling mouse reporting. `SelectableText` can be used directly for non-scrolling text. For virtualized or scrolling content, pass the complete content as `selectionLines` and the first visible content row as `selectionOffsetY`; `ScrollPane` does this automatically. The selection remains in content coordinates across wheel, keyboard, and page scrolling, including while a drag is active. A short click inside the highlighted range calls `onCopy`; returning `true` or `{ copied: true }` clears the range, while a failed result keeps it for retry. A short click outside clears the range without copying. Set `copyOnSelectionClick: false` to disable that behavior, or `copyOnRelease: true` only when immediate copy after dragging is intentionally desired. `Ctrl+C` remains `SIGINT`. `nativeSelectionModifier` is disabled by default but can explicitly reserve a modifier for terminal-specific native selection. `copyTextToClipboard()` uses the native platform clipboard by default (`pbcopy`, `wl-copy`, `xclip`/`xsel`, or the Windows clipboard). OSC 52 fallback is enabled only when `clipboardPolicy: 'auto'` is selected explicitly; `clipboardPolicy: 'osc52'` forces the bounded terminal fallback. `writeClipboardText()` is the low-level boolean OSC 52 writer and always writes to the supplied terminal output stream.

Use `resolveAutoScrollOffset()` for log/transcript panes that should follow new output only while the user is already at the bottom. Use `resolveScrollKeyOffset()` for read-only panes that should handle `up`, `down`, `page-up`, and `page-down` consistently. Once the user scrolls up, keep `sticky: false`; when they scroll or page back to the bottom, set it to `true` again.


### ScrollView

```js
ScrollView({
  scrollState,
  height: 'fill',
  pointerId,
  onWheel,
}, content)
```

Scrolls an arbitrary component tree without drawing its own border or footer. The parent layout assigns the viewport height; `ScrollView` renders the complete child tree, exposes only the visible rows, and translates and clips pointer regions into viewport coordinates. Pass a state from `createScrollState()` to keep `totalRows`, `visibleRows`, and the clamped `scroll` offset synchronized.

Use `ScrollView` inside a fixed-height `WorkspacePane` with `footerNode` when the pane body should scroll while local controls or another footer remain docked:

```js
const scroll = createScrollState({ sticky: false });

WorkspacePane({
  title: ' Results ',
  height,
  children: [
    ScrollView({
      scrollState: scroll,
      pointerId: 'results-scroll',
      onWheel: (event) => {
        scroll.scroll += event.deltaY;
        scroll.sticky = false;
        event.preventDefault();
      },
    }, resultTree),
  ],
  footerNode: KeyHintBar({
    title: ' LOCAL CONTROLS ',
    hints: [['↑/↓', 'scroll'], ['Enter', 'open']],
  }),
});
```

Unlike `ScrollPane`, `ScrollView` is intended for composed UI nodes rather than a prebuilt line source. It does not add nested chrome, so the containing pane remains the only visible container.

### fitInline

```js
fitInline(value, width)
```

Pad or truncate a single-line value to a target visible width.

## Workspace components

### WorkspaceHeader

```js
WorkspaceHeader({ title, subtitle, stats, right, focus })
```

Renders a top product header.

### WorkspaceTabs

```js
WorkspaceTabs({ tabs, active, title, hint })
```

Renders a tab/navigation bar.

### WorkspacePane

```js
WorkspacePane({
  title,
  active,
  height,
  children,
  footer,
  footerNode,
  footerGap = 0,
  footerMinHeight,
  footerMaxHeight = Infinity,
  borderColor,
  theme,
})
```

Renders a bordered application pane. Active panes get a highlighted border by default. When a fixed `height` and `footerNode` are provided, the pane uses the shared `Docked` layout: it measures and reserves the footer first, then constrains the main content to the remaining rows. Growing content is clipped or re-laid out before the footer can leave the panel.

### KeyHintBar

```js
KeyHintBar({
  title,
  hints,
  columns = 3,
  adaptive = false,
  minColumnWidth = 22,
  maxColumns = 3, // number or 'auto'
  gap = 2,
  gridBorder = false,
  theme,
})
```

Renders grouped key hints. The default mode uses the shared `Grid` component. With `adaptive: true` and `columns: 'auto'`, the bar chooses a column count from the available terminal width, wraps individual hints by words, and reports its natural height to `Docked`. Use `maxColumns: 'auto'` to let every hint share one row whenever their actual labels fit; the bar collapses to fewer columns as the viewport narrows and expands again when width returns. This makes it suitable for a bottom-pinned local-controls panel at changing viewport sizes.

### Docked layout

```js
Docked({
  content,
  footer,
  height,
  gap = 0,
  footerMinHeight = 0,
  footerMaxHeight = Infinity,
})
```

A fixed-height layout that measures the footer first and assigns all remaining rows to the main content. Use it for local-control panels, inspectors, or status surfaces that must stay visible while the content area shrinks. `WorkspacePane` applies this automatically for a fixed-height pane with `footerNode`.

### WorkspaceCommandBar

```js
WorkspaceCommandBar({ value, suggestions, mode, hint, prompt })
```

Workspace wrapper around `CommandBar`.

### WorkspaceFooter

```js
WorkspaceFooter({ left, right })
```

Renders a bottom status footer.

### WorkspaceShell

```js
WorkspaceShell({ title, subtitle, stats, right, focus, tabs, activeTab, tabHint, main, command, activity, footer, height })
```

Renders a full application shell and makes `main` fill available height when `height` is provided.

### resolveWorkspaceShellLayout

```js
resolveWorkspaceShellLayout({
  width,
  height,
  title,
  subtitle,
  stats,
  right,
  focus,
  tabs,
  activeTab,
  tabHint,
  command,
  activity,
  footer,
  theme,
  minMainHeight,
})
```

Measures the real header, tabs, command, activity, and footer nodes and returns `{ mainHeight, fixedRows, remainingRows, constrained }`. This is useful for examples or apps whose main panes need to know their available height before they build scroll windows. It avoids hard-coded row counts that can drift when borders, hints, or grid helpers change.

### splitWorkspaceColumns

```js
splitWorkspaceColumns(width, mode = 'auto')
```

Returns `{ mode, widths }` for `wide`, `medium`, or `narrow` layouts.

### SummaryList

```js
SummaryList({ title, items, selectedIndex, emptyText })
```

Renders compact summary rows inside a workspace pane.

## Live and timeline blocks

### MetricBlock

```js
MetricBlock({ title, value, detail, status, pulse })
```

### KeyValueBlock

```js
KeyValueBlock({ title, rows })
```

### LiveJobBlock

```js
LiveJobBlock({ title, status, steps, activeIndex, progress, frame, progressVariant, showProgressDetails })
```

`progress` may be a numeric percentage or a controller returned by `ProgressStatus.create()`. With a controller, the block derives lifecycle state, value and total automatically. Set `showProgressDetails: true` to include throughput, elapsed time and ETA.


### Timeline

```js
Timeline({ title, events, limit, getLine })
```

### createTimelineEvent / formatTimelineTime

```js
createTimelineEvent({ type, text, actor, time, id, meta })
formatTimelineTime(value)
```

## Input and keys

### InputEditor

```js
new InputEditor(value = '')
```

Methods:

- `set(value)`, `clear()`
- `insert(text)`, `insertPaste(text)`, `insertLineBreak()`
- `backspace()`, `deleteForward()`
- `move(delta)`, `moveWord(delta)`, `moveVertical(delta)`
- `home()`, `end()`, `lineStart()`, `lineEnd()`
- `killToStart()`, `killToEnd()`, `deleteWordBack()`
- `getCursorPosition()`
- `getParts()`

### parseKey / isPrintable

```js
parseKey(data)
isPrintable(value)
```

Normalize raw TTY data and detect printable text.


### PointerRegion

```js
PointerRegion({ pointerId, pointerData, pointerWidth, pointerEvents, pointerAutoEnable, onPointer, onClick, onWheel, onDrag, onMove, onRelease }, child)
```

Creates a layout-transparent hit region around its children. The same pointer props may be attached directly to any node. `pointerWidth` accepts a positive cell count or `'fill'`; without it, hit width follows rendered non-trailing content. `pointerAutoEnable` defaults to `true`; set it to `false` for a passive region that remains hit-testable without activating global terminal mouse reporting by itself.

### parsePointer / input decoding

```js
parsePointer(data)
parseInputEvent(data)
parseInputEvents(data)
new TerminalInputDecoder()
```

`parsePointer()` decodes SGR 1006 sequences. `TerminalInputDecoder.write(data)` preserves incomplete SGR and bracketed-paste sequences across chunks and returns an ordered array of normalized keyboard and pointer events. Legacy uppercase ASCII letters are exposed with a lower-case key `name`, the original uppercase `text`, and `shift: true`, allowing portable shortcuts such as `Shift+K/J`.

### hitTestPointerRegions / dispatchPointerEvent

```js
hitTestPointerRegions(regions, x, y, { all })
dispatchPointerEvent(pointer, regions, context)
requestsPointerReporting(regions)
```

Rendered frames expose `pointerRegions`. Hit-testing uses zero-based screen coordinates and returns the innermost matching region first. Dispatch adds target and local coordinates, invokes action-specific handlers followed by `onPointer`, and supports propagation control. A handler can call `capturePointer()` so later drag and release events remain routed to the same component, then `releasePointerCapture()` when the gesture finishes. `requestsPointerReporting()` reports whether the current region set contains at least one enabled, non-passive region that should activate automatic mouse ownership.

### mouseReportingSequence

```js
mouseReportingSequence(enabled, { drag = true, motion = false })
```

Returns the terminal control sequence for enabling or disabling basic mouse tracking, optional drag or all-motion tracking, and SGR 1006 coordinates.

## Focus and modes

### FocusManager

```js
new FocusManager(targets)
```

Methods:

- `current()`, `focus(id)`, `next()`, `previous()`, `move(delta)`
- `enable(id)`, `disable(id)`
- `has(id)`, `isEnabled(id)`, `get(id)`, `require(id)`

### ModeManager

```js
new ModeManager(root = 'input')
```

Methods:

- `current()`, `currentEntry()`, `is(name)`
- `push(name, data)`, `pop()`, `replace(name, data)`, `reset()`
- `toJSON()`

## Workspace runtime and actions

### createWorkspaceApp / WorkspaceApp

```js
createWorkspaceApp({
  title,
  state,
  render,
  actions,
  overlays,
  onKey,
  onPointer,
  pointer,
  tick,
  tickMs,
  animationMs = 80,
  input,
  output,
  onExit,
})
```

The runtime owns alternate-screen setup, raw input, resize redraws, overlay focus trapping, optional mouse reporting and terminal cleanup. `render` receives the actual viewport width and height together with a demand-driven `animationFrame`. The animation clock runs only while the current render reads that value or calls `requestAnimationFrame()`. `animationMs` controls the active cadence and can be set to `0` to disable animation. Calling `start()` more than once is safe. `onExit(code)` is optional; without it, `exit()` restores the terminal and terminates the process.

Pointer ownership methods:

- `setPointerEnabled(true | false | 'auto')` changes the configured preference.
- `setPointerOverride(true | false | null)` temporarily forces pointer reporting, forces native selection, or restores automatic behavior.
- `togglePointerOverride()` inverts the current automatic result until called again.

### ActionRegistry

Exports:

- `createActionRegistry(actions)`
- `ActionRegistry`
- `normalizeAction(action)`
- `keyMatches(spec, key)`
- `parseKeySpec(spec)`

Generated palette items, help shortcuts and footer hints evaluate dynamic `disabled(ctx)` callbacks against the supplied context.

### OverlayManager / OverlayHost

Exports:

- `createOverlayManager(options)`
- `OverlayManager`
- `OverlayHost(props)`

Blocking overlays trap keys until closed. Toast TTL updates do not request redraws until the visible toast stack changes. `overlays.modal({ render: ({ width, height }) => node })` creates a dynamic blocking modal whose render callback is evaluated on every frame and resize using the currently available modal body dimensions.

## Command palette

Exports:

- `createCommandPaletteState({ items, query, selectedIndex, windowSize })`
- `getCommandPaletteMatches(state)`
- `getPaletteQuery(state)`
- `handleCommandPaletteKey(state, key)`
- `renderCommandPalette(state, options)`
- `normalizePaletteItems(items)`

`handleCommandPaletteKey()` returns actions such as `accept`, `cancel`, `clear`, `move`, `edit`, and `noop`.

## Commands

Built-in command helpers:

- `commands`
- `parseCommand(line)`
- `findCommand(name)`
- `getSuggestions(input)`
- `helpText()`

Command registry helpers:

- `createCommandRegistry(entries)`
- `normalizeCommandEntry(entry)`

Parser helpers:

- `parseSlashCommand(line)`
- `tokenizeCommand(line)`
- `commandRest(parsed, fromIndex)`

## Scroll state and toasts

Scroll helpers:

- `clampScrollOffset(value, max)`
- `scrollBy(current, delta, max)`
- `scrollPage(current, direction, pageSize, max)`
- `normalizeScrollMap(scroll, maxByKey)`

Toast state:

- `createToastManager({ limit, ttlMs })`

The toast manager exposes `show(message, level, ttl)`, `clear()`, `tick(delta)`, and `current(fallback)`.

## Structured blocks and messages

Block helpers:

- `BLOCK_TYPES`
- `createBlock(input)`
- `normalizeBlock(input)`
- `normalizeBlocks(input)`
- `appendBlockContent(block, content)`
- `blockToText(block)`
- `blocksToText(blocks)`
- `ensureTextBlock(blocks)`

Message helpers:

- `createMessage(input)`
- `appendMessageChunk(message, chunk)`
- `appendMessageBlock(message, block)`
- `setMessageBlocks(message, blocks)`
- `completeMessage(message)`
- `trimMessages(messages, limit)`
- `normalizeMessages(messages)`
- `visibleConversationMessages(messages)`
- `lastUserMessage(messages)`
- `lastAssistantMessage(messages)`

## Chat components

Exports:

- `ChatScreen`
- `ChatHeader`
- `ChatTranscript`
- `SuggestionsPanel`
- `PalettePanel`
- `DebugPanel`
- `StatusBar`
- `InputBar`
- `Lines`
- `Clip`
- `createChatScreen(options)`
- `renderTranscriptLines(options)`
- `renderMessageContentLines(options)`
- `renderBlocksLines(options)`
- `renderBlockLines(options)`

Use these when you want the built-in chat/transcript rendering without using the complete `RichTerminalApp`.


## Syntax highlighting

- `SUPPORTED_SYNTAX_LANGUAGES`
- `SYNTAX_TOKEN_TYPES`
- `normalizeSyntaxLanguage(value)`
- `detectSyntaxLanguage({ language, filename, source })`
- `tokenizeSyntax(source, options)`
- `highlightSyntax(source, options)`
- `highlightSyntaxLines(source, options)`
- `styleSyntaxToken(token, theme)`
- `SyntaxText(options)`

`highlightSyntax()` returns ANSI-styled text. `highlightSyntaxLines()` returns one styled string per source line. Both safely return unstyled text when highlighting is disabled or the language cannot be detected.

Structured block renderers accept `syntaxHighlight: true`. Code blocks may set `language`, `filename`, and a block-level `syntaxHighlight` override. `RichTerminalApp` also accepts `syntaxHighlight: true`.

## Providers and reference model

Provider exports:

- `createProvider(name)`
- `listProviders()`
- `MockProvider`
- `ReplayProvider`

Mock model exports:

- `buildMockReply(prompt, options)`
- `buildMockBlocks(prompt, options)`
- `streamMockReply(prompt, options)`
- `streamMockBlocks(prompt, options)`
- `replyRules`
- `selectRule(prompt, rules)`
- `StreamCancelled`

## Sessions and skills

Session exports:

- `SessionStore`
- `serializeSkillState(skillState)`
- `applySerializedSkillState(skillState, serialized)`

Skill exports:

- `skills`
- `createSkillState()`
- `getSkill(id)`
- `enabledSkillNames(skillState)`
- `formatSkillList(skillState)`

## Responsive helpers

- `getResponsiveMode(width)`
- `responsiveColumns(width, mode)`
- `takeVisible(items, count)`

These helpers are used by the demos to adapt layouts to terminal width.
