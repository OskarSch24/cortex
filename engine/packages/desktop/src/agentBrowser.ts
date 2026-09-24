import type { WebContents, WebContentsView } from 'electron';

/**
 * Der eingebaute Browser als Werkzeug der Agenten (MCP-Server cortex_browser).
 *
 * Recherche läuft in Tabs dieses Browsers, nie in einem Desktop-Browser: der
 * Nutzer arbeitet derweil in seinem eigenen Chrome weiter, und der Agent kann
 * mehrere Tabs nebeneinander öffnen und abarbeiten. Seine Tabs öffnen im
 * Hintergrund; in die Tableiste von Cortex rücken sie trotzdem, und
 * `browser_show` holt einen nach vorn.
 *
 * Ein Tab gehört dem Chat, der ihn geöffnet hat. Nur dort darf der Agent
 * klicken, tippen, navigieren und schließen. Die Tabs des Nutzers darf er
 * lesen und ansehen, aber nicht bedienen.
 */

export interface AgentTab { id: string; view: WebContentsView; loading: boolean; error: string; owner?: string; emulated?: boolean }

export interface AgentBrowserHost {
  tabs: Map<string, AgentTab>;
  /** Steht der Tab gerade sichtbar in der Seitenleiste? */
  shown(id: string): boolean;
  /** Ein neuer Tab im Hintergrund, der dem Chat gehört. */
  create(owner: string): AgentTab;
  close(id: string): void;
  /** Holt den Tab in der Seitenleiste nach vorn. */
  show(id: string): void;
  /** Prüft eine Adresse wie die Adressleiste (nur HTTP und HTTPS). */
  validUrl(url: string): string;
}

export interface AgentBrowserAnswer { text: string; image?: string; error?: string }

/** So viele Tabs darf ein Chat gleichzeitig offen haben. */
export const AGENT_TAB_LIMIT = 10;
/** Die Fenstergröße eines Tabs, der gerade nicht zu sehen ist. */
const HIDDEN_VIEWPORT = { width: 1280, height: 860 };
/** Die Skripte laufen in einer eigenen Welt: die Seite kann ihre Hilfsfunktionen nicht verbiegen. */
const WORLD = 1207;
const LOAD_TIMEOUT_MS = 30_000;
const TEXT_CHARS = 20_000;

const fail = (error: string): AgentBrowserAnswer => ({ text: '', error });
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

function describe(tab: AgentTab): string {
  const contents = tab.view.webContents;
  const url = contents.isDestroyed() ? 'about:blank' : contents.getURL() || 'about:blank';
  const title = contents.isDestroyed() ? '' : contents.getTitle();
  return `${tab.id} · ${title || url}${title && title !== url ? ` · ${url}` : ''}${tab.loading ? ' · lädt' : ''}${tab.error ? ` · Fehler: ${tab.error}` : ''}`;
}

/** Wartet, bis eine eben ausgelöste Navigation fertig ist — oder kurz, falls keine kommt. */
function settle(contents: WebContents, idleMs = 600): Promise<void> {
  return new Promise(resolve => {
    let started = contents.isLoading();
    const finish = () => { clearTimeout(idle); clearTimeout(cap); contents.off('did-start-loading', start); contents.off('did-stop-loading', finish); resolve(); };
    const start = () => { started = true; };
    contents.on('did-start-loading', start);
    contents.on('did-stop-loading', finish);
    const idle = setTimeout(() => { if (!started && !contents.isLoading()) finish(); }, idleMs);
    const cap = setTimeout(finish, LOAD_TIMEOUT_MS);
  });
}

function timeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
}

/**
 * Ein verborgener Tab hat keine Fläche (innerWidth 0): Seiten ordnen sich dann
 * falsch an, und ein Bildschirmfoto bleibt leer. Solange er nicht zu sehen
 * ist, bekommt er deshalb eine feste Fenstergröße über CDP.
 */
async function ensureLayout(host: AgentBrowserHost, tab: AgentTab): Promise<void> {
  if (host.shown(tab.id) || tab.emulated) return;
  const debug = tab.view.webContents.debugger;
  if (!debug.isAttached()) debug.attach('1.3');
  await debug.sendCommand('Emulation.setDeviceMetricsOverride', { ...HIDDEN_VIEWPORT, deviceScaleFactor: 1, mobile: false });
  tab.emulated = true;
}

/** Wird der Tab sichtbar, gilt wieder die echte Fläche der Seitenleiste. */
export function releaseLayout(tab: AgentTab): void {
  if (!tab.emulated) return;
  tab.emulated = false;
  const debug = tab.view.webContents.debugger;
  if (!debug.isAttached()) return;
  void debug.sendCommand('Emulation.clearDeviceMetricsOverride').catch(() => undefined).finally(() => { try { debug.detach(); } catch { /* schon getrennt */ } });
}

