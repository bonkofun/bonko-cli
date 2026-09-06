#!/usr/bin/env node
import { supportsNode, nodeVersionError } from './node-version.mjs';
if (!supportsNode(process.versions.node)) {
  console.error(nodeVersionError(process.versions.node));
  process.exitCode = 1;
} else {
  try {
    const { main } = await import('../dist-cli/main.js');
    await main(process.argv.slice(2));
  } catch (error) {
    const details = error instanceof Error ? error : new Error('Command failed');
    const code = 'code' in details ? details.code : 'COMMAND_FAILED';
    const diagnostics =
      'diagnostics' in details && Array.isArray(details.diagnostics) ? details.diagnostics : [];
    const message = error instanceof Error ? error.message : 'Command failed';
    if (process.argv.includes('--json')) {
      console.error(
        JSON.stringify({
          ok: false,
          code: code,
          error: message,
          ...(diagnostics.length ? { diagnostics } : {}),
        }),
      );
    } else {
      console.error(`Error: ${message}`);
      for (const item of diagnostics)
        console.error(`${item.file ?? ''}:${item.line ?? ''}:${item.column ?? ''} ${item.message}`);
    }
    process.exitCode = 1;
  }
}
