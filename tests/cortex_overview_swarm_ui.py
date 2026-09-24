"""Übersicht mit Agenten-Schwarm: echte Oberfläche, gefälschter Host.

Seit 24.09.2026:
1. Die geschlossene Übersicht kommt über das Drei-Punkte-Menü zurück
   (Befehl cortex.showOverview → Nachricht `toolbar` / `overview`).
2. Ein laufender Schwarm des Chats steht unter „Hintergrundprozesse“ — mit
   Symbol, Zahl der laufenden Rollen und jeder Rolle darunter.
3. Ein Klick auf eine Rolle öffnet ihren eigenen Chat.
"""
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

ROOT = Path(__file__).resolve().parent.parent
BASE = 'http://127.0.0.1:4173/dev/preview.html?mode=agent&scenario=conversation'
SHOTS = ROOT / 'docs/screenshots'

RUN = {'id': 'run-1', 'teamId': 'swarm-site-karte', 'teamName': 'Schwarm · Politik L3', 'task': 'Politik L3', 'status': 'running', 'startedAt': 0, 'jobs': [
    {'agentId': 'swarm-agent-1', 'agentName': 'Dänemark', 'status': 'running', 'conversationId': 'rolle-dk', 'activity': 'liest folketinget.dk'},
    {'agentId': 'swarm-agent-2', 'agentName': 'Finnland', 'status': 'running', 'conversationId': 'rolle-fi'},
    {'agentId': 'swarm-agent-3', 'agentName': 'Tschechien', 'status': 'completed', 'conversationId': 'rolle-cz'},
    {'agentId': 'swarm-agent-4', 'agentName': 'Portugal', 'status': 'waiting'},
]}
OTHER = {**RUN, 'id': 'run-2', 'teamId': 'swarm-anderer-chat-karte'}

with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 950})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(el) => el.remove()')
    post = lambda message: page.evaluate('m => window.postMessage(m, "*")', message)

    panel = page.get_by_role('complementary', name='Chat-Control-Panel')
    expect(panel).to_be_visible()
    post({'kind': 'teamsState', 'state': {'teams': [], 'runs': [RUN, OTHER], 'servers': [], 'skills': [], 'revision': 5}})

    # 2. Der Schwarm dieses Chats, nicht der eines anderen.
    expect(panel).to_contain_text('Schwarm · 2 von 4 arbeiten')
    assert panel.get_by_text('Schwarm ·').count() == 1
    expect(panel.locator('.cx-control-count')).to_have_text('2')
    for name in ['Dänemark', 'Finnland', 'Tschechien', 'Portugal']:
        expect(panel.get_by_role('button', name=name)).to_be_visible()
    expect(panel.get_by_role('button', name='Portugal')).to_be_disabled()
    expect(panel).not_to_contain_text('Keine gemeldeten Hintergrundprozesse')
    panel.screenshot(path=str(SHOTS / 'uebersicht-schwarm.png'))

    # 1. Schließen, dann über das Menü zurückholen.
    panel.get_by_role('button', name='Control Panel schließen').click()
    expect(panel).to_have_count(0)
    post({'kind': 'toolbar', 'action': 'overview'})
    expect(panel).to_be_visible()
    # Neu eingeblendet fragt die Karte den Stand selbst an; der Host antwortet mit dem laufenden Schwarm.
    page.wait_for_function("(window.__hostMessages || []).filter(m => m.kind === 'getTeams').length >= 2")
    post({'kind': 'teamsState', 'state': {'teams': [], 'runs': [RUN, OTHER], 'servers': [], 'skills': [], 'revision': 6}})
    expect(panel).to_contain_text('Schwarm · 2 von 4 arbeiten')

    # 4. „Starte einen Agent Swarm“: die Karte mit start: true startet selbst — genau einmal.
    block = '```cortex-widget\n{"type":"agent-swarm","start":true,"task":"Politik L3 für vier Länder","count":2,"agents":[{"name":"Dänemark","instructions":"Nur DK"},{"name":"Finnland","instructions":"Nur FI"}]}\n```'
    post({'kind': 'userEcho', 'text': 'Starte einen Agent Swarm für die nächsten Länder'})
    post({'kind': 'delta', 'messageId': 'swarm-msg', 'text': 'Der Schwarm startet im Hintergrund.\n\n' + block})
    post({'kind': 'done', 'messageId': 'swarm-msg'})
    page.wait_for_function("(window.__hostMessages || []).some(m => m.kind === 'startSwarm')", timeout=10000)
    page.wait_for_timeout(800)
    sent = page.evaluate("(window.__hostMessages || []).filter(m => m.kind === 'startSwarm')")
    assert len(sent) == 1, sent
    assert sent[0]['task'] == 'Politik L3 für vier Länder' and sent[0]['count'] == 2, sent[0]
    assert [role['name'] for role in sent[0]['proposed']] == ['Dänemark', 'Finnland'], sent[0]
    card = page.get_by_role('region', name='Agenten-Schwarm')
    expect(card).to_contain_text('Agenten-Schwarm startet')
    post({'kind': 'teamsState', 'state': {'teams': [], 'runs': [RUN, {**RUN, 'id': 'run-3', 'teamId': sent[0]['swarmId'], 'jobs': RUN['jobs'][:2]}], 'servers': [], 'skills': [], 'revision': 7}})
    expect(card).to_contain_text('Agenten-Schwarm läuft · 2 von 2 arbeiten')
    expect(card.get_by_role('button', name='Starten')).to_have_count(0)

    # 3. Die Rolle öffnet ihren eigenen Chat.
    panel.get_by_role('button', name='Dänemark').first.click()
    assert page.evaluate("(window.__hostMessages || []).some(m => m.kind === 'openConversation' && m.id === 'rolle-dk')"), 'Rollen-Chat nicht geöffnet'

    assert errors == [], errors

print('Übersicht: über das Menü zurückholbar, Karte mit start: true startet einmal selbst, Schwarm mit Anzahl und Rollen unter Hintergrundprozesse, Rolle öffnet ihren Chat.')
