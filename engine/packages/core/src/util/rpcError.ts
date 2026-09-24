/**
 * Ein Fehler, den die Gegenseite per JSON-RPC gemeldet hat. Der Code reist mit:
 * ein Aufrufer muss eine unbekannte Methode (-32601) von einer Ablehnung
 * unterscheiden können, und die Meldung allein („Method not found“) sagt nicht,
 * welche Methode es war.
 */
export class RpcError extends Error {
  readonly code: number | undefined;

  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}
