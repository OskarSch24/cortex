/** Der lesbare Text eines Fehlers — bei allem, was kein `Error` ist, seine Textform. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
