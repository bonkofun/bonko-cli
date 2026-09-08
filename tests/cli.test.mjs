import { assertTemplateGuidance } from './helpers/template-guidance.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink, mkdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from '../dist-cli/main.js';
import {
  createProject,
  findProject,
  findWorkspaceOrProject,
  toolRoot,
} from '../dist-cli/project.js';
import { supportsNode } from '../bin/node-version.mjs';
import { buildRuntime } from '../dist-cli/engine/runtime-build.js';
import { createLocalRuntimeServer } from '../dist-cli/engine/runtime-server.js';
import { standaloneServerFor } from '../dist-cli/engine/runtime-dev.js';
const executable = path.join(toolRoot, 'bin/bonko.mjs');

test('version boundaries and standard command aliases', () => {
  for (const value of ['18.20.0', '20.19.0', '22.11.9', 'v22.12.0-rc.1', 'invalid'])
    assert.equal(supportsNode(value), false);
  for (const value of ['22.12.0', 'v22.23.2', '24.0.0', '26.0.0'])
    assert.equal(supportsNode(value), true);
  assert.equal(parseArgs([]).command, 'help');
  assert.equal(parseArgs(['-v']).command, 'version');
  assert.deepEqual(parseArgs(['dev', '--help']).operands, ['dev']);
  for (const args of [
    ['toString'],
    ['wat'],
    ['new'],
    ['dev', '--port'],
    ['dev', '--port', '0'],
    ['dev', '--port', '65536'],
    ['pack', '--no-open'],
    ['build', 'surprise'],
    ['dev', '--wat'],
  ])
    assert.throws(() => parseArgs(args));
});

test('help/version work outside a project, errors return nonzero and valid JSON', () => {
  for (const args of [['help'], ['--help'], ['version'], ['-v']])
    assert.equal(
      spawnSync(process.execPath, [executable, ...args], { cwd: tmpdir(), encoding: 'utf8' })
        .status,
      0,
    );
  const result = spawnSync(process.execPath, [executable, 'unknown', '--json'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).ok, false);
});

