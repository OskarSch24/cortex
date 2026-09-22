"""Arbeits-Widgets 11–20: Exokortex, Karriere, Design, Medien, Lernen."""
import math
import random
from base import (POS, NEG, WARN, INFO, VIOLET, ic, head, seg, chk, activity, walk, spark, board)
from arbeit1 import ok, bad, spin


# ── 11 Entscheidungskarte ───────────────────────────────────────────────────
def decision():
    elapsed = 7 / 90
    return f"""<div class="w">
  {head(ic('scale', 18), 'Obsidian-Vault als Projektion statt als Quelle der Wahrheit', '<span class="mono" style="font-size: 12.5px">DEC-2026-09-06-01</span>· Exokortex', '<span class="pill warn">Offen</span>')}
  <div class="sep" style="padding: 14px 14px 4px">
    <div class="label">Entscheidung</div>
    <p class="prose" style="font-size: 15px; margin-top: 4px">Die Datenbank ist die Quelle der Wahrheit. Der Vault ist eine daraus erzeugte, lesbare Projektion.</p>
  </div>
  <div class="grid2" style="gap: 8px; padding: 12px 14px">
    <div class="box" style="padding: 12px 14px">
      <div class="label" style="margin-bottom: 8px">Verworfen</div>
      <div style="display: flex; flex-direction: column; gap: 6px; font-size: 14px; line-height: 20px">
        <span style="display: flex; gap: 8px">{ic('close', 14, '#707277')}<span class="muted">Obsidian als alleinige Datenbank</span></span>
        <span style="display: flex; gap: 8px">{ic('close', 14, '#707277')}<span class="muted">Nur Datenbank, kein Vault</span></span>
      </div>
    </div>
    <div class="box" style="padding: 12px 14px">
      <div class="label" style="margin-bottom: 8px">Falsch, wenn …</div>
      <div class="muted" style="font-size: 14px; line-height: 20px; text-wrap: pretty">ich nach drei Monaten die Datenbank nie direkt abfrage und nur im Vault arbeite.</div>
    </div>
  </div>
  <div style="padding: 4px 14px 16px">
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px"><span class="label num">Getroffen 06.09.</span><span style="font-size: 13px"><span class="v">Überprüfung am 5. Dezember</span> <span class="dim num">· in 83 Tagen</span></span></div>
    <div style="position: relative; height: 12px">
      <div style="position: absolute; left: 0; right: 0; top: 4px; height: 4px; border-radius: 2px; background: #ffffff10"></div>
      <div style="position: absolute; left: 0; width: {elapsed * 100:.1f}%; top: 4px; height: 4px; border-radius: 2px; background: #ededee"></div>
      <div style="position: absolute; left: calc({elapsed * 100:.1f}% - 5px); top: 1px; width: 10px; height: 10px; border-radius: 50%; background: #ededee; box-shadow: 0 0 0 4px #ededee1f"></div>
      <div style="position: absolute; right: -1px; top: 1px; width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid {WARN}; box-sizing: border-box"></div>
    </div>
  </div>
  <div class="foot" style="padding: 10px 14px"><span class="acts"><span class="btn">Ergebnis eintragen</span><span class="btn quiet">Im Vault öffnen</span></span><span>2 Wissenslücken notiert</span></div>
</div>"""


