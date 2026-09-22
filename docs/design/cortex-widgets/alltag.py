"""Die zehn Alltags-Widgets, je mit einem Beispiel."""
import math
from base import (POS, NEG, WARN, INFO, VIOLET, ic, head, seg, chk, activity, walk, spark, board)


# ── 1 Wetter ────────────────────────────────────────────────────────────────
def weather_art(size=76):
    return f"""<svg width="{size}" height="{size}" viewBox="0 0 76 76" style="display: block">
  <circle cx="46" cy="28" r="13" fill="{WARN}" fill-opacity=".16"></circle>
  <circle cx="46" cy="28" r="8.5" fill="{WARN}"></circle>
  <path d="M46 11v4M46 41v4M29 28h4M59 28h4M34 16l2.8 2.8M55.2 37.2 58 40M34 40l2.8-2.8M55.2 18.8 58 16" stroke="{WARN}" stroke-width="2" stroke-linecap="round"></path>
  <path d="M22 60h28a10 10 0 0 0 1.5-19.9A13.5 13.5 0 0 0 25.3 37 11.5 11.5 0 0 0 22 60Z" fill="#2a2b2e" stroke="#c9cacd" stroke-width="1.6" stroke-linejoin="round"></path>
</svg>"""


def weather():
    hours = [('14', 17, 10), ('15', 16, 40), ('16', 15, 70), ('17', 15, 80), ('18', 14, 60), ('19', 14, 30), ('20', 13, 10), ('21', 13, 0)]
    cells = []
    for i, (h, t, p) in enumerate(hours):
        glyph = 'rain' if p >= 50 else 'cloud' if p >= 30 else 'sun'
        col = INFO if glyph == 'rain' else WARN if glyph == 'sun' else '#c9cacd'
        now = i == 0
        cells.append(f"""<div style="display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 0 12px; border-radius: 8px; {'background: #ffffff08' if now else ''}">
  <span class="label num" style="{'color: #ededee' if now else ''}">{'Jetzt' if now else h + ' Uhr'}</span>
  {ic(glyph, 18, col)}
  <span class="num" style="font-size: 15px; line-height: 20px">{t}°</span>
  <span style="display: flex; align-items: flex-end; height: 22px"><i style="display: block; width: 4px; height: {max(2, p * 0.22):.0f}px; border-radius: 2px; background: {INFO if p else '#ffffff1a'}; opacity: {0.35 + p / 160:.2f}"></i></span>
  <span class="num" style="font-size: 12px; line-height: 16px; color: {'#8dbcff' if p >= 50 else '#707277'}">{p} %</span>
</div>""")
    return f"""<div class="w">
  <div style="display: flex; align-items: center; gap: 20px; padding: 18px 18px 6px 20px">
    <div class="grow">
      <div class="label" style="display: flex; align-items: center; gap: 5px">{ic('pin', 13)}Frankfurt-Bornheim · Sonntag, 13. September</div>
      <div style="display: flex; align-items: baseline; gap: 14px; margin-top: 6px">
        <span class="num" style="font-size: 56px; line-height: 60px; font-weight: 250; letter-spacing: -2px">17°</span>
        <span style="display: flex; flex-direction: column"><span style="font-size: 15px">Leicht bewölkt</span><span class="muted" style="font-size: 13.5px; line-height: 19px">Ab 16 Uhr Regen</span></span>
      </div>
    </div>
    {weather_art()}
  </div>
  <div style="display: flex; gap: 18px; padding: 6px 20px 14px" class="muted num">
    <span style="font-size: 13px">Hoch <span class="v">19°</span></span><span style="font-size: 13px">Tief <span class="v">12°</span></span>
    <span style="font-size: 13px">Wind <span class="v">14 km/h W</span></span><span style="font-size: 13px">Regen <span class="v">3,2 mm</span></span>
  </div>
  <div class="grid4" style="grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 4px; padding: 0 10px 10px">{''.join(cells)}</div>
  <div class="foot"><span>Open-Meteo · aktualisiert 14:05</span><span style="display: flex; align-items: center; gap: 4px">7 Tage {ic('chevron', 12)}</span></div>
</div>"""


