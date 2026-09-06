import { install } from './install.mjs';

// The CLI supplies the existing installation paths, never defaults based on sudo/HOME.
const [version, prefix, binDir] = process.argv.slice(2);
try {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '') || !prefix || !binDir)
    throw new Error('Invalid internal upgrade arguments. Run bonko upgrade.');
  await install(
    [
      '--prefix',
      prefix,
      '--bin-dir',
      binDir,
      '--base-url',
      `https://github.com/bonkofun/bonko-cli/releases/download/v${version}`,
    ],
    version,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Upgrade failed.');
  process.exitCode = 1;
}
