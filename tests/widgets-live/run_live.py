"""Jedes Widget einmal live: echte Frage an Claude mit der Anweisung, die Cortex mitgibt.

Wie in Cortex: Claude-Profil von Cortex, Opus 5, Anweisung per --append-system-prompt.
Anders als in Cortex, aus Sicherheitsgründen: nur der Exokortex als MCP-Server
(kein Chrome, kein Playwright — keine Desktop-Browser), Arbeitsordner ist ein Temp-Ordner,
jede Frage sagt „nur lesen“. Geprüft wird: kommt ein cortex-widget-Block, ist er
lesbar, hat er den erwarteten Typ, und erfindet das Modell nichts, wo es keine Daten gibt.

Ergebnis: tests/widgets-live/results.json
"""
import json
import os
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).parent
PROFILE = Path.home() / '.cortex/profiles/claude-p7ste5uu-qpokah5q'
KORTEX = HERE.parent.parent
BRIEF = subprocess.run(['node', str(HERE / 'tool.mjs'), 'brief'], capture_output=True, text=True, check=True).stdout
MCP = json.dumps({'mcpServers': {'exokortex': json.loads((PROFILE / '.claude.json').read_text())['mcpServers']['exokortex']}})
SAFE = ' Nur lesen: nichts verändern, nichts starten, nichts veröffentlichen.'

# (Typ, Frage, Art) — Art: echt = Daten selbst holen, gegeben = Daten stehen in der Frage, ehrlich = keine Daten vorhanden
CASES = [
    ('weather', 'Wie wird das Wetter heute?', 'echt'),
    ('timer', 'Stell einen Timer auf 10 Minuten für den Tee.', 'echt'),
    ('departures', 'Wann fahren die nächsten S-Bahnen ab Frankfurt-Bornheim?', 'echt'),
    ('converter', 'Wie viel sind 250 Euro in Dänischen Kronen?', 'echt'),
    ('parcel', 'Wo ist mein DHL-Paket mit der Nummer 00340434318742291050?', 'ehrlich'),
    ('todo', 'Mach mir eine To-do-Liste für heute: Wäsche, HVV-Zugang beantragen, Obsidian-LiveSync einrichten. Die Wäsche ist schon erledigt.', 'gegeben'),
    ('route', 'Wie weit ist es zu Fuß von Frankfurt-Bornheim zur Paulskirche?', 'echt'),
    ('calendar', 'Zeig mir diese Woche als Kalender: Mo 14.9. 8–13 Berufsschule, Di 15.9. 9–17 Betrieb, Mi 16.9. 8–13 Berufsschule und 14–15:30 Prüfung lernen, Do 17.9. 10:30–12 Team PANTA, Fr 18.9. 9–12 Cortex.', 'gegeben'),
    ('ticker', 'Wie steht Bitcoin heute in Euro?', 'echt'),
    ('worldclock', 'Wie spät ist es gerade in New York, Tokio und Sydney?', 'echt'),
    ('agent-run', 'Zeig mir diesen Auftrag als Agentenlauf: „Widget-System anlegen“, Schritte: chat.tsx gelesen (fertig, 0:38), Schema entworfen (fertig, 1:05), Wetter anbinden (läuft), Tests schreiben (offen). Konto Claude privat, Opus 5, 3:20 bisher.', 'gegeben'),
    ('test-result', f'Lass im Ordner {KORTEX}/engine/packages/core den Befehl `npx vitest run test/intelligence.test.ts` laufen und zeig mir das Ergebnis.', 'echt'),
    ('quota', 'Zeig mir meine Kontingente: Claude privat 62 % im 5-Stunden-Fenster, Reset 16:40, an diese Aufgabe gebunden; Codex privat 41 % Wochenlimit, Reset Montag 9 Uhr; Grok privat ohne verlässlichen Wert.', 'gegeben'),
    ('server', 'Wie geht es dem Server? Verbinde dich mit `ssh DEIN-SERVER` und nutze nur `uptime`, `free -m`, `df -h /` und `docker ps --format "{{.Names}} {{.Status}}"`.', 'echt'),
    ('deploy', 'Zeig mir diesen Deploy als Ablauf: Nordwind Clips nach Hetzner, main a3f9c2e „Header angeglichen“, Build fertig 1:02, Tests fertig 0:21, Upload fertig 0:14, Neustart fertig 0:06, Healthcheck läuft (2 von 3).', 'gegeben'),
    ('verification', 'Stell diese Prüfung dar: Apify-Lauf 8kQ2vTz SUCCEEDED erwartet und gefunden; Datensatz 412 erwartet, 412 gefunden; Supabase-Tabelle profiles 412 erwartet, 409 gefunden; Slack-Nachricht 1 erwartet, 1 gefunden.', 'gegeben'),
    ('scrape-run', 'Zeig den Stand dieses Scrape-Laufs: instagram-profile-scraper auf Apify, 280 von 412 Profilen, Kosten 0,84 $, 2 Fehler, zuletzt @nordlicht.studio (12.480 Follower) und @hafenkaffee.hh (8.912).', 'gegeben'),
    ('workflow', 'Zeig mir diesen Workflow: Neuer Lead (fertig) → Profil scrapen (fertig) → Mit KI anreichern (läuft) → danach parallel In Supabase speichern und Slack benachrichtigen (beide wartend). Scrapen hatte einen Wiederholungsschritt.', 'gegeben'),
    ('query-result', 'Welche Arbeitgeber hatte ich laut Exokortex? Zeig sie als Tabelle mit Rolle und Zeitraum.', 'echt'),
    ('graph-node', 'Was weiß der Exokortex über Beispiel Studios?', 'echt'),
    ('decision', 'Welche Entscheidung in ~/Obsidian-Vault/50-Entscheidungen ist noch offen? Zeig mir die erste.', 'echt'),
    ('place-naming', 'Hilf mir, eine unbenannte Ortsgruppe aus ~/Obsidian-Vault/80-Auto zu benennen. Nimm die erste, die du findest.', 'echt'),
    ('timeline', 'Was habe ich am 12. September gemacht? Schau in ~/Obsidian-Vault/10-Tage und ~/Obsidian-Vault/80-Auto.', 'echt'),
    ('jobs', 'Zeig mir diese Treffer: AI Automation Specialist bei Hafenwerk Digital, Frankfurt hybrid, 55–65 T €, Score 92, StepStone; Marketing Technologist bei Nordstern Commerce, Frankfurt, 50–58 T €, Score 88, LinkedIn.', 'gegeben'),
    ('design-diff', 'Stell diesen Abgleich dar: Header von Nordwind Clips. Eckenradius Primärknopf Figma 8 px, Code 12 px (behoben). Textfarbe inaktiv Figma #999A9D, Code #8F9094 (offen).', 'gegeben'),
    ('palette', f'Zeig mir die Farben --cx-bg, --cx-text, --cx-muted, --cx-dim und --cx-green aus {KORTEX}/engine/packages/vscode/media/cortex.css mit ihrem Kontrast.', 'echt'),
    ('audio-takes', 'Zeig mir diese Voice-over-Takes: Take 1 neutral 0:28, Take 2 ruhiger 0:31 (Favorit), Take 3 schneller 0:27.', 'gegeben'),
    ('kpis', 'Zeig mir die Kampagne Herbst-Sale auf Meta für 6.–12. September: Umsatz 4.820 € (+18 %), ROAS 3,4, CTR 1,80 % (−0,3 Pp.), Trichter 184.200 Impressionen, 3.316 Klicks, 410 Warenkörbe, 86 Käufe.', 'gegeben'),
    ('quiz', 'Stell mir eine Prüfungsfrage zum magischen Viereck mit vier Antworten.', 'echt'),
    ('game-theory', 'Wie gehe ich strategisch ins Gehaltsgespräch nach der Ausbildung? Mein Betrieb will mich halten, ein anderes Angebot habe ich noch nicht.', 'echt'),
]


