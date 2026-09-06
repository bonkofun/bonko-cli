import { errorCode } from '../errors.js';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
/** npm may hoist dependencies; do not assume they live below the CLI directory. */
export async function packageMetadata(name: string): Promise<{ name: string; version: string }> {
  let directory = path.dirname(require.resolve(name));
  while (true) {
    try {
      const data: unknown = JSON.parse(
        await readFile(path.join(directory, 'package.json'), 'utf8'),
      );
      if (
        data &&
        typeof data === 'object' &&
        'name' in data &&
        data.name === name &&
        'version' in data &&
        typeof data.version === 'string'
      )
        return { name, version: data.version };
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`Cannot locate installed package metadata: ${name}`);
    directory = parent;
  }
}
