// @cflog/shared: types, vocabularies and pure logic shared by the app and the pipeline.
// WP-00 stub. WP-01 fills in types.ts, vocab.ts, flavor.ts, noteDictionary.ts, continents.ts,
// cities.ts and filters.ts per `02 Architecture § Data model / Contracts`.

export const ROAST_LEVELS = [
  'light',
  'medium-light',
  'medium',
  'medium-dark',
  'dark',
  'omni',
] as const;
export type RoastLevel = (typeof ROAST_LEVELS)[number];

export const PROCESSES = [
  'washed',
  'natural',
  'honey',
  'anaerobic',
  'carbonic-maceration',
  'wet-hulled',
  'other',
] as const;
export type Process = (typeof PROCESSES)[number];

export const KINDS = ['roaster', 'cafe', 'both'] as const;
export type Kind = (typeof KINDS)[number];

export const DATA_STATUSES = ['beans', 'menu-only', 'none'] as const;
export type DataStatus = (typeof DATA_STATUSES)[number];

export interface CityConfig {
  id: string;
  name: string;
  state: string;
  /** [minLng, minLat, maxLng, maxLat] */
  bbox: [number, number, number, number];
  /** [lng, lat] */
  center: [number, number];
}

/** Launch cities (ADR-004). Bounding boxes are refined in WP-01. */
export const CITIES: readonly CityConfig[] = [
  {
    id: 'nyc',
    name: 'New York City',
    state: 'NY',
    bbox: [-74.26, 40.49, -73.7, 40.92],
    center: [-73.985, 40.728],
  },
  {
    id: 'philadelphia',
    name: 'Philadelphia',
    state: 'PA',
    bbox: [-75.28, 39.87, -74.95, 40.14],
    center: [-75.1652, 39.9526],
  },
  {
    id: 'boston',
    name: 'Boston',
    state: 'MA',
    bbox: [-71.19, 42.23, -70.99, 42.4],
    center: [-71.0589, 42.3601],
  },
];

export const OPENFREEMAP_STYLE = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;
