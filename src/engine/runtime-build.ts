import { validatePreviewPhotos } from './preview-photos.js';
import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { packageMetadata } from './package-metadata.js';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const toolRoot = fileURLToPath(new URL('../../', import.meta.url));
const toolRequire = createRequire(new URL('../../package.json', import.meta.url));
import { build } from 'vite';
import { LIMITS } from '@bonko/template-sdk';
import { safePath } from '@bonko/template-sdk/node';
import { parseTemplateSubmission } from '@bonko/template-sdk/submission';
import { inspectRuntimeBundle, packRuntimeBundle } from '@bonko/template-sdk/runtime-bundle';

const packages = ['react', 'react-dom', 'motion', '@bonko/template-sdk'];
const allowed = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom/client',
  'motion/react',
  '@bonko/template-sdk/runtime-client',
]);
export type BuildDiagnostic = {
  code: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
};
export type BuiltTemplate = ReturnType<typeof inspectRuntimeBundle> & { bytes: Buffer };
export class RuntimeBuildError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly diagnostics: BuildDiagnostic[] = [],
  ) {
    super(message);
    this.name = 'RuntimeBuildError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}
export async function readTemplateSource(
  root: string,
  prefix = '',
  budget = { bytes: 0, count: 0 },
): Promise<Record<string, Buffer>> {
  const result: Record<string, Buffer> = Object.create(null);
  const folder = path.join(root, prefix);
  if ((await lstat(folder)).isSymbolicLink()) throw new Error('No symlink directories');
  for (const name of await readdir(folder)) {
    if (!prefix && !['manifest.json', 'LICENSE.md', 'test.json', 'src', 'assets'].includes(name))
      continue;
    const relative = prefix ? `${prefix}/${name}` : name;
    safePath(relative);
    const file = path.join(root, relative),
      stat = await lstat(file);
    if (stat.isSymbolicLink()) throw new Error('No symlinks in templates');
    if (stat.isDirectory()) Object.assign(result, await readTemplateSource(root, relative, budget));
    else if (stat.isFile()) {
      budget.bytes += stat.size;
      if (++budget.count > LIMITS.files || budget.bytes > LIMITS.expanded)
        throw new Error('Source budget exceeded');
      result[relative] = await readFile(file);
    } else throw new Error('Unsupported source file');
  }
  return result;
}
export function checkSourceImports(files: Record<string, Buffer>) {
  for (const [name, bytes] of Object.entries(files)) {
    if (name.endsWith('.css')) {
      if (/@import|url\s*\(/i.test(bytes.toString('utf8')))
        throw new Error('CSS resources must use runtime asset IDs, not imports or URLs');
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name))
      throw new Error('Only TypeScript/TSX/CSS source files are allowed');
    const file = ts.createSourceFile(name, bytes.toString('utf8'), ts.ScriptTarget.Latest, true);
    if (
      file.referencedFiles.length ||
      file.typeReferenceDirectives.length ||
      file.libReferenceDirectives.length ||
      file.hasNoDefaultLib
    )
      throw new Error('Triple-slash references are not supported in template source');
    const visit = (node: ts.Node): void => {
      if (ts.isImportEqualsDeclaration(node))
        throw new Error('Import assignments are not supported');
      if (ts.isMetaProperty(node))
        throw new Error('Environment and import.meta access is not allowed in templates');
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && ['require', 'eval'].includes(node.expression.text)))
      )
        throw new Error('Dynamic imports, require and eval are not supported');
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        if (!ts.isStringLiteral(node.moduleSpecifier)) throw new Error('Use static imports');
        const target = node.moduleSpecifier.text;
        if (target.startsWith('.')) {
          const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name), target));
          if (
            resolved.startsWith('../') ||
            resolved === '..' ||
            target.includes('\\') ||
            target.includes('?')
          )
            throw new Error('Imports must stay inside src');
        } else if (!allowed.has(target))
          throw new Error(`Dependency requires platform review: ${target}`);
      }
      if (ts.isImportTypeNode(node))
        throw new Error('Use approved static type imports, not import() types');
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
}

