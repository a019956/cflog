import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  beanMatchesFilters,
  countActiveFilters,
  facetOptions,
  hasBeanFilter,
  orderBeans,
  sortCafes,
} from '../src/filters';
import { bean, cafe } from './fixtures';

const A = cafe({
  id: 'a',
  kind: 'roaster',
  roastLevels: ['light'],
  processes: ['washed'],
  originCountries: ['ET'],
  flavorFamilies: ['fruity/berry', 'floral/floral'],
  varieties: ['gesha'],
  sellsOnline: true,
});
const B = cafe({
  id: 'b',
  kind: 'cafe',
  roastLevels: ['medium'],
  processes: ['natural'],
  originCountries: ['BR'],
  flavorFamilies: ['nutty-cocoa/cocoa'],
  hasDecaf: true,
});
const C = cafe({
  id: 'c',
  kind: 'both',
  roastLevels: ['light', 'dark'],
  processes: ['honey'],
  originCountries: ['CR', 'ET'],
  flavorFamilies: ['fruity'],
  varieties: ['SL28'],
});
const D = cafe({ id: 'd', kind: 'cafe', dataStatus: 'menu-only', beanCount: 0 });
const E = cafe({ id: 'e', kind: 'roaster', dataStatus: 'none', beanCount: 0 });
const ALL = [A, B, C, D, E];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('applyFilters', () => {
  it('returns everything with no filters', () => {
    expect(ids(applyFilters(ALL, {}))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('treats empty arrays as no filter', () => {
    expect(applyFilters(ALL, { roastLevels: [], kinds: [] })).toHaveLength(5);
  });
  it('ORs within a dimension', () => {
    expect(ids(applyFilters(ALL, { roastLevels: ['light', 'medium'] }))).toEqual(['a', 'b', 'c']);
  });
  it('ANDs across dimensions', () => {
    expect(ids(applyFilters(ALL, { roastLevels: ['light'], processes: ['honey'] }))).toEqual(['c']);
  });
  it('excludes cafés without bean data when a bean filter is set', () => {
    expect(ids(applyFilters(ALL, { originCountries: ['ET', 'BR', 'CR'] }))).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(ids(applyFilters(ALL, { decafOnly: true }))).toEqual(['b']);
  });
  it('keeps no-data cafés for place-type filters', () => {
    expect(ids(applyFilters(ALL, { kinds: ['cafe'] }))).toEqual(['b', 'c', 'd']);
  });
  it('matches kind "both" for roaster or café', () => {
    expect(ids(applyFilters(ALL, { kinds: ['roaster'] }))).toEqual(['a', 'c', 'e']);
    expect(ids(applyFilters(ALL, { kinds: ['both'] }))).toEqual(['c']);
  });
  it('matches a top-level flavor family against its sub-ids', () => {
    expect(ids(applyFilters(ALL, { flavorFamilies: ['fruity'] }))).toEqual(['a', 'c']);
  });
  it('does not widen a sub-family selection to the parent', () => {
    expect(ids(applyFilters(ALL, { flavorFamilies: ['fruity/berry'] }))).toEqual(['a']);
  });
  it('normalises varieties', () => {
    expect(ids(applyFilters(ALL, { varieties: ['Geisha'] }))).toEqual(['a']);
    expect(ids(applyFilters(ALL, { varieties: ['SL-28'] }))).toEqual(['c']);
  });
  it('filters sells-online', () => {
    expect(ids(applyFilters(ALL, { sellsOnline: true }))).toEqual(['a']);
  });
  it('does not mutate the input', () => {
    const copy = [...ALL];
    applyFilters(ALL, { roastLevels: ['dark'] });
    expect(ALL).toEqual(copy);
  });
  it('filters 1,000 cafés in under 50 ms', () => {
    const many = Array.from({ length: 1000 }, (_, i) =>
      cafe({ ...[A, B, C, D, E][i % 5]!, id: `x${i}` }),
    );
    const t0 = performance.now();
    const out = applyFilters(many, {
      roastLevels: ['light'],
      flavorFamilies: ['fruity'],
      kinds: ['roaster'],
    });
    expect(performance.now() - t0).toBeLessThan(50);
    expect(out).toHaveLength(400);
  });
});

describe('filter helpers', () => {
  it('detects bean filters and counts active dimensions', () => {
    expect(hasBeanFilter({ kinds: ['cafe'], sellsOnline: true })).toBe(false);
    expect(hasBeanFilter({ varieties: ['gesha'] })).toBe(true);
    expect(
      countActiveFilters({
        kinds: ['cafe'],
        roastLevels: ['light', 'dark'],
        decafOnly: true,
        processes: [],
      }),
    ).toBe(3);
  });
  it('collects facet options', () => {
    const o = facetOptions(ALL);
    expect(o.originCountries).toEqual(['BR', 'CR', 'ET']);
    expect(o.hasDecaf).toBe(true);
  });
});

describe('sortCafes', () => {
  it('orders by data tier then name', () => {
    const shuffled = [E, D, C, B, A];
    expect(ids(sortCafes(shuffled))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('orders by distance within a tier when location is given', () => {
    const near = cafe({ id: 'z-near', lng: -73.99, lat: 40.73 });
    const far = cafe({ id: 'a-far', lng: -73.8, lat: 40.85 });
    const none = cafe({ id: 'n', dataStatus: 'none', lng: -73.99, lat: 40.73 });
    expect(ids(sortCafes([none, far, near], [-73.99, 40.73]))).toEqual(['z-near', 'a-far', 'n']);
  });
});

describe('bean-level matching', () => {
  const b1 = bean({
    id: 'Ethiopia Guji',
    roastLevel: 'light',
    process: 'natural',
    origin: { countries: ['ET'] },
    flavorFamilies: ['fruity/berry'],
  });
  const b2 = bean({
    id: 'House Blend',
    roastLevel: 'medium',
    process: 'washed',
    origin: { countries: ['BR', 'CO'] },
    flavorFamilies: ['nutty-cocoa/cocoa'],
    inStock: false,
  });
  const b3 = bean({
    id: 'Decaf Colombia',
    roastLevel: 'medium',
    origin: { countries: ['CO'] },
    isDecaf: true,
  });
  it('requires every active dimension on the same bean', () => {
    expect(beanMatchesFilters(b1, { roastLevels: ['light'], flavorFamilies: ['fruity'] })).toBe(
      true,
    );
    expect(beanMatchesFilters(b2, { roastLevels: ['light'], originCountries: ['BR'] })).toBe(false);
  });
  it('never marks beans when only place filters are active', () => {
    expect(beanMatchesFilters(b1, { kinds: ['roaster'] })).toBe(false);
  });
  it('orders matches first, then in-stock, then name', () => {
    const out = orderBeans([b2, b1, b3], { originCountries: ['CO'] });
    expect(out.map((o) => [o.bean.id, o.matches])).toEqual([
      ['Decaf Colombia', true],
      ['House Blend', true],
      ['Ethiopia Guji', false],
    ]);
    expect(orderBeans([b2, b3], {}).map((o) => o.bean.id)).toEqual([
      'Decaf Colombia',
      'House Blend',
    ]);
  });
});
