/** Preserve operational error codes without assuming every thrown value is an Error. */
export function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Operation failed';
}
