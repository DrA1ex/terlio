# Security contract testing

The security contract is a focused regression suite for behavior that crosses terminal, input, clipboard, pointer, session and runtime boundaries. It complements the ordinary component and integration tests.

## Commands

```bash
npm run test:security:contract
npm run test:security:contract:strict
```

`npm test` also runs the enforced contract together with the compatibility and interface suites. Both focused commands must pass without TODO, skip or expected-failure allowances before publishing a release.

## Contract groups

| Audit finding | Contract area |
|---|---|
| `TERLIO-SEC-001` | Safe renderer, trusted output, unsafe opt-in and hyperlinks |
| `TERLIO-SEC-002` | Pointer metadata isolation |
| `TERLIO-SEC-003` | Bracketed-paste lifecycle and atomic paste transactions |
| `TERLIO-SEC-004` | Parser validation, recovery, fuzzing and retained-buffer bounds |
| `TERLIO-SEC-005` | Clipboard policy and safe OSC 52 construction |
| `TERLIO-SEC-006` | Session permissions, symlink handling, atomic writes and bounded reads |
| `TERLIO-SEC-007` | Terminal restoration and process-handler ownership |
| `TERLIO-SEC-008` | Native clipboard execution and backend discovery |
| `TERLIO-SEC-009` | Bidi and invisible Unicode handling |
| `TERLIO-SEC-010` | Configurable limits and structured limit errors |

Each test name records the audit finding and the required outcome, such as `reject`, `escape`, `truncate`, `disable`, `restore` or `allow`.

## Hostile fixtures

Byte-exact hostile terminal fixtures live in `scripts/security-testing/contractFixtures.js`. They use escaped source literals. Assertions compare predicates and structured results instead of printing raw payloads, so test diagnostics cannot execute terminal control sequences.

## Reviewing contract changes

Do not weaken a contract merely to match current behavior. A contract change should correspond to an explicit security-model or compatibility decision and include a regression test for the intended behavior.

Coverage instrumentation, seeded fuzzing, interface snapshots and package verification are separate release checks. The contract suite should remain deterministic and runnable on its own.
