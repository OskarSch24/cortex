/**
 * Bausteine der Prüfansicht: Zeilenzahlen und Pfade. Die Änderungskarte im
 * Verlauf selbst steht jetzt je Auftrag in components/chat.tsx (TurnChanges).
 */

export function Counts({ added, removed }: { added: number; removed: number }) {
  return <span class="cx-change-counts"><b>+{added}</b> <i>-{removed}</i></span>;
}

/** Der Ordner tritt zurück, der Dateiname trägt — beim Überfliegen zählt er. */
export function split(path: string) {
  const cut = path.lastIndexOf('/');
  if (cut === -1) return <><b>{path}</b></>;
  return <><span>{path.slice(0, cut + 1)}</span><b>{path.slice(cut + 1)}</b></>;
}
