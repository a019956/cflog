// Near-me decision (03 UX-UI § Key flows 1).
import { nearestCity, NEAR_ME_RADIUS_KM, type LngLat } from '@cflog/shared';

export type NearMeResult =
  | { kind: 'city'; cityId: string; km: number }
  | { kind: 'out-of-range'; nearestCityId: string; km: number };

export function resolveNearMe(point: LngLat): NearMeResult {
  const { city, km } = nearestCity(point);
  return km <= NEAR_ME_RADIUS_KM
    ? { kind: 'city', cityId: city.id, km }
    : { kind: 'out-of-range', nearestCityId: city.id, km };
}

export const OUT_OF_RANGE_MESSAGE =
  'CoffeeLog covers New York City, Philadelphia and Boston for now.';
