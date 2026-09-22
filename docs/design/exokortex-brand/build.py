#!/usr/bin/env python3
"""Erzeugt die Artboards „Exokortex im Cortex-Branddesign“.

Werte aus media/cortex.css (Leiste, Tokens) und media/settings.css (Seiten nach
Codex: Spalte 768 px, Titel 24/28 · 440, Abschnitt 14/20 · 460, Karte 12 px,
Zeile 60,5 px, Knöpfe 28 px, Status 6-px-Punkt). Inhalte aus bruecke/status.py
vom 13.09.2026.
"""
from pathlib import Path

HERE = Path(__file__).parent

# ── Symbole: die Pfade aus webview/components/CortexIcons.tsx ────────────────
G = {
    'compose': '<path d="M17 3.5 20.5 7 11 16.5l-4.4.9.9-4.4Z"></path><path d="M4 21h16"></path>',
    'bolt': '<path d="m13 2-8 12h6l-1 8 9-13h-7Z"></path>',
    'branch': '<circle cx="6" cy="5" r="2"></circle><circle cx="18" cy="5" r="2"></circle><circle cx="6" cy="19" r="2"></circle><path d="M6 7v10m0-3c8 0 12-2 12-7"></path>',
    'plug': '<path d="M9 2.5v5.5M15 2.5v5.5"></path><path d="M6 8h12v2.6a6 6 0 0 1-12 0Z"></path><path d="M12 16.6V21.5"></path>',
    'dots': '<circle cx="5" cy="12" r="1.15" fill="currentColor" stroke="none"></circle><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"></circle><circle cx="19" cy="12" r="1.15" fill="currentColor" stroke="none"></circle>',
    'search': '<circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 4 4"></path>',
    'panel': '<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M15 4v16"></path>',
    'folder': '<path d="M3 19V6.4a1 1 0 0 1 1-1h4.5l2 2H20a1 1 0 0 1 1 1V19Z"></path>',
    'folderOpen': '<path d="M3 18.6V6.4a1 1 0 0 1 1-1h4.5l2 2H19a1 1 0 0 1 1 1v1.6"></path><path d="M3 18.6h14.3a1 1 0 0 0 1-.75l1.65-6.2a.6.6 0 0 0-.58-.75H8.3a1 1 0 0 0-1 .75Z"></path>',
    'chevron': '<path d="m9 5 7 7-7 7"></path>',
    'chevronDown': '<path d="m6 9 6 6 6-6"></path>',
    'archive': '<rect x="3" y="4" width="18" height="4.5" rx="1"></rect><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M10 12.5h4"></path>',
    'back': '<path d="M20 12H4m6-6-6 6 6 6"></path>',
    'forward': '<path d="M4 12h16m-6-6 6 6-6 6"></path>',
    'globe': '<circle cx="12" cy="12" r="9"></circle><ellipse cx="12" cy="12" rx="4" ry="9"></ellipse><path d="M3 12h18"></path>',
    'terminal': '<path d="m4 5 6 6-6 6m9 1h7"></path>',
    'file': '<path d="M5 3h9l5 5v13H5Z"></path><path d="M14 3v6h5"></path>',
    'close': '<path d="m6 6 12 12M6 18 18 6"></path>',
    'arrow': '<path d="M4 12h16m-6-6 6 6-6 6"></path>',
    'refresh': '<path d="M20 10a8 8 0 1 0-1 7M20 4v6h-6"></path>',
}


def icon(name, size=16, color='currentColor'):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" '
            f'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0">{G[name]}</svg>')


