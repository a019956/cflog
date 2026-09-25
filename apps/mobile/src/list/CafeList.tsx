import { distanceKm, FLAVOR_LABELS, topFamily, type CafeSummary, type LngLat } from '@cflog/shared';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { distanceLabel, kindLabel } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';

interface Props {
  cafes: readonly CafeSummary[];
  userLocation: LngLat | null;
  onSelect: (id: string) => void;
  topInset: number;
}

/** Top three flavor families (top level) for a row. */
export function topFlavors(c: CafeSummary): string[] {
  return [...new Set(c.flavorFamilies.map(topFamily))].slice(0, 3).map((f) => FLAVOR_LABELS[f]);
}

export function rowSubtitle(c: CafeSummary): string {
  if (c.dataStatus === 'beans') return `${c.beanCount} ${c.beanCount === 1 ? 'bean' : 'beans'}`;
  if (c.dataStatus === 'menu-only') return 'Menu only';
  return 'No bean info yet';
}

/** List view of the same (filtered, sorted) results as the map (R4). */
export function CafeList({ cafes, userLocation, onSelect, topInset }: Props) {
  const t = useTheme();
  return (
    <FlatList
      data={cafes as CafeSummary[]}
      keyExtractor={(c) => c.id}
      contentContainerStyle={{
        paddingTop: topInset,
        paddingBottom: 120,
        paddingHorizontal: 16,
        gap: 8,
      }}
      style={{ backgroundColor: t.colors.bg }}
      renderItem={({ item: c }) => {
        const flavors = topFlavors(c);
        const dist = userLocation ? distanceLabel(distanceKm(userLocation, [c.lng, c.lat])) : null;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${c.name}, ${kindLabel(c.kind)}, ${rowSubtitle(c)}${dist ? `, ${dist} away` : ''}${flavors.length ? `, ${flavors.join(', ')}` : ''}`}
            onPress={() => onSelect(c.id)}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: t.colors.surface,
                borderColor: t.colors.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View style={styles.top}>
              <Text variant="heading" numberOfLines={1} style={styles.name}>
                {c.name}
              </Text>
              {dist ? (
                <Text variant="caption" muted>
                  {dist}
                </Text>
              ) : null}
            </View>
            <Text variant="caption" muted>
              {kindLabel(c.kind)} · {rowSubtitle(c)}
            </Text>
            {flavors.length ? <Text variant="caption">{flavors.join(' · ')}</Text> : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 4 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1 },
});
