# Bonko standalone template protocol v3

This protocol is shared by developers and authoring skills. Validation and playback use the distributed `@bonko/template-sdk` package exclusively. The installed SDK package is pinned to **0.2.4**, while the v3 manifest requires **`sdkVersion: "0.2.0"`**. The first is the implementation package release; the second identifies the runtime contract and is checked for exact equality, not a minimum compatible version. The CLI generates this field. Do not change it to `0.2.4`, copy SDK internals into Studio, or change validators to make a template pass.

This document describes implemented interfaces and remaining review requirements; it does not authorize production publication. Studio accepts standalone v3 templates only, without legacy authoring or dual-package delivery.

## 1. Directory and delivery boundaries

```text
./
  manifest.json       Author metadata, configuration and logical asset IDs
  src/main.tsx        Standalone browser entry
  src/*.ts(x)         Internal template code
  src/*.css           Optional styles without external resource references
  assets/*            Declared images and short audio
  LICENSE.md          Code and asset sources, rights and restrictions
  test.json           Local keyboard test entry; excluded from delivery
  fixtures/*          Optional synthetic test data; excluded from delivery
```

`bonko new <slug>` creates a static draft that can become interactive. The scaffold and generated cover are starting points, not finished artwork. Existing directories are never overwritten. Private test photos selected in Studio remain in the browser and must not enter the package. Public synthetic demonstration photos are different: generate and declare them as described below.

After browser checks pass, `bonko pack` creates `dist/<slug>-<version>.bonko.zip`, containing the manifest, declared assets, license, one runtime script, optional runtime CSS, reviewable source and a fixed dependency manifest. Author-provided HTML pages, installation scripts, node_modules, secrets, remote resource URLs and nested packages are not accepted.

Source builds locally only. The platform does not install, build or execute uploaded source, or write it into the main site's source tree. Maintainers review source; compiled runtime code loads in a restricted iframe on a separate origin. The initial launch requires deployment of the host and isolated runtime. Later templates within the supported contract do not require individual main-site deployments.

## 2. Manifest

`manifest.json` is the template's description file: it declares metadata, runtime compatibility, assets, capabilities and configuration. Generate a valid starting point with the CLI; do not write package digests by hand. Unknown fields are rejected. This example follows the SDK schema:

```json
{
  "protocol": 3,
  "sdkVersion": "0.2.0",
  "slug": "paper-note",
  "version": "1.0",
  "name": "Paper Note",
  "description": "A personal note revealed from a folded card.",
  "author": "Your studio name",
  "templateType": "interactive",
  "access": "free",
  "tags": ["Paper", "Warm"],
  "cover": "cover",
  "assets": { "cover": { "kind": "image", "path": "assets/cover.png" } },
  "entry": "runtime/entry.js",
  "capabilities": [],
  "config": { "accent": "#8b493a" },
  "sample": {
    "recipientName": "Alex",
    "message": "You make ordinary days better.",
    "senderName": "Sam"
  },
  "messagePresets": ["You make ordinary days better."],
  "posterStyle": { "background": "#fff9ed", "foreground": "#292620", "accent": "#8b493a" }
}
```

| Field                             | Rule                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `protocol` / `sdkVersion`         | Exactly `3` / `"0.2.0"` for the current runtime contract                                                                       |
| `slug`                            | Lowercase kebab-case, starts with a letter, at most 80 characters; matches the directory name                                  |
| `version`                         | Template version in integer-major form, such as `1.0` or `2.0`; not arbitrary SemVer                                           |
| `name` / `author` / `description` | Nonempty; at most 80 / 80 / 500 characters respectively                                                                        |
| `templateType`                    | `static` or `interactive`; not a category                                                                                      |
| `access`                          | `free` or `premium`; author suggestion confirmed during admin review, not payment activation                                   |
| `tags`                            | Up to 5 custom tags, each at most 20 characters; normalized, trimmed and deduplicated case-insensitively                       |
| `cover`                           | Logical ID of a declared image, not a URL                                                                                      |
| `assets`                          | 1–100 entries; IDs start with a lowercase letter, contain lowercase letters, digits or hyphens, and have at most 64 characters |
| `capabilities`                    | Unique subset of `audio`, `canvas`, `webgl`; declare audio for recorded or synthesized sound                                   |
| `config`                          | At most 32 primitive values: strings, finite numbers or booleans; no nesting, HTML, URLs or scripts                            |
| `sample`                          | Recipient name: 30 characters; message: 160; sender: 30; use an empty sender string to omit it                                 |
| `messagePresets`                  | 1–8 messages, each at most 160 characters                                                                                      |
| `posterStyle`                     | Six-digit hexadecimal `background`, `foreground` and `accent` colors                                                           |
| `entry` / `stylesheet`            | Entry is fixed to `runtime/entry.js`; the builder adds an optional stylesheet when CSS is emitted                              |

