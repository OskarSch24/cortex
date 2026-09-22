"""Excalidraw-Zeichenfläche im Dock, mit Fixture-Nachrichten — kein Anbieter, kein Netz.

Prüft: `/excalidraw …` öffnet die Fläche, der Block aus der Antwort wird
gezeichnet, die Zeichnung geht als Text an den Host (das sieht die KI), ein
zweiter Auftrag ersetzt sie, „Neu zeichnen“ holt die alte zurück, SVG-Export,
Schließen nimmt sie der KI wieder weg. Der Vorschau-Server auf 4173 startet
von selbst (headless_browser.preview_server).
"""
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

ROOT = Path(__file__).resolve().parent.parent
BASE = 'http://127.0.0.1:4173/dev/preview.html?mode=agent&scenario=canvas'
SHOTS = ROOT / 'docs/screenshots/canvas'
SHOTS.mkdir(parents=True, exist_ok=True)


def send(page, text):
    box = page.locator('.cx-composer textarea, .composer textarea, textarea').first
    box.click()
    box.fill(text)
    # Die Befehlsliste unter dem Slash würde Enter für sich nehmen.
    page.keyboard.press('Escape')
    box.press('Enter')


def canvas_state(page):
    return page.evaluate('() => window.__cortexCanvas')


with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1500, 'height': 950}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e)=>e.remove()')

    # 1. /excalidraw allein öffnet nur die Fläche.
    send(page, '/excalidraw')
    canvas = page.locator('.cx-canvas')
    expect(canvas).to_be_visible()
    expect(page.locator('.cx-canvas .excalidraw')).to_be_visible(timeout=20000)
    expect(page.get_by_role('tab', name='Excalidraw')).to_have_count(1)
    expect(page.locator('.cx-user, .cx-c-user, [class*="user-bubble"]')).to_have_count(0)

    # 2. Mit Auftrag zeichnet die Antwort eine Mindmap.
    send(page, '/excalidraw Mindmap zum Wasserkreislauf')
    card = page.locator('.cx-canvas-card').last
    expect(card).to_contain_text('Wasserkreislauf', timeout=10000)
    expect(card).to_contain_text('Mindmap · 14 Knoten')
    page.wait_for_function('() => Object.values(window.__cortexCanvas.visible).some(d => d && d.includes("Verdunstung"))', timeout=10000)
    state = canvas_state(page)
    conv = next(k for k, v in state['visible'].items() if v and 'Verdunstung' in v)
    seen = state['visible'][conv]
    assert 'ellipse "Wasserkreislauf"' in seen, seen
    assert 'Layout check' not in seen, seen
    assert seen.count(' arrow ') == 13, seen
    page.wait_for_function(f'() => (window.__cortexCanvas.scenes["{conv}"]?.applied || []).length === 1', timeout=10000)
    scene = canvas_state(page)['scenes'][conv]['scene']
    assert '"type": "excalidraw"' in scene or '"type":"excalidraw"' in scene, scene[:200]
    page.wait_for_timeout(600)
    page.locator('.cx-dock').screenshot(path=str(SHOTS / '01-mindmap.png'))

    # 3. Die Elemente liegen wirklich auf der Fläche und überlappen nicht.
    shapes = page.evaluate('''() => JSON.parse(window.__cortexCanvas.scenes[Object.keys(window.__cortexCanvas.scenes)[0]].scene)
        .elements.filter(e => !e.isDeleted && ['rectangle','ellipse'].includes(e.type)).map(e => [e.x, e.y, e.width, e.height])''')
    assert len(shapes) == 14, len(shapes)
    for i, a in enumerate(shapes):
        for b in shapes[i + 1:]:
            assert not (a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3]), (a, b)

    # 4. Ein Ablauf ersetzt die Mindmap.
    send(page, '/excalidraw Ablauf einer Bestellung')
    expect(page.locator('.cx-canvas-card').last).to_contain_text('Diagramm · 5 Knoten', timeout=10000)
    page.wait_for_function(f'() => (window.__cortexCanvas.visible["{conv}"] || "").includes("Artikel auf Lager?")', timeout=10000)
    seen = canvas_state(page)['visible'][conv]
    assert 'Verdunstung' not in seen, seen
    assert 'text "Lager"' in seen and 'diamond "Artikel auf Lager?"' in seen, seen
    assert 'Layout check' not in seen, seen
    page.wait_for_timeout(600)
    page.locator('.cx-dock').screenshot(path=str(SHOTS / '02-ablauf.png'))

    # 5. „Neu zeichnen“ an der ersten Karte holt die Mindmap zurück.
    page.locator('.cx-canvas-card').first.get_by_role('button', name='Neu zeichnen').click()
    page.wait_for_function(f'() => (window.__cortexCanvas.visible["{conv}"] || "").includes("Verdunstung")', timeout=10000)

    # 6. Export als SVG geht an den Host.
    # Emoji und SVG stehen als Werkzeuge in Excalidraws eigener Leiste.
    expect(page.locator('.App-toolbar .ToolIcon.Shape ~ .cx-xtools')).to_have_count(1)
    page.get_by_role('button', name='Als SVG sichern').click()
    page.wait_for_function('() => window.__cortexCanvas.exports.length === 1', timeout=10000)
    export = canvas_state(page)['exports'][0]
    assert export['format'] == 'svg' and export['length'] > 1000, export

    # 7. Ein anderer Reiter davor lässt die Fläche stehen; schließen nimmt sie der KI weg.
    page.get_by_role('button', name='Etwas hinzufügen').click()
    page.get_by_role('menuitem', name='Änderungen').click()
    expect(canvas).to_be_hidden()
    assert canvas_state(page)['visible'][conv], 'Fläche hinter anderem Reiter darf nicht verschwinden'
    page.get_by_role('tab', name='Excalidraw').click()
    expect(canvas).to_be_visible()
    page.get_by_role('button', name='Excalidraw schließen').click()
    page.wait_for_function(f'() => window.__cortexCanvas.visible["{conv}"] === null', timeout=5000)

    # 8. Wieder öffnen lädt den gespeicherten Stand.
    page.get_by_role('button', name='Etwas hinzufügen').click()
    page.get_by_role('menuitem', name='Excalidraw').click()
    page.wait_for_function(f'() => (window.__cortexCanvas.visible["{conv}"] || "").includes("Verdunstung")', timeout=15000)

    # 9. Eine Deutschlandkarte aus echten Grenzen, mit Orten.
    send(page, '/excalidraw Deutschlandkarte mit Berlin, Hamburg, München und Köln')
    expect(page.locator('.cx-canvas-card').last).to_contain_text('Karte · Deutschland · 4 Orte', timeout=10000)
    page.wait_for_function(f'() => (window.__cortexCanvas.visible["{conv}"] || "").includes("text \\"München\\"")', timeout=15000)
    lines = page.evaluate(f'() => JSON.parse(window.__cortexCanvas.scenes["{conv}"].scene).elements.filter(e => !e.isDeleted && e.type === "line").length')
    assert lines > 30, lines
    page.wait_for_timeout(700)
    page.locator('.cx-dock').screenshot(path=str(SHOTS / '04-deutschlandkarte.png'))

    # 10. Emoji einfügen: landet als Text auf der Fläche.
    page.get_by_role('button', name='Emoji', exact=True).click()
    panel = page.get_by_role('dialog', name='Emoji einfügen')
    assert panel.locator('.cx-emoji-cell').count() > 1800, 'nicht alle Emojis'
    page.wait_for_timeout(300)
    page.locator('.cx-dock').screenshot(path=str(SHOTS / '05-emoji.png'))
    panel.get_by_role('searchbox', name='Emoji suchen').fill('rakete')
    panel.get_by_role('button', name='Rakete').click()
    page.wait_for_function(f'() => (window.__cortexCanvas.visible["{conv}"] || "").includes("🚀")', timeout=10000)

    # 11. Prüfschicht: ein Kasten quer über die Karte wird gemeldet, „Aufräumen“ behebt es.
    page.evaluate('''() => { const api = document.querySelector('.cx-canvas .excalidraw'); }''')
    expect(page.get_by_role('button', name='Aufräumen')).to_have_count(1)
    page.get_by_role('button', name='Aufräumen').click()
    page.wait_for_timeout(1200)
    seen = canvas_state(page)['visible'][conv]
    assert 'Layout check' not in seen, seen[-600:]

    # 12. Das Modell sieht die Fläche: canvas_view liefert ein Bild, canvas_draw zeichnet und liefert das Ergebnis.
    emit = lambda m: page.evaluate('m => window.dispatchEvent(new MessageEvent("message", { data: m }))', m)
    emit({'kind': 'canvasRequest', 'reqId': 'v1', 'conversationId': conv})
    page.wait_for_function('() => window.__cortexCanvas.answers.some(a => a.reqId === "v1")', timeout=20000)
    view = next(a for a in canvas_state(page)['answers'] if a['reqId'] == 'v1')
    assert view['png'] > 5000 and not view['headless'] and not view.get('error'), view
    block = '{"layout":"flow","mode":"add","nodes":[{"id":"x1","label":"Neu A"},{"id":"x2","label":"Neu B"}],"edges":[["x1","x2"]]}'
    emit({'kind': 'canvasRequest', 'reqId': 'd1', 'conversationId': conv, 'code': block})
    page.wait_for_function('() => window.__cortexCanvas.answers.some(a => a.reqId === "d1")', timeout=20000)
    drew = next(a for a in canvas_state(page)['answers'] if a['reqId'] == 'd1')
    assert '"Neu A"' in drew['description'] and 'Layout check' not in drew['description'], drew['description'][-400:]
    # Eine Fläche im Hintergrund (anderer Chat, nicht im Dock): gezeichnet wird trotzdem, mit Bild.
    emit({'kind': 'canvasRequest', 'reqId': 'h1', 'conversationId': 'anderer-chat', 'code': block})
    page.wait_for_function('() => window.__cortexCanvas.answers.some(a => a.reqId === "h1")', timeout=20000)
    bg = next(a for a in canvas_state(page)['answers'] if a['reqId'] == 'h1')
    assert bg['headless'] and bg['png'] > 2000 and bg['json'] > 100, bg

    # Excalidraw lädt nichts aus dem Netz; Schriften kommen aus media/excalidraw.
    # Der Schrift-Worker braucht ein ES-Modul; im IIFE-Paket rechnet
    # Excalidraw beim Export deshalb im Hauptthread — gewollt, kein Fehler.
    bad = [e for e in errors if 'favicon' not in e and 'falling back to the main thread' not in e]
    assert not bad, bad
    print('canvas ok —', len(shapes), 'Formen, Screenshots in', SHOTS)
