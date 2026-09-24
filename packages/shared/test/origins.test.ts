import { describe, expect, it } from 'vitest';
import { citiesByState, CITIES, distanceKm, nearestCity, NEAR_ME_RADIUS_KM } from '../src/cities';
import {
  COUNTRIES,
  continentOf,
  countriesInText,
  countryFromName,
  groupByContinent,
} from '../src/origins';

describe('origins', () => {
  it.each([
    ['Ethiopia', 'ET'],
    ['Sumatra', 'ID'],
    ['Yunnan', 'CN'],
    ['DRC', 'CD'],
    ['Côte d’Ivoire', 'CI'],
    ['Papua New Guinea', 'PG'],
    ['Hawaii', 'US'],
    ['Nariño', 'CO'],
  ])('%s → %s', (name, code) => {
    expect(countryFromName(name)).toBe(code);
  });
  it('returns undefined for unknown names', () => {
    expect(countryFromName('Atlantis')).toBeUndefined();
  });
  it('finds countries in blend descriptions', () => {
    expect(
      countriesInText(
        'A blend of Brazil Cerrado and Colombia Huila with a touch of Ethiopia',
      ).sort(),
    ).toEqual(['BR', 'CO', 'ET']);
    expect(countriesInText('Costa Rica Tarrazu honey')).toEqual(['CR']);
  });
  it('every country has a continent', () => {
    for (const code of Object.keys(COUNTRIES)) expect(continentOf(code)).toBeDefined();
  });
  it('groups by continent in fixed order', () => {
    expect(groupByContinent(['CO', 'ET', 'BR', 'KE', 'XX'])).toEqual([
      { continent: 'Africa', codes: ['ET', 'KE'] },
      { continent: 'South America', codes: ['BR', 'CO'] },
      { continent: 'Other', codes: ['XX'] },
    ]);
  });
});

describe('cities', () => {
  it('has three launch cities with sane geometry', () => {
    expect(CITIES.map((c) => c.id)).toEqual(['nyc', 'philadelphia', 'boston']);
    for (const c of CITIES) {
      const [minLng, minLat, maxLng, maxLat] = c.bbox;
      expect(c.center[0]).toBeGreaterThan(minLng);
      expect(c.center[0]).toBeLessThan(maxLng);
      expect(c.center[1]).toBeGreaterThan(minLat);
      expect(c.center[1]).toBeLessThan(maxLat);
    }
  });
  it('groups by state', () => {
    expect(citiesByState().map((g) => g.state)).toEqual(['MA', 'NY', 'PA']);
  });
  it('computes distances and the nearest city', () => {
    expect(distanceKm([-73.985, 40.728], [-75.1652, 39.9526])).toBeGreaterThan(125);
    expect(distanceKm([-73.985, 40.728], [-75.1652, 39.9526])).toBeLessThan(135);
    const hoboken = nearestCity([-74.03, 40.745]);
    expect(hoboken.city.id).toBe('nyc');
    expect(hoboken.km).toBeLessThan(NEAR_ME_RADIUS_KM);
    const chicago = nearestCity([-87.63, 41.88]);
    expect(chicago.km).toBeGreaterThan(NEAR_ME_RADIUS_KM);
  });
});
