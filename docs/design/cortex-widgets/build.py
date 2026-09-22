#!/usr/bin/env python3
"""Erzeugt die Artboards „Cortex Chat-Widgets“.

python3 build.py            → .dc.html je Widget, Main.dc.html, canvas.json
python3 build.py --preview  → preview.html mit allen Widgets untereinander (zum Messen)
"""
import json
import re
import sys
from pathlib import Path

from base import STYLE, ic, board, document, activity
import alltag
import arbeit1
import arbeit2

HERE = Path(__file__).parent
HEIGHTS = HERE / 'heights.json'


def stem(title):
    s = title.replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue').replace('ß', 'ss')
    return re.sub(r'[^A-Za-z0-9]', '', s.title())


ALLTAG = [(t, u, f, lead, after, h) for t, u, f, lead, after, h in alltag.WIDGETS]
ARBEIT = [(t, u, f, lead, after, h) for t, u, f, lead, after, h in arbeit1.WIDGETS + arbeit2.WIDGETS]


# ── Überblick: ein Cortex-Fenster mit zwei Widgets im Verlauf ────────────────
MAIN_STYLE = """
<style>
  .app { display: flex; width: 1440px; min-height: 1180px; background: #101113; color: #ededee;
         font: 13px/1.5 'SF Pro Text', -apple-system, 'Helvetica Neue', sans-serif; -webkit-font-smoothing: antialiased; }
  .rail { display: flex; flex-direction: column; width: 250px; min-width: 250px; box-sizing: border-box; padding: 0 8px 0 10px; background: #1b1c1f; border-right: 1px solid #ffffff0e; }
  .brand { display: flex; align-items: center; gap: 9px; height: 42px; margin-top: 30px; padding: 0 4px 0 5px; color: #f2f2f3; }
  .brand span { font-size: 17px; font-weight: 640; letter-spacing: -.4px; margin-right: auto; }
  .ico { display: inline-flex; justify-content: center; align-items: center; width: 26px; height: 26px; border-radius: 5px; color: #707277; }
  .nav { display: flex; align-items: center; gap: 10px; color: #c3c4c7; padding: 0 8px; min-height: 30px; border-radius: 8px; font-size: 12.5px; }
  .nav svg { color: #999a9d; }
  .count { font: 10px 'SF Mono', Menlo, monospace; color: #999a9d; background: #ffffff10; border-radius: 4px; padding: 1px 5px; margin-left: auto; }
  .heading { margin: 16px 0 3px 8px; color: #707277; font-size: 11px; font-weight: 480; }
  .tree { display: flex; align-items: center; gap: 9px; height: 30px; padding-left: 8px; color: #c3c4c7; font-size: 12.5px; border-radius: 8px; }
  .tree svg { color: #707277; }
  .tree.on { background: #ffffff12; color: #ededee; }
  .main { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .titletools { position: absolute; top: 12px; right: 12px; display: flex; gap: 4px; color: #999a9d; }
  .chat { flex: 1; width: 736px; margin: 0 auto; padding: 64px 0 24px; display: flex; flex-direction: column; gap: 14px; font-size: 15px; line-height: 23px; }
  .composer { width: 736px; margin: 0 auto 22px; box-sizing: border-box; border: 1px solid #ffffff12; border-radius: 18px; background: #282828; padding: 10px 13px 6px; }
  .composer-bar { display: flex; align-items: center; gap: 8px; padding-top: 5px; min-height: 28px; color: #999a9d; font-size: 13px; }
  .send { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: #eeeef0; color: #131416; }
</style>
"""


def main_window():
    nav = [('compose', 'Neuer Chat', ''), ('bolt', 'Aktive Agenten', '<span class="count">1</span>'),
           ('branch', 'Exokortex', ''), ('plug', 'Plugins', ''), ('dots', 'Einstellungen', '')]
    items = ''.join(f'<div class="nav">{ic(g)}<span>{label}</span>{extra}</div>' for g, label, extra in nav)
    rail = f"""<aside class="rail">
  <div class="brand"><img src="cortex-icon.png" width="22" height="22" alt="" style="border-radius: 5px"></img><span>Cortex</span>
    <span class="ico" style="margin-right: 0">{ic('search', 15)}</span><span class="ico" style="margin-right: 0">{ic('panel', 15)}</span></div>
  <div style="display: flex; flex-direction: column; margin-top: 4px">{items}</div>
  <div class="heading">Projekte</div>
  <div class="tree">{ic('folder', 15)}<span>Cortex</span></div>
  <div class="tree on" style="padding-left: 32px">Widgets im Chat</div>
  <div class="tree" style="padding-left: 32px">Einstellungen nach Codex</div>
  <div class="tree">{ic('folder', 15)}<span>Exokortex</span></div>
  <div class="tree">{ic('folder', 15)}<span>Nordwind</span></div>
  <div style="flex: 1"></div>
</aside>"""
    chat = f"""<div class="chat">
  <div class="user" style="margin-bottom: 12px"><div class="bubble">Wie wird das Wetter heute in Frankfurt?</div></div>
  {activity('globe', 'Wetter für Frankfurt-Bornheim abgerufen')}
  {alltag.weather()}
  <p class="prose">Bis 15 Uhr bleibt es trocken. Wenn du rausgehst, nimm für den Rückweg eine Jacke mit.</p>
  <div class="user" style="margin: 26px 0 12px"><div class="bubble">Und lass danach die Engine-Tests laufen.</div></div>
  {activity('terminal', 'Befehl ausgeführt <span class="mono" style="font-size: 13.5px; color: #6f7074">pnpm -C engine test</span>')}
  {arbeit1.tests()}
</div>"""
    composer = f"""<div class="composer">
  <div style="font-size: 15px; line-height: 23px; color: #87888b; padding: 2px 3px; min-height: 28px">Frag Cortex etwas</div>
  <div class="composer-bar"><span class="ico" style="color: #999a9d">{ic('plus', 16)}</span><span>Änderungen automatisch akzeptieren</span><span style="flex: 1"></span><span>Opus 5</span><span class="send">{ic('arrow', 14, '#131416', 2)}</span></div>
</div>"""
    tools = f'<div class="titletools"><span class="ico">{ic("globe", 15)}</span><span class="ico">{ic("folder", 15)}</span><span class="ico">{ic("terminal", 15)}</span></div>'
    return f'<div class="app">{rail}<main class="main">{tools}{chat}{composer}</main></div>'


