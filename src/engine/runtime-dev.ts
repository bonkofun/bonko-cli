import type { AddressInfo } from 'node:net';
import type { ServerResponse } from 'node:http';
import type { FSWatcher } from 'node:fs';
import { errorMessage } from '../errors.js';
import { RuntimeBuildError } from './runtime-build.js';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { createLocalRuntimeServer } from './runtime-server.js';

/** Prebuilt Studio UI and a separately hosted opaque Runtime; loopback only. */
export async function standaloneServerFor(
  root: string,
  slug: string,
  toolRoot: string,
  port = 4173,
) {
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
  let watcher: FSWatcher | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0,
    building = false,
    stopped = false;
  let failure: RuntimeBuildError | undefined;
  const streams = new Set<ServerResponse>();
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
      if (req.method !== 'GET') return send(405, 'Method not allowed');
      const url = new URL(req.url ?? '/', origin);
      if (url.pathname === '/__bonko/preview') {
        if (req.headers['x-bonko-preview'] !== token) return send(403, '{}', 'application/json');
        if (!runtime || failure)
          return send(
            422,
            JSON.stringify({
              error: failure?.message ?? 'Preview is starting',
              diagnostics: failure?.diagnostics ?? [],
            }),
            'application/json',
          );
        return send(200, JSON.stringify(await runtime.preview()), 'application/json');
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
    watcher?.close();
    for (const stream of streams) stream.end();
    streams.clear();
    await runtime?.close();
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
  async function rebuild() {
    if (building || stopped) return;
    building = true;
    try {
      let observed;
      do {
        observed = generation;
        try {
          await runtime?.refresh();
          failure = undefined;
        } catch (error) {
          failure =
            error instanceof RuntimeBuildError
              ? error
              : new RuntimeBuildError('BUILD_FAILED', errorMessage(error));
        }
      } while (!stopped && observed !== generation);
      for (const stream of streams) stream.write('event: changed\ndata: {}\n\n');
    } finally {
      building = false;
    }
  }
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    runtime = await createLocalRuntimeServer(root, slug, origin);
    watcher = watch(root, { recursive: true }, (_event, filename) => {
      if (!filename || !/^(src[\\/]|assets[\\/]|manifest\.json$)/.test(String(filename))) return;
      generation++;
      clearTimeout(timer);
      timer = setTimeout(() => void rebuild(), 100);
    });
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
    throw error;
  }
}
