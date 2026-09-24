/** Die zehn Alltags-Widgets. Entwurf: docs/design/cortex-widgets (Seite „Alltag“). */
import { useEffect, useState } from 'preact/hooks';
import { clockTime } from '../../format/time.js';
import { useWidgetState } from './state.js';
import {
  Actions, Card, Check, Dot, Foot, Head, Meter, Pill, Seg, Spark, TEXT, TONE, WIcon, list, str, toneOf,
  type WidgetHost,
} from './parts.js';
import {
  formatClock, formatNumber, formatOffset, friendlyDate, hours, timerRemaining, zoneTime,
  type CalendarW, type ConverterW, type DeparturesW, type ParcelW, type RouteW, type TickerW, type TimerW,
  type TodoW, type WeatherW, type WorldclockW,
} from './spec.js';

/** Ein Takt je Sekunde oder Minute, nur solange die Karte steht. */
function useNow(stepMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(t);
  }, [stepMs]);
  return now;
}

/** Grad auf Deutsch: 18.6 → „18,6“, in der Stundenleiste ganz. Text bleibt Text. */
function deg(v: number | string | undefined, digits = 1): string {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace('°', '').replace(',', '.'));
  if (!Number.isFinite(n)) return String(v ?? '').replace(/°$/, '');
  return n.toLocaleString('de-DE', { maximumFractionDigits: digits });
}

/* ── Wetter ─────────────────────────────────────────────────────────────── */

const WEATHER_ICON: Record<string, [string, string]> = {
  sun: ['sun', TONE.warn], partly: ['cloud', '#c9cacd'], cloud: ['cloud', '#c9cacd'], rain: ['rain', TONE.info],
  snow: ['snow', '#c9cacd'], storm: ['storm', TONE.warn], fog: ['fog', '#999a9d'], night: ['moon', '#c9cacd'],
};

function WeatherArt({ icon }: { icon?: string }) {
  if (icon === 'sun' || icon === 'partly' || !icon) {
    return (
      <svg class="cx-w-art" width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
        <circle cx="46" cy="28" r="13" fill={TONE.warn} fill-opacity=".16" />
        <circle cx="46" cy="28" r="8.5" fill={TONE.warn} />
        <path d="M46 11v4M46 41v4M29 28h4M59 28h4M34 16l2.8 2.8M55.2 37.2 58 40M34 40l2.8-2.8M55.2 18.8 58 16" stroke={TONE.warn} stroke-width="2" stroke-linecap="round" />
        {icon !== 'sun' && <path d="M22 60h28a10 10 0 0 0 1.5-19.9A13.5 13.5 0 0 0 25.3 37 11.5 11.5 0 0 0 22 60Z" fill="#2a2b2e" stroke="#c9cacd" stroke-width="1.6" stroke-linejoin="round" />}
      </svg>
    );
  }
  const [name, color] = WEATHER_ICON[icon] ?? WEATHER_ICON.cloud!;
  return <span class="cx-w-art big"><WIcon name={name} size={64} color={color} width={1.2} /></span>;
}

