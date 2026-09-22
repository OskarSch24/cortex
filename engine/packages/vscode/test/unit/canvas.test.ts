import { describe, expect, it } from 'vitest';
import { asksForCanvas, briefDelta, canvasSections, touchesCanvas, CANVAS_BRIEF, CANVAS_COLORS, matchSlashCommand, expandSlashCommand } from '@cortex/core';
import { bounds, colorOf, fitAndSeparate, parseCanvas, rectsOverlap, shift, specSize, toSkeleton, wrap, type Skeleton } from '../../webview/canvas/spec.js';
import { describeScene } from '../../webview/canvas/describe.js';
import { findCountry, findState, mapSkeleton } from '../../webview/canvas/map.js';

const boxes = (els: Skeleton[]) => els.filter(e => e.type !== 'arrow' && e.type !== 'frame' && e.type !== 'text') as Array<Skeleton & { x: number; y: number; width: number; height: number }>;
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('Anweisung an das Modell', () => {
  it('geht nur bei offener Fläche oder /excalidraw mit', () => {
    expect(asksForCanvas('/excalidraw Mindmap zu Photosynthese')).toBe(true);
    expect(asksForCanvas('@claude /excalidraw Ablauf')).toBe(true);
    expect(asksForCanvas('Erkläre mir Photosynthese')).toBe(false);
    const [brief, scene] = canvasSections(undefined);
    expect(brief!.body).toBe(CANVAS_BRIEF);
    expect(scene!.body).toMatch(/not open yet/);
    expect(canvasSections('- r1 rectangle "A"')[1]!.body).toContain('r1 rectangle');
  });

  it('Folgeaufträge gehören auf die Fläche, auch wenn sie gerade zu ist', () => {
    expect(CANVAS_BRIEF).toMatch(/names no other target/);
    expect(CANVAS_BRIEF).toMatch(/even if the canvas is not open right now/);
    const [, closed] = canvasSections('- r1 rectangle "Kt Karte"', false);
    expect(closed!.body).toMatch(/closed in the side panel/);
    expect(closed!.body).toContain('r1 rectangle');
    expect(closed!.body).not.toMatch(/do not send/i);
  });

  it('schickt einer Sitzung, die die Fläche kennt, nur die geänderten Elemente', () => {
    const many = Array.from({ length: 40 }, (_, i) => `- e${i} rectangle "Kasten ${i}" at ${i * 10},0 200×80`);
    const first = canvasSections(many.join('\n'));
    const known = briefDelta(undefined, first).state;
    const next = [...many.slice(1), '- n1 ellipse "Neu" at 0,500 120×80'];
    next[4] = '- e5 rectangle "Kasten 5 geändert" at 50,0 200×80';
    const delta = briefDelta(known, canvasSections(next.join('\n'))).text;
    expect(delta).toContain('n1 ellipse "Neu"');
    expect(delta).toContain('Kasten 5 geändert');
    expect(delta).toMatch(/Removed: e0\b/);
    expect(delta).not.toContain('Kasten 20');
    expect(delta).not.toContain('names no other target'); // die Anweisung kannte sie schon
  });

  it('nennt behobene Layoutprobleme, statt sie stehen zu lassen', () => {
    const filler = Array.from({ length: 20 }, (_, i) => `- f${i} rectangle "Fülle ${i}" at ${i * 300},500 200×80`);
    const scene = ['- a rectangle "A" at 0,0 200×80', '- b rectangle "B" at 100,0 200×80', ...filler];
    const withIssue = [...scene, 'Layout check found 1 problem (fix them):', '- a "A" overlaps b "B"'].join('\n');
    const known = briefDelta(undefined, canvasSections(withIssue)).state;
    const fixed = ['- a rectangle "A" at 0,0 200×80', '- b rectangle "B" at 300,0 200×80', ...filler].join('\n');
    const delta = briefDelta(known, canvasSections(fixed)).text;
    expect(delta).toContain('b rectangle "B" at 300,0');
    expect(delta).toMatch(/No longer listed:[\s\S]*Layout check found/);
    expect(delta).not.toMatch(/Removed:/);
  });

  it('eine geschlossene Fläche kommt bei fremden Themen nur als Hinweis mit', () => {
    const [, note] = canvasSections('- r1 rectangle "A"\n- r2 rectangle "B"', false, { noteOnly: true });
    expect(note!.body).toMatch(/holds a drawing \(2 listed elements\)/);
    expect(note!.body).not.toContain('r1');
    expect(touchesCanvas('Mach den Kasten links rot')).toBe(true);
    expect(touchesCanvas('Ergänze die Mindmap um Preise')).toBe(true);
    expect(touchesCanvas('Bau die Google-Earth-Funktion in 06-gebaeude-3d.html ein')).toBe(false);
  });

  it('nennt nur Farben, die der Parser kennt', () => {
    for (const name of CANVAS_COLORS) expect(colorOf(name), name).toBeDefined();
  });

  it('/excalidraw ist ein Auftrag an das Modell, keine Oberflächenaktion', () => {
    const m = matchSlashCommand('/excalidraw Wasserkreislauf');
    expect(m?.cmd.kind).toBe('prompt');
    expect(expandSlashCommand(m!.cmd, m!.args)).toContain('Wasserkreislauf');
  });
});

