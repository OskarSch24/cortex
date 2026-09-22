import { useState } from 'preact/hooks';
import { Glyph } from '../../components/CortexIcons.js';
import { vscode } from '../../vscodeApi.js';
import type { SettingsContext } from '../SettingsApp.js';
import { appSetting, useApp, useNative } from '../store.js';
import { Button, Card, Empty, Page, Radio, Row, Search, Section, Select, Toggle } from '../ui.js';

/**
 * Browser mit seinen Unterseiten.
 *
 * Wirklich wirksam sind hier das Öffnungsziel für Links aus dem Chat und die
 * Agentenberechtigung „Browsen“ (cortex.browserAccess). Die Website-
 * Einstellungen folgen im Aufbau Chromium — der integrierte Browser von Cortex
 * ist die Vorschau von Code-OSS und kennt diese Rechte noch nicht; die Werte
 * werden gemerkt und so markiert.
 */

const PERMS: Record<string, { label: string; icon: string; offIcon: string; text: string; allow: string; block: string; blockSub?: string; listBlock: string; listAllow: string; device?: string; requests?: boolean; defaultAllow: boolean; summaryAllow: string; summaryBlock: string; add?: boolean }> = {
  standort: { label: 'Standort', icon: 'location', offIcon: 'locationOff', text: 'Websites verwenden deinen Standort normalerweise für relevante Funktionen oder Informationen, wie etwa Lokalnachrichten oder Geschäfte in deiner Nähe', allow: 'Websites dürfen nach meinem Standort fragen', block: 'Websites dürfen meinen Standort nicht sehen', listBlock: 'Dürfen meine Standortdaten nicht abrufen', listAllow: 'Dürfen meine Standortdaten abrufen', requests: true, defaultAllow: true, summaryAllow: 'Websites dürfen nach meinem Standort fragen', summaryBlock: 'Websites dürfen meinen Standort nicht sehen' },
  kamera: { label: 'Kamera', icon: 'camera', offIcon: 'cameraOff', text: 'Websites verwenden deine Videokamera normalerweise für Kommunikationsfunktionen wie Videochats', allow: 'Websites dürfen nachfragen, wenn sie meine Kamera verwenden möchten', block: 'Websites dürfen nicht meine Kamera verwenden', blockSub: 'Funktionen, die eine Kamera benötigen, funktionieren dann nicht', listBlock: 'Dürfen meine Kamera nicht verwenden', listAllow: 'Dürfen meine Kamera verwenden', device: 'Kamera von „MacBook“', defaultAllow: true, summaryAllow: 'Websites dürfen nachfragen, wenn sie meine Kamera verwenden möchten', summaryBlock: 'Websites dürfen nicht meine Kamera verwenden' },
  mikrofon: { label: 'Mikrofon', icon: 'mic', offIcon: 'micOff', text: 'Websites verwenden normalerweise dein Mikrofon für Kommunikationsfunktionen wie Videochats', allow: 'Websites dürfen nachfragen, wenn sie mein Mikrofon verwenden möchten', block: 'Websites dürfen mein Mikrofon nicht verwenden', blockSub: 'Funktionen, die ein Mikrofon benötigen, funktionieren dann nicht', listBlock: 'Dürfen mein Mikrofon nicht verwenden', listAllow: 'Dürfen mein Mikrofon verwenden', device: 'Systemmikrofon', defaultAllow: true, summaryAllow: 'Websites dürfen nachfragen, wenn sie mein Mikrofon verwenden möchten', summaryBlock: 'Websites dürfen mein Mikrofon nicht verwenden' },
  benachrichtigungen: { label: 'Benachrichtigungen', icon: 'bell', offIcon: 'bellOff', text: 'Websites senden normalerweise Benachrichtigungen, um dich über Eilmeldungen oder Chatnachrichten zu informieren.', allow: 'Websites können fragen, ob du Benachrichtigungen erhalten möchtest', block: 'Websites dürfen keine Benachrichtigungen senden', listBlock: 'Dürfen keine Benachrichtigungen senden', listAllow: 'Dürfen Benachrichtigungen senden', requests: true, add: true, defaultAllow: true, summaryAllow: 'Unerwünschte Anfragen minimieren (empfohlen)', summaryBlock: 'Websites dürfen keine Benachrichtigungen senden' },
  eingebettet: { label: 'Eingebettete Inhalte', icon: 'embed', offIcon: 'embed', text: 'Auf Websites, die du besuchst, können von anderen Websites stammende Inhalte eingebettet sein, z. B. Bilder, Werbung und Text. Diese anderen Websites dürfen die Berechtigung anfordern, Informationen zu nutzen, die sie zu deiner Person gespeichert haben, wenn du auf der Website surfst.', allow: 'Websites dürfen darum bitten, Informationen verwenden zu dürfen, die sie zu deiner Person gespeichert haben', block: 'Websites dürfen nicht darum bitten, Informationen verwenden zu dürfen, die sie zu deiner Person gespeichert haben', listBlock: 'Dürfen keine Informationen verwenden, die sie über dich gespeichert haben', listAllow: 'Darf Informationen nutzen, die zu deiner Person gespeichert wurden', defaultAllow: true, summaryAllow: 'Websites dürfen darum bitten, Informationen verwenden zu dürfen, die sie zu deiner Person gespeichert haben', summaryBlock: 'Websites dürfen nicht darum bitten' },
  javascript: { label: 'JavaScript', icon: 'code', offIcon: 'code', text: 'Websites verwenden normalerweise JavaScript zum Anzeigen von interaktiven Funktionen wie Videospielen oder Webformularen', allow: 'Websites dürfen JavaScript verwenden', block: 'Websites dürfen JavaScript nicht verwenden', listBlock: 'Dürfen JavaScript nicht verwenden', listAllow: 'Dürfen JavaScript verwenden', defaultAllow: true, summaryAllow: 'Websites dürfen JavaScript verwenden', summaryBlock: 'Websites dürfen JavaScript nicht verwenden' },
  bilder: { label: 'Bilder', icon: 'image', offIcon: 'image', text: 'Websites zeigen zur Veranschaulichung normalerweise Bilder an, z. B. Fotos in Onlineshops oder Nachrichtenartikeln', allow: 'Websites dürfen Bilder anzeigen', block: 'Websites dürfen keine Bilder anzeigen', blockSub: 'Funktionen, die Bilder erfordern, funktionieren dann nicht', listBlock: 'Dürfen keine Bilder anzeigen', listAllow: 'Dürfen Bilder anzeigen', defaultAllow: true, summaryAllow: 'Websites dürfen Bilder anzeigen', summaryBlock: 'Websites dürfen keine Bilder anzeigen' },
  popups: { label: 'Pop-ups und Weiterleitungen', icon: 'popout', offIcon: 'popout', text: 'Websites senden möglicherweise Pop-ups zum Anzeigen von Werbung oder bringen dich mithilfe von Weiterleitungen zu Websites, die du möglicherweise gar nicht besuchen möchtest', allow: 'Websites dürfen Pop-ups senden und Weiterleitungen verwenden', block: 'Websites dürfen keine Pop-ups senden oder Weiterleitungen verwenden', listBlock: 'Dürfen keine Pop-ups senden oder Weiterleitungen verwenden', listAllow: 'Dürfen Pop-ups senden und Weiterleitungen verwenden', defaultAllow: false, summaryAllow: 'Websites dürfen Pop-ups senden', summaryBlock: 'Websites dürfen keine Pop-up-Fenster senden oder Weiterleitungen verwenden' },
};

