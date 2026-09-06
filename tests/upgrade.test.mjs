import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath, symlink, readlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { upgrade, runUpgradeInstaller } from '../dist-cli/upgrade.js';
import { parseArgs } from '../dist-cli/main.js';

const release = (version) => ({ tag_name: `v${version}`, draft: false, prerelease: false });

test('upgrade preserves installation paths and project pins, skips older releases and rejects invalid metadata', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'bonko-upgrade-')));
  const prefix = path.join(root, '工具 space');
  const directory = path.join(prefix, 'versions/0.1.2');
  const toolRoot = path.join(directory, 'node_modules/@bonkofun/cli');
  const executable = path.join(toolRoot, 'bin/bonko.mjs');
  const entry = path.join(root, 'custom bin/bonko');
  let calls = 0;
  try {
    await mkdir(path.dirname(executable), { recursive: true });
    await mkdir(path.dirname(entry));
    await writeFile(executable, '// fixture');
    await writeFile(
      path.join(directory, '.bonko-install.json'),
      JSON.stringify({ version: '0.1.2', digest: 'a'.repeat(64) }),
    );
    await symlink(executable, entry);
    const runInstaller = async (args) => {
      calls++;
      assert.deepEqual(args, [
        path.join(toolRoot, 'scripts/upgrade-install.mjs'),
        '0.1.10',
        prefix,
        path.dirname(entry),
      ]);
    };
    assert.deepEqual(
      await upgrade(toolRoot, entry, '0.1.2', {
        latestRelease: async () => release('0.1.10'),
        runInstaller,
      }),
      { upgraded: true, version: '0.1.10', latestVersion: '0.1.10' },
    );
    for (const version of ['0.1.2', '0.1.1'])
      assert.equal(
        (
          await upgrade(toolRoot, entry, '0.1.2', {
            latestRelease: async () => release(version),
            runInstaller,
          })
        ).upgraded,
        false,
      );
    for (const data of [
      null,
      {},
      release('../escape'),
      release('0.1.3-beta.1'),
      { ...release('0.1.3'), draft: true },
      { ...release('0.1.3'), prerelease: true },
    ])
      await assert.rejects(
        upgrade(toolRoot, entry, '0.1.2', { latestRelease: async () => data, runInstaller }),
        /valid stable/,
      );
    await assert.rejects(
      upgrade(toolRoot, entry, '0.1.2', {
        latestRelease: async () => {
          throw new Error('offline');
        },
        runInstaller,
      }),
      /offline/,
    );
    await assert.rejects(
      upgrade(toolRoot, entry, '0.1.2', {
        latestRelease: async () => release('0.1.3'),
        runInstaller: async () => {
          throw new Error('checksum mismatch');
        },
      }),
      /checksum/,
    );
    assert.equal(await readlink(entry), executable);
    assert.equal(calls, 1);
    await assert.rejects(upgrade(root, entry, '0.1.2'), /installed CLI/);
    await assert.rejects(upgrade(toolRoot, executable, '0.1.2'), /symlink/);
    await writeFile(path.join(directory, '.bonko-install.json'), '{}');
    await assert.rejects(upgrade(toolRoot, entry, '0.1.2'), /Invalid installation/);
    assert.equal(parseArgs(['upgrade']).command, 'upgrade');
    assert.equal(parseArgs(['upgrade', '--help']).command, 'help');
    for (const args of [
      ['upgrade', '0.1.3'],
      ['upgrade', '--prefix', '/tmp'],
      ['upgrade', '--json'],
    ])
      assert.throws(() => parseArgs(args));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('upgrade runner propagates installer exit failures and cleans signal listeners', async () => {
  const before = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')];
  await runUpgradeInstaller(['-e', 'process.exit(0)']);
  await assert.rejects(runUpgradeInstaller(['-e', 'process.exit(7)']), /failed \(7\)/);
  assert.deepEqual([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')], before);
});
