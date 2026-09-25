import { cityById } from '@cflog/shared';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH } from '@/theme/tokens';
import { IconButton } from './IconButton';
import { Text } from './Text';

interface Props {
  cityId: string;
  onCityPress: () => void;
  onNearMe: () => void;
  locating: boolean;
}

/** Floating top bar: city picker, near-me, About (03 § Screens: Map). */
export function TopBar({ cityId, onCityPress, onNearMe, locating }: Props) {
  const t = useTheme();
  const city = cityById(cityId);
  return (
    <View style={[styles.bar, { backgroundColor: t.colors.surface, borderColor: t.colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`City: ${city?.name ?? cityId}. Change city`}
        onPress={onCityPress}
        style={styles.city}
      >
        <Text variant="heading" numberOfLines={1} style={styles.cityText}>
          {city?.name ?? cityId}
        </Text>
        <Ionicons name="chevron-down" size={18} color={t.colors.text} />
      </Pressable>
      <IconButton
        icon={locating ? 'locate' : 'locate-outline'}
        label="Near me"
        onPress={onNearMe}
        disabled={locating}
      />
      <Link href="/about" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="About CoffeeLog"
          style={styles.icon}
        >
          <Ionicons name="information-circle-outline" size={22} color={t.colors.text} />
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    paddingLeft: 16,
    paddingRight: 4,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  city: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: TOUCH },
  cityText: { flexShrink: 1 },
  icon: { minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' },
});
