import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { citiesByState } from '@cflog/shared';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useCityCounts } from '@/data/hooks';
import { useAppStore } from '@/state/store';
import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH } from '@/theme/tokens';
import { SheetBackdrop } from './SheetBackdrop';
import { Text } from './Text';

/** City picker grouped by state (03 § Screens). Counts load lazily; the list shows without them on failure. */
export function CityPickerSheet() {
  const t = useTheme();
  const ref = useRef<BottomSheetModal>(null);
  const open = useAppStore((s) => s.openSheet === 'city');
  const cityId = useAppStore((s) => s.cityId);
  const setCity = useAppStore((s) => s.setCity);
  const close = useAppStore((s) => s.closeSheet);
  const counts = useCityCounts(open);

  useEffect(() => {
    if (open) ref.current?.present();
    else ref.current?.dismiss();
  }, [open]);

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={['50%']}
      enableDynamicSizing={false}
      onDismiss={() => useAppStore.getState().openSheet === 'city' && close()}
      backgroundStyle={{ backgroundColor: t.colors.bg }}
      handleIndicatorStyle={{ backgroundColor: t.colors.border }}
      backdropComponent={SheetBackdrop}
    >
      <BottomSheetScrollView contentContainerStyle={styles.body}>
        <Text variant="title" accessibilityRole="header">
          Choose a city
        </Text>
        {citiesByState().map((g) => (
          <View key={g.state} style={styles.group}>
            <Text variant="caption" muted style={styles.state}>
              {g.state}
            </Text>
            {g.cities.map((c) => {
              const n = counts.status === 'ready' ? counts.data[c.id] : undefined;
              const selected = c.id === cityId;
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${c.name}${n !== undefined ? `, ${n} places` : ''}${selected ? ', current city' : ''}`}
                  onPress={() => setCity(c.id)}
                  style={[
                    styles.row,
                    {
                      borderColor: t.colors.border,
                      backgroundColor: selected ? t.colors.surface : 'transparent',
                    },
                  ]}
                >
                  <Text variant="label" style={styles.name}>
                    {c.name}
                  </Text>
                  <Text variant="caption" muted>
                    {counts.status === 'loading' ? '…' : n !== undefined ? `${n} places` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
        <Text variant="caption" muted>
          More cities coming.
        </Text>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16 },
  group: { gap: 6 },
  state: { textTransform: 'uppercase', letterSpacing: 0.6 },
  row: {
    minHeight: TOUCH + 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  name: { flex: 1 },
});
