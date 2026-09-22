"""Einstellungen › Personalisierung › Cortex-Erinnerung: Maße und Wirkung.

Die Zeilen folgen denselben Codex-Maßen wie der Rest der Einstellungen
(Zeile 60,5 px, Schalter 32 × 20, Auswahl 28 hoch, Spalte 768 breit). Geprüft
wird außerdem, dass jede Steuerung wirklich beim Host ankommt.

Voraussetzung:
  python3 -m http.server 4173 --bind 127.0.0.1 --directory engine/packages/vscode

Kein Desktop-Browser: ausschließlich chromium-headless-shell.
"""
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

BASE = 'http://127.0.0.1:4173/dev/preview.html?mode=agent'
OUT = Path(__file__).resolve().parents[1] / 'docs/screenshots'
OUT.mkdir(parents=True, exist_ok=True)
HOST_LOG = """() => { window.__sent = []; window.addEventListener('preview:host', e => window.__sent.push(e.detail)); }"""


def gesendet(page, kind, **felder):
    return any(m.get('kind') == kind and all(m.get(k) == v for k, v in felder.items()) for m in page.evaluate('window.__sent'))


with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1710, 'height': 1072}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e) => e.remove()')
    page.evaluate(HOST_LOG)

    page.locator('.cx-nav', has_text='Einstellungen').click()
    nav = page.locator('.cxs-nav')
    nav.locator('.cxs-nav-search input').fill('Erinnerung')
    expect(nav.locator('.cxs-nav-item')).to_have_text(['Personalisierung'])
    nav.locator('.cxs-nav-item').click()
    nav.locator('.cxs-nav-search input').fill('')
    expect(page.locator('.cxs-page-head h1')).to_have_text('Personalisierung')

    abschnitt = page.locator('.cxs-section', has=page.locator('h2', has_text='Cortex-Erinnerung'))
    abschnitt.scroll_into_view_if_needed()
    expect(abschnitt).to_be_visible()
    # Keine Vorschau-Ringe mehr: jede Zeile wirkt.
    expect(abschnitt.locator('.cxs-row.pending')).to_have_count(0)

    mass = abschnitt.evaluate("""(s) => {
      const card = s.querySelector('.cxs-card').getBoundingClientRect();
      const rows = [...s.querySelectorAll('.cxs-row')].map(r => r.getBoundingClientRect().height);
      const t = s.querySelector('.cxs-toggle').getBoundingClientRect();
      const sel = s.querySelector('.cxs-select-button').getBoundingClientRect();
      return { spalte: card.width, zeilen: rows, schalterB: t.width, schalterH: t.height, auswahlH: sel.height };
    }""")
    assert abs(mass['spalte'] - 768) <= 1, mass
    assert len(mass['zeilen']) == 6, mass
    assert all(abs(h - 60.5) <= 1 for h in mass['zeilen'][1:]), f'Zeilenhöhen: {mass["zeilen"]}'
    assert abs(mass['schalterB'] - 32) <= 1 and abs(mass['schalterH'] - 20) <= 1, mass
    assert abs(mass['auswahlH'] - 28) <= 1, mass

    # ── Wirkung: Schalter, Auswahl, Zahl ─────────────────────────────────────
    notiz = page.get_by_role('switch', name='Notizzettel')
    expect(notiz).to_have_attribute('aria-checked', 'true')
    notiz.click()
    assert gesendet(page, 'setNativeSetting', key='cortex.memory.notes', value=False), 'Notizzettel-Schalter ging nicht an den Host.'
    notiz.click()

    page.get_by_role('button', name='Exokortex-Abruf').click()
    page.get_by_role('option', name='Jede Nachricht').click()
    assert gesendet(page, 'setNativeSetting', key='cortex.memory.retrieval', value='jede'), 'Abrufmodus ging nicht an den Host.'

    treffer = page.get_by_label('Treffer', exact=True)
    treffer.fill('42')
    treffer.press('Enter')
    assert gesendet(page, 'setNativeSetting', key='cortex.memory.hits', value=10), 'Treffer wurde nicht auf 10 begrenzt.'

    # ── Suchbereiche ─────────────────────────────────────────────────────────
    bereiche = page.locator('.cxs-section', has=page.locator('h2', has_text='Suchbereiche'))
    expect(bereiche.get_by_label('Name des Bereichs').first).to_have_value('Frühere Chats')
    projekte = bereiche.get_by_label('Exokortex-Projekte').nth(1)
    expect(projekte).to_have_value('proj_nordwind')
    projekte.fill('proj_nordwind, proj_cortex_chats')
    projekte.blur()
    assert any(m.get('kind') == 'setAppSetting' and m.get('key') == 'erinnerung.bereiche'
               and m['value'][1]['projekte'] == ['proj_nordwind', 'proj_cortex_chats'] for m in page.evaluate('window.__sent')), \
        'Suchbereich ging nicht an den Host.'

    # ── Prompt: bearbeiten, speichern, zurücksetzen ──────────────────────────
    prompt = page.locator('.cxs-section', has=page.locator('h2', has_text='Prompt: Notizzettel'))
    feld = prompt.get_by_label('Prompt: Notizzettel')
    expect(feld).to_have_value(__import__('re').compile(r'^Du führst den Notizzettel'))
    speichern = prompt.get_by_role('button', name='Speichern')
    expect(speichern).to_be_disabled()
    feld.fill('Nur Entscheidungen festhalten.')
    expect(speichern).to_be_enabled()
    speichern.click()
    assert gesendet(page, 'setAppSetting', key='erinnerung.prompt.notizen', value='Nur Entscheidungen festhalten.')
    prompt.get_by_role('button', name='Zurücksetzen').click()
    expect(feld).to_have_value(__import__('re').compile(r'^Du führst den Notizzettel'))

    abschnitt.scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / 'settings-erinnerung.png'))
    assert not errors, errors
    print('Erinnerung: Maße und Wirkung ok')
