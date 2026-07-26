# Post-hardening audit and rationalization

This review was performed after completing the 1.2.0 security plan. It re-ran the release baseline, inspected interactions between the new boundaries, reproduced ordinary compatibility paths and distinguished reachable security problems from hypothetical future misuse.

## Confirmed boundary defects fixed

The review found cross-boundary problems that the original finding-by-finding contract did not exercise together:

- an `unsafe-raw` operation could impersonate the internal clipboard channel through metadata;
- `unsafeRawAnsi()` preserved SGR in safe mode despite requiring trusted mode for raw controls;
- a complete paste could be rejected by the smaller retained-input limit instead of its own paste limit;
- an oversized rejected paste split across chunks could leak later bytes into normal key parsing;
- unsupported CSI-u and modified-key values could be accepted;
- deeply nested or cyclic session data could surface uncontrolled runtime errors;
- partial startup and cleanup failures could leave terminal modes unrestored or replace the original error;
- asynchronous clipboard and OSC 52 write failures could escape the structured result API;
- hyperlink truncation could split SGR sequences;
- optional render and syntax caps were checked after expensive work instead of at the operation boundary.

Each item has a targeted regression test. The chat-level paste test verifies that clipboard newlines remain editor text and are never routed as application `Enter` events.

## Restrictions removed or narrowed

The audit also found policies that did not correspond to an exploitable path in the current Terlio.js implementation.

### Session property-name blacklist

The session loader uses `JSON.parse()`, validates the document and reads known fields. It does not deep-merge session data into prototypes. Blanket rejection of `__proto__`, `constructor` and `prototype` therefore blocked legitimate metadata without closing a reachable vulnerability. These names are now ordinary JSON data.

### Complete input chunk size

`inputBufferBytes` no longer rejects a large completed terminal chunk. It limits only an unfinished tail retained between reads. One unfinished escape sequence and one bracketed-paste transaction retain their own explicit limits.

### Arbitrary numeric and pointer caps

The separate numeric-digit and maximum-pointer-coordinate defaults were removed. Escape sequences are already bounded by bytes, and parsed values must be finite safe integers. Pointer coordinates do not drive memory allocation.

### Application-owned structure caps

Rendered bytes, rendered lines, syntax tokens, native clipboard bytes, session message count, session depth and pointer-region count now default to `Infinity`. Applications may configure those values as workload policies, but Terlio no longer presents arbitrary defaults as vulnerability mitigations.

### Native clipboard environment

Native clipboard commands continue to use `shell: false` and argument arrays. They now receive the configured environment instead of a reduced environment that did not address `PATH` replacement but could break legitimate backends.

### Session durability and root paths

Atomic rename remains the default persistence behavior. `fsync` is available through `durability: 'fsync'` instead of running on every save. A configured session root may be a user-selected symlink; the resolved `sessions` directory and final files remain protected from symlink following.

### Unicode display defaults

`code-safe` now focuses on bidi controls that can visually reorder security-sensitive text. ZWJ and ZWNJ remain intact. Ordinary tool results use normal Unicode; tool results explicitly marked as code, log or security-sensitive content use `code-safe` by default.

## Paste behavior

Bracketed paste is handled as one semantic transaction:

- CRLF and CR inside clipboard data become `\n`;
- embedded newlines are inserted into the editor and never routed as application `Enter` events;
- terminal-looking bytes remain paste data and are made harmless when rendered;
- text, key and pointer input after the closing bracketed-paste marker is decoded normally.

An earlier audit revision introduced a short cross-chunk submit guard. It was removed after review because it conflated independent input received after the paste terminator with clipboard data. The actual contract is simpler: content inside the markers is data; content after them is not.

## Protections retained

The following controls address reachable behavior in the current library and remain enabled:

- final-sink filtering of terminal controls from untrusted text;
- structured pointer metadata with no text marker parser;
- bounded unfinished escape and paste retention;
- explicit, allowlisted and bounded OSC 52;
- `shell: false` for native clipboard commands;
- private session permissions and atomic replacement;
- terminal-state restoration after partial failures;
- visible bidi controls in code, diffs, commands, filenames and marked security logs.

## Remaining trust assumptions

- `mode: 'trusted'` intentionally bypasses output filtering.
- A custom terminal sink is trusted and can emit arbitrary bytes.
- Native clipboard discovery uses the process `PATH`; high-assurance applications should inject a backend using an absolute executable or platform API.
- Sessions remain plaintext.
- The built-in native clipboard backend is synchronous; applications requiring non-blocking copy should inject an asynchronous backend.
- Portable filesystem checks cannot eliminate every race from a process that can concurrently replace ancestor directories.

The Node.js 18/20 and multi-terminal manual release matrix remains a release-validation task rather than a known defect.

## Verification

The rationalized tree was verified on the available Node.js runtime:

- 451/451 unit, integration, security and interface tests passed;
- 82/82 strict security-contract assertions passed;
- 50/50 public visual components and 14/14 golden frames passed without golden updates;
- coverage was 96.73% lines, 80.96% branches and 95.05% functions;
- `npm audit --audit-level=high` reported zero known dependency vulnerabilities;
- package verification contained 134 files and 273,582 bytes;
- the npm dry run estimated a 273.6 kB tarball and 1.1 MB unpacked package.