describe('cortex-excalidraw lesen', () => {
  it('erkennt die Anordnung auch ohne "layout"', () => {
    const mind = parseCanvas(JSON.stringify({ root: { label: 'A', children: ['B', { label: 'C' }] } }));
    expect(mind.ok && mind.spec.layout).toBe('mindmap');
    expect(mind.ok && specSize(mind.spec)).toBe(3);
    const flow = parseCanvas(JSON.stringify({ nodes: [{ id: 'a', label: 'A' }, 'b'], edges: [['a', 'b', 'weiter'], { from: 'a', to: 'x' }] }));
    expect(flow.ok && flow.spec.layout === 'flow' && flow.spec.edges).toEqual([{ from: 'a', to: 'b', label: 'weiter', dashed: false, twoWay: false }]);
  });

  it('meldet Unlesbares mit Grund statt still nichts zu zeichnen', () => {
    expect(parseCanvas('{kaputt').ok).toBe(false);
    expect(parseCanvas('[]').ok).toBe(false);
    expect(parseCanvas('{"layout":"mindmap"}').ok).toBe(false);
    expect(parseCanvas('{"layout":"torte"}').ok).toBe(false);
  });

  it('nimmt reines Entfernen als Ergänzung', () => {
    const r = parseCanvas('{"remove":["a","b"]}');
    expect(r.ok && r.spec.mode).toBe('add');
    expect(r.ok && toSkeleton(r.spec)).toEqual([]);
  });
});

