import { useState } from 'preact/hooks';
import { IconChevron } from '../icons.js';

export function PastedBlock({ text, onChange, onRemove }: { text: string; onChange: (text: string) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(true);
  const lines = text.split('\n');
  const preview = lines.filter((l) => l.trim()).slice(0, 2);
  return (
    <div class={`cx-paste ${open ? 'open' : ''}`}>
      <div class="cx-paste-head">
        <button type="button" class="cx-paste-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)} title={open ? 'Einklappen' : 'Aufklappen und bearbeiten'}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M16 13H8" /><path d="M16 17H8" /></svg>
          <span class="cx-paste-title">Eingefügter Text<small>{lines.length.toLocaleString('de-DE')} Zeilen · {text.length.toLocaleString('de-DE')} Zeichen</small></span>
          <IconChevron size={11} />
        </button>
        <button type="button" class="cx-paste-x" aria-label="Eingefügten Text entfernen" title="Entfernen" onClick={onRemove}>×</button>
      </div>
      {open
        ? <textarea class="cx-paste-edit" value={text} onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)} />
        : <div class="cx-paste-preview">{preview.map((l, i) => <div key={i}>{l}</div>)}</div>}
    </div>
  );
}
