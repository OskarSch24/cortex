import { useDismissiblePopup } from '../../hooks/useDismissiblePopup.js';
import { useState } from 'preact/hooks';
import { Glyph } from '../CortexIcons.js';

/*
 * Three levels, and they are levels: each one allows strictly more than the
 * one above it. What separates Edit from Full is the sandbox each CLI is
 * started with, so the hints name that rather than both saying "accepts
 * things automatically".
 */
const PERMISSION_MODES = [
  { id: 'safe', ask: false, label: 'Plan', hint: 'Code untersuchen und Änderungen planen.', icon: 'file' },
  { id: 'edits', ask: true, label: 'Genehmigung anfordern', hint: 'Vor Änderungen und Befehlen nachfragen.', icon: 'shield' },
  { id: 'edits', ask: false, label: 'Änderungen automatisch akzeptieren', hint: 'Bearbeitungen nach den Regeln des Anbieters erlauben.', icon: 'edit' },
  { id: 'full', ask: false, label: 'Uneingeschränkter Zugriff', hint: 'Dateien bearbeiten und Befehle ohne Rückfrage ausführen.', icon: 'shield' },
];


export function ModeMenu({
  permissionMode,
  askPermission,
  onModeChange,
}: {
  permissionMode: string;
  askPermission: boolean;
  onModeChange: (modes: {
    permissionMode?: string;
    routingMode?: 'auto' | 'manual';
    ask?: boolean;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useDismissiblePopup<HTMLDivElement>(open, () => setOpen(false));
  const selected = PERMISSION_MODES.find(m => m.id === permissionMode && (m.id !== 'edits' || m.ask === askPermission)) ?? PERMISSION_MODES[0]!;
  return <div ref={pickerRef} class="mode-menu permission-picker">
    <button class={`mode-btn permission-btn ${permissionMode === 'full' ? 'is-full' : ''}`} title="Berechtigungen für diese Aufgabe wählen" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
      <Glyph name="shield" size={16} /><span>{selected.label}</span>
    </button>
    {open && <div class="menu-popup permission-popup" role="menu" aria-label="Berechtigungen" onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
      <div class="menu-label">Was darf der Agent tun?</div>
      {PERMISSION_MODES.map(m => <button class={`menu-row ${selected === m ? 'on' : ''} ${m.id === 'full' ? 'is-full' : ''}`} role="menuitemradio" aria-checked={selected === m} onClick={() => { onModeChange({ permissionMode: m.id, ask: m.ask }); setOpen(false); }}>
        <Glyph name={m.icon} size={16} /><span><span class="menu-name">{m.label}</span><span class="menu-hint">{m.hint}</span></span>{selected === m && <Glyph name="check" size={14} />}
      </button>)}

    </div>}
  </div>;
}
