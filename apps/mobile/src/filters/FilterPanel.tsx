import { applyFilters, type CafeSummary, type Filters } from '@cflog/shared';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH } from '@/theme/tokens';
import { DIMS, optionsFor, selectedIn, toggleValue, type FilterDim } from './dims';

interface Props {
  dims: FilterDim[];
  cafes: readonly CafeSummary[];
  filters: Filters;
  onChange: (f: Filters) => void;
}

/** Option chips for one or more dimensions. Pure presentation; the parent decides live vs. apply-on-confirm (R5). */
export function FilterPanel({ dims, cafes, filters, onChange }: Props) {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      {dims.map((dim) => {
        const selected = selectedIn(filters, dim);
        return (
          <View key={dim} style={styles.section}>
            {dims.length > 1 ? (
              <Text variant="heading">{DIMS.find((d) => d.key === dim)?.label}</Text>
            ) : null}
            {optionsFor(dim, cafes, filters).map((g, gi) => (
              <View key={`${dim}-${gi}`} style={styles.group}>
                {g.title ? (
                  <Text variant="caption" muted style={styles.groupTitle}>
                    {g.title}
                  </Text>
                ) : null}
                {g.options.length === 0 ? (
                  <Text variant="caption" muted>
                    Nothing to filter here yet.
                  </Text>
                ) : null}
                <View style={styles.options}>
                  {g.options.map((o) => {
                    const on = selected.includes(o.value);
                    return (
                      <Pressable
                        key={o.value}
                        accessibilityRole="checkbox"
                        accessibilityLabel={o.label}
                        accessibilityState={{ checked: on }}
                        onPress={() => onChange(toggleValue(filters, dim, o.value))}
                        style={[
                          styles.opt,
                          o.child && styles.child,
                          {
                            backgroundColor: on ? t.colors.accent : t.colors.surface,
                            borderColor: on ? t.colors.accent : t.colors.border,
                          },
                        ]}
                      >
                        <Text variant="label" color={on ? t.colors.onAccent : t.colors.text}>
                          {o.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

export const countMatching = (cafes: readonly CafeSummary[], f: Filters) =>
  applyFilters(cafes, f).length;

const styles = StyleSheet.create({
  wrap: { gap: 20 },
  section: { gap: 10 },
  group: { gap: 6 },
  groupTitle: { textTransform: 'uppercase', letterSpacing: 0.6 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: {
    minHeight: TOUCH,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
  },
  child: { marginLeft: 0, opacity: 0.95 },
});
