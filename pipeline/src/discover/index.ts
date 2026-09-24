import { cityById } from '@cflog/shared';
import type { AllConfig } from '../config.js';
import { toCandidates, type DiscoveryResult } from './candidates.js';
import { queryOverturePlaces, type OverturePlace } from './overture.js';

export * from './candidates.js';
export * from './overture.js';

export type PlaceQuery = (
  bbox: readonly [number, number, number, number],
) => Promise<OverturePlace[]>;

/** Discover stage for one city. `query` is injectable for tests. */
export async function discoverCity(
  cityId: string,
  config: AllConfig,
  query: PlaceQuery = (bbox) => queryOverturePlaces(config.pipeline.overture, bbox),
): Promise<DiscoveryResult> {
  const city = cityById(cityId);
  if (!city) throw new Error(`Unknown city "${cityId}"`);
  const places = await query(city.bbox);
  return toCandidates(places, cityId, config.pipeline, config.chains, config.overrides);
}
