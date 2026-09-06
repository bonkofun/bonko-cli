import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  realpath,
  symlink,
  readlink,
  access,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { useInstalledVersion } from '../dist-cli/versions.js';

test('version selection verifies releases, preserves project pins and refuses unsafe targets', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'bonko-versions-')));
  const cliRoot = (version) => path.join(root, 'versions', version, 'node_modules/@bonkofun/cli');
  const executable = (version) => path.join(cliRoot(version), 'bin/bonko.mjs');
  const entry = path.join(root, 'bin/bonko');
  try {
    for (const version of ['0.1.0', '0.1.1']) {
      await mkdir(path.dirname(executable(version)), { recursive: true });
      await writeFile(
        executable(version),
        `console.log(JSON.stringify({version:${JSON.stringify(version)}}));`,
      );
      await writeFile(
        path.join(root, 'versions', version, '.bonko-install.json'),
        JSON.stringify({ version, digest: 'a'.repeat(64) }),
      );
    }
    await mkdir(path.dirname(entry));
    await symlink(executable('0.1.1'), entry);
    await useInstalledVersion('0.1.0', cliRoot('0.1.1'), entry);
    assert.equal(await readlink(entry), executable('0.1.0'));
    await useInstalledVersion('0.1.1', cliRoot('0.1.0'), entry);
    await assert.rejects(useInstalledVersion('0.2.0', cliRoot('0.1.1'), entry), /not installed/);
    await assert.rejects(
      useInstalledVersion('../escape', cliRoot('0.1.1'), entry),
      /stable version/,
    );
    await writeFile(executable('0.1.0'), 'console.log(JSON.stringify({version:"9.0.0"}));');
    await assert.rejects(
      useInstalledVersion('0.1.0', cliRoot('0.1.1'), entry),
      /verification failed/,
    );
    assert.equal(await readlink(entry), executable('0.1.1'));
    await mkdir(path.join(root, '.install-lock'));
    await assert.rejects(useInstalledVersion('0.1.0', cliRoot('0.1.1'), entry), /active/);
    await rm(path.join(root, '.install-lock'), { recursive: true });
    await rm(entry);
    await writeFile(entry, 'unrelated executable');
    await assert.rejects(
      useInstalledVersion('0.1.0', cliRoot('0.1.1'), entry),
      /not an installation symlink/,
    );
    await assert.rejects(access(path.join(root, '.install-lock')), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
