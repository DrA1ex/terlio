# Security rationalization after 1.2.0 hardening

The post-hardening review distinguished reachable security boundaries from general operational safeguards.

## Retained as security boundaries

- terminal controls from text are filtered at the final sink;
- pointer metadata is never parsed from displayed text;
- unfinished terminal escape strings and paste transactions cannot be retained without a bound;
- OSC 52 is explicit, allowlisted and bounded;
- native clipboard commands use `shell: false`;
- session files use private permissions and atomic replacement;
- terminal modes are restored after partial failures.

These protections address behavior that exists in current Terlio.js without requiring a hypothetical future bug.

## Changed to operational opt-ins

Rendering size, rendered line count, syntax token count, native clipboard size, session message count, session object depth and pointer-region count now default to `Infinity`. Applications can still configure them when they need workload-specific caps.

Complete input chunks are not rejected merely for exceeding `inputBufferBytes`; only an unfinished retained tail is bounded. Native clipboard content is separate from the OSC 52 terminal-payload limit.

## Removed blanket restrictions

Session JSON accepts ordinary property names including `__proto__`, `constructor` and `prototype`. Terlio parses and validates the document but does not deep-merge it into application prototypes.

Code-safe Unicode display now focuses on bidi reordering controls. ZWJ/ZWNJ remain intact, and ordinary tool results use normal Unicode unless marked as code, log or security-sensitive content.

## Paste behavior

Bracketed paste is one data transaction. Clipboard CRLF/CR is normalized to `\n`, and those newlines are inserted into the editor rather than handled as application `Enter` keys.

The bracketed-paste terminator is the semantic boundary. Bytes inside it are paste data; bytes after it are ordinary input events. Terlio does not guess whether a later `Enter` was intentional and does not suppress it.
