"""Arbeits-Widgets 1–10: Cortex, Infrastruktur, Daten."""
import random
from base import (POS, NEG, WARN, INFO, VIOLET, ic, head, seg, chk, activity, walk, spark, board)


def spin(color=INFO, size=16):
    return f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" style="flex-shrink: 0"><circle cx="12" cy="12" r="8.5" stroke="{color}" stroke-opacity=".22" stroke-width="2"></circle><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" stroke="{color}" stroke-width="2" stroke-linecap="round"></path></svg>'


def ok(size=16):
    return f'<span style="display: grid; place-items: center; width: {size}px; height: {size}px; border-radius: 50%; background: {POS}29; flex: none">{ic("check", size - 6, POS, 2.4)}</span>'


def bad(size=16):
    return f'<span style="display: grid; place-items: center; width: {size}px; height: {size}px; border-radius: 50%; background: {NEG}29; flex: none">{ic("close", size - 7, NEG, 2.4)}</span>'


def warnmark(size=16):
    return f'<span style="display: grid; place-items: center; width: {size}px; height: {size}px; border-radius: 50%; background: {WARN}29; flex: none; color: {WARN}; font-size: {size - 5}px; font-weight: 700; line-height: 1">!</span>'


def pending(size=16):
    return f'<span style="width: {size}px; height: {size}px; border-radius: 50%; border: 1.5px dashed #ffffff30; box-sizing: border-box; flex: none"></span>'


# ── 1 Agenten-Lauf ──────────────────────────────────────────────────────────
def agent_run():
    steps = [('done', 'Chat-Rendering in <span class="mono" style="font-size: 13px">chat.tsx</span> gelesen', '0:38'),
             ('done', 'Widget-Schema entworfen', '1:05'),
             ('done', '<span class="mono" style="font-size: 13px">WidgetCard.tsx</span> erstellt <span style="color: #5fc27e">+142</span> <span style="color: #ee6a63">−0</span>', '0:52'),
             ('now', 'Wetter-Widget an Open-Meteo anbinden', '1:37'),
             ('next', 'Tests schreiben', ''),
             ('next', 'Build und Typprüfung', '')]
    rows = ''.join(f"""<div class="row" style="min-height: 34px">
  {ok() if st == 'done' else spin() if st == 'now' else pending()}
  <span class="grow" style="color: {'#ededee' if st == 'now' else '#8f9094' if st == 'done' else '#707277'}">{t}</span>
  <span class="num dim" style="font-size: 13px">{d}</span>
</div>""" for st, t, d in steps)
    segs = ''.join(f'<i style="flex: 1; height: 4px; border-radius: 2px; background: {"#ededee" if i < 3 else INFO if i == 3 else "#ffffff14"}; {"opacity: .9" if i == 3 else ""}"></i>' for i in range(6))
    return f"""<div class="w">
  {head(ic('spark', 18), 'Widget-System in Cortex anlegen', '<span class="tile" style="width: 14px; height: 14px; border-radius: 4px; background: #d97757; font-size: 8px; color: #fff">C</span>Claude · privat · Opus 5', f'<span class="pill info num">{spin(INFO, 12)}4:12</span><span class="btn">{ic("stop", 14)}Stoppen</span>', f'color: {INFO}')}
  <div style="display: flex; gap: 4px; padding: 0 14px 12px">{segs}</div>
  <div class="sep" style="padding: 6px 0">{rows}</div>
  <div class="foot"><span class="num">38,4k Tokens · 3 Dateien · Änderungen automatisch akzeptieren</span><span style="display: flex; align-items: center; gap: 4px">Verlauf {ic('chevron', 12)}</span></div>
</div>"""


