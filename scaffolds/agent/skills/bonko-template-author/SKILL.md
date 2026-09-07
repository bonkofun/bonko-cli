---
name: bonko-template-author
description: Create or refine a Bonko standalone template in a bonko.json project, including artwork, layout, assets, React or DOM code, Motion interactions and runtime lifecycle. Use for template development, not CLI maintenance or the Studio application UI.
---

# Author a Bonko template

Read the project's [DEVELOPMENT.md](../../../DEVELOPMENT.md), then inspect `manifest.json`, `src/main.tsx`, `test.json` and `LICENSE.md`. Resolve commands and project files from the directory containing `bonko.json`. The local protocol is the detailed contract; do not substitute remembered SDK APIs or depend on another repository.

## Develop from the brief

1. Identify the occasion, intended visual treatment, final message and reveal interaction from the developer's request and supplied references. Ask only when a missing decision blocks useful work; otherwise state reasonable assumptions and implement them. Do not impose one aesthetic on every template.
2. Inspect existing components and assets. Build the final readable composition first using the supplied recipient, message, optional sender and one photo with its transform. Test long text, an omitted sender and different crops; never hardcode the sample content into the artwork.
3. Add an interaction only when appropriate to the brief. Use a semantic button with a keyboard alternative and an accessible name. For interactive templates, update `templateType` and the matching `test.json` reveal button. Keep a direct path to the complete message.
4. Use supported imports listed in DEVELOPMENT.md. Reuse the generated SDK connection and lifecycle patterns. Add focused modules inside `src/` when useful; do not install a project framework or copy Studio components.
5. Declare actual assets and capabilities in the manifest. Resolve asset IDs through the SDK, use SDK-managed audio, and record sources and rights in LICENSE.md. Use provided or authorized assets; report missing rights or unfinished artwork instead of inventing attribution.

## Export cover and opening artwork

Keep the catalog cover and the full-screen Receiver opening as separate assets. These are authoring budgets, not SDK validation limits; preserve the template's composition and document justified exceptions.

| Asset               | Recommended image dimensions                                                                                      | Format | Target encoded size |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ | ------------------- |
| Catalog cover       | 600 × 900 px when the catalog uses 2:3; otherwise match its actual aspect ratio                                   | WebP   | 50–100 KB           |
| Full-screen opening | 1170 px wide, with height proportional to the authored scene; 1170 × 2172 px is an example, not a universal ratio | WebP   | 100–180 KB          |

- Export full-screen openings at 3× density from the actual rendered artwork: a 390 CSS-pixel viewport becomes 1170 image pixels. Use up to 1290 px width for a 430 CSS-pixel target; avoid unnecessary 2000–3000 px wide exports.
- Render text and CSS/vector artwork at the target density. Never enlarge a previous 1× screenshot to simulate a high-resolution export.
- Start WebP quality at 85–90, inspect small text, thin lines, and gradients, and increase only when needed. Quality 94 is appropriate when it preserves visible lettering detail within the size budget. Check encoded bytes, not dimensions alone; re-optimize assets over 250 KB.
- Export only the authored template artwork after fonts and assets settle. Exclude browser/device chrome, cursor, Studio controls, Report, sound, Replay, and host branding. Opening artwork must not reveal a real recipient's name, photo, or private message.
- Declare the actual optimized asset path in manifest.json and retain its logical asset ID. Keep existing published packages immutable; do not overwrite a released version to replace its image.
- Compare the initial opening image against the live template at high pixel density and with runtime loading delayed. The loading still should be sharp immediately, without a low-resolution-to-sharp jump or a mismatched composition.

## Preserve playback behavior

- Implement `render`, `renderStatic` and `dispose` according to the local protocol. Do not recreate roots or restart playback on every host update.
- Keep the static presentation complete, immediate and independent of audio, motion or a required gesture. Confirm asynchronous/React content is committed before reporting static readiness.
- Respect running, waiting, paused and ended states. Report genuine transitions, complete natural playback, and clean up timers, listeners, roots and graphics resources. Verify replay starts a fresh instance.
- Use Motion for animation when needed. Reduced motion must have a readable static result. Sound is optional to comprehension and obeys host mute/pause behavior.
- Render user text as text. Do not access the network, accounts, cookies, parent page or production services. Do not change validators, runtime contract versions or dependency pins to pass a check.

## Iterate and deliver

Run `bonko dev` for visual iteration and `bonko build` after source changes. Review the phone preview with supplied content, different photo crops and narrow widths. Then follow [bonko-template-verify](../bonko-template-verify/SKILL.md) for checks and packaging. Explain the implemented behavior, verified results and remaining manual review. Do not claim production publication or asset approval from CLI success.
