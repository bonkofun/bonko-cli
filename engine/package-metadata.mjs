import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
/** npm may hoist dependencies; do not assume they live below the CLI directory. */
export async function packageMetadata(name) {
  let directory = path.dirname(require.resolve(name));
  while (true) {
    try {
      const data = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
      if (data.name === name) return data;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`Cannot locate installed package metadata: ${name}`);
    directory = parent;
  }
}
