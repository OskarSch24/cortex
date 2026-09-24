import { useEffect, useState } from 'preact/hooks';
import { Glyph } from '../../components/CortexIcons.js';
import { vscode } from '../../vscodeApi.js';
import { PROMPT_EINBETTUNG, PROMPT_NOTIZEN, PROMPT_SPEICHERN, PROMPT_SUCHE } from '../../../src/memory/vorgaben.js';
import { STANDARD_BEREICHE, type Suchbereich } from '../../../src/memory/bereiche.js';
import { useApp, useNative } from '../store.js';
import { Button, Card, Link, Page, Row, Section, Select, TextField, Toggle } from '../ui.js';

/* ── Personalisierung ──────────────────────────────────────────────────────── */

export function PersonalisierungPage() {
  const [saved, setSaved] = useApp('personalisierung.anweisungen', '');
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const [home, setHome] = useNative('cortex.homeLocation', '');
  return <Page title="Personalisierung">
    <Section title="Cortex-Anweisungen" big subtitle={<>Gib Cortex zusätzliche Anweisungen und Kontext für alle Chats.<br />Repository-Anweisungen können ebenfalls gelten. <Link onClick={() => vscode.postMessage({ kind: 'openExternal', url: 'https://agents.md' })}>Mehr erfahren</Link></>} actions={<Button kind="ghost" disabled={draft === saved} onClick={() => setSaved(draft)}>Speichern</Button>}>
      <textarea class="cxs-textarea big" aria-label="Cortex-Anweisungen" value={draft} placeholder="Zum Beispiel: Antworte auf Deutsch. Frag nach, bevor du Abhängigkeiten hinzufügst." onInput={e => setDraft(e.currentTarget.value)} />
    </Section>
    <Section title="Standort">
      <Card>
        <Row title="Heimatort" sub="Für Wetter, Abfahrten und Wege. Ohne Angabe fragt der Agent nach, statt den Ort über die IP-Adresse zu raten"><TextField label="Heimatort" value={home} placeholder="z. B. Frankfurt" width={224} onCommit={v => setHome(String(v).trim())} /></Row>
      </Card>
    </Section>
    <ErinnerungSections />
  </Page>;
}

/* ── Cortex-Erinnerung ─────────────────────────────────────────────────────── */

const PROMPTS: Array<{ key: string; title: string; sub: string; vorgabe: string }> = [
  { key: 'erinnerung.prompt.notizen', title: 'Prompt: Notizzettel', sub: 'Was nach jeder Antwort auf dem Notizzettel des Chats festgehalten wird', vorgabe: PROMPT_NOTIZEN },
  { key: 'erinnerung.prompt.suche', title: 'Prompt: Selbst suchen', sub: 'Wann und wie ein Modell während der Antwort selbst im Exokortex nachschlägt', vorgabe: PROMPT_SUCHE },
  { key: 'erinnerung.prompt.einbettung', title: 'Prompt: Einbettung', sub: 'Wie das Modell mitgeschickte Erinnerungen behandeln soll', vorgabe: PROMPT_EINBETTUNG },
  { key: 'erinnerung.prompt.speichern', title: 'Prompt: Merken', sub: 'Wie aus „Merk dir …“ ein Eintrag auf der Merkliste wird', vorgabe: PROMPT_SPEICHERN },
];

function PromptSection({ promptKey, title, sub, vorgabe }: { promptKey: string; title: string; sub: string; vorgabe: string }) {
  const [saved, setSaved] = useApp(promptKey, '');
  const wirksam = saved.trim() ? saved : vorgabe;
  const [draft, setDraft] = useState(wirksam);
  useEffect(() => setDraft(wirksam), [wirksam]);
  return <Section title={title} subtitle={sub} actions={<>
    <Button kind="ghost" disabled={draft === vorgabe && !saved.trim()} onClick={() => { setSaved(''); setDraft(vorgabe); }}>Zurücksetzen</Button>
    <Button kind="ghost" disabled={draft === wirksam} onClick={() => setSaved(draft.trim() === vorgabe.trim() ? '' : draft)}>Speichern</Button>
  </>}>
    <textarea class="cxs-textarea big" aria-label={title} value={draft} onInput={e => setDraft(e.currentTarget.value)} />
  </Section>;
}

const liste = (text: string) => text.split(',').map(w => w.trim()).filter(Boolean);

