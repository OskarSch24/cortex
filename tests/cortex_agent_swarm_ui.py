"""Die Schwarm-Karte im echten Webview-Bundle — Anzahl, Qualitätsanzeige, Auswahl, Start.

Kein Anbieter, kein Netz: der Vorschau-Server auf 4173 startet von selbst
(headless_browser.preview_server). Was die Karte an den Host schickt, landet in
`window.__hostMessages` und wird hier geprüft, statt einen Lauf zu starten.
"""
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
    expect(card).to_contain_text('getrennte Teile')
    expect(less).to_be_disabled()

    count.fill('7')
    expect(card).to_contain_text('Qualitätsverlust: spürbar')
    expect(card).to_contain_text('Überschneidung')

    # Ab mehr Rollen, als gleichzeitig laufen, wird gewartet — das sagt die Karte.
    count.fill('13')
    expect(card).to_contain_text('Qualitätsverlust: hoch')
    expect(card).to_contain_text('12 gleichzeitig, 3 je Konto')

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

print('Agenten-Schwarm: Anzahl, vier Qualitätsstufen, Grenze 20, Auswahl mit Nachziehen der Anzahl, '
      'Start nur mit Auftrag, Laufansicht und Stopp bestanden.')
