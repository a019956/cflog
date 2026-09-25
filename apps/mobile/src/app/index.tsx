import { applyFilters, sortCafes } from '@cflog/shared';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CafeSheet } from '@/cafe/CafeSheet';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { CityPickerSheet } from '@/components/CityPickerSheet';
import { Text } from '@/components/Text';
import { Toast } from '@/components/Toast';
import { TopBar } from '@/components/TopBar';
import { useCityCafes } from '@/data/hooks';
import { getDataSource } from '@/data/source';
import { FilterChips } from '@/filters/FilterChips';
import { FilterSheet } from '@/filters/FilterSheet';
import { requestUserLocation } from '@/lib/location';
import { OUT_OF_RANGE_MESSAGE, resolveNearMe } from '@/lib/nearMe';
import { CafeList } from '@/list/CafeList';
import { CafeMap } from '@/map/CafeMap';
import { useAppStore } from '@/state/store';
import { useTheme } from '@/theme/ThemeProvider';

/** Map (home) screen: map or list + top bar + filter chips + sheets (03 § Screens). */
export default function MapScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const s = useAppStore();
  const cafesState = useCityCafes(s.cityId);
  const [locating, setLocating] = useState(false);
  const sample = getDataSource().kind === 'sample';

  const all = useMemo(() => (cafesState.status === 'ready' ? cafesState.data : []), [cafesState]);
  const visible = useMemo(
    () => sortCafes(applyFilters(all, s.filters), s.userLocation),
    [all, s.filters, s.userLocation],
  );

  const onNearMe = useCallback(async () => {
    setLocating(true);
    const r = await requestUserLocation();
    setLocating(false);
    if (!r.ok) {
      s.showToast(
        r.reason === 'denied'
          ? 'Location is off. Pick a city instead.'
          : "Couldn't get your location.",
      );
      s.openCityPicker();
      return;
    }
    const near = resolveNearMe(r.point);
    if (near.kind === 'city') {
      s.setCity(near.cityId);
      s.setUserLocation(r.point);
    } else {
      s.setUserLocation(null);
      s.showToast(OUT_OF_RANGE_MESSAGE);
      s.openCityPicker();
    }
  }, [s]);

  const count = visible.length;
  const header = (
    <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.overlay}>
      <TopBar
        cityId={s.cityId}
        onCityPress={s.openCityPicker}
        onNearMe={onNearMe}
        locating={locating}
      />
      <FilterChips filters={s.filters} onOpen={s.openFilters} onReset={s.resetFilters} />
      <View style={styles.status} pointerEvents="box-none">
        {sample ? (
          <Banner message="Sample data: these places are fictional until the weekly data run fills the database." />
        ) : null}
        {cafesState.status === 'loading' ? <Banner message="Loading places…" /> : null}
        {cafesState.status === 'error' ? (
          <Banner message="Couldn't load places." actionLabel="Retry" onAction={cafesState.retry} />
        ) : null}
        {cafesState.status === 'ready' && count === 0 ? (
          <Banner
            message="No places match these filters."
            actionLabel="Clear filters"
            onAction={s.resetFilters}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );

  return (
    <View style={[styles.root, { backgroundColor: t.colors.bg }]}>
      {s.viewMode === 'map' ? (
        <CafeMap
          cityId={s.cityId}
          cafes={visible}
          userLocation={s.userLocation}
          onSelect={s.selectCafe}
        />
      ) : (
        <CafeList
          cafes={visible}
          userLocation={s.userLocation}
          onSelect={s.selectCafe}
          topInset={insets.top + 150}
        />
      )}
      {header}
      <View style={[styles.bottom, { bottom: insets.bottom + 16 }]} pointerEvents="box-none">
        <View
          style={[styles.pill, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}
        >
          <Text variant="label" accessibilityLiveRegion="polite">
            {cafesState.status === 'ready' ? `${count} ${count === 1 ? 'place' : 'places'}` : '…'}
          </Text>
        </View>
        <Button
          label={s.viewMode === 'map' ? 'List' : 'Map'}
          accessibilityHint={
            s.viewMode === 'map' ? 'Shows the results as a list' : 'Shows the results on the map'
          }
          onPress={() => s.setViewMode(s.viewMode === 'map' ? 'list' : 'map')}
        />
      </View>
      <CafeSheet
        cafeId={s.selectedCafeId}
        filters={s.filters}
        userLocation={s.userLocation}
        onClose={() => s.selectCafe(null)}
      />
      <FilterSheet cafes={all} />
      <CityPickerSheet />
      <Toast message={s.toast} onHide={() => s.showToast(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  status: { paddingHorizontal: 16, gap: 8 },
  bottom: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
