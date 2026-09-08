---
name: bonko-template-author
description: Create or refine a Bonko standalone template in a bonko.json project, including high-emotion celebratory artwork, layered visual composition, audio choreography, React or DOM code, Motion interactions and runtime lifecycle. Use for template development, not CLI maintenance or the Studio application UI.
---

# Author a Bonko template

Read the project's [DEVELOPMENT.md](../../../DEVELOPMENT.md), then inspect `manifest.json`, `src/main.tsx`, `test.json` and `LICENSE.md`. Resolve commands and project files from the directory containing `bonko.json`. The local protocol is the detailed contract; do not substitute remembered SDK APIs or depend on another repository.

## Develop from the brief

1. **Occasion & Emotional Resonance**: Bonko templates are commercial gifting and celebration products. Users preview templates before purchasing; the opening scene must convey high emotional value, exquisite craftsmanship, and instant appeal. Avoid flat, cartoonish 2D vector clip-art or rudimentary CSS placeholder shapes for primary celebratory focal points (such as cakes, bouquets, gift boxes, or jewelry).
2. **Build the readable composition first**: Inspect existing components and assets. Build the completed readable card first using supplied recipient, message, optional sender, and the supported photo set with each supplied transform matrix. Declare `maxPhotos` to match the actual runtime capacity (default one, up to ten); do not advertise slots the animation never displays. Test long text (up to 160 chars), omitted sender, and different photo crops; never hardcode sample content into the artwork.
3. **Add purposeful interaction**: For interactive templates, use a semantic `<button>` with a keyboard alternative (`autoFocus`, Tab + Enter) and an accessible name (`aria-label`) that matches the `revealButton` declared in `test.json`. Keep a direct, natural path to the complete message.
4. **Use supported imports and SDK patterns**: Rely on supported imports listed in DEVELOPMENT.md (`react`, `react-dom/client`, `motion/react`). Reuse the generated SDK connection and lifecycle patterns. Add focused modules inside `src/` when useful (e.g. particle canvas confetti); do not install external UI component libraries or copy Studio components.
5. **Declare actual assets & record provenance**: Declare all assets and capabilities (`audio`, `canvas`) in `manifest.json`. Resolve asset IDs exclusively through the SDK, use SDK-managed audio, and record all media sources and licenses in `LICENSE.md`.

## High-emotion visual hierarchy & multi-layer composition

To achieve the exquisite visual finish expected of premium greeting templates, organize the scene into a structured 5-layer presentation:

1. **Atmospheric Background Artwork (`assets/bg.webp`)**: Use a dedicated high-resolution vertical background asset (e.g., deep midnight velvet, soft bokeh lights, or golden stardust) loaded via `runtime.asset("bg")`. Apply a soft dark radial gradient overlay to ensure text contrast while preserving depth.
2. **Ambient Lighting & Halos**: Position soft radial glow elements (`filter: blur(25px-40px)`) behind the hero element to create dimensional backlight.
3. **Hero Focal Cutout Asset (`assets/<focal>.webp`)**: Feature an ornate, high-fidelity 3D subject (such as a 3-tier baroque gold-filigree cake with sugar flowers, or an embossed ribbon-tied gift box) with a clean alpha channel. Crop tightly to bounding box so it renders razor-sharp on Retina screens without fuzzy margins.
4. **Organic Micro-Dynamics**: Elevate the still hero element with subtle motion:
   - Gentle vertical floating breathing animation (`translateY(0px)` → `translateY(-8px)` over 3–4 seconds).
   - Warm candlelight flicker or shimmer (`drop-shadow` and scale pulsing).
   - Grounded pedestal contact shadow beneath the object (`radial-gradient(ellipse, ...)`).
   - Keep Receiver `ready`, static, reduced-motion and completed presentations still. Begin decorative loops only during authorized playback, pause them with the host and stop them when the visual sequence finishes.
5. **Radiant Call-to-Action**: Accompany the hero with an inviting, glowing button (e.g. `Open Birthday Card ✨`) styled with metallic gradients and soft box-shadow halos.

## Art direction learned from the keepsake redesign

Use these composition decisions across occasions; the burgundy, antique gold and moonlit green Halloween palette is an example, not a required theme.

