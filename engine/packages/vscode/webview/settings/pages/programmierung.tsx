import { useState } from 'preact/hooks';
import type { ProjectDto } from '../../../src/panel/protocol.js';
import { Glyph } from '../../components/CortexIcons.js';
import { vscode } from '../../vscodeApi.js';
import type { SettingsContext } from '../SettingsApp.js';
import { useApp } from '../store.js';
import { Button, Card, Empty, Link, Page, Row, Section, Segmented, Tabs, TextArea, TextField, Toggle } from '../ui.js';

/* ── Hooks ─────────────────────────────────────────────────────────────────── */

export function HooksPage() {
  return <Page title="Hooks" preview subtitle="Diese Übersicht ist noch nicht mit den Hooks deiner Anbieter-Clients verbunden." actions={<button type="button" class="cxs-icon-button" aria-label="Neu laden" title="Die Hook-Übersicht ist noch nicht verfügbar." disabled><Glyph name="refresh" size={16} /></button>}>
    <Card class="cxs-first"><Row title="Hooks noch nicht verfügbar" sub="Cortex liest die Hook-Konfiguration deiner Anbieter-Clients hier noch nicht aus." /></Card>
    <p class="cxs-footnote">Cortex führt selbst noch keine Hooks aus. Hooks, die ein Anbieter-Client in seiner eigenen Konfiguration hat (etwa ~/.claude/settings.json), laufen dort unverändert weiter.</p>
  </Page>;
}

/* ── Verbindungen ──────────────────────────────────────────────────────────── */

export function VerbindungenPage() {
  const [tab, setTab] = useState<'mac' | 'andere' | 'ssh'>('mac');
  const [hosts, setHosts] = useApp<string[]>('verbindungen.ssh', []);
  const [draft, setDraft] = useState<string>();
  const views = {
    mac: { title: 'Geräte, die diesen Mac steuern können', icons: ['phone', 'laptop'], text: 'Gerät hinzufügen, um diesen Mac fernzusteuern', action: 'Hinzufügen', primary: true },
    andere: { title: 'Geräte, die sich von diesem Mac aus steuern lassen', icons: ['laptop', 'window'], text: 'Von diesem Computer aus auf andere Geräte zugreifen und sie steuern', action: 'Einrichten', primary: false },
    ssh: { title: 'SSH-Verbindungen von diesem Mac', icons: ['laptop', 'server'], text: 'Verbindung mit einem Remote-Gerät über eine SSH-Verbindung herstellen', action: 'Hinzufügen', primary: true },
  } as const;
  const v = views[tab];
  return <Page title="Verbindungen" preview>
    <div class="cxs-first"><Tabs value={tab} onChange={setTab} tabs={[{ id: 'mac', label: 'Diesen Mac steuern' }, { id: 'andere', label: 'Andere Geräte steuern' }, { id: 'ssh', label: 'SSH' }]} /></div>
    <Section title={v.title}>
      {tab === 'ssh' && hosts.length > 0 && <Card class="cxs-gap-below">{hosts.map(h => <Row key={h} icon={<span class="cxs-plain-icon"><Glyph name="server" size={18} /></span>} title={h} sub="SSH-Ziel"><button type="button" class="cxs-icon-button" aria-label={`${h} entfernen`} onClick={() => setHosts(hosts.filter(x => x !== h))}><Glyph name="trash" size={14} /></button></Row>)}</Card>}
      {draft !== undefined ? <Card><Row title="Neues SSH-Ziel" sub="Benutzer@Host, wie in ~/.ssh/config"><TextField label="SSH-Ziel" value={draft} placeholder="ich@server.local" width={220} onCommit={setDraft} /><Button kind="primary" onClick={() => { if (draft.trim()) setHosts([...hosts, draft.trim()]); setDraft(undefined); }}>Speichern</Button></Row></Card>
        : <Card class="cxs-center-card">
          <div class="cxs-device-icons"><Glyph name={v.icons[0]} size={22} /><span>···</span><Glyph name={v.icons[1]} size={22} /></div>
          <p>{v.text}</p>
          <Button kind={v.primary ? 'primary' : 'default'} disabled={tab !== 'ssh'} title={tab !== 'ssh' ? 'Fernsteuerung folgt noch.' : undefined} onClick={() => setDraft('')}>{v.action}</Button>
        </Card>}
    </Section>
  </Page>;
}

/* ── Git ───────────────────────────────────────────────────────────────────── */

