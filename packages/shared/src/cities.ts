// Launch cities (ADR-004). The bundled list drives the city picker; `cities/{id}` docs add live counts.

export interface CityConfig {
  id: string;
  name: string;
  state: string;
  /** [minLng, minLat, maxLng, maxLat] — query box for Overture; may include neighbouring towns. */
  bbox: [number, number, number, number];
  /** [lng, lat] */
  center: [number, number];
  /** Default map zoom for the city. */
  zoom: number;
  note?: string;
}

export const CITIES: readonly CityConfig[] = [
  {
    id: 'nyc',
    name: 'New York City',
    state: 'NY',
    bbox: [-74.259, 40.477, -73.7, 40.917],
    center: [-73.985, 40.728],
    zoom: 12,
    note: 'Five boroughs; the box also touches Jersey City and Hoboken.',
  },
  {
    id: 'philadelphia',
    name: 'Philadelphia',
    state: 'PA',
    bbox: [-75.28, 39.867, -74.955, 40.138],
    center: [-75.1652, 39.9526],
    zoom: 12.5,
  },
  {
    id: 'boston',
    name: 'Boston',
    state: 'MA',
    bbox: [-71.191, 42.227, -70.986, 42.42],
    center: [-71.0789, 42.3601],
    zoom: 12.5,
    note: 'Includes Cambridge, Somerville and Brookline.',
  },
];

export function cityById(id: string): CityConfig | undefined {
  return CITIES.find((c) => c.id === id);
}

/** Cities grouped by state for the picker (states and cities sorted by name). */
export function citiesByState(): { state: string; cities: CityConfig[] }[] {
  const states = [...new Set(CITIES.map((c) => c.state))].sort();
  return states.map((state) => ({
    state,
    cities: CITIES.filter((c) => c.state === state).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km between two [lng, lat] points. */
export function distanceKm(a: readonly [number, number], b: readonly [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export const KM_PER_MILE = 1.609344;

/** Nearest launch city to a [lng, lat] point, with the distance to its centre. */
export function nearestCity(point: readonly [number, number]): { city: CityConfig; km: number } {
  let best: { city: CityConfig; km: number } | undefined;
  for (const city of CITIES) {
    const km = distanceKm(point, city.center);
    if (!best || km < best.km) best = { city, km };
  }
  if (!best) throw new Error('No launch cities configured');
  return best;
}

/** Near-me rule (03 UX-UI): a launch city within this radius of the user is chosen automatically. */
export const NEAR_ME_RADIUS_KM = 50;
