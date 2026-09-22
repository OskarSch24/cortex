/* Browser-only fixtures. Never included in the app bundle; no credentials or provider requests. */
const query = new URLSearchParams(location.search);
/** Deine Nachrichten im offenen Chat, damit „Zurückgehen“ ihren Text ins Eingabefeld legen kann. */
const echoes = [];
const emit = msg => {
  if (msg.kind === 'conversationReset') echoes.length = 0;
  if (msg.kind === 'userEcho') echoes.push(msg);
  // Der echte Host schickt über postMessage immer eine Kopie. Ohne das hier
  // reicht die Attrappe ihre eigenen, später veränderten Objekte weiter — die
  // Oberfläche sähe dieselbe Liste und hätte keinen Grund, neu zu zeichnen.
  window.dispatchEvent(new MessageEvent('message', { data: structuredClone(msg) }));
};
const project = { name: 'Studio Website', path: '/demo/studio-website' };
const projects = [
  { name: 'Cortex', path: '/demo/cortex', pinned: true },
  { name: 'Nordwind Console Build', path: '/demo/amq-console', pinned: true, missing: true },
  project,
  { name: 'Design System', path: '/demo/design-system', folders: ['/demo/design-system', '/Users/demo/Documents/Marken'] },
  { name: 'Exokortex', path: '/demo/exokortex' },
  { name: 'Theologische Studien', path: '/demo/theologie' },
  { name: 'Nordwind Studio', path: '/demo/nordwind', missing: true },
];
const profiles = query.get('accounts') === 'empty' ? [] : [
  { id: 'claude-private', provider: 'claude', label: 'privat', identity: 'oskar@privat.example', authState: 'ok', authMode: 'managed-home', available: true, models: [{ id: 'opus', label: 'Claude Opus' }, { id: 'sonnet', label: 'Claude Sonnet' }], usage: [{ label: '5 Stunden', utilizationPct: 24, resetAt: Date.now() + 3600e3 }, { label: 'Woche', utilizationPct: 18 }] },
  { id: 'claude-work', provider: 'claude', label: 'studio', identity: 'oskar@studio.example', authState: 'ok', authMode: 'managed-home', available: true, models: [{ id: 'opus', label: 'Claude Opus' }, { id: 'sonnet', label: 'Claude Sonnet' }], usage: [{ label: '5 Stunden', utilizationPct: 46 }, { label: 'Woche', utilizationPct: 32 }] },
  { id: 'codex-private', provider: 'codex', label: 'privat', identity: 'oskar@privat.example', authState: 'ok', authMode: 'managed-home', available: true, models: [{ id: 'gpt', label: 'Codex' }], usage: [{ label: 'Woche', utilizationPct: 12 }] },
  { id: 'codex-work', provider: 'codex', label: 'geschäftlich', identity: 'oskar@studio.example', authState: 'ok', authMode: 'managed-home', available: true, models: [{ id: 'gpt', label: 'Codex' }], usage: [{ label: 'Woche', utilizationPct: 91 }] },
  { id: 'grok-work', provider: 'grok', label: 'studio', identity: 'oskar@studio.example', authState: 'expired', authMode: 'managed-home', available: false, models: [{ id: 'grok', label: 'Grok' }], usage: [] },
];
// Bildmodus: der Host legt das größere Konto nach vorn — hier „geschäftlich“.
const imageRank = { 'codex-work': 0, 'codex-private': 1, 'grok-work': 0 };
for (const account of profiles) {
 if (account.id in imageRank) account.imageRank = imageRank[account.id];
 if (account.provider === 'claude') account.models = [{id:'claude-sonnet-5',label:'Sonnet 5'},{id:'claude-opus-5',label:'Opus 5'},{id:'claude-fable-5-1',label:'Fable 5.1'}];
 if (account.provider === 'codex') account.models = [{id:'gpt-5.6-terra',label:'GPT-5.6 Terra'},{id:'gpt-5.6-sol',label:'GPT-5.6 Sol'},{id:'gpt-6-astra',label:'GPT-6 Astra'}];
}
const widgetDemo = query.get('scenario') === 'widgets';
let activeId = query.get('scenario') === 'conversation' || widgetDemo ? 'site' : 'new';
let list = [
  { id: 'new', title: 'Neue Aufgabe', projectPath: project.path, updatedAt: Date.now() },
  { id: 'site', title: 'Neue Startseite entwickeln', projectPath: project.path, updatedAt: Date.now() - 3600e3 },
  { id: 'audit', title: 'Mobile Navigation verbessern', projectPath: project.path, updatedAt: Date.now() - 3e6, running: true },
  { id: 'copy', title: 'Texte und Seitenstruktur prüfen', projectPath: project.path, updatedAt: Date.now() - 5e6 },
  { id: 'tokens', title: 'Farben und Typografie abstimmen', projectPath: '/demo/design-system', updatedAt: Date.now() - 6e6 },
  { id: 'components', title: 'Komponenten dokumentieren', projectPath: '/demo/design-system', updatedAt: Date.now() - 9e6 },
  { id: 'icon', title: 'Überarbeite Cortex App Icon', projectPath: '/demo/cortex', updatedAt: Date.now() - 1e6, running: true },
  { id: 'ide', title: 'Cortex IDE-Design modernisieren', projectPath: '/demo/cortex', updatedAt: Date.now() - 2e6 },
  { id: 'flow', title: 'Workflow-Canvas für politische Analyse', projectPath: '/demo/exokortex', updatedAt: Date.now() - 4e6 },
  { id: 'loose1', title: 'Kurze Frage zu Regex', updatedAt: Date.now() - 8e6 },
  { id: 'loose2', title: 'Notiz: Ordnerstruktur überdenken', updatedAt: Date.now() - 12e6 },
];
const targets = { site: { provider: 'claude', account: 'studio', model: 'opus' }, tokens: { provider: 'codex', account: 'privat', model: 'gpt' } };
function sendWorkspace(directory = '') {
  const root = list.find(c => c.id === activeId)?.projectPath ?? project.path;
  emit({ kind: 'workspace', conversationId: activeId, workspace: { root, directory, branch: 'main', files: directory ? [
    { name: 'App.tsx', path: 'src/App.tsx', directory: false }, { name: 'index.css', path: 'src/index.css', directory: false },
  ] : [
    { name: 'public', path: 'public', directory: true }, { name: 'src', path: 'src', directory: true }, { name: 'AGENTS.md', path: 'AGENTS.md', directory: false }, { name: 'index.html', path: 'index.html', directory: false }, { name: 'package.json', path: 'package.json', directory: false }, { name: 'README.md', path: 'README.md', directory: false }, { name: 'tsconfig.json', path: 'tsconfig.json', directory: false },
  ], changes: [{ path: 'src/App.tsx', status: 'M' }, { path: 'src/index.css', status: 'M' }] } });
}
const queueDemo = query.get('scenario') === 'queue';
/* Excalidraw: der Host bewahrt die Zeichnung je Chat auf; hier im Speicher,
   für den Test unter window.__cortexCanvas einsehbar. Ein `/excalidraw …`
   bekommt eine Antwort, die den Block Stück für Stück schreibt. */
