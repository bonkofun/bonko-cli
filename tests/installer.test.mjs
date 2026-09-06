import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { install } from '../scripts/install.mjs';
import { toolRoot } from '../dist-cli/project.js';
const installer = path.join(toolRoot, 'install.sh');
const quote = (value) => "'" + value.replaceAll("'", "'\"'\"'") + "'";

test('installer rejects missing/old Node before npm, download or destination writes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bonko-installer-preflight-'));
  try {
    const fake = path.join(root, 'path');
    await mkdir(fake);
    for (const version of [null, 'v18.20.0', 'v22.11.0', 'invalid']) {
      if (version)
        await writeFile(
          path.join(fake, 'node'),
          `#!/bin/sh\nif [ "$1" = "--version" ]; then echo ${quote(version)}; else exec ${quote(process.execPath)} "$@"; fi\n`,
          { mode: 0o755 },
        );
      const result = spawnSync('/bin/sh', [installer, '--prefix', path.join(root, 'destination')], {
        env: { PATH: fake },
        encoding: 'utf8',
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Node.js/);
      await assert.rejects(access(path.join(root, 'destination')), { code: 'ENOENT' });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('compatible Node proceeds to npm validation and malformed installer options fail', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bonko-installer-npm-'));
  try {
    await writeFile(path.join(root, 'node'), `#!/bin/sh\nexec ${quote(process.execPath)} "$@"\n`, {
      mode: 0o755,
    });
    const result = spawnSync('/bin/sh', [installer], { env: { PATH: root }, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /npm is missing/);
    await assert.rejects(install(['--wat']), /Unknown/);
    await assert.rejects(install(['--base-url', 'http://example.test']), /HTTPS/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('checksum failure and unrelated command leave installation inactive', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bonko-installer-integrity-'));
  try {
    const archive = path.join(root, 'archive.tgz');
    await writeFile(archive, 'not a package');
    const prefix = path.join(root, 'install');
    await assert.rejects(
      install(['--archive', archive, '--sha256', '0'.repeat(64), '--prefix', prefix]),
      /checksum mismatch/,
    );
    await assert.rejects(access(path.join(prefix, 'bin/bonko')), { code: 'ENOENT' });
    await assert.rejects(access(path.join(prefix, '.install-lock')), { code: 'ENOENT' });
    await writeFile(path.join(prefix, 'bin/bonko'), 'existing command');
    const digest = createHash('sha256')
      .update(await readFile(archive))
      .digest('hex');
    await assert.rejects(
      install(['--archive', archive, '--sha256', digest, '--prefix', prefix]),
      /existing command/,
    );
    assert.equal(await readFile(path.join(prefix, 'bin/bonko'), 'utf8'), 'existing command');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('explicit recovery removes only a dead local installer lock', async () => {
  const { hostname } = await import('node:os');
  const root = await mkdtemp(path.join(tmpdir(), 'bonko-stale-lock-'));
  const lock = path.join(root, '.install-lock');
  try {
    const archive = path.join(root, 'fake.tgz');
    await writeFile(archive, 'test');
    const args = ['--archive', archive, '--sha256', '0'.repeat(64), '--prefix', root];
    await mkdir(lock);
    await writeFile(
      path.join(lock, 'owner.json'),
      JSON.stringify({ pid: process.pid, hostname: hostname() }),
    );
    await assert.rejects(install(args), /lock exists/);
    await assert.rejects(install([...args, '--recover-lock']), /still active/);
    await access(path.join(lock, 'owner.json'));
    const dead = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' });
    assert.equal(dead.status, 0);
    await writeFile(
      path.join(lock, 'owner.json'),
      JSON.stringify({ pid: dead.pid, hostname: hostname() }),
    );
    await assert.rejects(install([...args, '--recover-lock']), /checksum mismatch/);
    await assert.rejects(access(lock), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  'an interrupted upgrade stops npm, cleans staging and keeps the previous command',
  { timeout: 20000 },
  async () => {
    const { spawn } = await import('node:child_process');
    const { symlink, readlink, readdir } = await import('node:fs/promises');
    const { setTimeout: delay } = await import('node:timers/promises');
    const root = await mkdtemp(path.join(tmpdir(), 'bonko-interrupted-'));
    let child;
    try {
      const prefix = path.join(root, 'install');
      const entry = path.join(prefix, 'bin/bonko');
      const previous = path.join(prefix, 'versions/0.0.1/bonko');
      await mkdir(path.dirname(previous), { recursive: true });
      await writeFile(previous, 'previous command');
      await mkdir(path.dirname(entry), { recursive: true });
      await symlink(previous, entry);
      const archive = path.join(root, 'fake.tgz');
      await writeFile(archive, 'test package');
      const digest = createHash('sha256')
        .update(await readFile(archive))
        .digest('hex');
      const fakeBin = path.join(root, 'fake-bin');
      await mkdir(fakeBin);
      const ready = path.join(root, 'npm-ready');
      await writeFile(
        path.join(fakeBin, 'npm'),
        `#!${process.execPath}\nimport {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(ready)},String(process.pid));\nsetInterval(()=>{},1000);\n`,
        { mode: 0o755 },
      );
      const args = ['--archive', archive, '--sha256', digest, '--prefix', prefix];
      const source = `import {install} from ${JSON.stringify(new URL('../scripts/install.mjs', import.meta.url).href)};try {await install(${JSON.stringify(args)});}catch {process.exitCode=1;}`;
      child = spawn(process.execPath, ['--input-type=module', '-e', source], {
        env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` },
        stdio: 'ignore',
      });
      const exited = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', resolve);
      });
      for (let i = 0; ; i++) {
        try {
          await access(ready);
          break;
        } catch {
          if (i >= 500) throw new Error('Mock npm never started');
          await delay(10);
        }
      }
      await assert.rejects(install(args), /lock exists/);
      const npmPid = Number(await readFile(ready, 'utf8'));
      child.kill('SIGTERM');
      assert.equal(await exited, 1);
      assert.throws(() => process.kill(npmPid, 0), { code: 'ESRCH' });
      assert.equal(await readlink(entry), previous);
      assert.ok(!(await readdir(prefix)).some((name) => name.startsWith('.install-')));
    } finally {
      child?.kill('SIGKILL');
      await rm(root, { recursive: true, force: true });
    }
  },
);