- **One material story**: Choose a focal object, a small coherent palette and a lighting direction. Match its tactile materials across the invitation and final card: velvet/leather with fine metallic tooling worked for the keepsake; choose materials appropriate to the brief. Reuse strong existing artwork when it already fits. Use image generation for new raster artwork when available, and CSS for framing, lighting and controls rather than substituting flat shapes for the hero.
- **Clear hierarchy and depth**: Reserve quiet space for a short headline, a generous focal object and one obvious opening action. Put atmospheric detail near the edges; use a dark radial overlay for readable text, a restrained warm halo behind the object and a grounded contact shadow beneath it. Fine borders, metallic highlights and subtle motion should support the subject, not compete with it.
- **A crafted final composition**: Carry the opening's colors and materials into a restrained photo frame, recipient name, small divider, readable personal message and optional signature. Keep text as supplied content in the DOM. Check the actual 160-character message, 30-character names and omitted sender at phone size; allow contained vertical scrolling when necessary and reserve space for the host footer.
- **Preserve the photograph**: Apply the supplied photo transform to the image in both rendering paths. Animate a wrapper for entrance, tilt or zoom so Motion never overwrites the user's crop transform. Keep supplied photo captions editable and wrapped if the template supports them.
- **Review the closed object**: Before the opening gesture, no private photo, name or message may be visible. Inspect layers and clipping for accidental letter text peeking through an envelope; hide the inner letter until its reveal. Maintain a semantic, focus-visible opening button with a clear label, even if a decorative seal conveys the same action visually.

## Catalog cover and Receiver opening are separate assets

- Deliver the catalog cover at **exactly 640 × 800 px**, 4:5, as WebP unless the brief specifies another size. Compose dedicated artwork for this ratio rather than stretching a tall phone screenshot. Use the same subject, materials and atmosphere as the actual template; a cover must not promise a different experience.
- For generated covers, specify the exact short display text, legible typography, safe margins, subject placement and exclusions in the prompt. Inspect spelling and thumbnail legibility after generation. High-resolution source artwork may be downsampled; verify the final file's decoded dimensions, sharpness and byte size rather than assuming the generator honored its prompt. Use embossed lettering when appropriate to the art direction; never bake recipient content into catalog artwork.
- For `config.receiverOpening: true`, declare a separate opening image and set `config.receiverOpeningPoster` to its asset ID. Capture the actual still opening at suitable device pixel density, with the opening hint but without editor controls, host toolbar/footer or recipient content. This poster matches the runtime opening; it is not the catalog cover.
- In the Receiver's `ready` state, show that still composition without sound or loops. When the host supplies `config.bonkoReceiverOpening`, its single opening gesture starts playback; do not require a second click. Keep the normal reveal button for Studio and hosts without that flag. Follow DEVELOPMENT.md for the complete host contract.
- Record generation provenance and conversions in `LICENSE.md`. Keep previous deliverables intact; update manifest asset references and inspect the new package's actual contents.

## Generate and package demonstration photographs

Give every demonstration photo its own meaningful description in `config.previewCaptionN`, paired with `previewPhotoN` in the same order. Require 1–80 characters per description, keep text outside the image, and verify the correct caption follows each photo in both animated and static previews. Do not fill real user descriptions with demo text.

Follow DEVELOPMENT.md's **Demonstration photos for creation previews** contract. Generate the occasion-appropriate photo content yourself using available image-generation tooling and store one distinct image per supported photo slot in `assets/preview-photo-N.webp`. Do not reuse the catalog cover, a phone screenshot or a blank color block as a demonstration photograph. If generation is unavailable, report the missing deliverable; do not silently leave a placeholder.

Declare every generated image in `manifest.assets`, then reference its logical ID with `config.previewPhoto1` through `previewPhotoN`. N must match the actual `maxPhotos` capacity, defaulting to one. Record generation provenance and terms in LICENSE.md. Keep demo assets separate from private test uploads, and continue rendering host-supplied photos and crop transforms. Inspect the final ZIP to ensure all demonstration images are included for upload; files merely placed in assets/ are not enough.

## Strict CSS compiler sandbox constraints

The CLI build pipeline enforces strict security and sandboxing checks:

- **Forbidden CSS Syntax**: The compiler checks `/@import|url\s*\(/i`. Using `url(...)` or `@import` in CSS—**even inside CSS comments**—will cause `bonko build` to fail immediately.
- **Asset Resolution**: Never write `background-image: url(...)` in CSS. All image assets must be declared in `manifest.json` and resolved in code using `runtime.asset("id")` in interactive React components, or `asset("id")` in `renderStatic`.
- **Pure CSS Styling**: Use CSS linear and radial gradients, drop-shadows, box-shadows, filters, borders, and transforms for visual effects. Render imagery using standard `<img>` or `<canvas>` elements.
- **Viewport Containment**: Set `.template-viewport` with `position: relative`, `overflow-x: hidden`, and `max-width: 360px` or `390px` for card bodies to eliminate horizontal scrollbars on narrow mobile screens (375px).

## Audio lifecycle & choreographed timeline

**Natural completion must wait for both the visuals and the complete audio track.** If the animation is shorter than the audio, display the finished card immediately and hold it still while the music finishes. Do not truncate, fade out early, stop or loop the track merely to match the animation duration. If the audio finishes first, let the remaining animation finish normally.

