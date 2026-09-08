import type { AddressInfo } from 'node:net';
import type { ServerResponse } from 'node:http';
import type { BuiltTemplate } from './runtime-build.js';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { buildRuntime } from './runtime-build.js';
import {
  createRuntimePreviewToken,
  parseRuntimeOrigins,
  serveRuntimeDocument,
} from '@bonko/template-sdk/runtime-gateway';

const mimeTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
};
const arrayBuffer = (bytes: Buffer) => Uint8Array.from(bytes).buffer;

export type RuntimeProjectTarget = { root: string; slug: string };

/** Loopback-only, in-memory counterpart of the production gateway; no R2 keys. */
export async function createLocalRuntimeServer(
  rootOrProjects: string | RuntimeProjectTarget[],
  slugOrParentOrigin: string,
  maybeParentOrigin?: string,
) {
  let projectList: RuntimeProjectTarget[];
  let parentOrigin: string;
  if (typeof rootOrProjects === 'string') {
    projectList = [{ root: rootOrProjects, slug: slugOrParentOrigin }];
    parentOrigin = maybeParentOrigin!;
  } else {
    projectList = rootOrProjects;
    parentOrigin = slugOrParentOrigin;
  }
  const parent = new URL(parentOrigin);
  if (
    parent.origin !== parentOrigin ||
    parent.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(parent.hostname)
  )
    throw new Error('Local preview requires an exact loopback parent origin');
  const secret = randomBytes(32).toString('hex');
  const assetToken = randomBytes(32).toString('hex');
  type Asset = { bytes: Buffer; byteSize: number; sha256: string; contentType: string };
  type Snapshot = {
    digest: string;
    submission: BuiltTemplate['submission'];
    document: Buffer;
    assets: Record<string, Asset>;
  };
  const projectMap = new Map<string, RuntimeProjectTarget>();
  for (const project of projectList) {
    projectMap.set(project.slug, project);
  }
  const defaultSlug = projectList[0]?.slug;
  const snapshots = new Map<string, Snapshot>();
  const cardSnapshots = new Map<string, Snapshot>();
  const pendingBuilds = new Map<string, Promise<Snapshot>>();
  let closed = false,
    origin = '';
  const store = {
    async get(key: string) {
      const match = /^runtime\/packages\/([a-f0-9]{64})\/document\.json$/.exec(key);
      const item = match && snapshots.get(match[1]);
      // Local drafts never acquire a publication marker.
      return item
        ? { size: item.document.length, arrayBuffer: async () => arrayBuffer(item.document) }
        : null;
    },
  };
  function respond(
    response: ServerResponse,
    status: number,
    body: string | Buffer,
    headers: Record<string, string | number> = {},
    head = false,
  ) {
    const normalized = new Headers({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    for (const [key, value] of Object.entries(headers)) normalized.set(key, String(value));
    response.writeHead(status, Object.fromEntries(normalized));
    response.end(head ? undefined : body);
  }
  const server = createServer((request, response) => {
    void (async () => {
      if (closed || request.headers.host !== new URL(origin).host)
        return respond(response, 403, 'Preview unavailable');
      if (!['GET', 'HEAD'].includes(request.method ?? ''))
        return respond(response, 405, 'Preview unavailable');
      const url = new URL(request.url ?? '/', origin);
      if (url.origin !== origin) return respond(response, 403, 'Preview unavailable');
      const assetMatch = /^\/assets\/([a-f0-9]{64})\/([a-z][a-z0-9-]{0,63})$/.exec(url.pathname);
      if (assetMatch) {
        if (
          url.searchParams.get('token') !== assetToken ||
          url.searchParams.getAll('token').length !== 1 ||
          [...url.searchParams.keys()].some((key) => key !== 'token') ||
          (request.headers.origin && request.headers.origin !== parentOrigin)
        )
          return respond(response, 403, 'Preview unavailable');
        const asset = snapshots.get(assetMatch[1])?.assets[assetMatch[2]];
        if (!asset) return respond(response, 404, 'Preview unavailable');
        return respond(
          response,
          200,
          asset.bytes,
          {
            'Content-Type': asset.contentType,
            'Content-Length': asset.byteSize,
            'Access-Control-Allow-Origin': parentOrigin,
            Vary: 'Origin',
          },
          request.method === 'HEAD',
        );
      }
      const result = await serveRuntimeDocument(new Request(url, { method: request.method }), {
        store,
        parentOrigins: [parentOrigin],
        previewSecret: secret,
      });
      respond(
        response,
        result.status,
        Buffer.from(await result.arrayBuffer()),
        Object.fromEntries(result.headers),
        request.method === 'HEAD',
      );
    })().catch(() => {
      if (!response.headersSent) respond(response, 500, 'Preview unavailable');
      else response.destroy();
    });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 32;
  async function close() {
    if (closed) return;
    closed = true;
    snapshots.clear();
    cardSnapshots.clear();
    pendingBuilds.clear();
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
  async function buildCard(targetSlug: string): Promise<Snapshot> {
    const project = projectMap.get(targetSlug);
    if (!project) throw new Error(`Unknown card slug: ${targetSlug}`);
    const bundle = await buildRuntime(project.root, project.slug);
    if (closed) throw new Error('Local preview is closed');
    const assets = Object.fromEntries(
      Object.entries(bundle.submission.assets).map(([id, asset]) => {
        const bytes = bundle.files[asset.path];
        return [
          id,
          {
            bytes,
            byteSize: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            contentType: mimeTypes[asset.path.split('.').pop() ?? ''],
          },
        ];
      }),
    );
    const document = Buffer.from(
      JSON.stringify({
        script: bundle.files['runtime/entry.js'].toString('utf8'),
        ...(bundle.files['runtime/style.css']
          ? { stylesheet: bundle.files['runtime/style.css'].toString('utf8') }
          : {}),
      }),
    );
    const snapshot: Snapshot = {
      digest: bundle.digest,
      submission: bundle.submission,
      document,
      assets,
    };
    cardSnapshots.set(targetSlug, snapshot);
    snapshots.delete(bundle.digest);
    snapshots.set(bundle.digest, snapshot);
    while (snapshots.size > 20) snapshots.delete(snapshots.keys().next().value!);
    return snapshot;
  }
  async function ensureCardBuilt(targetSlug: string): Promise<Snapshot> {
    let pending = pendingBuilds.get(targetSlug);
    if (!pending) {
      pending = buildCard(targetSlug).finally(() => {
        pendingBuilds.delete(targetSlug);
      });
      pendingBuilds.set(targetSlug, pending);
    }
    return pending;
  }
  async function preview(slug?: string) {
    if (closed) throw new Error('Local preview is unavailable');
    const targetSlug = slug ?? defaultSlug;
    if (!targetSlug) throw new Error('No card available in local preview');
    let snapshot = cardSnapshots.get(targetSlug);
    if (!snapshot) {
      snapshot = await ensureCardBuilt(targetSlug);
    }
    const token = await createRuntimePreviewToken(secret, snapshot.digest);
    return {
      digest: snapshot.digest,
      submission: snapshot.submission,
      url: `${origin}/v3/${snapshot.digest}?parent=${encodeURIComponent(parentOrigin)}&preview=${token}`,
      runtimeOrigin: origin,
      assets: Object.fromEntries(
        Object.entries(snapshot.assets).map(([id, asset]) => [
          id,
          {
            url: `${origin}/assets/${snapshot.digest}/${id}?token=${assetToken}`,
            sha256: asset.sha256,
            byteSize: asset.byteSize,
            contentType: asset.contentType,
          },
        ]),
      ),
    };
  }
  async function refresh(targetSlug?: string) {
    if (closed) throw new Error('Local preview is closed');
    if (targetSlug) {
      await ensureCardBuilt(targetSlug);
      return preview(targetSlug);
    }
    if (defaultSlug) {
      await ensureCardBuilt(defaultSlug);
      return preview(defaultSlug);
    }
    throw new Error('No card available in local preview');
  }
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    parseRuntimeOrigins(origin, [parentOrigin], true);
    if (defaultSlug) {
      await refresh(defaultSlug);
    }
    return { origin, preview, refresh, close };
  } catch (error) {
    await close();
    throw error;
  }
}

export type RuntimePreview = Awaited<
  ReturnType<Awaited<ReturnType<typeof createLocalRuntimeServer>>['preview']>
>;
