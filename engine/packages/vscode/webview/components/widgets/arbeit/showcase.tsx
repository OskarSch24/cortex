/** Arbeits-Widgets zum Zeigen: Jobs, Design-Abgleich, Palette, Audio, Kennzahlen, Quiz, Spieltheorie. */
import { useState } from 'preact/hooks';
import {
  Actions, Card, Foot, Head, Pill, TEXT, TONE, WIcon, fmt, list, str, toneOf, type WidgetHost,
} from '../parts.js';
import {
  contrast, wcagGrade, type AudioTakesW, type DesignDiffW, type GameTheoryW, type JobsW, type KpisW, type PaletteW,
  type QuizW,
} from '../spec.js';
import { clip } from './ops.js';

/* ── Job-Treffer ────────────────────────────────────────────────────────── */

export function Jobs({ w, host }: { w: JobsW; host: WidgetHost }) {
  return (
    <Card label={`Stellen ${w.title}`}>
      <Head mark="briefcase" title={w.title} sub={w.subtitle} />
      <div class="cx-w-rows sep">
        {list(w.jobs).slice(0, 6).map((j, i) => {
          const s = Math.max(0, Math.min(100, Number(j.score) || 0));
          const c = s >= 85 ? TONE.pos : s >= 70 ? TONE.warn : '#999a9d';
          const r = 15;
          const circ = 2 * Math.PI * r;
          return (
            <div class="cx-w-row job" key={i}>
              <span class="cx-w-score">
                <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r={r} fill="none" stroke="#ffffff12" stroke-width="3" /><circle cx="20" cy="20" r={r} fill="none" stroke={c} stroke-width="3" stroke-linecap="round" stroke-dasharray={`${(circ * s) / 100} ${circ}`} transform="rotate(-90 20 20)" /></svg>
                <span class="cx-w-num">{Math.round(s)}</span>
              </span>
              <span class="cx-w-grow cx-w-stack">
                {j.url ? <button type="button" class="cx-w-link cx-w-job-title" onClick={() => host.onOpenUrl?.(j.url!)}>{j.title}</button> : <span class="cx-w-v cx-w-job-title">{j.title}</span>}
                <span class="cx-w-small">{[j.company, j.location].filter(Boolean).join(' · ')}</span>
                {list(j.tags).length > 0 && <span class="cx-w-row-inline wrap tags">{list(j.tags).map((t) => <Pill key={t}>{t}</Pill>)}</span>}
              </span>
              <span class="cx-w-stack end">{j.salary && <span class="cx-w-v cx-w-num">{j.salary}</span>}{j.source && <span class="cx-w-label">{j.source}</span>}</span>
            </div>
          );
        })}
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.note ?? w.source} />
    </Card>
  );
}

/* ── Design-Abgleich ────────────────────────────────────────────────────── */

export function DesignDiff({ w, host }: { w: DesignDiffW; host: WidgetHost }) {
  const diffs = list(w.diffs);
  const open = diffs.filter((d) => !d.fixed).length;
  const swatch = (c?: string) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? <i class="cx-w-swatch" style={{ background: c }} /> : null);
  return (
    <Card label={`Design-Abgleich ${w.title}`}>
      <Head mark="compare" title={w.title} sub={w.subtitle} right={open ? <Pill tone="warn">{open} von {diffs.length} offen</Pill> : <Pill tone="pos">Alles angeglichen</Pill>} />
      <div class="cx-w-rows sep">
        <div class="cx-w-row head"><span class="cx-w-diff-n" /><span class="cx-w-grow">Abweichung</span><span class="cx-w-diff-vals">Design → Code</span><span class="cx-w-diff-state" /></div>
        {diffs.map((d, i) => (
          <div class="cx-w-row tall" key={i}>
            <span class={`cx-w-diff-n ${d.fixed ? '' : 'open'}`}>{i + 1}</span>
            <span class={`cx-w-grow ${d.fixed ? '' : 'cx-w-v'}`}>{d.label}</span>
            <span class="cx-w-diff-vals cx-w-mono">{swatch(d.designColor)}<span class="cx-w-v">{d.design}</span><WIcon name="arrow" size={12} color="#707277" />{swatch(d.codeColor)}<span class="cx-w-v">{d.code}</span></span>
            <span class="cx-w-diff-state">{d.fixed ? <Pill tone="pos">Behoben</Pill> : <Pill tone="warn">Offen</Pill>}</span>
          </div>
        ))}
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} />
    </Card>
  );
}

/* ── Farbpalette ────────────────────────────────────────────────────────── */

