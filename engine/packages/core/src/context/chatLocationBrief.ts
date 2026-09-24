/**
 * Ein Standort als Kontext eines Chats.
 *
 * Der Nutzer legt im Eingabefeld einen Ort fest — über eine Adresse oder den
 * eigenen Standort des Macs — und einen Radius. Solange er am Chat hängt,
 * beziehen sich Fragen nach Orten, Geschäften, „hier“ oder „in der Nähe“ auf
 * diesen Kreis. Die Orte selbst holt das Modell über den Google-Maps-Scraper
 * des Apify-Plugins, genau um diesen Mittelpunkt und in diesem Radius.
 */

import type { BriefSection } from './brief.js';

export interface ChatLocation {
  lat: number;
  lon: number;
  /** Lesbarer Name, etwa „Berger Straße 12, Frankfurt-Bornheim“. */
  label: string;
  radiusKm: number;
  /** Woher: eingegebene Adresse oder der Standort des Macs. */
  source: 'address' | 'device';
  /** Genauigkeit der Ortung in Metern, nur bei `device`. */
  accuracyM?: number;
}

export function isChatLocation(value: unknown): value is ChatLocation {
  const v = value as ChatLocation | null;
  return !!v && typeof v === 'object'
    && Number.isFinite(v.lat) && Math.abs(v.lat) <= 90
    && Number.isFinite(v.lon) && Math.abs(v.lon) <= 180
    && typeof v.label === 'string' && v.label.length <= 300
    && Number.isFinite(v.radiusKm) && v.radiusKm > 0 && v.radiusKm <= 100
    && (v.source === 'address' || v.source === 'device');
}

/** Wie die Radiusangabe im Text steht: 500 m, 1,5 km, 10 km. */
export function formatRadius(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${String(Math.round(km * 10) / 10).replace('.', ',')} km`;
}

export function locationSections(location: ChatLocation): BriefSection[] {
  const lat = location.lat.toFixed(6);
  const lon = location.lon.toFixed(6);
  const radius = Math.round(location.radiusKm * 1000) / 1000;
  const body = [
    `Location context of this chat: ${JSON.stringify(location.label)} at ${lat}, ${lon} (latitude, longitude), radius ${formatRadius(location.radiusKm)}` +
      (location.source === 'device' ? ` — the user's current position${location.accuracyM ? ` (±${Math.round(location.accuracyM)} m)` : ''}.` : ' — an address the user entered.'),
    'Questions about places, shops, restaurants, services, "here", "nearby", "around me" or distances refer to this circle unless the user names another place. ' +
      'For this chat it takes precedence over the home location given elsewhere in the brief.',
    'To look places up, use the Apify Google Maps scraper (tool for the Actor compass/crawler-google-places, or call-actor with that Actor) with input ' +
      `{"searchStringsArray": [<one or a few search terms from the question, in the local language>], "customGeolocation": {"type": "Point", "coordinates": [${lon}, ${lat}], "radiusKm": ${radius}}, ` +
      '"maxCrawledPlacesPerSearch": 20, "language": "de", "skipClosedPlaces": true}. Keep the numbers small — every place costs the user Apify credits. ' +
      'Only raise maxCrawledPlacesPerSearch when the user asks for a complete list.',
    'If the Apify tools are not available, say that the Apify plugin needs to be connected (Plugins › Apify) and answer from web search instead, clearly marked as less precise.',
    'Answer with the places that actually lie inside the circle: name, rating and number of reviews, address, distance from the centre (compute it from the coordinates), ' +
      'opening hours if asked, and a Google Maps link per place. Sort by what the question asks for (distance, rating, …). Do not invent places.',
  ].join('\n');
  return [{ id: 'location', title: 'Location context', body }];
}