async function inWorld<T>(contents: WebContents, code: string): Promise<T> {
  return timeout(contents.executeJavaScriptInIsolatedWorld(WORLD, [{ code }]) as Promise<T>, 15_000, 'Die Seite hat nicht rechtzeitig geantwortet.');
}

/** Liest Text und (auf Wunsch) die bedienbaren Elemente; jedes Element bekommt eine Nummer für click/type. */
const READ_SCRIPT = (elements: boolean) => `(() => {
  const clean = (s) => String(s || '').replace(/[ \\t\\u00a0]+/g, ' ').replace(/\\s*\\n\\s*\\n\\s*/g, '\\n\\n').trim();
  const text = clean(document.body ? document.body.innerText : '');
  const out = { title: document.title, url: location.href, text, elements: [] };
  if (${elements}) {
    for (const old of document.querySelectorAll('[data-cortex-ref]')) old.removeAttribute('data-cortex-ref');
    const nodes = document.querySelectorAll('a[href], button, input:not([type=hidden]), textarea, select, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=checkbox], [role=option], [contenteditable=""], [contenteditable=true]');
    let n = 0;
    for (const el of nodes) {
      if (n >= 250) break;
      const box = el.getBoundingClientRect();
      if (!el.getClientRects().length || box.width < 1 || box.height < 1) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      el.setAttribute('data-cortex-ref', String(++n));
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'input' ? 'input:' + (el.type || 'text') : tag);
      const label = clean(el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('alt') || '').slice(0, 90);
      const extra = tag === 'a' ? ' → ' + el.href : (tag === 'input' || tag === 'textarea') && el.value ? ' = "' + String(el.value).slice(0, 60) + '"' : '';
      const off = box.bottom < 0 || box.top > innerHeight ? ' (außerhalb des Bildausschnitts)' : '';
      out.elements.push('[' + n + '] ' + role + ' "' + label + '"' + extra + (el.disabled ? ' (deaktiviert)' : '') + off);
    }
  }
  return out;
})()`;

/** Findet ein Element über Nummer, CSS-Selektor oder sichtbaren Text. */
const FIND = (target: { ref?: number; selector?: string; text?: string }) => `
  const target = ${JSON.stringify(target)};
  const candidates = () => [...document.querySelectorAll('a[href], button, input, textarea, select, summary, label, [role], [onclick], [contenteditable=""], [contenteditable=true]')];
  const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  let el = null;
  if (target.ref) el = document.querySelector('[data-cortex-ref="' + target.ref + '"]');
  else if (target.selector) el = document.querySelector(target.selector);
  else if (target.text) {
    const want = norm(target.text);
    const label = (e) => norm(e.getAttribute('aria-label') || e.innerText || e.value || e.getAttribute('placeholder') || e.getAttribute('title'));
    const all = candidates().filter(e => e.getClientRects().length);
    el = all.find(e => label(e) === want) || all.find(e => label(e).includes(want)) || null;
  }
`;

const CLICK_SCRIPT = (target: object) => `(() => {${FIND(target)}
  if (!el) return { error: 'Kein passendes Element gefunden. Mit browser_read und elements: true die Nummern holen.' };
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const opts = { bubbles: true, cancelable: true, composed: true, view: window };
  el.dispatchEvent(new PointerEvent('pointerdown', opts)); el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new PointerEvent('pointerup', opts)); el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.click();
  return { clicked: (el.innerText || el.value || el.getAttribute('aria-label') || el.tagName).toString().replace(/\\s+/g, ' ').trim().slice(0, 80) };
})()`;

const FOCUS_SCRIPT = (target: object, clear: boolean) => `(() => {${FIND(target)}
  if (!el) return { error: 'Kein passendes Eingabefeld gefunden. Mit browser_read und elements: true die Nummern holen.' };
  el.scrollIntoView({ block: 'center' });
  el.focus();
  if (${clear}) {
    if (typeof el.select === 'function') el.select();
    else if (el.isContentEditable) { const range = document.createRange(); range.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); }
  }
  return { focused: el.tagName.toLowerCase(), form: !!el.form };
})()`;

const SUBMIT_SCRIPT = `(() => {
  const el = document.activeElement;
  if (el && el.form) { el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit(); return true; }
  return false;
})()`;

function ownTab(host: AgentBrowserHost, conversationId: string, id: string, action: string): AgentTab | AgentBrowserAnswer {
  const tab = host.tabs.get(id);
  if (!tab || tab.view.webContents.isDestroyed()) return fail(`Tab ${id || '(ohne Id)'} gibt es nicht. browser_tabs zeigt die offenen Tabs.`);
  if (tab.owner !== conversationId) return fail(`Tab ${id} gehört ${tab.owner ? 'einem anderen Chat' : 'dem Nutzer'} — ${action} geht nur in eigenen Tabs. Öffne die Seite mit browser_open in einem eigenen Tab.`);
  return tab;
}