# ── 2 Test- und Build-Ergebnis ──────────────────────────────────────────────
def tests():
    code = f"""<pre class="code" style="margin: 0 14px"><span class="dim">expect(screen.getByRole('button', {{ name: /gearbeitet/ }}))</span>
<span style="color: #ee7d77">- Erwartet  "11m 58s lang gearbeitet ›"</span>
<span style="color: #7ccf8e">+ Erhalten  "11m 58s gearbeitet ›"</span>
<span class="dim">    at test/unit/codexChat.test.ts:212:7</span></pre>"""
    return f"""<div class="w">
  {head(ic('terminal', 18), 'Engine-Tests', '<span class="mono" style="font-size: 12.5px">pnpm -C engine test</span>', '<span class="pill neg">1 fehlgeschlagen</span>')}
  <div class="sep grid3 cells">
    <div class="stat"><span class="label">Core</span><b>344 <span class="dim" style="font-size: 14px">/ 344</span></b></div>
    <div class="stat"><span class="label">Host</span><b>113 <span class="dim" style="font-size: 14px">/ 114</span></b></div>
    <div class="stat"><span class="label">Dauer</span><b>48,2 <span class="dim" style="font-size: 14px">s</span></b></div>
  </div>
  <div style="display: flex; gap: 2px; padding: 0 14px 14px"><i style="flex: 457; height: 4px; border-radius: 2px 0 0 2px; background: {POS}"></i><i style="flex: 6; height: 4px; border-radius: 0 2px 2px 0; background: {NEG}"></i></div>
  <div class="sep" style="padding: 10px 0 14px">
    <div class="row" style="min-height: 34px">{bad()}<span class="grow"><span class="v">faltet die Arbeit nach Abschluss</span> <span class="dim">· codexChat.test.ts</span></span></div>
    {code}
  </div>
  <div class="foot" style="padding: 10px 14px"><span class="acts"><span class="btn primary">{ic('bolt', 14)}Fehler beheben</span><span class="btn">Log öffnen</span></span><span class="btn quiet">{ic('refresh', 14)}Erneut ausführen</span></div>
</div>"""


# ── 3 Abo-Limits ────────────────────────────────────────────────────────────
def limits():
    accts = [('C', '#d97757', 'Claude · privat', 'Max · 5-Stunden-Fenster', 62, 'Reset 16:40', True),
             ('C', '#d97757', 'Claude · geschäftlich', 'Team · 5-Stunden-Fenster', 78, 'Reset 15:10', False),
             ('O', '#ededee', 'Codex · privat', 'Pro · Wochenlimit', 41, 'Reset Mo 09:00', False),
             ('G', '#ededee', 'Grok · privat', 'SuperGrok', None, '', False)]
    rows = []
    for k, col, name, plan, pct, reset, bound in accts:
        tile = f'<span class="tile" style="width: 28px; height: 28px; border-radius: 7px; background: {col}{"2e" if col != "#ededee" else "12"}; color: {col if col != "#ededee" else "#ededee"}; font-size: 12px">{k}</span>'
        if pct is None:
            meter = '<div style="width: 200px; height: 4px; border-radius: 2px; border-top: 1px dashed #ffffff26; margin-top: 2px"></div>'
            val = '<span class="dim" style="font-size: 13px; width: 150px; text-align: right">Kein verlässlicher Wert</span>'
        else:
            mc = NEG if pct >= 90 else WARN if pct >= 75 else '#ededee'
            meter = f'<div class="meter" style="width: 200px"><i style="width: {pct}%; background: {mc}"></i></div>'
            val = f'<span style="display: flex; flex-direction: column; align-items: flex-end; width: 150px"><span class="num" style="font-size: 14.5px; color: {mc if mc != "#ededee" else "#ededee"}">{pct} %</span><span class="label num">{reset}</span></span>'
        rows.append(f"""<div class="row" style="min-height: 58px">{tile}
  <span class="grow" style="display: flex; flex-direction: column"><span class="v" style="display: flex; align-items: center; gap: 8px">{name}{'<span class="pill info">An diese Aufgabe gebunden</span>' if bound else ''}</span><span class="label">{plan}</span></span>
  {meter}{val}
</div>""")
    return f"""<div class="w">
  {head(ic('gauge', 18), 'Kontingente', '4 Konten · Stand 14:32', '<span class="btn quiet">' + ic('refresh', 14) + 'Aktualisieren</span>')}
  <div class="sep rows" style="padding: 2px 0">{''.join(rows)}</div>
  <div class="foot"><span>Bei einem Limit wechselt Cortex nicht unbemerkt das Konto.</span><span style="display: flex; align-items: center; gap: 4px">Limits &amp; Konten {ic('chevron', 12)}</span></div>
</div>"""


