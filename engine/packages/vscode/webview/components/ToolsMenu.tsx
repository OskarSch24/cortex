import { useEffect, useRef, useState } from 'preact/hooks';
import { Glyph } from './CortexIcons.js';

export function ToolsMenu({ chatStarted, controlOpen, terminalOpen, onTerminal, onEditor, onControl }: {
  chatStarted: boolean; controlOpen: boolean; terminalOpen?: boolean;
  onTerminal: () => void; onEditor: () => void; onControl: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const choose = (action: () => void) => { setOpen(false); trigger.current?.focus(); action(); };
  return <div class="cx-tools-menu" ref={root}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
      if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const buttons = Array.from(root.current!.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]'));
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }}>
    <button ref={trigger} class="cx-icon" title="Weitere Werkzeuge" aria-label="Weitere Werkzeuge" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><Glyph name="more" /></button>
    {open && <div class="cx-tools-popup" role="menu" aria-label="Weitere Werkzeuge">
      <button role="menuitem" title={terminalOpen ? 'Terminal neben dem Chat schließen' : 'Terminal neben dem Chat öffnen'} onClick={() => choose(onTerminal)}><Glyph name={terminalOpen ? 'close' : 'terminal'} /><span>{terminalOpen ? 'Terminal schließen' : 'Terminal'}</span></button>
      <button role="menuitem" title="Code-Editor öffnen" onClick={() => choose(onEditor)}><Glyph name="code" /><span>Code-Editor</span></button>
      {chatStarted && <button role="menuitemcheckbox" aria-checked={controlOpen} onClick={() => choose(onControl)}><Glyph name="settings" /><span>Control Panel</span>{controlOpen && <Glyph name="check" size={14} />}</button>}
    </div>}
  </div>;
}
