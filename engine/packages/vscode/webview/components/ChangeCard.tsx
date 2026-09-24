/**
 * Bausteine der Prüfansicht und der Änderungskarte im Verlauf (TurnChanges in
 * components/chat.tsx): Zeilenzahlen und Pfade.
 */

/** Plus- und Minuszeilen; Prüfansicht und Verlauf tragen je eine eigene Klasse. */
export function Counts({ added, removed, class: cls = 'cx-change-counts' }: { added?: number; removed?: number; class?: string }) {
  if (added === undefined && removed === undefined) return null;
  return <span class={cls}><b>+{added ?? 0}</b> <i>-{removed ?? 0}</i></span>;
}

/** Der Ordner tritt zurück, der Dateiname trägt — beim Überfliegen zählt er. */
export function PathLabel({ path }: { path: string }) {
  const cut = path.lastIndexOf('/');
  return cut === -1 ? <b>{path}</b> : <><span>{path.slice(0, cut + 1)}</span><b>{path.slice(cut + 1)}</b></>;
}
