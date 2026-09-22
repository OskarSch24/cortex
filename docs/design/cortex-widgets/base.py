"""Gemeinsame Bausteine der Chat-Widgets.

Werte aus engine/packages/vscode/media/cortex.css, Abschnitt „Chat nach Codex“:
Spalte 736 px, Text 15/23, Blase Radius 20 auf #ffffff12, Karte Radius 12 mit
Rand #ffffff12 auf #ffffff06, Kopf 12/12/12/14, Marke 36 px Radius 9, Titel
15/21 · 500, Unterzeile 13,5/19 #8f9094, Knopf 14/20 mit Rand #ffffff1c.

Akzente — nur wo sie etwas bedeuten, angelehnt an die Signalfarben des Fey-Kits,
aber aus den vorhandenen Cortex-Tönen: Grün #88b99b (--cx-green, Status gut),
Rot #e36a6a, Bernstein #d8b36a, Blau #6aa8ff (Links), Violett #9d8fd9.
Gepunktete Bezugslinien, leuchtender Endpunkt, Wert-Pillen mit getönter Fläche.
"""
import random

POS, NEG, WARN, INFO, VIOLET = '#88b99b', '#e36a6a', '#d8b36a', '#6aa8ff', '#9d8fd9'

STYLE = """
<style>
  body { margin: 0; background: #101113; }
  a { color: #6aa8ff; text-decoration: none; } a:hover { color: #9cc5ff; }
  .page { width: 816px; box-sizing: border-box; padding: 40px 40px 48px; background: #101113; color: #ededee;
          font: 15px/23px 'SF Pro Text', -apple-system, 'Helvetica Neue', sans-serif; -webkit-font-smoothing: antialiased; }
  .col { display: flex; flex-direction: column; gap: 14px; width: 736px; }
  .user { display: flex; justify-content: flex-end; margin-bottom: 12px; }
  .bubble { max-width: 70%; padding: 10px 16px 11px; border-radius: 20px; background: #ffffff12; font-size: 15px; line-height: 23px; }
  .line { display: flex; align-items: center; gap: 8px; min-height: 23px; color: #8f9094; font-size: 15px; line-height: 23px; }
  .prose { margin: 0; text-wrap: pretty; }
  .num { font-variant-numeric: tabular-nums; }
  .mono { font-family: 'SF Mono', Menlo, monospace; }
  .w { border: 1px solid #ffffff12; border-radius: 12px; background: #ffffff06; overflow: hidden; }
  .wh { display: flex; align-items: center; gap: 12px; padding: 12px 12px 12px 14px; }
  .mark { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 9px; background: #ffffff0c; color: #ededee; font-size: 11px; font-weight: 600; letter-spacing: -.2px; }
  .wt { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .wt strong { font-size: 15px; line-height: 21px; font-weight: 500; color: #ededee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wt small { display: flex; align-items: center; gap: 6px; font-size: 13.5px; line-height: 19px; color: #8f9094; }
  .acts { display: flex; align-items: center; gap: 6px; flex: none; }
  .btn { display: inline-flex; align-items: center; gap: 6px; flex: none; padding: 5px 10px; border: 1px solid #ffffff1c; border-radius: 8px; color: #ededee; font-size: 14px; line-height: 20px; white-space: nowrap; }
  .btn.primary { background: #eeeef0; border-color: #f4f4f5; color: #131416; font-weight: 500; }
  .btn.quiet { border-color: transparent; color: #999a9d; padding: 5px 8px; }
  .sep { border-top: 1px solid #ffffff10; }
  .pad { padding: 14px; }
  .row { position: relative; display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 0 14px; color: #8f9094; font-size: 14.5px; line-height: 20px; }
  .rows .row + .row::before { content: ''; position: absolute; top: 0; left: 14px; right: 14px; border-top: 1px solid #ffffff0a; }
  .v { color: #ededee; }
  .dim { color: #707277; }
  .muted { color: #999a9d; }
  .grow { flex: 1; min-width: 0; }
  .label { font-size: 12px; line-height: 16px; color: #707277; }
  .pill { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 7px; border-radius: 6px; font-size: 12px; line-height: 20px; font-weight: 500; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .pill.pos { background: #88b99b1f; color: #9fd0b2; }
  .pill.neg { background: #e36a6a1f; color: #f08a8a; }
  .pill.warn { background: #d8b36a1f; color: #e3c285; }
  .pill.info { background: #6aa8ff1f; color: #8dbcff; }
  .pill.violet { background: #9d8fd91f; color: #b5aae6; }
  .pill.mute { background: #ffffff0d; color: #999a9d; }
  .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; flex: none; }
  .meter { position: relative; height: 4px; border-radius: 2px; background: #ffffff1a; overflow: hidden; }
  .meter i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; background: #ededee; }
  .foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 14px 10px; border-top: 1px solid #ffffff10; color: #707277; font-size: 12.5px; line-height: 18px; }
  .seg { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 8px; background: #ffffff08; flex: none; }
  .seg span { padding: 2px 8px; border-radius: 6px; color: #8f9094; font-size: 12.5px; line-height: 20px; white-space: nowrap; }
  .seg span.on { background: #ffffff14; color: #ededee; }
  .box { border: 1px solid #ffffff14; border-radius: 10px; background: #ffffff05; }
  .chk { display: grid; place-items: center; flex: none; width: 16px; height: 16px; border-radius: 5px; border: 1.5px solid #ffffff38; box-sizing: border-box; color: #131416; }
  .chk.on { background: #ededee; border-color: #ededee; }
  .tile { display: grid; place-items: center; flex: none; border-radius: 6px; font-size: 11px; font-weight: 600; color: #ededee; }
  .code { margin: 0; padding: 10px 12px; border-radius: 8px; background: #ffffff08; color: #b9babd; font: 12px/1.55 'SF Mono', Menlo, monospace; white-space: pre; overflow: hidden; }
  .stat { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; }
  .stat b { font-size: 20px; line-height: 26px; font-weight: 440; letter-spacing: -.2px; color: #ededee; font-variant-numeric: tabular-nums; }
  .grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .cells > * + * { border-left: 1px solid #ffffff0a; }
</style>
"""

