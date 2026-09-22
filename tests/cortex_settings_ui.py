"""Einstellungen nach Codex: Pixelabnahme und Wirkung.

Die Sollmaße stammen aus der Bildschirmaufnahme der Codex-Einstellungen vom
13.09.2026 (Fenster 1710 × 1072 pt, vermessen an Vollauflösungs-Frames; der
Informationsbaum steht in docs/CODEX_EINSTELLUNGEN.md). Farben und Schrift sind
bewusst die von Cortex — geprüft werden Lage und Größe, nicht Grautöne.

Voraussetzung:
  python3 -m http.server 4173 --bind 127.0.0.1 --directory engine/packages/vscode

Kein Desktop-Browser: ausschließlich chromium-headless-shell über
`tests/headless_browser.py`, wie in AGENTS.md festgelegt.
"""
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

BASE = 'http://127.0.0.1:4173/dev/preview.html?mode=agent'
OUT = Path(__file__).resolve().parents[1] / 'docs/screenshots'
OUT.mkdir(parents=True, exist_ok=True)

# Aus der Aufnahme gemessen (CSS-px, Toleranz 1 px).
BUDGET = {
    'Leiste Breite': 240,
    'Leiste Zeile': 30,
    'Leiste Pitch': 31,
    'Leiste erste Zeile': 154,
    'Suche oben': 83,
    'Suche Höhe': 30,
    'Auswahl Breite': 224,
    'Spalte links': 591,
    'Spalte Breite': 768,
    'Karte 1 oben': 172,
    'Karte 1 Höhe': 171,
    'Karte 2 oben': 429,
    'Zeile': 60.5,
    'Schalter Breite': 32,
    'Schalter Höhe': 20,
    'Schalter rechts': 1342,
    'Auswahl Höhe': 28,
}

HOST_LOG = """() => { window.__sent = []; window.addEventListener('preview:host', e => window.__sent.push(e.detail)); }"""

