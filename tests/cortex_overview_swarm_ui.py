"""Übersicht mit Agenten-Schwarm: echte Oberfläche, gefälschter Host.

Seit 24.09.2026:
1. Die geschlossene Übersicht kommt über das Drei-Punkte-Menü zurück
   (Befehl cortex.showOverview → Nachricht `toolbar` / `overview`).
2. Ein laufender Schwarm des Chats steht unter „Hintergrundprozesse“ — mit
   Symbol, Zahl der laufenden Rollen und jeder Rolle darunter.
3. Ein Klick auf eine Rolle öffnet ihren eigenen Chat.
4. Ein Pool (mehr als 20 Einheiten) listet nur, was arbeitet oder
   Aufmerksamkeit braucht, und fasst den Rest in einer Zeile zusammen.
5. Merge-Warteschlange: Zusammenfassung, Stand je Einheit, Starten,
   Anhalten, Übernehmen (auch gescheitert und geschafft); ein beendeter Lauf
   bleibt stehen, solange die Zusammenführung aussteht.
"""
import re
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


def unit(n, status, **extra):
    return {'agentId': f'einheit-{n}', 'agentName': f'Einheit {n}', 'status': status, 'conversationId': f'rolle-{n}', **extra}


# 7 arbeiten, 2 gescheitert, 30 fertig (einer davon mit Verstoß), 146 offen.
POOL = {**RUN, 'id': 'run-pool', 'teamId': 'swarm-site-pool', 'jobs': [
    unit(1, 'running', account='Business', branch='schwarm/run-pool/einheit-1', outside=['gemeinsam/schema.json', 'tools/fortschritt.py']),
    *[unit(n, 'running', account='Privat') for n in range(2, 8)],
    unit(8, 'failed', error='Kontolimit', attempts=2),
    unit(9, 'blocked'),
    unit(10, 'completed', outside=['README.md']),
    *[unit(n, 'completed') for n in range(11, 40)],
    *[unit(n, 'waiting') for n in range(40, 186)],
]}
assert len(POOL['jobs']) == 185

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

    # 5. Rollen-Chats stehen nur in der Übersicht, nie in der Seitenleiste.
    post({'kind': 'conversations', 'activeId': 'site', 'list': [
        {'id': 'site', 'title': 'Neue Startseite entwickeln', 'updatedAt': 2, 'projectPath': '/demo/site'},
        {'id': 'rolle-dk', 'title': 'Dänemark · Schwarm', 'updatedAt': 3, 'projectPath': '/demo/site', 'running': True, 'background': True, 'parentId': 'site'},
        {'id': 'rolle-loose', 'title': 'Finnland · Schwarm', 'updatedAt': 3, 'running': True, 'background': True, 'parentId': 'site'},
        {'id': 'rolle-pin', 'title': 'Tschechien · Schwarm', 'updatedAt': 3, 'pinned': True, 'background': True, 'parentId': 'site'},
    ]})
    page.wait_for_timeout(300)
    for title in ['Dänemark · Schwarm', 'Finnland · Schwarm', 'Tschechien · Schwarm']:
        assert page.locator('.cx-tree-task', has_text=title).count() == 0, f'{title} steht in der Seitenleiste'

    # 6. Ein Pool mit 185 Einheiten: Kopfzeile, nur die laufenden (und
    #    gescheiterten oder übergriffigen) Einheiten, der Rest als eine Zeile.
    post({'kind': 'teamsState', 'state': {'teams': [], 'runs': [POOL], 'servers': [], 'skills': [], 'revision': 8}})
    expect(panel).to_contain_text('Schwarm · 7 von 185 arbeiten')
    expect(panel.locator('.cx-control-count')).to_have_text('7')
    group = panel.locator('.cx-control-group')
    expect(group.locator('button.cx-control-sub')).to_have_count(10)
    expect(group.locator('.cx-control-rest')).to_have_text('146 offen · 30 fertig')
    expect(panel.get_by_role('button', name='Einheit 150')).to_have_count(0)
    expect(panel.get_by_role('button', name='Einheit 9 ')).to_have_count(1)
    # Wer außerhalb seines Bereichs geändert hat, trägt die Warnung und nennt die Dateien.
    outside = panel.locator('.cx-control-sub.is-outside')
    expect(outside).to_have_count(2)
    expect(outside.first).to_have_attribute('title', re.compile('Außerhalb seines Bereichs geändert: gemeinsam/schema.json, tools/fortschritt.py'))
    expect(outside.first).to_have_attribute('title', re.compile('Branch schwarm/run-pool/einheit-1'))
    expect(group.locator('.cx-control-account').first).to_have_text('Business · ')
    panel.screenshot(path=str(SHOTS / 'uebersicht-schwarm-pool.png'))
    post({'kind': 'teamsState', 'state': {'teams': [], 'runs': [RUN], 'servers': [], 'skills': [], 'revision': 9}})
    expect(panel).to_contain_text('Schwarm · 2 von 4 arbeiten')

    # 7. Merge-Warteschlange. Worktree-Einheiten tragen ihren Branch.
    def teams(runs, revision):
        post({'kind': 'teamsState', 'state': {'teams': [], 'runs': runs, 'servers': [], 'skills': [], 'revision': revision}})

    def sent(action):
        return page.evaluate("(action) => (window.__hostMessages || []).filter(m => m.kind === 'swarmMerge' && m.action === action)", action)

    def wt(n, status, merge=None, detail=None):
        job = unit(n, status, branch=f'schwarm/run-merge/einheit-{n}')
        if merge:
            job['merge'] = {'state': merge, **({'detail': detail} if detail else {})}
        return job

    group = panel.locator('.cx-control-group')
    summary = panel.locator('.cx-control-merge-sum')
    adopt_any = panel.get_by_role('button', name=re.compile('übernehmen'))

    # a) Einheiten fertig, Warteschlange noch nicht gestartet: nur der Start-Knopf, keine Zusammenfassung.
    WT = {**RUN, 'id': 'run-merge', 'jobs': [wt(1, 'running'), wt(2, 'completed'), wt(3, 'completed')]}
    teams([WT], 10)
    expect(panel).to_contain_text('Schwarm · 1 von 3 arbeiten')
    expect(summary).to_have_count(0)
    expect(panel.locator('.cx-control-merge')).to_have_count(0)
    expect(group.locator('button.cx-control-sub').nth(1)).to_contain_text('fertig')
    panel.get_by_role('button', name='Zusammenführen starten').click()
    assert sent('start') == [{'kind': 'swarmMerge', 'action': 'start', 'runId': 'run-merge'}], sent('start')
    expect(adopt_any).to_have_count(0)

    # b) Läuft: Zusammenfassung mit allen Ständen, Marken je Einheit, Anhalten — Übernehmen noch nicht.
    merge = {'enabled': True, 'checks': ['npm test'], 'targetBranch': 'main', 'integrationBranch': 'schwarm/run-merge/zusammen'}
    LIVE = {**WT, 'merge': merge, 'jobs': [
        *[wt(n, 'completed', 'merged') for n in range(1, 13)],
        wt(13, 'completed', 'waiting'), wt(14, 'completed', 'waiting'),
        wt(15, 'completed', 'conflict', 'Konflikt in src/app.ts, src/nav.ts'),
        wt(16, 'completed', 'checks-failed', 'npm test: 3 Tests rot'),
        wt(17, 'completed', 'merging'),
        wt(18, 'running'),
    ]}
    teams([LIVE], 11)
    expect(summary).to_have_text('Zusammenführung: 12 übernommen · 2 warten · 1 Konflikt · 1 Prüfung gescheitert · führt Einheit 17 zusammen')
    expect(summary).to_have_attribute('title', 'Zusammenführungs-Branch schwarm/run-merge/zusammen · Ziel main · Prüfungen: npm test')
    expect(panel.locator('.cx-control-merge.is-merged')).to_have_count(12)
    expect(panel.locator('.cx-control-merge.is-merged').first).to_have_text('übernommen')
    conflict = panel.locator('.cx-control-merge.is-conflict')
    expect(conflict).to_have_text('Konflikt')
    expect(conflict).to_have_attribute('title', 'Konflikt in src/app.ts, src/nav.ts')
    expect(panel.locator('.cx-control-merge.is-checks-failed')).to_have_attribute('title', 'npm test: 3 Tests rot')
    expect(panel.locator('.cx-control-merge.is-waiting')).to_have_count(2)
    expect(panel.locator('.cx-control-merge.is-merging')).to_have_text('führt zusammen')
    expect(panel.get_by_role('button', name='Einheit 15')).to_have_attribute('title', re.compile('Zusammenführung: Konflikt — Konflikt in src/app.ts'))
    # Ohne Merge-Stand bleibt die Einheit, wie sie war.
    expect(panel.get_by_role('button', name='Einheit 18')).to_contain_text('arbeitet')
    expect(panel.get_by_role('button', name='Zusammenführen starten')).to_have_count(0)
    expect(adopt_any).to_have_count(0)
    panel.screenshot(path=str(SHOTS / 'uebersicht-schwarm-merge.png'))
    panel.get_by_role('button', name='Anhalten').click()
    assert sent('stop') == [{'kind': 'swarmMerge', 'action': 'stop', 'runId': 'run-merge'}], sent('stop')

    # c) Einheiten fertig, Warteschlange noch dabei: der beendete Lauf bleibt stehen.
    DONE_JOBS = [*[wt(n, 'completed', 'merged') for n in range(1, 13)], wt(13, 'completed', 'conflict', 'src/app.ts'), wt(14, 'completed', 'waiting')]
    teams([{**LIVE, 'status': 'completed', 'jobs': DONE_JOBS}], 12)
    expect(panel).to_contain_text('Schwarm · 14 von 14 fertig')
    expect(panel.locator('.cx-control-count')).to_have_count(0)
    expect(summary).to_have_text('Zusammenführung: 12 übernommen · 1 wartet · 1 Konflikt')
    expect(panel.get_by_role('button', name='Anhalten')).to_be_visible()
    expect(adopt_any).to_have_count(0)

    # d) Alles durch: In main übernehmen.
    FINISHED = {**LIVE, 'status': 'completed', 'jobs': DONE_JOBS[:13]}
    teams([FINISHED], 13)
    expect(summary).to_have_text('Zusammenführung: 12 übernommen · 1 Konflikt')
    expect(panel.get_by_role('button', name='Anhalten')).to_have_count(0)
    adopt = panel.get_by_role('button', name='In main übernehmen')
    expect(adopt).to_be_visible()
    adopt.click()
    assert sent('adopt') == [{'kind': 'swarmMerge', 'action': 'adopt', 'runId': 'run-merge'}], sent('adopt')

    # e) Übernehmen gescheitert: der Grund darunter, der Knopf bleibt.
    teams([{**FINISHED, 'merge': {**merge, 'adopted': 'failed', 'adoptDetail': 'main hat ungesicherte Änderungen'}}], 14)
    expect(panel.locator('.cx-control-merge-warn')).to_have_text('main hat ungesicherte Änderungen')
    expect(adopt).to_be_visible()
    group.screenshot(path=str(SHOTS / 'uebersicht-schwarm-merge-uebernehmen.png'))

    # f) Übernommen: die Bestätigung steht, kein Knopf mehr.
    teams([{**FINISHED, 'merge': {**merge, 'adopted': 'ok'}}], 15)
    expect(panel.locator('.cx-control-merge-done')).to_have_text('In main übernommen')
    expect(adopt_any).to_have_count(0)
    expect(panel.locator('.cx-control-merge-warn')).to_have_count(0)
    panel.screenshot(path=str(SHOTS / 'uebersicht-schwarm-merge-fertig.png'))

    # g) Ohne Ziel-Branch: „deinen Branch“.
    teams([{**FINISHED, 'id': 'run-merge-2', 'merge': {'enabled': True, 'checks': []}}], 16)
    expect(panel.get_by_role('button', name='In deinen Branch übernehmen')).to_be_visible()

    # h) Beendete Läufe ohne Zusammenführung bleiben wie bisher ausgeblendet —
    #    ebenso ein schon übernommener, den das Panel nie gezeigt hat.
    teams([{**RUN, 'id': 'run-alt', 'status': 'completed', 'jobs': [unit(1, 'completed')]},
           {**FINISHED, 'id': 'run-alt-2', 'merge': {**merge, 'adopted': 'ok'}}], 17)
    expect(panel).to_contain_text('Keine gemeldeten Hintergrundprozesse')
    expect(group).to_have_count(0)

    # 3. Die Rolle öffnet ihren eigenen Chat (zuletzt: danach ist ein anderer Chat offen).
    teams([RUN], 18)
    panel.get_by_role('button', name='Dänemark').first.click()
    assert page.evaluate("(window.__hostMessages || []).some(m => m.kind === 'openConversation' && m.id === 'rolle-dk')"), 'Rollen-Chat nicht geöffnet'

    assert errors == [], errors

print('Übersicht: über das Menü zurückholbar, Rollen-Chats nicht in der Seitenleiste, Karte mit start: true startet einmal selbst, Schwarm mit Anzahl und Rollen unter Hintergrundprozesse, Rolle öffnet ihren Chat, Pool mit 185 Einheiten zusammengefasst samt Bereichsverstoß, Merge-Warteschlange mit Zusammenfassung, Marken, Starten, Anhalten und Übernehmen.')