export function Weather({ w, host }: { w: WeatherW; host: WidgetHost }) {
  const hoursList = list(w.hours).slice(0, 8);
  const facts = [['Hoch', w.high !== undefined ? `${deg(w.high, 0)}°` : ''], ['Tief', w.low !== undefined ? `${deg(w.low, 0)}°` : ''], ['Wind', str(w.wind)], ['Regen', str(w.rain)]].filter(([, v]) => v);
  return (
    <Card label={`Wetter ${w.location}`}>
      <div class="cx-w-weather-top">
        <div class="cx-w-grow">
          <div class="cx-w-label cx-w-row-inline"><WIcon name="pin" size={13} />{w.location}{w.date ? ` · ${friendlyDate(w.date)}` : ''}</div>
          <div class="cx-w-weather-now">
            <span class="cx-w-num cx-w-temp">{deg(w.temp)}°</span>
            <span class="cx-w-stack"><span>{w.condition}</span>{w.detail && <span class="cx-w-muted cx-w-small">{w.detail}</span>}</span>
          </div>
        </div>
        <WeatherArt icon={w.icon} />
      </div>
      {facts.length > 0 && <div class="cx-w-facts">{facts.map(([k, v]) => <span key={k}>{k} <b>{v}</b></span>)}</div>}
      {hoursList.length > 0 && (
        <div class="cx-w-hours" style={{ gridTemplateColumns: `repeat(${hoursList.length}, minmax(0, 1fr))` }}>
          {hoursList.map((h, i) => {
            const rain = typeof h.rain === 'number' ? Math.max(0, Math.min(100, h.rain)) : undefined;
            const [name, color] = WEATHER_ICON[h.icon ?? ''] ?? (rain !== undefined && rain >= 50 ? WEATHER_ICON.rain! : WEATHER_ICON.partly!);
            return (
              <div class={`cx-w-hour ${i === 0 ? 'now' : ''}`} key={i}>
                <span class="cx-w-label cx-w-num">{h.time}</span>
                <WIcon name={name} size={18} color={color} />
                <span class="cx-w-num">{deg(h.temp, 0)}°</span>
                {rain !== undefined && (
                  <>
                    <span class="cx-w-rainbar"><i style={{ height: Math.max(2, rain * 0.22), opacity: 0.35 + rain / 160 }} /></span>
                    <span class={`cx-w-num cx-w-tiny ${rain >= 50 ? 'info' : ''}`}>{rain} %</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} />
    </Card>
  );
}

/* ── Timer ──────────────────────────────────────────────────────────────── */

export function Timer({ w, host }: { w: TimerW; host: WidgetHost }) {
  const now = useNow(1000);
  const [state, setState, loaded] = useWidgetState(host, () => ({ endsAt: w.endsAt ?? new Date(Date.now() + w.durationSec * 1000).toISOString(), pausedAt: undefined as number | undefined, shiftMs: 0, addedSec: 0, stopped: false }));
  const { pausedAt, shiftMs, addedSec, stopped } = state;
  const duration = Math.max(1, w.durationSec + addedSec);
  const end = Date.parse(state.endsAt) + shiftMs + addedSec * 1000;
  const live = Number.isFinite(end);
  const remaining = stopped ? 0 : live ? timerRemaining({ durationSec: duration, endsAt: new Date(end).toISOString() }, pausedAt ?? now) : duration;
  const frac = remaining / duration;
  const r = 58;
  const c = 2 * Math.PI * r;
  const ang = -Math.PI / 2 + 2 * Math.PI * frac;
  const done = live && remaining === 0;
  const togglePause = () => {
    if (pausedAt) {
      setState(s => ({ ...s, shiftMs: s.shiftMs + (Date.now() - pausedAt), pausedAt: undefined }));
    } else setState(s => ({ ...s, pausedAt: Date.now() }));
  };
  return (
    <Card label={`Timer ${w.label}`}>
      <div class="cx-w-timer">
        <div class="cx-w-ring">
          <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
            {Array.from({ length: 25 }, (_, k) => {
              const a = -Math.PI / 2 + (k * 2 * Math.PI) / 25;
              return <path key={k} d={`M${70 + 66 * Math.cos(a)} ${70 + 66 * Math.sin(a)}L${70 + 69 * Math.cos(a)} ${70 + 69 * Math.sin(a)}`} stroke="#ffffff26" stroke-width="1" />;
            })}
            <circle cx="70" cy="70" r={r} fill="none" stroke="#ffffff12" stroke-width="5" />
            {!done && <circle cx="70" cy="70" r={r} fill="none" stroke={TEXT} stroke-width="5" stroke-linecap="round" stroke-dasharray={`${c * frac} ${c}`} transform="rotate(-90 70 70)" />}
            {!done && <circle cx={70 + r * Math.cos(ang)} cy={70 + r * Math.sin(ang)} r="8" fill={TEXT} fill-opacity=".14" />}
            {!done && <circle cx={70 + r * Math.cos(ang)} cy={70 + r * Math.sin(ang)} r="3.5" fill={TEXT} />}
          </svg>
          <span class="cx-w-ring-text" role="timer">
            <span class="cx-w-num">{formatClock(remaining)}</span>
            <span class="cx-w-label cx-w-num">von {formatClock(duration)}</span>
          </span>
        </div>
        <div class="cx-w-grow cx-w-stack gap4">
          <Pill tone={done ? 'pos' : pausedAt ? 'warn' : 'mute'}><WIcon name="timer" size={12} />{stopped ? 'Beendet' : done ? 'Abgelaufen' : pausedAt ? 'Pausiert' : live ? 'Läuft' : 'Bereit'}</Pill>
          <span class="cx-w-h2">{w.label}</span>
          {((live && !pausedAt && !done && !stopped) || w.note) && (
            <span class="cx-w-muted cx-w-small cx-w-num">
              {[live && !pausedAt && !done && !stopped ? `Endet um ${clockTime(end)}` : '', w.note ?? ''].filter(Boolean).join(' · ')}
            </span>
          )}
          {live && !done && !stopped && (
            <div class="cx-w-actions inline">
              <button type="button" class="cx-w-btn primary" disabled={!loaded} onClick={togglePause}><WIcon name={pausedAt ? 'play' : 'pause'} size={14} />{pausedAt ? 'Weiter' : 'Pause'}</button>
              <button type="button" class="cx-w-btn" disabled={!loaded} onClick={() => setState(s => ({ ...s, addedSec: s.addedSec + 60 }))}>+1 min</button>
              <button type="button" class="cx-w-btn quiet" disabled={!loaded} onClick={() => setState(s => ({ ...s, stopped: true }))}>Beenden</button>
            </div>
          )}
        </div>
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} />
    </Card>
  );
}

/* ── Abfahrten ──────────────────────────────────────────────────────────── */

export function Departures({ w, host }: { w: DeparturesW; host: WidgetHost }) {
  return (
    <Card label={`Abfahrten ${w.station}`}>
      <Head mark="train" title={w.station} sub={w.subtitle ? <><Dot color={TONE.pos} />{w.subtitle}</> : undefined} />
      <div class="cx-w-rows sep">
        {list(w.rows).map((r, i) => (
          <div class="cx-w-row tall" key={i}>
            <span class="cx-w-line" style={{ background: /^#[0-9a-f]{3,8}$/i.test(r.color ?? '') ? r.color : '#ffffff1f' }}>{r.line}</span>
            <span class="cx-w-grow cx-w-v cx-w-ellipsis">{r.destination}</span>
            {r.platform && <span class="cx-w-dim cx-w-small">{r.platform}</span>}
            {typeof r.delay === 'number' && r.delay > 0 ? <Pill tone="neg">+{r.delay} min</Pill> : <Pill>pünktlich</Pill>}
            <span class="cx-w-num cx-w-minutes"><b>{r.minutes}</b> <span class="cx-w-dim">min</span></span>
          </div>
        ))}
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} />
    </Card>
  );
}

/* ── Umrechner ──────────────────────────────────────────────────────────── */

export function Converter({ w, host }: { w: ConverterW; host: WidgetHost }) {
  const [amount, setAmount] = useState(w.amount);
  const [flipped, setFlipped] = useState(false);
  const rate = flipped ? 1 / w.rate : w.rate;
  const from = flipped ? w.to : w.from;
  const to = flipped ? w.from : w.to;
  const result = Number.isFinite(amount) ? amount * rate : NaN;
  const side = (label: string, cur: string, sym: string | undefined, body: preact.ComponentChildren) => (
    <div class="cx-w-box cx-w-grow cx-w-conv">
      <div class="cx-w-label">{label}</div>
      <div class="cx-w-conv-line">{body}<span class="cx-w-cur">{sym && <span class="cx-w-tile">{sym}</span>}{cur}</span></div>
    </div>
  );
  return (
    <Card label={`Umrechner ${w.from} ${w.to}`}>
      <div class="cx-w-pad cx-w-conv-row">
        {side('Du gibst', from, flipped ? w.toSymbol : w.fromSymbol, (
          <input class="cx-w-num cx-w-conv-input" type="number" inputMode="decimal" aria-label={`Betrag in ${from}`} value={Number.isFinite(amount) ? amount : ''} onInput={(e) => setAmount(parseFloat((e.currentTarget as HTMLInputElement).value))} />
        ))}
        <button type="button" class="cx-w-round" aria-label="Richtung tauschen" onClick={() => { setFlipped((f) => !f); if (Number.isFinite(result)) setAmount(Math.round(result * 100) / 100); }}><WIcon name="swap" size={15} /></button>
        {side('Du bekommst', to, flipped ? w.fromSymbol : w.toSymbol, <span class="cx-w-num cx-w-conv-out">{Number.isFinite(result) ? formatNumber(result) : '—'}</span>)}
      </div>
      {list(w.presets).length > 0 && !flipped && (
        <div class="cx-w-chips">{list(w.presets).map((p) => <button type="button" key={p} class={`cx-w-chip ${p === amount ? 'on' : ''}`} onClick={() => setAmount(p)}>{p.toLocaleString('de-DE')} {w.fromSymbol ?? w.from}</button>)}</div>
      )}
      <Actions actions={w.actions} host={host} />
      <Foot left={<span class="cx-w-num">1 {w.from} = {formatNumber(w.rate, 4)} {w.to} · 1 {w.to} = {formatNumber(1 / w.rate, 4)} {w.from}</span>} right={w.rateNote ?? w.source} />
    </Card>
  );
}

/* ── Sendung ────────────────────────────────────────────────────────────── */

export function Parcel({ w, host }: { w: ParcelW; host: WidgetHost }) {
  const steps = list(w.steps);
  const nowIdx = steps.findIndex((s) => s.state === 'now');
  const doneUpTo = nowIdx >= 0 ? nowIdx : steps.filter((s) => s.state === 'done').length - 1;
  const col = (i: number) => `${((i + 0.5) / steps.length) * 100}%`;
  return (
    <Card label={`Sendung ${w.carrier}`}>
      <Head mark="package" title={w.carrier} sub={w.tracking ? <span class="cx-w-mono">{w.tracking}</span> : undefined} right={<Pill tone={/zugestellt/i.test(w.status) ? 'pos' : 'info'}>{w.status}</Pill>} />
      {w.eta && (
        <div class="cx-w-sep cx-w-pad-top">
          <div class="cx-w-label">Voraussichtliche Zustellung</div>
          <div class="cx-w-h1">{w.eta}</div>
        </div>
      )}
      <div class="cx-w-steps" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.length > 1 && <i class="cx-w-steps-line" style={{ left: col(0), width: `${(Math.max(0, doneUpTo) / steps.length) * 100}%` }} />}
        {steps.length > 1 && doneUpTo < steps.length - 1 && <i class="cx-w-steps-line dashed" style={{ left: col(Math.max(0, doneUpTo)), width: `${((steps.length - 1 - Math.max(0, doneUpTo)) / steps.length) * 100}%` }} />}
        {steps.map((s, i) => (
          <div class="cx-w-step" key={i}>
            <span class={`cx-w-stepdot ${s.state}`}>{s.state === 'done' && <WIcon name="check" size={12} color="#131416" width={2.4} />}{s.state === 'now' && <i />}</span>
            <span class={`cx-w-steplabel ${s.state === 'next' ? 'dim' : ''}`}>{s.label}</span>
            {s.time && <span class="cx-w-label cx-w-num">{s.time}</span>}
            {s.place && <span class="cx-w-label">{s.place}</span>}
          </div>
        ))}
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.sender ? `Absender: ${w.sender}` : undefined} right={w.source} />
    </Card>
  );
}

/* ── To-do ──────────────────────────────────────────────────────────────── */

export function Todo({ w, host }: { w: TodoW; host: WidgetHost }) {
  const [done, setDone, loaded] = useWidgetState(host, () => list(w.items).map((i) => !!i.done));
  const items = list(w.items);
  const count = done.filter(Boolean).length;
  return (
    <Card label={`Aufgaben ${w.title}`}>
      <Head mark="list" title={w.title} sub={<span class="cx-w-num">{count} von {items.length} erledigt</span>} right={<Meter percent={items.length ? (count / items.length) * 100 : 0} width={96} />} />
      <div class="cx-w-rows sep">
        {items.map((it, i) => (
          <button type="button" role="checkbox" aria-checked={done[i]} disabled={!loaded} class="cx-w-row tall cx-w-todo" key={i} onClick={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))}>
            <Check on={!!done[i]} />
            <span class={`cx-w-grow ${done[i] ? 'cx-w-struck' : 'cx-w-v'}`}>{it.text}</span>
            {it.tag && <Pill tone={toneOf(it.tone)}>{it.tag}</Pill>}
          </button>
        ))}
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} />
    </Card>
  );
}

/* ── Route ──────────────────────────────────────────────────────────────── */

export function Route({ w, host }: { w: RouteW; host: WidgetHost }) {
  const modes = list(w.modes);
  const [mode, setMode] = useState(0);
  return (
    <Card label={`Route ${w.destination}`}>
      <div class="cx-w-map" aria-hidden="true">
        <svg width="100%" viewBox="0 0 736 170" style={{ display: 'block' }}>
          <rect width="736" height="170" fill="#141518" />
          <path d="M0 34 C120 46 260 24 420 40 S640 64 736 52" stroke="#ffffff14" stroke-width="7" fill="none" />
          <path d="M0 84 C160 78 300 98 470 86 S640 72 736 80" stroke="#ffffff12" stroke-width="5" fill="none" />
          <path d="M90 0 L120 170M250 0 L236 170M380 0 L410 170M560 0 L540 170M660 0 L700 170" stroke="#ffffff0c" stroke-width="3" />
          <path d="M170 0 L180 150M320 20 L300 160M470 10 L480 150M610 0 L620 140" stroke="#ffffff07" stroke-width="2" />
          <path d="M112 92 C200 110 300 112 380 118 S560 130 640 120" stroke={TEXT} stroke-opacity=".14" stroke-width="9" fill="none" stroke-linecap="round" />
          <path d="M112 92 C200 110 300 112 380 118 S560 130 640 120" stroke={TEXT} stroke-width="2.5" fill="none" stroke-linecap="round" stroke-dasharray="0.1 6" />
          <circle cx="112" cy="92" r="7" fill="#101113" stroke={TEXT} stroke-width="2.5" />
          <circle cx="640" cy="120" r="14" fill={TONE.info} fill-opacity=".2" />
          <circle cx="640" cy="120" r="6" fill={TONE.info} stroke="#101113" stroke-width="2" />
        </svg>
        {w.origin && <span class="cx-w-maplabel" style={{ left: '15.2%', top: '32%' }}>{w.origin}</span>}
        <span class="cx-w-maplabel" style={{ left: '87%', top: '49%' }}>{w.destination}</span>
        <span class="cx-w-mapnote">Schematisch</span>
      </div>
      <Head mark="pin" markTone={TONE.info} title={w.destination} sub={w.subtitle} right={
        <>
          {modes.length > 0 && <Seg items={modes.map((m) => `${m.label} ${m.minutes} min`)} value={mode} onChange={setMode} />}
          {w.url && <button type="button" class="cx-w-btn" onClick={() => host.onOpenUrl?.(w.url!)}><WIcon name="external" size={14} />Karte öffnen</button>}
        </>
      } />
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} right={w.arrival ? <span class="cx-w-num">Ankunft {w.arrival}</span> : undefined} />
    </Card>
  );
}

/* ── Kalender ───────────────────────────────────────────────────────────── */

export function Calendar({ w, host }: { w: CalendarW; host: WidgetHost }) {
  const days = list(w.days);
  const events = list(w.events).filter((e) => Number.isFinite(hours(e.start)) && Number.isFinite(hours(e.end)) && e.day >= 0 && e.day < days.length);
  const start = Math.floor(w.startHour ?? Math.min(8, ...events.map((e) => hours(e.start))));
  const end = Math.ceil(w.endHour ?? Math.max(18, ...events.map((e) => hours(e.end))));
  const px = 30;
  const colw = `((100% - 48px) / ${days.length})`;
  // Überlappt ein Termin einen früheren desselben Tages, rückt er nach rechts ein.
  const placed = events.map((e, i) => ({ e, inset: events.slice(0, i).some((o) => o.day === e.day && hours(o.start) < hours(e.end) && hours(e.start) < hours(o.end)) }));
  return (
    <Card label={`Kalender ${w.title}`}>
      <Head mark="calendar" title={w.title} sub={w.range} />
      <div class="cx-w-sep cx-w-cal">
        <div class="cx-w-cal-days" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>{days.map((d, i) => <span key={i}>{d}</span>)}</div>
        <div class="cx-w-cal-grid" style={{ height: (end - start) * px }}>
          {Array.from({ length: Math.floor((end - start) / 2) + 1 }, (_, k) => start + k * 2).map((h) => (
            <span key={h}>
              <span class="cx-w-label cx-w-num cx-w-cal-hour" style={{ top: (h - start) * px - 7 }}>{String(h).padStart(2, '0')}</span>
              <i class="cx-w-cal-rule" style={{ top: (h - start) * px }} />
            </span>
          ))}
          {placed.map(({ e, inset }, i) => {
            const a = Math.max(start, hours(e.start));
            const b = Math.min(end, hours(e.end));
            const color = e.tone ? TONE[toneOf(e.tone)] : TEXT;
            return (
              <div
                key={i}
                class={`cx-w-event ${inset ? 'inset' : ''}`}
                style={{
                  left: inset ? `calc(48px + ${colw} * ${e.day} + ${colw} * .3)` : `calc(48px + ${colw} * ${e.day} + 3px)`,
                  width: inset ? `calc(${colw} * .7 - 3px)` : `calc(${colw} - 6px)`,
                  top: (a - start) * px + 1,
                  height: Math.max(20, (b - a) * px - 3),
                  background: `${color}${color === TEXT ? '14' : '1f'}`,
                  color,
                }}
              >
                <b class={b - a <= 1.5 ? 'one' : ''}>{e.title}</b>
                <span class="cx-w-num">{e.start}–{e.end}</span>
              </div>
            );
          })}
        </div>
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={list(w.legend).length ? <span class="cx-w-legend">{list(w.legend).map((l) => <span key={l.label}><Dot color={TONE[toneOf(l.tone)]} />{l.label}</span>)}</span> : undefined} right={w.source} />
    </Card>
  );
}

/* ── Kurs ───────────────────────────────────────────────────────────────── */

export function Ticker({ w, host }: { w: TickerW; host: WidgetHost }) {
  const tone = toneOf(w.tone, /^[-−]/.test(str(w.change).trim()) ? 'neg' : /^[±0]/.test(str(w.change).trim()) ? 'mute' : 'pos');
  const color = TONE[tone];
  return (
    <Card label={`Kurs ${w.name}`}>
      <Head mark={<span class="cx-w-ticker-mark">{str(w.symbol).split('/')[0]!.slice(0, 4)}</span>} title={w.name} sub={w.symbol} />
      <div class="cx-w-ticker">
        <div class="cx-w-ticker-price">
          <span class="cx-w-num cx-w-price">{w.price}</span>
          <Pill tone={tone}><WIcon name={tone === 'neg' ? 'trendDown' : tone === 'pos' ? 'trend' : 'trendFlat'} size={12} />{w.change}</Pill>
          {w.changeNote && <span class="cx-w-muted cx-w-small cx-w-num">{w.changeNote}</span>}
        </div>
        <div class="cx-w-ticker-chart"><Spark values={w.series} width="100%" height={132} color={color} reference={w.reference} /></div>
        {list(w.axis).length > 0 && <div class="cx-w-axis">{list(w.axis).map((t, i) => <span class="cx-w-label cx-w-num" key={i}>{t}</span>)}</div>}
        {w.referenceLabel && <div class="cx-w-label cx-w-row-inline cx-w-num cx-w-reflabel"><svg width="18" height="2" aria-hidden="true"><path d="M0 1H18" stroke="#ffffff66" stroke-dasharray="1 3" /></svg>{w.referenceLabel}</div>}
      </div>
      {list(w.others).length > 0 && (
        <div class="cx-w-rows sep">
          {list(w.others).map((o, i) => {
            const t = toneOf(o.tone, /^[-−]/.test(str(o.change).trim()) ? 'neg' : 'pos');
            return (
              <div class="cx-w-row tall" key={i}>
                <span class="cx-w-tile sq">{str(o.symbol).slice(0, 4)}</span>
                <span class="cx-w-grow cx-w-stack"><span class="cx-w-v">{o.name}</span><span class="cx-w-label">{o.symbol}</span></span>
                {list(o.series).length > 1 && <Spark values={o.series!} width={120} height={28} color={TONE[t]} area={false} glow={false} stroke={1.3} />}
                <span class="cx-w-num cx-w-v cx-w-right" style={{ minWidth: 96 }}>{o.price}</span>
                <span class="cx-w-fixed62"><Pill tone={t}>{o.change}</Pill></span>
              </div>
            );
          })}
        </div>
      )}
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} />
    </Card>
  );
}

