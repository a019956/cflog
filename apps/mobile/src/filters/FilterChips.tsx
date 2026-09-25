import { countActiveFilters, type Filters } from '@cflog/shared';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH } from '@/theme/tokens';
import { DIMS, dimCount, type FilterDim } from './dims';

interface Props {
  filters: Filters;
  onOpen: (dim: FilterDim | 'all') => void;
  onReset: () => void;
}

export function Chip({
  label,
  count,
  onPress,
  hint,
}: {
  label: string;
  count: number;
  onPress: () => void;
  hint?: string;
}) {
  const t = useTheme();
  const active = count > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? `${label}, ${count} selected` : label}
      accessibilityHint={hint}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? t.colors.accent : t.colors.surface,
          borderColor: active ? t.colors.accent : t.colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text variant="label" color={active ? t.colors.onAccent : t.colors.text}>
        {label}
      </Text>
      {active ? (
        <View style={[styles.badge, { backgroundColor: t.colors.onAccent }]}>
          <Text variant="caption" color={t.colors.accent} style={styles.badgeText}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Horizontal chip row: one chip per dimension, "All filters", and Reset when anything is active (R4). */
export function FilterChips({ filters, onOpen, onReset }: Props) {
  const total = countActiveFilters(filters);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="toolbar"
    >
      <Chip
        label="All filters"
        count={total}
        onPress={() => onOpen('all')}
        hint="Opens every filter"
      />
      {DIMS.map((d) => (
        <Chip
          key={d.key}
          label={d.label}
          count={dimCount(filters, d.key)}
          onPress={() => onOpen(d.key)}
        />
      ))}
      {total > 0 ? (
        <Chip label="Reset" count={0} onPress={onReset} hint="Clears all filters" />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  chip: {
    minHeight: TOUCH,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { fontFamily: 'Inter_600SemiBold', lineHeight: 16 },
});
