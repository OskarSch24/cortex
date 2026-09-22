import { useEffect, useRef, useState } from 'preact/hooks';
import type { HistoryQuestionResult, HistoryRequest, HistoryResponse, HistorySettings, HistoryState } from '../../../src/history/types.js';
import { Glyph } from '../../components/CortexIcons.js';
import { vscode } from '../../vscodeApi.js';
import { Button, Card, Empty, Page, Row, Search, Section, Select, Toggle, useDismiss } from '../ui.js';

type Period = 'all' | 'today' | 'yesterday' | 'date';
function bounds(period: Period, date: string): { from?: number; to?: number } {
  if (period === 'all' || (period === 'date' && !date)) return {};
  const start = period === 'date' ? new Date(`${date}T00:00:00`) : new Date();
  if (!Number.isFinite(start.getTime())) return {};
  start.setHours(0, 0, 0, 0);
  if (period === 'yesterday') start.setDate(start.getDate() - 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.getTime(), to: end.getTime() - 1 };
}
const dayLabel = (time: number) => new Date(time).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeLabel = (time: number) => new Date(time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/** Separate local-only channel: never writes a conversation or generic settings. */
export function ComputerverlaufPage() {
  const [state, setState] = useState<HistoryState | null>(null);
  const [query, setQuery] = useState('');
  const [appQuery, setAppQuery] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [date, setDate] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<HistoryQuestionResult | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const latestRequest = useRef('');
  const stateRef = useRef<HistoryState | null>(null);
  const questionTimer = useRef<ReturnType<typeof setTimeout>>();
  const operationTimer = useRef<ReturnType<typeof setTimeout>>();
  const filters = useRef({ query, period, date });
  filters.current = { query, period, date };
  const cancelButton = useRef<HTMLButtonElement>(null);
  const clearButton = useRef<HTMLButtonElement>(null);
  const dialog = useDismiss<HTMLDivElement>(confirmClear, () => setConfirmClear(false));

  const refresh = () => {
    const current = filters.current;
    vscode.postMessage({ kind: 'computerHistory', action: 'state', query: current.query, ...bounds(current.period, current.date) });
  };
  const forgetAnswer = () => {
    latestRequest.current = '';
    clearTimeout(questionTimer.current);
    setAsking(false);
    setAnswer(null);
  };
  useEffect(() => {
    const listen = (event: MessageEvent<HistoryResponse>) => {
      const message = event.data;
      if (message?.kind === 'computerHistoryState') {
        const previous = stateRef.current;
        const next = message.state;
        if (previous && ((previous.settings.enabled && !next.settings.enabled)
          || previous.settings.allowedApps.join('\n') !== next.settings.allowedApps.join('\n')
          || previous.total > next.total)) forgetAnswer();
        stateRef.current = next;
        setState(next);
        setBusy(false);
        clearTimeout(operationTimer.current);
      }
      if (message?.kind === 'computerHistoryAnswer' && message.requestId === latestRequest.current) {
        clearTimeout(questionTimer.current);
        latestRequest.current = '';
        setAnswer(message.result);
        setAsking(false);
      }
    };
    window.addEventListener('message', listen);
    const poll = setInterval(() => { if (!document.hidden) refresh(); }, 30000);
    const timeout = setTimeout(() => {
      if (!stateRef.current) setError('Der lokale Verlauf antwortet noch nicht. Bitte erneut laden.');
    }, 20000);
    return () => {
      window.removeEventListener('message', listen);
      vscode.postMessage({ kind: 'computerHistory', action: 'unsubscribe' });
      clearInterval(poll);
      clearTimeout(timeout);
      clearTimeout(questionTimer.current);
      clearTimeout(operationTimer.current);
      latestRequest.current = '';
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(refresh, 250);
    forgetAnswer();
    return () => clearTimeout(timer);
  }, [query, period, date]);
  useEffect(() => {
    if (confirmClear) cancelButton.current?.focus();
    else if (document.activeElement === document.body) clearButton.current?.focus();
  }, [confirmClear]);

  const mutate = (message: HistoryRequest) => {
    setError('');
    forgetAnswer();
    setBusy(true);
    clearTimeout(operationTimer.current);
    operationTimer.current = setTimeout(() => {
      setBusy(false);
      setError('Die Änderung wurde noch nicht bestätigt. Lade den lokalen Status erneut.');
    }, 30000);
    vscode.postMessage(message);
  };
  const configure = (settings: Partial<HistorySettings>) => mutate({ kind: 'computerHistory', action: 'configure', settings });
  const ask = () => {
    const text = question.trim();
    if (!text || !state || state.model !== 'available' || asking || busy) return;
    forgetAnswer();
    setError('');
    const requestId = `history-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    latestRequest.current = requestId;
    setAsking(true);
    questionTimer.current = setTimeout(() => {
      if (latestRequest.current !== requestId) return;
      latestRequest.current = '';
      setAsking(false);
      setError('Das lokale Modell hat noch nicht geantwortet. Du kannst es erneut versuchen.');
    }, 120000);
    vscode.postMessage({ kind: 'computerHistory', action: 'ask', question: text, requestId, ...bounds(period, date) });
  };
  const appList = state?.apps.filter(app => `${app.name} ${app.id}`.toLocaleLowerCase().includes(appQuery.toLocaleLowerCase())) ?? [];
  const allowed = state?.settings.allowedApps ?? [];
  const canEnable = !!state?.permission && state.model === 'available' && state.apps.some(app => app.supported && allowed.includes(app.id));
  const grouped = new Map<string, HistoryState['entries']>();
  for (const entry of state?.entries ?? []) {
    const label = dayLabel(entry.startedAt);
    grouped.set(label, [...(grouped.get(label) ?? []), entry]);
  }

  return <Page title="Computerverlauf" subtitle="Dein Arbeitskontext. Ausschließlich auf diesem Mac.">
    <div class="cxs-history">
      <div class="cxs-history-local">
        <Glyph name="lock" size={18} />
        <div><strong>Nur Cortex · lokal auf deinem Mac</strong><p>Freigegebene App-Texte, Zusammenfassungen und Antworten bleiben hier. Verarbeitung mit dem lokalen Apple-Modell. Keine Verbindung zu ChatGPT, Cloudmodellen oder Chat-Exporten.</p></div>
      </div>
      {(error || state?.error) && <div class="cxs-history-error" role="alert"><span>{error || state?.error}</span><Button onClick={() => { setError(''); refresh(); }}>Erneut laden</Button></div>}
      {!state ? <div class="cxs-loading" role="status"><span class="cxs-spinner" /><span>Lokalen Verlauf laden …</span></div> : <>
        <Section title="Erfassung" actions={<span class={`cxs-history-status ${state.running ? 'active' : ''}`} role="status"><i />{state.running ? 'Aktiv' : state.settings.enabled ? 'Wartet' : 'Pausiert'}</span>}>
          <Card>
            <Row title="Computerverlauf erfassen" sub={state.status}>
              <Toggle label="Computerverlauf erfassen" on={state.settings.enabled} disabled={busy || (!state.settings.enabled && !canEnable)} onChange={enabled => configure({ enabled })} />
            </Row>
            <Row title="Bedienungshilfen" sub={state.permission ? 'Cortex darf Texte der freigegebenen Apps lesen.' : 'macOS muss Cortex den Zugriff auf App-Texte erlauben.'}>
              {state.permission ? <span class="cxs-history-check"><Glyph name="check" size={14} />Erlaubt</span> : <Button disabled={busy} onClick={() => mutate({ kind: 'computerHistory', action: 'permission' })}>Zugriff erlauben</Button>}
            </Row>
            <Row title="Lokales Modell" sub={state.model === 'available' ? 'Apple-Sprachmodell · Verarbeitung auf diesem Gerät' : state.modelReason || 'Das Apple-Sprachmodell ist auf diesem Mac noch nicht verfügbar.'}>
              <span class="cxs-history-check">{state.model === 'available' ? 'Verfügbar' : 'Nicht verfügbar'}</span>
            </Row>
            <Row title="Automatisch löschen" sub="Ältere Einträge werden einschließlich ihrer Zusammenfassungen entfernt.">
              <Select label="Aufbewahrungsdauer" value={String(state.settings.retentionDays)} disabled={busy} onChange={value => configure({ retentionDays: Number(value) })} options={[{ value: '1', label: 'Nach 1 Tag' }, { value: '7', label: 'Nach 7 Tagen' }, { value: '30', label: 'Nach 30 Tagen' }, { value: '90', label: 'Nach 90 Tagen' }]} />
            </Row>
          </Card>
          <p class="cxs-footnote">{!allowed.length ? 'Wähle zuerst mindestens eine App aus. Danach kannst du die Erfassung einschalten. ' : ''}Cortex liest Text aus dem vordersten freigegebenen App-Fenster. Es werden weder Bildschirmbilder noch Audio aufgezeichnet.</p>
        </Section>
        <Section title="Freigegebene Apps" subtitle={`${allowed.length} ausgewählt · Nur ausdrücklich ausgewählte Apps werden einbezogen.`}>
          <Search value={appQuery} onInput={setAppQuery} placeholder="Apps suchen" />
          <Card class="cxs-history-apps">
            {appList.map(app => <Row key={app.id} title={app.name} sub={app.supported ? app.id : app.reason || 'Diese App kann nicht sicher erfasst werden.'}>
              <Toggle label={`${app.name} in Verlauf einbeziehen`} on={app.supported && allowed.includes(app.id)} disabled={!app.supported || busy} onChange={on => configure({ allowedApps: on ? [...allowed, app.id] : allowed.filter(id => id !== app.id) })} />
            </Row>)}
            {!appList.length && <div class="cxs-card-empty">{appQuery ? 'Keine passende App gefunden.' : 'Noch keine unterstützten Apps gefunden.'}</div>}
          </Card>
          <p class="cxs-footnote">Browser bleiben ausgeschlossen: Private Fenster lassen sich über App-Texte nicht zuverlässig erkennen. Die Auswahl zeigt erkannte Apps auf diesem Mac.</p>
        </Section>
        <Section title="Dein Verlauf" actions={<button ref={clearButton} type="button" class="cxs-button danger" disabled={busy || !state.total} onClick={() => setConfirmClear(true)}>Alles löschen</button>}>
          <div class="cxs-history-filters">
            <Search value={query} onInput={setQuery} placeholder="Verlauf durchsuchen" />
            <Select label="Zeitraum" value={period} onChange={setPeriod} options={[{ value: 'all', label: 'Alle Tage' }, { value: 'today', label: 'Heute' }, { value: 'yesterday', label: 'Gestern' }, { value: 'date', label: 'Datum wählen' }]} />
            {period === 'date' && <input type="date" aria-label="Datum des Verlaufs" class="cxs-field cxs-history-date" value={date} onInput={event => setDate(event.currentTarget.value)} />}
          </div>
          <Card class="cxs-history-question">
            <label htmlFor="cortex-history-question">Frag deinen lokalen Verlauf</label>
            <form onSubmit={event => { event.preventDefault(); ask(); }}>
              <textarea id="cortex-history-question" rows={2} maxLength={1000} value={question} placeholder="Woran habe ich gestern gearbeitet?" disabled={state.model !== 'available'} onInput={event => setQuestion(event.currentTarget.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); ask(); } }} />
              <div class="cxs-history-question-bottom"><span>{period === 'all' ? 'Gespeicherter Verlauf' : 'Gewählter Tag'} · Nur lokal</span><Button kind="primary" disabled={asking || busy || !question.trim() || !state.total || state.model !== 'available' || (period === 'date' && !date)} onClick={ask}>{asking ? 'Denkt lokal …' : 'Lokal fragen'}</Button></div>
            </form>
            {answer && <div class="cxs-history-answer" aria-live="polite">
              <strong>{answer.question}</strong>
              <p role={answer.error ? 'alert' : undefined}>{answer.error || answer.answer}</p>
              {!answer.error && answer.sources.length > 0 && <ol aria-label="Quellen der Antwort">{answer.sources.map(source => <li key={source.id}><strong>{source.appName}</strong><span>{dayLabel(source.startedAt)} · {timeLabel(source.startedAt)}</span><span>{source.title || 'Ohne Fenstertitel'}</span></li>)}</ol>}
            </div>}
          </Card>
          <div class="cxs-history-count">{state.entries.length} {state.entries.length === 1 ? 'Eintrag' : 'Einträge'} angezeigt · {state.total} insgesamt</div>
          <div class="cxs-history-timeline">
            {[...grouped].map(([day, entries]) => <section class="cxs-history-day" key={day}>
              <h3>{day}</h3>
              {entries.map(entry => <article class="cxs-history-entry" key={entry.id} id={`history-entry-${entry.id}`}>
                <div class="cxs-history-entry-head"><time dateTime={new Date(entry.startedAt).toISOString()}>{timeLabel(entry.startedAt)}{entry.endedAt > entry.startedAt + 60000 ? `–${timeLabel(entry.endedAt)}` : ''}</time><strong>{entry.appName}</strong><button type="button" class="cxs-icon-button" disabled={busy} aria-label={`Eintrag aus ${entry.appName} um ${timeLabel(entry.startedAt)} löschen`} title="Eintrag löschen" onClick={() => mutate({ kind: 'computerHistory', action: 'delete', id: entry.id })}><Glyph name="trash" size={14} /></button></div>
                <h4>{entry.title || 'Ohne Fenstertitel'}</h4>
                <p>{entry.summary || 'Noch keine lokale Zusammenfassung. Den erfassten Text findest du in der Quelle.'}</p>
                <details><summary>Erfassten Quelltext ansehen</summary><pre>{entry.text}</pre></details>
              </article>)}
            </section>)}
            {!state.entries.length && <Empty icon={<Glyph name="history" size={24} />}>{query || period !== 'all' ? 'Keine Einträge für diese Auswahl.' : 'Noch kein Verlauf. Sobald du Apps freigibst und die Erfassung aktivierst, erscheinen deine Aktivitäten hier.'}</Empty>}
          </div>
        </Section>
      </>}
      {confirmClear && <div class="cxs-history-backdrop">
        <div ref={dialog} class="cxs-history-dialog" role="dialog" aria-modal="true" aria-labelledby="cxs-history-clear-title" onKeyDown={event => {
          if (event.key !== 'Tab') return;
          const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button');
          const first = buttons?.[0]; const last = buttons?.[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
          <h3 id="cxs-history-clear-title">Gesamten Verlauf löschen?</h3>
          <p>Alle erfassten Texte und Zusammenfassungen werden auf diesem Mac gelöscht. Die App-Auswahl bleibt bestehen; eine laufende Erfassung wird pausiert.</p>
          <div><button ref={cancelButton} type="button" class="cxs-button" onClick={() => { setConfirmClear(false); clearButton.current?.focus(); }}>Abbrechen</button><Button kind="danger" onClick={() => { setConfirmClear(false); mutate({ kind: 'computerHistory', action: 'clear' }); }}>Verlauf endgültig löschen</Button></div>
        </div>
      </div>}
    </div>
  </Page>;
}