# ── 12 Orte benennen ────────────────────────────────────────────────────────
def places():
    rnd = random.Random(14)
    dots = ''.join(f'<circle cx="{150 + rnd.gauss(0, 16):.1f}" cy="{104 + rnd.gauss(0, 12):.1f}" r="2.6" fill="{INFO}" fill-opacity=".85"></circle>' for _ in range(42))
    grid = ''.join(f'<path d="M0 {y}H300" stroke="#ffffff08"></path>' for y in range(20, 210, 26)) + ''.join(f'<path d="M{x} 0V210" stroke="#ffffff08"></path>' for x in range(20, 300, 26))
    svg = f"""<svg width="300" height="210" viewBox="0 0 300 210" style="display: block; border-radius: 10px; background: #141518">
  {grid}<path d="M0 150 C80 136 190 170 300 150" stroke="#ffffff14" stroke-width="5" fill="none"></path><path d="M96 0 L118 210" stroke="#ffffff10" stroke-width="4"></path>
  <circle cx="150" cy="104" r="44" fill="{INFO}" fill-opacity=".06" stroke="{INFO}" stroke-opacity=".35" stroke-dasharray="2 3"></circle>{dots}
  <text x="12" y="198" fill="#707277" font-size="10.5" font-family="SF Pro Text, -apple-system, sans-serif">53,56° N · 9,93° O</text>
</svg>"""
    photos = ''.join(f"""<div style="display: flex; flex-direction: column; justify-content: space-between; height: 99px; padding: 8px; box-sizing: border-box; border-radius: 8px; background: #ffffff08; color: #707277">
  {ic('image', 16)}<span class="label num">{d}</span></div>""" for d in ['12.03.2019', '28.11.2022', '04.06.2025', '09.09.2026'])
    chips = ''.join(f'<span class="pill {"info" if i == 0 else "mute"}" style="height: 26px; padding: 0 10px; font-size: 13px">{t}</span>' for i, t in enumerate(['Zuhause', 'Studio', 'Bei Freunden']))
    return f"""<div class="w">
  {head(ic('pin', 18), 'Ortsgruppe place_014', '<span class="num">42 Aufnahmen · März 2019 bis September 2026</span>', '<span class="pill mute num">1 von 240 unbenannt</span>')}
  <div class="sep" style="display: flex; gap: 10px; padding: 14px">
    {svg}
    <div class="grow" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">{photos}</div>
  </div>
  <div style="padding: 0 14px 14px">
    <div class="muted" style="font-size: 13.5px; line-height: 20px; margin-bottom: 10px">Meist abends und am Wochenende aufgenommen, über sieben Jahre verteilt.</div>
    <div style="display: flex; align-items: center; gap: 10px">
      <div class="box grow" style="display: flex; align-items: center; height: 36px; padding: 0 12px; border-color: #ffffff26"><span>Zuhause</span><i style="width: 1.5px; height: 18px; margin-left: 1px; background: #ededee"></i></div>
      <span class="btn primary">Speichern</span><span class="btn quiet">Überspringen</span>
    </div>
    <div style="display: flex; align-items: center; gap: 6px; margin-top: 10px"><span class="label" style="margin-right: 4px">Vorschläge</span>{chips}</div>
  </div>
  <div class="foot"><span>Der Name landet als Ort in 36-Orte</span><span>239 weitere</span></div>
</div>"""


