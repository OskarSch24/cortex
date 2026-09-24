"""OpenRouter: API-Schlüssel hinterlegen, Modelle fürs Menü wählen, im Chat auswählen.

Prüft in der Vorschau (Host-Attrappe in dev/cortex-fixture.js):
  1. Einstellungen → Konto zeigt OpenRouter als vierten Anbieter.
  2. Der Verbinden-Dialog fragt nach Schlüssel statt Browser-Anmeldung;
     ein falscher Schlüssel wird abgewiesen, ein richtiger verbunden.
  3. Die Kontodetails listen die Modelle im Modellmenü; Suchen/Hinzufügen/Entfernen.
  4. Das Modellmenü im Chat bietet die OpenRouter-Modelle an („nur Antworten“).
  5. Ein Standardmodell lässt sich in den Kontodetails wählen.
  6. Ein Agent kann OpenRouter nutzen und sein eigenes Modell wählen.

Voraussetzung:
  python3 -m http.server 4173 --bind 127.0.0.1 --directory engine/packages/vscode

Kein Desktop-Browser: ausschließlich chromium-headless-shell über
`tests/headless_browser.py`, wie in AGENTS.md festgelegt.
"""
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser
from cortex_agents_nav import to_overview

SHOTS = Path(__file__).resolve().parents[1] / 'docs/screenshots'
SHOTS.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:4173/dev/preview.html?mode=agent'


def sent(page, kind):
    return page.evaluate(f"(window.__hostMessages || []).filter(m => m.kind === '{kind}')")


with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 950}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))

    # ── 1–2: Schlüssel hinterlegen ────────────────────────────────────────────
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e) => e.remove()')
    page.locator('.cx-settings-btn').click()
    page.locator('.cxs-nav').get_by_role('button', name='Konto', exact=True).click()
    card = page.locator('.cx-provider-card', has_text='OpenRouter')
    expect(card).to_be_visible()
    expect(page.locator('.cx-provider-card')).to_have_count(4)
    card.get_by_role('button').click()

    dialog = page.locator('.cx-connect-dialog')
    expect(dialog).to_be_visible()
    key = dialog.locator('input[type="password"]')
    expect(key).to_be_visible()
    expect(dialog.locator('input[type="email"]')).to_have_count(0)
    submit = dialog.get_by_role('button', name='Schlüssel prüfen und speichern')
    expect(submit).to_be_disabled()
    page.screenshot(path=str(SHOTS / 'openrouter-dialog.png'))

    key.fill('falsch-123')
    submit.click()
    expect(dialog.locator('.cx-connection-feedback.error')).to_contain_text('sk-or-')
    # Der Schlüssel wird nach dem Absenden sofort aus dem Feld genommen.
    expect(key).to_have_value('')

    key.fill('sk-or-v1-testschluessel')
    dialog.get_by_role('button', name='Schlüssel prüfen und speichern').click()
    expect(dialog.locator('.cx-connection-feedback.connected')).to_contain_text('verbunden')
    msg = sent(page, 'addApiKeyAccount')[-1]
    assert msg['provider'] == 'openrouter' and msg['key'] == 'sk-or-v1-testschluessel', msg
    dialog.get_by_role('button', name='Fertig').click()
    record = page.locator('.cx-account-record', has_text='OpenRouter')
    expect(record).to_have_count(1)
    expect(record).to_contain_text('Verbunden')

    # ── 3: Modelle im Modellmenü ──────────────────────────────────────────────
    record.locator('.cx-account-identity').click()
    models = record.locator('.cx-or-models')
    expect(models).to_be_visible()
    expect(record.get_by_role('button', name='Schlüssel ersetzen')).to_be_visible()
    rows = models.locator('.cx-or-list:not(.hits):not(.cx-or-default) > li')
    expect(rows).to_have_count(3)
    expect(rows.first).to_contain_text('$ je Mio. Token')
    search = models.locator('.cx-or-search input')
    search.fill('kimi')
    hits = models.locator('.cx-or-list.hits > li')
    expect(hits).to_have_count(1)
    hits.first.get_by_role('button').click()
    expect(rows).to_have_count(4)
    assert sent(page, 'setOpenRouterFavorites')[-1]['ids'][-1] == 'moonshotai/kimi-k3'
    rows.nth(1).get_by_role('button').click()
    expect(rows).to_have_count(3)
    assert 'openai/gpt-5.6-terra' not in sent(page, 'setOpenRouterFavorites')[-1]['ids']

    # ── 5: Standardmodell ─────────────────────────────────────────────────────
    expect(record.locator('.cx-brand-tile.openrouter svg path')).to_have_count(1)
    default = models.get_by_label('Standardmodell für OpenRouter')
    expect(default).to_have_value('')
    default.select_option(label='Claude Opus 5')
    assert sent(page, 'setOpenRouterDefault')[-1]['id'] == 'anthropic/claude-opus-5'
    expect(rows.first.locator('.cx-or-tag')).to_contain_text('Standard')
    record.scroll_into_view_if_needed()
    record.screenshot(path=str(SHOTS / 'openrouter-konto.png'))

    # ── 4: Modellmenü im Chat ─────────────────────────────────────────────────
    page.goto(BASE + '&scenario=conversation&openrouter=1')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e) => e.remove()')
    page.locator('.model-btn').click()
    page.locator('.cx-rz-title').click()
    group = page.locator('.cx-rz-group', has_text='OpenRouter')
    expect(group).to_have_count(1)
    expect(group.locator('.cx-rz-quota')).to_have_text('nur Antworten')
    expect(group.locator('.cx-rz-row', has_text='Claude Opus 5')).to_be_visible()
    group.scroll_into_view_if_needed()
    page.locator('.cx-rz-menu').screenshot(path=str(SHOTS / 'openrouter-modellmenue.png'))
    group.locator('.cx-rz-row', has_text='GPT-5.6 Terra').click()
    expect(page.locator('.model-btn .model-label')).to_have_text('GPT-5.6 Terra')


    # ── 6: Agent mit OpenRouter ───────────────────────────────────────────────
    page.goto('http://127.0.0.1:4173/dev/preview.html?mode=agent&page=agents&teams=empty&openrouter=1')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e) => e.remove()')
    to_overview(page)
    page.get_by_role('button', name='Agent erstellen', exact=True).click()
    page.get_by_role('region', name='Agentenvorlagen', exact=True).locator('.cx-agent-starter').filter(has=page.get_by_text('Code-Review', exact=True)).click()
    page.get_by_role('button', name='Konto des Agenten', exact=True).click()
    page.get_by_role('option', name='OpenRouter · privat', exact=True).click()
    page.get_by_role('button', name='Modell des Agenten', exact=True).click()
    expect(page.get_by_role('option', name='Standardmodell (Claude Opus 5)', exact=True)).to_be_visible()
    page.get_by_role('option', name='GPT-5.6 Terra', exact=True).click()
    expect(page.get_by_role('button', name='Modell des Agenten', exact=True)).to_contain_text('GPT-5.6 Terra')
    expect(page.locator('.cx-team-inline-note', has_text='ohne Werkzeuge')).to_be_visible()
    page.screenshot(path=str(SHOTS / 'openrouter-agent.png'))

    assert not errors, errors
    print('OpenRouter-Abnahme: alle Schritte bestanden')
