import type { Server } from 'node:http';
export function standaloneServerFor(root: string, slug: string, toolRoot: string, port?: number): Promise<{ httpServer: Server; origin: string; close(): Promise<void>; printUrls(): void }>;