# ── 4 Server-Ampel ──────────────────────────────────────────────────────────
def server():
    names = [('nginx', '41 T'), ('postgres', '41 T'), ('redis', '41 T'), ('rabbitmq', '41 T'),
             ('firecrawl', '3×'), ('crawl-worker', '12 T'), ('searxng', '41 T'), ('postgrest', '41 T'),
             ('couchdb', '7 T'), ('clips-web', '2 T'), ('workflows', '2 T'), ('ernte-worker', '5 T'),
             ('media-api', '9 T'), ('brandhub', '9 T'), ('intelligence', '9 T'), ('certbot', '41 T')]
    cells = ''.join(f"""<div style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px; background: {'#d8b36a12' if '×' in up else '#ffffff05'}">
  <span class="dot" style="background: {WARN if '×' in up else POS}; {'box-shadow: 0 0 0 3px #d8b36a26' if '×' in up else ''}"></span>
  <span class="mono grow" style="font-size: 12px; color: #ededee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{n}</span>
  <span class="num" style="font-size: 11.5px; color: {'#e3c285' if '×' in up else '#707277'}; white-space: nowrap">{up}</span>
</div>""" for n, up in names)
    cpu = walk(21, 40, 22, 3.5)
    return f"""<div class="w">
  {head(ic('server', 18), 'demo-hetzner', f'<span class="dot" style="background: {POS}"></span>Erreichbar · 16 Container · Ubuntu 24.04', '<span class="pill warn">1 Warnung</span>')}
  <div class="sep grid3 cells">
    <div class="stat"><span class="label">CPU · 8 Kerne</span><div style="display: flex; align-items: center; justify-content: space-between; gap: 10px"><b>23 %</b>{spark(cpu, 110, 30, '#ededee', area=True, glow=True, sw=1.3, uid='cpu')}</div></div>
    <div class="stat"><span class="label">Arbeitsspeicher</span><b>9,1 <span class="dim" style="font-size: 14px">/ 16 GB</span></b><div class="meter" style="margin-top: 6px"><i style="width: 57%"></i></div></div>
    <div class="stat"><span class="label">Festplatte</span><b>61 <span class="dim" style="font-size: 14px">%</span></b><div class="meter" style="margin-top: 6px"><i style="width: 61%"></i></div></div>
  </div>
  <div class="sep" style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; padding: 12px 14px">{cells}</div>
  <div class="sep rows">
    <div class="row" style="min-height: 44px">{ic('alert', 16, WARN)}<span class="grow"><span class="v">firecrawl</span> startet seit 14:12 immer wieder neu: Speicherlimit 2 GB erreicht</span><span class="btn">Logs</span></div>
    <div class="row" style="min-height: 44px">{ic('shield', 16, POS)}<span class="grow">6 Zertifikate gültig · das nächste läuft in <span class="v">64 Tagen</span> ab</span></div>
  </div>
  <div class="foot"><span>Über SSH gelesen · 14:32</span><span style="display: flex; align-items: center; gap: 4px">{ic('terminal', 12)}Terminal öffnen</span></div>
</div>"""


# ── 5 Deploy-Ablauf ─────────────────────────────────────────────────────────
def deploy():
    steps = [('Build', '1:02', 'done'), ('Tests', '0:21', 'done'), ('Upload', '0:14', 'done'), ('Neustart', '0:06', 'done'), ('Healthcheck', '2 von 3', 'now')]
    nodes = []
    for i, (n, d, st) in enumerate(steps):
        mark = ok(24) if st == 'done' else f'<span style="display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: {INFO}1f; box-shadow: 0 0 0 4px {INFO}14">{spin(INFO, 16)}</span>'
        nodes.append(f"""<div style="display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative; z-index: 1">
  {mark}<span style="font-size: 14px; line-height: 20px; color: {'#ededee'}">{n}</span><span class="label num" style="margin-top: -8px">{d}</span>
</div>""")
    return f"""<div class="w">
  {head(ic('upload', 18), 'Nordwind Clips → Hetzner', '<span class="mono" style="font-size: 12.5px">main · a3f9c2e</span>· Header nach Figma angeglichen', f'<span class="pill info num">{spin(INFO, 12)}1:48</span>')}
  <div class="sep" style="position: relative; padding: 18px 14px 14px">
    <div style="position: absolute; top: 29px; left: calc(14px + 10%); width: calc((100% - 28px) * .6); height: 2px; background: {POS}; opacity: .55"></div>
    <div style="position: absolute; top: 29px; left: calc(14px + 70%); width: calc((100% - 28px) * .2); border-top: 2px dashed {INFO}66"></div>
    <div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr))">{''.join(nodes)}</div>
  </div>
  <pre class="code" style="margin: 0 14px 14px"><span class="dim">14:36:02</span>  GET /health  <span style="color: #7ccf8e">200</span>  38 ms
<span class="dim">14:36:07</span>  GET /health  <span style="color: #7ccf8e">200</span>  41 ms
<span class="dim">14:36:12</span>  <span style="color: #8dbcff">warte auf dritten Check …</span></pre>
  <div class="foot" style="padding: 10px 14px"><span class="acts"><span class="btn">Log öffnen</span><span class="btn quiet">Zurückrollen auf 91be0d4</span></span><span>clips.amq · Container clips-web</span></div>
</div>"""