describe('Anordnung', () => {
  it('Mindmap: Äste zu beiden Seiten, keine Überlappung, jeder Knoten verbunden', () => {
    const spec = parseCanvas(JSON.stringify({
      layout: 'mindmap',
      root: { label: 'Lernen', children: ['Lesen', 'Schreiben', 'Rechnen', 'Musik', { label: 'Sport', children: ['Laufen', 'Schwimmen', 'Klettern'] }, 'Kunst'] },
    }));
    if (!spec.ok) throw new Error(spec.error);
    const els = toSkeleton(spec.spec);
    const shapes = boxes(els);
    expect(shapes).toHaveLength(10);
    expect(els.filter(e => e.type === 'arrow')).toHaveLength(9);
    const root = shapes[0]!;
    const rootCentre = root.x + root.width / 2;
    expect(shapes.some(s => s.x > rootCentre)).toBe(true);
    expect(shapes.some(s => s.x + s.width < rootCentre)).toBe(true);
    for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) {
      expect(overlap(shapes[i]!, shapes[j]!), `${shapes[i]!.id} / ${shapes[j]!.id}`).toBe(false);
    }
    const ids = new Set(shapes.map(s => s.id));
    for (const a of els.filter(e => e.type === 'arrow')) {
      expect(ids.has((a.start as { id: string }).id)).toBe(true);
      expect(ids.has((a.end as { id: string }).id)).toBe(true);
    }
  });

  it('Ablauf: Ebenen in Laufrichtung, Schleifen brechen die Anordnung nicht', () => {
    const spec = parseCanvas(JSON.stringify({
      layout: 'flow',
      nodes: [{ id: 'start', label: 'Start' }, { id: 'check', label: 'Gültig?', shape: 'diamond' }, { id: 'ok', label: 'Speichern' }, { id: 'fix', label: 'Korrigieren' }, { id: 'end', label: 'Ende' }],
      edges: [{ from: 'start', to: 'check' }, { from: 'check', to: 'ok', label: 'ja' }, { from: 'check', to: 'fix', label: 'nein' }, { from: 'fix', to: 'check' }, { from: 'ok', to: 'end' }],
    }));
    if (!spec.ok) throw new Error(spec.error);
    const els = toSkeleton(spec.spec);
    const at = (id: string) => els.find(e => e.id === id) as Skeleton & { y: number };
    expect(at('start').y).toBeLessThan(at('check').y);
    expect(at('check').y).toBeLessThan(at('ok').y);
    expect(at('ok').y).toBe(at('fix').y);
    expect(at('ok').y).toBeLessThan(at('end').y);
    expect(at('check').type).toBe('diamond');
    const shapes = boxes(els);
    for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) expect(overlap(shapes[i]!, shapes[j]!)).toBe(false);
  });

  it('Gruppen werden Kästen um genau ihre Knoten', () => {
    const spec = parseCanvas(JSON.stringify({
      layout: 'flow', direction: 'right',
      nodes: [{ id: 'ui', label: 'UI', group: 'fe' }, { id: 'api', label: 'API', group: 'be' }, { id: 'db', label: 'DB', group: 'be' }],
      edges: [['ui', 'api'], ['api', 'db']], groups: [{ id: 'be', label: 'Backend' }],
    }));
    if (!spec.ok) throw new Error(spec.error);
    const els = toSkeleton(spec.spec);
    expect(els.filter(e => e.type === 'text').map(t => t.text)).toEqual(['fe', 'Backend']);
    const box = els.find(e => e.id === 'gruppe-be') as Skeleton & { x: number; y: number; width: number; height: number };
    const inside = (id: string) => { const n = els.find(e => e.id === id) as typeof box; return n.x > box.x && n.y > box.y && n.x + n.width < box.x + box.width && n.y + n.height < box.y + box.height; };
    expect(inside('api') && inside('db')).toBe(true);
    expect(inside('ui')).toBe(false);
  });

  it('vergibt beim Ergänzen keine Kennung doppelt', () => {
    const spec = parseCanvas('{"layout":"flow","mode":"add","nodes":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"edges":[["a","b"]]}');
    if (!spec.ok) throw new Error(spec.error);
    const els = toSkeleton(spec.spec, new Set(['a']));
    const ids = els.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('a');
    const arrow = els.find(e => e.type === 'arrow')!;
    expect((arrow.start as { id: string }).id).toBe(ids[0]);
  });

  it('frei: Pfeile zwischen benannten Formen, Umriss und Verschieben', () => {
    const spec = parseCanvas(JSON.stringify({ layout: 'free', elements: [
      { type: 'rectangle', id: 'k', x: 0, y: 0, width: 200, height: 100, label: 'Küche' },
      { type: 'rectangle', id: 'w', x: 400, y: 0, width: 200, height: 100, label: 'Wohnen', color: 'green', fill: true },
      { type: 'arrow', from: 'k', to: 'w' },
    ] }));
    if (!spec.ok) throw new Error(spec.error);
    const els = toSkeleton(spec.spec);
    const arrow = els.find(e => e.type === 'arrow')!;
    expect(arrow.x).toBe(100);
    expect(arrow.points).toEqual([[0, 0], [400, 0]]);
    expect(bounds(els)).toEqual({ minX: 0, minY: 0, maxX: 600, maxY: 100 });
    expect(bounds(shift(els, 10, 20))).toEqual({ minX: 10, minY: 20, maxX: 610, maxY: 120 });
  });

  it('bricht lange Beschriftungen um', () => {
    expect(wrap('Ein ziemlich langer Titel für einen einzelnen Knoten', 20).split('\n').every(l => l.length <= 20)).toBe(true);
    expect(wrap('Zeile\\nzwei')).toBe('Zeile\nzwei');
  });
});

