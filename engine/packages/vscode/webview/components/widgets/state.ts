import { useEffect, useMemo, useState } from 'preact/hooks';
import { vscode } from '../../vscodeApi.js';
import type { WidgetHost } from './parts.js';

const states = new Map<string, unknown>();
const listeners = new Set<() => void>();
let listening = false;
const identity = (conversationId: string, key: string) => `${conversationId}/${key}`;

export function useWidgetState<T>(host: WidgetHost, initial: () => T): [T, (update: T | ((before: T) => T)) => void, boolean] {
  const conversationId = host.conversationId, key = host.stateKey;
  const id = conversationId && key ? identity(conversationId, key) : undefined;
  const initialValue = useMemo(initial, [id]);
  const [local, setLocal] = useState(initial);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!id || !conversationId || !key) return;
    if (!listening) {
      listening = true;
      window.addEventListener('message', event => {
        if (event.data?.kind !== 'widgetState') return;
        const msg = event.data;
        states.set(identity(msg.conversationId, msg.key), msg.value);
        listeners.forEach(fn => fn());
      });
    }
    const changed = () => tick(n => n + 1);
    listeners.add(changed);
    if (!states.has(id)) vscode.postMessage({ kind: 'getWidgetState', conversationId, key });
    return () => { listeners.delete(changed); };
  }, [id]);
  const loaded = !id || states.has(id);
  const state = (id ? states.get(id) : local) as T | undefined;
  const value = state ?? (id ? initialValue : local);
  const update = (change: T | ((before: T) => T)) => {
    if (!loaded) return;
    const next = typeof change === 'function' ? (change as (before: T) => T)(value) : change;
    if (id && conversationId && key) {
      states.set(id, next); listeners.forEach(fn => fn());
      vscode.postMessage({ kind: 'setWidgetState', conversationId, key, value: next });
    } else setLocal(next);
  };
  useEffect(() => {
    if (id && loaded && states.get(id) === undefined) update(initialValue);
  }, [id, loaded]);
  return [value, update, loaded];
}