# ── 2 Timer ─────────────────────────────────────────────────────────────────
def timer():
    r, frac = 58, 1122 / 1500
    c = 2 * math.pi * r
    ang = -math.pi / 2 + 2 * math.pi * frac
    ex, ey = 70 + r * math.cos(ang), 70 + r * math.sin(ang)
    ticks = ''.join(
        f'<path d="M{70 + 66 * math.cos(a):.1f} {70 + 66 * math.sin(a):.1f}L{70 + 69 * math.cos(a):.1f} {70 + 69 * math.sin(a):.1f}" stroke="#ffffff26" stroke-width="1"></path>'
        for a in [-math.pi / 2 + k * 2 * math.pi / 25 for k in range(25)])
    ring = f"""<svg width="140" height="140" viewBox="0 0 140 140" style="display: block">
  {ticks}
  <circle cx="70" cy="70" r="{r}" fill="none" stroke="#ffffff12" stroke-width="5"></circle>
  <circle cx="70" cy="70" r="{r}" fill="none" stroke="#ededee" stroke-width="5" stroke-linecap="round" stroke-dasharray="{c * frac:.1f} {c:.1f}" transform="rotate(-90 70 70)"></circle>
  <circle cx="{ex:.1f}" cy="{ey:.1f}" r="8" fill="#ededee" fill-opacity=".14"></circle>
  <circle cx="{ex:.1f}" cy="{ey:.1f}" r="3.5" fill="#ededee"></circle>
</svg>"""
    return f"""<div class="w">
  <div style="display: flex; align-items: center; gap: 26px; padding: 18px 20px">
    <div style="position: relative; width: 140px; height: 140px; flex: none">{ring}
      <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center">
        <span class="num" style="font-size: 30px; line-height: 34px; font-weight: 300; letter-spacing: -.5px">18:42</span>
        <span class="label num">von 25:00</span>
      </div>
    </div>
    <div class="grow" style="display: flex; flex-direction: column; gap: 4px">
      <span class="pill mute" style="align-self: flex-start">{ic('timer', 12)}Läuft</span>
      <span style="font-size: 20px; line-height: 28px; font-weight: 440; margin-top: 6px">Fokus</span>
      <span class="muted num" style="font-size: 13.5px; line-height: 19px">Endet um 15:07 · danach 5 Minuten Pause</span>
      <div style="display: flex; gap: 6px; margin-top: 14px">
        <span class="btn primary">{ic('pause', 14)}Pause</span><span class="btn">+1 min</span><span class="btn quiet">Beenden</span>
      </div>
    </div>
  </div>
</div>"""


# ── 3 HVV-Abfahrten ─────────────────────────────────────────────────────────
def departures():
    rows = [('S1', '#2f9e5b', 'Poppenbüttel', 'Gleis 3', '2', None),
            ('S2', '#b0413e', 'Bergedorf', 'Gleis 4', '5', '+3'),
            ('S1', '#2f9e5b', 'Wedel', 'Gleis 1', '7', None),
            ('S3', '#7a4d9c', 'Pinneberg', 'Gleis 2', '11', None)]
    body = ''.join(f"""<div class="row" style="min-height: 48px">
  <span class="tile" style="width: 34px; height: 22px; background: {col}; color: #fff; font-size: 12.5px">{line}</span>
  <span class="grow v">{dest}</span>
  <span class="dim" style="font-size: 13px">{track}</span>
  {f'<span class="pill neg">{delay} min</span>' if delay else '<span class="pill mute">pünktlich</span>'}
  <span class="num" style="width: 64px; text-align: right"><span class="v" style="font-size: 17px">{mins}</span> <span class="dim" style="font-size: 13px">min</span></span>
</div>""" for line, col, dest, track, mins, delay in rows)
    return f"""<div class="w">
  {head(ic('train', 18), 'Bornheim', f'<span class="dot" style="background: {POS}"></span>Live · S-Bahn und Regionalverkehr', seg(['Alle', 'S-Bahn', 'Bus'], 1))}
  <div class="sep rows" style="padding: 4px 0">{body}</div>
  <div class="foot"><span>HVV Geofox · aktualisiert 14:31</span><span>Weitere Abfahrten</span></div>
</div>"""


