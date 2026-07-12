# Contributing to Terlio.js

Thank you for improving Terlio.js. Keep changes focused, dependency-free unless there is a compelling reason, and consistent with the existing declarative UI architecture.

## Development

```bash
npm ci
npm run check
npm test
npm run test:package
```

`npm run test:package` creates the real npm tarball, installs it into a temporary consumer project, imports the public API, lists the packaged examples and runs the one-shot component example.

## Pull requests

- Add regression tests for behavior changes.
- Check interactive examples in a real TTY when changing input, focus, scrolling, overlays or resize behavior.
- Update user-facing documentation and release notes when public behavior changes.
- Do not commit `node_modules`, generated tarballs, coverage output, credentials or local session data.

## Public API

Exports from `src/lib/index.js` are public. Avoid renaming or removing them without documenting the breaking change and incrementing the major version.
