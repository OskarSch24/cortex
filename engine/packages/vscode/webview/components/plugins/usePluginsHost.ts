import { useEffect, useState } from 'preact/hooks';
import type { HostToWebview, PluginScope } from '../../../src/panel/protocol.js';
import { vscode } from '../../vscodeApi.js';

export type Plugins = Extract<HostToWebview, { kind: 'plugins' }>;
export type Templates = Extract<HostToWebview, { kind: 'templates' }>;
type Progress = Extract<HostToWebview, { kind: 'pluginProgress' }>;
type Live = Extract<HostToWebview, { kind: 'pluginLive' }>;

/**
 * Was die Plugin-Seite vom Host weiß: Katalogstand, Vorlagen, der gewählte
 * Ort für neue Plugins, was gerade arbeitet, und die letzte Meldung.
 */
export function usePluginsHost() {
  const [host, setHost] = useState<Plugins>();
  const [templates, setTemplates] = useState<Templates>();
  const [scope, setScope] = useState<PluginScope>();
  const [busy, setBusy] = useState<string>();
  const [toast, setToast] = useState<Progress>();
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const listen = (event: MessageEvent<HostToWebview>) => {
      const msg = event.data;
      if (msg?.kind === 'plugins') {
        setHost(msg);
        setSyncing(false);
        setBusy(undefined);
        // Der Ort richtet sich nach der Wirklichkeit: bringt das Projekt eine
        // eigene mcp.json mit, ist sie gemeint — sonst die persönliche.
        const preferred = (msg.scopes.find((s) => s.exists) ?? msg.scopes[0])?.id ?? 'persoenlich';
        setScope((prev: PluginScope | undefined) => prev ?? preferred);
      }
      // Prüfergebnisse und Anmeldungen kommen nach, ohne dass die Seite fragt.
      if (msg?.kind === 'pluginLive') {
        const { kind: _kind, ...live } = msg as Live;
        setHost((prev) => (prev ? { ...prev, ...live } : prev));
      }
      if (msg?.kind === 'templates') setTemplates(msg);
      if (msg?.kind === 'pluginProgress') {
        setToast(msg);
        setBusy(undefined);
      }
    };
    window.addEventListener('message', listen);
    vscode.postMessage({ kind: 'getPlugins' });
    vscode.postMessage({ kind: 'getTemplates' });
    return () => window.removeEventListener('message', listen);
  }, []);

  useEffect(() => {
    // Eine Meldung mit Knopf bleibt stehen, bis man ihn benutzt oder sie schließt.
    if (!toast || toast.action) return;
    const timer = setTimeout(() => setToast(undefined), 5200);
    return () => clearTimeout(timer);
  }, [toast]);

  return { host, templates, scope, setScope, busy, setBusy, toast, setToast, syncing, setSyncing };
}
