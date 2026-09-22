import { useEffect, useRef, useState } from 'preact/hooks';
import { SCOPED_MCP_PROVIDERS } from '../../../core/src/mcp/runPolicy.js';
import { EFFORT_LABELS, modelOption } from '../../../core/src/models/catalog.js';
import type { Effort } from '../../../core/src/types.js';
import type { AccountStatusDto, ConversationMeta, HostToWebview, ProjectDto } from '../../src/panel/protocol.js';
import { AGENT_STARTERS, type AgentStarter } from '../../src/teams/starters.js';
import { MAX_TEAM_AGENTS, teamOrder, teamProfileSignature, validateTeam, type AgentTeam, type TeamAgent, type TeamJobStatus, type TeamsState } from '../../src/teams/types.js';
import { vscode } from '../vscodeApi.js';
import { Button, Select } from '../settings/ui.js';
import { Glyph } from './CortexIcons.js';
import { BrandMark } from './brandIcons.js';
import { Markdown } from './Markdown.js';
import { AgentAutomationEditor, automationFormError } from './AgentAutomationEditor.js';

type Props = {
  accounts: AccountStatusDto[];
  projects: ProjectDto[];
  conversations: ConversationMeta[];
  onOpenConversation: (id: string) => void;
  onAccounts: () => void;
  initialProfileId?: string;
};
const EMPTY: TeamsState = { teams: [], runs: [], servers: [], skills: [], revision: 0 };
const STATUS: Record<TeamJobStatus, string> = { waiting: 'Wartet', running: 'Arbeitet', completed: 'Abgeschlossen', failed: 'Fehlgeschlagen', cancelled: 'Gestoppt', blocked: 'Blockiert' };
const PROVIDERS: Record<string, string> = { claude: 'Claude', codex: 'ChatGPT', grok: 'Grok', copilot: 'GitHub Copilot' };
const identifier = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const accountKey = (provider: string, label: string) => `${provider}\n${label}`;
type ProfileChoice = AgentTeam | 'new-agent' | 'new-team';
const profileLabel = (team?: AgentTeam) => team?.kind === 'agent' ? 'Agent' : 'Team';
// Navigating to a chat/account must not silently throw away a team draft.
let retainedDraft: { team: AgentTeam; dirty: boolean; baseSignature?: string } | undefined;
const retainedTasks: Record<string, string> = {};

function newAgent(accounts: AccountStatusDto[], index: number): TeamAgent {
  const account = accounts.find(account => account.available && !account.reviewOnly) ?? accounts.find(account => !account.reviewOnly);
  return { id: identifier('agent'), name: `Agent ${index}`, role: '', instructions: '',
    target: { provider: account?.provider ?? 'grok', account: account?.label ?? '' },
    permissionMode: 'safe', skillPaths: [], dependsOn: [] };
}

function dependencyWouldCycle(team: AgentTeam, consumer: string, source: string): boolean {
  const visited = new Set<string>();
  const visit = (id: string): boolean => id === consumer || (!visited.has(id) && (visited.add(id), team.agents.find(agent => agent.id === id)?.dependsOn.some(visit) === true));
  return visit(source);
}