export function Palette({ w, host }: { w: PaletteW; host: WidgetHost }) {
  const bg = w.background && contrast(w.background, w.background) ? w.background : '#101113';
  const colors = list(w.colors).filter((c) => contrast(c.hex, bg) !== undefined);
  const weakest = colors.map((c) => ({ c, r: contrast(c.hex, bg)! })).filter((x) => x.r >= 1.5 && x.r < 4.5);
  return (
    <Card label={`Farbpalette ${w.title}`}>
      <Head mark="drop" title={w.title} sub={<>Kontrast gegen <span class="cx-w-mono">{bg.toUpperCase()}</span></>} />
      <div class="cx-w-sep cx-w-palette">
        {colors.map((c, i) => {
          const r = contrast(c.hex, bg)!;
          const surface = r < 1.5;
          const grade = wcagGrade(r);
          return (
            <div class="cx-w-swatch-cell" key={i}>
              <span class={`cx-w-swatch-big ${surface ? 'surface' : ''}`} style={{ background: c.hex }}>{!surface && <span style={{ color: bg }}>Aa</span>}</span>
              <span class="cx-w-mono cx-w-v cx-w-ellipsis">{c.name}</span>
              <span class="cx-w-mono cx-w-dim">{c.hex.toUpperCase()}</span>
              <span class="cx-w-row-inline">
                {surface ? <span class="cx-w-dim cx-w-small">—</span> : <span class="cx-w-num cx-w-small">{r.toFixed(1).replace('.', ',')} : 1</span>}
                <Pill tone={surface ? 'mute' : grade === 'AAA' || grade === 'AA' ? 'pos' : grade === 'AA groß' ? 'warn' : 'neg'}>{surface ? 'Fläche' : grade}</Pill>
              </span>
            </div>
          );
        })}
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={weakest.length ? <span class="cx-w-row-inline"><WIcon name="alert" size={14} color={TONE.warn} /><span class="cx-w-muted">{weakest.map((x) => x.c.name).join(', ')} {weakest.length === 1 ? 'reicht' : 'reichen'} nur für große Schrift.</span></span> : w.source} right="WCAG 2.1" />
    </Card>
  );
}

/* ── Audio-Takes ────────────────────────────────────────────────────────── */

export function AudioTakes({ w, host }: { w: AudioTakesW; host: WidgetHost }) {
  const takes = list(w.takes);
  const [fav, setFav] = useState(() => takes.findIndex((t) => t.favorite));
  return (
    <Card label={`Audio ${w.title}`}>
      <Head mark="wave" title={w.title} sub={w.subtitle} />
      <div class="cx-w-rows sep">
        {takes.map((t, i) => {
          const peaks = list(t.peaks).filter((p) => typeof p === 'number');
          return (
            <div class="cx-w-row take" key={i}>
              <button type="button" class="cx-w-play" aria-label={`${t.label} öffnen`} disabled={!t.path} onClick={() => t.path && host.onOpenFile?.(t.path)}><WIcon name="play" size={14} /></button>
              <span class="cx-w-stack cx-w-take-name"><span class="cx-w-v">{t.label}</span>{t.note && <span class="cx-w-label">{t.note}</span>}</span>
              <span class="cx-w-grow cx-w-wave">
                {peaks.length > 1
                  ? peaks.slice(0, 96).map((p, j) => <i key={j} style={{ height: `${Math.max(12, Math.min(100, p * 100))}%` }} />)
                  : <i class="flat" />}
              </span>
              <span class="cx-w-num cx-w-dim cx-w-small">{t.duration}</span>
              <button type="button" class="cx-w-star" aria-label={`${t.label} markieren`} aria-pressed={fav === i} onClick={() => setFav(fav === i ? -1 : i)}>
                <WIcon name="star" size={16} color={fav === i ? TONE.warn : '#707277'} fill={fav === i ? TONE.warn : 'none'} />
              </button>
            </div>
          );
        })}
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} right={fav >= 0 ? `Markiert: ${takes[fav]?.label}` : undefined} />
    </Card>
  );
}

/* ── Kennzahlen ─────────────────────────────────────────────────────────── */