with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1710, 'height': 1072}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE)
    page.evaluate("localStorage.setItem('cortex.archivedProjects', JSON.stringify(['/demo/exokortex']))")
    page.reload()
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e) => e.remove()')
    page.evaluate(HOST_LOG)

    # ── Öffnen: die Einstellungen ersetzen die App-Leiste ────────────────────
    page.locator('.cx-nav', has_text='Einstellungen').click()
    nav = page.locator('.cxs-nav')
    expect(nav).to_be_visible()
    expect(page.locator('.cx-sidebar')).to_have_count(0)
    groups = nav.locator('.cxs-nav-group h3').all_inner_texts()
    assert groups == ['Persönlich', 'Integrationen', 'Programmierung', 'Archiviert'], groups
    items = nav.locator('.cxs-nav-item').all_inner_texts()
    assert len(items) == 22 and 'Pets' not in items, items
    expect(page.locator('.cxs-page-head h1')).to_have_text('Allgemein')

    # ── Pixelabnahme Allgemein ───────────────────────────────────────────────
    measured = page.evaluate("""() => {
      const r = s => document.querySelector(s).getBoundingClientRect();
      const items = [...document.querySelectorAll('.cxs-nav-item')].map(e => e.getBoundingClientRect());
      const cards = [...document.querySelectorAll('.cxs-page .cxs-card')].map(e => e.getBoundingClientRect());
      const row = document.querySelectorAll('.cxs-page .cxs-card')[1].querySelectorAll('.cxs-row')[1].getBoundingClientRect();
      const toggle = r('.cxs-toggle');
      const select = r('.cxs-select-button');
      return {
        'Leiste Breite': r('.cxs-nav').width, 'Leiste Zeile': items[0].height, 'Leiste Pitch': items[1].y - items[0].y,
        'Leiste erste Zeile': items[0].y, 'Suche oben': r('.cxs-nav-search').y, 'Suche Höhe': r('.cxs-nav-search').height,
        'Auswahl Breite': items[0].width, 'Spalte links': cards[0].x, 'Spalte Breite': cards[0].width,
        'Karte 1 oben': cards[0].y, 'Karte 1 Höhe': cards[0].height, 'Karte 2 oben': cards[1].y, 'Zeile': row.height,
        'Schalter Breite': toggle.width, 'Schalter Höhe': toggle.height, 'Schalter rechts': toggle.right,
        'Auswahl Höhe': select.height,
      };
    }""")
    misses = {k: (round(measured[k], 1), v) for k, v in BUDGET.items() if abs(measured[k] - v) > 1}
    assert not misses, f'Maße weichen ab (ist, soll): {misses}'
    page.screenshot(path=str(OUT / 'settings-allgemein.png'))

    # ── Wirkung: Vollzugriff schreibt den Handlungsspielraum ─────────────────
    full = page.get_by_role('switch', name='Vollzugriff')
    full.click()
    expect(full).to_have_attribute('aria-checked', 'true')
    assert any(m.get('kind') == 'setModes' and m.get('permissionMode') == 'full' for m in page.evaluate('window.__sent')), 'Vollzugriff ging nicht an den Host.'
    full.click()

    # ── Wirkung: Darstellung setzt die Tokens sofort ─────────────────────────
    nav.get_by_role('button', name='Darstellung', exact=True).click()
    page.get_by_role('button', name='Hell', exact=True).click()
    assert page.evaluate("document.documentElement.dataset.cxTheme") == 'hell'
    assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--cx-bg').trim()").lower() == '#f7f7f8'
    page.get_by_role('button', name='Dunkel', exact=True).click()
    assert page.evaluate("document.documentElement.dataset.cxTheme") == 'dunkel'
    assert page.evaluate("document.documentElement.style.getPropertyValue('--cx-bg')") == ''

    # ── Suche in der Leiste ──────────────────────────────────────────────────
    nav.locator('.cxs-nav-search input').fill('cookies')
    expect(nav.locator('.cxs-nav-item')).to_have_count(1)
    expect(nav.locator('.cxs-nav-item')).to_have_text('Browser')
    nav.locator('.cxs-nav-search input').fill('')

    # ── Browser › Website-Einstellungen › Standort, zurück per Brotkrume ─────
    nav.get_by_role('button', name='Browser', exact=True).click()
    page.locator('.cxs-row', has_text='Website-Einstellungen').get_by_role('button', name='Verwalten').click()
    page.get_by_role('button', name='Standort').click()
    expect(page.locator('.cxs-crumb.current')).to_have_text('Standort')
    page.locator('.cxs-crumbs').get_by_role('button', name='Zurück').click()
    expect(page.locator('.cxs-crumb.current')).to_have_text('Website-Einstellungen')
    page.locator('.cxs-crumbs').get_by_role('button', name='Browser', exact=True).click()
    expect(page.locator('.cxs-crumbs')).to_have_count(0)

    # ── Archiv: archiviertes Projekt zurückholen ─────────────────────────────
    nav.get_by_role('button', name='Archivierte Chats und Projekte', exact=True).click()
    group = page.locator('.cxs-archive-group', has_text='Exokortex')
    expect(group).to_be_visible()
    group.get_by_role('button', name='Dearchivieren').first.click()
    expect(page.locator('.cxs-archive-group')).to_have_count(0)
    assert page.evaluate("localStorage.getItem('cortex.archivedProjects')") == '[]'

    # ── Composer: „⌘ Enter“ macht die Eingabetaste zum Zeilenumbruch ────────
    nav.get_by_role('button', name='Allgemein', exact=True).click()
    page.get_by_role('button', name='Tastenkürzel zum Senden').click()
    page.get_by_role('option', name='⌘ Enter').click()
    page.get_by_role('button', name='Zurück zur App').click()
    box = page.locator('.composer textarea')
    box.fill('Erst eine Zeile')
    box.press('Enter')
    assert not any(m.get('kind') == 'send' for m in page.evaluate('window.__sent')), 'Enter hat trotz ⌘-Enter-Einstellung gesendet.'
    box.press('Meta+Enter')
    assert any(m.get('kind') == 'send' for m in page.evaluate('window.__sent')), '⌘ Enter hat nicht gesendet.'

    assert not errors, errors
    print('Einstellungen: bestanden.', {k: round(v, 1) for k, v in measured.items()})