export function GitPage() {
  const [prefix, setPrefix] = useApp('git.branchPraefix', 'cortex/');
  const [merge, setMerge] = useApp('git.mergeMethode', 'merge');
  const [force, setForce] = useApp('git.forcePush', false);
  const [draft, setDraft] = useApp('git.entwuerfe', true);
  const [review, setReview] = useApp('git.review', 'inline');
  const [auto, setAuto] = useApp('git.autoMerge', false);
  const [watch, setWatch] = useApp('git.pruefAnweisungen', '');
  const [commit, setCommit] = useApp('git.commitAnweisungen', '');
  const [pr, setPr] = useApp('git.prAnweisungen', '');
  return <Page title="Git" preview>
    <Card class="cxs-first">
      <Row title="Branch-Präfix" sub="Präfix, das Cortex beim Erstellen neuer Branches verwendet"><TextField label="Branch-Präfix" value={prefix} width={224} onCommit={setPrefix} /></Row>
      <Row title="Merge-Methode für Pull Requests" sub="Wähle aus, wie Cortex Pull Requests zusammenführt"><Segmented label="Merge-Methode" value={merge} onChange={setMerge} options={[{ value: 'merge', label: 'Merge-Commit' }, { value: 'squash', label: 'Squash' }]} /></Row>
      <Row title="Immer Force-Push verwenden" sub="Beim Pushen aus Cortex --force-with-lease verwenden"><Toggle label="Force-Push" on={force} onChange={setForce} /></Row>
      <Row title="Entwurfs-Pull-Requests erstellen" sub="Beim Erstellen von PRs aus Cortex werden standardmäßig Entwurfs-Pull-Requests verwendet."><Toggle label="Entwürfe" on={draft} onChange={setDraft} /></Row>
      <Row title="Review-Zustellung" sub="/review nach Möglichkeit im aktuellen Chat starten oder einen separaten Review-Chat öffnen"><Segmented label="Review-Zustellung" value={review} onChange={setReview} options={[{ value: 'inline', label: 'Inline' }, { value: 'separat', label: 'Separat' }]} /></Row>
    </Card>
    <Section title="Pull Requests überwachen und beheben">
      <Card><Row title="Automatisch zusammenführen, sobald bereit" sub="Weiter beobachten, bis der Pull Request zusammengeführt wurde"><Toggle label="Automatisch zusammenführen" on={auto} onChange={setAuto} /></Row></Card>
      <div class="cxs-gap"><TextArea label="Anweisungen zur Überwachung" rows={5} value={watch} onCommit={setWatch} placeholder="Zum Beispiel: /merge kommentieren, nachdem die Checks bestanden wurden, und nicht damit zusammenhängende Chromatic-Änderungen genehmigen…" /></div>
    </Section>
    <Section big title="Commit-Anweisungen" subtitle="Zu den Prompts für die Commit-Nachricht hinzugefügt">
      <TextArea label="Commit-Anweisungen" rows={6} value={commit} onCommit={setCommit} placeholder="Hinweise für Commit-Nachrichten hinzufügen…" />
    </Section>
    <Section big title="Pull-Request-Anweisungen" subtitle="Zu Prompts für die Generierung von PR-Titel bzw. -Beschreibung hinzugefügt">
      <TextArea label="Pull-Request-Anweisungen" rows={6} value={pr} onCommit={setPr} placeholder="Hinweise für Pull Requests hinzufügen…" />
    </Section>
  </Page>;
}

/* ── Umgebungen ────────────────────────────────────────────────────────────── */

interface Environment { name: string; setup: Record<string, string>; cleanup: Record<string, string>; actions: Array<{ name: string; command: string }> }
const OS = [{ id: 'standard', label: 'Standardvorgabe' }, { id: 'macos', label: 'macOS' }, { id: 'linux', label: 'Linux' }, { id: 'windows', label: 'Windows' }] as const;

export function umgebungenCrumb(sub: string[], projects: ProjectDto[]): string[] {
  return sub.map(s => s === 'bearbeiten' ? 'Bearbeiten' : projects.find(p => p.path === s)?.name ?? s.split('/').pop() ?? s);
}

