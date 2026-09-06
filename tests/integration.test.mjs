import { assertTemplateGuidance } from './helpers/template-guidance.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
      const frame = page.frameLocator('iframe');
      await expect(frame.getByRole('heading')).toHaveText('Alex');
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Taylor');
      await page.getByRole('button', { name: 'Apply content and crop' }).click();
      await expect(frame.getByRole('heading')).toHaveText('Taylor');
      for (const width of [375, 390, 430]) {
        await page.getByRole('radio', { name: `${width} pixels` }).click();
        await expect
          .poll(() =>
            page
              .frames()
              .find((f) => f !== page.mainFrame())
              .evaluate(() => innerWidth),
          )
          .toBe(width);
        await page.setViewportSize({ width, height: 1000 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      const source = path.join(project.root, 'src/main.tsx'),
        original = await readFile(source, 'utf8');
      await writeFile(source, 'const bad: number = "wrong";');
      await expect(page.getByRole('alert')).toContainText('not assignable', { timeout: 15000 });
      await expect(page.locator('iframe')).toHaveCount(0);
      await writeFile(source, original);
      await expect(frame.getByRole('heading')).toHaveText('Taylor', { timeout: 15000 });
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
      await run(executable, ['new', 'release-note'], parent);
      const project = path.join(parent, 'release-note');
      await assertTemplateGuidance(project);
      await assert.rejects(access(path.join(project, 'node_modules')), { code: 'ENOENT' });
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