# ── 13 Tageszeitleiste ──────────────────────────────────────────────────────
def dayline():
    t0, t1 = 8, 24
    lanes = [('Cortex', '#ededee', [(9 + 10 / 60, 12 + 40 / 60, 'Codex-Chat'), (17, 21.5, 'Bildbearbeitung')], '8 h 00'),
             ('Exokortex', VIOLET, [(13.5, 15, 'Fotoimport')], '1 h 30'),
             ('Vektor', INFO, [(20 + 10 / 60, 21 + 40 / 60, 'MCP')], '1 h 30'),
             ('Unterwegs', POS, [(15 + 20 / 60, 16 + 10 / 60, 'Bornheim')], '0 h 50')]
    pct = lambda h: (h - t0) / (t1 - t0) * 100
    ticks = ''.join(f'<div style="position: absolute; left: {pct(h):.2f}%; top: 0; bottom: 0; border-left: 1px solid #ffffff{"12" if h % 4 == 0 else "08"}"></div>' for h in range(t0, t1 + 1, 2))
    labels = ''.join(f'<span class="label num" style="position: absolute; left: {pct(h):.2f}%; transform: translateX(-50%)">{h:02d}</span>' for h in range(t0, t1 + 1, 4))
    rows = []
    for name, col, blocks, total in lanes:
        bl = ''.join(f"""<div style="position: absolute; left: {pct(a):.2f}%; width: {pct(b) - pct(a):.2f}%; top: 6px; bottom: 6px; border-radius: 6px; background: {col}{'24' if col != '#ededee' else '1c'}; box-sizing: border-box; padding: 0 7px; display: flex; align-items: center; overflow: hidden">
  {f'<span style="font-size: 11.5px; color: {col}; white-space: nowrap">{t}</span>' if b - a >= 2 else ''}</div>{'' if b - a >= 2 else f'<span style="position: absolute; left: calc({pct(b):.2f}% + 8px); top: 11px; font-size: 11.5px; line-height: 18px; color: {col}; white-space: nowrap">{t}</span>'}""" for a, b, t in blocks)
        rows.append(f"""<div style="display: flex; align-items: center; height: 40px">
  <span style="display: flex; align-items: center; gap: 8px; width: 170px; flex: none; font-size: 14px"><span class="dot" style="background: {col}"></span><span class="v grow">{name}</span><span class="dim num" style="font-size: 12px; margin-right: 12px">{total}</span></span>
  <div style="position: relative; flex: 1; height: 40px">{bl}</div>
</div>""")
    now = ''
    stack = ''.join(f'<i style="flex: {w}; height: 6px; background: {c}; {"opacity: .85" if c == "#ededee" else ""}"></i>' for w, c in [(480, '#ededee'), (90, VIOLET), (90, INFO), (50, POS)])
    return f"""<div class="w">
  {head(ic('bars', 18), 'Samstag, 12. September', '<span class="num">11 h 50 min erfasst · 23 Sitzungen</span>', f'<span class="btn quiet" style="padding: 5px">{ic("chevronLeft", 14)}</span><span class="btn quiet" style="padding: 5px">{ic("chevron", 14)}</span>')}
  <div class="sep" style="padding: 12px 14px 8px">
    <div style="display: flex; gap: 2px; border-radius: 3px; overflow: hidden; margin-bottom: 14px">{stack}</div>
    <div style="position: relative">
      <div style="position: absolute; left: 170px; right: 0; top: 0; bottom: 0">{ticks}</div>
      {''.join(rows)}
    </div>
    <div style="position: relative; height: 18px; margin: 4px 0 0 170px">{labels}</div>
  </div>
  <div class="foot"><span>Aus Sitzungen, Transkripten und Fotos · 80-Auto</span><span style="display: flex; align-items: center; gap: 4px">Tagesnotiz öffnen {ic('chevron', 12)}</span></div>
</div>"""


# ── 14 Job-Treffer ──────────────────────────────────────────────────────────
def jobs():
    js = [(92, 'AI Automation Specialist', 'Hafenwerk Digital GmbH', 'Frankfurt · hybrid', '55–65 T €', 'StepStone', ['Agenten', 'n8n', 'E-Commerce']),
          (88, 'Marketing Technologist', 'Nordstern Commerce', 'Frankfurt · vor Ort', '50–58 T €', 'LinkedIn', ['Kampagnen', 'Automatisierung']),
          (81, 'Content & KI-Produktion', 'Elbwerk Media', 'Remote · DACH', '48–56 T €', 'Welcome to the Jungle', ['Video', 'Voice-over', 'KI-Bild'])]
    def ring(s):
        r, c = 15, 2 * math.pi * 15
        col = POS if s >= 85 else WARN
        return f"""<div style="position: relative; width: 40px; height: 40px; flex: none"><svg width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="{r}" fill="none" stroke="#ffffff12" stroke-width="3"></circle><circle cx="20" cy="20" r="{r}" fill="none" stroke="{col}" stroke-width="3" stroke-linecap="round" stroke-dasharray="{c * s / 100:.1f} {c:.1f}" transform="rotate(-90 20 20)"></circle></svg><span class="num" style="position: absolute; inset: 0; display: grid; place-items: center; font-size: 12px; font-weight: 500">{s}</span></div>"""
    rows = ''.join(f"""<div class="row" style="align-items: flex-start; gap: 14px; padding-top: 14px; padding-bottom: 14px">
  {ring(s)}
  <div class="grow" style="display: flex; flex-direction: column; gap: 2px">
    <span class="v" style="font-size: 15px; line-height: 21px; font-weight: 500">{t}</span>
    <span style="font-size: 13.5px; line-height: 19px">{c} · {p}</span>
    <span style="display: flex; gap: 6px; margin-top: 6px">{''.join(f'<span class="pill mute">{x}</span>' for x in tags)}</span>
  </div>
  <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px"><span class="v num" style="font-size: 14.5px">{sal}</span><span class="label">{src}</span></div>
</div>""" for s, t, c, p, sal, src, tags in js)
    return f"""<div class="w">
  {head(ic('briefcase', 18), '5 neue Treffer', 'Profil „KI-Automatisierung Frankfurt“ · 23 Quellen', '<span class="btn">' + ic('external', 14) + 'Google Sheet</span>')}
  <div class="sep rows">{rows}</div>
  <div class="foot"><span>Gefiltert: EU und UK, KMU, ab 45 T € · 2 weitere unter 80 Punkten</span><span style="display: flex; align-items: center; gap: 4px">Alle zeigen {ic('chevron', 12)}</span></div>
</div>"""


