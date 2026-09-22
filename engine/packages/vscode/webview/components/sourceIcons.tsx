/**
 * Quellen-Symbole im Stil von iOS, Klar-Variante: dunkle Glaskachel mit
 * Glanzkante, das Zeichen in der Farbe seiner Art, leicht leuchtend. Entwurf: Design-Leinwand
 * „Cortex Chat-Feinschliff“ › Quellen-Icons.
 */

export type SourceKind = 'chat' | 'dokument' | 'pdf' | 'notiz' | 'code' | 'tabelle' | 'web' | 'bild' | 'mail' | 'audio' | 'video' | 'projekt';

const W = { fill: 'currentColor' };
const ICONS: Record<SourceKind, { from: string; to: string; label: string; svg: preact.JSX.Element }> = {
  chat: { from: '#4ade80', to: '#16a34a', label: 'Chat', svg: <><path {...W} d="M12 4c4.97 0 9 3.36 9 7.5S16.97 19 12 19c-1.1 0-2.15-.16-3.13-.46L4.5 20l1.2-3.5C4.02 15.2 3 13.45 3 11.5 3 7.36 7.03 4 12 4z" /><circle cx="8.5" cy="11.5" r="1.2" fill="#16a34a" /><circle cx="12" cy="11.5" r="1.2" fill="#16a34a" /><circle cx="15.5" cy="11.5" r="1.2" fill="#16a34a" /></> },
  dokument: { from: '#60a5fa', to: '#2563eb', label: 'Dokument', svg: <><path {...W} d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5" fill="#bfdbfe" /><path d="M9 12h6M9 15h6M9 18h4" stroke="#2563eb" stroke-width="1.6" stroke-linecap="round" /></> },
  pdf: { from: '#fb7185', to: '#e11d48', label: 'PDF', svg: <><path {...W} d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5" fill="#fecdd3" /><rect x="8" y="13" width="9" height="5" rx="1.5" fill="#e11d48" /></> },
  notiz: { from: '#fde047', to: '#eab308', label: 'Notiz', svg: <><rect x="5" y="4" width="14" height="16" rx="2.5" {...W} /><rect x="5" y="4" width="14" height="4" rx="2" fill="#fef08a" /><path d="M8 12h8M8 15.5h6" stroke="#a16207" stroke-width="1.6" stroke-linecap="round" /></> },
  code: { from: '#a5b4fc', to: '#6366f1', label: 'Code', svg: <path d="m9 8-4 4 4 4M15 8l4 4-4 4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none" /> },
  tabelle: { from: '#5eead4', to: '#0d9488', label: 'Tabelle', svg: <><ellipse cx="12" cy="6.5" rx="6.5" ry="2.5" {...W} /><path {...W} d="M5.5 6.5v11c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-11c0 1.4-2.9 2.5-6.5 2.5S5.5 7.9 5.5 6.5z" opacity=".9" /><path d="M5.5 12.2c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" stroke="#0d9488" stroke-width="1.4" fill="none" /></> },
  web: { from: '#7dd3fc', to: '#0284c7', label: 'Webseite', svg: <><circle cx="12" cy="12" r="8" {...W} /><path d="M4 12h16M12 4c2.2 2.3 3.2 5 3.2 8s-1 5.7-3.2 8c-2.2-2.3-3.2-5-3.2-8s1-5.7 3.2-8z" stroke="#0284c7" stroke-width="1.5" fill="none" /></> },
  bild: { from: '#fdba74', to: '#f43f5e', label: 'Bild', svg: <><rect x="4" y="5" width="16" height="14" rx="3" {...W} /><circle cx="9" cy="10" r="1.8" fill="#f97316" /><path d="M4.5 17l4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5" fill="#fb7185" /></> },
  mail: { from: '#93c5fd', to: '#3b82f6', label: 'E-Mail', svg: <><rect x="3.5" y="6" width="17" height="12" rx="2.5" {...W} /><path d="m4.5 7.5 7.5 5.5 7.5-5.5" stroke="#3b82f6" stroke-width="1.7" fill="none" stroke-linecap="round" /></> },
  audio: { from: '#d8b4fe', to: '#9333ea', label: 'Audio', svg: <><rect x="10" y="3.5" width="4" height="10" rx="2" {...W} /><path d="M7 11a5 5 0 0 0 10 0M12 16v4M9 20h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" /></> },
  video: { from: '#fca5a5', to: '#dc2626', label: 'Video', svg: <><rect x="3.5" y="6" width="17" height="12" rx="3.5" {...W} /><path d="M10.5 9.5v5l4.5-2.5z" fill="#dc2626" /></> },
  projekt: { from: '#67e8f9', to: '#0891b2', label: 'Projekt', svg: <><path {...W} d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /><path d="M3.5 10h17" stroke="#0891b2" stroke-width="1.3" /></> },
};

/** Die Art einer Quelle aus Herkunft und Dateiname. */
export function sourceKind(quelle: 'chat' | 'dokument', name?: string): SourceKind {
  if (quelle === 'chat') return 'chat';
  const ext = /\.([A-Za-z0-9]+)$/.exec(name ?? '')?.[1]?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (/^(py|ts|tsx|js|mjs|swift|sh|sql|rs|go|java|rb|php|css|html)$/.test(ext)) return 'code';
  if (/^(csv|xlsx|xls|db|sqlite|json|numbers)$/.test(ext)) return 'tabelle';
  if (/^(png|jpe?g|gif|webp|heic|svg)$/.test(ext)) return 'bild';
  if (/^(mp3|m4a|wav|aac)$/.test(ext)) return 'audio';
  if (/^(mp4|mov|webm)$/.test(ext)) return 'video';
  if (/^(eml|mbox)$/.test(ext)) return 'mail';
  if (/^(html?|url|webloc)$/.test(ext)) return 'web';
  if (/^(txt|note|notes)$/.test(ext)) return 'notiz';
  return 'dokument';
}

export function SourceIcon({ kind, size = 32 }: { kind: SourceKind; size?: number }) {
  const icon = ICONS[kind];
  return (
    <span class="cx-source-icon" title={icon.label} style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), color: icon.from, '--glow': `${icon.from}66` }}>
      <svg width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} viewBox="0 0 24 24" aria-hidden="true">{icon.svg}</svg>
    </span>
  );
}