1. **Measure the delivered track**: Prefer MP3, synthesized or properly licensed, within the platform's 10.0-second asset limit. Measure the final encoded file including its decay/reverb tail, for example with `ffprobe`; do not infer duration from a filename, score notes or an earlier untrimmed source. Use that same asset in local preview and the package.
2. **Separate visual completion from playback completion**: Track `visualDone` independently from eligibility to call `runtime.complete()`. Completing the host transitions it to `ended` and immediately stops audio. An animation's completion callback may reveal the final card and stop decorative loops; it must not alone end the host while music remains.
3. **Account for the audio start offset**: In a shared active-playback clock, schedule natural completion no earlier than `max(visualEndMs, audioStartMs + audioDurationMs + audioStartAllowanceMs)`. The allowance covers observed host dispatch/decode/start latency; validate it in the real host. Example: visuals end at 6000 ms and a 9000 ms track is requested at 500 ms, so hold the final card until at least 9500 ms plus the validated allowance. For multiple cues, use the latest cue end. Keep the total within the host's 30-second automatic playback budget.
4. **Respect the actual SDK**: Start the declared track once after the authorized gesture with `runtime.audio.play("audio-id").catch(...)`. In the current standalone SDK, this sends a host request; its Promise is neither a playback-start acknowledgement nor an audio-ended event. Do not write `await runtime.audio.play(...); runtime.complete()` or invent `duration`, `currentTime` or `onended` APIs on `runtime.audio`. Use the measured-duration hold with host validation; a timer alone cannot prove actual audio completion under arbitrary start delays. Report any unresolved cutoff instead of claiming a guaranteed full play. Exact event-driven completion would require a supported host/SDK signal, not a template-side bypass.
5. **Pause and cleanup**: Use a cancellable timeline or clock that advances only during active playback. Freeze the completion countdown with the visuals on pause; a bare wall-clock `setTimeout` must not finish a paused scene. Keep the host in `running` during the final audio hold, not `waiting` or `ended`. Dispose all callbacks/timers, guard stale animation Promises and call completion once per instance. Replay starts fresh. The current host stops audio on pause/backgrounding; do not assume sample-accurate audio resume or replay the track on every render.
6. **Intentional overrides and failures**: Full playback applies to uninterrupted, unmuted natural completion. Honor host mute, pause, skip, reduced motion and disposal immediately; never restart sound to defeat them. An unavailable track must not block a readable card or cause an unbounded wait. `renderStatic` renders the complete still result without audio, timers or completion calls: its presentation has no runtime API. If the interactive path itself handles reduced motion, reveal the complete result and finish without starting sound.

Choose reveal beats appropriate to the occasion: invitation → gesture/audio → object opening → photo and personal message → still final card while any remaining music resolves → one natural completion. A quiet keepsake need not use confetti or balloons to feel celebratory.

## Asset specifications & dimensions budget

Keep the catalog cover, background, and cutout assets as distinct, optimized files:

| Asset                             | Recommended Dimensions               | Format       | Target Size | Purpose                                                                               |
| :-------------------------------- | :----------------------------------- | :----------- | :---------- | :------------------------------------------------------------------------------------ |
| **Catalog Cover (`cover`)**       | 640 × 800 px (4:5; required default) | WebP         | 50–120 KB   | Catalog store listing; high visual richness, 3D embossed lettering, celebratory mood. |
| **Atmospheric Background (`bg`)** | 780 × 1368 px (vertical mobile)      | WebP         | 60–120 KB   | Fullscreen ambient background; soft bokeh, stardust, or velvet textures.              |
| **Hero Focal Cutout**             | 400–640 px max dimension             | WebP (alpha) | 40–80 KB    | Transparent foreground subject (cake, gift, flowers); cropped tight to bounding box.  |
| **Celebration Melody (`audio`)**  | Duration <= 10.0s                    | MP3          | 40–150 KB   | Musical greeting / chime; high clarity, under 10.0s platform limit.                   |

- Dimension and byte targets for backgrounds/cutouts are optimization guidance; preserve useful existing assets and prioritize clean edges and readable text.
- Never enlarge a previous 1× screenshot to simulate high-resolution artwork.
- Use WebP quality 85–90 for photos and illustrations; inspect edges and text sharpness.
- Ensure all assets are declared in `manifest.json` and attributed in `LICENSE.md`.

## Preserve playback behavior & dual-path rendering

- **Interactive Path (`render`)**: Use Motion for smooth multi-phase transitions. Respect `running`, `waiting`, `paused`, and `ended` states. Clean up all timers, canvas loops, event listeners, and React roots on unmount.
- **Static Path (`renderStatic`)**: Must render the complete, motionless greeting card (photo, recipient name, divider, message, sender signature) synchronously and immediately. No animations, no timers, and no audio playback. Confirm DOM content is committed before returning.
- **Replay Resilience**: Verify that replaying the template starts a clean instance without state leakage, duplicate timers, or double audio streams.

## Iterate and deliver

Run `bonko dev` for live visual iteration and `bonko build` after source changes. Review the phone preview across multiple viewports (375px, 390px, 430px), long messages, and different photo crops. Then follow [bonko-template-verify](../bonko-template-verify/SKILL.md) for automated checks and packaging. Explain the implemented behavior, verified results, and remaining manual review.
