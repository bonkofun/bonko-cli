import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTemplateSubmission, RUNTIME_SDK_VERSION } from '@bonko/template-sdk/submission';
import ts from 'typescript';
import { samplePng } from '../engine/scaffold.mjs';

export const toolRoot = fileURLToPath(new URL('../', import.meta.url));
export const packageInfo = JSON.parse(await readFile(path.join(toolRoot, 'package.json'), 'utf8')) as { version: string; name: string };
export type Project = { root: string; slug: string };

export async function findProject(start = process.cwd()): Promise<Project> {
  let root = path.resolve(start);
  while (true) {
    try {
      const config = JSON.parse(await readFile(path.join(root, 'bonko.json'), 'utf8')) as unknown;
      if (!config || typeof config !== 'object' || !('schemaVersion' in config) || config.schemaVersion !== 1 || !('cliVersion' in config) || config.cliVersion !== packageInfo.version) {
        throw new Error(`This project requires its pinned Bonko CLI version. Check ${path.join(root, 'bonko.json')} and install that version.`);
      }
      const manifest = parseTemplateSubmission(JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')));
      return { root, slug: manifest.slug };
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
      const parent = path.dirname(root);
      if (parent === root) throw new Error('No Bonko project found. Run bonko new <name>, then cd into the new directory.');
      root = parent;
    }
  }
}

export async function createProject(name: string, parent = process.cwd()): Promise<Project> {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) || name.length > 80) throw new Error('Use a lowercase name such as birthday-card (maximum 80 characters).');
  const root = path.resolve(parent, name);
  // Exclusive creation rejects both an existing directory and a dangling symlink.
  await mkdir(root).catch(error => { if (error.code === 'EEXIST') throw new Error(`Destination already exists: ${root}`); throw error; });
  const manifest = parseTemplateSubmission({ protocol: 3, sdkVersion: RUNTIME_SDK_VERSION, slug: name, version: '1.0', name: name.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' '), description: 'A personal note. Replace this draft description.', author: 'Your name', templateType: 'static', access: 'free', tags: ['Note'], cover: 'cover', assets: { cover: { kind: 'image', path: 'assets/cover.png' } }, entry: 'runtime/entry.js', capabilities: [], config: {}, sample: { recipientName: 'Alex', message: 'You make ordinary days better.', senderName: 'Sam' }, messagePresets: ['You make ordinary days better.'], posterStyle: { background: '#fff9ed', foreground: '#292620', accent: '#6f4737' } });
  const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
  const paths: Record<string, string[]> = {};
  for (const name of ['react', 'react/jsx-runtime', 'react-dom/client', 'motion/react', '@bonko/template-sdk/runtime-client']) {
    const resolved = ts.resolveModuleName(name, path.join(toolRoot, '__editor__.tsx'), { moduleResolution: ts.ModuleResolutionKind.Bundler }, ts.sys).resolvedModule;
    if (resolved) paths[name] = [resolved.resolvedFileName];
  }
  const files: Record<string, string | Buffer> = {
    'bonko.json': json({ schemaVersion: 1, cliVersion: packageInfo.version }),
    'manifest.json': json(manifest),
    'src/main.tsx': await readFile(path.join(toolRoot, 'scaffolds/standalone-main.tsx')),
    'assets/cover.png': samplePng(),
    'test.json': json({ revealButton: null, notes: 'Static draft. Interactive templates must name their keyboard reveal button.' }),
    'LICENSE.md': 'Synthetic test cover and Bonko scaffold. Replace the cover and document code and media sources before submission.\n',
    'tsconfig.json': json({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, noEmit: true, skipLibCheck: true, types: [], paths }, include: ['src'] }),
    '.gitignore': '.bonko/\ndist/\nnode_modules/\n.env*\n.DS_Store\n',
    'AGENTS.md': '# Bonko template\n\nRead DEVELOPMENT.md before editing. Use the supplied SDK, one photo and plain text.\nSupport render, renderStatic and dispose; preserve pause, reduced motion and keyboard access.\nRun bonko check and bonko pack before delivery. Do not change validators to pass checks.\nNo production credentials, network calls, arbitrary dependencies or automatic publishing.\n',
    'DEVELOPMENT.md': await readFile(path.join(toolRoot, 'docs/PROTOCOL.md')),
    'README.md': `# ${manifest.name}\n\nRun commands inside this directory:\n\n\`\`\`sh\nbonko dev\nbonko build\nbonko check\nbonko pack\n\`\`\`\n\nEdit src/main.tsx, manifest.json and assets/. Read DEVELOPMENT.md for the protocol.\nBuild output: .bonko/build/. Reports: .bonko/checks/. Delivery: dist/*.bonko.zip.\nThe editor paths in tsconfig.json refer to this CLI installation; update these paths after moving to another computer (CLI builds resolve dependencies independently).\n`,
  };
  for (const [relative, data] of Object.entries(files)) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data, { flag: 'wx' });
  }
  return { root, slug: name };
}

export async function safeDirectory(root: string, ...segments: string[]): Promise<string> {
  let directory = root;
  for (const segment of segments) {
    directory = path.join(directory, segment);
    await mkdir(directory).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Expected a real directory: ${directory}`);
  }
  return directory;
}
