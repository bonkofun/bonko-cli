import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from '@playwright/test';
const require = createRequire(import.meta.url);
export async function ensureBrowser(noDownload: boolean): Promise<void> {
  try { await access(chromium.executablePath()); return; } catch { /* Install the version matching Playwright. */ }
  if (noDownload) throw new Error('Chromium is missing. Run bonko browser install, or allow automatic download by omitting --no-download.');
  process.stderr.write('Preparing Chromium for template checks…\n');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js'), 'install', 'chromium'], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(process.stderr); child.stderr.pipe(process.stderr);
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error('Chromium installation failed. Check your network and retry bonko browser install. On Linux, install the Playwright system dependencies.')));
  });
}