# ── 4 Umrechner ─────────────────────────────────────────────────────────────
def converter():
    def side(label, amount, cur, sym):
        return f"""<div class="box grow" style="padding: 12px 14px 14px">
  <div class="label">{label}</div>
  <div style="display: flex; align-items: center; gap: 10px; margin-top: 6px">
    <span class="num grow" style="font-size: 28px; line-height: 34px; font-weight: 300; letter-spacing: -.5px">{amount}</span>
    <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px 4px 5px; border-radius: 8px; background: #ffffff0c; font-size: 14px"><span class="tile" style="width: 20px; height: 20px; border-radius: 5px; background: #ffffff14; font-size: 11px">{sym}</span>{cur}{ic('chevronDown', 12)}</span>
  </div>
</div>"""
    chips = ''.join(f'<span class="pill {"mute" if v != "250" else ""}" style="height: 26px; padding: 0 10px; font-size: 13px; {"background: #ffffff14; color: #ededee" if v == "250" else ""}">{v} €</span>' for v in ['50', '100', '250', '500', '1.000'])
    return f"""<div class="w">
  <div class="pad" style="display: flex; align-items: center; gap: 10px">
    {side('Du gibst', '250,00', 'EUR', '€')}
    <span style="display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; border: 1px solid #ffffff1c; color: #999a9d; flex: none">{ic('swap', 15)}</span>
    {side('Du bekommst', '1.865,13', 'DKK', 'kr')}
  </div>
  <div style="display: flex; align-items: center; gap: 6px; padding: 0 14px 14px">{chips}</div>
  <div class="foot"><span class="num">1 EUR = <span class="muted">7,4605 DKK</span> · 1 DKK = <span class="muted">0,1340 EUR</span></span><span>EZB-Referenzkurs vom 11.09.</span></div>
</div>"""


# ── 5 Sendungsverfolgung ────────────────────────────────────────────────────
def parcel():
    steps = [('Abgeholt', 'Mi, 17:05', 'Leipzig', 'done'), ('Im Paketzentrum', 'Do, 22:40', 'Frankfurt', 'done'),
             ('In Zustellung', 'Heute, 09:12', 'Frankfurt-Bornheim', 'now'), ('Zugestellt', 'Heute, 13–16 Uhr', 'Voraussichtlich', 'next')]
    nodes = []
    for i, (t, when, where, st) in enumerate(steps):
        dot = (f'<span style="position: relative; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #ededee; color: #131416">{ic("check", 12, "#131416", 2.4)}</span>' if st == 'done'
               else f'<span style="display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: {INFO}33"><i style="width: 10px; height: 10px; border-radius: 50%; background: {INFO}; box-shadow: 0 0 0 4px {INFO}26"></i></span>' if st == 'now'
               else '<span style="width: 22px; height: 22px; border-radius: 50%; border: 1.5px dashed #ffffff38; box-sizing: border-box"></span>')
        nodes.append(f"""<div style="display: flex; flex-direction: column; gap: 10px; position: relative; z-index: 1">
  {dot}
  <div style="display: flex; flex-direction: column"><span style="font-size: 14px; line-height: 20px; {'color: #707277' if st == 'next' else ''}">{t}</span><span class="label num">{when}</span><span class="label">{where}</span></div>
</div>""")
    return f"""<div class="w">
  {head(ic('package', 18), 'DHL Paket', '<span class="mono num" style="font-size: 12.5px">00340 4343 1874 2291 05</span>', '<span class="pill info">In Zustellung</span>')}
  <div class="sep" style="padding: 16px 18px 6px">
    <div class="label">Voraussichtliche Zustellung</div>
    <div style="font-size: 22px; line-height: 30px; font-weight: 440; margin-top: 2px">Heute zwischen 13 und 16 Uhr</div>
  </div>
  <div style="position: relative; padding: 16px 18px 18px">
    <div style="position: absolute; left: 29px; width: 350px; top: 26px; height: 2px; background: #ededee"></div>
    <div style="position: absolute; left: 379px; width: 175px; top: 26px; height: 0; border-top: 2px dashed #ffffff26"></div>
    <div class="grid4">{''.join(nodes)}</div>
  </div>
  <div class="foot"><span>Absender: Musikhaus Leipzig</span><span style="display: flex; align-items: center; gap: 4px">Sendungsverlauf {ic('chevron', 12)}</span></div>
</div>"""


