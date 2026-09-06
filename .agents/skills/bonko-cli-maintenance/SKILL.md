---
name: bonko-cli-maintenance
description: Maintain Bonko CLI commands, project discovery, installer, runtime build tooling, and release workflows. Use for CLI changes and reliability reviews; use shadcn for Studio components and the template protocol for authoring artwork.
---

# Bonko CLI maintenance

Read `AGENTS.md` and `docs/ARCHITECTURE.md` from the repository root before changing a boundary. Use `CONTRIBUTING.md` for commands and `docs/RELEASING.md` for release gates; do not duplicate their policies here.

- Preserve the pinned `@bonko/template-sdk`. Templates declare its runtime contract separately from the npm package version. Fix templates or upstream SDK defects instead of copying internals or weakening validation.
- Treat a discovered `bonko.json` as a project boundary. Missing or invalid files in that project must not cause parent-project fallback.
- Keep `bonko use` local-only. Verify an installed version before changing the command symlink; do not modify project pins to conceal incompatibility.
- Keep installation staged and activation atomic. Cancellation must stop subprocesses before deleting staging. Recovery must refuse live, foreign-host, unknown, and linked locks. Test that failed upgrades preserve the previous command.
- Build templates with tool-owned dependencies and fixed compiler configuration. Studio development dependencies must not become allowed template imports.
- Keep every runtime engine implementation under TypeScript, and installer/release JavaScript under checked JSDoc. Do not restore handwritten declaration-only substitutes or use suppression directives to pass checks.
- For workflow changes, resolve Action SHAs from their official repositories, preserve all-platform verification before publication, and test tag/lockfile/main ancestry rejection. Running CI or fixing code does not authorize a release tag.
- Add focused behavior tests for changed boundaries. Use temporary directories and synthetic data for installers, Git fixtures, assets and browser checks. Validate the actual packed installation when layout, files or dependencies change.
- Run `npm run verify`, inspect the final diff, and report skipped checks. Use `gh-fix-ci` for remote failures within the user's authorized task.

When touching Studio, apply the installed shadcn skill and relevant React rules. This is a Vite client application: Next.js server-component and routing rules do not apply.