function BereicheSection() {
  const [gespeichert, setGespeichert] = useApp<Suchbereich[] | null>('erinnerung.bereiche', null);
  const bereiche = gespeichert && gespeichert.length ? gespeichert : STANDARD_BEREICHE;
  const setze = (next: Suchbereich[]) => setGespeichert(next);
  const aendere = (i: number, teil: Partial<Suchbereich>) => setze(bereiche.map((b, j) => (j === i ? { ...b, ...teil } : b)));
  return <Section title="Suchbereiche" subtitle={<>Welche Anfrage in welchem Teil des Exokortex sucht. Ein Stichwort in der Nachricht oder ein passender Arbeitsordner schaltet den Bereich zu; frühere Chats sind immer dabei.</>} actions={<>
    <Button kind="ghost" disabled={!gespeichert} onClick={() => setGespeichert(null)}>Zurücksetzen</Button>
    <Button kind="ghost" icon="plus" onClick={() => setze([...bereiche, { id: `eigen-${Date.now().toString(36)}`, name: 'Neuer Bereich', projekte: [], stichwoerter: [] }])}>Bereich hinzufügen</Button>
  </>}>
    <Card>
      {bereiche.map((b, i) => <div class="cxs-inline-list" key={b.id}>
        <div class="cxs-inline-entry">
          <input class="cxs-field" style={{ width: 200 }} aria-label="Name des Bereichs" value={b.name} onBlur={e => { const v = e.currentTarget.value.trim(); if (v && v !== b.name) aendere(i, { name: v }); }} />
          <input class="cxs-field wide mono" aria-label="Exokortex-Projekte" value={b.projekte.join(', ')} placeholder="proj_…" onBlur={e => { const v = liste(e.currentTarget.value); if (v.join(',') !== b.projekte.join(',')) aendere(i, { projekte: v }); }} />
          <Toggle label="Immer durchsuchen" on={!!b.immer} onChange={v => aendere(i, { immer: v })} />
          <button type="button" class="cxs-icon-button" aria-label="Bereich löschen" onClick={() => setze(bereiche.filter((_, j) => j !== i))}><Glyph name="trash" size={14} /></button>
        </div>
        {!b.immer && <div class="cxs-inline-entry">
          <input class="cxs-field wide" aria-label="Stichwörter" value={b.stichwoerter.join(', ')} placeholder="Stichwörter, durch Komma getrennt" onBlur={e => { const v = liste(e.currentTarget.value); if (v.join(',') !== b.stichwoerter.join(',')) aendere(i, { stichwoerter: v }); }} />
          <input class="cxs-field" style={{ width: 220 }} aria-label="Arbeitsordner" value={(b.ordner ?? []).join(', ')} placeholder="Ordnernamen" onBlur={e => { const v = liste(e.currentTarget.value); if (v.join(',') !== (b.ordner ?? []).join(',')) aendere(i, { ordner: v }); }} />
        </div>}
      </div>)}
    </Card>
    <p class="cxs-footnote">Links der Name, daneben die Projekte im Exokortex, rechts „immer durchsuchen“. Darunter Stichwörter und Arbeitsordner, die den Bereich zuschalten.</p>
  </Section>;
}

function ErinnerungSections() {
  const [notes, setNotes] = useNative('cortex.memory.notes', true);
  const [abruf, setAbruf] = useNative('cortex.memory.retrieval', 'themenwechsel');
  const [treffer, setTreffer] = useNative('cortex.memory.hits', 5);
  const [budget, setBudget] = useNative('cortex.memory.budget', 1500);
  const [schwelle, setSchwelle] = useNative('cortex.memory.threshold', 'normal');
  const [helfer, setHelfer] = useNative('cortex.memory.helper', 'guenstig');
  const zahl = (v: string, min: number, max: number, set: (n: number) => void) => {
    const n = Math.round(Number(v));
    if (Number.isFinite(n)) set(Math.min(max, Math.max(min, n)));
  };
  return <>
    <Section title="Cortex-Erinnerung" big subtitle={<>Lege fest, woran sich Cortex über Modellwechsel und Chats hinweg erinnert. <Link onClick={() => vscode.postMessage({ kind: 'openExternal', url: 'https://github.com/oskarschiermeister/exokortex' })}>Mehr erfahren</Link></>}>
      <Card>
        <Row title="Notizzettel pro Chat" sub={<>Hält Entscheidungen, Festlegungen und offene Punkte fest<br />und gibt sie jedem Modell mit, das im Chat antwortet</>}><Toggle label="Notizzettel" on={notes} onChange={setNotes} /></Row>
        <Row title="Modell für Notizen" sub="Der Zettel entsteht nach jeder Antwort im Hintergrund"><Select label="Modell für Notizen" value={helfer} onChange={setHelfer} options={[{ value: 'guenstig', label: 'Günstig', hint: 'Haiku auf einem freien Claude-Konto' }, { value: 'aktuell', label: 'Aktuelles Modell', hint: 'Das Modell, das gerade geantwortet hat' }]} /></Row>
        <Row title="Aus dem Exokortex erinnern" sub="Wann Cortex passende Fundstellen sucht und mitschickt"><Select label="Exokortex-Abruf" value={abruf} onChange={setAbruf} options={[{ value: 'themenwechsel', label: 'Bei Themenwechsel', hint: 'Erste Nachricht und jedes neue Thema' }, { value: 'erste', label: 'Erste Nachricht' }, { value: 'jede', label: 'Jede Nachricht' }, { value: 'nie', label: 'Nie' }]} /></Row>
        <Row title="Mindestrelevanz" sub="Wie gut eine Fundstelle passen muss, damit sie mitgeht"><Select label="Mindestrelevanz" value={schwelle} onChange={setSchwelle} options={[{ value: 'locker', label: 'Locker' }, { value: 'normal', label: 'Normal' }, { value: 'streng', label: 'Streng' }]} /></Row>
        <Row title="Treffer" sub="Höchstens so viele Fundstellen je Nachricht"><TextField label="Treffer" type="number" min={1} max={10} width={72} value={treffer} onCommit={v => zahl(v, 1, 10, setTreffer)} /></Row>
        <Row title="Token-Budget" sub="Wie viel Platz die Erinnerungen in einer Nachricht höchstens belegen"><TextField label="Token-Budget" type="number" min={300} max={4000} width={88} suffix="Tokens" value={budget} onCommit={v => zahl(v, 300, 4000, setBudget)} /></Row>
      </Card>
    </Section>
    <BereicheSection />
    {PROMPTS.map(p => <PromptSection key={p.key} promptKey={p.key} title={p.title} sub={p.sub} vorgabe={p.vorgabe} />)}
  </>;
}
