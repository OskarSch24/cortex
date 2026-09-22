/** Correlation ids identify the request, not the action the user authorized. */
const CORRELATION_FIELDS = new Set(['threadId', 'turnId', 'itemId', 'approvalId', 'sessionId', 'toolCallId']);
const DESCRIPTIVE_FIELDS = new Set(['title', 'kind', 'status', 'locations', 'path', 'cwd', 'reason', 'description', 'availableDecisions']);

export function approvalSignature(params: Record<string, unknown>, cwd: string): string {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)])) : value;
  // Strip only protocol-level ids. Identically named keys within rawInput or
  // command arguments are part of the action and remain significant.
  const action = Object.fromEntries(Object.entries(params).filter(([key]) => !CORRELATION_FIELDS.has(key)));
  const hasValue = (value: unknown): boolean => typeof value === 'string' ? value.trim().length > 0
    : Array.isArray(value) ? value.some(hasValue)
      : value && typeof value === 'object' ? Object.values(value).some(hasValue)
        : value !== undefined && value !== null;
  // A title/path or empty rawInput cannot describe what will actually run.
  // Empty string explicitly disables memory rather than falling back to a
  // shortened display detail in PermissionMemory.
  if (!Object.entries(action).some(([key, value]) => !DESCRIPTIVE_FIELDS.has(key) && hasValue(value))) return '';
  return JSON.stringify(stable({ cwd, action }));
}
