import type { LngLat } from '@cflog/shared';
import * as Location from 'expo-location';

export type LocationResult =
  { ok: true; point: LngLat } | { ok: false; reason: 'denied' | 'error' };

/** Asks for foreground permission only when the user taps near-me; the position never leaves the device. */
export async function requestUserLocation(): Promise<LocationResult> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return { ok: false, reason: 'denied' };
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { ok: true, point: [pos.coords.longitude, pos.coords.latitude] };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** First launch only: the last known position if permission was ALREADY granted. Never prompts (R9). */
export async function lastKnownIfGranted(): Promise<LngLat | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const pos = await Location.getLastKnownPositionAsync();
    return pos ? [pos.coords.longitude, pos.coords.latitude] : null;
  } catch {
    return null;
  }
}
