---
name: bonko-template-verify
description: Verify, troubleshoot and package a Bonko standalone template in a bonko.json project. Use for failed build or browser checks, runtime lifecycle review, accessibility and visual review, or preparing a .bonko.zip handoff. Not for CLI release or deployment.
---

# Verify a Bonko template

Read [DEVELOPMENT.md](../../../DEVELOPMENT.md), especially checks, lifecycle, asset rules and delivery boundaries. Inspect the requested changes and current source before executing an unfamiliar template. Work from the directory containing `bonko.json`; no Studio checkout is required.

## Review before running

- **Manifest Metadata & Versioning**: Manifest `version` must strictly follow the major-version regex `/^[1-9]\d*\.0$/` (e.g., `1.0`, `2.0`, `3.0`). Fractional updates (like `1.1` or `2.5`) will be rejected by schema validation.
- **Capabilities & Declared Assets**: Ensure all used assets (`cover`, `bg`, `audio`, cutouts) and capabilities (`audio`, `canvas`) are declared in `manifest.json`.
- **Accessible Name in `test.json`**: For interactive templates, `test.json` must declare `"revealButton": "<Accessible Name>"`, which must exactly match the reveal button's `aria-label` or accessible text name.
- **CSS Sandbox Compliance**: Verify that no CSS file contains `@import` or `url(...)`—the compiler rejects these even inside CSS comments. All images must be resolved via `runtime.asset("id")` or `asset("id")`.
- **Dual-Path Completeness**: Confirm supplied text, photo, and transform matrix reach both interactive (`render`) and static (`renderStatic`) presentations. Verify `renderStatic` commits immediately without waiting for timers or animations.

## Run the actual checks

Execute the automated build and browser verification suite:

```sh
bonko build
bonko check --json
```

`bonko build` only verifies TypeScript and asset bundling. `bonko check --json` launches headless Chromium and runs the **18 automated protocol checks**:

| Automated Check                  | What It Validates                                                                                                |
| :------------------------------- | :--------------------------------------------------------------------------------------------------------------- |
| `manifest`                       | Protocol 3 schema, valid capabilities (`audio`, `canvas`), version regex `/^[1-9]\d*\.0$/`.                      |
| `package-integrity`              | Declared assets exist on disk and match integrity checksums.                                                     |
| `source-policy`                  | Strict sandbox rules: no unauthorized imports, no dynamic `eval`, no `url()` in CSS.                             |
| `typescript`                     | Clean compilation with zero type errors.                                                                         |
| `actual-media-decode`            | All images (WebP/PNG) decode successfully; audio files decode and are strictly <= 10.0s.                         |
| `keyboard-natural-completion`    | Navigates via Tab + Enter to `test.json`'s reveal button, completes natural playback and transitions to `ended`. |
| `escaped-user-content`           | Verifies user text containing HTML entities (`<script>`, `&amp;`) is safely escaped.                             |
| `local-photo-crop`               | User photo and crop matrix are applied to the `<img>` element correctly.                                         |
| `authored-static-preview`        | `renderStatic` commits the final completed card instantaneously and motionless.                                  |
| `preserved-natural-final-frame`  | The live completed frame remains stable after `runtime.complete()` without flashing or unmounting.               |
| `long-text-empty-sender`         | Layout adapts gracefully to 160-character messages and omitted sender name.                                      |
| `responsive`                     | Renders across 375px, 390px, 430px, and 1440px viewports with zero horizontal overflow.                          |
| `static-replay-cleanup`          | Template replays 3 times cleanly without timer retention, memory leaks, or duplicate audio.                      |
| `authored-static-skip`           | Fast skips advance directly to the static completed state.                                                       |
| `authored-static-reduced-motion` | Reduced-motion mode renders the static completed card without running animations.                                |
| `reduced-motion`                 | Motion and CSS respect `prefers-reduced-motion`.                                                                 |
| `asset-error-fallback`           | Graceful fallback when an image or audio asset fails to load.                                                    |
| `player-error-deadline`          | Player timeout safeguards against hanging templates.                                                             |

If Chromium is missing, run `bonko browser install`. Inspect the JSON output and screenshots under `.bonko/checks/`.

## Common failure modes & troubleshooting

- **Audio Cuts Off Prematurely**:
  - _Cause_: `runtime.complete()` was called before the audio finished playing. When `runtime.complete()` is called, `AudioScope.stop()` immediately cuts audio.
  - _Fix_: Match the completion timer delay to the full audio duration: `setTimeout(() => runtime.complete(), audioDurationMs)`.
- **CSS Build Error (`url() is forbidden in CSS`)**:
  - _Cause_: A CSS rule or comment contains `url(...)` or `@import`.
  - _Fix_: Remove `url()` completely. Load images in React/DOM with `runtime.asset("id")` and pass image URLs via `src` attributes.
- **Keyboard Completion Timeout**:
  - _Cause_: The automated test could not find or activate the reveal button using keyboard navigation.
  - _Fix_: Ensure the button is a semantic `<button>`, has `autoFocus`, and its `aria-label` or accessible text exactly matches `"revealButton"` in `test.json`.
- **Horizontal Overflow on 375px**:
  - _Cause_: Fixed widths or unconstrained elements cause horizontal scrollbars.
  - _Fix_: Set `.template-viewport { overflow-x: hidden; }` and ensure card containers use `max-width: 360px; width: 100%; box-sizing: border-box;`.

## Review what automation cannot establish

Use `bonko dev` to inspect what headless tests cannot evaluate:

- **Audible Quality & Sound Balance**: Verify music box / audio melody sounds clear, balanced, and harmonizes with visual transitions.
- **Visual Finish & Emotional Value**: Follow the visual hierarchy in [the author skill](../bonko-template-author/SKILL.md) to ensure the hero element and background feel luxurious and commercially appealing, not flat or placeholder-like.
- **Touch & Gesture Smoothness**: Test tap response and card unfolding fluidity.

## Package and hand off

When all checks pass and visual/audio review is verified:

```sh
bonko pack --json
```

Packaging reruns all 18 checks and generates `dist/<slug>-<version>.bonko.zip`.

- **Handling Version Conflicts (`VERSION_CONFLICT`)**:
  `bonko pack` will reject packaging if `dist/<slug>-<version>.bonko.zip` already exists. When delivering an updated package, bump the major version in `manifest.json` (`"1.0"` → `"2.0"` → `"3.0"`).
- **Package Inspection**: Verify the zip file size (must be well below the 10 MB platform limit; aim for < 1.5 MB with optimized WebP and compressed MP3).
- **Delivery Summary**: Report the final `.bonko.zip` path, asset digest, verified checks, and file size.
