# Interactive apps

This page covers the interaction helpers used by the examples: key parsing, input editing, focus, modes, command palette, command parsing, scroll state, toasts, and sessions.

## Key parsing

Use `parseKey(data)` to normalize raw TTY chunks into semantic key objects.

```js
import { parseKey } from 'terlio.js';

process.stdin.on('data', (chunk) => {
  const key = parseKey(chunk);
  if (key.name === 'ctrl-c') process.exit(0);
});
```

A key object contains:

```js
{
  name: 'up',
  sequence: '\x1b[A',
  text: '',
  printable: false,
  ctrl: false,
  meta: false,
  shift: false,
  cmd: false
}
```

Common `name` values include:

- `ctrl-c`, `ctrl-d`, `command-palette`
- `escape`, `enter`, `tab`, `backspace`, `delete`
- `up`, `down`, `left`, `right`, `home`, `end`, `page-up`, `page-down`
- `kill-start`, `kill-end`, `delete-word-left`
- `paste`
- `unknown`

Printable input returns `printable: true` and `text` set to the typed text.

The parser recognizes common modified arrow and enter escape sequences, including Shift, Alt/Meta, Ctrl, and some macOS Command-arrow forms. Legacy terminals encode `Shift+letter` as the uppercase character, so Terlio normalizes ASCII `A-Z` to a lower-case key name with `shift: true` while preserving the typed uppercase text.

For read-only panes, use `↑/↓` for one-row scrolling when that pane owns focus. Keep `Page Up/Page Down` for larger jumps:

```js
if (key.shift && key.name === 'up') scrollByLines(-1);
else if (key.shift && key.name === 'down') scrollByLines(1);
else if (key.name === 'page-up') scrollByPages(-1);
else if (key.name === 'page-down') scrollByPages(1);
```

## Pointer input

Use `parsePointer(data)` to decode SGR 1006 mouse sequences directly, or `TerminalInputDecoder` / `parseInputEvents(data)` when a raw TTY chunk may contain several keyboard and pointer events.

```js
import { TerminalInputDecoder } from 'terlio.js';

const decoder = new TerminalInputDecoder();
process.stdin.on('data', (chunk) => {
  for (const event of decoder.write(chunk)) {
    if (event.type === 'pointer') console.log(event.name, event.x, event.y);
  }
});
```

Pointer names are:

- `wheel-up`, `wheel-down`, `wheel-left`, `wheel-right`
- `click` for a button press
- `release`
- `drag`
- `move`

A normalized pointer event includes:

```js
{
  type: 'pointer',
  name: 'wheel-down',
  action: 'wheel',
  x: 12,             // zero-based screen coordinate
  y: 7,
  column: 13,        // original one-based terminal coordinate
  row: 8,
  button: 'none',
  deltaX: 0,
  deltaY: 1,
  ctrl: false,
  meta: false,
  shift: false
}
```

### Runtime mouse ownership

`createWorkspaceApp()` and `RichTerminalApp` accept a `pointer` option:

- `'auto'` (default) enables reporting while a global handler or an auto-enabling rendered component exists.
- `true` always enables reporting while the runtime is running.
- `false` leaves mouse reporting disabled.
- `{ enabled, drag, motion }` controls reporting explicitly. `drag` defaults to `true`; all-motion reporting defaults to `false`.

The runtime enables basic mouse tracking plus SGR 1006 encoding and automatically restores terminal modes in `stop()`, `exit()`, and fatal cleanup paths. Call `app.setPointerEnabled(true | false | 'auto')` to change the configured preference while running.

Terminal mouse reporting consumes the terminal emulator's native drag gesture, but applications can provide selection themselves. `SelectableText` and `ScrollPane({ selection })` keep reporting enabled, draw the selected range in the component, and capture drag events outside its bounds. Scrollable selections use content coordinates, so wheel or keyboard scrolling can move through multiple viewports without losing the range. A short click inside the highlighted range invokes `onCopy`; a successful result clears it, while a failed copy keeps it for retry. A short click elsewhere clears it without copying. Do not bind `Ctrl+C`: it remains `SIGINT`. Native clipboard tools are the default for explicit copy actions. OSC 52 is used only when the application selects `clipboard: 'osc52'` or `clipboard: 'auto'`. `copyOnRelease: true` remains available for applications that deliberately want immediate copy, and `nativeSelectionModifier` can be configured for terminal-specific behavior when needed.

Use `app.setPointerOverride(true | false | null)` or `app.togglePointerOverride()` only for temporary exceptions. `true` forces reporting, `false` restores the terminal emulator's native selection, and `null` returns to the configured automatic behavior. The packaged demos bind this fallback to `Ctrl+T`.

