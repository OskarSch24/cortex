import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Page } from '../../src/panel/protocol.js';
import type { PluginView } from '../components/PluginsView.js';
import { vscode } from '../vscodeApi.js';

/** Ein Ort in der App: die Seite und, bei Plugins, die Stelle darin. */
export interface Location {
  page: Page;
  plugins?: PluginView;
  profileId?: string;
}

/** Genug, um sich zurückzuarbeiten; nicht so viel, dass er ewig wächst. */
const HISTORY_MAX = 60;

export function useNavigation() {
  /**
   * Ein Verlauf statt eines einzelnen Seitenzustands.
   *
   * Ohne ihn gab es aus einer Produktseite keinen Weg zurück außer der kleinen
   * Brotkrume — und aus einem Seitenwechsel gar keinen. Ein Ort ist deshalb die
   * Seite *und* die Stelle innerhalb der Plugins; beides zusammen wandert in
   * denselben Stapel, den die Pfeile oben links bedienen.
   */
  const [{ history, cursor }, setNavigation] = useState<{ history: Location[]; cursor: number }>({ history: [{ page: 'chat' }], cursor: 0 });
  const here: Location = history[cursor] ?? { page: 'chat' };
  const page = here.page;
  // Der Nachrichten-Listener entsteht einmal; die Seite liest er über die Ref.
  const pageRef = useRef(page);
  pageRef.current = page;
  const go = (next: Location, skipSamePage = false) => setNavigation(current => {
    const currentPlace = current.history[current.cursor];
    if (skipSamePage && next.page === currentPlace?.page && !(next.page === 'plugins' && currentPlace.plugins?.kind !== 'overview')) return current;
    const history = [...current.history.slice(0, current.cursor + 1), next].slice(-HISTORY_MAX);
    return { history, cursor: history.length - 1 };
  });
  const setCursor = (update: (cursor: number) => number) => setNavigation(current => ({ ...current, cursor: update(current.cursor) }));
  /** Innerhalb der Plugins zu blättern ist ein Schritt wie jeder andere. */
  const goPlugins = (plugins: PluginView) => go({ page: 'plugins', plugins });
  const setPage = (next: Page) => {
    // Zweimal dieselbe Seite ist kein Schritt — sonst müsste man zweimal zurück.
    go(next === 'plugins' ? { page: next, plugins: { kind: 'overview' } } : { page: next }, true);
  };
  const canBack = cursor > 0;
  const canForward = cursor < history.length - 1;
  // Auch Verlauf und Host-Navigation ändern die sichtbare Seite. Die native
  // Titelleiste kennt sie erst durch diese Meldung, unabhängig vom Chatverlauf.
  useLayoutEffect(() => { vscode.postMessage({ kind: 'pageChanged', page }); }, [page]);

  return { history, cursor, here, page, pageRef, go, setCursor, goPlugins, setPage, canBack, canForward };
}
