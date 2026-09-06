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

These download URLs become available after the first successful tag release. To install a specific version, replace `v0.1.0` below with its release tag:

```sh
curl -fsSL https://github.com/bonkofun/bonko-cli/releases/download/v0.1.0/install.sh | sh
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

| Command | Purpose |
|---|---|
| `bonko new <name>` | Create a standalone project without overwriting existing files |
| `bonko dev` | Start Studio and open the browser |
| `bonko dev --port 4175 --no-open` | Choose a port without opening the browser |
| `bonko build` | Compile runtime files without browser checks or a delivery ZIP |
| `bonko check` | Build and run the full Chromium checks |
| `bonko pack` | Run checks again and create a `.bonko.zip` delivery package |
| `bonko browser install` | Download Chromium ahead of time |
| `bonko help [command]` | Show help; also supports `-h` and `--help` |
| `bonko version` | Show CLI, SDK and Node versions; also supports `-v` and `--version` |

`new`, `build`, `check`, `pack` and `version` accept `--json`. Failures exit with code 1. Use `check/pack --no-download` to forbid automatic browser downloads. On Linux, install any missing browser system libraries according to Playwright's error message; the CLI does not elevate privileges automatically.

## Template files and components

```text
birthday-card/
  bonko.json          Pinned CLI version
  manifest.json       Template metadata, configuration and asset declarations
  src/main.tsx        Template entry and custom components
  assets/             Declared images and short audio
  test.json           Keyboard reveal button name
  LICENSE.md          Code and asset attribution
  DEVELOPMENT.md      Full protocol and authoring guide
  tsconfig.json       Editor type resolution
  .bonko/build/       Build output, grouped by digest
  .bonko/checks/      Reports and screenshots
  dist/              Verified delivery packages
```

Commands also work from project subdirectories. Builds use the CLI's fixed dependencies, not project Vite configuration or environment files. `bonko.json` pins the CLI version; install that version if it differs. Editor paths refer to the local CLI installation and may need updating when moving a project to another computer; CLI builds resolve dependencies independently.

Templates may import `react`, `react/jsx-runtime`, `react-dom/client`, `motion/react`, `@bonko/template-sdk/runtime-client`, and relative files inside `src/`. Use native DOM/CSS, declared Canvas/WebGL capabilities, and SDK-managed short audio. Every template must support a complete static state, pause, cleanup, reduced motion and keyboard interaction.

Studio uses React, Vite, Tailwind CSS, shadcn/ui, Tabler Icons and a phone frame. Those Studio dependencies are not automatically allowed in templates. See the [template protocol](docs/PROTOCOL.md) for the full contract, including the distinction between SDK package version `0.2.3` and manifest runtime version `0.2.0`.

## Develop and verify the CLI

```sh
npm ci --ignore-scripts
npm run build
npm run typecheck
node bin/bonko.mjs browser install
npm test
```

Use `node bin/bonko.mjs` to run the workspace CLI. Tests include real browser checks and installation of the packaged release. CI verifies Linux and macOS on the configured Node versions.

## Build a release

```sh
npm run release
```

Local packaging produces `release/install.sh`, `release/bonko-cli-<version>.tgz`, and its `.sha256` file. It does not upload files or publish to npm. For a configured download host, pass `-- --base-url https://example.com/releases/v0.1.0`; the installer also accepts `--base-url` or `BONKO_RELEASE_BASE_URL`.

To publish on GitHub, update the package version, shrinkwrap and generated installer, commit them, then push a matching tag. For example, when releasing the next patch:

```sh
npm version patch --no-git-tag-version
node scripts/generate-installer.mjs
# Review the version changes, run the checks above, and commit them.
git add package.json npm-shrinkwrap.json install.sh
git commit -m "chore(release): prepare next patch"
git tag -a "v$(node -p 'require("./package.json").version')" -m "Bonko CLI release"
git push origin HEAD
git push origin "v$(node -p 'require("./package.json").version')"
```

For the first release, keep the current package version and tag its committed state as `v0.1.0`. The [Release workflow](.github/workflows/release.yml) runs on pushed `v*` tags, requires a stable `vX.Y.Z` matching the package and shrinkwrap, builds and tests the CLI, then publishes the three assets with installation instructions and generated release notes. Each installer embeds its own version-specific GitHub download URL. Existing releases are not overwritten; use a new version for changed bytes. Repository Actions must be enabled and permitted to create releases using `GITHUB_TOKEN`; no npm publishing token is needed.

For a local installation test, use the digest from the generated checksum file:

```sh
sh install.sh --archive /absolute/path/bonko-cli-0.1.0.tgz \
  --sha256 <64-character-sha256> --prefix /tmp/bonko-install
/tmp/bonko-install/bin/bonko help
```

Template ZIPs still require platform review. Automated checks do not replace asset licensing, real-device touch, audio or visual review.

## License

Bonko CLI is released under the [MIT License](LICENSE). Third-party dependencies and user-supplied assets retain their own licenses. See [source provenance](PROVENANCE.md).
