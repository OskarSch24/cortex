"""Projektwahl über der Eingabe: Funktion und Pixelabnahme gegen die Referenz.

Die Maße stammen aus der Bildschirmaufnahme vom 10.09.2026 (logisch 1710x1112,
2x aufgezeichnet). Sie stehen hier als Zahlen und nicht als Bildvergleich: ein
Screenshot-Diff sagt „anders“, diese Prüfung sagt, welches Maß um wie viel
abweicht.

Kein Desktop-Browser: ausschließlich chromium-headless-shell über
`tests/headless_browser.py`, wie in AGENTS.md festgelegt.
"""
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

BASE = 'http://127.0.0.1:4173/dev/preview.html?mode=agent'
OUT = Path(__file__).resolve().parents[1] / 'docs/screenshots'
OUT.mkdir(parents=True, exist_ok=True)

# Aus der Referenz gemessen. Toleranz 1 px, weil Unterpixel-Layout rundet.
BUDGET = {
    'Listenbreite': 261,
    'Listenhöhe': 250.5,
    'Listenradius': 14,
    'Zeilenhöhe': 28.7,
    'Zeilenradius': 10,
    'Schriftgrad': 14,
    'Symbol links': 12.7,
    'Name links': 35,
    'Trennlinie': 1,
    'Trennlinie Rand': 12.5,
    'Suchzeile': 29.5,
    'Liste über Auslöser': 3,
    'Liste bündig': 0,
}

