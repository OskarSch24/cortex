/**
 * Genau das, was Cortex vom Schlüsselbund braucht. VS Codes `SecretStorage`
 * erfüllt es, der Speicher der Desktop-App ebenso, und Tests ersetzen ihn
 * durch eine Map.
 */
export interface SecretBackend {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
  onDidChange(listener: (event: { key: string }) => unknown): { dispose(): void };
}
