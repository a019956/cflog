import { describe, expect, it } from '@jest/globals';
import type { Bean, CafeSummary } from '@cflog/shared';

import {
  clearDim,
  dimCount,
  DECAF,
  optionsFor,
  selectedIn,
  SELLS_ONLINE,
  toggleValue,
} from '../src/filters/dims';
import {
  distanceLabel,
  flag,
  groupMenu,
  originLabel,
  priceLabel,
  roastStep,
  updatedLabel,
} from '../src/lib/format';
import { directionsUrl } from '../src/lib/links';
import { resolveNearMe } from '../src/lib/nearMe';
import { boundsOf, toFeatureCollection } from '../src/map/geojson';
import { rowSubtitle, topFlavors } from '../src/list/CafeList';

const cafe = (p: Partial<CafeSummary> & { id: string }): CafeSummary => ({
  name: p.id,
  kind: 'cafe',
  lat: 40.7,
  lng: -74,
  dataStatus: 'beans',
  beanCount: 2,
  sellsOnline: false,
  roastLevels: [],
  processes: [],
  originCountries: [],
  flavorFamilies: [],
  varieties: [],
  hasDecaf: false,
  ...p,
});

describe('filter dims', () => {
  it('toggles values and removes empty dimensions', () => {
    let f = toggleValue({}, 'roast', 'light');
    expect(f).toEqual({ roastLevels: ['light'] });
    f = toggleValue(f, 'roast', 'dark');
    expect(f.roastLevels).toEqual(['light', 'dark']);
    f = toggleValue(toggleValue(f, 'roast', 'light'), 'roast', 'dark');
    expect(f).toEqual({});
  });
  it('handles the boolean values in Type and More', () => {
    let f = toggleValue({}, 'type', SELLS_ONLINE);
    f = toggleValue(f, 'type', 'roaster');
    f = toggleValue(f, 'more', DECAF);
    f = toggleValue(f, 'more', 'gesha');
    expect(f).toEqual({
      sellsOnline: true,
      kinds: ['roaster'],
      decafOnly: true,
      varieties: ['gesha'],
    });
    expect(selectedIn(f, 'type').sort()).toEqual(['roaster', SELLS_ONLINE].sort());
    expect(dimCount(f, 'more')).toBe(2);
    expect(clearDim(f, 'type')).toEqual({ decafOnly: true, varieties: ['gesha'] });
    expect(toggleValue(f, 'type', SELLS_ONLINE).sellsOnline).toBeUndefined();
  });
  it('builds options from the city data, keeping selected values', () => {
    const cafes = [
      cafe({ id: 'a', originCountries: ['ET', 'CO'], varieties: ['gesha'] }),
      cafe({ id: 'b', originCountries: ['KE'] }),
    ];
    const origin = optionsFor('origin', cafes);
    expect(origin.map((g) => g.title)).toEqual(['Africa', 'South America']);
    expect(origin[0]!.options.map((o) => o.value)).toEqual(['ET', 'KE']);
    expect(
      optionsFor('origin', cafes, { originCountries: ['BR'] }).flatMap((g) =>
        g.options.map((o) => o.value),
      ),
    ).toContain('BR');
    const notes = optionsFor('notes', cafes);
    expect(notes[0]!.options[0]).toEqual({ value: 'fruity', label: 'Fruity' });
    expect(notes[0]!.options[1]).toMatchObject({ value: 'fruity/berry', child: true });
    expect(optionsFor('more', cafes)[1]!.options).toEqual([{ value: 'gesha', label: 'Gesha' }]);
    expect(optionsFor('roast', [])[0]!.options).toHaveLength(6);
  });
});

