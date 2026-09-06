import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A release may only publish an immutable stable version already merged to main.
 * @param {{cwd?: string, tag?: string, mainRef?: string}} options
 */
export function validateRelease({
  cwd = process.cwd(),
  tag = process.env.RELEASE_TAG,
  mainRef = 'refs/remotes/origin/main',
} = {}) {
  const pkg = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(path.join(cwd, 'npm-shrinkwrap.json'), 'utf8'));
  if (
    typeof pkg.version !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(pkg.version) ||
    tag !== `v${pkg.version}`
  )
    throw new Error('Use a stable vX.Y.Z tag matching package.json.');
  if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version)
    throw new Error('Update npm-shrinkwrap.json before tagging.');
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', mainRef], { cwd, stdio: 'pipe' });
  } catch {
    throw new Error(
      'Release commit must already be merged into origin/main. Merge its PR before tagging.',
    );
  }
  return pkg.version;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(`Validated release ${validateRelease()}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Release validation failed');
    process.exitCode = 1;
  }
}
