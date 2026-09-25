import {
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import type { CafeSummary } from '@cflog/shared';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useAppStore } from '@/state/store';
import { useTheme } from '@/theme/ThemeProvider';
import { DIMS, type FilterDim } from './dims';
import { countMatching, FilterPanel } from './FilterPanel';

const ALL_DIMS: FilterDim[] = DIMS.map((d) => d.key);
const places = (n: number) => `${n} ${n === 1 ? 'place' : 'places'}`;

/**
 * One sheet for both modes (R5): a single-dimension sheet applies live with a Done button;
 * "All filters" edits a draft and applies on "Show N places".
 */
export function FilterSheet({ cafes }: { cafes: readonly CafeSummary[] }) {
  const t = useTheme();
  const ref = useRef<BottomSheetModal>(null);
  const open = useAppStore((s) => s.openSheet === 'filters');
  const dim = useAppStore((s) => s.filterDim);
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const close = useAppStore((s) => s.closeSheet);
  const draft = useAppStore((s) => s.draftFilters);
  const setDraft = useAppStore((s) => s.setDraftFilters);
  const applyDraft = useAppStore((s) => s.applyDraftFilters);
  const all = dim === 'all';

  useEffect(() => {
    if (open) ref.current?.present();
    else ref.current?.dismiss();
  }, [open, dim]);

  const current = all ? draft : filters;
  const onChange = all ? setDraft : setFilters;
  const n = countMatching(cafes, current);
  const title = all ? 'All filters' : (DIMS.find((d) => d.key === dim)?.label ?? 'Filters');

  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props}>
        <View
          style={[styles.footer, { borderColor: t.colors.border, backgroundColor: t.colors.bg }]}
        >
          {all ? (
            <>
              <Button label="Reset" kind="secondary" onPress={() => setDraft({})} />
              <Button label={`Show ${places(n)}`} onPress={applyDraft} style={styles.grow} />
            </>
          ) : (
            <Button label="Done" onPress={close} style={styles.grow} />
          )}
        </View>
      </BottomSheetFooter>
    ),
    [all, n, t, setDraft, applyDraft, close],
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={['60%', '90%']}
      enableDynamicSizing={false}
      onDismiss={() => useAppStore.getState().openSheet === 'filters' && close()}
      backgroundStyle={{ backgroundColor: t.colors.bg }}
      handleIndicatorStyle={{ backgroundColor: t.colors.border }}
      footerComponent={renderFooter}
      accessibilityLabel={`${title} filter sheet`}
    >
      <BottomSheetView style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="label" muted accessibilityLiveRegion="polite">
          {places(n)}
        </Text>
      </BottomSheetView>
      <BottomSheetScrollView contentContainerStyle={styles.body}>
        <FilterPanel
          dims={all ? ALL_DIMS : [dim as FilterDim]}
          cafes={cafes}
          filters={current}
          onChange={onChange}
        />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 8, gap: 2 },
  body: { paddingHorizontal: 20, paddingBottom: 96 },
  footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  grow: { flex: 1 },
});