STYLE = """
<style>
  body { margin: 0; background: #101113; }
  a { color: #8f9ccf; } a:hover { color: #b3bde6; }
  .app { display: flex; width: 1440px; min-height: 100%; background: #101113; color: #ededee;
         font: 13px/1.5 'SF Pro Text', -apple-system, 'Helvetica Neue', sans-serif; -webkit-font-smoothing: antialiased; }
  .num { font-variant-numeric: tabular-nums; }
  /* Leiste — cortex.css */
  .rail { display: flex; flex-direction: column; width: 250px; min-width: 250px; box-sizing: border-box; padding: 0 8px 0 10px; background: #1b1c1f; border-right: 1px solid #ffffff0e; }
  .brand { display: flex; align-items: center; gap: 9px; height: 42px; margin-top: 8px; padding: 0 4px 0 5px; color: #f2f2f3; }
  .brand span { font-size: 17px; font-weight: 640; letter-spacing: -.4px; margin-right: auto; }
  .ico { display: inline-flex; justify-content: center; align-items: center; width: 26px; height: 26px; border-radius: 5px; color: #707277; }
  .nav { display: flex; align-items: center; gap: 10px; color: #c3c4c7; padding: 0 8px; min-height: 30px; border-radius: 8px; font-size: 12.5px; }
  .nav svg { color: #999a9d; }
  .nav.on { color: #ededee; background: #ffffff12; }
  .nav.on svg { color: #ededee; }
  .count { font: 10px 'SF Mono', Menlo, monospace; color: #999a9d; background: #ffffff10; border-radius: 4px; padding: 1px 5px; margin-left: auto; }
  .heading { margin: 16px 0 3px 8px; color: #707277; font-size: 11px; font-weight: 480; }
  .tree { display: flex; align-items: center; gap: 9px; height: 30px; padding-left: 8px; color: #c3c4c7; font-size: 12.5px; }
  .tree svg { color: #707277; }
  /* Seite — settings.css */
  .main { position: relative; flex: 1; min-width: 0; }
  .history { position: absolute; top: 12px; left: 14px; display: flex; gap: 2px; color: #999a9d; }
  .titletools { position: absolute; top: 12px; right: 12px; display: flex; gap: 4px; color: #999a9d; }
  .page { width: 768px; margin: 0 auto; padding: 64.5px 0 96px; }
  .page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 43px; }
  .page-head h1 { margin: 0; font-size: 24px; font-weight: 440; line-height: 28px; letter-spacing: -.2px; }
  .page-head p { display: flex; align-items: center; gap: 8px; margin: 3px 0 0; color: #999a9d; font-size: 14px; line-height: 20px; }
  .actions { display: flex; align-items: center; gap: 8px; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 8px; background: #ffffff0f; color: #ededee; font-size: 13px; white-space: nowrap; }
  .btn.primary { background: #f1f1f1; color: #131416; font-weight: 500; }
  .btn.ghost { background: transparent; color: #999a9d; }
  .tabbar { display: flex; align-items: center; justify-content: space-between; margin: -8px 0 24px; }
  .tabs { display: inline-flex; align-items: center; gap: 2px; }
  .tab { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 9px; border-radius: 8px; color: #999a9d; font-size: 13px; }
  .tab span { color: #707277; }
  .tab.on { background: #ffffff12; color: #ededee; }
  .stand { color: #707277; font-size: 12px; }
  .section { margin-top: 49.5px; }
  .section.first { margin-top: 0; }
  .section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 13.5px; min-height: 20px; }
  .section-head h2 { margin: 0; font-size: 14px; font-weight: 460; line-height: 20px; }
  .section-head p { margin: 2px 0 0; color: #999a9d; font-size: 13px; line-height: 18px; }
  .card { position: relative; border: 1px solid #ffffff18; border-radius: 12px; background: #18191b; }
  .card + .card { margin-top: 8px; }
  .row { position: relative; display: flex; align-items: center; gap: 16px; min-height: 60.5px; padding: 9.5px 16px 13px; box-sizing: border-box; }
  .row + .row::before, .row + .sub::before, .sub + .sub::before, .sub + .row::before { content: ''; position: absolute; top: 0; left: 16px; right: 16px; border-top: .5px solid #ffffff0e; }
  .row.compact { min-height: 44px; padding: 6px 16px 8px; }
  .text { flex: 1; min-width: 0; }
  .title { display: flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 500; line-height: 22px; }
  .subline { font-size: 12px; line-height: 16px; color: #999a9d; }
  .control { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .value { min-width: 56px; text-align: right; font-size: 13px; color: #ededee; }
  .muted { color: #999a9d; }
  .dim { color: #707277; }
  .status { display: inline-flex; align-items: center; gap: 6px; color: #999a9d; font-size: 12px; white-space: nowrap; }
  .status i { width: 6px; height: 6px; border-radius: 50%; background: #88b99b; }
  .status.warn i { background: #d8b36a; }
  .status.off i { background: #707277; }
  .status.bad { color: #f08a8a; }
  .status.bad i { background: #e36a6a; }
  .meter { position: relative; width: 220px; height: 4px; border-radius: 2px; background: #ffffff1a; overflow: hidden; }
  .meter i { position: absolute; top: 0; bottom: 0; left: 0; border-radius: 2px; background: #ededee; }
  .meter i.soft { background: #707277; }
  .footnote { margin: 8px 16px 0; color: #999a9d; font-size: 12px; line-height: 20px; text-wrap: pretty; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .stats > div { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-height: 84px; padding: 12px 16px; box-sizing: border-box; }
  .stats > div + div { border-left: .5px solid #ffffff0e; }
  .stats strong { font-size: 20px; font-weight: 440; line-height: 26px; letter-spacing: -.2px; }
  .tile { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 7px; border: 1px solid #ffffff10; box-sizing: border-box; color: #d6d7d7; font-size: 11px; font-weight: 560; flex-shrink: 0; }
  .sub { position: relative; display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 6px 16px 6px 16px; box-sizing: border-box; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 2px 16px 14px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; color: #999a9d; font-size: 12px; }
  .chip i { width: 6px; height: 6px; border-radius: 50%; background: #88b99b; }
  .search { display: flex; align-items: center; gap: 9px; height: 36px; padding: 0 6px 0 12px; border: 1px solid #ffffff14; border-radius: 18px; background: #ffffff09; color: #707277; }
  .search span { flex: 1; font-size: 14px; color: #707277; }
  .log { margin: 0 16px 14px; padding: 10px 12px; border-radius: 8px; background: #101113; color: #999a9d; font: 11.5px/1.6 'SF Mono', Menlo, monospace; white-space: pre; overflow: hidden; }
</style>
"""


