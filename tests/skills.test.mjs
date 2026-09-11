import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createProject, toolRoot } from '../dist-cli/project.js';
import { updateSkills } from '../dist-cli/skills.js';

const author = '.agents/skills/bonko-template-author/SKILL.md';

test('skills update refreshes old projects from a subdirectory, backs up edits and is idempotent', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'bonko-skills-update-'));
  try {
    const project = await createProject('old-note', parent);
    await rm(path.join(project.root, 'TEMPLATE_VERSIONING.md'));
    const marker = await readFile(path.join(project.root, 'bonko.json'));
    const source = await readFile(path.join(project.root, 'src/main.tsx'));
    await writeFile(path.join(project.root, author), 'Custom old author instructions');
    await writeFile(path.join(project.root, 'AGENTS.md'), 'My custom instructions');
    await rm(path.join(project.root, 'DEVELOPMENT.md'));
    await mkdir(path.join(project.root, '.agents/skills/custom'));
    await writeFile(path.join(project.root, '.agents/skills/custom/SKILL.md'), 'Keep me');
    const cli = spawnSync(
      process.execPath,
      [path.join(toolRoot, 'bin/bonko.mjs'), 'skills', 'update', '--json'],
      { cwd: path.join(project.root, 'src'), encoding: 'utf8' },
    );
    assert.equal(cli.status, 0, cli.stderr);
    const result = JSON.parse(cli.stdout);
    assert.equal(result.updated.length, 4);
    assert.equal(
      await readFile(path.join(project.root, 'TEMPLATE_VERSIONING.md'), 'utf8'),
      await readFile(path.join(toolRoot, 'docs/TEMPLATE_VERSIONING.md'), 'utf8'),
    );
    assert.equal(
      await readFile(path.join(result.backupDirectory, author), 'utf8'),
      'Custom old author instructions',
    );
    assert.equal(
      await readFile(path.join(result.backupDirectory, 'AGENTS.md'), 'utf8'),
      'My custom instructions',
    );
    assert.deepEqual(
      await readFile(path.join(project.root, author)),
      await readFile(path.join(toolRoot, 'scaffolds/agent/skills/bonko-template-author/SKILL.md')),
    );
    assert.deepEqual(await readFile(path.join(project.root, 'bonko.json')), marker);
    assert.deepEqual(await readFile(path.join(project.root, 'src/main.tsx')), source);
    assert.equal(
      await readFile(path.join(project.root, '.agents/skills/custom/SKILL.md'), 'utf8'),
      'Keep me',
    );
    const repeat = await updateSkills(project.root);
    assert.deepEqual(repeat.updated, []);
    assert.equal(repeat.backupDirectory, null);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('skills update rejects symlink files, parent directories and concurrent locks before replacing guidance', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'bonko-skills-boundaries-'));
  try {
    const project = await createProject('safe-note', parent);
    const outside = path.join(parent, 'outside.md');
    await writeFile(outside, 'Outside');
    const agents = path.join(project.root, 'AGENTS.md');
    await writeFile(agents, 'Keep originals');
    await rm(path.join(project.root, author));
    await symlink(outside, path.join(project.root, author));
    await assert.rejects(updateSkills(project.root), /non-regular/);
    assert.equal(await readFile(agents, 'utf8'), 'Keep originals');
    assert.equal(await readFile(outside, 'utf8'), 'Outside');
    await rm(path.join(project.root, '.agents'), { recursive: true });
    await symlink(parent, path.join(project.root, '.agents'), 'dir');
    await assert.rejects(updateSkills(project.root), /real directory/);
    await rm(path.join(project.root, '.agents'));
    await writeFile(path.join(project.root, '.bonko/skills-update.lock'), 'existing');
    await assert.rejects(updateSkills(project.root), /locked/);
    assert.equal(await readFile(agents, 'utf8'), 'Keep originals');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
