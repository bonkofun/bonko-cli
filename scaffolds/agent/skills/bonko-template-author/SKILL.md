---
name: bonko-template-author
description: Create or refine a Bonko standalone template in a bonko.json project, including high-emotion celebratory artwork, layered visual composition, audio choreography, React or DOM code, Motion interactions and runtime lifecycle. Use for template development, not CLI maintenance or the Studio application UI.
---

# Author a Bonko template

Read the project's [DEVELOPMENT.md](../../../DEVELOPMENT.md), then inspect `manifest.json`, `src/main.tsx`, `test.json` and `LICENSE.md`. Resolve commands and project files from the directory containing `bonko.json`. The local protocol is the detailed contract; do not substitute remembered SDK APIs or depend on another repository.

## Develop from the brief

1. **Occasion & Emotional Resonance**: Bonko templates are commercial gifting and celebration products. Users preview templates before purchasing; the opening scene must convey high emotional value, exquisite craftsmanship, and instant appeal. Avoid flat, cartoonish 2D vector clip-art or rudimentary CSS placeholder shapes for primary celebratory focal points (such as cakes, bouquets, gift boxes, or jewelry).
2. **Build the readable composition first**: Inspect existing components and assets. Build the completed readable card first using supplied recipient, message, optional sender, and one photo with its transform matrix. Test long text (up to 160 chars), omitted sender, and different photo crops; never hardcode sample content into the artwork.
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
5. **Radiant Call-to-Action**: Accompany the hero with an inviting, glowing button (e.g. `Open Birthday Card ✨`) styled with metallic gradients and soft box-shadow halos.

## Strict CSS compiler sandbox constraints

The CLI build pipeline enforces strict security and sandboxing checks:

- **Forbidden CSS Syntax**: The compiler checks `/@import|url\s*\(/i`. Using `url(...)` or `@import` in CSS—**even inside CSS comments**—will cause `bonko build` to fail immediately.
- **Asset Resolution**: Never write `background-image: url(...)` in CSS. All image assets must be declared in `manifest.json` and resolved in code using `runtime.asset("id")` in interactive React components, or `asset("id")` in `renderStatic`.
- **Pure CSS Styling**: Use CSS linear and radial gradients, drop-shadows, box-shadows, filters, borders, and transforms for visual effects. Render imagery using standard `<img>` or `<canvas>` elements.
- **Viewport Containment**: Set `.template-viewport` with `position: relative`, `overflow-x: hidden`, and `max-width: 360px` or `390px` for card bodies to eliminate horizontal scrollbars on narrow mobile screens (375px).

## Audio lifecycle & choreographed timeline

Audio in standalone templates must be strictly harmonized with the visual choreography:

1. **Audio File Constraints**: Audio assets must be in MP3 format, synthesized or properly licensed, and strictly under the **10.0-second** platform duration limit (e.g. 7.0–8.5 seconds).
2. **The Audio Lifecycle Rule**: Calling `runtime.complete()` transitions the host player state to `ended`, which immediately terminates audio playback via `AudioScope.stop()`.
3. **Choreographed Audio-Visual Sequence**:
   - **Phase 1 (The Invitation)**: Opening screen displays floating hero element and reveal button.
   - **Phase 2 (The Trigger)**: User taps reveal button → trigger `runtime.report("running")` and start audio playback via `runtime.audio.play("audio-id").catch(...)`.
   - **Phase 3 (The Celebration Burst)**: Confetti particle explosion fires, celebratory balloons/elements float up, and the opening stage exits smoothly.
   - **Phase 4 (The Card Bloom & Personalization)**: Card unfolds in 3D perspective, showcasing celebrant photo crowned in gold, followed by staggered golden typography (recipient greeting → personal message → sender signature).
   - **Phase 5 (Musical Cadence & Natural Completion)**: Synchronize completion with the audio track duration using `setTimeout(() => runtime.complete(), audioDurationMs)`. Allow the full musical cadence to finish before signaling completion.
4. **Accessibility Overrides**: If `reducedMotion` is true or if the user triggers static skip, skip animations and audio, showing the completed card immediately and calling `runtime.complete()`.

## Asset specifications & dimensions budget

Keep the catalog cover, background, and cutout assets as distinct, optimized files:

| Asset                             | Recommended Dimensions          | Format       | Target Size | Purpose                                                                               |
| :-------------------------------- | :------------------------------ | :----------- | :---------- | :------------------------------------------------------------------------------------ |
| **Catalog Cover (`cover`)**       | 640 × 800 px (4:5 aspect ratio) | WebP         | 50–120 KB   | Catalog store listing; high visual richness, 3D embossed lettering, celebratory mood. |
| **Atmospheric Background (`bg`)** | 780 × 1368 px (vertical mobile) | WebP         | 60–120 KB   | Fullscreen ambient background; soft bokeh, stardust, or velvet textures.              |
| **Hero Focal Cutout**             | 400–640 px max dimension        | WebP (alpha) | 40–80 KB    | Transparent foreground subject (cake, gift, flowers); cropped tight to bounding box.  |
| **Celebration Melody (`audio`)**  | Duration <= 10.0s               | MP3          | 40–150 KB   | Musical greeting / chime; high clarity, under 10.0s platform limit.                   |

- Never enlarge a previous 1× screenshot to simulate high-resolution artwork.
- Use WebP quality 85–90 for photos and illustrations; inspect edges and text sharpness.
- Ensure all assets are declared in `manifest.json` and attributed in `LICENSE.md`.

## Preserve playback behavior & dual-path rendering

- **Interactive Path (`render`)**: Use Motion for smooth multi-phase transitions. Respect `running`, `waiting`, `paused`, and `ended` states. Clean up all timers, canvas loops, event listeners, and React roots on unmount.
- **Static Path (`renderStatic`)**: Must render the complete, motionless greeting card (photo, recipient name, divider, message, sender signature) synchronously and immediately. No animations, no timers, and no audio playback. Confirm DOM content is committed before returning.
- **Replay Resilience**: Verify that replaying the template starts a clean instance without state leakage, duplicate timers, or double audio streams.

## Iterate and deliver

Run `bonko dev` for live visual iteration and `bonko build` after source changes. Review the phone preview across multiple viewports (375px, 390px, 430px), long messages, and different photo crops. Then follow [bonko-template-verify](../bonko-template-verify/SKILL.md) for automated checks and packaging. Explain the implemented behavior, verified results, and remaining manual review.