export function browserCrumb(sub: string[]): string[] {
  const names: Record<string, string> = { verlauf: 'Browserverlauf', kontakt: 'Kontaktinfo', website: 'Website-Einstellungen', cookies: 'Drittanbieter-Cookies', downloads: 'Downloadverlauf' };
  return sub.map(s => names[s] ?? PERMS[s]?.label ?? s);
}

export function BrowserPage({ ctx }: { ctx: SettingsContext }) {
  const [a, b] = ctx.sub;
  if (a === 'verlauf') return <BrowserVerlauf title="Browserverlauf" />;
  if (a === 'downloads') return <BrowserVerlauf title="Downloadverlauf" />;
  if (a === 'kontakt') return <KontaktInfo />;
  if (a === 'website' && b === 'cookies') return <Cookies />;
  if (a === 'website' && b && PERMS[b]) return <Permission id={b} />;
  if (a === 'website') return <WebsiteSettings ctx={ctx} />;
  return <BrowserMain ctx={ctx} />;
}

function BrowserMain({ ctx }: { ctx: SettingsContext }) {
  const [enabled, setEnabled] = useApp('browser.aktiv', true);
  const [target, setTarget] = useApp('browser.oeffnungsziel', 'cortex');
  const [local, setLocal] = useApp('browser.lokaleUrls', 'cortex');
  const [fullUrl, setFullUrl] = useApp('browser.volleUrl', false);
  const [shots, setShots] = useApp('browser.screenshots', 'immer');
  const [ask, setAsk] = useApp('browser.downloadFragen', false);
  const [dir] = useApp('browser.downloadOrdner', '');
  const [history, setHistory] = useApp('browser.verlaufZugriff', 'fragen');
  const [tools, setTools] = useApp('browser.websiteTools', true);
  const [downloads, setDownloads] = useApp('browser.agentDownloads', 'genehmigung');
  const [uploads, setUploads] = useApp('browser.agentUploads', 'genehmigung');
  const [cdp, setCdp] = useApp('browser.cdp', false);
  const [access, setAccess] = useNative('cortex.browserAccess', 'auf-ansage');
  const go = (...sub: string[]) => ctx.go({ id: 'browser', sub });
  const approval = [{ value: 'genehmigung', label: 'Genehmigung erforderlich' }, { value: 'erlaubt', label: 'Erlaubt' }, { value: 'blockiert', label: 'Blockiert' }];
  return <Page title="Browser" subtitle="Verwalte deine Einstellungen für die Browsernutzung und den Websitezugriff.">
    <Card class="cxs-first">
      <Row pending icon={<span class="cxs-plain-icon"><Glyph name="window" size={26} /></span>} title="Browser" sub="Lass Cortex den integrierten Browser steuern."><Toggle label="Browser" on={enabled} onChange={setEnabled} /></Row>
    </Card>
    <Section title="Allgemein" actions={<Button kind="ghost" disabled title="Der Import folgt noch.">Importieren …</Button>}>
      <Card>
        <Row title="Öffnungsziel für Web-URLs und Links" sub="Wo Links aus dem Chat standardmäßig geöffnet werden"><Select label="Öffnungsziel" value={target} onChange={setTarget} options={[{ value: 'cortex', label: 'Cortex' }, { value: 'default', label: 'Standardbrowser' }, { value: 'chrome', label: 'Google Chrome' }, { value: 'safari', label: 'Safari' }]} /></Row>
        <Row pending title="Standardziel zum Öffnen lokaler URLs" sub="Wo lokale Entwicklungsseiten standardmäßig geöffnet werden"><Select label="Lokale URLs" value={local} onChange={setLocal} options={[{ value: 'cortex', label: 'Cortex' }, { value: 'default', label: 'Standardbrowser' }]} /></Row>
        <Row pending title="Vollständige URL anzeigen" sub="Pfad, Abfrage und Fragment in der Adressleiste anzeigen"><Toggle label="Vollständige URL" on={fullUrl} onChange={setFullUrl} /></Row>
        <Row pending title="Browserdaten" sub="Browserverlauf, Websitedaten, Cache und Downloadverlauf im In-App-Browser löschen"><Button disabled title="Der integrierte Browser hält noch keinen eigenen Verlauf.">Browserdaten löschen</Button></Row>
        <Row pending title="Browsing-Verlauf" sub="Im integrierten Browser besuchte Seiten anzeigen und verwalten"><Button onClick={() => go('verlauf')}>Verwalten</Button></Row>
        <Row pending title="Screenshots von Anmerkungen" sub={<>Screenshots helfen Cortex, Kommentare besser zu verstehen<br />und darauf einzugehen, erhöhen aber die Tarifnutzung.</>}><Select label="Screenshots von Anmerkungen" value={shots} onChange={setShots} options={[{ value: 'immer', label: 'Immer einschließen' }, { value: 'ziehen', label: 'Nur bei Auswahl durch Ziehen' }]} /></Row>
      </Card>
    </Section>
    <Section title="Automatisches Ausfüllen und Passwörter">
      <Card>
        <Row pending title="Passwortmanager" sub="Gespeicherte Passwörter hinzufügen, löschen und bearbeiten"><Button disabled title="Cortex speichert keine Passwörter.">Verwalten</Button></Row>
        <Row pending title="Kontaktdaten" sub="Gespeicherte Adressen, Telefonnummern und E-Mail-Adressen hinzufügen, löschen und bearbeiten"><Button onClick={() => go('kontakt')}>Verwalten</Button></Row>
      </Card>
    </Section>
    <Section title="Downloads">
      <Card>
        <Row pending title="Speicherort" sub={dir || 'System-Downloadordner'}><Button onClick={() => vscode.postMessage({ kind: 'pickAppSettingFolder', key: 'browser.downloadOrdner' })}>Ändern</Button></Row>
        <Row pending title="Nachfragen, wo Downloads gespeichert werden sollen" sub="Speicherdialog für Downloads anzeigen, die du im integrierten Browser startest"><Toggle label="Nachfragen" on={ask} onChange={setAsk} /></Row>
        <Row pending title="Downloadverlauf" sub="Aus dem integrierten Browser heruntergeladene Dateien anzeigen und verwalten"><Button onClick={() => go('downloads')}>Verwalten</Button></Row>
      </Card>
    </Section>
    <Section title="Browserberechtigungen">
      <Card>
        <Row pending title="Website-Einstellungen" sub="Berechtigungen vormerken. Der integrierte Browser wendet diese Werte noch nicht an."><Button onClick={() => go('website')}>Verwalten</Button></Row>
        <Row pending title="Verlauf" sub="Lege fest, ob Cortex auf deinen integrierten Browserverlauf zugreifen kann"><Select label="Verlaufszugriff" value={history} onChange={setHistory} width={152} options={[{ value: 'fragen', label: 'Immer fragen' }, { value: 'erlaubt', label: 'Erlaubt' }, { value: 'nie', label: 'Nie' }]} /></Row>
        <Row pending title="Website-Tools aktivieren" sub={<>Zulassen, dass Cortex von Websites bereitgestellte Website-<br />Tools, einschließlich WebMCP, erkennen und aufrufen kann</>}><Toggle label="Website-Tools" on={tools} onChange={setTools} /></Row>
      </Card>
    </Section>
    <Section title="Agentenberechtigungen" subtitle="Standardberechtigungen auswählen und Ausnahmen für bestimmte Websites hinzufügen" actions={<Button kind="ghost" icon="plus" disabled title="Ausnahmen je Website folgen noch.">Hinzufügen</Button>}>
      <div class="cxs-table-wrap">
        <table class="cxs-table">
          <thead><tr><th>Website oder<br />Muster</th><th>Browsen</th><th>Downloads <PendingBrowserSetting /></th><th>Uploads <PendingBrowserSetting /></th></tr></thead>
          <tbody><tr>
            <td>Standard</td>
            <td><Select label="Browsen" align="left" value={access === 'immer' ? 'erlaubt' : access === 'nie' ? 'blockiert' : 'genehmigung'} onChange={v => setAccess(v === 'erlaubt' ? 'immer' : v === 'blockiert' ? 'nie' : 'auf-ansage')} options={approval} /></td>
            <td><Select label="Downloads" align="left" value={downloads} onChange={setDownloads} options={approval} /></td>
            <td><Select label="Uploads" align="left" value={uploads} onChange={setUploads} options={approval} /></td>
          </tr></tbody>
        </table>
      </div>
    </Section>
    <Section title="Entwicklermodus">
      <Card>
        <div class="cxs-row cxs-risk">
          <div class="cxs-row-text">
            <div class="cxs-risk-label"><Glyph name="shieldAlert" size={14} />Erhöhtes Risiko</div>
            <div class="cxs-row-title">Vollen CDP-Zugriff aktivieren<i class="cxs-pending" title="Gespeichert – Cortex nutzt diesen Wert noch nicht." /></div>
            <div class="cxs-row-sub">Cortex vollen Zugriff auf das Chrome DevTools Protocol (CDP) in verbundenen Browser-Use-Sitzungen zulassen. Mit vollem CDP-Zugriff kann Cortex sensible Browser-Interna einsehen und steuern, was deine Daten gefährden kann.</div>
          </div>
          <div class="cxs-row-control"><Toggle label="Vollen CDP-Zugriff" on={cdp} onChange={setCdp} /></div>
        </div>
      </Card>
    </Section>
  </Page>;
}

