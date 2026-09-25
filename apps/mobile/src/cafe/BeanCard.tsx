import { FLAVOR_LABELS, PROCESS_LABELS, ROAST_LABELS, type Bean } from '@cflog/shared';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { openLink } from '@/lib/links';
import { originLabel, priceLabel, roastStep } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';

/** 5-step roast bar with a text label (never colour alone, DESIGN.md). */
function RoastBar({ bean }: { bean: Bean }) {
  const t = useTheme();
  const step = roastStep(bean.roastLevel);
  if (!step || !bean.roastLevel) return null;
  return (
    <View
      style={styles.roast}
      accessible
      accessibilityLabel={`Roast: ${ROAST_LABELS[bean.roastLevel]}`}
    >
      <View style={styles.bar}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View
            key={i}
            style={[styles.seg, { backgroundColor: i <= step ? t.colors.text : t.colors.border }]}
          />
        ))}
      </View>
      <Text variant="caption" muted>
        {ROAST_LABELS[bean.roastLevel]}
      </Text>
    </View>
  );
}

export function BeanCard({ bean, matches }: { bean: Bean; matches: boolean }) {
  const t = useTheme();
  const price = priceLabel(bean);
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: t.colors.surface,
          borderColor: matches ? t.colors.accent : t.colors.border,
          borderWidth: matches ? 2 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={styles.head}>
        <Text variant="heading" style={styles.name}>
          {bean.name}
        </Text>
        {matches ? (
          <Text variant="caption" color={t.colors.accent} accessibilityLabel="Matches your filters">
            ● Match
          </Text>
        ) : null}
      </View>
      <Text variant="caption" muted>
        {originLabel(bean)}
        {bean.process ? ` · ${PROCESS_LABELS[bean.process]}` : ''}
        {bean.isDecaf ? ' · Decaf' : ''}
        {bean.inStock === false ? ' · Sold out' : ''}
      </Text>
      <RoastBar bean={bean} />
      {bean.flavorFamilies.length ? (
        <View style={styles.chips}>
          {bean.flavorFamilies.slice(0, 6).map((f) => (
            <View key={f} style={[styles.chip, { borderColor: t.colors.border }]}>
              <Text variant="caption">{FLAVOR_LABELS[f]}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {bean.tastingNotesRaw.length ? (
        <Text variant="body" style={styles.notes}>
          {bean.tastingNotesRaw.join(', ')}
        </Text>
      ) : null}
      <View style={styles.foot}>
        {price ? <Text variant="label">{price}</Text> : <View />}
        {bean.url ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`View ${bean.name} on the café's site`}
            onPress={() => openLink(bean.url!)}
            style={styles.link}
          >
            <Text variant="label" color={t.colors.accent}>
              View on site ›
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  name: { flex: 1 },
  roast: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bar: { flexDirection: 'row', gap: 3 },
  seg: { width: 18, height: 6, borderRadius: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  notes: { fontStyle: 'italic' },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
});