**Category is not an author manifest field.** After upload, an administrator selects a platform category; uncategorized templates cannot pass review. Category, template type, access and tags are separate dimensions. Do not add category, occasion, category codes or publication status to self-publish.

## 3. Asset resolution and limits

Use flat paths of the form `assets/<name>.<ext>`, with only letters, digits, underscores and hyphens in filenames. Images support PNG/JPEG/WebP/AVIF; audio supports MP3/OGG. Video, font packages, SVG and animated images are not accepted. Use system fonts and avoid external requests.

The SDK's shared LIMITS define budgets: 10 MiB compressed, 25 MiB expanded, at most 128 files; image maximum edge 4096 pixels and maximum area 16,777,216 pixels; audio at most 10 seconds. Source scanning also has file-count and byte limits. Fixtures are excluded from delivery but are not unlimited storage.

Resolve images with `runtime.asset("logical-id")`. Play audio with `runtime.audio.play("logical-id")` instead of handling audio URLs yourself. The host resolves and validates local, draft or published assets. Do not substitute CDN strings in source or store storage URLs in configuration. Undeclared assets are not exported.

Record each asset's author/source, license, attribution and restrictions by path in LICENSE.md, along with code provenance. For AI-generated assets, record the tool and applicable terms; do not invent permissions. Production covers must accurately represent the template rather than reuse test color blocks.

## 4. Browser interface

Statically import `connectStandaloneTemplate` and the `RuntimePresentation` type from `@bonko/template-sdk/runtime-client`. Register `{ render(presentation), dispose() }`. Host state updates call render again. Do not create a new React root, reset phases, accumulate listeners or restart animations on every render. Create one React root, update component props, and unmount during dispose.

RuntimePresentation provides:

- `content`: recipientName, message, nullable senderName, photoUrl and photoTransform. Render through JSX or text nodes, never HTML string replacement.
- `config`: validated manifest configuration; the template must still check its specific meaning and numeric ranges.
- `reducedMotion`: reduced-motion presentation uses the separate static entry below, without starting interaction.
- `runtime.state`: ready / running / waiting / paused / ended; `runtime.mode`: running / waiting.
- `runtime.report("running" | "waiting")`: report automatic playback or waiting for input only on actual transitions; avoid render loops and message floods.
- `runtime.complete()`: signal natural completion; the host accepts only the first completion from a valid playback state.
- `runtime.asset(id)`, `runtime.audio.play(id)`, `runtime.audio.tone(frequency, durationMs)` and `runtime.audio.stop()`.

Accept interactions only while running/waiting. Pause animation clocks and audio while paused; preserve the static final state with user content when ended. Dispose timers, listeners, animations, React roots and graphics resources. Replay creates a fresh instance.

### Authored static entry (required by Studio)

Provide `renderStatic(presentation)`. Its input includes only content, config, reason, `reducedMotion: true` and asset(id), without runtime, audio or completion APIs. Render complete user content immediately without motion, sound or a required gesture. Reason can be preview, natural, skip, idle, budget, reduced-motion or error.

On natural completion, RuntimeFrame preserves the live final composition without calling renderStatic; the template must leave all final content visible. For explicit static presentation, the SDK calls dispose before entering static presentation, then calls renderStatic once and stops sending playback updates to the old component. The static entry may return a cleanup function or a Promise resolving to one after content is actually committed. React templates must confirm the new root has committed instead of assuming root.render makes the DOM ready immediately. Cleanup releases static DOM, React and graphics resources on unmount. If asynchronous rendering finishes after unmount, cleanup runs immediately.

Missing or failed static entries report an error instead of pretending to be ready. The shared RuntimeFrame opts into this contract through authoredStatic, waits up to five seconds for the static commit, shows generic content while waiting, and unmounts the iframe on failure/timeout. Static preview does not count as a full play. Studio enables this contract. Check/pack verify the preserved natural final frame and separately require authored static preview, skip and reduced-motion checks for content, photo and crop. Generic fallback cannot make a template pass. Existing v3 drafts must implement this entry before repackaging. Product/Admin use the same entry, which does not imply that the entire backend-to-frontend launch process is complete.

The host limits cumulative automatic playback to 30 seconds and foreground input waiting to 60 seconds. Moving to the background pauses playback; returning requires explicit user resumption. Preserve the host's direct-view action; do not require winning a game. Gestures need click or keyboard alternatives. Do not introduce scores, wins/losses, cross-session progress or a new JSON timeline language.

