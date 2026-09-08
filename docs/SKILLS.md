# Project skills

Skills are development guidance, not executable template code or substitutes for checks.

## Generated template projects

`bonko new` copies two maintained English skills from `scaffolds/agent/skills/` into the new project's `.agents/skills/`:

- `bonko-template-author`: implement artwork, content, assets and runtime interactions, including generated demonstration photographs declared for packaging.
- `bonko-template-verify`: diagnose failures, review lifecycle and accessibility, and inspect demonstration-photo references and ZIP contents before delivery.

The generated AGENTS.md routes agents to those workflows. Each skill reads the generated DEVELOPMENT.md, copied from docs/PROTOCOL.md, so developers need neither this repository nor the former Studio repository. Relative links in scaffold guidance target the generated project layout. Keep detailed protocol rules in the shared protocol instead of duplicating them in skills.

These scaffold resources ship in the CLI release archive and are tested through a real packaged installation. They are excluded from template delivery ZIPs. Existing projects are never overwritten; see the README for adopting guidance in an older project. Skill discovery depends on the coding agent; agents without discovery can read AGENTS.md and the skill files directly.

## CLI maintainer skills

The repository's own `.agents/skills/` contains the skills below. These are excluded from the CLI release and must not be copied into generated templates.

| Skill                         | Source                                                                                                                                            | Pinned revision                            | License                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------- |
| `shadcn`                      | [shadcn-ui/ui](https://github.com/shadcn-ui/ui/tree/7c9eaba1c0a6404c990c144a654792e3313c650d/skills/shadcn)                                       | `7c9eaba1c0a6404c990c144a654792e3313c650d` | MIT                     |
| `vercel-react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/react-best-practices) | `063bee94c3f4df8453406c830b0a7df0f2860278` | MIT                     |
| `gh-fix-ci`                   | [openai/skills](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/gh-fix-ci)                         | `49f948faa9258a0c61caceaf225e179651397431` | See bundled LICENSE.txt |
| `bonko-cli-maintenance`       | Maintained in this repository                                                                                                                     | Versioned with Git                         | MIT                     |

Use shadcn for Studio components, relevant React rules for the Vite client, gh-fix-ci for failed GitHub checks, and the Bonko maintenance skill for CLI/installer/release work. Next.js-only guidance does not apply to this repository.

Skill Creator is already supplied by Codex. Use it to update the local maintenance skill; no duplicate installation is needed. Skills are optional for human contributors: every required build, test and release command is documented outside skills.

External skills were installed using the skill-installer helper with explicit source revisions and a project-local destination. Keep upstream files unchanged except license additions. To update, inspect upstream changes, replace the relevant directory using the installer, update this source record, and review through dev → PR. Never silently pull moving upstream content during CI or package installation.
