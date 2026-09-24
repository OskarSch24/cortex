/** Arbeits-Widgets für Daten: Abfrage, Graph-Knoten, Entscheidung, Ort, Zeitleiste. */
import { useState } from 'preact/hooks';
import {
  Actions, Card, Dot, Foot, Head, Pill, TEXT, TONE, WIcon, list, str, toneOf, type WidgetHost,
} from '../parts.js';
import {
  daysBetween, hours, type DecisionW, type GraphNodeW, type PlaceNamingW, type QueryResultW, type TimelineW,
} from '../spec.js';
import { clip } from './ops.js';

/* ── Abfrage ────────────────────────────────────────────────────────────── */

/**
 * Bezeichner für Menschen: `social_kanaele` → `social_kanäle`. Nur Schreibweise,
 * kein Umbenennen — `ae/oe/ue` wird Umlaut, außer wo es keiner ist (`aktuell`,
 * `neue`, `Queue`, `Israel`).
 */
export function umlaute(text: string): string {
  return text
    .replace(/(?<![aeiouq])ue(?!ll|nt|rt)/gi, (m) => (m[0] === 'U' ? 'Ü' : 'ü'))
    .replace(/(?<![aeiou])ae(?!l\b)/gi, (m) => (m[0] === 'A' ? 'Ä' : 'ä'))
    .replace(/(?<![aeiou])oe(?!t)/gi, (m) => (m[0] === 'O' ? 'Ö' : 'ö'));
}

const isIdent = (v: string) => /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(v);
const shown = (v: string) => (isIdent(v) ? umlaute(v) : v);

/** Eine Zelle, die eine Aufzählung ist (`a, b, c, d`), wird zu Marken — die ersten, dann „+n“. */
function ListCell({ items }: { items: string[] }) {
  const [all, setAll] = useState(false);
  const cut = all ? items : items.slice(0, 5);
  return (
    <div class="cx-w-chips">
      {cut.map((t, i) => <span key={i} class="cx-w-chip">{shown(t)}</span>)}
      {items.length > cut.length && <button type="button" class="cx-w-chip more" onClick={() => setAll(true)}>+{items.length - cut.length}</button>}
    </div>
  );
}