function anyTab(host: AgentBrowserHost, id: string): AgentTab | AgentBrowserAnswer {
  const tab = host.tabs.get(id);
  if (!tab || tab.view.webContents.isDestroyed()) return fail(`Tab ${id || '(ohne Id)'} gibt es nicht. browser_tabs zeigt die offenen Tabs.`);
  return tab;
}

const isAnswer = (value: AgentTab | AgentBrowserAnswer): value is AgentBrowserAnswer => !('view' in value);

async function load(tab: AgentTab, url: string): Promise<void> {
  tab.error = '';
  try { await timeout(tab.view.webContents.loadURL(url), LOAD_TIMEOUT_MS, 'Die Seite hat nicht rechtzeitig geladen.'); }
  catch (error) {
    // Eine Weiterleitung bricht den ersten Ladevorgang ab (ERR_ABORTED), die Seite kommt trotzdem.
    const message = error instanceof Error ? error.message : String(error);
    if (!/ERR_ABORTED|\(-3\)/.test(message)) tab.error = message;
  }
}

async function read(host: AgentBrowserHost, tab: AgentTab, args: Record<string, unknown>): Promise<AgentBrowserAnswer> {
  await ensureLayout(host, tab);
  const page = await inWorld<{ title: string; url: string; text: string; elements: string[] }>(tab.view.webContents, READ_SCRIPT(args.elements === true));
  const offset = Math.max(0, Math.floor(num(args.offset, 0)));
  const max = Math.min(60_000, Math.max(500, Math.floor(num(args.maxChars, TEXT_CHARS))));
  const slice = page.text.slice(offset, offset + max);
  const rest = page.text.length - offset - slice.length;
  const parts = [`Tab ${tab.id} · ${page.title || '(ohne Titel)'}\n${page.url}`, slice || '(kein Text auf der Seite)'];
  if (rest > 0) parts.push(`… ${rest} weitere Zeichen. Weiterlesen mit offset: ${offset + slice.length}.`);
  if (args.elements === true) parts.push(page.elements.length ? `Bedienbare Elemente (Nummer für browser_click / browser_type):\n${page.elements.join('\n')}` : 'Keine bedienbaren Elemente gefunden.');
  return { text: parts.join('\n\n') };
}

async function screenshot(host: AgentBrowserHost, tab: AgentTab): Promise<AgentBrowserAnswer> {
  await ensureLayout(host, tab);
  const contents = tab.view.webContents;
  const head = `Tab ${tab.id} · ${contents.getTitle()}\n${contents.getURL()}`;
  // Verborgen liefert capturePage nichts (UnknownVizError) — CDP zeichnet das Bild selbst.
  if (tab.emulated) {
    const shot = await timeout(contents.debugger.sendCommand('Page.captureScreenshot', { format: 'jpeg', quality: 72 }) as Promise<{ data: string }>, 15_000, 'Das Bildschirmfoto kam nicht rechtzeitig.');
    return { text: head, image: shot.data };
  }
  let image = await timeout(contents.capturePage(), 15_000, 'Das Bildschirmfoto kam nicht rechtzeitig.');
  if (image.isEmpty()) return fail('Das Bildschirmfoto blieb leer.');
  if (image.getSize().width > HIDDEN_VIEWPORT.width) image = image.resize({ width: HIDDEN_VIEWPORT.width });
  return { text: head, image: image.toJPEG(72).toString('base64') };
}