# ── 6 To-do-Liste ───────────────────────────────────────────────────────────
def todo():
    items = [(False, 'HVV-Zugang für Geofox beantragen', '<span class="pill warn">Heute</span>'),
             (False, 'LiveSync-Plugin in Obsidian einrichten', '<span class="pill mute">Exokortex</span>'),
             (False, 'Ortsgruppen aus dem Fotoimport benennen', '<span class="pill mute">Exokortex</span>'),
             (True, 'Widget-Liste für Cortex festlegen', ''),
             (True, 'Wirtschaftsfragen für die Prüfung wiederholen', '')]
    rows = ''.join(f"""<div class="row" style="min-height: 44px">{chk(done)}<span class="grow" style="{'color: #707277; text-decoration: line-through; text-decoration-color: #ffffff30' if done else 'color: #ededee'}">{t}</span>{tag}</div>""" for done, t, tag in items)
    return f"""<div class="w">
  {head(ic('list', 18), 'Heute', '<span class="num">2 von 5 erledigt</span>', '<div class="meter" style="width: 96px"><i style="width: 40%"></i></div>')}
  <div class="sep rows" style="padding: 4px 0">{rows}
    <div class="row" style="min-height: 44px; color: #707277">{ic('plus', 16)}<span>Aufgabe hinzufügen</span></div>
  </div>
</div>"""


# ── 7 Mini-Karte ────────────────────────────────────────────────────────────
def minimap():
    streets = ''.join([
        '<path d="M0 40 C120 52 260 30 420 46 S640 70 736 58" stroke="#ffffff14" stroke-width="7" fill="none"></path>',
        '<path d="M0 96 C160 90 300 110 470 98 S640 84 736 92" stroke="#ffffff12" stroke-width="5" fill="none"></path>',
        '<path d="M90 0 L120 200" stroke="#ffffff0e" stroke-width="4"></path><path d="M250 0 L236 190" stroke="#ffffff0e" stroke-width="4"></path>',
        '<path d="M380 0 L410 175" stroke="#ffffff0e" stroke-width="4"></path><path d="M560 0 L540 170" stroke="#ffffff0e" stroke-width="4"></path>',
        '<path d="M660 0 L700 165" stroke="#ffffff0e" stroke-width="3"></path><path d="M0 140 C200 132 420 150 736 128" stroke="#ffffff10" stroke-width="3" fill="none"></path>',
        '<path d="M170 0 L180 150M320 20 L300 160M470 10 L480 150M610 0 L620 140" stroke="#ffffff08" stroke-width="2"></path>',
    ])
    route = 'M112 104 C160 112 196 124 236 128 S330 138 380 142 S470 150 520 156 S600 164 640 158'
    svg = f"""<svg width="736" height="230" viewBox="0 0 736 230" style="display: block">
  <rect width="736" height="230" fill="#141518"></rect>
  {streets}
  <path d="M0 186 C180 170 360 196 520 182 S700 170 736 176 V230 H0 Z" fill="#6aa8ff" fill-opacity=".09"></path>
  <text x="560" y="214" fill="#6aa8ff" fill-opacity=".45" font-size="11" font-family="SF Pro Text, -apple-system, sans-serif" letter-spacing="1">Elbe</text>
  <path d="{route}" stroke="#ededee" stroke-opacity=".14" stroke-width="9" fill="none" stroke-linecap="round"></path>
  <path d="{route}" stroke="#ededee" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-dasharray="0.1 6"></path>
  <circle cx="112" cy="104" r="7" fill="#101113" stroke="#ededee" stroke-width="2.5"></circle>
  <circle cx="640" cy="158" r="14" fill="{INFO}" fill-opacity=".2"></circle>
  <circle cx="640" cy="158" r="6" fill="{INFO}" stroke="#101113" stroke-width="2"></circle>
  <rect x="62" y="70" width="100" height="22" rx="6" fill="#1b1c1f" stroke="#ffffff1a"></rect>
  <text x="112" y="85" text-anchor="middle" fill="#ededee" font-size="12" font-family="SF Pro Text, -apple-system, sans-serif">Bornheim</text>
  <rect x="566" y="120" width="148" height="22" rx="6" fill="#1b1c1f" stroke="#ffffff1a"></rect>
  <text x="640" y="135" text-anchor="middle" fill="#ededee" font-size="12" font-family="SF Pro Text, -apple-system, sans-serif">Paulskirche</text>
</svg>"""
    return f"""<div class="w">
  {svg}
  <div class="wh" style="border-top: 1px solid #ffffff10">
    <div class="mark" style="color: {INFO}">{ic('pin', 18)}</div>
    <div class="wt"><strong>Paulskirche</strong><small class="num">Innenstadt · 2,1 km am Mainufer entlang</small></div>
    <div class="acts">{seg(['Zu Fuß 26 min', 'Rad 9 min', 'Bus 14 min'], 0)}<span class="btn">{ic('external', 14)}In Karten öffnen</span></div>
  </div>
  <div class="foot"><span>© OpenStreetMap-Mitwirkende</span><span class="num">Ankunft 15:00</span></div>
</div>"""


