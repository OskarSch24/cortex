"""Standort als Kontext: Plus › Standort (Maps), Adresse suchen, Treffer wählen,
Karte mit Radiuskreis, Radius ändern, übernehmen → Chip am Chat und
setChatLocation an den Host; „Mein Standort“ fragt die Ortung und benennt die
Koordinaten; Entfernen schickt null.

Die Host-Antworten (Adresssuche, Karte) kommen aus einer vorher echt bei
OpenStreetMap geholten Karte: /private/tmp/cortex-map-fixture.json
(erzeugt über src/location/geo.ts › mapView). Ohne sie ein graues Feld.
"""
import json
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

SHOTS = Path(__file__).resolve().parents[1] / 'docs' / 'screenshots' / 'standort'
MAP = Path('/private/tmp/cortex-map-fixture.json')
MAP_DATA = json.loads(MAP.read_text()) if MAP.exists() else {'zoom': 15, 'tiles': [], 'radiusPx': 60, 'attribution': '© OpenStreetMap-Mitwirkende'}


def host(page, kind):
    return page.evaluate('(kind) => (window.__hostMessages || []).filter(m => m.kind === kind)', kind)


with headless_browser() as browser:
    # Ohne Ortungsfreigabe für den Browser: „Mein Standort“ darf nicht davon abhängen.
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:4173/dev/preview.html?mode=agent&scenario=conversation')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(node) => node.remove()')
    # Der Host antwortet auf Suche, Rückwärtssuche und Karte wie im echten Cortex.
    page.evaluate("""(map) => window.addEventListener('preview:host', event => {
      const m = event.detail;
      const reply = data => setTimeout(() => window.dispatchEvent(new MessageEvent('message', { data: { kind: 'geoResult', reqId: m.reqId, ...data } })), 60);
      if (m.kind === 'geoSearch') reply({ places: [
        { label: 'Berger Straße 12, Frankfurt-Bornheim', lat: 50.1236, lon: 8.7076 },
        { label: 'Berger Straße, Nordend', lat: 50.1250, lon: 8.7000 },
      ] });
      if (m.kind === 'geoReverse') reply({ label: 'Berger Straße 12, Frankfurt-Bornheim' });
      if (m.kind === 'geoLocate') reply(window.__locateFails
        ? { error: 'macOS hat Cortex den Standort nicht freigegeben. Erlaube ihn unter Systemeinstellungen.' }
        : { position: { lat: 50.1236, lon: 8.7076, accuracy: 35, label: 'Berger Straße 12, Frankfurt-Bornheim' } });
      if (m.kind === 'geoMap') reply({ map });
    })""", MAP_DATA)

    # Plus › Standort (Maps) öffnet die Kachel über dem Eingabefeld.
    page.get_by_role('button', name='Hinzufügen', exact=True).click()
    page.get_by_role('menuitem', name='Standort (Maps)').click()
    card = page.get_by_role('region', name='Standort als Kontext')
    expect(card).to_be_visible()
    field = card.get_by_role('textbox', name='Adresse suchen')
    expect(field).to_be_focused()

    field.fill('Berger Straße 12 Frankfurt')
    field.press('Enter')
    assert host(page, 'geoSearch')[-1]['query'] == 'Berger Straße 12 Frankfurt'
    card.get_by_role('button', name='Berger Straße 12, Frankfurt-Bornheim').click()
    expect(card.locator('.cx-loc-map img').first).to_be_visible()
    expect(card.get_by_text('1 km', exact=True)).to_be_visible()
    ring = card.locator('.cx-loc-ring').bounding_box()
    assert abs(ring['width'] - 2 * MAP_DATA['radiusPx']) < 2, ring

    # Radius: 2 km — die Karte wird neu angefragt.
    before = len(host(page, 'geoMap'))
    card.get_by_role('slider', name='Radius').press('ArrowRight')
    expect(card.get_by_text('2 km', exact=True)).to_be_visible()
    page.wait_for_function('(n) => (window.__hostMessages || []).filter(m => m.kind === "geoMap").length > n', arg=before)
    assert host(page, 'geoMap')[-1]['radiusKm'] == 2
    SHOTS.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(SHOTS / 'cortex-standort-kachel.png'))

    card.get_by_role('button', name='Übernehmen').click()
    saved = host(page, 'setChatLocation')[-1]
    assert saved['conversationId'] == 'site' and saved['location'] == {'lat': 50.1236, 'lon': 8.7076, 'label': 'Berger Straße 12, Frankfurt-Bornheim', 'source': 'address', 'radiusKm': 2}, saved
    chip = page.locator('.cx-loc-chip')
    expect(chip).to_contain_text('Berger Straße 12, Frankfurt-Bornheim')
    expect(chip).to_contain_text('Adresse · Radius 2 km')
    # Kleine Karte mit Kreis am Chip, angefragt in ihrer eigenen Größe.
    expect(chip.locator('.cx-loc-map.compact img').first).to_be_visible()
    expect(chip.locator('.cx-loc-ring')).to_be_visible()
    small = [m for m in host(page, 'geoMap') if m.get('height') == 96]
    assert small and small[-1]['radiusKm'] == 2, host(page, 'geoMap')[-1]
    page.screenshot(path=str(SHOTS / 'cortex-standort-chip.png'), clip={'x': 250, 'y': 760, 'width': 1190, 'height': 240})

    # Chip öffnet die Kachel wieder; „Mein Standort“ fragt die Ortung und benennt sie.
    chip.locator('.cx-loc-chip-main').click()
    card.get_by_role('button', name='Mein Standort').click()
    # Geortet wird im Host (CoreLocation), nicht über navigator.geolocation der Webview.
    page.wait_for_function("() => (window.__hostMessages || []).some(m => m.kind === 'geoLocate')")
    expect(card.get_by_text('± 35 m', exact=False).or_(card.get_by_text('±35 m', exact=False))).to_be_visible()
    card.get_by_role('button', name='Übernehmen').click()
    assert host(page, 'setChatLocation')[-1]['location']['source'] == 'device'

    # Entfernen: der Host erfährt null, der Chip verschwindet.
    page.get_by_role('button', name='Standort entfernen').click()
    assert host(page, 'setChatLocation')[-1]['location'] is None
    expect(chip).to_have_count(0)

    # Ein Chatwechsel bringt den Standort des anderen Chats (vom Host).
    page.evaluate("() => window.dispatchEvent(new MessageEvent('message', { data: { kind: 'chatLocation', conversationId: 'site', location: { lat: 48.137, lon: 11.575, label: 'Marienplatz, München', radiusKm: 0.5, source: 'address' } } }))")
    expect(chip).to_contain_text('Marienplatz, München')
    expect(chip).to_contain_text('Radius 500 m')

    # Scheitert die Ortung, steht der Grund in der Kachel, und der alte Standort bleibt.
    page.evaluate('() => { window.__locateFails = true; }')
    chip.locator('.cx-loc-chip-main').click()
    card.get_by_role('button', name='Mein Standort').click()
    expect(card.get_by_role('alert')).to_contain_text('nicht freigegeben')
    expect(card.locator('.cx-loc-label')).to_contain_text('Marienplatz, München')
    page.screenshot(path=str(SHOTS / 'cortex-standort-fehler.png'), clip={'x': 250, 'y': 560, 'width': 1190, 'height': 440})

    assert not errors, errors
    print('cortex_location_ui: ok')