export function QueryResult({ w, host }: { w: QueryResultW; host: WidgetHost }) {
  const cols = list(w.columns);
  const rows = list(w.rows).filter(Array.isArray);
  const [filter, setFilter] = useState<string | undefined>();
  const [showQuery, setShowQuery] = useState(false);
  const numeric = cols.map((_, c) => rows.length > 0 && rows.every((r) => r[c] === null || r[c] === undefined || typeof r[c] === 'number' || /^[\d.,:\s%€$-]+$/.test(String(r[c]))));
  const listish = cols.map((_, c) => rows.filter((r) => typeof r[c] === 'string' && String(r[c]).split(',').length >= 4).length >= Math.max(1, rows.length / 2));
  // Gruppen aus dem ersten Wort der ersten Spalte (`social_…`, `suche…`) — nur wenn es wirklich mehrere gibt.
  const group = (r: (string | number | null)[]) => String(r[0] ?? '').split(/[_\s.]/)[0]!.toLowerCase();
  const groups = [...new Set(rows.map(group))].filter(Boolean);
  const grouped = groups.length >= 2 && groups.length <= 6 && groups.length < rows.length;
  const visible = grouped && filter ? rows.filter((r) => group(r) === filter) : rows;
  const cap = (g: string) => umlaute(g.charAt(0).toUpperCase() + g.slice(1));
  return (
    <Card label={`Abfrage ${w.title ?? ''}`}>
      <Head mark="database" title={w.title ?? 'Abfrage'} sub={w.subtitle ?? `${rows.length} ${rows.length === 1 ? 'Zeile' : 'Zeilen'}`} />
      {grouped && (
        <div class="cx-w-filters" role="tablist">
          <button type="button" role="tab" aria-selected={!filter} class={!filter ? 'on' : ''} onClick={() => setFilter(undefined)}>Alle {rows.length}</button>
          {groups.map((g) => <button type="button" role="tab" key={g} aria-selected={filter === g} class={filter === g ? 'on' : ''} onClick={() => setFilter(filter === g ? undefined : g)}>{cap(g)} {rows.filter((r) => group(r) === g).length}</button>)}
        </div>
      )}
      <div class="cx-w-sep cx-w-table-wrap soft">
        <table class="cx-w-table soft">
          <thead><tr>{cols.map((c, i) => <th key={i} class={numeric[i] ? 'r' : ''}>{c}</th>)}</tr></thead>
          <tbody>
            {visible.slice(0, 50).map((r, i) => (
              <tr key={i}>{cols.map((_, c) => {
                const v = r[c];
                const text = v === null || v === undefined ? undefined : String(v);
                return <td key={c} class={`${numeric[c] ? 'r cx-w-num' : ''} ${c === 0 ? 'v' : ''} ${listish[c] ? 'list' : ''}`}>
                  {text === undefined || text === '—' ? <span class="cx-w-dim">—</span> : listish[c] && text.includes(',') ? <ListCell items={text.split(',').map((t) => t.trim()).filter(Boolean)} /> : shown(text)}
                </td>;
              })}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {w.query && showQuery && <pre class="cx-w-code inset wrap">{w.query}</pre>}
      <Actions actions={w.actions} host={host} />
      <Foot
        left={w.source}
        right={<>{visible.length > 50 ? `50 von ${visible.length} Zeilen · ` : ''}{w.query && <button type="button" class="cx-w-linkbtn" onClick={() => setShowQuery((v) => !v)}>{showQuery ? 'Abfrage ausblenden' : 'Abfrage anzeigen'}</button>}</>}
      />
    </Card>
  );
}

/* ── Graph-Knoten ───────────────────────────────────────────────────────── */

export function GraphNode({ w, host }: { w: GraphNodeW; host: WidgetHost }) {
  const nbrs = list(w.neighbors).slice(0, 6);
  const cx = 150;
  const cy = 104;
  const initials = str(w.name).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  const Facts = ({ items, tone }: { items: string[]; tone: string }) => (
    <div class="cx-w-facts-list">{items.map((t, i) => <span key={i}><Dot color={tone} /><span>{t}</span></span>)}</div>
  );
  return (
    <Card label={`Knoten ${w.name}`}>
      <Head mark={<span class="cx-w-initials">{initials}</span>} markTone={TONE.info} title={w.name} sub={`${w.kind}${nbrs.length ? ` · ${list(w.neighbors).length} Verbindungen` : ''}`} />
      <div class="cx-w-sep cx-w-node">
        {nbrs.length > 0 && (
          <svg class="cx-w-ego" width="300" height="210" viewBox="0 0 300 210" aria-hidden="true">
            {nbrs.map((_, i) => {
              const a = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / nbrs.length;
              return <path key={`e${i}`} d={`M${cx} ${cy}L${cx + 100 * Math.cos(a)} ${cy + 76 * Math.sin(a)}`} stroke="#ffffff26" />;
            })}
            {nbrs.map((n, i) => {
              const a = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / nbrs.length;
              const x = cx + 100 * Math.cos(a);
              const y = cy + 76 * Math.sin(a);
              return (
                <g key={`n${i}`}>
                  <circle cx={x} cy={y} r="6" fill="#101113" stroke={/person/i.test(n.kind ?? '') ? TONE.violet : '#999a9d'} stroke-width="1.5" />
                  <text x={Math.max(40, Math.min(260, x))} y={y < cy ? y - 12 : y + 20} text-anchor="middle" fill="#c9cacd" font-size="11">{clip(n.label, 130, 11)}</text>
                </g>
              );
            })}
            <circle cx={cx} cy={cy} r="20" fill={TONE.info} fill-opacity=".12" />
            <circle cx={cx} cy={cy} r="9" fill={TONE.info} />
          </svg>
        )}
        <div class="cx-w-grow cx-w-stack gap14">
          <div>
            <div class="cx-w-row-inline"><b class="cx-w-small-h">Belegt</b>{w.confirmedSource && <span class="cx-w-label">{w.confirmedSource}</span>}</div>
            {list(w.confirmed).length ? <Facts items={list(w.confirmed)} tone={TONE.pos} /> : <div class="cx-w-dim cx-w-small">Nichts belegt</div>}
          </div>
          <div>
            <div class="cx-w-row-inline"><b class="cx-w-small-h">Beobachtet</b>{w.observedSource && <span class="cx-w-label">{w.observedSource}</span>}</div>
            {list(w.observed).length ? <Facts items={list(w.observed)} tone="#707277" /> : <div class="cx-w-dim cx-w-small">Noch nichts beobachtet</div>}
          </div>
        </div>
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.id ? <span class="cx-w-mono">{w.id}</span> : w.source} right={w.updated ? `Stand ${w.updated}` : undefined} />
    </Card>
  );
}

/* ── Entscheidung ───────────────────────────────────────────────────────── */

export function Decision({ w, host }: { w: DecisionW; host: WidgetHost }) {
  const today = new Date().toISOString().slice(0, 10);
  const span = daysBetween(w.decided, w.review);
  const left = daysBetween(today, w.review);
  const elapsed = Number.isFinite(span) && span > 0 ? Math.max(0, Math.min(1, (span - left) / span)) : 0;
  const fmt = (d: string) => {
    const t = Date.parse(`${d.slice(0, 10)}T12:00:00Z`);
    return Number.isFinite(t) ? new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }) : d;
  };
  const open = /offen|open/i.test(w.status);
  return (
    <Card label={`Entscheidung ${w.id}`}>
      <Head mark="scale" title={w.title} sub={<><span class="cx-w-mono">{w.id}</span>{w.project ? ` · ${w.project}` : ''}</>} right={<Pill tone={open ? 'warn' : 'pos'}>{w.status}</Pill>} />
      <div class="cx-w-sep cx-w-pad-top">
        <div class="cx-w-label">Entscheidung</div>
        <p class="cx-w-prose">{w.decision}</p>
      </div>
      {(list(w.rejected).length > 0 || w.wrongIf) && (
        <div class="cx-w-two">
          {list(w.rejected).length > 0 && (
            <div class="cx-w-box pad">
              <div class="cx-w-label">Verworfen</div>
              {list(w.rejected).map((r, i) => <span class="cx-w-row-inline cx-w-muted cx-w-rejected" key={i}><WIcon name="close" size={14} color="#707277" />{r}</span>)}
            </div>
          )}
          {w.wrongIf && <div class="cx-w-box pad"><div class="cx-w-label">Falsch, wenn …</div><div class="cx-w-muted cx-w-body">{w.wrongIf}</div></div>}
        </div>
      )}
      <div class="cx-w-review">
        <div class="cx-w-row-inline between">
          <span class="cx-w-label cx-w-num">Getroffen {fmt(w.decided)}</span>
          <span class="cx-w-small"><span class="cx-w-v">Überprüfung am {fmt(w.review)}</span>{Number.isFinite(left) && <span class="cx-w-dim cx-w-num"> · {left > 0 ? `in ${left} Tagen` : left === 0 ? 'heute' : `seit ${-left} Tagen fällig`}</span>}</span>
        </div>
        <span class="cx-w-review-track">
          <i class="fill" style={{ width: `${elapsed * 100}%`, background: left < 0 ? TONE.neg : TEXT }} />
          <i class="knob" style={{ left: `calc(${elapsed * 100}% - 5px)` }} />
          <i class="goal" />
        </span>
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} right={typeof w.gaps === 'number' ? `${w.gaps} ${w.gaps === 1 ? 'Wissenslücke' : 'Wissenslücken'} notiert` : undefined} />
    </Card>
  );
}

