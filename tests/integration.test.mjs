import { pathToFileURL } from 'node:url';
import { assertTemplateGuidance } from './helpers/template-guidance.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import {
  createProject,
  findWorkspaceOrProject,
  toolRoot,
  packageInfo,
} from '../dist-cli/project.js';
import { standaloneServerFor } from '../dist-cli/engine/runtime-dev.js';

async function run(file, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (data) => (stdout += data));
    child.stderr.on('data', (data) => (stderr += data));
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${file} exited ${code}: ${stderr}\n${stdout}`)),
    );
  });
}

test(
  'prebuilt Studio edits, reloads source, rejects unauthorized API calls and recovers from errors',
  { timeout: 60000 },
  async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'bonko-cli-preview-'));
    let server, browser;
    try {
      const project = await createProject('preview-note', parent);
      server = await standaloneServerFor(project.root, project.slug, toolRoot, 0);
      const occupiedPort = Number(new URL(server.origin).port);
      await assert.rejects(
        standaloneServerFor(project.root, project.slug, toolRoot, occupiedPort),
        (error) => {
          assert.equal(error.code, 'EADDRINUSE');
          assert.match(error.message, /already in use/);
          assert.match(error.message, /bonko dev --port/);
          assert.match(error.message, /kill [1-9]|lsof -nP/);
          assert.match(error.message, /No process was stopped/);
          return true;
        },
      );
      assert.equal((await fetch(server.origin + '/')).status, 200);
      assert.equal((await fetch(server.origin + '/__bonko/preview')).status, 403);
      assert.equal(
        (await fetch(server.origin + '/', { headers: { Origin: 'https://example.test' } })).status,
        403,
      );
      browser = await chromium.launch(
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : {},
      );
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(server.origin);
      const frame = page.frameLocator('[data-preview-layer="current"] iframe');
      await expect(frame.getByRole('heading')).toHaveText('Alex');
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Taylor');
      await expect(page.getByRole('button', { name: 'Apply content and crop' })).toHaveCount(0);
      await expect(frame.getByRole('heading')).toHaveText('Taylor');
      await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Live message');
      await expect(frame.getByText('Live message', { exact: true })).toBeVisible();
      await page.getByRole('tab', { name: 'Photo & framing', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Add photos', exact: true })).toBeVisible();
      await expect(page.getByText('0 / 1 photos', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Local photo', { exact: true })).toBeHidden();
      await page.getByRole('slider', { name: 'Scale', exact: true }).press('ArrowRight');
      await expect(frame.locator('img')).toHaveCSS('transform', 'matrix(1.05, 0, 0, 1.05, 0, 0)');
      await expect(page.locator('[data-static="ready"]')).toBeVisible();
      const cropSlider = page.getByRole('slider', { name: 'Horizontal crop', exact: true });
      await cropSlider.press('ArrowRight');
      await expect(frame.locator('img')).toHaveCSS('transform', 'matrix(1.05, 0, 0, 1.05, 1, 0)');
      // Every DOM mutation during repeated edits must retain a visible authored frame.
      await page.evaluate(() => {
        window.__previewGaps = [];
        window.__previewObserver = new MutationObserver(() => {
          const current = document.querySelector('[data-preview-layer="current"]');
          const iframe = current?.querySelector('iframe');
          if (!iframe || iframe.hidden || current.querySelector('.runtime-fallback')) {
            window.__previewGaps.push('missing authored frame');
          }
        });
        window.__previewObserver.observe(document.querySelector('.preview-stage'), {
          subtree: true,
          childList: true,
          attributes: true,
        });
      });
      for (let step = 0; step < 6; step++) {
        await cropSlider.press('ArrowRight');
        await expect(frame.locator('img')).toHaveCSS(
          'transform',
          `matrix(1.05, 0, 0, 1.05, ${step + 2}, 0)`,
        );
      }
      await expect(page.locator('iframe')).toHaveCount(1);
      await page.getByRole('button', { name: 'Replay', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveCount(0);
      await expect(page.locator('[data-preview-layer="current"] [role="status"]')).toHaveText(
        'natural',
      );
      const gaps = await page.evaluate(() => {
        window.__previewObserver.disconnect();
        return window.__previewGaps;
      });
      assert.deepEqual(gaps, []);
      await page.getByRole('tab', { name: 'Make it personal', exact: true }).click();
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Taylor again');
      await expect(frame.getByRole('heading')).toHaveText('Taylor again');
      await page.evaluate(() => {
        window.__previewGaps = [];
        window.__previewObserver = new MutationObserver(() => {
          const current = document.querySelector('[data-preview-layer="current"]');
          const iframe = current?.querySelector('iframe');
          if (!iframe || iframe.hidden || current.querySelector('.runtime-fallback')) {
            window.__previewGaps.push('missing authored frame');
          }
        });
        window.__previewObserver.observe(document.querySelector('.preview-stage'), {
          subtree: true,
          childList: true,
          attributes: true,
        });
      });
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Latest replay');
      await page.getByRole('button', { name: 'Replay', exact: true }).click();
      await expect(frame.getByRole('heading')).toHaveText('Latest replay');
      const secondGaps = await page.evaluate(() => {
        window.__previewObserver.disconnect();
        return window.__previewGaps;
      });
      assert.deepEqual(secondGaps, []);
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Taylor again');
      await expect(frame.getByRole('heading')).toHaveText('Taylor again');
      await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(page.getByRole('tab', { name: 'Audio', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Mute', exact: true })).toHaveCount(0);
      await expect(
        page.locator('.preview-toolbar').getByRole('button', { name: 'Replay', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Enter fullscreen preview', exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('aria-label')))
        .toBe('Live preview');
      await page.getByRole('button', { name: 'Exit fullscreen preview', exact: true }).click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
      await page.getByRole('button', { name: 'Enter fullscreen preview', exact: true }).click();
      await page
        .getByRole('button', { name: 'Exit fullscreen preview', exact: true })
        .press('Escape');
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
      const originalSize = await page.locator('.phone-frame').boundingBox();
      await page.getByRole('slider', { name: 'Size', exact: true }).press('Home');
      await expect
        .poll(async () => (await page.locator('.phone-frame').boundingBox()).height)
        .toBeLessThan(originalSize.height * 0.6);
      await page.getByRole('slider', { name: 'Size', exact: true }).press('End');
      for (const [width, height] of [
        [1440, 900],
        [1280, 720],
        [375, 1000],
        [390, 1000],
        [430, 1000],
      ]) {
        await page.setViewportSize({ width, height });
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                document.documentElement.scrollWidth <= innerWidth &&
                document.documentElement.scrollHeight <= innerHeight,
            ),
          )
          .toBe(true);
        await expect
          .poll(async () => {
            const device = await page.locator('.phone-frame').boundingBox();
            return device.height > 0 && device.y + device.height <= height;
          })
          .toBe(true);
      }
      const source = path.join(project.root, 'src/main.tsx'),
        original = await readFile(source, 'utf8');
      await writeFile(source, 'const bad: number = "wrong";');
      await expect(page.getByRole('alert')).toContainText('not assignable', { timeout: 15000 });
      await expect(page.locator('iframe')).toHaveCount(0);
      await writeFile(source, original);
      await expect(frame.getByRole('heading')).toHaveText('Taylor again', { timeout: 15000 });
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await server?.close();
      await rm(parent, { recursive: true, force: true });
    }
  },
);

test(
  'real release installs without source repos, then new/build/dev/check/pack work',
  { timeout: 240000 },
  async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'bonko-cli-release-'));
    try {
      await run(process.execPath, ['scripts/release.mjs'], toolRoot);
      const archive = path.join(toolRoot, `release/bonko-cli-${packageInfo.version}.tgz`);
      const digest = createHash('sha256')
        .update(await readFile(archive))
        .digest('hex');
      const prefix = path.join(parent, '工具 space');
      const installArgs = [
        path.join(toolRoot, 'install.sh'),
        '--archive',
        archive,
        '--sha256',
        digest,
        '--prefix',
        prefix,
      ];
      await run('/bin/sh', installArgs, parent);
      const executable = path.join(prefix, 'bin/bonko');
      assert.match(await run(executable, ['help'], parent), /bonko build/);
      assert.match(await run(executable, ['use', packageInfo.version], parent), /Selected Bonko/);
      await assert.rejects(
        access(
          path.join(prefix, 'versions', packageInfo.version, 'node_modules/@tailwindcss/vite'),
        ),
        { code: 'ENOENT' },
      );
      await access(
        path.join(
          prefix,
          `versions/${packageInfo.version}/node_modules/@bonkofun/cli/npm-shrinkwrap.json`,
        ),
      );
      assert.match(
        await readFile(
          path.join(prefix, `versions/${packageInfo.version}/node_modules/@bonkofun/cli/LICENSE`),
          'utf8',
        ),
        /MIT License/,
      );
      assert.match(await run(executable, ['browser', 'install'], parent), /Chromium is ready/);
      assert.equal(
        JSON.parse(await run(executable, ['version', '--json'], parent)).version,
        packageInfo.version,
      );
      const installedRoot = path.join(
        prefix,
        'versions',
        packageInfo.version,
        'node_modules/@bonkofun/cli',
      );
      await access(path.join(installedRoot, 'scripts/install.mjs'));
      await access(path.join(installedRoot, 'scripts/upgrade-install.mjs'));
      assert.match(await run(executable, ['help', 'upgrade'], parent), /latest stable/);
      const { upgrade } = await import(
        pathToFileURL(path.join(installedRoot, 'dist-cli/upgrade.js')).href
      );
      assert.equal(
        (
          await upgrade(installedRoot, executable, packageInfo.version, {
            latestRelease: async () => ({
              tag_name: `v${packageInfo.version}`,
              draft: false,
              prerelease: false,
            }),
          })
        ).upgraded,
        false,
      );
      await run(executable, ['new', 'release-note'], parent);
      const project = path.join(parent, 'release-note');
      // A fresh installation has no old CLI to fall back to after an upgrade.
      const oldMarker = JSON.stringify({ schemaVersion: 1, cliVersion: '0.1.8' });
      await writeFile(path.join(project, 'bonko.json'), oldMarker);
      await assertTemplateGuidance(project);
      await assert.rejects(access(path.join(project, 'node_modules')), { code: 'ENOENT' });
      const reservation = createServer();
      reservation.listen(0, '127.0.0.1');
      await once(reservation, 'listening');
      const port = reservation.address().port;
      await new Promise((resolve) => reservation.close(resolve));
      const dev = spawn(executable, ['dev', '--port', String(port), '--no-open'], {
        cwd: path.join(project, 'src'),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let devOutput = '';
      dev.stdout.on('data', (chunk) => {
        devOutput += chunk;
      });
      dev.stderr.on('data', (chunk) => {
        devOutput += chunk;
      });
      const exited = once(dev, 'exit');
      let previewBrowser;
      try {
        await expect.poll(() => devOutput, { timeout: 15000 }).toContain('Bonko Studio:');
        previewBrowser = await chromium.launch();
        const page = await previewBrowser.newPage();
        await page.goto(`http://127.0.0.1:${port}/`);
        await expect(
          page.frameLocator('[data-preview-layer="current"] iframe').getByRole('heading'),
        ).toHaveText('Alex');
      } finally {
        await previewBrowser?.close();
        dev.kill('SIGTERM');
        await exited;
      }
      const result = JSON.parse(await run(executable, ['build', '--json'], project));
      assert.equal(result.verified, false);
      await access(path.join(result.directory, 'runtime/entry.js'));
      await assert.rejects(access(path.join(project, 'dist')), { code: 'ENOENT' });
      const report = JSON.parse(
        await run(executable, ['check', '--no-download', '--json'], project),
      );
      assert.equal(report.ok, true);
      assert.ok(report.checks.includes('authored-static-reduced-motion'));
      const packed = JSON.parse(
        await run(executable, ['pack', '--no-download', '--json'], project),
      );
      assert.equal(packed.ok, true);
      assert.equal(await readFile(path.join(project, 'bonko.json'), 'utf8'), oldMarker);
      assert.ok((await readFile(packed.files[0])).length > 1000);
      assert.ok((await readdir(path.join(project, '.bonko/checks'))).includes('390.png'));
      // Idempotent installation keeps the same verified version and launcher.
      await run('/bin/sh', installArgs, parent);
      assert.equal(
        JSON.parse(await run(executable, ['version', '--json'], parent)).version,
        packageInfo.version,
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  },
);

