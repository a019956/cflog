// Bundled SAMPLE data so the app runs before the pipeline has filled Firestore.
// Every place here is fictional; the UI shows a "Sample data" banner whenever this source is active.
import {
  CITIES,
  mapTastingNotes,
  type Bean,
  type Cafe,
  type CafeSummary,
  type Kind,
  type MenuItem,
  type Process,
  type RoastLevel,
} from '@cflog/shared';

import type { DataSource } from './source';

const NAMES = [
  'Lantern Street Roasters',
  'Juniper & Ash Coffee',
  'Paper Moon Café',
  'Northbound Coffee Co.',
  'Little Ember Espresso',
  'Quarry Hill Roasting',
  'Willow Bean Café',
  'Tidewater Coffee',
  'Copper Kettle Café',
  'Field Notes Coffee',
];

const BEANS: {
  name: string;
  countries: string[];
  process: Process;
  roast: RoastLevel;
  notes: string[];
  varieties: string[];
  decaf?: boolean;
}[] = [
  {
    name: 'Ethiopia Guji Hambela',
    countries: ['ET'],
    process: 'natural',
    roast: 'light',
    notes: ['Blueberry', 'Jasmine', 'Milk chocolate'],
    varieties: ['ethiopian landrace'],
  },
  {
    name: 'Kenya Nyeri AA',
    countries: ['KE'],
    process: 'washed',
    roast: 'light',
    notes: ['Blackcurrant', 'Grapefruit', 'Brown sugar'],
    varieties: ['sl28', 'sl34'],
  },
  {
    name: 'Colombia Huila',
    countries: ['CO'],
    process: 'washed',
    roast: 'medium',
    notes: ['Caramel', 'Red apple'],
    varieties: ['caturra', 'castillo'],
  },
  {
    name: 'Costa Rica Tarrazú Honey',
    countries: ['CR'],
    process: 'honey',
    roast: 'medium-light',
    notes: ['Peach', 'Honey', 'Black tea'],
    varieties: ['catuai'],
  },
  {
    name: 'Brazil Cerrado',
    countries: ['BR'],
    process: 'natural',
    roast: 'medium-dark',
    notes: ['Cocoa', 'Hazelnut', 'Toffee'],
    varieties: ['mundo novo'],
  },
  {
    name: 'Panama Gesha',
    countries: ['PA'],
    process: 'washed',
    roast: 'light',
    notes: ['Bergamot', 'Jasmine', 'Lemon'],
    varieties: ['gesha'],
  },
  {
    name: 'Sumatra Gayo',
    countries: ['ID'],
    process: 'wet-hulled',
    roast: 'dark',
    notes: ['Cedar', 'Dark chocolate', 'Clove'],
    varieties: ['typica'],
  },
  {
    name: 'Colombia Anaerobic Pink Bourbon',
    countries: ['CO'],
    process: 'anaerobic',
    roast: 'light',
    notes: ['Strawberry', 'Wine', 'Cacao nibs'],
    varieties: ['pink bourbon'],
  },
  {
    name: 'House Espresso Blend',
    countries: ['BR', 'CO', 'ET'],
    process: 'natural',
    roast: 'omni',
    notes: ['Chocolate', 'Cherry', 'Almond'],
    varieties: [],
  },
  {
    name: 'Swiss Water Decaf Peru',
    countries: ['PE'],
    process: 'washed',
    roast: 'medium',
    notes: ['Milk chocolate', 'Walnut'],
    varieties: ['typica'],
    decaf: true,
  },
];

const MENU: [string, MenuItem['category'], number][] = [
  ['Espresso', 'espresso', 3.5],
  ['Cortado', 'espresso', 4.5],
  ['Oat latte', 'espresso', 6],
  ['Batch brew', 'brewed', 3.75],
  ['Pour-over (rotating)', 'pour-over', 6.5],
  ['Cold brew', 'cold', 5.5],
  ['Hojicha latte', 'tea', 6],
  ['Almond croissant', 'food', 4.75],
];

const ISO = '2026-09-21T09:00:00.000Z';

