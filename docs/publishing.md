# Publishing Terlio

This repository is prepared for publishing the unscoped public npm package `terlio` and for hosting the source on GitHub.

## Before the first release

1. Create the GitHub repository.
2. Add the final repository metadata to `package.json` once the owner and URL are known:

```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/OWNER/terlio.git"
  },
  "homepage": "https://github.com/OWNER/terlio#readme",
  "bugs": {
    "url": "https://github.com/OWNER/terlio/issues"
  }
}
```

Do not publish placeholder URLs.

3. Confirm the package name in the public npm registry immediately before release.
4. Enable npm account two-factor authentication.
5. For automated releases, configure the repository and `.github/workflows/publish.yml` as a trusted publisher for the `terlio` package. The workflow uses GitHub OIDC and does not contain a long-lived npm token.

A first manual publish may be needed before a trusted-publisher relationship can be configured, depending on the npm account and package state.

## Verify the release locally

```bash
npm ci
npm run verify
npm run release:check
```

`npm run verify` performs syntax checks, the full test suite and a distribution test. The distribution test:

- creates the actual npm tarball;
- verifies required and forbidden files;
- installs the tarball in a clean temporary project;
- imports the root `terlio` export;
- lists examples through the packaged CLI;
- runs `example:components` from the installed package.

Inspect the package manually when needed:

```bash
npm pack --dry-run
```

## Version and changelog

Update the version and changelog together:

```bash
npm version patch
# or: npm version minor / npm version major
```

Commit the version change, push the tag, and create a GitHub Release for that tag. The publish workflow runs when the release is published.

## Packaged files

The package allowlist is controlled by `package.json#files`. It includes:

- `bin/terlio.js`;
- `src/`;
- `examples/`;
- `docs/`;
- `README.md`, `LICENSE` and `CHANGELOG.md`.

Tests, GitHub configuration, caches, credentials and generated output are not included.

## Examples after registry installation

Consumer projects cannot invoke this repository's npm scripts. The `terlio` executable is therefore the supported registry UX:

```bash
npx terlio list
npx terlio demo:chat
npx terlio example:palette
npx terlio example:components
```

The CLI resolves scripts from the installed package itself, so it works with local, global and `npx` installations.
