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

## Verify generated demonstration photographs

Use DEVELOPMENT.md's **Demonstration photos for creation previews** contract. Require one independently generated, occasion-appropriate photograph for each supported slot, with distinct declared image assets and consecutive `config.previewPhoto1` through `previewPhotoN` references matching `maxPhotos` (default one). Reject finished deliveries containing blank blocks, reused catalog covers, missing files, private user photos or undocumented provenance. Decode and inspect the photographs at their actual frame crops.

After packing, verify every referenced image is present in the ZIP and covered by package integrity metadata, and that all package budgets still pass. The upload host must validate/store these files and use them only for sample preview. Confirm user photos replace demos and demo photos do not increase upload counts or satisfy creation requirements. Report platform integration as unverified if it was not exercised; local packing is not proof of deployed behavior.

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
  - _Fix_: Separate visual completion from host completion. Hold the completed card until both the visual sequence and the full measured audio duration, start offset and validated startup allowance have elapsed on an active-playback clock. Pause and cancel that clock with the lifecycle. The `audio.play()` Promise does not signal playback start or end; follow the audio lifecycle section in [the author skill](../bonko-template-author/SKILL.md).
- **CSS Build Error (`url() is forbidden in CSS`)**:
  - _Cause_: A CSS rule or comment contains `url(...)` or `@import`.
  - _Fix_: Remove `url()` completely. Load images in React/DOM with `runtime.asset("id")` and pass image URLs via `src` attributes.
- **Keyboard Completion Timeout**:
  - _Cause_: The automated test could not find or activate the reveal button using keyboard navigation.
  - _Fix_: Ensure the button is a semantic `<button>`, has `autoFocus`, and its `aria-label` or accessible text exactly matches `"revealButton"` in `test.json`.
- **Horizontal Overflow on 375px**:
  - _Cause_: Fixed widths or unconstrained elements cause horizontal scrollbars.
  - _Fix_: Set `.template-viewport { overflow-x: hidden; }` and ensure card containers use `max-width: 360px; width: 100%; box-sizing: border-box;`.

## Verify full audio playback separately

The 18 protocol checks verify decoding, duration limits and natural completion, but do not prove the last audible sample played. For any template with audio, validate the packaged track in the real host, using host-side media instrumentation or a recorded listening review; never add direct media playback or host DOM access to the sandboxed template.

- **Animation shorter than audio**: Exercise, for example, a 6-second visual sequence with a 9-second track. The complete photo/message must appear at the visual end, remain still and readable, and keep the host running until the track ends. Confirm no premature `complete` or audio stop; an approximately 9-second page wait alone is not proof.
- **Audio shorter than animation / delayed cue**: Verify the longer visual sequence still completes, and that a cue beginning after the opening gesture receives its entire measured duration. Include realistic startup/decode delay in the host review; check the full decay/reverb tail, not just the last note onset.
- **Pause during the final audio hold**: The completion clock must freeze and no stale callback may complete while paused. Resume follows the host's supported behavior; record that the current host stops audio on pause/backgrounding rather than claiming seamless track resume. Skip, mute and reduced motion must still take effect immediately.
- **Failure, disposal and replay**: A muted/unavailable asset must leave a usable result and bounded completion. Unmount during the hold and replay to check cancelled callbacks, one completion per instance and no duplicate audio requests.
- Record the measured delivered duration, cue start, visual end, configured startup allowance and observed host completion/audio end (or the listening result). If no audio listening or host timing review was performed, mark full-audio verification as unverified even when `bonko check` passes.

## Review what automation cannot establish

Use `bonko dev` to inspect what headless tests cannot evaluate:

- **Audible Quality & Sound Balance**: Verify music box / audio melody sounds clear, balanced, and harmonizes with visual transitions.
- **Visual Finish & Emotional Value**: Follow the visual hierarchy in [the author skill](../bonko-template-author/SKILL.md). Inspect the actual cover at thumbnail size and the invitation/final card at 375px, 390px and 430px. Check coherent materials, restrained lighting, distinct hero silhouette, readable text, contained long content and space for the host footer.
- **Cover and opening poster**: Decode the final cover and verify exactly 640 × 800 pixels unless the brief overrides that size, correct spelling and clean edges. Confirm the catalog artwork represents the runtime. For Receiver openings, inspect the separately declared `receiverOpeningPoster`: same still opening, visible tap hint, no private content or captured preview/host controls. Verify `ready` is still and silent and one host gesture reveals without a second click.
- **Layering and photo crops**: Inspect the closed envelope/object for text or photos leaking through layers. Check non-default user photo transforms during entrance/zoom as well as in the final/static view; wrapper animation must not overwrite the image crop. Decorative loops must stop when the final card appears, even if audio is still finishing.
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
