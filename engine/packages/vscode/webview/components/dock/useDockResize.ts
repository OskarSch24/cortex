import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { savePaneWidth, type usePaneBounds } from '../PaneResizeHandle.js';
import { CHAT_MIN, DOCK_MIN, DOCK_SNAP, type DockState } from './state.js';

/**
 * Breite, Einrasten und Vollbild des Docks. Die Kante folgt beim Ziehen der
 * Maus; erst beim Loslassen entscheidet sich, ob das Dock zuklappt, ins
 * Vollbild geht oder an die nächste erlaubte Breite läuft.
 */
export function useDockResize({ state, patch, bounds, motion, onHide, onLiveWidth }: {
  state: DockState;
  patch: (next: Partial<DockState>) => void;
  bounds: ReturnType<typeof usePaneBounds>;
  motion?: 'enter' | 'leave';
  onHide: (instant?: boolean) => void;
  onLiveWidth?: (width: number | undefined) => void;
}) {
  const maxWidth = Math.max(DOCK_MIN, (bounds.parent || window.innerWidth - 250) - (window.innerWidth <= 1200 ? 32 : CHAT_MIN));
  const parentWidth = bounds.parent || window.innerWidth - 250;
  const settled = Math.min(maxWidth, Math.max(DOCK_MIN, state.width));
  /**
   * Die Kante folgt der Maus über beide Grenzen hinaus: unter der Mindestbreite
   * wird das Dock angeschnitten, jenseits der Chat-Mindestbreite der Chat.
   * Erst beim Loslassen entscheidet sich, wohin sie weich weiterläuft — zu,
   * Vollbild oder zurück an die Grenze. Kein Stehenbleiben, kein Sprung.
   */
  const [live, setLive] = useState<number>();
  useEffect(() => { if (live !== undefined) onLiveWidth?.(live); }, [live]);
  const width = state.fullscreen ? undefined : live ?? (motion === 'leave' ? state.width : settled);
  const narrow = live !== undefined && live < DOCK_MIN;
  const overwide = live !== undefined && live > maxWidth;

  /**
   * Eine Breitenbewegung von `from` nach `to`, danach `done`. Läuft über die
   * Web-Animations-Schnittstelle direkt am Element: der Zustand springt erst
   * am Ende, dazwischen zeichnet der Browser. Chat und Dock werden dabei
   * angeschnitten statt gestaucht (Klasse `morphing`).
   */
  const morph = (from: number, to: number, done: () => void, ms = 260) => {
    const node = bounds.ref.current;
    if (!node || typeof node.animate !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) { onLiveWidth?.(undefined); done(); return; }
    // Beim Schrumpfen behält der Inhalt die Ausgangsbreite und wird angeschnitten.
    node.style.setProperty('--cx-dock-inner', `${Math.max(DOCK_MIN, Math.min(from, parentWidth))}px`);
    node.classList.add('morphing');
    // Die Übersichtskarte richtet sich gleich nach dem Ziel und fährt mit.
    onLiveWidth?.(to);
    const animation = node.animate(
      [{ width: `${from}px`, minWidth: `${from}px` }, { width: `${to}px`, minWidth: `${to}px` }],
      { duration: ms, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'forwards' },
    );
    animation.onfinish = () => {
      onLiveWidth?.(undefined);
      done();
      // Erst nach dem neuen Zustand loslassen, sonst blitzt die alte Breite auf.
      requestAnimationFrame(() => requestAnimationFrame(() => { animation.cancel(); node.classList.remove('morphing'); }));
    };
  };

  const release = (raw: number) => {
    const at = Math.max(0, Math.min(parentWidth, raw));
    if (at < DOCK_MIN - DOCK_SNAP) {
      // Wieder geöffnet steht es auf der Mindestbreite, nicht auf dem letzten Mausschritt.
      morph(at, 0, () => { setLive(undefined); patch({ width: DOCK_MIN }); savePaneWidth('dock', DOCK_MIN); onHide(true); });
      return;
    }
    if (window.innerWidth > 1000 && at > maxWidth + DOCK_SNAP) {
      morph(at, parentWidth, () => { setLive(undefined); patch({ fullscreen: true }); });
      return;
    }
    const target = Math.min(maxWidth, Math.max(DOCK_MIN, at));
    savePaneWidth('dock', target);
    if (target === at) { setLive(undefined); onLiveWidth?.(undefined); patch({ width: target }); return; }
    morph(at, target, () => { setLive(undefined); patch({ width: target }); }, 200);
  };

  /** Der Knopf nimmt denselben Weg wie das Ziehen: die Kante läuft ans Ziel. */
  const toggleFullscreen = () => {
    if (!state.fullscreen) { morph(settled, parentWidth, () => patch({ fullscreen: true })); return; }
    exitFrom.current = bounds.width || parentWidth;
    patch({ fullscreen: false });
  };
  const exitFrom = useRef<number>();
  useLayoutEffect(() => {
    const from = exitFrom.current;
    exitFrom.current = undefined;
    if (from !== undefined && !state.fullscreen) morph(from, settled, () => {});
  }, [state.fullscreen]);

  /** Einklappen fährt hinaus; aus dem Vollbild schließt es ohne Bewegung wie bei Codex. */
  const hide = () => {
    if (state.fullscreen) { onHide(); return; }
    morph(settled, 0, () => onHide(true), 300);
  };

  return { maxWidth, parentWidth, settled, width, narrow, overwide, setLive, release, toggleFullscreen, hide };
}