def rail():
    nav = [('compose', 'Neuer Chat', ''), ('bolt', 'Aktive Agenten', '<span class="count">2</span>'),
           ('branch', 'Exokortex', ''), ('plug', 'Plugins', ''), ('dots', 'Einstellungen', '')]
    items = ''.join(
        f'<div class="nav{" on" if label == "Exokortex" else ""}">{icon(glyph)}<span>{label}</span>{extra}</div>'
        for glyph, label, extra in nav)
    return f"""
<aside class="rail">
  <div class="brand"><img src="cortex-icon.png" width="22" height="22" alt="" style="border-radius: 5px"></img><span>Cortex</span>
    <span class="ico" style="margin-right: 0">{icon('search', 15)}</span><span class="ico" style="margin-right: 0">{icon('panel', 15)}</span></div>
  <div style="display: flex; flex-direction: column; gap: 0; margin-top: 4px">{items}</div>
  <div class="heading">Angeheftet</div>
  <div class="tree">{icon('folder', 15)}<span>Haushaltsbuch</span></div>
  <div class="heading">Projekte</div>
  <div class="tree">{icon('folder', 15)}<span>Nordwind Studio</span></div>
  <div class="tree" style="color: #707277">{icon('compose', 14)}<span>Projekt hinzufügen</span></div>
  <div class="heading" style="display: flex; align-items: center; gap: 4px">{icon('chevronDown', 11)}Zuletzt verwendet</div>
  <div class="tree" style="padding-left: 22px">Neue Aufgabe</div>
  <div style="flex: 1"></div>
  <div class="tree" style="color: #999a9d">{icon('archive', 15)}<span>Archivierte Projekte</span><span class="count" style="margin-right: 8px">1</span></div>
  <div style="display: flex; align-items: center; gap: 10px; margin: 8px 0 14px; padding: 10px 8px 0; border-top: 1px solid #ffffff0e">
    <span style="display: flex; gap: 3px"><i style="width: 16px; height: 16px; border-radius: 4px; background: #d99d7833"></i><i style="width: 16px; height: 16px; border-radius: 4px; background: #ffffff14"></i><i style="width: 16px; height: 16px; border-radius: 4px; background: #ffffff14"></i></span>
    <span style="flex: 1; display: flex; flex-direction: column"><span style="font-size: 11.5px; color: #ededee">4 Konten</span><span style="font-size: 10.5px; color: #707277; white-space: nowrap">4 verfügbar · Limits &amp; Konten</span></span>
    {icon('chevron', 12)}</div>
</aside>"""


