# Architecture

Bonko CLI is a local authoring tool. It creates independent template directories and uses a pinned shared SDK to build, preview, verify and package them. It does not publish templates to production or require production credentials.

## Code map

| Path               | Responsibility                                                          |
| ------------------ | ----------------------------------------------------------------------- |
| `bin/`             | Minimal Node prerequisite check and executable entry                    |
| `src/main.ts`      | Argument validation and command dispatch                                |
| `src/project.ts`   | Project boundaries, scaffolding and safe build directories              |
| `src/versions.ts`  | Verify and select an already-installed CLI release                      |
| `src/engine/`      | Typed build pipeline, isolated preview servers and browser verification |
| `app/`             | Studio client, shadcn components and phone-frame preview                |
| `scaffolds/`       | Starter template source distributed with the CLI                        |
| `scripts/`         | Checked JavaScript for build, installation and release operations       |
| `tests/`           | Command, filesystem, installer, release-gate and browser behavior tests |
| `docs/PROTOCOL.md` | Template authoring contract                                             |
| `.agents/skills/`  | Repository-scoped authoring and maintenance skills                      |

`dist-cli/`, `studio-dist/` and `release/` are generated and excluded from Git. CLI builds clean the output directory first, so removed source cannot leak into a later release.

## Dependency boundaries

```text
CLI commands → project/engine modules → pinned template SDK
Studio → local preview API → isolated Runtime gateway → template bundle
Installer → verified release archive → staged npm install → atomic command activation
```

The SDK remains the single implementation of protocol validation, package inspection and runtime playback. `src/engine` integrates it with local files and browser tests; it does not duplicate SDK internals.

Runtime dependencies include the template compiler, browser checker, approved React/Motion packages and their type definitions. The installed CLI needs them to compile and verify user templates. Studio-only UI libraries, CSS tooling, linting and formatting belong in `devDependencies`: Studio is distributed prebuilt.

## Project identity and compatibility

A `bonko.json` marker establishes the project boundary. Once found, invalid configuration or a missing manifest is an error in that project; discovery must not silently operate on a parent project.

Projects pin an exact CLI version. `bonko use <version>` changes the installation's command symlink to a verified local release, without downloading packages or changing project configuration. Missing versions must be installed from their published release first. Workspace checkouts cannot change a global installation.

The CLI package version, manifest protocol number, SDK npm release and manifest runtime contract version are separate values. See the protocol for their meanings.

## Build and preview

The builder scans permitted files, enforces file/byte limits, rejects symlinks and unapproved imports, checks types and compiles with fixed options. It does not load author Vite configuration or environment files. A template package includes only declared assets, compiled runtime, reviewable source and attribution.

Studio and Runtime use separate loopback servers. Host/origin checks, random preview tokens and the SDK's sandbox contract constrain access. Build failures remove the old preview; source corrections trigger a fresh preview. A small bounded snapshot cache supports already-mounted previews.

Browser verification checks supplied text/photo/crop, keyboard interaction, static presentation, reduced motion, replay, failure modes and responsive widths. Packaging preserves checked bytes and refuses changed content under an existing template version. Passing automated checks does not replace source, licensing, audio or visual review.

## Installer lifecycle

1. Check Node and npm before downloading or creating installation directories.
2. Acquire an installation lock with local PID/hostname ownership.
3. Download over HTTPS and verify the release SHA-256 checksum.
4. Install locked dependencies into staging with lifecycle scripts disabled.
5. Verify the staged CLI version and move it into `versions/<version>`.
6. Atomically replace the Bonko command symlink after verification.

SIGINT/SIGTERM abort subprocesses and clean staging/locks while keeping the previous command active. `--recover-lock` explicitly recovers a lock owned by a dead local PID; it refuses active, unknown or foreign-host owners. Recovery itself is serialized. A kill during ownership-file creation, an interrupted recovery, or a filesystem failure may still require manual inspection; never remove a lock without checking its owner.

Checksums detect corruption, while publisher authenticity depends on the HTTPS release source and GitHub account controls. The CLI does not claim cryptographically signed provenance.
