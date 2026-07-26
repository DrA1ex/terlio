# Security policy

## Supported versions

Until the first stable release, security fixes are applied to the latest published version.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting feature for the repository. Include reproduction steps, affected versions and the expected impact.

Terlio.js does not execute user-entered shell commands by default. Example actions that resemble deployment, copy or apply operations are simulations unless explicitly documented otherwise.

## Security guarantees

Terlio.js separates displayed text, terminal controls, pointer metadata, input decoding, clipboard effects and persisted sessions:

- untrusted text is filtered again at the final terminal sink;
- pointer hit regions are structured layout metadata and are never parsed from text;
- bracketed paste is emitted as one text event, so embedded newlines are not application `Enter` commands;
- OSC 52 clipboard output requires an explicit policy;
- native clipboard commands run without a shell;
- session files use private permissions and atomic replacement on supported platforms;
- managed runtimes restore terminal modes after normal shutdown, partial startup and callback failures.

Sessions are plaintext and may contain prompts, tool output, code, paths and secrets. Applications requiring encryption should disable the built-in store or provide an encrypted backend.

See [`docs/security-model.md`](docs/security-model.md) for configuration, limitations and trust boundaries. The focused regression suite is described in [`docs/security-contract-testing.md`](docs/security-contract-testing.md).

## Verification

Security behavior is part of the ordinary test suite. Maintainers can also run the focused contract directly:

```bash
npm run test:security:contract
npm run test:security:contract:strict
```

Both commands must pass before publishing a release.