# ── 8 Kalenderansicht ───────────────────────────────────────────────────────
def calendar():
    days = ['Mo 14', 'Di 15', 'Mi 16', 'Do 17', 'Fr 18']
    start, px = 8, 30
    ev = [  # Tag, von, bis, Titel, Farbe
        (0, 8, 13, 'Berufsschule', VIOLET), (0, 15, 16.5, 'Sport', POS),
        (1, 9, 17, 'Betrieb · Kampagnenplanung', INFO),
        (2, 8, 13, 'Berufsschule', VIOLET), (2, 14, 15.5, 'Prüfung lernen', VIOLET),
        (3, 9, 17, 'Betrieb', INFO), (3, 10.5, 12, 'Team PANTA', '#ededee'),
        (4, 9, 12, 'Cortex · Widgets bauen', '#ededee'), (4, 18, 19.5, 'Abendessen', POS),
    ]
    hours = ''.join(f'<div class="label num" style="position: absolute; left: 0; top: {(h - start) * px - 7}px; width: 36px; text-align: right">{h:02d}</div>'
                    f'<div style="position: absolute; left: 48px; right: 0; top: {(h - start) * px}px; border-top: 1px solid #ffffff0a"></div>' for h in range(start, 21, 2))
    colw = 'calc((100% - 48px) / 5)'
    blocks = []
    for d, a, b, t, c in ev:
        overlap = d == 3 and t == 'Team PANTA'
        left = f'calc(48px + {colw} * {d} + {colw} * .3)' if overlap else f'calc(48px + {colw} * {d} + 3px)'
        width = f'calc({colw} * .7 - 3px)' if overlap else f'calc({colw} - 6px)'
        txt = '#ededee' if c == '#ededee' else c
        blocks.append(f"""<div style="position: absolute; left: {left}; width: {width}; top: {(a - start) * px + 1}px; height: {(b - a) * px - 3}px; box-sizing: border-box; padding: 4px 7px; border-radius: 6px; background: {c}{'1f' if c != '#ededee' else '14'}; {'box-shadow: 0 0 0 1.5px #1a1b1e' if overlap else ''}; overflow: hidden">
  <div style="font-size: 12px; line-height: 15px; font-weight: 500; color: {txt}; white-space: {'nowrap' if b - a <= 1.5 else 'normal'}; overflow: hidden; text-overflow: ellipsis">{t}</div>
  <div class="num" style="font-size: 11px; line-height: 14px; color: {txt}; opacity: .7; white-space: nowrap">{int(a):02d}:{int(a % 1 * 60):02d}–{int(b):02d}:{int(b % 1 * 60):02d}</div>
</div>""")
    header = ''.join(f'<div style="padding: 0 0 8px 3px; font-size: 13px; color: {"#ededee" if i == 0 else "#999a9d"}">{d}</div>' for i, d in enumerate(days))
    return f"""<div class="w">
  {head(ic('calendar', 18), 'Woche 38', '14.–18. September 2026', f'{seg(["Tag", "Woche", "Monat"], 1)}<span class="btn quiet" style="padding: 5px">{ic("chevronLeft", 14)}</span><span class="btn quiet" style="padding: 5px">{ic("chevron", 14)}</span>')}
  <div class="sep" style="padding: 12px 14px 16px">
    <div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); margin-left: 48px">{header}</div>
    <div style="position: relative; height: {12 * px}px">{hours}{''.join(blocks)}</div>
  </div>
  <div class="foot"><span style="display: flex; gap: 14px"><span style="display: flex; align-items: center; gap: 6px"><span class="dot" style="background: {VIOLET}"></span>Schule</span><span style="display: flex; align-items: center; gap: 6px"><span class="dot" style="background: {INFO}"></span>Betrieb</span><span style="display: flex; align-items: center; gap: 6px"><span class="dot" style="background: {POS}"></span>Privat</span><span style="display: flex; align-items: center; gap: 6px"><span class="dot" style="background: #ededee"></span>Projekte</span></span><span>Google Kalender</span></div>
</div>"""


