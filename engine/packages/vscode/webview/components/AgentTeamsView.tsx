import { Fragment, type ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { SCOPED_MCP_PROVIDERS } from '../../../core/src/mcp/runPolicy.js';
import { EFFORT_LABELS, modelOption } from '../../../core/src/models/catalog.js';
import type { Effort } from '../../../core/src/types.js';
import type { AccountStatusDto, ConversationMeta, HostToWebview, ProjectDto } from '../../src/panel/protocol.js';
import { AGENT_STARTERS, type AgentStarter } from '../../src/teams/starters.js';
import { MAX_TEAM_AGENTS, WEB_SEARCH_CHOICE_PROVIDERS, teamOrder, teamProfileSignature, validateTeam, type AgentTeam, type TeamAgent, type TeamJobStatus, type TeamsState } from '../../src/teams/types.js';
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
const PROVIDERS: Record<string, string> = { claude: 'Claude', codex: 'ChatGPT', grok: 'Grok', copilot: 'GitHub Copilot', openrouter: 'OpenRouter' };
const identifier = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const accountKey = (provider: string, label: string) => `${provider}\n${label}`;
type ProfileChoice = AgentTeam | 'new-agent' | 'new-team';
const profileLabel = (team?: AgentTeam) => team?.kind === 'agent' ? 'Agent' : 'Team';
// Navigating to a chat/account must not silently throw away a team draft.
let retainedDraft: { team: AgentTeam; dirty: boolean; baseSignature?: string } | undefined;
let retainedView: 'overview' | 'profile' = 'overview';
const ACCESS_ICON: Record<TeamAgent['permissionMode'], string> = { safe: 'eye', edits: 'edit', full: 'terminal' };
const ACCESS_LABEL: Record<TeamAgent['permissionMode'], string> = { safe: 'Nur lesen', edits: 'Änderungen', full: 'Vollzugriff' };
type WebSearchChoice = NonNullable<TeamAgent['webSearch']>;
const SEARCH_ICON: Record<WebSearchChoice, string> = { standard: 'globe', 'exa-instant': 'bolt', off: 'close' };
/**
 * Welche Suche „Standard“ bei OpenRouter wirklich bedeutet: eine eigene haben
 * nur OpenAI (ab GPT-4.1), Anthropic, Gemini 3, Grok und Perplexity — alle
 * anderen Modelle sucht OpenRouter mit Exa im Modus auto.
 */
const OPENROUTER_NATIVE_SEARCH = /^(anthropic|x-ai|perplexity)\/|^openai\/(gpt-4\.1|gpt-[5-9]|o3|o4)|^google\/gemini-3/;
function standardSearchLabel(provider: string, model?: string): string {
  if (provider === 'claude') return 'Claude-eigene Suche';
  if (provider === 'codex') return 'Codex-eigene Suche';
  if (provider === 'grok') return 'Grok-eigene Suche (Web und X)';
  if (provider === 'openrouter') return model && OPENROUTER_NATIVE_SEARCH.test(model) ? 'Eigene Suche des Modells' : 'Exa auto (~1 s), das Modell hat keine eigene';
  return 'Bei diesem Anbieter nicht umstellbar';
}
const ROLE_ICONS: Array<[RegExp, string]> = [[/recherch|quelle|analys/i, 'book'], [/review|code|prüf/i, 'code'], [/fehler|bug|reprodu/i, 'bug'], [/test/i, 'flask'], [/support|ticket|anfrage/i, 'ticket'], [/koordin|plan|zerleg/i, 'swarm'], [/schreib|redakt|text/i, 'edit'], [/design|oberfläche/i, 'canvas']];
const roleIcon = (agent: Pick<TeamAgent, 'name' | 'role'>) => ROLE_ICONS.find(([pattern]) => pattern.test(`${agent.name} ${agent.role}`))?.[1] ?? 'user';

/** Stufe = Länge der längsten Übergabekette davor; dieselbe Ordnung wie teamOrder. */
function agentLevels(agents: TeamAgent[]): Map<string, number> {
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  const levels = new Map<string, number>();
  const visit = (id: string, seen: Set<string>): number => {
    const known = levels.get(id);
    if (known !== undefined) return known;
    if (seen.has(id)) return 0;
    seen.add(id);
    const level = 1 + Math.max(-1, ...(byId.get(id)?.dependsOn ?? []).filter(other => byId.has(other)).map(other => visit(other, seen)));
    levels.set(id, level);
    return level;
  };
  agents.forEach(agent => visit(agent.id, new Set()));
  return levels;
}
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
  const [view, setViewState] = useState<'overview' | 'profile'>(() => retainedDraft ? retainedView : 'overview');
  const setView = (next: 'overview' | 'profile') => { retainedView = next; setViewState(next); };
  const [filter, setFilter] = useState<'all' | 'agents' | 'teams'>('all');
  const [query, setQuery] = useState('');
  const [taskDrafts, setTaskDrafts] = useState<Record<string, string>>(() => ({ ...retainedTasks }));
  const latest = useRef({ draft, dirty, state });
  latest.current = { draft, dirty, state };
  const pendingSave = useRef<{ id: string; signature: string; saved: AgentTeam; label: string }>();
  const pendingStart = useRef<{ teamId: string; task: string; previousRuns: string[]; label: string }>();
  const imports = useRef(new Map<string, { teamId: string; agentId: string }>());
  const openedProfile = useRef<string>();
  // OpenRouter bekommt nie automatisch Arbeit, lässt sich einem Agenten aber ausdrücklich zuweisen.
  const usableAccounts = accounts.filter(account => (!account.reviewOnly || account.provider === 'openrouter') && ['claude', 'codex', 'grok', 'copilot', 'openrouter'].includes(account.provider));
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
      if (draft?.id === deleting) { setDraft(undefined); setDirty(false); setDraftBaseSignature(undefined); setView('overview'); }
      setDeleting(undefined); setConfirmDelete(undefined); setNotice(`${profileLabel(draft)} gelöscht.`);
    }
  }, [state.teams, deleting]);

  // latest.current sofort mitziehen: ein Host-Stand, der vor dem nächsten Rendern
  // eintrifft, darf die gerade getippte Änderung nicht mit dem Gespeicherten überschreiben.
  const edit = (update: Partial<AgentTeam>) => { latest.current = { ...latest.current, dirty: true }; setDraft(team => team && ({ ...team, ...update })); setDirty(true); setNotice(''); setError(''); };
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
    setError(''); setNotice(''); setPendingSwitch(undefined); setConfirmDelete(undefined); setView('profile');
  };
  const choose = (choice: ProfileChoice) => {
    if (typeof choice !== 'string' && choice.id === draft?.id) { setPendingSwitch(undefined); setView('profile'); return; }
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
  const standardLabel = selectedAccount?.provider === 'openrouter'
    ? `Standardmodell (${accountModels.find(model => model.id === selectedAccount.defaultModel)?.label ?? selectedAccount.defaultModel ?? 'kostenlos, automatisch'})`
    : 'Standardmodell';
  const modelOptions = [{ value: '', label: standardLabel }, ...accountModels.map(model => ({ value: model.id, label: model.label }))];
  if (selectedAgent?.target.model && !accountModels.some(model => model.id === selectedAgent.target.model)) modelOptions.push({ value: selectedAgent.target.model, label: `${selectedAgent.target.model} (gespeichert)` });
  // Websuche: Standard ist die Suche des Anbieters; Exa Instant läuft über OpenRouter.
  const searchChoosable = !!selectedAgent && WEB_SEARCH_CHOICE_PROVIDERS.includes(selectedAgent.target.provider);
  const hasOpenRouter = accounts.some(account => account.provider === 'openrouter' && account.available);
  const standardSearch = selectedAgent ? standardSearchLabel(selectedAgent.target.provider, selectedAgent.target.model ?? selectedAccount?.defaultModel) : '';
  const searchOptions: Array<{ value: WebSearchChoice; label: string; hint?: string; icon: ComponentChildren; disabled?: boolean }> = [
    { value: 'standard', label: 'Standard des Modells', hint: standardSearch, icon: <Glyph name={SEARCH_ICON.standard} size={14} /> },
    { value: 'exa-instant', label: 'Exa Instant', hint: hasOpenRouter ? '~250 ms, über OpenRouter' : 'Braucht ein OpenRouter-Konto', icon: <Glyph name={SEARCH_ICON['exa-instant']} size={14} />, disabled: !hasOpenRouter && selectedAgent?.webSearch !== 'exa-instant' },
    { value: 'off', label: 'Aus', hint: 'Keine Websuche', icon: <Glyph name={SEARCH_ICON.off} size={14} /> },
  ];
  const searchSubline = !searchChoosable ? standardSearch
    : selectedAgent?.webSearch === 'exa-instant' ? (hasOpenRouter ? 'Exa Instant über OpenRouter' : 'Exa Instant — OpenRouter-Konto fehlt')
    : selectedAgent?.webSearch === 'off' ? 'Der Agent sucht nicht im Web' : standardSearch;
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

  const q = query.trim().toLocaleLowerCase('de-DE');
  const matches = (team: AgentTeam) => !q || [team.name, team.description, ...team.agents.map(agent => `${agent.name} ${agent.role}`)].join(' ').toLocaleLowerCase('de-DE').includes(q);
  const shownAgents = savedAgents.filter(matches);
  const shownTeams = savedTeams.filter(matches);
  const profileRuns = orderedRuns.filter(run => run.teamId === draft?.id);
  const levels = draft ? agentLevels(draft.agents) : new Map<string, number>();
  const stageCount = draft ? Math.max(0, ...draft.agents.map(agent => (levels.get(agent.id) ?? 0) + 1)) : 0;
  const atLevel = (level: number) => draft?.agents.filter(agent => levels.get(agent.id) === level) ?? [];
  const addToStage = (stage: number) => {
    if (!draft || draft.agents.length >= MAX_TEAM_AGENTS) return;
    const agent = { ...newAgent(usableAccounts, draft.agents.length + 1), dependsOn: stage ? atLevel(stage - 1).map(other => other.id) : [] };
    edit({ agents: [...draft.agents, agent] }); setAgentId(agent.id);
  };
  const moveTo = (stage: number) => {
    if (!draft || !selectedAgent) return;
    const sources = stage ? atLevel(stage - 1).filter(other => other.id !== selectedAgent.id && !dependencyWouldCycle(draft, selectedAgent.id, other.id)) : [];
    if (stage && !sources.length) return;
    editAgent({ dependsOn: sources.map(other => other.id) });
  };
  const runFor = (teamId: string) => liveRuns.find(run => run.teamId === teamId);
  const back = () => { setView('overview'); setStarterPicker(false); setPendingSwitch(undefined); setConfirmDelete(undefined); };
  const notices = <>
    {error && <div class="cx-team-notice error" role="alert"><Glyph name="shield" size={16} /><span>{error}</span><button aria-label="Fehlermeldung schließen" onClick={() => setError('')}><Glyph name="close" size={14} /></button></div>}
    {notice && <div class="cx-team-notice" role="status"><Glyph name="check" size={16} /><span>{notice}</span></div>}
    {pendingSwitch && <div class="cx-team-unsaved" role="alert"><Glyph name="edit" size={16} /><span>Dein Entwurf enthält ungespeicherte Änderungen.</span><Button onClick={() => { setPendingSwitch(undefined); if (draft) setView('profile'); }}>Weiter bearbeiten</Button><Button kind="danger" onClick={() => open(pendingSwitch)}>Änderungen verwerfen</Button></div>}
    {view === 'profile' && draftConflict && !pendingSwitch && <div class="cx-team-unsaved" role="alert"><Glyph name="warn" size={16} /><span>{savedTeam ? 'Dieses Profil wurde inzwischen an anderer Stelle geändert. Dein Entwurf bleibt erhalten und überschreibt den gespeicherten Stand nicht.' : 'Dieses Profil wurde inzwischen an anderer Stelle gelöscht. Dein Entwurf bleibt erhalten.'}</span>{savedTeam && <Button disabled={saving} onClick={() => setPendingSwitch(savedTeam)}>Gespeicherten Stand laden</Button>}</div>}
  </>;
  const runArticle = (run: typeof orderedRuns[number]) => <article class="cx-team-run" key={run.id}>
    <header><span class="cx-team-tile"><Glyph name={run.source?.kind === 'schedule' ? 'clock' : run.source?.kind === 'webhook' ? 'hook' : 'play'} size={16} /></span><div><h3>{run.task}</h3><span class="cx-team-run-meta"><time dateTime={new Date(run.startedAt).toISOString()}>{new Date(run.startedAt).toLocaleString('de-DE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time> · <span class="cx-team-run-source">{run.source?.kind === 'schedule' ? 'Zeitplan' : run.source?.kind === 'webhook' ? 'Webhook' : 'Manuell'}</span></span></div>
      <span class={`cx-team-status ${run.status}`}>{STATUS[run.status]}</span>
      {run.status === 'running' && <Button icon="stop" disabled={stopPending.includes(run.id)} onClick={() => { setStopPending(ids => [...ids, run.id]); vscode.postMessage({ kind: 'stopTeam', runId: run.id }); }}>{stopPending.includes(run.id) ? 'Stoppt …' : `${run.kind === 'agent' ? 'Agent' : 'Team'} stoppen`}</Button>}</header>
    <ol class="cx-team-jobs">{run.jobs.map(job => <li key={job.agentId} class={job.status}><span class="cx-team-job-icon"><Glyph name={job.status === 'completed' ? 'check' : job.status === 'running' ? 'bolt' : job.status === 'failed' || job.status === 'blocked' ? 'warn' : 'clock'} size={15} /></span><div><div class="cx-team-job-heading"><strong>{job.agentName}</strong><span>{STATUS[job.status]}</span></div>{job.activity && <p>{job.activity}</p>}{job.error && <p class="cx-team-job-error">{job.error}</p>}{job.result && <details><summary>Ergebnis ansehen</summary><div class="cx-team-result"><Markdown text={job.result} reading /></div></details>}</div>{job.conversationId && <Button kind="ghost" icon="chat" onClick={() => onOpenConversation(job.conversationId!)}>Chat öffnen</Button>}</li>)}</ol>
  </article>;

  const roleEditor = draft && selectedAgent && <div class="cx-team-agent-editor" role={solo ? undefined : 'tabpanel'} aria-label={selectedAgent.name}>
    {!solo && <label class="cx-team-row"><span class="cx-team-row-label"><Glyph name="user" size={14} />Agentenname</span><input value={selectedAgent.name} maxLength={80} onInput={event => editAgent({ name: event.currentTarget.value })} /></label>}
    <label class="cx-team-row"><span class="cx-team-row-label"><Glyph name="ticket" size={14} />Rolle</span><input value={selectedAgent.role} maxLength={200} placeholder="z. B. Recherche oder Qualitätsprüfung" onInput={event => editAgent({ role: event.currentTarget.value })} /></label>
    <div class="cx-team-row"><span class="cx-team-row-label"><BrandMark provider={selectedAgent.target.provider} size={14} />Konto</span><Select label="Konto des Agenten" value={accountKey(selectedAgent.target.provider, selectedAgent.target.account)} placeholder="Konto auswählen" options={accountOptions} disabled={!accountOptions.length} onChange={value => { const account = usableAccounts.find(account => accountKey(account.provider, account.label) === value); if (account && value !== accountKey(selectedAgent.target.provider, selectedAgent.target.account)) editTarget({ provider: account.provider, account: account.label }, { ...(!SCOPED_MCP_PROVIDERS.includes(account.provider) ? { mcpServers: undefined } : {}), ...(!WEB_SEARCH_CHOICE_PROVIDERS.includes(account.provider) ? { webSearch: undefined } : {}) }); }} /></div>
    {selectedAgent.target.provider === 'openrouter' && <div class="cx-team-inline-note"><Glyph name="info" size={14} />OpenRouter antwortet ohne Werkzeuge: Der Agent liest und schreibt keine Dateien. Weitere Modelle wählst du unter Einstellungen → Konto aus.</div>}
    {!usableAccounts.length && <div class="cx-team-inline-note"><Glyph name="info" size={14} />Verbinde ein Konto, um Agenten einzurichten. <button onClick={onAccounts}>Zu den Konten</button></div>}
    <div class="cx-team-row"><span class="cx-team-row-label"><Glyph name="cube" size={14} />Modell</span><Select label="Modell des Agenten" value={selectedAgent.target.model ?? ''} options={modelOptions} disabled={!selectedAccount} onChange={model => editTarget({ ...selectedAgent.target, model: model || undefined })} /></div>
    <div class="cx-team-row cx-team-reasoning"><span class="cx-team-row-label"><Glyph name="gauge" size={14} /><span>Reasoning-Stärke<small>{effortLevels.length ? !selectedAgent.target.model && reasoningModel ? `Standardmodell: ${reasoningModel.label}` : 'Denkaufwand je Auftrag' : 'Für dieses Modell nicht einstellbar'}</small></span></span><Select label="Reasoning-Stärke des Agenten" value={selectedAgent.effort ?? ''} options={effortOptions} disabled={!selectedAccount || (!effortLevels.length && !selectedAgent.effort)} onChange={effort => editAgent({ effort: effort || undefined })} /></div>
    <div class="cx-team-row"><span class="cx-team-row-label"><Glyph name="search" size={14} /><span>Websuche<small>{searchSubline}</small></span></span><Select label="Websuche des Agenten" value={selectedAgent.webSearch ?? 'standard'} options={searchOptions} disabled={!searchChoosable} onChange={choice => editAgent({ webSearch: choice === 'standard' ? undefined : choice })} /></div>
    <div class="cx-team-row"><span class="cx-team-row-label"><Glyph name={ACCESS_ICON[selectedAgent.permissionMode]} size={14} />Zugriff</span><Select label="Zugriff des Agenten" value={selectedAgent.permissionMode} options={[{ value: 'safe', label: 'Nur lesen' }, { value: 'edits', label: 'Änderungen erlauben' }, { value: 'full', label: 'Vollzugriff' }]} onChange={permissionMode => editAgent({ permissionMode })} /></div>
    {!solo && <div class="cx-team-row cx-team-stage-row"><span class="cx-team-row-label"><Glyph name="layers" size={14} />Stufe</span><div class="cx-team-pills" role="group" aria-label="Stufe des Agenten">{Array.from({ length: stageCount + 1 }, (_, stage) => {
      const current = levels.get(selectedAgent.id) === stage;
      const blocked = stage > 0 && !atLevel(stage - 1).some(other => other.id !== selectedAgent.id && !dependencyWouldCycle(draft, selectedAgent.id, other.id));
      return <button key={stage} type="button" class={current ? 'selected' : ''} aria-pressed={current} disabled={blocked && !current} onClick={() => moveTo(stage)}>{stage === stageCount ? 'Neu' : stage + 1}</button>;
    })}</div></div>}
    {!solo && <div class="cx-team-row cx-team-row-stack"><span class="cx-team-row-label"><Glyph name="forward" size={14} /><span>Ergebnisse übernehmen von<small>Diese Agenten arbeiten zuerst und übergeben ihr Ergebnis.</small></span></span>
      <div class="cx-team-checks" aria-label="Übergaben an den Agenten">{draft.agents.filter(agent => agent.id !== selectedAgent.id).map(agent => <label key={agent.id}><input type="checkbox" checked={selectedAgent.dependsOn.includes(agent.id)} disabled={dependencyWouldCycle(draft, selectedAgent.id, agent.id)} onChange={event => editAgent({ dependsOn: event.currentTarget.checked ? [...selectedAgent.dependsOn, agent.id] : selectedAgent.dependsOn.filter(id => id !== agent.id) })} /><span>{agent.name || 'Unbenannter Agent'}</span></label>)}{draft.agents.length === 1 && <p>Füge einen weiteren Agenten hinzu, um Ergebnisse zu übergeben.</p>}</div></div>}
    <div class="cx-team-row cx-team-row-stack"><span class="cx-team-row-label"><Glyph name="doc" size={14} /><span>Anweisungen für diesen Agenten <small>Markdown</small></span></span>
      <textarea class="cx-team-markdown" rows={6} aria-label="Anweisungen für diesen Agenten Markdown" value={selectedAgent.instructions} maxLength={100000} placeholder={solo ? '## Aufgabe\nBeschreibe, was dein Agent tun und welches Ergebnis er liefern soll.' : '## Aufgabe\nBeschreibe, was dieser Agent tun und an das Team übergeben soll.'} onInput={event => editAgent({ instructions: event.currentTarget.value })} />
      <div class="cx-team-markdown-actions"><Button icon="file" onClick={() => { const requestId = identifier('import'); imports.current.set(requestId, { teamId: draft.id, agentId: selectedAgent.id }); vscode.postMessage({ kind: 'importAgentMarkdown', requestId }); }}>Markdown importieren</Button><Button icon="download" disabled={!selectedAgent.instructions.trim()} onClick={() => vscode.postMessage({ kind: 'exportAgentMarkdown', name: selectedAgent.name, text: selectedAgent.instructions })}>Markdown exportieren</Button></div></div>
    <div class="cx-team-row"><span class="cx-team-row-label"><Glyph name="plug" size={14} /><span>MCP-Konnektoren<small>{scopedMcp ? 'Verbindungen für diese Rolle' : 'Dieser Anbieter übernimmt seine MCPs aus dem Kontoprofil.'}</small></span></span>{scopedMcp ? <Select label="MCP-Auswahl des Agenten" value={selectedAgent.mcpServers === undefined ? 'all' : selectedAgent.mcpServers.length ? 'selected' : 'none'} options={[{ value: 'all', label: 'Alle verfügbaren' }, { value: 'selected', label: 'Einzeln auswählen' }, { value: 'none', label: 'Keine' }]} onChange={value => editAgent({ mcpServers: value === 'all' ? undefined : value === 'none' ? [] : selectedAgent.mcpServers ?? [] })} /> : <span class="cx-team-count">Alle verbundenen MCPs</span>}</div>
    {scopedMcp && selectedAgent.mcpServers !== undefined && <div class="cx-team-checks cx-team-row-checks" aria-label="MCP-Konnektoren">{state.servers.filter(server => !server.providers?.length || server.providers.includes(selectedAgent.target.provider)).map(server => <label key={server.name}><input type="checkbox" checked={selectedAgent.mcpServers?.includes(server.name)} onChange={event => editAgent({ mcpServers: event.currentTarget.checked ? [...selectedAgent.mcpServers ?? [], server.name] : selectedAgent.mcpServers?.filter(name => name !== server.name) })} /><span>{server.title || server.name}</span></label>)}{!state.servers.length && <p>Keine MCP-Konnektoren eingerichtet.</p>}{selectedAgent.mcpServers.filter(name => !state.servers.some(server => server.name === name && (!server.providers?.length || server.providers.includes(selectedAgent.target.provider)))).map(name => <label key={name}><input type="checkbox" checked onChange={() => editAgent({ mcpServers: selectedAgent.mcpServers?.filter(value => value !== name) })} /><span>{name} <small>nicht verfügbar</small></span></label>)}</div>}
    <div class="cx-team-row cx-team-row-stack"><span class="cx-team-row-label"><Glyph name="sparkle" size={14} /><span>Skills<small>{selectedAgent.skillPaths.length} ausgewählt · werden dem Agenten mitgegeben</small></span></span>
      <div class="cx-team-checks" aria-label="Skills des Agenten">{state.skills.map(skill => <label key={skill.path} title={skill.path}><input type="checkbox" checked={selectedAgent.skillPaths.includes(skill.path)} onChange={event => editAgent({ skillPaths: event.currentTarget.checked ? [...selectedAgent.skillPaths, skill.path] : selectedAgent.skillPaths.filter(path => path !== skill.path) })} /><span>{skill.name}</span></label>)}{!state.skills.length && <p>Keine Skills verfügbar.</p>}{selectedAgent.skillPaths.filter(path => !state.skills.some(skill => skill.path === path)).map(path => <label key={path}><input type="checkbox" checked onChange={() => editAgent({ skillPaths: selectedAgent.skillPaths.filter(value => value !== path) })} /><span>{path.split('/').pop()} <small>nicht verfügbar</small></span></label>)}</div></div>
    {!solo && <div class="cx-team-agent-footer"><span><Glyph name="user" size={13} />{draft.agents.length} von {MAX_TEAM_AGENTS} Agenten</span><Button kind="ghost" icon="trash" disabled={draft.agents.length === 1} onClick={() => { const agents = draft.agents.filter(agent => agent.id !== selectedAgent.id).map(agent => ({ ...agent, dependsOn: agent.dependsOn.filter(id => id !== selectedAgent.id) })); edit({ agents }); setAgentId(agents[0]!.id); }}>Agent entfernen</Button></div>}
  </div>;

  const overviewRow = (team: AgentTeam) => {
    const run = runFor(team.id);
    const agent = team.agents[0];
    const sub = team.kind === 'agent'
      ? [agent?.role, agent && `${PROVIDERS[agent.target.provider] ?? agent.target.provider} · ${agent.target.account}`].filter(Boolean).join(' · ')
      : `${team.agents.length} ${team.agents.length === 1 ? 'Agent' : 'Agenten'}${team.description ? ` · ${team.description}` : ''}`;
    return <button class={`cx-team-list-row ${draft?.id === team.id ? 'selected' : ''}`} onClick={() => choose(team)} disabled={saving} key={team.id}>
      <span class="cx-team-tile"><Glyph name={team.kind === 'agent' && agent ? roleIcon(agent) : 'worktree'} size={16} /></span>
      <span class="cx-team-list-text"><strong>{team.name}</strong><small>{sub || 'Eigener Agent'}</small></span>
      <span class="cx-team-list-state">{run ? <><i class="cx-team-dot" />Arbeitet</> : draft?.id === team.id && dirty ? <><Glyph name="edit" size={13} />Entwurf</> : <><Glyph name="check" size={13} />Bereit</>}</span>
      <Glyph name="chevron" size={14} />
    </button>;
  };

  return <main class="cx-teams cx-agents cx-settings-mode" aria-label="Aktive Agenten">
    <div class="cx-teams-page">
      {view === 'overview' ? <>
        <div class="cx-teams-bar">
          <div class="cx-teams-seg" role="tablist" aria-label="Ansicht">{([['all', 'Alle', 'filter'], ['agents', 'Agenten', 'user'], ['teams', 'Teams', 'worktree']] as const).map(([value, text, icon]) => <button key={value} role="tab" aria-selected={filter === value} class={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}><Glyph name={icon} size={14} />{text}</button>)}</div>
          <div class="cx-teams-create"><Button kind="ghost" icon="user" onClick={onAccounts}>Konten verwalten</Button><Button icon="worktree" onClick={() => choose('new-team')} disabled={saving}>Team erstellen</Button><Button kind="primary" icon="plus" onClick={() => choose('new-agent')} disabled={saving}>Agent erstellen</Button></div>
        </div>
        <header class="cx-teams-header"><h1>Aktive Agenten</h1><p>Eigene Agenten erstellen oder ihre Fähigkeiten in Teams verbinden.</p></header>
        <label class="cx-teams-search"><Glyph name="search" size={15} /><input type="search" aria-label="Agenten und Teams suchen" placeholder="Agenten und Teams suchen" value={query} onInput={event => setQuery(event.currentTarget.value)} /></label>
        {notices}
        {!loaded ? <div class="cx-team-empty" role="status">Agenten und Teams werden geladen …</div> : <>
          {draft && (dirty || !savedTeam) && <section class="cx-team-section" aria-label="In Bearbeitung"><div class="cx-team-section-head"><h2><Glyph name="edit" size={15} />In Bearbeitung</h2></div>
            <div class="cx-team-group"><button class="cx-team-list-row" onClick={() => setView('profile')}><span class="cx-team-tile"><Glyph name={solo ? 'user' : 'worktree'} size={16} /></span><span class="cx-team-list-text"><strong>{draft.name || `Neuer ${label}`}</strong><small>{savedTeam ? 'Ungespeicherte Änderungen' : 'Noch nicht gespeichert'}</small></span><Glyph name="chevron" size={14} /></button></div></section>}
          <section class="cx-team-section" aria-label="Läuft gerade"><div class="cx-team-section-head"><h2><Glyph name="bolt" size={15} />Läuft gerade</h2></div>
            <div class="cx-team-group">{liveRuns.length ? liveRuns.map(run => { const profile = state.teams.find(team => team.id === run.teamId); const job = run.jobs.find(job => job.status === 'running'); return <div class="cx-team-list-row static" key={run.id}>
              <span class="cx-team-tile"><Glyph name={run.kind === 'agent' ? 'user' : 'worktree'} size={16} /></span>
              <span class="cx-team-list-text"><strong>{run.teamName}</strong><small>{job ? `${job.agentName}${job.activity ? ` · ${job.activity}` : ' arbeitet'}` : run.task}</small></span>
              <span class="cx-team-list-state"><i class="cx-team-dot" />Arbeitet</span>
              {profile && <Button kind="ghost" icon="chevron" onClick={() => choose(profile)}>Öffnen</Button>}
              <Button icon="stop" disabled={stopPending.includes(run.id)} onClick={() => { setStopPending(ids => [...ids, run.id]); vscode.postMessage({ kind: 'stopTeam', runId: run.id }); }}>{stopPending.includes(run.id) ? 'Stoppt …' : 'Stoppen'}</Button>
            </div>; }) : <div class="cx-team-list-row static empty"><span class="cx-team-tile"><Glyph name="clock" size={16} /></span><span class="cx-team-list-text"><strong>Kein Auftrag aktiv</strong><small>{orderedRuns.length ? `Zuletzt: ${orderedRuns[0]!.teamName} · ${STATUS[orderedRuns[0]!.status]}` : 'Noch kein Auftrag gestartet.'}</small></span></div>}</div></section>
          {filter !== 'agents' && <section class="cx-team-section" aria-label="Teams"><div class="cx-team-section-head"><h2><Glyph name="worktree" size={15} />Teams <span>{shownTeams.length}</span></h2></div>
            {shownTeams.length ? <div class="cx-team-group">{shownTeams.map(overviewRow)}</div> : <p class="cx-team-section-empty"><Glyph name="info" size={14} />{q ? 'Kein Team gefunden.' : 'Noch keine Teams.'}</p>}</section>}
          {filter !== 'teams' && <section class="cx-team-section" aria-label="Agenten"><div class="cx-team-section-head"><h2><Glyph name="user" size={15} />Agenten <span>{shownAgents.length}</span></h2></div>
            {shownAgents.length ? <div class="cx-team-group">{shownAgents.map(overviewRow)}</div> : <p class="cx-team-section-empty"><Glyph name="info" size={14} />{q ? 'Kein Agent gefunden.' : 'Noch keine eigenen Agenten.'}</p>}</section>}
          {runningChats.length > 0 && <section class="cx-team-section cx-team-other" aria-label="Weitere aktive Chats"><div class="cx-team-section-head"><h2><Glyph name="chat" size={15} />Weitere aktive Chats</h2></div><div class="cx-team-group">{runningChats.map(chat => <button class="cx-team-list-row" key={chat.id} onClick={() => onOpenConversation(chat.id)}><span class="cx-team-tile"><Glyph name="chat" size={16} /></span><span class="cx-team-list-text"><strong>{chat.title}</strong><small>Arbeitet</small></span><Glyph name="arrowUpRight" size={14} /></button>)}</div></section>}
        </>}
      </> : <>
        <div class="cx-teams-bar">
          <nav class="cx-teams-crumb" aria-label="Pfad"><button aria-label="Zur Übersicht" onClick={back}><Glyph name="back" size={14} />Aktive Agenten</button>{draft && !starterPicker && <><Glyph name="chevron" size={12} /><span>{draft.name || label}</span></>}</nav>
          <div class="cx-teams-create">
            <Button kind="ghost" icon="user" onClick={onAccounts}>Konten verwalten</Button>
            {draft && !starterPicker && savedTeam && <Button kind="ghost" icon="trash" onClick={() => setConfirmDelete(draft.id)} disabled={saving || !!deleting}>Löschen</Button>}
            {draft && !starterPicker && <Button kind="primary" icon="check" onClick={save} disabled={!dirty || saving || !!validation}>{saving ? 'Speichert …' : `${label} speichern`}</Button>}
          </div>
        </div>
        {starterPicker ? <section class="cx-agent-starters" aria-label="Agentenvorlagen">
          <header class="cx-teams-header"><h1>Wie soll dein Agent arbeiten?</h1><p>Beginne mit eigenen Anweisungen oder passe eine Rolle an. Konto, Modell und Werkzeuge legst du anschließend fest.</p></header>
          {notices}
          <div class="cx-team-group cx-agent-starter-grid"><button class="cx-agent-starter blank" onClick={() => createAgent()}><span class="cx-team-tile"><Glyph name="plus" size={16} /></span><span class="cx-team-list-text"><strong>Ohne Vorlage</strong><small>Aufgabe, Rolle und Anweisungen selbst festlegen.</small></span><Glyph name="chevron" size={14} /></button>
            {AGENT_STARTERS.map(starter => <article class="cx-agent-starter-wrap" key={starter.id}><button class="cx-agent-starter" onClick={() => createAgent(starter)}><span class="cx-team-tile"><Glyph name={roleIcon({ name: starter.name, role: starter.role })} size={16} /></span><span class="cx-team-list-text"><strong>{starter.name}</strong><small>{starter.description}</small></span></button>{starter.sourceUrl && <button class="cx-agent-starter-link" aria-label={`Grok-Beispiel für ${starter.name}`} onClick={() => vscode.postMessage({ kind: 'openExternal', url: starter.sourceUrl! })}>Grok-Beispiel<Glyph name="arrowUpRight" size={12} /></button>}</article>)}
          </div>
          <p class="cx-agent-starter-source"><Glyph name="info" size={14} />Eigene Cortex-Vorlagen, inspiriert von den veröffentlichten Grok-Bot-Anwendungsbeispielen. Alle Anweisungen sind editierbar.</p>
        </section> : draft && selectedAgent ? <div class={`cx-team-editor ${solo ? 'cx-solo-agent-editor' : ''}`} aria-label={`${label} bearbeiten`}>
          <header class="cx-teams-header cx-team-editor-heading"><div class="cx-team-title"><span class="cx-team-tile large"><Glyph name={solo ? roleIcon(selectedAgent) : 'worktree'} size={18} /></span><h1>{draft.name || `${label} bearbeiten`}</h1></div><p>{dirty ? 'Ungespeicherte Änderungen' : savedTeam ? 'Gespeichert' : 'Neuer Entwurf'}{draft.description ? ` · ${draft.description}` : ''}</p></header>
          {notices}
          {confirmDelete === draft.id && <div class="cx-team-unsaved" role="alert"><Glyph name="trash" size={16} /><span>„{draft.name}“ löschen? Die bisherigen Chats bleiben erhalten.</span><Button onClick={() => setConfirmDelete(undefined)}>Abbrechen</Button><Button kind="danger" disabled={!!deleting} onClick={() => { setDeleting(draft.id); vscode.postMessage({ kind: 'deleteTeam', id: draft.id, revision: state.revision }); }}>{deleting ? 'Löscht …' : `${label} löschen`}</Button></div>}

          <section class="cx-team-launch" aria-label={solo ? 'Agentenauftrag starten' : 'Teamauftrag starten'}>
            <textarea aria-label={solo ? 'Auftrag für den Agenten' : 'Auftrag für das Team'} rows={2} value={task} placeholder={solo ? 'Was soll dein Agent erledigen?' : 'Was soll das Team gemeinsam erledigen?'} onInput={event => { const value = event.currentTarget.value; retainedTasks[draft.id] = value; setTaskDrafts(values => ({ ...values, [draft.id]: value })); }} />
            <div><span><Glyph name={dirty || !savedTeam || unavailableAgents.length ? 'info' : 'check'} size={13} />{dirty || !savedTeam ? `Speichere ${solo ? 'den Agenten' : 'das Team'} vor dem Start.` : unavailableAgents.length ? `Konto für ${unavailableAgents.map(agent => agent.name).join(', ')} nicht verfügbar.` : solo ? 'Jeder Auftrag erhält einen eigenen Chat.' : 'Jeder Agent erhält einen eigenen Chat.'}</span><Button kind="primary" icon="arrowUp" disabled={!savedTeam || dirty || !task.trim() || starting || !!unavailableAgents.length || !!validation} onClick={start}>{starting ? 'Startet …' : `${label} starten`}</Button></div>
          </section>

          {profileRuns.length > 0 && <section class="cx-team-section cx-team-runs" aria-label="Aufträge"><div class="cx-team-section-head"><h2><Glyph name="clock" size={15} />Aufträge</h2></div>{profileRuns.map(runArticle)}</section>}

          <section class="cx-team-section" aria-label="Allgemein"><div class="cx-team-section-head"><h2><Glyph name="gearSmall" size={15} />Allgemein</h2></div>
            <div class="cx-team-group cx-team-form">
              <label class="cx-team-row"><span class="cx-team-row-label"><Glyph name={solo ? 'user' : 'worktree'} size={14} />{solo ? 'Agentenname' : 'Teamname'}</span><input aria-label={solo ? 'Agentenname' : 'Teamname'} value={draft.name} maxLength={solo ? 80 : 100} onInput={event => solo ? editAgent({ name: event.currentTarget.value }) : edit({ name: event.currentTarget.value })} /></label>
              <div class="cx-team-row"><span class="cx-team-row-label"><Glyph name="folder" size={14} />Projekt</span><Select label={solo ? 'Projekt des Agenten' : 'Projekt des Teams'} value={draft.projectPath ?? ''} options={[{ value: '', label: 'Ohne Projekt' }, ...projects.map(project => ({ value: project.path, label: project.name, hint: project.missing ? 'Ordner nicht verfügbar' : undefined, disabled: project.missing })), ...(draft.projectPath && !projects.some(project => project.path === draft.projectPath) ? [{ value: draft.projectPath, label: draft.projectPath, hint: 'Projekt nicht verfügbar' }] : [])]} onChange={projectPath => edit({ projectPath: projectPath || undefined })} /></div>
              <label class="cx-team-row"><span class="cx-team-row-label"><Glyph name="info" size={14} />Beschreibung</span><input aria-label="Beschreibung" value={draft.description} maxLength={1000} placeholder={solo ? 'Wofür setzt du diesen Agenten ein?' : 'Wofür setzt du dieses Team ein?'} onInput={event => edit({ description: event.currentTarget.value })} /></label>
              {(!solo || draft.instructions) && <label class="cx-team-row cx-team-row-stack"><span class="cx-team-row-label"><Glyph name="doc" size={14} /><span>{solo ? 'Zusätzliche Anweisungen' : 'Gemeinsame Anweisungen'} <small>Markdown</small></span></span><textarea aria-label={`${solo ? 'Zusätzliche Anweisungen' : 'Gemeinsame Anweisungen'} Markdown`} rows={3} value={draft.instructions} maxLength={100000} placeholder="Ziel, gemeinsame Regeln und gewünschtes Ergebnis …" onInput={event => edit({ instructions: event.currentTarget.value })} /></label>}
            </div>
          </section>

          {solo ? <section class="cx-team-section cx-team-members" aria-label="Agent einrichten"><div class="cx-team-section-head"><h2><Glyph name="settings" size={15} />Einstellungen</h2></div><div class="cx-team-group cx-team-form">{roleEditor}</div></section>
            : <section class="cx-team-section cx-team-members" aria-label="Agenten im Team">
              <div class="cx-team-section-head"><h2><Glyph name="layers" size={15} />Aufstellung</h2>
                <Select label="Gespeicherten Agenten hinzufügen" value="" placeholder="Gespeicherten Agenten hinzufügen" disabled={!savedAgents.length || draft.agents.length >= MAX_TEAM_AGENTS} options={savedAgents.map(profile => ({ value: profile.id, label: profile.name, hint: profile.agents[0]?.role }))} onChange={addSavedAgent} />
                <Button icon="plus" disabled={draft.agents.length >= MAX_TEAM_AGENTS} onClick={() => addToStage(0)}>Agent hinzufügen</Button></div>
              <p class="cx-team-section-note"><Glyph name="info" size={14} />Rollen einer Stufe arbeiten nebeneinander. Jede Stufe erhält die Ergebnisse, die sie übernehmen soll. Gespeicherte Agenten kommen als eigene Kopie ins Team.</p>
              {Array.from({ length: stageCount }, (_, stage) => <div class="cx-team-stage" key={stage}>
                <div class="cx-team-stage-head"><Glyph name="layers" size={14} /><strong>Stufe {stage + 1}</strong><span>{stage === 0 ? 'startet sofort' : `nach Stufe ${stage}`}</span><button class="cx-team-stage-add" aria-label={`Agent in Stufe ${stage + 1} hinzufügen`} disabled={draft.agents.length >= MAX_TEAM_AGENTS} onClick={() => addToStage(stage)}><Glyph name="plus" size={13} />Agent</button></div>
                <div class="cx-team-group" role="tablist" aria-label={`Agenten in Stufe ${stage + 1}`}>{atLevel(stage).map(agent => {
                  const selected = selectedAgent.id === agent.id;
                  return <Fragment key={agent.id}>
                    <button role="tab" aria-selected={selected} aria-expanded={selected} class={`cx-team-list-row ${selected ? 'selected' : ''}`} key={agent.id} onClick={() => setAgentId(agent.id)}>
                      <span class="cx-team-tile"><Glyph name={roleIcon(agent)} size={16} /></span>
                      <span class="cx-team-list-text"><strong>{agent.name || 'Unbenannter Agent'}</strong><small>{[agent.role, agent.target.account && `${PROVIDERS[agent.target.provider] ?? agent.target.provider} · ${agent.target.account}`].filter(Boolean).join(' · ') || 'Noch nicht eingerichtet'}</small></span>
                      <span class="cx-team-list-state"><Glyph name={ACCESS_ICON[agent.permissionMode]} size={13} />{ACCESS_LABEL[agent.permissionMode]}</span>
                      <Glyph name={selected ? 'chevronDown' : 'chevron'} size={14} />
                    </button>
                    {selected && roleEditor}
                  </Fragment>;
                })}</div>
              </div>)}
              <button class="cx-team-new-stage" disabled={draft.agents.length >= MAX_TEAM_AGENTS} onClick={() => addToStage(stageCount)}><Glyph name="plus" size={14} />Neue Stufe</button>
            </section>}

          <AgentAutomationEditor team={draft} saved={savedTeam} runtime={state.automations} dirty={dirty} onChange={automation => edit({ automation })} />
          {validation && !automationFormError(draft.automation) && <p class="cx-team-inline-note"><Glyph name="warn" size={14} />{validation}</p>}
        </div> : <div class="cx-team-empty"><Glyph name="user" size={28} /><h2>Kein Profil geöffnet</h2><p>Wähle in der Übersicht einen Agenten oder ein Team.</p><Button icon="back" onClick={back}>Zur Übersicht</Button></div>}
      </>}
    </div>
  </main>;
}
