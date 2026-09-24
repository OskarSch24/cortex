"""Rechte Seitenleiste nach Codex (Video 22.09.2026, docs/CODEX_SEITENLEISTE_ANALYSE.md).

Prüft mit echten Mausbewegungen: Hereinfahren (~0,40 s), Hinausfahren, Einklappen
ohne Verlust, Zurasten unter der Mindestbreite, Vollbild beim Überziehen samt
schwebender Eingabe, Verlassen des Vollbilds, Subagenten-Liste und -Protokoll,
Übersichtskarte neben dem Dock, +-Menü.
"""
import time
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

SHOTS = Path(__file__).resolve().parents[1] / 'docs' / 'screenshots' / 'codex-seitenleiste'
DAY = 24 * 3600e3


def post(page, data):
    page.evaluate("(data) => window.dispatchEvent(new MessageEvent('message', {data}))", data)


def width(locator):
    return locator.bounding_box()['width']


def drag(page, handle, dx):
    box = handle.bounding_box()
    x, y = box['x'] + box['width'] / 2, box['y'] + min(240, box['height'] / 2)
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + dx, y, steps=16)
    page.mouse.up()
    assert not page.locator('body.cx-resizing-pane').count()


def follow(page, handle, dx, measured, steps=14):
    """Zieht Schritt für Schritt und misst dabei und nach dem Loslassen alle 30 ms."""
    box = handle.bounding_box()
    x, y = box['x'] + box['width'] / 2, box['y'] + min(240, box['height'] / 2)
    page.mouse.move(x, y)
    page.mouse.down()
    during = []
    for i in range(1, steps + 1):
        page.mouse.move(x + dx * i / steps, y)
        during.append(measure(page, measured))
    page.mouse.up()
    after = []
    for _ in range(10):
        after.append(measure(page, measured))
        page.wait_for_timeout(30)
    return {'during': during, 'after': after}


def measure(page, selector):
    return round(page.evaluate("(s) => document.querySelector(s)?.getBoundingClientRect().width ?? 0", selector))