# ── 6 Verifikations-Matrix ──────────────────────────────────────────────────
def verify():
    rows = [('Apify', 'Lauf 8kQ2vTz', 'SUCCEEDED', 'SUCCEEDED', 'ok'),
            ('Apify Datensatz', 'Einträge', '412', '412', 'ok'),
            ('Supabase', 'Tabelle profiles', '412 Zeilen', '409 Zeilen', 'warn'),
            ('Slack', 'Nachricht in #ernte', '1', '1', 'ok')]
    th = '<div class="row label" style="min-height: 32px; font-size: 12px; color: #707277"><span style="width: 18px"></span><span style="width: 150px">Plattform</span><span class="grow">Beleg</span><span style="width: 110px; text-align: right">Erwartet</span><span style="width: 110px; text-align: right">Gefunden</span></div>'
    body = ''.join(f"""<div class="row" style="min-height: 42px">{ok() if st == 'ok' else warnmark()}
  <span class="v" style="width: 150px">{p}</span><span class="grow">{b}</span>
  <span class="num" style="width: 110px; text-align: right">{e}</span><span class="num" style="width: 110px; text-align: right; color: {'#e3c285' if st == 'warn' else '#ededee'}">{f}</span>
</div>""" for p, b, e, f, st in rows)
    return f"""<div class="w">
  {head(ic('shield', 18), 'Lauf verifiziert: Instagram-Profile', '4 Belege auf 3 Plattformen · 14:41', '<span class="pill warn">1 Abweichung</span>')}
  <div class="sep">{th}<div class="rows">{body}</div></div>
  <div style="margin: 4px 14px 14px; padding: 12px 14px; border-radius: 10px; background: #d8b36a0f; display: flex; gap: 10px">
    {ic('alert', 16, WARN)}
    <div class="grow" style="font-size: 14px; line-height: 21px"><span class="v">In Supabase fehlen 3 Zeilen.</span> <span class="muted">Die drei Profile haben kein Feld <span class="mono" style="font-size: 12.5px">bio</span> und wurden beim Einfügen abgelehnt.</span>
      <div style="display: flex; gap: 6px; margin-top: 10px"><span class="btn">Fehlende Profile zeigen</span><span class="btn quiet">{ic('refresh', 14)}Erneut prüfen</span></div>
    </div>
  </div>
</div>"""


# ── 7 Scrape-Lauf ───────────────────────────────────────────────────────────
def scrape():
    recs = [('@nordlicht.studio', 'Nordlicht Studio', '12.480'), ('@hafenkaffee.hh', 'Hafenkaffee', '8.912'), ('@elbfilm.produktion', 'Elbfilm Produktion', '3.205')]
    rows = ''.join(f"""<div class="row" style="min-height: 38px"><span class="mono" style="font-size: 12.5px; width: 190px; color: #ededee">{h}</span><span class="grow">{n}</span><span class="num v">{f}</span><span class="dim" style="font-size: 13px; width: 70px">Follower</span></div>""" for h, n, f in recs)
    rate = walk(5, 30, 30, 2.2)
    return f"""<div class="w">
  {head(ic('download', 18), 'instagram-profile-scraper', 'Apify · Nordwind Ernte · gestartet 14:22', '<span class="btn">' + ic('stop', 14) + 'Abbrechen</span>')}
  <div class="sep" style="padding: 14px 14px 12px">
    <div style="display: flex; align-items: baseline; gap: 10px">
      <span class="num" style="font-size: 28px; line-height: 34px; font-weight: 300">280 <span class="dim" style="font-size: 18px">/ 412 Profile</span></span>
      <span class="grow"></span><span class="muted num" style="font-size: 13.5px">noch etwa 4 min</span>
    </div>
    <div class="meter" style="margin-top: 10px; height: 6px; border-radius: 3px"><i style="width: 68%; border-radius: 3px"></i></div>
  </div>
  <div class="sep grid3 cells">
    <div class="stat"><span class="label">Kosten bisher</span><b>0,84 <span class="dim" style="font-size: 14px">$</span></b></div>
    <div class="stat"><span class="label">Fehler</span><b style="color: #e3c285">2</b></div>
    <div class="stat"><span class="label">Durchsatz</span><div style="display: flex; align-items: center; justify-content: space-between; gap: 10px"><b>31 <span class="dim" style="font-size: 14px">/ min</span></b>{spark(rate, 90, 26, INFO, sw=1.3, uid='rate')}</div></div>
  </div>
  <div class="sep" style="padding: 8px 0 6px"><div class="label" style="padding: 2px 14px 4px">Zuletzt geholt</div><div class="rows">{rows}</div></div>
  <div class="foot"><span class="mono" style="font-size: 12px">Datensatz 6sXkP0aL</span><span style="display: flex; align-items: center; gap: 4px">Im Datensatz öffnen {ic('chevron', 12)}</span></div>
</div>"""


