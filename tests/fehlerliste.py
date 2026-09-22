"""Erzeugt docs/tests/FEHLERLISTE.md: nur ❌ Fehler, ⚠️ auffällig und 🔒 blockiert durch die Umgebung."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
T = ROOT / 'tests'
load = lambda p: json.loads(p.read_text()) if p.exists() else {}
inv, res, cyc = load(T / 'plugins/inventory.json'), load(T / 'plugins/results.json'), load(T / 'plugins/cycle-results.json')
live, review = load(T / 'widgets-live/results.json'), load(T / 'widgets-live/review.json')
BLOCKED = {
    'firebase': 'nicht bei Firebase angemeldet, kein aktives Projekt, kein Quota-Projekt',
}
# Einzelne Funktionen, die an Xcode oder am Plugin selbst scheitern, nicht an Cortex
OUTSIDE = {
    ('xcode', 'XcodeRefreshCodeIssuesInFile'): ('Xcode liefert Diagnosen nur für Dateien in einem offenen Editorfenster; im Headless-Betrieb Fehler 5', 'X1'),
    ('kubernetes', 'ping'): ('Antwort ohne Inhalt — liegt im Plugin selbst (`mcp-server-kubernetes` 4.1.6)', 'P7'),
    ('kubernetes', 'node_management'): ('`drain` mit `deleteLocalData` nutzt das entfernte kubectl-Flag `--delete-local-data`; ohne scheitert es an Pods mit lokalem Speicher — liegt im Plugin', 'P9'),
}
ISSUE = {'ticker': 'W1', 'server': 'W2 · W4', 'weather': 'W3', 'timeline': 'W5', 'game-theory': 'W6 · W7'}
clean = lambda s: ' '.join(str(s).split()).replace('|', '\\|')

err, warn, block = [], [], []

# Widgets live
for t, r in live.items():
    mark = review.get(t, {}).get('mark')
    text = review.get(t, {}).get('text', '')
    row = f"| Widget live | {t} | {clean(text)} | {ISSUE.get(t, '')} |"
    types = {b['type'] for b in r.get('blocks', []) if b.get('ok')}
    if mark == '❌':
        err.append(row)
    elif mark == '⚠️':
        warn.append(row)
    if r['kind'] != 'ehrlich' and types and t not in types and not mark:
        warn.append(f"| Widget live | {t} | Falscher Typ: Claude schickte `{', '.join(types)}` statt `{t}` | {ISSUE.get(t, '')} |")

# Plugin-Server, die nicht starten
for name, e in inv.items():
    if e.get('ok'):
        continue
    msg = clean(e.get('error', ''))[:160]
    if name == 'youtube':
        err.append(f"| Plugin-Start | youtube | {msg} — trotzdem in alle Profile gespiegelt | P1 |")
    elif name == 'figma':
        block.append(f"| Plugin-Start | figma | Anmeldung liegt beim Anbieter-Client; im Claude-Profil als „needs auth“ vermerkt | P3 |")
    elif name == 'jetbrains':
        block.append(f"| Plugin-Start | jetbrains | {msg} — keine JetBrains-IDE geöffnet | P6 |")
    else:
        err.append(f"| Plugin-Start | {name} | {msg} | |")

# Plugin-Funktionen
for name, r in res.items():
    bad = [x for x in r.get('results', []) if x['status'] in ('fehler', 'ausnahme', 'leer')]
    if not bad:
        continue
    if name in BLOCKED:
        tools = ', '.join(f"`{x['tool']}`" for x in bad)
        block.append(f"| Plugin-Funktionen | {name} ({len(bad)}) | {BLOCKED[name]}. Betroffen: {tools} | P6 |")
        continue
    seen = set()
    for x in bad:
        if (name, x['tool']) in OUTSIDE:
            if x['tool'] not in seen:
                reason, issue = OUTSIDE[name, x['tool']]
                block.append(f"| Plugin-Funktion | {name} · `{x['tool']}` | {reason} | {issue} |")
            seen.add(x['tool'])
            continue
        row = f"| Plugin-Funktion | {name} · `{x['tool']}` | {clean(x.get('answer', ''))[:160]} | |"
        (warn if x['status'] == 'leer' else err).append(row)

# Verbinden/Entbinden
for name, rounds in cyc.items():
    if not isinstance(rounds, list):
        continue
    for r in rounds:
        if not r['probe'].get('ok'):
            block.append(f"| Verbinden | {name}, Runde {r['round']} | Probe: {clean(r['probe'].get('message', ''))} — keine IDE | P6 |")
        if not all(r['connected']) or not all(r['gone']) or not all(r['restored']):
            err.append(f"| Verbinden | {name}, Runde {r['round']} | Eintragen {r['connected']}, Entfernen {r['gone']}, wiederhergestellt {r['restored']} | |")
        elif r.get('byteEqual') and not all(r['byteEqual']):
            warn.append(f"| Verbinden | {name}, Runde {r['round']} | Profile inhaltlich gleich, aber andere Reihenfolge nach Wiederverbinden | P8 |")
if cyc and not cyc.get('mcpJsonByteGleich', True):
    warn.append("| Verbinden | mcp.json | Nach allen Runden inhaltlich gleich, Reihenfolge verschoben | P8 |")

# Weitere Befunde ohne eigenen Testlauf-Eintrag — Stand nach der Behebung (13.09.2026)
FIXED = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'P1', 'P2', 'P4', 'P5', 'P6', 'P8', 'K1', 'K2', 'T1', 'T2']
fixed_rows = [r for r in err + warn if any(i in r.rsplit('|', 2)[-2] for i in FIXED)]
err = [r for r in err if r not in fixed_rows]
warn = [r for r in warn if r not in fixed_rows]
block.append("| Plugin-Funktion | kubernetes · `port_forward` | Weiterleitungen laufen nach dem Beenden des Servers weiter (kubectl-Prozess blieb auf Port 18080 hängen) — liegt im Plugin | P10 |")

out = ['# Fehlerliste', '', 'Was nach der Behebung am 13.09.2026 noch offen ist. Was behoben wurde und womit, steht oben in [ISSUES.md](ISSUES.md); die vollständige Liste in [TESTLISTE.md](TESTLISTE.md).', '',
       f'Übersicht: ❌ {len(err)} Fehler · ⚠️ {len(warn)} auffällig · 🔒 {len(block)} blockiert durch die Umgebung', '']
for title, rows in [('❌ Fehler', err), ('⚠️ Auffällig', warn), ('🔒 Blockiert durch die Umgebung', block)]:
    if not rows:
        out += [f'## {title}', '', 'Keine.', '']
        continue
    out += [f'## {title}', '', '| Bereich | Was | Befund | Issue |', '|---|---|---|---|', *rows, '']
(ROOT / 'docs/tests/FEHLERLISTE.md').write_text('\n'.join(out))
print(len(err), len(warn), len(block))
