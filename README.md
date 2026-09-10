<div align="center">
  <h1 align="center">Bonko CLI</h1>

[![CI](https://github.com/bonkofun/bonko-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/bonkofun/bonko-cli/actions/workflows/ci.yml)
[![Release workflow](https://github.com/bonkofun/bonko-cli/actions/workflows/release.yml/badge.svg)](https://github.com/bonkofun/bonko-cli/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/bonkofun/bonko-cli)](https://github.com/bonkofun/bonko-cli/releases/latest)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-Studio-000000?logo=shadcnui&logoColor=white)](https://ui.shadcn.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
</div>

Create, preview, build, check and package standalone Bonko templates. Install the CLI once using your existing Node.js installation; each template works without its own dependency installation or a Studio checkout.

## Install

Requires **Node.js >= 22.12.0**, working **npm**, and **curl** for downloads. The shell installer supports macOS and Linux; Windows installation is not verified. Chromium is downloaded on the first browser check if needed.

Install the latest published release:

```sh
curl -fsSL https://github.com/bonkofun/bonko-cli/releases/latest/download/install.sh | sh
```

To install a specific published version:

```sh
curl -fsSL https://github.com/bonkofun/bonko-cli/releases/download/v0.1.2/install.sh | sh
```

The installer checks Node and npm first, stops with an actionable error if either is missing or incompatible, and does not install Node automatically. It verifies the package SHA-256 checksum and installs pinned dependencies with npm lifecycle scripts disabled.

The default location is `~/.bonko`, with the command at `~/.bonko/bin/bonko`. Follow the printed PATH instructions if necessary. For a system-wide installation, use `| sudo sh` instead of `| sh`; Node and npm must also be available on sudo's PATH. Root installs use `/usr/local/share/bonko` and `/usr/local/bin/bonko`.

## Use

```sh
bonko new birthday-card
cd birthday-card
bonko dev
```

Edit text, select a local photo and adjust its crop in Studio. Changes automatically update the complete authored card after a brief 100 ms input debounce; no Apply or View message click is needed. The last complete card stays visible while the next preview loads, avoiding blank or generic-fallback flashes during repeated crop adjustments. Editing during playback switches to the complete card. Choose **Replay**, then **Play** to test the animation again; **Pause** and **View message** remain available for playback testing. Source edits rebuild automatically; a build error stops the old preview until corrected.

Studio uses a viewport-fitted workbench with Personal, Photo, Config, and Test tabs (plus Audio for templates that declare it). Desktop controls and preview fit in one screen; short and mobile windows keep overflow contained inside the selected settings panel without a page scrollbar. The footer explains that code changes automatically update the preview. A fullscreen button expands the preview without restarting playback; use the exit button or Escape to return. The Size slider scales the phone from 50–100% of its available space while keeping the template viewport at 390 CSS pixels. A single borderless Tabler sun/moon button beside Local workspace toggles Light/Dark themes and persists the selection locally. The photo picker accepts multiple local photos up to the configured limit. Each row has a description (up to 80 characters), framing selection, removal, and keyboard-friendly move controls; dragging also reorders the photos. Descriptions and crops follow their photos into replay. Local uploads and descriptions stay in memory and are never added to the package. The Audio tab reflects declared template audio and shares the runtime mute control; it does not upload custom sound.

| Command                           | Purpose                                                             |
| --------------------------------- | ------------------------------------------------------------------- |
| `bonko new <name>`                | Create a standalone project without overwriting existing files      |
| `bonko dev`                       | Start Studio and open the browser                                   |
| `bonko dev --port 4175 --no-open` | Choose a port without opening the browser                           |
| `bonko build`                     | Compile runtime files without browser checks or a delivery ZIP      |
| `bonko check`                     | Build and run the full Chromium checks                              |
| `bonko pack`                      | Run checks again and create a `.bonko.zip` delivery package         |
| `bonko browser install`           | Download Chromium ahead of time                                     |
| `bonko help [command]`            | Show help; also supports `-h` and `--help`                          |
| `bonko skills update [--json]`    | Refresh existing project skills and guidance with backups           |
| `bonko upgrade`                   | Install and select the latest stable CLI release                    |
| `bonko use <version>`             | Select a verified, already-installed CLI release                    |
| `bonko version`                   | Show CLI, SDK and Node versions; also supports `-v` and `--version` |

`new`, `build`, `check`, `pack` and `version` accept `--json`. Failures exit with code 1. Use `check/pack --no-download` to forbid automatic browser downloads. On Linux, install any missing browser system libraries according to Playwright's error message; the CLI does not elevate privileges automatically.

The **Config** tab reads and saves `manifest.json`: template name, description, author name, tags, photo count (1–10), Free/Premium access, and a suggested USD price. Saving preserves other manifest fields and uses revision checks to reject stale edits. **Reload from file** discards unsaved form changes and loads external edits. `tsconfig.json` remains compiler configuration and is not modified.

Suggested pricing is stored as `config.suggestedPriceCents` (integer cents) and `config.suggestedPriceCurrency` (`USD`). It is authoring metadata for platform review, not an active payment price, and is omitted from runtime initialization. Existing authored `previewPhotoN` / `previewCaptionN` entries must match a changed photo count; save errors identify missing or mismatched entries rather than deleting existing demo metadata.

## Upgrade

Run the following from any directory to upgrade the installed CLI to the latest stable release and confirm the selected version:

```sh
bonko upgrade
bonko version
```

`bonko upgrade` takes no version argument. To switch to a specific version already installed on your computer, use `bonko use <version>` instead.

Checks the latest stable GitHub release and upgrades the installation used by the active `bonko` command. It preserves custom installation and command directories, verifies the downloaded archive checksum, and uses the existing staged installer and installation lock. Failed downloads or installation leave the current command active. If the installed version is current or newer, no installation runs.

Requires network access, npm, curl and write access to the installation. System installations may require the same privileges used during installation; the command does not invoke sudo automatically. Workspace checkouts cannot upgrade a global installation. Previous versions remain installed for `bonko use <version>`.

Existing projects retain their `bonko.json` creation-version record and files. Use `bonko skills update` to explicitly refresh their bundled guidance after upgrading. After upgrading, run `bonko dev` in the existing project. `cliVersion` is metadata, not an execution pin: a different CLI version does not block dev/build/check/pack. Compatibility is determined by the supported project `schemaVersion` and template manifest/SDK validation, not a CLI version allowlist. Invalid configuration and unsupported template protocols still fail validation. Use `bonko use <version>` when you explicitly want an already-installed version.

### Preview port already in use

If port 4173 is occupied, `bonko dev` reports the existing address and an alternate command such as `bonko dev --port 4174`. If the listener is your existing Studio, keep using its browser page. Where `lsof` is available, the error includes the listening PID and a `kill <PID>` command to run manually after confirming it is safe to stop; otherwise it shows the listener lookup command. Bonko never kills the process automatically. After stopping it, retry the original command. Another occupied port produces the same guidance.

### Upgrading older CLI versions

If `bonko upgrade` reports an unknown command, your CLI predates this feature. Once a release containing it is published, rerun the latest-release installer:

```sh
curl -fsSL https://github.com/bonkofun/bonko-cli/releases/latest/download/install.sh | sh
bonko version
```

Use the same installation options as before if you customized the prefix or command directory. For a system-wide installation, use the system-wide installer instructions in [Install](#install). Subsequent updates can use `bonko upgrade`.

## Template files and components

```text
birthday-card/
  bonko.json          Project schema and creating CLI version
  manifest.json       Template metadata, configuration and asset declarations
  src/main.tsx        Template entry and custom components
  assets/             Declared images and short audio
  test.json           Keyboard reveal button name
  LICENSE.md          Code and asset attribution
  AGENTS.md           Coding agent entry and workflow selection
  .agents/skills/     Bundled template authoring and verification skills
  DEVELOPMENT.md      Full protocol and authoring guide
  tsconfig.json       Editor type resolution
  .bonko/build/       Build output, grouped by digest
  .bonko/checks/      Reports and screenshots
  dist/              Verified delivery packages
```

Commands also work from project subdirectories. Builds use the CLI's fixed dependencies, not project Vite configuration or environment files. `bonko.json` records the creating CLI version without restricting the active CLI to that version. For exact-version execution, use `bonko use <version>` to select an installed version, or install the missing release first. Recorded versions are never silently rewritten. Editor paths refer to the local CLI installation and may need updating when moving a project to another computer; CLI builds resolve dependencies independently.

Templates may import `react`, `react/jsx-runtime`, `react-dom/client`, `motion/react`, `@bonko/template-sdk/runtime-client`, and relative files inside `src/`. Use native DOM/CSS, declared Canvas/WebGL capabilities, and SDK-managed short audio. Every template must support a complete static state, pause, cleanup, reduced motion and keyboard interaction.

Studio uses React, Vite, Tailwind CSS, shadcn/ui, Tabler Icons and a phone frame. Those Studio dependencies are not automatically allowed in templates. See the [template protocol](docs/PROTOCOL.md) for the full contract, including the distinction between SDK package version `0.2.3` and manifest runtime version `0.2.0`.

## Develop with a coding agent

New projects include `bonko-template-author` and `bonko-template-verify` under `.agents/skills/`, plus AGENTS.md and a local protocol reference. Open the generated project directory in your agent and ask:

> Read AGENTS.md. Use bonko-template-author to create a birthday card with a paper reveal, then use bonko-template-verify to check and package it.

Agents that support skill discovery can load these workflows directly; other agents can read the Markdown files. No separate Studio repository or skill installation is needed. The skills guide development and review, while the CLI and SDK enforce checks. These files stay out of template delivery ZIPs.

To refresh an existing template project, run:

```sh
bonko upgrade
cd path/to/template
bonko skills update
```

`skills update` copies guidance from the **active installed CLI**; it does not fetch remote files. Run it in a project or any of its subdirectories. It updates only `AGENTS.md`, `DEVELOPMENT.md`, and the bundled `bonko-template-author` / `bonko-template-verify` skills. Before replacement, changed originals are backed up under `.bonko/skills-backups/<id>/`, with an `update.json` plan. Review the backup to reapply any custom instructions. Unrelated skills, template code, assets, manifest and `bonko.json` are preserved. Repeating the command without changes is a no-op. Symlink targets are rejected. Use `--json` for updated paths, CLI version and backup location. A workshop containing multiple projects must be updated one project at a time.

## Develop and verify the CLI

```sh
npm ci --ignore-scripts
npm run build
node bin/bonko.mjs browser install
npm run verify
```

Use `node bin/bonko.mjs` to run the workspace CLI. Tests include real browser checks and installation of the packaged release. CI verifies Linux and macOS on the configured Node versions.

## Build a release

```sh
npm run release
```

Local packaging produces `release/install.sh`, `release/bonko-cli-<version>.tgz`, and its `.sha256` file. It does not upload files or publish to npm. For a configured download host, pass `-- --base-url https://example.com/releases/v0.1.2`; the installer also accepts `--base-url` or `BONKO_RELEASE_BASE_URL`.

Develop on **dev** and submit a PR into **main**. Releases require a matching stable tag on a commit already merged to main, then all four Linux/macOS and Node verification jobs must pass before assets can be published. See [Contributing](CONTRIBUTING.md) for development and [Releasing](docs/RELEASING.md) for the exact version, tag and installation-recovery procedures.

Template ZIPs still require platform review. Automated checks do not replace asset licensing, real-device touch, audio or visual review.

More details: [Architecture](docs/ARCHITECTURE.md), [project skills](docs/SKILLS.md), and [security reporting](SECURITY.md).

## License

Bonko CLI is released under the [MIT License](LICENSE). Third-party dependencies and user-supplied assets retain their own licenses. See [source provenance](PROVENANCE.md).

The Audio tab remembers the sound preference through static editing and Replay. Enable sound changes this preference immediately; it does not audition a clip in static mode. Click Replay, then Play, then trigger the template interaction to hear its cues. Play applies the preference within the host gesture, while static/reduced-motion presentations remain silent.