function BrowserVerlauf({ title }: { title: string }) {
  const [query, setQuery] = useState('');
  return <Page title={title} preview subtitle="Diese Übersicht ist noch nicht mit dem integrierten Browser verbunden.">
    <Search value={query} onInput={setQuery} placeholder={`${title} durchsuchen`} class="big cxs-first" />
    <Section title={title === 'Browserverlauf' ? 'Gesamter Verlauf' : 'Alle Downloads'} actions={<Button kind="ghost" disabled>Browserdaten löschen</Button>}>
      <Card><div class="cxs-card-empty">{title === 'Browserverlauf' ? 'Der Browserverlauf kann hier noch nicht angezeigt werden.' : 'Der Downloadverlauf kann hier noch nicht angezeigt werden.'}</div></Card>
    </Section>
  </Page>;
}

function KontaktInfo() {
  const [save, setSave] = useApp('browser.adressenSpeichern', true);
  const [confirm, setConfirm] = useApp('browser.emailBestaetigen', true);
  return <div class="cxs-chromium">
    <div class="cxs-chromium-head"><h1>Kontaktdaten <PreviewBrowserSettings /></h1><span class="cxs-help" title="Hilfe"><Glyph name="help" size={16} /></span></div>
    <div class="cxs-chromium-card"><div class="cxs-chromium-row"><div><span>Adressen für Autofill speichern</span><small>Umfasst Informationen wie Telefonnummern, E-Mail-Adressen und Lieferadressen</small></div><Toggle label="Adressen speichern" on={save} onChange={setSave} /></div></div>
    <div class="cxs-chromium-card"><div class="cxs-chromium-row"><div><span class="dim">Adressen</span></div><Button kind="outline" disabled title="Folgt noch.">Hinzufügen</Button></div><p class="cxs-chromium-empty">Hier werden gespeicherte Adressen angezeigt</p></div>
    <div class="cxs-chromium-card"><div class="cxs-chromium-row"><div><span class="dim">Bestätigte E-Mail-Adresse</span></div></div><div class="cxs-chromium-row"><div><span>E-Mail-Adressen automatisch bestätigen</span></div><Toggle label="Automatisch bestätigen" on={confirm} onChange={setConfirm} /></div><p class="cxs-chromium-empty">Bestätigte E-Mail-Adressen werden hier angezeigt</p></div>
  </div>;
}