test(
  'default sound survives static editing and replay and reaches the audio host',
  { timeout: 60000 },
  async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'bonko-audio-preview-'));
    let server, browser;
    try {
      const project = await createProject('sound-note', parent);
      const manifestFile = path.join(project.root, 'manifest.json');
      const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
      manifest.capabilities = ['audio'];
      await writeFile(manifestFile, JSON.stringify(manifest));
      const sourceFile = path.join(project.root, 'src/main.tsx');
      const source = await readFile(sourceFile, 'utf8');
      await writeFile(
        sourceFile,
        source.replace(
          "if (runtime.state === 'running') runtime.complete();",
          "if (runtime.state === 'running') { runtime.report('waiting'); runtime.audio.tone(440, 100); }",
        ),
      );
      server = await standaloneServerFor(project.root, project.slug, toolRoot, 0);
      browser = await chromium.launch();
      const page = await browser.newPage();
      await page.addInitScript(() => {
        window.__tones = 0;
        const original = AudioContext.prototype.createOscillator;
        AudioContext.prototype.createOscillator = function () {
          window.__tones++;
          return original.call(this);
        };
      });
      await page.goto(server.origin);
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Sound test');
      await expect(
        page.locator('[data-preview-layer="current"] [data-static="ready"]'),
      ).toBeVisible();
      const initialTones = await page.evaluate(() => window.__tones);
      for (let run = 1; run <= 2; run++) {
        await page.getByRole('button', { name: 'Replay', exact: true }).click();
        await expect.poll(() => page.evaluate(() => window.__tones)).toBe(initialTones + run);
      }
    } finally {
      await browser?.close();
      await server?.close();
      await rm(parent, { recursive: true, force: true });
    }
  },
);

