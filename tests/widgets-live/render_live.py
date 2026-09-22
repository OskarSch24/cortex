"""Die echten Claude-Antworten durch den echten Chat-Renderer schicken: wird jede Karte gezeichnet?

Der Vorschau-Server auf 4173 startet von selbst (headless_browser.preview_server).
Vorher: dev/widget-live.json aus tests/widgets-live/results.json erzeugen (siehe report).
"""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from headless_browser import headless_browser

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / 'docs/screenshots/widgets-live'
SHOTS.mkdir(parents=True, exist_ok=True)
live = json.loads((ROOT / 'engine/packages/vscode/dev/widget-live.json').read_text())
report = {}
with headless_browser() as browser:
    for item in live:
        page = browser.new_page(viewport={'width': 1440, 'height': 950}, device_scale_factor=2)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        page.goto(f"http://127.0.0.1:4173/dev/preview.html?mode=agent&scenario=widgets&samples=live&widget={item['type']}")
        page.wait_for_load_state('networkidle')
        page.locator('#harness').evaluate('(e)=>e.remove()')
        page.add_style_tag(content='.cx-jump{display:none!important}.cx-transcript-scroll{-webkit-mask-image:none!important;mask-image:none!important}')
        page.wait_for_timeout(400)
        cards = page.locator('section.cx-w').count()
        fallbacks = page.locator('.cx-code-card .cx-change-sub').all_inner_texts()
        overflow = page.evaluate('document.documentElement.scrollWidth > innerWidth')
        if cards:
            card = page.locator('section.cx-w').first
            card.evaluate('e => e.scrollIntoView({ block: "center" })')
            card.screenshot(path=str(SHOTS / f"{item['type']}.png"))
        report[item['type']] = {'cards': cards, 'fallbacks': fallbacks, 'errors': errors[:3], 'overflow': overflow}
        print(item['type'], report[item['type']], flush=True)
        page.close()
(ROOT / 'tests/widgets-live/render.json').write_text(json.dumps(report, ensure_ascii=False, indent=1))