describe('format helpers', () => {
  const now = new Date('2026-09-25T12:00:00Z');
  it('labels freshness', () => {
    expect(updatedLabel(undefined, now)).toBe('Not updated yet');
    expect(updatedLabel('2026-09-25T08:00:00Z', now)).toBe('Updated today');
    expect(updatedLabel('2026-09-24T08:00:00Z', now)).toBe('Updated yesterday');
    expect(updatedLabel('2026-09-20T12:00:00Z', now)).toBe('Updated 5 days ago');
    expect(updatedLabel('2026-09-04T12:00:00Z', now)).toBe('Updated 3 weeks ago');
    expect(updatedLabel('2026-06-01T12:00:00Z', now)).toBe('Updated 3 months ago');
  });
  it('formats price, size, roast and origin', () => {
    expect(priceLabel({ priceUsd: 22, sizeGrams: 340 })).toBe('$22 · 12 oz');
    expect(priceLabel({ priceUsd: 19.5, sizeGrams: 907 })).toBe('$19.50 · 2 lb');
    expect(priceLabel({})).toBeNull();
    expect(roastStep('light')).toBe(1);
    expect(roastStep('dark')).toBe(5);
    expect(roastStep('omni')).toBe(3);
    expect(roastStep(null)).toBeNull();
    expect(flag('ET')).toBe('🇪🇹');
    const b = { origin: { countries: ['BR', 'CO'] }, isBlend: true } as Pick<
      Bean,
      'origin' | 'isBlend'
    >;
    expect(originLabel(b)).toBe('Blend · 🇧🇷 Brazil, 🇨🇴 Colombia');
    expect(originLabel({ origin: { countries: [] }, isBlend: false })).toBe('Origin not listed');
    expect(distanceLabel(1.609344)).toBe('1.0 mi');
    expect(distanceLabel(40)).toBe('25 mi');
  });
  it('groups the menu in a fixed category order', () => {
    const m = (name: string, category: 'food' | 'espresso' | 'cold') => ({
      id: name,
      name,
      category,
      source: 'llm' as const,
      lastSeenAt: '',
    });
    expect(
      groupMenu([m('Croissant', 'food'), m('Latte', 'espresso'), m('Cold brew', 'cold')]).map(
        (g) => g.label,
      ),
    ).toEqual(['Espresso', 'Cold', 'Food']);
  });
});

describe('near me, links, map data, list rows', () => {
  it('chooses a launch city within 50 km, otherwise reports out of range', () => {
    expect(resolveNearMe([-73.99, 40.73])).toMatchObject({ kind: 'city', cityId: 'nyc' });
    expect(resolveNearMe([-75.16, 39.95])).toMatchObject({ kind: 'city', cityId: 'philadelphia' });
    expect(resolveNearMe([-87.63, 41.88])).toMatchObject({ kind: 'out-of-range' });
  });
  it('builds native directions URLs', () => {
    expect(directionsUrl('ios', 40.7, -74, 'A & B')).toBe(
      'http://maps.apple.com/?daddr=40.7,-74&q=A%20%26%20B',
    );
    expect(directionsUrl('android', 40.7, -74, 'Cafe')).toBe('geo:40.7,-74?q=40.7,-74(Cafe)');
  });
  it('converts cafés to GeoJSON and bounds', () => {
    const fc = toFeatureCollection([
      cafe({ id: 'a' }),
      cafe({ id: 'b', dataStatus: 'none', lng: -73.9, lat: 40.8 }),
    ]);
    expect(fc.features[1]!.properties).toEqual({ id: 'b', name: 'b', status: 'none', rank: 2 });
    expect(fc.features[0]!.geometry.coordinates).toEqual([-74, 40.7]);
    expect(
      boundsOf([
        { lng: -74, lat: 40.7 },
        { lng: -73.9, lat: 40.8 },
      ]),
    ).toEqual([-74, 40.7, -73.9, 40.8]);
    expect(boundsOf([])).toBeNull();
  });
  it('summarises list rows', () => {
    expect(rowSubtitle(cafe({ id: 'a', beanCount: 1 }))).toBe('1 bean');
    expect(rowSubtitle(cafe({ id: 'a', dataStatus: 'none' }))).toBe('No bean info yet');
    expect(
      topFlavors(
        cafe({
          id: 'a',
          flavorFamilies: ['fruity/berry', 'fruity/citrus', 'floral/tea', 'roasted', 'spices'],
        }),
      ),
    ).toEqual(['Fruity', 'Floral', 'Roasted']);
  });
});
