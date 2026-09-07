import type { Browser, Page } from '@playwright/test';
import { errorCode, errorMessage } from '../errors.js';
import type { RuntimePreview } from './runtime-server.js';
import { readFile, mkdir, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { LIMITS } from '@bonko/template-sdk';
import { buildRuntime, RuntimeBuildError } from './runtime-build.js';
import { standaloneServerFor } from './runtime-dev.js';

export type CheckReport = {
  ok: boolean;
  slug: string;
  protocol: number;
  digest: string;
  checks: string[];
  manual: string[];
  screenshots: string;
};
export async function verifyStandalone(root: string, slug: string, toolRoot: string) {
  if (typeof slug !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error('Invalid template slug');
  let server: Awaited<ReturnType<typeof standaloneServerFor>> | undefined;
  let browser: Browser | undefined;
  let failurePage: Page | undefined;
  const checks = ['manifest', 'package-integrity', 'source-policy', 'typescript'];
  try {
    const bundle = await buildRuntime(root, slug);
    const scenario = JSON.parse(await readFile(path.join(root, 'test.json'), 'utf8'));
    const interactive = bundle.submission.templateType === 'interactive';
    if (
      !scenario ||
      typeof scenario !== 'object' ||
      Array.isArray(scenario) ||
      (interactive &&
        (typeof scenario.revealButton !== 'string' ||
          !scenario.revealButton.trim() ||
          scenario.revealButton.length > 100))
    )
      throw new RuntimeBuildError(
        'INVALID_SCENARIO',
        'Interactive test.json needs the accessible name of its keyboard reveal button',
      );
    server = await standaloneServerFor(root, slug, toolRoot, 0);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    failurePage = page;
    page.setDefaultTimeout(10000);
    const errors: string[] = [],
      snapshots: Promise<string | undefined>[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/__bonko/preview')
        snapshots.push(
          response
            .json()
            .then((data) => data.digest)
            .catch(() => undefined),
        );
    });
    const origin = server.origin;
    const metadataResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/__bonko/preview',
    );
    await page.goto(origin);
    const metadata = (await (await metadataResponse).json()) as RuntimePreview;
    if (metadata.digest !== bundle.digest)
      throw new RuntimeBuildError(
        'SOURCE_CHANGED',
        'Source changed before browser verification; run check again',
      );
    const frame = page.frameLocator('[data-preview-layer="current"] iframe');
    const modeLabels = {
      reduced: 'Reduced motion',
      static: 'Authored static view',
      'asset-error': 'Simulate asset failure',
      'player-error': 'Simulate player failure',
      interactive: 'Template playback',
    };
    async function chooseMode(value: keyof typeof modeLabels) {
      await page.getByRole('tab', { name: 'Test the experience', exact: true }).click();
      await page.getByRole('combobox', { name: 'Preview mode' }).click();
      await page.getByRole('option', { name: modeLabels[value], exact: true }).click();
    }
    const status = page.locator('[data-preview-layer="current"] [data-playback] [role=status]');
    const skip = page.getByRole('button', { name: 'View message', exact: true });
    await expect(status).toHaveText(/^(running|waiting|natural)$/);
    for (const asset of Object.values(metadata.assets)) {
      await page.evaluate(
        async ({ asset, limits }) => {
          const response = await fetch(asset.url);
          if (!response.ok) throw new Error('Asset fetch failed');
          const blob = await response.blob(),
            url = URL.createObjectURL(blob);
          try {
            if (asset.contentType.startsWith('audio/')) {
              const audio = new Audio();
              audio.preload = 'metadata';
              try {
                await new Promise<void>((resolve, reject) => {
                  const timeout = setTimeout(() => {
                    audio.removeAttribute('src');
                    reject(new Error('Audio decode timeout'));
                  }, 10000);
                  audio.onloadedmetadata = () => {
                    clearTimeout(timeout);
                    if (
                      Number.isFinite(audio.duration) &&
                      audio.duration > 0 &&
                      audio.duration <= limits.audioSeconds
                    )
                      resolve();
                    else reject(new Error('Audio exceeds short-clip limit'));
                  };
                  audio.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error('Invalid audio'));
                  };
                  audio.src = url;
                });
              } finally {
                audio.removeAttribute('src');
                audio.load();
              }
            } else {
              const image = new Image();
              image.src = url;
              await image.decode();
              if (
                !image.naturalWidth ||
                image.naturalWidth > limits.imageDimension ||
                image.naturalHeight > limits.imageDimension ||
                image.naturalWidth * image.naturalHeight > limits.imagePixels
              )
                throw new Error('Image exceeds limits');
            }
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        { asset, limits: LIMITS },
      );
    }
    checks.push('actual-media-decode');
    // Distinct local-only photo makes hardcoded template art insufficient to pass.
    const photo = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 97;
      canvas.height = 83;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D unavailable');
      ctx.fillStyle = '#137c66';
      ctx.fillRect(0, 0, 97, 83);
      ctx.fillStyle = '#ffb423';
      ctx.fillRect(0, 0, 30, 83);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByRole('tab', { name: 'Photo & framing', exact: true }).click();
    await page.getByLabel('Local photo', { exact: true }).setInputFiles({
      name: 'local-check-photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(photo, 'base64'),
    });
    await page.getByRole('slider', { name: 'Scale', exact: true }).focus();
    for (let step = 0; step < 10; step++) await page.keyboard.press('ArrowRight');
    await page.getByRole('tab', { name: 'Make it personal', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Alex <test>');
    await page.getByLabel('Message', { exact: true }).fill('Your words stay text: <b>hello</b>');
    await page.getByLabel('Sender Optional', { exact: true }).fill('Sam');
    await expect(
      frame.getByText('Your words stay text: <b>hello</b>', { exact: true }),
    ).toBeVisible();
    async function finish() {
      await page.getByRole('button', { name: 'Replay', exact: true }).click();
      await expect(status).toHaveText(/^(running|waiting|natural)$/);
      if (interactive) {
        const reveal = frame.getByRole('button', { name: scenario.revealButton, exact: true });
        await reveal.waitFor({ timeout: 31000 });
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        await expect(status).toHaveText('paused');
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, value: false });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await expect(status).toHaveText('paused');
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        await expect(reveal).toBeEnabled();
        await reveal.focus();
        await reveal.press('Enter');
      }
      await expect(status).toHaveText(/^(natural|error)$/, { timeout: 36000 });
      if ((await status.innerText()) === 'error')
        throw new RuntimeBuildError(
          'STATIC_PRESENTATION_FAILED',
          'Playback or authored static presentation failed; inspect renderStatic and its cleanup',
        );
    }
    async function finalContent(
      name: string,
      message: string,
      sender: string,
      presentation: 'ready' | 'none' = 'ready',
    ) {
      await expect(page.locator('[data-preview-layer="current"] [data-playback]')).toHaveAttribute(
        'data-static',
        presentation,
      );
      const child = frame.locator('body');
      await expect(child).toContainText(name);
      await expect(child).toContainText(message);
      if (sender) await expect(child).toContainText(sender);
      await child.evaluate(async () => {
        await Promise.all(
          [...document.images].map((image) => image.decode().catch(() => undefined)),
        );
      });
      const result = await child.evaluate(
        (_body, { name, message, sender }) => {
          const text = document.body.innerText;
          const photo = [...document.images].find(
            (image) =>
              image.naturalWidth === 97 &&
              image.naturalHeight === 83 &&
              image.getBoundingClientRect().width > 0 &&
              image.getBoundingClientRect().height > 0,
          );
          return {
            content:
              text.includes(name) && text.includes(message) && (!sender || text.includes(sender)),
            photo: !!photo,
            crop: photo ? getComputedStyle(photo).transform : '',
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        },
        { name, message, sender },
      );
      if (!result.content)
        throw new RuntimeBuildError(
          'MISSING_FINAL_CONTENT',
          'Final composition must visibly include all supplied text',
        );
      if (!result.photo || !result.crop.startsWith('matrix(1.5,'))
        throw new RuntimeBuildError(
          'MISSING_PHOTO_CROP',
          'Final composition must display the supplied photo and apply photoTransform on that image',
        );
      if (result.overflow)
        throw new RuntimeBuildError(
          'TEMPLATE_OVERFLOW',
          'Template overflows its frame horizontally',
        );
    }
    await finish();
    await finalContent('Alex <test>', 'Your words stay text: <b>hello</b>', 'Sam', 'none');
    checks.push('keyboard-natural-completion', 'escaped-user-content', 'local-photo-crop');
    await chooseMode('static');
    await expect(status).toHaveText('ended');
    await finalContent('Alex <test>', 'Your words stay text: <b>hello</b>', 'Sam');
    await chooseMode('interactive');
    checks.push('authored-static-preview', 'preserved-natural-final-frame');
    if (interactive) checks.push('pause-continue-background');
    const output = path.join(root, '.bonko', 'checks');
    await mkdir(output, { recursive: true });
    for (const width of [375, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.getByRole('tab', { name: 'Test the experience', exact: true }).click();
      await page.getByRole('button', { name: 'Maximum text / empty sender' }).click();
      await finish();
      await finalContent(
        'Alexandra'.repeat(4).slice(0, 30),
        'A little note to remind you that you matter. '.repeat(4).slice(0, 160),
        '',
        'none',
      );
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new RuntimeBuildError('HOST_OVERFLOW', `Studio overflows at ${width}px`);
      await page.locator('iframe').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${width}.png`), fullPage: true });
    }
    checks.push('long-text-empty-sender', 'responsive');
    for (let index = 0; index < 3; index++) {
      await chooseMode('interactive');
      await page.getByRole('button', { name: 'Replay', exact: true }).click();
      await expect(status).toHaveText(/^(running|waiting|natural)$/);
      if (await skip.isEnabled()) {
        await skip.click();
        await expect(status).toHaveText('skip');
      } else {
        await expect(status).toHaveText('natural');
        await chooseMode('static');
      }
      await finalContent(
        'Alexandra'.repeat(4).slice(0, 30),
        'A little note to remind you that you matter. '.repeat(4).slice(0, 160),
        '',
      );
    }
    checks.push('skip-replay-cleanup');
    await chooseMode('reduced');
    await expect(status).toHaveText('reduced-motion');
    await finalContent(
      'Alexandra'.repeat(4).slice(0, 30),
      'A little note to remind you that you matter. '.repeat(4).slice(0, 160),
      '',
    );
    checks.push('authored-static-skip', 'authored-static-reduced-motion');
    await chooseMode('asset-error');
    await expect(status).toHaveText('error');
    await expect(page.locator('.runtime-fallback')).toContainText('Alexandra');
    await chooseMode('player-error');
    await expect(status).toHaveText('error', { timeout: 20000 });
    await expect(page.locator('.runtime-fallback')).toContainText('Alexandra');
    checks.push('reduced-motion', 'asset-error-fallback', 'player-error-deadline');
    if (errors.length) throw new RuntimeBuildError('BROWSER_ERROR', errors.join('\n'));
    if (
      (await Promise.all(snapshots)).some((digest) => digest !== bundle.digest) ||
      (await buildRuntime(root, slug)).digest !== bundle.digest
    )
      throw new RuntimeBuildError(
        'SOURCE_CHANGED',
        'Source changed during browser verification; run check again',
      );
    const report = {
      ok: true,
      slug,
      protocol: 3,
      digest: bundle.digest,
      checks,
      manual: [
        'source security review',
        'asset/source licenses',
        'visual finish',
        'audio listening',
        'touch gestures',
        'custom static terminal design',
      ],
      screenshots: output,
    };
    await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    return { report, bundle };
  } catch (error) {
    const output = path.join(root, '.bonko', 'checks');
    await mkdir(output, { recursive: true });
    if (failurePage)
      await failurePage
        .screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
        .catch(() => undefined);
    await writeFile(
      path.join(output, 'report.json'),
      JSON.stringify(
        {
          ok: false,
          slug,
          code: errorCode(error) ?? 'BROWSER_CHECK_FAILED',
          error: errorMessage(error),
        },
        null,
        2,
      ) + '\n',
    );
    throw error;
  } finally {
    await browser?.close();
    await server?.close();
  }
}

export async function packStandalone(root: string, slug: string, toolRoot: string) {
  const candidate = await buildRuntime(root, slug);
  const candidatePath = path.join(
    root,
    'dist',
    `${slug}-${candidate.submission.version}.bonko.zip`,
  );
  try {
    const stat = await lstat(candidatePath);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      !(await readFile(candidatePath)).equals(candidate.bytes)
    )
      throw new RuntimeBuildError(
        'VERSION_CONFLICT',
        'Refusing to replace an existing package; use a new template version',
      );
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
  const { report, bundle } = await verifyStandalone(root, slug, toolRoot);
  const directory = path.join(root, 'dist');
  await mkdir(directory, { recursive: true });
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('No symlink output directories');
  const file = path.join(directory, `${slug}-${bundle.submission.version}.bonko.zip`);
  try {
    await writeFile(file, bundle.bytes, { flag: 'wx' });
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error;
    if ((await lstat(file)).isSymbolicLink() || !(await readFile(file)).equals(bundle.bytes))
      throw new RuntimeBuildError(
        'VERSION_CONFLICT',
        'Refusing to replace an existing package; use a new template version',
      );
  }
  return { ...report, files: [file] };
}
