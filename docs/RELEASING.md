# Releasing Bonko CLI

A local package build is not a publication. Release tags and PR merges require explicit maintainer authorization.

## Prepare a version on dev

1. Update the version with `npm version patch --no-git-tag-version` (choose the appropriate increment).
2. Regenerate `install.sh` with `node scripts/generate-installer.mjs`.
3. Update relevant docs, run `npm run verify`, and inspect `git diff --check`.
4. Commit the package version, shrinkwrap, generated installer and related changes on dev.
5. Push dev, open or update its PR into main, and wait for all checks.
6. Merge only when authorized. Tag the merged, versioned commit on main only when authorized.

For a release already prepared and merged as version X.Y.Z:

```sh
git fetch origin
git tag -a vX.Y.Z origin/main -m "Bonko CLI vX.Y.Z"
git push origin vX.Y.Z
```

Confirm the version at the tagged commit before running these commands. Never reuse an existing published version for changed bytes or move a shared release tag.

## Workflow gates

The Release workflow runs on pushed `v*` tags. It checks exact package/shrinkwrap/tag agreement and confirms HEAD is an ancestor of origin/main. Prerelease tags are not currently supported.

The same reusable verification workflow runs for PRs and releases. All four combinations of Ubuntu/macOS and Node 22.12/24.13 must pass formatting, lint, build, typecheck and tests before the publishing job starts. Only the publishing job receives contents-write permission. The workflow uses the repository GITHUB_TOKEN; it does not publish to npm.

GitHub repository settings must allow Actions and release creation. Configure main branch protection/rulesets to require PR checks; repository instructions alone do not enforce server-side protection.

## Artifacts

`npm run release -- --base-url https://github.com/bonkofun/bonko-cli/releases/download/vX.Y.Z` creates:

- `release/install.sh`, bound to the exact version URL;
- `release/bonko-cli-X.Y.Z.tgz`, including the dependency shrinkwrap and MIT license;
- `release/bonko-cli-X.Y.Z.tgz.sha256`.

The workflow uploads these assets with installation instructions and generated release notes. After publishing, verify all three assets exist and download the installer through the public latest-release URL. If a published asset is wrong, fix it in dev and release a new version; do not overwrite published bytes.

## Local installation and recovery

Use a disposable prefix for release testing:

```sh
sh install.sh --archive /absolute/path/bonko-cli-X.Y.Z.tgz \
  --sha256 REPLACE_WITH_SHA256 --prefix /tmp/bonko-install
/tmp/bonko-install/bin/bonko version
```

Run `bonko upgrade` to install the latest stable release into the active installation. It preserves custom prefix/bin paths and existing project pins, and does not downgrade a newer installation. Older CLI releases without this command must use the shell installer.

Run `bonko use X.Y.Z` to select an already-installed release. To install a missing version, use its release-specific installer URL. Version selection verifies the target before replacing the command and preserves project pins.

SIGINT/SIGTERM clean interrupted installation staging. After a hard kill, download the installer and retry with `sh install.sh --recover-lock` plus the original prefix/options. Recovery refuses a live PID, a different hostname, malformed metadata or symlink locks. Unknown owners and interrupted recovery locks require manual inspection. Old installations may lack owner metadata, so they cannot be automatically recovered.