# ── 9 Kurs-Sparkline ────────────────────────────────────────────────────────
def ticker():
    raw = walk(7, 72, 0, 260)
    main = [94144 + v - raw[0] + (i / 71) * (96412 - 94144 - (raw[-1] - raw[0])) for i, v in enumerate(raw)]
    small = [('ETH', 'Ethereum', '2.312,40 €', '−1,12 %', NEG, walk(3, 30, 2340, 12, -1.2)),
             ('NVDA', 'Nvidia', '158,40 €', '+0,86 %', POS, walk(11, 30, 157, .6, .05))]
    rows = ''.join(f"""<div class="row" style="min-height: 52px">
  <span class="tile" style="width: 28px; height: 28px; border-radius: 7px; background: #ffffff0c; font-size: 9.5px">{sym}</span>
  <span class="grow" style="display: flex; flex-direction: column"><span class="v" style="font-size: 14.5px">{name}</span><span class="label">{sym}</span></span>
  {spark(vals, 120, 28, col, area=False, glow=False, sw=1.3)}
  <span class="num v" style="width: 96px; text-align: right">{price}</span>
  <span class="pill {'pos' if col == POS else 'neg'}" style="width: 62px; justify-content: center">{chg}</span>
</div>""" for sym, name, price, chg, col, vals in small)
    axis = ''.join(f'<span class="label num">{t}</span>' for t in ['00:00', '06:00', '12:00', '18:00', 'Jetzt'])
    return f"""<div class="w">
  {head('BTC', 'Bitcoin', 'BTC · EUR', seg(['1T', '1W', '1M', '1J', 'Max'], 0), 'font-size: 10.5px')}
  <div style="padding: 4px 14px 0 14px">
    <div style="display: flex; align-items: baseline; gap: 10px">
      <span class="num" style="font-size: 34px; line-height: 40px; font-weight: 300; letter-spacing: -.8px">96.412<span class="muted" style="font-size: 22px">,18 €</span></span>
      <span class="pill pos">{ic('trend', 12)}+2,41 %</span><span class="muted num" style="font-size: 13.5px">+2.268 € seit gestern</span>
    </div>
    <div style="position: relative; margin-top: 12px">
      {spark(main, 706, 132, POS, ref=94144, uid='btc')}
    </div>
    <div style="display: flex; justify-content: space-between; padding: 6px 2px 10px">{axis}</div>
    <div class="label num" style="display: flex; align-items: center; gap: 8px; padding: 0 2px 12px"><svg width="18" height="2" style="display: block"><path d="M0 1H18" stroke="#ffffff66" stroke-dasharray="1 3"></path></svg>Schlusskurs gestern 94.144 €</div>
  </div>
  <div class="sep rows" style="padding: 2px 0">{rows}</div>
  <div class="foot"><span>CoinGecko · Aktien über Alpha Vantage</span><span>Verzögert bis 15 min</span></div>
</div>"""