G = {
    'sun': '<circle cx="12" cy="12" r="4"></circle><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"></path>',
    'cloud': '<path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 9.5a4.5 4.5 0 0 0 0 9Z"></path>',
    'rain': '<path d="M7 15h10a3.6 3.6 0 0 0 .5-7.15A5 5 0 0 0 7.4 6.6 4.2 4.2 0 0 0 7 15Z"></path><path d="m8 18-1 2.5M12 18l-1 2.5M16 18l-1 2.5"></path>',
    'moon': '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z"></path>',
    'timer': '<circle cx="12" cy="13.5" r="7.5"></circle><path d="M12 13.5V9.5M9.5 2.5h5"></path>',
    'train': '<rect x="5" y="3" width="14" height="14" rx="3"></rect><path d="M5 10.5h14M8.5 21l1.5-4M15.5 21 14 17"></path>',
    'swap': '<path d="M4 8h14m-4-4 4 4-4 4M20 16H6m4-4-4 4 4 4"></path>',
    'package': '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z"></path><path d="M4 7.5 12 12l8-4.5M12 12v9M8 5.2l8 4.5"></path>',
    'list': '<path d="M10.5 6H20M10.5 12H20M10.5 18H20"></path><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11"></path><circle cx="5.3" cy="18" r="1.5"></circle>',
    'pin': '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"></path><circle cx="12" cy="10" r="2.3"></circle>',
    'calendar': '<rect x="3.5" y="5" width="17" height="15.5" rx="2"></rect><path d="M3.5 10h17M8 3v4M16 3v4"></path>',
    'trend': '<path d="m3 16 5.5-5.5 4 4L21 6"></path><path d="M15 6h6v6"></path>',
    'globe': '<circle cx="12" cy="12" r="9"></circle><ellipse cx="12" cy="12" rx="4" ry="9"></ellipse><path d="M3 12h18"></path>',
    'clock': '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path>',
    'check': '<path d="m5 12.5 4.5 4.5L19 7.5"></path>',
    'close': '<path d="m6 6 12 12M6 18 18 6"></path>',
    'play': '<path d="M8 5.5v13l10.5-6.5Z"></path>',
    'pause': '<path d="M9 5.5v13M15 5.5v13"></path>',
    'stop': '<rect x="6.5" y="6.5" width="11" height="11" rx="2"></rect>',
    'plus': '<path d="M12 5v14M5 12h14"></path>',
    'chevron': '<path d="m9 5 7 7-7 7"></path>',
    'chevronLeft': '<path d="m15 5-7 7 7 7"></path>',
    'chevronDown': '<path d="m6 9 6 6 6-6"></path>',
    'back': '<path d="M20 12H4m6-6-6 6 6 6"></path>',
    'forward': '<path d="M4 12h16m-6-6 6 6-6 6"></path>',
    'arrow': '<path d="M4 12h16m-6-6 6 6-6 6"></path>',
    'external': '<path d="M14 4h6v6M20 4l-9 9"></path><path d="M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V7.5A1.5 1.5 0 0 1 5.5 6H10"></path>',
    'refresh': '<path d="M20 10a8 8 0 1 0-1 7M20 4v6h-6"></path>',
    'dots': '<circle cx="5" cy="12" r="1.15" fill="currentColor" stroke="none"></circle><circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"></circle><circle cx="19" cy="12" r="1.15" fill="currentColor" stroke="none"></circle>',
    'terminal': '<path d="m4 5 6 6-6 6m9 1h7"></path>',
    'file': '<path d="M5 3h9l5 5v13H5Z"></path><path d="M14 3v6h5"></path>',
    'folder': '<path d="M3 19V6.4a1 1 0 0 1 1-1h4.5l2 2H20a1 1 0 0 1 1 1V19Z"></path>',
    'bolt': '<path d="m13 2-8 12h6l-1 8 9-13h-7Z"></path>',
    'branch': '<circle cx="6" cy="5" r="2"></circle><circle cx="18" cy="5" r="2"></circle><circle cx="6" cy="19" r="2"></circle><path d="M6 7v10m0-3c8 0 12-2 12-7"></path>',
    'search': '<circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 4 4"></path>',
    'panel': '<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M15 4v16"></path>',
    'compose': '<path d="M17 3.5 20.5 7 11 16.5l-4.4.9.9-4.4Z"></path><path d="M4 21h16"></path>',
    'plug': '<path d="M9 2.5v5.5M15 2.5v5.5"></path><path d="M6 8h12v2.6a6 6 0 0 1-12 0Z"></path><path d="M12 16.6V21.5"></path>',
    'archive': '<rect x="3" y="4" width="18" height="4.5" rx="1"></rect><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M10 12.5h4"></path>',
    'server': '<rect x="3.5" y="4" width="17" height="7" rx="1.8"></rect><rect x="3.5" y="13" width="17" height="7" rx="1.8"></rect><path d="M7 7.5h.01M7 16.5h.01"></path>',
    'upload': '<path d="M12 15V4m-5 5 5-5 5 5"></path><path d="M4 16v3a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-3"></path>',
    'shield': '<path d="M12 3 19.5 6v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6Z"></path><path d="m8.8 12 2.3 2.3 4.2-4.3"></path>',
    'download': '<path d="M12 4v11m-5-5 5 5 5-5"></path><path d="M4 17v2a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2"></path>',
    'flow': '<rect x="3" y="4" width="6" height="5" rx="1.2"></rect><rect x="15" y="4" width="6" height="5" rx="1.2"></rect><rect x="9" y="15" width="6" height="5" rx="1.2"></rect><path d="M9 6.5h6M18 9v2.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9M12 12.5V15"></path>',
    'database': '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"></ellipse><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"></path>',
    'node': '<circle cx="12" cy="12" r="3"></circle><circle cx="5" cy="5" r="1.8"></circle><circle cx="19" cy="6" r="1.8"></circle><circle cx="18" cy="19" r="1.8"></circle><path d="m6.3 6.3 3.5 3.5M17.6 7.1l-3.4 3M16.8 17.6l-2.7-3.4"></path>',
    'scale': '<path d="M12 4v16M8 20h8M5 7h14"></path><path d="m5 7-2.5 6a2.5 2.5 0 0 0 5 0Zm14 0-2.5 6a2.5 2.5 0 0 0 5 0Z"></path>',
    'image': '<rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><circle cx="9" cy="10" r="1.7"></circle><path d="m20.5 16-4.5-4.5L6 20"></path>',
    'bars': '<path d="M4 6h9M8 12h12M4 18h7"></path>',
    'briefcase': '<rect x="3.5" y="7" width="17" height="12.5" rx="2"></rect><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17"></path>',
    'compare': '<rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><path d="M12 2.5v19"></path>',
    'drop': '<path d="M12 3.5s6 6.2 6 10.5a6 6 0 0 1-12 0c0-4.3 6-10.5 6-10.5Z"></path>',
    'wave': '<path d="M3 12h1.5M7 8.5v7M11 5v14M15 9v6M19 7v10"></path>',
    'funnel': '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8Z"></path>',
    'cap': '<path d="m2.5 9.5 9.5-5 9.5 5-9.5 5Z"></path><path d="M6.5 11.6V16c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3v-4.4M21.5 9.5v5"></path>',
    'people': '<circle cx="8.5" cy="8" r="3"></circle><circle cx="16.5" cy="9.5" r="2.5"></circle><path d="M3 19.5c.5-3 2.8-5 5.5-5s5 2 5.5 5M14.5 14.6c3-.6 5.8 1.3 6.5 4.4"></path>',
    'star': '<path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.6-5 2.6.9-5.6-4-4 5.6-.8Z"></path>',
    'spark': '<path d="M12 3.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5Z"></path>',
    'gauge': '<path d="M4 17a8 8 0 1 1 16 0"></path><path d="m12 17 4-5"></path>',
    'book': '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z"></path>',
    'spinner': '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5"></path>',
    'alert': '<path d="M12 4 21 19.5H3Z"></path><path d="M12 10v4M12 17h.01"></path>',
    'circle': '<circle cx="12" cy="12" r="8"></circle>',
}


