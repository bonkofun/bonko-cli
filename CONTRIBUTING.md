# Contributing

Use `dev` for changes and open a pull request into `main`. Do not commit directly to main. Keep unrelated work intact, use the repository-local Git identity, and do not merge or release without maintainer authorization. See [AGENTS.md](AGENTS.md) for agent-specific rules.

## Setup

Use Node.js >= 22.12.0 and npm. The CI matrix covers Node 22.12 and 24.13 on Ubuntu and macOS.

```sh
npm ci --ignore-scripts
npm run build
node bin/bonko.mjs browser install
npm run verify
```

On Linux, browser checks may also need system libraries:

```sh
npx playwright install --with-deps chromium
```

Read [architecture](docs/ARCHITECTURE.md) before changing dependency boundaries and [the protocol](docs/PROTOCOL.md) before changing template behavior.

## Development commands

| Command                    | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `npm run build`            | Clean and compile the CLI; build Studio assets                 |
| `npm run typecheck`        | Strictly check CLI/engine, Studio and JavaScript tools         |
| `npm run lint`             | Check JavaScript and TypeScript rules, including unused values |
| `npm run format`           | Format maintained code and documentation                       |
| `npm run format:check`     | Verify formatting without changing files                       |
| `npm test`                 | Run all behavior and integration tests                         |
| `npm run test:integration` | Run real Studio and packaged-installation tests                |
| `npm run verify`           | Format check, lint, build, typecheck and complete tests        |
| `npm run release`          | Create local release assets; does not publish                  |

Edit `scripts/install.mjs`, not the generated root `install.sh`. After changing installer source or the package version, run `node scripts/generate-installer.mjs`. Tests also regenerate the default installer; CI rejects uncommitted generated differences.

The formatter and linter exclude vendored skills and build outputs. Third-party skill sources retain their original formatting and license. ESLint 9 is pinned for compatibility with the supported Node 22.12 floor; reevaluate the lint toolchain when raising that floor.

## Code and tests

Use concrete types and validate external data at boundaries. Comments should explain invariants, lifecycle ownership and non-obvious tradeoffs, rather than repeat the code. Keep product labels and commands literal and actionable.

Test observable behavior: malformed projects, incompatible versions, interrupted installs, preserved previous commands, package contents and browser states. Use temporary directories and synthetic fixtures. Do not connect tests to production services or change validators to make fixtures pass.

Production compiler/browser dependencies must remain available after `npm install --omit=dev`. Test the actual archive after changing dependency classification or distribution paths. Do not move TypeScript, React types, Vite or Playwright to dev-only merely because they look like development tools; the installed CLI uses them.

## Pull requests

Explain the concrete problem, resulting behavior and validation performed. Include limitations and skipped checks. Keep documentation in English. Update an existing open `dev → main` PR rather than opening a duplicate. CI must pass before merge; releases have an additional tag and main-ancestry gate.

## Skills

Project skills include `shadcn`, `vercel-react-best-practices`, `gh-fix-ci` and `bonko-cli-maintenance`. `skill-creator` is a built-in authoring tool and does not need a duplicate repository installation. Upstream revisions and licenses are recorded in [skill sources](docs/SKILLS.md). Explicit user authorization and repository scope take precedence over generic workflows in upstream skills.