# ── 15 Figma-Abgleich ───────────────────────────────────────────────────────
def figma_compare():
    def mock(radius, gap, inactive):
        nav = ''.join(f'<span style="font-size: 13px; color: {"#ededee" if i == 0 else inactive}">{t}</span>' for i, t in enumerate(['Clips', 'Vorlagen', 'Marken', 'Export']))
        return f"""<div style="position: absolute; inset: 0; width: 706px; padding: 26px 28px; box-sizing: border-box; background: #121316">
  <div style="display: flex; align-items: center; height: 52px; padding: 0 12px 0 14px; border: 1px solid #ffffff14; border-radius: 12px; background: #18191b">
    <span class="tile" style="width: 26px; height: 26px; border-radius: 7px; background: #ededee; color: #131416; font-size: 10px">Nordwind</span>
    <span style="display: flex; gap: {gap}px; margin-left: 22px">{nav}</span><span class="grow"></span>
    <span style="padding: 6px 12px; border-radius: {radius}px; background: #eeeef0; color: #131416; font-size: 13px; font-weight: 500">Neuer Clip</span>
  </div>
  <div style="display: flex; gap: 10px; margin-top: 16px">{''.join('<div style="flex: 1; height: 70px; border-radius: 10px; background: #ffffff08"></div>' for _ in range(3))}</div>
</div>"""
    marker = lambda n, x, y: f'<span style="position: absolute; left: {x}px; top: {y}px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: {WARN}; color: #131416; font-size: 11px; font-weight: 700">{n}</span>'
    compare = f"""<div style="position: relative; height: 180px; overflow: hidden; border-radius: 10px">
  {mock(8, 16, '#999a9d')}
  <div style="position: absolute; left: 130px; top: 0; bottom: 0; right: 0; overflow: hidden"><div style="position: absolute; left: -130px; top: 0; width: 706px; height: 180px">{mock(12, 14, '#8f9094')}</div></div>
  <div style="position: absolute; left: 129px; top: 0; bottom: 0; width: 2px; background: #ededee"></div>
  <span style="position: absolute; left: 116px; top: 76px; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: #ededee; color: #131416">{ic('swap', 14, '#131416', 2)}</span>
  <span class="pill mute" style="position: absolute; left: 10px; bottom: 10px">Figma</span><span class="pill mute" style="position: absolute; right: 10px; bottom: 10px">Code</span>
  {marker(1, 657, 24)}{marker(2, 194, 18)}{marker(3, 300, 62)}
</div>"""
    diffs = [(1, 'Eckenradius Primärknopf', '8 px', '12 px', None, None, 'fixed'),
             (2, 'Abstand in der Navigation', '16 px', '14 px', None, None, 'fixed'),
             (3, 'Textfarbe inaktiv', '#999A9D', '#8F9094', '#999a9d', '#8f9094', 'open')]
    rows = ''.join(f"""<div class="row" style="min-height: 42px">
  <span style="display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: {'#ffffff12' if st == 'fixed' else WARN}; color: {'#999a9d' if st == 'fixed' else '#131416'}; font-size: 11px; font-weight: 700; flex: none">{n}</span>
  <span class="grow {'v' if st == 'open' else ''}">{t}</span>
  <span class="mono num" style="font-size: 12.5px; display: flex; align-items: center; gap: 8px">{f'<i style="width: 10px; height: 10px; border-radius: 3px; background: {c1}"></i>' if c1 else ''}<span class="v">{a}</span>{ic('arrow', 12, '#707277')}{f'<i style="width: 10px; height: 10px; border-radius: 3px; background: {c2}"></i>' if c2 else ''}<span class="v">{b}</span></span>
  <span style="width: 86px; display: flex; justify-content: flex-end">{'<span class="pill pos">Behoben</span>' if st == 'fixed' else '<span class="pill warn">Offen</span>'}</span>
</div>""" for n, t, a, b, c1, c2, st in diffs)
    return f"""<div class="w">
  {head(ic('compare', 18), 'Nordwind Clips · Header', 'Organismus · Figma gegen Code', '<span class="pill warn">1 von 3 offen</span>')}
  <div class="sep" style="padding: 14px">{compare}</div>
  <div class="rows">{rows}</div>
  <div class="foot" style="padding: 10px 14px"><span class="acts"><span class="btn primary">Offene beheben</span><span class="btn">In Figma öffnen</span></span><span>Nach dem Fix: Build, Deploy, Screenshot</span></div>
</div>"""


