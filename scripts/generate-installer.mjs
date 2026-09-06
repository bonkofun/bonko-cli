import { readFile, writeFile } from 'node:fs/promises';
const implementation = await readFile(new URL('./install.mjs', import.meta.url), 'utf8');
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const baseIndex = process.argv.indexOf('--base-url');
const releaseBase = baseIndex === -1 ? '' : process.argv[baseIndex + 1];
if (baseIndex !== -1 && (!releaseBase || new URL(releaseBase).protocol !== 'https:'))
  throw new Error('--base-url requires an HTTPS URL');
const script = `#!/bin/sh
# Bonko installer: parse the complete function before running a piped script.
bonko_install() {
  set -eu
  if ! command -v node >/dev/null 2>&1; then
    echo "Error: Node.js is not installed or is not on PATH. Bonko requires Node.js >= 22.12.0. Install Node.js from https://nodejs.org/en/download and retry. Nothing was installed." >&2
    return 1
  fi
  bonko_node_version=$(node --version) || { echo "Error: Cannot run Node.js. Nothing was installed." >&2; return 1; }
  if ! node -e 'var m=/^v?(\\d+)\\.(\\d+)\\.(\\d+)$/.exec(process.argv[1]);process.exit(m && (+m[1]>22 || (+m[1]===22 && +m[2]>=12)) ? 0 : 1)' "$bonko_node_version"; then
    echo "Error: Bonko requires Node.js >= 22.12.0; found $bonko_node_version. Upgrade Node.js and retry. Nothing was installed." >&2
    return 1
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "Error: npm is missing. Install Node.js with npm, then retry. Nothing was installed." >&2
    return 1
  fi
  if ! npm --version >/dev/null 2>&1; then
    echo "Error: npm cannot run with this Node.js. Repair the Node.js installation and retry." >&2
    return 1
  fi
  node --input-type=module - "$@" <<'BONKO_INSTALL_JS'
${implementation}
try { await install(process.argv.slice(2), ${JSON.stringify(version)}, ${JSON.stringify(releaseBase)}); }
catch (error) { console.error('Error: ' + error.message); process.exitCode = 1; }
BONKO_INSTALL_JS
}
bonko_install "$@"
`;
await writeFile(new URL('../install.sh', import.meta.url), script, { mode: 0o755 });