/** Eine Anfrage des MCP-Servers cortex_browser, im Auftrag des Chats `conversationId`. */
export async function agentBrowser(host: AgentBrowserHost, conversationId: string, request: Record<string, unknown>): Promise<AgentBrowserAnswer> {
  const tool = str(request.tool);
  const args = (request.args && typeof request.args === 'object' ? request.args : {}) as Record<string, unknown>;
  const tabId = str(args.tabId).trim();
  try {
    switch (tool) {
      case 'browser_tabs': {
        const all = [...host.tabs.values()].filter(tab => !tab.view.webContents.isDestroyed());
        const own = all.filter(tab => tab.owner === conversationId);
        const user = all.filter(tab => !tab.owner);
        const lines = [
          own.length ? `Deine Tabs (${own.length}/${AGENT_TAB_LIMIT}):\n${own.map(describe).join('\n')}` : 'Du hast keine Tabs offen.',
          user.length ? `Tabs des Nutzers (nur lesen und ansehen):\n${user.map(describe).join('\n')}` : '',
        ];
        return { text: lines.filter(Boolean).join('\n\n') };
      }
      case 'browser_open': {
        const url = host.validUrl(str(args.url));
        let tab: AgentTab;
        if (tabId) {
          const found = ownTab(host, conversationId, tabId, 'Navigieren');
          if (isAnswer(found)) return found;
          tab = found;
        } else {
          const count = [...host.tabs.values()].filter(entry => entry.owner === conversationId).length;
          if (count >= AGENT_TAB_LIMIT) return fail(`Schon ${count} eigene Tabs offen. Schließe erledigte mit browser_close oder navigiere einen vorhandenen mit tabId.`);
          tab = host.create(conversationId);
        }
        await load(tab, url);
        if (args.show === true) host.show(tab.id);
        const contents = tab.view.webContents;
        if (tab.error) return fail(`Tab ${tab.id}: ${url} ließ sich nicht laden — ${tab.error}`);
        return { text: `Tab ${tab.id} geladen · ${contents.getTitle() || '(ohne Titel)'}\n${contents.getURL()}\nLies ihn mit browser_read (elements: true für klickbare Elemente).` };
      }
      case 'browser_read': {
        const tab = anyTab(host, tabId);
        return isAnswer(tab) ? tab : read(host, tab, args);
      }
      case 'browser_screenshot': {
        const tab = anyTab(host, tabId);
        return isAnswer(tab) ? tab : screenshot(host, tab);
      }
      case 'browser_click': {
        const tab = ownTab(host, conversationId, tabId, 'Klicken');
        if (isAnswer(tab)) return tab;
        await ensureLayout(host, tab);
        const contents = tab.view.webContents;
        const waiting = settle(contents);
        const result = await inWorld<{ error?: string; clicked?: string }>(contents, CLICK_SCRIPT({ ref: num(args.ref, 0) || undefined, selector: str(args.selector) || undefined, text: str(args.text) || undefined }));
        if (result.error) return fail(result.error);
        await waiting;
        return { text: `Geklickt: „${result.clicked}“. Tab ${tab.id} zeigt jetzt ${contents.getTitle() || '(ohne Titel)'}\n${contents.getURL()}` };
      }
      case 'browser_type': {
        const tab = ownTab(host, conversationId, tabId, 'Tippen');
        if (isAnswer(tab)) return tab;
        await ensureLayout(host, tab);
        const contents = tab.view.webContents;
        const result = await inWorld<{ error?: string; form?: boolean }>(contents, FOCUS_SCRIPT({ ref: num(args.ref, 0) || undefined, selector: str(args.selector) || undefined, text: str(args.field) || undefined }, args.clear !== false));
        if (result.error) return fail(result.error);
        await contents.insertText(str(args.text));
        if (args.submit === true) {
          const waiting = settle(contents, 900);
          const submitted = await inWorld<boolean>(contents, SUBMIT_SCRIPT);
          if (!submitted) {
            contents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
            contents.sendInputEvent({ type: 'char', keyCode: '\r' });
            contents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
          }
          await waiting;
        }
        return { text: `Eingegeben${args.submit === true ? ' und abgeschickt' : ''}. Tab ${tab.id} zeigt ${contents.getTitle() || '(ohne Titel)'}\n${contents.getURL()}` };
      }
      case 'browser_eval': {
        const tab = ownTab(host, conversationId, tabId, 'JavaScript');
        if (isAnswer(tab)) return tab;
        const value = await timeout(tab.view.webContents.executeJavaScript(str(args.expression), true), 15_000, 'Das Skript lief zu lange.');
        let text: string;
        try { text = value === undefined ? 'undefined' : typeof value === 'string' ? value : JSON.stringify(value, null, 1); } catch { text = String(value); }
        return { text: text.length > TEXT_CHARS ? `${text.slice(0, TEXT_CHARS)}\n… gekürzt (${text.length} Zeichen)` : text };
      }
      case 'browser_show': {
        const tab = anyTab(host, tabId);
        if (isAnswer(tab)) return tab;
        host.show(tab.id);
        return { text: `Tab ${tab.id} steht jetzt vorn im Browser von Cortex.` };
      }
      case 'browser_close': {
        const ids = tabId === 'alle' || tabId === 'all'
          ? [...host.tabs.values()].filter(tab => tab.owner === conversationId).map(tab => tab.id)
          : [tabId];
        for (const id of ids) {
          const tab = ownTab(host, conversationId, id, 'Schließen');
          if (isAnswer(tab)) return tab;
        }
        for (const id of ids) host.close(id);
        return { text: ids.length ? `Geschlossen: ${ids.join(', ')}.` : 'Keine eigenen Tabs offen.' };
      }
      default:
        return fail(`Unbekanntes Werkzeug ${tool}`);
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}