export function Kpis({ w, host }: { w: KpisW; host: WidgetHost }) {
  const kpis = list(w.kpis).slice(0, 4);
  const funnel = list(w.funnel).filter((f) => typeof f.value === 'number' && f.value >= 0);
  const top = Math.max(1, ...funnel.map((f) => f.value));
  return (
    <Card label={`Kennzahlen ${w.title}`}>
      <Head mark="trend" title={w.title} sub={w.subtitle} />
      <div class="cx-w-cells sep" style={{ gridTemplateColumns: `repeat(${Math.max(1, kpis.length)}, minmax(0, 1fr))` }}>
        {kpis.map((k, i) => (
          <div class="cx-w-stat" key={i}>
            <span class="cx-w-label">{k.label}</span>
            <b class="cx-w-num">{fmt(k.value)}</b>
            {k.change !== undefined && k.change !== '' && <Pill tone={toneOf(k.tone, /^[-−]/.test(str(k.change)) ? 'neg' : /^\+/.test(str(k.change)) ? 'pos' : 'mute')}>{fmt(k.change)}</Pill>}
          </div>
        ))}
      </div>
      {funnel.length > 1 && (
        <div class="cx-w-sep cx-w-funnel">
          <div class="cx-w-row-inline between"><span class="cx-w-label">Trichter</span><span class="cx-w-label">Schritt-Quote</span></div>
          {funnel.map((f, i) => {
            const last = i === funnel.length - 1;
            const width = Math.max(3, (Math.log10(f.value + 1) / Math.log10(top + 1)) ** 3 * 100);
            const rate = i > 0 && funnel[i - 1]!.value > 0 ? (f.value / funnel[i - 1]!.value) * 100 : undefined;
            const c = last ? TONE.pos : TEXT;
            return (
              <div class="cx-w-funnel-row" key={i}>
                <span class={last ? 'cx-w-v' : 'cx-w-muted'}>{f.label}</span>
                <span class="cx-w-funnel-bar"><i style={{ width: `${width}%`, background: `${c}${last ? '33' : '1a'}` }} /><span class="cx-w-num" style={{ color: c }}>{f.value.toLocaleString('de-DE')}</span></span>
                <span class="cx-w-num cx-w-dim cx-w-small">{rate === undefined ? '' : `${rate.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`}</span>
              </div>
            );
          })}
        </div>
      )}
      <Actions actions={w.actions} host={host} />
      <Foot left={w.note ?? w.source} />
    </Card>
  );
}

/* ── Quiz ───────────────────────────────────────────────────────────────── */

export function Quiz({ w, host }: { w: QuizW; host: WidgetHost }) {
  const [picked, setPicked] = useState<number>();
  const options = list(w.options);
  const history = str(w.progress?.history).replace(/[^rw]/g, '');
  const answered = picked !== undefined;
  const right = picked === w.answer;
  const total = w.progress?.total ?? 0;
  const done = history.length + (answered ? 1 : 0);
  const correct = history.split('').filter((h) => h === 'r').length + (answered && right ? 1 : 0);
  return (
    <Card label={`Quiz ${w.topic}`}>
      <Head mark="cap" title={w.topic} sub={w.subtitle ?? (w.progress ? `Frage ${w.progress.current} von ${w.progress.total}` : undefined)} right={done > 0 ? <Pill tone={correct / done >= 0.6 ? 'pos' : 'warn'}><span class="cx-w-num">{correct} von {done} richtig</span></Pill> : undefined} />
      {total > 0 && (
        <div class="cx-w-segs">
          {Array.from({ length: Math.min(total, 40) }, (_, i) => {
            const h = i < history.length ? history[i] : i === history.length && answered ? (right ? 'r' : 'w') : '';
            return <i key={i} class={h === 'r' ? 'done' : h === 'w' ? 'failed' : 'next'} />;
          })}
        </div>
      )}
      <div class="cx-w-sep cx-w-quiz">
        <div class="cx-w-question">{w.question}</div>
        <div class="cx-w-options">
          {options.map((o, i) => {
            const state = !answered ? '' : i === w.answer ? 'right' : i === picked ? 'wrong' : 'rest';
            return (
              <button type="button" key={i} class={`cx-w-option ${state}`} disabled={answered} onClick={() => setPicked(i)}>
                <span class="key">{state === 'right' ? <WIcon name="check" size={13} color="#101113" width={2.6} /> : state === 'wrong' ? <WIcon name="close" size={12} color="#101113" width={2.6} /> : String.fromCharCode(65 + i)}</span>
                <span>{o}</span>
              </button>
            );
          })}
        </div>
        {answered && (
          <div class="cx-w-explain">
            <span class={right ? 'right' : 'wrong'}>{right ? 'Richtig.' : `Nicht ganz. Richtig ist ${String.fromCharCode(65 + w.answer)}.`}</span> {w.explanation && <span class="cx-w-muted">{w.explanation}</span>}
          </div>
        )}
      </div>
      <Actions actions={answered ? w.actions : undefined} host={host} />
      <Foot left={w.source} />
    </Card>
  );
}

/* ── Spieltheorie ───────────────────────────────────────────────────────── */