/* ── Weltuhr ────────────────────────────────────────────────────────────── */

export function Worldclock({ w, host }: { w: WorldclockW; host: WidgetHost }) {
  const now = useNow(15000);
  const date = new Date(now);
  const cities = list(w.cities).map((c) => ({ c, z: zoneTime(c.timezone, date) })).filter((x) => x.z);
  const home = cities.find((x) => x.c.home) ?? cities[0];
  return (
    <Card label="Weltuhr">
      <Head mark="globe" title="Weltuhr" sub={home ? `${home.z!.weekday} · ${home.z!.time} in ${home.c.name}` : undefined} />
      <div class="cx-w-rows sep">
        {cities.map(({ c, z }) => {
          const rise = c.sunrise ? hours(c.sunrise) : NaN;
          const set = c.sunset ? hours(c.sunset) : NaN;
          const hasSun = Number.isFinite(rise) && Number.isFinite(set);
          const day = hasSun ? z!.hour >= rise && z!.hour <= set : z!.hour >= 7 && z!.hour < 19;
          const isHome = home && c === home.c;
          return (
            <div class="cx-w-row clock" key={c.name}>
              <span class="cx-w-grow cx-w-stack">
                <span class="cx-w-v cx-w-row-inline">{c.name}{isHome && <Pill>Hier</Pill>}</span>
                <span class="cx-w-label">{z!.weekday} · {isHome ? z!.zoneName : formatOffset(z!.offsetMin - home!.z!.offsetMin)}</span>
              </span>
              <span class="cx-w-daybar">
                <i class="track" />
                {hasSun && <i class="day" style={{ left: `${(rise / 24) * 100}%`, width: `${((set - rise) / 24) * 100}%` }} />}
                <i class="now" style={{ left: `calc(${(z!.hour / 24) * 100}% - 1px)` }} />
              </span>
              <span class="cx-w-clock"><WIcon name={day ? 'sun' : 'moon'} size={15} color={day ? TONE.warn : '#999a9d'} /><span class="cx-w-num">{z!.time}</span></span>
            </div>
          );
        })}
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source ?? 'Balken: Ortszeit 0–24 Uhr, heller Teil ist Tageslicht'} />
    </Card>
  );
}
