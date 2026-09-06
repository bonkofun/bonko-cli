import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateRelease } from '../scripts/validate-release.mjs';

test('release gate rejects version drift and commits not merged into main', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'bonko-release-gate-'));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  try {
    git('init', '-b', 'main');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.invalid');
    await writeFile(path.join(cwd, 'package.json'), JSON.stringify({ version: '0.2.0' }));
    await writeFile(
      path.join(cwd, 'npm-shrinkwrap.json'),
      JSON.stringify({ version: '0.2.0', packages: { '': { version: '0.2.0' } } }),
    );
    git('add', '.');
    git('-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    assert.equal(validateRelease({ cwd, tag: 'v0.2.0' }), '0.2.0');
    assert.throws(() => validateRelease({ cwd, tag: 'v0.1.0' }), /matching package.json/);
    assert.throws(() => validateRelease({ cwd, tag: 'v0.2.0-beta.1' }), /stable/);
    git('checkout', '-b', 'dev');
    await writeFile(path.join(cwd, 'change.txt'), 'not merged');
    git('add', '.');
    git('-c', 'commit.gpgsign=false', 'commit', '-m', 'unmerged');
    assert.throws(() => validateRelease({ cwd, tag: 'v0.2.0' }), /merged into origin\/main/);
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    assert.equal(validateRelease({ cwd, tag: 'v0.2.0' }), '0.2.0');
    await writeFile(path.join(cwd, 'npm-shrinkwrap.json'), JSON.stringify({ version: '0.1.0' }));
    assert.throws(() => validateRelease({ cwd, tag: 'v0.2.0' }), /shrinkwrap/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
