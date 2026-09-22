"""Bildansicht: Verlauf, Zoom, Mehrfachauswahl, Bereiche, echte Host-Aufträge."""
import sys
import re
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

SHOTS = Path(sys.argv[1]) if len(sys.argv) > 1 else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)

def last(page, kind):
    return page.evaluate('(kind) => (window.__hostMessages || []).filter(m => m.kind === kind).at(-1)', kind)

def region(page):
    box = page.locator('.cx-image-picture').bounding_box()
    page.mouse.move(box['x'] + box['width'] * .2, box['y'] + box['height'] * .3)
    page.mouse.down()
    page.mouse.move(box['x'] + box['width'] * .5, box['y'] + box['height'] * .7, steps=8)
    page.mouse.up()

def continuous_gallery(page):
    page.wait_for_function("""() => {
      const editor = document.querySelector('.cx-image-workspace');
      const composer = document.querySelector('.cx-compose-area');
      return Math.abs(parseFloat(editor.style.getPropertyValue('--cx-image-composer-inset')) - composer.getBoundingClientRect().height) < 1;
    }""")
    state = page.evaluate("""() => {
      const gallery = document.querySelector('.cx-image-gallery');
      const composer = document.querySelector('.cx-compose-area').getBoundingClientRect();
      const conversation = document.querySelector('.cx-conversation').getBoundingClientRect();
      const image = gallery.querySelector('figure:last-child img');
      gallery.scrollTop += image.getBoundingClientRect().top - (composer.top - 80);
      const rect = image.getBoundingClientRect();
      const y = composer.top + 20, x = rect.left + 4;
      const visibleBehind = document.elementsFromPoint(x, y).includes(image);
      gallery.scrollTop = gallery.scrollHeight;
      const reachable = image.getBoundingClientRect().bottom <= composer.top;
      gallery.scrollTop = 0;
      return { bottom: gallery.getBoundingClientRect().bottom, windowBottom: conversation.bottom, visibleBehind, reachable };
    }""")
    assert abs(state['bottom'] - state['windowBottom']) < 1, state
    assert state['visibleBehind'], state
    assert state['reachable'], state