function WebsiteSettings({ ctx }: { ctx: SettingsContext }) {
  useApp('browser.perm.standort', true);
  const [more, setMore] = useState(false);
  const [moreContent, setMoreContent] = useState(false);
  const [cleanup, setCleanup] = useApp('browser.permsAufraeumen', true);
  const summary = (id: string) => { const p = PERMS[id]!; return `Vorgemerkt: ${globalAllow(id) ? p.summaryAllow : p.summaryBlock}`; };
  const open = (id: string) => ctx.go({ id: 'browser', sub: ['website', id] });
  const line = (id: string) => <button type="button" class="cxs-chromium-link" key={id} onClick={() => open(id)}><Glyph name={PERMS[id]!.icon} size={18} /><div><span>{PERMS[id]!.label}</span><small>{summary(id)}</small></div><Glyph name="chevron" size={14} /></button>;
  return <div class="cxs-chromium">
    <div class="cxs-chromium-head"><h1>Website-Einstellungen <PreviewBrowserSettings /></h1><span class="cxs-help" title="Hilfe"><Glyph name="help" size={16} /></span></div>
    <h2>Letzte Aktivität</h2>
    <div class="cxs-chromium-card"><p class="cxs-chromium-empty">Keine vor Kurzem geänderten Berechtigungen</p><button type="button" class="cxs-chromium-link plain" disabled><div><span>Nach Websites sortierte Berechtigungen und gespeicherte Daten aufrufen</span></div><Glyph name="chevron" size={14} /></button></div>
    <h2>Berechtigungen</h2>
    <div class="cxs-chromium-card">
      {['standort', 'kamera', 'mikrofon', 'benachrichtigungen', 'eingebettet'].map(line)}
      <button type="button" class="cxs-chromium-link plain" aria-expanded={more} onClick={() => setMore(v => !v)}><div><span>Zusätzliche Berechtigungen</span></div><span class={`cxs-rot ${more ? 'up' : ''}`}><Glyph name="chevronDown" size={14} /></span></button>
      {more && <p class="cxs-chromium-empty">Weitere Berechtigungen folgen, sobald der integrierte Browser sie abfragt.</p>}
    </div>
    <h2>Inhalte</h2>
    <div class="cxs-chromium-card">
      <button type="button" class="cxs-chromium-link" onClick={() => ctx.go({ id: 'browser', sub: ['website', 'cookies'] })}><Glyph name="cookie" size={18} /><div><span>Drittanbieter-Cookies</span><small>{appAllowCookies() ? 'Vorgemerkt: Drittanbieter-Cookies zulassen' : 'Vorgemerkt: Drittanbieter-Cookies blockieren'}</small></div><Glyph name="chevron" size={14} /></button>
      {['javascript', 'bilder', 'popups'].map(line)}
      <button type="button" class="cxs-chromium-link plain" aria-expanded={moreContent} onClick={() => setMoreContent(v => !v)}><div><span>Zusätzliche Inhaltseinstellungen</span></div><span class={`cxs-rot ${moreContent ? 'up' : ''}`}><Glyph name="chevronDown" size={14} /></span></button>
      {moreContent && <p class="cxs-chromium-empty">Weitere Inhaltseinstellungen folgen mit dem integrierten Browser.</p>}
      <div class="cxs-chromium-row"><div><span>Berechtigungen für nicht verwendete Websites automatisch entfernen</span><small>Erlaube Cortex zum Schutz deiner Daten, Berechtigungen von Websites zu entfernen, die du in letzter Zeit nicht besucht hast.</small></div><Toggle label="Automatisch entfernen" on={cleanup} onChange={setCleanup} /></div>
    </div>
  </div>;
}

