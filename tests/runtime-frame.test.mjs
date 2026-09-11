import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readCurrentPreview } from '../dist-cli/engine/runtime-frame.js';

test('final preview reads restart when a decoding iframe is replaced', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<iframe srcdoc="<body>old preview</body>"></iframe>');
    let reads = 0;
    await page.exposeFunction('replacePreview', async () => {
      await page.evaluate(() => {
        const next = document.createElement('iframe');
        next.srcdoc = '<body>new preview</body>';
        document.querySelector('iframe').replaceWith(next);
      });
    });
    const text = await readCurrentPreview(async () => {
      reads++;
      return page
        .frameLocator('iframe')
        .locator('body')
        .evaluate(async (body, first) => {
          if (first) {
            // Signal replacement while an asynchronous read is still in flight.
            void window.parent.replacePreview();
            await new Promise(() => {});
          }
          return body.textContent;
        }, reads === 1);
    });
    assert.equal(text, 'new preview');
    assert.equal(reads, 2);
  } finally {
    await browser.close();
  }
});

test('final preview reads preserve non-lifecycle errors without retrying', async () => {
  let reads = 0;
  const failure = new Error('Missing supplied photo');
  await assert.rejects(
    readCurrentPreview(async () => {
      reads++;
      throw failure;
    }),
    (error) => error === failure,
  );
  assert.equal(reads, 1);
});
