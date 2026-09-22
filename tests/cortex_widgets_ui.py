"""Chat-Widgets im echten Webview-Bundle, mit Fixture-Nachrichten — kein Anbieter, kein Netz.

Der Vorschau-Server auf 4173 startet von selbst (headless_browser.preview_server).
"""
import json
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = json.loads((ROOT / 'engine/packages/vscode/dev/widget-samples.json').read_text())
BASE = 'http://127.0.0.1:4173/dev/preview.html?mode=agent&scenario=widgets'
SHOTS = ROOT / 'docs/screenshots/widgets'
SHOTS.mkdir(parents=True, exist_ok=True)


def open_page(browser, query='', width=1440):
    page = browser.new_page(viewport={'width': width, 'height': 950}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.goto(BASE + query)
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e)=>e.remove()')
    # Der Sprung-Knopf und der Verlauf am unteren Rand gehören zum Chat, nicht zu den Karten.
    page.add_style_tag(content='.cx-jump{display:none!important}.cx-transcript-scroll{-webkit-mask-image:none!important;mask-image:none!important}')
    return page, errors


with headless_browser() as browser:
    page, errors = open_page(browser)
    cards = page.locator('section.cx-w')
    expect(cards).to_have_count(len(SAMPLES))
    # Kein Beispiel ist als Codeblock liegen geblieben.
    expect(page.locator('.cx-code-card')).to_have_count(0)
    for i, sample in enumerate(SAMPLES):
        card = cards.nth(i)
        card.evaluate('e => e.scrollIntoView({ block: "center" })')
        box = card.bounding_box()
        assert box and box['height'] > 60, (sample['spec']['type'], box)
        overflow = card.evaluate('e => [...e.querySelectorAll("*")].filter(c => c.getBoundingClientRect().right > e.getBoundingClientRect().right + 1 && !c.closest(".cx-w-code")).map(c => c.className && c.className.baseVal === undefined ? c.className : c.tagName).slice(0, 3)')
        assert overflow == [], (sample['spec']['type'], overflow)
        card.screenshot(path=str(SHOTS / f"{i + 1:02d}-{sample['spec']['type']}.png"))

    # Weltuhr rechnet selbst: Frankfurt steht vorne und hat keinen Versatz.
    clock = page.get_by_role('region', name='Weltuhr')
    expect(clock.get_by_text('Hier')).to_be_visible()
    expect(clock).to_contain_text('New York')
    # Timer läuft.
    timer = page.get_by_role('region', name='Timer Fokus')
    first = timer.get_by_role('timer').inner_text()
    page.wait_for_timeout(2100)
    assert timer.get_by_role('timer').inner_text() != first, 'Timer zählt nicht'
    timer.get_by_role('button', name='Pause').click()
    expect(timer.get_by_text('Pausiert')).to_be_visible()
    # To-do lässt sich abhaken.
    todo = page.get_by_role('region', name='Aufgaben Heute')
    todo.get_by_role('checkbox').first.click()
    expect(todo).to_contain_text('3 von 5 erledigt')
    # Umrechner rechnet mit dem Kurs.
    conv = page.get_by_role('region', name='Umrechner EUR DKK')
    conv.get_by_role('spinbutton').fill('100')
    expect(conv).to_contain_text('746,05')
    # Quiz deckt auf, Aktionen kommen erst danach.
    quiz = page.get_by_role('region', name='Quiz Wirtschaft · Magisches Viereck')
    expect(quiz.get_by_role('button', name='Nächste Frage')).to_have_count(0)
    quiz.get_by_role('button', name='Außenwirtschaftliches Gleichgewicht').click()
    expect(quiz).to_contain_text('Nicht ganz. Richtig ist B.')
    # Eine Aktion zeigt zuerst den genauen Folgeauftrag zur Bestätigung.
    quiz.get_by_role('button', name='Nächste Frage').click()
    expect(quiz.get_by_role('group', name='Folgeauftrag bestätigen')).to_be_visible()
    quiz.get_by_role('button', name='Ins Eingabefeld').click()
    expect(page.locator('.composer textarea')).to_have_value('Nächste Frage zum magischen Viereck.')
    # Kontrast rechnet Cortex, nicht das Modell.
    expect(page.get_by_role('region', name='Farbpalette Cortex · Grundtöne')).to_contain_text('16,1 : 1')
    page.get_by_role('region', name='Farbpalette Cortex · Grundtöne').screenshot(path=str(SHOTS / 'palette-computed.png'))
    assert errors == [], errors

    # Der Host hält die Interaktionen je konkretem Widget auch nach Neuladen.
    paused = timer.get_by_role('timer').inner_text()
    page.reload()
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('region', name='Aufgaben Heute')).to_contain_text('3 von 5 erledigt')
    timer = page.get_by_role('region', name='Timer Fokus')
    expect(timer.get_by_text('Pausiert')).to_be_visible()
    assert timer.get_by_role('timer').inner_text() == paused
    quiz = page.get_by_role('region', name='Quiz Wirtschaft · Magisches Viereck')
    quiz.get_by_role('button', name='Außenwirtschaftliches Gleichgewicht').click()
    page.evaluate('window.__hostMessages = []')
    quiz.get_by_role('button', name='Nächste Frage').click()
    assert not page.evaluate('window.__hostMessages.some(m => m.kind === "send")')
    quiz.get_by_role('button', name='Als Auftrag starten').click()
    assert page.evaluate('window.__hostMessages.filter(m => m.kind === "send" && m.text === "Nächste Frage zum magischen Viereck.").length') == 1

    # Kaputter Block bleibt Code mit Grund, laufender Block ist eine ruhige Platzhalterkarte.
    page, errors = open_page(browser, '&widget=timer&broken=1')
    expect(page.locator('.cx-code-card')).to_contain_text('Feld „items“ fehlt')
    expect(page.get_by_role('status', name='Widget wird erstellt')).to_be_visible()
    assert errors == [], errors

    # #78: real container widths, with similarly named long containers.
    page, errors = open_page(browser)
    server = page.get_by_role('region', name='Server demo-hetzner')
    server.locator('.cx-w-container .cx-w-mono').evaluate_all('es => es.forEach((e,i) => e.textContent = "production-background-processing-container-" + i)')
    for width in [320, 399]:
        server.evaluate('(e,w) => { const p=e.closest(".md"); p.style.width=w+"px"; p.style.maxWidth="none"; }', width)
        grid = server.locator('.cx-w-containers')
        assert grid.evaluate('e => getComputedStyle(e).gridTemplateColumns.split(" ").length') == 1, width
        assert server.locator('.cx-w-container .cx-w-mono').first.evaluate('e => e.scrollWidth <= e.clientWidth + 1'), width
        assert server.locator('.cx-w-container .cx-w-mono').first.bounding_box()['height'] > 20, width
    assert errors == [], errors

    for width in [1152, 960, 760]:
        page, errors = open_page(browser, width=width)
        expect(page.locator('section.cx-w')).to_have_count(len(SAMPLES))
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), width
        page.get_by_role('region', name='Server demo-hetzner').screenshot(path=str(SHOTS / f'server-{width}.png'))
        assert errors == [], errors

print(f'Widgets UI: {len(SAMPLES)} Widgets gezeichnet, Timer, To-do, Umrechner, Quiz, Aktionen, Fehlerfall, Platzhalter und drei Breiten bestanden.')
