import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const releases = 'https://api.github.com/repos/bonkofun/bonko-cli/releases/latest';
const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

async function latestRelease(): Promise<unknown> {
  const response = await fetch(releases, {
    headers: { Accept: 'application/vnd.github+json' },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `Cannot check the latest Bonko release (HTTP ${response.status}). Retry later.`,
    );
  return response.json();
}

/** Reuse the shipped installer in a child process, forwarding cancellation until it exits. */
export async function runUpgradeInstaller(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit' });
    const interrupt = () => child.kill('SIGINT');
    const terminate = () => child.kill('SIGTERM');
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    let failure: Error | undefined;
    child.once('error', (error) => {
      failure = error;
    });
    child.once('close', (code) => {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', terminate);
      if (failure) reject(failure);
      else if (code !== 0)
        reject(new Error(`Upgrade installer failed (${code}). Check the installer output above.`));
      else resolve();
    });
  });
}

/** Upgrade only the installation used to invoke this command; never rewrite project pins. */
export async function upgrade(
  toolRoot: string,
  launcher: string,
  currentVersion: string,
  dependencies: {
    latestRelease?: () => Promise<unknown>;
    runInstaller?: (args: string[]) => Promise<void>;
  } = {},
) {
  const root = await realpath(toolRoot);
  const directory = path.resolve(root, '../../..');
  const versions = path.dirname(directory);
  const entry = path.resolve(launcher);
  if (
    path.basename(versions) !== 'versions' ||
    root !== path.join(directory, 'node_modules/@bonkofun/cli')
  )
    throw new Error(
      'Upgrade requires an installed CLI. Workspace checkouts cannot upgrade the global command.',
    );
  if (
    !(await lstat(entry)).isSymbolicLink() ||
    (await realpath(entry)) !== path.join(root, 'bin/bonko.mjs')
  )
    throw new Error('Run upgrade through the active installed bonko command symlink.');
  const marker: unknown = JSON.parse(
    await readFile(path.join(directory, '.bonko-install.json'), 'utf8'),
  );
  if (
    !stable.test(currentVersion) ||
    path.basename(directory) !== currentVersion ||
    !marker ||
    typeof marker !== 'object' ||
    !('version' in marker) ||
    marker.version !== currentVersion ||
    !('digest' in marker) ||
    typeof marker.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(marker.digest)
  )
    throw new Error('Invalid installation record. Reinstall Bonko using the published installer.');
  const release = await (dependencies.latestRelease ?? latestRelease)();
  if (
    !release ||
    typeof release !== 'object' ||
    !('tag_name' in release) ||
    typeof release.tag_name !== 'string' ||
    !release.tag_name.startsWith('v') ||
    !stable.test(release.tag_name.slice(1)) ||
    !('draft' in release) ||
    release.draft !== false ||
    !('prerelease' in release) ||
    release.prerelease !== false
  )
    throw new Error('Latest release is not a valid stable Bonko release. Nothing was installed.');
  const version = release.tag_name.slice(1);
  const current = currentVersion.split('.').map(BigInt);
  const target = version.split('.').map(BigInt);
  const difference = target.findIndex((part, index) => part !== current[index]);
  if (difference === -1 || target[difference] < current[difference])
    return { upgraded: false, version: currentVersion, latestVersion: version };
  const prefix = path.dirname(versions);
  const binDir = path.dirname(entry);
  try {
    await access(prefix, constants.W_OK);
    await access(versions, constants.W_OK);
    await access(binDir, constants.W_OK);
  } catch {
    throw new Error(
      'Installation is not writable. Retry with the account or privileges used to install Bonko; upgrade does not elevate privileges automatically.',
    );
  }
  await (dependencies.runInstaller ?? runUpgradeInstaller)([
    path.join(root, 'scripts/upgrade-install.mjs'),
    version,
    prefix,
    binDir,
  ]);
  return { upgraded: true, version, latestVersion: version };
}