# ── 8 Workflow-Graph ────────────────────────────────────────────────────────
def workflow():
    W, H = 706, 236
    nodes = {  # id: x, y, Titel, Unterzeile, Zustand
        'a': (4, 86, 'Neuer Lead', 'Webhook', 'done'),
        'b': (180, 86, 'Profil scrapen', 'Apify · 6 s', 'done'),
        'c': (356, 86, 'Mit KI anreichern', 'Claude · läuft', 'now'),
        'd': (540, 30, 'In Supabase speichern', 'wartet', 'next'),
        'e': (540, 142, 'Slack benachrichtigen', 'wartet', 'next'),
        'r': (180, 180, 'Erneut versuchen', '2 Versuche', 'retry'),
    }
    nw, nh = 160, 50
    def port(k, side):
        x, y = nodes[k][0], nodes[k][1]
        return (x + nw, y + nh / 2) if side == 'r' else (x, y + nh / 2) if side == 'l' else (x + nw / 2, y + nh) if side == 'b' else (x + nw / 2, y)
    def edge(a, sa, b, sb, style):
        (x1, y1), (x2, y2) = port(a, sa), port(b, sb)
        if sa == 'b':
            d = f'M{x1} {y1} C{x1} {y1 + 30} {x2 + 20} {y2 - 30} {x2} {y2}'
        else:
            mx = (x1 + x2) / 2
            d = f'M{x1} {y1} C{mx} {y1} {mx} {y2} {x2} {y2}'
        stroke = {'done': 'stroke="#ededee" stroke-opacity=".5"', 'now': f'stroke="{INFO}" stroke-dasharray="4 4"', 'next': 'stroke="#ffffff24"', 'retry': f'stroke="{WARN}" stroke-opacity=".6" stroke-dasharray="2 3"'}[style]
        return f'<path d="{d}" fill="none" {stroke} stroke-width="1.5"></path>'
    edges = edge('a', 'r', 'b', 'l', 'done') + edge('b', 'r', 'c', 'l', 'now') + edge('c', 'r', 'd', 'l', 'next') + edge('c', 'r', 'e', 'l', 'next') + edge('b', 'b', 'r', 't', 'retry')
    boxes = []
    for k, (x, y, t, s, st) in nodes.items():
        stroke = {'done': '#ffffff24', 'now': INFO, 'next': '#ffffff14', 'retry': '#d8b36a55'}[st]
        glow = f'<rect x="{x - 4}" y="{y - 4}" width="{nw + 8}" height="{nh + 8}" rx="12" fill="{INFO}" fill-opacity=".1"></rect>' if st == 'now' else ''
        dotc = {'done': POS, 'now': INFO, 'next': '#707277', 'retry': WARN}[st]
        tc = '#707277' if st == 'next' else '#ededee'
        boxes.append(f"""{glow}<rect x="{x}" y="{y}" width="{nw}" height="{nh}" rx="9" fill="#1b1c1f" stroke="{stroke}" stroke-width="{1.5 if st == 'now' else 1}"></rect>
<circle cx="{x + 14}" cy="{y + 18}" r="3" fill="{dotc}"></circle>
<text x="{x + 24}" y="{y + 22}" fill="{tc}" font-size="12.5" font-family="SF Pro Text, -apple-system, sans-serif">{t}</text>
<text x="{x + 24}" y="{y + 38}" fill="#707277" font-size="11" font-family="SF Pro Text, -apple-system, sans-serif">{s}</text>""")
    svg = f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" style="display: block">{edges}{"".join(boxes)}</svg>'
    return f"""<div class="w">
  {head(ic('flow', 18), 'Lead-Anreicherung', 'Nordwind Workflows · Lauf 1.284', '<span class="pill info">Schritt 3 von 5</span><span class="btn">Im Editor öffnen</span>')}
  <div class="sep" style="padding: 14px; background-image: radial-gradient(#ffffff0d 1px, transparent 1px); background-size: 16px 16px">{svg}</div>
  <div class="foot"><span class="num">Gestartet 14:40:12 · 38 s · Scrapen brauchte 2 Versuche</span><span style="display: flex; gap: 12px"><span style="display: flex; align-items: center; gap: 6px"><span class="dot" style="background: {POS}"></span>fertig</span><span style="display: flex; align-items: center; gap: 6px"><span class="dot" style="background: {INFO}"></span>läuft</span><span style="display: flex; align-items: center; gap: 6px"><span class="dot" style="background: {WARN}"></span>Wiederholung</span></span></div>
</div>"""