function PendingBrowserSetting() {
  return <i class="cxs-pending" title="Gespeichert – der integrierte Browser nutzt diesen Wert noch nicht." aria-label="noch ohne Wirkung" />;
}
function PreviewBrowserSettings() {
  return <span class="cxs-preview" title="Cortex speichert diese Werte schon, der integrierte Browser wendet sie noch nicht an.">Vorschau</span>;
}

const globalAllow = (id: string) => appSetting<boolean>(`browser.perm.${id}`, PERMS[id]!.defaultAllow);
const appAllowCookies = () => appSetting<boolean>('browser.cookies', true);

function Permission({ id }: { id: string }) {
  const p = PERMS[id]!;
  const [allow, setAllow] = useApp(`browser.perm.${id}`, p.defaultAllow);
  const [requests, setRequests] = useApp(`browser.perm.${id}.anfragen`, 'unerwuenscht');
  const [device, setDevice] = useApp(`browser.perm.${id}.geraet`, 'standard');
  const [filter, setFilter] = useState('');
  return <div class="cxs-chromium">
    <div class="cxs-chromium-head"><h1>{p.label} <PreviewBrowserSettings /></h1><label class="cxs-chromium-filter"><Glyph name="filter" size={14} /><input placeholder="Websites auf der Seite filtern" value={filter} onInput={e => setFilter(e.currentTarget.value)} /></label></div>
    {p.device && <div class="cxs-device"><Select label="Gerät" align="left" value={device} onChange={setDevice} options={[{ value: 'standard', label: p.device }]} /></div>}
    <p class="cxs-chromium-text">{p.text}</p>
    <h3>Standardeinstellung</h3>
    <p class="cxs-chromium-text small">Diese Auswahl wird gespeichert. Der integrierte Browser wendet sie noch nicht an.</p>
    <div class="cxs-radios">
      <Radio checked={allow} onChange={() => setAllow(true)} icon={p.icon}>{p.allow}</Radio>
      <Radio checked={!allow} onChange={() => setAllow(false)} icon={p.offIcon} sub={p.blockSub}>{p.block}</Radio>
    </div>
    {p.requests && <>
      <h3>Wie sollen Anfragen angezeigt werden?</h3>
      <div class="cxs-radios plain">
        <Radio checked={requests === 'minimieren'} onChange={() => setRequests('minimieren')}>Alle Anfragen in der Adressleiste minimieren</Radio>
        <Radio checked={requests === 'unerwuenscht'} onChange={() => setRequests('unerwuenscht')}>Unerwünschte Anfragen minimieren (empfohlen)</Radio>
        <Radio checked={requests === 'maximieren'} onChange={() => setRequests('maximieren')}>Alle Anfragen maximieren</Radio>
      </div>
    </>}
    <h3 class="gap">Benutzerdefinierte Einstellungen</h3>
    <p class="cxs-chromium-text small">Für die unten aufgeführten Websites wird eine benutzerdefinierte Einstellung statt der Standardeinstellung verwendet</p>
    {[p.listBlock, p.listAllow].map(title => <div class="cxs-custom-list" key={title}>
      <div class="cxs-chromium-row flat"><span>{title}</span>{p.add && <Button kind="outline" disabled title="Folgt noch.">Hinzufügen</Button>}</div>
      <p class="cxs-chromium-empty">Keine Websites hinzugefügt</p>
    </div>)}
  </div>;
}