The host manages audio, unlocking it only after user interaction and stopping it on mute, pause, skip, unmount or backgrounding. Synthesized tones last at most two seconds. A return from audio.play() does not mean playback has finished; do not treat it as a reliable ended event. Visual content must remain understandable without sound.

`runtime.audio.stop()` cancels current audio, including pending playback requests, without revoking existing host playback authorization. A later phase may still call play/tone. It cannot unlock audio or bypass mute, pause or background state; those host lifecycle stops still require explicit user resumption.

## 5. Dependencies and isolation

The builder allows static imports of `react`, `react/jsx-runtime`, `react-dom/client`, `motion/react`, `@bonko/template-sdk/runtime-client` and relative paths inside src. Versions come from the CLI distribution and lockfile. Use Motion for animation. Ask maintainers to evaluate new dependencies instead of independently installing packages or changing the lockfile.

Dynamic import, require, eval, import.meta, triple-slash type references and imports outside src are prohibited. CSS cannot use @import or url(...); resolve images by host-provided logical IDs. The builder does not use author tsconfig or environment files as build configuration.

The iframe runs on a separate origin without same-origin sandbox permission. Network connections, child frames, workers and direct media playback are prohibited. Do not access accounts, cookies, databases, the parent page, arbitrary networks or remote code. Canvas/WebGL must remain within the template. Static scanning and sandboxing do not prove arbitrary code safe; source, dependencies and resource consumption still require review.

## 6. Checks, versions and handoff

Interactive templates need a test.json entry such as `{ "revealButton": "Open your note" }`, matching the actual accessible button name. The checker reveals with Enter and waits for natural completion. Static templates retain the CLI-generated local test description.

`bonko check --json` and `bonko pack --json` exit 0 on success and 1 on failure. Run commands from the project directory. Type errors include structured diagnostics; browser failures save reports and available failure screenshots in .bonko/checks/, excluded from delivery.

Checks execute local template code. Run reviewed sources in an environment without production credentials. Inspect reports and screenshots, and separately review touch, audio, visuals and licensing. Automated static-photo checks currently cover DOM images and transforms; equivalent pure Canvas/WebGL photo checks remain incomplete. Static-layout appearance, accessibility and asset-failure behavior still need manual review. Passing automation is not completed review.

Preserve previous commits and delivery packages before increasing manifest.version. Different content cannot overwrite the same version; repacking identical content still runs checks. Packaging uses the checked bytes. If source changes during checking, rerun the operation.

Hand off one .bonko.zip to an authorized platform maintainer. They upload it to private staging, where the server revalidates the actual package, assets and digests. Maintainers assign a category, review tags and access, inspect source and satisfy deployment gates before publication. CLI success does not authorize publication, charging users or changing production data. Record completed checks and remaining work. Authors do not need the main-site repository, R2 credentials or database credentials.

### Template-owned receiver opening

An interactive v3 package can opt in with `config.receiverOpening: true`. This
uses existing primitive manifest configuration; protocol stays 3 and sdkVersion
stays `"0.2.0"`. The opening illustration, layout and transitions belong to the
package's source and declared assets. `cover` remains the public catalog/OG
image; it is not used as an improvised envelope. Publish a new immutable template
version when introducing or changing the opening.

Declare an additional image asset and set `config.receiverOpeningPoster` to its
logical ID. This non-spoiler still shows the same opening composition during
loading and reduced motion, without loading runtime code first. Keep the tap hint
in this artwork, but no recipient content.

The Receiver replaces the opt-in key with the reserved boolean `config.bonkoReceiverOpening` at init.
Authors must not set this host field in a manifest. When it is true:

- Render a still, non-spoiler opening while `runtime.state === "ready"`. Do not
  show the recipient photo/name/message, play sound or run decorative loops.
- The host places an accessible transparent opening button above the entire
  template. A pointer tap, Enter or Space unlocks host audio and starts playback.
  On the first transition to `running`, automatically perform the reveal once;
  do not require another button click. Readiness is not permission to reveal.
- Keep a normal semantic reveal button for Studio and hosts that do not supply
  the flag. These hosts start playback first and then accept the template's click.
- Respect paused/waiting/ended, dispose resources, and implement `renderStatic`
  with the complete photo and message. Reduced-motion users see the still opening
  first, then the authored static result after opening. Runtime failure shows a
  readable result only after the host gesture. Sound is never required.

The host owns Mute, Report, an unobtrusive Replay after completion, and the
clickable “Made with Bonko” footer. Do not duplicate them inside the template.
There is no ordinary pause/next toolbar in the Receiver; if browser visibility
pauses a run, the host offers a contextual Resume action. Templates without the
opt-in keep the existing generic invitation for compatibility.

