<h1 align="center">Bonko CLI</h1>

[![CI](https://github.com/bonkofun/bonko-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/bonkofun/bonko-cli/actions/workflows/ci.yml)
[![Release workflow](https://github.com/bonkofun/bonko-cli/actions/workflows/release.yml/badge.svg)](https://github.com/bonkofun/bonko-cli/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/bonkofun/bonko-cli)](https://github.com/bonkofun/bonko-cli/releases/latest)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-Studio-000000?logo=shadcnui&logoColor=white)](https://ui.shadcn.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

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

Edit text, select a local photo and adjust its crop in Studio. Choose **Apply content and crop**, then verify playback with **Play**, **Pause**, **View message** and **Replay**. Source edits rebuild automatically; a build error stops the old preview until corrected.

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
| `bonko upgrade`                   | Install and select the latest stable CLI release                    |
| `bonko use <version>`             | Select a verified, already-installed CLI release                    |
| `bonko version`                   | Show CLI, SDK and Node versions; also supports `-v` and `--version` |

`new`, `build`, `check`, `pack` and `version` accept `--json`. Failures exit with code 1. Use `check/pack --no-download` to forbid automatic browser downloads. On Linux, install any missing browser system libraries according to Playwright's error message; the CLI does not elevate privileges automatically.

## Upgrade

Run the following from any directory to upgrade the installed CLI to the latest stable release and confirm the selected version:

```sh
bonko upgrade
bonko version
```

`bonko upgrade` takes no version argument. To switch to a specific version already installed on your computer, use `bonko use <version>` instead.

Checks the latest stable GitHub release and upgrades the installation used by the active `bonko` command. It preserves custom installation and command directories, verifies the downloaded archive checksum, and uses the existing staged installer and installation lock. Failed downloads or installation leave the current command active. If the installed version is current or newer, no installation runs.

Requires network access, npm, curl and write access to the installation. System installations may require the same privileges used during installation; the command does not invoke sudo automatically. Workspace checkouts cannot upgrade a global installation. Previous versions remain installed for `bonko use <version>`.

Existing projects retain their `bonko.json` version pin and files, including skills. Upgrade does not migrate projects. If an existing project requests its pinned version, select it with `bonko use <version>`; use the upgraded CLI when creating new projects.

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
  bonko.json          Pinned CLI version
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

Commands also work from project subdirectories. Builds use the CLI's fixed dependencies, not project Vite configuration or environment files. `bonko.json` pins the CLI version. Use `bonko use <version>` to select an installed version, or install the missing release first. Project pins are never silently rewritten. Editor paths refer to the local CLI installation and may need updating when moving a project to another computer; CLI builds resolve dependencies independently.

Templates may import `react`, `react/jsx-runtime`, `react-dom/client`, `motion/react`, `@bonko/template-sdk/runtime-client`, and relative files inside `src/`. Use native DOM/CSS, declared Canvas/WebGL capabilities, and SDK-managed short audio. Every template must support a complete static state, pause, cleanup, reduced motion and keyboard interaction.

Studio uses React, Vite, Tailwind CSS, shadcn/ui, Tabler Icons and a phone frame. Those Studio dependencies are not automatically allowed in templates. See the [template protocol](docs/PROTOCOL.md) for the full contract, including the distinction between SDK package version `0.2.3` and manifest runtime version `0.2.0`.

## Develop with a coding agent

New projects include `bonko-template-author` and `bonko-template-verify` under `.agents/skills/`, plus AGENTS.md and a local protocol reference. Open the generated project directory in your agent and ask:

> Read AGENTS.md. Use bonko-template-author to create a birthday card with a paper reveal, then use bonko-template-verify to check and package it.

Agents that support skill discovery can load these workflows directly; other agents can read the Markdown files. No separate Studio repository or skill installation is needed. The skills guide development and review, while the CLI and SDK enforce checks. These files stay out of template delivery ZIPs.

This behavior requires a CLI release containing the scaffold skills. Upgrading the CLI does not change existing projects. To add guidance to an older project, generate a temporary project with the appropriate CLI version and copy its AGENTS.md, DEVELOPMENT.md and `.agents/skills/` after reviewing compatibility and preserving any existing instructions. Do not rewrite the old project's CLI pin to bypass a version mismatch.

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