/* ── Ort benennen ───────────────────────────────────────────────────────── */

export function PlaceNaming({ w, host }: { w: PlaceNamingW; host: WidgetHost }) {
  const [name, setName] = useState('');
  const pts = list(w.points).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const lat = pts.map((p) => p[0]);
  const lon = pts.map((p) => p[1]);
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lat), Math.max(...lat), Math.min(...lon), Math.max(...lon)];
  const spanLat = maxLat - minLat || 0.001;
  const spanLon = maxLon - minLon || 0.001;
  const centre = pts.length ? [lat.reduce((a, b) => a + b, 0) / pts.length, lon.reduce((a, b) => a + b, 0) / pts.length] : undefined;
  const save = () => name.trim() && host.onPrompt?.(`Benenne die Ortsgruppe ${w.id} als „${name.trim()}“.`);
  return (
    <Card label={`Ort benennen ${w.id}`}>
      <Head mark="pin" title={`Ortsgruppe ${w.id}`} sub={<span class="cx-w-num">{w.count} Aufnahmen{w.span ? ` · ${w.span}` : ''}</span>} right={typeof w.remaining === 'number' ? <Pill>{w.remaining} unbenannt</Pill> : undefined} />
      <div class="cx-w-sep cx-w-place">
        {pts.length > 0 && (
          <svg class="cx-w-place-map" width="300" height="210" viewBox="0 0 300 210" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => <path key={`h${i}`} d={`M0 ${20 + i * 26}H300`} stroke="#ffffff08" />)}
            {Array.from({ length: 11 }, (_, i) => <path key={`v${i}`} d={`M${20 + i * 26} 0V210`} stroke="#ffffff08" />)}
            <circle cx="150" cy="104" r="58" fill={TONE.info} fill-opacity=".06" stroke={TONE.info} stroke-opacity=".35" stroke-dasharray="2 3" />
            {pts.slice(0, 400).map((p, i) => (
              <circle key={i} cx={150 + ((p[1] - (minLon + maxLon) / 2) / spanLon) * 100} cy={104 - ((p[0] - (minLat + maxLat) / 2) / spanLat) * 76} r="2.6" fill={TONE.info} fill-opacity=".85" />
            ))}
            {centre && <text x="12" y="198" fill="#707277" font-size="10.5">{centre[0]!.toFixed(2).replace('.', ',')}° N · {centre[1]!.toFixed(2).replace('.', ',')}° O</text>}
          </svg>
        )}
        {list(w.photos).length > 0 && (
          <div class="cx-w-photos">{list(w.photos).slice(0, 4).map((d, i) => <span key={i}><WIcon name="image" size={16} /><span class="cx-w-label cx-w-num">{d}</span></span>)}</div>
        )}
      </div>
      <div class="cx-w-place-form">
        {w.hint && <div class="cx-w-muted cx-w-small">{w.hint}</div>}
        <div class="cx-w-row-inline">
          <input class="cx-w-input" placeholder="Name für diesen Ort" aria-label="Name für diesen Ort" value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <button type="button" class="cx-w-btn primary" disabled={!name.trim()} onClick={save}>Übernehmen</button>
        </div>
        {list(w.suggestions).length > 0 && (
          <div class="cx-w-row-inline wrap"><span class="cx-w-label">Vorschläge</span>{list(w.suggestions).map((s) => <button type="button" key={s} class={`cx-w-chip ${name === s ? 'on' : ''}`} onClick={() => setName(s)}>{s}</button>)}</div>
        )}
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source ?? 'Übernehmen legt den Auftrag ins Eingabefeld'} />
    </Card>
  );
}

