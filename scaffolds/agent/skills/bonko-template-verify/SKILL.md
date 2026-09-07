---
name: bonko-template-verify
description: Verify, troubleshoot and package a Bonko standalone template in a bonko.json project. Use for failed build or browser checks, runtime lifecycle review, accessibility and visual review, or preparing a .bonko.zip handoff. Not for CLI release or deployment.
---

# Verify a Bonko template

Read [DEVELOPMENT.md](../../../DEVELOPMENT.md), especially checks, lifecycle, asset rules and delivery boundaries. Inspect the requested changes and current source before executing an unfamiliar template. Work from the directory containing `bonko.json`; no Studio checkout is required.

## Review before running

- Check manifest metadata, declared assets/capabilities, real code and media attribution, and the accessible reveal name in `test.json` for interactive templates.
- Confirm supplied text, photo and crop reach both interactive and static presentations. Check cleanup, pause, replay, natural completion and reduced-motion handling against the protocol.
- Look for unsupported imports, remote resources, unsafe text insertion or fabricated SDK interfaces. Fix source and metadata; never weaken the checker, copy SDK internals, or replace the authored static view with a generic fallback.
- Preserve the recorded project CLI version. The active CLI may accept explicitly compatible historical versions. If it reports an unsupported version, use the recorded release or report the exact prerequisite; do not silently rewrite `bonko.json`. Do not change template version merely to evade a packaging conflict.

## Run the actual checks

```sh
bonko build
bonko check --json
```

Build only checks compilation. Browser verification is a separate requirement. Inspect the JSON result and the reports and available screenshots under `.bonko/checks/`. A failed command, missing browser or skipped check is not a pass. If Chromium is missing, use `bonko browser install` when the environment permits downloads; otherwise report the prerequisite. Do not request elevated privileges automatically.

When a check fails, use its diagnostics to identify the source or manifest defect, make a focused correction and rerun the affected command. Avoid tests that merely recognize the checker inputs or hardcode its sample content. After the final change, rerun verification against the actual final bytes.

## Review what automation cannot establish

Use `bonko dev` and inspect the available phone widths, long messages, omitted sender and different photo crops. Review keyboard focus and activation, readable static content, pause/resume, replay, mute, reduced motion and asset-failure behavior. Real-device touch, audible sound quality, visual finish, rights and equivalent Canvas/WebGL photo rendering require separate review; explicitly record any unavailable checks. Do not infer that screenshots prove audio or touch behavior.

## Check cover and opening exports

Apply the size and format budgets in [the author skill](../bonko-template-author/SKILL.md). Inspect actual pixel dimensions and encoded byte sizes, manifest paths, and high-density first paint. Delay runtime loading to inspect the still before it is replaced; check for blurry lettering, aspect-ratio jumps, host controls baked into artwork, and private content. Record any asset above 250 KB and the optimization or justified exception. These are authoring checks, not additional SDK rejection rules.

## Package and hand off

When the requested scope includes delivery and checks pass:

```sh
bonko pack --json
```

Packaging reruns checks and writes `dist/<slug>-<version>.bonko.zip`. Inspect the result and report its actual output path and any reported digest. Do not modify checked source during packaging or overwrite a different package under an existing version. Explain a version conflict and preserve the existing artifact; obtain the developer's version decision if not already authorized.

Summarize changes reviewed, commands and outcomes, manual review completed or skipped, unresolved issues and delivery location. The package still requires authorized platform review. Skills, AGENTS.md and DEVELOPMENT.md are authoring guidance, not runtime files or proof of approval.
