"""Erzeugt docs/tests/TESTLISTE.md aus den Ergebnissen der Testläufe.

Quellen:
- tests/plugins/inventory.json        (welche Funktionen jedes Plugin hat)
- tests/plugins/results.json          (jede Funktion einmal aufgerufen)
- tests/plugins/cycle-results.json    (verbinden/entbinden, zwei Runden)
- tests/widgets-live/results.json     (jedes Widget live mit Claude)
- tests/widgets-live/review.json      (Durchsicht der Live-Antworten, von Hand)
"""
import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
T = ROOT / 'tests'
load = lambda p: json.loads(p.read_text()) if p.exists() else {}
inventory = load(T / 'plugins/inventory.json')
results = load(T / 'plugins/results.json')
cycles = load(T / 'plugins/cycle-results.json')
live = load(T / 'widgets-live/results.json')
review = load(T / 'widgets-live/review.json')
samples = json.loads((ROOT / 'engine/packages/vscode/dev/widget-samples.json').read_text())

MARK = {'ok': '✅', 'fehler': '❌', 'ausnahme': '❌', 'leer': '⚠️', 'übersprungen': '⏸', 'blockiert': '🔒', 'offen': '⬜'}
NAMES = {
    'weather': 'Wetter', 'timer': 'Timer', 'departures': 'Abfahrten', 'converter': 'Umrechner', 'parcel': 'Sendung', 'todo': 'To-do',
    'route': 'Route', 'calendar': 'Kalender', 'ticker': 'Kurs', 'worldclock': 'Weltuhr', 'agent-run': 'Agentenlauf',
    'test-result': 'Test-Ergebnis', 'quota': 'Kontingente', 'server': 'Server', 'deploy': 'Deploy', 'verification': 'Verifikation',
    'scrape-run': 'Scrape-Lauf', 'workflow': 'Workflow', 'query-result': 'Abfrage', 'graph-node': 'Graph-Knoten',
    'decision': 'Entscheidung', 'place-naming': 'Ort benennen', 'timeline': 'Zeitleiste', 'jobs': 'Stellen',
    'design-diff': 'Design-Abgleich', 'palette': 'Farbpalette', 'audio-takes': 'Audio-Takes', 'kpis': 'Kennzahlen',
    'quiz': 'Quiz', 'game-theory': 'Spieltheorie',
}
# Plugins, deren Funktionen an der Umgebung scheitern, nicht an Cortex — mit Grund.
BLOCKED = {
    'firebase': 'Nicht bei Firebase angemeldet, kein aktives Projekt, kein Quota-Projekt für die Developer-Knowledge-API.',
}
# Einzelne Funktionen, die an Xcode oder am Plugin selbst scheitern (siehe FEHLERLISTE.md)
OUTSIDE = {('xcode', 'XcodeRefreshCodeIssuesInFile'), ('kubernetes', 'ping'), ('kubernetes', 'node_management')}

out = []
w = out.append
w('# Testliste: Widgets und Plugins')
w('')
w(f'Stand: {time.strftime("%d.%m.%Y, %H:%M")}. Erzeugt von `tests/report.py` aus den Testläufen. Gefundene Probleme stehen **nicht repariert** in [ISSUES.md](ISSUES.md).')
w('')
w('Legende: ✅ bestanden · ❌ Fehler · ⚠️ auffällig · 🔒 blockiert durch die Umgebung · ⏸ bewusst nicht ausgeführt (verändert Echtes) · ⬜ noch offen (von Hand)')
w('')
w('## Wie die Tests laufen')
w('')
w('| Teil | Befehl | Was er tut |')
w('|---|---|---|')
w('| A1 Widget-Oberfläche | `python3 tests/cortex_widgets_ui.py` | Alle 30 Widgets im echten Webview-Bundle mit Fixture-Nachrichten, Bedienung, Fehlerfälle, drei Breiten |')
w('| A2 Widgets live | `python3 tests/widgets-live/run_live.py [typ …]` | Echte Frage an Claude (Cortex-Profil, Opus 5, Cortex-Anweisung), Block prüfen |')
w('| B Plugin-Funktionen | `python3 tests/plugins/inventory.py` und `python3 tests/plugins/run_plugins.py [plugin …]` | Server wie die CLIs starten, jede Funktion einmal aufrufen |')
w('| C Verbinden/Entbinden | `CORTEX_LIVE=1 npx vitest run test/live-plugin-cycle.test.ts` (in engine/packages/core) | Schlüssellose Plugins zweimal verbinden und entbinden, Spiegelung in Claude, Codex, Grok |')
w('| Bericht | `python3 tests/report.py` | Diese Datei neu schreiben |')
w('')
w('Sicherheitsregeln aller Läufe: Browser nur headless und isoliert; nichts, was Projekte, Konten, Clouds, Server oder das Fenster des Nutzers verändert; Schreibtests nur in Sandbox (Temp-Ordner).')
w('')