describe('Keine Überlappungen', () => {
  it('Kästen wachsen mit ihrem Text und brechen nie mitten im Wort', () => {
    const [box] = fitAndSeparate([{ type: 'rectangle', x: 0, y: 0, width: 96, height: 50, label: 'Nz Netz · Zusammenhang' }]);
    expect(box!.label!.split('\n').every(line => !line.startsWith('g'))).toBe(true);
    expect(box!.label).toContain('Zusammenhang');
    expect(box!.width!).toBeGreaterThanOrEqual(Math.ceil('Zusammenhang'.length * 20 * 0.62 + 44));
    expect(box!.height!).toBeGreaterThanOrEqual(Math.ceil(box!.label!.split('\n').length * 26 + 36));
  });

  it('übereinanderliegende Formen rücken auseinander, Rahmen wachsen mit', () => {
    const els = fitAndSeparate([
      { type: 'rectangle', id: 'rahmen', x: -20, y: -20, width: 400, height: 200 },
      { type: 'rectangle', id: 'a', x: 0, y: 0, width: 150, height: 60, label: 'Anteil' },
      { type: 'rectangle', id: 'b', x: 100, y: 20, width: 150, height: 60, label: 'Reichweite' },
      { type: 'rectangle', id: 'c', x: 120, y: 30, width: 150, height: 60, label: 'Netz' },
      { type: 'text', id: 't', x: 10, y: 10, text: 'Notiz' },
    ]);
    const r = (id: string) => { const e = els.find(x => x.id === id)!; return e.type === 'text' ? { x: e.x, y: e.y, w: 60, h: 25 } : { x: e.x, y: e.y, w: e.width!, h: e.height! }; };
    // Die Notiz liegt in Karte a und bleibt dort.
    const t = r('t'), a0 = r('a'); expect(t.x >= a0.x && t.y >= a0.y && t.x + t.w <= a0.x + a0.w && t.y + t.h <= a0.y + a0.h).toBe(true);
    for (const [i, j] of [['a', 'b'], ['a', 'c'], ['b', 'c'], ['b', 't'], ['c', 't']] as const) expect(rectsOverlap(r(i), r(j)), `${i}/${j}`).toBe(false);
    const frame = r('rahmen');
    for (const id of ['a', 'b', 'c']) { const k = r(id); expect(k.x + k.w).toBeLessThanOrEqual(frame.x + frame.w); expect(k.y + k.h).toBeLessThanOrEqual(frame.y + frame.h); }
  });
});

describe('Karten aus echten Grenzen', () => {
  const germany = () => {
    const r = parseCanvas(JSON.stringify({ layout: 'map', region: ['Deutschland'], highlight: ['Bayern'],
      places: [{ label: 'Hamburg', lat: 53.551, lon: 9.993 }, { label: 'München', lat: 48.137, lon: 11.575 }, { label: 'kaputt', lat: 200, lon: 0 }],
      routes: [{ from: 'Hamburg', to: 'München', label: 'ICE' }] }));
    if (!r.ok || r.spec.layout !== 'map') throw new Error('keine Karte');
    return r.spec;
  };

  it('liest Gebiet, Orte und Wege; unmögliche Koordinaten fallen weg', () => {
    const spec = germany();
    expect(spec.places.map(p => p.label)).toEqual(['Hamburg', 'München']);
    expect(specSize(spec)).toBe(2);
    expect(parseCanvas('{"places":[{"label":"A","lat":1,"lon":2}]}').ok).toBe(true);
  });

  it('kennt deutsche Namen für Länder und Bundesländer', () => {
    expect(findCountry('Frankreich')?.name).toBe('France');
    expect(findCountry('Germany')?.name).toBe('Germany');
    expect(findState('Bavaria')?.name).toBe('Bayern');
    expect(findState('NRW')?.name).toBe('Nordrhein-Westfalen');
  });

  it('Deutschland: 16 Bundesländer, Bayern hervorgehoben, Orte an der richtigen Stelle', () => {
    let n = 0;
    const els = mapSkeleton(germany(), base => `${base}-${++n}`);
    const lands = els.filter(e => e.type === 'line');
    const names = new Set(lands.map(l => String(l.id).replace(/-\d+$/, '')));
    expect([...names].filter(x => x.startsWith('land-'))).toHaveLength(16);
    expect(lands.find(l => String(l.id).startsWith('land-bayern'))!.backgroundColor).toBe(colorOf('blue')!.fill);
    // Hamburg liegt nördlich und westlich von München.
    const dot = (label: string) => els.find(e => String(e.id).startsWith(`ort-${label}`) && e.type === 'ellipse') as Skeleton & { x: number; y: number };
    expect(dot('hamburg').y).toBeLessThan(dot('münchen').y);
    expect(dot('hamburg').x).toBeLessThan(dot('münchen').x);
    // Seitenverhältnis wie in echt (Mercator): etwa 0,75 breit zu hoch.
    const box = bounds(lands.flatMap(l => (l.points as number[][]).map(([x, y]) => ({ x: (l.x as number) + x!, y: (l.y as number) + y! }))))!;
    const ratio = (box.maxX - box.minX) / (box.maxY - box.minY);
    expect(ratio).toBeGreaterThan(0.68);
    expect(ratio).toBeLessThan(0.82);
    // Jede Fläche ist geschlossen, sonst füllt Excalidraw sie nicht.
    for (const l of lands) { const p = l.points as number[][]; expect(p[0]).toEqual(p[p.length - 1]); }
    expect(els.some(e => e.type === 'arrow')).toBe(true);
  });

  it('Namen fast gleicher Orte überlappen nicht (Landtag und OVG in Weimar)', () => {
    const r = parseCanvas(JSON.stringify({ layout: 'map', region: ['Deutschland'], places: [
      { label: 'Landtag Weimar', lat: 50.979, lon: 11.329 }, { label: 'OVG Weimar', lat: 50.981, lon: 11.334 },
      { label: 'Erfurt', lat: 50.978, lon: 11.029 }, { label: 'Jena', lat: 50.927, lon: 11.586 },
    ] }));
    if (!r.ok || r.spec.layout !== 'map') throw new Error('keine Karte');
    const els = mapSkeleton(r.spec, base => `${base}-${Math.random().toString(36).slice(2, 6)}`);
    const texts = els.filter(e => e.type === 'text').map(t => ({ x: t.x as number, y: t.y as number, w: [...String(t.text)].length * (t.fontSize as number) * 0.6, h: (t.fontSize as number) * 1.3 }));
    const dots = els.filter(e => e.type === 'ellipse').map(d => ({ x: d.x as number, y: d.y as number, w: d.width as number, h: d.height as number }));
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) expect(rectsOverlap(texts[i]!, texts[j]!), `Name ${i}/${j}`).toBe(false);
      for (const d of dots) expect(rectsOverlap(texts[i]!, d)).toBe(false);
    }
  });

  it('Europa wird auf den Ausschnitt beschnitten', () => {
    const r = parseCanvas('{"layout":"map","region":["Europa"],"width":900}');
    if (!r.ok || r.spec.layout !== 'map') throw new Error('keine Karte');
    const els = mapSkeleton(r.spec, base => base + Math.random());
    const xs = els.filter(e => e.type === 'line').flatMap(l => (l.points as number[][]).map(p => (l.x as number) + p[0]!));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(901);
  });
});

