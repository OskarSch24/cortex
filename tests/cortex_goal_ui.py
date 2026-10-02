"""/goal und mehrere Slash-Befehle je Nachricht — gegen das echte Bündel und die Vorschau-Attrappe.

Nur chromium-headless-shell (tests/headless_browser.py); die Attrappe spielt den
Host, es läuft kein Modell und kein Desktop-Browser.
"""
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/screenshots'
OUT.mkdir(exist_ok=True)
PORT = 4197

with headless_browser(port=PORT) as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def emit(message):
        page.evaluate('data => window.dispatchEvent(new MessageEvent("message", { data }))', message)

    def messages(kind):
        return page.evaluate('(kind) => (window.__hostMessages || []).filter(message => message.kind === kind)', kind)

    def goal(**changes):
        base = {'id': 'g1', 'objective': '/test und bring den Lint auf null', 'status': 'active', 'rounds': 1, 'maxRounds': 30, 'idle': 0, 'startedAt': 0, 'workMs': 540000, 'note': 'Die zwei übrigen Snapshot-Tests reparieren'}
        base.update(changes)
        emit({'kind': 'goal', 'conversationId': 'site', 'goal': base})

    page.goto(f'http://127.0.0.1:{PORT}/dev/preview.html?mode=agent&scenario=goal')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(element) => element.remove()')

    # Die Leiste über dem Eingabefeld: Aufgabe, nächster Schritt, Stand, Pausieren.
    strip = page.get_by_role('region', name='Ziel')
    expect(strip).to_be_visible()
    expect(strip.locator('.cx-goal-objective')).to_have_text('/test und bring den Lint auf null')
    expect(strip.locator('.cx-goal-note')).to_have_text('Als Nächstes: Die zwei übrigen Snapshot-Tests reparieren')
    expect(strip.get_by_role('status')).to_have_text('Runde 2 läuft')
    assert strip.locator('.cx-goal-state').evaluate('e => getComputedStyle(e).color') == 'rgb(91, 197, 146)'  # --cx-green
    assert strip.locator('svg').count() >= 3  # Ziel, Stand, Knöpfe — überall Icons
    strip_box = strip.bounding_box()
    composer_box = page.locator('.composer').bounding_box()
    assert strip_box['y'] < composer_box['y'] < strip_box['y'] + strip_box['height'], (strip_box, composer_box)

    # Im Verlauf: der /goal als Nachricht, die zweite Runde als schmale Zeile, die Meldung als Satz statt JSON.
    expect(page.locator('.cx-c-user-row')).to_have_count(1)
    expect(page.locator('.cx-c-user-row')).to_contain_text('/goal /test und bring den Lint auf null')
    round_row = page.locator('.tl-goal-round')
    expect(round_row).to_have_count(1)
    expect(round_row).to_have_text('Ziel · Runde 2')
    assert 'Continue with the goal' in (round_row.get_attribute('title') or '')
    report = page.locator('.md-goal-report')
    expect(report).to_have_count(1)
    expect(report).to_contain_text('Als Nächstes')
    expect(report).to_contain_text('Die zwei übrigen Snapshot-Tests reparieren')
    assert '"status"' not in page.locator('.transcript').inner_text()
    page.screenshot(path=str(OUT / 'goal-running.png'))

    # Pausieren und Weiter gehen an den Host; die Leiste folgt seinem Stand.
    strip.get_by_role('button', name='Pausieren').click()
    assert messages('goalAction')[-1]['action'] == 'pause'
    expect(strip.get_by_role('status')).to_have_text('Angehalten · von dir angehalten')
    strip.get_by_role('button', name='Weiter').click()
    assert messages('goalAction')[-1]['action'] == 'resume'
    expect(strip.get_by_role('status')).to_have_text('Runde 2 läuft')

    # Braucht das Ziel dich: Bernstein und der Grund.
    goal(status='blocked', rounds=2, note='Welche Domain soll die Seite bekommen?')
    expect(strip.get_by_role('status')).to_have_text('Wartet auf dich')
    expect(strip.locator('.cx-goal-note')).to_have_text('Braucht: Welche Domain soll die Seite bekommen?')
    assert strip.locator('.cx-goal-state').evaluate('e => getComputedStyle(e).color') == 'rgb(226, 174, 85)'  # --cx-amber
    expect(strip.get_by_role('button', name='Weiter')).to_be_visible()
    page.screenshot(path=str(OUT / 'goal-blocked.png'))

    # Erreicht: Runden, Dauer, Nachweis — und nur noch Schließen.
    goal(status='done', rounds=3, workMs=780000, note='npm test: 214 bestanden, Lint sauber')
    expect(strip.get_by_role('status')).to_have_text('Erreicht · 3 Runden · 13 Min.')
    expect(strip.locator('.cx-goal-note')).to_have_text('Nachweis: npm test: 214 bestanden, Lint sauber')
    expect(strip.get_by_role('button', name='Pausieren')).to_have_count(0)
    expect(strip.get_by_role('button', name='Weiter')).to_have_count(0)
    emit({'kind': 'delta', 'messageId': 'goal-2', 'text': '\n\nBeide Snapshots passen wieder.\n\n```cortex-goal\n{"status": "done", "evidence": "npm test: 214 bestanden, Lint sauber"}\n```'})
    emit({'kind': 'done', 'messageId': 'goal-2', 'durationMs': 240000, 'metered': False, 'at': 0})
    expect(page.locator('.md-goal-report.is-done')).to_contain_text('Ziel erreicht')
    page.screenshot(path=str(OUT / 'goal-done.png'))
    strip.get_by_role('button', name='Ziel schließen').click()
    assert messages('goalAction')[-1]['action'] == 'clear'
    expect(page.get_by_role('region', name='Ziel')).to_have_count(0)

    # Mehrere Befehle in einer Nachricht: das Menü öffnet auch hinter einem Befehl.
    emit({'kind': 'busy', 'running': False})
    # Die Maus weg vom Menü: stünde sie darüber, wählte sie die Zeile unter sich.
    page.mouse.move(5, 5)
    text = page.locator('.composer > textarea')
    text.fill('/goal /te')
    listbox = page.get_by_role('listbox', name='Slash-Befehle')
    expect(listbox).to_be_visible()
    expect(page.get_by_role('option').filter(has=page.get_by_text('Tests ausführen', exact=True))).to_be_visible()
    text.press('Enter')
    expect(text).to_have_value('/goal /test ')
    # Hinter dem Anfang nur, was sich kombinieren lässt — Aktionen stehen allein vorn.
    text.fill('/goal Bitte /arch')
    expect(page.get_by_role('option').filter(has=page.get_by_text('Archivieren', exact=True))).to_have_count(0)
    text.fill('/arch')
    expect(page.get_by_role('option').filter(has=page.get_by_text('Archivieren', exact=True))).to_be_visible()
    text.press('Escape')
    # In Eingefügtem (nach einer Leerzeile) bleibt `/` Text.
    text.fill('Was steht im Log?\n\nGET /te')
    expect(listbox).to_have_count(0)
    # Senden geht als Text an den Host, der Ziel und Befehle auflöst.
    text.fill('/goal /test die API')
    page.locator('.send').click()
    assert messages('send')[-1]['text'] == '/goal /test die API', messages('send')[-1]
    # Picker-Suche findet /goal über seine deutschen Stichworte.
    text.fill('/dranbleiben')
    expect(page.get_by_role('option').filter(has=page.get_by_text('Ziel verfolgen', exact=True))).to_be_visible()
    text.press('Escape')

    # Ziel-Leiste und Warteschlange übereinander; schmale Fenster ohne Querscrollen.
    goal(status='active', rounds=4, note='Tests für den Export ergänzen')
    emit({'kind': 'messageQueue', 'conversationId': 'site', 'items': [{'id': 'q1', 'text': 'Danach bitte auch die README anpassen', 'canSteer': False, 'steerReason': 'Wartet.', 'attachments': []}], 'paused': False})
    emit({'kind': 'busy', 'running': True})
    expect(page.get_by_role('region', name='Nachrichten-Warteschlange')).to_be_visible()
    page.screenshot(path=str(OUT / 'goal-with-queue.png'))
    for width in [1152, 960, 760]:
        page.set_viewport_size({'width': width, 'height': 800})
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), width
        expect(strip).to_be_visible()
        assert strip.locator('.cx-goal-objective').bounding_box()['width'] > 60, width
        page.screenshot(path=str(OUT / f'goal-{width}.png'))

    # Ein anderer Chat hat kein Ziel.
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.get_by_role('button', name='Kurze Frage zu Regex', exact=True).click()
    expect(page.get_by_role('region', name='Ziel')).to_have_count(0)

    assert errors == [], errors
    print('Goal UI: Leiste, Runden im Verlauf, Statuszeile, Pausieren/Weiter/Schließen, mehrere Befehle je Nachricht und schmale Breiten bestanden.')
    page.close()