The chat transcript uses component-level selection, so wheel/trackpad scrolling, clicks, and drag selection are active together by default. The selection remains stable while scrolling, including across multiple screens. Clicking highlighted text copies it and clears the highlight after success; a failed copy leaves it selected. Clicking outside clears it without copying. The command palette remains an alternative explicit copy action, and `Ctrl+C` always interrupts. Read-only code-review panes use the same selection model. `Ctrl+T` is reserved for exceptional cases that require native terminal selection.

### Component hit-testing

Pointer handlers may be attached to any declarative node:

```js
Box({
  border: true,
  pointerId: 'history',
  pointerData: { pane: 'transcript' },
  pointerWidth: 'fill',
  onWheel: (event, ctx) => {
    ctx.state.scroll += event.deltaY;
  },
  onClick: (event) => {
    console.log(event.localX, event.localY);
  },
}, Text('Scrollable content'))
```

Use `PointerRegion(props, child)` around components whose factory does not forward pointer props. `ScrollPane()` forwards pointer props directly and defaults its hit width to the full assigned width. `pointerAutoEnable` defaults to `true`. Set it to `false` only for a passive region that should not enable terminal mouse reporting by itself.

Hit-testing is generated from the actual rendered layout. Routed events contain `target`, `currentTarget`, `localX`, and `localY`. Nested regions bubble from the innermost region outward; handlers can call `stopPropagation()`, `stopImmediatePropagation()`, or `preventDefault()`.

Low-level consumers can use `hitTestPointerRegions()` and `dispatchPointerEvent()` with the `pointerRegions` array stored on a rendered `Frame` or `TerminalRenderer`.

## InputEditor

`InputEditor` owns a string value and a cursor measured in Unicode code points.

```js
import { InputEditor } from 'terlio.js';

const editor = new InputEditor();
editor.insert('hello');
editor.move(-1);
editor.backspace();
```

Common methods:

- `set(value)` and `clear()`
- `insert(text)`, `insertPaste(text)`, and `insertLineBreak()`
- `backspace()` and `deleteForward()`
- `move(delta)`, `home()`, `end()`
- `killToStart()`, `killToEnd()`, `deleteWordBack()`
- `moveWord(delta)`, `moveVertical(delta)`, `lineStart()`, `lineEnd()`
- `getCursorPosition()` returns `{ line, column }`
- `getParts()` returns `{ before, current, after }`

Use `insertPaste()` for bracketed paste so CRLF and tabs are normalized while embedded newlines remain data rather than being routed as shortcuts.

Managed runtimes enable bracketed paste only after input startup succeeds and disable it during every cleanup path. `TerminalInputDecoder` keeps each paste atomic and bounds its byte size. Newlines inside `event.text` are editor data; input after the closing paste marker is decoded normally.

A typical key handler:

```js
function handleEditorKey(editor, key) {
  if (key.printable) editor.insert(key.text);
  else if (key.name === 'paste') editor.insertPaste(key.text);
  else if (key.name === 'backspace') editor.backspace();
  else if (key.name === 'delete') editor.deleteForward();
  else if (key.name === 'left') key.meta ? editor.moveWord(-1) : editor.move(-1);
  else if (key.name === 'right') key.meta ? editor.moveWord(1) : editor.move(1);
  else if (key.name === 'home') editor.home();
  else if (key.name === 'end') editor.end();
  else if (key.name === 'enter' && key.shift) editor.insertLineBreak();
}
```

Render the editor with `TextEditorView`:

```js
TextEditorView({ value: editor.value, cursor: editor.cursor, width: 80, height: 8 })
```

## FocusManager

`FocusManager` tracks the active focus target and skips disabled targets during keyboard navigation.

```js
const focus = new FocusManager(['tabs', 'list', 'details', 'command']);
focus.next();
focus.disable('details');
focus.focus('command');
```

Methods:

- `current()` returns the active target id.
- `focus(id)` moves focus to an enabled target.
- `next()` and `previous()` move through enabled targets.
- `enable(id)` and `disable(id)` toggle availability.
- `has(id)`, `isEnabled(id)`, `get(id)`, `require(id)` inspect targets.

Use this to keep Tab behavior aligned with panes that are actually visible in the current responsive layout.

## ModeManager

`ModeManager` is a small stack for modal states.

```js
const modes = new ModeManager('input');
modes.push('palette');
modes.push('confirm', { action: 'delete-session' });
modes.pop();
modes.reset();
```

Methods:

- `current()` returns the active mode name.
- `currentEntry()` returns `{ name, data }`.
- `is(name)` checks the active mode.
- `push(name, data)`, `pop()`, `replace(name, data)`, `reset()` mutate the mode stack.
- `toJSON()` returns a serializable stack.

