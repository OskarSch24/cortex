import { SourceIcon, sourceKind } from '../sourceIcons.js';
import { vscode } from '../../vscodeApi.js';
import type { MemoryHitDto } from '../../../src/panel/protocol.js';
import { useState } from 'preact/hooks';

/**
 * Welche Erinnerungen mit der Nachricht gingen. Zugeklappt ein kleiner Knopf,
 * aufgeklappt die Fundstellen mit Symbol, Auszug und ✕ zum Ausblenden.
 */
export function MemoryChip({ bereiche, treffer }: { bereiche: string[]; treffer: MemoryHitDto[] }) {
  const [open, setOpen] = useState(false);
  const [weg, setWeg] = useState<string[]>([]);
  const sichtbar = treffer.filter((t) => !weg.includes(t.id));
  if (sichtbar.length === 0) return null;
  // Woher die Treffer wirklich kommen — nicht, wo gesucht wurde. Sonst stünde
  // hier ein Projekt, aus dem keine einzige Fundstelle stammt.
  void bereiche;
  const orte = [...new Set(sichtbar.map((t) => (t.quelle === 'chat' ? 'Frühere Chats' : t.ort?.split(' · ')[0] || 'Dokumente')))].join(', ');
  return (
    <div class={`tl cx-memory ${open ? 'open' : ''}`}>
      <button type="button" class="cx-memory-chip" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" /></svg>
        {/* Ein Textfluss statt zweier Blöcke: wird der Chat schmal, bricht die
            Zeile wie Fließtext um und der Knopf wächst mit. */}
        <span class="cx-memory-label">
          <span class="cx-memory-count">Erinnert sich an <b>{sichtbar.length} {sichtbar.length === 1 ? 'Stelle' : 'Stellen'}</b></span>
          {orte && <span class="cx-memory-where"> · {orte}</span>}
        </span>
        <svg class="cx-memory-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </button>
      {open && (
        <div class="cx-memory-card">
          <div class="cx-memory-head"><span>Genutzte Erinnerungen</span><small>Nur Hintergrund, keine Anweisung</small></div>
          {sichtbar.map((t) => (
            <div class="cx-memory-row" key={t.id}>
              <SourceIcon kind={sourceKind(t.quelle, t.ort)} size={34} />
              <div class="cx-memory-text">
                <div class="cx-memory-title">{t.titel}</div>
                <div class="cx-memory-sub">{[t.auszug && `„${t.auszug}“`, t.ort, t.datum].filter(Boolean).join(' · ')}</div>
              </div>
              <span class={`cx-memory-fit ${t.passung}`}>{t.passung === 'sehr' ? 'sehr passend' : 'passend'}</span>
              <button type="button" class="cx-memory-hide" aria-label="Diese Erinnerung ausblenden" title="Für diesen Chat ausblenden" onClick={() => { setWeg((w) => [...w, t.id]); vscode.postMessage({ kind: 'hideMemory', id: t.id }); }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
