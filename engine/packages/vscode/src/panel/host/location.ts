import { join } from 'node:path';
import { isChatLocation, locationSections, type BriefSection } from '@cortex/core';
import { geocode, locateDevice, mapView, reverseGeocode } from '../../location/geo.js';
import type { ConversationRecord } from '../panelTypes.js';
import type { HandlerTable, MessageContext, Msg } from './dispatch.js';

/** Standort: Ortssuche, Ortung und die Karte für „Plus › Standort“, dazu der Standort-Kontext eines Chats. */

/** Der Standort-Kontext des Chats im Brief — solange er am Chat hängt. */
export function locationBrief(rec: ConversationRecord | undefined): BriefSection[] {
  const location = rec?.location;
  return location && isChatLocation(location) ? locationSections(location) : [];
}

type GeoKind = 'geoSearch' | 'geoReverse' | 'geoLocate' | 'geoMap';

const geo = async (msg: Msg<GeoKind>, { host, webview }: MessageContext) => {
  try {
    if (msg.kind === 'geoSearch') host.post(webview, { kind: 'geoResult', reqId: msg.reqId, places: await geocode(msg.query) });
    else if (msg.kind === 'geoReverse') host.post(webview, { kind: 'geoResult', reqId: msg.reqId, label: await reverseGeocode(msg.lat, msg.lon) });
    else if (msg.kind === 'geoLocate') {
      const started = Date.now();
      const found = await locateDevice(join(host.ctx.extensionUri.fsPath, 'dist', 'CortexLocation.app'));
      const label = await reverseGeocode(found.lat, found.lon).catch(() => `${found.lat.toFixed(5)}, ${found.lon.toFixed(5)}`);
      host.output.appendLine(`[standort] geortet in ${Date.now() - started} ms: ±${found.accuracy} m`);
      host.post(webview, { kind: 'geoResult', reqId: msg.reqId, position: { ...found, label } });
    } else {
      const width = Math.min(1200, Math.max(120, Math.round(msg.width ?? 800)));
      const height = Math.min(600, Math.max(60, Math.round(msg.height ?? 200)));
      host.post(webview, { kind: 'geoResult', reqId: msg.reqId, map: await mapView(msg.lat, msg.lon, msg.radiusKm, width, height) });
    }
  } catch (error) {
    host.output.appendLine(`[standort] ${msg.kind} fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    host.post(webview, { kind: 'geoResult', reqId: msg.reqId, error: error instanceof Error ? error.message : String(error) });
  }
};

export const locationHandlers: HandlerTable<GeoKind | 'setChatLocation'> = {
  geoSearch: geo,
  geoReverse: geo,
  geoLocate: geo,
  geoMap: geo,
  setChatLocation: (msg, { host }) => {
    const rec = host.conversations.get(msg.conversationId);
    if (!rec) return;
    if (msg.location === null) delete rec.location;
    else if (isChatLocation(msg.location)) rec.location = { ...msg.location, label: msg.location.label.slice(0, 300) };
    else return;
    host.output.appendLine(`[standort] ${msg.conversationId}: ${rec.location ? `${rec.location.label} · ${rec.location.radiusKm} km (${rec.location.source})` : 'entfernt'}`);
    host.persistSoon();
  },
};