Common mode names in examples are `input`, `command`, `palette`, `modal`, and `confirm`, but the manager accepts any non-empty string.

## Command palette

The command palette is split into pure state helpers and a render helper.

```js
import {
  createCommandPaletteState,
  getCommandPaletteMatches,
  handleCommandPaletteKey,
  renderCommandPalette,
} from 'terlio.js';

const palette = createCommandPaletteState({
  items: [
    { id: 'theme.dark', title: 'Theme: dark', description: 'Switch to dark theme', keywords: ['theme'] },
    { id: 'session.new', title: 'New session', description: 'Create a session', keywords: ['session'] },
  ],
});
```

On input:

```js
const result = handleCommandPaletteKey(palette, key);
if (result.type === 'accept') {
  runPaletteItem(result.item);
}
if (result.type === 'cancel') {
  modes.pop();
}
```

Render:

```js
renderCommandPalette(palette, { title: ' Command Palette ', showHelp: true })
```

Palette items are normalized to:

```js
{
  id: 'theme.dark',
  title: 'Theme: dark',
  description: 'Switch visual theme',
  keywords: ['theme', 'dark'],
  value: {},
  disabled: false
}
```

## Slash commands

For simple commands, use the built-in command list from `commands.js`:

```js
import { parseCommand, findCommand, getSuggestions, helpText } from 'terlio.js';

const { name, args } = parseCommand('/blocks "release notes" final');
const command = findCommand(name);
const suggestions = getSuggestions('/the');
```

For product-specific command systems, use the registry helpers:

```js
import { createCommandRegistry } from 'terlio.js';

const registry = createCommandRegistry([
  {
    name: '/assign',
    description: 'Assign the current ticket',
    usage: 'assign <user>',
    run: ({ parsed, state }) => ({ ok: true, state: { ...state, assignee: parsed.text } }),
  },
]);

registry.find('assign');
registry.suggestions('/as');
registry.execute('/assign alex', { state });
```

`parseCommand()` is a compatibility facade over the quoted-argument parser, so quoted and escaped arguments are preserved.

For lower-level parsing:

```js
import { parseSlashCommand, tokenizeCommand, commandRest } from 'terlio.js';

parseSlashCommand('/filter status open');
tokenizeCommand('tag "urgent billing"');
commandRest(parseSlashCommand('/reply template greeting'), 1);
```

## Scroll state

Use scroll helpers to keep offsets clamped and consistent.

```js
import { scrollBy, scrollPage, clampScrollOffset, normalizeScrollMap } from 'terlio.js';

const maxScroll = Math.max(0, totalLines - visibleLines);
scroll = scrollBy(scroll, 1, maxScroll);
scroll = scrollPage(scroll, -1, visibleLines, maxScroll);
scroll = clampScrollOffset(scroll, maxScroll);
```

`normalizeScrollMap(scrollMap, maxByKey)` is useful when different panes have separate scroll offsets.

## Toast manager

`createToastManager()` returns a small state container for transient notifications.

```js
const toasts = createToastManager();
toasts.show('Saved.', 'success', 4);
toasts.tick(1);
const current = toasts.current();
```

Use `toasts.current()` with the `Toast` component, or `toasts.clear()` to remove the active toast immediately. Toasts rendered through `OverlayHost` also dismiss immediately when clicked.

## SessionStore

`SessionStore` persists session snapshots as JSON files.

```js
import { SessionStore } from 'terlio.js';

const store = new SessionStore();
const id = store.createId();
store.save({ id, title: 'Demo', messages: [] });
const sessions = store.list();
const snapshot = store.load(id);
```

Methods:

- `ensure()` creates the session directory.
- `createId()` creates a session id.
- `list()` returns saved session summaries.
- `load(id)` returns a snapshot.
- `save(snapshot)` writes a snapshot.
- `remove(id)` deletes a snapshot.
- `pathFor(id)` resolves a session path.

By default the store uses a platform-specific user data directory. You can override it:

```js
const store = new SessionStore({ rootDir: './tmp/sessions' });
```

## Full application shell

`RichTerminalApp` is the built-in mock AI chat application. It wires together input, rendering, command palette, sessions, skills, providers, transcript rendering, and streaming.

```js
import { RichTerminalApp } from 'terlio.js';

const app = new RichTerminalApp({
  input: process.stdin,
  output: process.stdout,
  onExit: (code) => process.exit(code),
});

app.start();
```

Use `RichTerminalApp` as a ready-made app or as a reference implementation. For custom applications, most projects should use the lower-level primitives described above.
