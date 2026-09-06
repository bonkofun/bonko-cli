import { build } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  configFile: false, envDir: false, root: path.join(root, 'app'),
  resolve: { alias: { '@': path.join(root, 'app') } },
  plugins: [tailwindcss(), {
    name: 'bonko-preview-token',
    resolveId(id) { if (id === 'virtual:standalone') return '\0bonko-token'; },
    load(id) { if (id === '\0bonko-token') return 'export const token = globalThis.__BONKO_PREVIEW_TOKEN__;'; },
  }],
  build: { outDir: path.join(root, 'studio-dist'), emptyOutDir: true },
});