/** Fixed compiler options: never execute or inherit an author's tsconfig/plugins. */
export function typecheckRuntime(folder: string, source: Record<string, Buffer>) {
  const root = path.join(folder, 'src');
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: [],
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    esModuleInterop: true,
    forceConsistentCasingInFileNames: true,
  };
  const snapshots = new Map(
    Object.entries(source).map(([name, bytes]) => [
      path.resolve(root, name),
      bytes.toString('utf8'),
    ]),
  );
  const host = ts.createCompilerHost(options);
  host.resolveModuleNames = (names, containingFile) =>
    names.map((name) => {
      const from =
        containingFile.startsWith(root + path.sep) && allowed.has(name)
          ? path.join(toolRoot, '__template_types__.tsx')
          : containingFile;
      return ts.resolveModuleName(name, from, options, host).resolvedModule;
    });
  const read = host.readFile.bind(host);
  host.readFile = (file) => snapshots.get(path.resolve(file)) ?? read(file);
  const program = ts.createProgram(
    [...snapshots.keys()].filter((file) => /\.tsx?$/.test(file)),
    options,
    host,
  );
  const diagnostics = ts.getPreEmitDiagnostics(program).map((item) => {
    const position =
      item.file && item.start !== undefined
        ? item.file.getLineAndCharacterOfPosition(item.start)
        : undefined;
    return {
      code: `TS${item.code}`,
      file: item.file ? path.relative(folder, item.file.fileName).replaceAll('\\', '/') : undefined,
      line: position ? position.line + 1 : undefined,
      column: position ? position.character + 1 : undefined,
      message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
    };
  });
  if (diagnostics.length)
    throw new RuntimeBuildError(
      'TYPESCRIPT_FAILED',
      'Template TypeScript checks failed',
      diagnostics,
    );
}

/** Local author code is built here, never by an Admin upload handler. */
export async function buildRuntime(root: string, slug: string): Promise<BuiltTemplate> {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Invalid slug');
  const folder = root;
  const all = await readTemplateSource(folder);
  if (!all['manifest.json'] || !all['LICENSE.md'] || !all['src/main.tsx'])
    throw new Error('Expected manifest.json, LICENSE.md and src/main.tsx');
  const input = JSON.parse(all['manifest.json'].toString('utf8'));
  const manifest = parseTemplateSubmission(input);
  validatePreviewPhotos(manifest);
  if (manifest.slug !== slug) throw new Error('Directory and manifest slug differ');
  const source = Object.fromEntries(
    Object.entries(all)
      .filter(([name]) => name.startsWith('src/'))
      .map(([name, bytes]) => [name.slice(4), bytes]),
  );
  checkSourceImports(source);
  typecheckRuntime(folder, source);
  const result = await build({
    root: folder,
    configFile: false,
    envDir: false,
    logLevel: 'silent',
    resolve: {
      alias: [...allowed]
        .map((name) => ({ find: name, replacement: toolRequire.resolve(name) }))
        .sort((a, b) => b.find.length - a.find.length),
    },
    // Library builds do not replace this dependency branch automatically.
    // Pin it to a literal; never forward the author's process/environment.
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      write: false,
      sourcemap: false,
      minify: true,
      lib: {
        entry: path.join(folder, 'src/main.tsx'),
        name: 'BonkoTemplate',
        formats: ['iife'],
        cssFileName: 'style',
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((output) => {
    if (!('output' in output)) throw new Error('Watch output is not supported');
    return output.output;
  });
  const chunks = outputs.filter((file) => file.type === 'chunk');
  if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.length)
    throw new Error('Runtime must be a single self-contained script');
  const css = outputs.filter((file) => file.type === 'asset');
  if (css.length > 1 || css.some((file) => !file.fileName.endsWith('.css')))
    throw new Error('Use logical asset IDs, not imported media');
  const dependencies: Record<string, string> = {};
  for (const name of packages) {
    const installed = await packageMetadata(name);
    dependencies[name] = installed.version;
  }
  const files: Record<string, Buffer> = {
    'manifest.json': Buffer.from(
      JSON.stringify({ ...manifest, ...(css.length ? { stylesheet: 'runtime/style.css' } : {}) }),
    ),
    'LICENSE.md': all['LICENSE.md'],
    'runtime/entry.js': Buffer.from(chunks[0].code),
    'source/dependencies.json': Buffer.from(JSON.stringify(dependencies)),
    ...Object.fromEntries(Object.entries(source).map(([name, bytes]) => [`source/${name}`, bytes])),
    ...(css.length ? { 'runtime/style.css': Buffer.from(css[0].source) } : {}),
  };
  for (const asset of Object.values(manifest.assets)) {
    if (!all[asset.path]) throw new Error(`Missing asset: ${asset.path}`);
    files[asset.path] = all[asset.path];
  }
  const bytes = packRuntimeBundle(files);
  return { bytes, ...inspectRuntimeBundle(bytes) };
}