# ── 9 Abfrage-Ergebnis ──────────────────────────────────────────────────────
def query():
    kw = lambda s: f'<span style="color: #b5aae6">{s}</span>'
    st = lambda s: f'<span style="color: #9fd0b2">{s}</span>'
    lb = lambda s: f'<span style="color: #8dbcff">{s}</span>'
    code = (f'{kw("MATCH")} (p:{lb("Person")} {{name: {st(chr(34) + "Alex Beispiel" + chr(34))}}})-[r:{lb("ARBEITETE_BEI")}]->(o:{lb("Organisation")})\n'
            f'{kw("RETURN")} o.name, r.rolle, r.von, r.bis {kw("ORDER BY")} r.von {kw("DESC")}')
    data = [('Nordlicht Akademie', 'E-Commerce-Azubi', '2025', 'heute'),
            ('Beispiel Studios', 'CEO & Sound Engineer', '2022', '2024'),
            ('Kranich Media GmbH', 'Junior Sales Manager', '2023', '2023'),
            ('Fokus Vertrieb', 'Sales Manager', '2020', '2021'),
            ('Wohnwert AG', 'Immobilienberater', '2019', '2020'),
            ('Funke Marketing GbR', 'Gründer & CEO', '2018', '2019')]
    th = '<div class="row" style="min-height: 32px; font-size: 12px; color: #707277"><span style="width: 270px">o.name</span><span class="grow">r.rolle</span><span style="width: 60px; text-align: right">r.von</span><span style="width: 60px; text-align: right">r.bis</span></div>'
    rows = ''.join(f'<div class="row" style="min-height: 36px"><span class="v" style="width: 270px">{a}</span><span class="grow">{b}</span><span class="num" style="width: 60px; text-align: right">{c}</span><span class="num" style="width: 60px; text-align: right">{d}</span></div>' for a, b, c, d in data)
    return f"""<div class="w">
  {head(ic('database', 18), 'Abfrage im Exokortex-Graphen', '<span class="num">Vektor · 6 Zeilen · 12 ms</span>', '<span class="btn">' + ic('external', 14) + 'In Vektor öffnen</span>')}
  <pre class="code" style="margin: 0 14px 14px; white-space: pre-wrap">{code}</pre>
  <div class="sep">{th}<div class="rows">{rows}</div></div>
  <div class="foot"><span>Nur lesend · Schreibzugriff über die API ist aus</span><span style="display: flex; gap: 12px"><span>Als CSV kopieren</span><span>Als Graph zeigen</span></span></div>
</div>"""


