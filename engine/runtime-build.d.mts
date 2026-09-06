import { inspectRuntimeBundle } from '@bonko/template-sdk/runtime-bundle';
export type BuiltTemplate = ReturnType<typeof inspectRuntimeBundle> & { bytes: Buffer };
export function buildRuntime(root: string, slug: string): Promise<BuiltTemplate>;
