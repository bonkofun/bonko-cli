import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { packageMetadata } from './engine/package-metadata.js';
import { createProject, findProject, packageInfo, safeDirectory, toolRoot } from './project.js';

const descriptions: Record<string, string> = {
  upgrade: 'bonko upgrade                Install and select the latest stable CLI release',
  use: 'bonko use <version>          Select an already-installed CLI version',
  new: 'bonko new <name>             Create an independent template project',
  dev: 'bonko dev [--port 4173] [--no-open]  Preview and rebuild on source changes',
  build: 'bonko build [--json]         Build runtime files; no browser verification',
  check: 'bonko check [--json] [--no-download]  Build and run browser checks',
  pack: 'bonko pack [--json] [--no-download]   Verify and export a .bonko.zip',
  browser: 'bonko browser install       Prepare Chromium for offline checks',
  help: 'bonko help [command]         Show commands and examples',
  version: 'bonko version [--json]       Show CLI and SDK versions',
};
export function parseArgs(args: string[]) {
  if (!args.length)
    return {
      command: 'help',
      operands: [],
      json: false,
      noOpen: false,
      noDownload: false,
      port: 4173,
    };
  let command = args[0];
  if (command === '--version' || command === '-v') command = 'version';
  if (command === '--help' || command === '-h') command = 'help';
  if (!Object.hasOwn(descriptions, command))
    throw new Error(`Unknown command: ${command}. Run bonko help.`);
  const operands: string[] = [];
  let json = false,
    noOpen = false,
    noDownload = false,
    port = 4173;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h')
      return {
        command: 'help',
        operands: [command],
        json: false,
        noOpen: false,
        noDownload: false,
        port,
      };
    if (arg === '--json' && ['new', 'build', 'check', 'pack', 'version'].includes(command))
      json = true;
    else if (arg === '--no-open' && command === 'dev') noOpen = true;
    else if (arg === '--no-download' && ['check', 'pack'].includes(command)) noDownload = true;
    else if (arg === '--port' && command === 'dev') {
      const value = args[++i];
      if (!value || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)
        throw new Error('--port requires an integer from 1 to 65535.');
      port = Number(value);
    } else if (arg.startsWith('-'))
      throw new Error(`Unsupported option ${arg} for ${command}. Run bonko help ${command}.`);
    else operands.push(arg);
  }
  const max = ['new', 'help', 'browser', 'use'].includes(command) ? 1 : 0;
  if (operands.length > max)
    throw new Error(`Unexpected argument. Usage: ${descriptions[command]}`);
  if (['new', 'use'].includes(command) && !operands[0])
    throw new Error(`Usage: ${descriptions[command]}`);
  return { command, operands, json, noOpen, noDownload, port };
}
function output(value: unknown, message: string, json: boolean) {
  console.log(json ? JSON.stringify(value) : message);
}
export async function main(args: string[]) {
  const options = parseArgs(args);
  const { command, operands, json } = options;
  if (command === 'help') {
    if (operands[0]) {
      if (!Object.hasOwn(descriptions, operands[0]))
        throw new Error(`Unknown command: ${operands[0]}`);
      console.log(descriptions[operands[0]]);
    } else
      console.log(
        `Bonko CLI ${packageInfo.version}\n\n${Object.values(descriptions).join('\n')}\n\nStart: bonko new birthday-card → cd birthday-card → bonko dev\nRequires Node.js >= 22.12.0. No project npm install is required.`,
      );
    return;
  }
  if (command === 'version') {
    const sdk = await packageMetadata('@bonko/template-sdk');
    const value = {
      version: packageInfo.version,
      sdkVersion: sdk.version,
      nodeVersion: process.versions.node,
    };
    output(
      value,
      `bonko ${value.version}\nSDK ${value.sdkVersion}\nNode ${value.nodeVersion}`,
      json,
    );
    return;
  }
  if (command === 'upgrade') {
    const { upgrade } = await import('./upgrade.js');
    const result = await upgrade(toolRoot, process.argv[1], packageInfo.version);
    console.log(
      result.upgraded
        ? `Upgraded to Bonko ${result.version}. Projects run with the active CLI when their schema and template protocol are supported; recorded CLI versions are preserved. Use bonko use <version> for exact-version execution.`
        : `Bonko ${result.version} is already current or newer than the latest release (${result.latestVersion}).`,
    );
    return;
  }
  if (command === 'use') {
    const { useInstalledVersion } = await import('./versions.js');
    const result = await useInstalledVersion(operands[0], toolRoot, process.argv[1]);
    console.log(`Selected Bonko ${result.version}\nCommand: ${result.command}`);
    return;
  }
  if (command === 'new') {
    const project = await createProject(operands[0]);
    output(
      { ok: true, ...project },
      `Created ${project.root}\n\n  cd ${project.slug}\n  bonko dev`,
      json,
    );
    return;
  }
  if (command === 'browser') {
    if (operands[0] !== 'install') throw new Error('Usage: bonko browser install');
    await (await import('./browser.js')).ensureBrowser(false);
    console.log('Chromium is ready.');
    return;
  }
  if (command === 'dev') {
    const { findWorkspaceOrProject } = await import('./project.js');
    const target = await findWorkspaceOrProject();
    const { standaloneServerFor } = await import('./engine/runtime-dev.js');
    const server = await standaloneServerFor(target, toolRoot, undefined, options.port);
    server.printUrls();
    if (target.kind === 'workspace') {
      console.log(
        `Workshop mode: ${target.workspace.projects.length} cards (${target.workspace.projects.map((p) => p.slug).join(', ')})`,
      );
    }
    if (!options.noOpen) {
      const executable =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'explorer.exe'
            : 'xdg-open';
      const child = spawn(executable, [server.origin], { stdio: 'ignore' });
      child.once('error', () => process.stderr.write(`Open ${server.origin}/ in your browser.\n`));
    }
    const stop = () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      void server.close();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    return;
  }
  const project = await findProject();
  if (command === 'build') {
    const { buildRuntime } = await import('./engine/runtime-build.js');
    const bundle = await buildRuntime(project.root, project.slug);
    const directory = await safeDirectory(project.root, '.bonko', 'build', bundle.digest);
    for (const [name, bytes] of Object.entries(bundle.files)) {
      if (name !== 'manifest.json' && !name.startsWith('runtime/')) continue;
      await safeDirectory(
        directory,
        ...path
          .dirname(name)
          .split('/')
          .filter((part) => part !== '.'),
      );
      const file = path.join(directory, name);
      await writeFile(file, bytes, { flag: 'wx' }).catch(async (error) => {
        if (error.code !== 'EEXIST' || !(await readFile(file)).equals(bytes)) throw error;
      });
    }
    output(
      { ok: true, verified: false, digest: bundle.digest, directory },
      `Built ${project.slug}\n${directory}\nRun bonko check for browser verification or bonko pack for delivery.`,
      json,
    );
    return;
  }
  await safeDirectory(project.root, '.bonko', 'checks');
  await (await import('./browser.js')).ensureBrowser(options.noDownload);
  const engine = await import('./engine/runtime-check.js');
  const result: import('./engine/runtime-check.js').CheckReport & { files?: string[] } =
    command === 'pack'
      ? await engine.packStandalone(project.root, project.slug, toolRoot)
      : (await engine.verifyStandalone(project.root, project.slug, toolRoot)).report;
  output(
    result,
    `${command === 'pack' ? 'Packed' : 'Verified'} ${project.slug}\n${result.files ? result.files.join('\n') : result.screenshots}\nManual review: ${result.manual.join(', ')}`,
    json,
  );
}
