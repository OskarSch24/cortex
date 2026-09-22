import re
"""Plugins-Seite: Funktion und Pixelabnahme gegen die vermessene Referenz.

Die Maße stammen aus der Bildschirmaufnahme (Frames unter
`.cache/plugins-reference/`, logisch 1710x1112). Sie stehen hier als Zahlen und
nicht als Bildvergleich: ein Screenshot-Diff sagt „anders“, diese Prüfung sagt,
welches Maß um wie viel abweicht.

Kein Desktop-Browser: ausschließlich chromium-headless-shell über
`tests/headless_browser.py`, wie in AGENTS.md festgelegt.
"""
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

BASE = 'http://127.0.0.1:4173/dev/preview.html?mode=agent'
OUT = Path(__file__).resolve().parents[1] / 'docs/screenshots'
OUT.mkdir(parents=True, exist_ok=True)

# Aus der Referenz gemessen. Toleranz 1 px, weil Unterpixel-Layout rundet.
BUDGET = {
    'Inhaltsspalte': 728,
    'Rasterspalte': 344,
    'Rasterspalt': 40,
    'Zeilenhöhe': 60,
    'Zeilenraster': 68,
    'Kachel': 32,
    'Kachel Leiste': 36,
    'Suchfeld': 32,
    'Kachel gross': 56,
    'Banner': 240,
}