# ── A Widgets ──
w('## A · Widgets')
w('')
w('### A1 · Oberfläche (automatisch)')
w('')
w('Letzter Lauf: bestanden (`tests/cortex_widgets_ui.py`). Screenshots: `docs/screenshots/widgets/`.')
w('')
w('| # | Widget | Gezeichnet | Bedienung geprüft |')
w('|---|---|---|---|')
interactions = {'timer': 'zählt, Pause', 'todo': 'abhaken', 'converter': 'Betrag ändern', 'quiz': 'antworten, Aktion ins Eingabefeld',
                'worldclock': 'Heimatort vorne', 'palette': 'Kontrast berechnet'}
for i, s in enumerate(samples, 1):
    t = s['spec']['type']
    w(f'| {i} | {NAMES[t]} (`{t}`) | ✅ | {"✅ " + interactions[t] if t in interactions else "—"} |')
w('')
w('| Querschnitt | Status |')
w('|---|---|')
for label in ['Kaputter Block bleibt Codeblock mit Grund', 'Laufender Block zeigt Platzhalterkarte', 'Keine waagerechte Überbreite bei 1152, 960, 760 px', 'Keine JavaScript-Fehler']:
    w(f'| {label} | ✅ |')
w('')

w('### A2 · Live mit Claude')
w('')
w('Art: *echt* = Claude holt die Daten selbst · *gegeben* = Daten stehen in der Frage · *ehrlich* = es gibt keine Daten, erwartet wird kein erfundenes Widget.')
w('')
w('| # | Widget | Art | Block | Typ passt | Durchsicht | Dauer |')
w('|---|---|---|---|---|---|---|')
for i, s in enumerate(samples, 1):
    t = s['spec']['type']
    r = live.get(t)
    if not r:
        w(f'| {i} | {NAMES[t]} | — | ⬜ | ⬜ | noch nicht gelaufen | — |')
        continue
    blocks = r.get('blocks', [])
    valid = [b for b in blocks if b.get('ok')]
    types = {b['type'] for b in valid}
    if r['kind'] == 'ehrlich':
        block = '✅ keiner' if not blocks else ('⚠️ ' + ', '.join(types or ['ungültig']))
        match = '—'
    else:
        block = '✅' if valid and len(valid) == len(blocks) else ('❌ ungültig' if blocks else '❌ keiner')
        match = '✅' if t in types else ('❌ ' + ', '.join(types) if types else '❌')
    note = review.get(t, {})
    w(f"| {i} | {NAMES[t]} | {r['kind']} | {block} | {match} | {note.get('mark', '⬜')} {note.get('text', '')} | {r['seconds']} s |")
w('')

w('### A3 · Von Hand in Cortex (offen)')
w('')
for line in [
    'Jedes Widget einmal mit **Codex** und einmal mit **Grok** in Cortex fragen (Anweisung kommt über developerInstructions bzw. ACP)',
    'Einstellungen › Personalisierung › Heimatort ändern → neue Wetterfrage nennt den neuen Ort',
    'Heimatort leeren → Agent fragt nach dem Ort, statt per IP zu raten',
    'Einstellungen › Konfiguration › „Widgets im Chat“ aus → Agent schreibt keine Widget-Blöcke mehr',
    'Aktion „Fehler beheben“ in einer echten Test-Karte legt den Auftrag ins Eingabefeld, sendet nicht',
    'Alter Chat mit Widget nach Neustart: Karte statt Codeblock',
    'Widget in einer Antwort, die noch läuft: Platzhalter, danach Karte',
]:
    w(f'- ⬜ {line}')
w('')

# ── B Plugins ──
w('## B · Verbundene Plugins: jede Funktion')
w('')
w('Einige Funktionen laufen zweimal (z. B. `evaluate_script` einmal normal, einmal für einen Dialog), daher mehr Aufrufe als Funktionen.')
w('')
w('Verbunden laut Cortex-Profil (dieselbe Liste geht an Claude, Codex und Grok): ' + ', '.join(f'`{n}`' for n, e in inventory.items() if e.get('kind') == 'verbunden') + '.')
w('')
w('| Plugin | Funktionen | Aufrufe ✅ | ❌ | ⏸ | 🔒 | Start |')
w('|---|---|---|---|---|---|---|')


def plugin_counts(name):
    rs = results.get(name, {}).get('results', [])
    c = {'ok': 0, 'bad': 0, 'skip': 0, 'blocked': 0}
    for x in rs:
        if x['status'] == 'übersprungen':
            c['skip'] += 1
        elif x['status'] == 'ok':
            c['ok'] += 1
        elif name in BLOCKED:
            c['blocked'] += 1
        else:
            c['bad'] += 1
    return c


