import { describe, expect, it } from 'vitest';
import { formatRadius, isChatLocation, locationSections, locationBrief } from '@cortex/core';
import { geocode, mapView, metersPerPixel, project, reverseGeocode, shortLabel, zoomFor } from '../../src/location/geo.js';

const bornheim = { lat: 50.1236, lon: 8.7076, label: 'Berger Straße 12, Frankfurt-Bornheim', radiusKm: 1.5, source: 'address' as const };

describe('Standort als Kontext im Brief', () => {
  it('prüft, was aus der Webview kommt', () => {
    expect(isChatLocation(bornheim)).toBe(true);
    expect(isChatLocation({ ...bornheim, lat: 95 })).toBe(false);
    expect(isChatLocation({ ...bornheim, radiusKm: 0 })).toBe(false);
    expect(isChatLocation({ ...bornheim, source: 'ip' })).toBe(false);
    expect(isChatLocation(null)).toBe(false);
  });

  it('nennt Mittelpunkt, Radius und den Google-Maps-Scraper mit genau diesem Kreis', () => {
    const [section] = locationSections(bornheim);
    expect(section!.id).toBe('location');
    expect(section!.body).toContain('50.123600, 8.707600');
    expect(section!.body).toContain('1,5 km');
    expect(section!.body).toContain('compass/crawler-google-places');
    expect(section!.body).toContain('"coordinates": [8.707600, 50.123600], "radiusKm": 1.5');
    expect(section!.body).toContain('takes precedence over the home location');
    const [device] = locationSections({ ...bornheim, source: 'device', accuracyM: 35 });
    expect(device!.body).toContain('current position (±35 m)');
  });

  it('schreibt Radien wie im Deutschen', () => {
    expect(formatRadius(0.25)).toBe('250 m');
    expect(formatRadius(1.5)).toBe('1,5 km');
    expect(formatRadius(10)).toBe('10 km');
  });

  it('lässt den Heimatort-Brief unangetastet', () => {
    expect(locationBrief('Frankfurt')).toContain('The user is based in Frankfurt');
  });
});

describe('Geodienst', () => {
  it('macht aus Nominatim-Treffern kurze Namen', () => {
    expect(shortLabel({ address: { road: 'Berger Straße', house_number: '12', city: 'Frankfurt', suburb: 'Bornheim' } })).toBe('Berger Straße 12, Frankfurt-Bornheim');
    expect(shortLabel({ name: 'Elbphilharmonie', address: { road: 'Platz der Deutschen Einheit', house_number: '4', city: 'Frankfurt' } })).toBe('Elbphilharmonie, Platz der Deutschen Einheit 4, Frankfurt');
    expect(shortLabel({ display_name: 'A, B, C, D' })).toBe('A, B, C');
  });

  it('rechnet Web-Mercator und wählt eine Zoomstufe, bei der der Kreis passt', () => {
    expect(project(0, 0, 0)).toEqual({ x: 128, y: 128 });
    const z = zoomFor(50.12, 1, 200);
    expect((2000 / metersPerPixel(50.12, z))).toBeLessThanOrEqual(160);
    expect((2000 / metersPerPixel(50.12, z + 1))).toBeGreaterThan(160);
    expect(zoomFor(50.12, 50, 200)).toBeLessThan(zoomFor(50.12, 0.25, 200));
  });
});

describe.skipIf(!process.env.CORTEX_GEO_LIVE)('Geodienst (echt, OpenStreetMap)', () => {
  it('findet eine Adresse, benennt Koordinaten und liefert Kacheln', async () => {
    const [hit] = await geocode('Römer Frankfurt');
    expect(hit).toBeDefined();
    expect(hit!.lat).toBeCloseTo(50.110, 1);
    expect(hit!.lon).toBeCloseTo(8.682, 1);
    const label = await reverseGeocode(50.1236, 8.7076);
    expect(label).toMatch(/Frankfurt/);
    const view = await mapView(50.1236, 8.7076, 1);
    expect(view.tiles.length).toBeGreaterThanOrEqual(4);
    expect(view.tiles[0]!.src).toMatch(/^data:image\/png;base64,/);
    expect(view.radiusPx).toBeGreaterThan(20);
    expect(view.radiusPx).toBeLessThanOrEqual(100);
  }, 40_000);
});
