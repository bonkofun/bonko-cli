# Repository instructions

## Branch and pull request workflow

- Make all repository changes on `dev`. Do not edit or commit directly on `main`.
- Before editing, inspect the current branch and working tree. Switch to the existing `dev` branch, or create it from the current `main` if it does not exist. Preserve unrelated work.
- Verify changes, commit on `dev`, and push `dev` to the remote.
- Open a pull request from `dev` into `main`. If an open PR already exists for that branch, update it instead of creating a duplicate.
- Do not merge the PR, push directly to `main`, rewrite shared history, or create/push release tags unless the user explicitly requests that action.
- Use the repository-local Git author identity and focused Conventional Commit messages.
- Keep repository documentation in English.

## Engineering boundaries

- Read `docs/ARCHITECTURE.md` before changing module or dependency boundaries and `docs/PROTOCOL.md` before template changes.
- Keep core code in strict TypeScript and installer/release JavaScript under checked JSDoc. Do not suppress type errors or weaken SDK validators.
- Use `npm run verify` and `git diff --check` before delivery; report skipped checks accurately. Preserve generated installer reproducibility.
- Keep all documentation in English and comments focused on invariants and lifecycle decisions.
- The project skills live in `.agents/skills/`; apply their relevant guidance within the user's authorized scope. Next.js-only rules do not apply to the Vite Studio.
- Update an existing PR's title and body to describe its complete current diff, including behavior and validation.

## Template version compatibility

Follow docs/TEMPLATE_VERSIONING.md for every output, SDK, photo/caption or
configuration change. Stamp the actual packing CLI automatically; the creating
CLI pin is not upload provenance. Keep main-site admission and authoring semantics
in sync and exercise a real generated package against the consumer. Never publish
a breaking contract change as an implicitly compatible patch, edit version
strings to bypass validation, or treat a local commit as a release/deployment.
