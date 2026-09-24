import { useEffect, useRef, useState } from 'preact/hooks';
import type { HostToWebview, WebviewToHost } from '../../src/panel/protocol.js';
import { vscode } from '../vscodeApi.js';

export type HostMessage<K extends HostToWebview['kind']> = Extract<HostToWebview, { kind: K }>;

/**
 * Hört auf eine Art Host-Nachricht, solange die Komponente steht. Der Rückruf
 * darf bei jedem Rendern ein anderer sein; es gilt immer der neueste.
 */
export function useHostMessage<K extends HostToWebview['kind']>(kind: K, receive: (message: HostMessage<K>) => void): void {
  const latest = useRef(receive);
  latest.current = receive;
  useEffect(() => {
    const listen = (event: MessageEvent<HostToWebview>) => {
      if (event.data?.kind === kind) latest.current(event.data as HostMessage<K>);
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [kind]);
}

/** Für Seiten, die den Host nach eigenen Daten fragen: einmal anfragen, die Antwort halten. */
export function useHost<T>(kind: HostToWebview['kind'], request: WebviewToHost | undefined, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useHostMessage(kind, message => setValue(message as unknown as T));
  useEffect(() => {
    if (request) vscode.postMessage(request);
  }, []);
  return value;
}
