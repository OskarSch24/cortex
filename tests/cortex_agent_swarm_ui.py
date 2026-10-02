"""Die Schwarm-Karte im echten Webview-Bundle — Anzahl, Qualitätsanzeige, Auswahl, Start.

Kein Anbieter, kein Netz: der Vorschau-Server auf 4173 startet von selbst
(headless_browser.preview_server). Was die Karte an den Host schickt, landet in
`window.__hostMessages` und wird hier geprüft, statt einen Lauf zu starten.
"""
import json
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

ROOT = Path(__file__).resolve().parent.parent
BASE = 'http://127.0.0.1:4173/dev/preview.html?mode=agent&scenario=widgets'
SHOTS = ROOT / 'docs/screenshots/widgets'
SHOTS.mkdir(parents=True, exist_ok=True)

SAVED = [
    {'id': 'a-1', 'kind': 'agent', 'name': 'Fehlerreproduktion', 'description': '', 'instructions': '', 'updatedAt': 0,
     'agents': [{'id': 'r1', 'name': 'Fehlerreproduktion', 'role': 'Fehler zuverlässig nachstellen', 'instructions': '',
                 'target': {'provider': 'codex', 'account': 'privat'}, 'permissionMode': 'safe', 'skillPaths': [], 'dependsOn': []}]},
    {'id': 'a-2', 'kind': 'agent', 'name': 'Code-Review', 'description': '', 'instructions': '', 'updatedAt': 0,
     'agents': [{'id': 'r2', 'name': 'Code-Review', 'role': 'Änderungen prüfen und bewerten', 'instructions': '',
                 'target': {'provider': 'claude', 'account': 'privat'}, 'permissionMode': 'edits', 'skillPaths': [], 'dependsOn': []}]},
]


def open_page(browser, width=1440):
    page = browser.new_page(viewport={'width': width, 'height': 950}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e)=>e.remove()')
    # Wie im Widget-Test: Sprung-Knopf und Verlaufs-Maske gehören zum Chat, nicht zur Karte.
    page.add_style_tag(content='.cx-jump{display:none!important}.cx-transcript-scroll{-webkit-mask-image:none!important;mask-image:none!important}')
    return page, errors


def supply_agents(page, teams):
    """Die Karte fragt die Profile selbst ab; hier antwortet der Host für sie."""
    page.evaluate(
        "(teams) => window.dispatchEvent(new MessageEvent('message', {data: {kind: 'teamsState',"
        " state: {teams, runs: [], servers: [], skills: [], revision: 1}}}))", teams)


POOL_LANDS = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR',
              'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO']


def post_card(page, message_id, spec):
    """Eine Antwort mit Schwarm-Karte, wie sie das Modell schreibt."""
    block = '```cortex-widget\n' + json.dumps(spec, ensure_ascii=False) + '\n```'
    page.evaluate('m => window.postMessage(m, "*")', {'kind': 'delta', 'messageId': message_id, 'text': block})
    page.evaluate('m => window.postMessage(m, "*")', {'kind': 'done', 'messageId': message_id})


