# Interactive apps

This page covers the interaction helpers used by the examples: key parsing, input editing, focus, modes, command palette, command parsing, scroll state, toasts, and sessions.

## Key parsing

Use `parseKey(data)` to normalize raw TTY chunks into semantic key objects.

```js
import { parseKey } from 'mock-ai-terminal';

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

The parser recognizes common modified arrow and enter escape sequences, including Shift, Alt/Meta, Ctrl, and some macOS Command-arrow forms.

## InputEditor

`InputEditor` owns a string value and a cursor measured in Unicode code points.

```js
import { InputEditor } from 'mock-ai-terminal';

const editor = new InputEditor();
editor.insert('hello');
editor.move(-1);
editor.backspace();
```

Common methods:

- `set(value)` and `clear()`
- `insert(text)` and `insertLineBreak()`
- `backspace()` and `deleteForward()`
- `move(delta)`, `home()`, `end()`
- `killToStart()`, `killToEnd()`, `deleteWordBack()`
- `moveWord(delta)`, `moveVertical(delta)`, `lineStart()`, `lineEnd()`
- `getCursorPosition()` returns `{ line, column }`
- `getParts()` returns `{ before, current, after }`

A typical key handler:

```js
function handleEditorKey(editor, key) {
  if (key.printable) editor.insert(key.text);
  else if (key.name === 'paste') editor.insert(key.text);
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
} from 'mock-ai-terminal';

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
import { parseCommand, findCommand, getSuggestions, helpText } from 'mock-ai-terminal';

const { name, args } = parseCommand('/theme dark');
const command = findCommand(name);
const suggestions = getSuggestions('/the');
```

For product-specific command systems, use the registry helpers:

```js
import { createCommandRegistry } from 'mock-ai-terminal';

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

For lower-level parsing:

```js
import { parseSlashCommand, tokenizeCommand, commandRest } from 'mock-ai-terminal';

parseSlashCommand('/filter status open');
tokenizeCommand('/tag urgent billing');
commandRest(parseSlashCommand('/reply template greeting'), 1);
```

## Scroll state

Use scroll helpers to keep offsets clamped and consistent.

```js
import { scrollBy, scrollPage, clampScrollOffset, normalizeScrollMap } from 'mock-ai-terminal';

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

Use `toasts.current()` with the `Toast` component, or `toasts.clear()` to remove the active toast immediately.

## SessionStore

`SessionStore` persists session snapshots as JSON files.

```js
import { SessionStore } from 'mock-ai-terminal';

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
import { RichTerminalApp } from 'mock-ai-terminal';

const app = new RichTerminalApp({
  input: process.stdin,
  output: process.stdout,
  onExit: (code) => process.exit(code),
});

app.start();
```

Use `RichTerminalApp` as a ready-made app or as a reference implementation. For custom applications, most projects should use the lower-level primitives described above.
