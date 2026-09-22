import { useEffect, useRef, useState } from 'preact/hooks';
import type { GalaxieKnoten, HostToWebview } from '../../src/panel/protocol.js';
import { vscode } from '../vscodeApi.js';

/**
 * Der Graph als Bild — aber immer nur ein Ausschnitt davon.
 *
 * Der ganze Graph hat 30.698 Knoten und 128.618 Kanten. Ihn vollständig zu
 * zeichnen ist genau das, woran Obsidians Graphansicht scheitert: eine
 * Kraftsimulation über 128.618 Federn ergibt bei 60 Bildern je Sekunde rund
 * 7,7 Millionen Rechnungen — für ein Bild, auf dem nichts zu erkennen ist.
 *
 * Hier sind es nie mehr als ein paar Dutzend gleichzeitig. Die Startansicht
 * zeigt die Projekte und die Begriffe, über die sie zusammenhängen; ein Klick
 * tauscht den Ausschnitt gegen die Nachbarschaft des angeklickten Knotens.
 * Welche Nachbarn das sind, entscheidet `bruecke/galaxie.py` — der Graph weiß
 * das besser als die Oberfläche.
 *
 * Gezeichnet wird auf Canvas statt SVG: bei sechzig bewegten Knoten ist der
 * Unterschied noch klein, aber ein DOM-Knoten je Punkt wäre die Bauweise, die
 * bei der nächsten Vergrößerung wieder bricht.
 */

interface Punkt extends GalaxieKnoten {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

/** Farbe nach Art — dieselbe Sprache wie im Rest der Seite. */
const FARBE: Record<string, string> = {
  Projekt: '#7fb894',
  Bereich: '#7fa3cc',
  Dokument: '#9a9ca0',
  Quelltext: '#9a9ca0',
  Begriff: '#c9ad7e',
  Kapitel: '#6d6f74',
  Medium: '#6d6f74',
  Werkzeug: '#c9ad7e',
};
const farbe = (art: string) => FARBE[art] ?? '#6d6f74';

/** Radius aus dem Grad — gedämpft, sonst verschluckt ein Nabe alles andere. */
const radius = (grad: number) => 4 + Math.min(Math.sqrt(grad) * 0.9, 14);

export function Galaxie() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const punkte = useRef<Punkt[]>([]);
  const kanten = useRef<Array<{ von: string; nach: string }>>([]);
  const zeiger = useRef<{ x: number; y: number } | null>(null);
  const ueber = useRef<Punkt | null>(null);
  const lauf = useRef<number>(0);
  const [hinweis, setHinweis] = useState('Wird geladen …');
  const [pfad, setPfad] = useState<GalaxieKnoten[]>([]);
  const [laedt, setLaedt] = useState(true);

  const hole = (id?: string) => {
    setLaedt(true);
    vscode.postMessage({ kind: 'exokortexGalaxie', ...(id ? { id } : {}) });
  };

  useEffect(() => {
    const empfange = (event: MessageEvent<HostToWebview>) => {
      const m = event.data;
      if (m?.kind !== 'exokortexGalaxieDaten') return;
      const c = canvasRef.current;
      const b = c ? c.getBoundingClientRect() : { width: 800, height: 500 };
      // Ringförmig starten, nicht zufällig: die Simulation muss den Knäuel
      // dann nicht erst auseinanderziehen, und das Bild steht schneller.
      punkte.current = m.knoten.map((k, i) => {
        const w = (i / Math.max(m.knoten.length, 1)) * Math.PI * 2;
        return {
          ...k,
          x: b.width / 2 + Math.cos(w) * Math.min(b.width, b.height) * 0.32,
          y: b.height / 2 + Math.sin(w) * Math.min(b.width, b.height) * 0.32,
          vx: 0,
          vy: 0,
          r: radius(k.grad),
        };
      });
      kanten.current = m.kanten;
      setHinweis(m.hinweis);
      setLaedt(false);
    };
    window.addEventListener('message', empfange);
    hole();
    return () => window.removeEventListener('message', empfange);
  }, []);

