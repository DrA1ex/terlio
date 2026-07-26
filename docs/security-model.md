# Security model

Terlio.js separates terminal output, terminal input, clipboard effects, pointer metadata and persisted sessions. The security boundary is intentionally narrow: it blocks terminal actions that are reachable in the current library, while operational limits for application-owned data are opt-in unless unbounded retention would otherwise occur.

## Terminal output

`Text()` is safe by default. CSI, OSC, DCS, APC, PM, SOS, C1 and other terminal controls in plain text are removed or rendered visibly according to `blockedControlRendering`. Validated SGR remains accepted in ordinary text for 1.x styling compatibility, while library-generated styles are restricted to validated SGR attributes and colors.

```js
import { Text, createTerminalPolicy, renderToString } from 'terlio.js';

const policy = createTerminalPolicy({
  mode: 'safe',
  blockedControlRendering: 'visible',
});

renderToString(Text(untrustedValue), { terminalPolicy: policy });
```

Raw terminal output requires both the deliberately named `unsafeRawAnsi()` wrapper and `mode: 'trusted'`. Trusted mode bypasses terminal-injection protections and must not receive untrusted values.

Hyperlinks are disabled by default. Enabling them requires an explicit URI scheme allowlist; labels and targets remain bounded and control characters cannot break out of OSC 8.

## Pointer metadata

Pointer regions are structured layout data. Displayed text is never parsed for pointer markers. Geometry, parent relationships and handler tokens are validated, and overlays determine z-order structurally.

Pointer-region count is unlimited by default because regions are created by application layout rather than untrusted text. Applications with unusually large interactive trees may opt into `limits.pointerRegions` as a performance policy.

## Input and paste

Interactive runtimes enable bracketed paste after startup and disable it during every cleanup path. A bracketed paste is emitted as one `paste` event. Newlines inside clipboard content remain newline characters in `event.text`; they are not routed as application `Enter` events.

The closing bracketed-paste marker ends that data transaction. Any bytes after it are decoded as independent key, pointer or text events. Terlio intentionally does not infer user intent or suppress an `Enter` outside the paste transaction.

Paste is data. The decoder normalizes CRLF/CR to `\n` but does not remove terminal-looking sequences. When pasted data is displayed, the terminal-output boundary makes those sequences harmless.

`inputBufferBytes` limits only an incomplete tail retained between terminal reads. Complete key and text events are decoded before that check. `escapeSequenceBytes` bounds an unfinished terminal sequence, and `pasteBytes` bounds one bracketed-paste transaction.

## Clipboard

Clipboard behavior is explicit:

- `disabled` never copies;
- `native` uses a platform clipboard executable or injected backend and is the default;
- `osc52` writes a bounded OSC 52 payload intentionally;
- `auto` tries native copy and then OSC 52;
- `legacy` preserves the historical clipboard fallback for applications that still depend on it; new code should choose a specific policy.

Native commands are invoked with `shell: false`, an argument array and the caller's configured environment. Applications that do not trust their process `PATH` should inject a clipboard backend using an absolute executable path or platform API.

Native clipboard size is unlimited by default. OSC 52 remains bounded by `osc52Bytes` because the encoded payload is written into the terminal. `clipboardBytes` remains as a deprecated alias for `osc52Bytes`.

OSC 52 uses an allowlisted target and never generates query/read forms. Copy failures return structured results, and selections should be cleared only after confirmed success.

## Sessions

Sessions are plaintext and may contain prompts, tool output, source code, paths and secrets. Terlio.js does not encrypt them. Disable persistence or inject encrypted storage when plaintext is unsuitable.

On supported Unix platforms, session directories use `0700` and files use `0600`. A configured root may be a symlink chosen by the user; its real path is resolved before the `sessions` directory is created. The final session directory and session files are not followed through symlinks.

Writes use a private temporary file and atomic rename. `durability: 'atomic'` is the default. Applications that require a synchronous disk flush may use `new SessionStore({ durability: 'fsync' })`.

The default 16 MiB `sessionBytes` check is a corruption and availability guard before JSON parsing. Message-count and nesting-depth limits are optional and default to `Infinity`. JSON property names such as `__proto__`, `constructor` and `prototype` are treated as ordinary data because Terlio does not deep-merge session documents into application objects.

Versionless sessions remain readable through a compatibility normalizer. Versioned malformed sessions fail with controlled errors.

## Terminal restoration

`WorkspaceApp` and `RichTerminalApp` restore bracketed paste, mouse reporting, autowrap, cursor visibility, SGR state, alternate screen and raw mode after normal shutdown, partial startup and callback failures. Cleanup is idempotent and continues attempting later restoration steps when an earlier terminal write fails.

Process-global handlers are opt-in through `processHandlers: 'none' | 'signals' | 'full'`. The default is `none`, which is appropriate for embeddable libraries.

## Unicode display policies

General text and ordinary tool results use `unicodeSecurity: 'normal'`. Code, diffs, filenames, commands and explicitly marked code/log/security tool results may use or infer `code-safe`.

`code-safe` exposes bidi overrides and isolates that can visually reorder security-sensitive text. It preserves ZWJ, ZWNJ and other format characters needed by emoji and natural-language scripts. `visible-controls` is the broader diagnostic mode and exposes selected zero-width characters, soft hyphen, C0 and C1 controls.

A tool result can opt into the stricter behavior with `contentKind: 'code'`, `'log'`, `'security-log'` or a similar security-sensitive kind. Any structured block can explicitly set `unicodeSecurity`.


## Trust boundaries

Some capabilities deliberately remain application-owned:

- `mode: 'trusted'` bypasses terminal-output filtering and must receive only trusted values;
- a custom terminal sink can emit arbitrary bytes and is treated as trusted infrastructure;
- native clipboard discovery uses the process `PATH`; applications with stricter executable requirements should inject their own backend;
- session persistence is plaintext unless the application supplies an encrypted store;
- operational limits for application-owned data are optional and should be chosen for the application's workload.

These are configuration and deployment boundaries, not hidden guarantees provided by Terlio.js.

## Limits

Limits are divided into two groups.

Finite defaults exist where Terlio itself could otherwise retain an unfinished stream or emit an external terminal payload:

```js
{
  inputBufferBytes: 64 * 1024,   // incomplete retained tail only
  escapeSequenceBytes: 1024,
  pasteBytes: 1024 * 1024,
  osc52Bytes: 1024 * 1024,
  sessionBytes: 16 * 1024 * 1024,
  hyperlinkBytes: 2048,
}
```

Application-owned rendering and data-shape caps default to `Infinity`:

```js
{
  renderedTextBytes: Infinity,
  renderedLines: Infinity,
  syntaxTokens: Infinity,
  nativeClipboardBytes: Infinity,
  sessionMessages: Infinity,
  sessionDepth: Infinity,
  pointerRegions: Infinity,
}
```

Applications may set any of those as operational policies. When configured, failures use `TerlioLimitError` with `code: 'TERLIO_LIMIT_EXCEEDED'`, `resource`, `limit` and `actual`.