# ── 16 Farbpalette ──────────────────────────────────────────────────────────
def palette():
    tokens = [('--cx-bg', '#101113', None, 'Fläche'), ('--cx-raised', '#18191b', None, 'Fläche'), ('--cx-rail', '#1b1c1f', None, 'Fläche'),
              ('--cx-text', '#ededee', '16,2', 'AAA'), ('--cx-muted', '#999a9d', '6,7', 'AA'), ('--cx-dim', '#707277', '3,9', 'AA groß'),
              ('--cx-green', '#88b99b', '8,5', 'AAA'), ('Link', '#6aa8ff', '7,8', 'AAA')]
    cells = ''.join(f"""<div style="display: flex; flex-direction: column; gap: 8px">
  <div style="height: 64px; border-radius: 9px; background: {hx}; {'box-shadow: inset 0 0 0 1px #ffffff1a' if ratio is None else ''}; display: flex; align-items: flex-end; padding: 8px; box-sizing: border-box">{'' if ratio is None else f'<span style="font-size: 18px; line-height: 20px; font-weight: 500; color: #101113">Aa</span>'}</div>
  <div style="display: flex; flex-direction: column"><span class="mono" style="font-size: 12px; line-height: 17px; color: #ededee">{name}</span><span class="mono dim" style="font-size: 11.5px; line-height: 16px">{hx.upper()}</span></div>
  <div style="display: flex; align-items: center; gap: 6px">{f'<span class="num" style="font-size: 12.5px">{ratio} : 1</span>' if ratio else '<span class="dim" style="font-size: 12.5px">—</span>'}<span class="pill {'pos' if grade in ('AAA', 'AA') else 'warn' if grade == 'AA groß' else 'mute'}">{grade}</span></div>
</div>""" for name, hx, ratio, grade in tokens)
    return f"""<div class="w">
  {head(ic('drop', 18), 'Cortex · Grundtöne', 'Kontrast jeweils gegen --cx-bg', '<span class="btn">Als CSS kopieren</span>')}
  <div class="sep" style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px 12px; padding: 14px">{cells}</div>
  <div class="foot"><span style="display: flex; align-items: center; gap: 8px">{ic('alert', 14, WARN)}<span class="muted">--cx-dim reicht nur für große Schrift, nicht für Fließtext.</span></span><span>WCAG 2.1</span></div>
</div>"""


