import { useEffect, useRef, useState } from 'preact/hooks';
import type { HostToWebview } from '../../src/panel/protocol.js';
import { formatRadius, type ChatLocation } from '../../../core/src/context/chatLocationBrief.js';
import { vscode } from '../vscodeApi.js';
import { Glyph } from './CortexIcons.js';

/**
 * Standort als Kontext: über dem Eingabefeld, aufgerufen über das Plus.
 *
 * Adresse suchen oder den Standort des Macs nehmen, einen Radius wählen,
 * übernehmen — danach hängt der Ort als Chip am Chat, und jede Ortsfrage
 * bezieht sich auf diesen Kreis. Adresssuche und Karte holt der Host
 * (OpenStreetMap), der Standort kommt von den macOS-Ortungsdiensten.
 */

const RADIUS_STEPS = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 20, 50];

type GeoResult = Extract<HostToWebview, { kind: 'geoResult' }>;
type MapData = NonNullable<GeoResult['map']>;

let seq = 0;
function ask(message: Record<string, unknown>): Promise<GeoResult> {
  const reqId = `geo${++seq}`;
  return new Promise(resolve => {
    const onMessage = (event: MessageEvent<HostToWebview>) => {
      if (event.data?.kind !== 'geoResult' || event.data.reqId !== reqId) return;
      window.removeEventListener('message', onMessage);
      resolve(event.data);
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ ...message, reqId } as never);
  });
}

const GEO_ERRORS: Record<number, string> = {
  1: 'macOS hat den Standort nicht freigegeben. Erlaube ihn unter Systemeinstellungen › Datenschutz & Sicherheit › Ortungsdienste › Cortex — oder gib eine Adresse ein.',
  2: 'Der Standort ist gerade nicht bestimmbar. Gib eine Adresse ein.',
  3: 'Die Ortung hat zu lange gedauert. Versuch es noch einmal oder gib eine Adresse ein.',
};

function MapPreview({ map, compact }: { map?: MapData; compact?: boolean }) {
  if (!map) return <div class={`cx-loc-map loading ${compact ? 'compact' : ''}`}><Glyph name="location" size={compact ? 16 : 20} /></div>;
  return <div class={`cx-loc-map ${compact ? 'compact' : ''}`} aria-label="Karte mit Radius">
    <div class="cx-loc-tiles">
      {map.tiles.map(tile => <img key={tile.src.slice(-40) + tile.dx + tile.dy} src={tile.src} alt="" style={{ transform: `translate(${tile.dx}px, ${tile.dy}px)` }} />)}
    </div>
    <span class="cx-loc-ring" style={{ width: `${map.radiusPx * 2}px`, height: `${map.radiusPx * 2}px` }} aria-hidden="true" />
    <span class="cx-loc-dot" aria-hidden="true" />
    <span class="cx-loc-credit">{map.attribution}</span>
  </div>;
}