export function UmgebungenPage({ ctx }: { ctx: SettingsContext }) {
  const [path, mode] = ctx.sub;
  const project = ctx.projects.find(p => p.path === path);
  if (path && mode === 'bearbeiten') return <EditEnvironment path={path} name={project?.name ?? path.split('/').pop() ?? ''} onDone={() => ctx.go({ id: 'umgebungen', sub: [path] })} />;
  if (path) return <ProjectEnvironment path={path} onCreate={() => ctx.go({ id: 'umgebungen', sub: [path, 'bearbeiten'] })} />;
  return <Page title="Umgebungen" subtitle={<>Lokale Umgebungen geben Cortex vor, wie Worktrees für ein Projekt eingerichtet werden. <Link onClick={() => vscode.postMessage({ kind: 'openExternal', url: 'https://github.com/oskarschiermeister/cortex' })}>Mehr erfahren.</Link></>}>
    <Section title="Projekt auswählen" actions={<Button kind="ghost" onClick={() => vscode.postMessage({ kind: 'addProject' })}>Projekt hinzufügen</Button>}>
      <div class="cxs-project-list">
        {ctx.projects.map(p => <div class="cxs-project-card" key={p.path} role="button" tabIndex={0} onClick={() => ctx.go({ id: 'umgebungen', sub: [p.path] })} onKeyDown={e => { if (e.key === 'Enter') ctx.go({ id: 'umgebungen', sub: [p.path] }); }}>
          <Glyph name="doc" size={16} />
          <span>{p.name}</span>
          <button type="button" class="cxs-plus" aria-label={`Umgebung für ${p.name} erstellen`} onClick={e => { e.stopPropagation(); ctx.go({ id: 'umgebungen', sub: [p.path, 'bearbeiten'] }); }}><Glyph name="plus" size={15} /></button>
        </div>)}
        {!ctx.projects.length && <Empty>Noch keine Projekte. Lege einen Projektordner an, um eine Umgebung zu konfigurieren.</Empty>}
      </div>
    </Section>
  </Page>;
}

function ProjectEnvironment({ path, onCreate }: { path: string; onCreate: () => void }) {
  const [env] = useApp<Environment | null>(`umgebung:${path}`, null);
  return <Page title="Umgebungen" preview actions={<Button kind="primary" onClick={onCreate}>{env ? 'Lokale Umgebung bearbeiten' : 'Lokale Umgebung erstellen'}</Button>}>
    <Card class="cxs-first">
      {env ? <Row icon={<span class="cxs-plain-icon"><Glyph name="box" size={18} /></span>} title={env.name} sub={`${Object.values(env.setup).filter(Boolean).length ? 'Einrichtungsskript' : 'Kein Einrichtungsskript'} · ${env.actions.length === 1 ? '1 Aktion' : `${env.actions.length} Aktionen`}`} onClick={onCreate}><Glyph name="chevron" size={14} /></Row>
        : <div class="cxs-card-empty">Für dieses Projekt ist noch keine lokale Umgebung konfiguriert</div>}
    </Card>
  </Page>;
}

function EditEnvironment({ path, name, onDone }: { path: string; name: string; onDone: () => void }) {
  const [saved, save] = useApp<Environment | null>(`umgebung:${path}`, null);
  const [env, setEnv] = useState<Environment>(saved ?? { name, setup: {}, cleanup: {}, actions: [] });
  const [setupOs, setSetupOs] = useState<string>('standard');
  const [cleanOs, setCleanOs] = useState<string>('standard');
  const [vars, setVars] = useState(false);
  return <Page title="Lokale Umgebung bearbeiten">
    <div class="cxs-form-field cxs-first"><label>Name</label><input class="cxs-field name" value={env.name} onInput={e => setEnv({ ...env, name: e.currentTarget.value })} /></div>
    <Section big title="Einrichtungsskript" subtitle="Wird beim Erstellen eines Worktrees im Projektstamm ausgeführt" actions={<Button kind="ghost" onClick={() => setVars(v => !v)}>Variablen</Button>}>
      {vars && <p class="cxs-footnote tight"><code>$CORTEX_WORKTREE_PATH</code> Pfad des neuen Worktrees · <code>$CORTEX_PROJECT_PATH</code> Projektstamm</p>}
      <div class="cxs-os-tabs"><Segmented label="Betriebssystem" value={setupOs} onChange={setSetupOs} options={OS.map(o => ({ value: o.id, label: o.label }))} /></div>
      <textarea class="cxs-textarea mono code" aria-label="Einrichtungsskript" value={env.setup[setupOs] ?? ''} placeholder={'cd "$CORTEX_WORKTREE_PATH"\npip install -r requirements.txt\nnpm install\n./run/setup.sh'} onInput={e => setEnv({ ...env, setup: { ...env.setup, [setupOs]: e.currentTarget.value } })} />
    </Section>
    <Section big title="Bereinigungsskript" subtitle="Wird im Projektstamm vor der Worktree-Bereinigung ausgeführt">
      <div class="cxs-os-tabs"><Segmented label="Betriebssystem" value={cleanOs} onChange={setCleanOs} options={OS.map(o => ({ value: o.id, label: o.label }))} /></div>
      <textarea class="cxs-textarea mono code" aria-label="Bereinigungsskript" value={env.cleanup[cleanOs] ?? ''} placeholder={'docker compose down --remove-orphans\nrm -rf .cache/tmp'} onInput={e => setEnv({ ...env, cleanup: { ...env.cleanup, [cleanOs]: e.currentTarget.value } })} />
    </Section>
    <Section title="Aktionen" actions={<Button kind="ghost" onClick={() => setEnv({ ...env, actions: [...env.actions, { name: '', command: '' }] })}>Aktion hinzufügen</Button>}>
      <p class="cxs-section-note">Diese Aktionen können jeden Befehl ausführen und werden in der Kopfzeile angezeigt.</p>
      {env.actions.length ? <Card>{env.actions.map((a, i) => <div class="cxs-row cxs-action-row" key={i}>
        <input class="cxs-field" placeholder="Name" value={a.name} aria-label="Name der Aktion" onInput={e => setEnv({ ...env, actions: env.actions.map((x, j) => j === i ? { ...x, name: e.currentTarget.value } : x) })} />
        <input class="cxs-field mono grow" placeholder="npm run dev" value={a.command} aria-label="Befehl" onInput={e => setEnv({ ...env, actions: env.actions.map((x, j) => j === i ? { ...x, command: e.currentTarget.value } : x) })} />
        <button type="button" class="cxs-icon-button" aria-label="Aktion entfernen" onClick={() => setEnv({ ...env, actions: env.actions.filter((_, j) => j !== i) })}><Glyph name="trash" size={14} /></button>
      </div>)}</Card> : <Card><div class="cxs-card-empty">Aktion hinzufügen, um Befehle über die lokale Symbolleiste auszuführen</div></Card>}
    </Section>
    <div class="cxs-form-actions"><Button kind="primary" onClick={() => { save(env); onDone(); }}>Speichern</Button></div>
  </Page>;
}