function seeded(n: number) {
  let s = n * 9301 + 49297;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

function buildCafe(cityIdx: number, i: number): Cafe {
  const city = CITIES[cityIdx]!;
  const rnd = seeded(cityIdx * 100 + i + 1);
  const [minLng, minLat, maxLng, maxLat] = city.bbox;
  const lng = city.center[0] + (rnd() - 0.5) * (maxLng - minLng) * 0.35;
  const lat = city.center[1] + (rnd() - 0.5) * (maxLat - minLat) * 0.35;
  const kind: Kind = i % 3 === 0 ? 'roaster' : i % 3 === 1 ? 'both' : 'cafe';
  const id = `sample-${city.id}-${i}`;
  const beanCount = i % 5 === 4 ? 0 : 2 + (i % 4);
  const beans: Bean[] = Array.from({ length: beanCount }, (_, k) => {
    const b = BEANS[(i * 3 + k) % BEANS.length]!;
    return {
      id: `${id}-b${k}`,
      name: b.name,
      url: undefined,
      origin: { countries: b.countries, region: undefined },
      isBlend: b.countries.length > 1,
      process: b.process,
      roastLevel: b.roast,
      varieties: b.varieties,
      isDecaf: !!b.decaf,
      tastingNotesRaw: b.notes,
      flavorFamilies: mapTastingNotes(b.notes).families,
      priceUsd: 18 + ((i + k) % 6) * 2,
      sizeGrams: 340,
      inStock: (i + k) % 7 !== 0,
      source: 'shopify',
      firstSeenAt: '2026-09-01',
      lastSeenAt: ISO,
    };
  });
  const menu: MenuItem[] =
    i % 5 === 3
      ? []
      : MENU.slice(0, 4 + (i % 5)).map(([name, category, priceUsd], k) => ({
          id: `${id}-m${k}`,
          name,
          category,
          priceUsd,
          source: 'llm',
          lastSeenAt: ISO,
        }));
  const uniq = <T>(xs: T[]) => [...new Set(xs)].sort() as T[];
  const facets = {
    dataStatus: beans.length
      ? ('beans' as const)
      : menu.length
        ? ('menu-only' as const)
        : ('none' as const),
    beanCount: beans.length,
    sellsOnline: beans.length > 0 && kind !== 'cafe',
    roastLevels: uniq(beans.flatMap((b) => (b.roastLevel ? [b.roastLevel] : []))),
    processes: uniq(beans.flatMap((b) => (b.process ? [b.process] : []))),
    originCountries: uniq(beans.flatMap((b) => b.origin.countries)),
    flavorFamilies: uniq(beans.flatMap((b) => b.flavorFamilies)),
    varieties: uniq(beans.flatMap((b) => b.varieties)),
    hasDecaf: beans.some((b) => b.isDecaf),
  };
  return {
    id,
    cityId: city.id,
    name: NAMES[i % NAMES.length]!,
    kind,
    address: { line1: `${100 + i * 7} Sample Street`, city: city.name, state: city.state },
    lat,
    lng,
    geohash: '',
    website: `https://example.com/coffeelog-sample/${id}`,
    platform: beans.length ? 'shopify' : 'other',
    dataStatus: facets.dataStatus,
    facets,
    sources: {},
    lastCrawledAt: ISO,
    lastChangedAt: ISO,
    crawlStatus: 'ok',
    hidden: false,
    beans,
    menu,
  };
}

export const SAMPLE_CAFES: Cafe[] = CITIES.flatMap((_, ci) =>
  Array.from({ length: NAMES.length }, (_, i) => buildCafe(ci, i)),
);

const summary = (c: Cafe): CafeSummary => ({
  id: c.id,
  name: c.name,
  kind: c.kind,
  lat: c.lat,
  lng: c.lng,
  ...c.facets,
});

export const sampleSource: DataSource = {
  kind: 'sample',
  async cityIndex(cityId) {
    return SAMPLE_CAFES.filter((c) => c.cityId === cityId).map(summary);
  },
  async cityCounts() {
    return Object.fromEntries(
      CITIES.map((c) => [c.id, SAMPLE_CAFES.filter((s) => s.cityId === c.id).length]),
    );
  },
  async cafe(id) {
    return SAMPLE_CAFES.find((c) => c.id === id) ?? null;
  },
};
