import { setTimeout } from 'node:timers/promises';

// Mode changes can retire an iframe while its images are still decoding.
// Restart the entire read against fresh locators; never retry template failures.
export async function readCurrentPreview<T>(read: () => Promise<T>): Promise<T> {
  const deadline = performance.now() + 10000;
  for (;;) {
    try {
      return await read();
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !/Frame was detached|Execution context was destroyed/.test(error.message) ||
        performance.now() >= deadline
      )
        throw error;
      await setTimeout(50);
    }
  }
}
