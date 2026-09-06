# Repository instructions

## Branch and pull request workflow

- Make all repository changes on `dev`. Do not edit or commit directly on `main`.
- Before editing, inspect the current branch and working tree. Switch to the existing `dev` branch, or create it from the current `main` if it does not exist. Preserve unrelated work.
- Verify changes, commit on `dev`, and push `dev` to the remote.
- Open a pull request from `dev` into `main`. If an open PR already exists for that branch, update it instead of creating a duplicate.
- Do not merge the PR, push directly to `main`, rewrite shared history, or create/push release tags unless the user explicitly requests that action.
- Use the repository-local Git author identity and focused Conventional Commit messages.
- Keep repository documentation in English.