describe('Beschreibung für das Modell', () => {
  it('liest Formen, Beschriftungen und Verbindungen, zählt Freihand nur', () => {
    const text = describeScene([
      { id: 'a', type: 'rectangle', x: 0, y: 0, width: 200, height: 80, strokeColor: '#1971c2', backgroundColor: '#a5d8ff' },
      { id: 'ta', type: 'text', x: 10, y: 10, width: 50, height: 20, containerId: 'a', text: 'Idee', originalText: 'Idee' },
      { id: 'b', type: 'ellipse', x: 300, y: 0, width: 100, height: 100 },
      { id: 'p', type: 'arrow', x: 200, y: 40, width: 100, height: 10, points: [[0, 0], [100, 10]], startBinding: { elementId: 'a' }, endBinding: { elementId: 'b' } },
      { id: 'f1', type: 'freedraw', x: 0, y: 0, width: 5, height: 5 },
      { id: 'gone', type: 'rectangle', x: 0, y: 0, width: 1, height: 1, isDeleted: true },
    ]);
    expect(text).toContain('- a rectangle "Idee" at 0,0 200×80 (stroke blue, fill blue)');
    expect(text).toContain('- p arrow a "Idee" → b');
    expect(text).toContain('1 freehand stroke');
    expect(text).not.toContain('gone');
    expect(describeScene([])).toBe('');
  });
});

describe('Warteschlange der Zeichenaufträge', () => {
  it('zeigt einen Block als wartend, bis eine Fläche ihn holt', async () => {
    const { blockKey, requestDraw, resultOf, takeJobs, reportResult } = await import('../../webview/canvas/client.js');
    const code = '{"layout":"map","region":["Europe"],"places":[]}';
    const key = blockKey(code);
    requestDraw({ conversationId: 'chat-a', code, key, force: false });
    // Eine fremde Fläche nimmt den Auftrag nicht mit — er bleibt liegen und
    // sichtbar, statt still zu verschwinden.
    expect(takeJobs('chat-b')).toEqual([]);
    expect(resultOf(key)).toEqual({ state: 'wartet' });
    const mine = takeJobs('chat-a');
    expect(mine.map(j => j.key)).toEqual([key]);
    reportResult(key, { state: 'gezeichnet', count: 1 });
    expect(resultOf(key)).toEqual({ state: 'gezeichnet', count: 1 });
  });

  it('findet den Block auch erst im Schlussstück einer Antwort', async () => {
    const { canvasBlocks } = await import('../../webview/canvas/client.js');
    const text = 'Text\n\n```cortex-excalidraw\n{"layout":"none"}\n```\n\nNachsatz.';
    expect(canvasBlocks(text.slice(0, 40))).toEqual([]);
    expect(canvasBlocks(text)).toEqual(['{"layout":"none"}']);
  });
});
