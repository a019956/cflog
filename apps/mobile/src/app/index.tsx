import { applyFilters, MAP_ATTRIBUTION, sortCafes } from '@cflog/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
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
  // Per-field selectors: the screen doesn't re-render on draft edits inside the filter sheet.
  const cityId = useAppStore((s) => s.cityId);
  const filters = useAppStore((s) => s.filters);
  const viewMode = useAppStore((s) => s.viewMode);
  const selectedCafeId = useAppStore((s) => s.selectedCafeId);
  const userLocation = useAppStore((s) => s.userLocation);
  const openSheet = useAppStore((s) => s.openSheet);
  const toast = useAppStore((s) => s.toast);
  const {
    setCity,
    setUserLocation,
    showToast,
    openCityPicker,
    openFilters,
    resetFilters,
    setViewMode,
    selectCafe,
    closeSheet,
  } = useAppStore.getState();

  const cafesState = useCityCafes(cityId);
  const [locating, setLocating] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(insets.top + 120);
  const sample = getDataSource().kind === 'sample';

  const all = useMemo(() => (cafesState.status === 'ready' ? cafesState.data : []), [cafesState]);
  const visible = useMemo(
    () => sortCafes(applyFilters(all, filters), userLocation),
    [all, filters, userLocation],
  );

  // Android back: close the topmost sheet first, then the café sheet, then leave (R10).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (openSheet) {
        closeSheet();
        return true;
      }
      if (selectedCafeId) {
        selectCafe(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [openSheet, selectedCafeId, closeSheet, selectCafe]);

  const onNearMe = useCallback(async () => {
    setLocating(true);
    const r = await requestUserLocation();
    setLocating(false);
    if (!r.ok) {
      showToast(
        r.reason === 'denied'
          ? 'Location is off. Pick a city instead.'
          : "Couldn't get your location.",
      );
      openCityPicker();
      return;
    }
    const near = resolveNearMe(r.point);
    if (near.kind === 'city') {
      setCity(near.cityId); // clears any previous position…
      setUserLocation(r.point); // …then centres on the user
    } else {
      setUserLocation(null);
      showToast(OUT_OF_RANGE_MESSAGE);
      openCityPicker();
    }
  }, [openCityPicker, setCity, setUserLocation, showToast]);

  const hideToast = useCallback(() => showToast(null), [showToast]);
  const closeCafe = useCallback(() => selectCafe(null), [selectCafe]);
  const count = visible.length;

  return (
    <View style={[styles.root, { backgroundColor: t.colors.bg }]}>
      {viewMode === 'map' ? (
        <CafeMap
          cityId={cityId}
          cafes={visible}
          userLocation={userLocation}
          onSelect={selectCafe}
        />
      ) : (
        <CafeList
          cafes={visible}
          userLocation={userLocation}
          onSelect={selectCafe}
          topInset={headerHeight + 8}
        />
      )}

      <SafeAreaView
        edges={['top']}
        pointerEvents="box-none"
        style={styles.overlay}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <TopBar
          cityId={cityId}
          onCityPress={openCityPicker}
          onNearMe={onNearMe}
          locating={locating}
        />
        <FilterChips filters={filters} onOpen={openFilters} onReset={resetFilters} />
        <View style={styles.status} pointerEvents="box-none">
          {sample ? (
            <Banner message="Sample data: these places are fictional until the weekly data run fills the database." />
          ) : null}
          {cafesState.status === 'loading' ? <Banner message="Loading places…" /> : null}
          {cafesState.status === 'error' ? (
            <Banner
              message="Couldn't load places."
              actionLabel="Retry"
              onAction={cafesState.retry}
            />
          ) : null}
          {cafesState.status === 'ready' && count === 0 ? (
            <Banner
              message="No places match these filters."
              actionLabel="Clear filters"
              onAction={resetFilters}
            />
          ) : null}
          {viewMode === 'map' ? (
            // Always-visible map attribution (R7); sits under the header so bottom sheets never cover it.
            <Text
              variant="caption"
              muted
              style={[styles.attribution, { backgroundColor: t.colors.surface }]}
              accessibilityRole="text"
            >
              {MAP_ATTRIBUTION}
            </Text>
          ) : null}
        </View>
      </SafeAreaView>

      <View style={[styles.bottom, { bottom: insets.bottom + 16 }]} pointerEvents="box-none">
        <View
          style={[styles.pill, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}
        >
          <Text variant="label" accessibilityLiveRegion="polite">
            {cafesState.status === 'ready' ? `${count} ${count === 1 ? 'place' : 'places'}` : '…'}
          </Text>
        </View>
        <Button
          label={viewMode === 'map' ? 'List' : 'Map'}
          accessibilityHint={
            viewMode === 'map' ? 'Shows the results as a list' : 'Shows the results on the map'
          }
          onPress={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
        />
      </View>

      <CafeSheet
        cafeId={selectedCafeId}
        filters={filters}
        userLocation={userLocation}
        onClose={closeCafe}
      />
      <FilterSheet cafes={all} />
      <CityPickerSheet />
      <Toast message={toast} onHide={hideToast} top={headerHeight + 8} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  status: { paddingHorizontal: 16, gap: 8 },
  attribution: {
    alignSelf: 'flex-end',
    fontSize: 11,
    paddingHorizontal: 6,
    borderRadius: 6,
    overflow: 'hidden',
  },
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