const canvasDemo = query.get('scenario') === 'canvas';
const canvasStore = window.__cortexCanvas = { scenes: {}, visible: {}, exports: [], answers: [] };
const CANVAS_ANSWERS = {
  mindmap: { title: 'Wasserkreislauf', layout: 'mindmap', root: { label: 'Wasserkreislauf', children: [
    { label: 'Verdunstung', children: ['Meere und Seen', 'Pflanzen (Transpiration)'] },
    { label: 'Kondensation', children: ['Wolkenbildung', 'Tau und Nebel'] },
    { label: 'Niederschlag', children: ['Regen', 'Schnee', 'Hagel'] },
    { label: 'Abfluss', children: ['Flüsse', 'Grundwasser'] },
  ] } },
  flow: { title: 'Bestellung', layout: 'flow', direction: 'down', nodes: [
    { id: 'start', label: 'Bestellung eingegangen', shape: 'ellipse', color: 'green' },
    { id: 'lager', label: 'Artikel auf Lager?', shape: 'diamond', color: 'yellow' },
    { id: 'versand', label: 'Versenden', group: 'lager' }, { id: 'nach', label: 'Nachbestellen', group: 'einkauf' },
    { id: 'ende', label: 'Zugestellt', shape: 'ellipse', color: 'blue' },
  ], edges: [['start', 'lager'], { from: 'lager', to: 'versand', label: 'ja' }, { from: 'lager', to: 'nach', label: 'nein' }, { from: 'nach', to: 'lager', dashed: true }, ['versand', 'ende']],
  groups: [{ id: 'lager', label: 'Lager' }, { id: 'einkauf', label: 'Einkauf' }] },
};
CANVAS_ANSWERS.map = { title: 'Deutschland', layout: 'map', region: ['Deutschland'], neighbors: true, highlight: [{ name: 'Bayern', color: 'blue' }, { name: 'Hamburg', color: 'green' }],
  places: [{ label: 'Berlin', lat: 52.52, lon: 13.405, size: 'large' }, { label: 'Hamburg', lat: 53.551, lon: 9.993 }, { label: 'München', lat: 48.137, lon: 11.575 }, { label: 'Köln', lat: 50.938, lon: 6.96 }],
  routes: [{ from: 'Hamburg', to: 'München', label: 'ICE', dashed: true }] };
function canvasAnswer(text) {
  const m = 'canvas-' + Date.now();
  const spec = /karte\b/i.test(text) ? CANVAS_ANSWERS.map : /ablauf|prozess|flow/i.test(text) ? CANVAS_ANSWERS.flow : { ...CANVAS_ANSWERS.mindmap, ...(/ergänz|add/i.test(text) ? { mode: 'add' } : {}) };
  const full = 'Hier ist die Übersicht auf der Zeichenfläche:\n\n```cortex-excalidraw\n' + JSON.stringify(spec, null, 1) + '\n```\n\nSag Bescheid, wenn ein Ast fehlt.';
  const cut = [Math.floor(full.length * 0.3), Math.floor(full.length * 0.7), full.length];
  let at = 0;
  cut.forEach((end, i) => setTimeout(() => {
    emit({ kind: 'delta', messageId: m, text: full.slice(at, end) }); at = end;
    if (i === cut.length - 1) { emit({ kind: 'done', messageId: m, durationMs: 3000, metered: false, at: Date.now() }); emit({ kind: 'busy', running: false }); }
  }, 120 * (i + 1)));
  emit({ kind: 'routing', messageId: m, target: { provider: 'claude', account: 'privat', model: 'claude-opus-5' }, reason: 'Vorschau' });
}
const queueRows = new Map();
const queuePaused = new Map();
const queueRunning = new Set();
const previewImage = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="#171717"/><path d="M8 42h44M8 30h36M8 18h28" stroke="#888" stroke-width="4"/></svg>');
if (queueDemo) {
  activeId = 'site'; queueRunning.add('site');
  queueRows.set('site', [
    {id:'q1',text:'Bitte die Bar mit Punkten um die Power zu spiegeln',canSteer:true,attachments:[{path:'/demo/screenshot.png',name:'Screenshot.png',preview:previewImage}]},
    {id:'q2',text:'Solche Benachrichtigungen raus.',canSteer:true,attachments:[{path:'/demo/screenshot2.png',name:'Hinweis.png',preview:previewImage}]},
    {id:'q3',text:'Das kann weg.',canSteer:true,attachments:[]},
    // Eine Nachricht, die nicht in den laufenden Auftrag darf: die Schaltfläche
    // ist aus und muss den Grund nennen.
    {id:'q4',text:'Alle Felder mit einem Klick außerhalb schließen.',canSteer:false,steerReason:'Diese Nachricht hat eine andere Reasoning-Stärke als der laufende Auftrag. Sie geht automatisch raus, sobald der laufende Auftrag fertig ist.',attachments:[]},
  ]);
}
function sendConnectors() {
  emit({ kind: 'connectors', path: '~/.cortex/mcp.json',
    servers: [
      { name: 'context7', remote: false, target: 'npx -y @upstash/context7-mcp' },
      { name: 'documents', remote: true, target: 'https://mcp.example.com/documents', providers: ['claude', 'codex'] },
    ],
    accounts: [
      { provider: 'claude', label: 'privat' },
      { provider: 'claude', label: 'studio' },
      { provider: 'codex', label: 'privat' },
      { provider: 'grok', label: 'studio' },
    ] });
}
/* Plugins: eine erfundene, aber realistisch geformte mcp.json. Zwei Orte, ein
   selbst eingetragener Server und ein Eintrag mit leerem Schlüssel — damit im
   Test auch „Einrichtung abschließen“ und „Importierte Plugins“ vorkommen. */