export function GameTheory({ w, host }: { w: GameTheoryW; host: WidgetHost }) {
  const actors = list(w.actors).slice(0, 4);
  const spots = [[20, 30], [496, 30], [258, 150], [20, 150]] as const;
  const bw = 190;
  const bh = 58;
  const centre = (i: number) => [spots[i]![0] + bw / 2, spots[i]![1] + bh / 2] as const;
  const colorOf = (i: number) => (actors[i]?.tone ? TONE[toneOf(actors[i]!.tone)] : i === 0 ? TEXT : i === 1 ? TONE.info : TONE.warn);
  const rels = list(w.relations).filter((r) => r.from >= 0 && r.to >= 0 && r.from < actors.length && r.to < actors.length && r.from !== r.to);
  const pair = new Map<string, number>();
  const bal = w.balance ? Math.max(-1, Math.min(1, Number(w.balance.value) || 0)) : 0;
  return (
    <Card label={`Strategische Lage ${w.title}`}>
      <Head mark="people" title={w.title} sub={w.subtitle ?? `${actors.length} Beteiligte`} />
      <div class="cx-w-sep cx-w-game">
        <svg width="100%" viewBox={`0 0 706 ${actors.length > 2 ? 220 : 136}`} role="img" aria-label={actors.map((a) => `${a.name}: ${a.want}`).join('; ')}>
          <defs>
            <marker id="cx-w-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#ffffff66" /></marker>
          </defs>
          {rels.map((r, i) => {
            const key = [Math.min(r.from, r.to), Math.max(r.from, r.to)].join('-');
            const n = pair.get(key) ?? 0;
            pair.set(key, n + 1);
            const [ax, ay] = centre(r.from);
            const [bx, by] = centre(r.to);
            const horizontal = Math.abs(ay - by) < 10;
            const bend = (n % 2 === 0 ? -1 : 1) * 16;
            const sx = horizontal ? (ax < bx ? ax + bw / 2 + 6 : ax - bw / 2 - 6) : ax;
            const sy = horizontal ? ay + bend : ay < by ? ay + bh / 2 + 4 : ay - bh / 2 - 4;
            const ex = horizontal ? (ax < bx ? bx - bw / 2 - 6 : bx + bw / 2 + 6) : bx + (ax < bx ? -bw / 4 : bw / 4);
            const ey = horizontal ? by + bend : ay < by ? by - bh / 2 - 6 : by + bh / 2 + 6;
            const mx = (sx + ex) / 2;
            const my = (sy + ey) / 2 + (horizontal ? bend * 1.2 : 0);
            return (
              <g key={i}>
                <path d={`M${sx} ${sy} Q${mx} ${my} ${ex} ${ey}`} fill="none" stroke={r.dashed ? TONE.warn : '#ffffff40'} stroke-opacity={r.dashed ? 0.7 : 1} stroke-width="1.5" stroke-dasharray={r.dashed ? '3 4' : undefined} marker-end="url(#cx-w-arrow)" />
                <text x={horizontal ? mx : mx + 14} y={my + (horizontal ? (bend < 0 ? -8 : 16) : 18)} text-anchor={horizontal ? 'middle' : 'start'} fill={r.dashed ? '#e3c285' : '#999a9d'} font-size="11.5">{clip(r.label, 220, 11.5)}</text>
              </g>
            );
          })}
          {actors.map((a, i) => {
            const [x, y] = spots[i]!;
            const c = colorOf(i);
            return (
              <g key={i}>
                <rect x={x} y={y} width={bw} height={bh} rx="10" fill="#1b1c1f" stroke={c} stroke-opacity={a.hidden === true ? 0.6 : 0.8} stroke-dasharray={a.hidden === true ? '4 4' : undefined} />
                <circle cx={x + 18} cy={y + 21} r="4" fill={c} />
                <text x={x + 30} y={y + 25} fill={TEXT} font-size="13" font-weight="500">{clip(a.name, bw - 40, 13)}</text>
                <text x={x + 14} y={y + 45} fill="#8f9094" font-size="11.5">{clip(a.want, bw - 24, 11.5)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {w.balance && (
        <div class="cx-w-balance">
          <div class="cx-w-row-inline between"><span class="cx-w-label">{w.balance.left}</span><span class="cx-w-label">{w.balance.right}</span></div>
          <span class="cx-w-balance-track">
            <i class="mid" />
            <i class="fill" style={{ left: bal >= 0 ? '50%' : `${50 + bal * 50}%`, width: `${Math.abs(bal) * 50}%` }} />
            <i class="knob" style={{ left: `calc(${50 + bal * 50}% - 6px)` }} />
          </span>
          {w.balance.note && <div class="cx-w-muted cx-w-small">{w.balance.note}</div>}
        </div>
      )}
      <div class="cx-w-advice"><WIcon name="spark" size={16} color={TEXT} /><span>{w.recommendation}</span></div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} />
    </Card>
  );
}
