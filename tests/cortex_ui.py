import re
"""Exercises the shipped Preact bundle with an explicit fake host, never real subscriptions."""
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

BASE = 'http://127.0.0.1:4173/dev/preview.html?mode=agent'
OUT = Path(__file__).resolve().parents[1] / 'docs/screenshots'
OUT.mkdir(parents=True, exist_ok=True)
def open_project(page, name):
    """Projektgruppen sind zu, bis man sie aufklappt — nur das Projekt der
    aktiven Aufgabe steht von selbst offen. Aufgaben in anderen Projekten sind
    also erst nach einem Klick auf den Ordner erreichbar."""
    row = page.get_by_role('button', name=name, exact=True)
    if row.get_attribute('aria-expanded') == 'false':
        row.click()
        page.wait_for_timeout(260)

with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 950})
    errors = []
    page.on('pageerror', lambda e: (errors.append(str(e)), print('Browser error:', e, flush=True)))
    # Apply the real host's CSP: the preview alone would hide blocked assets.
    host_source = (Path(__file__).resolve().parents[1] / 'engine/packages/vscode/src/panel/ChatViewProvider.ts').read_text()
    policy = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', host_source).group(1)
    policy = policy.replace('${webview.cspSource}', 'http://127.0.0.1:4173').replace('${nonce}', 'cortex-ui-test')
    def apply_host_policy(route):
        response = route.fetch()
        html = response.text().replace('<head>', '<head>\n<meta http-equiv="Content-Security-Policy" content="' + policy + '">')
        html = re.sub(r'<script(?=[\s>])', '<script nonce="cortex-ui-test"', html)
        route.fulfill(response=response, body=html)
    page.route('**/dev/preview.html?*', apply_host_policy)
    def check_gemini_removed():
        assert page.get_by_role('img', name='Gemini', exact=True).count() == 0
        assert 'Gemini' not in page.locator('body').inner_text()
    def visit(params=''):
        page.goto(BASE + params)
        page.wait_for_load_state('networkidle')
        page.locator('#harness').evaluate('(el) => el.remove()')
    def messages(kind):
        return page.evaluate('(kind) => (window.__hostMessages || []).filter(m => m.kind === kind)', kind)
    def wait_for_dock_state(open_):
        """Der Zustand geht aus einem Effekt an den Host — der läuft erst nach
        dem Zeichnen. Ein einfaches assert wäre schneller als die Nachricht."""
        page.wait_for_function(
            '(want) => { const m = (window.__hostMessages || []).filter(x => x.kind === "dockState"); '
            'return m.length > 0 && m[m.length - 1].open === want; }', arg=open_)
    def open_models():
        trigger = page.get_by_title('Modell und Reasoning', exact=True)
        if trigger.get_attribute('aria-expanded') != 'true': trigger.click()
        page.get_by_title('Modell wechseln', exact=True).click()
        expect(page.get_by_role('menu', name='Modell auswählen')).to_be_visible()
    def show_reasoning():
        trigger = page.get_by_title('Modell und Reasoning', exact=True)
        if trigger.get_attribute('aria-expanded') != 'true': trigger.click()
        expect(page.get_by_role('dialog', name='Modell und Reasoning')).to_be_visible()
    def shot(name):
        page.screenshot(path=str(OUT / (name + '.png')))
    visit()
    expect(page.get_by_role('heading', name='Woran sollen wir in Studio Website arbeiten?')).to_be_visible()
    # Der Nachrichtenfilter prüft die Herkunft. Eine fremde Seite im Rahmen (wie
    # die HTML-Vorschau im Dock) darf keine Host-Nachricht vortäuschen; eine von
    # der eigenen Herkunft muss ankommen — sonst bliebe die App ohne Konten,
    # Projekte und Chats, wie mit dem früheren Vergleich auf `window.parent`.
    def post_from_frame(sandbox, message):
        page.evaluate("""([sandbox, message]) => new Promise(done => {
          const f = document.createElement('iframe');
          f.setAttribute('sandbox', sandbox);
          f.srcdoc = '<script nonce="cortex-ui-test">parent.postMessage(' + JSON.stringify(message) + ', "*")<\\/script>';
          f.onload = () => setTimeout(() => { f.remove(); done(); }, 150);
          document.body.appendChild(f);
        })""", [sandbox, message])
    post_from_frame('allow-scripts', {'kind': 'projects', 'projects': []})
    expect(page.get_by_role('heading', name='Woran sollen wir in Studio Website arbeiten?')).to_be_visible()
    post_from_frame('allow-scripts allow-same-origin', {'kind': 'showPage', 'page': 'plugins'})
    expect(page.get_by_role('heading', name='Plugins', exact=True)).to_be_visible()
    visit()
    expect(page.get_by_role('heading', name='Woran sollen wir in Studio Website arbeiten?')).to_be_visible()
    expect(page.locator('.cx-start-cards button')).to_have_count(4)
    expect(page.get_by_role('complementary', name='Chat-Control-Panel')).to_have_count(0)
    expect(page.get_by_role('button', name='Control Panel', exact=True)).to_have_count(0)
    # Kopfleiste, Werkzeug-Icons und Seitenleisten-Toggle liegen seit dem
    # Titelleisten-Umbau in der Workbench, nicht mehr in der Webview. Der
    # Vorschau-Harness kann sie nicht rendern — dort ist nichts mehr zu prüfen.
    expect(page.locator('.cx-topbar')).to_have_count(0)
    # Das Plus-Menü: jeder Eintrag muss beim Host ankommen, keiner nur gezeichnet sein.
    page.get_by_role('button', name='Hinzufügen', exact=True).click()
    expect(page.locator('.add-popup .menu-row')).to_have_count(6)
    # „Bild erstellen“ wechselt nur die Eingabe in den Bildmodus; das × führt zurück.
    page.get_by_role('menuitem', name='Bild erstellen').click()
    expect(page.locator('.cx-img-chip')).to_be_visible()
    page.get_by_role('button', name='Bildmodus verlassen').click()
    expect(page.locator('.cx-img-chip')).to_have_count(0)
    page.get_by_role('button', name='Hinzufügen', exact=True).click()
    page.get_by_role('menuitem', name='Ordner hinzufügen').click()
    assert messages('addProject'), 'Ordner hinzufügen erreicht den Host nicht'
    page.locator('.composer textarea').fill('Ungesendeter Entwurf vor den Konnektoren')
    page.get_by_role('button', name='Hinzufügen', exact=True).click()
    page.get_by_role('menuitem', name='Konnektoren').click()
    expect(page.locator('.cxs-page-head h1')).to_have_text('Plugins')
    expect(page.get_by_role('tab', name=re.compile(r'^MCPs(?:\s|$)'))).to_have_attribute('aria-selected', 'true')
    page.get_by_role('button', name='Zurück zur App').click()
    expect(page.locator('.composer textarea')).to_have_value('Ungesendeter Entwurf vor den Konnektoren')
    page.locator('.composer textarea').fill('')
    page.get_by_role('button', name='Hinzufügen', exact=True).click()
    page.get_by_role('menuitem', name='Slash-Befehle').click()
    expect(page.locator('.suggest-popup')).to_be_visible()
    page.locator('.composer textarea').fill('')
    # Konnektor-Erwähnung: Konten tragen anbieter:name, Konnektoren sind ein
    # bloßer Name — dieselbe Liste, kein zweites Zeichen.
    page.locator('.composer textarea').fill('Erstelle ein Dokument mit @')
    expect(page.locator('.suggest-row').first).to_contain_text('Konnektor')
    page.locator('.composer textarea').fill('Erstelle ein Dokument mit @doc')
    expect(page.locator('.suggest-row')).to_have_count(1)
    page.locator('.composer textarea').fill('')

    # Originalvorlagen: gerenderte Vorschau, kurzer Auftrag und echte Dateien.
    page.get_by_role('button', name='Hinzufügen', exact=True).click()
    page.get_by_role('menuitem', name='Vorlagen').click()
    expect(page.locator('.cx-template')).to_have_count(7)
    page.locator('.cx-template').first.click()
    expect(page.locator('.cx-templates')).to_have_count(0)
    expect(page.locator('.composer textarea')).to_have_value(re.compile(r'^Erstelle ein neues Dokument mit der Vorlage „Design Report“'))
    expect(page.locator('.attachment-row')).to_have_count(2)
    for _ in range(2): page.locator('.attachment-strip .attachment-x').first.click()
    page.locator('.composer textarea').fill('')

    # Konnektoren: seit den Einstellungen nach Codex (13.09.2026) liegen Spiegeln
    # und Bearbeiten in Einstellungen › Konfiguration und › Plugins — die alte
    # Konnektorenliste gibt es dort nicht mehr. Die Liste selbst prüft cortex_plugins_ui.py.
    page.get_by_role('button', name='Einstellungen', exact=True).click()
    page.get_by_role('button', name='Konfiguration', exact=True).click()
    page.get_by_role('button', name='Diagnose').click()
    assert messages('syncConnectors'), 'Spiegeln erreicht den Host nicht'
    page.get_by_role('button', name='Plugins', exact=True).click()
    page.get_by_role('button', name='In alle Anbieterprofile spiegeln').click()
    assert len(messages('syncConnectors')) >= 2, 'Spiegeln auf der Plugin-Seite erreicht den Host nicht'
    page.get_by_role('button', name='Hinzufügen', exact=True).click()
    assert messages('editConnectors'), 'Bearbeiten erreicht den Host nicht'
    page.get_by_role('button', name='Zurück zur App').click()
    page.go_back()
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(el) => el.remove()')
    shot('home')
    page.get_by_title('Berechtigungen für diese Aufgabe wählen').click()
    page.get_by_role('menuitemradio', name='Genehmigung anfordern', exact=False).click()
    # Stufe und Nachfragen gehen in einer Nachricht — zwei Nachrichten liefen um die Wette.
    assert messages('setModes')[-1]['permissionMode'] == 'edits' and messages('setModes')[-1]['ask'] is True
    assert not messages('setAskPermission')
    page.get_by_title('Berechtigungen für diese Aufgabe wählen').click()
    shot('permissions-menu')
    page.get_by_role('menuitemradio', name='Uneingeschränkter Zugriff', exact=False).click()
    assert messages('setModes')[-1]['permissionMode'] == 'full' and messages('setModes')[-1]['ask'] is False
    assert not messages('setAskPermission')

    page.get_by_role('button', name='Untersuche und verstehe Code', exact=True).click()
    expect(page.locator('.composer textarea')).to_have_value(re.compile('Analysiere dieses Projekt'))
    open_models()
    expect(page.locator('.cx-rz-group')).to_have_count(5)
    expect(page.locator('.cx-rz-menu').get_by_role('menuitemradio', name='Auto', exact=False)).to_have_count(0)
    page.locator('.cx-rz-menu-title').click()
    expect(page.locator('.cx-rz-menu')).to_be_visible()
    page.locator('.cx-conversation').click(position={'x': 40, 'y': 40})
    expect(page.locator('.cx-rz-menu')).to_have_count(0)
    open_models()
    page.keyboard.press('Escape')
    expect(page.locator('.cx-rz-menu')).to_have_count(0)
    open_models()
    shot('models-menu')
    check_gemini_removed()
    page.locator('.cx-rz-group').nth(1).get_by_role('menuitemradio').first.click()
    assert messages('setPinnedTarget')[-1]['target']['account'] == 'studio'
    show_reasoning()
    slider = page.get_by_role('slider', name='Reasoning')
    expect(slider).to_have_attribute('max', '4')
    slider.fill('4')
    expect(slider).to_have_attribute('aria-valuetext', 'Maximal')
    shot('reasoning-menu')
    page.keyboard.press('Escape')

    page.get_by_title('Senden', exact=True).click()
    assert messages('send')[-1]['target']['account'] == 'studio'
    assert messages('send')[-1]['permissionMode'] == 'full'
    assert messages('send')[-1]['askPermission'] is False
    assert messages('send')[-1]['effort'] == 'max'
    expect(page.get_by_title('Stop (Esc)')).to_be_visible()
    page.get_by_title('Stop (Esc)').click()
    assert messages('cancel')
    open_project(page, 'Studio Website')
    page.get_by_role('button', name='Neue Startseite entwickeln', exact=True).click()
    expect(page.locator('.cx-tree-task.active')).to_contain_text('Neue Startseite')
    expect(page.locator('.cx-task-heading')).to_have_count(0)
    controls = page.get_by_role('complementary', name='Chat-Control-Panel')
    expect(controls).to_be_visible()
    expect(controls).to_contain_text('Ausgaben')
    expect(controls).to_contain_text('Quellen')
    # Eine Ausgabe geht wie ein Dateilink im Verlauf rechts im Dock auf, nicht
    # als Editor daneben — sonst fehlt die Verbindung zu Dock, Vorschau und Finder.
    sent = len(messages('openWorkspaceFile'))
    controls.get_by_role('button', name='App.tsx', exact=True).first.click()
    dock = page.get_by_role('complementary', name='Arbeitsbereich')
    expect(dock).to_be_visible()
    expect(dock.get_by_role('button', name='App.tsx schließen')).to_be_visible()
    assert len(messages('openWorkspaceFile')) == sent, 'Projektdatei ging am Dock vorbei'
    dock.get_by_role('button', name='Dock schließen').click()
    expect(controls).to_be_visible()
    # Ältere Einträge tragen „~/…“ statt eines Projektpfads: die gehen an den
    # Host, der „~“ auflöst — nicht ungeprüft ans Dock.
    page.evaluate("window.postMessage({kind:'toolUse',messageId:'tilde-test',name:'Write',path:'~/Desktop/notiz.md',action:'write'}, '*')")
    controls.get_by_role('button', name='notiz.md', exact=True).click()
    assert messages('openWorkspaceFile')[-1]['path'] == '~/Desktop/notiz.md'
    expect(controls).to_contain_text('Keine gemeldeten Hintergrundprozesse')
    shot('control-panel')
    page.evaluate("window.postMessage({kind:'userEcho',text:'Prüfe diesen Anhang',attachments:['/tmp/screenshot.png']}, '*')")
    # Die Quellen zeigen bis zu fünf Einträge; der Anhang kommt als fünfter
    # dazu und ist damit ohne „Alle anzeigen“ erreichbar. Das zweite
    # screenshot.png ist das gelesene docs/screenshot.png.
    assert controls.get_by_role('button', name=re.compile(r'^Alle anzeigen')).count() == 0
    controls.get_by_title('/tmp/screenshot.png').click()
    assert messages('openWorkspaceFile')[-1]['path'] == '/tmp/screenshot.png'
    page.evaluate("window.postMessage({kind:'agentStart',messageId:'background-test',id:'worker',label:'Prüfung läuft',background:true}, '*')")
    expect(controls).to_contain_text('Prüfung läuft')
    # Ein Hintergrund-Agent überlebt die Antwort, die ihn gestartet hat.
    page.evaluate("window.postMessage({kind:'done',messageId:'background-test',durationMs:1000}, '*')")
    expect(controls).to_contain_text('Prüfung läuft')
    page.evaluate("window.postMessage({kind:'agentEnd',messageId:'background-test',id:'worker',status:'completed'}, '*')")
    expect(controls).not_to_contain_text('Prüfung läuft')
    # Ein abgebrochener Lauf reißt seine Kinder mit — dann wäre die Zeile gelogen.
    page.evaluate("window.postMessage({kind:'agentStart',messageId:'abbruch-test',id:'worker2',label:'Zweiter Lauf',background:true}, '*')")
    expect(controls).to_contain_text('Zweiter Lauf')
    page.evaluate("window.postMessage({kind:'stopped',messageId:'abbruch-test',reason:'stopped by you'}, '*')")
    expect(controls).not_to_contain_text('Zweiter Lauf')
    page.get_by_role('button', name='Control Panel schließen').click()
    expect(controls).to_have_count(0)
    page.evaluate("window.postMessage({kind:'toolbar',action:'files'}, '*')")
    expect(controls).to_have_count(0)
    expect(page.get_by_role('complementary', name='Arbeitsbereich')).to_be_visible()
    # Chat-Darstellung nach Codex (components/chat.tsx): eigene Nachricht als
    # Blase rechts, Zeit und Kopieren beim Überfahren darunter, Antwort als
    # Fließtext über die volle Spalte, fertige Arbeit gefaltet hinter
    # „… lang gearbeitet ›“ mit Haarlinie. Keine Schiene mit Punkten.
    column = page.locator('.cx-chat-width').first.bounding_box()
    bubble = page.locator('.cx-c-bubble').first.bounding_box()
    body = page.locator('.cx-c-prose').first.bounding_box()
    assert abs(bubble['x'] + bubble['width'] - column['x'] - column['width']) < 2, 'eigene Nachricht ist nicht rechtsbündig'
    assert bubble['x'] > column['x'] + 1, 'eigene Nachricht nimmt die ganze Breite ein'
    assert abs(body['x'] - column['x']) < 2, 'Antwort nutzt nicht die volle Spalte'
    page.locator('.cx-c-user').first.hover()
    expect(page.locator('.cx-c-user-foot').first).to_have_css('opacity', '1')
    expect(page.locator('.tl-assistant .cx-c-rule').first).to_be_visible()
    expect(page.locator('.assistant-head')).to_have_count(0)
    worked = page.locator('.cx-c-worked').first
    expect(worked).to_contain_text('lang gearbeitet')
    # Abgeschnittener Text am unteren Rand läuft weich aus statt hart zu enden.
    maske = page.locator('.cx-transcript-scroll').evaluate('e => getComputedStyle(e).webkitMaskImage')
    assert 'linear-gradient' in maske and 'rgba(0, 0, 0, 0)' in maske, 'Verlaufsmaske fehlt: ' + maske
    expect(page.locator('.assistant-foot .copy-btn').first).to_be_visible()
    expect(page.locator('.assistant-foot .answer-action').first).to_be_visible()
    expect(page.locator('.cx-c-work')).to_have_count(0)
    worked.click()
    expect(page.locator('.cx-c-work').first).to_be_visible()
    worked.click()
    expect(page.locator('.cx-c-work')).to_have_count(0)
    assert page.locator('.tl').first.evaluate(
        "el => getComputedStyle(el, '::after').content"
    ) in ('none', 'normal'), 'Zeitschienen-Punkt ist noch da'
    # Eingeklappte Seitenleiste: Hover über den Toggle schiebt sie als Overlay
    # ein, ohne dass der Inhalt darunter verrutscht; Wegfahren blendet sie aus.
    page.evaluate("window.postMessage({kind:'toolbar',action:'sidebar'}, '*')")
    # Zugeklappt bleibt die Leiste im Baum und fährt nach links hinaus — nur so
    # lässt sich die Bewegung zeigen, statt sie verschwinden zu lassen.
    expect(page.locator('.cx-sidebar.closed')).to_have_count(1)
    page.wait_for_timeout(360)
    assert page.locator('.cx-sidebar').bounding_box()['x'] <= -249, 'Leiste ist nicht ausgefahren'
    before = page.locator('.cx-conversation').bounding_box()
    page.mouse.move(5, 400)
    expect(page.locator('.cx-sidebar.peek')).to_be_visible()
    assert page.locator('.cx-conversation').bounding_box() == before, 'Overlay verschiebt den Inhalt'
    expect(page.locator('.cx-rail-brand .cx-cortex-mark')).to_be_visible()
    page.mouse.move(900, 400)
    expect(page.locator('.cx-sidebar.closed')).to_have_count(1)
    page.mouse.move(5, 400)
    page.get_by_role('button', name='Seitenleiste anheften').click()
    expect(page.locator('.cx-sidebar.peek')).to_have_count(0)
    expect(page.locator('.cx-sidebar.closed')).to_have_count(0)
    expect(page.locator('.cx-sidebar')).to_be_visible()
    # Bedienelemente des Chats, die keine Texteingabe sind: Modellwahl,
    # Aufwandsregler und Bewertung. Jedes hat einen Zustand, den man sehen
    # können muss — sonst rät man beim Klicken.
    modell = page.get_by_title('Modell und Reasoning', exact=True).first
    open_models()
    expect(page.locator('.cx-rz-menu .cx-rz-row').first).to_be_visible()
    assert page.locator('.cx-rz-menu .cx-rz-row[aria-checked=true]').count() == 1, 'aktives Modell nicht markiert'
    page.keyboard.press('Escape')
    expect(page.locator('.cx-rz-menu')).to_have_count(0)

    page.keyboard.press('Escape')
    stufe = page.get_by_title('Modell und Reasoning', exact=True)
    vorher = stufe.inner_text().strip()
    stufe.click()
    regler = page.locator('.reasoning-popup input[type=range]')
    expect(regler).to_be_visible()
    punkte = page.locator('.cx-rz-dot').count()
    assert punkte >= 3, f'Aufwandsskala hat nur {punkte} Stufen'
    regler.fill('0')
    page.wait_for_timeout(200)
    assert stufe.inner_text().strip() != vorher, 'Regler ohne Wirkung auf die Beschriftung'
    assert page.locator('.cx-rz-dot.on').count() == 1
    page.keyboard.press('Escape')

    # Die Bewertung geht zum Host und kommt als Zustand zurück — beides prüfen,
    # sonst sieht ein toter Knopf aus wie ein funktionierender.
    daumen = page.get_by_label('Antwort war schlecht').first
    assert daumen.get_attribute('aria-pressed') == 'false'
    daumen.click()
    expect(daumen).to_have_attribute('aria-pressed', 'true')
    daumen.click()
    expect(daumen).to_have_attribute('aria-pressed', 'false')

    # Kurze Snippets sind direkt lesbar und lassen sich zusätzlich im Panel öffnen.
    zaeune = "```\n## Überschrift\n- `datei.md` — 0 Byte\n```\n\n```ts\nconst x = 'a'; // c\n```"
    page.evaluate("(t) => window.postMessage({kind:'delta',messageId:'hl',text:t}, '*')", zaeune)
    page.evaluate("window.postMessage({kind:'done',messageId:'hl',durationMs:800}, '*')")
    expect(page.locator('.md-codeblock')).to_have_count(2)
    expect(page.locator('pre.md-code')).to_have_count(0)
    cards = page.locator('.md-codeblock')
    assert '## Überschrift' in cards.nth(0).inner_text(), cards.nth(0).inner_text()
    # Ohne Sprachangabe heißt er schlicht Codeblock, mit Angabe trägt er sie.
    assert cards.nth(0).locator('.md-codeblock-head > span').inner_text() == 'Code'
    assert cards.nth(1).locator('.md-codeblock-head > span').inner_text() == 'ts'
    # Angesehen wird er rechts, mit Zeilennummern und in voller Breite.
    cards.nth(1).get_by_role('button', name='Ansehen').click()
    expect(page.locator('.cx-review')).to_be_visible()
    expect(page.locator('.cx-review .cx-diff-line')).to_have_count(1)
    page.locator('.cx-review [aria-label="Schließen"]').click()
    expect(page.locator('.cx-review')).to_have_count(0)
    # Die Prüfansicht verdrängt die Dateiansicht — danach steht sie wieder da.
    page.evaluate("window.postMessage({kind:'toolbar',action:'files'}, '*')")

    # Markdown-Tabellen: Kopf, Zeilen, Ausrichtung und Inline-Auszeichnung.
    tabelle = ("| Pfad | Größe |\n|---|---:|\n| `a/node_modules` | 362 MB |\n"
               "| **`.next`** | 129 MB |\n\nDanach normaler Text.")
    page.evaluate("(t) => window.postMessage({kind:'delta',messageId:'tab',text:t}, '*')", tabelle)
    page.evaluate("window.postMessage({kind:'done',messageId:'tab',durationMs:900}, '*')")
    expect(page.locator('.md-table')).to_have_count(1)
    assert page.locator('.md-table th').all_inner_texts() == ['Pfad', 'Größe']
    expect(page.locator('.md-table tbody tr')).to_have_count(2)
    assert page.locator('.md-table td').nth(1).evaluate('e => getComputedStyle(e).textAlign') == 'right'
    expect(page.locator('.md-table td .md-inline').first).to_have_text('a/node_modules')
    # Fett darf Code enthalten — sonst stehen die Backticks im Text.
    expect(page.locator('.md-table td strong .md-inline')).to_have_count(1)
    shot('conversation')
    # ── Das Dock rechts ──────────────────────────────────────────────────
    dock = page.get_by_role('complementary', name='Arbeitsbereich')
    # Ein frisch geöffnetes Dock hat einen Reiter, der noch auf eine Datei wartet.
    expect(page.get_by_role('tab', name='Datei öffnen')).to_be_visible()
    page.get_by_label('Dateien filtern').fill('src')
    expect(page.locator('.cx-file-list .cx-file-row')).to_have_count(1)
    page.get_by_role('button', name='src', exact=True).click()
    expect(page.get_by_role('button', name='App.tsx', exact=True)).to_be_visible()
    page.get_by_role('button', name='App.tsx', exact=True).click()
    # Der wartende Reiter wird gefüllt, nicht verdoppelt.
    expect(page.get_by_role('tab', name='App.tsx')).to_be_visible()
    expect(page.get_by_role('tab', name='Datei öffnen')).to_have_count(0)
    # Auf den Inhalt warten, nicht auf die Nachricht: der Lesevorgang läuft im
    # Effekt und ist noch nicht durch, wenn der Reiter schon steht.
    expect(dock.locator('.cx-dock-file')).to_be_visible()
    assert messages('readFileBody')[-1]['path'] == 'src/App.tsx'
    # Die Brotkrume nennt Projekt und Ordner und ist bedienbar.
    expect(dock.locator('.cx-dock-crumbs')).to_contain_text('src')
    # Eine Datei ohne Vorschau hat nur ihren Quelltext — dann steht da auch
    # kein abgeblendeter Umschalter herum.
    expect(page.get_by_role('button', name='Quelle anzeigen')).to_have_count(0)
    expect(dock.locator('.cx-dock-file.source .cx-diff-line')).not_to_have_count(0)

    # Markdown hat beides. Der zweite Klick im Baum öffnet daneben, weil der
    # aktive Reiter schon eine Datei trägt.
    dock.locator('.cx-file-row.cx-parent').click()
    page.get_by_role('button', name='AGENTS.md', exact=True).click()
    expect(page.get_by_role('tab', name='AGENTS.md')).to_be_visible()
    expect(page.get_by_role('tab', name='App.tsx')).to_be_visible()
    expect(dock.locator('.cx-dock-file.rendered')).to_be_visible()
    page.get_by_role('button', name='Quelle anzeigen').click()
    expect(dock.locator('.cx-dock-file.source')).to_be_visible()
    # Ein Knopf, zwei Zustände — kein Reiterpaar.
    expect(page.get_by_role('button', name='Quelle anzeigen')).to_have_count(0)
    page.get_by_role('button', name='Vorschau anzeigen').click()
    expect(dock.locator('.cx-dock-file.rendered')).to_be_visible()

    # HTML ist eine Seite: sie läuft in einem eigenen Rahmen, mit ihren
    # Skripten, statt als Quelltext dazustehen. Der Rahmen hängt an der echten
    # CSP des Hosts — ohne frame-src bliebe er leer.
    page.get_by_role('button', name='index.html', exact=True).click()
    expect(page.get_by_role('tab', name='index.html')).to_be_visible()
    seite = dock.frame_locator('.cx-dock-file.page iframe')
    expect(seite.locator('#stand')).to_contain_text('Skript läuft')
    assert messages('previewFile')[-1]['path'] == 'index.html'
    # Eine Seite braucht keinen Text durch die Brücke, nur ihre Adresse.
    assert messages('readFileBody')[-1]['path'] != 'index.html'
    # Dass eine fremde Seite dem Dock kein Zuklappen unterschieben kann, prüft
    # post_from_frame oben: im Harness hätte die Vorschau dieselbe Herkunft wie
    # die Oberfläche, und ein Rahmen mit fremder Herkunft lädt aus einer
    # umgeleiteten Seite im headless Chrome nicht (Local Network Access).
    expect(dock).to_be_visible()
    expect(dock.locator('.cx-dock-copy')).to_have_count(0)
    shot('dock-html')
    page.get_by_role('button', name='Quelle anzeigen').click()
    expect(dock.locator('.cx-dock-file.source .cx-diff-line')).not_to_have_count(0)
    assert messages('readFileBody')[-1]['path'] == 'index.html'
    page.get_by_role('button', name='Vorschau anzeigen').click()
    expect(seite.locator('#stand')).to_contain_text('Skript läuft')
    page.get_by_label('index.html schließen').click()
    expect(page.get_by_role('tab', name='AGENTS.md')).to_have_attribute('aria-selected', 'true')

    # Der Dateibaum klappt einzeln zu, ohne das Dock zu verschmälern.
    breite = dock.bounding_box()['width']
    page.get_by_label('Dateibaum ausblenden').click()
    expect(dock.locator('.cx-dock-tree')).to_have_count(0)
    assert abs(dock.bounding_box()['width'] - breite) < 2
    page.get_by_label('Dateibaum einblenden').click()
    expect(dock.locator('.cx-dock-tree')).to_have_count(1)
    # Das Plus bietet dieselben Wege wie die Knöpfe der Fensterleiste.
    page.get_by_label('Etwas hinzufügen').click()
    picks = dock.locator('.cx-dock-picks button')
    assert [t.split('\n')[0] for t in picks.all_inner_texts()] == ['Dateien', 'Browser', 'Terminal', 'Änderungen', 'Excalidraw']
    page.get_by_role('menuitem', name='Terminal').click()
    assert messages('openTerminal')
    expect(dock.locator('.cx-dock-picks')).to_have_count(0)
    shot('dock-files')

    # Der Knopf schaltet um und legt den Inhalt beiseite; er wirft ihn nicht weg.
    page.evaluate("window.postMessage({kind:'toolbar',action:'files'}, '*')")
    expect(page.get_by_role('complementary', name='Arbeitsbereich')).to_have_count(0)
    wait_for_dock_state(False)
    page.evaluate("window.postMessage({kind:'toolbar',action:'files'}, '*')")
    expect(page.get_by_role('tab', name='AGENTS.md')).to_be_visible()
    expect(page.get_by_role('tab', name='App.tsx')).to_be_visible()

    page.evaluate("window.postMessage({kind:'toolbar',action:'changes'}, '*')")
    expect(page.get_by_role('button', name='src/App.tsx M', exact=True)).to_be_visible()
    # Änderungen kommt als Reiter dazu, die Dateien bleiben stehen.
    expect(page.get_by_role('tab', name='App.tsx')).to_be_visible()
    shot('dock-changes')
    # Der letzte geschlossene Reiter nimmt das Dock mit — R3 aus der Codex-Analyse.
    page.get_by_label('Änderungen schließen').click()
    page.get_by_label('AGENTS.md schließen').click()
    page.get_by_label('App.tsx schließen').click()
    expect(page.get_by_role('complementary', name='Arbeitsbereich')).to_have_count(0)
    wait_for_dock_state(False)
    page.evaluate("window.postMessage({kind:'toolbar',action:'files'}, '*')")
    page.get_by_role('button', name='Aufgaben suchen').click()
    page.get_by_role('textbox', name='Suchbegriff').fill('Typografie')
    expect(page.locator('.cx-search-results > button')).to_have_count(1)
    page.locator('.cx-search-results > button').click()
    expect(page.locator('.cx-tree-task.active')).to_be_visible()
    expect(page.get_by_title('Modell und Reasoning', exact=True)).not_to_contain_text('privat')
    page.get_by_role('button', name='Konten und Limits').click()
    expect(page.locator('.cx-account-record')).to_have_count(5)
    expect(page.locator('.cx-status.error')).to_contain_text('Anmeldung abgelaufen')
    check_gemini_removed()
    shot('connections')
    page.get_by_role('tab', name='Claude', exact=True).click()
    expect(page.locator('.cx-account-record')).to_have_count(2)
    page.get_by_role('button', name='Kontodetails: studio', exact=True).click()
    shot('account-details')
    page.get_by_role('button', name='Für diese Aufgabe verwenden').click()
    assert messages('setPinnedTarget')[-1]['target'] == {'provider': 'claude', 'account': 'studio'}
    page.get_by_role('button', name='Konten und Limits').click()
    page.get_by_role('button', name='Konto verbinden', exact=True).click()
    check_gemini_removed()
    page.get_by_role('button', name='Geschäftlich', exact=True).click()
    expect(page.get_by_label('Kontoname', exact=True)).to_have_value('geschäftlich')
    shot('connect-dialog')
    page.get_by_role('button', name='Beim Anbieter anmelden').click()
    expect(page.get_by_role('alert')).to_contain_text('keine echte Anmeldung')
    assert messages('addAccount')[-1]['label'] == 'geschäftlich'
    expect(page.get_by_role('button', name='Beim Anbieter anmelden')).to_be_enabled()
    page.evaluate("window.postMessage({kind:'connectionProgress',provider:'claude',state:'review',message:'Kontoprüfung',attemptId:'test-only',identity:'work@example.com'}, '*')")
    expect(page.locator('.cx-identity-confirm strong')).to_have_text('work@example.com')
    shot('oauth-identity')
    page.get_by_role('button', name='Ja, dieses Konto verbinden').click()
    assert messages('respondToConnection')[-1] == {'kind':'respondToConnection','provider':'claude','attemptId':'test-only','accept':True}
    page.evaluate("window.postMessage({kind:'connectionProgress',provider:'claude',state:'connected',message:'Testkonto verbunden',identity:'work@example.com'}, '*')")
    page.get_by_role('button', name='Anmeldung schließen').click()
    visit()
    open_models()
    expect(page.get_by_role('menuitemradio', name='Haiku', exact=True)).to_have_count(0)
    for model in ['GPT-5.6 Terra', 'GPT-5.6 Sol', 'GPT-6 Astra']:
        expect(page.get_by_role('menuitemradio', name=model, exact=True)).to_have_count(2)
    page.get_by_role('menuitemradio', name='GPT-6 Astra', exact=True).first.click()
    show_reasoning()
    expect(page.get_by_role('slider', name='Reasoning')).to_have_attribute('max', '5')
    page.get_by_role('slider', name='Reasoning').fill('5')
    expect(page.get_by_role('slider', name='Reasoning')).to_have_attribute('aria-valuetext', 'Ultra')
    show_reasoning()
    open_models()
    page.get_by_role('menuitemradio', name='Sonnet 5', exact=True).first.click()
    show_reasoning()
    expect(page.get_by_role('slider', name='Reasoning')).to_have_attribute('max', '4')
    expect(page.get_by_role('slider', name='Reasoning')).to_have_attribute('aria-valuetext', 'Hoch')
    visit('&page=settings')
    expect(page.get_by_label('Schriftgröße im Editor', exact=False)).to_have_value('14')
    page.get_by_label('Schriftgröße im Editor', exact=False).fill('18')
    page.get_by_label('Schriftgröße im Editor', exact=False).press('Tab')
    last = messages('setNativeSetting')[-1]
    assert last['key'] == 'editor.fontSize' and last['value'] == 18
    # Einstellungen nach Codex: Schalter statt Häkchen, die Suche in den
    # VSCodium-Einstellungen ist „Alle Einstellungen“, die Ansicht hat Teilen und Befehle.
    minimap = page.get_by_role('switch', name='Minimap')
    minimap.click()
    last = messages('setNativeSetting')[-1]
    assert last['key'] == 'editor.minimap.enabled' and isinstance(last['value'], bool), last
    page.get_by_role('button', name='Alle Einstellungen', exact=True).click()
    assert messages('openNativeSettings')[-1]['query'] == ''
    for label, action in [('Teilen', 'split'), ('Befehle', 'commands')]:
        page.get_by_role('button', name=label, exact=True).click()
        assert messages('workbenchAction')[-1]['action'] == action
    shot('native-settings')
    visit('&accounts=empty')
    expect(page.get_by_role('button', name='Abo verbinden', exact=True)).to_be_visible()
    page.locator('.composer textarea').fill('Erste Aufgabe')
    expect(page.locator('.composer .run-btn.send')).to_be_disabled()
    shot('onboarding')
    for width, height in [(1152,768),(960,700),(760,680)]:
        page.set_viewport_size({'width':width,'height':height})
        for params, name in [('', 'home'), ('&scenario=conversation', 'control-panel'), ('&page=accounts', 'connections'), ('&page=settings', 'settings')]:
            visit(params)
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), f'Overflow: {name} {width}'
            # Die Einstellungen nach Codex ersetzen die App-Fläche durch ihre eigene.
            primary = page.locator('.cxs-shell' if name == 'settings' else '.cx-main').first
            assert primary.bounding_box()['width'] > 0
            shot(f'{name}-{width}')
    assert errors == [], errors
    print('Cortex UI: account/model selection, task/project switching, file navigation, tools, login errors, empty state and 3 window sizes passed.')
    page.close()
