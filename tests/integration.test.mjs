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
import { createProject, toolRoot, packageInfo } from '../dist-cli/project.js';
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
      assert.equal((await fetch(server.origin + '/../package.json')).status, 404);
      browser = await chromium.launch();
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
      await expect(page.getByRole('button', { name: 'Choose photo', exact: true })).toBeVisible();
      await expect(page.getByText('No file selected', { exact: true })).toBeVisible();
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
      const gaps = await page.evaluate(() => {
        window.__previewObserver.disconnect();
        return window.__previewGaps;
      });
      assert.deepEqual(gaps, []);
      await expect(page.locator('iframe')).toHaveCount(1);
      await page.getByRole('button', { name: 'Replay', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'View message', exact: true }).click();
      await expect(page.locator('[data-static="ready"]')).toBeVisible();
      await page.getByRole('tab', { name: 'Make it personal', exact: true }).click();
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Taylor again');
      await expect(frame.getByRole('heading')).toHaveText('Taylor again');
      await expect(page.locator('[data-static="ready"]')).toBeVisible();
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Latest replay');
      await page.getByRole('button', { name: 'Replay', exact: true }).click();
      await expect(frame.getByRole('heading')).toHaveText('Latest replay');
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Taylor again');
      await expect(frame.getByRole('heading')).toHaveText('Taylor again');
      await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await page.getByRole('tab', { name: 'Audio', exact: true }).click();
      await expect(page.getByText('This template has no audio.', { exact: false })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Enable sound' })).toBeDisabled();
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
      const oldMarker = JSON.stringify({ schemaVersion: 1, cliVersion: '0.1.2' });
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