export function LocationPicker({ current, onApply, onRemove, onClose }: {
  current?: ChatLocation;
  onApply: (location: ChatLocation) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<'search' | 'device'>();
  const [error, setError] = useState('');
  const [results, setResults] = useState<Array<{ label: string; lat: number; lon: number }>>([]);
  const [chosen, setChosen] = useState<Omit<ChatLocation, 'radiusKm'> | undefined>(current && { lat: current.lat, lon: current.lon, label: current.label, source: current.source, accuracyM: current.accuracyM });
  const [radius, setRadius] = useState(current?.radiusKm ?? 1);
  const [map, setMap] = useState<MapData>();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);

  // Die Karte folgt Ort und Radius, gebündelt: Ziehen am Regler fragt nicht bei jedem Schritt.
  useEffect(() => {
    if (!chosen) { setMap(undefined); return; }
    let live = true;
    const timer = setTimeout(() => {
      void ask({ kind: 'geoMap', lat: chosen.lat, lon: chosen.lon, radiusKm: radius }).then(result => { if (live && result.map) setMap(result.map); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [chosen?.lat, chosen?.lon, radius]);

  const search = async () => {
    if (!query.trim() || busy) return;
    setBusy('search'); setError(''); setResults([]);
    const result = await ask({ kind: 'geoSearch', query });
    setBusy(undefined);
    if (result.error) { setError(result.error); return; }
    const places = result.places ?? [];
    if (!places.length) { setError('Nichts gefunden. Versuch es mit Straße und Ort.'); return; }
    if (places.length === 1) { setChosen({ ...places[0]!, source: 'address' }); return; }
    setResults(places);
  };

  /*
   * Geortet wird im Host über CoreLocation (cortex-location-tool): in der
   * Webview ist navigator.geolocation durch ihren Rahmen gesperrt. Beim ersten
   * Mal fragt macOS nach der Freigabe — dafür bleibt Zeit.
   */
  const locate = async () => {
    if (busy) return;
    setBusy('device'); setError(''); setResults([]);
    const result = await ask({ kind: 'geoLocate' });
    setBusy(undefined);
    if (result.error || !result.position) { setError(result.error ?? GEO_ERRORS[2]!); return; }
    const { lat, lon, accuracy, label } = result.position;
    setChosen({ lat, lon, label, source: 'device', accuracyM: accuracy });
  };

  const step = Math.max(0, RADIUS_STEPS.findIndex(value => value >= radius));
  return <section class="cx-loc" aria-label="Standort als Kontext" onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
    <header class="cx-loc-head">
      <Glyph name="location" size={15} />
      <strong>Standort als Kontext</strong>
      <span class="cx-loc-gap" />
      <button class="cx-icon" aria-label="Standort schließen" title="Schließen" onClick={onClose}><Glyph name="close" size={13} /></button>
    </header>

    <div class="cx-loc-search">
      <label class="cx-loc-field">
        <Glyph name="search" size={13} />
        <input ref={input} value={query} placeholder="Adresse, Ort oder Sehenswürdigkeit" aria-label="Adresse suchen"
          onInput={event => setQuery(event.currentTarget.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void search(); } }} />
      </label>
      <button class="cx-loc-btn" disabled={!query.trim() || !!busy} onClick={() => void search()}>
        <Glyph name={busy === 'search' ? 'refresh' : 'search'} size={13} />Suchen
      </button>
      <button class="cx-loc-btn" disabled={!!busy} onClick={() => void locate()} title="Standort dieses Macs verwenden">
        <Glyph name={busy === 'device' ? 'refresh' : 'location'} size={13} />Mein Standort
      </button>
    </div>

    {error && <p class="cx-loc-error" role="alert"><Glyph name="warn" size={13} />{error}</p>}

    {results.length > 0 && <ul class="cx-loc-results" aria-label="Treffer">
      {results.map(place => <li key={`${place.lat},${place.lon}`}>
        <button onClick={() => { setChosen({ ...place, source: 'address' }); setResults([]); }}>
          <Glyph name="location" size={13} /><span>{place.label}</span>
        </button>
      </li>)}
    </ul>}

    {chosen && <>
      <MapPreview map={map} />
      <div class="cx-loc-radius">
        <Glyph name="gauge" size={13} />
        <span>Radius</span>
        <input type="range" min={0} max={RADIUS_STEPS.length - 1} step={1} value={step} aria-label="Radius"
          aria-valuetext={formatRadius(RADIUS_STEPS[step]!)}
          onInput={event => setRadius(RADIUS_STEPS[Number(event.currentTarget.value)]!)} />
        <b>{formatRadius(radius)}</b>
      </div>
      <footer class="cx-loc-foot">
        <Glyph name={chosen.source === 'device' ? 'location' : 'search'} size={13} />
        <span class="cx-loc-label" title={`${chosen.lat.toFixed(5)}, ${chosen.lon.toFixed(5)}`}>
          {chosen.label}{chosen.source === 'device' && chosen.accuracyM ? ` · ±${chosen.accuracyM} m` : ''}
        </span>
        {current && <button class="cx-loc-btn" onClick={onRemove}><Glyph name="trash" size={13} />Entfernen</button>}
        <button class="cx-loc-apply" onClick={() => onApply({ ...chosen, radiusKm: radius })}><Glyph name="check" size={13} />Übernehmen</button>
      </footer>
    </>}
  </section>;
}

/**
 * Der gewählte Standort über dem Eingabefeld: eine kleine Karte mit dem
 * Radiuskreis und daneben Name und Radius. Ein Klick öffnet die Kachel zum
 * Ändern, das × nimmt den Standort vom Chat.
 */
export function LocationChip({ location, onEdit, onRemove }: { location: ChatLocation; onEdit: () => void; onRemove: () => void }) {
  const [map, setMap] = useState<MapData>();
  useEffect(() => {
    let live = true;
    setMap(undefined);
    void ask({ kind: 'geoMap', lat: location.lat, lon: location.lon, radiusKm: location.radiusKm, width: 360, height: 96 }).then(result => { if (live && result.map) setMap(result.map); });
    return () => { live = false; };
  }, [location.lat, location.lon, location.radiusKm]);
  return <div class="cx-loc-chip">
    <button class="cx-loc-chip-main" onClick={onEdit} title="Standort ändern">
      <MapPreview map={map} compact />
      <span class="cx-loc-chip-text">
        <span class="cx-loc-chip-name"><Glyph name="location" size={13} /><span>{location.label}</span></span>
        <small>{location.source === 'device' ? 'Mein Standort' : 'Adresse'} · Radius {formatRadius(location.radiusKm)}</small>
      </span>
    </button>
    <button class="cx-loc-chip-x" aria-label="Standort entfernen" title="Standort entfernen" onClick={onRemove}><Glyph name="close" size={11} /></button>
  </div>;
}
