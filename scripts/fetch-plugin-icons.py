#!/usr/bin/env python3
"""Holt die Plugin-Logos in Farbe nach `media/plugins/icons/`.

Die Logos werden nicht von Hand gesammelt: das Skript löst jeden Katalogeintrag
gegen drei veröffentlichte Sammlungen auf und lädt die Datei. So bleibt
belegbar, woher jedes Zeichen stammt, und ein Update ist ein Skriptlauf.

    python3 scripts/fetch-plugin-icons.py            # nur fehlende holen
    python3 scripts/fetch-plugin-icons.py --alle     # alles neu holen

Reihenfolge der Quellen (die erste, die etwas hat, gewinnt):

1. `lobe-icons` (MIT) — `<name>-color.svg`, deckt KI-Dienste ab, die anderswo
   fehlen. Dieselbe Sammlung, aus der schon das Grok-Zeichen stammt.
2. `svgl` (MIT-Sammlung) — die breiteste Abdeckung für SaaS-Marken. Bei
   hell/dunkel-Paaren gilt die dunkle Variante: Cortex ist dunkel.
3. `vectorlogo.zone` — schließt die Lücken, die svgl lässt.

Für einen Dienst, den keine der drei führt, wird nichts geschrieben. Der Eintrag
zeigt dann seine Initiale. Ein selbst nachgezeichnetes Logo käme nicht in Frage:
es wäre eine Behauptung über eine fremde Marke, die niemand belegen kann.

Die Marken bleiben Eigentum ihrer Inhaber; sie stehen in Cortex ausschließlich,
um den jeweiligen Dienst erkennbar zu machen. Siehe `media/plugins/SOURCES.md`.
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PKG = ROOT / 'engine/packages/vscode'
CATALOG = PKG / 'media/plugins/catalog.json'
ICONS = PKG / 'media/plugins/icons'

SVGL_API = 'https://api.svgl.app'
LOBE_PKG = 'https://registry.npmjs.org/@lobehub/icons-static-svg'

# Wo der Katalogname nicht dem Sammlungsnamen entspricht.
SVGL_ALIAS = {
    'chrome-devtools': 'Chrome',
    'google-calendar': 'Google Calendar',
    'antv-chart': 'Ant Design',
    'filesystem': 'Model Context Protocol',
    'memory': 'Model Context Protocol',
    'sequential-thinking': 'Model Context Protocol',
}
LOBE_NAMES = {
    'exa': 'exa',
    'tavily': 'tavily',
    'zapier': 'zapier',
    'brave-search': 'brave',
    'perplexity': 'perplexity',
}
VLZ_SLUGS = {
    'wix': 'wix',
    'airtable': 'airtable',
    'elasticsearch': 'elastic',
    'hubspot': 'hubspot',
    'intercom': 'intercom',
    'aws-kb': 'amazon_aws',
    'monday': 'monday',
}
# Führt keine Sammlung das Zeichen, kommt es vom Hersteller selbst: aus seinem
# Repository oder aus dem Programm auf diesem Mac. Nachgezeichnet wird nie.
VENDOR_URLS = {
    # Das grüne App-Zeichen aus dem Context7-Repository von Upstash.
    'context7': 'https://raw.githubusercontent.com/upstash/context7/master/public/context7-icon-green.svg',
}
# Das App-Symbol aus dem Programmpaket — als PNG in eine SVG gehüllt, damit alle
# Logos dieselbe Dateiart haben.
APP_ICONS = {
    'xcode': '/Applications/Xcode.app/Contents/Resources/Xcode.icns',
}
# Selbst eingetragene Server tragen kein Markenzeichen — sie zeigen MCP.
GENERIC = ('mcp.svg', 'Model Context Protocol')


def norm(value: str) -> str:
    return re.sub(r'[^a-z0-9]', '', value.lower())


def get(url: str, timeout: int = 30) -> bytes:
    request = urllib.request.Request(url, headers={'User-Agent': 'cortex-icon-fetch'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def load_lobe() -> tuple[Path, tempfile.TemporaryDirectory]:
    meta = json.loads(get(LOBE_PKG, timeout=60))
    version = meta['dist-tags']['latest']
    tmp = tempfile.TemporaryDirectory()
    with tarfile.open(fileobj=io.BytesIO(get(meta['versions'][version]['dist']['tarball'], 180))) as tar:
        # `filter` gibt es erst ab Python 3.12; auf diesem Mac läuft 3.9.
        if sys.version_info >= (3, 12):
            tar.extractall(tmp.name, filter='data')
        else:
            tar.extractall(tmp.name)
    print(f'lobe-icons {version}')
    return Path(tmp.name) / 'package/icons', tmp


def main() -> int:
    refetch = '--alle' in sys.argv
    ICONS.mkdir(parents=True, exist_ok=True)
    entries = json.loads(CATALOG.read_text(encoding='utf-8'))['entries']

    svgl = json.loads(get(SVGL_API, timeout=60))
    index: dict[str, dict] = {}
    for item in svgl:
        index.setdefault(norm(item['title']), item)
    print(f'svgl: {len(svgl)} Marken')
    lobe_dir, lobe_tmp = load_lobe()

    written, kept, without = [], [], []
    for entry in entries:
        eid = entry['id']
        target = ICONS / (entry.get('icon') or f'{eid}.svg')
        if target.exists() and not refetch:
            kept.append(eid)
            continue
        data = resolve(eid, entry['name'], index, lobe_dir)
        if data is None:
            without.append(eid)
            continue
        target.write_bytes(data)
        written.append(eid)

    generic = ICONS / GENERIC[0]
    if not generic.exists() or refetch:
        item = index.get(norm(GENERIC[1]))
        if item:
            generic.write_bytes(get(route_of(item)))

    lobe_tmp.cleanup()
    print(f'neu geladen: {len(written)} · vorhanden: {len(kept)} · ohne Logo: {len(without)}')
    if without:
        # Kein Fehler: diese Einträge zeigen ihre Initiale.
        print('  ohne Logo (Initiale):', ', '.join(sorted(without)))
    return 0


def route_of(item: dict) -> str:
    route = item['route']
    # Hell/dunkel-Paare: Cortex ist dunkel, also die helle Zeichnung.
    return route if isinstance(route, str) else (route.get('dark') or route['light'])


def app_icon_svg(icns: str) -> bytes | None:
    import base64
    import subprocess
    if not Path(icns).exists():
        return None
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / 'icon.png'
        subprocess.run(['sips', '-s', 'format', 'png', '--resampleHeightWidth', '128', '128', icns, '--out', str(png)],
                       check=True, capture_output=True)
        data = base64.b64encode(png.read_bytes()).decode()
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">'
            f'<image width="128" height="128" href="data:image/png;base64,{data}"/></svg>\n').encode()


def resolve(eid: str, name: str, index: dict[str, dict], lobe_dir: Path) -> bytes | None:
    if eid in APP_ICONS:
        data = app_icon_svg(APP_ICONS[eid])
        if data:
            return data
    if eid in VENDOR_URLS:
        try:
            data = get(VENDOR_URLS[eid])
            if b'<svg' in data[:400]:
                return data
        except Exception:
            pass
    if eid in LOBE_NAMES:
        candidate = lobe_dir / f'{LOBE_NAMES[eid]}-color.svg'
        if candidate.exists():
            return candidate.read_bytes()
    if eid in VLZ_SLUGS:
        slug = VLZ_SLUGS[eid]
        try:
            data = get(f'https://www.vectorlogo.zone/logos/{slug}/{slug}-icon.svg')
            if b'<svg' in data[:400]:
                return data
        except Exception:
            pass
    item = index.get(norm(SVGL_ALIAS.get(eid, name)))
    if item:
        try:
            data = get(route_of(item))
            if b'<svg' in data[:400]:
                return data
        except Exception:
            pass
    return None


if __name__ == '__main__':
    raise SystemExit(main())
