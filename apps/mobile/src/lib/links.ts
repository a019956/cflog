import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/** Native maps URL for directions (R6). */
export function directionsUrl(os: string, lat: number, lng: number, name: string): string {
  const q = encodeURIComponent(name);
  if (os === 'ios') return `http://maps.apple.com/?daddr=${lat},${lng}&q=${q}`;
  return `geo:${lat},${lng}?q=${lat},${lng}(${q})`;
}

export function webMapsUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/directions?to=${lat}%2C${lng}`;
}

export async function openDirections(lat: number, lng: number, name: string): Promise<void> {
  const url = directionsUrl(Platform.OS, lat, lng, name);
  try {
    await Linking.openURL(url);
  } catch {
    await WebBrowser.openBrowserAsync(webMapsUrl(lat, lng));
  }
}

/** Outbound links open in the in-app browser (R6). */
export function openLink(url: string): void {
  WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => undefined));
}