Studio's existing playback/keyboard checks exercise the normal reveal button.
Additionally review this host opening path: ready without private content or
sound → one host click → running → natural completion. Test an early click,
muted opening, replay, reduced motion, failed loading and narrow screens before
publication. CLI checks alone do not prove Receiver integration.

## Demonstration photos for creation previews

Before handing off a finished template, generate original, occasion-appropriate demonstration photographs and save them as `assets/preview-photo-1.webp` through `assets/preview-photo-N.webp`, where N is `config.maxPhotos` (default 1, maximum 10). These are photographs placed inside the template's photo frames, not the 3:2 landscape catalog cover (recommended 1200 × 800 px, with other 3:2 resolutions accepted), opening poster, screenshots, or flat placeholder blocks. Match the intended crops and use distinct images for a multi-photo sequence. Use available image-generation tooling; if it is unavailable, report the missing deliverable rather than inventing an image or claiming generation succeeded. Record tool, generation provenance, conversions and applicable terms in LICENSE.md. Never package private user uploads.

Declare each file as a normal image asset and reference its logical ID using primitive config fields:

```json
{
  "assets": {
    "cover": { "kind": "image", "path": "assets/cover.webp" },
    "preview-photo-1": { "kind": "image", "path": "assets/preview-photo-1.webp" },
    "preview-photo-2": { "kind": "image", "path": "assets/preview-photo-2.webp" }
  },
  "config": {
    "maxPhotos": 2,
    "previewPhoto1": "preview-photo-1",
    "previewCaption1": "A table full of laughter and familiar faces.",
    "previewPhoto2": "preview-photo-2",
    "previewCaption2": "One more memory to be thankful for."
  }
}
```

Merge these fields into the full manifest; do not add unknown fields to `sample` or put arrays, paths, data URLs or remote URLs in config. The declared limit must match the runtime's actual photo capacity. These assets and config fields count toward existing SDK budgets; optimize the images to remain within package limits.

The CLI validates declared preview-photo references and requires a complete, distinct sequence when any previewPhoto field is present. Drafts without these fields remain buildable, but finished authoring deliverables require generated demonstration photos. Normal asset bundling includes the declared images in `.bonko.zip`; merely placing files in assets/ does not include them. Inspect the delivered ZIP, not only the source directory.

On upload, the platform must validate these references and image bytes, retain the files with the template version, and resolve them through its normal verified asset storage. Hosts use them only for explicitly identified sample previews before the user supplies photos; they must never count as user uploads or become a newly created private link's photos. Templates continue to render host-supplied photo content and crop transforms, rather than silently replacing real content with their demo assets. Verify host consumption separately; CLI packaging alone does not prove a deployed host uses this metadata.

Each demonstration photo requires a matching `config.previewCaptionN`: meaningful plain text describing that photo, 1–80 characters, not an empty string or a generic filename. Keep the same numbering and count as previewPhotoN. Captions are editable text metadata, never baked into generated photographs. Templates render the host-supplied photo notes in interactive and static presentations. The host removes previewPhoto/previewCaption metadata before runtime initialization and passes only the selected demo captions using the existing fixed-width bonkoPhotoNotes contract, preventing ten demo captions from exhausting runtime config space. Real user photos and descriptions replace the entire demo set; absent user descriptions stay absent.

A finished demonstration also requires meaningful `sample.recipientName` (1–30 characters), `sample.message` (1–160) and `sample.senderName` (1–30), coherent with the photos and captions. Packages declaring demo photos are rejected if any of these values is blank or too long. Packages without demo metadata keep the existing optional-sender contract. Use the existing sample object, not a top-level `name`/`message`/`sender` extension:

```json
"sample": {
  "recipientName": "Grace",
  "message": "Thank you for filling our days with warmth, laughter, and love. Happy Thanksgiving!",
  "senderName": "David"
}
```

CLI preview initializes from sample content. The creation host uses sample name/message/sender only as preview defaults for missing input during the demo; they never satisfy required user inputs or enter a saved link. An omitted user sender remains omitted after the user supplies their own photo.

### Studio authoring metadata

Studio's Config tab edits `manifest.json`, not TypeScript compiler configuration. It stores a suggested price in `config.suggestedPriceCents` (integer USD cents, 0–999999) and `config.suggestedPriceCurrency` (`USD`). Free access requires zero; Premium requires at least one cent. These values are author suggestions for platform review, not payment activation, and Studio removes them before runtime initialization. No new top-level manifest fields are introduced.

Local uploaded photos have optional 0–80-character descriptions. Studio retains descriptions and crop transforms with each photo during reorder and removal; replay serializes descriptions in the existing `bonkoPhotoNotesN` format. They replace authored demo captions for local preview and are never written into the template package.