# ── 10 Exokortex-Knoten ─────────────────────────────────────────────────────
def node_card():
    cx, cy = 150, 104
    nbrs = [(76, 36, 'Alex Beispiel', 'Person', 'ARBEITETE_BEI'), (250, 50, 'Werbefilme', 'Tätigkeit', 'PRODUZIERTE'),
            (236, 176, 'Maschinenbau', 'Branche', 'KUNDEN_AUS'), (58, 178, 'Freelancer-Team', 'Gruppe', 'KOORDINIERTE')]
    parts = []
    for x, y, t, typ, rel in nbrs:
        parts.append(f'<path d="M{cx} {cy} L{x} {y}" stroke="#ffffff26" stroke-width="1"></path>')
    for x, y, t, typ, rel in nbrs:
        col = VIOLET if typ == 'Person' else '#999a9d'
        parts.append(f'<circle cx="{x}" cy="{y}" r="6" fill="#101113" stroke="{col}" stroke-width="1.5"></circle>'
                     f'<text x="{x}" y="{y + (-12 if y < cy else 20)}" text-anchor="middle" fill="#c9cacd" font-size="11" font-family="SF Pro Text, -apple-system, sans-serif">{t}</text>')
    parts.append(f'<circle cx="{cx}" cy="{cy}" r="20" fill="{INFO}" fill-opacity=".12"></circle><circle cx="{cx}" cy="{cy}" r="9" fill="{INFO}"></circle>')
    svg = f'<svg width="300" height="210" viewBox="0 0 300 210" style="display: block">{"".join(parts)}</svg>'
    fact = lambda t: f'<div style="display: flex; gap: 10px; font-size: 14px; line-height: 21px"><span class="dot" style="background: {POS}; margin-top: 8px"></span><span class="v">{t}</span></div>'
    return f"""<div class="w">
  {head('BS', 'Beispiel Studios', 'Organisation · 4 Verbindungen', '<span class="btn">' + ic('node', 14) + 'Im Graphen zeigen</span>', f'color: {INFO}; background: #6aa8ff14')}
  <div class="sep" style="display: flex; gap: 8px; padding: 12px 14px 14px">
    <div style="flex: none; border-radius: 10px; background: #ffffff04">{svg}</div>
    <div class="grow" style="display: flex; flex-direction: column; gap: 14px; padding-top: 4px">
      <div><div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px"><span style="font-size: 13px; font-weight: 500">Belegt</span><span class="label">aus dem CV, April 2025</span></div>
        <div style="display: flex; flex-direction: column; gap: 6px">{fact('Alex war dort CEO und Sound Engineer, 2022 bis 2024')}{fact('Werbefilme für Unternehmen des Maschinenbaus')}{fact('Soundtracks und Voice-overs in drei Sprachen')}</div></div>
      <div><div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px"><span style="font-size: 13px; font-weight: 500">Beobachtet</span><span class="label">aus der Zusammenarbeit</span></div>
        <div class="dim" style="font-size: 14px">Noch nichts beobachtet</div></div>
    </div>
  </div>
  <div class="foot"><span class="mono" style="font-size: 12px">org_beispiel_studios</span><span>Stand 06.09.2026</span></div>
</div>"""


WIDGETS = [
    ('Agenten-Lauf', 'Leg das Widget-System im Chat an.', agent_run, '', '', 480),
    ('Tests', 'Lass die Engine-Tests laufen.', tests, activity('terminal', 'Befehl ausgeführt <span class="mono" style="font-size: 13.5px; color: #6f7074">pnpm -C engine test</span>'), 'Ein Host-Test schlägt fehl, weil im Text „lang“ fehlt. Soll ich das korrigieren?', 640),
    ('Limits', 'Wie viel ist auf meinen Konten noch frei?', limits, '', '', 440),
    ('Server', 'Wie geht es dem Server?', server, activity('terminal', 'Per SSH Zustand von demo-hetzner gelesen'), '', 700),
    ('Deploy', 'Deploy Nordwind Clips auf den Server.', deploy, '', '', 460),
    ('Verifikation', 'Hat der Scrape-Lauf wirklich überall funktioniert?', verify, activity('shield', 'Apify, Supabase und Slack gegengeprüft'), '', 560),
    ('Scrape-Lauf', 'Starte den Instagram-Scraper für die neue Liste.', scrape, '', '', 600),
    ('Workflow', 'Wo steht der Lead-Workflow gerade?', workflow, '', '', 470),
    ('Abfrage', 'Zeig mir alle meine bisherigen Arbeitgeber aus dem Graphen.', query, activity('database', 'Abfrage in Vektor ausgeführt'), '', 640),
    ('Knoten', 'Was weiß der Exokortex über Beispiel Studios?', node_card, '', '', 460),
]
