"""Archivierte Projekte in der Seitenleiste.

Archivieren blendet ein Projekt nur aus der Liste „Projekte“ aus und legt es
in das Feld über den Konten. Nichts geht an den Host, nichts wird geschlossen;
der Zustand überlebt ein Neuladen der Webview.

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

with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 950}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.evaluate("localStorage.removeItem('cortex.archivedProjects')")
    page.reload()
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e) => e.remove()')

    tree = page.locator('.cx-rail-tree')
    archive = page.locator('.cx-archive')
    toggle = page.locator('.cx-archive-toggle')

    # ── Der Knopf steht direkt über den Konten ───────────────────────────────
    expect(toggle).to_be_visible()
    expect(toggle).to_have_text('Archivierte Projekte')
    bottom = page.locator('.cx-sidebar-bottom')
    assert bottom.locator(':scope > *').first.evaluate("e => e.classList.contains('cx-archive')"), \
        'Das Archivfeld sitzt vor der Kontozeile.'
    t = toggle.bounding_box(); a = page.locator('.cx-account-summary').bounding_box()
    assert t['y'] + t['height'] <= a['y'] + 1, 'Archiv liegt über den Konten.'

    toggle.click()
    expect(archive).to_have_class('cx-archive open')
    expect(page.locator('.cx-archive-empty')).to_be_visible()
    toggle.click()

    # ── Archivieren über das Kärtchen ────────────────────────────────────────
    name = tree.locator('.cx-tree-node .cx-tree-open span').first.inner_text()
    before = tree.locator('.cx-tree-node').count()
    row = tree.locator('.cx-tree-row').first
    row.hover()
    card = page.locator('.cx-tree-card')
    expect(card).to_be_visible()
    card.get_by_role('button', name='Archivieren').click()

    expect(tree.locator('.cx-tree-open span', has_text=name)).to_have_count(0)
    assert tree.locator('.cx-tree-node').count() == before - 1
    expect(toggle.locator('.cx-count')).to_have_text('1')

    toggle.click()
    inside = archive.locator('.cx-tree-open span', has_text=name)
    expect(inside).to_be_visible()
    page.mouse.move(700, 400)
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / 'cortex-archiv.png'), clip={'x': 0, 'y': 450, 'width': 300, 'height': 500})

    # ── Überlebt ein Neuladen ────────────────────────────────────────────────
    page.reload()
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e) => e.remove()')
    expect(page.locator('.cx-rail-tree .cx-tree-open span', has_text=name)).to_have_count(0)
    expect(page.locator('.cx-archive-toggle .cx-count')).to_have_text('1')

    # ── Zurückholen ──────────────────────────────────────────────────────────
    page.locator('.cx-archive-toggle').click()
    page.get_by_role('button', name=f'{name} aus dem Archiv holen').click()
    expect(page.locator('.cx-rail-tree .cx-tree-open span', has_text=name)).to_have_count(1)
    expect(page.locator('.cx-archive-toggle .cx-count')).to_have_count(0)
    assert page.evaluate("localStorage.getItem('cortex.archivedProjects')") == '[]'

    assert not errors, errors
    print('Archivierte Projekte: ok')
