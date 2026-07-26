# Security migration for 1.2.0

Terlio.js 1.2.0 changes the trust model for terminal output, clipboard access, input parsing and sessions. Most applications using declarative components require no source changes, but applications that embedded raw ANSI or relied on implicit OSC 52 fallback must migrate explicitly.

## Raw ANSI in text

Before 1.2.0, arbitrary ANSI embedded in text could reach the terminal:

```js
Text(`\x1b[31mError\x1b[0m`)
```

Use structured styling instead:

```js
Text('Error', { color: 'red' })
```

For terminal-specific output that cannot be represented structurally:

```js
import { Text, createTerminalPolicy, unsafeRawAnsi } from 'terlio.js';

const node = Text(unsafeRawAnsi(sequence));
const terminalPolicy = createTerminalPolicy({ mode: 'trusted' });
```

`unsafeRawAnsi()` under trusted mode bypasses Terlio.js terminal-injection protections. Never pass user, log, filename, tool or model output to it.

## Clipboard policy

The default clipboard policy is now `native`; Terlio.js no longer silently falls back to OSC 52.

```js
const nativeOnly = createTerminalPolicy({ clipboard: 'native' });
const remoteFriendly = createTerminalPolicy({ clipboard: 'auto' });
const explicitOsc52 = createTerminalPolicy({ clipboard: 'osc52' });
const noClipboard = createTerminalPolicy({ clipboard: 'disabled' });
```

Direct copies use the same explicit option:

```js
await copyTextToClipboard(text, { clipboardPolicy: 'auto' });
```

Use `legacy` only as a temporary, explicit compatibility mode while migrating older behavior.

## Paste and input

Interactive runtimes enable bracketed paste automatically. A paste arrives as one `paste` event; CRLF/CR is normalized to `\n`, and embedded newlines remain data rather than application `Enter` keys. Applications should insert `event.text` as data rather than routing it through shortcut handling. Input received after the closing bracketed-paste marker remains ordinary application input and is not heuristically suppressed.

Custom decoders can set limits and overflow behavior:

```js
const decoder = new TerminalInputDecoder({
  limits: { pasteBytes: 256 * 1024 },
  pasteOverflow: 'reject', // or 'truncate'
});
```

## Sessions

New writes include `version: 1`, private permissions and atomic replacement. Existing versionless sessions remain readable. The configured root may be a user-selected symlink, while the final sessions directory and files are not followed through symlinks. Use `durability: 'fsync'` only when synchronous disk durability is required.

Sessions remain plaintext. Applications handling secrets should disable persistence or inject an encrypted store.

## Runtime ownership

Both public runtimes default to `processHandlers: 'none'`. Applications that want Terlio.js to own termination signals can opt in:

```js
createWorkspaceApp({ processHandlers: 'signals', ...options });
```

`full` additionally installs handlers for uncaught exceptions and unhandled rejections. Embedded applications should normally retain `none` and manage process policy themselves.

## Unicode-sensitive views

Use `contentKind` or `unicodeSecurity` for code, commands, filenames and logs:

```js
Text(filename, { contentKind: 'filename' });
Text(command, { contentKind: 'command' });
SyntaxText({ code, unicodeSecurity: 'code-safe' });
```

`code-safe` exposes bidi reordering controls while preserving ZWJ/ZWNJ. Use `visible-controls` when broader invisible/control diagnostics are required.

## Resource limits

Finite defaults remain for unfinished input retention, one escape sequence, bracketed paste, OSC 52, session file bytes and hyperlink metadata. Render size, line count, syntax tokens, native clipboard bytes, session message/depth and pointer-region caps default to `Infinity` and are optional operational policies. Configure them through `createTerminalPolicy({ limits })`, component `securityLimits`, `TerminalInputDecoder`, or `SessionStore`; catch `TERLIO_LIMIT_EXCEEDED` when an application wants a custom rejection message.