export function AgentTeamsView({ accounts, projects, conversations, onOpenConversation, onAccounts, initialProfileId }: Props) {
  const [state, setState] = useState<TeamsState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<AgentTeam | undefined>(() => retainedDraft ? copy(retainedDraft.team) : undefined);
  const [dirty, setDirty] = useState(retainedDraft?.dirty ?? false);
  const [draftBaseSignature, setDraftBaseSignature] = useState<string | undefined>(retainedDraft?.baseSignature);
  const [agentId, setAgentId] = useState(retainedDraft?.team.agents[0]?.id ?? '');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const [pendingSwitch, setPendingSwitch] = useState<ProfileChoice>();
  const [starterPicker, setStarterPicker] = useState(false);
  const [stopPending, setStopPending] = useState<string[]>([]);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, string>>(() => ({ ...retainedTasks }));
  const latest = useRef({ draft, dirty, state });
  latest.current = { draft, dirty, state };
  const pendingSave = useRef<{ id: string; signature: string; saved: AgentTeam; label: string }>();
  const pendingStart = useRef<{ teamId: string; task: string; previousRuns: string[]; label: string }>();
  const imports = useRef(new Map<string, { teamId: string; agentId: string }>());
  const openedProfile = useRef<string>();
  const usableAccounts = accounts.filter(account => !account.reviewOnly && ['claude', 'codex', 'grok', 'copilot'].includes(account.provider));
  const solo = draft?.kind === 'agent';
  const label = profileLabel(draft);
  const savedAgents = state.teams.filter(team => team.kind === 'agent');
  const savedTeams = state.teams.filter(team => team.kind !== 'agent');
  const selectedAgent = draft?.agents.find(agent => agent.id === agentId) ?? draft?.agents[0];

  useEffect(() => {
    retainedDraft = draft ? { team: copy(draft), dirty, baseSignature: draftBaseSignature } : undefined;
  }, [draft, dirty, draftBaseSignature]);
  useEffect(() => {
    const receive = (event: MessageEvent<HostToWebview>) => {
      const message = event.data;
      if (message.kind === 'teamsState') {
        if (message.state.revision < latest.current.state.revision) return;
        setState(message.state); setLoaded(true);
        if (message.state.error) setError(message.state.error);
        const current = latest.current.draft;
        const saved = message.state.teams.find(team => team.id === current?.id);
        if (current && saved && !latest.current.dirty && !pendingSave.current) {
          setDraft(copy(saved)); setDraftBaseSignature(teamProfileSignature(saved));
        }
        setStopPending(ids => ids.filter(id => message.state.runs.some(run => run.id === id && run.status === 'running')));
        const request = pendingStart.current;
        if (request && message.state.runs.some(run => run.teamId === request.teamId && run.task === request.task && !request.previousRuns.includes(run.id))) {
          pendingStart.current = undefined; setStarting(false); setNotice(`${request.label} gestartet.`);
          retainedTasks[request.teamId] = '';
          setTaskDrafts(values => ({ ...values, [request.teamId]: '' }));
        }
      } else if (message.kind === 'teamSaved') {
        const pending = pendingSave.current;
        if (pending?.id === message.id) {
          pendingSave.current = undefined; setSaving(false); setNotice(`${pending.label} gespeichert.`);
          if (latest.current.draft?.id === pending.id) {
            setDraftBaseSignature(teamProfileSignature(pending.saved));
            if (teamProfileSignature(latest.current.draft) === pending.signature) {
              setDraft(copy(pending.saved)); setDirty(false);
            }
          }
        }
      } else if (message.kind === 'teamError') {
        setError(message.message); setSaving(false); setStarting(false); setDeleting(undefined); setStopPending([]);
        pendingSave.current = undefined; pendingStart.current = undefined;
      } else if (message.kind === 'teamAutomationNotice') {
        setNotice(message.message);
      } else if (message.kind === 'agentMarkdown') {
        const request = imports.current.get(message.requestId);
        imports.current.delete(message.requestId);
        if (request && latest.current.draft?.id === request.teamId) {
          setDraft(team => team && ({ ...team, agents: team.agents.map(agent => agent.id === request.agentId ? { ...agent, instructions: message.text } : agent) }));
          setDirty(true); setNotice('Markdown importiert. Speichere die Änderungen, um die Anweisungen zu übernehmen.');
        }
      }
    };
    window.addEventListener('message', receive);
    vscode.postMessage({ kind: 'getTeams' });
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => {
    if (deleting && !state.teams.some(team => team.id === deleting)) {
      if (draft?.id === deleting) { setDraft(undefined); setDirty(false); setDraftBaseSignature(undefined); }
      setDeleting(undefined); setConfirmDelete(undefined); setNotice(`${profileLabel(draft)} gelöscht.`);
    }
  }, [state.teams, deleting]);

  const edit = (update: Partial<AgentTeam>) => { setDraft(team => team && ({ ...team, ...update })); setDirty(true); setNotice(''); setError(''); };
  const editAgent = (update: Partial<TeamAgent>) => {
    if (!draft || !selectedAgent) return;
    edit({ ...(solo && update.name !== undefined ? { name: update.name } : {}), agents: draft.agents.map(agent => agent.id === selectedAgent.id ? { ...agent, ...update } : agent) });
  };
  const editTarget = (target: TeamAgent['target'], update: Partial<TeamAgent> = {}) => {
    if (!selectedAgent) return;
    const changedModel = target.provider !== selectedAgent.target.provider || target.model !== selectedAgent.target.model;
    editAgent({ ...update, target, ...(changedModel ? { effort: undefined } : {}) });
  };
  const open = (choice: ProfileChoice) => {
    const next: AgentTeam | undefined = choice === 'new-agent' ? undefined : choice === 'new-team' ? { id: identifier('team'), kind: 'team', name: 'Neues Team', description: '', instructions: '', agents: [newAgent(usableAccounts, 1)], updatedAt: Date.now() } : copy(latest.current.state.teams.find(team => team.id === choice.id) ?? choice);
    setDraft(next); setAgentId(next?.agents[0]?.id ?? ''); setDirty(choice === 'new-team'); setStarterPicker(choice === 'new-agent');
    setDraftBaseSignature(typeof choice === 'string' || !next ? undefined : teamProfileSignature(next));
    setError(''); setNotice(''); setPendingSwitch(undefined); setConfirmDelete(undefined);
  };
  const choose = (choice: ProfileChoice) => {
    if (typeof choice !== 'string' && choice.id === draft?.id) return;
    if (dirty) setPendingSwitch(choice); else open(choice);
  };
  useEffect(() => {
    if (!initialProfileId || openedProfile.current === initialProfileId || !loaded) return;
    const profile = state.teams.find(team => team.id === initialProfileId);
    if (!profile) return;
    openedProfile.current = initialProfileId;
    choose(profile);
  }, [initialProfileId, loaded, state.teams]);
  const createAgent = (starter?: AgentStarter) => {
    const agent = { ...newAgent(usableAccounts, 1), name: starter?.name ?? 'Neuer Agent', role: starter?.role ?? '', instructions: starter?.instructions ?? '' };
    setDraft({ id: identifier('profile'), kind: 'agent', name: agent.name, description: starter?.description ?? '', instructions: '', agents: [agent], updatedAt: Date.now() });
    setAgentId(agent.id); setDirty(true); setDraftBaseSignature(undefined); setStarterPicker(false); setNotice(''); setError('');
  };
  const addSavedAgent = (id: string) => {
    const profile = savedAgents.find(profile => profile.id === id);
    const source = profile?.agents[0];
    if (!draft || solo || !profile || !source || draft.agents.length >= MAX_TEAM_AGENTS) return;
    const agent = { ...copy(source), id: identifier('agent'), dependsOn: [], instructions: [profile.instructions, source.instructions].filter(Boolean).join('\n\n') };
    edit({ agents: [...draft.agents, agent] }); setAgentId(agent.id);
  };
  const validation = (() => {
    if (!draft) return '';
    if (!draft.name.trim()) return `Gib ${solo ? 'dem Agenten' : 'dem Team'} einen Namen.`;
    if (draft.agents.some(agent => !agent.name.trim())) return 'Jeder Agent braucht einen Namen.';
    if (draft.agents.some(agent => !agent.target.account)) return 'Wähle für jeden Agenten ein Konto.';
    const unsupportedEffort = draft.agents.find(agent => agent.effort && !modelOption(agent.target.provider, agent.target.model)?.efforts?.includes(agent.effort));
    if (unsupportedEffort) return `Die Reasoning-Stärke von ${unsupportedEffort.name} wird vom gewählten Modell nicht unterstützt. Wähle eine verfügbare Stufe oder die Modellvorgabe.`;
    const automationIssue = automationFormError(draft.automation);
    if (automationIssue) return automationIssue;
    try { teamOrder(draft); } catch (cause) { return String(cause instanceof Error ? cause.message : cause); }
    return '';
  })();
  const save = () => {
    if (!draft || saving || validation) return;
    let normalized: AgentTeam;
    try { normalized = validateTeam(draft); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return; }
    setError(''); setNotice(''); setSaving(true);
    pendingSave.current = { id: draft.id, signature: teamProfileSignature(draft), saved: normalized, label };
    vscode.postMessage({ kind: 'saveTeam', team: normalized, revision: state.revision, ...(draftBaseSignature !== undefined ? { baseSignature: draftBaseSignature } : {}) });
  };
  const selectedAccount = selectedAgent && usableAccounts.find(account => account.provider === selectedAgent.target.provider && account.label === selectedAgent.target.account);
  const scopedMcp = selectedAgent && SCOPED_MCP_PROVIDERS.includes(selectedAgent.target.provider);
  const accountOptions = usableAccounts.map(account => ({ value: accountKey(account.provider, account.label), label: `${PROVIDERS[account.provider] ?? account.provider} · ${account.label}`, hint: account.available && account.authState !== 'expired' ? undefined : 'Zurzeit nicht verbunden', icon: <BrandMark provider={account.provider} size={14} /> }));
  if (selectedAgent && !selectedAccount && selectedAgent.target.account) accountOptions.unshift({ value: accountKey(selectedAgent.target.provider, selectedAgent.target.account), label: `${PROVIDERS[selectedAgent.target.provider]} · ${selectedAgent.target.account}`, hint: 'Konto nicht verfügbar', icon: <BrandMark provider={selectedAgent.target.provider} size={14} /> });
  const accountModels = selectedAccount?.models ?? [];
  const reasoningModel = selectedAgent && modelOption(selectedAgent.target.provider, selectedAgent.target.model);
  const effortLevels = reasoningModel?.efforts ?? [];
  const effortOptions: Array<{ value: Effort | ''; label: string }> = [
    { value: '', label: effortLevels.length ? `Modellvorgabe${reasoningModel?.defaultEffort ? ` (${EFFORT_LABELS[reasoningModel.defaultEffort]})` : ''}` : 'Nicht verfügbar' },
    ...effortLevels.map(value => ({ value, label: EFFORT_LABELS[value] })),
  ];
  if (selectedAgent?.effort && !effortLevels.includes(selectedAgent.effort)) effortOptions.push({ value: selectedAgent.effort, label: `${EFFORT_LABELS[selectedAgent.effort]} (nicht unterstützt)` });
  const modelOptions = [{ value: '', label: 'Standardmodell' }, ...accountModels.map(model => ({ value: model.id, label: model.label }))];
  if (selectedAgent?.target.model && !accountModels.some(model => model.id === selectedAgent.target.model)) modelOptions.push({ value: selectedAgent.target.model, label: `${selectedAgent.target.model} (gespeichert)` });
  const unavailableAgents = draft?.agents.filter(agent => !usableAccounts.some(account => account.provider === agent.target.provider && account.label === agent.target.account && account.available && account.authState !== 'expired')) ?? [];
  const savedTeam = state.teams.find(team => team.id === draft?.id);
  const awaitingSave = pendingSave.current;
  const awaitingOwnSave = saving && awaitingSave && awaitingSave.id === draft?.id && savedTeam && teamProfileSignature(savedTeam) === teamProfileSignature(awaitingSave.saved);
  const draftConflict = dirty && !awaitingOwnSave && draftBaseSignature !== undefined && (!savedTeam || teamProfileSignature(savedTeam) !== draftBaseSignature);
  const liveRuns = state.runs.filter(run => run.status === 'running');
  const orderedRuns = [...state.runs].sort((a, b) => b.startedAt - a.startedAt);
  const runningChats = conversations.filter(chat => chat.running && !state.runs.some(run => run.jobs.some(job => job.conversationId === chat.id)));
  const task = draft ? taskDrafts[draft.id] ?? '' : '';
  const start = () => {
    if (!draft || !savedTeam || dirty || !task.trim() || starting || unavailableAgents.length) return;
    pendingStart.current = { teamId: draft.id, task: task.trim(), previousRuns: state.runs.map(run => run.id), label };
    setStarting(true); setError(''); setNotice('');
    vscode.postMessage({ kind: 'startTeam', teamId: draft.id, task: task.trim() });
  };

  return <main class="cx-teams cx-settings-mode" aria-label="Aktive Agenten">
    <div class="cx-teams-page">
      <header class="cx-teams-header">
        <div><h1>Aktive Agenten</h1><p>Eigene Agenten erstellen oder ihre Fähigkeiten in Teams verbinden.</p></div>
        <div class="cx-teams-create"><Button kind="primary" icon="plus" onClick={() => choose('new-agent')} disabled={saving}>Agent erstellen</Button><Button icon="worktree" onClick={() => choose('new-team')} disabled={saving}>Team erstellen</Button></div>
      </header>
      <div class="cx-teams-overview" aria-label="Agentenstatus">
        <span><i class={liveRuns.length ? 'active' : ''} />{liveRuns.length ? `${liveRuns.length} ${liveRuns.length === 1 ? 'Auftrag läuft' : 'Aufträge laufen'}` : 'Kein Auftrag aktiv'}</span>
        <span>{savedAgents.length} {savedAgents.length === 1 ? 'Agent' : 'Agenten'} · {savedTeams.length} {savedTeams.length === 1 ? 'Team' : 'Teams'}</span>
        <button onClick={onAccounts}><Glyph name="user" size={14} />Konten verwalten</button>
      </div>
      {error && <div class="cx-team-notice error" role="alert"><Glyph name="shield" size={16} /><span>{error}</span><button aria-label="Fehlermeldung schließen" onClick={() => setError('')}><Glyph name="close" size={14} /></button></div>}
      {notice && <div class="cx-team-notice" role="status"><Glyph name="check" size={16} /><span>{notice}</span></div>}
      {pendingSwitch && <div class="cx-team-unsaved" role="alert"><span>Dein Entwurf enthält ungespeicherte Änderungen.</span><Button onClick={() => setPendingSwitch(undefined)}>Weiter bearbeiten</Button><Button kind="danger" onClick={() => open(pendingSwitch)}>Änderungen verwerfen</Button></div>}
      {draftConflict && !pendingSwitch && <div class="cx-team-unsaved" role="alert"><span>{savedTeam ? 'Dieses Profil wurde inzwischen an anderer Stelle geändert. Dein Entwurf bleibt erhalten und überschreibt den gespeicherten Stand nicht.' : 'Dieses Profil wurde inzwischen an anderer Stelle gelöscht. Dein Entwurf bleibt erhalten.'}</span>{savedTeam && <Button disabled={saving} onClick={() => setPendingSwitch(savedTeam)}>Gespeicherten Stand laden</Button>}</div>}
      {!loaded ? <div class="cx-team-empty" role="status">Agenten und Teams werden geladen …</div> : <div class="cx-teams-workspace">
        <aside class="cx-team-library" aria-label="Gespeicherte Agenten und Teams">
          {([{ title: 'Agenten', items: savedAgents, icon: 'user' }, { title: 'Teams', items: savedTeams, icon: 'worktree' }] as const).map(group => <section class="cx-team-library-group" aria-label={group.title} key={group.title}>
            <h2>{group.title}</h2>
            {group.items.length ? group.items.map(team => {
              const running = liveRuns.some(run => run.teamId === team.id);
              return <button class={`cx-team-library-item ${draft?.id === team.id ? 'selected' : ''}`} aria-pressed={draft?.id === team.id} onClick={() => choose(team)} disabled={saving} key={team.id}>
                <span class="cx-team-library-icon"><Glyph name={group.icon} size={18} /></span>
                <span><strong>{team.name}</strong><small>{team.kind === 'agent' ? team.agents[0]?.role || 'Eigener Agent' : `${team.agents.length} ${team.agents.length === 1 ? 'Agent' : 'Agenten'}`} · {running ? 'Arbeitet' : 'Bereit'}</small></span>
                {running && <i class="cx-team-dot" />}
              </button>;
            }) : <p>{group.title === 'Agenten' ? 'Noch keine eigenen Agenten.' : 'Noch keine Teams.'}</p>}
          </section>)}
          {draft && !savedTeam && <div class="cx-team-draft-label"><Glyph name="edit" size={14} />Neuer Entwurf</div>}
        </aside>
        {starterPicker ? <section class="cx-agent-starters" aria-label="Agentenvorlagen">
          <h2>Wie soll dein Agent arbeiten?</h2><p>Beginne mit eigenen Anweisungen oder passe eine Rolle an. Konto, Modell und Werkzeuge legst du anschließend fest.</p>
          <div class="cx-agent-starter-grid"><button class="cx-agent-starter blank" onClick={() => createAgent()}><Glyph name="plus" size={20} /><strong>Ohne Vorlage</strong><span>Aufgabe, Rolle und Anweisungen selbst festlegen.</span></button>
            {AGENT_STARTERS.map(starter => <article class="cx-agent-starter-wrap" key={starter.id}><button class="cx-agent-starter" onClick={() => createAgent(starter)}><Glyph name="file" size={20} /><strong>{starter.name}</strong><span>{starter.description}</span></button>{starter.sourceUrl && <button class="cx-agent-starter-link" aria-label={`Grok-Beispiel für ${starter.name}`} onClick={() => vscode.postMessage({ kind: 'openExternal', url: starter.sourceUrl! })}>Grok-Beispiel<Glyph name="arrowUpRight" size={12} /></button>}</article>)}
          </div>
          <p class="cx-agent-starter-source">Eigene Cortex-Vorlagen, inspiriert von den veröffentlichten Grok-Bot-Anwendungsbeispielen. Alle Anweisungen sind editierbar.</p>
        </section> : draft && selectedAgent ? <div class={`cx-team-editor ${solo ? 'cx-solo-agent-editor' : ''}`} aria-label={`${label} bearbeiten`}>
          <div class="cx-team-editor-heading"><div><h2>{draft.name || `${label} bearbeiten`}</h2><span>{dirty ? 'Ungespeicherte Änderungen' : 'Gespeichert'}</span></div><div class="cx-team-actions">
            {savedTeam && <Button kind="ghost" icon="trash" onClick={() => setConfirmDelete(draft.id)} disabled={saving || !!deleting}>Löschen</Button>}
            <Button kind="primary" icon="check" onClick={save} disabled={!dirty || saving || !!validation}>{saving ? 'Speichert …' : `${label} speichern`}</Button>
          </div></div>
          {confirmDelete === draft.id && <div class="cx-team-unsaved" role="alert"><span>„{draft.name}“ löschen? Die bisherigen Chats bleiben erhalten.</span><Button onClick={() => setConfirmDelete(undefined)}>Abbrechen</Button><Button kind="danger" disabled={!!deleting} onClick={() => { setDeleting(draft.id); vscode.postMessage({ kind: 'deleteTeam', id: draft.id, revision: state.revision }); }}>{deleting ? 'Löscht …' : `${label} löschen`}</Button></div>}
          <div class="cx-team-fields">
            <label><span>{solo ? 'Agentenname' : 'Teamname'}</span><input value={draft.name} maxLength={solo ? 80 : 100} onInput={event => solo ? editAgent({ name: event.currentTarget.value }) : edit({ name: event.currentTarget.value })} /></label>
            <div class="cx-team-field"><span>Projekt</span><Select label={solo ? 'Projekt des Agenten' : 'Projekt des Teams'} value={draft.projectPath ?? ''} options={[{ value: '', label: 'Ohne Projekt' }, ...projects.map(project => ({ value: project.path, label: project.name, hint: project.missing ? 'Ordner nicht verfügbar' : undefined, disabled: project.missing })), ...(draft.projectPath && !projects.some(project => project.path === draft.projectPath) ? [{ value: draft.projectPath, label: draft.projectPath, hint: 'Projekt nicht verfügbar' }] : [])]} onChange={projectPath => edit({ projectPath: projectPath || undefined })} /></div>
          </div>
          <label class="cx-team-field"><span>Beschreibung</span><input value={draft.description} maxLength={1000} placeholder={solo ? 'Wofür setzt du diesen Agenten ein?' : 'Wofür setzt du dieses Team ein?'} onInput={event => edit({ description: event.currentTarget.value })} /></label>
          {(!solo || draft.instructions) && <label class="cx-team-field"><span>{solo ? 'Zusätzliche Anweisungen' : 'Gemeinsame Anweisungen'} <small>Markdown</small></span><textarea rows={3} value={draft.instructions} maxLength={100000} placeholder="Ziel, gemeinsame Regeln und gewünschtes Ergebnis …" onInput={event => edit({ instructions: event.currentTarget.value })} /></label>}
          <section class="cx-team-members" aria-label={solo ? 'Agent einrichten' : 'Agenten im Team'}>
            {!solo && <><div class="cx-team-section-heading"><div><h3>Agenten</h3><p>Jede Rolle arbeitet mit ihrem eigenen Konto, ihren Anweisungen und Werkzeugen.</p></div><Button icon="plus" disabled={draft.agents.length >= MAX_TEAM_AGENTS} onClick={() => { const agent = newAgent(usableAccounts, draft.agents.length + 1); edit({ agents: [...draft.agents, agent] }); setAgentId(agent.id); }}>Agent hinzufügen</Button></div>
            <div class="cx-team-add-saved"><Select label="Gespeicherten Agenten hinzufügen" value="" placeholder="Gespeicherten Agenten hinzufügen" disabled={!savedAgents.length || draft.agents.length >= MAX_TEAM_AGENTS} options={savedAgents.map(profile => ({ value: profile.id, label: profile.name, hint: profile.agents[0]?.role }))} onChange={addSavedAgent} /><span>Wird als eigene Kopie in dieses Team übernommen.</span></div>
            <div class="cx-team-agent-tabs" role="tablist" aria-label="Agentenrollen">{draft.agents.map((agent, index) => <button role="tab" aria-selected={selectedAgent.id === agent.id} class={selectedAgent.id === agent.id ? 'selected' : ''} key={agent.id} onClick={() => setAgentId(agent.id)}><span>{index + 1}</span>{agent.name || `Agent ${index + 1}`}</button>)}</div></>}
            <div class="cx-team-agent-editor" role={solo ? undefined : 'tabpanel'} aria-label={selectedAgent.name}>
              <div class="cx-team-fields">
                {!solo && <label><span>Agentenname</span><input value={selectedAgent.name} maxLength={80} onInput={event => editAgent({ name: event.currentTarget.value })} /></label>}
                <label><span>Rolle</span><input value={selectedAgent.role} maxLength={200} placeholder="z. B. Recherche oder Qualitätsprüfung" onInput={event => editAgent({ role: event.currentTarget.value })} /></label>
                <div class="cx-team-field"><span>Konto</span><Select label="Konto des Agenten" value={accountKey(selectedAgent.target.provider, selectedAgent.target.account)} placeholder="Konto auswählen" options={accountOptions} disabled={!accountOptions.length} onChange={value => { const account = usableAccounts.find(account => accountKey(account.provider, account.label) === value); if (account && value !== accountKey(selectedAgent.target.provider, selectedAgent.target.account)) editTarget({ provider: account.provider, account: account.label }, !SCOPED_MCP_PROVIDERS.includes(account.provider) ? { mcpServers: undefined } : {}); }} /></div>
                <div class="cx-team-field"><span>Modell</span><Select label="Modell des Agenten" value={selectedAgent.target.model ?? ''} options={modelOptions} disabled={!selectedAccount} onChange={model => editTarget({ ...selectedAgent.target, model: model || undefined })} /></div>
              </div>
              <div class="cx-team-control-row cx-team-reasoning"><div><strong>Reasoning-Stärke</strong><small>{effortLevels.length ? !selectedAgent.target.model && reasoningModel ? `Standardmodell: ${reasoningModel.label}. Gilt für jeden Auftrag dieses Agenten.` : 'Denkaufwand für jeden Auftrag dieses Agenten.' : 'Für dieses Modell bietet Cortex keine einstellbare Reasoning-Stärke an.'}</small></div><Select label="Reasoning-Stärke des Agenten" value={selectedAgent.effort ?? ''} options={effortOptions} disabled={!selectedAccount || (!effortLevels.length && !selectedAgent.effort)} onChange={effort => editAgent({ effort: effort || undefined })} /></div>
              {!usableAccounts.length && <div class="cx-team-inline-note">Verbinde ein Konto, um Agenten einzurichten. <button onClick={onAccounts}>Zu den Konten</button></div>}
              <label class="cx-team-field"><span>Anweisungen für diesen Agenten <small>Markdown</small></span><textarea class="cx-team-markdown" rows={6} value={selectedAgent.instructions} maxLength={100000} placeholder={solo ? '## Aufgabe\nBeschreibe, was dein Agent tun und welches Ergebnis er liefern soll.' : '## Aufgabe\nBeschreibe, was dieser Agent tun und an das Team übergeben soll.'} onInput={event => editAgent({ instructions: event.currentTarget.value })} /></label>
              <div class="cx-team-markdown-actions"><Button icon="file" onClick={() => { const requestId = identifier('import'); imports.current.set(requestId, { teamId: draft.id, agentId: selectedAgent.id }); vscode.postMessage({ kind: 'importAgentMarkdown', requestId }); }}>Markdown importieren</Button><Button icon="download" disabled={!selectedAgent.instructions.trim()} onClick={() => vscode.postMessage({ kind: 'exportAgentMarkdown', name: selectedAgent.name, text: selectedAgent.instructions })}>Markdown exportieren</Button></div>
              <div class="cx-team-control-row"><div><strong>Zugriff</strong><small>Gilt für die Werkzeuge dieses Agenten.</small></div><Select label="Zugriff des Agenten" value={selectedAgent.permissionMode} options={[{ value: 'safe', label: 'Nur lesen' }, { value: 'edits', label: 'Änderungen erlauben' }, { value: 'full', label: 'Vollzugriff' }]} onChange={permissionMode => editAgent({ permissionMode })} /></div>
              <div class="cx-team-control-row"><div><strong>MCP-Konnektoren</strong><small>{scopedMcp ? 'Wähle die verfügbaren Verbindungen für diese Rolle.' : 'Dieser Anbieter übernimmt seine MCPs aus dem Kontoprofil.'}</small></div>{scopedMcp ? <Select label="MCP-Auswahl des Agenten" value={selectedAgent.mcpServers === undefined ? 'all' : selectedAgent.mcpServers.length ? 'selected' : 'none'} options={[{ value: 'all', label: 'Alle verfügbaren' }, { value: 'selected', label: 'Einzeln auswählen' }, { value: 'none', label: 'Keine' }]} onChange={value => editAgent({ mcpServers: value === 'all' ? undefined : value === 'none' ? [] : selectedAgent.mcpServers ?? [] })} /> : <span class="cx-team-count">Alle verbundenen MCPs</span>}</div>
              {scopedMcp && selectedAgent.mcpServers !== undefined && <div class="cx-team-checks" aria-label="MCP-Konnektoren">{state.servers.filter(server => !server.providers?.length || server.providers.includes(selectedAgent.target.provider)).map(server => <label key={server.name}><input type="checkbox" checked={selectedAgent.mcpServers?.includes(server.name)} onChange={event => editAgent({ mcpServers: event.currentTarget.checked ? [...selectedAgent.mcpServers ?? [], server.name] : selectedAgent.mcpServers?.filter(name => name !== server.name) })} /><span>{server.title || server.name}</span></label>)}{!state.servers.length && <p>Keine MCP-Konnektoren eingerichtet.</p>}{selectedAgent.mcpServers.filter(name => !state.servers.some(server => server.name === name && (!server.providers?.length || server.providers.includes(selectedAgent.target.provider)))).map(name => <label key={name}><input type="checkbox" checked onChange={() => editAgent({ mcpServers: selectedAgent.mcpServers?.filter(value => value !== name) })} /><span>{name} <small>nicht verfügbar</small></span></label>)}</div>}
              <div class="cx-team-control-row"><div><strong>Skills</strong><small>Ausgewählte Anleitungen werden dem Agenten mitgegeben.</small></div><span class="cx-team-count">{selectedAgent.skillPaths.length} ausgewählt</span></div>
              <div class="cx-team-checks" aria-label="Skills des Agenten">{state.skills.map(skill => <label key={skill.path} title={skill.path}><input type="checkbox" checked={selectedAgent.skillPaths.includes(skill.path)} onChange={event => editAgent({ skillPaths: event.currentTarget.checked ? [...selectedAgent.skillPaths, skill.path] : selectedAgent.skillPaths.filter(path => path !== skill.path) })} /><span>{skill.name}</span></label>)}{!state.skills.length && <p>Keine Skills verfügbar.</p>}{selectedAgent.skillPaths.filter(path => !state.skills.some(skill => skill.path === path)).map(path => <label key={path}><input type="checkbox" checked onChange={() => editAgent({ skillPaths: selectedAgent.skillPaths.filter(value => value !== path) })} /><span>{path.split('/').pop()} <small>nicht verfügbar</small></span></label>)}</div>
              {!solo && <><div class="cx-team-control-row"><div><strong>Ergebnisse übernehmen von</strong><small>Diese Agenten arbeiten zuerst. Ihre Ergebnisse werden als Übergabe mitgegeben.</small></div></div>
              <div class="cx-team-checks" aria-label="Übergaben an den Agenten">{draft.agents.filter(agent => agent.id !== selectedAgent.id).map(agent => <label key={agent.id}><input type="checkbox" checked={selectedAgent.dependsOn.includes(agent.id)} disabled={dependencyWouldCycle(draft, selectedAgent.id, agent.id)} onChange={event => editAgent({ dependsOn: event.currentTarget.checked ? [...selectedAgent.dependsOn, agent.id] : selectedAgent.dependsOn.filter(id => id !== agent.id) })} /><span>{agent.name || 'Unbenannter Agent'}</span></label>)}{draft.agents.length === 1 && <p>Füge einen weiteren Agenten hinzu, um Ergebnisse zu übergeben.</p>}</div>
              <div class="cx-team-agent-footer"><span>{draft.agents.length} von {MAX_TEAM_AGENTS} Agenten</span><Button kind="ghost" icon="trash" disabled={draft.agents.length === 1} onClick={() => { const agents = draft.agents.filter(agent => agent.id !== selectedAgent.id).map(agent => ({ ...agent, dependsOn: agent.dependsOn.filter(id => id !== selectedAgent.id) })); edit({ agents }); setAgentId(agents[0]!.id); }}>Agent entfernen</Button></div></>}
            </div>
          </section>
          <AgentAutomationEditor team={draft} saved={savedTeam} runtime={state.automations} dirty={dirty} onChange={automation => edit({ automation })} />
          {validation && !automationFormError(draft.automation) && <p class="cx-team-inline-note">{validation}</p>}
          <section class="cx-team-launch" aria-label={solo ? 'Agentenauftrag starten' : 'Teamauftrag starten'}><h3>{solo ? 'Auftrag' : 'Gemeinsamer Auftrag'}</h3><p>{solo ? 'Dein Agent arbeitet mit seinen gespeicherten Anweisungen und Werkzeugen. Jeder Auftrag erhält einen eigenen Chat.' : 'Die Agenten arbeiten nacheinander im selben Projekt. Übergaben legen fest, wer wessen Ergebnis erhält.'}</p><textarea aria-label={solo ? 'Auftrag für den Agenten' : 'Auftrag für das Team'} rows={3} value={task} placeholder={solo ? 'Was soll dein Agent erledigen?' : 'Was soll das Team gemeinsam erledigen?'} onInput={event => { const value = event.currentTarget.value; retainedTasks[draft.id] = value; setTaskDrafts(values => ({ ...values, [draft.id]: value })); }} /><div><span>{dirty || !savedTeam ? `Speichere ${solo ? 'den Agenten' : 'das Team'} vor dem Start.` : unavailableAgents.length ? `Konto für ${unavailableAgents.map(agent => agent.name).join(', ')} nicht verfügbar.` : solo ? 'Anweisungen und Werkzeuge sind bereit.' : 'Jeder Agent erhält einen eigenen Chat.'}</span><Button kind="primary" icon="arrow" disabled={!savedTeam || dirty || !task.trim() || starting || !!unavailableAgents.length || !!validation} onClick={start}>{starting ? 'Startet …' : `${label} starten`}</Button></div></section>
        </div> : <div class="cx-team-empty"><Glyph name="user" size={32} /><h2>Deine Agenten, deine Arbeitsweise</h2><p>Wähle einen gespeicherten Agenten oder ein Team. Neue Agenten startest du mit einer Vorlage oder eigenen Anweisungen.</p><Button icon="plus" kind="primary" onClick={() => choose('new-agent')}>{savedAgents.length ? 'Weiteren Agenten einrichten' : 'Ersten Agenten einrichten'}</Button></div>}
      </div>}
      <section class="cx-team-runs" aria-label="Aufträge"><div class="cx-team-section-heading"><div><h2>Aufträge</h2><p>Aktivität und Ergebnisse deiner Agenten und Teams.</p></div></div>
        {!orderedRuns.length && <div class="cx-team-runs-empty">Noch kein Auftrag gestartet.</div>}
        {orderedRuns.map(run => <article class="cx-team-run" key={run.id}><header><div><h3>{run.teamName}</h3><time dateTime={new Date(run.startedAt).toISOString()}>{new Date(run.startedAt).toLocaleString('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time><span class="cx-team-run-source">{run.source?.kind === 'schedule' ? 'Zeitplan' : run.source?.kind === 'webhook' ? 'Webhook' : 'Manuell'}</span></div><span class={`cx-team-status ${run.status}`}>{STATUS[run.status]}</span>{run.status === 'running' && <Button kind="ghost" disabled={stopPending.includes(run.id)} onClick={() => { setStopPending(ids => [...ids, run.id]); vscode.postMessage({ kind: 'stopTeam', runId: run.id }); }}>{stopPending.includes(run.id) ? 'Stoppt …' : `${run.kind === 'agent' ? 'Agent' : 'Team'} stoppen`}</Button>}</header><p class="cx-team-run-task">{run.task}</p><ol class="cx-team-jobs">{run.jobs.map(job => <li key={job.agentId} class={job.status}><span class="cx-team-job-icon"><Glyph name={job.status === 'completed' ? 'check' : job.status === 'running' ? 'bolt' : job.status === 'failed' || job.status === 'blocked' ? 'shield' : 'clock'} size={16} /></span><div><div class="cx-team-job-heading"><strong>{job.agentName}</strong><span>{STATUS[job.status]}</span></div>{job.activity && <p>{job.activity}</p>}{job.error && <p class="cx-team-job-error">{job.error}</p>}{job.result && <details><summary>Ergebnis ansehen</summary><div class="cx-team-result"><Markdown text={job.result} reading /></div></details>}</div>{job.conversationId && <Button kind="ghost" icon="chat" onClick={() => onOpenConversation(job.conversationId!)}>Chat öffnen</Button>}</li>)}</ol></article>)}
      </section>
      {runningChats.length > 0 && <section class="cx-team-other"><h2>Weitere aktive Chats</h2>{runningChats.map(chat => <button key={chat.id} onClick={() => onOpenConversation(chat.id)}><Glyph name="chat" size={16} /><span>{chat.title}</span><span>Arbeitet</span><Glyph name="arrowUpRight" size={14} /></button>)}</section>}
    </div>
  </main>;
}
