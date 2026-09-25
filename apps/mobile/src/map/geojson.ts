import type { CafeSummary } from '@cflog/shared';

export interface CafeFeatureProps {
  id: string;
  name: string;
  status: CafeSummary['dataStatus'];
  /** 0 = beans (drawn on top), 1 = menu-only, 2 = none */
  rank: number;
}

const RANK = { beans: 0, 'menu-only': 1, none: 2 } as const;

/** Cafés → GeoJSON points for the clustered source. */
export function toFeatureCollection(
  cafes: readonly CafeSummary[],
): GeoJSON.FeatureCollection<GeoJSON.Point, CafeFeatureProps> {
  return {
    type: 'FeatureCollection',
    features: cafes.map((c) => ({
      type: 'Feature',
      id: c.id,
      geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      properties: { id: c.id, name: c.name, status: c.dataStatus, rank: RANK[c.dataStatus] },
    })),
  };
}

/** Bounding box [w, s, e, n] of the cafés, or null. */
export function boundsOf(
  cafes: readonly Pick<CafeSummary, 'lat' | 'lng'>[],
): [number, number, number, number] | null {
  if (cafes.length === 0) return null;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const c of cafes) {
    w = Math.min(w, c.lng);
    e = Math.max(e, c.lng);
    s = Math.min(s, c.lat);
    n = Math.max(n, c.lat);
  }
  return [w, s, e, n];
}