with headless_browser() as browser:
    page = browser.new_page(viewport={'width':1710,'height':1074}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    # Die echte Webview-CSP muss auch Bilder, Auswahl und Vorschaudaten erlauben.
    host_source = (Path(__file__).resolve().parents[1] / 'engine/packages/vscode/src/panel/chatViewProvider.ts').read_text()
    policy = re.search(r'http-equiv="Content-Security-Policy" content="([^\"]+)"', host_source).group(1)
    policy = policy.replace('${webview.cspSource}', 'http://127.0.0.1:4173').replace('${nonce}', 'cortex-image-test')
    def host_policy(route):
        response = route.fetch()
        html = response.text().replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="' + policy + '">')
        html = re.sub(r'<script(?=[\s>])', '<script nonce="cortex-image-test"', html)
        route.fulfill(response=response, body=html)
    page.route('**/dev/preview.html?*', host_policy)
    page.goto('http://127.0.0.1:4173/dev/preview.html?mode=agent')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e) => e.remove()')
    page.get_by_title('Hinzufügen', exact=True).click()
    page.get_by_role('menuitem', name='Bild erstellen').click()
    page.locator('.composer textarea').fill('Ein roter Würfel')
    page.locator('.composer textarea').press('Enter')
    card = page.locator('.cx-img-card')
    expect(card).to_have_count(1)
    page.wait_for_function("() => [...document.querySelectorAll('.cx-img-open img')].every(i=>i.complete&&i.naturalWidth)")
    assert abs(card.locator('.cx-img-open').bounding_box()['width'] - 480) < 1
    card.get_by_role('button', name='Antwort war schlecht').click()
    assert last(page, 'rateAnswer')['poor']
    card.get_by_role('button', name='Bild kopieren').click()
    assert last(page, 'imageAction')['action'] == 'copy'
    if SHOTS: page.screenshot(path=str(SHOTS/'image-chat.png'))
    page.get_by_role('button', name='Bild 1 öffnen').click()
    editor = page.get_by_role('region', name='Bildbearbeitung', exact=True)
    expect(editor).to_be_visible()
    page.wait_for_function("() => document.querySelector('.cx-image-picture img')?.naturalWidth > 0")
    # Die darüberliegende native Fensterleiste benötigt 44 px freien Platz.
    assert editor.locator('.cx-image-header').bounding_box()['y'] >= 44
    first_path = page.evaluate("document.querySelector('.cx-image-picture img').getAttribute('src')")
    if SHOTS: page.screenshot(path=str(SHOTS/'image-viewer.png'))

    # Popups, Zoom und Rückkehr; Escape darf nur das offene Menü schließen.
    editor.get_by_role('button', name='Zoom', exact=True).click()
    page.keyboard.press('Escape')
    expect(editor).to_be_visible()
    expect(editor.get_by_role('menu', name='Zoom', exact=True)).to_have_count(0)
    editor.get_by_role('button', name='Zoom', exact=True).click()
    editor.get_by_role('menuitemradio', name='50 %', exact=True).click()
    expect(editor.get_by_role('button', name='Zoom', exact=True)).to_contain_text('50 %')
    assert abs(page.locator('.cx-image-picture').bounding_box()['width'] - 256) < 1
    editor.get_by_role('button', name='Öffnen', exact=True).click()
    editor.get_by_role('menuitem', name='Im Finder zeigen').click()
    assert last(page, 'imageAction')['action'] == 'reveal'

    # Kommentar wird mit Quelle und normierten Koordinaten verschickt.
    editor.get_by_role('button', name='Kommentieren', exact=True).click()
    region(page)
    page.get_by_role('textbox', name='Bildkommentar').fill('Färbe diesen Bereich blau.')
    if SHOTS: page.screenshot(path=str(SHOTS/'image-comment.png'))
    page.get_by_role('button', name='Änderung senden').click()
    sent = last(page, 'send')
    assert sent['image']['edit']['kind'] == 'comment', sent
    expected = {'x': .2, 'y': .3, 'width': .3, 'height': .4}
    for k,v in expected.items(): assert abs(sent['image']['edit']['region'][k] - v) < .01, sent
    assert len(sent['attachments']) == 1 and sent['attachments'][0].endswith('/1.jpg'), sent
    expect(editor.locator('.cx-image-thumbs button')).to_have_count(2)
    expect(editor.get_by_role('button', name='Zoom', exact=True)).to_contain_text('50 %')

    # Entfernen bleibt bis zur Auswahl gesperrt und verändert die ausgewählte Version.
    editor.get_by_role('button', name='Entfernen', exact=True).click()
    expect(page.get_by_role('button', name='Auswahl entfernen')).to_be_disabled()
    region(page)
    page.get_by_role('button', name='Auswahl entfernen').click()
    assert last(page, 'send')['image']['edit']['kind'] == 'remove'
    expect(editor.locator('.cx-image-thumbs button')).to_have_count(3)
    editor.get_by_role('button', name='HG entfernen', exact=True).click()
    assert last(page, 'send')['image']['edit'] == {'kind': 'background'}
    expect(editor.locator('.cx-image-thumbs button')).to_have_count(4)

    # Galerie: Auswahl und Anhänge bleiben synchron, Doppelklick öffnet das Original.
    editor.get_by_role('button', name='Galerie', exact=True).click()
    editor.get_by_role('button', name='Bild 1 auswählen').click()
    expect(page.locator('.attachment-row.has-preview')).to_have_count(1)
    assert abs(editor.locator('.cx-image-gallery figure').first.bounding_box()['width'] - 292) < 1
    editor.get_by_role('button', name='Mehrfachauswahl', exact=True).click()
    editor.get_by_role('button', name='Bild 2 auswählen').click()
    expect(page.locator('.attachment-row.has-preview')).to_have_count(2)
    # Auch mit Anhängen läuft die Galerie hinter dem Composer bis zum Fensterrand.
    continuous_gallery(page)
    page.set_viewport_size({'width': 960, 'height': 800})
    continuous_gallery(page)
    if SHOTS: page.screenshot(path=str(SHOTS/'image-continuous-canvas.png'))
    page.set_viewport_size({'width': 1710, 'height': 1074})
    editor.get_by_role('button', name='Bild speichern', exact=True).click()
    saved = last(page, 'imageAction')
    assert saved['action'] == 'saveAll' and len(saved['paths']) == 2, saved
    if SHOTS: page.screenshot(path=str(SHOTS/'image-gallery.png'))
    page.locator('.attachment-row.has-preview .attachment-x').first.click()
    expect(editor.get_by_role('button', name='Bild 1 auswählen')).to_have_attribute('aria-pressed', 'false')
    expect(page.locator('.attachment-row.has-preview')).to_have_count(1)
    editor.get_by_role('button', name='Bild 1 auswählen').dblclick()
    expect(editor.locator('.cx-image-canvas')).to_be_visible()
    expect(editor.locator('.cx-image-picture img')).to_have_attribute('src', first_path)

    # Varianten behalten auch einen vergrößerten und verschobenen Ausschnitt.
    editor.get_by_role('button', name='Zoom', exact=True).click()
    editor.get_by_role('menuitemradio', name='400 %', exact=True).click()
    viewport = editor.locator('.cx-image-canvas')
    before_pan = viewport.evaluate('(e) => { e.scrollLeft = 120; e.scrollTop = 160; return [e.scrollLeft, e.scrollTop]; }')
    assert before_pan[0] > 0 and before_pan[1] > 0, before_pan
    editor.get_by_role('button', name='Bild 2 anzeigen', exact=True).click()
    expect(editor.get_by_role('button', name='Zoom', exact=True)).to_contain_text('400 %')
    assert viewport.evaluate('(e) => [e.scrollLeft, e.scrollTop]') == before_pan
    editor.get_by_role('button', name='Bild 1 anzeigen', exact=True).click()
    editor.get_by_role('button', name='Zoom', exact=True).click()
    editor.get_by_role('menuitemradio', name='50 %', exact=True).click()

    # Pixelmaße: Sperre, Eingabe, konkreter lokaler Auftrag.
    editor.get_by_role('button', name='Größe ändern', exact=True).click()
    size = page.get_by_role('region', name='Bildgröße', exact=True)
    size.get_by_label('Breite').fill('317')
    expect(size.get_by_label('Höhe')).to_have_value('317')
    size.get_by_role('button', name='Seitenverhältnis beibehalten').click()
    size.get_by_label('Höhe').fill('191')
    size.get_by_role('button', name='Größe ändern', exact=True).click()
    resized = last(page, 'resizeImage')
    assert resized['width'] == 317 and resized['height'] == 191, resized

    # Neben dem Chat öffnen, zurück, Folgeauftrag mit ausgewählten Referenzen.
    editor.get_by_role('button', name='Neben Chat anzeigen').click()
    expect(page.locator('.cx-transcript-scroll')).to_be_visible()
    boundary = editor.get_by_role('separator', name='Breite der Bildansicht')
    box = boundary.bounding_box()
    before = editor.bounding_box()['width']
    page.mouse.move(box['x'] + box['width'] / 2, box['y'] + 240)
    page.mouse.down()
    page.mouse.move(box['x'] + box['width'] / 2 - 80, box['y'] + 240, steps=10)
    page.mouse.up()
    assert abs(editor.bounding_box()['width'] - before - 80) < 2
    assert not page.locator('body.cx-resizing-pane').count()
    editor.get_by_role('button', name='Bildansicht vergrößern').click()
    expect(page.locator('.cx-transcript-scroll')).to_be_hidden()
    page.locator('.composer textarea').fill('Gib ihm einen grünen Hintergrund.')
    page.locator('.composer textarea').press('Enter')
    followup = last(page, 'send')
    assert followup['attachments'] and followup['image']['count'] == 1, followup
    assert 'edit' not in followup['image'], followup
    page.keyboard.press('Escape')
    expect(editor).to_have_count(0)
    expect(page.locator('.cx-transcript-scroll')).to_be_visible()
    expect(page.locator('.cx-img-card')).to_have_count(5)

    # Werkzeugleiste respektiert eine bewusst gewechselte Anbieterwahl.
    page.evaluate("""() => window.dispatchEvent(new MessageEvent('message', {data:{kind:'accounts', accounts: profiles.map(p => p.provider === 'grok' ? {...p,available:true,authState:'ok'} : p)}}))""")
    page.locator('.cx-img-card').last.get_by_role('button', name='Bild 1 öffnen').click()
    page.get_by_title('Bildmodell wählen', exact=True).click()
    page.get_by_role('menuitemradio', name='Grok Imagine').click()
    editor.get_by_role('button', name='HG entfernen', exact=True).click()
    assert last(page, 'send')['imageProvider'] == 'grok'
    page.keyboard.press('Escape')

    # Bildvorgang im normalen Chat: Ladefläche verschwindet beim Abbruch.
    page.evaluate("""() => {
      for (const data of [{kind:'routing',messageId:'pending',target:{provider:'codex',account:'privat'},reason:'test'}, {kind:'toolUse',messageId:'pending',name:'image_gen',action:'other'}, {kind:'busy',running:true}]) window.dispatchEvent(new MessageEvent('message',{data}));
    }""")
    expect(page.get_by_role('status', name='Bild wird erstellt')).to_be_visible()
    page.evaluate("window.dispatchEvent(new MessageEvent('message',{data:{kind:'busy',running:false}}))")
    expect(page.get_by_role('status', name='Bild wird erstellt')).to_have_count(0)
    assert not errors, errors
    print('cortex_image_editor_ui: ok')