test(
  'Studio batches photos, previews a selected photo and replays their ordered bytes',
  { timeout: 30000 },
  async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'bonko-cli-photos-'));
    let server, browser;
    try {
      const project = await createProject('photo-note', parent);
      const manifestPath = path.join(project.root, 'manifest.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      manifest.config.maxPhotos = 3;
      await writeFile(manifestPath, JSON.stringify(manifest));
      server = await standaloneServerFor(project.root, project.slug, toolRoot, 0);
      browser = await chromium.launch();
      const page = await browser.newPage();
      let photoInit = null;
      // Replay replaces the iframe; collect the init snapshot without retaining a Frame handle.
      await page.exposeFunction('__reportPhotoInit', (snapshot) => {
        photoInit = snapshot;
      });
      await page.addInitScript(() => {
        window.addEventListener('message', (event) => {
          if (event.data?.type !== 'init') return;
          const data = event.data;
          void window.__reportPhotoInit({
            count: data.config?.bonkoPhotoCount,
            transform: data.config?.bonkoPhotoTransform2,
            bytes: data.assets?.['bonko-photo-2']?.bytes?.byteLength,
            notes: data.config?.bonkoPhotoNotes1,
            primaryTransform: data.content?.photoTransform,
          });
        });
      });
      await page.goto(server.origin);
      await page.getByRole('tab', { name: 'Photo & framing' }).click();
      const buffer = await page.screenshot();
      await page
        .locator('#photo')
        .setInputFiles(
          ['first.png', 'second.png'].map((name) => ({ name, mimeType: 'image/png', buffer })),
        );
      await expect(page.getByText('2 / 3 photos', { exact: true })).toBeVisible();
      await page.getByLabel('Photo 1 description', { exact: true }).fill('First memory');
      await page.getByLabel('Photo 2 description', { exact: true }).fill('Second memory');
      await page.getByRole('button', { name: 'Drag photo 2 to reorder' }).press('ArrowUp');
      await expect(page.getByLabel('Photo 1 description', { exact: true })).toHaveValue(
        'Second memory',
      );
      const handle = page.getByRole('button', { name: 'Drag photo 1 to reorder' });
      await handle.hover();
      const source = await handle.boundingBox();
      const target = await page
        .getByRole('button', { name: 'Drag photo 2 to reorder' })
        .boundingBox();
      assert.ok(source && target);
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2 + 15, {
        steps: 16,
      });
      await page.mouse.up();
      await expect(page.getByLabel('Photo 1 description', { exact: true })).toHaveValue(
        'First memory',
      );
      await page.getByRole('button', { name: '2. second.png' }).click();
      await page.getByRole('slider', { name: 'Scale', exact: true }).press('ArrowRight');
      await page.getByRole('button', { name: '1. first.png' }).click();
      await page.getByRole('slider', { name: 'Scale', exact: true }).press('ArrowRight');
      await page.getByRole('slider', { name: 'Horizontal crop', exact: true }).press('ArrowLeft');
      await page.getByRole('slider', { name: 'Vertical crop', exact: true }).press('ArrowLeft');
      await page.getByRole('button', { name: 'Reset photo framing' }).click();
      for (const [name, value] of [
        ['Scale', '1'],
        ['Horizontal crop', '0'],
        ['Vertical crop', '0'],
      ]) {
        await expect(page.getByRole('slider', { name, exact: true })).toHaveAttribute(
          'aria-valuenow',
          value,
        );
      }
      await expect(page.getByRole('button', { name: 'Reset photo framing' })).toBeDisabled();
      await page.getByRole('button', { name: '2. second.png' }).click();
      await expect(page.getByRole('slider', { name: 'Scale', exact: true })).toHaveAttribute(
        'aria-valuenow',
        '1.05',
      );
      await page.getByRole('button', { name: '1. first.png' }).click();
      await expect(page.getByRole('slider', { name: 'Scale', exact: true })).toHaveAttribute(
        'aria-valuenow',
        '1',
      );

      await expect(
        page.locator('[data-preview-layer="current"] [data-static="ready"]'),
      ).toBeVisible();
      photoInit = null;
      await page.getByRole('button', { name: 'Replay', exact: true }).click();
      await expect
        .poll(() => photoInit)
        .toEqual({
          count: 2,
          transform: 'translate(0px, 0px) scale(1.05)',
          bytes: buffer.length,
          notes: 'First memory'.padEnd(80) + 'Second memory'.padEnd(80),
          primaryTransform: 'translate(0px, 0px) scale(1)',
        });
      await page
        .locator('#photo')
        .setInputFiles(
          ['third.png', 'fourth.png'].map((name) => ({ name, mimeType: 'image/png', buffer })),
        );
      await expect(page.getByText('This template supports up to 3 photos.')).toBeVisible();
      await expect(page.getByText('2 / 3 photos', { exact: true })).toBeVisible();
    } finally {
      await browser?.close();
      await server?.close();
      await rm(parent, { recursive: true, force: true });
    }
  },
);