function Cookies() {
  const [allow, setAllow] = useApp('browser.cookies', true);
  const [dnt, setDnt] = useApp('browser.doNotTrack', false);
  const [open, setOpen] = useState<'allow' | 'block' | undefined>('allow');
  return <div class="cxs-chromium">
    <div class="cxs-chromium-head"><h1>Drittanbieter-Cookies <PreviewBrowserSettings /></h1><span class="cxs-help" title="Hilfe"><Glyph name="help" size={16} /></span><label class="cxs-chromium-filter"><Glyph name="filter" size={14} /><input placeholder="Websites auf der Seite filtern" /></label></div>
    <p class="cxs-chromium-text">Auf einer Website, die du besuchst, können Inhalte von anderen Websites eingebettet sein, z. B. Bilder, Werbung und Text. Cookies, die von diesen anderen Websites gesetzt werden, werden als Drittanbieter-Cookies bezeichnet.</p>
    <div class="cxs-expander">
      <div class="cxs-expander-head"><Radio checked={allow} onChange={() => setAllow(true)}>Drittanbieter-Cookies zulassen</Radio><button type="button" class="cxs-icon-button" aria-label="Details" onClick={() => setOpen(open === 'allow' ? undefined : 'allow')}><span class={`cxs-rot ${open === 'allow' ? 'up' : ''}`}><Glyph name="chevronDown" size={14} /></span></button></div>
      {open === 'allow' && <ul><li><Glyph name="cookie" size={16} />Websites können Drittanbieter-Cookies verwenden, um Inhalte und Werbung zu personalisieren und Informationen zu deinen Aktivitäten auf anderen Websites zu erhalten</li><li><Glyph name="card" size={16} />Websitefunktionen, die auf Drittanbieter-Cookies angewiesen sind, sollten wie erwartet funktionieren</li><li><Glyph name="incognito" size={16} />Wenn du im Inkognitomodus bist, würde ein angebundener Browser Drittanbieter-Cookies verhindern</li></ul>}
      <div class="cxs-expander-head"><Radio checked={!allow} onChange={() => setAllow(false)}>Drittanbieter-Cookies blockieren</Radio><button type="button" class="cxs-icon-button" aria-label="Details" onClick={() => setOpen(open === 'block' ? undefined : 'block')}><span class={`cxs-rot ${open === 'block' ? 'up' : ''}`}><Glyph name="chevronDown" size={14} /></span></button></div>
      {open === 'block' && <ul><li><Glyph name="cookie" size={16} />Nach einer künftigen Anbindung: Websites dürfen keine Drittanbieter-Cookies setzen oder lesen</li><li><Glyph name="card" size={16} />Einige Websitefunktionen funktionieren dann eventuell nicht</li></ul>}
    </div>
    <h3>Erweitert</h3>
    <div class="cxs-chromium-row flat"><Glyph name="forward" size={18} /><div><span>Bei Browserzugriffen eine „Do Not Track“-Anforderung mitsenden</span><small>Bei dieser Anfrage ändern Websites ihr Verhalten nicht immer</small></div><Toggle label="Do Not Track" on={dnt} onChange={setDnt} /></div>
    <button type="button" class="cxs-chromium-link plain bordered" disabled><div><span>Alle Websitedaten und -berechtigungen ansehen</span></div><Glyph name="chevron" size={14} /></button>
    <div class="cxs-custom-list">
      <div class="cxs-chromium-row flat top"><div><span>Websites, die Drittanbieter-Cookies verwenden dürfen</span><small>Dies betrifft die hier aufgeführten Websites. Wenn du „[*.]“ vor einem Domainnamen einfügst, wird eine Ausnahme für die gesamte Domain erstellt. Wenn du beispielsweise „[*.]google.com“ hinzufügst, können Drittanbieter-Cookies auch für „mail.google.com“ aktiv sein, da diese Subdomain zu „google.com“ gehört.</small></div><Button kind="outline" disabled title="Folgt noch.">Hinzufügen</Button></div>
      <p class="cxs-chromium-empty">Keine Websites hinzugefügt</p>
    </div>
  </div>;
}

export { Empty };