/* ── Worktrees ─────────────────────────────────────────────────────────────── */

export function WorktreesPage() {
  const [root, setRoot] = useApp('worktrees.stamm', '');
  const [fetch, setFetch] = useApp('worktrees.upstream', false);
  const [clean, setClean] = useApp('worktrees.aufraeumen', true);
  const [limit, setLimit] = useApp('worktrees.limit', 15);
  return <Page title="Worktrees" preview>
    <Card class="cxs-first">
      <Row title="Worktree-Stammverzeichnis" sub={<>Verzeichnis, in dem Cortex verwaltete Worktrees erstellt.<br />Leer lassen, um den Standardspeicherort zu verwenden.</>}><TextField label="Worktree-Stammverzeichnis" value={root} placeholder="~/.cortex/worktrees" width={288} onCommit={setRoot} /></Row>
      <Row title="Immer Upstream abrufen, bevor Worktrees erstellt werden" sub={<>Cortex übernimmt Branch-Updates normalerweise bei regulären Git-<br />Aktivitäten. Dadurch wird auch vor jedem neuen Worktree ein Fetch ausgeführt.</>}><Toggle label="Upstream abrufen" on={fetch} onChange={setFetch} /></Row>
      <Row title="Alte Worktrees automatisch löschen" sub={<>Für die meisten Benutzer empfohlen. Deaktiviere die Option nur, wenn du<br />alte Worktrees und die Speicherplatznutzung selbst verwalten möchtest.</>}><Toggle label="Automatisch löschen" on={clean} onChange={setClean} /></Row>
      <Row title="Limit für automatische Löschung" sub={<>Anzahl der verwalteten Worktrees, die beibehalten werden, bevor ältere<br />automatisch bereinigt werden. Cortex erstellt vor dem Löschen Snapshots der<br />Worktrees, sodass bereinigte Worktrees immer wiederhergestellt werden können.</>}><TextField label="Limit" type="number" min={1} max={200} value={limit} width={96} onCommit={v => { const n = Math.round(Number(v)); if (n >= 1 && n <= 200) setLimit(n); }} /></Row>
    </Card>
    <Section title="Worktree-Übersicht noch nicht verfügbar" actions={<button type="button" class="cxs-icon-button" aria-label="Neu laden" title="Die Worktree-Übersicht ist noch nicht angebunden." disabled><Glyph name="refresh" size={15} /></button>}>
      <Card><div class="cxs-card-empty">Von Cortex erstellte Worktrees werden hier angezeigt.</div></Card>
    </Section>
  </Page>;
}
