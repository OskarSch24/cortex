"""Maßprüfung der Oberfläche: hält jede Fläche das Band oben frei, sitzen die
Abstände im Raster?

Der Hauptprozess mittet die Ampelknöpfe in ein 44 px hohes Band
(`scripts/patch-titlebar-menu.py`, TITLE; in `media/cortex.css` als
`--cx-titlebar`): drei Knöpfe à 16 px ab y = 14, links ab x = 13 bis x = 77.
Dieser Bereich muss frei bleiben — im Fenstermodus liegen dort die Knöpfe, rechts
die Werkzeug-Icons der Fenstertitelzeile.

Aufruf (Server muss laufen):
  python3 -m http.server 4173 --bind 127.0.0.1 --directory engine/packages/vscode
  python3 tests/cortex_masse.py [--shots]
"""
import json
import sys
from pathlib import Path

from headless_browser import headless_browser

BASE = 'http://127.0.0.1:4173/dev/preview.html?mode=agent'
OUT = Path(__file__).resolve().parents[1] / '.cache/masse'
OUT.mkdir(parents=True, exist_ok=True)
SHOTS = '--shots' in sys.argv
BAND = 44
LIGHTS = {'x': 13, 'y': 14, 'w': 64, 'h': 16}

MOCK = """() => {
  if (document.getElementById('ampel-mock')) return;
  const box = document.createElement('div');
  box.id = 'ampel-mock';
  box.style.cssText = 'position:fixed;left:13px;top:14px;width:64px;height:16px;z-index:9999;pointer-events:none;display:flex;gap:8px';
  for (const color of ['#ff5f57', '#febc2e', '#28c840']) {
    const dot = document.createElement('span');
    dot.style.cssText = `width:16px;height:16px;border-radius:50%;background:${color}`;
    box.appendChild(dot);
  }
  document.body.appendChild(box);
}"""

# Alles, was sichtbar im Band liegt, ist ein Fund: Text, Knöpfe, Symbole, Flächen
# mit eigener Farbe. Reine Hüllen (die Leiste selbst, der Chat) zählen nicht.
IN_BAND = """(band) => {
  const skip = new Set(['HTML', 'BODY']);
  const hits = [];
  for (const el of document.querySelectorAll('body *')) {
    if (skip.has(el.tagName) || el.id === 'ampel-mock') continue;
    const r = el.getBoundingClientRect();
    // Die Leiste (bis x = 250) nutzt das Band absichtlich: im Vollbild sind die
    // Ampelknöpfe weg, im Fenstermodus dürfen sie über der Marke liegen.
    if (r.right <= 250) continue;
    if (!r.width || !r.height || r.top >= band) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.opacity === '0' || s.display === 'none') continue;
    const own = el.children.length === 0 && el.textContent.trim();
    const painted = s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.borderTopWidth !== '0px';
    const glyph = el.tagName === 'svg' || el.tagName === 'IMG';
    if (!own && !glyph && !(painted && el.classList.length)) continue;
    hits.push({
      tag: el.tagName.toLowerCase(), cls: el.getAttribute('class') || '',
      text: (el.textContent || '').trim().slice(0, 28),
      x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
    });
  }
  return hits;
}"""

BOX = """(sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
           pad: s.padding, gap: s.gap, radius: s.borderRadius, font: s.fontSize, height: s.height, minHeight: s.minHeight };
}"""

def boxes(page, selectors):
    return {sel: page.evaluate(BOX, sel) for sel in selectors}

report = {}
with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 950})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))

    def visit(params=''):
        page.goto(BASE + params)
        page.wait_for_load_state('networkidle')
        page.locator('#harness').evaluate('(el) => el.remove()')
        page.evaluate(MOCK)

    def shot(name):
        if SHOTS:
            page.screenshot(path=str(OUT / f'{name}.png'))

    def host(message):
        page.evaluate('(m) => window.postMessage(m, "*")', message)
        page.wait_for_timeout(320)

    def band_hits(name):
        hits = page.evaluate(IN_BAND, BAND)
        report.setdefault('band', {})[name] = hits
        return hits

    visit()
    band_hits('chat_sidebar_offen')
    report['brand'] = boxes(page, ['.cx-rail-brand', '.cx-rail-nav', '.cx-rail-tree', '.cx-nav'])
    shot('01-chat')

    # Seitenleiste zu: dann liegen die Ampelknöpfe über dem Chat.
    page.get_by_title('Seitenleiste ausblenden').click()
    page.wait_for_timeout(420)
    band_hits('chat_sidebar_zu')
    shot('02-sidebar-zu')
    visit()  # zugeklappt liegt der Umschalter außerhalb des Bildes; neu laden setzt zurück

    # Dock (Dateien) öffnen — der Host schickt dieselbe Nachricht wie der Knopf.
    host({'kind': 'toolbar', 'action': 'files'})
    report['dock'] = boxes(page, ['.cx-dock', '.cx-dock-tabs', '.cx-dock-head', '.cx-dock-body', '.cx-dock-tree'])
    band_hits('dock_offen')
    shot('03-dock')
    host({'kind': 'toolbar', 'action': 'files'})

    # Die übrigen Bereiche der Leiste.
    for label, key in [('Plugins', 'plugins'), ('Einstellungen', 'settings'), ('Exokortex', 'exokortex'), ('Aktive Agenten', 'agenten')]:
        # Die Einstellungen stehen als Zahnrad an der Kontokarte, nicht mehr in der Liste.
        (page.locator('.cx-settings-btn') if key == 'settings' else page.locator('.cx-nav', has_text=label).first).click()
        page.wait_for_timeout(420)
        band_hits(f'seite_{key}')
        report.setdefault('seiten', {})[key] = boxes(page, ['.cx-page', '.cx-page-head', '.cx-page h1', '.cx-page section'])
        shot(f'04-{key}')
        if key == 'settings':
            # Die Einstellungen ersetzen die Leiste; zurück geht es über ihren eigenen Knopf.
            page.get_by_role('button', name='Zurück zur App').click()
            page.wait_for_timeout(320)

    # Raster: Höhen und Innenabstände der wiederkehrenden Bausteine.
    page.locator('.cx-nav', has_text='Neuer Chat').first.click()
    page.wait_for_timeout(320)
    report['raster'] = boxes(page, [
        '.cx-nav', '.cx-tree-task', '.cx-tree-add', '.cx-count',
        '.composer', '.composer textarea', '.composer-bar', '.model-btn', '.mode-btn', '.run-btn',
        '.cx-start-pills button', '.cx-conversation',
    ])

print(json.dumps(report, indent=1, ensure_ascii=False))
if errors:
    print('Browserfehler:', errors)