# ── 17 Audio-Takes ──────────────────────────────────────────────────────────
def audio():
    def wave(seed, played, n=64, w=330, h=34):
        rnd = random.Random(seed)
        bw = w / n
        bars = []
        for i in range(n):
            env = 0.35 + 0.65 * abs(math.sin(i / n * math.pi * 2.3 + seed))
            v = max(.12, min(1, env * (0.5 + rnd.random() * .6)))
            bh = v * h
            col = '#ededee' if i / n < played else '#ffffff30'
            bars.append(f'<rect x="{i * bw + .5:.1f}" y="{(h - bh) / 2:.1f}" width="{bw - 1.8:.1f}" height="{bh:.1f}" rx="1" fill="{col}"></rect>')
        return f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" style="display: block">{"".join(bars)}</svg>'
    takes = [('Take 1', 'Neutral · 0:28', 1, 0, False, False), ('Take 2', 'Ruhiger, tiefer · 0:31', 4, .39, True, True), ('Take 3', 'Schneller · 0:27', 9, 0, False, False)]
    rows = ''.join(f"""<div class="row" style="min-height: 64px; {'background: #ffffff05' if playing else ''}">
  <span style="display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; flex: none; {'background: #ededee; color: #131416' if playing else 'border: 1px solid #ffffff1c; color: #ededee'}">{ic('pause' if playing else 'play', 14, '#131416' if playing else '#ededee', 2 if playing else 1.5)}</span>
  <span style="display: flex; flex-direction: column; width: 150px"><span class="v">{name}</span><span class="label">{meta}</span></span>
  <span class="grow">{wave(seed, played)}</span>
  <span class="num" style="width: 40px; text-align: right; font-size: 13px; color: {'#ededee' if playing else '#707277'}">{'0:12' if playing else meta.split('· ')[1]}</span>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="{WARN if fav else 'none'}" stroke="{WARN if fav else '#707277'}" stroke-width="1.5" stroke-linejoin="round" style="flex-shrink: 0">{'<path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.6-5 2.6.9-5.6-4-4 5.6-.8Z"></path>'}</svg>
</div>""" for name, meta, seed, played, playing, fav in takes)
    return f"""<div class="w">
  {head(ic('wave', 18), 'Voice-over · Werbefilm-Intro', 'Deutsch · 3 Takes · ElevenLabs', '<span class="btn">' + ic('download', 14) + 'Take 2 exportieren</span>')}
  <div class="sep rows">{rows}</div>
  <div class="foot"><span>„Präzision, die man hört.“ · 48 Wörter</span><span>Markiert: Take 2</span></div>
</div>"""


# ── 18 Kampagnen-KPIs ───────────────────────────────────────────────────────
def campaign():
    kpis = [('Umsatz', '4.820 €', '+18 %', 'pos'), ('ROAS', '3,4', '+0,4', 'pos'), ('CTR', '1,80 %', '−0,3 Pp.', 'neg'), ('Conversion-Rate', '2,59 %', '±0', 'mute')]
    cells = ''.join(f'<div class="stat"><span class="label">{k}</span><b>{v}</b><span class="pill {c}" style="align-self: flex-start; margin-top: 2px">{d}</span></div>' for k, v, d, c in kpis)
    funnel = [('Impressionen', 184200, '184.200', ''), ('Klicks', 3316, '3.316', '1,8 %'), ('In den Warenkorb', 410, '410', '12,4 %'), ('Käufe', 86, '86', '21,0 %')]
    bars = []
    for i, (n, v, s, rate) in enumerate(funnel):
        width = max(3, (math.log10(v) / math.log10(184200)) ** 3 * 100)
        col = POS if i == 3 else '#ededee'
        bars.append(f"""<div style="display: flex; align-items: center; gap: 12px; height: 34px">
  <span style="width: 130px; flex: none; font-size: 14px" class="{'v' if i == 3 else 'muted'}">{n}</span>
  <div style="flex: 1; position: relative; height: 22px"><div style="position: absolute; left: 0; top: 0; bottom: 0; width: {width:.1f}%; border-radius: 5px; background: {col}{'33' if i == 3 else '1a'}"></div><span class="num" style="position: absolute; left: 10px; top: 1px; font-size: 13px; color: {col}">{s}</span></div>
  <span class="num dim" style="width: 64px; text-align: right; font-size: 13px">{rate}</span>
</div>""")
    return f"""<div class="w">
  {head(ic('trend', 18), 'Herbst-Sale · Meta Ads', '6. bis 12. September', seg(['7 Tage', '30 Tage', '90 Tage'], 0))}
  <div class="sep grid4 cells">{cells}</div>
  <div class="sep" style="padding: 12px 14px 14px">
    <div style="display: flex; justify-content: space-between; margin-bottom: 4px"><span class="label">Trichter</span><span class="label">Schritt-Quote</span></div>
    {''.join(bars)}
  </div>
  <div class="foot"><span class="num">Ausgaben 1.418 € · Ø Warenkorb 56 € · Vergleich mit der Vorwoche</span><span style="display: flex; align-items: center; gap: 4px">Anzeigen {ic('chevron', 12)}</span></div>
</div>"""


