import { useState } from 'preact/hooks';
import { Glyph } from '../../components/CortexIcons.js';
import { vscode } from '../../vscodeApi.js';
import { useApp } from '../store.js';
import { Button, Card, Page, Row, Section, Select, Toggle } from '../ui.js';
import { IconEdit } from './allgemein.js';

/* ── Stimme ────────────────────────────────────────────────────────────────── */

export function StimmePage() {
  const [mic, setMic] = useApp('stimme.mikrofon', 'system');
  const [voice, setVoice] = useApp('stimme.stimme', 'vale');
  const [screen, setScreen] = useApp('stimme.bildschirmkontext', true);
  const [words, setWords] = useApp<string[]>('stimme.woerterbuch', []);
  const [draft, setDraft] = useState('');
  return <Page title="Stimme" preview>
    <Section title="Allgemein">
      <Card><Row title="Mikrofon" sub="Für Sprachchat und Diktat verwendet"><Select label="Mikrofon" value={mic} onChange={setMic} options={[{ value: 'system', label: 'Systemstandard' }]} /></Row></Card>
    </Section>
    <Section title="Sprachchat">
      <Card>
        <Row title="Stimme" sub="Wähle die Stimme aus, die Cortex für neue Sprachchats verwendet"><Select label="Stimme" value={voice} onChange={setVoice} icon={<i class="cxs-voice-dot" />} options={[{ value: 'vale', label: 'Vale' }, { value: 'ember', label: 'Ember' }, { value: 'cove', label: 'Cove' }]} /></Row>
        <Row title="Tastenkürzel für Sprachchat" sub="Sprachchat aus jeder Desktop-App starten"><span class="cxs-keyline"><span class="cxs-dim">Aus</span><IconEdit onClick={() => vscode.postMessage({ kind: 'openKeybindings', query: 'cortex' })} /></span></Row>
        <Row title="Bildschirmkontext" sub={<>Erlaube Cortex, die im Vordergrund laufende App zu prüfen, wenn du auf<br />Bildschirminhalte verweist. macOS fragt nach Zugriff, wenn Cortex ihn erstmals benötigt.</>}><Toggle label="Bildschirmkontext" on={screen} onChange={setScreen} /></Row>
      </Card>
    </Section>
    <Section title="Diktat">
      <Card>
        <Row title="Tastenkürzel für Diktieren durch Halten" sub="Irgendwo auf dem Desktop gedrückt halten, um an der Cursorposition zu diktieren"><span class="cxs-keyline"><span class="cxs-dim">Aus</span><IconEdit /></span></Row>
        <Row title="Hotkey für Diktat umschalten" sub="Zum Diktieren einmal irgendwo auf dem Desktop drücken, zum Beenden erneut drücken"><span class="cxs-keyline"><span class="cxs-dim">Aus</span><IconEdit /></span></Row>
      </Card>
      <Card class="cxs-gap">
        <Row title="Diktierwörterbuch" sub="Wörter oder Ausdrücke, die die Diktierfunktion erkennen soll"><Button icon="plus" onClick={() => { if (draft.trim()) { setWords([...words, draft.trim()]); setDraft(''); } }}>Eintrag hinzufügen</Button></Row>
        <div class="cxs-inline-list">
          {words.map((w, i) => <div class="cxs-inline-entry" key={`${w}${i}`}><input class="cxs-field wide" value={w} aria-label="Wörterbucheintrag" onBlur={e => setWords(words.map((x, j) => j === i ? e.currentTarget.value : x).filter(Boolean))} /><button type="button" class="cxs-icon-button" aria-label="Eintrag löschen" onClick={() => setWords(words.filter((_, j) => j !== i))}><Glyph name="trash" size={14} /></button></div>)}
          <div class="cxs-inline-entry"><input class="cxs-field wide" value={draft} placeholder="Jane Doe" aria-label="Neuer Wörterbucheintrag" onInput={e => setDraft(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) { setWords([...words, draft.trim()]); setDraft(''); } }} /><button type="button" class="cxs-icon-button" aria-label="Eingabe leeren" disabled={!draft} onClick={() => setDraft('')}><Glyph name="trash" size={14} /></button></div>
        </div>
      </Card>
      <Card class="cxs-gap">
        <Row title="Zuletzt verwendete Aufnahmen" sub="Deine letzten 20 Aufnahmen sind auf diesem Gerät gespeichert" />
        <div class="cxs-card-empty">Noch keine Aufnahmen</div>
      </Card>
    </Section>
  </Page>;
}
