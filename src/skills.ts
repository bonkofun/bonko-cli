import { lstat, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { errorCode } from './errors.js';
import { findProject, packageInfo, safeDirectory, toolRoot } from './project.js';

/** Only CLI-distributed guidance is updated; template source and extra skills are untouched. */
export async function updateSkills(start = process.cwd()) {
  const project = await findProject(start);
  const files = [
    ['AGENTS.md', 'scaffolds/agent/AGENTS.md'],
    ['DEVELOPMENT.md', 'docs/PROTOCOL.md'],
    ...['bonko-template-author', 'bonko-template-verify'].map((name) => [
      `.agents/skills/${name}/SKILL.md`,
      `scaffolds/agent/skills/${name}/SKILL.md`,
    ]),
  ];
  const state = await safeDirectory(project.root, '.bonko');
  const lockPath = path.join(state, 'skills-update.lock');
  const lock = await open(lockPath, 'wx').catch((error: unknown) => {
    if (errorCode(error) === 'EEXIST')
      throw new Error(
        `Skills update is locked. If a previous update was interrupted, verify it is no longer running before removing ${lockPath}.`,
      );
    throw error;
  });
  const id = randomUUID();
  const temporary: string[] = [];
  let backupDirectory: string | null = null;
  try {
    const changes: { relative: string; target: string; next: Buffer; previous: Buffer | null }[] =
      [];
    const unchanged: string[] = [];
    // Check the entire allowlist before replacing any guidance.
    for (const [relative, source] of files) {
      const target = path.join(project.root, relative);
      await safeDirectory(
        project.root,
        ...path
          .dirname(relative)
          .split('/')
          .filter((part) => part !== '.'),
      );
      const stat = await lstat(target).catch((error: unknown) => {
        if (errorCode(error) === 'ENOENT') return null;
        throw error;
      });
      if (stat && (!stat.isFile() || stat.isSymbolicLink()))
        throw new Error(`Refusing to replace non-regular guidance file: ${target}`);
      const previous = stat ? await readFile(target) : null;
      const next = await readFile(path.join(toolRoot, source));
      if (previous?.equals(next)) unchanged.push(relative);
      else changes.push({ relative, target, next, previous });
    }
    if (changes.length) {
      backupDirectory = await safeDirectory(project.root, '.bonko', 'skills-backups', id);
      for (const change of changes) {
        if (!change.previous) continue;
        const parent = await safeDirectory(
          backupDirectory,
          ...path
            .dirname(change.relative)
            .split('/')
            .filter((part) => part !== '.'),
        );
        await writeFile(path.join(parent, path.basename(change.relative)), change.previous, {
          flag: 'wx',
        });
      }
      await writeFile(
        path.join(backupDirectory, 'update.json'),
        JSON.stringify(
          {
            version: packageInfo.version,
            files: changes.map(({ relative, previous }) => ({
              path: relative,
              existed: previous !== null,
            })),
          },
          null,
          2,
        ),
        { flag: 'wx' },
      );
      for (const change of changes) {
        const temp = `${change.target}.${id}.tmp`;
        temporary.push(temp);
        await writeFile(temp, change.next, { flag: 'wx' });
      }
      for (let i = 0; i < changes.length; i++) await rename(temporary[i], changes[i].target);
    }
    return {
      ok: true,
      root: project.root,
      version: packageInfo.version,
      updated: changes.map(({ relative }) => relative),
      unchanged,
      backupDirectory,
    };
  } catch (error) {
    if (backupDirectory)
      throw new Error(
        `Skills update did not finish. Review available backups in ${backupDirectory} before retrying.`,
        { cause: error },
      );
    throw error;
  } finally {
    try {
      await Promise.all(temporary.map((file) => rm(file, { force: true })));
    } finally {
      await lock.close();
      await rm(lockPath);
    }
  }
}
