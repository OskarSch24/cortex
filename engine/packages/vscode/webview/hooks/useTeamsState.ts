import { useEffect, useState } from 'preact/hooks';
import type { HostToWebview } from '../../src/panel/protocol.js';
import type { TeamsState } from '../../src/teams/types.js';
import { vscode } from '../vscodeApi.js';

/**
 * Profile und Läufe aus „Aktive Agenten“, beim Host angefragt und danach
 * mitgehalten. Mit `newestOnly` verdrängt ein älterer Stand (kleinere
 * Revision) den schon gezeigten nicht.
 */
export function useTeamsState({ newestOnly = false }: { newestOnly?: boolean } = {}): TeamsState | undefined {
  const [state, setState] = useState<TeamsState>();
  useEffect(() => {
    const receive = (event: MessageEvent<HostToWebview>) => {
      if (event.data?.kind !== 'teamsState' || !event.data.state) return;
      const incoming = event.data.state;
      if (newestOnly) setState(current => current && current.revision > incoming.revision ? current : incoming);
      else setState(incoming);
    };
    window.addEventListener('message', receive);
    vscode.postMessage({ kind: 'getTeams' });
    return () => window.removeEventListener('message', receive);
  }, []);
  return state;
}