test('new creates flat projects exclusively and resolves them from nested folders', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'bonko-cli-project-'));
  try {
    const project = await createProject('gift-note', parent);
    await assertTemplateGuidance(project.root);
    const manifest = JSON.parse(await readFile(path.join(project.root, 'manifest.json'), 'utf8'));
    assert.equal(manifest.assets.cover.path, 'assets/cover.webp');
    const cover = await readFile(path.join(project.root, manifest.assets.cover.path));
    assert.equal(cover.toString('ascii', 0, 4), 'RIFF');
    assert.equal(cover.toString('ascii', 8, 12), 'WEBP');
    assert.deepEqual(cover, await readFile(path.join(toolRoot, 'scaffolds/assets/cover.webp')));
    await assert.rejects(access(path.join(project.root, 'assets/cover.png')), { code: 'ENOENT' });
    assert.deepEqual(await findProject(path.join(project.root, 'src')), project);
    await assert.rejects(createProject('gift-note', parent), /already exists/);
    await assert.rejects(createProject('../escape', parent), /lowercase/);
    await symlink(path.join(parent, 'missing'), path.join(parent, 'linked'));
    await assert.rejects(createProject('linked', parent), /already exists/);
    await assert.rejects(access(path.join(project.root, 'node_modules')), { code: 'ENOENT' });
    const config = JSON.parse(await readFile(path.join(project.root, 'bonko.json'), 'utf8'));
    await writeFile(
      path.join(project.root, 'bonko.json'),
      JSON.stringify({ ...config, cliVersion: '99.0.0' }),
    );
    await assert.rejects(findProject(project.root), /not supported/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('tool-owned dependencies build React/Motion without project node_modules and reject unsafe sources', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'bonko-cli-build-'));
  try {
    const project = await createProject('react-note', parent);
    const sourcePath = path.join(project.root, 'src/main.tsx');
    const original = await readFile(sourcePath, 'utf8');
    const reactSource =
      `import { createElement } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { motion } from 'motion/react';\nconst proof = createElement(motion.div, {}, 'React');\nconst detachedRoot = createRoot(document.createElement('div'));\ndetachedRoot.render(proof);\ndetachedRoot.unmount();\n` +
      original;
    await writeFile(sourcePath, reactSource);
    const first = await buildRuntime(project.root, project.slug);
    assert.ok(first.bytes.length > 0);
    assert.ok(first.files['source/dependencies.json']);
    assert.ok(
      !Object.keys(first.files).some((file) => /AGENTS|DEVELOPMENT|SKILL|\.agents/.test(file)),
    );
    await writeFile(
      path.join(project.root, '.agents/skills/bonko-template-author/SKILL.md'),
      'Local author guidance',
    );
    await writeFile(path.join(project.root, 'AGENTS.md'), 'Local instructions');
    await mkdir(path.join(project.root, '.bonko'));
    await writeFile(path.join(project.root, '.bonko/private-photo.png'), 'private');
    await writeFile(path.join(project.root, '.env'), 'synthetic-private');
    assert.equal((await buildRuntime(project.root, project.slug)).digest, first.digest);
    await writeFile(sourcePath, `import x from 'shadcn';\n${original}`);
    await assert.rejects(buildRuntime(project.root, project.slug), /platform review/);
    await writeFile(sourcePath, 'const bad: number = "wrong";');
    await assert.rejects(
      buildRuntime(project.root, project.slug),
      (error) => error.code === 'TYPESCRIPT_FAILED',
    );
    await writeFile(sourcePath, original);
    await symlink(path.join(parent, 'missing'), path.join(project.root, 'assets/linked.png'));
    await assert.rejects(buildRuntime(project.root, project.slug), /symlink/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('a damaged nested project never falls back to its parent', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bonko-project-boundary-'));
  try {
    const parent = await createProject('parent-note', root);
    const child = await createProject('child-note', parent.root);
    await rm(path.join(child.root, 'manifest.json'));
    await assert.rejects(findProject(child.root), /Missing manifest.json.*child-note/);
    await writeFile(path.join(child.root, 'bonko.json'), '{"schemaVersion":1}');
    await assert.rejects(findProject(child.root), /Invalid project configuration/);
    await writeFile(path.join(child.root, 'bonko.json'), '{broken');
    await assert.rejects(findProject(child.root), SyntaxError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('compatible historical projects run without rewriting pins; unknown versions stay blocked', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'bonko-compatibility-'));
  try {
    const project = await createProject('old-note', parent);
    const marker = path.join(project.root, 'bonko.json');
    const editorBefore = await readFile(path.join(project.root, 'tsconfig.json'), 'utf8');
    for (const version of ['0.1.0', '0.1.1', '0.1.2', '0.1.3', '0.1.4', '0.1.5', '0.1.6']) {
      const original = JSON.stringify({ schemaVersion: 1, cliVersion: version });
      await writeFile(marker, original);
      assert.deepEqual(await findProject(path.join(project.root, 'src')), project);
      const result = spawnSync(process.execPath, [executable, 'build', '--json'], {
        cwd: path.join(project.root, 'src'),
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).ok, true);
      assert.equal(await readFile(marker, 'utf8'), original);
    }
    for (const version of ['0.0.9', '0.1.999', '0.2.0', '1.0.0']) {
      await writeFile(marker, JSON.stringify({ schemaVersion: 1, cliVersion: version }));
      await assert.rejects(findProject(project.root), /not supported.*bonko use/);
    }
    await writeFile(marker, JSON.stringify({ schemaVersion: 1, cliVersion: '0.1.2' }));
    const manifest = JSON.parse(await readFile(path.join(project.root, 'manifest.json'), 'utf8'));
    await writeFile(
      path.join(project.root, 'manifest.json'),
      JSON.stringify({ ...manifest, sdkVersion: '99.0.0' }),
    );
    await assert.rejects(findProject(project.root));
    assert.equal(await readFile(path.join(project.root, 'tsconfig.json'), 'utf8'), editorBefore);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('findWorkspaceOrProject discovers multi-card workspaces and individual projects', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bonko-workspace-'));
  try {
    const card1 = await createProject('card-one', root);
    await createProject('card-two', root);
    await mkdir(path.join(root, 'notes'));
    await writeFile(path.join(root, 'notes', 'readme.txt'), 'hello');

    const discovered = await findWorkspaceOrProject(root);
    assert.equal(discovered.kind, 'workspace');
    assert.equal(discovered.workspace.root, root);
    assert.deepEqual(discovered.workspace.projects.map((p) => p.slug).sort(), [
      'card-one',
      'card-two',
    ]);
    await assert.rejects(findProject(root), /Multiple card projects found in workspace/);

    const single = await findWorkspaceOrProject(path.join(card1.root, 'src'));
    assert.equal(single.kind, 'project');
    assert.equal(single.project.slug, 'card-one');
    assert.equal(single.project.root, card1.root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('local runtime server supports multiple cards and previews each by slug', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bonko-multi-runtime-'));
  let runtime;
  try {
    const card1 = await createProject('card-alpha', root);
    const card2 = await createProject('card-beta', root);

    runtime = await createLocalRuntimeServer(
      [
        { root: card1.root, slug: card1.slug },
        { root: card2.root, slug: card2.slug },
      ],
      'http://127.0.0.1:4173',
    );

    const previewAlpha = await runtime.preview('card-alpha');
    assert.equal(previewAlpha.submission.slug, 'card-alpha');
    assert.ok(previewAlpha.url.includes(previewAlpha.digest));

    const previewBeta = await runtime.preview('card-beta');
    assert.equal(previewBeta.submission.slug, 'card-beta');
    assert.ok(previewBeta.url.includes(previewBeta.digest));
    assert.notEqual(previewAlpha.digest, previewBeta.digest);
  } finally {
    await runtime?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('standaloneServerFor supports workspace mode and exposes cards list API', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bonko-server-workspace-'));
  let server;
  try {
    await createProject('card-one', root);
    await createProject('card-two', root);
    const discovered = await findWorkspaceOrProject(root);

    server = await standaloneServerFor(discovered, toolRoot, undefined, 0);

    // Fetch index page with embedded preview token
    const indexRes = await fetch(server.origin + '/');
    assert.equal(indexRes.status, 200);
    const indexHtml = await indexRes.text();
    const tokenMatch = /__BONKO_PREVIEW_TOKEN__="([a-f0-9]+)"/.exec(indexHtml);
    assert.ok(tokenMatch, 'Token must be present in index.html');
    const token = tokenMatch[1];

    // Cards API lists all cards in the workspace
    const cardsRes = await fetch(server.origin + '/__bonko/cards', {
      headers: { 'x-bonko-preview': token },
    });
    assert.equal(cardsRes.status, 200);
    const cardsData = await cardsRes.json();
    assert.deepEqual(cardsData.cards.map((c) => c.slug).sort(), ['card-one', 'card-two']);

    // Preview by specific card slug
    const previewRes = await fetch(server.origin + '/__bonko/preview?slug=card-two', {
      headers: { 'x-bonko-preview': token },
    });
    assert.equal(previewRes.status, 200);
    const previewData = await previewRes.json();
    assert.equal(previewData.submission.slug, 'card-two');
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
