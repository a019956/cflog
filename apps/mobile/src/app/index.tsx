import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CafeMap } from '@/map/CafeMap';
import { paletteFor, radius, space } from '@/theme/tokens';

/** Map (home) screen — WP-00 skeleton. Top bar, filters and sheets arrive in WP-07..WP-10. */
export default function MapScreen() {
  const colors = paletteFor(useColorScheme());
  return (
    <View style={styles.root}>
      <CafeMap />
      <SafeAreaView edges={['top']} pointerEvents="box-none">
        <View style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>CoffeeLog</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    marginHorizontal: space.lg,
    marginTop: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontWeight: '600' },
});
