import type { BuiltTemplate } from './runtime-build.mjs';
export type CheckReport = { ok: boolean; slug: string; protocol: number; digest: string; checks: string[]; manual: string[]; screenshots: string };
export function verifyStandalone(root: string, slug: string, toolRoot: string): Promise<{ report: CheckReport; bundle: BuiltTemplate }>;
export function packStandalone(root: string, slug: string, toolRoot: string): Promise<CheckReport & { files: string[] }>;