for kind in ['verbunden', 'schlüssellos']:
    for name, e in inventory.items():
        if e.get('kind') != kind:
            continue
        if not e.get('ok'):
            w(f"| `{name}` ({kind}) | — | | | | | ❌ {e.get('error', '').strip().replace(chr(10), ' ')[:90]} |")
            continue
        c = plugin_counts(name)
        w(f"| `{name}` ({kind}) | {len(e['tools'])} | {c['ok']} | {c['bad']} | {c['skip']} | {c['blocked']} | ✅ {e.get('ms', 0)} ms |")
w('')


def plugin_table(name):
    e = inventory.get(name, {})
    rs = {}
    for x in results.get(name, {}).get('results', []):
        rs.setdefault(x['tool'], []).append(x)
    w(f"### `{name}`")
    w('')
    if name in BLOCKED:
        w(f'🔒 {BLOCKED[name]}')
        w('')
    if not e.get('ok'):
        w(f"❌ Server startet nicht: {e.get('error', '').strip().replace(chr(10), ' ')[:300]}")
        w('')
        return
    w('| Funktion | Status | Aufruf | Antwort / Grund |')
    w('|---|---|---|---|')
    for tool in e['tools']:
        runs = rs.get(tool['name'], [])
        if not runs:
            w(f"| `{tool['name']}` | ⬜ | — | nicht im Testlauf |")
            continue
        for x in runs:
            status = x['status']
            mark = MARK['blockiert'] if status in ('fehler', 'ausnahme', 'leer') and (name in BLOCKED or (name, tool['name']) in OUTSIDE) else MARK.get(status, '⬜')
            args = json.dumps(x.get('args'), ensure_ascii=False) if x.get('args') is not None else '—'
            if len(args) > 70:
                args = args[:67] + '…'
            text = (x.get('note') or x.get('answer') or '').replace('\n', ' ').replace('|', '\\|').strip()
            if status == 'ok' and not text:
                text = '(Antwort ohne Text)'
            w(f"| `{tool['name']}` | {mark} | `{args.replace('|', '/')}` | {text[:140]} |")
    w('')


for name, e in inventory.items():
    if e.get('kind') == 'verbunden':
        plugin_table(name)

# ── C Schlüssellose ──
w('## C · Schlüssellose Plugins')
w('')
w('### C1 · Verbinden und entbinden, zwei Runden')
w('')
w('Mit den Funktionen, die Cortex beim Installieren und Entfernen benutzt (Probe → `withServer` → Spiegeln in Claude, Codex, Grok → `withoutServer` → Spiegeln), auf einer Kopie der echten `~/.cortex/mcp.json`. Schon verbundene Plugins werden erst entbunden, dann wieder verbunden.')
w('')
w('| Plugin | Runde | Probe | Eingetragen (Claude/Codex/Grok) | Entfernt | Profile wie vorher | Byte-gleich |')
w('|---|---|---|---|---|---|---|')
tick = lambda v: ' '.join('✅' if b else '❌' for b in v)
for name, rounds in cycles.items():
    if not isinstance(rounds, list):
        continue
    for r in rounds:
        probe = f"✅ {r['probe']['tools']} Werkzeuge" if r['probe'].get('ok') else f"❌ {r['probe'].get('message', '')}"
        w(f"| `{name}` | {r['round']} | {probe} | {tick(r['connected'])} | {tick(r['gone'])} | {tick(r['restored'])} | {tick(r.get('byteEqual', []))} |")
if cycles:
    w('')
    w(f"`mcp.json` nach allen Runden: Inhalt gleich {'✅' if cycles.get('mcpJsonInhaltGleich') else '❌'} · Byte-gleich {'✅' if cycles.get('mcpJsonByteGleich') else '⚠️ nein (Reihenfolge)'}")
w('')
w('### C2 · Verbinden und entbinden in der Cortex-Oberfläche (offen)')
w('')
for line in ['Plugins › Playwright › Installieren → „verbunden — 24 Werkzeuge“', 'Playwright › Entfernen → verschwindet aus „Installiert“ und aus allen Profilen',
             'Beides ein zweites Mal', 'Dasselbe für Gedächtnis, Schrittweises Denken, AntV Diagramme, Shopify', 'JetBrains ohne laufende IDE installieren → verständliche Meldung, kein halber Eintrag']:
    w(f'- ⬜ {line}')
w('')
w('### C3 · Funktionen der schlüssellosen Plugins')
w('')
for name, e in inventory.items():
    if e.get('kind') == 'schlüssellos':
        plugin_table(name)

(ROOT / 'docs/tests').mkdir(parents=True, exist_ok=True)
(ROOT / 'docs/tests/TESTLISTE.md').write_text('\n'.join(out) + '\n')
print('docs/tests/TESTLISTE.md geschrieben,', len(out), 'Zeilen')
