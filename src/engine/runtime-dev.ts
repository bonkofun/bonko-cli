import { createPackageService, packageSummary } from './studio-package.js';
import { readStudioConfig, saveStudioConfig, StudioConfigError } from './studio-config.js';
import type { AddressInfo } from 'node:net';
import type { ServerResponse } from 'node:http';
import type { FSWatcher } from 'node:fs';
import { errorCode, errorMessage } from '../errors.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { RuntimeBuildError } from './runtime-build.js';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { createLocalRuntimeServer } from './runtime-server.js';

import type { DiscoveredTarget, Project } from '../project.js';
import type { RuntimeProjectTarget } from './runtime-server.js';

/** Prebuilt Studio UI and a separately hosted opaque Runtime; loopback only. */
export async function standaloneServerFor(
  targetOrRoot: DiscoveredTarget | RuntimeProjectTarget[] | Project | string,
  slugOrToolRoot?: string,
  maybeToolRoot?: string,
  port = 4173,
) {
  let projectList: RuntimeProjectTarget[];
  let watchRoots: string[];
  let toolRoot: string;
  let listenPort = port;

  if (typeof targetOrRoot === 'string') {
    projectList = [{ root: targetOrRoot, slug: slugOrToolRoot! }];
    watchRoots = [targetOrRoot];
    toolRoot = maybeToolRoot!;
  } else if (Array.isArray(targetOrRoot)) {
    projectList = targetOrRoot;
    watchRoots = targetOrRoot.map((p) => p.root);
    toolRoot = slugOrToolRoot!;
    if (typeof maybeToolRoot === 'number' || (maybeToolRoot && /^\d+$/.test(maybeToolRoot))) {
      listenPort = Number(maybeToolRoot);
    }
  } else if ('kind' in targetOrRoot) {
    if (targetOrRoot.kind === 'project') {
      projectList = [targetOrRoot.project];
      watchRoots = [targetOrRoot.project.root];
    } else {
      projectList = targetOrRoot.workspace.projects;
      watchRoots = [targetOrRoot.workspace.root];
    }
    toolRoot = slugOrToolRoot!;
    if (typeof maybeToolRoot === 'number' || (maybeToolRoot && /^\d+$/.test(maybeToolRoot))) {
      listenPort = Number(maybeToolRoot);
    }
  } else {
    projectList = [targetOrRoot];
    watchRoots = [targetOrRoot.root];
    toolRoot = slugOrToolRoot!;
    if (typeof maybeToolRoot === 'number' || (maybeToolRoot && /^\d+$/.test(maybeToolRoot))) {
      listenPort = Number(maybeToolRoot);
    }
  }

  const token = randomBytes(32).toString('hex');
  const staticRoot = path.join(toolRoot, 'studio-dist');
  const index = (await readFile(path.join(staticRoot, 'index.html'), 'utf8')).replace(
    '<!-- BONKO_CONFIG -->',
    `<script>globalThis.__BONKO_PREVIEW_TOKEN__=${JSON.stringify(token)};</script>`,
  );
  const assets = new Map();
  for (const file of await readdir(path.join(staticRoot, 'assets'))) {
    if (!/^[\w.-]+\.(js|css)$/.test(file)) continue;
    assets.set(`/assets/${file}`, {
      body: await readFile(path.join(staticRoot, 'assets', file)),
      type: file.endsWith('.js') ? 'text/javascript' : 'text/css',
    });
  }
  let runtime: Awaited<ReturnType<typeof createLocalRuntimeServer>> | undefined;
  let origin = '';
  const watchers: FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0,
    building = false,
    stopped = false;
  const failures = new Map<string, RuntimeBuildError>();
  let globalFailure: RuntimeBuildError | undefined;
  const streams = new Set<ServerResponse>();
  const packages = createPackageService(toolRoot);
  const server = createServer((req, res) => {
    void (async () => {
      const send = (status: number, body: string | Buffer, type = 'text/plain') => {
        res.writeHead(status, {
          'Content-Type': type,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'Cross-Origin-Resource-Policy': 'same-origin',
        });
        res.end(body);
      };
      if (
        !origin ||
        req.headers.host !== new URL(origin).host ||
        req.headers['sec-fetch-site'] === 'cross-site' ||
        (req.headers.origin && req.headers.origin !== origin)
      )
        return send(403, 'Forbidden');
      const url = new URL(req.url ?? '/', origin);
      if (url.pathname === '/__bonko/package' || url.pathname === '/__bonko/package-download') {
        if (req.headers['x-bonko-preview'] !== token) return send(403, '{}', 'application/json');
        const project = projectList.find((item) => item.slug === url.searchParams.get('slug'));
        if (!project) return send(404, '{}', 'application/json');
        try {
          if (url.pathname.endsWith('-download')) {
            if (req.method !== 'GET') return send(405, 'Method not allowed');
            const archive = await packages.download(project.root, url.searchParams.get('id'));
            res.setHeader('Content-Disposition', 'attachment; filename="' + archive.filename + '"');
            return send(200, archive.bytes, 'application/zip');
          }
          if (req.method === 'GET')
            return send(
              200,
              JSON.stringify({
                summary: await packageSummary(project.root),
                job: packages.job(project.root),
              }),
              'application/json',
            );
          if (req.method !== 'POST') return send(405, 'Method not allowed');
          if (req.headers['content-type'] !== 'application/json') return send(415, 'JSON required');
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 16384) return send(413, 'Request too large');
            chunks.push(Buffer.from(chunk));
          }
          let input: unknown;
          try {
            input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            throw new StudioConfigError(400, 'Invalid JSON');
          }
          return send(
            202,
            JSON.stringify(await packages.start(project.root, project.slug, input)),
            'application/json',
          );
        } catch (error) {
          return send(
            error instanceof StudioConfigError ? error.status : 422,
            JSON.stringify({
              error:
                error instanceof StudioConfigError ? error.message : 'Unable to prepare package',
            }),
            'application/json',
          );
        }
      }
      if (url.pathname === '/__bonko/settings') {
        if (req.headers['x-bonko-preview'] !== token) return send(403, '{}', 'application/json');
        const project = projectList.find(
          (item) => item.slug === (url.searchParams.get('slug') ?? projectList[0]?.slug),
        );
        if (!project) return send(404, '{}', 'application/json');
        try {
          if (req.method === 'GET')
            return send(
              200,
              JSON.stringify(await readStudioConfig(project.root)),
              'application/json',
            );
          if (req.method !== 'PUT') return send(405, 'Method not allowed');
          if (req.headers['content-type'] !== 'application/json') return send(415, 'JSON required');
          const chunks: Buffer[] = [];
          let bytes = 0;
          for await (const chunk of req) {
            bytes += chunk.length;
            if (bytes > 16384) return send(413, 'Settings too large');
            chunks.push(Buffer.from(chunk));
          }
          let input: unknown;
          try {
            input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            return send(400, JSON.stringify({ error: 'Invalid JSON' }), 'application/json');
          }
          return send(
            200,
            JSON.stringify(await saveStudioConfig(project.root, input)),
            'application/json',
          );
        } catch (error) {
          return send(
            error instanceof StudioConfigError ? error.status : 422,
            JSON.stringify({
              error:
                error instanceof StudioConfigError
                  ? error.message
                  : 'Unable to read or save manifest.json',
            }),
            'application/json',
          );
        }
      }
      if (req.method !== 'GET') return send(405, 'Method not allowed');
      if (url.pathname === '/__bonko/cards') {
        if (req.headers['x-bonko-preview'] !== token) return send(403, '{}', 'application/json');
        const cards = await Promise.all(
          projectList.map(async (project) => {
            try {
              const raw = await readFile(path.join(project.root, 'manifest.json'), 'utf8');
              const manifest = JSON.parse(raw);
              return {
                slug: project.slug,
                name: manifest.name ?? project.slug,
                templateType: manifest.templateType ?? 'static',
                version: manifest.version ?? '1.0',
                author: manifest.author ?? '',
                tags: manifest.tags ?? [],
                hasError: failures.has(project.slug),
              };
            } catch {
              return {
                slug: project.slug,
                name: project.slug,
                templateType: 'static',
                version: '1.0',
                author: '',
                tags: [],
                hasError: true,
              };
            }
          }),
        );
        return send(200, JSON.stringify({ cards }), 'application/json');
      }
      if (url.pathname === '/__bonko/preview') {
        if (req.headers['x-bonko-preview'] !== token) return send(403, '{}', 'application/json');
        const requestedSlug = url.searchParams.get('slug') ?? projectList[0]?.slug;
        const failure = (requestedSlug ? failures.get(requestedSlug) : undefined) ?? globalFailure;
        if (!runtime || failure)
          return send(
            422,
            JSON.stringify({
              error: failure?.message ?? 'Preview is starting',
              diagnostics: failure?.diagnostics ?? [],
            }),
            'application/json',
          );
        return send(200, JSON.stringify(await runtime.preview(requestedSlug)), 'application/json');
      }
      if (url.pathname === '/__bonko/events') {
        if (url.searchParams.get('token') !== token) return send(403, 'Forbidden');
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
        });
        res.write(': connected\n\n');
        streams.add(res);
        req.on('close', () => streams.delete(res));
        return;
      }
      if (url.pathname === '/') return send(200, index, 'text/html');
      const asset = assets.get(url.pathname);
      if (asset) return send(200, asset.body, asset.type);
      return send(404, 'Not found');
    })().catch(() => {
      if (!res.headersSent) {
        res.writeHead(503);
        res.end('Preview unavailable');
      } else res.destroy();
    });
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  async function close() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    for (const w of watchers) w.close();
    watchers.length = 0;
    for (const stream of streams) stream.end();
    streams.clear();
    await packages.close();
    await runtime?.close();
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
  async function rebuild(changedSlug?: string) {
    if (building || stopped) return;
    building = true;
    try {
      let observed;
      do {
        observed = generation;
        try {
          await runtime?.refresh(changedSlug);
          if (changedSlug) failures.delete(changedSlug);
          else failures.clear();
          globalFailure = undefined;
        } catch (error) {
          const err =
            error instanceof RuntimeBuildError
              ? error
              : new RuntimeBuildError('BUILD_FAILED', errorMessage(error));
          if (changedSlug) failures.set(changedSlug, err);
          else globalFailure = err;
        }
      } while (!stopped && observed !== generation);
      for (const stream of streams) {
        stream.write(
          `event: changed\ndata: ${JSON.stringify(changedSlug ? { slug: changedSlug } : {})}\n\n`,
        );
      }
    } finally {
      building = false;
    }
  }
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(listenPort, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    runtime = await createLocalRuntimeServer(projectList, origin);
    for (const wRoot of watchRoots) {
      const w = watch(wRoot, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const str = String(filename);
        if (
          !/^(src[\\/]|assets[\\/]|manifest\.json$|.*[\\/](src[\\/]|assets[\\/]|manifest\.json$))/.test(
            str,
          )
        )
          return;
        generation++;
        clearTimeout(timer);
        let affectedSlug: string | undefined;
        for (const p of projectList) {
          if (
            str.startsWith(p.slug + path.sep) ||
            str.startsWith(p.slug + '/') ||
            wRoot === p.root
          ) {
            affectedSlug = p.slug;
            break;
          }
        }
        timer = setTimeout(() => void rebuild(affectedSlug), 100);
      });
      watchers.push(w);
    }
    return {
      httpServer: server,
      origin,
      close,
      printUrls() {
        console.log(`Bonko Studio: ${origin}/`);
      },
    };
  } catch (error) {
    await close();
    if (errorCode(error) === 'EADDRINUSE') {
      let stopHint = `Find the listener: lsof -nP -iTCP:${listenPort} -sTCP:LISTEN`;
      try {
        const { stdout } = await promisify(execFile)(
          'lsof',
          ['-nP', `-iTCP:${listenPort}`, '-sTCP:LISTEN', '-t'],
          { timeout: 2000, maxBuffer: 16384 },
        );
        const pids = [...new Set(stdout.trim().split(/\s+/))];
        if (pids.length && pids.every((pid) => /^[1-9]\d*$/.test(pid))) {
          stopHint = `Listening process${pids.length > 1 ? 'es' : ''}: ${pids.join(', ')}.\nIf safe to stop, run in your terminal: kill ${pids.join(' ')}`;
        }
      } catch {
        // lsof is optional; an alternate port works without process inspection.
      }
      const alternate = port === 65535 ? 4173 : port + 1;
      throw Object.assign(
        new Error(
          `Port ${port} is already in use on 127.0.0.1.\n` +
            `If this is your existing Studio, open http://127.0.0.1:${port}/\n` +
            `Start another preview: bonko dev --port ${alternate}\n` +
            `${stopHint}\nThen retry bonko dev --port ${port}. No process was stopped.`,
        ),
        { code: 'EADDRINUSE' },
      );
    }
    throw error;
  }
}
