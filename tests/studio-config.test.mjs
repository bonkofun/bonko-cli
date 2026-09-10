import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProject, toolRoot } from '../dist-cli/project.js';
import { readStudioConfig, saveStudioConfig } from '../dist-cli/engine/studio-config.js';
import { standaloneServerFor } from '../dist-cli/engine/runtime-dev.js';
import { withoutPreviewMetadata } from '../dist-cli/engine/preview-photos.js';

test('Studio configuration persists metadata and rejects conflicts, invalid input and symlinks', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'bonko-settings-'));
  try {
    const { root } = await createProject('settings-note', parent);
    const file = path.join(root, 'manifest.json');
    const original = JSON.parse(await readFile(file, 'utf8'));
    const compiler = await readFile(path.join(root, 'tsconfig.json'), 'utf8');
    const snapshot = await readStudioConfig(root);
    const next = {
      ...snapshot.settings,
      maxPhotos: 4,
      description: 'Four little moments.',
      author: 'Jamie',
      tags: ['Birthday'],
      access: 'premium',
      priceCents: 499,
    };
    const saved = await saveStudioConfig(root, { revision: snapshot.revision, settings: next });
    assert.deepEqual(saved.settings, next);
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(manifest.assets, original.assets);
    assert.deepEqual(manifest.sample, original.sample);
    assert.equal(manifest.config.suggestedPriceCurrency, 'USD');
    assert.equal(await readFile(path.join(root, 'tsconfig.json'), 'utf8'), compiler);
    assert.equal(withoutPreviewMetadata(manifest.config).suggestedPriceCents, undefined);
    await assert.rejects(
      saveStudioConfig(root, { revision: snapshot.revision, settings: next }),
      /changed outside/,
    );
    for (const patch of [
      { maxPhotos: 11 },
      { priceCents: -1 },
      { access: 'free', priceCents: 499 },
      { tags: ['x'.repeat(21)] },
      { author: '' },
      { entry: 'other.js' },
    ]) {
      await assert.rejects(
        saveStudioConfig(root, { revision: saved.revision, settings: { ...next, ...patch } }),
      );
      assert.equal((await readStudioConfig(root)).revision, saved.revision);
    }
    await writeFile(file, JSON.stringify({ ...manifest, name: 'Edited externally' }));
    await assert.rejects(
      saveStudioConfig(root, { revision: saved.revision, settings: next }),
      /changed outside/,
    );
    assert.deepEqual(
      (await readdir(root)).filter((name) => name.startsWith('.manifest-')),
      [],
    );
    assert.deepEqual(
      (await readdir(path.join(root, '.bonko'))).filter((name) => name.endsWith('.lock')),
      [],
    );
    const outside = path.join(parent, 'outside.json');
    await writeFile(outside, JSON.stringify(manifest));
    await rm(file);
    await symlink(outside, file);
    await assert.rejects(readStudioConfig(root), /regular file/);
    await assert.rejects(
      saveStudioConfig(root, { revision: saved.revision, settings: next }),
      /regular file/,
    );
    assert.equal(await readFile(outside, 'utf8'), JSON.stringify(manifest));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('Studio configuration endpoint authenticates writes and limits them to discovered projects', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'bonko-settings-api-'));
  let server;
  try {
    const project = await createProject('settings-note', parent);
    server = await standaloneServerFor(project.root, project.slug, toolRoot, 0);
    const html = await (await fetch(server.origin)).text();
    const token = /__BONKO_PREVIEW_TOKEN__="([a-f0-9]+)"/.exec(html)[1];
    const endpoint = `${server.origin}/__bonko/settings?slug=settings-note`;
    const headers = { 'x-bonko-preview': token, 'content-type': 'application/json' };
    assert.equal((await fetch(endpoint, { method: 'PUT', body: '{}' })).status, 403);
    assert.equal(
      (
        await fetch(endpoint, {
          method: 'PUT',
          headers: { ...headers, origin: 'https://example.com' },
          body: '{}',
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(`${server.origin}/__bonko/settings?slug=../outside`, { headers })).status,
      404,
    );
    assert.equal((await fetch(endpoint, { method: 'PUT', headers, body: '{' })).status, 400);
    assert.equal(
      (await fetch(endpoint, { method: 'PUT', headers, body: 'x'.repeat(17000) })).status,
      413,
    );
    const before = await (await fetch(endpoint, { headers })).json();
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ...before, settings: { ...before.settings, maxPhotos: 3 } }),
    });
    assert.equal(response.status, 200);
    assert.equal((await readStudioConfig(project.root)).settings.maxPhotos, 3);
  } finally {
    await server?.close();
    await rm(parent, { recursive: true, force: true });
  }
});