# ── 10 Weltuhr ──────────────────────────────────────────────────────────────
def worldclock():
    cities = [('Frankfurt', 'Hier', '14:32', 14.53, 6.9, 19.55, ''),
              ('New York', '−6 Std', '08:32', 8.53, 6.7, 19.1, ''),
              ('Bogotá', '−7 Std', '07:32', 7.53, 5.75, 17.9, ''),
              ('Tokio', '+7 Std', '21:32', 21.53, 5.4, 17.9, ''),
              ('Sydney', '+8 Std', '22:32', 22.53, 5.9, 17.7, '')]
    rows = []
    for name, off, time, now, rise, sset, _ in cities:
        day = rise <= now <= sset
        here = off == 'Hier'
        track = f"""<div style="position: relative; width: 300px; height: 20px; flex: none">
  <div style="position: absolute; left: 0; right: 0; top: 8px; height: 4px; border-radius: 2px; background: #ffffff0c"></div>
  <div style="position: absolute; left: {rise / 24 * 100:.1f}%; width: {(sset - rise) / 24 * 100:.1f}%; top: 8px; height: 4px; border-radius: 2px; background: #ededee; opacity: .22"></div>
  <div style="position: absolute; left: calc({now / 24 * 100:.1f}% - 1px); top: 2px; width: 2px; height: 16px; border-radius: 1px; background: #ededee"></div>
</div>"""
        rows.append(f"""<div class="row" style="min-height: 58px">
  <span class="grow" style="display: flex; flex-direction: column"><span class="v" style="font-size: 15px; display: flex; align-items: center; gap: 8px">{name}{'<span class="pill mute">Hier</span>' if here else ''}</span><span class="label">Sonntag · {'Mitteleuropäische Sommerzeit' if here else off}</span></span>
  {track}
  <span style="display: flex; align-items: center; gap: 8px; width: 108px; justify-content: flex-end">{ic('sun' if day else 'moon', 15, WARN if day else '#999a9d')}<span class="num" style="font-size: 24px; line-height: 30px; font-weight: 300; letter-spacing: -.4px">{time}</span></span>
</div>""")
    scale = ''.join(f'<span class="label num">{t}</span>' for t in ['0', '6', '12', '18', '24'])
    return f"""<div class="w">
  {head(ic('globe', 18), 'Weltuhr', 'Sonntag, 13. September · 14:32 in Frankfurt', '<span class="btn">' + ic('plus', 14) + 'Stadt</span>')}
  <div class="sep rows" style="padding: 2px 0">{''.join(rows)}</div>
  <div class="foot"><span>Balken: Ortszeit 0–24 Uhr, heller Teil ist Tageslicht</span><span style="display: flex; gap: 6px; align-items: center">{ic('sun', 12, WARN)}Tag {ic('moon', 12)}Nacht</span></div>
</div>"""


WIDGETS = [
    ('Wetter', 'Wie wird das Wetter heute in Frankfurt?', weather, activity('globe', 'Wetter für Frankfurt-Bornheim abgerufen'), 'Bis 15 Uhr bleibt es trocken. Wenn du rausgehst, nimm für den Rückweg eine Jacke mit.', 640),
    ('Timer', 'Stell einen Fokus-Timer auf 25 Minuten.', timer, '', '', 330),
    ('Abfahrten', 'Wann fährt die nächste S-Bahn ab Bornheim?', departures, activity('train', 'Abfahrten ab Bornheim abgerufen'), 'Die S1 Richtung Poppenbüttel in 2 Minuten ist die nächste. Die S2 hat 3 Minuten Verspätung.', 520),
    ('Umrechner', 'Wie viel sind 250 Euro in Dänischen Kronen?', converter, '', '', 330),
    ('Sendung', 'Wo ist mein Paket gerade?', parcel, activity('package', 'Sendungsstatus bei DHL abgefragt'), '', 510),
    ('To-do', 'Was steht heute noch an?', todo, '', '', 460),
    ('Karte', 'Wie weit ist es zu Fuß zur Paulskirche?', minimap, '', '', 480),
    ('Kalender', 'Was steht nächste Woche an?', calendar, activity('calendar', 'Termine aus dem Kalender gelesen'), '', 620),
    ('Kurs', 'Wie steht Bitcoin gerade?', ticker, '', '', 600),
    ('Weltuhr', 'Wie spät ist es in New York, Bogotá, Tokio und Sydney?', worldclock, '', '', 520),
]
