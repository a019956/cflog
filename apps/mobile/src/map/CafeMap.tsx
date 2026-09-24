import { Camera, Map } from '@maplibre/maplibre-react-native';
import { CITIES, OPENFREEMAP_STYLE } from '@cflog/shared';
import { StyleSheet, useColorScheme } from 'react-native';

/** WP-00 placeholder map: OpenFreeMap tiles centred on the first launch city. Markers arrive in WP-08. */
export function CafeMap() {
  const scheme = useColorScheme();
  const city = CITIES[0]!;
  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={scheme === 'dark' ? OPENFREEMAP_STYLE.dark : OPENFREEMAP_STYLE.light}
      attribution
      accessibilityLabel={`Map of ${city.name}`}
    >
      <Camera initialViewState={{ center: city.center, zoom: 12 }} />
    </Map>
  );
}