TABS = [('ueberblick', 'Überblick', '1'), ('bestand', 'Bestand', '30.758'), ('galaxie', 'Galaxie', ''),
        ('wege', 'Datenwege', '2/8'), ('laeufe', 'Läufe', '10'), ('suchen', 'Suchen', '')]


def head(active):
    tabs = ''.join(
        f'<div class="tab{" on" if tid == active else ""}">{label}{f"<span>{count}</span>" if count else ""}</div>'
        for tid, label, count in TABS)
    return f"""
  <div class="page-head">
    <div>
      <h1>Exokortex</h1>
      <p><span class="status warn"><i></i></span>Bereit · die Vault-Projektion ist älter als der Graph</p>
    </div>
    <div class="actions">
      <div class="btn">Nachmessen</div>
      <div class="btn">Chats einspeisen</div>
      <div class="btn primary">Prüfen</div>
    </div>
  </div>
  <div class="tabbar">
    <div class="tabs">{tabs}</div>
    <span class="stand num">Stand 13.09., 01:18</span>
  </div>"""


def frame(active, body):
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>{STYLE}</helmet>
<div class="app">
{rail()}
<main class="main">
  <div class="history"><span class="ico">{icon('back', 15)}</span><span class="ico" style="opacity: .3">{icon('forward', 15)}</span></div>
  <div class="titletools"><span class="ico">{icon('globe', 15)}</span><span class="ico">{icon('folder', 15)}</span><span class="ico">{icon('terminal', 15)}</span><span class="ico">{icon('dots', 15)}</span></div>
  <div class="page">
{head(active)}
{body}
  </div>