def ic(name, size=16, color='currentColor', width=1.5):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" '
            f'stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0">{G[name]}</svg>')


def head(mark, title, sub, right='', mark_style=''):
    return f"""<div class="wh"><div class="mark" style="{mark_style}">{mark}</div>
  <div class="wt"><strong>{title}</strong><small>{sub}</small></div>{f'<div class="acts">{right}</div>' if right else ''}</div>"""


def seg(items, on):
    return '<div class="seg">' + ''.join(f'<span class="{"on" if i == on else ""}">{t}</span>' for i, t in enumerate(items)) + '</div>'


def chk(on):
    return f'<span class="chk{" on" if on else ""}">{ic("check", 11, "#131416", 2.4) if on else ""}</span>'


def activity(glyph, text):
    return f'<div class="line">{ic(glyph, 16)}<span>{text}</span></div>'


def walk(seed, n, start, vol, drift=0.0):
    rnd = random.Random(seed)
    out, v = [], start
    for _ in range(n):
        v += rnd.gauss(drift, vol)
        out.append(v)
    return out


def spark(values, w, h, color, area=True, glow=True, ref=None, pad=6, sw=1.6, uid='s'):
    """Linie mit getönter Fläche, gepunkteter Bezugslinie und leuchtendem Endpunkt."""
    lo, hi = min(values + ([ref] if ref is not None else [])), max(values + ([ref] if ref is not None else []))
    span = (hi - lo) or 1
    xs = [pad + i * (w - 2 * pad) / (len(values) - 1) for i in range(len(values))]
    ys = [pad + (hi - v) * (h - 2 * pad) / span for v in values]
    pts = ' '.join(f'{x:.1f},{y:.1f}' for x, y in zip(xs, ys))
    out = [f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" style="display: block; overflow: visible">']
    if area:
        out.append(f'<defs><linearGradient id="{uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{color}" stop-opacity=".22"></stop><stop offset="1" stop-color="{color}" stop-opacity="0"></stop></linearGradient></defs>')
        out.append(f'<path d="M{xs[0]:.1f},{h} L{pts.replace(" ", " L")} L{xs[-1]:.1f},{h} Z" fill="url(#{uid})"></path>')
    if ref is not None:
        ry = pad + (hi - ref) * (h - 2 * pad) / span
        out.append(f'<path d="M0 {ry:.1f}H{w}" stroke="#ffffff40" stroke-width="1" stroke-dasharray="1 3"></path>')
    out.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round"></polyline>')
    if glow:
        out.append(f'<circle cx="{xs[-1]:.1f}" cy="{ys[-1]:.1f}" r="7" fill="{color}" fill-opacity=".18"></circle>')
        out.append(f'<circle cx="{xs[-1]:.1f}" cy="{ys[-1]:.1f}" r="3" fill="{color}"></circle>')
    out.append('</svg>')
    return ''.join(out)


def board(user, widget, lead='', after=''):
    return f"""<div class="page"><div class="col">
<div class="user"><div class="bubble">{user}</div></div>
{lead}
{widget}
{f'<p class="prose">{after}</p>' if after else ''}
</div></div>"""


def document(body, extra_style=''):
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>{STYLE}{extra_style}</helmet>
{body}
</x-dc>
</body>
</html>
"""