  // Simulation und Zeichnung in einer Schleife: Abstoßung aller Paare,
  // Federn entlang der Kanten, leichte Mitte. Bei sechzig Punkten ist das
  // naive O(n²) billiger als jede Baumstruktur darüber.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const takt = () => {
      const dpr = window.devicePixelRatio || 1;
      const b = c.getBoundingClientRect();
      if (c.width !== Math.round(b.width * dpr) || c.height !== Math.round(b.height * dpr)) {
        c.width = Math.round(b.width * dpr);
        c.height = Math.round(b.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const P = punkte.current;
      const mitte = { x: b.width / 2, y: b.height / 2 };

      for (let i = 0; i < P.length; i++) {
        const a = P[i]!;
        for (let j = i + 1; j < P.length; j++) {
          const z = P[j]!;
          const dx = z.x - a.x;
          const dy = z.y - a.y;
          const d2 = Math.max(dx * dx + dy * dy, 64);
          const kraft = 2600 / d2;
          const d = Math.sqrt(d2);
          a.vx -= (dx / d) * kraft;
          a.vy -= (dy / d) * kraft;
          z.vx += (dx / d) * kraft;
          z.vy += (dy / d) * kraft;
        }
        a.vx += (mitte.x - a.x) * 0.0016;
        a.vy += (mitte.y - a.y) * 0.0016;
      }
      const nachId = new Map(P.map(p => [p.id, p]));
      for (const k of kanten.current) {
        const a = nachId.get(k.von);
        const z = nachId.get(k.nach);
        if (!a || !z) continue;
        const dx = z.x - a.x;
        const dy = z.y - a.y;
        const d = Math.max(Math.hypot(dx, dy), 1);
        const zug = (d - 120) * 0.0035;
        a.vx += (dx / d) * zug;
        a.vy += (dy / d) * zug;
        z.vx -= (dx / d) * zug;
        z.vy -= (dy / d) * zug;
      }
      for (const p of P) {
        p.vx *= 0.86;
        p.vy *= 0.86;
        p.x = Math.max(p.r + 4, Math.min(b.width - p.r - 4, p.x + p.vx));
        p.y = Math.max(p.r + 4, Math.min(b.height - p.r - 4, p.y + p.vy));
      }

      // Welcher Punkt liegt unter dem Zeiger — für Hervorhebung und Klick.
      let treffer: Punkt | null = null;
      if (zeiger.current) {
        for (const p of P) {
          if (Math.hypot(p.x - zeiger.current.x, p.y - zeiger.current.y) <= p.r + 3) treffer = p;
        }
      }
      ueber.current = treffer;
      c.style.cursor = treffer ? 'pointer' : 'default';

      ctx.clearRect(0, 0, b.width, b.height);
      ctx.lineWidth = 1;
      for (const k of kanten.current) {
        const a = nachId.get(k.von);
        const z = nachId.get(k.nach);
        if (!a || !z) continue;
        const nah = treffer && (treffer.id === a.id || treffer.id === z.id);
        ctx.strokeStyle = nah ? '#ffffff44' : '#ffffff14';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(z.x, z.y);
        ctx.stroke();
      }
      for (const p of P) {
        const hell = !treffer || treffer.id === p.id ||
          kanten.current.some(k =>
            (k.von === p.id && k.nach === treffer.id) || (k.nach === p.id && k.von === treffer.id));
        ctx.globalAlpha = hell ? 1 : 0.28;
        ctx.fillStyle = farbe(p.art);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        // Beschriftet wird, was groß genug ist oder gerade angesehen wird —
        // alles zu beschriften ergibt wieder eine unlesbare Wolke.
        if (p.r > 8 || treffer?.id === p.id) {
          ctx.globalAlpha = hell ? 1 : 0.4;
          ctx.fillStyle = '#eceded';
          ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.textAlign = 'center';
          const kurz = p.name.length > 26 ? p.name.slice(0, 25) + '…' : p.name;
          ctx.fillText(kurz, p.x, p.y + p.r + 12);
        }
        ctx.globalAlpha = 1;
      }
      lauf.current = requestAnimationFrame(takt);
    };
    lauf.current = requestAnimationFrame(takt);
    return () => cancelAnimationFrame(lauf.current);
  }, []);

  const zeigerAuf = (e: MouseEvent) => {
    const c = canvasRef.current;
    if (!c) return;
    const b = c.getBoundingClientRect();
    zeiger.current = { x: e.clientX - b.left, y: e.clientY - b.top };
  };

  return (
    <div class="cx-exo-galaxie">
      <div class="kopfzeile">
        <span class="brotkrumen">
          <button class={pfad.length ? '' : 'jetzt'} onClick={() => { setPfad([]); hole(); }}>
            Projekte
          </button>
          {pfad.map((k, i) => (
            <span key={k.id}>
              <i>›</i>
              <button
                class={i === pfad.length - 1 ? 'jetzt' : ''}
                onClick={() => { setPfad(pfad.slice(0, i + 1)); hole(k.id); }}
              >
                {k.name}
              </button>
            </span>
          ))}
        </span>
        <span class="rechts">
          <span class="cx-exo-lbl">{laedt ? 'lädt …' : hinweis}</span>
        </span>
      </div>
      <canvas
        ref={canvasRef}
        onMouseMove={zeigerAuf}
        onMouseLeave={() => { zeiger.current = null; }}
        onClick={() => {
          const t = ueber.current;
          if (!t) return;
          setPfad(p => [...p.filter(x => x.id !== t.id), t]);
          hole(t.id);
        }}
      />
      <div class="legende">
        {['Projekt', 'Bereich', 'Dokument', 'Begriff'].map(a => (
          <span key={a}>
            <i style={{ background: farbe(a) }} />
            {a}
          </span>
        ))}
        <span class="cx-exo-lbl rechts">
          Punktgröße = Kanten am Knoten · Klick öffnet die Nachbarschaft
        </span>
      </div>
    </div>
  );
}
