import { useEffect, useRef } from 'preact/hooks';
import { Glyph } from '../CortexIcons.js';

export type DockPick = 'files' | 'agents' | 'video' | 'browser' | 'terminal' | 'changes' | 'canvas';

const PICKS: Array<{ id: DockPick; label: string; icon: string; keys: string }> = [
  { id: 'files', label: 'Dateien', icon: 'folder', keys: '⌘P' },
  { id: 'agents', label: 'Subagenten', icon: 'user', keys: '' },
  { id: 'browser', label: 'Browser', icon: 'globe', keys: '⌘T' },
  { id: 'terminal', label: 'Terminal', icon: 'terminal', keys: '⌃`' },
  { id: 'changes', label: 'Änderungen', icon: 'diff', keys: '' },
  { id: 'canvas', label: 'Excalidraw', icon: 'canvas', keys: '' },
  { id: 'video', label: 'Video (Remotion)', icon: 'play', keys: '' },
];

/** Was sich hinzufügen lässt — Reiter dieses Docks wie Flächen des Editors. */
export function DockChooser({ onPick, onDismiss }: {
  onPick: (pick: DockPick) => void;
  onDismiss: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onDismiss();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [onDismiss]);
  return <div
    class="cx-dock-picks"
    role="menu"
    aria-label="Was soll hier liegen?"
    ref={root}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); onDismiss(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = Array.from(root.current!.querySelectorAll('button'));
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? buttons.length - 1
        : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}
  >
    {PICKS.map(pick => <button key={pick.id} role="menuitem" onClick={() => onPick(pick.id)}>
      <Glyph name={pick.icon} size={14} />
      <span>{pick.label}</span>
      {pick.keys && <kbd>{pick.keys}</kbd>}
    </button>)}
  </div>;
}
