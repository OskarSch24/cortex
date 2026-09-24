import { useDismissiblePopup } from '../../hooks/useDismissiblePopup.js';
import { useState } from 'preact/hooks';
import { IconPlus } from '../icons.js';
import { Glyph } from '../CortexIcons.js';

/**
 * Was man einer Nachricht mitgeben kann, an einer Stelle.
 *
 * Jeder Eintrag hat etwas hinter sich: Anhänge gehen an den Dateidialog des
 * Hosts, Ordner legen ein Projekt an, Slash-Befehle öffnen die Liste, die beim
 * Tippen von "/" ohnehin erscheint, und Konnektoren sind die MCP-Server, die
 * Cortex in jedes Anbieterprofil spiegelt.
 */
export function AddMenu({
  onAttachments,
  onFolder,
  onImage,
  onSlash,
  onConnectors,
  onTemplates,
  onLocation,
}: {
  onLocation?: () => void;
  onAttachments: () => void;
  onImage?: () => void;
  onFolder?: () => void;
  onSlash: () => void;
  onConnectors?: () => void;
  onTemplates?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useDismissiblePopup<HTMLDivElement>(open, () => setOpen(false));
  const choose = (action?: () => void) => { setOpen(false); action?.(); };
  const rows: Array<{ icon: string; label: string; hint?: string; run?: () => void; rule?: boolean }> = [
    { icon: 'file', label: 'Dateien oder Fotos hinzufügen', hint: '⌘U', run: onAttachments },
    { icon: 'folder', label: 'Ordner hinzufügen', run: onFolder },
    { icon: 'location', label: 'Standort (Maps)', run: onLocation },
    { icon: 'image', label: 'Bild erstellen', hint: '⌘I', run: onImage, rule: true },
    { icon: 'code', label: 'Slash-Befehle', run: onSlash },
    { icon: 'link', label: 'Konnektoren', hint: 'MCP', run: onConnectors },
    { icon: 'file', label: 'Vorlagen', run: onTemplates },
  ];
  return (
    <div ref={root} class="mode-menu add-menu">
      <button
        class="icon-btn attach-btn"
        title="Hinzufügen"
        aria-label="Hinzufügen"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <IconPlus size={18} />
      </button>
      {open && (
        <div class="menu-popup add-popup" role="menu" aria-label="Hinzufügen">
          {rows.map((row) => [
            row.rule && <div key={`${row.label}-rule`} class="add-popup-rule" role="separator" />,
            <button key={row.label} class="menu-row" role="menuitem" disabled={!row.run} title={row.label === 'Bild erstellen' && !row.run ? 'Erfordert ein verfügbares ChatGPT- oder Grok-Konto' : undefined} onClick={() => choose(row.run)}>
              <Glyph name={row.icon} size={15} />
              <span class="menu-name">{row.label}</span>
              {row.hint && <span class="menu-hint">{row.hint}</span>}
            </button>,
          ])}
        </div>
      )}
    </div>
  );
}