with headless_browser() as browser:
    page, errors = open_page(browser)
    card = page.get_by_role('region', name='Agenten-Schwarm')
    expect(card).to_be_visible()
    card.evaluate('e => e.scrollIntoView({ block: "center" })')

    # Die Karte fragt die gespeicherten Profile von sich aus an.
    assert page.evaluate("window.__hostMessages.some(m => m.kind === 'getTeams')"), 'Karte fragt keine Profile ab'

    count = card.get_by_role('spinbutton')
    more = card.get_by_role('button', name='Eine Rolle mehr')
    less = card.get_by_role('button', name='Eine Rolle weniger')

    # Der Vorschlag aus dem Beispiel steht drin, mit der Stufe dazu.
    expect(count).to_have_value('4')
    expect(card).to_contain_text('Qualitätsverlust: gering')

    # Die Stufen hängen an der Anzahl — und nennen ihren Grund.
    for _ in range(3):
        less.click()
    expect(count).to_have_value('1')
    expect(card).to_contain_text('Qualitätsverlust: keiner')
    expect(card).to_contain_text('eine Rolle')
    expect(card).to_contain_text('läuft sofort')
    expect(less).to_be_disabled()

    count.fill('7')
    expect(card).to_contain_text('Qualitätsverlust: spürbar')
    expect(card).to_contain_text('Überschneidung')

    # Viele Rollen ohne eigenen Bereich: hoch, wegen Überschneidung — gewartet
    # wird nicht, alle laufen gleichzeitig auf dem Konto des Chats.
    count.fill('13')
    expect(card).to_contain_text('Qualitätsverlust: hoch')
    expect(card).to_contain_text('Überschneidung')
    expect(card).to_contain_text('alle laufen gleichzeitig')
    expect(card).not_to_contain_text('je Konto')
    expect(card).not_to_contain_text('warten')

    # Über die Grenze hinaus nimmt das Feld nichts an.
    count.fill('25')
    expect(count).to_have_value('20')
    expect(more).to_be_disabled()
    card.screenshot(path=str(SHOTS / 'swarm-20.png'))

    # Ohne gespeicherte Agenten sagt die Auswahl, was stattdessen passiert.
    card.get_by_role('button', name='Agenten wählen').click()
    expect(card).to_contain_text('Noch keine gespeicherten Agenten')

    supply_agents(page, SAVED)
    expect(card.get_by_role('button', name='Fehlerreproduktion')).to_be_visible()
    expect(card.get_by_role('button', name='Code-Review')).to_be_visible()

    count.fill('2')
    card.get_by_role('button', name='Fehlerreproduktion').click()
    expect(card).to_contain_text('1 fest, 1 automatisch')
    card.get_by_role('button', name='Code-Review').click()
    expect(card).to_contain_text('2 fest, 0 automatisch')

    # Mehr anhaken, als Plätze da sind, hebt die Anzahl mit an.
    count.fill('1')
    expect(count).to_have_value('2')
    expect(less).to_be_disabled()
    card.screenshot(path=str(SHOTS / 'swarm-auswahl.png'))

    start = card.get_by_role('button', name='Starten')
    # Der Sitzname des Feldes wechselt mit dem Zustand (Auftrag da oder nicht),
    # deshalb hier über die Klasse statt über die Beschriftung.
    task = card.locator('textarea.cx-w-area')
    expect(card.get_by_label('Auftrag für alle Rollen')).to_be_visible()
    expect(start).to_be_enabled()

    # Ohne Auftrag startet nichts, und die Karte fragt danach.
    task.fill('')
    expect(start).to_be_disabled()
    expect(card).to_contain_text('Was sollen die Agenten machen?')
    assert page.evaluate("window.__hostMessages.filter(m => m.kind === 'startSwarm').length") == 0

    task.fill('Die offenen Punkte der Testliste abarbeiten.')
    expect(start).to_be_enabled()
    start.click()
    sent = page.evaluate("window.__hostMessages.filter(m => m.kind === 'startSwarm')")
    assert len(sent) == 1, sent
    assert sent[0]['task'] == 'Die offenen Punkte der Testliste abarbeiten.', sent[0]
    assert sent[0]['count'] == 2, sent[0]
    assert sent[0]['agentIds'] == ['a-1', 'a-2'], sent[0]
    assert sent[0]['swarmId'], sent[0]

    # Läuft der Schwarm, schrumpft die Karte auf eine Zeile: gearbeitet wird
    # im Hintergrund, die Rollen stehen in der Übersicht (seit 24.09.2026).
    running = {'id': 'run-1', 'teamId': sent[0]['swarmId'], 'teamName': 'Schwarm', 'task': sent[0]['task'],
               'status': 'running', 'startedAt': 0, 'jobs': [
                   {'agentId': 'swarm-agent-1', 'agentName': 'Fehlerreproduktion', 'status': 'completed'},
                   {'agentId': 'swarm-agent-2', 'agentName': 'Code-Review', 'status': 'running', 'activity': 'liest parts.tsx'}]}
    page.evaluate(
        "(run) => window.dispatchEvent(new MessageEvent('message', {data: {kind: 'teamsState',"
        " state: {teams: [], runs: [run], servers: [], skills: [], revision: 2}}}))", running)
    expect(card).to_contain_text('Agenten-Schwarm läuft · 1 von 2 arbeiten')
    expect(card).to_contain_text('1 fertig · 0 warten · im Hintergrund, siehe Übersicht')
    expect(card).not_to_contain_text('liest parts.tsx')
    stop = card.get_by_role('button', name='Alle stoppen')
    expect(stop).to_be_visible()
    stop.click()
    assert page.evaluate("window.__hostMessages.filter(m => m.kind === 'stopTeam' && m.runId === 'run-1').length") == 1
    card.screenshot(path=str(SHOTS / 'swarm-lauf.png'))

    assert errors == [], errors

    # Schmal darf nichts überlaufen.
    for width in [1152, 760]:
        page, errors = open_page(browser, width=width)
        card = page.get_by_role('region', name='Agenten-Schwarm')
        card.evaluate('e => e.scrollIntoView({ block: "center" })')
        overflow = card.evaluate('e => [...e.querySelectorAll("*")].filter(c => c.getBoundingClientRect().right > e.getBoundingClientRect().right + 1).length')
        assert overflow == 0, (width, overflow)
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), width
        assert errors == [], errors

    # Pool: mehr als 20 Einheiten, jede mit ihrem Bereich — die Karte zählt
    # alle, zeigt die ersten acht und schickt Bereiche, Gleichzeitigkeit und
    # Worktree-Trennung mit.
    pool_units = [{'name': land, 'role': f'Importer {land}', 'owns': [f'europa/importer/{land}/**', f'daten/{land}/']} for land in POOL_LANDS]
    page, errors = open_page(browser)
    post_card(page, 'pool-msg', {'type': 'agent-swarm', 'task': 'Importer Welle 2 für alle Länder', 'units': pool_units, 'isolation': 'worktree'})
    card = page.locator('section.cx-w', has_text='24 Einheiten')
    expect(card).to_be_visible()
    card.evaluate('e => e.scrollIntoView({ block: "center" })')
    expect(card).to_contain_text('24 Einheiten · 20 zugleich')
    expect(card).to_contain_text('Jede Einheit in ihrem eigenen Git-Worktree')
    expect(card).to_contain_text('Qualitätsverlust: gering')
    expect(card).to_contain_text('getrennte Bereiche')
    expect(card).to_contain_text('20 laufen zugleich auf dem Konto dieses Chats')
    expect(card.locator('.cx-w-pool-unit')).to_have_count(8)
    expect(card.locator('.cx-w-pool-owns').first).to_have_text('europa/importer/AT/** · daten/AT/')
    expect(card.locator('.cx-w-pool-more')).to_have_text('16 weitere')
    # Im Pool gibt es keine Besetzung von Hand.
    expect(card.get_by_role('spinbutton')).to_have_count(0)
    expect(card.get_by_role('button', name='Agenten wählen')).to_have_count(0)
    overflow = card.evaluate('e => [...e.querySelectorAll("*")].filter(c => c.getBoundingClientRect().right > e.getBoundingClientRect().right + 1).length')
    assert overflow == 0, overflow
    card.screenshot(path=str(SHOTS / 'swarm-pool.png'))

    card.get_by_role('button', name='Starten').click()
    sent = page.evaluate("window.__hostMessages.filter(m => m.kind === 'startSwarm')")
    assert len(sent) == 1, sent
    assert sent[0]['count'] == 24 and sent[0]['agentIds'] == [], sent[0]
    assert sent[0]['pool'] == {'concurrency': 20} and sent[0]['isolation'] == 'worktree', sent[0]
    assert sent[0]['proposed'][0] == {'name': 'AT', 'role': 'Importer AT', 'owns': ['europa/importer/AT/**', 'daten/AT/']}, sent[0]
    assert len(sent[0]['proposed']) == 24, sent[0]

    # Der laufende Pool nennt die Zahl je Stand statt „x von y“.
    jobs = ([{'agentId': f'u{i}', 'agentName': land, 'status': status} for i, (land, status) in enumerate(zip(POOL_LANDS,
            ['running'] * 3 + ['completed'] * 2 + ['failed'] + ['waiting'] * 18))])
    jobs[3]['outside'] = ['gemeinsam/schema.json']
    page.evaluate(
        "(run) => window.dispatchEvent(new MessageEvent('message', {data: {kind: 'teamsState',"
        " state: {teams: [], runs: [run], servers: [], skills: [], revision: 3}}}))",
        {'id': 'run-pool', 'teamId': sent[0]['swarmId'], 'teamName': 'Schwarm', 'task': sent[0]['task'], 'status': 'running', 'startedAt': 0, 'jobs': jobs})
    card = page.get_by_role('region', name='Agenten-Schwarm').filter(has_text='Schwarm läuft')
    expect(card).to_contain_text('Schwarm läuft · 3 arbeiten · 18 offen · 2 fertig · 1 gescheitert')
    expect(card).to_contain_text('1 außerhalb ihres Bereichs')
    # Die Merge-Warteschlange steht im selben Satz: übernommen und Konflikte.
    jobs[3]['merge'] = {'state': 'merged'}
    jobs[4]['merge'] = {'state': 'conflict', 'detail': 'src/a.ts'}
    page.evaluate(
        "(run) => window.dispatchEvent(new MessageEvent('message', {data: {kind: 'teamsState',"
        " state: {teams: [], runs: [run], servers: [], skills: [], revision: 4}}}))",
        {'id': 'run-pool', 'teamId': sent[0]['swarmId'], 'teamName': 'Schwarm', 'task': sent[0]['task'], 'status': 'running', 'startedAt': 0, 'jobs': jobs})
    expect(card).to_contain_text('1 außerhalb ihres Bereichs · 1 übernommen · 1 Konflikt')
    assert errors == [], errors

    # start: true im Pool startet von selbst, genau einmal, mit gedeckelter Gleichzeitigkeit.
    page, errors = open_page(browser)
    post_card(page, 'pool-auto', {'type': 'agent-swarm', 'start': True, 'task': 'Welle 3', 'units': pool_units[:6], 'concurrency': 99})
    page.wait_for_function("window.__hostMessages.some(m => m.kind === 'startSwarm')", timeout=10000)
    page.wait_for_timeout(800)
    sent = page.evaluate("window.__hostMessages.filter(m => m.kind === 'startSwarm')")
    assert len(sent) == 1, sent
    assert sent[0]['count'] == 6 and sent[0]['pool'] == {'concurrency': 50} and 'isolation' not in sent[0], sent[0]
    expect(page.locator('section.cx-w', has_text='Agenten-Schwarm startet')).to_contain_text('6 Einheiten im Hintergrund · 6 zugleich')
    assert errors == [], errors

print('Agenten-Schwarm: Anzahl, vier Qualitätsstufen, Grenze 20, Auswahl mit Nachziehen der Anzahl, '
      'Start nur mit Auftrag, Laufansicht und Stopp, Pool mit Bereichen, Worktrees, Zusammenführung und Selbststart bestanden.')