test(
  'Studio in workshop mode lists cards and switches active preview',
  { timeout: 60000 },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'bonko-studio-workshop-'));
    let server, browser;
    try {
      await createProject('card-first', root);
      const card2 = await createProject('card-second', root);
      const card2Manifest = JSON.parse(
        await readFile(path.join(card2.root, 'manifest.json'), 'utf8'),
      );
      card2Manifest.name = 'Card Second';
      card2Manifest.sample.recipientName = 'SecondRecipient';
      await writeFile(
        path.join(card2.root, 'manifest.json'),
        JSON.stringify(card2Manifest, null, 2),
      );

      const discovered = await findWorkspaceOrProject(root);
      server = await standaloneServerFor(discovered, toolRoot, undefined, 0);

      browser = await chromium.launch(
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : {},
      );
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(server.origin);

      // Workshop switcher shows both cards
      await expect(page.getByRole('button', { name: /Card First/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Card Second/i })).toBeVisible();

      // Default first card loaded
      const frame1 = page.frameLocator('[data-preview-layer="current"] iframe');
      await expect(frame1.getByRole('heading')).toHaveText('Alex');

      // Click to switch to card-second
      await page.getByRole('button', { name: /Card Second/i }).click();

      // The heading in the new card preview should show SecondRecipient
      const frame2 = page.frameLocator('[data-preview-layer="current"] iframe');
      await expect(frame2.getByRole('heading')).toHaveText('SecondRecipient');
    } finally {
      await browser?.close();
      await server?.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  'Studio settings save, survive tab switches and reload into the photo limit',
  { timeout: 45000 },
  async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'bonko-studio-settings-'));
    let server, browser;
    try {
      const project = await createProject('settings-ui', parent);
      const manifestFile = path.join(project.root, 'manifest.json');
      const original = JSON.parse(await readFile(manifestFile, 'utf8'));
      const demoBytes = await readFile(
        path.join(project.root, original.assets[original.cover].path),
      );
      original.config.maxPhotos = 5;
      for (let index = 1; index <= 5; index++) {
        const id = `demo-${index}`;
        original.assets[id] = { kind: 'image', path: `assets/${id}.webp` };
        original.config[`previewPhoto${index}`] = id;
        original.config[`previewCaption${index}`] = `Memory ${index}`;
        await writeFile(path.join(project.root, `assets/${id}.webp`), demoBytes);
      }
      await writeFile(manifestFile, JSON.stringify(original));

      server = await standaloneServerFor(project.root, project.slug, toolRoot, 0);
      browser = await chromium.launch();
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      let demoCount = 0;
      await page.exposeFunction('__reportDemoCount', (count) => {
        demoCount = count;
      });
      await page.addInitScript(() => {
        window.addEventListener('message', (event) => {
          if (event.data?.type === 'init')
            void window.__reportDemoCount(event.data.config?.bonkoPhotoCount);
        });
      });
      await page.goto(server.origin);
      await page.getByRole('tab', { name: 'Template configuration' }).click();
      await page.getByLabel('Template name', { exact: true }).fill('Our Golden Hour');
      await page.getByLabel('Photo count', { exact: true }).fill('7');
      await page.getByLabel('Description', { exact: true }).fill('Three moments to keep.');
      await page.getByLabel('Tags', { exact: true }).fill('Love, Memories');
      await page.getByLabel('Author name', { exact: true }).fill('Jamie');
      await expect(page.getByRole('combobox', { name: 'Access', exact: true })).toHaveCount(0);
      await page.getByLabel('Price (USD)', { exact: true }).fill('4.99');
      await page.getByRole('tab', { name: 'Photo & framing' }).click();
      await page.getByRole('tab', { name: 'Template configuration' }).click();
      await expect(page.getByLabel('Template name', { exact: true })).toHaveValue(
        'Our Golden Hour',
      );
      await page.getByRole('button', { name: 'Save configuration' }).click();
      await expect(page.getByText('Saved to manifest.json', { exact: true })).toBeVisible();
      const saved = JSON.parse(await readFile(path.join(project.root, 'manifest.json'), 'utf8'));
      assert.equal(saved.config.maxPhotos, 7);
      assert.deepEqual(saved.assets, original.assets);
      await expect.poll(() => demoCount).toBe(5);
      await page.getByLabel('Photo count', { exact: true }).fill('3');
      await page.getByRole('button', { name: 'Save configuration' }).click();
      await expect(page.getByText('Saved to manifest.json', { exact: true })).toBeVisible();
      await expect.poll(() => demoCount).toBe(3);
      const reduced = JSON.parse(await readFile(manifestFile, 'utf8'));
      assert.equal(reduced.config.maxPhotos, 3);
      assert.deepEqual(reduced.assets, original.assets);
      for (let index = 1; index <= 5; index++) {
        assert.equal(
          reduced.config[`previewPhoto${index}`],
          original.config[`previewPhoto${index}`],
        );
        assert.equal(
          reduced.config[`previewCaption${index}`],
          original.config[`previewCaption${index}`],
        );
      }
      assert.equal(saved.config.suggestedPriceCents, 499);
      assert.equal(saved.access, 'premium');
      assert.equal(saved.author, 'Jamie');
      await page.reload();
      await page.getByRole('tab', { name: 'Photo & framing' }).click();
      await expect(page.getByText('0 / 3 photos', { exact: true })).toBeVisible();
      await page.getByRole('tab', { name: 'Template configuration' }).click();
      await expect(page.getByLabel('Template name', { exact: true })).toHaveValue(
        'Our Golden Hour',
      );
      await page.getByLabel('Price (USD)', { exact: true }).fill('0');
      await page.getByRole('button', { name: 'Save configuration' }).click();
      await expect(page.getByText('Saved to manifest.json', { exact: true })).toBeVisible();
      assert.equal(JSON.parse(await readFile(manifestFile, 'utf8')).access, 'free');
      await page.getByLabel('Price (USD)', { exact: true }).fill('9.91');
      assert.equal(
        await page
          .getByLabel('Price (USD)', { exact: true })
          .evaluate((input) => input.validity.rangeOverflow),
        true,
      );
      await page.getByLabel('Price (USD)', { exact: true }).fill('9.90');
      await page.getByRole('button', { name: 'Save configuration' }).click();
      await expect(page.getByText('Saved to manifest.json', { exact: true })).toBeVisible();
      const priced = JSON.parse(await readFile(manifestFile, 'utf8'));
      assert.equal(priced.access, 'premium');
      assert.equal(priced.config.suggestedPriceCents, 990);
      for (const width of [375, 390, 430, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
      }
    } finally {
      await browser?.close();
      await server?.close();
      await rm(parent, { recursive: true, force: true });
    }
  },
);
