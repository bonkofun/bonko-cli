# Bonko template version and compatibility policy

Status: implemented locally for CLI 0.2.4 and the corresponding Admin admission change;
not published or deployed. Updated 2026-09-10.

## Version identities

| Identity                 | Source                                        | Meaning and rule                                                                                                                                                                |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template identity        | manifest.json: slug                           | Stable lowercase kebab-case identifier. Never derive it from an uploaded filename or silently rename an existing identity.                                                      |
| Template content version | manifest.json: version                        | Integer-major N.0, starting at 1.0. New Studio packages must exceed the current manifest and existing local archive versions. A changed package requires a new content version. |
| Packing CLI              | source/dependencies.json: @bonkofun/cli       | Generated from the CLI actually building the archive, including builds of older projects. Never copy the creating CLI pin or allow an author-supplied override.                 |
| Creating CLI             | bonko.json: cliVersion                        | Historical local project metadata only. Updating skills or switching CLI does not rewrite it or prove upload compatibility. It is not the packing version.                      |
| Archive/runtime protocol | bundle.json: format; manifest.json: protocol  | Exactly 3. The SDK validates the archive inventory and runtime contract. A higher number is not automatically supported.                                                        |
| Runtime SDK contract     | manifest.json: sdkVersion                     | Exactly 0.2.0. This is a runtime contract identifier, not the installed npm version.                                                                                            |
| SDK implementation       | source/dependencies.json: @bonko/template-sdk | Exactly 0.2.4 in this reviewed compatibility set. A different implementation needs explicit consumer review and tests.                                                          |

Do not use a template's content version as the CLI compatibility floor. A new
template at 1.0 can be valid; an old template at 50.0 can still use an incompatible
toolchain. Do not add unknown top-level manifest fields: the SDK rejects them.
The existing dependency inventory records the build toolchain without changing
the v3 wire format, allowed runtime imports or the SDK parser.

## Current new-upload admission

The server accepts stable packing CLI versions **>=0.2.4 and <0.3.0**, together
with SDK implementation **0.2.4**, runtime protocol **3** and SDK contract
**0.2.0**. Numeric components are compared numerically, not lexicographically.
Missing builder metadata, older versions, prereleases, malformed numbers,
unsupported future minor/major lines and unreviewed SDK implementations fail closed.

The executable admission policy lives in the main site's
src/features/admin/template-upload-policy.ts. This document is maintained in
both the CLI and main-site repositories as docs/TEMPLATE_VERSIONING.md; changes
must update both copies and their tests in the same coordinated batch.

The CLI 0.2.x patch line must retain this contract. A breaking authoring/runtime
change cannot be released as an implicitly compatible patch. It requires a
new contract or compatibility range and a reviewed main-site update first.
The minimum version may increase to exclude a known-bad patch. Every change
to a floor/range must state the reason and regression coverage.

## Enforcement sequence

1. Author in a CLI whose packed toolchain is in the supported range. Save Config.
   Updating skills installs guidance; it does not migrate or certify template code.
2. Build with tool-owned pinned dependencies. Stamp the actual builder version
   into source/dependencies.json before generating the archive inventory/hash.
   Authors cannot replace that file through template source.
3. Check and pack with the normal browser suite: content, ordered photos and
   captions, crop, natural completion, authored static output, replay,
   reduced motion, failure paths and responsive sizes. Review remaining manual
   items; do not claim their completion from an automatic test result.
4. On upload completion, the server parses the actual archive with the SDK,
   validates inventory, protocol, assets/media and photo metadata, and checks
   the packed toolchain before accepting a submission. UI checks or filename
   checks cannot replace this boundary. Unsupported uploads get
   UNSUPPORTED_TOOLCHAIN and never become accepted submissions.
5. Before publication or relisting, re-read the retained package and check the
   current admission policy again, before writing public runtime markers or
   changing publication state. An old approved draft cannot bypass a new floor.
6. Keep authorization, review, classification, digest checks and version conflict
   checks. Same slug/version with identical bytes is an idempotent retry where
   already supported; different bytes conflict. Local CLI checks cannot know
   every remotely uploaded version; the backend remains authoritative.
7. Preserve existing immutable versions and their original Bonk references.
   Raising the upload floor does not rewrite, unpublish or block historical
   Receiver playback. Existing public runtime compatibility checks still apply.
   Security revocation is a separate explicit operation, not a side effect
   of changing authoring-tool admission.

Version strings are compatibility declarations, not cryptographic attestations.
An attacker could rebuild an inventory after changing declared versions.
Therefore admission does not replace source review, restricted runtime origins,
sandboxing, permission checks, media validation or signed release provenance.
Do not advertise a version floor as proof that uploaded code is safe.

## Shared authoring contract

- maxPhotos is the user upload capacity, an integer from 1 through 10.
- Authored demo photos form an independent contiguous set of 1 through 10
  declared image IDs. Each has one nonempty caption of at most 80 characters.
  Demo count does not need to equal upload capacity. Preview consumes up to
  the capacity; extra authored demos are retained and validated.
- Cover and demo images must be distinct. No private local uploads enter packages.
- Caption, image and crop stay together through sorting and preview.
- Config suggestedPriceCents is authoring metadata: integer 0–990 USD cents,
  with 0 meaning free and a positive value meaning premium in Studio.
  It is not permission to activate payment or override reviewed platform pricing.
- Preview/caption metadata and price suggestions do not become user runtime config.
- A manifest setting cannot add render support to template code. Increasing
  maxPhotos requires verifying that the actual template renders that many photos.
- A 3:2 cover may use different pixel dimensions within SDK size limits;
  accurate preview composition, declared format and decoded media validation remain required.

## Existing-project upgrade procedure

Keep original source and released archives. Install/use a supported CLI and update
the project's skills, then review protocol/authoring changes and adapt the source
where necessary. Run check, choose a new N.0 content version when bytes change,
and pack again. The new archive contains the current packing CLI automatically.
Never fix rejection by editing version strings or the ZIP filename manually.
Never overwrite a previously published version to avoid a migration.

## Release and acceptance checklist

For every CLI change affecting output, configuration, photo/caption semantics,
SDK/runtime behavior or packaging:

- Identify whether the change is tooling-only, backward compatible, or breaking.
- Update policy/docs, CLI authoring guidance and main-site consumers together.
- Cover accepted floor, below-floor, multi-digit patch, absent provenance,
  prerelease, future unsupported version and wrong SDK cases.
- Prove server rejection occurs before acceptance/publication mutations.
- Run CLI verification and main-site focused tests and type checks. Exercise an
  actual CLI-built package through main-site admission. Use isolated fixtures.
- Run a full isolated upload/review/publication/Receiver smoke test before rollout.
  Clean run-owned records and objects on success or failure.
- Deploy the compatible consumer before broadly distributing packages needing
  its new contract. Coordinate floor enforcement with CLI availability; do not
  deploy a floor whose required CLI has not been made available.
- Record skipped checks and rollout status. Local commits, CLI releases, backend
  deployment and production smoke tests are separate completion states.

No CLI upgrade, skills update, check or pack automatically commits, uploads,
publishes, changes a production policy, deploys the main site or migrates old Bonks.
Those actions require their own user authorization.