def build_preview():
    parts = []
    for group in (ALLTAG, ARBEIT):
        for title, user, fn, lead, after, _ in group:
            parts.append(f'<section data-file="{stem(title)}.dc.html" style="display: inline-block; vertical-align: top">{board(user, fn(), lead, after)}</section>')
    parts.append(f'<section data-file="Main.dc.html" style="display: inline-block; vertical-align: top">{main_window()}</section>')
    html = f'<!doctype html><html><head><meta charset="utf-8">{STYLE}{MAIN_STYLE}</head><body>{"".join(parts)}</body></html>'
    (HERE / 'preview.html').write_text(html, encoding='utf-8')
    print('preview.html geschrieben')


def build():
    heights = json.loads(HEIGHTS.read_text()) if HEIGHTS.exists() else {}
    files = []
    for group in (ALLTAG, ARBEIT):
        for title, user, fn, lead, after, _ in group:
            name = f'{stem(title)}.dc.html'
            (HERE / name).write_text(document(board(user, fn(), lead, after)), encoding='utf-8')
            files.append(name)
    (HERE / 'Main.dc.html').write_text(document(main_window(), MAIN_STYLE), encoding='utf-8')

    def h(name, fallback):
        return int(heights.get(name, fallback)) + 8

    W, GAP_X, GAP_Y, PER_ROW = 816, 100, 160, 5
    boards = [{'file': 'Main.dc.html', 'x': 0, 'y': 0, 'w': 1440, 'h': h('Main.dc.html', 1180), 'title': 'Cortex · Widgets im Verlauf', 'page': 'ueberblick'}]

    def lay(group, page, y0=0):
        y, row_h = y0, 0
        for i, (title, *_rest, est) in enumerate(group):
            if i and i % PER_ROW == 0:
                y += row_h + GAP_Y
                row_h = 0
            name = f'{stem(title)}.dc.html'
            hh = h(name, est)
            boards.append({'file': name, 'x': (i % PER_ROW) * (W + GAP_X), 'y': y, 'w': W, 'h': hh, 'title': f'{i + 1:02d} · {title}', 'page': page})
            row_h = max(row_h, hh)

    lay(ALLTAG, 'alltag')
    lay(ARBEIT, 'arbeit')
    notes = [
        {'id': 'regeln', 'x': 1520, 'y': 0, 'w': 420, 'page': 'ueberblick',
         'text': 'Cortex Chat-Widgets\nJedes Widget ist eine Karte im Verlauf: Radius 12, Rand #ffffff12, Fläche #ffffff06, Kopf mit 36-px-Marke, Titel 15/21, Unterzeile 13,5/19.\n\nFarbe nur, wo sie etwas bedeutet: Grün gut, Rot Fehler, Bernstein Warnung, Blau läuft oder Link, Violett als zweite Reihe. Nach dem Fey-Kit: gepunktete Bezugslinien, leuchtender Endpunkt, Wert-Pillen mit getönter Fläche.\n\nAlle Werte sind Beispiele.'},
        {'id': 'alltag-hinweis', 'x': 0, 'y': -150, 'w': 520, 'page': 'alltag',
         'text': 'Alltag · 10 Widgets\nJedes Artboard zeigt Frage, Widget und bei Bedarf einen Satz Antwort, so wie es im Cortex-Chat steht (Spalte 736 px).'},
        {'id': 'arbeit-hinweis', 'x': 0, 'y': -150, 'w': 520, 'page': 'arbeit',
         'text': 'Arbeit · 20 Widgets\nInhalte aus dem Exokortex, wo es sie gibt: Stationen aus dem CV, DEC-2026-09-06-01, Container auf demo-hetzner. Firmen, Handles und Kennzahlen sind erfunden.'},
    ]
    layout = {'pages': [{'id': 'ueberblick', 'name': 'Überblick'}, {'id': 'alltag', 'name': 'Alltag'}, {'id': 'arbeit', 'name': 'Arbeit'}],
              'artboards': boards, 'annotations': notes, 'launch': {'view': 'canvas', 'page': 'ueberblick'}}
    (HERE / 'canvas.json').write_text(json.dumps(layout, ensure_ascii=False, indent=2), encoding='utf-8')
    print(' '.join(['Main.dc.html'] + files))


if __name__ == '__main__':
    build_preview() if '--preview' in sys.argv else build()
