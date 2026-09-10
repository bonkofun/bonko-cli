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
| `scaffolds/`       | Starter source and agent guidance distributed with the CLI              |
| `scripts/`         | Checked JavaScript for build, installation and release operations       |
| `tests/`           | Command, filesystem, installer, release-gate and browser behavior tests |
| `docs/PROTOCOL.md` | Template authoring contract                                             |
| `.agents/skills/`  | CLI repository maintenance skills; not generated project skills         |

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

Projects record their originating CLI version. Project discovery accepts the active version and an explicit historical compatibility set in `src/project.ts` (currently 0.1.0–0.1.6). Accepted projects run on the active CLI without rewriting their marker or switching the global command. All manifest, source and SDK validation still applies. Adding historical versions requires reviewing the protocol and template dependencies plus regression verification; future versions and unknown releases are rejected. Exact-version execution remains available. `bonko use <version>` changes the installation's command symlink to a verified local release, without downloading packages or changing project configuration. Missing versions must be installed from their published release first. Workspace checkouts cannot change a global installation.

The CLI package version, manifest protocol number, SDK npm release and manifest runtime contract version are separate values. See the protocol for their meanings.

`src/upgrade.ts` resolves the latest stable GitHub release and checks the active installation and permissions. It invokes the distributed `scripts/upgrade-install.mjs` adapter, which reuses `scripts/install.mjs` with explicit existing prefix/bin paths and the fixed official release URL. The CLI forwards cancellation to the installer. Upgrades retain previous versions and never rewrite project pins. No remote installer script is evaluated.

`src/skills.ts` refreshes the finite set of distributed project guidance from the active CLI. It uses project discovery, rejects non-regular destinations, serializes updates with a project lock, backs up changed originals before replacement, and leaves template files and unrelated skills intact. It performs no network requests.

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

## Studio interaction

Live preview automatically starts the template's own opening flow. Audio is enabled by default, with one audio scope per mounted preview; opening an interactive envelope requires only its own gesture. Browser autoplay restrictions still apply before user interaction. Replay in the preview size toolbar restarts the experience. Studio has no Audio tab or bottom playback controls; authored static and reduced-motion checks remain in the Test tab. Editing uses an authored static view.

The Photo panel accepts a batch of local PNG, JPEG or WebP files (10 MiB per file), bounded by the template's `config.maxPhotos` (default 1, maximum 10). Select a photo to preview and crop it, drag rows to reorder, or remove individual photos. Each photo retains its own framing. Replay supplies the ordered image bytes and `bonkoPhotoCount`/`bonkoPhotoTransformN` configuration to compatible templates. Photos stay in browser memory and are excluded from template packages.