def strictly_down(values):
    """Nie breiter, und am Ende jeder Schritt kleiner — kein Stehenbleiben an einer Grenze."""
    tail = values[len(values) // 2:]
    return all(b <= a + 1 for a, b in zip(values, values[1:])) and all(b < a for a, b in zip(tail, tail[1:]))


def seed_agents(page):
    """Zwölf fertige Subagenten von vor drei Tagen und einer, der im Hintergrund läuft."""
    now = page.evaluate('Date.now()')
    names = ['Standalone host audit', 'Standalone data audit', 'Standalone ui audit', 'Agent reasoning ui test',
             'Agent reasoning host', 'Live resource sync', 'Automation runtime', 'Automation ui',
             'Titlebar audit', 'Single agent ui', 'Agent templates', 'Dock layout audit']
    post(page, {'kind': 'delta', 'messageId': 'm-agents', 'text': 'Ich verteile die Prüfung auf Subagenten.'})
    for i, name in enumerate(names):
        post(page, {'kind': 'agentStart', 'messageId': 'm-agents', 'id': f'a{i}', 'label': name, 'agentKind': 'Explore',
                    'prompt': f'Prüfe den Bereich „{name}“ und melde Abweichungen.'})
        post(page, {'kind': 'toolUse', 'messageId': 'm-agents', 'agentId': f'a{i}', 'name': 'Read',
                    'detail': 'src/App.tsx', 'path': 'src/App.tsx', 'action': 'read'})
        post(page, {'kind': 'agentEnd', 'messageId': 'm-agents', 'id': f'a{i}', 'status': 'completed',
                    'summary': f'{name}: keine Abweichungen gefunden.', 'durationMs': 60000 + i * 1000, 'toolUses': 3})
    post(page, {'kind': 'agentStart', 'messageId': 'm-agents', 'id': 'bg', 'label': 'Hintergrund-Indexer',
                'prompt': 'Indexiere das Projekt.', 'background': True})
    post(page, {'kind': 'done', 'messageId': 'm-agents', 'durationMs': 90000, 'metered': False, 'at': now - 3 * DAY})


with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1710, 'height': 1074})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:4173/dev/preview.html?mode=agent&scenario=conversation')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(node) => node.remove()')
    expect(page.locator('.cx-transcript-scroll')).to_be_visible()
    page.evaluate("() => localStorage.removeItem('cortex.pane.dock')")
    seed_agents(page)
    dock = page.get_by_role('complementary', name='Arbeitsbereich')
    card = page.get_by_role('complementary', name='Chat-Control-Panel')
    expect(card).to_be_visible()

    # ⌥⌘B (kommt vom Host als toolbar/dock): öffnet mit Subagenten, weil welche liefen.
    post(page, {'kind': 'toolbar', 'action': 'dock'})
    page.wait_for_timeout(90)
    early = width(dock)
    expect(page.locator('.cx-dock.enter')).to_have_count(1)
    page.wait_for_timeout(450)
    expect(page.locator('.cx-dock.enter')).to_have_count(0)
    final = width(dock)
    assert early < final * 0.9, (early, final)
    assert abs(final - 620) < 2, final
    expect(page.get_by_role('tab', name='Subagenten')).to_have_attribute('aria-selected', 'true')
    expect(dock.get_by_text('Aktiv · 1')).to_be_visible()
    expect(dock.get_by_text('Fertig · 12')).to_be_visible()
    expect(dock.get_by_text('2 weitere anzeigen')).to_be_visible()
    expect(dock.locator('.cx-agent-row')).to_have_count(11)
    expect(dock.locator('.cx-agent-row').nth(1)).to_contain_text('vor 3 Tag(e)')
    SHOTS.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(SHOTS / 'cortex-subagenten-liste.png'))

    # Protokoll eines Subagenten: harter Wechsel im selben Reiter, Zurück-Pfeil.
    dock.get_by_role('button', name='Automation runtime').click()
    head = dock.locator('.cx-agent-detail-head')
    expect(head).to_contain_text('Automation runtime')
    expect(head).to_contain_text('Explore')
    expect(dock.get_by_text('Automation runtime: keine Abweichungen gefunden.')).to_be_visible()
    page.screenshot(path=str(SHOTS / 'cortex-subagent-protokoll.png'))
    dock.get_by_role('button', name='Zurück zu den Subagenten').click()
    expect(dock.get_by_text('Fertig · 12')).to_be_visible()
    dock.get_by_role('button', name='2 weitere anzeigen').click()
    expect(dock.locator('.cx-agent-row')).to_have_count(13)

    # Neben einem schmalen Dock bleibt die Übersichtskarte stehen, neben einem breiten nicht.
    expect(card).to_have_count(0)
    handle = page.get_by_role('separator', name='Dock verbreitern')
    handle.focus()
    handle.press('End')  # End = größte Breite ohne Vollbild
    handle.press('Home')  # Home = Mindestbreite
    assert abs(width(dock) - 320) < 2
    expect(card).to_be_visible()

    # +-Menü: Dateien, Subagenten, Browser, Terminal …
    page.get_by_role('button', name='Etwas hinzufügen').click()
    menu = page.get_by_role('menu', name='Was soll hier liegen?')
    expect(menu.get_by_role('menuitem', name='Subagenten')).to_be_visible()
    menu.get_by_role('menuitem', name='Dateien').click()
    expect(page.get_by_role('tab', name='Datei öffnen')).to_have_attribute('aria-selected', 'true')

    # Einklappen über den Umschalter: fährt hinaus, nichts geht verloren.
    before = width(dock)
    page.get_by_role('button', name='Rechte Seitenleiste ausblenden').click()
    page.wait_for_timeout(120)
    mid = page.locator('.cx-dock').bounding_box()
    assert mid and 5 < mid['width'] < before - 5, (mid, before)
    page.wait_for_timeout(360)
    expect(page.locator('.cx-dock')).to_have_count(0)
    post(page, {'kind': 'toolbar', 'action': 'dock'})
    expect(page.get_by_role('tab', name='Datei öffnen')).to_have_attribute('aria-selected', 'true')
    expect(page.get_by_role('tab', name='Subagenten')).to_be_visible()
    page.wait_for_timeout(450)

    # Unter die Mindestbreite gezogen: die Kante geht ohne Halt mit (das Dock
    # wird angeschnitten), und nach dem Loslassen läuft es weich zu — mit
    # Zwischenbreiten statt eines Sprungs. Wieder offen, steht es auf der Mindestbreite.
    samples = follow(page, page.get_by_role('separator', name='Dock verbreitern'), 160, '.cx-dock')
    assert samples['during'][-1] < 320 - 100, samples
    assert strictly_down(samples['during']), samples
    assert any(5 < w < samples['during'][-1] - 5 for w in samples['after']), samples
    page.wait_for_timeout(360)
    expect(page.locator('.cx-dock')).to_have_count(0)
    post(page, {'kind': 'toolbar', 'action': 'dock'})
    page.wait_for_timeout(450)
    assert abs(width(dock) - 320) < 2

    # Über die Mindestbreite des Chats hinaus gezogen: der Chat wird ohne Halt
    # schmaler als seine 300 px, nach dem Loslassen wächst das Dock weich ins
    # Vollbild. Die Eingabe schwebt dann mittig über dem Dock.
    samples = follow(page, page.get_by_role('separator', name='Dock verbreitern'), -1050, '.cx-conversation')
    assert samples['during'][-1] < 300 - 100, samples
    assert strictly_down(samples['during']), samples
    assert any(5 < w < samples['during'][-1] - 5 for w in samples['after']), samples
    page.wait_for_timeout(200)
    expect(page.get_by_role('button', name='Vollbildmodus beenden')).to_be_visible()
    expect(page.locator('.cx-transcript-scroll')).to_be_hidden()
    composer = page.locator('.cx-workspace.dock-full .cx-compose-area')
    expect(composer).to_be_visible()
    dock_box, comp_box = dock.bounding_box(), composer.bounding_box()
    assert dock_box['x'] < 300 and dock_box['width'] > 1400, dock_box
    assert abs((comp_box['x'] + comp_box['width'] / 2) - (dock_box['x'] + dock_box['width'] / 2)) < 2
    # Die Eingabe schwebt unten in der Insel; die endet 8 px vor dem Fensterrand.
    assert comp_box['width'] <= 721 and comp_box['y'] + comp_box['height'] >= 1074 - 8 - 2
    page.locator('.cx-workspace.dock-full .composer textarea').fill('Im Vollbild tippen')
    expect(page.locator('.composer textarea')).to_have_value('Im Vollbild tippen')
    page.screenshot(path=str(SHOTS / 'cortex-vollbild.png'))

    # Verlassen über den Knopf: zurück zur geteilten Ansicht.
    # Der Chat wächst dabei weich von null auf seine Breite, ohne Sprung.
    page.get_by_role('button', name='Vollbildmodus beenden').click()
    expect(page.locator('.cx-transcript-scroll')).to_be_visible()
    page.wait_for_timeout(90)
    mid = measure(page, '.cx-conversation')
    page.wait_for_timeout(300)
    final = measure(page, '.cx-conversation')
    assert 5 < mid < final - 5 and final >= 299, (mid, final)

    # Der Knopf geht denselben Weg hinein: das Dock wächst, dann Vollbild.
    page.get_by_role('button', name='Vollbildmodus aktivieren').click()
    page.wait_for_timeout(90)
    mid = measure(page, '.cx-conversation')
    assert 5 < mid < final - 5, (mid, final)
    expect(page.get_by_role('button', name='Vollbildmodus beenden')).to_be_visible()

    # Aus dem Vollbild geschlossen: ohne Bewegung; wieder geöffnet: geteilt.
    post(page, {'kind': 'toolbar', 'action': 'dock'})
    expect(page.locator('.cx-dock')).to_have_count(0)
    post(page, {'kind': 'toolbar', 'action': 'dock'})
    expect(page.get_by_role('button', name='Vollbildmodus aktivieren')).to_be_visible()
    expect(page.locator('.cx-transcript-scroll')).to_be_visible()
    page.wait_for_timeout(450)

    # Aus der Übersichtskarte: ein laufender Subagent öffnet sein Protokoll.
    handle = page.get_by_role('separator', name='Dock verbreitern')
    handle.focus()
    handle.press('Home')
    card.get_by_role('button', name='Hintergrund-Indexer').click()
    expect(dock.locator('.cx-agent-detail-head')).to_contain_text('Hintergrund-Indexer')
    page.screenshot(path=str(SHOTS / 'cortex-geteilt-mit-karte.png'))

    assert not errors, errors
    print('cortex_seitenleiste_ui: ok')