/* ── Tageszeitleiste ────────────────────────────────────────────────────── */

export function Timeline({ w, host }: { w: TimelineW; host: WidgetHost }) {
  const lanes = list(w.lanes);
  const blocks = lanes.flatMap((l) => list(l.blocks));
  const t0 = Math.floor(w.startHour ?? Math.min(8, ...blocks.map((b) => hours(b.start)).filter(Number.isFinite)));
  const t1 = Math.ceil(w.endHour ?? Math.max(20, ...blocks.map((b) => hours(b.end)).filter(Number.isFinite)));
  const pct = (h: number) => ((Math.max(t0, Math.min(t1, h)) - t0) / (t1 - t0)) * 100;
  const color = (l: TimelineW['lanes'][number], i: number) => (l.tone ? TONE[toneOf(l.tone)] : i === 0 ? TEXT : [TONE.violet, TONE.info, TONE.pos, TONE.warn][(i - 1) % 4]!);
  const minutes = lanes.map((l) => list(l.blocks).reduce((n, b) => n + Math.max(0, hours(b.end) - hours(b.start)) * 60, 0));
  const sum = minutes.reduce((a, b) => a + b, 0);
  return (
    <Card label={`Zeitleiste ${w.title}`}>
      <Head mark="bars" title={w.title} sub={w.subtitle} />
      <div class="cx-w-sep cx-w-timeline">
        {sum > 0 && <div class="cx-w-stack-bar">{lanes.map((l, i) => minutes[i]! > 0 && <i key={i} style={{ flex: minutes[i], background: color(l, i) }} />)}</div>}
        <div class="cx-w-lanes">
          <div class="cx-w-lane-ticks">{Array.from({ length: Math.floor((t1 - t0) / 2) + 1 }, (_, k) => t0 + k * 2).map((h) => <i key={h} style={{ left: `${pct(h)}%` }} class={h % 4 === 0 ? 'strong' : ''} />)}</div>
          {lanes.map((l, i) => (
            <div class="cx-w-lane" key={i}>
              <span class="cx-w-lane-label"><Dot color={color(l, i)} /><span class="cx-w-v cx-w-grow cx-w-ellipsis">{l.label}</span>{l.total && <span class="cx-w-dim cx-w-num">{l.total}</span>}</span>
              <span class="cx-w-lane-track">
                {list(l.blocks).map((b, j) => {
                  const a = hours(b.start);
                  const z = hours(b.end);
                  if (!Number.isFinite(a) || !Number.isFinite(z)) return null;
                  const wide = z - a >= 2;
                  const c = color(l, i);
                  return (
                    <span key={j}>
                      <i class="cx-w-block" style={{ left: `${pct(a)}%`, width: `${pct(z) - pct(a)}%`, background: `${c}${c === TEXT ? '1c' : '24'}` }}>{wide && b.label && <span style={{ color: c }}>{b.label}</span>}</i>
                      {!wide && b.label && <span class="cx-w-block-label" style={{ left: `calc(${pct(z)}% + 8px)`, color: c }}>{b.label}</span>}
                    </span>
                  );
                })}
              </span>
            </div>
          ))}
          <div class="cx-w-lane-axis">{Array.from({ length: Math.floor((t1 - t0) / 4) + 1 }, (_, k) => t0 + k * 4).map((h) => <span key={h} class="cx-w-label cx-w-num" style={{ left: `${pct(h)}%` }}>{String(h).padStart(2, '0')}</span>)}</div>
        </div>
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} />
    </Card>
  );
}
