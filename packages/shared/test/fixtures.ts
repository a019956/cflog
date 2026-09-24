import type { Bean, CafeSummary } from '../src/types';

export function cafe(p: Partial<CafeSummary> & { id: string }): CafeSummary {
  return {
    name: p.id,
    kind: 'cafe',
    lat: 40.73,
    lng: -73.99,
    dataStatus: 'beans',
    beanCount: 1,
    sellsOnline: false,
    roastLevels: [],
    processes: [],
    originCountries: [],
    flavorFamilies: [],
    varieties: [],
    hasDecaf: false,
    ...p,
  };
}

export function bean(p: Partial<Bean> & { id: string }): Bean {
  return {
    name: p.id,
    origin: { countries: [] },
    isBlend: false,
    process: null,
    roastLevel: null,
    varieties: [],
    isDecaf: false,
    tastingNotesRaw: [],
    flavorFamilies: [],
    source: 'shopify',
    firstSeenAt: '2026-09-01T00:00:00Z',
    lastSeenAt: '2026-09-20T00:00:00Z',
    ...p,
  };
}
