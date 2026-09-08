import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validatePreviewPhotos } from '../dist-cli/engine/preview-photos.js';
import { createProject } from '../dist-cli/project.js';
import { buildRuntime } from '../dist-cli/engine/runtime-build.js';

const assets = {
  cover: { kind: 'image', path: 'assets/cover.webp' },
  demo: { kind: 'image', path: 'assets/demo.webp' },
  second: { kind: 'image', path: 'assets/second.webp' },
  audio: { kind: 'audio', path: 'assets/sound.mp3' },
};
test('preview photo metadata permits old drafts and validates complete distinct image references', () => {
  const manifest = { assets, cover: 'cover', config: {} };
  validatePreviewPhotos(manifest);
  validatePreviewPhotos({
    ...manifest,
    config: { previewPhoto1: 'demo', previewCaption1: 'A happy memory' },
  });
  validatePreviewPhotos({
    ...manifest,
    config: {
      maxPhotos: 2,
      previewPhoto1: 'demo',
      previewCaption1: 'First memory',
      previewPhoto2: 'second',
      previewCaption2: 'Second memory',
    },
  });
  for (const config of [
    { previewPhoto1: 'missing' },
    { previewPhoto1: 'audio' },
    { previewPhoto1: 'cover' },
    { maxPhotos: 2, previewPhoto1: 'demo' },
    { maxPhotos: 2, previewPhoto1: 'demo', previewPhoto2: 'demo' },
    { maxPhotos: 1, previewPhoto1: 'demo', previewPhoto2: 'second' },
    { maxPhotos: 11, previewPhoto1: 'demo' },
  ])
    assert.throws(() => validatePreviewPhotos({ ...manifest, config }));
});

test('declared demo photos are included in the verified bundle and missing files fail the build', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'bonko-demo-assets-'));
  try {
    const project = await createProject('demo-photos', parent);
    const manifest = JSON.parse(await readFile(path.join(project.root, 'manifest.json'), 'utf8'));
    manifest.assets.demo = { kind: 'image', path: 'assets/demo.webp' };
    manifest.config.previewPhoto1 = 'demo';
    manifest.config.previewCaption1 = 'A happy memory';
    const image = await readFile(path.join(project.root, 'assets/cover.webp'));
    // Synthetic bytes only: this test verifies packaging, not finished artwork quality.
    await writeFile(path.join(project.root, 'assets/demo.webp'), image);
    await writeFile(path.join(project.root, 'manifest.json'), JSON.stringify(manifest));
    const bundle = await buildRuntime(project.root, project.slug);
    assert.deepEqual(bundle.files['assets/demo.webp'], image);
    assert.equal(bundle.submission.config.previewPhoto1, 'demo');
    assert.equal(bundle.submission.config.previewCaption1, 'A happy memory');
    await rm(path.join(project.root, 'assets/demo.webp'));
    await assert.rejects(buildRuntime(project.root, project.slug), /Missing asset/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('every demonstration photo requires a nonempty caption bounded to 80 characters', () => {
  for (const value of ['', '   ', 'a'.repeat(81), 12]) {
    assert.throws(
      () =>
        validatePreviewPhotos({
          assets,
          cover: 'cover',
          config: { previewPhoto1: 'demo', previewCaption1: value },
        }),
      /previewCaption1/,
    );
  }
});
