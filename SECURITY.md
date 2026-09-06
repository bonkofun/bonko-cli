# Security

Bonko CLI builds and executes local template code during preview and browser verification. Use sources you trust and an environment without production credentials. The runtime sandbox and static checks are defense layers, not proof that arbitrary code is safe.

Install releases from this repository's official GitHub release assets. The installer verifies HTTPS downloads and SHA-256 checksums, disables npm lifecycle scripts, and activates only a version-checked installation. Dependencies and their integrity hashes are pinned by npm-shrinkwrap.json.

## Reporting

Use the repository's GitHub **Security → Report a vulnerability** option if private vulnerability reporting is enabled. If it is unavailable, open an issue requesting a private reporting channel without including exploit details, credentials or personal data. Do not submit sensitive reports through an ordinary public issue or PR.

Include the affected CLI/SDK versions, operating system, minimal reproduction and expected versus actual behavior. Use synthetic files and redact secrets. Maintainers assess the report and coordinate fixes; no response-time guarantee is currently offered.

## Scope and limitations

The supported installation targets are macOS and Linux. Browser checks use Chromium and do not certify every browser or device. User assets retain their own licenses. Release checksums detect corruption but do not provide independent artifact signatures. Old releases remain immutable; fixes are delivered in new versions.