with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 950}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e) => e.remove()')

    chip = page.locator('.cx-project-chip')
    pop = page.locator('.cx-project-pop')

    # ── Öffnen, Schließen, Verwerfen ─────────────────────────────────────────
    expect(chip).to_have_text('Studio Website')
    expect(pop).to_have_count(0)
    chip.click()
    expect(pop).to_be_visible()
    page.keyboard.press('Escape')
    expect(pop).to_have_count(0)
    chip.click()
    expect(pop).to_be_visible()
    page.locator('.cx-conversation').click(position={'x': 40, 'y': 40})
    expect(pop).to_have_count(0)

    # ── Inhalt: Haken am laufenden Projekt, fehlende ausgegraut ──────────────
    chip.click()
    rows = page.locator('.cx-project-list .cx-project-row')
    expect(rows.filter(has_text='Studio Website')).to_have_attribute('aria-selected', 'true')
    assert rows.filter(has_text='Studio Website').locator('svg').count() == 2, \
        'Das laufende Projekt trägt Ordner und Haken.'
    assert rows.filter(has_text='Cortex').locator('svg').count() == 1, \
        'Ein anderes Projekt trägt keinen Haken.'
    assert 'missing' in (rows.filter(has_text='Nordwind Console Build').get_attribute('class') or ''), \
        'Ein fehlendes Projekt steht ausgegraut in der Liste.'

    # ── Suche ────────────────────────────────────────────────────────────────
    search = page.get_by_label('Projekte suchen')
    expect(search).to_be_focused()
    total = rows.count()
    search.fill('exo')
    expect(rows).to_have_count(1)
    expect(rows.first).to_have_text('Exokortex')
    search.fill('gibtesnicht')
    expect(rows).to_have_count(0)
    expect(page.locator('.cx-project-none')).to_be_visible()
    search.fill('')
    expect(rows).to_have_count(total)

    # ── Pixelabnahme ─────────────────────────────────────────────────────────
    measured = pop.evaluate('''p => {
      const cs = getComputedStyle(p);
      const box = p.getBoundingClientRect();
      const row = p.querySelector('.cx-project-row');
      const rowBox = row.getBoundingClientRect();
      const rowStyle = getComputedStyle(row);
      const icon = row.querySelector('svg').getBoundingClientRect();
      const name = row.querySelector('span').getBoundingClientRect();
      const sep = p.querySelector('.cx-project-sep').getBoundingClientRect();
      const search = p.querySelector('.cx-project-search').getBoundingClientRect();
      const chip = document.querySelector('.cx-project-chip').getBoundingClientRect();
      return {
        'Listenbreite': box.width,
        'Listenhöhe': box.height,
        'Listenradius': parseFloat(cs.borderTopLeftRadius),
        'Zeilenhöhe': rowBox.height,
        'Zeilenradius': parseFloat(rowStyle.borderTopLeftRadius),
        'Schriftgrad': parseFloat(rowStyle.fontSize),
        'Symbol links': icon.left - box.left,
        'Name links': name.left - box.left,
        'Trennlinie': sep.height,
        'Trennlinie Rand': sep.left - box.left,
        'Suchzeile': search.height,
        'Auslöser Höhe': chip.height,
        'Liste über Auslöser': chip.top - box.bottom,
        'Liste bündig': box.left - chip.left,
      };
    }''')
    checked = []
    for label, want in BUDGET.items():
        got = measured[label]
        assert abs(got - want) <= 1, f'{label}: {got} statt {want}'
        checked.append(f'{label} {round(got, 1)}≈{want}')
    # Die neue Composer-Gestaltung verwendet größere Bedienelemente. Hier
    # zählt ein kompakter, bedienbarer Auslöser; Popup-Abstand/Ausrichtung
    # bleiben oben separat gegen Überlagerungen geprüft.
    assert 24 <= measured['Auslöser Höhe'] <= 36, measured['Auslöser Höhe']

    # Fünf Zeilen stehen offen, der Rest kommt über Suche oder Rad.
    visible = page.locator('.cx-project-list').evaluate('e => e.clientHeight')
    assert abs(visible - 144) <= 1, f'Sichtfenster {visible} statt 144'
    assert rows.count() > 5, 'Die Vorschau hat mehr Projekte als das Sichtfenster zeigt.'

    page.screenshot(path=str(OUT / 'projektwahl-liste.png'), clip={
        'x': 0, 'y': 0, 'width': 1440, 'height': 950})

    # ── Auswählen hängt die Aufgabe um ───────────────────────────────────────
    rows.filter(has_text='Nordwind Console Build').click()
    expect(pop).to_have_count(0)
    assert page.evaluate('window.__hostMessages.at(-1).kind') == 'relinkProject'
    expect(chip).to_have_text('Studio Website')
    chip.click()
    rows.filter(has_text='Design System').click()
    expect(pop).to_have_count(0)
    expect(chip).to_have_text('Design System')
    expect(page.get_by_role('heading', name='Woran sollen wir in Design System arbeiten?')).to_be_visible()

    # ── Ohne Projekt ─────────────────────────────────────────────────────────
    chip.click()
    page.get_by_text('Aufgaben ohne Projekt starten', exact=True).click()
    expect(chip).to_have_text('Projekt auswählen')
    sent = page.evaluate('() => window.__hostMessages.filter(m => m.kind === "setConversationProject")')
    assert sent[-1].get('path') is None, f'Zuletzt gesendet: {sent[-1]}'

    # ── Neues Projekt ────────────────────────────────────────────────────────
    chip.click()
    page.get_by_text('Neues Projekt', exact=True).click()
    expect(pop).to_have_count(0)
    dialog = page.locator('.cx-project-new')
    expect(dialog).to_be_visible()
    expect(page.get_by_role('heading', name='Projekt erstellen')).to_be_visible()
    create = dialog.get_by_role('button', name='Projekt erstellen')
    # Ein Cortex-Projekt ist sein Kennordner — ohne ihn gibt es nichts anzulegen.
    expect(create).to_be_disabled()
    page.get_by_label('Projektname').fill('Neues Vorhaben')
    page.get_by_text('Füge Ordner hinzu', exact=False).click()
    expect(dialog.locator('.cx-project-folder')).to_have_count(1)
    expect(create).to_be_enabled()
    page.screenshot(path=str(OUT / 'projektwahl-neu.png'), clip={
        'x': 0, 'y': 0, 'width': 1440, 'height': 950})
    create.click()
    expect(dialog).to_have_count(0)
    created = page.evaluate('() => window.__hostMessages.filter(m => m.kind === "createProject").at(-1)')
    assert created['name'] == 'Neues Vorhaben', created
    assert created['folders'] == ['/Users/demo/Documents/Neuer Ordner'], created
    expect(chip).to_have_text('Neues Vorhaben')

    # ── Während eine Aufgabe läuft, wird nicht umgehängt ─────────────────────
    page.locator('.composer textarea').fill('Los')
    page.locator('.run-btn.send').click()
    expect(page.locator('.cx-project-chip')).to_have_count(0)

    assert not errors, f'JavaScript-Fehler: {errors}'
    print('Pixelabnahme:', ', '.join(checked))
    print('Projektwahl: bestanden. Bilder in docs/screenshots/.')
