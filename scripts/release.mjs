import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
await import('./generate-installer.mjs');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
await mkdir('release', { recursive: true });
/** @type {{filename: string, files: {path: string}[]}[]} */
const results = JSON.parse(
  execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', 'release'], {
    encoding: 'utf8',
  }),
);
const [result] = results;
if (!result.files.some((file) => file.path === 'npm-shrinkwrap.json'))
  throw new Error('Release must include the dependency lockfile.');
const filename = `bonko-cli-${version}.tgz`;
await rename(path.join('release', result.filename), path.join('release', filename));
const digest = createHash('sha256')
  .update(await readFile(path.join('release', filename)))
  .digest('hex');
await writeFile(path.join('release', filename + '.sha256'), `${digest}  ${filename}\n`);
await cp('install.sh', 'release/install.sh');
console.log(
  `Release ready: release/${filename}\nSHA-256: ${digest}\nUpload these files to your HTTPS release host; no upload or publication was performed.`,
);
