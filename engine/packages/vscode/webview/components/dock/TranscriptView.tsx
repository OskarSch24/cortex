import { Glyph } from '../CortexIcons.js';
import { CopyButton } from '../CopyButton.js';
import { Markdown } from '../Markdown.js';
import type { TranscriptDoc } from './state.js';

/**
 * Der Verlauf eines Chats. Er kommt als fertiger Klartext vom Host und wird
 * hier wie eine Markdown-Datei gezeigt — lesbar, kopierbar und über das × des
 * Reiters wieder zu.
 */
function transcriptMarkdown(doc: TranscriptDoc): string {
  const body = doc.turns.map(turn => `## ${turn.role === 'user' ? 'Du' : 'Cortex'}\n\n${turn.text.trim()}`).join('\n\n');
  return `# ${doc.title}\n\n${body || '_Dieser Chat hat noch keinen Verlauf._'}\n`;
}

export function TranscriptView({ transcript }: { transcript?: TranscriptDoc }) {
  if (!transcript) return <p class="cx-dock-note">wird geladen …</p>;
  if (!transcript.turns.length) {
    return <div class="cx-dock-empty">
      <Glyph name="chat" size={26} />
      <strong>Noch kein Verlauf</strong>
      <span>Sobald ihr geschrieben habt, steht er hier.</span>
    </div>;
  }
  return <div class="cx-dock-file rendered cx-transkript">
    <CopyButton text={transcriptMarkdown(transcript)} label="Verlauf kopieren" className="cx-dock-copy" icon />
    {transcript.turns.map((turn, i) => <article class="cx-tr-beitrag" key={i}>
      <div class="cx-tr-rolle">{turn.role === 'user' ? 'Du' : 'Cortex'}</div>
      <Markdown text={turn.text} />
    </article>)}
  </div>;
}
