import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  type CameraRef,
  type GeoJSONSourceRef,
} from '@maplibre/maplibre-react-native';
import { cityById, MAP_ATTRIBUTION, type CafeSummary, type LngLat } from '@cflog/shared';
import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { toFeatureCollection } from './geojson';

interface Props {
  cityId: string;
  cafes: readonly CafeSummary[];
  userLocation: LngLat | null;
  onSelect: (cafeId: string) => void;
}

/**
 * OpenFreeMap map with clustered café markers (ADR-005, ADR-011).
 * Marker colour/shape encodes data status: filled accent = beans, brown = menu only, hollow = no data (R3).
 * Map layers aren't reachable by screen readers, so the List view is the accessible path (03 § Accessibility).
 */
export function CafeMap({ cityId, cafes, userLocation, onSelect }: Props) {
  const t = useTheme();
  const camera = useRef<CameraRef>(null);
  const source = useRef<GeoJSONSourceRef>(null);
  const reduceMotion = useRef(false);
  const city = cityById(cityId)!;
  const data = useMemo(() => toFeatureCollection(cafes), [cafes]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => (reduceMotion.current = v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (v) => (reduceMotion.current = v),
    );
    return () => sub.remove();
  }, []);

  // Move to the city (or the user) when either changes.
  useEffect(() => {
    const center = userLocation ?? city.center;
    const zoom = userLocation ? 14 : city.zoom;
    if (reduceMotion.current) camera.current?.jumpTo({ center, zoom });
    else camera.current?.flyTo({ center, zoom, duration: 800 });
  }, [cityId, userLocation, city.center, city.zoom]);

  const userData = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: userLocation
        ? [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: userLocation },
              properties: {},
            },
          ]
        : [],
    }),
    [userLocation],
  );

  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={t.mapStyle}
      attribution={false}
      logo={false}
      compass={false}
      accessibilityLabel={`Map of ${city.name} with ${cafes.length} places. ${MAP_ATTRIBUTION}. Use the list view to browse with a screen reader.`}
    >
      <Camera ref={camera} initialViewState={{ center: city.center, zoom: city.zoom }} />
      <GeoJSONSource
        id="cafes"
        ref={source}
        data={data}
        cluster
        clusterRadius={44}
        clusterMaxZoom={14}
        hitbox={{ top: 12, right: 12, bottom: 12, left: 12 }}
        onPress={async (e) => {
          const f = e.nativeEvent.features[0];
          if (!f) return;
          const p = f.properties as { cluster?: boolean; cluster_id?: number; id?: string } | null;
          if (p?.cluster && p.cluster_id !== undefined && f.geometry.type === 'Point') {
            let zoom: number | undefined;
            try {
              zoom = await source.current?.getClusterExpansionZoom(p.cluster_id);
            } catch {
              zoom = undefined;
            }
            const center = f.geometry.coordinates as LngLat;
            if (reduceMotion.current) camera.current?.jumpTo({ center, zoom: zoom ?? 14 });
            else camera.current?.easeTo({ center, zoom: zoom ?? 14, duration: 500 });
          } else if (p?.id) {
            onSelect(p.id);
          }
        }}
      >
        <Layer
          id="clusters"
          type="circle"
          filter={['has', 'point_count']}
          paint={{
            'circle-color': t.colors.accent,
            'circle-opacity': 0.9,
            'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
            'circle-stroke-width': 2,
            'circle-stroke-color': t.colors.surface,
          }}
        />
        <Layer
          id="cluster-count"
          type="symbol"
          filter={['has', 'point_count']}
          layout={{
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['Noto Sans Bold'],
            'text-size': 13,
            'text-allow-overlap': true,
          }}
          paint={{ 'text-color': t.colors.onAccent }}
        />
        <Layer
          id="cafe-points"
          type="circle"
          filter={['!', ['has', 'point_count']]}
          layout={{ 'circle-sort-key': ['-', 2, ['get', 'rank']] }}
          paint={{
            'circle-radius': 9,
            'circle-color': [
              'match',
              ['get', 'status'],
              'beans',
              t.colors.markerBeans,
              'menu-only',
              t.colors.markerMenuOnly,
              t.colors.surface,
            ],
            'circle-stroke-width': ['match', ['get', 'status'], 'none', 3, 2],
            'circle-stroke-color': [
              'match',
              ['get', 'status'],
              'none',
              t.colors.markerNone,
              t.colors.surface,
            ],
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="me" data={userData}>
        <Layer
          id="me-dot"
          type="circle"
          paint={{
            'circle-radius': 7,
            'circle-color': '#2F6FDE',
            'circle-stroke-width': 3,
            'circle-stroke-color': '#FFFFFF',
          }}
        />
      </GeoJSONSource>
    </Map>
  );
}
