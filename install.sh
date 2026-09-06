#!/bin/sh
# Bonko installer: parse the complete function before running a piped script.
bonko_install() {
  set -eu
  if ! command -v node >/dev/null 2>&1; then
    echo "Error: Node.js is not installed or is not on PATH. Bonko requires Node.js >= 22.12.0. Install Node.js from https://nodejs.org/en/download and retry. Nothing was installed." >&2
    return 1
  fi
  bonko_node_version=$(node --version) || { echo "Error: Cannot run Node.js. Nothing was installed." >&2; return 1; }
  if ! node -e 'var m=/^v?(\d+)\.(\d+)\.(\d+)$/.exec(process.argv[1]);process.exit(m && (+m[1]>22 || (+m[1]===22 && +m[2]>=12)) ? 0 : 1)' "$bonko_node_version"; then
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
import { spawn } from 'node:child_process';
import { access, lstat, stat as fsStat, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';

export async function command(file, args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { if (capture) stdout += data; else process.stderr.write(data); });
    child.stderr.on('data', data => { if (capture) stderr += data; else process.stderr.write(data); });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${path.basename(file)} failed (${code}). ${stderr.trim()}`)));
  });
}
async function realDirectory(folder) {
  const parent = path.dirname(folder);
  if (parent !== folder) {
    try { const parentStat = await fsStat(parent); if (!parentStat.isDirectory()) throw new Error(`Expected a directory: ${parent}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await realDirectory(parent); }
  }
  await mkdir(folder).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const stat = await lstat(folder);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Refusing linked or non-directory installation target: ${folder}`);
}
export async function install(args, releaseVersion = '0.1.0', releaseBase = '') {
  const values = {};
  for (let i = 0; i < args.length; i++) {
    if (!['--prefix', '--bin-dir', '--archive', '--sha256', '--base-url'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Unknown or incomplete installer option: ${args[i]}`);
    values[args[i]] = args[++i];
  }
  const rootUser = typeof process.getuid === 'function' && process.getuid() === 0;
  const prefix = path.resolve(values['--prefix'] ?? process.env.BONKO_INSTALL_DIR ?? (rootUser ? '/usr/local/share/bonko' : path.join(homedir(), '.bonko')));
  const binDir = path.resolve(values['--bin-dir'] ?? (values['--prefix'] || process.env.BONKO_INSTALL_DIR || !rootUser ? path.join(prefix, 'bin') : '/usr/local/bin'));
  const base = values['--base-url'] ?? process.env.BONKO_RELEASE_BASE_URL ?? releaseBase;
  if (!values['--archive'] && !base) throw new Error('No release endpoint configured. Use --base-url https://your-release-host/v' + releaseVersion + ' or install a local release with --archive <file> --sha256 <digest>.');
  if (!values['--archive'] && new URL(base).protocol !== 'https:') throw new Error('Release downloads require HTTPS.');
  if (values['--archive'] && !/^[a-f0-9]{64}$/.test(values['--sha256'] ?? '')) throw new Error('A local archive requires its --sha256 digest.');
  await realDirectory(prefix);
  const lock = path.join(prefix, '.install-lock');
  await mkdir(lock).catch(error => { if (error.code === 'EEXIST') throw new Error(`Another installation is active. If it was interrupted, remove ${lock} and retry.`); throw error; });
  let staging;
  try {
    await realDirectory(binDir);
    await realDirectory(path.join(prefix, 'versions'));
    const entry = path.join(binDir, 'bonko');
    try {
      const stat = await lstat(entry);
      if (!stat.isSymbolicLink()) throw new Error(`Refusing to replace an existing command: ${entry}`);
      const { readlink } = await import('node:fs/promises');
      const existing = path.resolve(binDir, await readlink(entry));
      const relative = path.relative(path.join(prefix, 'versions'), existing);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Refusing to replace an unrelated command: ${entry}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    staging = await mkdtemp(path.join(prefix, '.install-'));
    let archive = values['--archive'] ? path.resolve(values['--archive']) : path.join(staging, 'bonko.tgz');
    let digest = values['--sha256'];
    if (!values['--archive']) {
      const url = `${base.replace(/\/$/, '')}/bonko-cli-${releaseVersion}.tgz`;
      const checksumFile = path.join(staging, 'checksum');
      const download = (url, output) => command('curl', ['--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--proto-redir', '=https', '--tlsv1.2', '--retry', '2', '--connect-timeout', '20', '--max-time', '300', '--output', output, url]);
      await download(url + '.sha256', checksumFile);
      digest = (await readFile(checksumFile, 'utf8')).trim().split(/\s+/)[0];
      if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid release checksum.');
      await download(url, archive);
    }
    const bytes = await readFile(archive);
    if (createHash('sha256').update(bytes).digest('hex') !== digest) throw new Error('Release checksum mismatch. Nothing was activated.');
    const versionDir = path.join(prefix, 'versions', releaseVersion);
    let installed = false;
    try {
      if ((await lstat(versionDir)).isSymbolicLink()) throw new Error('Refusing linked version directory.');
      const marker = JSON.parse(await readFile(path.join(versionDir, '.bonko-install.json'), 'utf8'));
      if (marker.digest !== digest) throw new Error('This version is already installed with different bytes. Publish a new version.');
      installed = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!installed) {
      const payload = path.join(staging, 'payload');
      await mkdir(payload);
      process.stderr.write(`Installing Bonko ${releaseVersion} with Node ${process.versions.node}…\n`);
      await command('npm', ['install', '--prefix', payload, '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', '--package-lock=false', '--engine-strict', archive]);
      const executable = path.join(payload, 'node_modules/@bonkofun/cli/bin/bonko.mjs');
      const result = JSON.parse(await command(process.execPath, [executable, 'version', '--json'], true));
      if (result.version !== releaseVersion) throw new Error('Release package version does not match the installer.');
      await writeFile(path.join(payload, '.bonko-install.json'), JSON.stringify({ version: releaseVersion, digest }) + '\n', { flag: 'wx' });
      await rename(payload, versionDir);
    }
    const installedExecutable = path.join(versionDir, 'node_modules/@bonkofun/cli/bin/bonko.mjs');
    await access(installedExecutable);
    const temporaryEntry = path.join(binDir, `.bonko-${process.pid}`);
    try { await symlink(installedExecutable, temporaryEntry); await rename(temporaryEntry, entry); }
    finally { await rm(temporaryEntry, { force: true }); }
    console.log(`Installed Bonko ${releaseVersion}\nCommand: ${entry}\n\nTry: ${entry} help`);
    if (!(process.env.PATH ?? '').split(path.delimiter).includes(binDir)) console.log(`\nAdd this directory to PATH in your shell profile, then reopen your terminal:\n  ${binDir}\n\nFor this terminal:\n  export PATH=${("'" + binDir.replaceAll("'", "'\"'\"'") + "'")}:"$PATH"`);
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
    await rm(lock, { recursive: true, force: true });
  }
}

try { await install(process.argv.slice(2), "0.1.1", ""); }
catch (error) { console.error('Error: ' + error.message); process.exitCode = 1; }
BONKO_INSTALL_JS
}
bonko_install "$@"
