"""Exokortex-Seite im Branddesign der Einstellungen.

Der Vorschau-Server auf 4173 startet von selbst (headless_browser.preview_server).
Dann:  python3 tests/cortex_exokortex_ui.py
"""
import sys

from headless_browser import headless_browser

BASE = 'http://127.0.0.1:4173/dev/preview.html?mode=agent'


def check(cond, message):
    if not cond:
        raise AssertionError(message)


with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE)
    page.wait_for_timeout(1200)
    page.locator('.cx-nav', has_text='Exokortex').first.click()
    page.wait_for_timeout(600)

    # Dieselbe Spalte und derselbe Kopf wie die Einstellungen.
    col = page.locator('.cx-exo .cxs-page').bounding_box()
    check(abs(col['width'] - 768) < 1, f'Spalte {col["width"]} statt 768')
    h1 = page.locator('.cx-exo .cxs-page-head h1')
    check(h1.inner_text() == 'Exokortex', 'Titel fehlt')
    check(h1.evaluate('e => getComputedStyle(e).fontSize') == '24px', 'Titel nicht 24 px')
    check('Vault-Projektion' in page.locator('.cx-exo-satz').inner_text(), 'Satz unter dem Titel nennt den Befund nicht')
    check(page.locator('.cx-exo .cxs-page-actions .cxs-button.primary').inner_text() == 'Prüfen', 'Prüfen ist nicht der Hauptknopf')

    # Keine eigene Designsprache mehr: keine Monospace-Beschriftung, keine Tastenkästchen.
    mono = page.evaluate("""() => [...document.querySelectorAll('.cx-exo *')]
      .filter(e => e.childElementCount === 0 && e.textContent.trim() && !e.closest('pre'))
      .filter(e => /mono|menlo/i.test(getComputedStyle(e).fontFamily)).map(e => e.textContent.trim()).slice(0, 5)""")
    check(not mono, f'Monospace ausserhalb der Ausgabe: {mono}')
    check(page.locator('.cx-exo .taste').count() == 0, 'Tastenkästchen an den Reitern')

    # Überblick: Befund als Zeile mit Status, stille Prüfungen als Punkte.
    check(page.locator('.cx-exo .cxs-row', has_text='Vault-Projektion').locator('.cxs-status.warn').count() == 1, 'Warnung ohne Statuspunkt')
    check(page.locator('.cx-exo-still .cxs-status').count() == 10, 'Stille Prüfungen fehlen')
    check('Stündlicher Lauf' in page.locator('.cx-exo-still').inner_text(), 'Umlaute aus status.py nicht lesbar')
    row = page.locator('.cx-exo .cxs-row', has_text='Offene Entscheidungen').bounding_box()
    check(abs(row['height'] - 60.5) < 1, f'Zeilenhöhe {row["height"]} statt 60,5')

    # Reiter wechseln; Zahlen deutsch formatiert.
    page.locator('.cxs-tabs button', has_text='Bestand').click()
    page.wait_for_timeout(250)
    check(page.locator('.cx-exo .cxs-section-head h2', has_text='Kanten nach Art').count() == 1, 'Bestand fehlt')
    check('GEHÖRT_ZU' in page.locator('.cx-exo').inner_text(), 'Kantenname nicht lesbar')
    page.locator('.cxs-tabs button', has_text='Läufe').click()
    page.wait_for_timeout(250)
    check('128.654/128.699' in page.locator('.cx-exo').inner_text(), 'Messwert nicht deutsch formatiert')
    check(page.locator('.cx-exo .cxs-status.bad', has_text='exit 1').count() == 1, 'Fehlgeschlagener Lauf nicht rot')
    kompakt = page.locator('.cx-exo .cx-exo-row').first.bounding_box()
    check(kompakt['height'] < 50, f'Laufzeile {kompakt["height"]} hoch')

    # Galaxie nimmt die volle Breite unter Kopf und Reitern.
    page.locator('.cxs-tabs button', has_text='Galaxie').click()
    page.wait_for_timeout(250)
    gal = page.locator('.cx-exo-galaxie').bounding_box()
    main = page.locator('.cx-exo').bounding_box()
    check(abs(gal['width'] - main['width']) < 1, 'Galaxie nicht volle Breite')

    # Eine laufende Aktion: Karte mit Ausgabe, andere Knöpfe gesperrt.
    for line in ['Abnahme der Chat-Quelle', 'Chats aufgenommen 1/1']:
        page.evaluate("l => window.postMessage({kind:'exokortexAktion', action:'chatsEinspeisen', state:'running', output:l}, '*')", line)
    page.locator('.cxs-tabs button', has_text='Suchen').click()
    page.wait_for_timeout(250)
    check('Einspeisung läuft' in page.locator('.cx-exo-lauf').inner_text(), 'Laufkarte fehlt')
    check('Chats aufgenommen' in page.locator('.cx-exo-ausgabe').inner_text(), 'Ausgabe fehlt')
    check(page.locator('.cxs-page-actions button', has_text='Nachmessen').is_disabled(), 'Nachmessen während des Laufs frei')
    page.evaluate("() => window.postMessage({kind:'exokortexAktion', action:'chatsEinspeisen', state:'done', output:'fertig'}, '*')")
    page.wait_for_timeout(200)
    check('Einspeisung fertig' in page.locator('.cx-exo-lauf').inner_text(), 'Abschluss nicht gemeldet')

    # Schmal: nichts läuft seitlich über.
    page.set_viewport_size({'width': 900, 'height': 900})
    page.wait_for_timeout(250)
    over = page.evaluate("(() => { const s = document.querySelector('.cx-exo .cxs-scroll'); return s.scrollWidth - s.clientWidth; })()")
    check(over <= 0, f'{over} px seitlicher Überlauf')

    check(not errors, f'Fehler im Webview: {errors}')
    print('Exokortex-UI: bestanden.')
    sys.exit(0)