# ── 19 Prüfungskarte ────────────────────────────────────────────────────────
def exam():
    opts = [('A', 'Außenwirtschaftliches Gleichgewicht', ''), ('B', 'Hoher Beschäftigungsstand', 'right'), ('C', 'Gerechte Einkommensverteilung', ''), ('D', 'Erhalt der natürlichen Umwelt', '')]
    boxes = ''.join(f"""<div style="display: flex; align-items: center; gap: 10px; padding: 11px 12px; border-radius: 10px; border: 1px solid {'#88b99b66' if st else '#ffffff14'}; background: {'#88b99b14' if st else 'transparent'}">
  <span style="display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; flex: none; font-size: 12px; font-weight: 600; {'background: #88b99b; color: #101113' if st else 'background: #ffffff0c; color: #999a9d'}">{ic('check', 13, '#101113', 2.6) if st else k}</span>
  <span style="font-size: 14.5px; line-height: 20px; color: {'#ededee' if st else '#999a9d'}">{t}</span></div>""" for k, t, st in opts)
    hist = ['r', 'r', 'w', 'r', 'w', 'r', 'r'] + [''] * 13
    dots = ''.join(f'<i style="flex: 1; height: 4px; border-radius: 2px; background: {POS if h == "r" else NEG if h == "w" else "#ffffff12"}; {"box-shadow: 0 0 0 2px #88b99b33" if i == 6 else ""}"></i>' for i, h in enumerate(hist))
    return f"""<div class="w">
  {head(ic('cap', 18), 'Wirtschaft · Magisches Viereck', 'Prüfungsvorbereitung · Frage 7 von 20', '<span class="pill pos num">5 von 7 richtig</span>')}
  <div style="display: flex; gap: 3px; padding: 0 14px 14px">{dots}</div>
  <div class="sep" style="padding: 16px 14px 14px">
    <div style="font-size: 17px; line-height: 25px; font-weight: 440; text-wrap: pretty">Welches Ziel des magischen Vierecks gerät typischerweise mit der Preisniveaustabilität in Konflikt, wenn die Wirtschaft stark wächst?</div>
    <div class="grid2" style="gap: 8px; margin-top: 14px">{boxes}</div>
    <div style="margin-top: 12px; padding: 12px 14px; border-radius: 10px; background: #ffffff06; font-size: 14px; line-height: 21px"><span style="color: #9fd0b2; font-weight: 500">Richtig.</span> <span class="muted">Sinkt die Arbeitslosigkeit, steigen Löhne und Nachfrage und mit ihnen meist die Preise. Diesen Zusammenhang beschreibt die Phillips-Kurve.</span></div>
  </div>
  <div class="foot" style="padding: 10px 14px"><span class="acts"><span class="btn primary">Nächste Frage{ic('arrow', 14, '#131416')}</span><span class="btn quiet">Genauer erklären</span></span><span>Repetitor · ABK Abschlussprüfung</span></div>
</div>"""