def run(case):
    wtype, question, kind = case
    work = tempfile.mkdtemp(prefix='cortex-widget-live-')
    env = {**os.environ, 'CLAUDE_CONFIG_DIR': str(PROFILE)}
    started = time.time()
    try:
        proc = subprocess.run(
            ['claude', '-p', question + SAFE, '--output-format', 'json', '--model', 'claude-opus-5',
             '--dangerously-skip-permissions', '--strict-mcp-config', '--mcp-config', MCP, '--append-system-prompt', BRIEF],
            cwd=work, env=env, capture_output=True, text=True, timeout=600,
        )
        out = json.loads(proc.stdout) if proc.stdout.strip().startswith('{') else {'result': proc.stdout, 'is_error': True}
        answer = out.get('result') or ''
    except subprocess.TimeoutExpired:
        answer, out = '', {'is_error': True, 'result': 'Zeitüberschreitung nach 600 s'}
    path = Path(work) / 'answer.md'
    path.write_text(answer)
    blocks = json.loads(subprocess.run(['node', str(HERE / 'tool.mjs'), 'check', str(path)], capture_output=True, text=True).stdout or '[]')
    return {
        'type': wtype, 'kind': kind, 'question': question, 'seconds': round(time.time() - started),
        'error': out.get('is_error'), 'cost_usd': out.get('total_cost_usd'), 'blocks': blocks, 'answer': answer[:4000],
    }


if __name__ == '__main__':
    only = set(sys.argv[1:])
    todo = [c for c in CASES if not only or c[0] in only]
    path = HERE / 'results.json'
    results = json.loads(path.read_text()) if path.exists() else {}
    with ThreadPoolExecutor(max_workers=5) as pool:
        for r in pool.map(run, todo):
            results[r['type']] = r
            path.write_text(json.dumps(results, ensure_ascii=False, indent=1))
            ok = [b for b in r['blocks'] if b.get('ok')]
            print(f"{r['type']}: {len(r['blocks'])} Block/Blöcke, gültig {[b['type'] for b in ok]}, {r['seconds']} s", flush=True)