const pluginServers = {
  projekt: {
    figma: { url: 'https://mcp.figma.com/mcp' },
    'brave-search': { command: 'npx', args: ['-y', '@brave/brave-search-mcp-server'], env: { BRAVE_API_KEY: '' } },
    youtube: { command: 'npx', args: ['-y', 'youtube-data-mcp-server'], env: { YOUTUBE_API_KEY: '' } },
    memory: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
    'chrome-devtools': { command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest'] },
    sentry: { url: 'https://mcp.sentry.dev/mcp' },
    documents: { url: 'https://mcp.example.com/documents', providers: ['claude', 'codex'] },
  },
  persoenlich: { context7: { url: 'https://mcp.context7.com/mcp' } },
};
/* Was der Host über Verbindungen weiß: ein verbundenes Anmelde-Plugin, ein
   lokales mit Werkzeugen, eines, das nicht antwortet, und eines ohne Schlüssel. */
const hourAgo = Date.now() - 3600e3;
const pluginLive = {
  credentials: {
    sentry: { fields: [], oauth: { connectedAt: hourAgo, refreshable: true } },
  },
  connections: {
    // Figma läuft über die CLIs selbst: eine Zeile je Konto (siehe agentLogin.ts im Host).
    figma: { status: 'verbunden', checkedAt: Date.now() - 120e3,
      tools: [{ name: 'get_design_context', description: 'Liest einen Rahmen samt Maßen.' }, { name: 'get_screenshot' }, { name: 'get_variable_defs', description: 'Liest die Variablen einer Datei.' }],
      clis: [
        { provider: 'claude', label: 'Business', account: 'acc-claude', state: 'verbunden', detail: 'Claude Code ist angemeldet und sieht 3 Werkzeuge.' },
        { provider: 'codex', label: 'Side-Hustle', account: 'acc-codex', state: 'fehler', detail: 'Codex verlangt eine eigene Anmeldung.' },
        { provider: 'grok', label: 'Privat', account: 'acc-grok', state: 'eingetragen', detail: 'Noch nicht geprüft — Grok nutzt den Figma-Konnektor seines Kontos.' },
      ] },
    'chrome-devtools': { status: 'verbunden', checkedAt: Date.now() - 60e3, server: { name: 'chrome_devtools', title: 'Chrome DevTools MCP server', version: '1.9.0' },
      tools: ['click', 'navigate_page', 'list_console_messages', 'list_network_requests', 'performance_start_trace', 'take_screenshot'].map(name => ({ name })) },
    sentry: { status: 'fehler', checkedAt: Date.now() - 30e3, message: 'Der Server hat mit HTTP 503 geantwortet.', detail: 'upstream connect error' },
  },
  logins: {},
  disabled: [],
};
const OAUTH_PLUGINS = new Set(['figma', 'sentry', 'vercel', 'notion', 'linear', 'canva', 'youtube-kanal', 'google-calendar', 'gmail', 'google-drive', 'hubspot']);
/* Ein eigener OAuth-Client, wie der Host ihn meldet: nur Wiedererkennung, kein Secret. */
function fixtureClient(id, client) {
  pluginLive.credentials = { ...pluginLive.credentials, [id]: { ...(pluginLive.credentials[id] || { fields: [] }), client } };
  sendPluginLive();
  emit({ kind: 'pluginProgress', id, ok: true, message: 'OAuth-Client' + (client.fileName ? ' aus ' + client.fileName : '') + ' hinterlegt.' });
}
const sendPluginLive = () => emit({ kind: 'pluginLive', ...pluginLive });
const pluginSkills = ['figma-use', 'figma-code-connect', 'figma-design-to-code'];
function sendPlugins() {
  emit({ kind: 'plugins',
    scopes: [
      { id: 'projekt', path: '/demo/studio-website/.cortex/mcp.json', exists: true, servers: pluginServers.projekt },
      { id: 'persoenlich', path: '~/.cortex/mcp.json', exists: true, servers: pluginServers.persoenlich },
    ],
    builtIn: {
      name: 'database-studio', title: 'Vektor',
      description: 'Datenbanken in Cortex öffnen und abfragen.',
      target: 'node ~/dev/Database System/studio-mcp/src/database-studio.js',
      running: true, sessions: 2, overridden: false,
    },
    skills: pluginSkills,
    // Wie auf einem Mac, auf dem Xcode noch in Downloads liegt.
    apps: { xcode: { ok: false, detail: 'Xcode liegt noch unter /Users/demo/Downloads. Zieh es nach Programme und wähle es danach im Terminal mit „sudo xcode-select -s /Applications/Xcode.app“.' } },
    accounts: [
      { provider: 'claude', label: 'privat' },
      { provider: 'claude', label: 'studio' },
      { provider: 'codex', label: 'privat' },
      { provider: 'grok', label: 'studio', error: 'Profil nicht beschreibbar' },
    ],
    ...pluginLive });
}
function sendQueue() { emit({kind:'messageQueue',conversationId:activeId,items:queueRows.get(activeId)||[],paused:queuePaused.get(activeId)||false,pauseReason:queuePaused.get(activeId)?'stopped':undefined}); }
function conversation(id) {
  activeId = id; emit({ kind: 'conversationReset' });
  emit({ kind: 'conversations', list, activeId });
  emit({ kind: 'pinnedTarget', target: targets[id] ?? { provider: 'claude', account: 'privat', model: 'claude-opus-5' }, standard: !targets[id] }); sendWorkspace();
  if (queueDemo) { sendQueue(); emit({kind:'busy',running:queueRunning.has(id)}); }
  if (id.startsWith('new')) { emit({ kind: 'conversationReady' }); return; }
  if (widgetDemo && id === 'site') { widgetConversation(); return; }
  const m = 'message-' + id;
  const long = Array.from({ length: 26 }, (_, i) => i === 0
    ? 'Ich bin gerade dabei, Ideen dafür zu sammeln, wie ich die Startseite weiter ausbauen kann. Die bestehenden Informationen sollen erhalten bleiben.'
    : `Punkt ${i}: Die Projekte sollen im Mittelpunkt stehen, die Navigation ruhig bleiben und auch auf kleinen Bildschirmen gut funktionieren.`).join('\n');
  emit({ kind: 'userEcho', text: long, at: Date.now() - 26 * 3600e3 });
  emit({ kind: 'routing', messageId: m, target: targets[id] || { provider: 'claude', account: 'studio', model: 'sonnet' }, reason: 'Für diese Aufgabe ausgewählt' });
  emit({ kind: 'delta', messageId: m, text: 'Ich ordne deine Beschreibung in Themenbereiche und prüfe gezielt die Gestaltung der bestehenden Website, damit die neue Startseite dazu passt.' });
  emit({ kind: 'toolUse', messageId: m, name: 'Bash', detail: "pwd; rg --files -g 'AGENTS.md' -g 'package.json' -g 'index.html'", action: 'run' });
  emit({ kind: 'toolUse', messageId: m, name: 'Skill', detail: 'frontend-design', action: 'other' });
  emit({ kind: 'toolUse', messageId: m, name: 'Grep', detail: '"Startseite|Projekte" in README.md', action: 'search' });
  emit({ kind: 'toolUse', messageId: m, name: 'Read', detail: 'src/App.tsx', path: 'src/App.tsx', action: 'read' });
  emit({ kind: 'toolUse', messageId: m, name: 'Read', detail: 'src/index.css', path: 'src/index.css', action: 'read' });
  emit({ kind: 'delta', messageId: m, text: 'Die Vorlage verwendet dunkle Flächen, feine Linien und grüne Akzente. Ich übernehme diese Gestaltung für die neue Startseite.' });
  emit({ kind: 'toolUse', messageId: m, name: 'Read', detail: 'docs/screenshot.png', path: 'docs/screenshot.png', action: 'read' });
  emit({ kind: 'toolUse', messageId: m, name: 'Write', detail: 'src/components/Hero.tsx', path: 'src/components/Hero.tsx', action: 'write', added: 68, removed: 0, preview: 'export function Hero() {\n  return <section class="hero">…</section>;\n}' });
  emit({ kind: 'delta', messageId: m, text: 'Die ersten Abschnitte sind ausgearbeitet. Jetzt passe ich die Startseite selbst an.' });
  emit({ kind: 'toolUse', messageId: m, name: 'Edit', detail: 'README.md', path: 'README.md', action: 'edit', added: 20, removed: 2, preview: '- **Kopfleiste:** Projekt, Aufgabe und Werkzeuge.\n+ **Kopfleiste:** Es gibt keine.' });
  emit({ kind: 'toolUse', messageId: m, name: 'Edit', detail: 'AGENTS.md', path: 'AGENTS.md', action: 'edit', added: 20, removed: 0 });
  emit({ kind: 'toolUse', messageId: m, name: 'Bash', detail: 'npm run build', action: 'run', preview: 'Build completed successfully.' });
  emit({ kind: 'delta', messageId: m, text: '[Startseite öffnen](http://127.0.0.1:5173/)\n\nDie Startseite ist überarbeitet:\n\n- **Großzügiger Einstieg** mit klarer Typografie\n- **Projekte** in einem anpassungsfähigen Raster\n- Kompakte Navigation mit verbessertem Kontrast\n\nAuch ohne Server nutzbar: [Lokale Startseite](src/App.tsx).' });
  emit({ kind: 'done', messageId: m, durationMs: 718000, metered: false, at: Date.now() - 25 * 3600e3 });
  const m2 = m + '-2';
  emit({ kind: 'userEcho', text: 'Das sieht gut aus. Mach die Projektkarten bitte etwas ruhiger und prüfe die Darstellung auf dem Smartphone.', at: Date.now() - 300000, attachments: ['/Users/demo/Desktop/Karten.png'] });
  emit({ kind: 'routing', messageId: m2, target: { provider: 'claude', account: 'studio', model: 'claude-opus-5' }, reason: 'Vorgabe' });
  emit({ kind: 'toolUse', messageId: m2, name: 'Read', detail: 'src/App.tsx', path: 'src/App.tsx', action: 'read' });
  emit({ kind: 'toolUse', messageId: m2, name: 'Edit', detail: 'src/index.css', path: 'src/index.css', action: 'edit', added: 12, removed: 5 });
  emit({ kind: 'toolUse', messageId: m2, name: 'Bash', detail: 'python3 -m http.server 5173 --bind 127.0.0.1', action: 'run' });
  emit({ kind: 'delta', messageId: m2, text: 'Die Karten haben jetzt weniger Kontrast und mehr Abstand. Auf 375 px Breite bricht nichts um. Die Vorschau läuft unter http://127.0.0.1:5173/.' });
  emit({ kind: 'done', messageId: m2, durationMs: 94000, metered: false, at: Date.now() - 200000 });
  emit({ kind: 'busy', running: queueDemo && queueRunning.has(id) });
  emit({ kind: 'conversationReady' });
}
/* Alle Chat-Widgets untereinander, so wie ein Modell sie als `cortex-widget`-Block schreibt. */
function widgetConversation() {
  fetch(query.get('samples') === 'live' ? './widget-live.json' : './widget-samples.json').then(r => r.json()).then(samples => {
    const filter = query.get('widget');
    samples.filter(s => !filter || (s.spec ? s.spec.type : s.type) === filter).forEach((sample, i) => {
      const spec = sample.spec && JSON.parse(JSON.stringify(sample.spec).replace('"__IN_1122_SEC__"', JSON.stringify(new Date(Date.now() + 1122e3).toISOString())));
      const m = 'widget-' + i;
      emit({ kind: 'userEcho', text: sample.question, at: Date.now() - (60 - i) * 60e3 });
      emit({ kind: 'routing', messageId: m, target: { provider: 'claude', account: 'studio', model: 'claude-opus-5' }, reason: 'Vorgabe' });
      emit({ kind: 'delta', messageId: m, text: sample.answer ?? ('```cortex-widget\n' + JSON.stringify(spec) + '\n```' + (sample.after ? '\n\n' + sample.after : '')) });
      emit({ kind: 'done', messageId: m, durationMs: 4000, metered: false, at: Date.now() - (59 - i) * 60e3 });
    });
    if (query.get('broken')) {
      emit({ kind: 'userEcho', text: 'Und ein kaputter Block?', at: Date.now() });
      emit({ kind: 'routing', messageId: 'widget-broken', target: { provider: 'claude', account: 'studio', model: 'claude-opus-5' }, reason: 'Vorgabe' });
      emit({ kind: 'delta', messageId: 'widget-broken', text: '```cortex-widget\n{"type":"todo","title":"Heute"}\n```' });
      emit({ kind: 'done', messageId: 'widget-broken', durationMs: 1000, metered: false, at: Date.now() });
      emit({ kind: 'userEcho', text: 'Und einer, der noch schreibt?', at: Date.now() });
      emit({ kind: 'routing', messageId: 'widget-live', target: { provider: 'claude', account: 'studio', model: 'claude-opus-5' }, reason: 'Vorgabe' });
      emit({ kind: 'delta', messageId: 'widget-live', text: 'Moment:\n\n```cortex-widget\n{"type":"weather","loc' });
    }
    emit({ kind: 'busy', running: !!query.get('broken') });
    emit({ kind: 'conversationReady' });
  }).catch(() => emit({ kind: 'conversationReady' }));
}
const appValues = {};
function fixtureMetrics() {
  const out = []; const day = 86400000; const models = ['gpt-6-astra', 'claude-opus-5', 'gpt-5.6-sol', 'claude-sonnet-5'];
  for (let i = 0; i < 140; i++) {
    const back = Math.floor((i * 37) % 60);
    const model = models[i % models.length];
    out.push({ id: 'm' + i, timestamp: Date.now() - back * day - (i % 9) * 3600000, conversationId: 'site', provider: model.startsWith('gpt') ? 'codex' : 'claude', account: i % 3 ? 'privat' : 'studio', model, effort: ['medium', 'high', 'max'][i % 3], inputTokens: 20000 + (i * 7919) % 180000, outputTokens: 2000 + (i * 331) % 9000, durationMs: 40000 + (i * 7717) % 900000, status: i % 17 === 0 ? 'failover' : i % 23 === 0 ? 'error' : 'success', kind: ['code', 'review', 'frage'][i % 3] });
  }
  return out;
}
const nativeValues = { 'editor.fontSize':14,'editor.fontFamily':'Menlo, monospace','editor.tabSize':4,'editor.insertSpaces':true,'editor.wordWrap':'off','editor.minimap.enabled':true,'editor.lineNumbers':'on','editor.formatOnSave':false,'files.autoSave':'off','files.trimTrailingWhitespace':false,'files.insertFinalNewline':false,'terminal.integrated.fontSize':14,'terminal.integrated.cursorStyle':'block','terminal.integrated.scrollback':1000 };
/* Prüfen und Anmelden wie im Host, nur ohne Netz: erst „Prüfe …“, dann ein Ergebnis. */
function fixtureCheck(id) {
  pluginLive.connections = { ...pluginLive.connections, [id]: { status: 'pruefe' } };
  sendPluginLive();
  setTimeout(() => {
    pluginLive.connections = { ...pluginLive.connections, [id]: { status: 'verbunden', checkedAt: Date.now(), tools: [{ name: 'suche' }, { name: 'lies' }],
      clis: [{ provider: 'claude', label: 'studio', state: 'verbunden', detail: 'Claude Code hat ihn gestartet.' }, { provider: 'codex', label: 'privat', state: 'eingetragen' }] } };
    sendPluginLive();
    emit({ kind: 'pluginProgress', id, ok: true, message: id + ' ist verbunden — 2 Werkzeuge.' });
  }, 250);
}
function fixtureLogin(id) {
  pluginLive.logins = { ...pluginLive.logins, [id]: { step: 'browser', message: 'Anmeldung bei ' + id + ' im Browser …', url: 'https://example.com/authorize' } };
  sendPluginLive();
  setTimeout(() => {
    pluginLive.logins = {};
    pluginLive.credentials = { ...pluginLive.credentials, [id]: { fields: [], ...pluginLive.credentials[id], oauth: { connectedAt: Date.now(), refreshable: true } } };
    fixtureCheck(id);
  }, 400);
}
/* Ein einzelnes Konto verbinden (Claude, Codex) oder fragen (Grok) — die Zeile zeigt den Lauf, dann das Ergebnis. */
function fixtureAccountLogin(id, account) {
  const grok = account === 'acc-grok';
  pluginLive.logins = { ...pluginLive.logins, [id]: grok
    ? { step: 'suche', message: 'Grok (Privat) wird gefragt …', account }
    : { step: 'browser', message: 'Im Browser bei Figma bestätigen …', url: 'https://www.figma.com/oauth/mcp', account } };
  sendPluginLive();
  setTimeout(() => {
    const current = pluginLive.connections[id];
    pluginLive.logins = {};
    pluginLive.connections = { ...pluginLive.connections, [id]: { ...current, checkedAt: Date.now(),
      clis: current.clis.map(c => c.account === account ? { ...c, state: 'verbunden', detail: grok ? 'Grok sieht 40 Werkzeuge über den Konnektor seines Kontos.' : 'In Codex angemeldet.' } : c) } };
    sendPluginLive();
  }, 400);
}
window.addEventListener('preview:host', e => {
  const msg = e.detail;
  if (msg.kind === 'getWidgetState' || msg.kind === 'setWidgetState') {
    const key = `fixture-widget:${msg.conversationId}/${msg.key}`;
    if (msg.kind === 'setWidgetState') localStorage.setItem(key, JSON.stringify(msg.value));
    emit({ kind: 'widgetState', conversationId: msg.conversationId, key: msg.key, value: JSON.parse(localStorage.getItem(key) || 'null') ?? undefined });
  }
  if (msg.kind === 'searchConversations') {
    const needle = msg.query.trim().toLocaleLowerCase();
    const excluded = new Set(msg.excludedProjects ?? []);
    const hits = list.filter(conversation => !conversation.archived && !excluded.has(conversation.projectPath) && conversation.title.toLocaleLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 60);
    emit({ kind: 'conversationSearch', requestId: msg.requestId, hits });
  }
  if (msg.kind === 'getNativeSettings') emit({kind:'nativeSettings',values:nativeValues});
  if (msg.kind === 'setNativeSetting') { nativeValues[msg.key]=msg.value; emit({kind:'nativeSettings',values:nativeValues,ack:{key:msg.key,requestId:msg.requestId}}); }
  // Einstellungen nach Codex: Speicher, Kennzahlen und Importsuche — alles Beispielwerte.
  if (msg.kind === 'getAppSettings') emit({ kind: 'appSettings', values: appValues });
  if (msg.kind === 'setAppSetting') { if (msg.value === undefined || msg.value === null) delete appValues[msg.key]; else appValues[msg.key] = msg.value; emit({ kind: 'appSettings', values: { ...appValues },ack:{key:msg.key,requestId:msg.requestId} }); }
  if (msg.kind === 'detectImports') setTimeout(() => emit({ kind: 'imports', found: [{ id: 'claude-code', name: 'Claude Code', path: '/Users/demo/.claude' }, { id: 'codex', name: 'Codex', path: '/Users/demo/.codex' }] }), 300);
  if (msg.kind === 'getAnalytics') setTimeout(() => emit({ kind: 'analytics', accounts: profiles, metrics: fixtureMetrics() }), 250);
  if (msg.kind === 'getConnectors' || msg.kind === 'syncConnectors') sendConnectors();
  if (msg.kind === 'getPlugins') sendPlugins();
  if (msg.kind === 'getExokortex') emit({ kind: 'exokortex', status: EXOKORTEX_DEMO });
  if (msg.kind === 'installPlugin' || msg.kind === 'uninstallPlugin') {
    // Der Katalog liegt im Bündel; die Fixture kennt nur Servernamen. Für die
    // Vorschau reicht der Name des Eintrags — im Host macht das die echte Datei.
    // Neue Tabelle statt Mutation: eine Fixture, die dasselbe Objekt
    // weiterreicht, verdeckt genau die Fehler, die sie finden soll.
    const scope = pluginServers[msg.scope] ? msg.scope : 'persoenlich';
    const next = { ...pluginServers[scope] };
    if (msg.kind === 'installPlugin') next[msg.id] = { url: 'https://mcp.example.com/' + msg.id };
    else delete next[msg.id];
    pluginServers[scope] = next;
    if (msg.kind === 'uninstallPlugin') {
      pluginLive.credentials = { ...pluginLive.credentials }; delete pluginLive.credentials[msg.id];
      pluginLive.connections = { ...pluginLive.connections }; delete pluginLive.connections[msg.id];
    } else if (msg.values) {
      pluginLive.credentials = { ...pluginLive.credentials, [msg.id]: { fields: Object.keys(msg.values) } };
    }
    sendPlugins();
    if (msg.kind === 'installPlugin' && OAUTH_PLUGINS.has(msg.id)) fixtureLogin(msg.id);
    else if (msg.kind === 'installPlugin') fixtureCheck(msg.id);
    else emit({ kind: 'pluginProgress', id: msg.id, ok: true, message: msg.id + ' entfernt.' });
  }
  if (msg.kind === 'loginPlugin' && msg.account) fixtureAccountLogin(msg.id, msg.account);
  else if (msg.kind === 'loginPlugin') fixtureLogin(msg.id);
  if (msg.kind === 'checkServer') fixtureCheck(msg.server);
  if (msg.kind === 'setPluginEnabled') {
    const off = new Set(pluginLive.disabled);
    if (msg.enabled) off.delete(msg.server); else off.add(msg.server);
    pluginLive.disabled = [...off];
    sendPluginLive();
  }
  if (msg.kind === 'showPluginLog') emit({ kind: 'pluginProgress', id: msg.server, ok: true, message: 'Protokoll im Ausgabefenster „Cortex Plugins“.' });
  if (msg.kind === 'pickPluginClientFile') fixtureClient(msg.id, { clientId: '492409157416-demo0000000000000000000000ds61.apps.googleusercontent.com', hasSecret: true, fileName: 'client_secret_demo.json', projectId: 'amq-youtube' });
  if (msg.kind === 'pluginClientFile') fixtureClient(msg.id, { clientId: '492409157416-demo0000000000000000000000ds61.apps.googleusercontent.com', hasSecret: true, fileName: msg.path.split('/').pop() });
  if (msg.kind === 'setPluginClient') fixtureClient(msg.id, { clientId: msg.clientId, hasSecret: !!msg.clientSecret });
  if (msg.kind === 'clearPluginClient') {
    pluginLive.credentials = { ...pluginLive.credentials, [msg.id]: { fields: [] } };
    sendPluginLive();
    emit({ kind: 'pluginProgress', id: msg.id, ok: true, message: 'OAuth-Client entfernt.' });
  }
  if (msg.kind === 'copyPluginRedirect') emit({ kind: 'pluginProgress', id: msg.id, ok: true, message: 'Rückrufadresse kopiert.' });
  if (msg.kind === 'checkPlugin') fixtureCheck(msg.id);
  if (msg.kind === 'setPluginValues') {
    const fields = new Set(pluginLive.credentials[msg.id]?.fields || []);
    for (const [name, value] of Object.entries(msg.values)) value ? fields.add(name) : fields.delete(name);
    pluginLive.credentials = { ...pluginLive.credentials, [msg.id]: { ...pluginLive.credentials[msg.id], fields: [...fields] } };
    sendPluginLive();
    fixtureCheck(msg.id);
  }
  if (msg.kind === 'logoutPlugin') {
    pluginLive.credentials = { ...pluginLive.credentials, [msg.id]: { fields: [] } };
    pluginLive.connections = { ...pluginLive.connections }; delete pluginLive.connections[msg.id];
    sendPluginLive();
    emit({ kind: 'pluginProgress', id: msg.id, ok: true, message: 'Abgemeldet.' });
  }
  if (msg.kind === 'cancelPluginLogin') {
    pluginLive.logins = {}; sendPluginLive();
    emit({ kind: 'pluginProgress', id: msg.id, ok: true, message: 'Anmeldung abgebrochen.' });
  }
  if (msg.kind === 'copyPluginDefinition') emit({ kind: 'pluginProgress', id: msg.id, ok: true, message: 'Serverdefinition kopiert.' });
  if (msg.kind === 'getTemplates') {
    // Load the same real assets as the extension, so broken paths fail UI tests.
    void fetch('../templates/catalog.json').then(response => response.json()).then(async catalog => {
      const names = { document: 'dokument', presentation: 'praesentation', spreadsheet: 'tabelle' };
      const types = { document: 'ein neues Dokument', presentation: 'eine neue Präsentation', spreadsheet: 'eine neue Tabelle' };
      const items = await Promise.all(catalog.templates.map(async spec => {
        const root = '../templates/' + spec.directory + '/';
        const manifest = await fetch(root + 'template.json').then(response => response.json());
        const prompt = `Erstelle ${types[manifest.kind]} mit der Vorlage „${manifest.name}“. Frage mich zuerst, worum es darin gehen soll.`;
        return { id: 'builtin:' + manifest.id, name: manifest.name, kind: names[manifest.kind], own: false, body: prompt, prompt,
          artifactPath: '/demo/templates/' + spec.directory + '/' + manifest.reference,
          instructionPath: '/demo/templates/' + spec.directory + '/' + manifest.usage,
          previewUrl: root + manifest.preview, aspectRatio: manifest.kind === 'document' ? 'portrait' : 'landscape' };
      }));
      emit({ kind: 'templates', items });
    });
  }
  if (msg.kind === 'openConversation') conversation(msg.id);
  if (msg.kind === 'newConversation') { const id = 'new-' + Date.now(); list.unshift({ id, title: 'Neue Aufgabe', projectPath: msg.projectPath, updatedAt: Date.now() }); conversation(id); }
  if (msg.kind === 'deleteConversation') { list = list.filter(c => c.id !== msg.id); if (activeId === msg.id) conversation(list[0]?.id ?? 'new'); else emit({ kind: 'conversations', list, activeId }); }
  // Zurückgehen und Abzweigen: der Host kürzt den Verlauf; die Vorschau legt nur den Text zurück ins Eingabefeld.
  if ((msg.kind === 'rewindTo' || msg.kind === 'forkFrom') && echoes[msg.index]) {
    const echo = echoes[msg.index];
    emit({ kind: 'composerSeed', text: echo.text.replace(/\n\nAttached files:[\s\S]*$/, ''), attachments: echo.attachments });
    return;
  }
  if (msg.kind === 'setPinnedTarget') { targets[activeId] = msg.target; emit({ kind: 'pinnedTarget', target: msg.target ?? { provider: 'claude', account: 'privat', model: 'claude-opus-5' }, standard: !msg.target }); }
  if (msg.kind === 'inspectWorkspace') sendWorkspace(msg.directory);
  if (queueDemo && msg.kind === 'send') { const rows=queueRows.get(activeId)||[]; rows.push({id:'q-'+Date.now(),text:msg.text,canSteer:true,attachments:(msg.attachments||[]).map(path=>({name:path.split('/').pop(),path}))}); queueRows.set(activeId,rows); sendQueue(); return; }
  // Bildmodus: dieselbe Folge wie im Host — Echo mit Feldern, Werkzeugzeile, je Bild ein image-Ereignis.
  if (msg.kind === 'setImageAccountOrder') {
    for (const p of profiles) if (p.provider === msg.provider) p.imageRank = msg.accounts.indexOf(p.label);
    emit({ kind: 'accounts', accounts: profiles });
    return;
  }
  if (msg.kind === 'send' && msg.image) {
    const m = 'image-' + Date.now();
    emit({ kind: 'userEcho', text: msg.text, attachments: msg.attachments, at: Date.now(), image: msg.image });
    const first = profiles.filter(p => p.provider === msg.imageProvider).sort((a, b) => a.imageRank - b.imageRank)[0];
    emit({ kind: 'routing', messageId: m, target: { provider: msg.imageProvider, account: first?.label ?? '' }, reason: 'Bildmodus' });
    for (let i = 0; i < msg.image.count; i++) {
      emit({ kind: 'toolUse', messageId: m, name: 'image_gen', detail: msg.text, action: 'other' });
      emit({ kind: 'image', messageId: m, path: `/Users/demo/.cortex/profiles/grok/.grok/sessions/${m}/images/${i + 1}.jpg`, src: `/dev/bild-beispiel-${(i % 2) + 1}.jpg`, prompt: msg.text, options: msg.image, edited: !!msg.attachments?.length });
    }
    emit({ kind: 'delta', messageId: m, text: msg.image.count === 1 ? 'Das Bild ist fertig.' : `Die ${msg.image.count} Bilder sind fertig.` });
    emit({ kind: 'done', messageId: m, durationMs: 21000, metered: false, at: Date.now() });
    return;
  }
  if (msg.kind === 'canvasLoad') { const stored = canvasStore.scenes[msg.conversationId] || {}; setTimeout(() => emit({ kind: 'canvasScene', conversationId: msg.conversationId, scene: stored.scene, applied: stored.applied || [] }), 40); }
  if (msg.kind === 'canvasSave') { canvasStore.scenes[msg.conversationId] = { scene: msg.scene, applied: msg.applied, description: msg.description }; if (canvasStore.visible[msg.conversationId] != null) canvasStore.visible[msg.conversationId] = msg.description; }
  if (msg.kind === 'canvasVisible') canvasStore.visible[msg.conversationId] = msg.description;
  if (msg.kind === 'canvasExport') canvasStore.exports.push({ format: msg.format, length: msg.content.length });
  if (msg.kind === 'canvasAnswer') canvasStore.answers.push({ reqId: msg.reqId, png: msg.png.length, headless: msg.headless, description: msg.description, json: msg.json.length, error: msg.error });
  if (canvasDemo && msg.kind === 'send') { emit({ kind: 'userEcho', text: msg.text, at: Date.now() }); emit({ kind: 'busy', running: true }); canvasAnswer(msg.text); return; }
  if (msg.kind === 'send') { emit({ kind: 'userEcho', text: msg.text, at: Date.now() }); emit({ kind: 'routing', messageId: 'sent', target: msg.target || { provider: 'claude', account: 'privat', model: 'sonnet' }, reason: 'Vorschau' }); emit({ kind: 'busy', running: true }); }
  if (queueDemo && msg.kind === 'queueAction') {
    const rows=queueRows.get(activeId)||[]; const i=rows.findIndex(r=>r.id===msg.id);
    if(i>=0) {
      if(msg.action==='remove'||msg.action==='steer') { const [item]=rows.splice(i,1); if(msg.action==='steer') emit({kind:'userEcho',text:item.text}); }
      else { const next=i+(msg.action==='up'?-1:1); if(next>=0&&next<rows.length) [rows[i],rows[next]]=[rows[next],rows[i]]; }
      sendQueue();
    }
  }
  if(queueDemo && msg.kind==='editQueuedMessage') { const row=(queueRows.get(activeId)||[]).find(r=>r.id===msg.id); if(row) row.text=msg.text; sendQueue(); }
  if(queueDemo && msg.kind==='cancel') { queuePaused.set(activeId,true); queueRunning.delete(activeId); sendQueue(); }
  if(queueDemo && msg.kind==='resumeQueue') { queuePaused.set(activeId,false); sendQueue(); }
  if(queueDemo && msg.kind==='clearQueue') { queueRows.set(activeId,[]); sendQueue(); }
  // Die Bewertung kommt vom Host zurück — ohne diese Antwort bliebe der Daumen
  // in der Vorschau unverändert, und der Pfad wäre nicht prüfbar.
  if (msg.kind === 'rateAnswer') emit({ kind: 'rated', messageId: msg.messageId, poor: msg.poor });
  if (msg.kind === 'cancel') emit({ kind: 'busy', running: false });
  // Projektbearbeitung: in der Vorschau nur im Speicher, aber mit demselben
  // Ablauf wie im Host — sonst prüft man hier eine Oberfläche, die nichts tut.
  if (msg.kind === 'saveProject') {
    const p = projects.find(p => p.path === msg.path);
    if (p) { p.name = msg.name; p.folders = msg.folders; }
    emit({ kind: 'projects', projects });
  }
  if (msg.kind === 'removeProject') {
    const i = projects.findIndex(p => p.path === msg.path);
    if (i >= 0) projects.splice(i, 1);
    emit({ kind: 'projects', projects });
  }
  if (msg.kind === 'pinProject') {
    const p = projects.find(p => p.path === msg.path);
    if (p) p.pinned = msg.pinned;
    emit({ kind: 'projects', projects });
  }
  if (msg.kind === 'pickProjectFolder') emit({ kind: 'pickedFolder', path: '/Users/demo/Documents/Neuer Ordner' });
  if (msg.kind === 'setConversationProject') {
    const c = list.find(c => c.id === activeId);
    if (c) { c.projectPath = msg.path; emit({ kind: 'conversations', list, activeId }); }
  }
  if (msg.kind === 'createProject') {
    const path = msg.folders[0];
    if (!projects.some(p => p.path === path)) projects.push({ name: msg.name || path.split('/').pop(), path, folders: msg.folders });
    emit({ kind: 'projects', projects });
    const id = 'new-' + Date.now();
    list.unshift({ id, title: 'Neue Aufgabe', projectPath: path, updatedAt: Date.now() });
    conversation(id);
  }
  if (msg.kind === 'readFileBody') emit({ kind: 'fileBody', path: msg.path, text:
    'import { render } from \'preact\';\nimport { App } from \'./App.js\';\n\nrender(<App />, document.body);\n' });
  // Der Host antwortet mit der Adresse seines Vorschau-Servers; hier liefert
  // derselbe Testserver, der auch diese Seite ausliefert, eine Beispielseite.
  if (msg.kind === 'previewFile') emit({ kind: 'filePreview', path: msg.path, url: new URL('vorschau-seite.html', location.href).href });
  if (msg.kind === 'getDiff') emit({ kind: 'diff', conversationId: activeId, files: [
    { path: 'AGENTS.md', added: 20, removed: 0, hunks: [{ start: 1, lines: [
      { kind: 'ctx', text: '# Arbeiten an Cortex', line: 1 },
      { kind: 'ctx', text: '', line: 2 },
      { kind: 'ctx', text: '## Keine Desktop-Browser für Entwicklung und Tests', line: 3 },
      { kind: 'ctx', text: '', line: 4 },
      { kind: 'add', text: 'Der Nutzer möchte bei Änderungen, Builds, Installation und automatischen Tests', line: 5 },
      { kind: 'add', text: 'keinen Browserstart und kein zusätzliches Browser-Symbol im macOS-Dock.', line: 6 },
      { kind: 'ctx', text: '', line: 7 },
      { kind: 'add', text: '- Oberflächentests verwenden ausschließlich `tests/headless_browser.py`.', line: 8 },
      { kind: 'del', text: '- Tests dürfen Chrome starten, wenn nötig.' },
    ] }] },
    { path: 'README.md', added: 20, removed: 2, hunks: [{ start: 18, lines: [
      { kind: 'ctx', text: '- **Vorschau:** Integrierter Browser neben dem Chat.', line: 18 },
      { kind: 'del', text: '- **Kopfleiste:** Projekt, Aufgabe und Werkzeuge in der Titelleiste.' },
      { kind: 'add', text: '- **Kopfleiste:** Es gibt keine — die Seitenleiste läuft bis oben durch.', line: 19 },
    ] }] },
    { path: 'tests/cortex_popups.py', added: 3, removed: 4, hunks: [{ start: 12, lines: [
      { kind: 'ctx', text: 'with headless_browser() as browser:', line: 12 },
      { kind: 'del', text: "    page = browser.new_page(viewport={'width': 1440})" },
      { kind: 'add', text: "    page = browser.new_page(viewport={'width': 1300, 'height': 850})", line: 13 },
    ] }] },
    { path: 'engine/packages/vscode/media/cortex.css', added: 41, removed: 6 },
    { path: 'brand/icon.png', added: 0, removed: 0, binary: true },
    { path: 'scripts/assemble.sh', added: 8, removed: 2 },
  ] });
  if (msg.kind === 'addAccount' || msg.kind === 'reconnectAccount') {
    const provider = msg.provider || profiles.find(a => a.id === msg.id)?.provider || 'claude';
    emit({ kind: 'connectionProgress', provider, state: 'connecting', message: 'Vorschau: Anmeldung gestartet.' });
    setTimeout(() => emit({ kind: 'connectionProgress', provider, state: 'error', message: 'Vorschau: Hier wird keine echte Anmeldung ausgeführt.' }), 250);
  }
});
let fixtureInitialized = false;
function initializeFixture() {
  if (fixtureInitialized) return;
  fixtureInitialized = true;
  sendConnectors();
  emit({ kind: 'accounts', accounts: profiles });
  emit({ kind: 'projects', projects });
  conversation(activeId);
  emit({ kind: 'modes', permissionMode: 'safe', routingMode: 'auto', askPermission: false, pollUsage: true });
  if (query.get('page')) emit({ kind: 'showPage', page: query.get('page') });
}
window.addEventListener('preview:host', event => { if (event.detail.kind === 'ready') initializeFixture(); });
if ((window.__hostMessages || []).some(message => message.kind === 'ready')) initializeFixture();

// Stand von bruecke/status.py vom 13.09.2026, Pfade auf /Users/demo umgeschrieben.
var EXOKORTEX_DEMO = {"urteil": {"zustand": "warnung", "satz": "Exokortex bereit — Vault-Projektion: aelter als der Graph (vor 4 Tagen)", "hinweis": "Der Vault zeigt nicht, was im Graphen steht. tiefe.py projiziere"}, "pruefungen": [{"name": "Plattenplatz (Mac)", "zustand": "ok", "wert": "22 GB frei", "hinweis": ""}, {"name": "Hintergrundlast (Mac)", "zustand": "ok", "wert": "ruhig, Swap 2 GB", "hinweis": ""}, {"name": "Schreibsperre", "zustand": "ok", "wert": "frei", "hinweis": ""}, {"name": "Leseserver", "zustand": "ok", "wert": "5 Werkzeuge, 65 ms", "hinweis": ""}, {"name": "Graphindex", "zustand": "ok", "wert": "aktuell", "hinweis": ""}, {"name": "Speicher", "zustand": "ok", "wert": "Inhalt 823 MB · Graph 156 MB · Index 143 MB", "hinweis": ""}, {"name": "Chat-Ablage", "zustand": "ok", "wert": "9 Chats, zuletzt vor 14 h", "hinweis": ""}, {"name": "Stuendlicher Lauf", "zustand": "ok", "wert": "21 Laeufe, zuletzt in Ordnung", "hinweis": ""}, {"name": "Vault-Projektion", "zustand": "warnung", "wert": "aelter als der Graph (vor 4 Tagen)", "hinweis": "Der Vault zeigt nicht, was im Graphen steht. tiefe.py projiziere"}, {"name": "Werkzeugkette", "zustand": "ok", "wert": "vollstaendig", "hinweis": ""}, {"name": "Schreibpuffer", "zustand": "ok", "wert": "0 MB", "hinweis": ""}], "graph": {"gebaut_am": "2026-09-13 01:18", "knoten": 30758, "kanten": 128731}, "abnahme": {"herkunft": "abnahme", "gerissen": 4, "gesamt": 17, "gemessen": "2026-09-13 01:18", "veraltet": false, "befunde": [{"name": "Vollstaendigkeit Nordwind Studio", "wert": "0.3% (4 da, 1.549 fehlen)", "ok": false, "regel": ">= 99%", "herkunft": "Der erste Lauf nahm nur die Ordnernamen auf, der zweite dreizehn handverlesene Knoten aus 136.507 Dateien.", "hinweis": "Vollstaendige Fehlliste: /Users/demo/.exokortex/einspeisungen/fehlend_9b3758253184.txt"}, {"name": "Vollstaendigkeit Persönliche Projekte", "wert": "0.0% (0 da, 0 fehlen)", "ok": false, "regel": ">= 99%", "herkunft": "Der erste Lauf nahm nur die Ordnernamen auf, der zweite dreizehn handverlesene Knoten aus 136.507 Dateien.", "hinweis": ""}, {"name": "Knoten mit eindeutiger Notiz", "wert": "1 fehlen, 461 doppelt", "ok": false, "regel": "jeder sichtbare Knoten genau einmal", "herkunft": "Die Projektion darf keine Knoten verlieren", "hinweis": ""}, {"name": "Projizierte Kanten", "wert": "128654/128699", "ok": false, "regel": "100 % der sichtbaren Kanten", "herkunft": "Der Vault soll die Beziehungen zeigen", "hinweis": ""}]}, "arbeitsliste": {"offene_entscheidungen": 4, "unbenannte_orte": 240, "fehlende_dateien": 1738, "fehllisten": [{"datei": "/Users/demo/.exokortex/einspeisungen/fehlend_9b3758253184.txt", "anzahl": 1549}, {"datei": "/Users/demo/.exokortex/einspeisungen/fehlend_b52ec47f4108.txt", "anzahl": 189}]}, "chronik": [{"zeit": "2026-09-13 01:18", "quellen": ["Cortex-Chats"], "dauer_s": 959.6583502292633, "exitcode": 0, "abgebrochen_in": null, "chats": 1, "maskiert": 0}, {"zeit": "2026-09-12 23:02", "quellen": ["Cortex-Chats"], "dauer_s": 894.1396479606628, "exitcode": 0, "abgebrochen_in": null, "chats": 1, "maskiert": 0}, {"zeit": "2026-09-12 01:51", "quellen": ["Cortex-Chats"], "dauer_s": 840.328950881958, "exitcode": 0, "abgebrochen_in": null, "chats": 1, "maskiert": 0}, {"zeit": "2026-09-12 00:37", "quellen": ["Cortex-Chats"], "dauer_s": 802.0497341156006, "exitcode": 0, "abgebrochen_in": null, "chats": 2, "maskiert": 0}, {"zeit": "2026-09-11 21:17", "quellen": ["Cortex-Chats"], "dauer_s": 678.1242928504944, "exitcode": 0, "abgebrochen_in": null, "chats": 1, "maskiert": 0}, {"zeit": "2026-09-11 18:06", "quellen": ["Cortex-Chats"], "dauer_s": 852.1358067989349, "exitcode": 0, "abgebrochen_in": null, "chats": 1, "maskiert": 0}, {"zeit": "2026-09-11 16:52", "quellen": ["Cortex-Chats"], "dauer_s": 879.5894610881805, "exitcode": 0, "abgebrochen_in": null, "chats": 2, "maskiert": 0}, {"zeit": "2026-09-11 02:31", "quellen": ["Cortex-Chats"], "dauer_s": 821.6840672492981, "exitcode": 0, "abgebrochen_in": null, "chats": 1, "maskiert": 0}, {"zeit": "2026-09-09 19:55", "quellen": ["Cortex-Chats"], "dauer_s": 766.8064022064209, "exitcode": 0, "abgebrochen_in": null, "chats": 4, "maskiert": 0}, {"zeit": "2026-09-09 15:39", "quellen": ["Cortex-Chats"], "dauer_s": 369.0705518722534, "exitcode": 1, "abgebrochen_in": null, "chats": 4, "maskiert": 0}], "pfade": {"speicher": "/Users/demo/.exokortex", "vault": "/Users/demo/Obsidian-Vault", "chats": "/Users/demo/Cortex-Chats", "log": "/Users/demo/Library/Logs/exokortex-chats.log"}, "datenwege": {"arten": [{"kennung": "dateien", "name": "Dateien und Ordner", "muster": "Projekt -> Bereich -> Dokument", "adapter": "lauf.py", "takt": "von Hand", "knoten": 3027, "hinweis": "12 Projekte", "aktive": 1, "instanzen": [{"kennung": "ordner", "name": "Projektordner", "bundle": "com.apple.finder", "app": "Finder", "aktiv": true, "zustand": "aktiv"}]}, {"kennung": "ki_chats", "name": "KI-Chats", "muster": "Anbieter -> Werkzeug -> Projekt", "adapter": "chats.py", "takt": "stuendlich", "knoten": 57, "hinweis": "aus Cortex-Chats", "aktive": 1, "instanzen": [{"kennung": "cortex", "name": "Cortex", "bundle": "dev.oskarschiermeister.cortex", "app": "Cortex", "werkzeuge": ["Chat", "Agenten"], "aktiv": true, "hinweis": "alle Anbieter, die in Cortex laufen", "zustand": "aktiv"}, {"kennung": "claude", "name": "Claude", "bundle": "com.anthropic.claudefordesktop", "app": "Claude", "werkzeuge": ["Desktop", "Code"], "zustand": "geplant"}, {"kennung": "chatgpt", "name": "ChatGPT", "bundle": "com.openai.codex", "app": "ChatGPT", "werkzeuge": ["Chat", "Work", "Codex", "Cloud"], "zustand": "geplant"}, {"kennung": "grok", "name": "Grok", "bundle": null, "werkzeuge": ["Chat", "Build"], "zustand": "geplant"}]}, {"kennung": "nachrichten", "name": "Nachrichten", "muster": "Quelle -> Monat -> Kategorie", "adapter": null, "takt": null, "knoten": 0, "hinweis": null, "aktive": 0, "instanzen": [{"kennung": "mail", "name": "Apple Mail", "bundle": "com.apple.mail", "app": "Mail", "hinweis": "4 Konten auf diesem Rechner", "zustand": "geplant"}, {"kennung": "imessage", "name": "Nachrichten", "bundle": "com.apple.MobileSMS", "app": "Messages", "hinweis": "iMessage und SMS", "zustand": "geplant"}]}, {"kennung": "aufnahme", "name": "Aufnahmegeraete", "muster": "Monat -> Kategorie (rueckwirkend)", "adapter": null, "takt": null, "knoten": 0, "hinweis": null, "aktive": 0, "instanzen": [{"kennung": "omi", "name": "OMI", "bundle": null, "hinweis": "Exportformat offen", "zustand": "geplant"}]}]}, "bestand": {"landkarte": 461, "einheiten": 253993, "verteilung": {"knoten": [{"name": "Begriff", "anzahl": 12888}, {"name": "Kapitel", "anzahl": 8870}, {"name": "Dokument", "anzahl": 3027}, {"name": "Medium", "anzahl": 2925}, {"name": "Quelltext", "anzahl": 1949}, {"name": "Bereich", "anzahl": 924}, {"name": "Werkzeug", "anzahl": 147}, {"name": "Projekt", "anzahl": 12}, {"name": "Organisation", "anzahl": 6}, {"name": "Bildungseinrichtung", "anzahl": 3}, {"name": "Quelle", "anzahl": 3}, {"name": "System", "anzahl": 2}, {"name": "Person", "anzahl": 1}, {"name": "Ort", "anzahl": 1}], "kante": [{"name": "NENNT", "anzahl": 84479}, {"name": "ENTHAELT", "anzahl": 8870}, {"name": "LIEGT_IN", "anzahl": 8825}, {"name": "GEHOERT_ZU", "anzahl": 8825}, {"name": "HANDELT_VON", "anzahl": 7818}, {"name": "FOLGT_AUF", "anzahl": 6560}, {"name": "VERWEIST_AUF", "anzahl": 1902}, {"name": "ERWAEHNT", "anzahl": 904}, {"name": "NUTZT", "anzahl": 258}, {"name": "GLEICHT", "anzahl": 239}, {"name": "BELEGT_DURCH", "anzahl": 14}, {"name": "ARBEITET_AN", "anzahl": 12}, {"name": "BETREIBT", "anzahl": 11}, {"name": "ARBEITETE_BEI", "anzahl": 6}, {"name": "LERNTE_AN", "anzahl": 3}, {"name": "TAETIG_IN", "anzahl": 2}, {"name": "TEIL_VON", "anzahl": 2}, {"name": "WOHNT_IN", "anzahl": 1}], "projekt": [{"name": "Provinzen", "anzahl": 1339}, {"name": "Dummy Economics", "anzahl": 539}, {"name": "Nordwind Studio", "anzahl": 487}, {"name": "Anatomy Academy", "anzahl": 382}, {"name": "Levels of Monaco", "anzahl": 95}, {"name": "New German Architecture", "anzahl": 79}, {"name": "God's Eye View", "anzahl": 31}, {"name": "EduCore", "anzahl": 29}, {"name": "Project Super Suit", "anzahl": 15}, {"name": "Theologische Lehre", "anzahl": 12}, {"name": "Mobil & Klar", "anzahl": 10}, {"name": "Cortex-Chats", "anzahl": 9}]}}};
