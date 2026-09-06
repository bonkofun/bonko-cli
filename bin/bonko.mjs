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
    const message = error instanceof Error ? error.message : 'Command failed';
    if (process.argv.includes('--json')) {
      console.error(JSON.stringify({ ok: false, code: error?.code ?? 'COMMAND_FAILED', error: message, ...(error?.diagnostics ? { diagnostics: error.diagnostics } : {}) }));
    } else {
      console.error(`Error: ${message}`);
      for (const item of error?.diagnostics ?? []) console.error(`${item.file ?? ''}:${item.line ?? ''}:${item.column ?? ''} ${item.message}`);
    }
    process.exitCode = 1;
  }
}
