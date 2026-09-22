/* Browser-only team host for interaction tests. No CLI, filesystem, account
   login, or provider is used. This script is never part of the app bundle. */
(() => {
  const emitTeam = message => window.dispatchEvent(new MessageEvent('message', { data: structuredClone(message) }));
  const empty = new URLSearchParams(location.search).get('teams') === 'empty';
  const persistentAutomationTest = new URLSearchParams(location.search).get('automation-test') === '1';
  const state = {
    revision: 1,
    teams: empty ? [] : [{
      id: 'research-team', name: 'Recherche und Redaktion', description: 'Quellen prüfen und ein verständliches Ergebnis schreiben.',
      instructions: 'Belege Aussagen und benenne offene Fragen.', projectPath: '/demo/cortex', updatedAt: Date.now(),
      agents: [
        { id: 'researcher', name: 'Recherche', role: 'Quellen und Fakten', instructions: '# Recherche\nPrüfe Primärquellen und übergib die Belege.', target: { provider: 'claude', account: 'privat', model: 'claude-sonnet-5' }, permissionMode: 'safe', mcpServers: ['context7'], skillPaths: ['/demo/skills/research/SKILL.md'], dependsOn: [] },
        { id: 'writer', name: 'Redaktion', role: 'Ergebnis aufbereiten', instructions: '# Redaktion\nSchreibe eine klare Zusammenfassung auf Basis der Recherche.', target: { provider: 'codex', account: 'privat', model: 'gpt-6-astra' }, permissionMode: 'edits', skillPaths: [], dependsOn: ['researcher'] },
      ],
    }],
    runs: [],
    servers: [{ name: 'context7', title: 'Context7' }, { name: 'documents', title: 'Dokumente', providers: ['claude', 'codex'] }],
    skills: [{ name: 'Recherche', path: '/demo/skills/research/SKILL.md' }, { name: 'Dokumente', path: '/demo/skills/documents/SKILL.md' }],
    automations: { profiles: {}, owner: true },
  };
  if (persistentAutomationTest) {
    const saved = sessionStorage.getItem('cortex-automation-test-state');
    if (saved) Object.assign(state, JSON.parse(saved));
  }
  const push = () => {
    state.automations.profiles = Object.fromEntries(state.teams.filter(team => team.automation).map(team => [team.id, {
      ...state.automations.profiles[team.id],
      nextRunAt: team.automation.schedule?.enabled ? Date.now() + 3600000 : undefined,
      webhookUrl: team.automation.webhook?.enabled ? `http://127.0.0.1:47831/hooks/${team.id}` : undefined,
    }]));
    if (persistentAutomationTest) sessionStorage.setItem('cortex-automation-test-state', JSON.stringify(state));
    emitTeam({ kind: 'teamsState', state });
  };
  const error = message => emitTeam({ kind: 'teamError', message });
  const handoffs = [];
  const deferredSaveAcks = [];
  const profileSignature = team => JSON.stringify({ ...team, updatedAt: 0 }, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
  const selectNext = run => {
    const team = state.teams.find(team => team.id === run.teamId);
    if (!team || run.status !== 'running') return;
    const waiting = run.jobs.find(job => job.status === 'waiting' && team.agents.find(agent => agent.id === job.agentId).dependsOn.every(id => run.jobs.find(upstream => upstream.agentId === id)?.status === 'completed'));
    if (waiting) {
      const agent = team.agents.find(agent => agent.id === waiting.agentId);
      const upstream = run.jobs.filter(job => agent.dependsOn.includes(job.agentId));
      waiting.status = 'running'; waiting.startedAt = Date.now(); waiting.conversationId = 'team-chat-' + waiting.agentId;
      waiting.activity = upstream.length ? 'Übergabe von ' + upstream.map(job => job.agentName).join(', ') + ' wird verarbeitet.' : 'Auftrag wird bearbeitet.';
      handoffs.push({ agentId: agent.id, results: upstream.map(job => job.result) });
    } else if (run.jobs.every(job => job.status === 'completed')) { run.status = 'completed'; run.finishedAt = Date.now(); }
  };
  window.__cortexTeams = {
    state, handoffs, profileSignature, exports: [], copiedWebhooks: [],
    importText: '# Importierte Rolle\nPrüfe das Ergebnis und dokumentiere offene Punkte.',
    failNextSave: false,
    deferSaveAck: false,
    acknowledgeSaves() { deferredSaveAcks.splice(0).forEach(id => emitTeam({ kind: 'teamSaved', id })); },
    updateProfile(teamId, changes) {
      const existing = state.teams.find(team => team.id === teamId);
      if (!existing) throw new Error('Fixture profile missing');
      state.teams = state.teams.map(team => team.id === teamId ? { ...team, ...structuredClone(changes), updatedAt: Date.now() } : team);
      state.revision++; push();
    },
    triggerAutomation(teamId, kind) {
      const team = state.teams.find(team => team.id === teamId);
      if (!team?.automation?.[kind]?.enabled) throw new Error('Fixture trigger is paused');
      if (state.runs.some(run => run.teamId === teamId && run.status === 'running')) {
        state.automations.profiles[teamId].lastEvent = { at: Date.now(), source: kind, status: 'skipped', message: 'Es läuft bereits ein Auftrag.' };
      } else {
        const run = { id: 'run-' + crypto.randomUUID(), teamId, teamName: team.name, kind: team.kind ?? 'team', task: team.automation.task, source: { kind, id: 'trigger-' + crypto.randomUUID() }, status: 'running', startedAt: Date.now(), jobs: team.agents.map(agent => ({ agentId: agent.id, agentName: agent.name, status: 'waiting' })) };
        state.runs.push(run); selectNext(run);
        state.automations.profiles[teamId].lastEvent = { at: Date.now(), source: kind, status: 'started', runId: run.id };
      }
      state.revision++; push();
    },
    completeCurrent(runId, result = 'Geprüftes Ergebnis mit Belegen.') {
      const run = state.runs.find(run => run.id === runId);
      const job = run?.jobs.find(job => job.status === 'running');
      if (!job) throw new Error('No running fixture job');
      job.status = 'completed'; job.result = result; job.finishedAt = Date.now(); job.activity = '';
      selectNext(run); state.revision++; push();
    },
  };
  window.addEventListener('preview:host', event => {
    const message = event.detail;
    if (message.kind === 'getTeams') push();
    if (message.kind === 'saveTeam') {
      if (window.__cortexTeams.failNextSave) { window.__cortexTeams.failNextSave = false; error('Das Team konnte nicht gespeichert werden. Bitte erneut versuchen.'); return; }
      if (message.revision !== state.revision) { error('Das Team wurde inzwischen geändert.'); push(); return; }
      const existing = state.teams.find(team => team.id === message.team.id);
      if (message.baseSignature !== undefined && (!existing || profileSignature(existing) !== message.baseSignature)) { error('Dieses Profil wurde inzwischen an anderer Stelle geändert. Lade den gespeicherten Stand, bevor du erneut speicherst.'); push(); return; }
      const next = structuredClone(message.team);
      if (next.kind === 'agent' && (next.agents.length !== 1 || next.agents[0].dependsOn.length)) { error('Ein einzelner Agent braucht genau eine Rolle ohne Übergaben.'); return; }
      if ((next.automation?.schedule?.enabled || next.automation?.webhook?.enabled) && !next.automation.task.trim()) { error('Ein automatischer Auftrag fehlt.'); return; }
      if (next.automation?.schedule?.enabled && next.automation.schedule.cron.trim().split(/\s+/).length !== 5) { error('Der Cron-Ausdruck braucht fünf Felder.'); return; }
      next.updatedAt = Date.now();
      state.teams = [...state.teams.filter(team => team.id !== next.id), next]; state.revision++;
      push();
      if (window.__cortexTeams.deferSaveAck) deferredSaveAcks.push(next.id);
      else emitTeam({ kind: 'teamSaved', id: next.id });
    }
    if (message.kind === 'deleteTeam') {
      if (message.revision !== state.revision) { error('Das Team wurde inzwischen geändert.'); push(); return; }
      if (state.runs.some(run => run.teamId === message.id && run.status === 'running')) { error('Stoppe zuerst den laufenden Teamauftrag.'); return; }
      state.teams = state.teams.filter(team => team.id !== message.id); state.revision++; push();
    }
    if (message.kind === 'startTeam') {
      const team = state.teams.find(team => team.id === message.teamId);
      if (!team || !message.task.trim()) { error('Team oder Auftrag fehlt.'); return; }
      const run = { id: 'run-' + crypto.randomUUID(), teamId: team.id, teamName: team.name, kind: team.kind ?? 'team', task: message.task, status: 'running', startedAt: Date.now(), jobs: team.agents.map(agent => ({ agentId: agent.id, agentName: agent.name, status: 'waiting' })) };
      state.runs.push(run); selectNext(run); state.revision++; push();
    }
    if (message.kind === 'stopTeam') {
      const run = state.runs.find(run => run.id === message.runId);
      if (!run) return;
      run.status = 'cancelled'; run.finishedAt = Date.now();
      run.jobs.forEach(job => { if (job.status === 'running' || job.status === 'waiting') { job.status = 'cancelled'; job.finishedAt = Date.now(); } });
      state.revision++; push();
    }
    if (message.kind === 'importAgentMarkdown') emitTeam({ kind: 'agentMarkdown', requestId: message.requestId, text: window.__cortexTeams.importText });
    if (message.kind === 'exportAgentMarkdown') window.__cortexTeams.exports.push({ name: message.name, text: message.text });
    if (message.kind === 'copyTeamWebhook') {
      if (!state.teams.some(team => team.id === message.teamId && team.automation?.webhook?.enabled)) { error('Aktiviere und speichere zuerst den Webhook.'); return; }
      window.__cortexTeams.copiedWebhooks.push(message.teamId);
      emitTeam({ kind: 'teamAutomationNotice', message: 'Webhook-Aufruf kopiert.' });
    }
  });
  // The real preview entry may have mounted before this fixture script loaded.
  if ((window.__hostMessages || []).some(message => message.kind === 'getTeams')) push();
})();