with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1710, 'height': 1112})
    errors = []
    page.on('pageerror', lambda e: (errors.append(str(e)), print('Browser-Fehler:', e, flush=True)))
    console = []
    page.on('console', lambda m: console.append(m) if m.type == 'error' else None)

    # Die echte CSP des Hosts übernehmen — die Vorschau allein würde ein
    # blockiertes Zeichen stillschweigend verbergen.
    host_source = (Path(__file__).resolve().parents[1]
                   / 'engine/packages/vscode/src/panel/chatViewProvider.ts').read_text()
    policy = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', host_source).group(1)
    policy = (policy.replace('${webview.cspSource}', 'http://127.0.0.1:4173')
                    .replace('${nonce}', 'cortex-ui-test'))

    def apply_host_policy(route):
        response = route.fetch()
        html = response.text().replace(
            '<head>', '<head>\n<meta http-equiv="Content-Security-Policy" content="' + policy + '">')
        html = re.sub(r'<script(?=[\s>])', '<script nonce="cortex-ui-test"', html)
        route.fulfill(response=response, body=html)

    page.route('**/dev/preview.html?*', apply_host_policy)

    def messages(kind):
        return page.evaluate('(k) => (window.__hostMessages || []).filter(m => m.kind === k)', kind)

    def visit():
        page.goto(BASE)
        page.wait_for_load_state('networkidle')
        page.locator('#harness').evaluate('(el) => el.remove()')
        page.get_by_role('button', name='Plugins', exact=True).click()
        expect(page.locator('.cx-plugins')).to_be_visible()

    def rect(selector, index=0):
        return page.locator(selector).nth(index).evaluate(
            '(el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x, y: r.y }; }')

    checked = []

    def budget(name, actual):
        want = BUDGET[name]
        assert abs(actual - want) <= 1, f'{name}: {actual:.2f} px statt {want} px'
        checked.append(f'{name} {actual:.1f}≈{want}')

    visit()

    # ── Inhalt ────────────────────────────────────────────────────────────────
    expect(page.get_by_role('heading', name='Plugins', exact=True)).to_be_visible()
    expect(page.locator('.cx-plugin-section')).not_to_have_count(0)
    # Der Katalog kommt aus dem Bündel; ohne ihn wäre die Seite eine leere Hülle.
    rows = page.locator('.cx-plugin-row')
    assert rows.count() > 20, f'nur {rows.count()} Katalogzeilen gerendert'

    # Installiert spiegelt die Fixture-mcp.json, nicht eine gemerkte Klickspur.
    expect(page.locator('.cx-plugin-installed button')).not_to_have_count(0)
    # Alles Eingerichtete steht in einer Reihe, ohne Beschriftung darunter:
    # Katalogeintrag, selbst eingetragener Server und der eingebaute Konnektor.
    tiles = page.locator('.cx-plugin-installed > button')
    # Beide Dateien gelten zusammen: context7 aus der persönlichen zählt mit.
    # Die zwei Einträge mit offenem Schlüssel stehen nicht oben — erst
    # verbinden, dann erscheint das Zeichen in der Reihe.
    assert tiles.count() == 7, f'{tiles.count()} Kacheln statt 7'
    hints = ' | '.join(tiles.evaluate_all('els => els.map(e => e.getAttribute("title"))'))
    assert 'documents' in hints, hints
    assert 'Selbst eingetragen' in hints, hints
    # Keine Textzeile in diesem Abschnitt — die Vorlage hat dort nur Icons.
    assert page.locator('.cx-plugin-installed .cx-plugin-text').count() == 0
    # Ein Eintrag mit leerem Schlüssel behauptet nicht, einsatzbereit zu sein.
    expect(page.get_by_role('button', name='Schlüssel eintragen').first).to_be_visible()

    # ── Verbindungszustand je Zeile ───────────────────────────────────────────
    # „Verbunden“ steht nur, wo die letzte Prüfung Werkzeuge geliefert hat; ein
    # Server, der nicht antwortet, sagt das, statt still installiert zu wirken.
    def row_of(name):
        return page.locator('.cx-plugin-row', has=page.get_by_role('button', name=re.compile('^' + name))).first
    expect(row_of('Figma').locator('.cx-plugin-state')).to_have_text('Verbunden')
    assert 'Werkzeuge' in row_of('Figma').locator('.cx-plugin-state').get_attribute('title')
    expect(row_of('Sentry').locator('.cx-plugin-state.bad')).to_have_text('Fehler')
    # Was nicht arbeitet, steht oben unter „Einrichtung offen“ — der Fehler auch.
    setup = page.locator('.cx-plugin-section', has=page.get_by_role('heading', name='Einrichtung offen'))
    expect(setup.locator('.cx-plugin-row')).to_have_count(3)
    # Die Leiste markiert nur, was verbunden war und nicht mehr antwortet: rot
    # für den Fehler. Offene Schlüssel stehen gar nicht erst in der Reihe.
    expect(page.locator('.cx-plugin-installed .cx-plugin-badge.rot')).to_have_count(1)
    expect(page.locator('.cx-plugin-installed .cx-plugin-badge.gelb')).to_have_count(0)
    expect(page.locator('.cx-plugin-installed .cx-plugin-badge')).to_have_count(1)

    # ── Ein Dienst, eine Karte ────────────────────────────────────────────────
    # YouTube hat zwei Zugänge und steht trotzdem einmal da — in der Leiste und in der Suche.
    youtube_tiles = [h for h in page.locator('.cx-plugin-installed > button').evaluate_all('els => els.map(e => e.getAttribute("title"))') if h.startswith('YouTube')]
    # In der Fixture ist YouTube noch nicht verbunden — also höchstens eine Kachel, hier keine.
    assert len(youtube_tiles) <= 1, youtube_tiles
    page.locator('.cx-plugin-search input').fill('youtube')
    expect(page.locator('.cx-plugin-row')).to_have_count(1)
    page.locator('.cx-plugin-search input').fill('')

    # ── Eigene Server mit Zustand ─────────────────────────────────────────────
    own = page.locator('.cx-plugin-section', has=page.get_by_role('heading', name='Eigene Server'))
    expect(own.locator('.cx-plugin-row')).to_have_count(2)
    own_docs = own.locator('.cx-plugin-row', has_text='documents')
    own_docs.get_by_role('button', name='Prüfen').click()
    assert messages('checkServer')[-1]['server'] == 'documents'
    expect(own_docs.locator('.cx-plugin-state')).to_have_text('Verbunden', timeout=3000)

    # ── Nie geprüft ist nicht „prüft gerade“ ─────────────────────────────────
    # Ein installierter Server ohne Ergebnis zeigt keinen endlosen Kreisel,
    # sondern bietet die Prüfung an.
    page.locator('.cx-plugin-search input').fill('Gedächtnis')
    expect(row_of('Gedächtnis').locator('.cx-plugin-state')).to_have_count(0)
    row_of('Gedächtnis').get_by_role('button', name='Prüfen').click()
    assert messages('checkServer')[-1]['server'] == 'memory'
    expect(row_of('Gedächtnis').locator('.cx-plugin-state')).to_have_text('Verbunden', timeout=3000)
    page.locator('.cx-plugin-search input').fill('')
    # Vektor (früher Database Studio) steht in keiner mcp.json: es ist die Datenbankintegration
    # selbst und muss trotzdem sichtbar sein — sonst wirkt die Seite, als gäbe
    # es den Konnektor nicht.
    assert 'Vektor' in hints, hints
    # Die Übersicht trägt keine Zahlen an den Überschriften — die Vorlage auch nicht.
    assert page.locator('.cx-plugin-section-head b').count() == 0
    # „Installiert“ führt stattdessen das Zahnrad zur Datei.
    expect(page.locator('.cx-plugin-section-head').first.get_by_role(
        'button', name='mcp.json bearbeiten')).to_be_visible()
    # Und die Seite zeichnet keinen eigenen Fensterbalken: dort liegen die
    # Werkzeug-Icons der Workbench und würden sich überdecken.
    assert page.locator('.cx-plugins .cx-topbar').count() == 0

    # Der Spiegelbericht je Konto bleibt der Kern — ein Profil ist rot.
    expect(page.locator('.cx-plugin-targets span.failed')).to_have_count(1)

    # ── Pixelabnahme ──────────────────────────────────────────────────────────
    budget('Inhaltsspalte', rect('.cx-plugins-col')['w'])
    budget('Suchfeld', rect('.cx-plugin-search input')['h'])
    # Das erste Raster mit mindestens drei Zeilen — nur dort lassen sich Spalt
    # und Zeilenraster zugleich messen.
    cells = page.evaluate('''() => {
      const grid = [...document.querySelectorAll('.cx-plugin-grid')]
        .find(el => el.children.length >= 3);
      if (!grid) return null;
      const kids = [...grid.children].map(c => c.getBoundingClientRect());
      return { first: kids[0], second: kids[1], third: kids[2] };
    }''')
    assert cells, 'kein Raster mit drei Zeilen gefunden'
    budget('Rasterspalte', cells['first']['width'])
    budget('Rasterspalt', cells['second']['x'] - (cells['first']['x'] + cells['first']['width']))
    budget('Zeilenhöhe', cells['first']['height'])
    budget('Zeilenraster', cells['third']['y'] - cells['first']['y'])
    budget('Kachel', rect('.cx-plugin-row .cx-plugin-tile')['w'])
    budget('Kachel Leiste', rect('.cx-plugin-installed .cx-plugin-tile')['w'])
    # Die Trennlinie unter jeder Abschnittsüberschrift ist genau ein Pixel.
    hairline = page.locator('.cx-plugin-section-head').first.evaluate(
        '(el) => parseFloat(getComputedStyle(el).borderBottomWidth)')
    assert abs(hairline - 1) < 0.01, f'Trennlinie {hairline} px statt 1 px'
    checked.append('Trennlinie 1')

    page.screenshot(path=str(OUT / 'plugins.png'))

    # ── Suche ─────────────────────────────────────────────────────────────────
    page.locator('.cx-plugin-search input').fill('figma')
    expect(page.get_by_role('heading', name='Treffer')).to_be_visible()
    assert page.locator('.cx-plugin-row').count() >= 1
    page.locator('.cx-plugin-search input').fill('gibtesnichtxyz')
    expect(page.locator('.cx-plugin-empty')).to_contain_text('Kein Plugin passt')
    page.locator('.cx-plugin-search input').fill('')

    # ── Produktseite ──────────────────────────────────────────────────────────
    page.get_by_role('button', name=re.compile(r'^Figma')).first.click()
    expect(page.get_by_role('heading', name='Figma', exact=True)).to_be_visible()
    expect(page.get_by_role('heading', name='Informationen')).to_be_visible()
    # Figma ist der einzige Eintrag mit belegten Skills.
    expect(page.get_by_role('heading', name='Skills')).to_be_visible()
    budget('Kachel gross', rect('.cx-plugin-tile.lg')['w'])
    budget('Banner', rect('.cx-plugin-banner')['h'])
    # Der Zustand steht oben, mit Beleg: wie viele Werkzeuge, wann geprüft.
    status = page.locator('.cx-plugin-status')
    expect(status).to_have_class(re.compile(r'\bok\b'))
    expect(status).to_contain_text('Verbunden · 3 Werkzeuge')
    expect(status).to_contain_text('Zuletzt geprüft um')
    # Figma meldet sich über die CLIs an: eine Zeile je Konto, jede mit eigenem Knopf.
    accounts = status.locator('.cx-plugin-accounts li')
    expect(accounts).to_have_count(3)
    expect(accounts.nth(0)).to_contain_text('Claude Code · Business')
    expect(accounts.nth(0).get_by_role('button', name='Neu verbinden')).to_be_visible()
    expect(accounts.nth(2).get_by_role('button', name='Prüfen')).to_be_visible()
    codex_row = accounts.nth(1)
    expect(codex_row).to_have_class(re.compile(r'\bfehler\b'))
    page.screenshot(path=str(OUT / 'plugins-figma-konten.png'))
    codex_row.get_by_role('button', name='Verbinden').click()
    assert messages('loginPlugin')[-1] == {'kind': 'loginPlugin', 'id': 'figma', 'account': 'acc-codex'}
    # Während der Anmeldung steht sie in der Zeile, die anderen Knöpfe warten.
    expect(codex_row).to_contain_text('Im Browser bei Figma bestätigen')
    expect(codex_row.get_by_role('button', name='Browser erneut öffnen')).to_be_visible()
    expect(accounts.nth(0).get_by_role('button', name='Neu verbinden')).to_be_disabled()
    expect(codex_row).to_have_class(re.compile(r'\bverbunden\b'), timeout=3000)
    expect(codex_row.get_by_role('button', name='Neu verbinden')).to_be_visible()
    accounts.nth(2).get_by_role('button', name='Prüfen').click()
    assert messages('loginPlugin')[-1]['account'] == 'acc-grok'
    expect(accounts.nth(2)).to_contain_text('40 Werkzeuge', timeout=3000)
    expect(page.get_by_role('heading', name='Werkzeuge')).to_be_visible()
    expect(page.locator('.cx-plugin-tools li')).to_have_count(3)
    page.screenshot(path=str(OUT / 'plugins-detail.png'))

    # Ein Beispielprompt führt in eine Aufgabe, statt nur hübsch dazustehen.
    page.locator('.cx-plugin-prompt').first.click()
    expect(page.locator('.composer textarea')).not_to_have_value('')
    # Zurück über die Seitenleiste: sie führt an den Anfang des Bereichs.
    page.locator('.cx-nav', has_text='Plugins').click()
    expect(page.get_by_role('heading', name='Installiert')).to_be_visible()

    # ── Fehler: der Grund steht da, und erneut prüfen lässt sich direkt ──────
    row_of('Sentry').locator('.cx-plugin-state.bad').click()
    status = page.locator('.cx-plugin-status')
    expect(status).to_have_class(re.compile(r'\bbad\b'))
    expect(status).to_contain_text('HTTP 503')
    expect(status.locator('pre')).to_contain_text('upstream connect error')
    status.get_by_role('button', name='Protokoll').click()
    assert messages('showPluginLog')[-1]['server'] == 'sentry'
    status.get_by_role('button', name='Erneut prüfen').click()
    assert messages('checkServer'), 'Erneut prüfen erreicht den Host nicht'
    expect(status).to_contain_text('Verbunden · 2 Werkzeuge', timeout=3000)
    # Nach der Prüfung steht da, was die CLIs selbst sehen.
    expect(status.locator('.cx-plugin-clis li')).to_have_count(2)
    expect(status.locator('.cx-plugin-clis li.verbunden')).to_contain_text('claude:studio')
    page.get_by_role('button', name='Zurück zur Übersicht').click()

    # ── Schlüssel: eintragen, speichern, geprüft ─────────────────────────────
    row_of('Brave Search').get_by_role('button', name='Schlüssel eintragen').click()
    expect(page.get_by_role('heading', name='Zugangsdaten')).to_be_visible()
    save = page.get_by_role('button', name='Speichern und prüfen')
    expect(save).to_be_disabled()
    key = page.get_by_label('API-Schlüssel')
    # Verdeckt: ein Schlüssel steht nie im Klartext auf dem Bildschirm.
    assert key.get_attribute('type') == 'password'
    key.fill('BSA-test-123')
    expect(save).to_be_enabled()
    save.click()
    sent = messages('setPluginValues')
    assert sent and sent[-1]['values'] == {'BRAVE_API_KEY': 'BSA-test-123'}, sent
    expect(page.locator('.cx-plugin-status')).to_contain_text('Verbunden', timeout=3000)
    # Hinterlegt heißt: das Feld sagt es, zeigt aber keinen Wert.
    expect(key).to_have_value('')
    expect(key).to_have_attribute('placeholder', re.compile('Hinterlegt'))
    page.screenshot(path=str(OUT / 'plugins-schluessel.png'))
    page.get_by_role('button', name='Zurück zur Übersicht').click()

    # „+“ bei einem Schlüssel-Plugin führt zu den Feldern statt zu einem halben Eintrag.
    page.locator('.cx-plugin-search input').fill('tavily')
    page.get_by_role('button', name='Tavily installieren').click()
    expect(page.get_by_role('heading', name='Tavily', exact=True)).to_be_visible()
    expect(page.get_by_role('heading', name='Zugangsdaten')).to_be_visible()
    expect(page.locator('.cx-plugin-actions').get_by_role('button', name='Plugin installieren')).to_be_disabled()
    expect(page.get_by_role('button', name='Speichern und installieren')).to_be_disabled()
    page.get_by_role('button', name='Zurück zur Übersicht').click()

    # ── YouTube: eine Karte, zwei Zugänge ────────────────────────────────────
    page.locator('.cx-plugin-search input').fill('youtube')
    page.get_by_role('button', name=re.compile(r'^YouTube')).first.click()
    expect(page.get_by_role('heading', name='YouTube', exact=True)).to_be_visible()
    key_tab = page.get_by_role('tab', name='API-Schlüssel')
    account_tab = page.get_by_role('tab', name='Google-Konto')
    expect(key_tab).to_have_attribute('aria-selected', 'true')
    expect(page.get_by_role('heading', name='Zugangsdaten')).to_be_visible()
    # Kein doppelter Variablenname als Platzhalter über dem Namen selbst.
    expect(page.get_by_label('API-Schlüssel')).to_have_attribute('placeholder', 'API-Schlüssel einfügen')

    # ── Eigener OAuth-Client: Datei, Finder, von Hand ────────────────────────
    account_tab.click()
    expect(page.get_by_role('tab', name='Google-Konto')).to_have_attribute('aria-selected', 'true')
    expect(page.get_by_role('heading', name='OAuth-Client')).to_be_visible()
    expect(page.locator('.cx-plugin-redirect code')).to_have_text('http://127.0.0.1:38127/callback')
    page.locator('.cx-plugin-redirect').get_by_role('button', name='Kopieren').click()
    assert messages('copyPluginRedirect'), 'Kopieren erreicht den Host nicht'
    # Das Secret ist verdeckt, die ID nicht.
    assert page.get_by_label('Client-Secret').get_attribute('type') == 'password'
    expect(page.get_by_role('button', name='Speichern', exact=True)).to_be_disabled()

    # Datei auswählen: gelesen wird im Host, auf der Seite erscheint nur die Wiedererkennung.
    page.get_by_role('button', name=re.compile('JSON-Datei auswählen')).click()
    assert messages('pickPluginClientFile'), 'Dateiauswahl erreicht den Host nicht'
    client = page.locator('.cx-plugin-client')
    expect(client).to_contain_text('4924…ds61.apps.googleusercontent.com')
    expect(client).to_contain_text('aus client_secret_demo.json')
    assert 'GOCSPX' not in page.content()
    # Mit hinterlegtem Client kann „Installieren“ gleich anmelden.
    page.get_by_role('button', name='Anmelden und installieren').click()
    expect(page.locator('.cx-plugin-status')).to_contain_text('Verbunden', timeout=3000)
    expect(page.locator('.cx-plugin-status').get_by_role('button', name='Abmelden')).to_be_visible()
    # Der verbundene Zugang trägt seinen Punkt in der Auswahl.
    expect(page.get_by_role('tab', name='Google-Konto').locator('.cx-plugin-dot.ok')).to_have_count(1)
    page.screenshot(path=str(OUT / 'plugins-oauth-client.png'))

    # Der Schlüssel-Zugang steht noch ohne Schlüssel in mcp.json — er fordert
    # jetzt nichts mehr an, sondern sagt, dass der Dienst da ist.
    page.get_by_role('tab', name='API-Schlüssel').click()
    status = page.locator('.cx-plugin-status')
    expect(status).to_have_class(re.compile(r'\bok\b'))
    expect(status).to_contain_text('Über Google-Konto verbunden · 2 Werkzeuge')
    expect(status.get_by_role('button', name='Zugang entfernen')).to_be_visible()
    page.screenshot(path=str(OUT / 'plugins-youtube-ersetzt.png'))
    page.get_by_role('button', name='Zurück zur Übersicht').click()
    page.locator('.cx-plugin-search input').fill('')
    # Sentry und Brave sind inzwischen verbunden, YouTube über das Konto: nichts ist offen.
    expect(page.locator('.cx-plugin-section', has=page.get_by_role('heading', name='Einrichtung offen'))).to_have_count(0)
    expect(page.locator('.cx-plugin-installed .cx-plugin-badge')).to_have_count(0)
    page.locator('.cx-plugin-search input').fill('youtube')
    expect(page.locator('.cx-plugin-row')).to_have_count(1)
    expect(page.locator('.cx-plugin-row .cx-plugin-state')).to_have_text('Verbunden')
    page.get_by_role('button', name=re.compile(r'^YouTube')).first.click()
    expect(page.get_by_role('tab', name='Google-Konto')).to_have_attribute('aria-selected', 'true')
    client = page.locator('.cx-plugin-client')

    # Ersetzen per Ablegen aus dem Finder: die Datei gehört der Seite, nicht dem nächsten Chat.
    client.get_by_role('button', name='Ersetzen').click()
    page.evaluate("window.dispatchEvent(new MessageEvent('message', { data: { kind: 'attachments', paths: ['/Users/demo/Desktop/client_secret_neu.json'] } }))")
    sent = messages('pluginClientFile')
    assert sent and sent[-1]['path'].endswith('client_secret_neu.json'), sent
    expect(page.locator('.cx-plugin-client')).to_contain_text('aus client_secret_neu.json')

    # Von Hand: zwei Felder, dieselbe Ablage.
    page.locator('.cx-plugin-client').get_by_role('button', name='Ersetzen').click()
    page.get_by_label('Client-ID').fill('123-abc.apps.googleusercontent.com')
    page.get_by_label('Client-Secret').fill('GOCSPX-von-hand')
    page.get_by_role('button', name='Speichern und anmelden').click()
    manual = messages('setPluginClient')
    assert manual and manual[-1]['clientId'] == '123-abc.apps.googleusercontent.com' and manual[-1]['clientSecret'] == 'GOCSPX-von-hand', manual
    expect(page.locator('.cx-plugin-client')).to_contain_text('von Hand eingetragen')
    page.get_by_role('button', name='Entfernen', exact=True).first.click()
    page.get_by_role('button', name='Zurück zur Übersicht').click()
    page.locator('.cx-plugin-search input').fill('')
    # Die im Finder gezogene Datei ist nicht als Anhang im Chat gelandet.
    assert not page.locator('.composer').filter(has_text='client_secret_neu.json').count()

    # ── Ausschalten, ohne zu entfernen ────────────────────────────────────────
    page.locator('.cx-plugin-search input').fill('chrome')
    chrome = page.locator('.cx-plugin-row').first
    chrome.get_by_role('button', name=re.compile('verwalten')).click()
    page.get_by_role('menuitem', name='Ausschalten').click()
    assert messages('setPluginEnabled')[-1] == {'kind': 'setPluginEnabled', 'server': 'chrome-devtools', 'enabled': False}
    expect(chrome.locator('.cx-plugin-state')).to_have_text('Aus')
    chrome.locator('.cx-plugin-state').click()
    assert messages('setPluginEnabled')[-1]['enabled'] is True
    expect(chrome.locator('.cx-plugin-state')).to_have_text('Verbunden')
    page.locator('.cx-plugin-search input').fill('')

    # ── Installieren mit Anmeldung, dann Entfernen ────────────────────────────
    page.get_by_role('button', name=re.compile(r'^Vercel')).first.click()
    page.get_by_role('button', name='Anmelden und installieren').click()
    assert messages('installPlugin'), 'Installieren erreicht den Host nicht'
    # Während der Browser offen ist, lässt sich die Anmeldung abbrechen.
    expect(page.locator('.cx-plugin-status')).to_contain_text('Anmeldung im Browser')
    expect(page.locator('.cx-plugin-status').get_by_role('button', name='Abbrechen')).to_be_visible()
    expect(page.locator('.cx-plugin-status')).to_contain_text('Verbunden · 2 Werkzeuge', timeout=3000)
    expect(page.locator('.cx-plugin-toast')).to_be_visible()
    page.screenshot(path=str(OUT / 'plugins-verbunden.png'))
    page.get_by_role('button', name='Entfernen').click()
    assert messages('uninstallPlugin'), 'Entfernen erreicht den Host nicht'
    expect(page.get_by_role('button', name='Anmelden und installieren')).to_be_visible()

    # ── Kategorieseite und Brotkrume ──────────────────────────────────────────
    page.get_by_role('button', name='Zurück zur Übersicht').click()
    page.locator('.cx-plugin-more').first.click()
    expect(page.locator('.cx-breadcrumb strong')).not_to_be_empty()
    page.screenshot(path=str(OUT / 'plugins-category.png'))
    # Die Brotkrume selbst führt zurück, nicht nur die Seitenleiste. Ihr Ziel
    # muss groß genug zum Treffen sein — 40x14 px waren es nicht.
    crumb = page.locator('.cx-plugin-crumb')
    box = crumb.bounding_box()
    assert box['width'] >= 50 and box['height'] >= 22, f"Brotkrume zu klein: {box}"
    crumb.click()
    expect(page.get_by_role('heading', name='Installiert')).to_be_visible()

    # Neben der Seitenleiste liegen Vor und Zurück — sie bedienen den ganzen
    # Verlauf, nicht nur die Plugins.
    expect(page.locator('.cx-history button')).to_have_count(2)
    back, forward = page.locator('.cx-history button').nth(0), page.locator('.cx-history button').nth(1)
    page.get_by_role('button', name=re.compile(r'^Figma')).first.click()
    expect(page.get_by_role('heading', name='Informationen')).to_be_visible()
    back.click()
    expect(page.get_by_role('heading', name='Installiert')).to_be_visible()
    forward.click()
    expect(page.get_by_role('heading', name='Informationen')).to_be_visible()
    back.click()
    # Und weiter zurück bis zum Chat, aus dem wir gekommen sind.
    while back.is_enabled():
        back.click()
    expect(page.locator('.cx-plugins')).to_have_count(0)
    forward.click()
    expect(page.locator('.cx-plugins')).to_be_visible()

    # Nur noch ein Knopf mit Kreispfeil in der Kopfzeile: der doppelte
    # Aktualisieren-Knopf ohne Wirkung ist weg.
    assert page.locator('.cx-plugins-bar .cx-icon').count() == 0

    # ── Vorlagen ──────────────────────────────────────────────────────────────
    page.get_by_role('tab', name='Vorlagen').click()
    expect(page.get_by_role('heading', name='Vorhanden')).to_be_visible()
    page.get_by_role('tab', name='Plugins').click()

    # ── Größen: kein waagerechter Überlauf ───────────────────────────────────
    for width, height in [(1710, 1112), (1440, 950), (1152, 768), (960, 700), (760, 680)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.wait_for_timeout(80)
        overflow = page.evaluate(
            '() => { const el = document.querySelector(".cx-plugins-scroll");'
            ' return el ? el.scrollWidth - el.clientWidth : 0; }')
        assert overflow <= 1, f'{width}px: {overflow}px waagerechter Überlauf'

    assert not errors, f'JavaScript-Fehler: {errors}'
    blocked = [m.text for m in console if 'Content Security Policy' in m.text]
    assert not blocked, f'Von der CSP blockiert: {blocked}'

    print('Pixelabnahme:', ', '.join(checked))
    print('Plugins-UI: bestanden. Bilder in docs/screenshots/.')
