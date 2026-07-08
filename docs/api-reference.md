# API reference

All public exports are re-exported from the package entrypoint:

```js
import * as terminal from 'mock-ai-terminal';
```

When developing inside this repository, import from `src/lib/index.js`.

## Full app

### RichTerminalApp

```js
new RichTerminalApp({ input, output, onExit, sessionStore })
```

A complete mock AI chat terminal app. It owns terminal raw mode, alternate screen rendering, command execution, mock provider streaming, sessions, skills, suggestions, debug state, and command palette integration.

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

Creates a text node.

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
layout(node, { width, height })
renderNode(node, width)
measureNodeHeight(node, width)
```

`layout()` returns a fixed-size frame. `renderNode()` returns rendered lines for a node at a given width. `measureNodeHeight()` renders the node at the same width and returns the number of rows it would occupy; use it when calculating available space for adaptive terminal layouts.

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

Render a UI tree to a `Frame` or string.

### TerminalRenderer

```js
new TerminalRenderer({ output })
```

Methods:

- `renderLines(lines, options)`
- `renderNode(node, options)`
- `renderFrame(frame)`
- `reset()`

### diffFrames / patchFrames

```js
diffFrames(previous, next)
patchFrames(previous, next)
```

Compute frame differences or an ANSI patch string.

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
SelectList({ title, items, selectedIndex, windowSize, emptyText, getLabel, getDescription, getDisabled })
```

Renders a scroll-windowed selectable list.

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

Renders an info/success/warning/error toast.

### ProgressBar

```js
ProgressBar({ value, total, width, label })
```

Renders a text progress bar.

### Spinner

```js
Spinner({ frame, label })
```

Renders a spinner frame.

### HelpOverlay

```js
HelpOverlay({ title, shortcuts })
```

Renders shortcut rows.

### Badge, SectionTabs, CommandBar, FooterStatusBar, Grid, PropertyRows, ChipLine

Small components for status labels, tab rows, command input display, footer status, aligned grids, key/value details, and chip controls.

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
ScrollPane({ title, lines, width, height, scroll, border, footer, autoscroll, previousTotalRows, sticky })
resolveAutoScrollOffset({ scroll, previousTotalRows, totalRows, visibleRows, sticky })
isScrollAtBottom(scroll, totalRows, visibleRows)
scrollMax(totalRows, visibleRows)
```

Render or calculate a scroll window. Use `resolveAutoScrollOffset()` for log/transcript panes that should follow new output only while the user is already at the bottom. Once the user scrolls up, keep `sticky: false`; when they page back to the bottom, set it to `true` again.

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
WorkspacePane({ title, active, height, children, footer, borderColor })
```

Renders a bordered application pane. Active panes get a highlighted border by default.

### KeyHintBar

```js
KeyHintBar({ title, hints, columns = 3, gridBorder = false })
```

Renders grouped key hints using the shared `Grid` component, so wrapped rows stay aligned across columns. `gridBorder: true` enables the bordered-grid mode for shortcut-heavy examples.

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
LiveJobBlock({ title, status, steps, activeIndex, progress, frame })
```

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
- `insert(text)`, `insertLineBreak()`
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
- `commandRest(line, commandName)`

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

## Providers and mock model

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
