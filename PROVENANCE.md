# Source provenance

The Studio UI, local runtime tools and scaffold were adapted from the local
`bonko-template-studio` repository at commit `28349becfd68653e73aac6df541a7a47f6ac9bb1`.
They are maintained in this independent CLI repository; installed users do not
need the Studio repository. The shared protocol, ZIP validation and runtime
remain the pinned npm distribution of `@bonko/template-sdk`, not copied SDK source.

CLI-specific adaptations: flat template projects, tool-owned dependency resolution,
prebuilt Studio assets, explicit build output and browser preparation.

The local engine is now maintained as strict TypeScript under `src/engine/`.
Third-party development skills retain their upstream licensing and revisions;
see [docs/SKILLS.md](docs/SKILLS.md). They are not included in CLI release archives.