</main>
</div>
</x-dc>
</body>
</html>
"""


def section(title, sub, inner, first=False, right=''):
    p = f'<p>{sub}</p>' if sub else ''
    return f"""
  <div class="section{' first' if first else ''}">
    <div class="section-head"><div><h2>{title}</h2>{p}</div>{right}</div>
    {inner}
  </div>"""


de = lambda n: f'{n:,}'.replace(',', '.')

# ── 1 · Überblick ────────────────────────────────────────────────────────────
STILL = ['Plattenplatz (Mac)', 'Hintergrundlast (Mac)', 'Schreibsperre', 'Leseserver', 'Graphindex', 'Speicher',
         'Chat-Ablage', 'Stündlicher Lauf', 'Werkzeugkette', 'Schreibpuffer']
ueberblick = (
    section('Braucht Aufmerksamkeit', '1 Befund · 10 Prüfungen ohne Befund', f"""
    <div class="card">
      <div class="row">
        <div class="text"><div class="title">Vault-Projektion</div>
          <div class="subline">Älter als der Graph (vor 4 Tagen) — der Vault zeigt nicht, was im Graphen steht.</div></div>
        <div class="control"><span class="status warn"><i></i>Warnung</span></div>
      </div>
      <div class="row compact">
        <div class="text"><div class="title" style="color: #999a9d; font-weight: 450">10 Prüfungen ohne Befund</div></div>
        <div class="control dim">{icon('chevronDown', 14)}</div>
      </div>
      <div class="chips">{''.join(f'<span class="chip"><i></i>{n}</span>' for n in STILL)}</div>
    </div>""", first=True)
    + section('Wartet auf dich', '1.982 offen', f"""
    <div class="card">
      <div class="row"><div class="text"><div class="title">Offene Entscheidungen</div><div class="subline">Knoten, die die Maschine nicht raten darf</div></div>
        <div class="control"><span class="value num">4</span><span class="dim">{icon('chevron', 14)}</span></div></div>
      <div class="row"><div class="text"><div class="title">Unbenannte Ortsgruppen</div><div class="subline">Gruppiert, aber noch ohne Namen</div></div>
        <div class="control"><span class="value num">240</span><span class="dim">{icon('chevron', 14)}</span></div></div>
      <div class="row"><div class="text"><div class="title">Fehlende Dateien</div><div class="subline">Aus 2 früheren Einspeisungen</div></div>
        <div class="control"><span class="value num">1.738</span><div class="btn">Fehllisten</div></div></div>
    </div>""")
    + section('Bestand', 'Drei Schichten, vom Sichtbaren bis zum Volltext', """
    <div class="card stats">
      <div><span class="muted" style="font-size: 12px">Sichtbar</span><strong class="num">461</strong><span class="dim" style="font-size: 12px">Notizen im Vault</span></div>
      <div><span class="muted" style="font-size: 12px">Graph</span><strong class="num">30.758</strong><span class="dim" style="font-size: 12px">Knoten</span></div>
      <div><span class="muted" style="font-size: 12px">Beziehungen</span><strong class="num">128.731</strong><span class="dim" style="font-size: 12px">Kanten</span></div>
      <div><span class="muted" style="font-size: 12px">Volltext</span><strong class="num">253.993</strong><span class="dim" style="font-size: 12px">Einheiten</span></div>
    </div>""")
    + section('Ablage', '', f"""
    <div class="card">
      <div class="row"><span class="dim">{icon('folderOpen', 16)}</span><div class="text"><div class="title">Speicher</div><div class="subline">~/.exokortex</div></div><div class="control"><div class="btn ghost">Öffnen</div></div></div>
      <div class="row"><span class="dim">{icon('folderOpen', 16)}</span><div class="text"><div class="title">Vault</div><div class="subline">~/Obsidian-Vault</div></div><div class="control"><div class="btn ghost">Öffnen</div></div></div>
      <div class="row"><span class="dim">{icon('folderOpen', 16)}</span><div class="text"><div class="title">Chats</div><div class="subline">~/Cortex-Chats</div></div><div class="control"><div class="btn ghost">Öffnen</div></div></div>
    </div>
    <p class="footnote"><span class="status" style="vertical-align: middle"><i></i></span> Agenten lesen über den Konnektor exokortex · 5 Werkzeuge · nur lesend</p>""")
)

# ── 2 · Bestand ──────────────────────────────────────────────────────────────
def verteilung(rows, total, soft=()):
    top = rows[:7]
    span = top[0][1] * 1.02
    out = []
    for name, n in top:
        pct = f'{n / total * 100:.1f}'.replace('.', ',')
        out.append(f"""<div class="row compact"><div class="text"><div class="title" style="font-weight: 450">{name}</div></div>
        <div class="control"><div class="meter"><i class="{'soft' if name in soft else ''}" style="width: {max(n / span * 100, .6):.2f}%"></i></div>
        <span class="value num">{de(n)}</span><span class="dim num" style="min-width: 44px; text-align: right; font-size: 12px">{pct} %</span></div></div>""")
    return out


KNOTEN = [('Begriff', 12888), ('Kapitel', 8870), ('Dokument', 3027), ('Medium', 2925), ('Quelltext', 1949), ('Bereich', 924), ('Werkzeug', 147),
          ('Projekt', 12), ('Organisation', 6), ('Bildungseinrichtung', 3), ('Quelle', 3), ('System', 2), ('Person', 1), ('Ort', 1)]
KANTEN = [('NENNT', 84479), ('ENTHÄLT', 8870), ('LIEGT_IN', 8825), ('GEHÖRT_ZU', 8825), ('HANDELT_VON', 7818), ('FOLGT_AUF', 6560), ('VERWEIST_AUF', 1902)]
PROJEKTE = [('Provinzen', 1339), ('Dummy Economics', 539), ('Nordwind Studio', 487), ('Anatomy Academy', 382), ('Levels of Monaco', 95),
            ('New German Architecture', 79), ("God's Eye View", 31), ('EduCore', 29), ('Project Super Suit', 15), ('Theologische Lehre', 12),
            ('Mobil &amp; Klar', 10), ('Cortex-Chats', 9)]
kanten_rest = 128731 - sum(n for _, n in KANTEN)


def projektfarbe(i, total):
    h = round(i / total * 360)
    l = 58 if i % 2 == 0 else 45
    return f'hsl({h} 58% {l}%)'


projekt_rows = ''.join(
    f"""<div class="row compact"><i style="width: 8px; height: 8px; border-radius: 50%; background: {projektfarbe(i, len(PROJEKTE))}; flex-shrink: 0"></i>
      <div class="text"><div class="title" style="font-weight: 450">{name}</div></div>
      <div class="control"><div class="meter"><i style="width: {max(n / PROJEKTE[0][1] * 100, 1):.2f}%"></i></div><span class="value num">{de(n)}</span></div></div>"""
    for i, (name, n) in enumerate(PROJEKTE))

bestand = (
    section('Knoten nach Art', '14 Arten · 30.758 Knoten', f"""
    <div class="card">{''.join(verteilung(KNOTEN, 30758))}</div>
    <p class="footnote">28 weitere in 7 Arten: Projekt, Organisation, Bildungseinrichtung, Quelle, System, Person, Ort</p>""", first=True)
    + section('Kanten nach Art', '18 Arten · 128.731 Kanten', f"""
    <div class="card">{''.join(verteilung(KANTEN, 128731, soft=('LIEGT_IN', 'GEHÖRT_ZU')))}</div>
    <p class="footnote">{de(kanten_rest)} weitere in 11 Arten. Grau sind Strukturkanten, die nur den Ordnerbaum nachzeichnen — ihr Anteil ist das Maß, an dem die Abnahme den Rückfall in einen Ordnerbaum misst; über 60 % reißt sie.</p>""")
    + section('Projekte', '12 Projekte · 3.027 Dokumente', f'<div class="card">{projekt_rows}</div>')
)

# ── 3 · Datenwege ────────────────────────────────────────────────────────────
def instanz(tile, name, werkzeuge, zustand):
    st = '<span class="status"><i></i>Angebunden</span>' if zustand == 'aktiv' else '<span class="status off"><i></i>Geplant</span>'
    w = f'<span class="subline" style="margin-left: 8px">{werkzeuge}</span>' if werkzeuge else ''
    return f"""<div class="sub" style="padding-left: 28px">{tile}<div class="text" style="display: flex; align-items: baseline"><span style="font-size: 13px; font-weight: 450{'; color: #999a9d' if zustand != 'aktiv' else ''}">{name}</span>{w}</div>{st}</div>"""


def kuerzel(k):
    return f'<span class="tile">{k}</span>'


cortex_tile = '<span class="tile" style="background: #ffffff04"><img src="cortex-icon.png" width="18" height="18" alt="" style="border-radius: 4px"></img></span>'
folder_tile = f'<span class="tile" style="color: #999a9d">{icon("folder", 14)}</span>'


def art(name, muster, adapter, knoten, instanzen, aktiv):
    stand = (f'<span class="value num" style="min-width: 0">{knoten}</span><span class="dim" style="font-size: 12px">Knoten</span>'
             if knoten else '<span class="dim" style="font-size: 12px">kein Adapter</span>')
    return f"""
    <div class="card">
      <div class="row"><div class="text"><div class="title">{name}</div><div class="subline">{muster}{f' · {adapter}' if adapter else ''}</div></div>
        <div class="control" style="gap: 6px">{stand}</div></div>
      {''.join(instanzen)}
      <div style="height: 6px"></div>
    </div>"""


wege = (
    section('Quellenarten', '4 Arten · 2 von 8 Quellen angebunden',
            art('Dateien und Ordner', 'Projekt → Bereich → Dokument', 'lauf.py, von Hand', '3.027',
                [instanz(folder_tile, 'Projektordner', '', 'aktiv')], True)
            + art('KI-Chats', 'Anbieter → Werkzeug → Projekt', 'chats.py, stündlich', '57', [
                instanz(cortex_tile, 'Cortex', 'Chat · Agenten', 'aktiv'),
                instanz(kuerzel('CL'), 'Claude', 'Desktop · Code', 'geplant'),
                instanz(kuerzel('GPT'), 'ChatGPT', 'Chat · Work · Codex · Cloud', 'geplant'),
                instanz(kuerzel('GR'), 'Grok', 'Chat · Build', 'geplant')], True)
            + art('Nachrichten', 'Quelle → Monat → Kategorie', '', '', [
                instanz(kuerzel('AM'), 'Apple Mail', '', 'geplant'),
                instanz(kuerzel('NA'), 'Nachrichten', '', 'geplant')], False)
            + art('Aufnahmegeräte', 'Monat → Kategorie, rückwirkend', '', '', [
                instanz(kuerzel('OMI'), 'OMI', '', 'geplant')], False)
            + '<p class="footnote">Die Quellenart bestimmt, wie aus dem Zufluss ein Graph wird; die Quellen darin sind austauschbar. Ein zweites Aufnahmegerät oder ein vierter KI-Anbieter reiht sich in seine Art ein, ohne dass sich die Systematik ändert.</p>',
            first=True)
)

# ── 4 · Läufe ────────────────────────────────────────────────────────────────
LAEUFE = [('13.09.', '01:18', 1, 960, 0), ('12.09.', '23:02', 1, 894, 0), ('12.09.', '01:51', 1, 840, 0), ('12.09.', '00:37', 2, 802, 0),
          ('11.09.', '21:17', 1, 678, 0), ('11.09.', '18:06', 1, 852, 0), ('11.09.', '16:52', 2, 880, 0), ('11.09.', '02:31', 1, 822, 0),
          ('09.09.', '19:55', 4, 767, 0), ('09.09.', '15:39', 4, 369, 1)]
lauf_rows = ''.join(
    f"""<div class="row compact"><span class="num" style="width: 104px; font-size: 13px">{d} <span class="muted">{t}</span></span>
      <div class="text"><span class="muted" style="font-size: 12.5px">Cortex-Chats · {c} {'Chat' if c == 1 else 'Chats'}</span></div>
      <div class="control"><div class="meter" style="width: 140px"><i class="{'' if code == 0 else 'soft'}" style="width: {s / 960 * 100:.1f}%"></i></div>
        <span class="value num" style="min-width: 48px">{round(s / 60)} Min.</span>
        <span class="status{'' if code == 0 else ' bad'}" style="min-width: 56px"><i></i>{'ok' if code == 0 else 'exit 1'}</span></div></div>"""
    for d, t, c, s, code in LAEUFE)
BEFUNDE = [('Vollständigkeit Nordwind Studio', '0,3 % — 4 da, 1.549 fehlen', 'Regel: mindestens 99 %'),
           ('Vollständigkeit Persönliche Projekte', '0,0 % — 0 da, 0 fehlen', 'Regel: mindestens 99 %'),
           ('Knoten mit eindeutiger Notiz', '1 fehlt, 461 doppelt', 'Regel: jeder sichtbare Knoten genau einmal'),
           ('Projizierte Kanten', '128.654 von 128.699', 'Regel: 100 % der sichtbaren Kanten')]
befund_rows = ''.join(
    f"""<div class="row"><div class="text"><div class="title">{n}</div><div class="subline">{w} · {r}</div></div>
      <div class="control"><span class="status bad"><i></i>Gerissen</span></div></div>""" for n, w, r in BEFUNDE)
laeufe = (
    section('Letzte Läufe', '10 im Journal · stündlich', f'<div class="card">{lauf_rows}</div><p class="footnote">Knoten, Kanten und Abnahme führt der Speicher nicht als Zeitreihe — hier stehen einzelne Läufe, keine Verlaufskurven.</p>', first=True)
    + section('Abnahme', 'Gemessen am 13.09. um 01:18', f'<div class="card">{befund_rows}</div>',
              right='<span class="status bad" style="margin-bottom: 1px"><i></i>4 von 17 gerissen</span>')
)

# ── 5 · Suchen (mit laufender Einspeisung) ───────────────────────────────────
LOG = """Abnahme der Chat-Quelle
Chats aufgenommen   1/1
ohne Volltext       0
ohne Verbindung     0"""
suchen = (
    section('Chats einspeisen', 'Läuft seit 4 Minuten · dauert etwa 6', f"""
    <div class="card">
      <div class="row"><span class="dim">{icon('refresh', 16)}</span><div class="text"><div class="title">Einspeisung läuft</div><div class="subline">Neue Cortex-Chats werden gelesen, verbunden und in den Volltext aufgenommen.</div></div>
        <div class="control"><div class="btn">Abbrechen</div></div></div>
      <pre class="log">{LOG}</pre>
    </div>""", first=True)
    + section('Volltext', '253.993 Einheiten · derselbe Weg, den eine KI nimmt', f"""
    <div class="search">{icon('search', 15)}<span>Volltext über alles, was eingespeist wurde</span><div class="btn">Suchen</div></div>
    <div class="card" style="margin-top: 12px">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 34px 16px; color: #999a9d; font-size: 13px; text-align: center">
        <span class="dim">{icon('search', 20)}</span>
        <span>Treffer erscheinen hier — mit Dokument, Projekt und Fundstelle.</span>
      </div>
    </div>""")
)

ARTBOARDS = [('Main', 'ueberblick', ueberblick, 1320, 'Überblick'), ('Bestand', 'bestand', bestand, 1840, 'Bestand'),
             ('Datenwege', 'wege', wege, 1150, 'Datenwege'), ('Laeufe', 'laeufe', laeufe, 1220, 'Läufe'),
             ('Suchen', 'suchen', suchen, 900, 'Suchen')]

import json
layout = {'artboards': [], 'annotations': [], 'launch': {'view': 'canvas'}}
x = 0
for i, (stem, tab, body, h, title) in enumerate(ARTBOARDS):
    (HERE / f'{stem}.dc.html').write_text(frame(tab, body), encoding='utf-8')
    col, rowi = i % 3, i // 3
    layout['artboards'].append({'file': f'{stem}.dc.html', 'x': col * 1540, 'y': rowi * 2080, 'w': 1440, 'h': h, 'title': title})
layout['annotations'].append({'id': 'richtung', 'x': 0, 'y': -200, 'w': 520,
    'text': 'Exokortex im Cortex-Branddesign\nSpalte 768 px, Titel 24 px, Abschnitte mit Karten und Zeilen wie in den Einstellungen. Status als Punkt mit Text, Zahlen in der Textschrift mit Tabellenziffern, keine Großbuchstaben-Labels in Monospace, keine Farbkanten. Galaxie bleibt die Graphansicht und bekommt nur Kopf und Reiter.'})
(HERE / 'canvas.json').write_text(json.dumps(layout, ensure_ascii=False, indent=2), encoding='utf-8')
print('ok', [a['file'] for a in layout['artboards']])
