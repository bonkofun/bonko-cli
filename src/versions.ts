import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { errorCode } from './errors.js';

const run = promisify(execFile);

/** Select an already-installed release; never download code or alter project pins. */
export async function useInstalledVersion(version: string, toolRoot: string, launcher: string) {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error('Use a stable version such as bonko use 0.1.1.');
  const currentVersionDirectory = path.resolve(toolRoot, '../../..');
  const versions = path.dirname(currentVersionDirectory);
  if (path.basename(versions) !== 'versions')
    throw new Error(
      'Version switching requires an installed CLI. Workspace checkouts cannot change the global command.',
    );
  const prefix = path.dirname(versions);
  await readFile(path.join(currentVersionDirectory, '.bonko-install.json'), 'utf8');
  const entry = path.resolve(launcher);
  const lock = path.join(prefix, '.install-lock');
  await mkdir(lock).catch((error) => {
    if (errorCode(error) === 'EEXIST')
      throw new Error('An installation or version switch is active. Retry when it finishes.');
    throw error;
  });
  const temporaryEntry = path.join(path.dirname(entry), `.bonko-${randomUUID()}`);
  try {
    await writeFile(
      path.join(lock, 'owner.json'),
      JSON.stringify({ pid: process.pid, hostname: hostname() }),
      { flag: 'wx' },
    );
    if (!(await lstat(entry)).isSymbolicLink())
      throw new Error('Refusing to replace a command that is not an installation symlink.');
    const current = await realpath(entry);
    if (current !== path.join(toolRoot, 'bin/bonko.mjs'))
      throw new Error(
        'The command changed during version selection. Retry using the active bonko command.',
      );
    const directory = path.join(versions, version);
    let markerText: string;
    try {
      markerText = await readFile(path.join(directory, '.bonko-install.json'), 'utf8');
    } catch (error) {
      if (errorCode(error) === 'ENOENT')
        throw new Error(
          `Bonko ${version} is not installed. Download its installer from https://github.com/bonkofun/bonko-cli/releases/tag/v${version}.`,
        );
      throw error;
    }
    const marker: unknown = JSON.parse(markerText);
    if (
      !marker ||
      typeof marker !== 'object' ||
      !('version' in marker) ||
      marker.version !== version ||
      !('digest' in marker) ||
      typeof marker.digest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(marker.digest)
    )
      throw new Error('Invalid installation record. Reinstall this version.');
    if ((await lstat(directory)).isSymbolicLink())
      throw new Error('Refusing a linked version directory.');
    const executable = path.join(directory, 'node_modules/@bonkofun/cli/bin/bonko.mjs');
    if ((await realpath(executable)) !== executable)
      throw new Error('Refusing a linked executable path.');
    const { stdout } = await run(process.execPath, [executable, 'version', '--json'], {
      timeout: 15000,
      maxBuffer: 64 * 1024,
    });
    const result: unknown = JSON.parse(stdout);
    if (
      !result ||
      typeof result !== 'object' ||
      !('version' in result) ||
      result.version !== version
    )
      throw new Error('Installed CLI version verification failed.');
    await symlink(executable, temporaryEntry);
    await rename(temporaryEntry, entry);
    return { version, command: entry };
  } finally {
    try {
      await rm(temporaryEntry, { force: true });
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
}
