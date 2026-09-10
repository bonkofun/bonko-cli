import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseTemplateSubmission } from '@bonko/template-sdk/submission';
import { safeDirectory } from '../project.js';
import { ensureBrowser } from '../browser.js';
import { errorCode, errorMessage } from '../errors.js';
import { readTemplateSource } from './runtime-build.js';
import { StudioConfigError } from './studio-config.js';
import type { CheckReport } from './runtime-check.js';

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const fingerprint = (files: Record<string, Buffer>) =>
  hash(
    JSON.stringify(
      Object.keys(files)
        .sort()
        .map((name) => [name, hash(files[name])]),
    ),
  );
export function nextPackageVersion(input: unknown, current: string) {
  if (
    typeof input !== 'string' ||
    !/^[1-9]\d*\.0$/.test(input) ||
    !Number.isSafeInteger(Number(input)) ||
    Number(input) <= Number(current)
  )
    throw new StudioConfigError(
      422,
      `Use an N.0 version greater than ${current}, for example ${Number(current) + 1}.0`,
    );
  return input;
}
export async function packageSummary(root: string) {
  const file = path.join(root, 'manifest.json');
  if (!(await lstat(file)).isFile())
    throw new StudioConfigError(422, 'manifest.json must be a regular file');
  const text = await readFile(file, 'utf8');
  const manifest = parseTemplateSubmission(JSON.parse(text));
  let current = Number(manifest.version);
  try {
    const directory = path.join(root, 'dist');
    if (!(await lstat(directory)).isDirectory())
      throw new StudioConfigError(422, 'dist must be a regular directory');
    for (const name of await readdir(directory)) {
      if (!name.startsWith(`${manifest.slug}-`)) continue;
      const version = name
        .slice(manifest.slug.length + 1)
        .match(/^([1-9]\d*\.0)\.bonko\.zip$/)?.[1];
      if (version && Number.isSafeInteger(Number(version)))
        current = Math.max(current, Number(version));
    }
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
  return {
    revision: hash(text),
    slug: manifest.slug,
    name: manifest.name,
    version: manifest.version,
    currentVersion: `${current}.0`,
    tags: manifest.tags,
    description: manifest.description,
    author: manifest.author,
    maxPhotos: Number(manifest.config.maxPhotos ?? 1),
    priceCents: Number(manifest.config.suggestedPriceCents ?? 0),
  };
}
export type PackageJob = {
  id: string;
  version: string;
  state: 'running' | 'complete' | 'failed';
  phase: string;
  error?: string;
  filename?: string;
  sha256?: string;
  checks?: string[];
  manual?: string[];
};
type Runner = (
  root: string,
  slug: string,
  toolRoot: string,
) => Promise<CheckReport & { files: string[] }>;
export function createPackageService(toolRoot: string, runner?: Runner) {
  const jobs = new Map<string, PackageJob>();
  const pending = new Set<Promise<void>>();
  let closed = false;
  return {
    job(root: string) {
      return jobs.get(root) ?? null;
    },
    async close() {
      closed = true;
      await Promise.allSettled(pending);
    },
    async start(root: string, slug: string, input: unknown) {
      if (closed) throw new StudioConfigError(503, 'Studio is shutting down');
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new StudioConfigError(422, 'Version and revision are required');
      const value = input as Record<string, unknown>;
      if (jobs.get(root)?.state === 'running')
        throw new StudioConfigError(409, 'A package check is already running');
      await safeDirectory(root, '.bonko');
      const lockPath = path.join(root, '.bonko', 'studio-config.lock');
      let lock;
      try {
        lock = await open(lockPath, 'wx');
      } catch {
        throw new StudioConfigError(409, 'A save or package operation is already running');
      }
      const unlock = async () => {
        try {
          await lock.close();
        } finally {
          await rm(lockPath, { force: true });
        }
      };
      let version: string;
      let files: Record<string, Buffer>;
      try {
        const summary = await packageSummary(root);
        if (summary.slug !== slug)
          throw new StudioConfigError(422, 'Manifest slug must match the project');
        if (summary.revision !== value.revision)
          throw new StudioConfigError(
            409,
            'Configuration changed. Refresh package details before continuing.',
          );
        version = nextPackageVersion(value.version, summary.currentVersion);
        files = await readTemplateSource(root);
        if (hash(files['manifest.json']) !== summary.revision)
          throw new StudioConfigError(409, 'Configuration changed. Refresh package details.');
      } catch (error) {
        await unlock();
        throw error;
      }
      const job: PackageJob = {
        id: randomUUID(),
        version,
        state: 'running',
        phase: 'Preparing template snapshot',
      };
      jobs.set(root, job);
      const operation = (async () => {
        let stage: string | undefined;
        let output: string | undefined;
        let created = false;
        const manifestTemp = path.join(root, `.manifest-${job.id}.tmp`);
        try {
          if (!runner) await ensureBrowser(true);
          stage = await mkdtemp(path.join(tmpdir(), 'bonko-studio-pack-'));
          const project = path.join(stage, slug);
          const manifest = { ...JSON.parse(files['manifest.json'].toString('utf8')), version };
          parseTemplateSubmission(manifest);
          for (const [name, bytes] of Object.entries(files)) {
            const target = path.join(project, name);
            await mkdir(path.dirname(target), { recursive: true });
            await writeFile(
              target,
              name === 'manifest.json' ? JSON.stringify(manifest, null, 2) + '\n' : bytes,
              { flag: 'wx' },
            );
          }
          await safeDirectory(project, '.bonko', 'checks');
          job.phase = 'Running browser checks and packing';
          const pack = runner ?? (await import('./runtime-check.js')).packStandalone;
          const result = await pack(project, slug, toolRoot);
          if (!result.ok) throw new Error('Package verification failed');
          const filename = `${slug}-${version}.bonko.zip`;
          const archive = await readFile(path.join(project, 'dist', filename));
          if (fingerprint(await readTemplateSource(root)) !== fingerprint(files))
            throw new StudioConfigError(
              409,
              'Template files changed during checks. No package was saved; try again.',
            );
          job.phase = 'Saving verified package';
          await safeDirectory(root, 'dist');
          output = path.join(root, 'dist', filename);
          await writeFile(manifestTemp, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
          await writeFile(output, archive, { flag: 'wx' });
          created = true;
          if (fingerprint(await readTemplateSource(root)) !== fingerprint(files))
            throw new StudioConfigError(409, 'Template files changed during save; try again.');
          await rename(manifestTemp, path.join(root, 'manifest.json'));
          created = false;
          Object.assign(job, {
            state: 'complete',
            phase: 'Package ready',
            filename,
            sha256: hash(archive),
            checks: result.checks,
            manual: result.manual,
          });
        } catch (error) {
          job.state = 'failed';
          job.phase = 'Package failed';
          job.error = errorMessage(error);
        } finally {
          try {
            if (created && output) await rm(output, { force: true });
            await rm(manifestTemp, { force: true });
            if (stage) await rm(stage, { recursive: true, force: true });
          } finally {
            await unlock();
          }
        }
      })();
      pending.add(operation);
      void operation
        .finally(() => pending.delete(operation))
        .catch(() => {
          job.state = 'failed';
          job.error =
            'Package cleanup failed. Inspect local temporary files and lock before retrying.';
        });
      return job;
    },
    async download(root: string, id: string | null) {
      const job = jobs.get(root);
      if (!job || job.id !== id || job.state !== 'complete' || !job.filename)
        throw new StudioConfigError(404, 'Package is not ready');
      if (!(await lstat(path.join(root, 'dist'))).isDirectory())
        throw new StudioConfigError(409, 'Package directory changed');
      const file = path.join(root, 'dist', job.filename);
      if (!(await lstat(file)).isFile()) throw new StudioConfigError(409, 'Package file changed');
      const bytes = await readFile(file);
      if (hash(bytes) !== job.sha256) throw new StudioConfigError(409, 'Package file changed');
      return { filename: job.filename, bytes };
    },
  };
}
