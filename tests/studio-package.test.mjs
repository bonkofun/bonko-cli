import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProject, toolRoot } from '../dist-cli/project.js';
import {
  createPackageService,
  packageSummary,
  nextPackageVersion,
} from '../dist-cli/engine/studio-package.js';

test('Pack versions must increase and use the template version protocol', () => {
  for (const version of ['1.0', '2.0', '2.1', '3', '03.0', '../4.0', 4, '9007199254740992.0'])
    assert.throws(() => nextPackageVersion(version, '2.0'));
  assert.equal(nextPackageVersion('3.0', '2.0'), '3.0');
});
test('Studio packaging checks a snapshot, saves a versioned archive and rejects stale or changed input', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'bonko-package-test-'));
  let release;
  const gate = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  let wait = gate();
  const service = createPackageService(toolRoot, async (root, slug) => {
    await wait;
    const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
    await mkdir(path.join(root, 'dist'));
    await writeFile(
      path.join(root, 'dist', slug + '-' + manifest.version + '.bonko.zip'),
      'verified fixture archive',
    );
    return { ok: true, checks: ['fixture'], manual: [], files: [] };
  });
  try {
    const { root } = await createProject('package-note', parent);
    const original = await readFile(path.join(root, 'manifest.json'), 'utf8');
    const summary = await packageSummary(root);
    await assert.rejects(
      service.start(root, 'package-note', { version: '2.0', revision: 'stale' }),
      /changed/,
    );
    const job = await service.start(root, 'package-note', {
      version: '2.0',
      revision: summary.revision,
    });
    assert.equal(await readFile(path.join(root, 'manifest.json'), 'utf8'), original);
    await assert.rejects(
      service.start(root, 'package-note', { version: '2.0', revision: summary.revision }),
      /already running/,
    );
    release();
    while (job.state === 'running') await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(job.state, 'complete', job.error);
    assert.equal((await packageSummary(root)).version, '2.0');
    assert.equal((await service.download(root, job.id)).filename, 'package-note-2.0.bonko.zip');
    await writeFile(path.join(root, 'dist', job.filename), 'tampered');
    await assert.rejects(service.download(root, job.id), /changed/);
    await new Promise((resolve) => setTimeout(resolve, 50));
    wait = gate();
    const latest = await packageSummary(root);
    const changed = await service.start(root, 'package-note', {
      version: '3.0',
      revision: latest.revision,
    });
    await writeFile(path.join(root, 'LICENSE.md'), 'Changed during checks');
    release();
    while (changed.state === 'running') await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(changed.state, 'failed');
    assert.match(changed.error, /changed during checks/);
    assert.equal((await packageSummary(root)).version, '2.0');
    await assert.rejects(readFile(path.join(root, 'dist', 'package-note-3.0.bonko.zip')), {
      code: 'ENOENT',
    });
  } finally {
    release?.();
    await service.close();
    await rm(parent, { recursive: true, force: true });
  }
});

test(
  'Pack tab runs real verification and downloads the versioned template',
  { timeout: 120000 },
  async () => {
    const { standaloneServerFor } = await import('../dist-cli/engine/runtime-dev.js');
    const { chromium } = await import('@playwright/test');
    const parent = await mkdtemp(path.join(tmpdir(), 'bonko-pack-browser-'));
    let server, browser;
    try {
      const project = await createProject('pack-browser', parent);
      server = await standaloneServerFor(project.root, project.slug, toolRoot, 0);
      const html = await (await fetch(server.origin)).text();
      const token = /__BONKO_PREVIEW_TOKEN__="([a-f0-9]+)"/.exec(html)[1];
      const endpoint = server.origin + '/__bonko/package?slug=pack-browser';
      const headers = { 'x-bonko-preview': token, 'content-type': 'application/json' };
      assert.equal((await fetch(endpoint)).status, 403);
      assert.equal(
        (await fetch(endpoint, { headers: { ...headers, origin: 'https://example.com' } })).status,
        403,
      );
      assert.equal(
        (await fetch(server.origin + '/__bonko/package?slug=../outside', { headers })).status,
        404,
      );
      assert.equal((await fetch(endpoint, { method: 'POST', headers, body: '{' })).status, 400);
      browser = await chromium.launch();
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
      await page.goto(server.origin);
      await page.getByRole('tab', { name: 'Pack', exact: true }).click();
      await page.getByLabel('New version').waitFor();
      assert.equal(await page.getByLabel('New version').inputValue(), '2.0');
      await page.getByLabel('New version').fill('1.0');
      assert.equal(
        await page.getByRole('button', { name: 'Check & pack', exact: true }).isDisabled(),
        true,
      );
      await page.getByLabel('New version').fill('2.0');
      await page.getByRole('button', { name: 'Check & pack', exact: true }).click();
      await page.getByRole('button', { name: 'Download package' }).waitFor({ timeout: 90000 });
      assert.equal(
        JSON.parse(await readFile(path.join(project.root, 'manifest.json'), 'utf8')).version,
        '2.0',
      );
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download package' }).click();
      const download = await downloadEvent;
      assert.equal(download.suggestedFilename(), 'pack-browser-2.0.bonko.zip');
      const downloaded = await readFile(await download.path());
      assert.deepEqual(
        downloaded,
        await readFile(path.join(project.root, 'dist', download.suggestedFilename())),
      );
      assert.equal(downloaded.subarray(0, 2).toString(), 'PK');
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
      );
    } finally {
      await browser?.close();
      await server?.close();
      await rm(parent, { recursive: true, force: true });
    }
  },
);

test('Failed verification keeps the manifest and existing packages untouched', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'bonko-pack-failure-'));
  const service = createPackageService(toolRoot, async () => {
    throw new Error('Browser check failed');
  });
  try {
    const { root } = await createProject('failed-package', parent);
    await mkdir(path.join(root, 'dist'));
    const existing = path.join(root, 'dist', 'failed-package-3.0.bonko.zip');
    await writeFile(existing, 'existing archive');
    const before = await readFile(path.join(root, 'manifest.json'), 'utf8');
    const summary = await packageSummary(root);
    assert.equal(summary.currentVersion, '3.0');
    await assert.rejects(
      service.start(root, 'failed-package', { version: '3.0', revision: summary.revision }),
      /greater/,
    );
    const job = await service.start(root, 'failed-package', {
      version: '4.0',
      revision: summary.revision,
    });
    await service.close();
    assert.equal(job.state, 'failed');
    assert.match(job.error, /Browser check failed/);
    assert.equal(await readFile(path.join(root, 'manifest.json'), 'utf8'), before);
    assert.equal(await readFile(existing, 'utf8'), 'existing archive');
    await assert.rejects(readFile(path.join(root, '.bonko', 'studio-config.lock')), {
      code: 'ENOENT',
    });
    await assert.rejects(readFile(path.join(root, 'dist', 'failed-package-4.0.bonko.zip')), {
      code: 'ENOENT',
    });
  } finally {
    await service.close();
    await rm(parent, { recursive: true, force: true });
  }
});
