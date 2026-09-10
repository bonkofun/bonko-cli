import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, writeFile, rename, rm, open } from 'node:fs/promises';
import path from 'node:path';
import { parseTemplateSubmission } from '@bonko/template-sdk/submission';
import { safeDirectory } from '../project.js';
import { validatePreviewPhotos } from './preview-photos.js';

export class StudioConfigError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type StudioSettings = {
  name: string;
  description: string;
  author: string;
  tags: string[];
  maxPhotos: number;
  access: 'free' | 'premium';
  priceCents: number;
};
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
async function source(root: string) {
  const file = path.join(root, 'manifest.json');
  if (!(await lstat(file)).isFile())
    throw new StudioConfigError(422, 'manifest.json must be a regular file');
  return { file, text: await readFile(file, 'utf8') };
}
export async function readStudioConfig(root: string) {
  const { text } = await source(root);
  const manifest = parseTemplateSubmission(JSON.parse(text));
  return {
    revision: digest(text),
    settings: {
      name: manifest.name,
      description: manifest.description,
      author: manifest.author,
      tags: manifest.tags,
      maxPhotos: Number(manifest.config.maxPhotos ?? 1),
      access: manifest.access,
      priceCents: Number(manifest.config.suggestedPriceCents ?? 0),
    } satisfies StudioSettings,
  };
}
export async function saveStudioConfig(root: string, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new StudioConfigError(422, 'Invalid settings');
  const value = input as Record<string, unknown>;
  if (
    typeof value.revision !== 'string' ||
    !value.settings ||
    typeof value.settings !== 'object' ||
    Array.isArray(value.settings)
  )
    throw new StudioConfigError(422, 'Settings and revision are required');
  const settings = value.settings as Record<string, unknown>;
  const allowed = ['name', 'description', 'author', 'tags', 'maxPhotos', 'access', 'priceCents'];
  if (Object.keys(settings).some((key) => !allowed.includes(key)))
    throw new StudioConfigError(422, 'Unknown settings field');
  if (
    !Number.isInteger(settings.maxPhotos) ||
    Number(settings.maxPhotos) < 1 ||
    Number(settings.maxPhotos) > 10
  )
    throw new StudioConfigError(422, 'Photo count must be between 1 and 10');
  if (
    !Number.isSafeInteger(settings.priceCents) ||
    Number(settings.priceCents) < 0 ||
    Number(settings.priceCents) > 999999 ||
    (settings.access === 'premium' && Number(settings.priceCents) === 0)
  )
    throw new StudioConfigError(422, 'Premium price must be between $0.01 and $9,999.99');
  if (settings.access === 'free' && settings.priceCents !== 0)
    throw new StudioConfigError(422, 'Free templates must have a zero price');
  await safeDirectory(root, '.bonko');
  const lockPath = path.join(root, '.bonko', 'studio-config.lock');
  let lock;
  try {
    lock = await open(lockPath, 'wx');
  } catch {
    throw new StudioConfigError(409, 'Another settings save is in progress');
  }
  const temporary = path.join(root, `.manifest-${randomUUID()}.tmp`);
  try {
    const { file, text } = await source(root);
    if (digest(text) !== value.revision)
      throw new StudioConfigError(
        409,
        'manifest.json changed outside this form. Reload settings before saving.',
      );
    const raw = JSON.parse(text);
    const updated = {
      ...raw,
      name: settings.name,
      description: settings.description,
      author: settings.author,
      tags: settings.tags,
      access: settings.access,
      config: {
        ...raw.config,
        maxPhotos: settings.maxPhotos,
        suggestedPriceCents: settings.priceCents,
        suggestedPriceCurrency: 'USD',
      },
    };
    try {
      const parsed = parseTemplateSubmission(updated);
      validatePreviewPhotos(parsed);
      updated.tags = parsed.tags;
    } catch (error) {
      throw new StudioConfigError(
        422,
        error instanceof Error ? error.message : 'Invalid template configuration',
      );
    }
    await writeFile(temporary, JSON.stringify(updated, null, 2) + '\n', { flag: 'wx' });
    if ((await source(root)).text !== text)
      throw new StudioConfigError(
        409,
        'manifest.json changed during save. Reload settings before saving.',
      );
    await rename(temporary, file);
    return await readStudioConfig(root);
  } finally {
    try {
      await rm(temporary, { force: true });
    } finally {
      try {
        await lock.close();
      } finally {
        await rm(lockPath, { force: true });
      }
    }
  }
}