# ── 20 Spieltheorie-Karte ───────────────────────────────────────────────────
def gametheory():
    font = 'font-family="SF Pro Text, -apple-system, sans-serif"'
    def actor(x, y, name, want, col, dashed=False):
        return (f'<rect x="{x}" y="{y}" width="190" height="58" rx="10" fill="#1b1c1f" stroke="{col}" stroke-opacity="{.8 if not dashed else .6}" {"stroke-dasharray=" + chr(34) + "4 4" + chr(34) if dashed else ""}></rect>'
                f'<circle cx="{x + 18}" cy="{y + 21}" r="4" fill="{col}"></circle>'
                f'<text x="{x + 30}" y="{y + 25}" fill="#ededee" font-size="13" font-weight="500" {font}>{name}</text>'
                f'<text x="{x + 14}" y="{y + 45}" fill="#8f9094" font-size="11.5" {font}>{want}</text>')
    svg = f"""<svg width="706" height="220" viewBox="0 0 706 220" style="display: block">
  <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#ffffff66"></path></marker>
  <marker id="aw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="{WARN}"></path></marker></defs>
  {actor(20, 30, 'Du', 'Mehr Gehalt, sicher bleiben', '#ededee')}
  {actor(496, 30, 'Ausbildungsbetrieb', 'Dich halten, aber günstig', INFO)}
  {actor(258, 150, 'Anderes Angebot', 'Noch nicht bekannt', WARN, True)}
  <path d="M216 50 C300 34 400 34 490 50" fill="none" stroke="#ffffff40" stroke-width="1.5" marker-end="url(#ah)"></path>
  <text x="353" y="30" text-anchor="middle" fill="#999a9d" font-size="11.5" {font}>will mehr Gehalt</text>
  <path d="M490 74 C400 90 300 90 216 74" fill="none" stroke="#ffffff40" stroke-width="1.5" marker-end="url(#ah)"></path>
  <text x="353" y="104" text-anchor="middle" fill="#999a9d" font-size="11.5" {font}>will Einarbeitung nicht verlieren</text>
  <path d="M452 168 C500 150 560 120 585 94" fill="none" stroke="{WARN}" stroke-opacity=".7" stroke-width="1.5" stroke-dasharray="3 4" marker-end="url(#aw)"></path>
  <text x="560" y="160" fill="#e3c285" font-size="11.5" {font}>würde Druck machen</text>
</svg>"""
    return f"""<div class="w">
  {head(ic('people', 18), 'Gehaltsgespräch nach der Ausbildung', 'Strategische Lage · 3 Beteiligte', '<span class="btn">Ganzen Bericht öffnen</span>')}
  <div class="sep" style="padding: 6px 0 0">{svg}</div>
  <div style="padding: 0 14px 14px">
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px"><span class="label">Du brauchst ihn mehr</span><span style="font-size: 13px" class="v">Wer braucht wen mehr?</span><span class="label">Er braucht dich mehr</span></div>
    <div style="position: relative; height: 14px">
      <div style="position: absolute; left: 0; right: 0; top: 5px; height: 4px; border-radius: 2px; background: #ffffff10"></div>
      <div style="position: absolute; left: 50%; top: 1px; width: 1px; height: 12px; background: #ffffff30"></div>
      <div style="position: absolute; left: 50%; width: 8%; top: 5px; height: 4px; background: {INFO}; opacity: .7"></div>
      <div style="position: absolute; left: calc(58% - 6px); top: 1px; width: 12px; height: 12px; border-radius: 50%; background: {INFO}; box-shadow: 0 0 0 4px #6aa8ff26"></div>
    </div>
    <div class="muted" style="font-size: 13px; line-height: 19px; margin-top: 8px">Leicht beim Betrieb: Dich neu zu besetzen kostet ihn Monate.</div>
  </div>
  <div style="margin: 0 14px 14px; padding: 12px 14px; border-radius: 10px; background: #ffffff08; display: flex; gap: 10px">
    {ic('spark', 16, '#ededee')}
    <div style="font-size: 14.5px; line-height: 22px"><span class="v">Mach das andere Angebot sichtbar, bevor du eine Zahl nennst.</span> <span class="muted">Nenn dann einen festen Betrag statt einer Spanne, sonst landet ihr am unteren Ende.</span></div>
  </div>
</div>"""


WIDGETS = [
    ('Entscheidung', 'Welche Entscheidungen sind noch offen?', decision, activity('book', 'DEC-2026-09-06-01 aus 50-Entscheidungen gelesen'), '', 560),
    ('Orte', 'Lass uns die Orte aus dem Fotoimport benennen.', places, '', '', 560),
    ('Tageszeitleiste', 'Was habe ich gestern gemacht?', dayline, '', '', 470),
    ('Job-Treffer', 'Gibt es neue Stellen für mein Profil?', jobs, activity('briefcase', 'Job-Recherche über 23 Quellen ausgeführt'), '', 560),
    ('Figma-Abgleich', 'Prüf den Header von Nordwind Clips gegen Figma.', figma_compare, '', '', 520),
    ('Farbpalette', 'Zeig mir die Grundfarben von Cortex mit Kontrast.', palette, '', '', 440),
    ('Audio-Takes', 'Mach drei Takes für das Voice-over-Intro.', audio, '', '', 400),
    ('Kampagne', 'Wie läuft der Herbst-Sale diese Woche?', campaign, '', '', 480),
    ('Prüfung', 'Frag mich was zum magischen Viereck.', exam, '', '', 580),
    ('Spieltheorie', 'Wie gehe ich ins Gehaltsgespräch nach der Ausbildung?', gametheory, activity('spark', 'Situation spieltheoretisch zerlegt'), '', 640),
]
